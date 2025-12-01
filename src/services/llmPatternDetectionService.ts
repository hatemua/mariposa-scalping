import axios, { AxiosInstance } from 'axios';
import { config } from '../config/environment';
import {
  SMA,
  EMA,
  RSI,
  MACD,
  BollingerBands,
  Stochastic,
  ATR,
  ADX
} from 'technicalindicators';

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface TechnicalIndicators {
  rsi: number;
  macd: {
    MACD: number;
    signal: number;
    histogram: number;
  };
  stochastic: {
    k: number;
    d: number;
  };
  atr: number;
  adx: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  volumeRatio: number; // Current volume vs average
  ema20: number;
  ema50: number;
  sma200: number;
}

interface FibonacciPattern {
  type: 'RETRACEMENT' | 'EXTENSION' | 'GOLDEN_POCKET' | 'CHANNEL';
  levels: number[];
  currentLevel: number | null; // Which Fibonacci level price is near
  swingHigh: number;
  swingLow: number;
  entryZone: { min: number; max: number } | null;
  targetZone: { min: number; max: number } | null;
  confidence: number;
  recommendation?: 'BUY' | 'SELL' | 'HOLD'; // Direct recommendation from LLM
  reasoning: string;
}

interface ChartPattern {
  type: 'HEAD_SHOULDERS' | 'TRIANGLE' | 'FLAG' | 'WEDGE' | 'DOUBLE_TOP' | 'DOUBLE_BOTTOM' | 'NONE';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  completionPercentage: number;
  breakoutTarget: number | null;
  invalidationLevel: number | null;
  confidence: number;
  recommendation?: 'BUY' | 'SELL' | 'HOLD'; // Direct recommendation from LLM
  reasoning: string;
}

interface CandlestickPattern {
  patterns: string[]; // e.g., ['BULLISH_ENGULFING', 'HAMMER']
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  recentPatterns: Array<{
    name: string;
    candles: number; // How many candles ago
    significance: number;
  }>;
  confidence: number;
  recommendation?: 'BUY' | 'SELL' | 'HOLD'; // Direct recommendation from LLM
  reasoning: string;
}

interface SupportResistancePattern {
  keyLevels: Array<{
    price: number;
    type: 'SUPPORT' | 'RESISTANCE';
    strength: 'WEAK' | 'MODERATE' | 'STRONG';
    touches: number;
  }>;
  nearestSupport: number;
  nearestResistance: number;
  currentZone: 'SUPPORT' | 'RESISTANCE' | 'NEUTRAL';
  trendline: {
    slope: 'ASCENDING' | 'DESCENDING' | 'FLAT';
    strength: number;
  } | null;
  confidence: number;
  recommendation?: 'BUY' | 'SELL' | 'HOLD'; // Direct recommendation from LLM
  reasoning: string;
}

interface PatternAnalysisInput {
  klines: Kline[];
  indicators: TechnicalIndicators;
  currentPrice: number;
  timeframe: string;
}

interface LLMResponse {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  patternData: any;
  reasoning: string;
}

export class LLMPatternDetectionService {
  private apiKey: string;
  private baseURL = 'https://api.together.xyz';
  private httpClient: AxiosInstance;

  // 4 Specialist models - using efficient 7B-11B models
  private readonly FIBONACCI_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
  private readonly CHART_PATTERN_MODEL = 'Qwen/Qwen2.5-7B-Instruct-Turbo';
  private readonly CANDLESTICK_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';
  private readonly SR_MODEL = 'Qwen/Qwen2.5-7B-Instruct-Turbo';

  constructor() {
    this.apiKey = config.TOGETHER_AI_API_KEY;
    this.httpClient = axios.create({
      baseURL: this.baseURL,
      timeout: 60000, // 60 seconds for pattern detection
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Calculate all technical indicators from klines
   */
  calculateIndicators(klines: Kline[]): TechnicalIndicators {
    const closes = klines.map(k => k.close);
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    const volumes = klines.map(k => k.volume);

    // RSI (14 period)
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const rsi = rsiValues[rsiValues.length - 1] || 50;

    // MACD (12, 26, 9)
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const macdLast = macdValues[macdValues.length - 1];
    const macd = {
      MACD: macdLast?.MACD || 0,
      signal: macdLast?.signal || 0,
      histogram: macdLast?.histogram || 0
    };

    // Stochastic (14, 3, 3)
    const stochValues = Stochastic.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
      signalPeriod: 3
    });
    const stoch = stochValues[stochValues.length - 1] || { k: 50, d: 50 };

    // ATR (14 period)
    const atrValues = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14
    });
    const atr = atrValues[atrValues.length - 1] || 0;

    // ADX (14 period)
    const adxValues = ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14
    });
    const adx = adxValues[adxValues.length - 1]?.adx || 0;

    // Bollinger Bands (20, 2)
    const bbValues = BollingerBands.calculate({
      period: 20,
      values: closes,
      stdDev: 2
    });
    const bb = bbValues[bbValues.length - 1] || { upper: 0, middle: 0, lower: 0 };

    // EMAs
    const ema20Values = EMA.calculate({ values: closes, period: 20 });
    const ema20 = ema20Values[ema20Values.length - 1] || closes[closes.length - 1];

    const ema50Values = EMA.calculate({ values: closes, period: 50 });
    const ema50 = ema50Values[ema50Values.length - 1] || closes[closes.length - 1];

    // SMA 200
    const sma200Values = SMA.calculate({ values: closes, period: Math.min(200, closes.length) });
    const sma200 = sma200Values[sma200Values.length - 1] || closes[closes.length - 1];

    // Volume ratio
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = volumes[volumes.length - 1] / avgVolume;

    return {
      rsi,
      macd,
      stochastic: stoch,
      atr,
      adx,
      bollingerBands: bb,
      volumeRatio,
      ema20,
      ema50,
      sma200
    };
  }

  /**
   * Specialist 1: Fibonacci Pattern Detection
   */
  async analyzeFibonacciPatterns(input: PatternAnalysisInput): Promise<FibonacciPattern> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Find swing high and low
    const closes = klines.map(k => k.close);
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);

    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);

    // Calculate Fibonacci levels
    const range = swingHigh - swingLow;
    const fibLevels = {
      level_0: swingLow,
      level_236: swingLow + range * 0.236,
      level_382: swingLow + range * 0.382,
      level_500: swingLow + range * 0.500,
      level_618: swingLow + range * 0.618,
      level_786: swingLow + range * 0.786,
      level_100: swingHigh,
      ext_1272: swingHigh + range * 0.272,
      ext_1618: swingHigh + range * 0.618,
      ext_2618: swingHigh + range * 1.618
    };

    // Format klines for LLM (last 50 candles)
    const recentKlines = klines.slice(-50).map((k, i) => ({
      index: i,
      open: k.open.toFixed(2),
      high: k.high.toFixed(2),
      low: k.low.toFixed(2),
      close: k.close.toFixed(2),
      volume: k.volume.toFixed(2)
    }));

    const prompt = `You are a Fibonacci trading pattern specialist analyzing BTC/USDT on ${timeframe} timeframe.

CURRENT DATA:
- Current Price: $${currentPrice.toFixed(2)}
- Swing High: $${swingHigh.toFixed(2)}
- Swing Low: $${swingLow.toFixed(2)}

FIBONACCI LEVELS:
- 0%: $${fibLevels.level_0.toFixed(2)}
- 23.6%: $${fibLevels.level_236.toFixed(2)}
- 38.2%: $${fibLevels.level_382.toFixed(2)}
- 50%: $${fibLevels.level_500.toFixed(2)}
- 61.8% (Golden): $${fibLevels.level_618.toFixed(2)}
- 78.6%: $${fibLevels.level_786.toFixed(2)}
- 100%: $${fibLevels.level_100.toFixed(2)}
- Extension 127.2%: $${fibLevels.ext_1272.toFixed(2)}
- Extension 161.8%: $${fibLevels.ext_1618.toFixed(2)}
- Extension 261.8%: $${fibLevels.ext_2618.toFixed(2)}

TECHNICAL INDICATORS:
- RSI: ${indicators.rsi.toFixed(2)}
- MACD: ${indicators.macd.MACD.toFixed(2)}, Signal: ${indicators.macd.signal.toFixed(2)}
- Stochastic K: ${indicators.stochastic.k.toFixed(2)}, D: ${indicators.stochastic.d.toFixed(2)}
- ATR: ${indicators.atr.toFixed(2)}
- Volume Ratio: ${indicators.volumeRatio.toFixed(2)}x

RECENT PRICE ACTION (last 50 candles):
${JSON.stringify(recentKlines.slice(-10), null, 2)}

TASK:
Analyze if price is at a key Fibonacci level for entry. Consider BOTH long and short opportunities.

BULLISH SETUP (recommend BUY):
1. Price bouncing off 61.8% or 78.6% retracement (Golden Pocket) in UPTREND
2. Price respecting Fibonacci support levels with confirmations
3. RSI oversold at Fib support level
4. Price pulling back to test previous breakout level

BEARISH SETUP (recommend SELL):
1. Price rejecting at 61.8% or 78.6% retracement in DOWNTREND
2. Price failing at Fibonacci resistance levels (38.2%, 50%, 61.8%)
3. RSI overbought at Fib resistance level
4. Price retracing up into a sell zone (premium zone above 50% in downtrend)
5. Failed breakout - price pushed above Fib level but immediately rejected

CRITICAL: In a DOWNTREND, if price retraces to 50%-61.8% and shows rejection, recommend SELL.
Use Fibonacci extension levels for take profit targets.

Respond ONLY with valid JSON (no markdown):
{
  "type": "RETRACEMENT" | "EXTENSION" | "GOLDEN_POCKET" | "CHANNEL",
  "currentLevel": 236 | 382 | 500 | 618 | 786 | 1272 | 1618 | 2618 | null,
  "entryZone": {"min": number, "max": number} | null,
  "targetZone": {"min": number, "max": number} | null,
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence": number (0-100),
  "reasoning": "Brief explanation of Fibonacci pattern and why entry/exit here"
}`;

    try {
      const response = await this.callLLM(this.FIBONACCI_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      // Always extract vote from reasoning as backup
      const reasoningVote = this.extractVoteFromReasoning(analysis.reasoning || '');

      // If LLM returned HOLD or nothing, prefer reasoning extraction
      if (!analysis.recommendation || analysis.recommendation === 'HOLD') {
        console.warn(`⚠️  Fibonacci LLM returned ${analysis.recommendation || 'missing'}, using reasoning extraction: ${reasoningVote}`);
        analysis.recommendation = reasoningVote;
      }

      return {
        type: analysis.type,
        levels: Object.values(fibLevels),
        currentLevel: analysis.currentLevel,
        swingHigh,
        swingLow,
        entryZone: analysis.entryZone,
        targetZone: analysis.targetZone,
        confidence: analysis.confidence,
        recommendation: analysis.recommendation, // Extract LLM recommendation
        reasoning: analysis.reasoning
      };
    } catch (error: any) {
      console.error('Fibonacci analysis error:', error.message);
      return {
        type: 'RETRACEMENT',
        levels: Object.values(fibLevels),
        currentLevel: null,
        swingHigh,
        swingLow,
        entryZone: null,
        targetZone: null,
        confidence: 0,
        recommendation: 'HOLD',
        reasoning: 'Analysis failed'
      };
    }
  }

  /**
   * Specialist 2: Chart Pattern Detection
   */
  async analyzeChartPatterns(input: PatternAnalysisInput): Promise<ChartPattern> {
    const { klines, indicators, currentPrice, timeframe } = input;

    const recentKlines = klines.slice(-50).map((k, i) => ({
      index: i,
      open: k.open.toFixed(2),
      high: k.high.toFixed(2),
      low: k.low.toFixed(2),
      close: k.close.toFixed(2),
      volume: k.volume.toFixed(2)
    }));

    const prompt = `You are a chart pattern recognition specialist analyzing BTC/USDT on ${timeframe} timeframe.

CURRENT PRICE: $${currentPrice.toFixed(2)}

TECHNICAL INDICATORS:
- RSI: ${indicators.rsi.toFixed(2)}
- ADX (Trend Strength): ${indicators.adx.toFixed(2)}
- EMA20: ${indicators.ema20.toFixed(2)}, EMA50: ${indicators.ema50.toFixed(2)}
- Bollinger Upper: ${indicators.bollingerBands.upper.toFixed(2)}, Lower: ${indicators.bollingerBands.lower.toFixed(2)}

RECENT PRICE ACTION (last 50 candles):
${JSON.stringify(recentKlines.slice(-15), null, 2)}

TASK:
Identify chart patterns. Be EQUALLY attentive to BEARISH and BULLISH patterns.

BULLISH PATTERNS (signal BUY):
- Inverse Head and Shoulders (bottom reversal)
- Ascending Triangle (breakout up)
- Bull Flag / Bullish Pennant
- Falling Wedge (reversal up)
- Double Bottom / Triple Bottom
- Cup and Handle

BEARISH PATTERNS (signal SELL):
- Head and Shoulders Top (major reversal signal)
- Descending Triangle (breakdown)
- Bear Flag / Bearish Pennant
- Rising Wedge (reversal down)
- Double Top / Triple Top
- Failed Breakout at resistance (price rejected after attempted breakout)

IMPORTANT: If you detect a BEARISH pattern, you MUST recommend SELL.
Analyze pattern completion percentage, breakout direction, and invalidation levels.

Respond ONLY with valid JSON (no markdown):
{
  "type": "HEAD_SHOULDERS" | "TRIANGLE" | "FLAG" | "WEDGE" | "DOUBLE_TOP" | "DOUBLE_BOTTOM" | "NONE",
  "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "completionPercentage": number (0-100),
  "breakoutTarget": number | null,
  "invalidationLevel": number | null,
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence": number (0-100),
  "reasoning": "Brief explanation of detected pattern"
}`;

    try {
      const response = await this.callLLM(this.CHART_PATTERN_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      // Always extract vote from reasoning as backup
      const reasoningVote = this.extractVoteFromReasoning(analysis.reasoning || '');

      // If LLM returned HOLD or nothing, prefer reasoning extraction
      if (!analysis.recommendation || analysis.recommendation === 'HOLD') {
        console.warn(`⚠️  Chart Pattern LLM returned ${analysis.recommendation || 'missing'}, using reasoning extraction: ${reasoningVote}`);
        analysis.recommendation = reasoningVote;
      }

      return {
        type: analysis.type,
        direction: analysis.direction,
        completionPercentage: analysis.completionPercentage,
        breakoutTarget: analysis.breakoutTarget,
        invalidationLevel: analysis.invalidationLevel,
        confidence: analysis.confidence,
        recommendation: analysis.recommendation, // Extract LLM recommendation
        reasoning: analysis.reasoning
      };
    } catch (error: any) {
      console.error('Chart pattern analysis error:', error.message);
      return {
        type: 'NONE',
        direction: 'NEUTRAL',
        completionPercentage: 0,
        breakoutTarget: null,
        invalidationLevel: null,
        confidence: 0,
        recommendation: 'HOLD',
        reasoning: 'Analysis failed'
      };
    }
  }

  /**
   * Specialist 3: Candlestick Pattern Detection
   */
  async analyzeCandlestickPatterns(input: PatternAnalysisInput): Promise<CandlestickPattern> {
    const { klines, indicators, currentPrice, timeframe } = input;

    const recentKlines = klines.slice(-30).map((k, i) => ({
      index: i,
      open: k.open.toFixed(2),
      high: k.high.toFixed(2),
      low: k.low.toFixed(2),
      close: k.close.toFixed(2),
      bodySize: Math.abs(k.close - k.open).toFixed(2),
      upperWick: (k.high - Math.max(k.open, k.close)).toFixed(2),
      lowerWick: (Math.min(k.open, k.close) - k.low).toFixed(2),
      bullish: k.close > k.open
    }));

    const prompt = `You are a Japanese candlestick pattern specialist analyzing BTC/USDT on ${timeframe} timeframe.

CURRENT PRICE: $${currentPrice.toFixed(2)}

TECHNICAL INDICATORS:
- RSI: ${indicators.rsi.toFixed(2)}
- Stochastic K: ${indicators.stochastic.k.toFixed(2)}, D: ${indicators.stochastic.d.toFixed(2)}
- Volume Ratio: ${indicators.volumeRatio.toFixed(2)}x

RECENT CANDLESTICKS (last 30 candles):
${JSON.stringify(recentKlines.slice(-10), null, 2)}

TASK:
Identify candlestick patterns. Be EQUALLY attentive to BEARISH and BULLISH patterns.

BULLISH PATTERNS (signal BUY):
- Bullish Engulfing (especially at support)
- Hammer (long lower wick, at support)
- Inverted Hammer (at bottom)
- Morning Star (3-candle reversal)
- Piercing Line
- Three White Soldiers
- Tweezer Bottom

BEARISH PATTERNS (signal SELL):
- Bearish Engulfing (ESPECIALLY at resistance - strong SELL signal)
- Shooting Star (long upper wick, at resistance)
- Hanging Man (at top)
- Evening Star (3-candle reversal - SELL)
- Dark Cloud Cover
- Three Black Crows
- Tweezer Top
- Gravestone Doji (at resistance)

CRITICAL: If price is at/near resistance AND you see bearish patterns, you MUST recommend SELL.
Focus on recent patterns (last 5-10 candles) and their significance.

Respond ONLY with valid JSON (no markdown):
{
  "patterns": ["PATTERN_NAME_1", "PATTERN_NAME_2"],
  "strength": "WEAK" | "MODERATE" | "STRONG",
  "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "recentPatterns": [
    {"name": "PATTERN_NAME", "candles": number, "significance": number (0-100)}
  ],
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence": number (0-100),
  "reasoning": "Brief explanation of candlestick patterns"
}`;

    try {
      const response = await this.callLLM(this.CANDLESTICK_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      // Always extract vote from reasoning as backup
      const reasoningVote = this.extractVoteFromReasoning(analysis.reasoning || '');

      // If LLM returned HOLD or nothing, prefer reasoning extraction
      if (!analysis.recommendation || analysis.recommendation === 'HOLD') {
        console.warn(`⚠️  Candlestick LLM returned ${analysis.recommendation || 'missing'}, using reasoning extraction: ${reasoningVote}`);
        analysis.recommendation = reasoningVote;
      }

      return {
        patterns: analysis.patterns || [],
        strength: analysis.strength,
        direction: analysis.direction,
        recentPatterns: analysis.recentPatterns || [],
        confidence: analysis.confidence,
        recommendation: analysis.recommendation, // Extract LLM recommendation
        reasoning: analysis.reasoning
      };
    } catch (error: any) {
      console.error('Candlestick pattern analysis error:', error.message);
      return {
        patterns: [],
        strength: 'WEAK',
        direction: 'NEUTRAL',
        recentPatterns: [],
        confidence: 0,
        recommendation: 'HOLD',
        reasoning: 'Analysis failed'
      };
    }
  }

  /**
   * Specialist 4: Support/Resistance Detection
   */
  async analyzeSupportResistance(input: PatternAnalysisInput): Promise<SupportResistancePattern> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Find local highs and lows for S/R levels
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);

    // Simple S/R detection: find local extremes
    const levels: Array<{ price: number; type: 'SUPPORT' | 'RESISTANCE'; touches: number }> = [];

    // This is a simplified approach - LLM will provide better analysis
    const recentKlines = klines.slice(-50).map((k, i) => ({
      index: i,
      high: k.high.toFixed(2),
      low: k.low.toFixed(2),
      close: k.close.toFixed(2)
    }));

    const prompt = `You are a support/resistance and price action specialist analyzing BTC/USDT on ${timeframe} timeframe.

CURRENT PRICE: $${currentPrice.toFixed(2)}

TECHNICAL INDICATORS:
- EMA20: ${indicators.ema20.toFixed(2)}, EMA50: ${indicators.ema50.toFixed(2)}, SMA200: ${indicators.sma200.toFixed(2)}
- ADX: ${indicators.adx.toFixed(2)}
- Bollinger Upper: ${indicators.bollingerBands.upper.toFixed(2)}, Middle: ${indicators.bollingerBands.middle.toFixed(2)}, Lower: ${indicators.bollingerBands.lower.toFixed(2)}

RECENT PRICE ACTION (last 50 candles):
${JSON.stringify(recentKlines.slice(-15), null, 2)}

TASK:
Identify key support and resistance levels AND determine if we should BUY or SELL.

KEY LEVELS TO IDENTIFY:
1. Horizontal support/resistance (multiple touches)
2. Dynamic S/R (moving averages - EMA20, EMA50, SMA200)
3. Trendlines (ascending/descending)
4. Order blocks and institutional levels
5. Previous highs/lows

BEARISH SIGNALS (recommend SELL):
- Price rejected at strong resistance (failed to break through)
- Lower highs forming (downtrend structure)
- Support breakdown imminent (price testing support multiple times)
- Price below EMA20 AND EMA50 (bearish momentum)
- Descending trendline respected

BULLISH SIGNALS (recommend BUY):
- Price bouncing off strong support
- Higher lows forming (uptrend structure)
- Resistance breakout imminent
- Price above EMA20 AND EMA50 (bullish momentum)
- Ascending trendline respected

CRITICAL: If price is at resistance and showing rejection, recommend SELL.
Determine current price context and nearest levels.

Respond ONLY with valid JSON (no markdown):
{
  "keyLevels": [
    {"price": number, "type": "SUPPORT" | "RESISTANCE", "strength": "WEAK" | "MODERATE" | "STRONG", "touches": number}
  ],
  "nearestSupport": number,
  "nearestResistance": number,
  "currentZone": "SUPPORT" | "RESISTANCE" | "NEUTRAL",
  "trendline": {"slope": "ASCENDING" | "DESCENDING" | "FLAT", "strength": number (0-100)} | null,
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence": number (0-100),
  "reasoning": "Brief explanation of S/R analysis"
}`;

    try {
      const response = await this.callLLM(this.SR_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      // Always extract vote from reasoning as backup
      const reasoningVote = this.extractVoteFromReasoning(analysis.reasoning || '');

      // If LLM returned HOLD or nothing, prefer reasoning extraction
      if (!analysis.recommendation || analysis.recommendation === 'HOLD') {
        console.warn(`⚠️  S/R LLM returned ${analysis.recommendation || 'missing'}, using reasoning extraction: ${reasoningVote}`);
        analysis.recommendation = reasoningVote;
      }

      return {
        keyLevels: analysis.keyLevels || [],
        nearestSupport: analysis.nearestSupport,
        nearestResistance: analysis.nearestResistance,
        currentZone: analysis.currentZone,
        trendline: analysis.trendline,
        confidence: analysis.confidence,
        recommendation: analysis.recommendation, // Extract LLM recommendation
        reasoning: analysis.reasoning
      };
    } catch (error: any) {
      console.error('Support/Resistance analysis error:', error.message);
      return {
        keyLevels: [],
        nearestSupport: currentPrice * 0.98,
        nearestResistance: currentPrice * 1.02,
        currentZone: 'NEUTRAL',
        trendline: null,
        confidence: 0,
        recommendation: 'HOLD',
        reasoning: 'Analysis failed'
      };
    }
  }

  /**
   * Extract vote from reasoning text (fallback when recommendation field missing)
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
   * Call LLM with retry logic
   */
  private async callLLM(model: string, prompt: string): Promise<string> {
    const response = await this.httpClient.post('/v1/chat/completions', {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional cryptocurrency technical analysis expert. Always respond with valid JSON only, no markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      top_p: 0.9
    });

    return response.data.choices[0].message.content;
  }

  /**
   * Parse JSON response from LLM, handling markdown code blocks
   */
  private parseJSONResponse(response: string): any {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Failed to parse LLM JSON response:', response);
      throw new Error('Invalid JSON response from LLM');
    }
  }
}

export const llmPatternDetectionService = new LLMPatternDetectionService();
