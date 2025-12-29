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
import { weexAiLogService } from './weex/weexAiLogService';

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

      const result = {
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

      // Log Fibonacci analysis to WEEX AI Log API (fire-and-forget)
      weexAiLogService.logPatternAnalysis({
        symbol: 'BTCUSDT',
        timeframe,
        patternType: 'FIBONACCI',
        prompt: 'Fibonacci pattern analysis',
        marketData: { currentPrice, swingHigh, swingLow, rsi: indicators.rsi },
        result: {
          recommendation: result.recommendation || 'HOLD',
          confidence: result.confidence / 100,
          patterns: [result.type],
          levels: result.levels,
        },
      });

      return result;
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

      const result = {
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

      // Log Trend/Momentum analysis to WEEX AI Log API (fire-and-forget)
      weexAiLogService.logPatternAnalysis({
        symbol: 'BTCUSDT',
        timeframe,
        patternType: 'TREND_MOMENTUM',
        prompt: 'Trend and momentum analysis',
        marketData: { currentPrice, ema9: indicators.ema9, ema21: indicators.ema21, rsi: indicators.rsi },
        result: {
          recommendation: result.recommendation || 'HOLD',
          confidence: result.confidence / 100,
          patterns: [result.emaTrend, result.momentum],
        },
      });

      return result;
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

      const result = {
        volumeSignal: analysis.volume_signal || 'NONE',
        candleQuality: analysis.candle_quality || 'INDECISION',
        volumeRatio: volumeRatio,
        bodyPercent: bodyPercent,
        candleDirection: candleDirection as 'BULLISH' | 'BEARISH',
        confirmation: analysis.confirmation || false,
        confidence: analysis.confidence || 50,
        recommendation,
        reasoning: analysis.reasoning || 'No reasoning provided'
      };

      // Log Volume/Price Action analysis to WEEX AI Log API (fire-and-forget)
      weexAiLogService.logPatternAnalysis({
        symbol: 'BTCUSDT',
        timeframe,
        patternType: 'VOLUME_PRICE',
        prompt: 'Volume and price action analysis',
        marketData: { currentPrice, volumeRatio, bodyPercent, candleDirection },
        result: {
          recommendation: result.recommendation || 'HOLD',
          confidence: result.confidence / 100,
          patterns: [result.volumeSignal, result.candleQuality],
        },
      });

      return result;
    } catch (error: any) {
      console.error('Volume/Price Action analysis error:', error.message);
      return {
        volumeSignal: 'NONE',
        candleQuality: 'INDECISION',
        volumeRatio: volumeRatio,
        bodyPercent: bodyPercent,
        candleDirection: candleDirection as 'BULLISH' | 'BEARISH',
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

      const result = {
        keyLevels: analysis.keyLevels || [],
        nearestSupport: analysis.nearestSupport,
        nearestResistance: analysis.nearestResistance,
        currentZone: analysis.currentZone,
        trendline: analysis.trendline,
        confidence: analysis.confidence,
        recommendation: analysis.recommendation, // Extract LLM recommendation
        reasoning: analysis.reasoning
      };

      // Log Support/Resistance analysis to WEEX AI Log API (fire-and-forget)
      weexAiLogService.logPatternAnalysis({
        symbol: 'BTCUSDT',
        timeframe,
        patternType: 'SUPPORT_RESISTANCE',
        prompt: 'Support and resistance analysis',
        marketData: { currentPrice, nearestSupport: result.nearestSupport, nearestResistance: result.nearestResistance },
        result: {
          recommendation: result.recommendation || 'HOLD',
          confidence: result.confidence / 100,
          patterns: [result.currentZone],
          levels: result.keyLevels,
        },
      });

      return result;
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

  // ==================== V3: YES/NO CONFIRMATION METHODS ====================

  /**
   * V3: Trend/Momentum Timing Confirmation
   * Question: "Does 15m momentum support entering a {DIRECTION} trade RIGHT NOW?"
   */
  async analyzeTrendTimingConfirmation(
    input: PatternAnalysisInput,
    direction: 'BUY' | 'SELL'
  ): Promise<{ confirm: 'YES' | 'NO'; confidence: number; reasoning: string }> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Calculate last 5 candles direction
    const last5 = klines.slice(-5);
    const last5Direction = last5.map(c => c.close > c.open ? 'up' : 'down').join(', ');
    const greenCandles = last5.filter(c => c.close > c.open).length;
    const redCandles = last5.filter(c => c.close < c.open).length;

    const prompt = `You are a TREND/MOMENTUM expert for BTC ${timeframe} scalping.

═══════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════

HTF (Higher Timeframe) has determined the trade direction: ${direction}

Your job is NOT to decide direction. Direction is already decided.
Your ONLY job: Confirm if ${timeframe} momentum SUPPORTS this ${direction} trade RIGHT NOW.

═══════════════════════════════════════════════════════════════
FOR ${direction} TRADE - WHAT TO CHECK
═══════════════════════════════════════════════════════════════

${direction === 'BUY' ? `
BULLISH MOMENTUM (Answer YES if most conditions met):
✓ ${timeframe} candles making HIGHER LOWS (momentum building)
✓ RSI is ABOVE 45 and trending UP (not overbought >75)
✓ Price is ABOVE ${timeframe} EMA 21 or crossing above
✓ Recent candles show buying pressure (green bodies)
✓ Momentum is INCREASING, not fading

WEAK/BAD TIMING (Answer NO if any critical issue):
✗ RSI divergence (price up but RSI making lower highs)
✗ Momentum clearly fading (smaller and smaller green candles)
✗ Price rejection from resistance with strong red candle
✗ ${timeframe} EMA 9 crossing BELOW EMA 21
✗ RSI extremely overbought (>80) - too late to buy
` : `
BEARISH MOMENTUM (Answer YES if most conditions met):
✓ ${timeframe} candles making LOWER HIGHS (momentum building)
✓ RSI is BELOW 55 and trending DOWN (not oversold <25)
✓ Price is BELOW ${timeframe} EMA 21 or crossing below
✓ Recent candles show selling pressure (red bodies)
✓ Momentum is INCREASING, not fading

WEAK/BAD TIMING (Answer NO if any critical issue):
✗ RSI divergence (price down but RSI making higher lows)
✗ Momentum clearly fading (smaller and smaller red candles)
✗ Price bounce from support with strong green candle
✗ ${timeframe} EMA 9 crossing ABOVE EMA 21
✗ RSI extremely oversold (<20) - too late to sell
`}

═══════════════════════════════════════════════════════════════
CURRENT MARKET DATA
═══════════════════════════════════════════════════════════════

Current Price: $${currentPrice.toFixed(2)}
EMA 9: $${indicators.ema9.toFixed(2)}
EMA 21: $${indicators.ema21.toFixed(2)}
RSI (14): ${indicators.rsi.toFixed(2)}
Last 5 candles: ${last5Direction}
Green candles: ${greenCandles}, Red candles: ${redCandles}
EMA Trend: ${indicators.ema9 > indicators.ema21 ? 'EMA9 > EMA21 (Bullish)' : 'EMA9 < EMA21 (Bearish)'}

═══════════════════════════════════════════════════════════════
YOUR DECISION
═══════════════════════════════════════════════════════════════

Question: Does ${timeframe} momentum support entering a ${direction} trade RIGHT NOW?

Respond with JSON only:
{
  "confirm": "YES" or "NO",
  "confidence": <number 50-85>,
  "reasoning": "<brief explanation>"
}`;

    try {
      const response = await this.callLLM(this.CHART_PATTERN_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      const confirm = (analysis.confirm?.toUpperCase() === 'YES') ? 'YES' : 'NO';
      const confidence = Math.min(85, Math.max(50, analysis.confidence || 50));

      return {
        confirm,
        confidence,
        reasoning: analysis.reasoning || 'No reasoning provided'
      };
    } catch (error: any) {
      console.error('V3 Trend timing confirmation error:', error.message);
      return { confirm: 'NO', confidence: 50, reasoning: 'Analysis failed' };
    }
  }

  /**
   * V3: Volume/Price Action Timing Confirmation
   * Question: "Does volume support entering a {DIRECTION} trade RIGHT NOW?"
   */
  async analyzeVolumeTimingConfirmation(
    input: PatternAnalysisInput,
    direction: 'BUY' | 'SELL'
  ): Promise<{ confirm: 'YES' | 'NO'; confidence: number; reasoning: string }> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Get current candle data
    const current = klines[klines.length - 1];
    const range = current.high - current.low;
    const body = Math.abs(current.close - current.open);
    const bodyPercent = range > 0 ? (body / range) * 100 : 0;

    // Volume data
    const volumes = klines.slice(-20).map(k => k.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeRatio = current.volume / avgVolume;

    // Calculate green vs red volume
    const last10 = klines.slice(-10);
    const greenVol = last10.filter(k => k.close > k.open).reduce((a, k) => a + k.volume, 0);
    const redVol = last10.filter(k => k.close <= k.open).reduce((a, k) => a + k.volume, 0);

    const prompt = `You are a VOLUME/PRICE ACTION expert for BTC ${timeframe} scalping.

═══════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════

HTF (Higher Timeframe) has determined the trade direction: ${direction}

Your job is NOT to decide direction. Direction is already decided.
Your ONLY job: Confirm if VOLUME supports this ${direction} trade RIGHT NOW.

═══════════════════════════════════════════════════════════════
FOR ${direction} TRADE - WHAT TO CHECK
═══════════════════════════════════════════════════════════════

${direction === 'BUY' ? `
BULLISH VOLUME (Answer YES if most conditions met):
✓ Volume on GREEN candles > volume on RED candles (buying pressure)
✓ Current volume is ABOVE 20-period average
✓ Volume INCREASING on up moves (smart money buying)
✓ Recent volume spike on bullish candle (accumulation)
✓ No exhaustion pattern (huge spike followed by reversal)

WEAK VOLUME (Answer NO if any critical issue):
✗ Volume DECREASING on up moves (weak rally)
✗ Higher volume on RED candles (distribution)
✗ Volume spike already passed (late to the move)
✗ Very low volume (no conviction, easy to reverse)
✗ Climax volume with reversal candle (exhaustion)
` : `
BEARISH VOLUME (Answer YES if most conditions met):
✓ Volume on RED candles > volume on GREEN candles (selling pressure)
✓ Current volume is ABOVE 20-period average
✓ Volume INCREASING on down moves (smart money selling)
✓ Recent volume spike on bearish candle (distribution)
✓ No exhaustion pattern (huge spike followed by bounce)

WEAK VOLUME (Answer NO if any critical issue):
✗ Volume DECREASING on down moves (weak selling)
✗ Higher volume on GREEN candles (accumulation)
✗ Volume spike already passed (late to the move)
✗ Very low volume (no conviction, easy to reverse)
✗ Climax volume with reversal candle (exhaustion)
`}

═══════════════════════════════════════════════════════════════
CURRENT MARKET DATA
═══════════════════════════════════════════════════════════════

Current Price: $${currentPrice.toFixed(2)}
Current Candle: O=$${current.open.toFixed(2)} H=$${current.high.toFixed(2)} L=$${current.low.toFixed(2)} C=$${current.close.toFixed(2)}
Body: ${bodyPercent.toFixed(1)}% of range
Direction: ${current.close > current.open ? 'BULLISH' : 'BEARISH'}

Volume Analysis:
- Current Volume: ${current.volume.toFixed(2)}
- 20-Period Average: ${avgVolume.toFixed(2)}
- Volume Ratio: ${(volumeRatio * 100).toFixed(0)}% of average
- Recent Green Candle Volume: ${greenVol.toFixed(2)}
- Recent Red Candle Volume: ${redVol.toFixed(2)}
- Pressure: ${greenVol > redVol ? 'BUYING' : 'SELLING'}

═══════════════════════════════════════════════════════════════
YOUR DECISION
═══════════════════════════════════════════════════════════════

Question: Does volume support entering a ${direction} trade RIGHT NOW?

Respond with JSON only:
{
  "confirm": "YES" or "NO",
  "confidence": <number 50-85>,
  "reasoning": "<brief explanation>"
}`;

    try {
      const response = await this.callLLM(this.CANDLESTICK_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      const confirm = (analysis.confirm?.toUpperCase() === 'YES') ? 'YES' : 'NO';
      const confidence = Math.min(85, Math.max(50, analysis.confidence || 50));

      return {
        confirm,
        confidence,
        reasoning: analysis.reasoning || 'No reasoning provided'
      };
    } catch (error: any) {
      console.error('V3 Volume timing confirmation error:', error.message);
      return { confirm: 'NO', confidence: 50, reasoning: 'Analysis failed' };
    }
  }

  /**
   * V3: Fibonacci Level Confirmation
   * Question: "Is current price at a good Fibonacci level for a {DIRECTION} trade?"
   */
  async analyzeFibLevelConfirmation(
    input: PatternAnalysisInput,
    direction: 'BUY' | 'SELL'
  ): Promise<{ confirm: 'YES' | 'NO'; confidence: number; reasoning: string }> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Find swing high and low
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);

    // Calculate Fibonacci levels
    const range = swingHigh - swingLow;
    const fibLevels = {
      fib236: swingLow + range * 0.236,
      fib382: swingLow + range * 0.382,
      fib500: swingLow + range * 0.500,
      fib618: swingLow + range * 0.618,
      fib786: swingLow + range * 0.786
    };

    // Find nearest fib level
    const fibPrices = Object.values(fibLevels);
    const distances = fibPrices.map(f => Math.abs(currentPrice - f));
    const minDistance = Math.min(...distances);
    const nearestIdx = distances.indexOf(minDistance);
    const nearestLevel = Object.keys(fibLevels)[nearestIdx];
    const distancePercent = (minDistance / currentPrice) * 100;

    const prompt = `You are a FIBONACCI expert for BTC ${timeframe} scalping.

═══════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════

HTF (Higher Timeframe) has determined the trade direction: ${direction}

Your job is NOT to decide direction. Direction is already decided.
Your ONLY job: Confirm if current PRICE is at a GOOD Fibonacci level for this ${direction} trade.

═══════════════════════════════════════════════════════════════
FOR ${direction} TRADE - WHAT TO CHECK
═══════════════════════════════════════════════════════════════

${direction === 'BUY' ? `
GOOD BUY LEVELS (Answer YES):
✓ Price AT or NEAR 0.618 retracement (golden ratio - best level)
✓ Price AT or NEAR 0.5 retracement (50% pullback - good level)
✓ Price AT or NEAR 0.382 retracement (shallow pullback - acceptable)
✓ Price BOUNCING from Fib level (confirmation)
✓ Price within 0.5% of a key Fib level

BAD BUY LEVELS (Answer NO):
✗ Price in the MIDDLE between Fib levels (no clear zone)
✗ Price already PAST the Fib levels (missed the entry)
✗ Price at 0.786 or deeper (too deep, might break)
✗ Price at Fib level but NO bounce (level failing)
✗ Price more than 1% away from any Fib level
` : `
GOOD SELL LEVELS (Answer YES):
✓ Price AT or NEAR 0.618 retracement of down move (best sell zone)
✓ Price AT or NEAR 0.5 retracement of down move (good sell zone)
✓ Price AT or NEAR 0.382 retracement of down move (early sell)
✓ Price REJECTING from Fib level (confirmation)
✓ Price within 0.5% of a key Fib level

BAD SELL LEVELS (Answer NO):
✗ Price in the MIDDLE between Fib levels (no clear zone)
✗ Price already PAST the Fib levels downward (missed entry)
✗ Price at 0.786+ retracement (might be trend reversal)
✗ Price at Fib level but breaking through (level failing)
✗ Price more than 1% away from any Fib level
`}

═══════════════════════════════════════════════════════════════
CURRENT MARKET DATA
═══════════════════════════════════════════════════════════════

Current Price: $${currentPrice.toFixed(2)}

Fibonacci Levels:
- Swing High: $${swingHigh.toFixed(2)}
- Swing Low: $${swingLow.toFixed(2)}
- 0.236 Level: $${fibLevels.fib236.toFixed(2)}
- 0.382 Level: $${fibLevels.fib382.toFixed(2)}
- 0.500 Level: $${fibLevels.fib500.toFixed(2)}
- 0.618 Level: $${fibLevels.fib618.toFixed(2)}
- 0.786 Level: $${fibLevels.fib786.toFixed(2)}

Nearest Fib Level: ${nearestLevel} ($${fibPrices[nearestIdx].toFixed(2)})
Distance to Nearest: ${distancePercent.toFixed(2)}%

═══════════════════════════════════════════════════════════════
YOUR DECISION
═══════════════════════════════════════════════════════════════

Question: Is current price ($${currentPrice.toFixed(2)}) at a good Fibonacci level for a ${direction} trade?

Respond with JSON only:
{
  "confirm": "YES" or "NO",
  "confidence": <number 50-85>,
  "reasoning": "<brief explanation>"
}`;

    try {
      const response = await this.callLLM(this.FIBONACCI_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      const confirm = (analysis.confirm?.toUpperCase() === 'YES') ? 'YES' : 'NO';
      const confidence = Math.min(85, Math.max(50, analysis.confidence || 50));

      return {
        confirm,
        confidence,
        reasoning: analysis.reasoning || 'No reasoning provided'
      };
    } catch (error: any) {
      console.error('V3 Fib level confirmation error:', error.message);
      return { confirm: 'NO', confidence: 50, reasoning: 'Analysis failed' };
    }
  }

  /**
   * V3: Support/Resistance Level Confirmation
   * Question: "Is current price at a good S/R level for a {DIRECTION} trade?"
   */
  async analyzeSRLevelConfirmation(
    input: PatternAnalysisInput,
    direction: 'BUY' | 'SELL'
  ): Promise<{ confirm: 'YES' | 'NO'; confidence: number; reasoning: string }> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Find potential S/R levels from recent price action
    const highs = klines.map(k => k.high);
    const lows = klines.map(k => k.low);

    // Simple S/R detection: recent swing points
    const recentKlines = klines.slice(-30);
    const supports: number[] = [];
    const resistances: number[] = [];

    for (let i = 2; i < recentKlines.length - 2; i++) {
      // Local low (potential support)
      if (recentKlines[i].low < recentKlines[i-1].low &&
          recentKlines[i].low < recentKlines[i-2].low &&
          recentKlines[i].low < recentKlines[i+1].low &&
          recentKlines[i].low < recentKlines[i+2].low) {
        supports.push(recentKlines[i].low);
      }
      // Local high (potential resistance)
      if (recentKlines[i].high > recentKlines[i-1].high &&
          recentKlines[i].high > recentKlines[i-2].high &&
          recentKlines[i].high > recentKlines[i+1].high &&
          recentKlines[i].high > recentKlines[i+2].high) {
        resistances.push(recentKlines[i].high);
      }
    }

    // Find nearest support and resistance
    const nearestSupport = supports.length > 0 ?
      supports.reduce((a, b) => Math.abs(b - currentPrice) < Math.abs(a - currentPrice) ? b : a) :
      Math.min(...lows);
    const nearestResistance = resistances.length > 0 ?
      resistances.reduce((a, b) => Math.abs(b - currentPrice) < Math.abs(a - currentPrice) ? b : a) :
      Math.max(...highs);

    const distanceToSupport = ((currentPrice - nearestSupport) / currentPrice) * 100;
    const distanceToResistance = ((nearestResistance - currentPrice) / currentPrice) * 100;

    const prompt = `You are a SUPPORT/RESISTANCE expert for BTC ${timeframe} scalping.

═══════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════

HTF (Higher Timeframe) has determined the trade direction: ${direction}

Your job is NOT to decide direction. Direction is already decided.
Your ONLY job: Confirm if current PRICE is at a GOOD S/R level for this ${direction} trade.

═══════════════════════════════════════════════════════════════
FOR ${direction} TRADE - WHAT TO CHECK
═══════════════════════════════════════════════════════════════

${direction === 'BUY' ? `
GOOD BUY LEVELS (Answer YES):
✓ Price AT or NEAR a strong SUPPORT zone
✓ Previous RESISTANCE now acting as SUPPORT (role reversal)
✓ Level tested 2+ times and held (proven support)
✓ Price showing BOUNCE from the level
✓ Clear space BELOW for stop loss placement
✓ Multiple timeframe support confluence

BAD BUY LEVELS (Answer NO):
✗ Price in the MIDDLE of a range (no edge)
✗ Price FAR from any support level
✗ Support level already broken and retesting from below
✗ Too many failed tests (weak support)
✗ No clear level for stop loss
✗ Price at support but breaking through
` : `
GOOD SELL LEVELS (Answer YES):
✓ Price AT or NEAR a strong RESISTANCE zone
✓ Previous SUPPORT now acting as RESISTANCE (role reversal)
✓ Level tested 2+ times and held (proven resistance)
✓ Price showing REJECTION from the level
✓ Clear space ABOVE for stop loss placement
✓ Multiple timeframe resistance confluence

BAD SELL LEVELS (Answer NO):
✗ Price in the MIDDLE of a range (no edge)
✗ Price FAR from any resistance level
✗ Resistance level already broken and retesting from above
✗ Too many failed tests (weak resistance)
✗ No clear level for stop loss
✗ Price at resistance but breaking through
`}

═══════════════════════════════════════════════════════════════
CURRENT MARKET DATA
═══════════════════════════════════════════════════════════════

Current Price: $${currentPrice.toFixed(2)}
EMA 20: $${indicators.ema20.toFixed(2)}
EMA 50: $${indicators.ema50.toFixed(2)}

Support Levels Found: ${supports.length > 0 ? supports.map(s => '$' + s.toFixed(2)).join(', ') : 'None detected'}
Resistance Levels Found: ${resistances.length > 0 ? resistances.map(r => '$' + r.toFixed(2)).join(', ') : 'None detected'}

Nearest Support: $${nearestSupport.toFixed(2)} (${distanceToSupport.toFixed(2)}% away)
Nearest Resistance: $${nearestResistance.toFixed(2)} (${distanceToResistance.toFixed(2)}% away)

═══════════════════════════════════════════════════════════════
YOUR DECISION
═══════════════════════════════════════════════════════════════

Question: Is current price ($${currentPrice.toFixed(2)}) at a good S/R level for a ${direction} trade?

Respond with JSON only:
{
  "confirm": "YES" or "NO",
  "confidence": <number 50-85>,
  "reasoning": "<brief explanation>"
}`;

    try {
      const response = await this.callLLM(this.SR_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      const confirm = (analysis.confirm?.toUpperCase() === 'YES') ? 'YES' : 'NO';
      const confidence = Math.min(85, Math.max(50, analysis.confidence || 50));

      return {
        confirm,
        confidence,
        reasoning: analysis.reasoning || 'No reasoning provided'
      };
    } catch (error: any) {
      console.error('V3 S/R level confirmation error:', error.message);
      return { confirm: 'NO', confidence: 50, reasoning: 'Analysis failed' };
    }
  }

  // ============================================================================
  // V3 EXIT CONFIRMATION METHODS
  // ============================================================================

  /**
   * V3 Exit: Trend Exit Confirmation
   * Asks: "Should we EXIT this position based on trend/momentum?"
   */
  async analyzeTrendExitConfirmation(
    input: PatternAnalysisInput,
    positionDirection: 'BUY' | 'SELL',
    entryPrice: number,
    currentPnL: number
  ): Promise<{ shouldExit: boolean; confidence: number; reasoning: string }> {
    const { klines, indicators, currentPrice, timeframe } = input;

    const prompt = `You are a TREND/MOMENTUM expert analyzing an EXIT decision for a BTC scalping position.

═══════════════════════════════════════════════════════════════
CURRENT POSITION
═══════════════════════════════════════════════════════════════

Position Direction: ${positionDirection}
Entry Price: ${entryPrice}
Current Price: ${currentPrice}
Current P&L: ${currentPnL > 0 ? '+' : ''}${currentPnL.toFixed(2)}%
Position Status: ${currentPnL > 0 ? 'IN PROFIT' : 'IN LOSS'}

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════

Analyze if MOMENTUM has turned AGAINST the position.

${positionDirection === 'SELL' ? `
FOR SELL POSITION - EXIT if you see:
✓ 15m candles now making HIGHER LOWS (momentum reversing up)
✓ RSI crossed above 50 and rising (bullish momentum)
✓ EMA 9 crossing ABOVE EMA 21 (trend reversal)
✓ Strong green candles with increasing volume
✓ Clear bottom formation / rejection pattern

HOLD SELL POSITION if:
✗ Still making LOWER HIGHS (bearish momentum continues)
✗ RSI still below 50
✗ EMA 9 still below EMA 21
✗ No clear reversal pattern
` : `
FOR BUY POSITION - EXIT if you see:
✓ 15m candles now making LOWER HIGHS (momentum reversing down)
✓ RSI crossed below 50 and falling (bearish momentum)
✓ EMA 9 crossing BELOW EMA 21 (trend reversal)
✓ Strong red candles with increasing volume
✓ Clear top formation / rejection pattern

HOLD BUY POSITION if:
✗ Still making HIGHER LOWS (bullish momentum continues)
✗ RSI still above 50
✗ EMA 9 still above EMA 21
✗ No clear reversal pattern
`}

═══════════════════════════════════════════════════════════════
MARKET DATA
═══════════════════════════════════════════════════════════════

Current Price: $${currentPrice.toFixed(2)}
EMA 9: $${indicators.ema9.toFixed(2)}
EMA 21: $${indicators.ema21.toFixed(2)}
RSI: ${indicators.rsi.toFixed(2)}
EMA Trend: ${indicators.ema9 > indicators.ema21 ? 'EMA9 > EMA21 (Bullish)' : 'EMA9 < EMA21 (Bearish)'}

═══════════════════════════════════════════════════════════════
YOUR DECISION
═══════════════════════════════════════════════════════════════

Question: Has momentum turned AGAINST this ${positionDirection} position?

- If momentum clearly reversed → Answer YES (exit)
- If momentum still supports position → Answer NO (hold)
- If uncertain → Answer NO (hold, let SL/TP manage)

Respond with ONLY: YES or NO`;

    try {
      const response = await this.callLLM(this.CHART_PATTERN_MODEL, prompt);
      const shouldExit = response.toUpperCase().includes('YES');

      return {
        shouldExit,
        confidence: shouldExit ? 75 : 70,
        reasoning: `Trend momentum ${shouldExit ? 'reversed - EXIT' : 'still aligned - HOLD'}`
      };
    } catch (error: any) {
      console.error('V3 Trend exit confirmation error:', error.message);
      return { shouldExit: false, confidence: 50, reasoning: 'Error - defaulting to HOLD' };
    }
  }

  /**
   * V3 Exit: Volume Exit Confirmation
   * Asks: "Should we EXIT based on volume/price action?"
   */
  async analyzeVolumeExitConfirmation(
    input: PatternAnalysisInput,
    positionDirection: 'BUY' | 'SELL',
    entryPrice: number,
    currentPnL: number
  ): Promise<{ shouldExit: boolean; confidence: number; reasoning: string }> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Get current candle data
    const current = klines[klines.length - 1];
    const volumes = klines.slice(-20).map(k => k.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const volumeRatio = current.volume / avgVolume;

    const prompt = `You are a VOLUME/PRICE ACTION expert analyzing an EXIT decision for a BTC scalping position.

═══════════════════════════════════════════════════════════════
CURRENT POSITION
═══════════════════════════════════════════════════════════════

Position Direction: ${positionDirection}
Entry Price: ${entryPrice}
Current Price: ${currentPrice}
Current P&L: ${currentPnL > 0 ? '+' : ''}${currentPnL.toFixed(2)}%

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════

Analyze if VOLUME shows reversal against the position.

${positionDirection === 'SELL' ? `
FOR SELL POSITION - EXIT if you see:
✓ Strong BULLISH reversal candle (large green with high volume)
✓ Volume spike on UP move (buyers stepping in)
✓ Hammer/bullish engulfing pattern forming
✓ Climax selling followed by buying pressure
✓ Divergence: price making new low but volume decreasing

HOLD SELL POSITION if:
✗ Volume still higher on red candles
✗ No clear reversal candle pattern
✗ Selling pressure continues
` : `
FOR BUY POSITION - EXIT if you see:
✓ Strong BEARISH reversal candle (large red with high volume)
✓ Volume spike on DOWN move (sellers stepping in)
✓ Shooting star/bearish engulfing pattern forming
✓ Climax buying followed by selling pressure
✓ Divergence: price making new high but volume decreasing

HOLD BUY POSITION if:
✗ Volume still higher on green candles
✗ No clear reversal candle pattern
✗ Buying pressure continues
`}

═══════════════════════════════════════════════════════════════
MARKET DATA
═══════════════════════════════════════════════════════════════

Current Price: $${currentPrice.toFixed(2)}
Current Candle: ${current.close > current.open ? 'BULLISH' : 'BEARISH'}
Volume Ratio: ${(volumeRatio * 100).toFixed(0)}% of average

═══════════════════════════════════════════════════════════════
YOUR DECISION
═══════════════════════════════════════════════════════════════

Question: Does volume/price action show REVERSAL against this ${positionDirection} position?

Respond with ONLY: YES or NO`;

    try {
      const response = await this.callLLM(this.CHART_PATTERN_MODEL, prompt);
      const shouldExit = response.toUpperCase().includes('YES');

      return {
        shouldExit,
        confidence: shouldExit ? 75 : 70,
        reasoning: `Volume ${shouldExit ? 'shows reversal - EXIT' : 'supports position - HOLD'}`
      };
    } catch (error: any) {
      console.error('V3 Volume exit confirmation error:', error.message);
      return { shouldExit: false, confidence: 50, reasoning: 'Error - defaulting to HOLD' };
    }
  }

  /**
   * V3 Exit: Level Exit Confirmation (FIB + S/R combined)
   * Asks: "Should we EXIT based on price level analysis?"
   */
  async analyzeLevelExitConfirmation(
    input: PatternAnalysisInput,
    positionDirection: 'BUY' | 'SELL',
    entryPrice: number,
    currentPrice: number,
    stopLoss: number,
    takeProfit: number
  ): Promise<{ shouldExit: boolean; confidence: number; reasoning: string }> {
    const { klines, indicators } = input;

    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100 * (positionDirection === 'SELL' ? -1 : 1);
    const progressToTP = positionDirection === 'SELL'
      ? ((entryPrice - currentPrice) / (entryPrice - takeProfit)) * 100
      : ((currentPrice - entryPrice) / (takeProfit - entryPrice)) * 100;

    const prompt = `You are a SUPPORT/RESISTANCE & FIBONACCI expert analyzing an EXIT decision.

═══════════════════════════════════════════════════════════════
CURRENT POSITION
═══════════════════════════════════════════════════════════════

Position Direction: ${positionDirection}
Entry Price: $${entryPrice.toFixed(2)}
Current Price: $${currentPrice.toFixed(2)}
Stop Loss: $${stopLoss.toFixed(2)}
Take Profit: $${takeProfit.toFixed(2)}
Current P&L: ${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%
Progress to TP: ${progressToTP.toFixed(1)}%

═══════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════

Analyze if price is at a CRITICAL LEVEL that warrants early exit.

${positionDirection === 'SELL' ? `
FOR SELL POSITION - CONSIDER EXIT if:
✓ Price hit strong support and bouncing hard
✓ Price at major Fibonacci support (0.618, 0.5) with rejection
✓ Multiple timeframe support confluence
✓ Price making double/triple bottom pattern

HOLD SELL POSITION if:
✗ Price still below broken support (now resistance)
✗ No major support nearby
✗ Support levels breaking, not holding
` : `
FOR BUY POSITION - CONSIDER EXIT if:
✓ Price hit strong resistance and rejecting hard
✓ Price at major Fibonacci resistance (0.618, 0.5) with rejection
✓ Multiple timeframe resistance confluence
✓ Price making double/triple top pattern

HOLD BUY POSITION if:
✗ Price still above broken resistance (now support)
✗ No major resistance nearby
✗ Resistance levels breaking, not holding
`}

═══════════════════════════════════════════════════════════════
SPECIAL RULES
═══════════════════════════════════════════════════════════════

1. If position is >50% to TP → Lean toward HOLD (let it run)
2. If position is >50% to SL → Consider EXIT to cut losses
3. If price at major level WITH reversal confirmation → EXIT
4. If price at major level but still moving in our favor → HOLD

═══════════════════════════════════════════════════════════════
MARKET DATA
═══════════════════════════════════════════════════════════════

EMA 20: $${indicators.ema20.toFixed(2)}
EMA 50: $${indicators.ema50.toFixed(2)}

═══════════════════════════════════════════════════════════════
YOUR DECISION
═══════════════════════════════════════════════════════════════

Question: Is price at a critical level that warrants EARLY EXIT of this ${positionDirection} position?

Respond with ONLY: YES or NO`;

    try {
      const response = await this.callLLM(this.SR_MODEL, prompt);
      const shouldExit = response.toUpperCase().includes('YES');

      return {
        shouldExit,
        confidence: shouldExit ? 72 : 68,
        reasoning: `Level analysis: ${shouldExit ? 'Critical level reached - EXIT' : 'No critical level - HOLD'}`
      };
    } catch (error: any) {
      console.error('V3 Level exit confirmation error:', error.message);
      return { shouldExit: false, confidence: 50, reasoning: 'Error - defaulting to HOLD' };
    }
  }

  /**
   * V3 Exit: Main Exit Decision
   * Runs all 3 exit confirmations in parallel and makes decision
   */
  async analyzeV3ExitDecision(
    input: PatternAnalysisInput,
    position: {
      direction: 'BUY' | 'SELL';
      entryPrice: number;
      currentPrice: number;
      stopLoss: number;
      takeProfit: number;
      pnlPercent: number;
      holdingMinutes: number;
    }
  ): Promise<{
    shouldExit: boolean;
    exitType: 'FULL' | 'PARTIAL' | 'NONE';
    confidence: number;
    votes: { trend: boolean; volume: boolean; level: boolean };
    reasoning: string;
  }> {

    console.log(`\n🔍 V3 EXIT ANALYSIS for ${position.direction} position`);
    console.log(`   Entry: ${position.entryPrice.toFixed(2)} | Current: ${position.currentPrice.toFixed(2)}`);
    console.log(`   P&L: ${position.pnlPercent > 0 ? '+' : ''}${position.pnlPercent.toFixed(2)}%`);
    console.log(`   Holding: ${position.holdingMinutes} minutes`);

    // Run all 3 exit checks in parallel
    const [trendExit, volumeExit, levelExit] = await Promise.all([
      this.analyzeTrendExitConfirmation(input, position.direction, position.entryPrice, position.pnlPercent),
      this.analyzeVolumeExitConfirmation(input, position.direction, position.entryPrice, position.pnlPercent),
      this.analyzeLevelExitConfirmation(input, position.direction, position.entryPrice, position.currentPrice, position.stopLoss, position.takeProfit)
    ]);

    const votes = {
      trend: trendExit.shouldExit,
      volume: volumeExit.shouldExit,
      level: levelExit.shouldExit
    };

    const exitVoteCount = Object.values(votes).filter(Boolean).length;

    console.log(`\n   V3 EXIT VOTES:`);
    console.log(`     TREND:  ${votes.trend ? '🚪 EXIT' : '✋ HOLD'} (${trendExit.confidence}%)`);
    console.log(`     VOLUME: ${votes.volume ? '🚪 EXIT' : '✋ HOLD'} (${volumeExit.confidence}%)`);
    console.log(`     LEVEL:  ${votes.level ? '🚪 EXIT' : '✋ HOLD'} (${levelExit.confidence}%)`);
    console.log(`     Score:  ${exitVoteCount}/3`);

    // Decision logic
    let shouldExit = false;
    let exitType: 'FULL' | 'PARTIAL' | 'NONE' = 'NONE';
    let reasoning = '';

    // FULL EXIT: 3/3 or (2/3 + losing position)
    if (exitVoteCount === 3) {
      shouldExit = true;
      exitType = 'FULL';
      reasoning = 'All 3 experts recommend EXIT';
    } else if (exitVoteCount >= 2 && position.pnlPercent < -0.5) {
      shouldExit = true;
      exitType = 'FULL';
      reasoning = `2/3 EXIT votes + losing ${position.pnlPercent.toFixed(2)}%`;
    }
    // PARTIAL EXIT: 2/3 + winning position > 0.5%
    else if (exitVoteCount >= 2 && position.pnlPercent > 0.5) {
      shouldExit = true;
      exitType = 'PARTIAL';
      reasoning = `2/3 EXIT votes + profit ${position.pnlPercent.toFixed(2)}% - taking partial`;
    }
    // HOLD: 0-1 exit votes
    else {
      shouldExit = false;
      exitType = 'NONE';
      reasoning = `Only ${exitVoteCount}/3 EXIT votes - HOLD position`;
    }

    const avgConfidence = (trendExit.confidence + volumeExit.confidence + levelExit.confidence) / 3;

    console.log(`\n   V3 EXIT DECISION: ${exitType}`);
    console.log(`   Reason: ${reasoning}`);

    return {
      shouldExit,
      exitType,
      confidence: avgConfidence,
      votes,
      reasoning
    };
  }

  // ============================================================================
  // V6 PRO METHODS - Structured Level Output for Setup Architect
  // ============================================================================

  /**
   * V6: Get Fibonacci levels with zone data for Setup Architect
   * Returns structured data with entry zones around key levels
   */
  async getFibonacciLevelsV6(input: PatternAnalysisInput): Promise<{
    swingHigh: number;
    swingLow: number;
    swingHighTime: number;
    swingLowTime: number;
    trendDirection: 'UP' | 'DOWN';
    levels: Array<{
      level: number;
      levelName: string;
      price: number;
      zone: { low: number; high: number; midpoint: number };
      type: 'RETRACEMENT' | 'EXTENSION';
      strength: 'WEAK' | 'MODERATE' | 'STRONG';
      tested: boolean;
      confluenceWith?: string[];
    }>;
    goldenPocket: { low: number; high: number; midpoint: number } | null;
  }> {
    const { klines, indicators, currentPrice, timeframe } = input;

    // Find swing high and low with timestamps
    const highs = klines.map((k, i) => ({ price: k.high, time: k.openTime, index: i }));
    const lows = klines.map((k, i) => ({ price: k.low, time: k.openTime, index: i }));

    const swingHighData = highs.reduce((max, curr) => curr.price > max.price ? curr : max);
    const swingLowData = lows.reduce((min, curr) => curr.price < min.price ? curr : min);

    const swingHigh = swingHighData.price;
    const swingLow = swingLowData.price;
    const swingHighTime = swingHighData.time;
    const swingLowTime = swingLowData.time;

    // Determine trend direction based on which came first
    const trendDirection: 'UP' | 'DOWN' = swingLowData.index < swingHighData.index ? 'UP' : 'DOWN';

    const range = swingHigh - swingLow;
    const zoneWidthPercent = 0.002; // 0.2% zone width

    // Calculate all Fibonacci levels with zones
    const fibLevelDefs = [
      { level: 0.236, name: '23.6%', strength: 'WEAK' as const },
      { level: 0.382, name: '38.2%', strength: 'MODERATE' as const },
      { level: 0.5, name: '50%', strength: 'MODERATE' as const },
      { level: 0.618, name: '61.8% Golden', strength: 'STRONG' as const },
      { level: 0.786, name: '78.6%', strength: 'STRONG' as const },
    ];

    const extensionLevelDefs = [
      { level: 1.272, name: '127.2% Ext', strength: 'MODERATE' as const },
      { level: 1.618, name: '161.8% Ext', strength: 'STRONG' as const },
    ];

    const levels: Array<{
      level: number;
      levelName: string;
      price: number;
      zone: { low: number; high: number; midpoint: number };
      type: 'RETRACEMENT' | 'EXTENSION';
      strength: 'WEAK' | 'MODERATE' | 'STRONG';
      tested: boolean;
      confluenceWith?: string[];
    }> = [];

    // Add retracement levels
    for (const def of fibLevelDefs) {
      const price = trendDirection === 'UP'
        ? swingHigh - range * def.level
        : swingLow + range * def.level;

      const zoneHalf = price * zoneWidthPercent;
      const zone = {
        low: price - zoneHalf,
        high: price + zoneHalf,
        midpoint: price,
      };

      // Check if level has been tested
      const tested = klines.slice(-20).some(k =>
        k.low <= zone.high && k.high >= zone.low
      );

      levels.push({
        level: def.level,
        levelName: def.name,
        price,
        zone,
        type: 'RETRACEMENT',
        strength: def.strength,
        tested,
      });
    }

    // Add extension levels
    for (const def of extensionLevelDefs) {
      const price = trendDirection === 'UP'
        ? swingLow + range * def.level
        : swingHigh - range * def.level;

      const zoneHalf = price * zoneWidthPercent;
      const zone = {
        low: price - zoneHalf,
        high: price + zoneHalf,
        midpoint: price,
      };

      const tested = klines.slice(-20).some(k =>
        k.low <= zone.high && k.high >= zone.low
      );

      levels.push({
        level: def.level,
        levelName: def.name,
        price,
        zone,
        type: 'EXTENSION',
        strength: def.strength,
        tested,
      });
    }

    // Calculate golden pocket (61.8% - 78.6%)
    const gp618 = trendDirection === 'UP'
      ? swingHigh - range * 0.618
      : swingLow + range * 0.618;
    const gp786 = trendDirection === 'UP'
      ? swingHigh - range * 0.786
      : swingLow + range * 0.786;

    const goldenPocket = {
      low: Math.min(gp618, gp786),
      high: Math.max(gp618, gp786),
      midpoint: (gp618 + gp786) / 2,
    };

    console.log(`[V6-FIB] Trend: ${trendDirection} | Swing: $${swingLow.toFixed(0)}-$${swingHigh.toFixed(0)} | Golden Pocket: $${goldenPocket.low.toFixed(0)}-$${goldenPocket.high.toFixed(0)}`);

    return {
      swingHigh,
      swingLow,
      swingHighTime,
      swingLowTime,
      trendDirection,
      levels,
      goldenPocket,
    };
  }

  /**
   * V6: Get Support/Resistance levels with Order Blocks for Setup Architect
   * Uses LLM to identify key levels and order blocks
   */
  async getSupportResistanceLevelsV6(input: PatternAnalysisInput): Promise<{
    levels: Array<{
      price: number;
      zone: { low: number; high: number; midpoint: number };
      type: 'SUPPORT' | 'RESISTANCE';
      source: 'SR' | 'ORDER_BLOCK' | 'EMA';
      strength: 'WEAK' | 'MODERATE' | 'STRONG';
      timeframe: string;
      tested: boolean;
      touches: number;
      description?: string;
    }>;
    orderBlocks: Array<{
      type: 'BULLISH' | 'BEARISH';
      zone: { low: number; high: number; midpoint: number };
      strength: 'FRESH' | 'TESTED' | 'MITIGATED';
      timeframe: string;
      createdAt: number;
      description: string;
    }>;
    nearestSupport: { price: number; zone: { low: number; high: number; midpoint: number } } | null;
    nearestResistance: { price: number; zone: { low: number; high: number; midpoint: number } } | null;
  }> {
    const { klines, indicators, currentPrice, timeframe } = input;
    const zoneWidthPercent = 0.002;

    // Format recent price action for LLM
    const recentKlines = klines.slice(-30).map((k, i) => ({
      index: i,
      open: k.open.toFixed(2),
      high: k.high.toFixed(2),
      low: k.low.toFixed(2),
      close: k.close.toFixed(2),
      volume: k.volume.toFixed(0),
    }));

    const prompt = `You are an ICT (Inner Circle Trader) specialist analyzing BTC/USDT on ${timeframe}.

CURRENT PRICE: $${currentPrice.toFixed(2)}

EMA LEVELS:
- EMA 9: $${indicators.ema9.toFixed(2)}
- EMA 21: $${indicators.ema21.toFixed(2)}
- EMA 50: $${indicators.ema50.toFixed(2)}

RECENT CANDLES (last 30):
${JSON.stringify(recentKlines, null, 2)}

TASK: Identify key levels and order blocks for trade setups.

1. SUPPORT/RESISTANCE LEVELS: Find 3-5 key horizontal levels where price has reacted multiple times.

2. ORDER BLOCKS: Identify 2-3 order blocks (last candle before impulsive move):
   - BULLISH OB: Last bearish candle before strong bullish move (demand zone)
   - BEARISH OB: Last bullish candle before strong bearish move (supply zone)
   - Mark as FRESH (untested), TESTED (touched once), or MITIGATED (broken)

Respond ONLY with valid JSON:
{
  "levels": [
    {
      "price": number,
      "type": "SUPPORT" | "RESISTANCE",
      "strength": "WEAK" | "MODERATE" | "STRONG",
      "touches": number,
      "description": "Brief description"
    }
  ],
  "orderBlocks": [
    {
      "type": "BULLISH" | "BEARISH",
      "high": number,
      "low": number,
      "strength": "FRESH" | "TESTED" | "MITIGATED",
      "candleIndex": number,
      "description": "Brief description"
    }
  ]
}`;

    try {
      const response = await this.callLLM(this.FIBONACCI_MODEL, prompt);
      const analysis = this.parseJSONResponse(response);

      // Process levels into structured format
      const levels: Array<{
        price: number;
        zone: { low: number; high: number; midpoint: number };
        type: 'SUPPORT' | 'RESISTANCE';
        source: 'SR' | 'ORDER_BLOCK' | 'EMA';
        strength: 'WEAK' | 'MODERATE' | 'STRONG';
        timeframe: string;
        tested: boolean;
        touches: number;
        description?: string;
      }> = [];

      // Add LLM-identified S/R levels
      if (analysis.levels && Array.isArray(analysis.levels)) {
        for (const lvl of analysis.levels) {
          // Validate and convert price to number (LLM may return string)
          const price = typeof lvl.price === 'string' ? parseFloat(lvl.price) : Number(lvl.price);
          if (isNaN(price) || price <= 0) {
            console.warn(`[V6-SR] Skipping invalid level price: ${lvl.price}`);
            continue;
          }

          const zoneHalf = price * zoneWidthPercent;
          levels.push({
            price: price,
            zone: {
              low: price - zoneHalf,
              high: price + zoneHalf,
              midpoint: price,
            },
            type: lvl.type || 'SUPPORT',
            source: 'SR',
            strength: lvl.strength || 'MODERATE',
            timeframe,
            tested: (lvl.touches || 0) > 0,
            touches: lvl.touches || 0,
            description: lvl.description,
          });
        }
      }

      // Add EMA levels as dynamic S/R
      const emaLevels = [
        { price: indicators.ema21, name: 'EMA 21' },
        { price: indicators.ema50, name: 'EMA 50' },
      ];

      for (const ema of emaLevels) {
        const zoneHalf = ema.price * zoneWidthPercent;
        levels.push({
          price: ema.price,
          zone: {
            low: ema.price - zoneHalf,
            high: ema.price + zoneHalf,
            midpoint: ema.price,
          },
          type: currentPrice > ema.price ? 'SUPPORT' : 'RESISTANCE',
          source: 'EMA',
          strength: 'MODERATE',
          timeframe,
          tested: true,
          touches: 0,
          description: ema.name,
        });
      }

      // Process order blocks
      const orderBlocks: Array<{
        type: 'BULLISH' | 'BEARISH';
        zone: { low: number; high: number; midpoint: number };
        strength: 'FRESH' | 'TESTED' | 'MITIGATED';
        timeframe: string;
        createdAt: number;
        description: string;
      }> = [];

      if (analysis.orderBlocks && Array.isArray(analysis.orderBlocks)) {
        for (const ob of analysis.orderBlocks) {
          const obLow = ob.low || ob.price * 0.998;
          const obHigh = ob.high || ob.price * 1.002;
          const candleIndex = ob.candleIndex || 0;
          const candleTime = klines[Math.min(candleIndex, klines.length - 1)]?.openTime || Date.now();

          orderBlocks.push({
            type: ob.type || 'BULLISH',
            zone: {
              low: obLow,
              high: obHigh,
              midpoint: (obLow + obHigh) / 2,
            },
            strength: ob.strength || 'FRESH',
            timeframe,
            createdAt: candleTime,
            description: ob.description || `${ob.type} Order Block`,
          });
        }
      }

      // Find nearest support and resistance
      const supports = levels.filter(l => l.type === 'SUPPORT' && l.price < currentPrice);
      const resistances = levels.filter(l => l.type === 'RESISTANCE' && l.price > currentPrice);

      const nearestSupport = supports.length > 0
        ? supports.reduce((nearest, curr) =>
            Math.abs(curr.price - currentPrice) < Math.abs(nearest.price - currentPrice) ? curr : nearest
          )
        : null;

      const nearestResistance = resistances.length > 0
        ? resistances.reduce((nearest, curr) =>
            Math.abs(curr.price - currentPrice) < Math.abs(nearest.price - currentPrice) ? curr : nearest
          )
        : null;

      console.log(`[V6-SR] Found ${levels.length} levels, ${orderBlocks.length} order blocks`);
      if (nearestSupport) console.log(`[V6-SR] Nearest Support: $${nearestSupport.price.toFixed(0)}`);
      if (nearestResistance) console.log(`[V6-SR] Nearest Resistance: $${nearestResistance.price.toFixed(0)}`);

      return {
        levels,
        orderBlocks,
        nearestSupport: nearestSupport ? { price: nearestSupport.price, zone: nearestSupport.zone } : null,
        nearestResistance: nearestResistance ? { price: nearestResistance.price, zone: nearestResistance.zone } : null,
      };
    } catch (error: any) {
      console.error('[V6-SR] Analysis error:', error.message);

      // Return basic EMA-based levels on error
      const ema21Zone = indicators.ema21 * zoneWidthPercent;
      const ema50Zone = indicators.ema50 * zoneWidthPercent;

      return {
        levels: [
          {
            price: indicators.ema21,
            zone: { low: indicators.ema21 - ema21Zone, high: indicators.ema21 + ema21Zone, midpoint: indicators.ema21 },
            type: currentPrice > indicators.ema21 ? 'SUPPORT' : 'RESISTANCE',
            source: 'EMA',
            strength: 'MODERATE',
            timeframe,
            tested: true,
            touches: 0,
            description: 'EMA 21',
          },
          {
            price: indicators.ema50,
            zone: { low: indicators.ema50 - ema50Zone, high: indicators.ema50 + ema50Zone, midpoint: indicators.ema50 },
            type: currentPrice > indicators.ema50 ? 'SUPPORT' : 'RESISTANCE',
            source: 'EMA',
            strength: 'MODERATE',
            timeframe,
            tested: true,
            touches: 0,
            description: 'EMA 50',
          },
        ],
        orderBlocks: [],
        nearestSupport: null,
        nearestResistance: null,
      };
    }
  }

  /**
   * V6: Get Liquidity Zones for Setup Architect
   * Identifies areas where stop losses are likely clustered (stop hunt zones)
   */
  async getLiquidityZonesV6(input: PatternAnalysisInput): Promise<Array<{
    type: 'BUY_STOPS' | 'SELL_STOPS';
    price: number;
    zone: { low: number; high: number; midpoint: number };
    estimatedVolume: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
  }>> {
    const { klines, currentPrice } = input;
    const zoneWidthPercent = 0.001; // 0.1% buffer for liquidity zones

    const liquidityZones: Array<{
      type: 'BUY_STOPS' | 'SELL_STOPS';
      price: number;
      zone: { low: number; high: number; midpoint: number };
      estimatedVolume: 'LOW' | 'MEDIUM' | 'HIGH';
      description: string;
    }> = [];

    // Find recent swing highs (BUY_STOPS above them)
    const recentHighs: { price: number; index: number }[] = [];
    const recentLows: { price: number; index: number }[] = [];

    // RELAXED: Changed from 5 candles to 3 candles for more swing detection
    for (let i = 3; i < klines.length - 3; i++) {
      const candle = klines[i];

      // Check for swing high (higher high than 3 candles before and after)
      const isSwingHigh = klines.slice(i - 3, i).every(k => k.high < candle.high) &&
                          klines.slice(i + 1, i + 4).every(k => k.high < candle.high);

      // Check for swing low
      const isSwingLow = klines.slice(i - 3, i).every(k => k.low > candle.low) &&
                         klines.slice(i + 1, i + 4).every(k => k.low > candle.low);

      if (isSwingHigh) {
        recentHighs.push({ price: candle.high, index: i });
      }
      if (isSwingLow) {
        recentLows.push({ price: candle.low, index: i });
      }
    }

    console.log(`[V6-LIQ-DEBUG] Found ${recentHighs.length} swing highs, ${recentLows.length} swing lows`);

    // Process highs as BUY_STOPS zones (shorts have stops above highs)
    const uniqueHighs = recentHighs
      .sort((a, b) => b.index - a.index) // Most recent first
      .slice(0, 3); // Top 3 recent swing highs

    for (const high of uniqueHighs) {
      const zoneHalf = high.price * zoneWidthPercent;
      const distanceFromCurrent = ((high.price - currentPrice) / currentPrice) * 100;

      // Only include if above current price and within reasonable range (RELAXED from 3% to 5%)
      if (high.price > currentPrice && distanceFromCurrent < 5) {
        liquidityZones.push({
          type: 'BUY_STOPS',
          price: high.price,
          zone: {
            low: high.price,
            high: high.price + zoneHalf * 2,
            midpoint: high.price + zoneHalf,
          },
          estimatedVolume: distanceFromCurrent < 0.5 ? 'HIGH' : distanceFromCurrent < 1.5 ? 'MEDIUM' : 'LOW',
          description: `Buy stops above swing high at $${high.price.toFixed(0)}`,
        });
      } else if (high.price > currentPrice) {
        console.log(`[V6-LIQ-DEBUG] Skipped swing high at $${high.price.toFixed(0)} - too far (${distanceFromCurrent.toFixed(2)}%)`);
      }
    }

    // Process lows as SELL_STOPS zones (longs have stops below lows)
    const uniqueLows = recentLows
      .sort((a, b) => b.index - a.index)
      .slice(0, 3);

    for (const low of uniqueLows) {
      const zoneHalf = low.price * zoneWidthPercent;
      const distanceFromCurrent = ((currentPrice - low.price) / currentPrice) * 100;

      // Only include if below current price and within reasonable range (RELAXED from 3% to 5%)
      if (low.price < currentPrice && distanceFromCurrent < 5) {
        liquidityZones.push({
          type: 'SELL_STOPS',
          price: low.price,
          zone: {
            low: low.price - zoneHalf * 2,
            high: low.price,
            midpoint: low.price - zoneHalf,
          },
          estimatedVolume: distanceFromCurrent < 0.5 ? 'HIGH' : distanceFromCurrent < 1.5 ? 'MEDIUM' : 'LOW',
          description: `Sell stops below swing low at $${low.price.toFixed(0)}`,
        });
      } else if (low.price < currentPrice) {
        console.log(`[V6-LIQ-DEBUG] Skipped swing low at $${low.price.toFixed(0)} - too far (${distanceFromCurrent.toFixed(2)}%)`);
      }
    }

    // Also add recent equal highs/lows as high-probability liquidity
    const last20 = klines.slice(-20);
    const recentHighPrice = Math.max(...last20.map(k => k.high));
    const recentLowPrice = Math.min(...last20.map(k => k.low));

    // Add recent range high if not already included
    if (!liquidityZones.some(z => Math.abs(z.price - recentHighPrice) < recentHighPrice * 0.002)) {
      const zoneHalf = recentHighPrice * zoneWidthPercent;
      if (recentHighPrice > currentPrice) {
        liquidityZones.push({
          type: 'BUY_STOPS',
          price: recentHighPrice,
          zone: {
            low: recentHighPrice,
            high: recentHighPrice + zoneHalf * 2,
            midpoint: recentHighPrice + zoneHalf,
          },
          estimatedVolume: 'HIGH',
          description: `Buy stops above recent 20-candle high at $${recentHighPrice.toFixed(0)}`,
        });
      }
    }

    // Add recent range low if not already included
    if (!liquidityZones.some(z => Math.abs(z.price - recentLowPrice) < recentLowPrice * 0.002)) {
      const zoneHalf = recentLowPrice * zoneWidthPercent;
      if (recentLowPrice < currentPrice) {
        liquidityZones.push({
          type: 'SELL_STOPS',
          price: recentLowPrice,
          zone: {
            low: recentLowPrice - zoneHalf * 2,
            high: recentLowPrice,
            midpoint: recentLowPrice - zoneHalf,
          },
          estimatedVolume: 'HIGH',
          description: `Sell stops below recent 20-candle low at $${recentLowPrice.toFixed(0)}`,
        });
      }
    }

    // FALLBACK: If still no zones, add 50-candle extremes
    if (liquidityZones.length === 0) {
      console.log('[V6-LIQ-DEBUG] No zones found, adding 50-candle fallback zones');
      const last50 = klines.slice(-50);
      const high50 = Math.max(...last50.map(k => k.high));
      const low50 = Math.min(...last50.map(k => k.low));
      const zoneHalf = currentPrice * zoneWidthPercent;

      if (high50 > currentPrice) {
        liquidityZones.push({
          type: 'BUY_STOPS',
          price: high50,
          zone: {
            low: high50,
            high: high50 + zoneHalf * 2,
            midpoint: high50 + zoneHalf,
          },
          estimatedVolume: 'MEDIUM',
          description: `Buy stops above 50-candle high at $${high50.toFixed(0)} (fallback)`,
        });
      }

      if (low50 < currentPrice) {
        liquidityZones.push({
          type: 'SELL_STOPS',
          price: low50,
          zone: {
            low: low50 - zoneHalf * 2,
            high: low50,
            midpoint: low50 - zoneHalf,
          },
          estimatedVolume: 'MEDIUM',
          description: `Sell stops below 50-candle low at $${low50.toFixed(0)} (fallback)`,
        });
      }
    }

    console.log(`[V6-LIQ] Found ${liquidityZones.length} liquidity zones`);
    for (const zone of liquidityZones) {
      console.log(`[V6-LIQ]   ${zone.type} @ $${zone.price.toFixed(0)} (${zone.estimatedVolume})`);
    }

    return liquidityZones;
  }
}

export const llmPatternDetectionService = new LLMPatternDetectionService();
