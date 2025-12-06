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
  ema9: number;   // For Trend & Momentum expert
  ema21: number;  // For Trend & Momentum expert
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

interface TrendMomentumPattern {
  emaTrend: 'BULLISH' | 'BEARISH' | 'FLAT';
  rsiZone: 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT';
  momentum: 'STRONG' | 'MODERATE' | 'WEAK';
  ema9: number;
  ema21: number;
  last5Direction: string;
  confidence: number;
  recommendation?: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
}

interface VolumePriceActionPattern {
  volumeSignal: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
  candleQuality: 'STRONG' | 'MODERATE' | 'WEAK' | 'INDECISION';
  volumeRatio: number;
  bodyPercent: number;
  candleDirection: 'BULLISH' | 'BEARISH';
  confirmation: boolean;
  confidence: number;
  recommendation?: 'BUY' | 'SELL' | 'HOLD';
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

    // EMAs for Trend & Momentum expert
    const ema9Values = EMA.calculate({ values: closes, period: 9 });
    const ema9 = ema9Values[ema9Values.length - 1] || closes[closes.length - 1];

    const ema21Values = EMA.calculate({ values: closes, period: 21 });
    const ema21 = ema21Values[ema21Values.length - 1] || closes[closes.length - 1];

    // EMAs for general use
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
      ema9,
      ema21,
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

      // Validate required fields
      this.validateLLMResponse(analysis, ['confidence'], 'Fibonacci analysis');

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
   * Specialist 2: Trend & Momentum Analysis
   * Replaces Chart Pattern expert - uses EMA crossovers and RSI for reliable signals on any timeframe
   */
  async analyzeTrendMomentum(input: PatternAnalysisInput): Promise<TrendMomentumPattern> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Calculate last 5 candles direction
    const last5 = klines.slice(-5);
    const last5Direction = last5.map(c => c.close > c.open ? 'up' : 'down').join(', ');
    const greenCandles = last5.filter(c => c.close > c.open).length;
    const redCandles = last5.filter(c => c.close < c.open).length;

    // Calculate price change over last 5 candles
    const priceChange5 = ((currentPrice - klines[klines.length - 6].close) / klines[klines.length - 6].close * 100).toFixed(2);

    // EMA proximity check (are EMAs within 0.1% of each other = flat)
    const emaProximity = Math.abs(indicators.ema9 - indicators.ema21) / indicators.ema21 * 100;
    const emasFlat = emaProximity < 0.1;

    const prompt = `You are a professional BTC scalper analyzing trend direction. Your job is to give CLEAR DIRECTION signals.

MARKET DATA:
- Current Price: $${currentPrice.toFixed(2)}
- EMA 9: $${indicators.ema9.toFixed(2)}
- EMA 21: $${indicators.ema21.toFixed(2)}
- EMA 50: $${indicators.ema50.toFixed(2)}
- RSI (14): ${indicators.rsi.toFixed(2)}
- Last 5 candles: ${last5Direction}
- Green candles: ${greenCandles}, Red candles: ${redCandles}
- EMA 9/21 gap: ${emaProximity.toFixed(3)}%

═══════════════════════════════════════════════════════════
CRITICAL: YOU MUST VOTE BUY OR SELL. HOLD IS EXTREMELY RARE.
═══════════════════════════════════════════════════════════

VOTE BUY (65-85% confidence) when ANY ONE of these is true:
✓ EMA 9 > EMA 21 (even by 0.01%)
✓ Price is above EMA 21
✓ RSI > 50
✓ More green candles than red in last 5

VOTE SELL (65-85% confidence) when ANY ONE of these is true:
✓ EMA 9 < EMA 21 (even by 0.01%)
✓ Price is below EMA 21
✓ RSI < 50
✓ More red candles than green in last 5

VOTE HOLD (50%) ONLY when ALL of these are true:
✗ EMA 9 and EMA 21 within 0.02% (truly flat)
✗ RSI between 48-52
✗ Equal green and red candles (2-3 or 3-2)

CONFIDENCE:
- Clear EMA separation (>0.05%): 75-85%
- Small EMA separation (0.02-0.05%): 65-75%
- Flat EMAs (<0.02%): 50% HOLD only

Respond with JSON only:
{
  "vote": "BUY" | "SELL" | "HOLD",
  "confidence": <number 50-85>,
  "reasoning": "<brief>",
  "ema_trend": "BULLISH" | "BEARISH" | "FLAT"
}`;

    try {
      const response = await this.callLLM(this.CHART_PATTERN_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      // Always extract vote from reasoning as backup
      const reasoningVote = this.extractVoteFromReasoning(analysis.reasoning || '');

      // Map LLM vote field to recommendation
      let recommendation = analysis.vote || analysis.recommendation;
      if (!recommendation || recommendation === 'HOLD') {
        console.warn(`⚠️  Trend/Momentum LLM returned ${recommendation || 'missing'}, using reasoning extraction: ${reasoningVote}`);
        recommendation = reasoningVote;
      }

      return {
        emaTrend: analysis.ema_trend || 'FLAT',
        rsiZone: analysis.rsi_zone || 'NEUTRAL',
        momentum: analysis.momentum || 'WEAK',
        ema9: indicators.ema9,
        ema21: indicators.ema21,
        last5Direction,
        confidence: analysis.confidence || 50,
        recommendation,
        reasoning: analysis.reasoning || 'No reasoning provided'
      };
    } catch (error: any) {
      console.error('Trend/Momentum analysis error:', error.message);
      return {
        emaTrend: 'FLAT',
        rsiZone: 'NEUTRAL',
        momentum: 'WEAK',
        ema9: indicators.ema9,
        ema21: indicators.ema21,
        last5Direction,
        confidence: 0,
        recommendation: 'HOLD',
        reasoning: 'Analysis failed'
      };
    }
  }

  /**
   * Specialist 3: Volume & Price Action Analysis
   * Replaces Candlestick expert - focuses on volume confirmation and candle quality
   * STANDALONE expert - does not need S/R levels, analyzes pure volume/price action
   */
  async analyzeVolumePriceAction(input: PatternAnalysisInput): Promise<VolumePriceActionPattern> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Get current candle data
    const current = klines[klines.length - 1];
    const range = current.high - current.low;
    const body = Math.abs(current.close - current.open);
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;

    // Calculate percentages (avoid division by zero)
    const bodyPercent = range > 0 ? (body / range) * 100 : 0;
    const upperWickPercent = range > 0 ? (upperWick / range) * 100 : 0;
    const lowerWickPercent = range > 0 ? (lowerWick / range) * 100 : 0;

    // Volume data
    const volumes = klines.slice(-20).map(k => k.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeRatio = current.volume / avgVolume;

    const candleDirection = current.close > current.open ? 'BULLISH' : 'BEARISH';

    const prompt = `You are a professional BTC scalper analyzing volume and price action.

MARKET DATA:
- Current Price: $${currentPrice.toFixed(2)}
- Candle: O=$${current.open.toFixed(2)} H=$${current.high.toFixed(2)} L=$${current.low.toFixed(2)} C=$${current.close.toFixed(2)}
- Volume: ${current.volume.toFixed(2)} (${volumeRatio.toFixed(2)}x avg)
- Body: ${bodyPercent.toFixed(1)}% of range
- Direction: ${candleDirection}
- Wicks: Upper=${upperWickPercent.toFixed(1)}%, Lower=${lowerWickPercent.toFixed(1)}%

═══════════════════════════════════════════════════════════
CRITICAL: NORMAL VOLUME IS TRADEABLE. DON'T REQUIRE SPIKES.
═══════════════════════════════════════════════════════════

VOTE BUY (65-85% confidence) when:
✓ Candle is BULLISH (that's the main signal!)
✓ Volume >= 0.7x average (normal volume is fine)
✓ Body >= 35% of range (not a doji)

VOTE SELL (65-85% confidence) when:
✓ Candle is BEARISH (that's the main signal!)
✓ Volume >= 0.7x average
✓ Body >= 35% of range

VOTE HOLD (50%) ONLY when:
✗ Volume < 0.5x average (dead market)
✗ Body < 25% of range (doji)
✗ Both wicks > 35% (double rejection)

CONFIDENCE:
- High volume (>1.5x) + strong body: 80-85%
- Normal volume (0.8-1.5x) + decent body: 70-75%
- Low-normal volume (0.7-0.8x): 65-70%
- Very low (<0.5x) or doji: 50% HOLD

THE KEY RULE:
- BULLISH candle with normal volume = VOTE BUY
- BEARISH candle with normal volume = VOTE SELL
- Only dojis or dead volume = HOLD

Respond with JSON only:
{
  "vote": "BUY" | "SELL" | "HOLD",
  "confidence": <number 50-85>,
  "reasoning": "<brief>",
  "volume_signal": "HIGH" | "NORMAL" | "LOW"
}`;

    try {
      const response = await this.callLLM(this.CANDLESTICK_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      // Always extract vote from reasoning as backup
      const reasoningVote = this.extractVoteFromReasoning(analysis.reasoning || '');

      // Map LLM vote field to recommendation
      let recommendation = analysis.vote || analysis.recommendation;
      if (!recommendation) {
        // Only warn when vote is completely missing (not when HOLD)
        console.warn(`⚠️  Volume/PA LLM returned no vote, using reasoning extraction: ${reasoningVote}`);
        recommendation = reasoningVote;
      } else if (recommendation === 'HOLD' && reasoningVote !== 'HOLD') {
        // Override HOLD with reasoning-based vote if reasoning suggests otherwise
        recommendation = reasoningVote;
      }

      return {
        volumeSignal: analysis.volume_signal || 'NONE',
        candleQuality: analysis.candle_quality || 'INDECISION',
        volumeRatio: volumeRatio,
        bodyPercent: bodyPercent,
        candleDirection: candleDirection,
        confirmation: analysis.confirmation || false,
        confidence: analysis.confidence || 50,
        recommendation,
        reasoning: analysis.reasoning || 'No reasoning provided'
      };
    } catch (error: any) {
      console.error('Volume/Price Action analysis error:', error.message);
      return {
        volumeSignal: 'NONE',
        candleQuality: 'INDECISION',
        volumeRatio: volumeRatio,
        bodyPercent: bodyPercent,
        candleDirection: candleDirection,
        confirmation: false,
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

      // Validate required fields
      this.validateLLMResponse(analysis, ['confidence'], 'S/R analysis');

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
   * Retry helper with exponential backoff for transient errors
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    context: string = 'LLM call'
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check if error is retriable (5xx, 429, network errors)
        const isRetriableError =
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'ECONNABORTED' ||
          (error.response?.status >= 500 && error.response?.status < 600) ||
          error.response?.status === 429;

        if (!isRetriableError || attempt === maxRetries) {
          break;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.log(`⚠️ ${context} attempt ${attempt}/${maxRetries} failed (${error.response?.status || error.code || error.message}), retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Call LLM with retry logic
   */
  private async callLLM(model: string, prompt: string): Promise<string> {
    return this.retryWithBackoff(async () => {
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
    }, 3, 1000, `LLM call (${model.split('/').pop()})`);
  }

  /**
   * Parse JSON response from LLM, handling markdown code blocks and edge cases
   */
  private parseJSONResponse(response: string): any {
    try {
      let cleaned = response.trim();

      // Remove markdown code blocks if present (handles various formats)
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Handle case where LLM adds trailing text after JSON
      // Try to extract just the JSON object
      const jsonStartIdx = cleaned.indexOf('{');
      if (jsonStartIdx > 0) {
        cleaned = cleaned.substring(jsonStartIdx);
      }

      // Find matching closing brace for nested objects
      if (cleaned.startsWith('{')) {
        let braceCount = 0;
        let endIdx = -1;
        for (let i = 0; i < cleaned.length; i++) {
          if (cleaned[i] === '{') braceCount++;
          else if (cleaned[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIdx = i;
            break;
          }
        }
        if (endIdx > 0 && endIdx < cleaned.length - 1) {
          cleaned = cleaned.substring(0, endIdx + 1);
        }
      }

      return JSON.parse(cleaned);
    } catch (error) {
      // Log truncated response to avoid flooding logs
      console.error('Failed to parse LLM JSON response:', response.substring(0, 200) + (response.length > 200 ? '...' : ''));
      throw new Error('Invalid JSON response from LLM');
    }
  }

  /**
   * Validate required fields in LLM response
   * Throws error if critical fields are missing
   */
  private validateLLMResponse(analysis: any, requiredFields: string[], context: string): void {
    for (const field of requiredFields) {
      if (analysis[field] === undefined || analysis[field] === null) {
        throw new Error(`LLM response missing required field '${field}' in ${context}`);
      }
    }
    // Validate confidence is a number between 0-100
    if (requiredFields.includes('confidence')) {
      if (typeof analysis.confidence !== 'number' || analysis.confidence < 0 || analysis.confidence > 100) {
        throw new Error(`Invalid confidence value '${analysis.confidence}' in ${context} - expected number 0-100`);
      }
    }
  }
}

export const llmPatternDetectionService = new LLMPatternDetectionService();
