import { binanceService } from './binanceService';
import { redisService } from './redisService';

export interface ScalpingPattern {
  type: 'BREAKOUT' | 'REVERSAL' | 'VOLUME_SPIKE' | 'MOMENTUM' | 'SUPPORT_BREAK' | 'RESISTANCE_BREAK';
  confidence: number; // 0-100
  direction: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  indicators: {
    rsi?: number;
    emaShort?: number;
    emaLong?: number;
    emaCross?: boolean;
    volumeRatio?: number;
    priceChange1m?: number;
    priceChange3m?: number;
    priceChange5m?: number;
    bollinger?: {
      upper: number;
      middle: number;
      lower: number;
      position: 'above' | 'below' | 'inside';
    };
  };
  timestamp: Date;
}

interface KlineData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export class ScalpingPatternService {
  private readonly CACHE_PREFIX = 'scalping_pattern:';
  private readonly CACHE_TTL = 60; // 1 minute cache
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🎯 Initializing Scalping Pattern Service for BTC...');

    // Subscribe to BTC ticker updates from Binance
    try {
      // Ensure BTC is in the subscribed symbols
      await binanceService.getSymbolInfo('BTCUSDT');
      console.log('✅ Scalping Pattern Service initialized for BTCUSDT');
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize Scalping Pattern Service:', error);
      throw error;
    }
  }

  /**
   * Detect scalping patterns for BTC
   */
  async detectPatterns(symbol: string = 'BTCUSDT'): Promise<ScalpingPattern> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}${symbol}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      // Get multi-timeframe data
      const [klines1m, klines3m, klines5m, currentTicker] = await Promise.all([
        binanceService.getKlineData(symbol, '1m', 20),
        binanceService.getKlineData(symbol, '3m', 20),
        binanceService.getKlineData(symbol, '5m', 20),
        binanceService.getSymbolInfo(symbol)
      ]);

      // Calculate indicators
      const indicators = this.calculateScalpingIndicators(klines1m, klines5m, currentTicker);

      // Detect pattern
      const pattern = this.analyzePattern(indicators, klines1m, klines3m, klines5m);

      // Cache the result
      await redisService.set(cacheKey, JSON.stringify(pattern), this.CACHE_TTL);

      return pattern;

    } catch (error) {
      console.error(`Error detecting patterns for ${symbol}:`, error);

      // Return neutral pattern on error
      return {
        type: 'MOMENTUM',
        confidence: 0,
        direction: 'HOLD',
        reasoning: 'Unable to analyze market data',
        indicators: {},
        timestamp: new Date()
      };
    }
  }

  /**
   * Calculate scalping indicators
   */
  private calculateScalpingIndicators(klines1m: any[], klines5m: any[], ticker: any): any {
    const indicators: any = {};

    if (klines1m.length >= 14) {
      // RSI (7-period for scalping)
      indicators.rsi = this.calculateRSI(klines1m.slice(-14), 7);
    }

    if (klines5m.length >= 21) {
      // EMA 9 and 21
      indicators.emaShort = this.calculateEMA(klines5m, 9);
      indicators.emaLong = this.calculateEMA(klines5m, 21);
      indicators.emaCross = indicators.emaShort > indicators.emaLong;
    }

    // Price changes
    if (klines1m.length >= 2) {
      const current = parseFloat(klines1m[klines1m.length - 1][4]); // close price
      const prev1m = parseFloat(klines1m[klines1m.length - 2][4]);
      indicators.priceChange1m = ((current - prev1m) / prev1m) * 100;
    }

    if (klines1m.length >= 3) {
      const current = parseFloat(klines1m[klines1m.length - 1][4]);
      const prev3m = parseFloat(klines1m[klines1m.length - 4][4]);
      indicators.priceChange3m = ((current - prev3m) / prev3m) * 100;
    }

    if (klines5m.length >= 2) {
      const current = parseFloat(klines5m[klines5m.length - 1][4]);
      const prev5m = parseFloat(klines5m[klines5m.length - 2][4]);
      indicators.priceChange5m = ((current - prev5m) / prev5m) * 100;
    }

    // Volume ratio
    if (klines1m.length >= 20) {
      const currentVol = parseFloat(klines1m[klines1m.length - 1][5]);
      const avgVol = klines1m.slice(-20, -1).reduce((sum, k) => sum + parseFloat(k[5]), 0) / 19;
      indicators.volumeRatio = avgVol > 0 ? currentVol / avgVol : 1;
    }

    // Bollinger Bands (20-period, 2 std dev)
    if (klines5m.length >= 20) {
      indicators.bollinger = this.calculateBollingerBands(klines5m.slice(-20), 20, 2);
    }

    return indicators;
  }

  /**
   * Analyze pattern and generate signal
   */
  private analyzePattern(indicators: any, klines1m: any[], klines3m: any[], klines5m: any[]): ScalpingPattern {
    let score = 0;
    let direction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let patternType: ScalpingPattern['type'] = 'MOMENTUM';
    const reasons: string[] = [];

    // RSI Analysis (oversold/overbought for scalping)
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        score += 25;
        direction = 'BUY';
        reasons.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
        patternType = 'REVERSAL';
      } else if (indicators.rsi > 70) {
        score += 25;
        direction = 'SELL';
        reasons.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
        patternType = 'REVERSAL';
      }
    }

    // EMA Crossover
    if (indicators.emaShort && indicators.emaLong) {
      if (indicators.emaCross) {
        score += 20;
        if (direction !== 'SELL') direction = 'BUY';
        reasons.push('EMA bullish crossover');
        patternType = 'MOMENTUM';
      } else {
        score += 20;
        direction = 'SELL';
        reasons.push('EMA bearish signal');
        patternType = 'MOMENTUM';
      }
    }

    // Volume Spike Detection
    if (indicators.volumeRatio > 2) {
      score += 20;
      patternType = 'VOLUME_SPIKE';
      if (indicators.priceChange1m > 0) {
        if (direction !== 'SELL') direction = 'BUY';
        reasons.push(`High volume (+${((indicators.volumeRatio - 1) * 100).toFixed(0)}%) with upward price`);
      } else {
        direction = 'SELL';
        reasons.push(`High volume (+${((indicators.volumeRatio - 1) * 100).toFixed(0)}%) with downward price`);
      }
    }

    // Price Momentum (1-minute)
    if (Math.abs(indicators.priceChange1m) > 0.5) {
      score += 15;
      if (indicators.priceChange1m > 0.5) {
        if (direction !== 'SELL') direction = 'BUY';
        reasons.push(`Strong upward momentum (+${indicators.priceChange1m.toFixed(2)}%)`);
      } else if (indicators.priceChange1m < -0.5) {
        direction = 'SELL';
        reasons.push(`Strong downward momentum (${indicators.priceChange1m.toFixed(2)}%)`);
      }
    }

    // Bollinger Band Breakout
    if (indicators.bollinger) {
      const currentPrice = parseFloat(klines5m[klines5m.length - 1][4]);

      if (currentPrice > indicators.bollinger.upper) {
        score += 20;
        direction = 'SELL'; // Overbought
        patternType = 'BREAKOUT';
        reasons.push('Price above upper Bollinger Band (overbought)');
      } else if (currentPrice < indicators.bollinger.lower) {
        score += 20;
        if (direction !== 'SELL') direction = 'BUY'; // Oversold
        patternType = 'BREAKOUT';
        reasons.push('Price below lower Bollinger Band (oversold)');
      }
    }

    // Support/Resistance levels (simplified)
    const recentHighs = klines5m.slice(-10).map(k => parseFloat(k[2]));
    const recentLows = klines5m.slice(-10).map(k => parseFloat(k[3]));
    const resistance = Math.max(...recentHighs);
    const support = Math.min(...recentLows);
    const currentPrice = parseFloat(klines5m[klines5m.length - 1][4]);

    if (currentPrice > resistance * 0.999) {
      score += 15;
      patternType = 'RESISTANCE_BREAK';
      if (direction !== 'SELL') direction = 'BUY';
      reasons.push(`Breaking resistance at $${resistance.toFixed(2)}`);
    } else if (currentPrice < support * 1.001) {
      score += 15;
      patternType = 'SUPPORT_BREAK';
      direction = 'SELL';
      reasons.push(`Breaking support at $${support.toFixed(2)}`);
    }

    // Confidence calculation (cap at 95 for scalping)
    const confidence = Math.min(95, score);

    // Require minimum confidence for signals
    if (confidence < 40) {
      direction = 'HOLD';
    }

    return {
      type: patternType,
      confidence,
      direction,
      reasoning: reasons.length > 0 ? reasons.join('; ') : 'No clear pattern detected',
      indicators,
      timestamp: new Date()
    };
  }

  /**
   * Calculate RSI
   */
  private calculateRSI(klines: any[], period: number = 7): number {
    if (klines.length < period + 1) return 50; // Neutral

    const changes: number[] = [];
    for (let i = 1; i < klines.length; i++) {
      const prev = parseFloat(klines[i - 1][4]);
      const curr = parseFloat(klines[i][4]);
      changes.push(curr - prev);
    }

    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);

    const avgGain = gains.slice(-period).reduce((sum, g) => sum + g, 0) / period;
    const avgLoss = losses.slice(-period).reduce((sum, l) => sum + l, 0) / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * Calculate EMA
   */
  private calculateEMA(klines: any[], period: number): number {
    if (klines.length < period) return parseFloat(klines[klines.length - 1][4]);

    const multiplier = 2 / (period + 1);
    const closePrices = klines.map(k => parseFloat(k[4]));

    let ema = closePrices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

    for (let i = period; i < closePrices.length; i++) {
      ema = (closePrices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate Bollinger Bands
   */
  private calculateBollingerBands(klines: any[], period: number = 20, stdDev: number = 2) {
    const closePrices = klines.map(k => parseFloat(k[4]));
    const sma = closePrices.reduce((sum, p) => sum + p, 0) / period;

    const squaredDiffs = closePrices.map(p => Math.pow(p - sma, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    const currentPrice = closePrices[closePrices.length - 1];
    const upper = sma + (standardDeviation * stdDev);
    const lower = sma - (standardDeviation * stdDev);

    let position: 'above' | 'below' | 'inside' = 'inside';
    if (currentPrice > upper) position = 'above';
    else if (currentPrice < lower) position = 'below';

    return {
      upper,
      middle: sma,
      lower,
      position
    };
  }

  /**
   * Check if scalping conditions are favorable
   */
  async isScalpingFavorable(symbol: string = 'BTCUSDT'): Promise<boolean> {
    try {
      const pattern = await this.detectPatterns(symbol);

      // Favorable conditions: confidence > 60 and clear direction
      return pattern.confidence >= 60 && pattern.direction !== 'HOLD';
    } catch (error) {
      console.error('Error checking scalping conditions:', error);
      return false;
    }
  }

  /**
   * Get latest pattern (cached or fresh)
   */
  async getLatestPattern(symbol: string = 'BTCUSDT'): Promise<ScalpingPattern | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${symbol}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      return await this.detectPatterns(symbol);
    } catch (error) {
      console.error('Error getting latest pattern:', error);
      return null;
    }
  }

  /**
   * Clear pattern cache
   */
  async clearCache(symbol?: string): Promise<void> {
    try {
      if (symbol) {
        const cacheKey = `${this.CACHE_PREFIX}${symbol}`;
        await redisService.del(cacheKey);
      } else {
        const keys = await redisService.keys(`${this.CACHE_PREFIX}*`);
        for (const key of keys) {
          await redisService.del(key);
        }
      }
      console.log(`Cleared scalping pattern cache for ${symbol || 'all symbols'}`);
    } catch (error) {
      console.error('Error clearing pattern cache:', error);
    }
  }
}

export const scalpingPatternService = new ScalpingPatternService();
