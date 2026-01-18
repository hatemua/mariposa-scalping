/**
 * MARIPOSA V6 PRO - Setup Types
 * Core type definitions for the sniper scalping system
 */

import { V6_ENV_CONFIG } from '../../config/environment';

// ============================================================================
// BASIC TYPES
// ============================================================================

export type SetupDirection = 'BUY' | 'SELL';
export type SetupBias = 'WITH_TREND' | 'COUNTER_TREND';
export type SetupGrade = 'A' | 'B' | 'C';
export type SetupStatus =
  | 'WAITING'        // Waiting for price to approach
  | 'APPROACHING'    // Price within 0.5% of zone
  | 'IN_ZONE'        // Price inside entry zone
  | 'CONFIRMING'     // Checking for confirmation pattern
  | 'CONFIRMED'      // Pattern confirmed, awaiting execution
  | 'EXECUTED'       // Trade executed
  | 'FAILED'         // Execution failed (non-retryable error)
  | 'EXPIRED'        // Setup expired (6 hours)
  | 'CANCELLED'      // Manually cancelled or invalidated
  | 'MAX_ATTEMPTS';  // Max confirmation attempts reached

export type ConfirmationPatternType =
  | 'REJECTION_WICK'     // >50% wick in direction
  | 'PIN_BAR'            // Small body, long directional wick
  | 'BULLISH_ENGULFING'  // Current green engulfs previous red
  | 'BEARISH_ENGULFING'  // Current red engulfs previous green
  | 'HAMMER'             // Bullish reversal at support
  | 'SHOOTING_STAR'      // Bearish reversal at resistance
  | 'DOJI_REVERSAL';     // Doji at key level

export type SetupReasonSource =
  | 'FIB_382'
  | 'FIB_500'
  | 'FIB_618'
  | 'FIB_786'
  | 'FIB_EXTENSION'
  | 'ORDER_BLOCK'
  | 'DEMAND_ZONE'
  | 'SUPPLY_ZONE'
  | 'SUPPORT'
  | 'RESISTANCE'
  | 'LIQUIDITY_POOL'
  | 'EMA_CONFLUENCE'
  | 'TREND_LINE';

// ============================================================================
// PRICE ZONE
// ============================================================================

export interface PriceZone {
  low: number;
  high: number;
  midpoint: number;
}

// ============================================================================
// SETUP REASON (Why this setup was created)
// ============================================================================

export interface SetupReason {
  source: SetupReasonSource;
  level: number;          // The price level
  description: string;    // Human-readable description
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  weight: number;         // 1-10 importance score
}

// ============================================================================
// CONFIRMATION PATTERN
// ============================================================================

export interface ConfirmationPattern {
  type: ConfirmationPatternType;
  minWickPercent?: number;   // For REJECTION_WICK (default: 50)
  minBodyPercent?: number;   // For ENGULFING patterns
  description?: string;
}

// ============================================================================
// REQUIRED CONFIRMATION
// ============================================================================

export interface RequiredConfirmation {
  patterns: ConfirmationPattern[];       // Any of these patterns will confirm
  minStrength: 'ANY' | 'MODERATE' | 'STRONG';
  volumeRequired: boolean;
  volumeMultiplier?: number;             // e.g., 1.2 = 120% of average volume
}

// ============================================================================
// TRADE SETUP (Core interface)
// ============================================================================

export interface TradeSetup {
  // Identity
  id: string;
  symbol: string;                        // e.g., 'BTCUSDT'
  createdAt: Date;
  expiresAt: Date;                       // Default: 6 hours from creation

  // Trade parameters
  direction: SetupDirection;
  bias: SetupBias;
  entryZone: PriceZone;
  stopLoss: number;
  takeProfit1: number;                   // Primary target
  takeProfit2?: number;                  // Extended target (optional)
  riskRewardRatio: number;

  // Quality metrics
  grade: SetupGrade;
  confidence: number;                    // 0-100
  reasons: SetupReason[];                // Why this setup exists (confluences)

  // Entry confirmation
  requiredConfirmation: RequiredConfirmation;

  // Status tracking
  status: SetupStatus;
  confirmationAttempts: number;
  maxConfirmationAttempts: number;       // Default: 3
  wasEverInZone?: boolean;               // Track if setup ever reached IN_ZONE (for safe MISSED detection)

  // Execution tracking (populated after execution)
  executedAt?: Date;
  executionPrice?: number;
  executionSignalId?: string;
  mt4Ticket?: number;

  // Analysis metadata
  htfTrend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  marketContext: string;                 // Brief explanation from LLM
  analysisTimestamp: Date;               // When the analysis was done
}

// ============================================================================
// CONFIRMATION RESULT (from candle confirmation service)
// ============================================================================

export interface ConfirmationResult {
  confirmed: boolean;
  patternsFound: ConfirmationPatternType[];
  patternDetails: {
    type: ConfirmationPatternType;
    strength: 'WEAK' | 'MODERATE' | 'STRONG';
    metrics: Record<string, number>;     // e.g., { wickPercent: 62, bodyPercent: 15 }
  }[];
  volumeConfirmed: boolean;
  volumeRatio?: number;
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  reason: string;
  checkTimeMs: number;                   // Should be < 100ms
}

// ============================================================================
// EXECUTION RESULT
// ============================================================================

export interface SetupExecutionResult {
  setupId: string;
  success: boolean;
  signalId?: string;
  executionPrice?: number;
  mt4Ticket?: number;
  reason: string;
  timestamp: Date;
  positionSize?: number;                 // USD value
  lotSize?: number;                      // MT4 lot size
}

// ============================================================================
// QUEUE STATE (for Redis persistence)
// ============================================================================

export interface SetupQueueState {
  setups: TradeSetup[];
  todayTradeCount: number;
  todayDate: string;                     // YYYY-MM-DD format
  lastCleanupTime: number;               // Unix timestamp
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const V6_SETUP_CONFIG = {
  // Setup limits - use env overrides
  MAX_ACTIVE_SETUPS: 5,
  MAX_TRADES_PER_DAY: V6_ENV_CONFIG.MAX_TRADES_PER_DAY,
  DEFAULT_SETUP_EXPIRY_HOURS: V6_ENV_CONFIG.SETUP_EXPIRY_HOURS,
  MAX_CONFIRMATION_ATTEMPTS: 3,

  // SCALPING: Entry must be near current price
  MAX_ENTRY_DISTANCE_PCT: V6_ENV_CONFIG.MAX_ENTRY_DISTANCE_PCT,

  // Zone thresholds - WIDENED for better detection
  ZONE_FAR_THRESHOLD: V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.5 : 0.5,           // WIDENED from 0.3 - more forgiving
  ZONE_APPROACHING_PERCENT: V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.25 : 0.2,    // WIDENED from 0.15 - catch approach earlier
  ZONE_APPROACHING_THRESHOLD: V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.0025 : 0.002, // WIDENED from 0.0015
  ZONE_IN_ZONE_BUFFER: V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.05 : 0.05,        // WIDENED from 0.03 - more buffer

  // Position sizing by grade (multipliers)
  POSITION_SIZE_GRADE_A: 1.0,            // 100% of base
  POSITION_SIZE_GRADE_B: 0.75,           // 75% of base
  POSITION_SIZE_GRADE_C: 0.5,            // 50% of base
  BASE_POSITION_SIZE_USD: 800,

  // Risk management - use env overrides
  MIN_RISK_REWARD_RATIO: V6_ENV_CONFIG.MIN_RISK_REWARD,

  // SCALPING: Quick execution mode
  REQUIRE_PATTERN_CONFIRMATION: V6_ENV_CONFIG.REQUIRE_PATTERN_CONFIRM,
  MIN_TIME_IN_ZONE_MS: 10000, // 10 seconds min in zone

  // SCALPING: Risk parameters (percentages from env)
  SCALPING_STOP_LOSS_PCT: V6_ENV_CONFIG.STOP_LOSS_PCT,
  SCALPING_MAX_STOP_PCT: V6_ENV_CONFIG.MAX_STOP_LOSS_PCT,
  SCALPING_TP1_PCT: V6_ENV_CONFIG.TAKE_PROFIT_1_PCT,
  SCALPING_TP2_PCT: V6_ENV_CONFIG.TAKE_PROFIT_2_PCT,

  // Zone width limits from env
  MIN_ZONE_WIDTH_PERCENT: V6_ENV_CONFIG.MIN_ZONE_WIDTH_PCT,
  MAX_ZONE_WIDTH_PERCENT: V6_ENV_CONFIG.MAX_ZONE_WIDTH_PCT,

  // Duplicate prevention
  DUPLICATE_THRESHOLD_PCT: V6_ENV_CONFIG.DUPLICATE_THRESHOLD_PCT,

  // Redis keys
  REDIS_KEY_PREFIX: 'v6:setups',
  REDIS_QUEUE_KEY: 'v6:setup_queue',
  REDIS_DAILY_COUNTER_KEY: 'v6:daily_trades',

  // LLM settings
  SETUP_ARCHITECT_MODEL: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  SETUP_ARCHITECT_TEMPERATURE: 0.2,
  SETUP_ARCHITECT_MAX_TOKENS: 2000,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get position size multiplier for a grade
 */
export function getPositionSizeMultiplier(grade: SetupGrade): number {
  switch (grade) {
    case 'A': return V6_SETUP_CONFIG.POSITION_SIZE_GRADE_A;
    case 'B': return V6_SETUP_CONFIG.POSITION_SIZE_GRADE_B;
    case 'C': return V6_SETUP_CONFIG.POSITION_SIZE_GRADE_C;
    default: return V6_SETUP_CONFIG.POSITION_SIZE_GRADE_C;
  }
}

/**
 * Calculate position size in USD for a setup
 */
export function calculatePositionSizeUSD(grade: SetupGrade): number {
  return V6_SETUP_CONFIG.BASE_POSITION_SIZE_USD * getPositionSizeMultiplier(grade);
}

/**
 * Check if a setup is still valid (not expired)
 */
export function isSetupValid(setup: TradeSetup): boolean {
  const now = new Date();
  return (
    setup.status === 'WAITING' ||
    setup.status === 'APPROACHING' ||
    setup.status === 'IN_ZONE' ||
    setup.status === 'CONFIRMING'
  ) && now < setup.expiresAt;
}

/**
 * Create a default setup expiry date (6 hours from now)
 */
export function createExpiryDate(hoursFromNow: number = V6_SETUP_CONFIG.DEFAULT_SETUP_EXPIRY_HOURS): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}
