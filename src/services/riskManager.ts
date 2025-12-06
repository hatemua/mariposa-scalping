/**
 * Centralized Risk Manager Service
 *
 * Singleton with mutex locks for thread-safe state management.
 * Handles all risk checks: position limits, cooldowns, daily limits, consensus validation.
 */

import { Mutex } from 'async-mutex';
import MT4Position from '../models/MT4Position';
import DailyTradingStats, { IDailyTradingStats } from '../models/DailyTradingStats';
import { mt4Service } from './mt4Service';

// =============================================================================
// CONFIGURATION
// =============================================================================

export const RISK_CONFIG = {
  // Position Limits
  MAX_BUY_POSITIONS: 1,
  MAX_SELL_POSITIONS: 1,
  MAX_TOTAL_POSITIONS: 2,

  // Cooldowns (minutes)
  MIN_MINUTES_BETWEEN_TRADES: 15,
  COOLDOWN_AFTER_LOSS: 30,
  COOLDOWN_AFTER_CONSECUTIVE_LOSSES: 60,

  // Daily Limits
  MAX_DAILY_LOSS_USD: 100,
  MAX_DAILY_TRADES: 40,
  MAX_CONSECUTIVE_LOSSES: 3,

  // Position Sizing
  MAX_RISK_PER_TRADE_USD: 15,
  MIN_LOT_SIZE: 0.01,
  MAX_LOT_SIZE: 0.20,
  POINT_VALUE_PER_LOT: 1, // USD value per point per lot (for BTC)

  // Exit Management (points) - Legacy, kept for backward compatibility
  EARLY_EXIT_LOSS_POINTS: 80,
  BREAKEVEN_PROFIT_POINTS: 40,
  TRAILING_START_POINTS: 50,
  TRAILING_DISTANCE_POINTS: 30,
  MAX_POSITION_MINUTES: 45,

  // NEW: Trailing Stop (Percentage-based - Priority 1)
  TRAILING_BREAKEVEN_PCT: 0.50,      // Move to breakeven at 50% of TP distance
  TRAILING_LOCK_PCT: 0.75,           // Lock profits at 75% of TP distance
  TRAILING_LOCK_AMOUNT: 0.50,        // Lock 50% of current gains at 75%
  TRAILING_CONTINUOUS_DISTANCE: 0.25, // Continue trailing with 25% of original risk as buffer

  // NEW: 1:1 R:R Lock (Priority 3)
  ONE_TO_ONE_LOCK_PROFIT_PCT: 0.50,  // Lock 50% of profit when 1:1 R:R achieved

  // NEW: Dynamic TP (Priority 2)
  ATR_TP_CAP_MULTIPLIER: 2.0,        // Cap TP at 2x ATR from entry
  RR_LOW_VOLATILITY: 1.5,            // R:R ratio for ATR < 0.3% of price
  RR_NORMAL_VOLATILITY: 2.0,         // R:R ratio for ATR 0.3-0.6% of price
  RR_HIGH_VOLATILITY: 2.5,           // R:R ratio for ATR > 0.6% of price

  // NEW: Time-Based Exit (Priority 4)
  TIME_EXIT_SLOW_MINUTES: 15,        // Check progress at 15 min
  TIME_EXIT_SLOW_PROGRESS: 0.25,     // Require 25% progress by 15 min
  TIME_EXIT_MAX_MINUTES: 30,         // Hard cap at 30 min for scalping

  // NEW: HTF Handling (Priority 5)
  HTF_COUNTER_TREND_MIN_CONFIDENCE: 70, // Min confidence for counter-trend trades
  HTF_COUNTER_TREND_SIZE: 0.25,         // 25% position size for counter-trend
  HTF_NEUTRAL_SIZE: 0.50,               // 50% position size for neutral HTF

  // Consensus
  MIN_CONFIDENCE_FOR_WEAK_CONSENSUS: 60, // 2-0-2 pattern requires 60%+ confidence (lowered from 70%)
};

// =============================================================================
// TYPES
// =============================================================================

export interface RiskCheckResult {
  allowed: boolean;
  reason: string;
}

export interface ConsensusDecision {
  shouldTrade: boolean;
  direction: 'BUY' | 'SELL' | 'HOLD';
  positionSizeMultiplier: number;
  pattern: string;
  reason: string;
}

export interface PositionCountSummary {
  buy: number;
  sell: number;
  total: number;
}

export interface DailyStatsSnapshot {
  date: string;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  totalPnL: number;
  consecutiveLosses: number;
  isPaused: boolean;
  pauseReason: string | null;
  pauseUntil: Date | null;
  winRate: number;
}

// =============================================================================
// RISK MANAGER CLASS
// =============================================================================

class RiskManager {
  private static instance: RiskManager;

  // Mutex locks for thread-safe operations
  private positionMutex = new Mutex();
  private cooldownMutex = new Mutex();
  private dailyStatsMutex = new Mutex();

  // In-memory cache for fast access (synced with DB)
  private lastTradeTime: number | null = null;
  private lastTradeResult: 'WIN' | 'LOSS' | null = null;
  private currentDateKey: string = '';

  private constructor() {
    this.currentDateKey = this.getTodayDateKey();
    console.log('🛡️ RiskManager initialized');
  }

  static getInstance(): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager();
    }
    return RiskManager.instance;
  }

  // =============================================================================
  // DATE UTILITIES
  // =============================================================================

  private getTodayDateKey(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC
  }

  private checkDateRollover(): boolean {
    const today = this.getTodayDateKey();
    if (today !== this.currentDateKey) {
      console.log(`📅 Date rollover detected: ${this.currentDateKey} -> ${today}`);
      this.currentDateKey = today;
      // Reset in-memory cache on date change
      this.lastTradeTime = null;
      this.lastTradeResult = null;
      return true;
    }
    return false;
  }

  // =============================================================================
  // POSITION LIMIT CHECKS (with mutex lock)
  // =============================================================================

  async canOpenPosition(direction: 'BUY' | 'SELL', userId: string): Promise<RiskCheckResult> {
    // Acquire mutex to prevent race conditions
    const release = await this.positionMutex.acquire();

    try {
      // CRITICAL FIX: Query LIVE MT4 positions, NOT stale MongoDB data
      // MongoDB sync runs every 5 minutes, which causes position counts to be wrong
      const mt4Positions = await mt4Service.getOpenPositions(userId);

      const buyCount = mt4Positions.filter(p => p.type?.toLowerCase() === 'buy').length;
      const sellCount = mt4Positions.filter(p => p.type?.toLowerCase() === 'sell').length;
      const totalCount = mt4Positions.length;

      console.log(`📊 Position check (LIVE MT4): BUY=${buyCount}/${RISK_CONFIG.MAX_BUY_POSITIONS}, SELL=${sellCount}/${RISK_CONFIG.MAX_SELL_POSITIONS}, Total=${totalCount}/${RISK_CONFIG.MAX_TOTAL_POSITIONS}`);

      // Check same direction limit
      if (direction === 'BUY' && buyCount >= RISK_CONFIG.MAX_BUY_POSITIONS) {
        return {
          allowed: false,
          reason: `Max BUY positions reached (${buyCount}/${RISK_CONFIG.MAX_BUY_POSITIONS})`,
        };
      }

      if (direction === 'SELL' && sellCount >= RISK_CONFIG.MAX_SELL_POSITIONS) {
        return {
          allowed: false,
          reason: `Max SELL positions reached (${sellCount}/${RISK_CONFIG.MAX_SELL_POSITIONS})`,
        };
      }

      // Check total position limit
      if (totalCount >= RISK_CONFIG.MAX_TOTAL_POSITIONS) {
        return {
          allowed: false,
          reason: `Max total positions reached (${totalCount}/${RISK_CONFIG.MAX_TOTAL_POSITIONS})`,
        };
      }

      return { allowed: true, reason: 'Position limits OK' };
    } finally {
      release();
    }
  }

  async getPositionCountSummary(userId: string): Promise<PositionCountSummary> {
    // Query LIVE MT4 positions for accurate counts
    const mt4Positions = await mt4Service.getOpenPositions(userId);

    return {
      buy: mt4Positions.filter(p => p.type?.toLowerCase() === 'buy').length,
      sell: mt4Positions.filter(p => p.type?.toLowerCase() === 'sell').length,
      total: mt4Positions.length,
    };
  }

  // =============================================================================
  // COOLDOWN CHECKS (atomic check + state update)
  // =============================================================================

  async checkAndStartCooldown(): Promise<RiskCheckResult> {
    const release = await this.cooldownMutex.acquire();

    try {
      // Check for date rollover (resets at midnight UTC)
      this.checkDateRollover();

      // Get current daily stats
      const stats = await DailyTradingStats.getTodayStats();

      // Check if paused due to consecutive losses
      if (stats.isPaused && stats.pauseUntil) {
        const now = Date.now();
        const pauseUntilTime = new Date(stats.pauseUntil).getTime();

        if (now < pauseUntilTime) {
          const remainingMinutes = Math.ceil((pauseUntilTime - now) / 60000);
          return {
            allowed: false,
            reason: `Trading paused: ${stats.pauseReason} (${remainingMinutes} min remaining)`,
          };
        } else {
          // Pause period ended - reset consecutive losses and unpause
          stats.isPaused = false;
          stats.pauseReason = null;
          stats.pauseUntil = null;
          stats.consecutiveLosses = 0; // Reset counter after pause
          await stats.save();
          console.log('✅ Pause period ended, consecutive losses reset to 0');
        }
      }

      // Check cooldown from last trade
      const lastTime = stats.lastTradeTime ? new Date(stats.lastTradeTime).getTime() : null;

      if (lastTime) {
        const now = Date.now();
        const minutesSinceLastTrade = (now - lastTime) / 60000;

        // Determine required cooldown based on last trade result
        const requiredCooldown = stats.lastTradeResult === 'LOSS'
          ? RISK_CONFIG.COOLDOWN_AFTER_LOSS
          : RISK_CONFIG.MIN_MINUTES_BETWEEN_TRADES;

        if (minutesSinceLastTrade < requiredCooldown) {
          const remaining = Math.ceil(requiredCooldown - minutesSinceLastTrade);
          const cooldownType = stats.lastTradeResult === 'LOSS' ? 'post-loss' : 'standard';
          return {
            allowed: false,
            reason: `Cooldown active (${cooldownType}): ${remaining} min remaining`,
          };
        }
      }

      // Update last trade time atomically (prevents race condition)
      stats.lastTradeTime = new Date();
      await stats.save();

      // Also update in-memory cache
      this.lastTradeTime = Date.now();

      return { allowed: true, reason: 'Cooldown OK' };
    } finally {
      release();
    }
  }

  // =============================================================================
  // DAILY LIMITS CHECK
  // =============================================================================

  async checkDailyLimits(): Promise<RiskCheckResult> {
    const release = await this.dailyStatsMutex.acquire();

    try {
      // Check for date rollover
      this.checkDateRollover();

      const stats = await DailyTradingStats.getTodayStats();

      // Check daily loss limit
      if (stats.totalPnL <= -RISK_CONFIG.MAX_DAILY_LOSS_USD) {
        return {
          allowed: false,
          reason: `Daily loss limit reached: $${Math.abs(stats.totalPnL).toFixed(2)} >= $${RISK_CONFIG.MAX_DAILY_LOSS_USD}`,
        };
      }

      // Check daily trade limit
      if (stats.totalTrades >= RISK_CONFIG.MAX_DAILY_TRADES) {
        return {
          allowed: false,
          reason: `Daily trade limit reached: ${stats.totalTrades}/${RISK_CONFIG.MAX_DAILY_TRADES}`,
        };
      }

      return { allowed: true, reason: 'Daily limits OK' };
    } finally {
      release();
    }
  }

  // =============================================================================
  // TRADE RESULT RECORDING
  // =============================================================================

  async recordTradeOpened(): Promise<void> {
    const release = await this.dailyStatsMutex.acquire();

    try {
      const stats = await DailyTradingStats.getTodayStats();
      stats.totalTrades += 1;
      stats.lastTradeTime = new Date();
      await stats.save();

      this.lastTradeTime = Date.now();
      console.log(`📊 Trade opened - Daily count: ${stats.totalTrades}/${RISK_CONFIG.MAX_DAILY_TRADES}`);
    } finally {
      release();
    }
  }

  async recordTradeResult(pnl: number, isOpeningTrade: boolean = false): Promise<void> {
    const release = await this.dailyStatsMutex.acquire();

    try {
      const stats = await DailyTradingStats.getTodayStats();

      if (isOpeningTrade) {
        // Just recording that a trade opened
        stats.lastTradeTime = new Date();
        this.lastTradeTime = Date.now();
      } else {
        // Trade closed - record result
        const isWin = pnl >= 0;

        stats.totalPnL += pnl;

        if (isWin) {
          stats.winCount += 1;
          stats.consecutiveLosses = 0; // Reset on win
          stats.lastTradeResult = 'WIN';
          this.lastTradeResult = 'WIN';
        } else {
          stats.lossCount += 1;
          stats.consecutiveLosses += 1;
          stats.lastTradeResult = 'LOSS';
          this.lastTradeResult = 'LOSS';

          // Track max consecutive losses
          if (stats.consecutiveLosses > stats.maxConsecutiveLosses) {
            stats.maxConsecutiveLosses = stats.consecutiveLosses;
          }

          // Check if we need to pause for consecutive losses
          if (stats.consecutiveLosses >= RISK_CONFIG.MAX_CONSECUTIVE_LOSSES && !stats.isPaused) {
            stats.isPaused = true;
            stats.pauseReason = `${stats.consecutiveLosses} consecutive losses`;
            stats.pauseUntil = new Date(Date.now() + RISK_CONFIG.COOLDOWN_AFTER_CONSECUTIVE_LOSSES * 60000);
            console.log(`🛑 TRADING PAUSED: ${stats.consecutiveLosses} consecutive losses - resuming at ${stats.pauseUntil.toISOString()}`);
          }
        }

        stats.lastTradeTime = new Date();
        this.lastTradeTime = Date.now();
      }

      await stats.save();

      // Log daily stats
      const winRate = stats.totalTrades > 0
        ? ((stats.winCount / (stats.winCount + stats.lossCount)) * 100).toFixed(1)
        : '0.0';
      console.log(`📊 Daily Stats: ${stats.winCount}W/${stats.lossCount}L (${winRate}%) | P&L: $${stats.totalPnL.toFixed(2)} | Trades: ${stats.totalTrades}/${RISK_CONFIG.MAX_DAILY_TRADES} | Consec Losses: ${stats.consecutiveLosses}`);
    } finally {
      release();
    }
  }

  // =============================================================================
  // CONSENSUS EVALUATION (Decision Table)
  // =============================================================================

  evaluateConsensus(buyVotes: number, sellVotes: number, holdVotes: number, confidence: number = 0): ConsensusDecision {
    const pattern = `${buyVotes}-${sellVotes}-${holdVotes}`;

    // Log vote distribution
    console.log(`🗳️ Votes: BUY=${buyVotes}, SELL=${sellVotes}, HOLD=${holdVotes} (Pattern: ${pattern})`);

    // ===========================================
    // NO TRADE patterns (explicit rejections)
    // ===========================================

    // Too many HOLD votes - market uncertain
    if (holdVotes >= 3) {
      return {
        shouldTrade: false,
        direction: 'HOLD',
        positionSizeMultiplier: 0,
        pattern,
        reason: `Too many HOLD votes (${holdVotes}/4) - market uncertain`,
      };
    }

    // 2-2-0: Tie between BUY and SELL
    if (buyVotes === 2 && sellVotes === 2) {
      return {
        shouldTrade: false,
        direction: 'HOLD',
        positionSizeMultiplier: 0,
        pattern,
        reason: 'Conflict: 2-2-0 tie - equal opposition',
      };
    }

    // 2-1-1: Conflict pattern (opposition + uncertainty)
    if (buyVotes === 2 && sellVotes === 1 && holdVotes === 1) {
      return {
        shouldTrade: false,
        direction: 'HOLD',
        positionSizeMultiplier: 0,
        pattern,
        reason: 'Conflict: 2-1-1 pattern - opposition + uncertainty',
      };
    }

    // 1-2-1: Conflict pattern (opposition + uncertainty)
    if (buyVotes === 1 && sellVotes === 2 && holdVotes === 1) {
      return {
        shouldTrade: false,
        direction: 'HOLD',
        positionSizeMultiplier: 0,
        pattern,
        reason: 'Conflict: 1-2-1 pattern - opposition + uncertainty',
      };
    }

    // 1-1-x: Split votes - no clear direction
    if (buyVotes === 1 && sellVotes === 1) {
      return {
        shouldTrade: false,
        direction: 'HOLD',
        positionSizeMultiplier: 0,
        pattern,
        reason: 'Split: 1-1-x pattern - no consensus',
      };
    }

    // Only 1 vote for any direction - insufficient
    if (Math.max(buyVotes, sellVotes) === 1) {
      return {
        shouldTrade: false,
        direction: 'HOLD',
        positionSizeMultiplier: 0,
        pattern,
        reason: 'Insufficient: only 1 directional vote',
      };
    }

    // ===========================================
    // TRADE patterns with size multipliers
    // ===========================================

    // 4-0-0: Unanimous BUY
    if (buyVotes === 4) {
      return {
        shouldTrade: true,
        direction: 'BUY',
        positionSizeMultiplier: 1.0,
        pattern,
        reason: 'Unanimous BUY (4-0-0) - full confidence',
      };
    }

    // 0-4-0: Unanimous SELL
    if (sellVotes === 4) {
      return {
        shouldTrade: true,
        direction: 'SELL',
        positionSizeMultiplier: 1.0,
        pattern,
        reason: 'Unanimous SELL (0-4-0) - full confidence',
      };
    }

    // 3-0-1: Strong BUY (3 BUY, 0 SELL, 1 HOLD)
    if (buyVotes === 3 && sellVotes === 0) {
      return {
        shouldTrade: true,
        direction: 'BUY',
        positionSizeMultiplier: 1.0,
        pattern,
        reason: 'Strong BUY (3-0-1) - clear direction',
      };
    }

    // 0-3-1: Strong SELL (0 BUY, 3 SELL, 1 HOLD)
    if (sellVotes === 3 && buyVotes === 0) {
      return {
        shouldTrade: true,
        direction: 'SELL',
        positionSizeMultiplier: 1.0,
        pattern,
        reason: 'Strong SELL (0-3-1) - clear direction',
      };
    }

    // 3-1-0: Moderate BUY (3 BUY, 1 SELL, 0 HOLD)
    if (buyVotes === 3 && sellVotes === 1) {
      return {
        shouldTrade: true,
        direction: 'BUY',
        positionSizeMultiplier: 0.75,
        pattern,
        reason: 'Moderate BUY (3-1-0) - minor opposition, 75% size',
      };
    }

    // 1-3-0: Moderate SELL (1 BUY, 3 SELL, 0 HOLD)
    if (sellVotes === 3 && buyVotes === 1) {
      return {
        shouldTrade: true,
        direction: 'SELL',
        positionSizeMultiplier: 0.75,
        pattern,
        reason: 'Moderate SELL (1-3-0) - minor opposition, 75% size',
      };
    }

    // 2-0-2: Cautious BUY (2 BUY, 0 SELL, 2 HOLD) - requires 70%+ confidence
    if (buyVotes === 2 && sellVotes === 0 && holdVotes === 2) {
      if (confidence >= RISK_CONFIG.MIN_CONFIDENCE_FOR_WEAK_CONSENSUS) {
        return {
          shouldTrade: true,
          direction: 'BUY',
          positionSizeMultiplier: 0.50,
          pattern,
          reason: `Cautious BUY (2-0-2) - weak signal, 50% size (conf: ${confidence.toFixed(0)}%)`,
        };
      } else {
        return {
          shouldTrade: false,
          direction: 'HOLD',
          positionSizeMultiplier: 0,
          pattern,
          reason: `Weak BUY (2-0-2) rejected - confidence ${confidence.toFixed(0)}% < ${RISK_CONFIG.MIN_CONFIDENCE_FOR_WEAK_CONSENSUS}% required`,
        };
      }
    }

    // 0-2-2: Cautious SELL (0 BUY, 2 SELL, 2 HOLD) - requires 70%+ confidence
    if (sellVotes === 2 && buyVotes === 0 && holdVotes === 2) {
      if (confidence >= RISK_CONFIG.MIN_CONFIDENCE_FOR_WEAK_CONSENSUS) {
        return {
          shouldTrade: true,
          direction: 'SELL',
          positionSizeMultiplier: 0.50,
          pattern,
          reason: `Cautious SELL (0-2-2) - weak signal, 50% size (conf: ${confidence.toFixed(0)}%)`,
        };
      } else {
        return {
          shouldTrade: false,
          direction: 'HOLD',
          positionSizeMultiplier: 0,
          pattern,
          reason: `Weak SELL (0-2-2) rejected - confidence ${confidence.toFixed(0)}% < ${RISK_CONFIG.MIN_CONFIDENCE_FOR_WEAK_CONSENSUS}% required`,
        };
      }
    }

    // Default: No clear consensus
    return {
      shouldTrade: false,
      direction: 'HOLD',
      positionSizeMultiplier: 0,
      pattern,
      reason: `No clear consensus (${pattern})`,
    };
  }

  // =============================================================================
  // POSITION SIZE CALCULATION (Risk-based)
  // =============================================================================

  calculateLotSize(
    entryPrice: number,
    stopLossPrice: number,
    consensusMultiplier: number = 1.0
  ): number {
    // Calculate stop loss distance in points
    const slDistancePoints = Math.abs(entryPrice - stopLossPrice);

    if (slDistancePoints <= 0) {
      console.warn('⚠️ Invalid SL distance, using minimum lot size');
      return RISK_CONFIG.MIN_LOT_SIZE;
    }

    // Risk per trade in USD
    const maxRisk = RISK_CONFIG.MAX_RISK_PER_TRADE_USD * consensusMultiplier;

    // Calculate lot size: risk / (sl_distance * point_value)
    // For BTC: 1 lot = 1 BTC, point value = $1 per point per lot
    let lotSize = maxRisk / (slDistancePoints * RISK_CONFIG.POINT_VALUE_PER_LOT);

    // Apply consensus multiplier
    lotSize *= consensusMultiplier;

    // Clamp to min/max
    lotSize = Math.max(RISK_CONFIG.MIN_LOT_SIZE, Math.min(RISK_CONFIG.MAX_LOT_SIZE, lotSize));

    // Round to 2 decimal places
    lotSize = Math.round(lotSize * 100) / 100;

    console.log(`💰 Lot size calculation: Risk=$${maxRisk.toFixed(2)}, SL=${slDistancePoints.toFixed(0)}pts, Multiplier=${consensusMultiplier}, Result=${lotSize} lots`);

    return lotSize;
  }

  // =============================================================================
  // DAILY STATS SNAPSHOT
  // =============================================================================

  async getDailyStatsSnapshot(): Promise<DailyStatsSnapshot> {
    const stats = await DailyTradingStats.getTodayStats();
    const totalClosedTrades = stats.winCount + stats.lossCount;

    return {
      date: stats.date,
      totalTrades: stats.totalTrades,
      winCount: stats.winCount,
      lossCount: stats.lossCount,
      totalPnL: stats.totalPnL,
      consecutiveLosses: stats.consecutiveLosses,
      isPaused: stats.isPaused,
      pauseReason: stats.pauseReason,
      pauseUntil: stats.pauseUntil,
      winRate: totalClosedTrades > 0 ? (stats.winCount / totalClosedTrades) * 100 : 0,
    };
  }

  // =============================================================================
  // COMBINED PRE-TRADE VALIDATION
  // =============================================================================

  async validatePreTrade(direction: 'BUY' | 'SELL', userId: string): Promise<RiskCheckResult> {
    // Check 1: Position limits (uses live MT4 query)
    const positionCheck = await this.canOpenPosition(direction, userId);
    if (!positionCheck.allowed) {
      return positionCheck;
    }

    // Check 2: Cooldown
    const cooldownCheck = await this.checkAndStartCooldown();
    if (!cooldownCheck.allowed) {
      return cooldownCheck;
    }

    // Check 3: Daily limits
    const dailyCheck = await this.checkDailyLimits();
    if (!dailyCheck.allowed) {
      return dailyCheck;
    }

    return { allowed: true, reason: 'All pre-trade checks passed' };
  }

  // =============================================================================
  // GETTERS FOR CONFIG
  // =============================================================================

  getConfig(): typeof RISK_CONFIG {
    return { ...RISK_CONFIG };
  }
}

// Export singleton instance
export const riskManager = RiskManager.getInstance();
export default riskManager;
