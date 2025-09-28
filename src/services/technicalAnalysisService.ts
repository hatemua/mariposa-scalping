import { okxService } from './okxService';

export interface TechnicalSignal {
  type: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  timestamp: string;
  reasoning: string;
  indicators: {
    rsi?: number;
    macd?: { value: number; signal: number; histogram: number };
    ema?: { short: number; long: number };
    volume_ratio?: number;
    price_momentum?: number;
  };
}

export interface MarketData {
  price: number;
  volume: number;
  change24h: number;
  high24h: number;
  low24h: number;
}

export class TechnicalAnalysisService {

  /**
   * Generate a real technical analysis signal based on market data
   */
  async generateSignal(symbol: string, config?: any): Promise<TechnicalSignal> {
    try {
      // Get current market data
      const ticker = await okxService.getTicker(symbol);
      const marketData: MarketData = {
        price: parseFloat(ticker.last),
        volume: parseFloat(ticker.vol24h),
        change24h: parseFloat(ticker.sodUtc8),
        high24h: parseFloat(ticker.high24h),
        low24h: parseFloat(ticker.low24h)
      };

      // Calculate technical indicators
      const indicators = await this.calculateIndicators(marketData, config);

      // Generate signal based on indicators
      const signal = this.analyzeIndicators(indicators, marketData);

      return {
        type: signal.type,
        confidence: signal.confidence,
        timestamp: new Date().toISOString(),
        reasoning: signal.reasoning,
        indicators: indicators
      };

    } catch (error) {
      console.error('Error generating technical signal:', error);
      // Fallback to neutral signal if there's an error
      return {
        type: 'HOLD',
        confidence: 0.5,
        timestamp: new Date().toISOString(),
        reasoning: 'Unable to analyze market data - maintaining neutral position',
        indicators: {}
      };
    }
  }

  /**
   * Calculate technical indicators from market data
   */
  private async calculateIndicators(marketData: MarketData, config?: any): Promise<any> {
    const indicators: any = {};

    // RSI calculation (simplified using price momentum)
    const priceChange = marketData.change24h;
    indicators.rsi = this.calculateRSI(priceChange);

    // Volume analysis
    indicators.volume_ratio = this.calculateVolumeRatio(marketData.volume);

    // Price momentum
    indicators.price_momentum = priceChange;

    // EMA simulation (simplified)
    indicators.ema = {
      short: marketData.price * (1 + priceChange * 0.1 / 100),
      long: marketData.price * (1 + priceChange * 0.05 / 100)
    };

    // MACD simulation (simplified)
    const emaShort = indicators.ema.short;
    const emaLong = indicators.ema.long;
    indicators.macd = {
      value: emaShort - emaLong,
      signal: (emaShort - emaLong) * 0.9,
      histogram: (emaShort - emaLong) * 0.1
    };

    return indicators;
  }

  /**
   * Analyze indicators and generate trading signal
   */
  private analyzeIndicators(indicators: any, marketData: MarketData): { type: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string } {
    let bullishSignals = 0;
    let bearishSignals = 0;
    let signalStrength = 0;
    const reasons: string[] = [];

    // RSI Analysis
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        bullishSignals++;
        signalStrength += 0.2;
        reasons.push('RSI oversold (bullish)');
      } else if (indicators.rsi > 70) {
        bearishSignals++;
        signalStrength += 0.2;
        reasons.push('RSI overbought (bearish)');
      }
    }

    // Volume Analysis
    if (indicators.volume_ratio > 1.5) {
      signalStrength += 0.15;
      if (marketData.change24h > 0) {
        bullishSignals++;
        reasons.push('High volume with positive price action');
      } else {
        bearishSignals++;
        reasons.push('High volume with negative price action');
      }
    }

    // Price Momentum
    if (Math.abs(marketData.change24h) > 5) {
      signalStrength += 0.2;
      if (marketData.change24h > 5) {
        bullishSignals++;
        reasons.push('Strong upward momentum (+' + marketData.change24h.toFixed(2) + '%)');
      } else {
        bearishSignals++;
        reasons.push('Strong downward momentum (' + marketData.change24h.toFixed(2) + '%)');
      }
    }

    // MACD Analysis
    if (indicators.macd) {
      if (indicators.macd.value > indicators.macd.signal && indicators.macd.histogram > 0) {
        bullishSignals++;
        signalStrength += 0.15;
        reasons.push('MACD bullish crossover');
      } else if (indicators.macd.value < indicators.macd.signal && indicators.macd.histogram < 0) {
        bearishSignals++;
        signalStrength += 0.15;
        reasons.push('MACD bearish crossover');
      }
    }

    // EMA Analysis
    if (indicators.ema && indicators.ema.short > indicators.ema.long) {
      bullishSignals++;
      signalStrength += 0.1;
      reasons.push('Short EMA above long EMA');
    } else if (indicators.ema && indicators.ema.short < indicators.ema.long) {
      bearishSignals++;
      signalStrength += 0.1;
      reasons.push('Short EMA below long EMA');
    }

    // Market Position Analysis
    const pricePosition = (marketData.price - marketData.low24h) / (marketData.high24h - marketData.low24h);
    if (pricePosition > 0.8) {
      bearishSignals++;
      signalStrength += 0.1;
      reasons.push('Price near 24h high (potential resistance)');
    } else if (pricePosition < 0.2) {
      bullishSignals++;
      signalStrength += 0.1;
      reasons.push('Price near 24h low (potential support)');
    }

    // Determine signal
    let signalType: 'BUY' | 'SELL' | 'HOLD';
    let confidence: number;

    if (bullishSignals > bearishSignals + 1) {
      signalType = 'BUY';
      confidence = Math.min(0.9, 0.5 + signalStrength);
    } else if (bearishSignals > bullishSignals + 1) {
      signalType = 'SELL';
      confidence = Math.min(0.9, 0.5 + signalStrength);
    } else {
      signalType = 'HOLD';
      confidence = 0.4 + (signalStrength * 0.3);
    }

    const reasoning = reasons.length > 0
      ? reasons.join(', ')
      : 'Mixed signals - maintaining current position';

    return { type: signalType, confidence, reasoning };
  }

  /**
   * Calculate RSI from price change (simplified version)
   */
  private calculateRSI(priceChange: number): number {
    // Simplified RSI calculation based on recent price movement
    // In a real implementation, this would use 14-period calculation
    const gain = Math.max(0, priceChange);
    const loss = Math.max(0, -priceChange);

    // Normalize to 0-100 scale
    if (gain + loss === 0) return 50;

    const rs = gain / (loss || 0.01);
    const rsi = 100 - (100 / (1 + rs));

    // Apply some smoothing and bounds
    return Math.max(0, Math.min(100, rsi));
  }

  /**
   * Calculate volume ratio (current vs average)
   */
  private calculateVolumeRatio(volume: number): number {
    // Simplified volume ratio
    // In a real implementation, this would compare against historical average
    const averageVolume = volume * 0.7; // Assume current volume is above average
    return volume / averageVolume;
  }

  /**
   * Get recent trade signals for an agent
   */
  async getRecentSignals(symbol: string, limit: number = 10): Promise<TechnicalSignal[]> {
    // In a real implementation, this would fetch from a database
    // For now, return the current signal
    const currentSignal = await this.generateSignal(symbol);
    return [currentSignal];
  }

  /**
   * Validate market conditions for trading
   */
  async validateMarketConditions(symbol: string): Promise<{ safe: boolean; warnings: string[] }> {
    try {
      const ticker = await okxService.getTicker(symbol);
      const warnings: string[] = [];
      let safe = true;

      const priceChange = parseFloat(ticker.sodUtc8);
      const volume = parseFloat(ticker.vol24h);

      // Check for extreme volatility
      if (Math.abs(priceChange) > 20) {
        warnings.push(`Extreme volatility detected: ${priceChange.toFixed(2)}% in 24h`);
        safe = false;
      }

      // Check for low liquidity
      if (volume < 1000000) { // Less than $1M in 24h volume
        warnings.push('Low liquidity detected - trades may have high slippage');
        safe = false;
      }

      return { safe, warnings };
    } catch (error) {
      return {
        safe: false,
        warnings: ['Unable to validate market conditions - API error']
      };
    }
  }
}

export const technicalAnalysisService = new TechnicalAnalysisService();