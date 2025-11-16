/**
 * Scalping Signal Integrator
 *
 * Integrates scalping pattern detection with LLM analysis for MT4 agents.
 * This module enhances standard signals with scalping-specific patterns
 * and market drop detection.
 */

import { scalpingPatternService } from './scalpingPatternService';
import { marketDropDetector } from './marketDropDetector';

export interface EnhancedScalpingSignal {
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  targetPrice?: number;
  stopLoss?: number;
  scalpingPattern?: {
    type: string;
    confidence: number;
    direction: string;
    indicators: any;
  };
  marketCondition?: {
    dropLevel: string;
    priceChange1m: number;
    priceChange3m: number;
    velocity: number;
  };
  isScalpingFavorable: boolean;
  timestamp: Date;
}

export class ScalpingSignalIntegrator {
  /**
   * Generate enhanced scalping signal for MT4 agents
   * Combines pattern detection + market drop analysis
   */
  async generateScalpingSignal(
    symbol: string,
    baseAnalysis?: any
  ): Promise<EnhancedScalpingSignal> {
    try {
      // Use BTCUSDT for Binance data analysis (maps to BTCUSDm on MT4)
      const binanceSymbol = symbol.includes('BTC') ? 'BTCUSDT' : symbol;

      // Get scalping pattern
      const pattern = await scalpingPatternService.detectPatterns(binanceSymbol);

      // Get market condition
      const marketCondition = await marketDropDetector.getMarketCondition(binanceSymbol);

      // Check if scalping is favorable
      const isScalpingFavorable = pattern.confidence >= 60 &&
                                  pattern.direction !== 'HOLD' &&
                                  (!marketCondition || marketCondition.dropLevel === 'none');

      // Build enhanced signal
      const signal: EnhancedScalpingSignal = {
        symbol,
        recommendation: pattern.direction,
        confidence: pattern.confidence,
        reasoning: this.buildScalpingReasoning(pattern, marketCondition, baseAnalysis),
        isScalpingFavorable,
        timestamp: new Date()
      };

      // Add scalping pattern details
      signal.scalpingPattern = {
        type: pattern.type,
        confidence: pattern.confidence,
        direction: pattern.direction,
        indicators: pattern.indicators
      };

      // Add market condition details
      if (marketCondition) {
        signal.marketCondition = {
          dropLevel: marketCondition.dropLevel,
          priceChange1m: marketCondition.priceChange1m,
          priceChange3m: marketCondition.priceChange3m,
          velocity: marketCondition.velocity
        };

        // Override recommendation if market is dropping
        if (marketCondition.dropLevel === 'severe') {
          signal.recommendation = 'HOLD';
          signal.confidence = 0;
          signal.reasoning = `SEVERE MARKET DROP DETECTED (${marketCondition.priceChange3m.toFixed(2)}%). Trading suspended for safety.`;
          signal.isScalpingFavorable = false;
        } else if (marketCondition.dropLevel === 'moderate' && signal.recommendation === 'BUY') {
          // Reduce confidence for BUY signals during moderate drops
          signal.confidence = Math.max(0, signal.confidence - 30);
          signal.reasoning += ` | ⚠️ Moderate market drop detected (${marketCondition.priceChange1m.toFixed(2)}%), confidence reduced.`;
        }
      }

      return signal;

    } catch (error) {
      console.error('Error generating scalping signal:', error);

      // Return neutral signal on error
      return {
        symbol,
        recommendation: 'HOLD',
        confidence: 0,
        reasoning: 'Error analyzing market conditions',
        isScalpingFavorable: false,
        timestamp: new Date()
      };
    }
  }

  /**
   * Build comprehensive reasoning text
   */
  private buildScalpingReasoning(
    pattern: any,
    marketCondition: any,
    baseAnalysis?: any
  ): string {
    const reasons: string[] = [];

    // Add pattern reasoning
    if (pattern.reasoning) {
      reasons.push(`Pattern: ${pattern.reasoning}`);
    }

    // Add indicator details
    if (pattern.indicators) {
      if (pattern.indicators.rsi) {
        reasons.push(`RSI: ${pattern.indicators.rsi.toFixed(1)}`);
      }

      if (pattern.indicators.priceChange1m) {
        reasons.push(`1m momentum: ${pattern.indicators.priceChange1m > 0 ? '+' : ''}${pattern.indicators.priceChange1m.toFixed(2)}%`);
      }

      if (pattern.indicators.volumeRatio && pattern.indicators.volumeRatio > 1.5) {
        reasons.push(`High volume: +${((pattern.indicators.volumeRatio - 1) * 100).toFixed(0)}%`);
      }
    }

    // Add market condition warning if applicable
    if (marketCondition && marketCondition.dropLevel !== 'none') {
      reasons.push(`⚠️ Market ${marketCondition.dropLevel} drop: ${marketCondition.priceChange3m.toFixed(2)}% in 3m`);
    }

    // Add base LLM analysis if available
    if (baseAnalysis && baseAnalysis.reasoning) {
      reasons.push(`LLM Analysis: ${baseAnalysis.reasoning}`);
    }

    return reasons.join(' | ');
  }

  /**
   * Check if agent should use scalping mode
   */
  shouldUseScalpingMode(agent: any): boolean {
    return agent.broker === 'MT4' && agent.category === 'SCALPING';
  }

  /**
   * Get quick scalping signal (for high-frequency checks)
   */
  async getQuickScalpingSignal(symbol: string): Promise<{ direction: string; confidence: number }> {
    try {
      const binanceSymbol = symbol.includes('BTC') ? 'BTCUSDT' : symbol;
      const pattern = await scalpingPatternService.getLatestPattern(binanceSymbol);

      if (!pattern) {
        return { direction: 'HOLD', confidence: 0 };
      }

      return {
        direction: pattern.direction,
        confidence: pattern.confidence
      };

    } catch (error) {
      console.error('Error getting quick scalping signal:', error);
      return { direction: 'HOLD', confidence: 0 };
    }
  }

  /**
   * Check if market conditions allow trading
   */
  async canTradeNow(symbol: string): Promise<boolean> {
    try {
      const binanceSymbol = symbol.includes('BTC') ? 'BTCUSDT' : symbol;
      const condition = await marketDropDetector.getMarketCondition(binanceSymbol);

      if (!condition) {
        return true; // No data, allow trading
      }

      // Don't trade during severe drops
      return condition.dropLevel !== 'severe';

    } catch (error) {
      console.error('Error checking if can trade:', error);
      return false; // Err on the side of caution
    }
  }
}

export const scalpingSignalIntegrator = new ScalpingSignalIntegrator();
