/**
 * MARIPOSA V6 PRO - Momentum Expert Service
 *
 * Analyzes RSI, MACD, Volume for entry confirmation and exhaustion detection.
 * No caching - momentum must always be fresh.
 */

import { binanceService } from '../binanceService';
import {
  MomentumAnalysisResult,
  RSIAnalysis,
  MACDAnalysis,
  VolumeAnalysis,
  ExhaustionWarning,
} from '../../types/v6/analysis.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MOMENTUM_CONFIG = {
  RSI_PERIOD: 14,
  RSI_OVERSOLD: 30,
  RSI_OVERBOUGHT: 70,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  VOLUME_PERIOD: 20,
  VOLUME_SPIKE_THRESHOLD: 1.5,
  CANDLES_TO_FETCH: 100,
};

// ============================================================================
// MOMENTUM EXPERT SERVICE
// ============================================================================

class MomentumExpertService {
  // Store last analyzed result per symbol (for pre-execution validation without API call)
  private lastResultBySymbol: Map<string, MomentumAnalysisResult> = new Map();

  // Legacy single-symbol result (for backwards compatibility)
  private lastResult: MomentumAnalysisResult | null = null;

  /**
   * Get cached result (for fast pre-execution checks)
   * Returns null if no analysis has been done yet
   * @param symbol - Binance symbol. Defaults to 'BTCUSDT'.
   */
  getCachedResult(symbol: string = 'BTCUSDT'): MomentumAnalysisResult | null {
    return this.lastResultBySymbol.get(symbol) || (symbol === 'BTCUSDT' ? this.lastResult : null);
  }

  /**
   * Analyze momentum indicators (always fresh, no cache)
   * @param symbol - Binance symbol (e.g., 'BTCUSDT', 'ETHUSDT'). Defaults to 'BTCUSDT'.
   */
  async analyze(symbol: string = 'BTCUSDT'): Promise<MomentumAnalysisResult> {
    console.log(`[V6-MOMENTUM] ${symbol}: Analyzing momentum indicators (fresh)...`);

    // Fetch fresh 15m candles
    const candles = await binanceService.getKlines(symbol, '15m', MOMENTUM_CONFIG.CANDLES_TO_FETCH);

    if (!candles || candles.length < MOMENTUM_CONFIG.MACD_SLOW + MOMENTUM_CONFIG.MACD_SIGNAL + 5) {
      console.warn('[V6-MOMENTUM] Insufficient candle data');
      return this.getNeutralResult();
    }

    // Extract price and volume data
    const closes = candles.map((c: any) => parseFloat(c[4]));
    const volumes = candles.map((c: any) => parseFloat(c[5]));
    const highs = candles.map((c: any) => parseFloat(c[2]));
    const lows = candles.map((c: any) => parseFloat(c[3]));

    // Calculate indicators
    const rsi = this.analyzeRSI(closes);
    const macd = this.analyzeMACD(closes);
    const volume = this.analyzeVolume(volumes);

    // Detect exhaustion
    const exhaustionWarning = this.detectExhaustion(rsi, macd, closes, highs, lows);

    // Determine overall momentum
    const overallMomentum = this.determineOverallMomentum(rsi, macd, volume);

    // Calculate entry quality
    const entryQuality = this.calculateEntryQuality(rsi, macd, volume, exhaustionWarning);

    // Calculate confidence modifier
    const confidenceModifier = this.calculateConfidenceModifier(rsi, macd, volume, exhaustionWarning);

    console.log(`[V6-MOMENTUM] ${symbol}: RSI: ${rsi.value.toFixed(1)} (${rsi.zone}) | MACD: ${macd.crossover} | Volume: ${volume.ratio.toFixed(2)}x (${volume.trend})`);
    console.log(`[V6-MOMENTUM] ${symbol}: Overall: ${overallMomentum} | Exhaustion: ${exhaustionWarning.isExhausted ? 'YES - ' + exhaustionWarning.reason : 'No'}`);

    const result: MomentumAnalysisResult = {
      rsi,
      macd,
      volume,
      overallMomentum,
      exhaustionWarning,
      entryQuality,
      confidenceModifier,
    };

    // Store for getCachedResult() - used by pre-execution validation
    this.lastResultBySymbol.set(symbol, result);
    if (symbol === 'BTCUSDT') {
      this.lastResult = result;  // Legacy compatibility
    }

    return result;
  }

  /**
   * Analyze RSI
   */
  private analyzeRSI(closes: number[]): RSIAnalysis {
    const rsiValues = this.calculateRSI(closes, MOMENTUM_CONFIG.RSI_PERIOD);
    const value = rsiValues[rsiValues.length - 1];

    const zone: 'OVERSOLD' | 'NEUTRAL' | 'OVERBOUGHT' =
      value <= MOMENTUM_CONFIG.RSI_OVERSOLD ? 'OVERSOLD' :
      value >= MOMENTUM_CONFIG.RSI_OVERBOUGHT ? 'OVERBOUGHT' : 'NEUTRAL';

    // Simple divergence detection
    const divergence = this.detectRSIDivergence(closes, rsiValues);

    return { value, zone, divergence };
  }

  /**
   * Calculate RSI array
   */
  private calculateRSI(closes: number[], period: number): number[] {
    const rsi: number[] = [];
    let gains = 0;
    let losses = 0;

    // Initial average
    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // First RSI
    rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));

    // Rest of RSI values
    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
      rsi.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }

    return rsi;
  }

  /**
   * Detect RSI divergence
   */
  private detectRSIDivergence(closes: number[], rsiValues: number[]): 'BULLISH' | 'BEARISH' | 'NONE' {
    if (rsiValues.length < 20) return 'NONE';

    const recentPrices = closes.slice(-20);
    const recentRSI = rsiValues.slice(-20);

    // Find local highs/lows in last 20 periods
    const priceStart = recentPrices[0];
    const priceEnd = recentPrices[recentPrices.length - 1];
    const rsiStart = recentRSI[0];
    const rsiEnd = recentRSI[recentRSI.length - 1];

    // Bullish divergence: price making lower lows but RSI making higher lows
    if (priceEnd < priceStart && rsiEnd > rsiStart) {
      return 'BULLISH';
    }

    // Bearish divergence: price making higher highs but RSI making lower highs
    if (priceEnd > priceStart && rsiEnd < rsiStart) {
      return 'BEARISH';
    }

    return 'NONE';
  }

  /**
   * Analyze MACD
   */
  private analyzeMACD(closes: number[]): MACDAnalysis {
    const { macdLine, signalLine, histogram } = this.calculateMACD(closes);

    const value = macdLine[macdLine.length - 1];
    const signal = signalLine[signalLine.length - 1];
    const hist = histogram[histogram.length - 1];
    const prevHist = histogram.length > 1 ? histogram[histogram.length - 2] : 0;

    // Determine trend
    const trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      hist > 0 && hist > prevHist ? 'BULLISH' :
      hist < 0 && hist < prevHist ? 'BEARISH' : 'NEUTRAL';

    // Detect crossover
    let crossover: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NONE' = 'NONE';
    if (histogram.length >= 2) {
      const currAbove = macdLine[macdLine.length - 1] > signalLine[signalLine.length - 1];
      const prevAbove = macdLine[macdLine.length - 2] > signalLine[signalLine.length - 2];

      if (currAbove && !prevAbove) crossover = 'BULLISH_CROSS';
      else if (!currAbove && prevAbove) crossover = 'BEARISH_CROSS';
    }

    return { value, signal, histogram: hist, trend, crossover };
  }

  /**
   * Calculate MACD
   */
  private calculateMACD(closes: number[]): {
    macdLine: number[];
    signalLine: number[];
    histogram: number[];
  } {
    const ema12 = this.calculateEMAArray(closes, MOMENTUM_CONFIG.MACD_FAST);
    const ema26 = this.calculateEMAArray(closes, MOMENTUM_CONFIG.MACD_SLOW);

    // MACD line = EMA12 - EMA26
    const macdLine: number[] = [];
    for (let i = 0; i < ema12.length && i < ema26.length; i++) {
      macdLine.push(ema12[i] - ema26[i]);
    }

    // Signal line = 9-period EMA of MACD line
    const signalLine = this.calculateEMAArray(macdLine, MOMENTUM_CONFIG.MACD_SIGNAL);

    // Histogram = MACD line - Signal line
    const histogram: number[] = [];
    const offset = macdLine.length - signalLine.length;
    for (let i = 0; i < signalLine.length; i++) {
      histogram.push(macdLine[i + offset] - signalLine[i]);
    }

    return { macdLine, signalLine, histogram };
  }

  /**
   * Calculate EMA array
   */
  private calculateEMAArray(values: number[], period: number): number[] {
    if (values.length < period) return [values[values.length - 1]];

    const multiplier = 2 / (period + 1);
    const ema: number[] = [];

    // First EMA is SMA
    ema.push(values.slice(0, period).reduce((a, b) => a + b) / period);

    for (let i = period; i < values.length; i++) {
      ema.push((values[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
    }

    return ema;
  }

  /**
   * Analyze Volume
   */
  private analyzeVolume(volumes: number[]): VolumeAnalysis {
    const current = volumes[volumes.length - 1];
    const recentVolumes = volumes.slice(-MOMENTUM_CONFIG.VOLUME_PERIOD);
    const average = recentVolumes.reduce((a, b) => a + b) / recentVolumes.length;
    const ratio = average > 0 ? current / average : 1;

    const trend: 'HIGH' | 'NORMAL' | 'LOW' =
      ratio >= 1.2 ? 'HIGH' :
      ratio <= 0.8 ? 'LOW' : 'NORMAL';

    const spike = ratio >= MOMENTUM_CONFIG.VOLUME_SPIKE_THRESHOLD;

    return { current, average, ratio, trend, spike };
  }

  /**
   * Detect exhaustion conditions
   */
  private detectExhaustion(
    rsi: RSIAnalysis,
    macd: MACDAnalysis,
    closes: number[],
    highs: number[],
    lows: number[]
  ): ExhaustionWarning {
    // Check for SELL exhaustion (don't sell after big drop)
    if (rsi.zone === 'OVERSOLD') {
      return {
        isExhausted: true,
        direction: 'SELL',
        reason: `RSI ${rsi.value.toFixed(1)} oversold - bounce likely`,
      };
    }

    // Check for BUY exhaustion (don't buy after big rise)
    if (rsi.zone === 'OVERBOUGHT') {
      return {
        isExhausted: true,
        direction: 'BUY',
        reason: `RSI ${rsi.value.toFixed(1)} overbought - pullback likely`,
      };
    }

    // Check for MACD exhaustion with RSI
    if (rsi.value < 40 && macd.histogram > 0 && macd.trend === 'BULLISH') {
      return {
        isExhausted: true,
        direction: 'SELL',
        reason: 'RSI recovering from lows with MACD turning bullish',
      };
    }

    if (rsi.value > 60 && macd.histogram < 0 && macd.trend === 'BEARISH') {
      return {
        isExhausted: true,
        direction: 'BUY',
        reason: 'RSI falling from highs with MACD turning bearish',
      };
    }

    // Check for extended moves using recent price action
    const last20Closes = closes.slice(-20);
    const movePercent = ((last20Closes[last20Closes.length - 1] - last20Closes[0]) / last20Closes[0]) * 100;

    if (movePercent > 2.5) {
      return {
        isExhausted: true,
        direction: 'BUY',
        reason: `Price moved +${movePercent.toFixed(2)}% in 20 periods - extended`,
      };
    }

    if (movePercent < -2.5) {
      return {
        isExhausted: true,
        direction: 'SELL',
        reason: `Price moved ${movePercent.toFixed(2)}% in 20 periods - extended`,
      };
    }

    return { isExhausted: false, direction: null, reason: 'No exhaustion detected' };
  }

  /**
   * Determine overall momentum
   */
  private determineOverallMomentum(
    rsi: RSIAnalysis,
    macd: MACDAnalysis,
    volume: VolumeAnalysis
  ): 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH' {
    let bullScore = 0;
    let bearScore = 0;

    // RSI scoring
    if (rsi.zone === 'OVERSOLD') bullScore += 2;
    else if (rsi.zone === 'OVERBOUGHT') bearScore += 2;
    else if (rsi.value > 55) bullScore += 1;
    else if (rsi.value < 45) bearScore += 1;

    // Divergence scoring
    if (rsi.divergence === 'BULLISH') bullScore += 2;
    else if (rsi.divergence === 'BEARISH') bearScore += 2;

    // MACD scoring
    if (macd.trend === 'BULLISH') bullScore += 1;
    else if (macd.trend === 'BEARISH') bearScore += 1;

    if (macd.crossover === 'BULLISH_CROSS') bullScore += 2;
    else if (macd.crossover === 'BEARISH_CROSS') bearScore += 2;

    // Volume confirms
    if (volume.trend === 'HIGH') {
      if (bullScore > bearScore) bullScore += 1;
      else if (bearScore > bullScore) bearScore += 1;
    }

    const diff = bullScore - bearScore;

    if (diff >= 4) return 'STRONG_BULLISH';
    if (diff >= 2) return 'BULLISH';
    if (diff <= -4) return 'STRONG_BEARISH';
    if (diff <= -2) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * Calculate entry quality
   */
  private calculateEntryQuality(
    rsi: RSIAnalysis,
    macd: MACDAnalysis,
    volume: VolumeAnalysis,
    exhaustion: ExhaustionWarning
  ): { forBuy: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'; forSell: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' } {
    let buyScore = 0;
    let sellScore = 0;

    // RSI favors
    if (rsi.zone === 'OVERSOLD') buyScore += 3;
    else if (rsi.zone === 'OVERBOUGHT') sellScore += 3;
    else if (rsi.value < 45) buyScore += 1;
    else if (rsi.value > 55) sellScore += 1;

    // Divergence
    if (rsi.divergence === 'BULLISH') buyScore += 2;
    if (rsi.divergence === 'BEARISH') sellScore += 2;

    // MACD
    if (macd.crossover === 'BULLISH_CROSS') buyScore += 2;
    if (macd.crossover === 'BEARISH_CROSS') sellScore += 2;

    // Volume
    if (volume.trend === 'HIGH') {
      buyScore += 1;
      sellScore += 1;
    }

    // Exhaustion penalty
    if (exhaustion.isExhausted && exhaustion.direction === 'BUY') buyScore -= 3;
    if (exhaustion.isExhausted && exhaustion.direction === 'SELL') sellScore -= 3;

    const getQuality = (score: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' => {
      if (score >= 5) return 'EXCELLENT';
      if (score >= 3) return 'GOOD';
      if (score >= 1) return 'FAIR';
      return 'POOR';
    };

    return {
      forBuy: getQuality(buyScore),
      forSell: getQuality(sellScore),
    };
  }

  /**
   * Calculate confidence modifier
   */
  private calculateConfidenceModifier(
    rsi: RSIAnalysis,
    macd: MACDAnalysis,
    volume: VolumeAnalysis,
    exhaustion: ExhaustionWarning
  ): number {
    let modifier = 0;

    // RSI at extremes
    if (rsi.zone === 'OVERSOLD' || rsi.zone === 'OVERBOUGHT') modifier += 5;

    // Divergence is strong signal
    if (rsi.divergence !== 'NONE') modifier += 10;

    // MACD crossover
    if (macd.crossover !== 'NONE') modifier += 5;

    // High volume confirms
    if (volume.trend === 'HIGH') modifier += 5;
    else if (volume.trend === 'LOW') modifier -= 5;

    // Exhaustion warning is negative
    if (exhaustion.isExhausted) modifier -= 10;

    // Clamp to -15 to +15
    return Math.max(-15, Math.min(15, modifier));
  }

  /**
   * Get neutral result for missing data
   */
  private getNeutralResult(): MomentumAnalysisResult {
    return {
      rsi: { value: 50, zone: 'NEUTRAL', divergence: 'NONE' },
      macd: { value: 0, signal: 0, histogram: 0, trend: 'NEUTRAL', crossover: 'NONE' },
      volume: { current: 0, average: 0, ratio: 1, trend: 'NORMAL', spike: false },
      overallMomentum: 'NEUTRAL',
      exhaustionWarning: { isExhausted: false, direction: null, reason: 'Insufficient data' },
      entryQuality: { forBuy: 'FAIR', forSell: 'FAIR' },
      confidenceModifier: 0,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const momentumExpertService = new MomentumExpertService();
export { MomentumExpertService };
