import { binanceService } from './binanceService';
import {
  llmPatternDetectionService,
  LLMPatternDetectionService
} from './llmPatternDetectionService';
import { signalBroadcastService } from './signalBroadcastService';
import { v4 as uuidv4 } from 'uuid';
import { riskManager } from './riskManager';

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface TimeframeAnalysis {
  timeframe: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  momentum: 'STRONG' | 'MODERATE' | 'WEAK';
  strength: number; // 0-100
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  patterns: {
    fibonacci: any;
    chart: any;
    candlestick: any;
    supportResistance: any;
  };
}

interface MultiTimeframeAnalysis {
  primary: TimeframeAnalysis; // 15m
  supporting: TimeframeAnalysis[]; // 1m, 10m, 30m
  confluenceScore: number; // 0-100, how many timeframes agree
  overallRecommendation: 'BUY' | 'SELL' | 'HOLD';
  overallConfidence: number;
}

interface BTCScalpingSignal {
  id: string;
  symbol: 'BTCUSDT';
  category: 'FIBONACCI_SCALPING';
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  timestamp: Date;

  // Entry/Exit parameters
  entryPrice: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  riskRewardRatio: number;

  // Multi-timeframe analysis
  multiTimeframeAnalysis: MultiTimeframeAnalysis;

  // Pattern details from all 4 LLM specialists
  fibonacciAnalysis: any;
  trendMomentumAnalysis: any;
  volumePriceActionAnalysis: any;
  supportResistanceAnalysis: any;

  // Consensus from 4 LLMs
  llmConsensus: {
    fibonacciVote: 'BUY' | 'SELL' | 'HOLD';
    trendMomentumVote: 'BUY' | 'SELL' | 'HOLD';
    volumePriceActionVote: 'BUY' | 'SELL' | 'HOLD';
    supportResistanceVote: 'BUY' | 'SELL' | 'HOLD';
    consensusAchieved: boolean; // 3/4 agreement
    votesFor: number;
    votesAgainst: number;
    votesNeutral: number;
  };

  // Technical indicators snapshot
  technicalIndicators: any;

  // Overall reasoning
  reasoning: string;

  // Trade Quality Score (NEW)
  qualityScore?: TradeQualityScore;

  // Position size multiplier (1.0 = full, 0.5 = half for near-HTF trades)
  positionSizeMultiplier?: number;
}

interface ExitSignal {
  shouldExit: boolean;
  reason: string;
  confidence: number;
  exitType: 'FULL' | 'PARTIAL' | 'NONE';
  partialExitPercentage?: number; // If partial exit, what % to close
  llmRecommendations: {
    fibonacci: { exit: boolean; reason: string };
    trendMomentum: { exit: boolean; reason: string };
    volumePriceAction: { exit: boolean; reason: string };
    supportResistance: { exit: boolean; reason: string };
  };
}

// Higher Timeframe (HTF) Analysis Interfaces
interface HTFLevel {
  price: number;
  timeframe: '4h' | '1d' | '1w';
  type: 'SUPPORT' | 'RESISTANCE';
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  touches: number;
  source: 'SWING' | 'FIB_PIVOT';  // Level source type
  fibLevel?: 'PP' | 'R1' | 'R2' | 'R3' | 'S1' | 'S2' | 'S3';  // Specific Fibonacci level
}

// Fibonacci Pivot Point Levels
interface FibonacciPivotLevels {
  timeframe: '4h' | '1d' | '1w';
  pp: number;      // Central Pivot Point
  r1: number;      // 38.2% Resistance
  r2: number;      // 61.8% Resistance
  r3: number;      // 100% Resistance
  s1: number;      // 38.2% Support
  s2: number;      // 61.8% Support
  s3: number;      // 100% Support
}

interface HTFAnalysis {
  levels: HTFLevel[];
  nearestSupport: { price: number; timeframe: string } | null;
  nearestResistance: { price: number; timeframe: string } | null;
  isNearCriticalLevel: boolean;
  criticalLevelType: 'SUPPORT' | 'RESISTANCE' | null;
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

// ==================== PROFESSIONAL ENTRY SYSTEM INTERFACES ====================

// Market Structure Analysis (HH/HL for bullish, LH/LL for bearish)
interface MarketStructure {
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  swingHighs: number[];      // Recent swing high prices
  swingLows: number[];       // Recent swing low prices
  lastBOS: {                 // Break of Structure
    type: 'BULLISH' | 'BEARISH';
    price: number;
    timestamp: number;
  } | null;
  isValid: boolean;          // HH/HL for bullish, LH/LL for bearish
}

// Order Block Detection (Institutional supply/demand zones)
interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  zone: { high: number; low: number };
  strength: 'FRESH' | 'TESTED' | 'MITIGATED';
  timestamp: number;
}

// Optimal Trade Entry Zone (61.8%-78.6% Fibonacci retracement)
interface OTEZone {
  direction: 'BUY' | 'SELL';
  swingHigh: number;
  swingLow: number;
  oteHigh: number;           // 61.8% retracement
  oteLow: number;            // 78.6% retracement
  isInZone: boolean;         // Current price in OTE zone
  equilibrium: number;       // 50% level (discount/premium boundary)
}

// Liquidity Analysis (Stop loss pools above/below swing points)
interface LiquidityAnalysis {
  buyStops: number[];        // Liquidity above recent highs
  sellStops: number[];       // Liquidity below recent lows
  recentSweep: {
    type: 'BUY_STOPS' | 'SELL_STOPS';
    price: number;
    timestamp: number;
  } | null;
}

// Professional Entry Signal (combined analysis)
interface ProfessionalEntrySignal {
  isValid: boolean;
  score: number;             // 0-100 entry quality score
  marketStructure: MarketStructure;
  oteZone: OTEZone | null;
  orderBlock: OrderBlock | null;
  liquidity: LiquidityAnalysis;
  reasoning: string[];
}

// ==================== TRADE QUALITY SCORING SYSTEM ====================

interface TradeQualityScore {
  total: number;           // 0-100
  grade: 'A' | 'B' | 'C' | 'D';
  components: {
    consensus: number;     // 0-25
    confidence: number;    // 0-25
    riskReward: number;    // 0-20
    htfAlignment: number;  // 0-15
    proScore: number;      // 0-15
  };
  positionSizeMultiplier: number; // 1.0 for A, 0.5 for B
}

// ==================== FILTER CONFIGURATION (Easy Tuning) ====================

const FILTER_CONFIG = {
  // R:R thresholds by confidence - LOWERED (ATR cap already ensures realistic targets)
  RR_BY_CONFIDENCE: {
    HIGH: { minConfidence: 80, minRR: 0.5 },     // lowered from 1.1
    MEDIUM: { minConfidence: 75, minRR: 0.55 },  // lowered from 1.15
    STANDARD: { minConfidence: 70, minRR: 0.75 },// lowered from 1.35
    LOW: { minConfidence: 0, minRR: 0.7 }        // lowered from 1.6
  },

  // NEW: Dynamic TP based on ATR (Priority 2)
  ATR_TP_CAP_MULTIPLIER: 2.0,        // Cap TP at 2x ATR from entry
  RR_LOW_VOLATILITY: 1.5,            // R:R for ATR < 0.3%
  RR_NORMAL_VOLATILITY: 2.0,         // R:R for ATR 0.3-0.6%
  RR_HIGH_VOLATILITY: 2.5,           // R:R for ATR > 0.6%

  // Consensus requirements - RESTORED to 3/4 (critical fix)
  CONSENSUS: {
    HIGH_CONFIDENCE_HTF_ALIGNED: 2,  // 2/4 if conf>=80 AND HTF aligned
    STANDARD: 3                       // RESTORED from 2 to 3 - require 75% agreement
  },

  // Professional entry - Size modifier system (never rejects)
  PRO_SCORE: {
    MIN_BASE: 40,                   // DEPRECATED - kept for reference only
    BONUS_HIGH_CONFIDENCE: 10,      // conf >= 80%
    BONUS_FULL_CONSENSUS: 10,       // 4/4 votes
    BONUS_HTF_ALIGNED: 5,
    // Size multiplier tiers (never reject, always trade with adjusted size)
    MULTIPLIERS: {
      TIER_1_MIN: 60,   TIER_1_SIZE: 1.0,   // 60+ = 100%
      TIER_2_MIN: 40,   TIER_2_SIZE: 0.75,  // 40-59 = 75%
      TIER_3_MIN: 25,   TIER_3_SIZE: 0.5,   // 25-39 = 50%
      TIER_4_MIN: 0,    TIER_4_SIZE: 0.35,  // 0-24 = 35%
      WARNING_PENALTY: 0.1,                  // -10% per warning
      MIN_WARNING_MULT: 0.5                  // Floor at 50%
    }
  },

  // HTF proximity - MIDDLE GROUND (0.9% instead of 1.2%)
  HTF: {
    PROXIMITY_THRESHOLD: 0.009,     // was 0.012 (1.2%), now 0.9%
    REDUCED_SIZE_MULTIPLIER: 0.5,   // Additional reduction when near critical level
    // NEW: Smarter HTF handling (Priority 5)
    COUNTER_TREND_MIN_CONFIDENCE: 70,  // Min confidence for counter-trend trades
    COUNTER_TREND_SIZE: 0.25,          // 25% position size for counter-trend
    NEUTRAL_SIZE: 0.50                 // 50% position size for neutral HTF
  },

  // HTF Signal Inversion - Trade WITH the trend instead of blocking
  HTF_INVERSION: {
    enabled: true,
    invertAgainstTrend: true,      // Flip signals that go against HTF
    requireMinConfidence: 55,      // Only invert if confidence >= 55%
    logInversions: true
  },

  // Quality scoring - MIDDLE GROUND
  QUALITY: {
    GRADE_A_MIN: 67,                // was 65, orig 70
    GRADE_B_MIN: 52,                // was 50, orig 55
    GRADE_A_SIZE_MULTIPLIER: 1.0,
    GRADE_B_SIZE_MULTIPLIER: 0.5
  },

  // Position sizing
  POSITION: {
    BASE_USD: 800
  }
};

export class BTCMultiPatternScalpingService {
  private readonly SYMBOL = 'BTCUSDT';
  private readonly PRIMARY_TIMEFRAME = '15m';
  private readonly SUPPORTING_TIMEFRAMES = ['1m', '5m', '30m']; // 5m moved to supporting, 15m is now primary
  private readonly CONFIDENCE_THRESHOLD = 50; // Further lowered: consensus + HTF alignment are primary filters

  // Higher Timeframe (HTF) Analysis Configuration
  private readonly HTF_TIMEFRAMES = ['4h', '1d', '1w']; // 4H, Daily, Weekly for critical levels
  private readonly HTF_PROXIMITY_THRESHOLD = FILTER_CONFIG.HTF.PROXIMITY_THRESHOLD; // 0.6% proximity threshold
  private readonly HTF_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 HOUR cache for HTF data (was 5 min - BUG FIX)

  // HTF Cache
  private htfCache: {
    data: HTFAnalysis | null;
    lastFetch: number;
  } = { data: null, lastFetch: 0 };

  // HTF Trend Persistence State (BUG FIX: Prevent rapid trend flipping)
  private htfTrendState: {
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confirmedAt: number;
    consecutiveConfirmations: number;
    pendingTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  } = { trend: 'NEUTRAL', confirmedAt: 0, consecutiveConfirmations: 0, pendingTrend: null };

  private readonly HTF_CONFIRMS_REQUIRED = 2; // Require 2 consecutive confirmations to flip trend

  // WebSocket integration
  private klineCache = new Map<string, Kline[]>();
  private isRunning = false;
  private lastSignalTime: number = 0;
  private readonly MIN_SIGNAL_INTERVAL = 60000; // 1 minute minimum between signals

  /**
   * Start WebSocket-based real-time signal generation
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  BTC Fibonacci Scalping Service already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting BTC Fibonacci Scalping Service with WebSocket integration...');

    try {
      // Subscribe to WebSocket kline streams for all timeframes
      const allTimeframes = [this.PRIMARY_TIMEFRAME, ...this.SUPPORTING_TIMEFRAMES];
      for (const tf of allTimeframes) {
        binanceService.subscribeToKline([this.SYMBOL], tf);
        console.log(`📡 Subscribed to ${this.SYMBOL} ${tf} kline stream`);
      }

      // Load initial historical data
      await this.loadInitialData();

      // Listen for real-time kline updates from WebSocket
      binanceService.on('kline', this.handleKlineUpdate.bind(this));
      binanceService.on('disconnected', this.handleDisconnection.bind(this));
      binanceService.on('connected', this.handleReconnection.bind(this));

      console.log('✅ BTC Fibonacci Scalping Service started successfully');
      console.log(`   Primary: ${this.PRIMARY_TIMEFRAME}, Supporting: ${this.SUPPORTING_TIMEFRAMES.join(', ')}`);
      console.log(`   Signal generation triggered on ${this.PRIMARY_TIMEFRAME} candle close`);
    } catch (error: any) {
      console.error('❌ Failed to start BTC Fibonacci Scalping Service:', error.message);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (!this.isRunning) return;

    console.log('🛑 Stopping BTC Fibonacci Scalping Service...');
    this.isRunning = false;

    // Remove event listeners
    binanceService.off('kline', this.handleKlineUpdate);
    binanceService.off('disconnected', this.handleDisconnection);
    binanceService.off('connected', this.handleReconnection);

    console.log('✅ BTC Fibonacci Scalping Service stopped');
  }

  /**
   * Load initial historical kline data for all timeframes
   */
  private async loadInitialData(): Promise<void> {
    console.log('📊 Loading initial historical kline data...');

    const allTimeframes = [this.PRIMARY_TIMEFRAME, ...this.SUPPORTING_TIMEFRAMES];
    for (const tf of allTimeframes) {
      try {
        const klines = await binanceService.getKlines(this.SYMBOL, tf, 100);
        const normalized = this.normalizeKlines(klines);
        this.klineCache.set(`${this.SYMBOL}:${tf}`, normalized);
        console.log(`   ✓ Loaded ${normalized.length} ${tf} candles`);
      } catch (error: any) {
        console.error(`   ✗ Failed to load ${tf} klines:`, error.message);
      }
    }

    console.log('✅ Initial data loaded successfully');
  }

  /**
   * Handle real-time kline updates from WebSocket
   */
  private handleKlineUpdate(klineData: any): void {
    // Only process BTCUSDT and finalized (closed) candles
    if (klineData.symbol !== this.SYMBOL) return;
    if (!klineData.isFinal) return; // Wait for candle to close

    const cacheKey = `${klineData.symbol}:${klineData.interval}`;
    const cached = this.klineCache.get(cacheKey) || [];

    // Create normalized kline object
    const newKline: Kline = {
      openTime: klineData.openTime || klineData.startTime,
      open: parseFloat(klineData.open),
      high: parseFloat(klineData.high),
      low: parseFloat(klineData.low),
      close: parseFloat(klineData.close),
      volume: parseFloat(klineData.volume),
      closeTime: klineData.closeTime || klineData.endTime
    };

    // Update cache: append new candle and keep last 100
    const updated = [...cached, newKline].slice(-100);
    this.klineCache.set(cacheKey, updated);

    console.log(`📈 ${klineData.interval} candle closed: $${newKline.close.toFixed(2)} (volume: ${newKline.volume.toFixed(2)})`);

    // Trigger signal generation when primary timeframe (5m) candle closes
    if (klineData.interval === this.PRIMARY_TIMEFRAME) {
      this.onPrimaryCandleClose().catch(error => {
        console.error('❌ Error during signal generation:', error);
      });
    }
  }

  /**
   * Triggered when primary timeframe (5m) candle closes
   * Generates and broadcasts entry signals
   */
  private async onPrimaryCandleClose(): Promise<void> {
    // Rate limiting: don't generate signals too frequently
    const now = Date.now();
    if (now - this.lastSignalTime < this.MIN_SIGNAL_INTERVAL) {
      console.log('⏭️  Skipping signal generation (too soon since last signal)');
      return;
    }

    console.log('🔍 Primary timeframe (15m) candle closed - running multi-pattern analysis...');

    try {
      const signal = await this.generateEntrySignal();

      if (!signal) {
        console.log('ℹ️  No signal generated (rejected by confidence/consensus checks)');
      } else if (signal.recommendation === 'HOLD') {
        console.log(`❌ Signal REJECTED: Recommendation is HOLD (no tradeable signal)`);
      } else {
        console.log(`🎯 Signal Generated: ${signal.recommendation}`);
        console.log(`   Confidence: ${signal.confidence?.toFixed(2) ?? 'N/A'}%`);
        console.log(`   Entry: $${signal.entryPrice?.toFixed(2) ?? 'N/A'}`);
        console.log(`   Stop Loss: $${signal.stopLossPrice?.toFixed(2) || 'None'}`);
        console.log(`   Take Profit: $${signal.takeProfitPrice?.toFixed(2) || 'None'}`);
        console.log(`   R:R = 1:${signal.riskRewardRatio?.toFixed(2) ?? 'N/A'}`);
        console.log(`   LLM Consensus: ${signal.llmConsensus?.votesFor ?? 0}/4 agree`);

        // Broadcast signal (handled by Agenda job that calls generateEntrySignal)
        this.lastSignalTime = now;
      }
    } catch (error: any) {
      console.error('❌ Error generating signal:', error.message);
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(): void {
    console.log('⚠️  Binance WebSocket disconnected - signals paused until reconnection');
  }

  /**
   * Handle WebSocket reconnection
   */
  private async handleReconnection(): Promise<void> {
    console.log('✅ Binance WebSocket reconnected - reloading data...');
    await this.loadInitialData();
    console.log('✅ Data reloaded successfully - signal generation resumed');
  }

  /**
   * Normalize raw Binance API kline data to standard format
   */
  private normalizeKlines(rawKlines: any[]): Kline[] {
    return rawKlines.map(k => ({
      openTime: Array.isArray(k) ? parseInt(k[0]) : k.openTime,
      open: Array.isArray(k) ? parseFloat(k[1]) : parseFloat(k.open),
      high: Array.isArray(k) ? parseFloat(k[2]) : parseFloat(k.high),
      low: Array.isArray(k) ? parseFloat(k[3]) : parseFloat(k.low),
      close: Array.isArray(k) ? parseFloat(k[4]) : parseFloat(k.close),
      volume: Array.isArray(k) ? parseFloat(k[5]) : parseFloat(k.volume),
      closeTime: Array.isArray(k) ? parseInt(k[6]) : k.closeTime
    }));
  }

  /**
   * Generate entry signal for BTC scalping
   */
  async generateEntrySignal(): Promise<BTCScalpingSignal | null> {
    try {
      console.log('🔍 Generating BTC Fibonacci scalping signal...');

      // Step 1: Fetch multi-timeframe data
      const primaryData = await this.fetchTimeframeData(this.PRIMARY_TIMEFRAME);
      const supportingData = await Promise.all(
        this.SUPPORTING_TIMEFRAMES.map(tf => this.fetchTimeframeData(tf))
      );

      // Step 2: Analyze primary timeframe (5m) with all 4 LLM specialists
      const primaryAnalysis = await this.analyzeTimeframe(
        primaryData.klines,
        primaryData.indicators,
        primaryData.currentPrice,
        this.PRIMARY_TIMEFRAME
      );

      // Step 3: Analyze supporting timeframes
      const supportingAnalyses = await Promise.all(
        this.SUPPORTING_TIMEFRAMES.map((tf, i) =>
          this.analyzeTimeframe(
            supportingData[i].klines,
            supportingData[i].indicators,
            supportingData[i].currentPrice,
            tf
          )
        )
      );

      // Step 4: Calculate multi-timeframe confluence
      const mtfAnalysis = this.calculateMultiTimeframeConfluence(
        primaryAnalysis,
        supportingAnalyses
      );

      // DEBUG: Show LLM analysis results
      console.log(`🤖 LLM Analysis Results:`);
      console.log(`   Fibonacci: ${primaryAnalysis.patterns.fibonacci.confidence.toFixed(1)}% (${primaryAnalysis.patterns.fibonacci.type}${primaryAnalysis.patterns.fibonacci.currentLevel ? ` @ ${primaryAnalysis.patterns.fibonacci.currentLevel}` : ''})`);
      console.log(`   Trend/Momentum: ${primaryAnalysis.patterns.trendMomentum.confidence.toFixed(1)}% (${primaryAnalysis.patterns.trendMomentum.emaTrend} - ${primaryAnalysis.patterns.trendMomentum.momentum})`);
      console.log(`   Volume/Price: ${primaryAnalysis.patterns.volumePriceAction.confidence.toFixed(1)}% (${primaryAnalysis.patterns.volumePriceAction.volumeSignal} ${primaryAnalysis.patterns.volumePriceAction.candleDirection})`);
      console.log(`   S/R: ${primaryAnalysis.patterns.supportResistance.confidence.toFixed(1)}% (${primaryAnalysis.patterns.supportResistance.currentZone})`);
      console.log(`   Consensus: ${primaryAnalysis.consensus.votesFor}/${primaryAnalysis.consensus.totalVotes} → ${primaryAnalysis.consensus.recommendation} (achieved: ${primaryAnalysis.consensus.consensusAchieved})`);
      console.log(`📊 Multi-Timeframe Confluence: ${mtfAnalysis.confluenceScore?.toFixed(1) ?? 'N/A'}%`);
      console.log(`📊 Overall Confidence: ${mtfAnalysis.overallConfidence?.toFixed(2) ?? 'N/A'}% (threshold: ${this.CONFIDENCE_THRESHOLD}%)`);

      // ==================== NEW FLEXIBLE FILTER SYSTEM ====================

      // Step 5: Get HTF analysis first (needed for consensus and other decisions)
      const htfAnalysis = await this.getHTFAnalysis(primaryData.currentPrice);
      const signalTrend = mtfAnalysis.overallRecommendation === 'BUY' ? 'BULLISH' :
                          mtfAnalysis.overallRecommendation === 'SELL' ? 'BEARISH' : 'NEUTRAL';
      const htfAligned = htfAnalysis.htfTrend === signalTrend;
      const htfNeutral = htfAnalysis.htfTrend === 'NEUTRAL';

      console.log(`📊 HTF Analysis (4H/Daily/Weekly):`);
      console.log(`   Nearest Support: $${htfAnalysis.nearestSupport?.price.toFixed(2) || 'None'} (${htfAnalysis.nearestSupport?.timeframe || '-'})`);
      console.log(`   Nearest Resistance: $${htfAnalysis.nearestResistance?.price.toFixed(2) || 'None'} (${htfAnalysis.nearestResistance?.timeframe || '-'})`);
      console.log(`   HTF Trend: ${htfAnalysis.htfTrend} | Signal Trend: ${signalTrend} | Aligned: ${htfAligned}`);

      // Step 6: FLEXIBLE CONSENSUS CHECK
      const requiredConsensus = this.getRequiredConsensus(mtfAnalysis.overallConfidence, htfAligned);
      if (primaryAnalysis.consensus.votesFor < requiredConsensus) {
        console.log(`❌ Signal REJECTED: Consensus ${primaryAnalysis.consensus.votesFor}/4 < required ${requiredConsensus} (conf: ${mtfAnalysis.overallConfidence.toFixed(0)}%, HTF aligned: ${htfAligned})`);
        return null;
      }
      console.log(`✅ Consensus met: ${primaryAnalysis.consensus.votesFor}/4 >= ${requiredConsensus} required`);

      // Step 7: Check minimum confidence threshold
      if (mtfAnalysis.overallConfidence < this.CONFIDENCE_THRESHOLD) {
        console.log(`❌ Signal REJECTED: Confidence ${mtfAnalysis.overallConfidence.toFixed(2)}% < ${this.CONFIDENCE_THRESHOLD}%`);
        return null;
      }
      console.log(`✅ Confidence threshold met: ${mtfAnalysis.overallConfidence.toFixed(2)}%`);

      // Step 8: Calculate entry, SL, TP based on LLM analysis
      // Use let for stopLoss/takeProfit since they may be modified during HTF inversion
      const entryParams = this.calculateEntryParameters(
        primaryData.currentPrice,
        primaryAnalysis,
        primaryData.indicators
      );
      const entryPrice = entryParams.entryPrice;
      let stopLoss = entryParams.stopLoss;
      let takeProfit = entryParams.takeProfit;
      const riskReward = entryParams.riskReward;

      // Step 9: DYNAMIC R:R CHECK based on confidence
      const minRR = this.getMinRiskRewardRatio(mtfAnalysis.overallConfidence);
      if (riskReward < minRR) {
        console.log(`❌ Signal REJECTED: R:R 1:${riskReward.toFixed(2)} < dynamic min 1:${minRR} (for ${mtfAnalysis.overallConfidence.toFixed(0)}% confidence)`);
        console.log(`   Entry: $${entryPrice.toFixed(2)}, SL: $${stopLoss?.toFixed(2) || 'None'}, TP: $${takeProfit?.toFixed(2) || 'None'}`);
        return null;
      }
      console.log(`✅ R:R met: 1:${riskReward.toFixed(2)} >= 1:${minRR} (dynamic for ${mtfAnalysis.overallConfidence.toFixed(0)}% conf)`);

      // ================================================================
      // Step 10: HTF SIGNAL INVERSION - Trade WITH the trend
      // BUG FIX: Instead of blocking/reducing counter-trend signals, INVERT them
      // - HTF aligned: Pass through unchanged
      // - HTF neutral: 50% size (unchanged)
      // - Counter-trend: INVERT signal direction (BUY→SELL, SELL→BUY)
      // ================================================================
      let positionSizeMultiplier = 1.0;
      let signalDirection = mtfAnalysis.overallRecommendation;
      let wasInverted = false;
      let originalDirection = signalDirection;

      // Determine alignment status
      const isCounterTrend = !htfAligned && htfAnalysis.htfTrend !== 'NEUTRAL';

      if (isCounterTrend && FILTER_CONFIG.HTF_INVERSION?.enabled) {
        // Counter-trend: INVERT the signal to trade WITH the trend
        if (mtfAnalysis.overallConfidence >= (FILTER_CONFIG.HTF_INVERSION?.requireMinConfidence || 55)) {
          // Calculate new SL/TP with inverted direction
          const slDistance = Math.abs(entryPrice - (stopLoss || entryPrice));
          const tpDistance = Math.abs((takeProfit || entryPrice) - entryPrice);

          if (signalDirection === 'BUY') {
            signalDirection = 'SELL';
            stopLoss = entryPrice + slDistance;  // SL above for SELL
            takeProfit = entryPrice - tpDistance; // TP below for SELL
          } else if (signalDirection === 'SELL') {
            signalDirection = 'BUY';
            stopLoss = entryPrice - slDistance;  // SL below for BUY
            takeProfit = entryPrice + tpDistance; // TP above for BUY
          }

          wasInverted = true;
          positionSizeMultiplier = 1.0; // Full size when trading with trend

          console.log(`🔄 SIGNAL INVERTED: ${originalDirection} → ${signalDirection}`);
          console.log(`   Reason: Trading WITH HTF ${htfAnalysis.htfTrend} trend`);
          console.log(`   Confidence: ${mtfAnalysis.overallConfidence.toFixed(0)}% >= ${FILTER_CONFIG.HTF_INVERSION?.requireMinConfidence}% threshold`);
          console.log(`   New SL: $${stopLoss?.toFixed(2)}, New TP: $${takeProfit?.toFixed(2)}`);

          // Update mtfAnalysis to reflect inverted direction
          mtfAnalysis.overallRecommendation = signalDirection;
        } else {
          // Low confidence counter-trend: Reject (can't safely invert)
          console.log(`❌ [HTF] Counter-trend signal REJECTED (confidence: ${mtfAnalysis.overallConfidence.toFixed(0)}% < ${FILTER_CONFIG.HTF_INVERSION?.requireMinConfidence}% for inversion)`);
          console.log(`   Signal: ${signalDirection}, HTF trend: ${htfAnalysis.htfTrend}`);
          return null;
        }
      } else if (isCounterTrend) {
        // Fallback: Old behavior if inversion disabled
        if (mtfAnalysis.overallConfidence >= FILTER_CONFIG.HTF.COUNTER_TREND_MIN_CONFIDENCE) {
          positionSizeMultiplier = FILTER_CONFIG.HTF.COUNTER_TREND_SIZE || 0.25;
          console.log(`⚠️ [HTF] Counter-trend trade ALLOWED at ${(positionSizeMultiplier * 100).toFixed(0)}% size`);
        } else {
          console.log(`❌ [HTF] Counter-trend trade BLOCKED`);
          return null;
        }
      } else if (htfNeutral) {
        // HTF neutral: 50% size
        positionSizeMultiplier = FILTER_CONFIG.HTF.NEUTRAL_SIZE || 0.5;
        console.log(`⚠️ [HTF] Neutral HTF trend - using ${(positionSizeMultiplier * 100).toFixed(0)}% position size`);
      } else {
        // HTF aligned: Full size
        positionSizeMultiplier = 1.0;
        console.log(`✅ [HTF] Trend aligned: ${htfAnalysis.htfTrend} matches ${signalDirection}`);
      }

      // Apply additional critical level reduction on top (if near resistance for BUY, etc.)
      if (htfAnalysis.isNearCriticalLevel) {
        const isConflicting = (mtfAnalysis.overallRecommendation === 'BUY' && htfAnalysis.criticalLevelType === 'RESISTANCE') ||
                              (mtfAnalysis.overallRecommendation === 'SELL' && htfAnalysis.criticalLevelType === 'SUPPORT');
        if (isConflicting) {
          positionSizeMultiplier *= FILTER_CONFIG.HTF.REDUCED_SIZE_MULTIPLIER || 0.5;  // Additional 50% reduction
          console.log(`⚠️ [HTF] Near critical ${htfAnalysis.criticalLevelType} - additional reduction (now ${(positionSizeMultiplier * 100).toFixed(0)}%)`);
        }
      }

      // Step 11: PROFESSIONAL ENTRY with BONUS POINTS (Size Modifier System)
      let professionalEntryScore = 0;
      let professionalEntry: ReturnType<typeof this.validateProfessionalEntry> | null = null;
      let proScoreMultiplier = 1.0;

      if (mtfAnalysis.overallRecommendation !== 'HOLD') {
        professionalEntry = this.validateProfessionalEntry(
          primaryData.klines,
          primaryData.currentPrice,
          mtfAnalysis.overallRecommendation as 'BUY' | 'SELL'
        );

        // Calculate bonus points
        let bonusPoints = 0;
        if (mtfAnalysis.overallConfidence >= 80) bonusPoints += FILTER_CONFIG.PRO_SCORE.BONUS_HIGH_CONFIDENCE;
        if (primaryAnalysis.consensus.votesFor === 4) bonusPoints += FILTER_CONFIG.PRO_SCORE.BONUS_FULL_CONSENSUS;
        if (htfAligned) bonusPoints += FILTER_CONFIG.PRO_SCORE.BONUS_HTF_ALIGNED;

        const adjustedScore = professionalEntry.score + bonusPoints;
        professionalEntryScore = adjustedScore;

        // Calculate pro score size modifier (never rejects - adjusts size instead)
        const proScoreResult = this.calculateProScoreMultiplier(adjustedScore, professionalEntry.reasoning);
        proScoreMultiplier = proScoreResult.multiplier;

        console.log(`🎓 Professional Entry Analysis:`);
        console.log(`   Base Score: ${professionalEntry.score}/100`);
        console.log(`   Bonus Points: +${bonusPoints} (conf≥80: ${mtfAnalysis.overallConfidence >= 80 ? '+10' : '0'}, 4/4: ${primaryAnalysis.consensus.votesFor === 4 ? '+10' : '0'}, HTF: ${htfAligned ? '+5' : '0'})`);
        console.log(`   Adjusted Score: ${adjustedScore}/100`);
        console.log(`   Warnings: ${proScoreResult.warningCount}`);
        console.log(`   Size Modifier: ${(proScoreMultiplier * 100).toFixed(0)}%`);
        for (const reason of professionalEntry.reasoning) {
          console.log(`   ${reason}`);
        }
      }

      // Step 12: CALCULATE TRADE QUALITY SCORE
      const qualityScore = this.calculateTradeQualityScore(
        primaryAnalysis.consensus.votesFor,
        mtfAnalysis.overallConfidence,
        riskReward,
        htfAligned,
        htfNeutral,
        professionalEntryScore
      );

      console.log(`📊 Trade Quality Score: ${qualityScore.total}/100 (Grade ${qualityScore.grade})`);
      console.log(`   Components: Consensus=${qualityScore.components.consensus}, Confidence=${qualityScore.components.confidence}, R:R=${qualityScore.components.riskReward}, HTF=${qualityScore.components.htfAlignment}, Pro=${qualityScore.components.proScore}`);

      // Apply ALL multipliers: HTF/consensus * qualityGrade * proScoreAdjustment
      const finalPositionMultiplier = positionSizeMultiplier * qualityScore.positionSizeMultiplier * proScoreMultiplier;
      console.log(`✅ Signal EXECUTING with ${(finalPositionMultiplier * 100).toFixed(0)}% size ($${(FILTER_CONFIG.POSITION.BASE_USD * finalPositionMultiplier).toFixed(0)})`);
      console.log(`   Multipliers: HTF/Consensus=${(positionSizeMultiplier * 100).toFixed(0)}% x Grade=${(qualityScore.positionSizeMultiplier * 100).toFixed(0)}% x ProScore=${(proScoreMultiplier * 100).toFixed(0)}%`);

      // Step 14: Build comprehensive signal with quality score
      const signal: BTCScalpingSignal = {
        id: uuidv4(),
        symbol: this.SYMBOL,
        category: 'FIBONACCI_SCALPING',
        recommendation: mtfAnalysis.overallRecommendation,
        confidence: mtfAnalysis.overallConfidence,
        timestamp: new Date(),
        entryPrice,
        stopLossPrice: stopLoss,
        takeProfitPrice: takeProfit,
        riskRewardRatio: riskReward,
        multiTimeframeAnalysis: mtfAnalysis,
        fibonacciAnalysis: primaryAnalysis.patterns.fibonacci,
        trendMomentumAnalysis: primaryAnalysis.patterns.trendMomentum,
        volumePriceActionAnalysis: primaryAnalysis.patterns.volumePriceAction,
        supportResistanceAnalysis: primaryAnalysis.patterns.supportResistance,
        llmConsensus: primaryAnalysis.consensus,
        technicalIndicators: primaryData.indicators,
        reasoning: this.buildComprehensiveReasoning(primaryAnalysis, mtfAnalysis),
        qualityScore,
        positionSizeMultiplier: finalPositionMultiplier
      };

      console.log(`✅ Signal generated: ${signal.recommendation} with ${signal.confidence.toFixed(1)}% confidence`);
      console.log(`   Entry: $${entryPrice.toFixed(2)}, SL: $${stopLoss?.toFixed(2)}, TP: $${takeProfit?.toFixed(2)}`);
      console.log(`   R:R = 1:${riskReward.toFixed(2)} | Grade ${qualityScore.grade} | Size: $${(FILTER_CONFIG.POSITION.BASE_USD * finalPositionMultiplier).toFixed(0)}`);

      // Broadcast signal to all eligible agents for validation and execution
      try {
        await signalBroadcastService.broadcastSignal({
          id: signal.id,
          symbol: signal.symbol,
          category: signal.category,
          recommendation: signal.recommendation,
          confidence: signal.confidence / 100, // Convert to 0-1 scale
          reasoning: signal.reasoning,
          entryPrice: entryPrice,
          stopLoss: stopLoss || undefined,
          targetPrice: takeProfit || undefined,
          timestamp: new Date(),
          priority: Math.floor(signal.confidence), // Use confidence as priority
          // NEW: Pass quality score for fast execution (bypasses LLM validation)
          qualityScore: {
            total: qualityScore.total,
            grade: qualityScore.grade,
            positionSizeMultiplier: qualityScore.positionSizeMultiplier
          },
          positionSizeMultiplier: finalPositionMultiplier
        });

        console.log(`📢 Signal ${signal.id} broadcasted to agents (Grade ${qualityScore.grade}, $${(FILTER_CONFIG.POSITION.BASE_USD * finalPositionMultiplier).toFixed(0)})`);
      } catch (error) {
        console.error(`Failed to broadcast signal ${signal.id}:`, error);
      }

      return signal;
    } catch (error: any) {
      console.error('❌ Error generating entry signal:', error.message);
      return null;
    }
  }

  /**
   * Generate exit signal for open position
   */
  async generateExitSignal(
    entryPrice: number,
    currentPnLPercent: number,
    entrySignalData: any
  ): Promise<ExitSignal> {
    try {
      console.log('🔍 Analyzing exit conditions for open position...');

      // Fetch current market data
      const currentData = await this.fetchTimeframeData(this.PRIMARY_TIMEFRAME);

      // Re-analyze with all 4 LLM specialists to see if pattern still valid
      const currentAnalysis = await this.analyzeTimeframe(
        currentData.klines,
        currentData.indicators,
        currentData.currentPrice,
        this.PRIMARY_TIMEFRAME
      );

      // Ask each LLM if we should exit
      const fibExit = this.shouldExitBasedOnFibonacci(
        currentAnalysis.patterns.fibonacci,
        entrySignalData?.fibonacciAnalysis,
        currentPnLPercent
      );

      const trendExit = this.shouldExitBasedOnTrendMomentum(
        currentAnalysis.patterns.trendMomentum,
        entrySignalData?.trendMomentumAnalysis,
        currentPnLPercent
      );

      const volumeExit = this.shouldExitBasedOnVolumePriceAction(
        currentAnalysis.patterns.volumePriceAction,
        currentPnLPercent
      );

      const srExit = this.shouldExitBasedOnSR(
        currentAnalysis.patterns.supportResistance,
        currentData.currentPrice,
        entryPrice,
        currentPnLPercent
      );

      // Count exit recommendations
      const exitVotes = [fibExit.exit, trendExit.exit, volumeExit.exit, srExit.exit].filter(Boolean).length;

      // Check if pattern has reversed (3/4 LLMs now say opposite direction)
      const reversalDetected = this.detectReversal(currentAnalysis, entrySignalData);

      // Partial exit logic: If at 61.8% of profit target, recommend partial exit
      const partialExitRecommended = currentPnLPercent >= 0.618 * 1.5 && currentPnLPercent < 1.5;

      let shouldExit = false;
      let exitType: 'FULL' | 'PARTIAL' | 'NONE' = 'NONE';
      let reason = '';

      if (reversalDetected) {
        shouldExit = true;
        exitType = 'FULL';
        reason = 'Pattern reversal detected by LLMs';
      } else if (exitVotes >= 3) {
        shouldExit = true;
        exitType = 'FULL';
        reason = `${exitVotes}/4 LLMs recommend exit`;
      } else if (partialExitRecommended && exitVotes >= 2) {
        shouldExit = true;
        exitType = 'PARTIAL';
        reason = 'Reached 61.8% of profit target, partial exit recommended';
      }

      return {
        shouldExit,
        reason,
        confidence: (exitVotes / 4) * 100,
        exitType,
        partialExitPercentage: exitType === 'PARTIAL' ? 50 : undefined,
        llmRecommendations: {
          fibonacci: fibExit,
          trendMomentum: trendExit,
          volumePriceAction: volumeExit,
          supportResistance: srExit
        }
      };
    } catch (error: any) {
      console.error('❌ Error generating exit signal:', error.message);
      return {
        shouldExit: false,
        reason: 'Analysis error',
        confidence: 0,
        exitType: 'NONE',
        llmRecommendations: {
          fibonacci: { exit: false, reason: 'Error' },
          trendMomentum: { exit: false, reason: 'Error' },
          volumePriceAction: { exit: false, reason: 'Error' },
          supportResistance: { exit: false, reason: 'Error' }
        }
      };
    }
  }

  /**
   * Fetch klines and calculate indicators for a timeframe
   * Uses WebSocket cache first, falls back to REST API if cache unavailable
   */
  private async fetchTimeframeData(timeframe: string) {
    const cacheKey = `${this.SYMBOL}:${timeframe}`;
    const cachedKlines = this.klineCache.get(cacheKey);

    // Use cache if available and sufficient (at least 50 candles)
    if (cachedKlines && cachedKlines.length >= 50) {
      const indicators = llmPatternDetectionService.calculateIndicators(cachedKlines);
      const currentPrice = cachedKlines[cachedKlines.length - 1].close;
      return { klines: cachedKlines, indicators, currentPrice };
    }

    // Fallback to REST API if cache miss or insufficient data
    console.log(`⚠️  Cache miss for ${timeframe}, fetching from Binance API...`);
    const klines = await binanceService.getKlines(this.SYMBOL, timeframe, 100);
    const normalized = this.normalizeKlines(klines);

    // Update cache
    this.klineCache.set(cacheKey, normalized);

    const indicators = llmPatternDetectionService.calculateIndicators(normalized);
    const currentPrice = normalized[normalized.length - 1].close;
    return { klines: normalized, indicators, currentPrice };
  }

  /**
   * Analyze a single timeframe with all 4 LLM specialists
   */
  private async analyzeTimeframe(
    klines: Kline[],
    indicators: any,
    currentPrice: number,
    timeframe: string
  ): Promise<any> {
    const input = { klines, indicators, currentPrice, timeframe };

    // All 4 experts now run in parallel (Volume/PA is standalone, no S/R dependency)
    const [fibonacci, trendMomentum, volumePriceAction, supportResistance] = await Promise.all([
      llmPatternDetectionService.analyzeFibonacciPatterns(input),
      llmPatternDetectionService.analyzeTrendMomentum(input),
      llmPatternDetectionService.analyzeVolumePriceAction(input),
      llmPatternDetectionService.analyzeSupportResistance(input)
    ]);

    // Extract votes from LLM recommendations (fallback to reasoning parsing if not available)
    const fibVote = fibonacci.recommendation || this.extractVoteFromReasoning(fibonacci.reasoning);
    const trendVote = trendMomentum.recommendation || this.extractVoteFromReasoning(trendMomentum.reasoning);
    const volVote = volumePriceAction.recommendation || this.extractVoteFromReasoning(volumePriceAction.reasoning);
    const srVote = supportResistance.recommendation || this.extractVoteFromReasoning(supportResistance.reasoning);

    // Calculate consensus using centralized RiskManager decision table
    const votes = [fibVote, trendVote, volVote, srVote];
    const buyVotes = votes.filter(v => v === 'BUY').length;
    const sellVotes = votes.filter(v => v === 'SELL').length;
    const holdVotes = votes.filter(v => v === 'HOLD').length;

    // Log individual LLM votes for monitoring BUY/SELL distribution
    console.log(`🗳️  [${timeframe}] LLM Votes: FIB=${fibVote}, TREND=${trendVote}, VOL=${volVote}, S/R=${srVote}`);

    // Calculate preliminary confidence for 2-0-2 pattern validation
    // Use null-coalescing to prevent NaN when an LLM expert fails
    const preliminaryConfidence = (
      (fibonacci.confidence ?? 0) * 0.30 +
      (trendMomentum.confidence ?? 0) * 0.30 +
      (volumePriceAction.confidence ?? 0) * 0.20 +
      (supportResistance.confidence ?? 0) * 0.20
    );

    // Use RiskManager's consensus decision table with explicit conflict detection
    const consensusDecision = riskManager.evaluateConsensus(buyVotes, sellVotes, holdVotes, preliminaryConfidence);

    // Log consensus decision with pattern
    if (consensusDecision.shouldTrade) {
      console.log(`   ✅ CONSENSUS: ${consensusDecision.reason} (size: ${(consensusDecision.positionSizeMultiplier * 100).toFixed(0)}%)`);
    } else {
      console.log(`   ❌ REJECTED: ${consensusDecision.reason}`);
    }

    const consensusAchieved = consensusDecision.shouldTrade;
    const overallVote = consensusDecision.direction;

    // Calculate overall confidence (weighted average)
    // Use null-coalescing to prevent NaN when an LLM expert fails
    const avgConfidence = (
      (fibonacci.confidence ?? 0) * 0.30 +
      (trendMomentum.confidence ?? 0) * 0.30 +
      (volumePriceAction.confidence ?? 0) * 0.20 +
      (supportResistance.confidence ?? 0) * 0.20
    );

    // Determine trend and momentum
    const trend = indicators.ema20 > indicators.ema50 ? 'BULLISH'
      : indicators.ema20 < indicators.ema50 ? 'BEARISH'
      : 'NEUTRAL';

    const momentum = indicators.adx > 25 ? 'STRONG'
      : indicators.adx > 15 ? 'MODERATE'
      : 'WEAK';

    return {
      timeframe,
      trend,
      momentum,
      strength: indicators.adx,
      recommendation: overallVote,
      confidence: avgConfidence,
      patterns: {
        fibonacci,
        trendMomentum,
        volumePriceAction,
        supportResistance
      },
      consensus: {
        fibonacciVote: fibVote,
        trendMomentumVote: trendVote,
        volumePriceActionVote: volVote,
        supportResistanceVote: srVote,
        consensusAchieved,
        recommendation: overallVote,
        totalVotes: 4,
        votesFor: overallVote === 'BUY' ? buyVotes : overallVote === 'SELL' ? sellVotes : holdVotes,
        votesAgainst: overallVote === 'BUY' ? sellVotes : overallVote === 'SELL' ? buyVotes : buyVotes + sellVotes,
        votesNeutral: holdVotes,
        // NEW: Consensus-based position size multiplier from RiskManager
        pattern: consensusDecision.pattern,
        positionSizeMultiplier: consensusDecision.positionSizeMultiplier,
        decisionReason: consensusDecision.reason
      }
    };
  }

  /**
   * Calculate multi-timeframe confluence
   */
  private calculateMultiTimeframeConfluence(
    primary: any,
    supporting: any[]
  ): MultiTimeframeAnalysis {
    const allTimeframes = [primary, ...supporting];

    // Count how many timeframes agree with primary
    const agreement = allTimeframes.filter(
      tf => tf.recommendation === primary.recommendation
    ).length;

    const confluenceScore = (agreement / allTimeframes.length) * 100;

    // Overall confidence: primary confidence boosted by confluence (not penalized)
    // Uses weighted blend where confluence amplifies confidence rather than reducing it
    const baseWeight = 0.7;
    const confluenceWeight = 0.3;
    const primaryConfidence = primary.confidence ?? 0;
    const overallConfidence = (primaryConfidence * baseWeight) +
                             (primaryConfidence * (confluenceScore / 100) * confluenceWeight);

    return {
      primary,
      supporting,
      confluenceScore,
      overallRecommendation: primary.recommendation,
      overallConfidence
    };
  }

  /**
   * NEW: Calculate dynamic TP based on ATR and volatility
   * - Caps TP at 2x ATR to prevent unrealistic targets in ranging markets
   * - Uses volatility-based R:R ratios (1.5, 2.0, or 2.5)
   */
  private calculateDynamicTP(
    direction: 'BUY' | 'SELL',
    entryPrice: number,
    stopLoss: number,
    atr: number,
    currentPrice: number
  ): number {
    const risk = Math.abs(entryPrice - stopLoss);
    const atrPercent = (atr / currentPrice) * 100;

    // Determine R:R ratio based on volatility
    let riskRewardRatio: number;
    if (atrPercent < 0.3) {
      riskRewardRatio = FILTER_CONFIG.RR_LOW_VOLATILITY || 1.5;  // Low volatility
      console.log(`   📉 Low volatility (ATR ${atrPercent.toFixed(2)}% < 0.3%) - using R:R 1:${riskRewardRatio}`);
    } else if (atrPercent < 0.6) {
      riskRewardRatio = FILTER_CONFIG.RR_NORMAL_VOLATILITY || 2.0;  // Normal volatility
      console.log(`   📊 Normal volatility (ATR ${atrPercent.toFixed(2)}%) - using R:R 1:${riskRewardRatio}`);
    } else {
      riskRewardRatio = FILTER_CONFIG.RR_HIGH_VOLATILITY || 2.5;  // High volatility
      console.log(`   📈 High volatility (ATR ${atrPercent.toFixed(2)}% > 0.6%) - using R:R 1:${riskRewardRatio}`);
    }

    // Calculate TP based on R:R
    const reward = risk * riskRewardRatio;
    let tp = direction === 'BUY' ? entryPrice + reward : entryPrice - reward;

    // Cap at 2x ATR from entry (prevents unrealistic TPs in ranging markets)
    const maxTPDistance = atr * (FILTER_CONFIG.ATR_TP_CAP_MULTIPLIER || 2.0);
    const maxTP = direction === 'BUY'
      ? entryPrice + maxTPDistance
      : entryPrice - maxTPDistance;

    // Apply cap
    const originalTP = tp;
    if (direction === 'BUY') {
      tp = Math.min(tp, maxTP);
    } else {
      tp = Math.max(tp, maxTP);
    }

    // Log if TP was capped
    if (tp !== originalTP) {
      console.log(`   ⚠️ TP capped at 2x ATR: $${originalTP.toFixed(2)} → $${tp.toFixed(2)} (max distance: $${maxTPDistance.toFixed(2)})`);
    }

    return tp;
  }

  /**
   * Calculate entry parameters based on LLM analysis
   * NEW: Uses dynamic TP based on ATR with volatility-adjusted R:R ratios
   */
  private calculateEntryParameters(
    currentPrice: number,
    analysis: any,
    indicators: any
  ) {
    const { fibonacci, supportResistance } = analysis.patterns;

    // Entry: Current price (market entry)
    const entryPrice = currentPrice;

    // Get ATR for dynamic calculations
    const atr = indicators.atr || currentPrice * 0.01; // Fallback to 1% of price

    // Stop Loss: Use Fibonacci level or S/R level, whichever is closer
    let stopLoss: number | null = null;
    if (analysis.recommendation === 'BUY') {
      // For BUY: SL below support (with null-safety)
      const fibSupport = fibonacci.entryZone?.min || currentPrice * 0.985;
      const srSupport = supportResistance.nearestSupport || currentPrice * 0.98;
      const atrStop = currentPrice - (atr * 1.5);
      stopLoss = Math.min(fibSupport, srSupport, atrStop);
    } else if (analysis.recommendation === 'SELL') {
      // For SELL: SL above resistance (with null-safety)
      const fibResistance = fibonacci.entryZone?.max || currentPrice * 1.015;
      const srResistance = supportResistance.nearestResistance || currentPrice * 1.02;
      const atrStop = currentPrice + (atr * 1.5);
      stopLoss = Math.max(fibResistance, srResistance, atrStop);
    }

    // ================================================================
    // NEW: Dynamic Take Profit based on ATR with volatility-adjusted R:R
    // This replaces the old fixed Fibonacci/chart target approach
    // ================================================================
    let takeProfit: number | null = null;
    if (analysis.recommendation === 'BUY' || analysis.recommendation === 'SELL') {
      const direction = analysis.recommendation as 'BUY' | 'SELL';

      // Use dynamic TP calculation (capped at 2x ATR, R:R based on volatility)
      takeProfit = this.calculateDynamicTP(
        direction,
        entryPrice,
        stopLoss!,
        atr,
        currentPrice
      );

      const tpDistance = Math.abs(takeProfit - entryPrice);
      console.log(`   🎯 Dynamic TP: $${takeProfit.toFixed(2)} (${tpDistance.toFixed(0)} pts from entry)`);
    }

    // Calculate risk:reward ratio
    const risk = stopLoss ? Math.abs(entryPrice - stopLoss) : 0;
    const reward = takeProfit ? Math.abs(takeProfit - entryPrice) : 0;
    const riskReward = risk > 0 ? reward / risk : 0;

    return {
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward
    };
  }

  /**
   * Build comprehensive reasoning from all LLM analysis
   */
  private buildComprehensiveReasoning(analysis: any, mtfAnalysis: MultiTimeframeAnalysis): string {
    const parts: string[] = [];

    parts.push(`**Multi-Timeframe Consensus (${mtfAnalysis.confluenceScore.toFixed(0)}% agreement)**`);
    parts.push(`Primary ${analysis.timeframe}: ${analysis.recommendation} (${analysis.confidence.toFixed(0)}% confidence)`);

    parts.push(`\n**Pattern Analysis:**`);
    parts.push(`• Fibonacci: ${analysis.patterns.fibonacci.reasoning}`);
    parts.push(`• Trend/Momentum: ${analysis.patterns.trendMomentum.reasoning}`);
    parts.push(`• Volume/Price: ${analysis.patterns.volumePriceAction.reasoning}`);
    parts.push(`• S/R: ${analysis.patterns.supportResistance.reasoning}`);

    parts.push(`\n**LLM Votes:** ${analysis.consensus.votesFor}/4 agree, ${analysis.consensus.votesAgainst} disagree, ${analysis.consensus.votesNeutral} neutral`);

    return parts.join('\n');
  }

  /**
   * Extract vote from LLM reasoning (parse their recommendation)
   * Fixed: Now counts keyword occurrences to avoid BUY bias when both directions mentioned
   */
  private extractVoteFromReasoning(reasoning: string): 'BUY' | 'SELL' | 'HOLD' {
    const upper = reasoning.toUpperCase();

    // Check for explicit recommendation patterns first (highest priority)
    const explicitSellPatterns = ['RECOMMEND SELL', 'RECOMMENDATION: SELL', 'RECOMMENDATION:"SELL',
      'SUGGESTS SELL', 'ADVISE SELL', 'SIGNAL: SELL', 'ACTION: SELL'];
    const explicitBuyPatterns = ['RECOMMEND BUY', 'RECOMMENDATION: BUY', 'RECOMMENDATION:"BUY',
      'SUGGESTS BUY', 'ADVISE BUY', 'SIGNAL: BUY', 'ACTION: BUY'];

    for (const pattern of explicitSellPatterns) {
      if (upper.includes(pattern)) return 'SELL';
    }
    for (const pattern of explicitBuyPatterns) {
      if (upper.includes(pattern)) return 'BUY';
    }

    // Count directional keywords (avoids bias when both directions mentioned)
    const bullishKeywords = ['BUY', 'BULLISH', 'LONG', 'UPWARD', 'BOUNCE', 'SUPPORT HOLDING', 'BREAKOUT'];
    const bearishKeywords = ['SELL', 'BEARISH', 'SHORT', 'DOWNWARD', 'DROP', 'RESISTANCE REJECTED', 'BREAKDOWN'];

    let bullishCount = 0;
    let bearishCount = 0;

    for (const keyword of bullishKeywords) {
      if (upper.includes(keyword)) bullishCount++;
    }
    for (const keyword of bearishKeywords) {
      if (upper.includes(keyword)) bearishCount++;
    }

    // Return based on which direction has more keywords
    if (bearishCount > bullishCount) return 'SELL';
    if (bullishCount > bearishCount) return 'BUY';
    return 'HOLD';
  }

  /**
   * Exit logic: Fibonacci analysis
   */
  private shouldExitBasedOnFibonacci(current: any, entry: any, pnl: number): { exit: boolean; reason: string } {
    if (current.currentLevel !== entry?.currentLevel) {
      return { exit: true, reason: 'Price moved away from Fibonacci entry level' };
    }
    return { exit: false, reason: 'Fibonacci pattern still valid' };
  }

  /**
   * Exit logic: Trend/Momentum analysis
   */
  private shouldExitBasedOnTrendMomentum(current: any, entry: any, pnl: number): { exit: boolean; reason: string } {
    if (current.emaTrend !== entry?.emaTrend && entry?.emaTrend) {
      return { exit: true, reason: `Trend changed: ${current.emaTrend}` };
    }
    if (current.momentum === 'WEAK' && entry?.momentum === 'STRONG') {
      return { exit: true, reason: 'Momentum weakening' };
    }
    return { exit: false, reason: 'Trend/momentum still valid' };
  }

  /**
   * Exit logic: Volume/Price Action analysis
   */
  private shouldExitBasedOnVolumePriceAction(current: any, pnl: number): { exit: boolean; reason: string } {
    if (current.candleQuality === 'STRONG_REVERSAL' && current.candleDirection === 'BEARISH' && pnl > 0) {
      return { exit: true, reason: 'Strong bearish reversal candle detected' };
    }
    return { exit: false, reason: 'No reversal pattern' };
  }

  /**
   * Exit logic: Support/Resistance analysis
   */
  private shouldExitBasedOnSR(current: any, price: number, entry: number, pnl: number): { exit: boolean; reason: string } {
    // If price broke key support (for long) or resistance (for short)
    if (entry < price && price < current.nearestSupport) {
      return { exit: true, reason: 'Price broke below support' };
    }
    if (entry > price && price > current.nearestResistance) {
      return { exit: true, reason: 'Price broke above resistance' };
    }
    return { exit: false, reason: 'S/R levels holding' };
  }

  /**
   * Detect if pattern has reversed
   */
  private detectReversal(current: any, entry: any): boolean {
    if (!entry) return false;

    const entryVote = entry.llmConsensus?.fibonacciVote || entry.recommendation;
    const currentVote = current.recommendation;

    // Reversal: Entry was BUY, now 3/4 say SELL (or vice versa)
    if (entryVote === 'BUY' && currentVote === 'SELL' && current.consensus.votesFor >= 3) {
      return true;
    }
    if (entryVote === 'SELL' && currentVote === 'BUY' && current.consensus.votesFor >= 3) {
      return true;
    }

    return false;
  }

  // ==================== HIGHER TIMEFRAME (HTF) ANALYSIS ====================

  /**
   * Get HTF Analysis with caching
   */
  private async getHTFAnalysis(currentPrice: number): Promise<HTFAnalysis> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.htfCache.data && (now - this.htfCache.lastFetch) < this.HTF_CACHE_TTL) {
      // Update proximity check with current price
      return this.updateProximityCheck(this.htfCache.data, currentPrice);
    }

    // Fetch fresh HTF data
    console.log('🔄 Fetching fresh HTF data (4H, Daily, Weekly)...');
    const analysis = await this.analyzeHTFLevels(currentPrice);
    this.htfCache = { data: analysis, lastFetch: now };
    return analysis;
  }

  /**
   * Update proximity check with current price (without refetching levels)
   */
  private updateProximityCheck(cachedData: HTFAnalysis, currentPrice: number): HTFAnalysis {
    const { levels } = cachedData;

    // Re-sort levels by proximity to current price
    const sortedLevels = [...levels].sort((a, b) =>
      Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice)
    );

    // Find nearest support and resistance
    const nearestSupport = sortedLevels.find(l => l.type === 'SUPPORT' && l.price < currentPrice);
    const nearestResistance = sortedLevels.find(l => l.type === 'RESISTANCE' && l.price > currentPrice);

    // Check if we're too close to a critical level
    const isNearSupport = nearestSupport &&
      Math.abs(currentPrice - nearestSupport.price) / currentPrice < this.HTF_PROXIMITY_THRESHOLD;
    const isNearResistance = nearestResistance &&
      Math.abs(nearestResistance.price - currentPrice) / currentPrice < this.HTF_PROXIMITY_THRESHOLD;

    return {
      ...cachedData,
      nearestSupport: nearestSupport ? { price: nearestSupport.price, timeframe: nearestSupport.timeframe } : null,
      nearestResistance: nearestResistance ? { price: nearestResistance.price, timeframe: nearestResistance.timeframe } : null,
      isNearCriticalLevel: !!(isNearSupport || isNearResistance),
      criticalLevelType: isNearResistance ? 'RESISTANCE' : isNearSupport ? 'SUPPORT' : null
    };
  }

  /**
   * Analyze Higher Timeframes (4H, Daily, Weekly) for critical S/R levels
   * Includes both Swing High/Low detection AND Fibonacci Pivot Points
   * BUG FIX: Now stores 4H klines for HH/HL trend detection
   */
  private async analyzeHTFLevels(currentPrice: number): Promise<HTFAnalysis> {
    const levels: HTFLevel[] = [];
    let swingCount = 0;
    let fibCount = 0;
    let klines4H: Kline[] = []; // Store 4H klines for trend detection

    // Fetch klines for each HTF
    for (const tf of this.HTF_TIMEFRAMES) {
      try {
        const klines = await binanceService.getKlines(this.SYMBOL, tf, 100);
        const normalized = this.normalizeKlines(klines);
        const timeframe = tf as '4h' | '1d' | '1w';

        // Store 4H klines for HH/HL trend detection
        if (tf === '4h') {
          klines4H = normalized;
        }

        // 1. Find significant highs and lows (swing points)
        const swingLevels = this.findSwingLevels(normalized, timeframe);
        levels.push(...swingLevels);
        swingCount += swingLevels.length;
        console.log(`   ✓ Found ${swingLevels.length} swing levels on ${tf}`);

        // 2. Calculate Fibonacci Pivot Points
        const fibPivots = this.calculateFibonacciPivots(normalized, timeframe);
        if (fibPivots) {
          // Add Pivot Point (acts as dynamic support/resistance)
          levels.push({
            price: fibPivots.pp, timeframe, type: 'SUPPORT',
            strength: 'STRONG', touches: 0, source: 'FIB_PIVOT', fibLevel: 'PP'
          });

          // Add Fibonacci resistance levels
          levels.push(
            { price: fibPivots.r1, timeframe, type: 'RESISTANCE', strength: 'MODERATE', touches: 0, source: 'FIB_PIVOT', fibLevel: 'R1' },
            { price: fibPivots.r2, timeframe, type: 'RESISTANCE', strength: 'STRONG', touches: 0, source: 'FIB_PIVOT', fibLevel: 'R2' },
            { price: fibPivots.r3, timeframe, type: 'RESISTANCE', strength: 'WEAK', touches: 0, source: 'FIB_PIVOT', fibLevel: 'R3' }
          );

          // Add Fibonacci support levels
          levels.push(
            { price: fibPivots.s1, timeframe, type: 'SUPPORT', strength: 'MODERATE', touches: 0, source: 'FIB_PIVOT', fibLevel: 'S1' },
            { price: fibPivots.s2, timeframe, type: 'SUPPORT', strength: 'STRONG', touches: 0, source: 'FIB_PIVOT', fibLevel: 'S2' },
            { price: fibPivots.s3, timeframe, type: 'SUPPORT', strength: 'WEAK', touches: 0, source: 'FIB_PIVOT', fibLevel: 'S3' }
          );

          fibCount += 7; // PP + R1-R3 + S1-S3
          console.log(`   ✓ Fib Pivots ${tf}: PP=$${fibPivots.pp.toFixed(2)}, R1=$${fibPivots.r1.toFixed(2)}, S1=$${fibPivots.s1.toFixed(2)}`);
        }

      } catch (error: any) {
        console.warn(`   ✗ Failed to analyze ${tf}:`, error.message);
      }
    }

    console.log(`   📊 Total levels: ${levels.length} (${swingCount} swing + ${fibCount} fib pivot)`);

    // Remove duplicate levels (within 0.2% of each other)
    const uniqueLevels = this.deduplicateLevels(levels);

    // Sort levels by proximity to current price
    uniqueLevels.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));

    // Find nearest support and resistance
    const nearestSupport = uniqueLevels.find(l => l.type === 'SUPPORT' && l.price < currentPrice);
    const nearestResistance = uniqueLevels.find(l => l.type === 'RESISTANCE' && l.price > currentPrice);

    // Check if we're too close to a critical level
    const isNearSupport = nearestSupport &&
      Math.abs(currentPrice - nearestSupport.price) / currentPrice < this.HTF_PROXIMITY_THRESHOLD;
    const isNearResistance = nearestResistance &&
      Math.abs(nearestResistance.price - currentPrice) / currentPrice < this.HTF_PROXIMITY_THRESHOLD;

    // Determine HTF trend using 4H candle structure (HH/HL or LH/LL)
    const htfTrend = this.determineHTFTrend(uniqueLevels, currentPrice, klines4H);

    return {
      levels: uniqueLevels,
      nearestSupport: nearestSupport ? { price: nearestSupport.price, timeframe: nearestSupport.timeframe } : null,
      nearestResistance: nearestResistance ? { price: nearestResistance.price, timeframe: nearestResistance.timeframe } : null,
      isNearCriticalLevel: !!(isNearSupport || isNearResistance),
      criticalLevelType: isNearResistance ? 'RESISTANCE' : isNearSupport ? 'SUPPORT' : null,
      htfTrend
    };
  }

  /**
   * Find swing high/low levels from kline data
   */
  private findSwingLevels(klines: Kline[], timeframe: '4h' | '1d' | '1w'): HTFLevel[] {
    const levels: HTFLevel[] = [];

    // Adjust lookback based on timeframe
    const lookback = timeframe === '1w' ? 3 : timeframe === '1d' ? 5 : 8;

    // Need enough candles for lookback on both sides
    if (klines.length < lookback * 2 + 1) {
      return levels;
    }

    for (let i = lookback; i < klines.length - lookback; i++) {
      const current = klines[i];

      // Swing High (resistance) - current high is highest among lookback candles on both sides
      const leftHighs = klines.slice(i - lookback, i).map(k => k.high);
      const rightHighs = klines.slice(i + 1, i + lookback + 1).map(k => k.high);
      const isSwingHigh = leftHighs.every(h => h <= current.high) &&
                          rightHighs.every(h => h <= current.high);

      // Swing Low (support) - current low is lowest among lookback candles on both sides
      const leftLows = klines.slice(i - lookback, i).map(k => k.low);
      const rightLows = klines.slice(i + 1, i + lookback + 1).map(k => k.low);
      const isSwingLow = leftLows.every(l => l >= current.low) &&
                         rightLows.every(l => l >= current.low);

      if (isSwingHigh) {
        // Count touches at this level (within 0.2%)
        const touches = klines.filter(k =>
          Math.abs(k.high - current.high) / current.high < 0.002
        ).length;

        levels.push({
          price: current.high,
          timeframe,
          type: 'RESISTANCE',
          strength: touches >= 3 ? 'STRONG' : touches >= 2 ? 'MODERATE' : 'WEAK',
          touches,
          source: 'SWING'
        });
      }

      if (isSwingLow) {
        // Count touches at this level (within 0.2%)
        const touches = klines.filter(k =>
          Math.abs(k.low - current.low) / current.low < 0.002
        ).length;

        levels.push({
          price: current.low,
          timeframe,
          type: 'SUPPORT',
          strength: touches >= 3 ? 'STRONG' : touches >= 2 ? 'MODERATE' : 'WEAK',
          touches,
          source: 'SWING'
        });
      }
    }

    return levels;
  }

  /**
   * Calculate Fibonacci Pivot Points from the previous period's candle
   * Uses Fibonacci ratios (0.382, 0.618, 1.000) for S/R levels
   */
  private calculateFibonacciPivots(klines: Kline[], timeframe: '4h' | '1d' | '1w'): FibonacciPivotLevels | null {
    if (klines.length < 2) return null;

    // Use the previous CLOSED candle (second to last)
    const prevCandle = klines[klines.length - 2];

    const high = prevCandle.high;
    const low = prevCandle.low;
    const close = prevCandle.close;

    // Calculate Pivot Point: PP = (High + Low + Close) / 3
    const pp = (high + low + close) / 3;
    const range = high - low;

    // Return all Fibonacci pivot levels
    return {
      timeframe,
      pp,
      r1: pp + (range * 0.382),  // 38.2% Fibonacci resistance
      r2: pp + (range * 0.618),  // 61.8% Fibonacci resistance (golden ratio)
      r3: pp + (range * 1.000),  // 100% extension
      s1: pp - (range * 0.382),  // 38.2% Fibonacci support
      s2: pp - (range * 0.618),  // 61.8% Fibonacci support (golden ratio)
      s3: pp - (range * 1.000)   // 100% extension
    };
  }

  /**
   * Remove duplicate levels that are within 0.3% of each other
   * Keeps the level with more touches (stronger)
   */
  private deduplicateLevels(levels: HTFLevel[]): HTFLevel[] {
    const unique: HTFLevel[] = [];
    const threshold = 0.003; // 0.3%

    for (const level of levels) {
      const existingIndex = unique.findIndex(u =>
        u.type === level.type &&
        Math.abs(u.price - level.price) / level.price < threshold
      );

      if (existingIndex === -1) {
        unique.push(level);
      } else {
        // Keep the one with more touches or from higher timeframe
        const existing = unique[existingIndex];
        const tfPriority = { '1w': 3, '1d': 2, '4h': 1 };
        const existingPriority = tfPriority[existing.timeframe] || 0;
        const newPriority = tfPriority[level.timeframe] || 0;

        if (level.touches > existing.touches || newPriority > existingPriority) {
          unique[existingIndex] = level;
        }
      }
    }

    return unique;
  }

  /**
   * Determine overall HTF trend using 4H candle structure (HH/HL or LH/LL)
   * BUG FIX: Uses persistence to prevent rapid trend flipping
   * - Analyzes last 5 candles for structural trend
   * - Requires 2 consecutive confirmations to flip trend
   * - Trend is locked for 1 hour after confirmation
   */
  private determineHTFTrend(levels: HTFLevel[], currentPrice: number, klines4H?: Kline[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const now = Date.now();

    // Return cached trend if still valid (within 1 hour of confirmation)
    if (this.htfTrendState.trend !== 'NEUTRAL' &&
        (now - this.htfTrendState.confirmedAt) < this.HTF_CACHE_TTL) {
      const remainingMins = Math.round((this.HTF_CACHE_TTL - (now - this.htfTrendState.confirmedAt)) / 60000);
      console.log(`🔒 HTF trend locked: ${this.htfTrendState.trend} (expires in ${remainingMins} minutes)`);
      return this.htfTrendState.trend;
    }

    // If no 4H klines provided, use level-based analysis (fallback)
    if (!klines4H || klines4H.length < 5) {
      console.log(`⚠️ No 4H klines for HTF trend, using level-based fallback`);
      return this.determineHTFTrendFromLevels(levels, currentPrice);
    }

    // Analyze last 5 candles on 4H for HH/HL or LH/LL structure
    const last5Candles = klines4H.slice(-5);
    let higherHighs = 0, lowerLows = 0, higherLows = 0, lowerHighs = 0;

    for (let i = 1; i < last5Candles.length; i++) {
      if (last5Candles[i].high > last5Candles[i-1].high) higherHighs++;
      else lowerHighs++;
      if (last5Candles[i].low > last5Candles[i-1].low) higherLows++;
      else lowerLows++;
    }

    console.log(`📊 HTF 4H Structure: HH=${higherHighs} LH=${lowerHighs} HL=${higherLows} LL=${lowerLows}`);

    // Determine detected trend (relaxed: 2+ out of 4 comparisons, majority wins)
    let detectedTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    // Relaxed thresholds: 2+ is enough, and must be majority (was 3+ and only 1 opposite)
    if (higherHighs >= 2 && higherHighs > lowerHighs) detectedTrend = 'BULLISH';
    if (lowerLows >= 2 && lowerLows > higherLows) detectedTrend = 'BEARISH';

    // Handle trend confirmation logic with 2-confirmation requirement for trend flips
    if (detectedTrend !== 'NEUTRAL' && detectedTrend !== this.htfTrendState.trend) {
      // FIX: If currently NEUTRAL (initial state), accept first detected trend immediately
      if (this.htfTrendState.trend === 'NEUTRAL') {
        console.log(`🎯 HTF TREND INITIALIZED: NEUTRAL → ${detectedTrend} (first detection - no confirmation needed)`);
        this.htfTrendState.trend = detectedTrend;
        this.htfTrendState.confirmedAt = now;
        this.htfTrendState.consecutiveConfirmations = 0;
        this.htfTrendState.pendingTrend = null;
      } else if (this.htfTrendState.pendingTrend === detectedTrend) {
        // Existing logic for flipping between BULLISH <-> BEARISH (requires 2 confirmations)
        this.htfTrendState.consecutiveConfirmations++;
        console.log(`📊 HTF trend change pending: ${this.htfTrendState.trend} → ${detectedTrend} (${this.htfTrendState.consecutiveConfirmations}/${this.HTF_CONFIRMS_REQUIRED} confirms)`);

        if (this.htfTrendState.consecutiveConfirmations >= this.HTF_CONFIRMS_REQUIRED) {
          console.log(`🔄 HTF TREND FLIPPED: ${this.htfTrendState.trend} → ${detectedTrend} (confirmed after ${this.HTF_CONFIRMS_REQUIRED} confirmations)`);
          this.htfTrendState.trend = detectedTrend;
          this.htfTrendState.confirmedAt = now;
          this.htfTrendState.consecutiveConfirmations = 0;
          this.htfTrendState.pendingTrend = null;
        }
      } else {
        // New pending trend, reset counter
        this.htfTrendState.pendingTrend = detectedTrend;
        this.htfTrendState.consecutiveConfirmations = 1;
        console.log(`📊 HTF trend change detected: ${detectedTrend} (1/${this.HTF_CONFIRMS_REQUIRED} confirms needed)`);
      }
    } else if (detectedTrend === this.htfTrendState.trend && detectedTrend !== 'NEUTRAL') {
      // Trend confirmed again, reset pending
      this.htfTrendState.pendingTrend = null;
      this.htfTrendState.consecutiveConfirmations = 0;
    }

    return this.htfTrendState.trend || 'NEUTRAL';
  }

  /**
   * Fallback HTF trend detection using S/R level distances (original logic)
   */
  private determineHTFTrendFromLevels(levels: HTFLevel[], currentPrice: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const supports = levels.filter(l => l.type === 'SUPPORT' && l.price < currentPrice);
    const resistances = levels.filter(l => l.type === 'RESISTANCE' && l.price > currentPrice);

    const strongSupportsBelow = supports.filter(s => s.strength === 'STRONG').length;
    const strongResistancesAbove = resistances.filter(r => r.strength === 'STRONG').length;

    const nearestSupport = supports[0];
    const nearestResistance = resistances[0];

    if (!nearestSupport && !nearestResistance) {
      return 'NEUTRAL';
    }

    const distToSupport = nearestSupport ? (currentPrice - nearestSupport.price) / currentPrice : Infinity;
    const distToResistance = nearestResistance ? (nearestResistance.price - currentPrice) / currentPrice : Infinity;

    if (distToResistance > distToSupport * 1.5) {
      return 'BULLISH';
    } else if (distToSupport > distToResistance * 1.5) {
      return 'BEARISH';
    }

    if (strongSupportsBelow > strongResistancesAbove) {
      return 'BULLISH';
    } else if (strongResistancesAbove > strongSupportsBelow) {
      return 'BEARISH';
    }

    return 'NEUTRAL';
  }

  // ==================== PROFESSIONAL ENTRY SYSTEM METHODS ====================

  /**
   * Analyze market structure (HH/HL for bullish, LH/LL for bearish)
   * This is fundamental for understanding trend direction
   */
  private analyzeMarketStructure(klines: Kline[]): MarketStructure {
    const swingHighs: number[] = [];
    const swingLows: number[] = [];
    const lookback = 5; // Candles to confirm swing point

    // Find swing points
    for (let i = lookback; i < klines.length - lookback; i++) {
      const current = klines[i];

      // Swing High: Current high is higher than all surrounding candles
      const isSwingHigh = klines.slice(i - lookback, i).every(k => k.high <= current.high) &&
                          klines.slice(i + 1, i + lookback + 1).every(k => k.high <= current.high);
      if (isSwingHigh) swingHighs.push(current.high);

      // Swing Low: Current low is lower than all surrounding candles
      const isSwingLow = klines.slice(i - lookback, i).every(k => k.low >= current.low) &&
                         klines.slice(i + 1, i + lookback + 1).every(k => k.low >= current.low);
      if (isSwingLow) swingLows.push(current.low);
    }

    // Keep last 4 swing points for analysis
    const recentHighs = swingHighs.slice(-4);
    const recentLows = swingLows.slice(-4);

    // Determine structure
    let trend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    let isValid = false;
    let lastBOS: { type: 'BULLISH' | 'BEARISH'; price: number; timestamp: number } | null = null;

    if (recentHighs.length >= 2 && recentLows.length >= 2) {
      const [prevHigh, currHigh] = recentHighs.slice(-2);
      const [prevLow, currLow] = recentLows.slice(-2);

      // Bullish: Higher Highs AND Higher Lows
      if (currHigh > prevHigh && currLow > prevLow) {
        trend = 'BULLISH';
        isValid = true;
        lastBOS = { type: 'BULLISH', price: prevHigh, timestamp: Date.now() };
      }
      // Bearish: Lower Highs AND Lower Lows
      else if (currHigh < prevHigh && currLow < prevLow) {
        trend = 'BEARISH';
        isValid = true;
        lastBOS = { type: 'BEARISH', price: prevLow, timestamp: Date.now() };
      }
    }

    return {
      trend,
      swingHighs: recentHighs,
      swingLows: recentLows,
      lastBOS,
      isValid
    };
  }

  /**
   * Calculate OTE zone (61.8% - 78.6% Fibonacci retracement)
   * Professional traders wait for price to retrace to this zone before entry
   */
  private calculateOTEZone(
    klines: Kline[],
    marketStructure: MarketStructure,
    currentPrice: number
  ): OTEZone | null {
    if (!marketStructure.isValid) return null;

    const { swingHighs, swingLows, trend } = marketStructure;
    if (swingHighs.length < 1 || swingLows.length < 1) return null;

    const lastSwingHigh = swingHighs[swingHighs.length - 1];
    const lastSwingLow = swingLows[swingLows.length - 1];
    const range = lastSwingHigh - lastSwingLow;

    let oteHigh: number, oteLow: number, equilibrium: number;
    let direction: 'BUY' | 'SELL';

    if (trend === 'BULLISH') {
      // For bullish: OTE is discount zone (retracement from high to low)
      // Buy at 61.8% - 78.6% retracement of the upswing
      oteHigh = lastSwingHigh - (range * 0.618);  // 61.8% retracement
      oteLow = lastSwingHigh - (range * 0.786);   // 78.6% retracement
      equilibrium = lastSwingHigh - (range * 0.5); // 50% level
      direction = 'BUY';
    } else {
      // For bearish: OTE is premium zone (retracement from low to high)
      // Sell at 61.8% - 78.6% retracement of the downswing
      oteLow = lastSwingLow + (range * 0.618);
      oteHigh = lastSwingLow + (range * 0.786);
      equilibrium = lastSwingLow + (range * 0.5);
      direction = 'SELL';
    }

    const isInZone = currentPrice >= Math.min(oteLow, oteHigh) &&
                     currentPrice <= Math.max(oteLow, oteHigh);

    return {
      direction,
      swingHigh: lastSwingHigh,
      swingLow: lastSwingLow,
      oteHigh,
      oteLow,
      isInZone,
      equilibrium
    };
  }

  /**
   * Detect order blocks (institutional supply/demand zones)
   * Bullish OB: Last bearish candle before strong bullish move
   * Bearish OB: Last bullish candle before strong bearish move
   */
  private findOrderBlocks(klines: Kline[], currentPrice: number): OrderBlock[] {
    const orderBlocks: OrderBlock[] = [];
    const minMovePercent = 0.003; // 0.3% minimum move after OB

    for (let i = 2; i < klines.length - 4; i++) {
      const current = klines[i];
      const next = klines[i + 1];
      const moveAfter = klines.slice(i + 1, i + 4);

      // Calculate move percentage after this candle
      const maxMoveUp = Math.max(...moveAfter.map(k => k.high)) - current.close;
      const maxMoveDown = current.close - Math.min(...moveAfter.map(k => k.low));
      const movePercentUp = maxMoveUp / current.close;
      const movePercentDown = maxMoveDown / current.close;

      // Bullish Order Block: Bearish candle followed by strong bullish move
      if (current.close < current.open &&  // Bearish candle
          next.close > next.open &&         // Next is bullish
          movePercentUp >= minMovePercent) { // Significant move up

        const zone = { high: current.open, low: current.low };
        let strength: 'FRESH' | 'TESTED' | 'MITIGATED';

        if (currentPrice > zone.high) {
          strength = 'FRESH';
        } else if (currentPrice >= zone.low) {
          strength = 'TESTED';
        } else {
          strength = 'MITIGATED';
        }

        if (strength !== 'MITIGATED') {
          orderBlocks.push({
            type: 'BULLISH',
            zone,
            strength,
            timestamp: current.openTime
          });
        }
      }

      // Bearish Order Block: Bullish candle followed by strong bearish move
      if (current.close > current.open &&  // Bullish candle
          next.close < next.open &&         // Next is bearish
          movePercentDown >= minMovePercent) { // Significant move down

        const zone = { high: current.high, low: current.open };
        let strength: 'FRESH' | 'TESTED' | 'MITIGATED';

        if (currentPrice < zone.low) {
          strength = 'FRESH';
        } else if (currentPrice <= zone.high) {
          strength = 'TESTED';
        } else {
          strength = 'MITIGATED';
        }

        if (strength !== 'MITIGATED') {
          orderBlocks.push({
            type: 'BEARISH',
            zone,
            strength,
            timestamp: current.openTime
          });
        }
      }
    }

    // Return most recent order blocks (last 3)
    return orderBlocks.slice(-3);
  }

  /**
   * Identify liquidity pools (stop losses) above/below recent highs/lows
   * Smart money often sweeps liquidity before reversing
   */
  private analyzeLiquidity(
    klines: Kline[],
    marketStructure: MarketStructure,
    currentPrice: number
  ): LiquidityAnalysis {
    const buyStops = marketStructure.swingHighs.filter(h => h > currentPrice);
    const sellStops = marketStructure.swingLows.filter(l => l < currentPrice);

    // Detect recent liquidity sweep (price broke above high then reversed, or vice versa)
    let recentSweep: { type: 'BUY_STOPS' | 'SELL_STOPS'; price: number; timestamp: number } | null = null;
    const recent = klines.slice(-10);

    for (let i = 0; i < recent.length - 1; i++) {
      const candle = recent[i];

      // Buy stop sweep: Price wicked above swing high then closed below
      for (const swingHigh of marketStructure.swingHighs) {
        if (candle.high > swingHigh && candle.close < swingHigh) {
          recentSweep = {
            type: 'BUY_STOPS',
            price: swingHigh,
            timestamp: candle.openTime
          };
        }
      }

      // Sell stop sweep: Price wicked below swing low then closed above
      for (const swingLow of marketStructure.swingLows) {
        if (candle.low < swingLow && candle.close > swingLow) {
          recentSweep = {
            type: 'SELL_STOPS',
            price: swingLow,
            timestamp: candle.openTime
          };
        }
      }
    }

    return { buyStops, sellStops, recentSweep };
  }

  /**
   * Validate entry using professional concepts (SMC + OTE + Market Structure)
   * Returns entry quality score (0-100) and reasoning
   */
  private validateProfessionalEntry(
    klines: Kline[],
    currentPrice: number,
    signalDirection: 'BUY' | 'SELL'
  ): ProfessionalEntrySignal {
    const reasoning: string[] = [];
    let score = 0;

    // 1. Analyze Market Structure (+30 points max)
    const marketStructure = this.analyzeMarketStructure(klines);

    if (marketStructure.isValid) {
      if ((signalDirection === 'BUY' && marketStructure.trend === 'BULLISH') ||
          (signalDirection === 'SELL' && marketStructure.trend === 'BEARISH')) {
        score += 30;
        reasoning.push(`✅ Market structure aligned: ${marketStructure.trend} (HH/HL or LH/LL confirmed)`);
      } else {
        reasoning.push(`⚠️ Counter-trend entry: Signal is ${signalDirection} but structure is ${marketStructure.trend}`);
      }
    } else {
      reasoning.push(`⚠️ Market structure unclear (ranging)`);
      score += 10; // Small points for neutral structure
    }

    // 2. Check OTE Zone (+30 points max)
    const oteZone = this.calculateOTEZone(klines, marketStructure, currentPrice);
    if (oteZone) {
      if (oteZone.isInZone && oteZone.direction === signalDirection) {
        score += 30;
        reasoning.push(`✅ Price in OTE zone ($${oteZone.oteLow.toFixed(2)} - $${oteZone.oteHigh.toFixed(2)})`);
      } else if (signalDirection === 'BUY' && currentPrice < oteZone.equilibrium) {
        score += 15;
        reasoning.push(`✅ Price in discount zone (below 50% equilibrium at $${oteZone.equilibrium.toFixed(2)})`);
      } else if (signalDirection === 'SELL' && currentPrice > oteZone.equilibrium) {
        score += 15;
        reasoning.push(`✅ Price in premium zone (above 50% equilibrium at $${oteZone.equilibrium.toFixed(2)})`);
      } else {
        reasoning.push(`⚠️ Price not in optimal entry zone`);
      }
    } else {
      reasoning.push(`⚠️ Cannot calculate OTE zone (no valid structure)`);
    }

    // 3. Order Block Confirmation (+25 points max)
    const orderBlocks = this.findOrderBlocks(klines, currentPrice);
    const relevantOB = orderBlocks.find(ob =>
      (signalDirection === 'BUY' && ob.type === 'BULLISH' &&
       currentPrice >= ob.zone.low && currentPrice <= ob.zone.high) ||
      (signalDirection === 'SELL' && ob.type === 'BEARISH' &&
       currentPrice >= ob.zone.low && currentPrice <= ob.zone.high)
    );

    if (relevantOB) {
      const obPoints = relevantOB.strength === 'FRESH' ? 25 : 15;
      score += obPoints;
      reasoning.push(`✅ ${relevantOB.strength} ${relevantOB.type} Order Block at $${relevantOB.zone.low.toFixed(2)}-$${relevantOB.zone.high.toFixed(2)}`);
    } else {
      reasoning.push(`⚠️ No relevant order block at current price`);
    }

    // 4. Liquidity Analysis (+15 points max)
    const liquidity = this.analyzeLiquidity(klines, marketStructure, currentPrice);
    if (liquidity.recentSweep) {
      // Liquidity sweep is bullish for BUY after sell stops swept, bearish for SELL after buy stops swept
      if ((signalDirection === 'BUY' && liquidity.recentSweep.type === 'SELL_STOPS') ||
          (signalDirection === 'SELL' && liquidity.recentSweep.type === 'BUY_STOPS')) {
        score += 15;
        reasoning.push(`✅ Recent liquidity sweep: ${liquidity.recentSweep.type} at $${liquidity.recentSweep.price.toFixed(2)}`);
      } else {
        reasoning.push(`⚠️ Recent liquidity sweep in opposite direction`);
      }
    } else {
      reasoning.push(`⚠️ No recent liquidity sweep detected`);
    }

    return {
      isValid: score >= 50, // Minimum 50/100 score for valid entry
      score,
      marketStructure,
      oteZone,
      orderBlock: relevantOB || null,
      liquidity,
      reasoning
    };
  }

  // ==================== NEW: Dynamic Filter Methods ====================

  /**
   * Get minimum R:R ratio based on confidence level
   * Higher confidence allows lower R:R (we trust the signal more)
   */
  private getMinRiskRewardRatio(confidence: number): number {
    const { RR_BY_CONFIDENCE } = FILTER_CONFIG;
    if (confidence >= RR_BY_CONFIDENCE.HIGH.minConfidence) return RR_BY_CONFIDENCE.HIGH.minRR;
    if (confidence >= RR_BY_CONFIDENCE.MEDIUM.minConfidence) return RR_BY_CONFIDENCE.MEDIUM.minRR;
    if (confidence >= RR_BY_CONFIDENCE.STANDARD.minConfidence) return RR_BY_CONFIDENCE.STANDARD.minRR;
    return RR_BY_CONFIDENCE.LOW.minRR;
  }

  /**
   * Get required consensus based on confidence and HTF alignment
   * High confidence + HTF aligned = only need 2/4 agreement
   */
  private getRequiredConsensus(confidence: number, htfAligned: boolean): number {
    const { CONSENSUS } = FILTER_CONFIG;
    if (confidence >= 80 && htfAligned) {
      return CONSENSUS.HIGH_CONFIDENCE_HTF_ALIGNED;
    }
    return CONSENSUS.STANDARD;
  }

  /**
   * Calculate trade quality score (0-100)
   * Components: Consensus(25) + Confidence(25) + R:R(20) + HTF(15) + ProScore(15)
   */
  private calculateTradeQualityScore(
    consensusVotes: number,
    confidence: number,
    riskReward: number,
    htfAligned: boolean,
    htfNeutral: boolean,
    proScore: number
  ): TradeQualityScore {
    const components = {
      // Consensus: 4/4=25, 3/4=18, 2/4=12
      consensus: consensusVotes === 4 ? 25 : consensusVotes === 3 ? 18 : 12,

      // Confidence: scale 60-100% to 0-25 points
      confidence: Math.max(0, Math.min(25, Math.round((confidence - 60) * 0.625))),

      // R:R: scale 1.0+ to points (no cap - high R:R gets more points)
      riskReward: Math.max(0, Math.round((riskReward - 1.0) * 20)),

      // HTF: aligned=15, neutral=8, misaligned=0
      htfAlignment: htfAligned ? 15 : htfNeutral ? 8 : 0,

      // Pro Score: scale 35-100 to 0-15 points
      proScore: Math.max(0, Math.min(15, Math.round((proScore - 35) * 0.23)))
    };

    const total = Object.values(components).reduce((a, b) => a + b, 0);
    const { QUALITY } = FILTER_CONFIG;

    const grade: 'A' | 'B' | 'C' | 'D' = total >= QUALITY.GRADE_A_MIN ? 'A'
      : total >= QUALITY.GRADE_B_MIN ? 'B'
      : total >= 40 ? 'C'
      : 'D';

    return {
      total,
      grade,
      components,
      positionSizeMultiplier: grade === 'A' ? QUALITY.GRADE_A_SIZE_MULTIPLIER : QUALITY.GRADE_B_SIZE_MULTIPLIER
    };
  }

  /**
   * Calculate position size multiplier based on pro score and warnings
   * Never rejects - always returns a multiplier between 0.175 and 1.0
   */
  private calculateProScoreMultiplier(
    proScore: number,
    reasoning: string[]
  ): { multiplier: number; warningCount: number } {
    const { MULTIPLIERS } = FILTER_CONFIG.PRO_SCORE;

    // Base multiplier from score tier
    let baseMultiplier: number;
    if (proScore >= MULTIPLIERS.TIER_1_MIN) baseMultiplier = MULTIPLIERS.TIER_1_SIZE;
    else if (proScore >= MULTIPLIERS.TIER_2_MIN) baseMultiplier = MULTIPLIERS.TIER_2_SIZE;
    else if (proScore >= MULTIPLIERS.TIER_3_MIN) baseMultiplier = MULTIPLIERS.TIER_3_SIZE;
    else baseMultiplier = MULTIPLIERS.TIER_4_SIZE;

    // Count warnings (lines starting with warning emoji) and apply penalty
    const warningCount = reasoning.filter(r => r.startsWith('⚠️')).length;
    const warningMult = Math.max(MULTIPLIERS.MIN_WARNING_MULT, 1 - (warningCount * MULTIPLIERS.WARNING_PENALTY));

    return {
      multiplier: baseMultiplier * warningMult,
      warningCount
    };
  }
}

export const btcMultiPatternScalpingService = new BTCMultiPatternScalpingService();
