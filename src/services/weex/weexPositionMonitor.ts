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

    // 1. Check if position still exists on WEEX (ghost detection)
    const weexPosition = weexPositions.find(p => p.symbol === position.symbol);
    if (!weexPosition || parseFloat(weexPosition.hold_available) <= 0) {
      console.log(`[WEEX-MONITOR] Position ${position.id} no longer exists on WEEX (closed externally?)`);
      await this.markClosed(position, currentPrice, 'API_CLOSE', 0);
      return;
    }

    // 2. Take Profit hit
    const hitTP = position.direction === 'BUY'
      ? currentPrice >= position.takeProfit
      : currentPrice <= position.takeProfit;

    if (hitTP) {
      console.log(`[WEEX-MONITOR] TP hit for ${position.id} at $${currentPrice.toFixed(2)}`);
      await this.closePosition(position, 'TAKE_PROFIT');
      return;
    }

    // 3. Stop Loss hit (using current stop, which may be moved)
    const hitSL = position.direction === 'BUY'
      ? currentPrice <= position.currentStopLoss
      : currentPrice >= position.currentStopLoss;

    if (hitSL) {
      const reason = position.breakevenActivated ? 'BREAKEVEN_STOP' :
                     position.trailingActivated ? 'TRAILING_STOP' : 'STOP_LOSS';
      console.log(`[WEEX-MONITOR] ${reason} hit for ${position.id} at $${currentPrice.toFixed(2)}`);
      await this.closePosition(position, reason);
      return;
    }

    // 4. Time-based exit
    const positionAgeMinutes = (Date.now() - position.openTime.getTime()) / (1000 * 60);
    if (positionAgeMinutes >= this.config.MAX_POSITION_DURATION_MINUTES) {
      console.log(`[WEEX-MONITOR] Time exit for ${position.id} (${positionAgeMinutes.toFixed(0)} min)`);
      await this.closePosition(position, 'TIME_EXIT');
      return;
    }

    // 5. Breakeven protection (if not already activated)
    if (!position.breakevenActivated && currentProgress >= this.config.BREAKEVEN_TRIGGER_PCT) {
      position.breakevenActivated = true;
      position.currentStopLoss = position.entryPrice + (position.direction === 'BUY' ? 1 : -1); // Tiny buffer

      console.log(`[WEEX-MONITOR] BREAKEVEN activated for ${position.id}`);
      console.log(`[WEEX-MONITOR]   Progress: ${(currentProgress * 100).toFixed(1)}% of TP`);
      console.log(`[WEEX-MONITOR]   New SL: $${position.currentStopLoss.toFixed(2)}`);

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

    // 6. Trailing stop (if not already activated)
    if (!position.trailingActivated && currentProgress >= this.config.TRAILING_TRIGGER_PCT) {
      position.trailingActivated = true;

      // Trail at configured distance from current price
      const trailDistance = totalReward * this.config.TRAILING_DISTANCE_PCT;
      position.currentStopLoss = position.direction === 'BUY'
        ? currentPrice - trailDistance
        : currentPrice + trailDistance;

      console.log(`[WEEX-MONITOR] TRAILING activated for ${position.id}`);
      console.log(`[WEEX-MONITOR]   Progress: ${(currentProgress * 100).toFixed(1)}% of TP`);
      console.log(`[WEEX-MONITOR]   Trail distance: $${trailDistance.toFixed(2)}`);
      console.log(`[WEEX-MONITOR]   New SL: $${position.currentStopLoss.toFixed(2)}`);

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

    // 7. Update trailing stop if already activated (follow price up/down)
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
