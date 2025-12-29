/**
 * MARIPOSA V6 PRO - Analysis Types
 * Type definitions for strategic analysis outputs
 */

import { V6_ENV_CONFIG } from '../../config/environment';
import { PriceZone, TradeSetup, SetupReason } from './setup.types';

// ============================================================================
// MARKET BIAS
// ============================================================================

export interface MarketBias {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number;                      // 0-100
  htf4H: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  htf1H: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  preferredDirection: 'BUY' | 'SELL' | 'BOTH';
  avoidDirection: 'BUY' | 'SELL' | 'NONE';
  reasoning: string;
}

// ============================================================================
// LEVEL WITH ZONE (Generic level output)
// ============================================================================

export interface LevelWithZone {
  price: number;
  zone: PriceZone;
  type: 'SUPPORT' | 'RESISTANCE';
  source: 'FIB' | 'SR' | 'ORDER_BLOCK' | 'LIQUIDITY' | 'EMA';
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  timeframe: '5m' | '15m' | '1h' | '4h' | '1d';
  tested: boolean;                       // Has price tested this level?
  touches?: number;                      // Number of times price touched
  description?: string;
}

// ============================================================================
// FIBONACCI LEVEL OUTPUT
// ============================================================================

export interface FibonacciLevelOutput {
  level: number;                         // 0.236, 0.382, 0.5, 0.618, 0.786, etc.
  levelName: string;                     // "38.2%", "61.8% Golden Pocket", etc.
  price: number;
  zone: PriceZone;                       // Zone around the level
  type: 'RETRACEMENT' | 'EXTENSION';
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  tested: boolean;
  confluenceWith?: string[];             // Other levels near this one
}

export interface FibonacciAnalysisOutput {
  swingHigh: number;
  swingLow: number;
  swingHighTime: number;                 // Unix timestamp
  swingLowTime: number;
  trendDirection: 'UP' | 'DOWN';
  levels: FibonacciLevelOutput[];
  goldenPocket: PriceZone | null;        // 61.8% - 78.6% zone
}

// ============================================================================
// ORDER BLOCK OUTPUT
// ============================================================================

export interface OrderBlockOutput {
  type: 'BULLISH' | 'BEARISH';           // Bullish OB = demand, Bearish OB = supply
  zone: PriceZone;
  strength: 'FRESH' | 'TESTED' | 'MITIGATED';
  timeframe: '15m' | '1h' | '4h';
  createdAt: number;                     // Unix timestamp
  description: string;
}

// ============================================================================
// SUPPLY/DEMAND ZONE OUTPUT
// ============================================================================

export interface SupplyDemandZone {
  type: 'SUPPLY' | 'DEMAND';
  zone: PriceZone;
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  timeframe: string;
  tested: boolean;
  testCount: number;
}

// ============================================================================
// LIQUIDITY ZONE OUTPUT
// ============================================================================

export interface LiquidityZoneOutput {
  type: 'BUY_STOPS' | 'SELL_STOPS';      // Where stop losses are likely clustered
  price: number;                          // The sweep target
  zone: PriceZone;
  estimatedVolume: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
}

// ============================================================================
// SUPPORT/RESISTANCE OUTPUT
// ============================================================================

export interface SupportResistanceOutput {
  levels: LevelWithZone[];
  orderBlocks: OrderBlockOutput[];
  supplyDemandZones: SupplyDemandZone[];
  nearestSupport: LevelWithZone | null;
  nearestResistance: LevelWithZone | null;
}

// ============================================================================
// STRATEGIC ANALYSIS INPUT (to Setup Architect)
// ============================================================================

export interface StrategicAnalysisInput {
  timestamp: Date;
  currentPrice: number;
  symbol: string;

  // Market context
  marketBias: MarketBias;

  // Detected levels from experts
  fibonacciAnalysis: FibonacciAnalysisOutput;
  supportResistance: SupportResistanceOutput;
  liquidityZones: LiquidityZoneOutput[];

  // Technical context
  atr: number;                           // Average True Range
  atrPercent: number;                    // ATR as % of price
  volatility: 'LOW' | 'NORMAL' | 'HIGH';

  // Recent price action
  recentHigh: number;                    // Last 24h high
  recentLow: number;                     // Last 24h low
  priceChange24h: number;                // % change

  // Existing setups (for duplicate prevention)
  existingSetups?: {
    direction: 'BUY' | 'SELL';
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    grade: string;
    ageMinutes: number;
  }[];
}

// ============================================================================
// STRATEGIC ANALYSIS RESULT
// ============================================================================

export interface StrategicAnalysisResult {
  timestamp: Date;
  currentPrice: number;
  symbol: string;

  // Market context
  marketBias: MarketBias;

  // Detected levels (raw)
  fibonacciLevels: FibonacciLevelOutput[];
  orderBlocks: OrderBlockOutput[];
  liquidityZones: LiquidityZoneOutput[];
  supportResistanceLevels: LevelWithZone[];

  // Generated setups (from Setup Architect)
  generatedSetups: TradeSetup[];
  setupsAddedToQueue: number;
  setupsRejected: number;
  rejectionReasons: string[];

  // Metadata
  analysisVersion: string;
  llmCallCount: number;
  analysisTimeMs: number;
  errors: string[];
}

// ============================================================================
// SETUP ARCHITECT OUTPUT
// ============================================================================

export interface SetupArchitectOutput {
  setups: SetupArchitectSetup[];
  marketSummary: string;
  warnings: string[];
}

export interface SetupArchitectSetup {
  direction: 'BUY' | 'SELL';
  bias: 'WITH_TREND' | 'COUNTER_TREND';
  entryZone: {
    low: number;
    high: number;
  };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2?: number;
  riskRewardRatio: number;
  grade: 'A' | 'B' | 'C';
  confidence: number;
  reasons: {
    source: string;
    level: number;
    description: string;
    strength: string;
  }[];
  requiredConfirmation: {
    patterns: string[];
    minStrength: string;
    volumeRequired: boolean;
  };
  marketContext: string;
}

// ============================================================================
// CANDLE DATA (for confirmation)
// ============================================================================

export interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

// ============================================================================
// ZONE DISTANCE RESULT
// ============================================================================

export interface ZoneDistanceResult {
  setupId: string;
  currentPrice: number;
  entryZone: PriceZone;
  distancePercent: number;               // Distance from zone midpoint
  distanceToNearestEdge: number;         // Distance to closest zone edge
  status: 'FAR' | 'APPROACHING' | 'IN_ZONE' | 'PASSED_THROUGH';
  direction: 'ABOVE' | 'BELOW' | 'INSIDE';
}

// ============================================================================
// ANALYSIS CYCLE STATE
// ============================================================================

export interface AnalysisCycleState {
  lastAnalysisTime: number;              // Unix timestamp
  lastAnalysisResult: StrategicAnalysisResult | null;
  cycleCount: number;
  totalSetupsCreated: number;
  totalSetupsExecuted: number;
  totalSetupsExpired: number;
  errors: string[];
}

// ============================================================================
// V6 ANALYSIS CONFIGURATION
// ============================================================================

export const V6_ANALYSIS_CONFIG = {
  // Timing - use env overrides
  ANALYSIS_INTERVAL_MINUTES: V6_ENV_CONFIG.ANALYSIS_INTERVAL_MINUTES,
  ZONE_CHECK_INTERVAL_SECONDS: V6_ENV_CONFIG.ZONE_CHECK_SECONDS,

  // Fibonacci - tighter for scalping
  FIB_ZONE_WIDTH_PERCENT: V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.15 : 0.2,
  FIB_LEVELS_TO_USE: [0.382, 0.5, 0.618, 0.786],
  FIB_EXTENSION_LEVELS: [1.272, 1.618],

  // Order blocks
  ORDER_BLOCK_MIN_STRENGTH: 'TESTED' as const,
  ORDER_BLOCK_LOOKBACK_CANDLES: 50,

  // Liquidity
  LIQUIDITY_ZONE_BUFFER_PERCENT: V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.05 : 0.1,

  // Level detection - tighter merge for scalping
  MIN_LEVEL_TOUCHES: 2,
  LEVEL_PROXIMITY_MERGE_PERCENT: V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.10 : 0.15,

  // Analysis
  CANDLES_FOR_ANALYSIS: 100,
  TIMEFRAMES_FOR_LEVELS: ['15m', '1h', '4h'] as const,
} as const;
