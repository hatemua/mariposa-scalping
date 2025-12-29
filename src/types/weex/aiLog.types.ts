/**
 * WEEX AI Log Types
 *
 * Types for the WEEX AI logging API endpoint: POST /capi/v2/order/uploadAiLog
 * Used to track AI-powered trading decisions for compliance and verification.
 */

// ============================================================================
// AI LOG STAGES
// ============================================================================

export type AiLogStage =
  | 'Strategy Generation'   // LLM pattern analysis, setup creation
  | 'Decision Making'       // HTF direction, exhaustion checks
  | 'Order Execution'       // When order is placed
  | 'Order Close'          // When order is closed
  | 'Risk Analysis'        // Risk manager decisions
  | 'Exit Analysis';       // Exit signal evaluation

// ============================================================================
// AI LOG REQUEST/RESPONSE
// ============================================================================

export interface AiLogRequest {
  orderId?: string;                    // Optional: WEEX order ID (string to preserve precision for large IDs)
  stage: AiLogStage;                   // Trading stage where AI participated
  model: string;                       // AI model name/version
  input: Record<string, any>;          // Input data given to AI
  output: Record<string, any>;         // AI model's output/predictions
  explanation: string;                 // Summary of AI's reasoning (max 1000 chars)
}

export interface AiLogResponse {
  code: string;                        // "00000" = success
  msg: string;                         // "success" or error message
  requestTime: number;                 // Request timestamp (ms)
  data: string;                        // "upload success" on success
}

// ============================================================================
// CONVENIENCE TYPES FOR DIFFERENT LOG SCENARIOS
// ============================================================================

export interface OrderExecutionLogData {
  orderId: string;
  setup: {
    direction: 'BUY' | 'SELL';
    grade: 'A' | 'B' | 'C';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio?: number;
  };
  marketData: {
    currentPrice: number;
    htfTrend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    exhaustion?: boolean;
    fibonacciLevel?: number;
  };
  execution: {
    action: 'OPEN_LONG' | 'OPEN_SHORT';
    positionSizeBTC: number;
    positionSizeUSD: number;
    leverage: number;
  };
}

export interface OrderCloseLogData {
  orderId: string;
  closeReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'BREAKEVEN_STOP' |
               'TIME_EXIT' | 'MANUAL' | 'ERROR' | 'API_CLOSE';
  entryPrice: number;
  exitPrice: number;
  pnlUSD: number;
  pnlPercent: number;
  durationMinutes: number;
  direction: 'BUY' | 'SELL';
}

export interface PatternAnalysisLogData {
  symbol: string;
  timeframe: string;
  patternType: 'FIBONACCI' | 'TREND_MOMENTUM' | 'VOLUME_PRICE' | 'SUPPORT_RESISTANCE';
  prompt: string;
  marketData: Record<string, any>;
  result: {
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    patterns?: string[];
    levels?: number[];
  };
}

export interface HTFAnalysisLogData {
  trend4H: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend1H: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  decision: 'BUY' | 'SELL' | 'BOTH' | 'WAIT';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  currentPrice: number;
  priceChange4H?: number;
  priceChange1H?: number;
}

export interface ExhaustionCheckLogData {
  direction: 'BUY' | 'SELL';
  currentPrice: number;
  highestHigh4H: number;
  lowestLow4H: number;
  positionInRange: number;
  movePercent: number;
  isExhausted: boolean;
  recommendation: 'ENTER' | 'WAIT' | 'WAIT_FOR_PULLBACK';
}

// ============================================================================
// MODEL IDENTIFIERS
// ============================================================================

export const AI_MODELS = {
  FIBONACCI: 'Meta-Llama-3.1-8B-Instruct-Turbo (Fibonacci)',
  TREND_MOMENTUM: 'Qwen/Qwen2.5-7B-Instruct-Turbo (Trend/Momentum)',
  VOLUME_PRICE: 'Meta-Llama-3.1-8B-Instruct-Turbo (Volume/Price)',
  SUPPORT_RESISTANCE: 'Qwen/Qwen2.5-7B-Instruct-Turbo (S/R)',
  V6_ARCHITECT: 'Meta-Llama-3.1-70B-Instruct-Turbo (V6 Setup Architect)',
  HTF_ANALYSIS: 'Internal HTF Structure Analysis',
  EXHAUSTION_CHECK: 'Internal Exhaustion Check',
  EXIT_ANALYSIS: 'Multi-Model Exit Consensus',
} as const;

export type AiModelId = keyof typeof AI_MODELS;
