/**
 * MARIPOSA V6 PRO - Multi-Timeframe (MTF) Expert Service
 *
 * Analyzes H4, H1, M15, M5 trends to determine overall market direction.
 * Provides weighted confluence score and trading bias.
 */

import { binanceService } from '../binanceService';
import {
  MTFAnalysisResult,
  TimeframeTrend,
  MTF_WEIGHTS,
} from '../../types/v6/analysis.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MTF_CONFIG = {
  CACHE_TTL_MS: 5 * 60 * 1000,  // 5 minute cache
  PRICE_CHANGE_INVALIDATE_PCT: 0.3,  // Invalidate cache if price moves 0.3%
  EMA_FAST: 9,
  EMA_SLOW: 21,
  CANDLES_PER_TF: 50,
};

// ============================================================================
// MTF EXPERT SERVICE
// ============================================================================

class MTFExpertService {
  // Cache per symbol for multi-coin support
  private cacheBySymbol: Map<string, {
    result: MTFAnalysisResult | null;
    lastUpdate: number;
    lastPriceAtUpdate: number;
  }> = new Map();

  // Legacy single-symbol cache (for backwards compatibility)
  private cache: {
    result: MTFAnalysisResult | null;
    lastUpdate: number;
    lastPriceAtUpdate: number;
  } = { result: null, lastUpdate: 0, lastPriceAtUpdate: 0 };

  /**
   * Analyze multi-timeframe trends and return confluence score
   * @param symbol - Binance symbol (e.g., 'BTCUSDT', 'ETHUSDT'). Defaults to 'BTCUSDT'.
   */
  async analyze(symbol: string = 'BTCUSDT'): Promise<MTFAnalysisResult> {
    const now = Date.now();

    // Get or create symbol-specific cache
    if (!this.cacheBySymbol.has(symbol)) {
      this.cacheBySymbol.set(symbol, { result: null, lastUpdate: 0, lastPriceAtUpdate: 0 });
    }
    const symbolCache = this.cacheBySymbol.get(symbol)!;

    // Check if cache is valid
    const cacheAge = now - symbolCache.lastUpdate;
    if (symbolCache.result && cacheAge < MTF_CONFIG.CACHE_TTL_MS) {
      // Quick price check to see if we need to invalidate
      const currentPrice = await this.getCurrentPrice(symbol);
      const priceChange = symbolCache.lastPriceAtUpdate > 0
        ? Math.abs((currentPrice - symbolCache.lastPriceAtUpdate) / symbolCache.lastPriceAtUpdate) * 100
        : 999;

      if (priceChange < MTF_CONFIG.PRICE_CHANGE_INVALIDATE_PCT) {
        console.log(`[V6-MTF] ${symbol}: Using cached result (${Math.round(cacheAge / 1000)}s old, price moved ${priceChange.toFixed(2)}%)`);
        return symbolCache.result;
      }
      console.log(`[V6-MTF] ${symbol}: Cache invalidated: price moved ${priceChange.toFixed(2)}%`);
    }

    console.log(`[V6-MTF] ${symbol}: Analyzing multi-timeframe confluence...`);

    // Fetch candles for all timeframes in parallel
    const [h4Candles, h1Candles, m15Candles, m5Candles] = await Promise.all([
      binanceService.getKlines(symbol, '4h', MTF_CONFIG.CANDLES_PER_TF),
      binanceService.getKlines(symbol, '1h', MTF_CONFIG.CANDLES_PER_TF),
      binanceService.getKlines(symbol, '15m', MTF_CONFIG.CANDLES_PER_TF),
      binanceService.getKlines(symbol, '5m', MTF_CONFIG.CANDLES_PER_TF),
    ]);

    // Analyze each timeframe
    const h4 = this.analyzeTimeframe(h4Candles, 'H4');
    const h1 = this.analyzeTimeframe(h1Candles, 'H1');
    const m15 = this.analyzeTimeframe(m15Candles, 'M15');
    const m5 = this.analyzeTimeframe(m5Candles, 'M5');

    // Determine dominant trend from H4 (highest weight)
    const dominantTrend = h4.trend;

    // Calculate weighted confluence score
    const trends = { H4: h4, H1: h1, M15: m15, M5: m5 };
    let confluenceScore = 0;
    let alignmentCount = 0;

    Object.entries(trends).forEach(([tf, info]) => {
      const weight = MTF_WEIGHTS[tf as keyof typeof MTF_WEIGHTS];
      if (info.trend === dominantTrend && dominantTrend !== 'NEUTRAL') {
        confluenceScore += weight;
        alignmentCount++;
      } else if (info.trend === 'NEUTRAL') {
        confluenceScore += weight * 0.5;
      }
    });

    // Determine trading bias based on confluence
    let tradingBias: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
    if (confluenceScore >= 70) {
      tradingBias = dominantTrend === 'BULLISH' ? 'BUY' :
                    dominantTrend === 'BEARISH' ? 'SELL' : 'NEUTRAL';
    }

    // Determine strength
    const strength = confluenceScore >= 85 ? 'STRONG' :
                     confluenceScore >= 70 ? 'MODERATE' : 'WEAK';

    // Calculate confidence boost based on alignment
    let confidenceBoost = 0;
    if (confluenceScore >= 85) confidenceBoost = 15;
    else if (confluenceScore >= 70) confidenceBoost = 10;
    else if (confluenceScore >= 50) confidenceBoost = 0;
    else if (confluenceScore >= 30) confidenceBoost = -10;
    else confidenceBoost = -20;

    console.log(`[V6-MTF] ${symbol}: H4: ${h4.trend} (${h4.strength}%) | H1: ${h1.trend} (${h1.strength}%) | M15: ${m15.trend} (${m15.strength}%) | M5: ${m5.trend} (${m5.strength}%)`);
    console.log(`[V6-MTF] ${symbol}: Confluence: ${confluenceScore}% | Aligned: ${alignmentCount}/4 | Bias: ${tradingBias} | Strength: ${strength}`);

    const result: MTFAnalysisResult = {
      h4,
      h1,
      m15,
      m5,
      confluenceScore,
      alignmentCount,
      dominantTrend,
      tradingBias,
      strength,
      confidenceBoost,
    };

    // Update symbol-specific cache
    symbolCache.result = result;
    symbolCache.lastUpdate = now;
    symbolCache.lastPriceAtUpdate = parseFloat(m15Candles[m15Candles.length - 1]?.[4] || '0');

    // Also update legacy cache for backwards compatibility (when symbol is BTCUSDT)
    if (symbol === 'BTCUSDT') {
      this.cache.result = result;
      this.cache.lastUpdate = now;
      this.cache.lastPriceAtUpdate = symbolCache.lastPriceAtUpdate;
    }

    return result;
  }

  /**
   * Get cached result (for quick access in zone monitor)
   * @param symbol - Binance symbol. Defaults to 'BTCUSDT'.
   */
  getCachedResult(symbol: string = 'BTCUSDT'): MTFAnalysisResult | null {
    const symbolCache = this.cacheBySymbol.get(symbol);
    return symbolCache?.result || (symbol === 'BTCUSDT' ? this.cache.result : null);
  }

  /**
   * Analyze a single timeframe for trend
   */
  private analyzeTimeframe(candles: any[], timeframe: 'H4' | 'H1' | 'M15' | 'M5'): TimeframeTrend {
    if (!candles || candles.length < MTF_CONFIG.EMA_SLOW + 1) {
      return this.getNeutralTrend(timeframe);
    }

    // Extract close prices (index 4 in Binance kline array)
    const closes = candles.map((c: any) => parseFloat(c[4]));
    const currentPrice = closes[closes.length - 1];

    // Calculate EMAs
    const ema9 = this.calculateEMA(closes, MTF_CONFIG.EMA_FAST);
    const ema21 = this.calculateEMA(closes, MTF_CONFIG.EMA_SLOW);

    // Determine EMA alignment
    const emaAlignment = ema9 > ema21;

    // Price position relative to EMA21
    const priceVsEma21: 'ABOVE' | 'BELOW' | 'AT' =
      currentPrice > ema21 * 1.001 ? 'ABOVE' :
      currentPrice < ema21 * 0.999 ? 'BELOW' : 'AT';

    // Analyze recent structure (last 5 candles)
    const last5Closes = closes.slice(-5);
    const higherHighs = this.countHigherHighs(candles.slice(-5));
    const lowerLows = this.countLowerLows(candles.slice(-5));

    // Determine trend and strength
    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    let strength: number;

    const aboveBoth = currentPrice > ema9 && currentPrice > ema21;
    const belowBoth = currentPrice < ema9 && currentPrice < ema21;

    if (aboveBoth && emaAlignment) {
      trend = 'BULLISH';
      strength = 85 + (higherHighs * 3);
    } else if (belowBoth && !emaAlignment) {
      trend = 'BEARISH';
      strength = 85 + (lowerLows * 3);
    } else if (emaAlignment) {
      trend = 'BULLISH';
      strength = 60;
    } else if (!emaAlignment) {
      trend = 'BEARISH';
      strength = 60;
    } else {
      trend = 'NEUTRAL';
      strength = 50;
    }

    // Cap strength at 100
    strength = Math.min(strength, 100);

    return {
      timeframe,
      trend,
      strength,
      ema9,
      ema21,
      emaAlignment,
      priceVsEma21,
    };
  }

  /**
   * Calculate EMA
   */
  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) {
      return values[values.length - 1];
    }

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Count higher highs in candle array
   */
  private countHigherHighs(candles: any[]): number {
    let count = 0;
    for (let i = 1; i < candles.length; i++) {
      if (parseFloat(candles[i][2]) > parseFloat(candles[i - 1][2])) {
        count++;
      }
    }
    return count;
  }

  /**
   * Count lower lows in candle array
   */
  private countLowerLows(candles: any[]): number {
    let count = 0;
    for (let i = 1; i < candles.length; i++) {
      if (parseFloat(candles[i][3]) < parseFloat(candles[i - 1][3])) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get neutral trend for missing data
   */
  private getNeutralTrend(timeframe: 'H4' | 'H1' | 'M15' | 'M5'): TimeframeTrend {
    return {
      timeframe,
      trend: 'NEUTRAL',
      strength: 50,
      ema9: 0,
      ema21: 0,
      emaAlignment: false,
      priceVsEma21: 'AT',
    };
  }

  /**
   * Get current price quickly
   * @param symbol - Binance symbol. Defaults to 'BTCUSDT'.
   */
  private async getCurrentPrice(symbol: string = 'BTCUSDT'): Promise<number> {
    try {
      const candles = await binanceService.getKlines(symbol, '1m', 1);
      return parseFloat(candles[0]?.[4] || '0');
    } catch {
      return 0;
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const mtfExpertService = new MTFExpertService();
export { MTFExpertService };
