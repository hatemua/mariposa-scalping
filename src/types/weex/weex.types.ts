/**
 * MARIPOSA WEEX V6 - Type Definitions
 * Types for WEEX trading integration with V6 Sniper architecture
 */

import { TradeSetup, SetupDirection, SetupGrade } from '../v6/setup.types';

// ============================================================================
// EXECUTION TYPES
// ============================================================================

/**
 * Result of executing a V6 setup on WEEX
 */
export interface WeexExecutionResult {
  success: boolean;
  orderId?: string;
  clientOrderId?: string;
  tpOrderId?: string;            // Take Profit order ID from exchange
  slOrderId?: string;            // Stop Loss order ID from exchange
  executionPrice?: number;
  positionSizeUSD?: number;
  positionSizeBTC?: number;
  leverage?: number;
  error?: string;
  timestamp: Date;
  retryCount?: number;
}

/**
 * Order result from WEEX API
 */
export interface WeexOrderResult {
  success: boolean;
  orderId?: number;
  clientOrderId?: string;
  tpOrderId?: number;          // Take Profit order ID (preset TP/SL)
  slOrderId?: number;          // Stop Loss order ID (preset TP/SL)
  status?: string;
  filledQty?: string;
  avgPrice?: number;
  error?: string;
}

// ============================================================================
// POSITION MONITORING TYPES
// ============================================================================

/**
 * Position being monitored by WeexPositionMonitor
 */
export interface WeexMonitoredPosition {
  // Identity
  id: string;                    // Unique monitor ID
  setupId: string;               // V6 setup ID that created this position
  orderId: string;               // WEEX order ID
  tpOrderId?: string;            // WEEX Take Profit order ID (for modification)
  slOrderId?: string;            // WEEX Stop Loss order ID (for modification)

  // Position details
  symbol: string;                // e.g., 'cmt_btcusdt'
  direction: SetupDirection;     // 'BUY' or 'SELL'
  grade: SetupGrade;             // Setup grade for position sizing

  // Price levels
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;

  // Size
  positionSizeBTC: number;
  positionSizeUSD: number;

  // P&L tracking
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  highestPnl: number;            // Track peak for trailing
  lowestPnl: number;             // Track trough

  // Timing
  openTime: Date;
  lastUpdateTime: Date;

  // Exit management state (simplified - no breakeven/trailing to reduce fees)
  currentStopLoss: number;       // Same as original SL (no modifications)

  // Status
  status: WeexPositionStatus;
}

export type WeexPositionStatus =
  | 'OPEN'                       // Position is active
  | 'CLOSING'                    // Close order sent
  | 'CLOSED'                     // Successfully closed
  | 'ERROR';                     // Error state

/**
 * Result of a position close operation
 */
export interface WeexCloseResult {
  success: boolean;
  positionId: string;
  closePrice?: number;
  realizedPnl?: number;
  realizedPnlPercent?: number;
  closeReason: WeexCloseReason;
  error?: string;
  timestamp: Date;
}

export type WeexCloseReason =
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'TRAILING_STOP'
  | 'BREAKEVEN_STOP'
  | 'TIME_EXIT'
  | 'MANUAL'
  | 'ERROR'
  | 'API_CLOSE'
  | 'PROFIT_PULLBACK';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * WEEX V6 Worker Configuration
 */
export interface WeexV6Config {
  // Trading pair
  SYMBOL: string;                         // 'cmt_btcusdt'
  BINANCE_SYMBOL: string;                 // 'BTCUSDT' (for market data)

  // Position sizing
  LEVERAGE: number;                       // e.g., 5
  BASE_POSITION_SIZE_USD: number;         // e.g., 500
  MIN_POSITION_SIZE_BTC: number;          // e.g., 0.08 - minimum BTC quantity

  // Grade multipliers
  GRADE_A_MULTIPLIER: number;             // 1.0
  GRADE_B_MULTIPLIER: number;             // 0.75
  GRADE_C_MULTIPLIER: number;             // 0.5

  // Position monitoring
  POSITION_MONITOR_INTERVAL_MS: number;   // e.g., 15000 (15 seconds)
  MAX_POSITION_DURATION_MINUTES: number;  // e.g., 60

  // Exit management
  BREAKEVEN_TRIGGER_PCT: number;          // e.g., 0.35 (35% of TP)
  TRAILING_TRIGGER_PCT: number;           // e.g., 0.50 (50% of TP)
  TRAILING_DISTANCE_PCT: number;          // e.g., 0.30 (trail 30% of range)
  PROFIT_PULLBACK_PCT: number;            // e.g., 0.50 (close if profit drops 50% from peak)
  MIN_PEAK_PROFIT_USD: number;            // e.g., 5 (only trigger if peak was >= $5)

  // Risk management
  MAX_CONCURRENT_POSITIONS: number;       // e.g., 2
  MAX_DAILY_LOSS_USD: number;             // e.g., 200
  COOLDOWN_AFTER_LOSS_MINUTES: number;    // e.g., 30

  // Profit prediction filter
  PROFIT_PREDICTION: {
    MIN_PROFIT_THRESHOLD_USD: number;     // Minimum expected profit to enter trade
    LEVERAGE: number;                     // User's actual leverage on WEEX
  };
}

// ============================================================================
// HEALTH & STATUS TYPES
// ============================================================================

/**
 * Health status for WEEX V6 Executor
 */
export interface WeexExecutorHealth {
  isHealthy: boolean;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  lastExecutionTime?: Date;
  lastError?: string;
  averageExecutionTimeMs: number;
}

/**
 * Health status for WEEX Position Monitor
 */
export interface WeexMonitorHealth {
  isRunning: boolean;
  openPositions: number;
  totalPositionsClosed: number;
  totalPnlUSD: number;           // CURRENT unrealized PnL from open positions
  sessionPnlUSD?: number;        // Cumulative realized PnL for the session (optional)
  lastCheckTime?: Date;
  checkIntervalMs: number;
  errors: string[];
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Events emitted by WEEX services
 */
export interface WeexTradeEvent {
  type: 'POSITION_OPENED' | 'POSITION_CLOSED' | 'BREAKEVEN_HIT' | 'TRAILING_ACTIVATED' | 'ERROR';
  positionId: string;
  setupId: string;
  symbol: string;
  direction: SetupDirection;
  price?: number;
  pnl?: number;
  reason?: string;
  timestamp: Date;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get position size multiplier for a grade
 */
export function getWeexPositionSizeMultiplier(
  grade: SetupGrade,
  config: WeexV6Config
): number {
  switch (grade) {
    case 'A': return config.GRADE_A_MULTIPLIER;
    case 'B': return config.GRADE_B_MULTIPLIER;
    case 'C': return config.GRADE_C_MULTIPLIER;
    default: return config.GRADE_C_MULTIPLIER;
  }
}

/**
 * Calculate position size in USD for a setup
 */
export function calculateWeexPositionSizeUSD(
  grade: SetupGrade,
  config: WeexV6Config
): number {
  return config.BASE_POSITION_SIZE_USD * getWeexPositionSizeMultiplier(grade, config);
}

/**
 * Create a unique position ID
 */
export function createWeexPositionId(setupId: string): string {
  return `weex_${setupId}_${Date.now()}`;
}
