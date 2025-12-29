/**
 * MARIPOSA WEEX V6 - Position Monitor
 *
 * Monitors open WEEX positions and manages exits:
 * - Breakeven protection at configurable % of TP
 * - Trailing stops after configurable % of TP
 * - Time-based exits
 * - Stop loss / take profit monitoring
 */

import { EventEmitter } from 'events';
import { weexService, WeexPositionResponse } from '../weexService';
import { binanceService } from '../binanceService';
import { TradeSetup } from '../../types/v6/setup.types';
import {
  WeexMonitoredPosition,
  WeexCloseResult,
  WeexCloseReason,
  WeexMonitorHealth,
  WeexV6Config,
  WeexExecutionResult,
  WeexPositionStatus,
  createWeexPositionId,
} from '../../types/weex';
import { WEEX_V6_CONFIG } from '../../config/environment';
import { weexAiLogService } from './weexAiLogService';
import { WeexPosition, IWeexPosition, WeexCloseReason as DbCloseReason } from '../../models/WeexPosition';

// ============================================================================
// WEEX POSITION MONITOR CLASS
// ============================================================================

class WeexPositionMonitor extends EventEmitter {
  private config: WeexV6Config;
  private positions: Map<string, WeexMonitoredPosition> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Statistics
  private stats = {
    totalClosed: 0,
    totalPnlUSD: 0,
    lastCheckTime: null as Date | null,
    errors: [] as string[],
  };

  constructor() {
    super();
    this.config = WEEX_V6_CONFIG;
  }

  /**
   * Start the position monitor
   */
  start(): void {
    if (this.isRunning) {
      console.log('[WEEX-MONITOR] Already running');
      return;
    }

    console.log('[WEEX-MONITOR] Starting position monitor...');
    console.log(`[WEEX-MONITOR] Check interval: ${this.config.POSITION_MONITOR_INTERVAL_MS}ms`);
    console.log(`[WEEX-MONITOR] Breakeven trigger: ${this.config.BREAKEVEN_TRIGGER_PCT * 100}% of TP`);
    console.log(`[WEEX-MONITOR] Trailing trigger: ${this.config.TRAILING_TRIGGER_PCT * 100}% of TP`);

    this.isRunning = true;

    // Start monitoring loop
    this.monitorInterval = setInterval(
      () => this.monitorPositions(),
      this.config.POSITION_MONITOR_INTERVAL_MS
    );

    // Run immediately
    this.monitorPositions();

    console.log('[WEEX-MONITOR] Position monitor started');
  }

  /**
   * Stop the position monitor
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isRunning = false;
    console.log('[WEEX-MONITOR] Position monitor stopped');
  }

  /**
   * Add a new position to monitor
   * Called by weexV6Executor after successful order
   */
  addPosition(setup: TradeSetup, executionResult: WeexExecutionResult): void {
    const positionId = createWeexPositionId(setup.id);

    const position: WeexMonitoredPosition = {
      id: positionId,
      setupId: setup.id,
      orderId: executionResult.orderId || '',
      tpOrderId: executionResult.tpOrderId,  // TP order ID for modification
      slOrderId: executionResult.slOrderId,  // SL order ID for modification
      symbol: this.config.SYMBOL,
      direction: setup.direction,
      grade: setup.grade,
      entryPrice: executionResult.executionPrice || 0,
      currentPrice: executionResult.executionPrice || 0,
      stopLoss: setup.stopLoss,
      takeProfit: setup.takeProfit1,
      positionSizeBTC: executionResult.positionSizeBTC || 0,
      positionSizeUSD: executionResult.positionSizeUSD || 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      highestPnl: 0,
      lowestPnl: 0,
      openTime: new Date(),
      lastUpdateTime: new Date(),
      breakevenActivated: false,
      trailingActivated: false,
      currentStopLoss: setup.stopLoss,
      status: 'OPEN',
    };

    this.positions.set(positionId, position);

    console.log(`[WEEX-MONITOR] Added position ${positionId}`);
    console.log(`[WEEX-MONITOR]   Direction: ${position.direction}`);
    console.log(`[WEEX-MONITOR]   Entry: $${position.entryPrice.toFixed(2)}`);
    console.log(`[WEEX-MONITOR]   SL: $${position.stopLoss.toFixed(2)} | TP: $${position.takeProfit.toFixed(2)}`);
    if (position.tpOrderId || position.slOrderId) {
      console.log(`[WEEX-MONITOR]   TP Order ID: ${position.tpOrderId || 'N/A'} | SL Order ID: ${position.slOrderId || 'N/A'}`);
    }

    // Persist to database for restart recovery
    this.savePositionToDb(position).catch(err => {
      console.error(`[WEEX-MONITOR] Failed to save position to DB:`, err.message);
    });
  }

  /**
   * Save position to database for persistence
   */
  private async savePositionToDb(position: WeexMonitoredPosition): Promise<void> {
    try {
      await WeexPosition.create({
        orderId: position.orderId,
        setupId: position.setupId,
        positionId: position.id,
        tpOrderId: position.tpOrderId,     // TP order ID for modification
        slOrderId: position.slOrderId,     // SL order ID for modification
        symbol: position.symbol,
        direction: position.direction,
        grade: position.grade,
        entryPrice: position.entryPrice,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        currentStopLoss: position.currentStopLoss,
        positionSizeBTC: position.positionSizeBTC,
        positionSizeUSD: position.positionSizeUSD,
        leverage: this.config.LEVERAGE,
        status: 'OPEN',
        breakevenActivated: position.breakevenActivated,
        trailingActivated: position.trailingActivated,
        openedAt: position.openTime,
        lastUpdateAt: new Date(),
      });
      console.log(`[WEEX-MONITOR] Position ${position.id} saved to database (orderId: ${position.orderId})`);
    } catch (error: any) {
      // Handle duplicate key error gracefully (position already exists)
      if (error.code === 11000) {
        console.log(`[WEEX-MONITOR] Position ${position.orderId} already exists in database`);
        return;
      }
      console.error(`[WEEX-MONITOR] DB save error:`, error.message);
      throw error;
    }
  }

  /**
   * Update position in database when closed
   */
  private async updatePositionInDb(
    position: WeexMonitoredPosition,
    closePrice: number,
    closeReason: WeexCloseReason,
    realizedPnl: number
  ): Promise<void> {
    try {
      await WeexPosition.findOneAndUpdate(
        { orderId: position.orderId },
        {
          status: 'CLOSED',
          closePrice,
          closeReason: closeReason as DbCloseReason,
          realizedPnl,
          closedAt: new Date(),
          lastUpdateAt: new Date(),
          breakevenActivated: position.breakevenActivated,
          trailingActivated: position.trailingActivated,
          currentStopLoss: position.currentStopLoss,
        }
      );
      console.log(`[WEEX-MONITOR] Position ${position.orderId} updated in database (status: CLOSED)`);
    } catch (error: any) {
      console.error(`[WEEX-MONITOR] DB update error:`, error.message);
      throw error;
    }
  }

  /**
   * Main monitoring loop
   */
  private async monitorPositions(): Promise<void> {
    if (this.positions.size === 0) {
      return;
    }

    this.stats.lastCheckTime = new Date();

    try {
      // Get current price from Binance (faster than WEEX)
      const currentPrice = await this.getCurrentPrice();

      // Get actual positions from WEEX to verify
      const weexPositions = await weexService.getAllPositions();

      // Update each monitored position
      for (const [id, position] of this.positions) {
        if (position.status !== 'OPEN') continue;

        try {
          await this.updatePosition(position, currentPrice, weexPositions);
        } catch (error: any) {
          console.error(`[WEEX-MONITOR] Error updating position ${id}: ${error.message}`);
          this.addError(`Position ${id}: ${error.message}`);
        }
      }

    } catch (error: any) {
      console.error(`[WEEX-MONITOR] Monitor cycle error: ${error.message}`);
      this.addError(error.message);
    }
  }

  /**
   * Update a single position
   */
  private async updatePosition(
    position: WeexMonitoredPosition,
    currentPrice: number,
    weexPositions: WeexPositionResponse[]
  ): Promise<void> {
    // Update current price
    position.currentPrice = currentPrice;
    position.lastUpdateTime = new Date();

    // Calculate P&L
    const pnlDirection = position.direction === 'BUY' ? 1 : -1;
    const priceDiff = (currentPrice - position.entryPrice) * pnlDirection;
    const pnlPercent = (priceDiff / position.entryPrice) * 100;
    const pnlUSD = position.positionSizeBTC * priceDiff;

    position.unrealizedPnl = pnlUSD;
    position.unrealizedPnlPercent = pnlPercent;

    // Track peaks
    if (pnlUSD > position.highestPnl) position.highestPnl = pnlUSD;
    if (pnlUSD < position.lowestPnl) position.lowestPnl = pnlUSD;

    // Calculate distances
    const totalRisk = Math.abs(position.entryPrice - position.stopLoss);
    const totalReward = Math.abs(position.takeProfit - position.entryPrice);
    const currentProgress = position.direction === 'BUY'
      ? (currentPrice - position.entryPrice) / totalReward
      : (position.entryPrice - currentPrice) / totalReward;

    // Check exit conditions in order of priority

    // 1. Check if position still exists on WEEX (ghost detection - WEEX preset TP/SL triggered)
    const weexPosition = weexPositions.find(p => p.symbol === position.symbol);
    // Handle both API field naming conventions (size vs hold_available)
    const posQty = weexPosition
      ? parseFloat(weexPosition.size || weexPosition.hold_available || '0')
      : 0;
    if (!weexPosition || posQty <= 0) {
      // Determine if closed by TP or SL based on price
      const wasTP = position.direction === 'BUY'
        ? currentPrice >= position.takeProfit
        : currentPrice <= position.takeProfit;
      const reason = wasTP ? 'TAKE_PROFIT' :
                     (position.breakevenActivated ? 'BREAKEVEN_STOP' :
                      position.trailingActivated ? 'TRAILING_STOP' : 'STOP_LOSS');

      console.log(`[WEEX-MONITOR] Position ${position.id} closed by WEEX (${reason}) at $${currentPrice.toFixed(2)}`);
      await this.markClosed(position, currentPrice, reason, position.unrealizedPnl);
      return;
    }

    // 2. Pre-emptive SL cancel: If price is very close to SL, cancel SL order and close manually
    // This prevents the exchange SL from triggering - we close manually at market for better control
    const distanceToSL = position.direction === 'BUY'
      ? (currentPrice - position.currentStopLoss) / currentPrice
      : (position.currentStopLoss - currentPrice) / currentPrice;

    // If within 0.15% of SL and moving towards it, close with IOC market order
    if (distanceToSL > 0 && distanceToSL < 0.0015) {
      console.log(`[WEEX-MONITOR] PREEMPTIVE CLOSE: Price $${currentPrice.toFixed(2)} very close to SL $${position.currentStopLoss.toFixed(2)} (${(distanceToSL * 100).toFixed(3)}%)`);

      // Close position at market using IOC order (takes precedence over pending TP/SL)
      const reason = position.breakevenActivated ? 'BREAKEVEN_STOP' :
                     position.trailingActivated ? 'TRAILING_STOP' : 'STOP_LOSS';
      await this.closePosition(position, reason);
      return;
    }

    // 3. Dynamic TP adjustment: If TP seems unreachable, reduce TP target
    const positionAgeMinutes = (Date.now() - position.openTime.getTime()) / (1000 * 60);
    if (positionAgeMinutes > 30 && currentProgress > 0 && currentProgress < 0.3 && !position.tpAdjusted) {
      // Position open > 30 min but only < 30% progress - reduce TP to 50% of original
      const originalTPDistance = Math.abs(position.takeProfit - position.entryPrice);
      const reducedTP = position.direction === 'BUY'
        ? position.entryPrice + (originalTPDistance * 0.5)
        : position.entryPrice - (originalTPDistance * 0.5);

      console.log(`[WEEX-MONITOR] TP ADJUSTMENT: Position ${position.id} open ${positionAgeMinutes.toFixed(0)}min with only ${(currentProgress * 100).toFixed(0)}% progress`);
      console.log(`[WEEX-MONITOR]   Original TP: $${position.takeProfit.toFixed(2)}`);
      console.log(`[WEEX-MONITOR]   Reduced TP: $${reducedTP.toFixed(2)}`);

      // Modify TP on WEEX exchange
      if (position.tpOrderId) {
        try {
          const result = await weexService.modifyTpSlOrder({
            orderId: position.tpOrderId,
            triggerPrice: reducedTP.toFixed(2),
          });
          if (result.success) {
            position.takeProfit = reducedTP;
            position.currentTakeProfit = reducedTP;
            position.lastTpUpdate = new Date();
            (position as any).tpAdjusted = true; // Mark as adjusted to prevent repeated adjustments
            console.log(`[WEEX-MONITOR] TP modified on exchange: $${reducedTP.toFixed(2)}`);
          } else {
            console.warn(`[WEEX-MONITOR] Failed to modify TP on exchange: ${result.error}`);
          }
        } catch (error: any) {
          console.error(`[WEEX-MONITOR] Error modifying TP: ${error.message}`);
        }
      } else {
        // No TP order ID, just update local tracking
        position.takeProfit = reducedTP;
        position.currentTakeProfit = reducedTP;
        (position as any).tpAdjusted = true;
        console.log(`[WEEX-MONITOR] TP updated locally (no order ID): $${reducedTP.toFixed(2)}`);
      }
    }

    // 4. TP/SL handled by WEEX preset orders - ghost detection (step 1) catches when closed
    // DO NOT send separate close orders here - let WEEX handle TP/SL automatically

    // 5. Time-based exit (only manual close needed - WEEX doesn't have time triggers)
    if (positionAgeMinutes >= this.config.MAX_POSITION_DURATION_MINUTES) {
      console.log(`[WEEX-MONITOR] Time exit for ${position.id} (${positionAgeMinutes.toFixed(0)} min)`);
      await this.closePosition(position, 'TIME_EXIT');
      return;
    }

    // 7. Breakeven protection (if not already activated)
    if (!position.breakevenActivated && currentProgress >= this.config.BREAKEVEN_TRIGGER_PCT) {
      position.breakevenActivated = true;
      const newSL = position.entryPrice + (position.direction === 'BUY' ? 1 : -1); // Tiny buffer
      position.currentStopLoss = newSL;

      console.log(`[WEEX-MONITOR] BREAKEVEN activated for ${position.id}`);
      console.log(`[WEEX-MONITOR]   Progress: ${(currentProgress * 100).toFixed(1)}% of TP`);
      console.log(`[WEEX-MONITOR]   New SL: $${position.currentStopLoss.toFixed(2)}`);

      // Modify SL on WEEX exchange
      if (position.slOrderId) {
        try {
          const result = await weexService.modifyTpSlOrder({
            orderId: position.slOrderId,
            triggerPrice: newSL.toFixed(2),
          });
          if (result.success) {
            position.lastSlUpdate = new Date();
            console.log(`[WEEX-MONITOR] SL modified on exchange: $${newSL.toFixed(2)}`);
          } else {
            console.warn(`[WEEX-MONITOR] Failed to modify SL on exchange: ${result.error}`);
          }
        } catch (error: any) {
          console.error(`[WEEX-MONITOR] Error modifying SL: ${error.message}`);
        }
      } else {
        console.warn(`[WEEX-MONITOR] No SL order ID - cannot modify on exchange`);
      }

      this.emit('breakevenActivated', {
        type: 'BREAKEVEN_HIT',
        positionId: position.id,
        setupId: position.setupId,
        symbol: position.symbol,
        direction: position.direction,
        price: currentPrice,
        timestamp: new Date(),
      });
    }

    // 8. Trailing stop (if not already activated)
    if (!position.trailingActivated && currentProgress >= this.config.TRAILING_TRIGGER_PCT) {
      position.trailingActivated = true;

      // Trail at configured distance from current price
      const trailDistance = totalReward * this.config.TRAILING_DISTANCE_PCT;
      const newSL = position.direction === 'BUY'
        ? currentPrice - trailDistance
        : currentPrice + trailDistance;
      position.currentStopLoss = newSL;

      console.log(`[WEEX-MONITOR] TRAILING activated for ${position.id}`);
      console.log(`[WEEX-MONITOR]   Progress: ${(currentProgress * 100).toFixed(1)}% of TP`);
      console.log(`[WEEX-MONITOR]   Trail distance: $${trailDistance.toFixed(2)}`);
      console.log(`[WEEX-MONITOR]   New SL: $${position.currentStopLoss.toFixed(2)}`);

      // Modify SL on WEEX exchange
      if (position.slOrderId) {
        try {
          const result = await weexService.modifyTpSlOrder({
            orderId: position.slOrderId,
            triggerPrice: newSL.toFixed(2),
          });
          if (result.success) {
            position.lastSlUpdate = new Date();
            console.log(`[WEEX-MONITOR] Trailing SL set on exchange: $${newSL.toFixed(2)}`);
          } else {
            console.warn(`[WEEX-MONITOR] Failed to set trailing SL on exchange: ${result.error}`);
          }
        } catch (error: any) {
          console.error(`[WEEX-MONITOR] Error setting trailing SL: ${error.message}`);
        }
      }

      this.emit('trailingActivated', {
        type: 'TRAILING_ACTIVATED',
        positionId: position.id,
        setupId: position.setupId,
        symbol: position.symbol,
        direction: position.direction,
        price: currentPrice,
        timestamp: new Date(),
      });
    }

    // 9. Update trailing stop if already activated (follow price up/down)
    if (position.trailingActivated) {
      const trailDistance = totalReward * this.config.TRAILING_DISTANCE_PCT;
      const newTrailStop = position.direction === 'BUY'
        ? currentPrice - trailDistance
        : currentPrice + trailDistance;

      // Only move stop in profitable direction
      const shouldMove = position.direction === 'BUY'
        ? newTrailStop > position.currentStopLoss
        : newTrailStop < position.currentStopLoss;

      if (shouldMove) {
        position.currentStopLoss = newTrailStop;
        console.log(`[WEEX-MONITOR] Trailing SL moved to $${position.currentStopLoss.toFixed(2)}`);

        // Modify SL on WEEX exchange (throttled - max once per 30 seconds)
        const timeSinceUpdate = position.lastSlUpdate
          ? Date.now() - position.lastSlUpdate.getTime()
          : Infinity;

        if (position.slOrderId && timeSinceUpdate > 30000) {
          try {
            const result = await weexService.modifyTpSlOrder({
              orderId: position.slOrderId,
              triggerPrice: newTrailStop.toFixed(2),
            });
            if (result.success) {
              position.lastSlUpdate = new Date();
              console.log(`[WEEX-MONITOR] Trailing SL updated on exchange: $${newTrailStop.toFixed(2)}`);
            }
          } catch (error: any) {
            console.error(`[WEEX-MONITOR] Error updating trailing SL: ${error.message}`);
          }
        }
      }
    }

    // Log periodic status (every 5 checks or on significant change)
    if (Math.random() < 0.2) { // ~20% of checks
      this.logPositionStatus(position, currentProgress);
    }
  }

  /**
   * Close a position
   */
  private async closePosition(
    position: WeexMonitoredPosition,
    reason: WeexCloseReason
  ): Promise<WeexCloseResult> {
    position.status = 'CLOSING';

    try {
      console.log(`[WEEX-MONITOR] Closing position ${position.id} (${reason})`);

      const closeResult = await weexService.closeAllPositions(position.symbol);

      if (closeResult.success) {
        const realizedPnl = closeResult.realizedPnl || position.unrealizedPnl;
        await this.markClosed(position, position.currentPrice, reason, realizedPnl);

        return {
          success: true,
          positionId: position.id,
          closePrice: closeResult.fillPrice || position.currentPrice,
          realizedPnl,
          realizedPnlPercent: position.unrealizedPnlPercent,
          closeReason: reason,
          timestamp: new Date(),
        };
      } else {
        throw new Error(closeResult.error || 'Close failed');
      }

    } catch (error: any) {
      console.error(`[WEEX-MONITOR] Close error: ${error.message}`);
      position.status = 'ERROR';

      return {
        success: false,
        positionId: position.id,
        closeReason: 'ERROR',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Mark position as closed and update stats
   */
  private async markClosed(
    position: WeexMonitoredPosition,
    closePrice: number,
    reason: WeexCloseReason,
    realizedPnl: number
  ): Promise<void> {
    position.status = 'CLOSED';
    position.currentPrice = closePrice;

    this.stats.totalClosed++;
    this.stats.totalPnlUSD += realizedPnl;

    const durationMinutes = (Date.now() - position.openTime.getTime()) / (1000 * 60);

    console.log('');
    console.log('==================================================');
    console.log(`[WEEX-MONITOR] POSITION CLOSED: ${position.id}`);
    console.log(`[WEEX-MONITOR]   Reason: ${reason}`);
    console.log(`[WEEX-MONITOR]   Entry: $${position.entryPrice.toFixed(2)}`);
    console.log(`[WEEX-MONITOR]   Exit: $${closePrice.toFixed(2)}`);
    console.log(`[WEEX-MONITOR]   P&L: $${realizedPnl.toFixed(2)} (${position.unrealizedPnlPercent.toFixed(2)}%)`);
    console.log(`[WEEX-MONITOR]   Duration: ${this.getPositionDuration(position)}`);
    console.log('==================================================');
    console.log('');

    // Log order close to WEEX AI Log API (fire-and-forget)
    weexAiLogService.logOrderClose({
      orderId: position.orderId || '0',
      closeReason: reason,
      entryPrice: position.entryPrice,
      exitPrice: closePrice,
      pnlUSD: realizedPnl,
      pnlPercent: position.unrealizedPnlPercent,
      durationMinutes,
      direction: position.direction,
    });

    // Update database
    this.updatePositionInDb(position, closePrice, reason, realizedPnl).catch(err => {
      console.error(`[WEEX-MONITOR] Failed to update position in DB:`, err.message);
    });

    // Emit event
    this.emit('positionClosed', {
      type: 'POSITION_CLOSED',
      positionId: position.id,
      setupId: position.setupId,
      symbol: position.symbol,
      direction: position.direction,
      price: closePrice,
      pnl: realizedPnl,
      reason,
      timestamp: new Date(),
    });

    // Remove from map after a short delay (for logging)
    setTimeout(() => {
      this.positions.delete(position.id);
    }, 5000);
  }

  /**
   * Get current price from Binance
   */
  private async getCurrentPrice(): Promise<number> {
    try {
      const ticker = await binanceService.getTickerPrice(this.config.BINANCE_SYMBOL);
      return ticker;
    } catch {
      // Fallback to WEEX
      return weexService.getTickerPrice(this.config.SYMBOL);
    }
  }

  /**
   * Log position status
   */
  private logPositionStatus(position: WeexMonitoredPosition, progress: number): void {
    const duration = this.getPositionDuration(position);
    const pnlSign = position.unrealizedPnl >= 0 ? '+' : '';

    console.log(`[WEEX-MONITOR] ${position.id.slice(0, 12)}... | ` +
      `${position.direction} @ $${position.entryPrice.toFixed(0)} | ` +
      `Now: $${position.currentPrice.toFixed(0)} | ` +
      `P&L: ${pnlSign}$${position.unrealizedPnl.toFixed(2)} | ` +
      `Progress: ${(progress * 100).toFixed(0)}% | ` +
      `${duration}`);
  }

  /**
   * Get human-readable position duration
   */
  private getPositionDuration(position: WeexMonitoredPosition): string {
    const ms = Date.now() - position.openTime.getTime();
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Add error to stats
   */
  private addError(error: string): void {
    this.stats.errors.push(`${new Date().toISOString()}: ${error}`);
    if (this.stats.errors.length > 10) {
      this.stats.errors.shift();
    }
  }

  /**
   * Get current health status
   */
  getHealth(): WeexMonitorHealth {
    return {
      isRunning: this.isRunning,
      openPositions: Array.from(this.positions.values()).filter(p => p.status === 'OPEN').length,
      totalPositionsClosed: this.stats.totalClosed,
      totalPnlUSD: this.stats.totalPnlUSD,
      lastCheckTime: this.stats.lastCheckTime || undefined,
      checkIntervalMs: this.config.POSITION_MONITOR_INTERVAL_MS,
      errors: [...this.stats.errors],
    };
  }

  /**
   * Get all open positions
   */
  getOpenPositions(): WeexMonitoredPosition[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
  }

  /**
   * Get position by ID
   */
  getPosition(id: string): WeexMonitoredPosition | undefined {
    return this.positions.get(id);
  }

  /**
   * Load open positions from database on startup
   * Restores monitoring state after restart
   */
  async loadOpenPositionsFromDb(): Promise<void> {
    try {
      const openPositions = await WeexPosition.find({ status: 'OPEN' });

      if (openPositions.length === 0) {
        console.log('[WEEX-MONITOR] No open positions found in database');
        return;
      }

      console.log(`[WEEX-MONITOR] Loading ${openPositions.length} open positions from database...`);

      // Get current WEEX positions to verify
      const weexPositions = await weexService.getAllPositions();
      // Handle both API field naming conventions (size vs hold_available)
      const hasOpenWeexPosition = weexPositions.some(p =>
        parseFloat(p.size || p.hold_available || '0') > 0
      );

      for (const dbPos of openPositions) {
        // If no positions exist on WEEX, mark as externally closed
        if (!hasOpenWeexPosition) {
          await WeexPosition.findByIdAndUpdate(dbPos._id, {
            status: 'CLOSED',
            closeReason: 'EXTERNAL_CLOSE',
            closedAt: new Date(),
            lastUpdateAt: new Date(),
          });
          console.log(`[WEEX-MONITOR] Position ${dbPos.orderId} was closed externally (marked in DB)`);
          continue;
        }

        // Restore to in-memory map
        const position: WeexMonitoredPosition = {
          id: dbPos.positionId,
          orderId: dbPos.orderId,
          setupId: dbPos.setupId,
          tpOrderId: dbPos.tpOrderId,           // Restore TP order ID for modification
          slOrderId: dbPos.slOrderId,           // Restore SL order ID for modification
          symbol: dbPos.symbol,
          direction: dbPos.direction as 'BUY' | 'SELL',
          grade: dbPos.grade as 'A' | 'B' | 'C',
          entryPrice: dbPos.entryPrice,
          currentPrice: dbPos.entryPrice,
          stopLoss: dbPos.stopLoss,
          takeProfit: dbPos.takeProfit,
          currentStopLoss: dbPos.currentStopLoss,
          positionSizeBTC: dbPos.positionSizeBTC,
          positionSizeUSD: dbPos.positionSizeUSD,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
          highestPnl: 0,
          lowestPnl: 0,
          openTime: dbPos.openedAt,
          lastUpdateTime: new Date(),
          breakevenActivated: dbPos.breakevenActivated,
          trailingActivated: dbPos.trailingActivated,
          status: 'OPEN',
        };

        this.positions.set(position.id, position);
        console.log(`[WEEX-MONITOR] Restored position from DB:`);
        console.log(`[WEEX-MONITOR]   OrderId: ${dbPos.orderId}`);
        console.log(`[WEEX-MONITOR]   Direction: ${dbPos.direction} @ $${dbPos.entryPrice.toFixed(2)}`);
        console.log(`[WEEX-MONITOR]   SL: $${dbPos.stopLoss.toFixed(2)} | TP: $${dbPos.takeProfit.toFixed(2)}`);
      }

      console.log(`[WEEX-MONITOR] Loaded ${this.positions.size} positions into monitoring`);
    } catch (error: any) {
      console.error(`[WEEX-MONITOR] Failed to load positions from DB:`, error.message);
    }
  }

  /**
   * Fetch all open positions from database
   */
  async fetchAllOpenPositions(): Promise<IWeexPosition[]> {
    try {
      const positions = await WeexPosition.find({ status: 'OPEN' })
        .sort({ openedAt: -1 });
      return positions;
    } catch (error: any) {
      console.error(`[WEEX-MONITOR] Failed to fetch open positions:`, error.message);
      return [];
    }
  }

  /**
   * Fetch position by orderId from database
   */
  async fetchPositionByOrderId(orderId: string): Promise<IWeexPosition | null> {
    try {
      return await WeexPosition.findOne({ orderId });
    } catch (error: any) {
      console.error(`[WEEX-MONITOR] Failed to fetch position by orderId:`, error.message);
      return null;
    }
  }

  /**
   * Fetch all positions (open and closed) from database
   */
  async fetchAllPositions(limit: number = 100): Promise<IWeexPosition[]> {
    try {
      const positions = await WeexPosition.find()
        .sort({ openedAt: -1 })
        .limit(limit);
      return positions;
    } catch (error: any) {
      console.error(`[WEEX-MONITOR] Failed to fetch all positions:`, error.message);
      return [];
    }
  }

  /**
   * Log current status
   */
  logStatus(): void {
    const open = this.getOpenPositions();
    console.log('');
    console.log('[WEEX-MONITOR] Current Status:');
    console.log(`  Running: ${this.isRunning}`);
    console.log(`  Open positions: ${open.length}`);
    console.log(`  Total closed: ${this.stats.totalClosed}`);
    console.log(`  Total P&L: $${this.stats.totalPnlUSD.toFixed(2)}`);

    if (open.length > 0) {
      console.log('  Open positions:');
      for (const pos of open) {
        const pnlSign = pos.unrealizedPnl >= 0 ? '+' : '';
        console.log(`    ${pos.id.slice(0, 8)}... ${pos.direction} | ${pnlSign}$${pos.unrealizedPnl.toFixed(2)}`);
      }
    }
    console.log('');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const weexPositionMonitor = new WeexPositionMonitor();
export { WeexPositionMonitor };
