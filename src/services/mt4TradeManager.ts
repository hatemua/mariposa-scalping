import { EventEmitter } from 'events';
import MT4Position from '../models/MT4Position';
import { Trade } from '../models';
import { mt4Service } from './mt4Service';
import { scalpingPatternService } from './scalpingPatternService';
import { marketDropDetector, DropAlert } from './marketDropDetector';
import { redisService } from './redisService';
import { riskManager, RISK_CONFIG } from './riskManager';

export interface PositionMonitoringResult {
  positionsChecked: number;
  positionsClosed: number;
  closeReasons: string[];
  errors: string[];
}

// ============================================================
// ENHANCED EXIT CONFIGURATION - Using centralized RiskManager values
// ============================================================
const EXIT_CONFIG = {
  // Early exit on adverse move (changed from 100 to 80 points)
  MAX_ADVERSE_POINTS: RISK_CONFIG.EARLY_EXIT_LOSS_POINTS,  // 80 points

  // Breakeven protection
  BREAKEVEN_AT_POINTS: RISK_CONFIG.BREAKEVEN_PROFIT_POINTS,  // 40 points

  // Trailing stop
  TRAILING_ACTIVATION: RISK_CONFIG.TRAILING_START_POINTS,    // 50 points
  TRAILING_DISTANCE: RISK_CONFIG.TRAILING_DISTANCE_POINTS,   // 30 points

  // Time-based exit
  MAX_DURATION_MINUTES: RISK_CONFIG.MAX_POSITION_MINUTES     // 45 minutes
};

// ============================================================
// POSITION LIMITS - Prevent over-concentration
// ============================================================
const MAX_CONCURRENT_POSITIONS = {
  SAME_DIRECTION: 1,  // Only 1 BUY or 1 SELL at a time
  TOTAL: 2            // Max 2 total (1 BUY + 1 SELL allowed)
};

export class MT4TradeManager extends EventEmitter {
  private readonly MONITORING_INTERVAL = 10000; // 10 seconds - avoid overloading MT4 bridge
  private readonly POSITION_CACHE_PREFIX = 'mt4_pos:';
  private readonly POSITION_CACHE_TTL = 300; // 5 minutes

  // ============================================================
  // RISK MANAGEMENT CONFIG (from .env)
  // ============================================================
  // These are loaded dynamically to allow runtime configuration
  //
  // KEY CONFIG VALUES:
  // - MT4_BREAKEVEN_PCT: When to move SL to breakeven (% of TP distance reached)
  // - MT4_TRAILING_ACTIVATION_PCT: When to start trailing (% of TP distance reached)
  // - MT4_TRAILING_DISTANCE: How far behind price to trail SL (in points)
  //
  // Example with 150pt SL and 225pt TP (1:1.5 R:R):
  // - Breakeven at 30%: Triggers when 67.5pts in profit (225 * 0.30)
  // - Trailing at 40%: Triggers when 90pts in profit (225 * 0.40)
  // - Trailing distance: 50pts behind current price
  // ============================================================

  // Get configuration from environment (with sensible defaults)
  private get BREAKEVEN_PCT(): number {
    return parseFloat(process.env.MT4_BREAKEVEN_PCT || '30') / 100; // Convert % to decimal
  }

  private get TRAILING_ACTIVATION_PCT(): number {
    return parseFloat(process.env.MT4_TRAILING_ACTIVATION_PCT || '40') / 100;
  }

  private get TRAILING_DISTANCE_POINTS(): number {
    return parseFloat(process.env.MT4_TRAILING_DISTANCE || '50');
  }

  // Legacy percentage-based config (for backward compatibility with non-crypto)
  private readonly BREAK_EVEN_PROFIT_THRESHOLD = 1.0; // % profit to trigger break-even
  private readonly BREAK_EVEN_BUFFER = 0.1; // % buffer above entry (to cover spread)
  private readonly TRAILING_STOP_DISTANCE = 1.0; // % trail distance from highest profit
  private readonly TRAILING_MIN_PROFIT = 1.5; // Only trail after 1.5% profit (after break-even)

  // Pip configuration for crypto (1 pip = $1 for BTC on most brokers)
  private readonly CRYPTO_PIP_VALUE = 1; // $1 per point for BTC (changed from 10)

  // These are now calculated dynamically based on position's TP distance
  // Keeping as fallbacks for positions without TP
  private readonly BREAK_EVEN_BUFFER_PIPS = 5;     // 5 points buffer above entry
  private readonly TRAILING_STOP_PIPS = 50;        // 50 points trail (from ENV default)
  private readonly MIN_PROFIT_PIPS = 60;           // 60 points = ~40% of 150pt TP
  private readonly BREAK_EVEN_TRIGGER_PIPS = 45;   // 45 points = ~30% of 150pt TP

  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();

    // Listen to market drop alerts
    marketDropDetector.on('drop_detected', async (alert: DropAlert) => {
      await this.handleMarketDrop(alert);
    });
  }

  // ============================================================
  // COOLDOWN SYSTEM - Now delegated to centralized RiskManager
  // ============================================================

  /**
   * Check if we can open a new trade (cooldown check)
   * @deprecated Use riskManager.checkAndStartCooldown() instead for atomic checks
   */
  canOpenNewTrade(): boolean {
    // Legacy method - kept for backward compatibility
    // The real check now happens in RiskManager with mutex locks
    console.log('⚠️ canOpenNewTrade() called - use riskManager.checkAndStartCooldown() instead');
    return true;
  }

  /**
   * Update cooldown state when a trade closes
   * Now delegates to RiskManager for centralized tracking
   */
  async updateCooldownOnClose(pnl: number): Promise<void> {
    await riskManager.recordTradeResult(pnl, false);
  }

  /**
   * Record that a new trade was opened
   * Now delegates to RiskManager for centralized tracking
   */
  async recordTradeOpened(): Promise<void> {
    await riskManager.recordTradeOpened();
  }

  // ============================================================
  // POSITION LIMITS - Prevents over-concentration
  // ============================================================

  /**
   * Check if we can open a position in the given direction
   */
  async checkPositionLimits(direction: 'BUY' | 'SELL'): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const openPositions = await MT4Position.find({ status: 'open' });

      const sameDirectionCount = openPositions.filter(
        p => p.side?.toUpperCase() === direction.toUpperCase()
      ).length;

      if (sameDirectionCount >= MAX_CONCURRENT_POSITIONS.SAME_DIRECTION) {
        return {
          allowed: false,
          reason: `Already have ${sameDirectionCount} ${direction} position(s) open (max: ${MAX_CONCURRENT_POSITIONS.SAME_DIRECTION})`
        };
      }

      if (openPositions.length >= MAX_CONCURRENT_POSITIONS.TOTAL) {
        return {
          allowed: false,
          reason: `Max ${openPositions.length} positions already open (max: ${MAX_CONCURRENT_POSITIONS.TOTAL})`
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking position limits:', error);
      return { allowed: true }; // Allow on error to not block trading
    }
  }

  /**
   * Get current position count summary
   */
  async getPositionCountSummary(): Promise<{ buy: number; sell: number; total: number }> {
    try {
      const openPositions = await MT4Position.find({ status: 'open' });
      const buyCount = openPositions.filter(p => p.side?.toLowerCase() === 'buy').length;
      const sellCount = openPositions.filter(p => p.side?.toLowerCase() === 'sell').length;
      return { buy: buyCount, sell: sellCount, total: openPositions.length };
    } catch (error) {
      console.error('Error getting position count:', error);
      return { buy: 0, sell: 0, total: 0 };
    }
  }

  // Pip utility functions for crypto
  private isCryptoSymbol(symbol: string): boolean {
    const upperSymbol = symbol.toUpperCase();
    return upperSymbol.includes('BTC') || upperSymbol.includes('ETH') ||
           upperSymbol.includes('CRYPTO') || upperSymbol.endsWith('USDM') ||
           upperSymbol.endsWith('USDT');
  }

  private pipsToPrice(pips: number): number {
    return pips * this.CRYPTO_PIP_VALUE;
  }

  private priceToPips(priceDistance: number): number {
    return priceDistance / this.CRYPTO_PIP_VALUE;
  }

  /**
   * Start the MT4 trade manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  MT4 Trade Manager already running');
      return;
    }

    console.log('🤖 Starting MT4 Trade Manager...');

    // Sync positions with MT4 on startup
    await this.syncPositionsWithMT4();

    this.isRunning = true;

    // Start monitoring loop
    this.monitorInterval = setInterval(async () => {
      await this.monitorOpenPositions();
    }, this.MONITORING_INTERVAL);

    // Also run sync every 5 minutes to catch any positions that get out of sync
    setInterval(() => this.syncPositionsWithMT4(), 5 * 60 * 1000);

    console.log(`✅ MT4 Trade Manager started (monitoring every ${this.MONITORING_INTERVAL / 1000}s)`);
  }

  /**
   * Stop the trade manager
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.isRunning = false;
    console.log('⏹️  MT4 Trade Manager stopped');
  }

  /**
   * Monitor all open MT4 positions
   */
  private async monitorOpenPositions(): Promise<PositionMonitoringResult> {
    const result: PositionMonitoringResult = {
      positionsChecked: 0,
      positionsClosed: 0,
      closeReasons: [],
      errors: []
    };

    try {
      // Get all open positions from database
      const openPositions = await MT4Position.find({ status: 'open' }).populate('agentId userId');

      result.positionsChecked = openPositions.length;

      if (openPositions.length === 0) {
        return result; // No positions to monitor
      }

      console.log(`🔍 Monitoring ${openPositions.length} open MT4 positions...`);

      // Check each position
      for (const position of openPositions) {
        try {
          await this.checkPosition(position, result);
        } catch (error) {
          const errorMsg = `Error checking position ${position.ticket}: ${(error as Error).message}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      if (result.positionsClosed > 0) {
        console.log(
          `✅ Closed ${result.positionsClosed} positions. ` +
          `Reasons: ${result.closeReasons.join(', ')}`
        );
      }

    } catch (error) {
      console.error('Error monitoring open positions:', error);
      result.errors.push(`Monitor error: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * NEW: Time-based exit for scalping positions
   * - Exit if open >15 min with <25% progress toward TP
   * - Exit if open >30 min regardless of progress
   */
  private async checkTimeBasedExit(
    position: any,
    currentPrice: number,
    result: PositionMonitoringResult
  ): Promise<boolean> {
    const { entryPrice, takeProfit, ticket, userId, openedAt, side } = position;
    const direction = side?.toUpperCase();

    const openTime = openedAt ? new Date(openedAt).getTime() : Date.now();
    const minutesOpen = (Date.now() - openTime) / 60000;

    // Calculate progress toward TP
    let progressPercent = 0;
    if (takeProfit && entryPrice) {
      const tpDistance = Math.abs(takeProfit - entryPrice);
      if (tpDistance > 0) {
        const currentProgress = direction === 'BUY'
          ? (currentPrice - entryPrice) / tpDistance
          : (entryPrice - currentPrice) / tpDistance;
        progressPercent = Math.max(0, currentProgress * 100); // Can't be negative progress
      }
    }

    // Rule 1: Exit if open >15 min with <25% progress toward TP
    if (minutesOpen > RISK_CONFIG.TIME_EXIT_SLOW_MINUTES &&
        progressPercent < RISK_CONFIG.TIME_EXIT_SLOW_PROGRESS * 100) {
      console.log(`⏰ [TIME EXIT] Position ${ticket}: ${minutesOpen.toFixed(0)}min open with only ${progressPercent.toFixed(0)}% progress (< ${RISK_CONFIG.TIME_EXIT_SLOW_PROGRESS * 100}%)`);
      try {
        await this.closePosition(
          ticket,
          userId._id?.toString() || userId.toString(),
          'manual',
          `Time exit: ${minutesOpen.toFixed(0)}min with ${progressPercent.toFixed(0)}% progress`
        );
        await this.updateCooldownOnClose(position.profit || 0);
        result.positionsClosed++;
        result.closeReasons.push('time-exit-slow');
        return true;
      } catch (error) {
        console.error(`Failed time-based exit for ${ticket}:`, error);
      }
    }

    // Rule 2: Exit if open >30 min regardless of progress
    if (minutesOpen > RISK_CONFIG.TIME_EXIT_MAX_MINUTES) {
      console.log(`⏰ [TIME EXIT] Position ${ticket}: Max ${RISK_CONFIG.TIME_EXIT_MAX_MINUTES}min scalping duration reached (${minutesOpen.toFixed(0)}min open)`);
      try {
        await this.closePosition(
          ticket,
          userId._id?.toString() || userId.toString(),
          'manual',
          `Time exit: Max scalping duration (${RISK_CONFIG.TIME_EXIT_MAX_MINUTES}min)`
        );
        await this.updateCooldownOnClose(position.profit || 0);
        result.positionsClosed++;
        result.closeReasons.push('time-exit-max');
        return true;
      } catch (error) {
        console.error(`Failed time-based exit for ${ticket}:`, error);
      }
    }

    return false;
  }

  /**
   * NEW: Lock profit at 1:1 R:R by moving SL
   * Instead of closing, move SL to lock 50% of profit when 1:1 R:R achieved
   * Trade continues running for potential larger gains
   */
  private async checkAndLockProfitAt1R(
    position: any,
    currentPrice: number
  ): Promise<void> {
    const { entryPrice, stopLoss, ticket, userId, side, oneToOneLocked } = position;
    const direction = side?.toUpperCase();

    // Skip if no SL set or already locked
    if (!stopLoss || position.oneToOneLocked) return;

    const risk = Math.abs(entryPrice - stopLoss);
    const currentProfit = direction === 'BUY'
      ? currentPrice - entryPrice
      : entryPrice - currentPrice;

    // At 1:1 R:R: Move SL to lock in 50% of current profit
    if (currentProfit >= risk) {
      const lockProfit = currentProfit * RISK_CONFIG.ONE_TO_ONE_LOCK_PROFIT_PCT;
      const newSL = direction === 'BUY'
        ? entryPrice + lockProfit
        : entryPrice - lockProfit;

      const currentSL = position.stopLoss || stopLoss;
      const shouldUpdate = direction === 'BUY'
        ? newSL > currentSL
        : newSL < currentSL;

      if (shouldUpdate) {
        console.log(`💰 [1:1 LOCK] Position ${ticket}: R:R 1:1 achieved (+${currentProfit.toFixed(0)} pts >= ${risk.toFixed(0)} risk) - locking ${lockProfit.toFixed(0)} pts profit`);
        console.log(`   SL: ${currentSL?.toFixed(2)} → ${newSL.toFixed(2)}`);
        try {
          await mt4Service.modifyStopLoss(
            userId._id?.toString() || userId.toString(),
            ticket,
            newSL
          );
          position.stopLoss = newSL;
          position.oneToOneLocked = true;
          await position.save();
        } catch (error) {
          console.error(`Failed to lock profit at 1:1 for ${ticket}:`, error);
        }
      }
    }
  }

  /**
   * NEW: Percentage-based trailing stop using TP distance
   * - Breakeven at 50% of TP distance
   * - Lock 50% of gains at 75% of TP distance
   */
  private async updateTrailingStopPercentage(
    position: any,
    currentPrice: number
  ): Promise<void> {
    const { entryPrice, stopLoss, takeProfit, ticket, userId, side } = position;
    const direction = side?.toUpperCase();

    // Need TP set for percentage-based trailing
    if (!takeProfit || !entryPrice) return;

    const tpDistance = Math.abs(takeProfit - entryPrice);
    if (tpDistance <= 0) return;

    const currentProgress = direction === 'BUY'
      ? (currentPrice - entryPrice) / tpDistance
      : (entryPrice - currentPrice) / tpDistance;

    const currentSL = position.stopLoss || stopLoss;

    // 50% of TP reached: Move SL to breakeven (+5 buffer)
    if (currentProgress >= RISK_CONFIG.TRAILING_BREAKEVEN_PCT && !position.breakEvenActivated) {
      const buffer = 5; // 5 points buffer above entry
      const breakEvenSL = direction === 'BUY'
        ? entryPrice + buffer
        : entryPrice - buffer;

      const shouldUpdate = direction === 'BUY'
        ? (!currentSL || breakEvenSL > currentSL)
        : (!currentSL || breakEvenSL < currentSL);

      if (shouldUpdate) {
        console.log(`🛡️ [BREAKEVEN] Position ${ticket}: ${(currentProgress * 100).toFixed(0)}% to TP - Moving SL to breakeven ${breakEvenSL.toFixed(2)}`);
        try {
          await mt4Service.modifyStopLoss(
            userId._id?.toString() || userId.toString(),
            ticket,
            breakEvenSL
          );
          position.stopLoss = breakEvenSL;
          position.breakEvenActivated = true;
          await position.save();
        } catch (error) {
          console.error(`Failed to set breakeven for ${ticket}:`, error);
        }
      }
    }

    // 75% of TP reached: Lock 50% of the TP distance as profit
    if (currentProgress >= RISK_CONFIG.TRAILING_LOCK_PCT && position.breakEvenActivated) {
      const lockAmount = tpDistance * RISK_CONFIG.TRAILING_LOCK_AMOUNT;
      const lockSL = direction === 'BUY'
        ? entryPrice + lockAmount
        : entryPrice - lockAmount;

      const shouldUpdate = direction === 'BUY'
        ? (!currentSL || lockSL > currentSL)
        : (!currentSL || lockSL < currentSL);

      if (shouldUpdate && !position.profitLocked75) {
        console.log(`📈 [75% LOCK] Position ${ticket}: ${(currentProgress * 100).toFixed(0)}% to TP - Locking ${lockAmount.toFixed(0)} pts profit (SL: ${currentSL?.toFixed(2)} → ${lockSL.toFixed(2)})`);
        try {
          await mt4Service.modifyStopLoss(
            userId._id?.toString() || userId.toString(),
            ticket,
            lockSL
          );
          position.stopLoss = lockSL;
          position.profitLocked75 = true;
          await position.save();
        } catch (error) {
          console.error(`Failed to lock profit at 75% for ${ticket}:`, error);
        }
      }
    }
  }

  /**
   * Enhanced position management with symmetric exit logic
   * NEW ORDER: Time exit → 1:1 lock → Trailing stop → Early exit → (LLM analysis last, in positionMonitorService)
   */
  private async managePositionWithExitRules(position: any, mt4Pos: any, result: PositionMonitoringResult): Promise<boolean> {
    const { ticket, userId, side, entryPrice, stopLoss, takeProfit, openedAt } = position;
    const currentPrice = mt4Pos.currentPrice;
    const direction = side?.toUpperCase();

    // ==========================================
    // 1. TIME-BASED EXIT - Check first (fastest check, no market analysis needed)
    // ==========================================
    if (await this.checkTimeBasedExit(position, currentPrice, result)) {
      return true; // Position was closed
    }

    // ==========================================
    // 2. LOCK PROFIT AT 1:1 R:R - Move SL to secure 50% of gains (trade continues)
    // ==========================================
    await this.checkAndLockProfitAt1R(position, currentPrice);

    // ==========================================
    // 3. TRAILING STOP - Update SL using NEW percentage-based logic
    // ==========================================
    await this.updateTrailingStopPercentage(position, currentPrice);

    // ==========================================
    // 4. EARLY EXIT on adverse move (existing logic - don't wait for full SL!)
    // ==========================================
    let plPoints: number;
    if (direction === 'BUY') {
      plPoints = currentPrice - entryPrice;
    } else {
      plPoints = entryPrice - currentPrice;
    }

    if (plPoints <= -EXIT_CONFIG.MAX_ADVERSE_POINTS) {
      console.log(`🛑 [EARLY EXIT] Position ${ticket}: ${plPoints.toFixed(0)} pts loss > max ${EXIT_CONFIG.MAX_ADVERSE_POINTS}`);

      try {
        await this.closePosition(ticket, userId._id?.toString() || userId.toString(), 'stop-loss', 'Early exit - max adverse points reached');
        await this.updateCooldownOnClose(mt4Pos.profit || plPoints);
        result.positionsClosed++;
        result.closeReasons.push('early-exit');
        return true; // Position was closed
      } catch (error) {
        console.error(`Failed to early exit position ${ticket}:`, error);
      }
    }

    // ==========================================
    // 5. LLM EXIT ANALYSIS - Called separately in positionMonitorService (last)
    // ==========================================

    return false; // Position still open
  }

  /**
   * Check individual position for close conditions
   */
  private async checkPosition(position: any, result: PositionMonitoringResult): Promise<void> {
    const { ticket, userId, agentId, symbol, side } = position;

    // Check for pattern-based auto-close (both LONG and SHORT)
    const pattern = await scalpingPatternService.getLatestPattern('BTCUSDT');

    // NEW: Auto-close LONG (buy) positions on SELL signals
    if (side === 'buy' && pattern && pattern.direction === 'SELL' && pattern.confidence >= 60) {
      console.log(
        `📉 SELL signal detected for ${symbol} (confidence: ${pattern.confidence}%) - ` +
        `Closing LONG position ${ticket}`
      );

      // Debug logging for auto-close trigger
      console.log(`[MT4 TradeManager] Auto-close LONG triggered:`, {
        ticket,
        symbol,
        side,
        reason: 'sell-signal',
        patternConfidence: pattern.confidence,
        patternDirection: pattern.direction,
        reasoning: pattern.reasoning.substring(0, 100) + '...'
      });

      await this.closePosition(ticket, userId._id.toString(), 'sell-signal', pattern.reasoning);

      result.positionsClosed++;
      result.closeReasons.push('sell-signal');

      return;
    }

    // NEW: Auto-close SHORT (sell) positions on BUY signals
    if (side === 'sell' && pattern && pattern.direction === 'BUY' && pattern.confidence >= 60) {
      console.log(
        `📈 BUY signal detected for ${symbol} (confidence: ${pattern.confidence}%) - ` +
        `Closing SHORT position ${ticket}`
      );

      // Debug logging for auto-close trigger
      console.log(`[MT4 TradeManager] Auto-close SHORT triggered:`, {
        ticket,
        symbol,
        side,
        reason: 'buy-signal',
        patternConfidence: pattern.confidence,
        patternDirection: pattern.direction,
        reasoning: pattern.reasoning.substring(0, 100) + '...'
      });

      await this.closePosition(ticket, userId._id.toString(), 'sell-signal', pattern.reasoning);

      result.positionsClosed++;
      result.closeReasons.push('buy-signal');

      return;
    }

    // Check MT4 for updated position status (in case closed manually or hit SL/TP)
    try {
      const mt4Position = await mt4Service.getOpenPositions(userId._id.toString(), symbol);

      // If position not found in MT4 open positions, it was closed
      const stillOpen = mt4Position.some((p: any) => p.ticket === ticket);

      if (!stillOpen) {
        console.log(`📍 Position ${ticket} no longer open in MT4 - Updating database`);

        // Mark as closed in database WITHOUT trying to close again
        // This prevents sending close requests for already-closed positions
        await this.updateClosedPosition(ticket, 'stop-loss'); // Could be SL, TP, or manual

        result.positionsClosed++;
        result.closeReasons.push('mt4-closed');

        // IMPORTANT: Return early - don't attempt to close this position
        return;
      } else {
        // Update current price for open position
        const mt4Pos = mt4Position.find((p: any) => p.ticket === ticket);
        if (mt4Pos && mt4Pos.currentPrice !== undefined && mt4Pos.profit !== undefined) {
          await this.updatePositionPrice(position, mt4Pos.currentPrice, mt4Pos.profit);

          // NEW: Enhanced exit rules with symmetric risk management
          // This includes: early exit, breakeven, trailing stop, time limit
          const wasClosed = await this.managePositionWithExitRules(position, mt4Pos, result);
          if (wasClosed) {
            return; // Position was closed by exit rules, no further checks needed
          }

          // Application-level SL/TP monitoring (redundant backup to MT4)
          await this.checkApplicationLevelSLTP(position, mt4Pos, result);

          // Legacy break-even and trailing stop (now mostly handled by managePositionWithExitRules)
          await this.checkBreakEvenAndTrailingStop(position, mt4Pos);
        }
      }

    } catch (error) {
      console.error(`Error checking MT4 status for position ${ticket}:`, error);
    }
  }

  /**
   * Check and manage break-even and trailing stop for a position
   *
   * NEW STRATEGY (TP-based percentage):
   * - Break-even triggers at BREAKEVEN_PCT of TP distance (e.g., 30%)
   * - Trailing triggers at TRAILING_ACTIVATION_PCT of TP distance (e.g., 40%)
   * - Trailing distance is fixed at TRAILING_DISTANCE_POINTS (e.g., 50 pts)
   *
   * Example: Entry=96000, TP=96300 (300pt target)
   * - Break-even at 30%: Triggers when price reaches 96090 (90pt profit)
   * - Trailing at 40%: Triggers when price reaches 96120 (120pt profit)
   * - Trailing distance: SL trails 50pts behind current price
   */
  private async checkBreakEvenAndTrailingStop(position: any, mt4Pos: any): Promise<void> {
    const { ticket, userId, side, entryPrice, stopLoss, takeProfit, lotSize, symbol } = position;
    const currentPrice = mt4Pos.currentPrice;
    const currentProfit = mt4Pos.profit || 0;

    // Skip if no entry price
    if (!entryPrice || entryPrice <= 0) {
      return;
    }

    // Determine if this is a crypto symbol
    const isCrypto = this.isCryptoSymbol(symbol);

    // Calculate price movement from entry
    const priceMovement = side === 'buy'
      ? currentPrice - entryPrice
      : entryPrice - currentPrice;

    // Calculate TP distance (if TP is set)
    const tpDistance = takeProfit
      ? Math.abs(takeProfit - entryPrice)
      : null;

    // Calculate progress towards TP (as percentage)
    const tpProgressPct = tpDistance && tpDistance > 0
      ? (priceMovement / tpDistance)
      : null;

    // For logging
    const profitPoints = Math.abs(priceMovement);

    try {
      // === BREAK-EVEN CHECK ===
      // Trigger when we've reached BREAKEVEN_PCT of TP distance
      let shouldTriggerBreakEven = false;

      if (tpProgressPct !== null) {
        // TP-based calculation (preferred)
        shouldTriggerBreakEven = currentProfit > 0 && tpProgressPct >= this.BREAKEVEN_PCT;
      } else if (isCrypto) {
        // Fallback: pip-based for crypto without TP
        shouldTriggerBreakEven = currentProfit > 0 && profitPoints >= this.BREAK_EVEN_TRIGGER_PIPS;
      }

      if (!position.breakEvenActivated && shouldTriggerBreakEven) {
        // Move SL to entry + small buffer (5 points to cover spread)
        const breakEvenBuffer = 5; // 5 points buffer
        let breakEvenPrice: number;

        if (side === 'buy') {
          breakEvenPrice = entryPrice + breakEvenBuffer;
        } else {
          breakEvenPrice = entryPrice - breakEvenBuffer;
        }

        // Only modify if new SL is better than current SL
        const shouldModify = side === 'buy'
          ? (!stopLoss || breakEvenPrice > stopLoss)
          : (!stopLoss || breakEvenPrice < stopLoss);

        if (shouldModify) {
          const progressInfo = tpProgressPct !== null
            ? `${(tpProgressPct * 100).toFixed(1)}% to TP (threshold: ${this.BREAKEVEN_PCT * 100}%)`
            : `${profitPoints.toFixed(1)} pts profit`;

          console.log(
            `🛡️  [BREAK-EVEN] Position ${ticket}: ${progressInfo}. ` +
            `Moving SL from ${stopLoss?.toFixed(2) || 'none'} to ${breakEvenPrice.toFixed(2)} (entry + ${breakEvenBuffer}pts buffer)`
          );
          await this.activateBreakEven(position, breakEvenPrice);
        }
      }

      // === TRAILING STOP CHECK ===
      // Trigger when we've reached TRAILING_ACTIVATION_PCT of TP distance
      let shouldTrail = false;

      if (tpProgressPct !== null) {
        // TP-based calculation (preferred)
        shouldTrail = position.breakEvenActivated && tpProgressPct >= this.TRAILING_ACTIVATION_PCT;
      } else if (isCrypto) {
        // Fallback: pip-based for crypto without TP
        shouldTrail = position.breakEvenActivated && profitPoints >= this.MIN_PROFIT_PIPS;
      }

      if (shouldTrail) {
        await this.checkTrailingStopPoints(position, currentPrice, profitPoints, tpProgressPct);
      }

    } catch (error) {
      console.error(`Error in break-even/trailing stop check for position ${ticket}:`, error);
    }
  }

  /**
   * Activate break-even for a position
   */
  private async activateBreakEven(position: any, breakEvenPrice: number): Promise<void> {
    const { ticket, userId, stopLoss } = position;

    try {
      // Modify SL in MT4
      await mt4Service.modifyStopLoss(userId._id.toString(), ticket, breakEvenPrice);

      // Update database
      position.breakEvenActivated = true;
      position.breakEvenPrice = breakEvenPrice;
      position.originalStopLoss = stopLoss || position.originalStopLoss;
      position.stopLoss = breakEvenPrice;
      position.highestProfitPrice = position.currentPrice; // Initialize for trailing

      await position.save();

      console.log(`✅ [BREAK-EVEN] Position ${ticket}: Break-even activated at ${breakEvenPrice.toFixed(2)}`);

      // Emit event
      this.emit('break_even_activated', {
        ticket,
        breakEvenPrice,
        originalStopLoss: position.originalStopLoss,
        timestamp: new Date()
      });

    } catch (error) {
      console.error(`Failed to activate break-even for position ${ticket}:`, error);
    }
  }

  /**
   * Check and update trailing stop (LEGACY - kept for backward compatibility)
   */
  private async checkTrailingStop(position: any, currentPrice: number, pnlPercent: number, isCrypto: boolean = false): Promise<void> {
    // Delegate to the new points-based method
    await this.checkTrailingStopPoints(position, currentPrice, 0, null);
  }

  /**
   * Check and update trailing stop using fixed point distance
   *
   * NEW: Uses TRAILING_DISTANCE_POINTS from .env (default 50 pts)
   * Trail is a fixed distance behind the best price seen
   */
  private async checkTrailingStopPoints(
    position: any,
    currentPrice: number,
    profitPoints: number,
    tpProgressPct: number | null
  ): Promise<void> {
    const { ticket, userId, side, stopLoss, highestProfitPrice, entryPrice } = position;
    const trailDistance = this.TRAILING_DISTANCE_POINTS;

    try {
      let newHighestPrice = highestProfitPrice || currentPrice;
      let newStopLoss: number | null = null;

      if (side === 'buy') {
        // For BUY: Track highest price, trail SL below it
        if (currentPrice > newHighestPrice) {
          newHighestPrice = currentPrice;

          // Calculate new trailing SL (fixed point distance)
          const trailingStopPrice = newHighestPrice - trailDistance;

          // Only update if new SL is higher than current SL AND above entry
          if (trailingStopPrice > (stopLoss || 0) && trailingStopPrice > entryPrice) {
            newStopLoss = trailingStopPrice;
          }
        }
      } else {
        // For SELL: Track lowest price, trail SL above it
        if (currentPrice < newHighestPrice || !highestProfitPrice) {
          newHighestPrice = currentPrice;

          // Calculate new trailing SL (fixed point distance)
          const trailingStopPrice = newHighestPrice + trailDistance;

          // Only update if new SL is lower than current SL AND below entry
          if ((!stopLoss || trailingStopPrice < stopLoss) && trailingStopPrice < entryPrice) {
            newStopLoss = trailingStopPrice;
          }
        }
      }

      // Update highest profit price in database
      if (newHighestPrice !== highestProfitPrice) {
        position.highestProfitPrice = newHighestPrice;
      }

      // Update trailing stop if needed
      if (newStopLoss !== null) {
        const progressInfo = tpProgressPct !== null
          ? `${(tpProgressPct * 100).toFixed(1)}% to TP`
          : `${profitPoints.toFixed(1)} pts profit`;

        console.log(
          `📈 [TRAILING] Position ${ticket}: Price ${currentPrice.toFixed(2)}, ${progressInfo}. ` +
          `Moving SL from ${stopLoss?.toFixed(2) || 'none'} to ${newStopLoss.toFixed(2)} ` +
          `(${trailDistance}pts behind ${newHighestPrice.toFixed(2)})`
        );

        // Modify SL in MT4
        await mt4Service.modifyStopLoss(userId._id.toString(), ticket, newStopLoss);

        // Update database
        position.trailingStopActivated = true;
        position.stopLoss = newStopLoss;

        // Emit event
        this.emit('trailing_stop_updated', {
          ticket,
          newStopLoss,
          highestProfitPrice: newHighestPrice,
          profitPoints,
          tpProgressPct,
          timestamp: new Date()
        });
      }

      // Always save to update highestProfitPrice tracking
      await position.save();

    } catch (error) {
      console.error(`Failed to update trailing stop for position ${ticket}:`, error);
    }
  }

  /**
   * Application-level Stop Loss / Take Profit monitoring
   * Redundant backup in case MT4 SL/TP fails
   */
  private async checkApplicationLevelSLTP(
    position: any,
    mt4Position: any,
    result: PositionMonitoringResult
  ): Promise<void> {
    const { ticket, userId, side, stopLoss, takeProfit, entryPrice } = position;
    const currentPrice = mt4Position.currentPrice;

    // Skip if no SL/TP set
    if (!stopLoss && !takeProfit) {
      return;
    }

    let shouldClose = false;
    let closeReason: 'stop-loss' | 'take-profit' | null = null;

    // Check Stop Loss
    if (stopLoss) {
      if (side === 'buy' && currentPrice <= stopLoss) {
        shouldClose = true;
        closeReason = 'stop-loss';
        console.log(
          `⚠️  [APP-LEVEL SL] Position ${ticket} hit stop loss: ` +
          `${currentPrice} <= ${stopLoss} (entry: ${entryPrice})`
        );
      } else if (side === 'sell' && currentPrice >= stopLoss) {
        shouldClose = true;
        closeReason = 'stop-loss';
        console.log(
          `⚠️  [APP-LEVEL SL] Position ${ticket} hit stop loss: ` +
          `${currentPrice} >= ${stopLoss} (entry: ${entryPrice})`
        );
      }
    }

    // Check Take Profit
    if (!shouldClose && takeProfit) {
      if (side === 'buy' && currentPrice >= takeProfit) {
        shouldClose = true;
        closeReason = 'take-profit';
        console.log(
          `✅ [APP-LEVEL TP] Position ${ticket} hit take profit: ` +
          `${currentPrice} >= ${takeProfit} (entry: ${entryPrice})`
        );
      } else if (side === 'sell' && currentPrice <= takeProfit) {
        shouldClose = true;
        closeReason = 'take-profit';
        console.log(
          `✅ [APP-LEVEL TP] Position ${ticket} hit take profit: ` +
          `${currentPrice} <= ${takeProfit} (entry: ${entryPrice})`
        );
      }
    }

    // Close position if SL/TP triggered
    if (shouldClose && closeReason) {
      console.log(
        `🔒 Application-level ${closeReason === 'stop-loss' ? 'SL' : 'TP'} triggered for position ${ticket}. ` +
        `Closing as backup (MT4 SL/TP may have failed).`
      );

      try {
        await this.closePosition(
          ticket,
          userId._id.toString(),
          closeReason,
          `Application-level ${closeReason} backup closure`
        );

        result.positionsClosed++;
        result.closeReasons.push(`app-level-${closeReason}`);
      } catch (error) {
        console.error(`Failed to close position ${ticket} via app-level SL/TP:`, error);
      }
    }
  }

  /**
   * Close MT4 position
   */
  async closePosition(
    ticket: number,
    userId: string,
    reason: 'sell-signal' | 'market-drop' | 'manual' | 'stop-loss' | 'take-profit',
    notes?: string
  ): Promise<void> {
    try {
      console.log(`🔐 Closing MT4 position ${ticket} - Reason: ${reason}`);

      // Close via MT4 service
      const closedOrder = await mt4Service.closePosition(userId, ticket);

      // Update database
      const position = await MT4Position.findOne({ ticket });

      if (position) {
        position.status = reason === 'sell-signal' || reason === 'market-drop' ? 'auto-closed' : 'closed';
        position.closedAt = new Date();
        position.closeReason = reason;
        position.profit = closedOrder.profit;
        position.currentPrice = closedOrder.currentPrice;

        await position.save();

        // Also create/update Trade record
        await this.syncToTradeModel(position, notes);

        // Emit event
        this.emit('position_closed', {
          ticket,
          reason,
          profit: closedOrder.profit,
          timestamp: new Date()
        });

        console.log(
          `✅ Position ${ticket} closed successfully | ` +
          `Profit: $${closedOrder.profit.toFixed(2)} | Reason: ${reason}`
        );
      }

    } catch (error: any) {
      const errorMsg = error.message || String(error);
      const mt4ErrorCode = error.mt4ErrorCode || null;

      // Handle error 4108 (invalid ticket - position already closed) gracefully
      if (mt4ErrorCode === 4108 || errorMsg.includes('4108') || errorMsg.includes('already closed')) {
        console.warn(`⚠️  Position ${ticket} already closed in MT4. Updating database to reflect closure.`);

        // Mark position as closed in database even though MT4 request failed
        const position = await MT4Position.findOne({ ticket });
        if (position && position.status !== 'closed') {
          position.status = 'closed';
          position.closedAt = new Date();
          position.closeReason = 'mt4-already-closed';

          // Note: MT4 history lookup not available, profit will remain as last known value

          await position.save();

          // Sync to Trade model
          await this.syncToTradeModel(position, notes);

          // Emit event
          this.emit('position_closed', {
            ticket,
            reason: 'mt4-already-closed',
            profit: position.profit || 0,
            timestamp: new Date()
          });

          console.log(`✅ Database updated for already-closed position ${ticket}`);
        }

        // Don't re-throw - this is expected behavior
        return;
      }

      // For other errors, log and re-throw
      console.error(`❌ Failed to close position ${ticket}:`, error);
      throw error;
    }
  }

  /**
   * Handle market drop event
   */
  private async handleMarketDrop(alert: DropAlert): Promise<void> {
    console.log(
      `🚨 MARKET DROP ALERT: ${alert.dropLevel.toUpperCase()} - ` +
      `${alert.priceChange.toFixed(2)}% drop detected`
    );

    // For severe drops, close ALL open positions immediately
    if (alert.dropLevel === 'severe') {
      console.log('⚠️  SEVERE DROP - Closing ALL open MT4 positions for protection');

      const openPositions = await MT4Position.find({ status: 'open', side: 'buy' });

      for (const position of openPositions) {
        try {
          await this.closePosition(
            position.ticket,
            position.userId.toString(),
            'market-drop',
            `Severe market drop: ${alert.priceChange.toFixed(2)}% in ${alert.timeframe}`
          );
        } catch (error) {
          console.error(`Failed to close position ${position.ticket} during market drop:`, error);
        }
      }

      // Publish alert to all users
      await redisService.publish('mt4_emergency', {
        type: 'positions_closed_market_drop',
        alert,
        positionsClosed: openPositions.length,
        timestamp: new Date()
      });
    }
  }

  /**
   * Track new MT4 position
   */
  async trackPosition(positionData: {
    userId: string;
    agentId: string;
    ticket: number;
    symbol: string;
    side: 'buy' | 'sell';
    lotSize: number;
    entryPrice: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<void> {
    try {
      // Debug logging
      console.log(`[MT4 TradeManager] Tracking new position:`, {
        ticket: positionData.ticket,
        agentId: positionData.agentId,
        symbol: positionData.symbol,
        side: positionData.side,
        lotSize: positionData.lotSize,
        entryPrice: positionData.entryPrice,
        stopLoss: positionData.stopLoss || 'none',
        takeProfit: positionData.takeProfit || 'none'
      });

      // Check if position already exists
      const existing = await MT4Position.findOne({ ticket: positionData.ticket });

      if (existing) {
        console.log(`⚠️  Position ${positionData.ticket} already tracked`);
        return;
      }

      // Create new position record
      const position = new MT4Position({
        userId: positionData.userId,
        agentId: positionData.agentId,
        ticket: positionData.ticket,
        symbol: positionData.symbol,
        side: positionData.side,
        lotSize: positionData.lotSize,
        entryPrice: positionData.entryPrice,
        currentPrice: positionData.entryPrice,
        stopLoss: positionData.stopLoss,
        takeProfit: positionData.takeProfit,
        status: 'open',
        openedAt: new Date()
      });

      await position.save();

      // Cache in Redis for fast access
      await this.cachePosition(position);

      console.log(
        `📝 Tracking new MT4 position | Ticket: ${positionData.ticket} | ` +
        `${positionData.side.toUpperCase()} ${positionData.lotSize} lots ${positionData.symbol} @ $${positionData.entryPrice}`
      );
      console.log(`[MT4 TradeManager] ✅ Position saved to database and cached`);

      // Emit event
      this.emit('position_opened', {
        ticket: positionData.ticket,
        symbol: positionData.symbol,
        side: positionData.side,
        lotSize: positionData.lotSize,
        entryPrice: positionData.entryPrice,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error tracking position:', error);
      throw error;
    }
  }

  /**
   * Update position price
   */
  private async updatePositionPrice(position: any, currentPrice: number, profit: number): Promise<void> {
    try {
      position.currentPrice = currentPrice;
      position.profit = profit;

      await position.save();

      // Update cache
      await this.cachePosition(position);

    } catch (error) {
      console.error(`Error updating position ${position.ticket} price:`, error);
    }
  }

  /**
   * Update closed position in database
   */
  private async updateClosedPosition(ticket: number, reason: string): Promise<void> {
    try {
      const position = await MT4Position.findOne({ ticket });

      if (position) {
        position.status = 'closed';
        position.closedAt = new Date();
        position.closeReason = reason as any;

        await position.save();

        // Sync to Trade model
        await this.syncToTradeModel(position);

        // Remove from cache
        await this.removeCachedPosition(ticket);
      }

    } catch (error) {
      console.error(`Error updating closed position ${ticket}:`, error);
    }
  }

  /**
   * Sync position to Trade model
   */
  private async syncToTradeModel(position: any, notes?: string): Promise<void> {
    try {
      // Check if trade already exists
      let trade = await Trade.findOne({ mt4Ticket: position.ticket });

      if (!trade) {
        // Create new trade
        trade = new Trade({
          userId: position.userId,
          agentId: position.agentId,
          symbol: position.symbol, // Symbol mapping now correct - no workaround needed
          side: position.side,
          type: 'market',
          quantity: position.lotSize,
          price: position.entryPrice,
          filledPrice: position.entryPrice,
          filledQuantity: position.lotSize,
          status: position.status === 'open' ? 'filled' : 'filled',
          pnl: position.profit || 0,
          mt4Ticket: position.ticket,
          performanceNotes: notes
        });
      } else {
        // Update existing trade
        trade.pnl = position.profit || 0;
        trade.status = 'filled';
        if (notes) {
          trade.performanceNotes = notes;
        }
      }

      await trade.save();

    } catch (error) {
      console.error(`Error syncing position ${position.ticket} to Trade model:`, error);
    }
  }

  /**
   * Cache position in Redis
   */
  private async cachePosition(position: any): Promise<void> {
    try {
      const key = `${this.POSITION_CACHE_PREFIX}${position.ticket}`;
      const data = {
        ticket: position.ticket,
        userId: position.userId,
        agentId: position.agentId,
        symbol: position.symbol,
        side: position.side,
        lotSize: position.lotSize,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        profit: position.profit,
        status: position.status
      };

      await redisService.set(key, JSON.stringify(data), this.POSITION_CACHE_TTL);

    } catch (error) {
      console.error('Error caching position:', error);
    }
  }

  /**
   * Remove cached position
   */
  private async removeCachedPosition(ticket: number): Promise<void> {
    try {
      const key = `${this.POSITION_CACHE_PREFIX}${ticket}`;
      await redisService.del(key);
    } catch (error) {
      console.error('Error removing cached position:', error);
    }
  }

  /**
   * Get all open positions
   */
  async getOpenPositions(userId?: string, agentId?: string): Promise<any[]> {
    try {
      const filter: any = { status: 'open' };

      if (userId) filter.userId = userId;
      if (agentId) filter.agentId = agentId;

      return await MT4Position.find(filter).populate('agentId userId');

    } catch (error) {
      console.error('Error getting open positions:', error);
      return [];
    }
  }

  /**
   * Get position statistics
   */
  async getPositionStats(userId?: string): Promise<any> {
    try {
      const filter: any = {};
      if (userId) filter.userId = userId;

      const [totalPositions, openPositions, closedPositions, autoClosedPositions] = await Promise.all([
        MT4Position.countDocuments(filter),
        MT4Position.countDocuments({ ...filter, status: 'open' }),
        MT4Position.countDocuments({ ...filter, status: 'closed' }),
        MT4Position.countDocuments({ ...filter, status: 'auto-closed' })
      ]);

      // Calculate P&L
      const positions = await MT4Position.find({ ...filter, status: { $ne: 'open' } });
      const totalProfit = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
      const winningTrades = positions.filter(p => (p.profit || 0) > 0).length;
      const losingTrades = positions.filter(p => (p.profit || 0) < 0).length;
      const winRate = totalPositions > 0 ? (winningTrades / (winningTrades + losingTrades)) * 100 : 0;

      return {
        totalPositions,
        openPositions,
        closedPositions,
        autoClosedPositions,
        totalProfit: totalProfit.toFixed(2),
        winningTrades,
        losingTrades,
        winRate: winRate.toFixed(2),
        isRunning: this.isRunning
      };

    } catch (error) {
      console.error('Error getting position stats:', error);
      return null;
    }
  }

  /**
   * Manual close position (for admin/user action)
   */
  async manualClosePosition(ticket: number, userId: string): Promise<void> {
    await this.closePosition(ticket, userId, 'manual', 'Manually closed by user');
  }

  /**
   * Synchronize database positions with actual MT4 positions
   * This ensures that if positions were closed in MT4 while the service was down,
   * the database gets updated accordingly
   */
  async syncPositionsWithMT4(): Promise<void> {
    try {
      console.log('🔄 Syncing database positions with MT4...');

      // Get all "open" positions from database grouped by userId
      const dbOpenPositions = await MT4Position.find({ status: 'open' }).populate('userId');

      if (dbOpenPositions.length === 0) {
        console.log('✅ No open positions in database to sync');
        return;
      }

      // Group positions by userId
      const positionsByUser = new Map<string, typeof dbOpenPositions>();
      for (const pos of dbOpenPositions) {
        const userId = (pos.userId as any)?._id?.toString() || pos.userId?.toString();
        if (!userId) continue;

        if (!positionsByUser.has(userId)) {
          positionsByUser.set(userId, []);
        }
        positionsByUser.get(userId)!.push(pos);
      }

      let syncedCount = 0;

      // For each user, check their positions against MT4
      for (const [userId, positions] of positionsByUser) {
        try {
          // Get all actual open positions from MT4 bridge for this user
          const mt4OpenPositions = await mt4Service.getOpenPositions(userId);
          const mt4Tickets = new Set(mt4OpenPositions.map((p: any) => p.ticket));

          // Check each DB position
          for (const dbPos of positions) {
            if (!mt4Tickets.has(dbPos.ticket)) {
              // Position closed in MT4 but still "open" in DB - mark as closed
              dbPos.status = 'closed';
              dbPos.closedAt = new Date();
              dbPos.closeReason = 'mt4-already-closed';
              await dbPos.save();

              // Also update the corresponding Trade record
              await Trade.updateOne(
                { mt4Ticket: dbPos.ticket, status: { $in: ['pending', 'filled'] } },
                { $set: { status: 'closed', closedAt: new Date(), closeReason: 'mt4-already-closed' } }
              );

              console.log(`🔄 Synced position ${dbPos.ticket}: marked as closed (was closed in MT4)`);
              syncedCount++;
            }
          }
        } catch (error) {
          console.error(`Error syncing positions for user ${userId}:`, error);
        }
      }

      if (syncedCount > 0) {
        console.log(`✅ Synced ${syncedCount} stale positions with MT4`);
      } else {
        console.log('✅ All database positions are in sync with MT4');
      }
    } catch (error) {
      console.error('Error syncing positions with MT4:', error);
    }
  }

  /**
   * Remove position from tracking (when closed externally)
   */
  async removePosition(ticket: number, userId: string): Promise<void> {
    try {
      const position = await MT4Position.findOne({ ticket, userId });

      if (position) {
        position.status = 'closed';
        position.closedAt = new Date();
        position.closeReason = 'manual';
        await position.save();

        // Remove from cache
        await this.removeCachedPosition(ticket);

        console.log(`🗑️  Removed position ${ticket} from tracking`);
      }
    } catch (error) {
      console.error(`Error removing position ${ticket}:`, error);
    }
  }
}

export const mt4TradeManager = new MT4TradeManager();
