import { redisService } from './redisService';
import { binanceService } from './binanceService';
import { coinFilteringService } from './coinFilteringService';
import { aiAnalysisService } from './aiAnalysisService';
import { SymbolConverter } from '../utils/symbolConverter';

interface ProfitOpportunity {
  symbol: string;
  score: number;
  confidence: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  expectedReturn: number; // Expected return in percentage
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: string; // Expected timeframe for the opportunity
  entryPrice: number;
  targetPrice?: number;
  stopLoss?: number;
  volume24h: number;
  volatility: number;
  momentum: number;
  technicalStrength: number;
  marketCapRank?: number;
  reasoning: string[];
  lastUpdated: number;
}

interface ScoringWeights {
  volumeWeight: number;
  volatilityWeight: number;
  momentumWeight: number;
  technicalWeight: number;
  aiConfidenceWeight: number;
  liquidityWeight: number;
  riskAdjustment: number;
}

export class ProfitScoringService {
  private defaultWeights: ScoringWeights = {
    volumeWeight: 0.25,      // 25% - High volume = better execution
    volatilityWeight: 0.20,  // 20% - Volatility = profit potential
    momentumWeight: 0.20,    // 20% - Momentum = trend strength
    technicalWeight: 0.15,   // 15% - Technical indicators
    aiConfidenceWeight: 0.10, // 10% - AI analysis confidence
    liquidityWeight: 0.05,   // 5% - Liquidity depth
    riskAdjustment: 0.05     // 5% - Risk adjustment factor
  };

  async scoreProfitOpportunities(symbols: string[], weights?: Partial<ScoringWeights>): Promise<ProfitOpportunity[]> {
    try {
      const scoringWeights = { ...this.defaultWeights, ...weights };
      const opportunities: ProfitOpportunity[] = [];

      // Process symbols in batches to avoid overwhelming APIs
      const batchSize = 10;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const batchOpportunities = await Promise.allSettled(
          batch.map(symbol => this.scoreSymbol(symbol, scoringWeights))
        );

        batchOpportunities.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            opportunities.push(result.value);
          } else {
            console.warn(`Failed to score ${batch[index]}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
          }
        });

        // Small delay between batches
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Sort by score descending
      opportunities.sort((a, b) => b.score - a.score);

      // Cache top opportunities
      const cacheKey = 'top_profit_opportunities';
      await redisService.set(cacheKey, JSON.stringify(opportunities.slice(0, 20)), 180); // Cache for 3 minutes

      return opportunities;
    } catch (error) {
      console.error('Error scoring profit opportunities:', error);
      return [];
    }
  }

  private async scoreSymbol(symbol: string, weights: ScoringWeights): Promise<ProfitOpportunity | null> {
    try {
      const cacheKey = `profit_score:${symbol}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        const cachedOpportunity = JSON.parse(cached);
        if (Date.now() - cachedOpportunity.lastUpdated < 120000) { // 2 minutes
          return cachedOpportunity;
        }
      }

      // Gather all necessary data
      const [coinMetrics, marketData, klineData, orderBook, aiAnalysis] = await Promise.all([
        coinFilteringService.getCoinMetrics(symbol),
        binanceService.getMarketData(symbol),
        binanceService.getKlines(symbol, '5m', 100),
        binanceService.getOrderBook(symbol, 50),
        this.getAIAnalysisIfAvailable(symbol)
      ]);

      if (!coinMetrics || !marketData || !klineData || !orderBook) {
        return null;
      }

      // Calculate individual scores
      const volumeScore = this.calculateVolumeScore(coinMetrics);
      const volatilityScore = this.calculateVolatilityScore(coinMetrics);
      const momentumScore = this.calculateMomentumScore(klineData, marketData);
      const technicalScore = this.calculateTechnicalScore(klineData, orderBook);
      const aiScore = this.calculateAIScore(aiAnalysis);
      const liquidityScore = this.calculateLiquidityScore(orderBook);
      const riskScore = this.calculateRiskScore(coinMetrics, marketData);

      // Calculate weighted final score
      const rawScore = (
        volumeScore * weights.volumeWeight +
        volatilityScore * weights.volatilityWeight +
        momentumScore * weights.momentumWeight +
        technicalScore * weights.technicalWeight +
        aiScore * weights.aiConfidenceWeight +
        liquidityScore * weights.liquidityWeight
      ) * (1 - riskScore * weights.riskAdjustment);

      // Normalize to 0-100 scale
      const finalScore = Math.max(0, Math.min(100, rawScore * 100));

      // Determine recommendation based on AI analysis and technical indicators
      let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;

      if (aiAnalysis) {
        recommendation = aiAnalysis.recommendation;
        confidence = aiAnalysis.confidence;
      } else {
        // Fallback to technical analysis
        if (momentumScore > 0.7 && technicalScore > 0.6) {
          recommendation = marketData.change24h > 0 ? 'BUY' : 'SELL';
          confidence = Math.min(0.8, (momentumScore + technicalScore) / 2);
        }
      }

      // Calculate expected return and risk level
      const expectedReturn = this.calculateExpectedReturn(coinMetrics, momentumScore, volatilityScore);
      const riskLevel = this.determineRiskLevel(coinMetrics, riskScore);

      // Generate reasoning
      const reasoning = this.generateReasoning(
        coinMetrics, volumeScore, volatilityScore, momentumScore,
        technicalScore, aiScore, liquidityScore, riskScore
      );

      // Determine entry price and targets
      const currentPrice = parseFloat(marketData.price);
      let targetPrice: number | undefined;
      let stopLoss: number | undefined;

      if (aiAnalysis && aiAnalysis.targetPrice) {
        targetPrice = aiAnalysis.targetPrice;
        stopLoss = aiAnalysis.stopLoss;
      } else {
        // Calculate based on expected return and volatility
        const targetMove = expectedReturn / 100;
        if (recommendation === 'BUY') {
          targetPrice = currentPrice * (1 + targetMove);
          stopLoss = currentPrice * (1 - Math.min(0.005, coinMetrics.volatility / 200)); // Max 0.5% stop loss
        } else if (recommendation === 'SELL') {
          targetPrice = currentPrice * (1 - targetMove);
          stopLoss = currentPrice * (1 + Math.min(0.005, coinMetrics.volatility / 200));
        }
      }

      const opportunity: ProfitOpportunity = {
        symbol,
        score: finalScore,
        confidence,
        recommendation,
        expectedReturn,
        riskLevel,
        timeframe: this.determineTimeframe(momentumScore, volatilityScore),
        entryPrice: currentPrice,
        targetPrice,
        stopLoss,
        volume24h: coinMetrics.volumeUSDT,
        volatility: coinMetrics.volatility,
        momentum: momentumScore,
        technicalStrength: technicalScore,
        reasoning,
        lastUpdated: Date.now()
      };

      // Cache for 2 minutes
      await redisService.set(cacheKey, JSON.stringify(opportunity), 120);

      return opportunity;
    } catch (error) {
      console.error(`Error scoring symbol ${symbol}:`, error);
      return null;
    }
  }

  private calculateVolumeScore(metrics: any): number {
    // Score based on volume (0-1 scale)
    if (metrics.volumeUSDT >= 100000000) return 1.0; // $100M+
    if (metrics.volumeUSDT >= 50000000) return 0.9;  // $50M+
    if (metrics.volumeUSDT >= 25000000) return 0.8;  // $25M+
    if (metrics.volumeUSDT >= 10000000) return 0.7;  // $10M+
    if (metrics.volumeUSDT >= 5000000) return 0.6;   // $5M+
    if (metrics.volumeUSDT >= 2000000) return 0.4;   // $2M+
    if (metrics.volumeUSDT >= 1000000) return 0.2;   // $1M+
    return 0.1;
  }

  private calculateVolatilityScore(metrics: any): number {
    // Score based on volatility - optimal range for scalping
    const volatility = metrics.volatility;
    if (volatility >= 8) return 1.0;      // >8% very high
    if (volatility >= 5) return 0.9;      // 5-8% high
    if (volatility >= 3) return 0.8;      // 3-5% good
    if (volatility >= 2) return 0.6;      // 2-3% moderate
    if (volatility >= 1) return 0.4;      // 1-2% low
    return 0.1;                           // <1% very low
  }

  private calculateMomentumScore(klineData: any[], marketData: any): number {
    try {
      const recentPrices = klineData.slice(-20).map(candle => parseFloat(candle[4]));
      if (recentPrices.length < 10) return 0.3;

      // Calculate price momentum
      const currentPrice = recentPrices[recentPrices.length - 1];
      const price10ago = recentPrices[recentPrices.length - 10];
      const price20ago = recentPrices[0];

      const shortTermChange = (currentPrice - price10ago) / price10ago;
      const longTermChange = (currentPrice - price20ago) / price20ago;

      // Calculate volume momentum
      const recentVolumes = klineData.slice(-10).map(candle => parseFloat(candle[5]));
      const earlierVolumes = klineData.slice(-20, -10).map(candle => parseFloat(candle[5]));

      const avgRecentVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
      const avgEarlierVolume = earlierVolumes.reduce((sum, vol) => sum + vol, 0) / earlierVolumes.length;
      const volumeMomentum = avgEarlierVolume > 0 ? (avgRecentVolume - avgEarlierVolume) / avgEarlierVolume : 0;

      // Combine momentum signals
      const priceMomentum = Math.abs(shortTermChange) * 2 + Math.abs(longTermChange);
      const totalMomentum = priceMomentum + Math.min(volumeMomentum, 0.5);

      return Math.min(1.0, Math.max(0.0, totalMomentum * 2));
    } catch (error) {
      return 0.3;
    }
  }

  private calculateTechnicalScore(klineData: any[], orderBook: any): number {
    try {
      // Simple technical analysis
      const prices = klineData.slice(-20).map(candle => parseFloat(candle[4]));
      const volumes = klineData.slice(-20).map(candle => parseFloat(candle[5]));

      if (prices.length < 20) return 0.3;

      const currentPrice = prices[prices.length - 1];
      let score = 0.3;

      // Moving average trend
      const sma10 = prices.slice(-10).reduce((sum, price) => sum + price, 0) / 10;
      const sma20 = prices.reduce((sum, price) => sum + price, 0) / 20;

      if (currentPrice > sma10 && sma10 > sma20) score += 0.2; // Uptrend
      if (currentPrice > sma20) score += 0.1; // Above long MA

      // Support/Resistance levels
      const high20 = Math.max(...prices);
      const low20 = Math.min(...prices);
      const range = high20 - low20;

      // Price position in range
      const position = (currentPrice - low20) / range;
      if (position > 0.8 || position < 0.2) score += 0.2; // Near extremes

      // Order book analysis
      const bidDepth = orderBook.bids.slice(0, 10).reduce((sum: number, bid: any) => sum + parseFloat(bid[1]), 0);
      const askDepth = orderBook.asks.slice(0, 10).reduce((sum: number, ask: any) => sum + parseFloat(ask[1]), 0);
      const bookImbalance = Math.abs(bidDepth - askDepth) / (bidDepth + askDepth);

      if (bookImbalance > 0.2) score += 0.1; // Significant imbalance

      return Math.min(1.0, score);
    } catch (error) {
      return 0.3;
    }
  }

  private calculateAIScore(aiAnalysis: any): number {
    if (!aiAnalysis) return 0.3;

    let score = aiAnalysis.confidence || 0.3;

    // Bonus for non-HOLD recommendations with high confidence
    if (aiAnalysis.recommendation !== 'HOLD' && aiAnalysis.confidence > 0.7) {
      score += 0.2;
    }

    return Math.min(1.0, score);
  }

  private calculateLiquidityScore(orderBook: any): number {
    try {
      const bidDepth = orderBook.bids.slice(0, 20).reduce((sum: number, bid: any) =>
        sum + parseFloat(bid[1]) * parseFloat(bid[0]), 0);
      const askDepth = orderBook.asks.slice(0, 20).reduce((sum: number, ask: any) =>
        sum + parseFloat(ask[1]) * parseFloat(ask[0]), 0);

      const totalLiquidity = bidDepth + askDepth;

      if (totalLiquidity >= 2000000) return 1.0; // $2M+
      if (totalLiquidity >= 1000000) return 0.9; // $1M+
      if (totalLiquidity >= 500000) return 0.8;  // $500k+
      if (totalLiquidity >= 200000) return 0.6;  // $200k+
      if (totalLiquidity >= 100000) return 0.4;  // $100k+
      return 0.2;
    } catch (error) {
      return 0.3;
    }
  }

  private calculateRiskScore(metrics: any, marketData: any): number {
    // Higher risk score = higher risk (reduces final score)
    let risk = 0;

    // Volume risk
    if (metrics.volumeUSDT < 5000000) risk += 0.3; // Low volume = high risk
    if (metrics.volumeUSDT < 2000000) risk += 0.2; // Very low volume

    // Volatility risk
    if (metrics.volatility > 15) risk += 0.3; // Extreme volatility
    if (metrics.volatility < 1) risk += 0.2;  // Too low volatility

    // Price stability risk
    const change24h = Math.abs(parseFloat(marketData.change24h));
    if (change24h > 20) risk += 0.2; // Very high 24h change

    return Math.min(1.0, risk);
  }

  private calculateExpectedReturn(metrics: any, momentum: number, volatility: number): number {
    // Expected return in percentage
    const baseReturn = metrics.volatility * 0.2; // Base on volatility
    const momentumBonus = momentum * 0.5;        // Momentum bonus
    const volumeBonus = Math.min(0.3, metrics.volumeUSDT / 50000000); // Volume bonus

    return Math.min(2.0, Math.max(0.1, baseReturn + momentumBonus + volumeBonus));
  }

  private determineRiskLevel(metrics: any, riskScore: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (riskScore > 0.6) return 'HIGH';
    if (riskScore > 0.3) return 'MEDIUM';
    return 'LOW';
  }

  private determineTimeframe(momentum: number, volatility: number): string {
    if (momentum > 0.8 && volatility > 5) return '15-30 minutes';
    if (momentum > 0.6 && volatility > 3) return '30-60 minutes';
    if (momentum > 0.4) return '1-2 hours';
    return '2-4 hours';
  }

  private generateReasoning(
    metrics: any, volume: number, volatility: number, momentum: number,
    technical: number, ai: number, liquidity: number, risk: number
  ): string[] {
    const reasoning: string[] = [];

    // Volume reasoning
    if (volume >= 0.8) {
      reasoning.push(`High volume (${(metrics.volumeUSDT / 1000000).toFixed(1)}M USDT) ensures good execution`);
    } else if (volume >= 0.6) {
      reasoning.push(`Adequate volume (${(metrics.volumeUSDT / 1000000).toFixed(1)}M USDT) for scalping`);
    } else {
      reasoning.push(`Low volume (${(metrics.volumeUSDT / 1000000).toFixed(1)}M USDT) may affect execution`);
    }

    // Volatility reasoning
    if (volatility >= 0.8) {
      reasoning.push(`High volatility (${metrics.volatility.toFixed(2)}%) provides good profit opportunities`);
    } else if (volatility >= 0.6) {
      reasoning.push(`Moderate volatility (${metrics.volatility.toFixed(2)}%) suitable for scalping`);
    } else {
      reasoning.push(`Low volatility (${metrics.volatility.toFixed(2)}%) limits profit potential`);
    }

    // Momentum reasoning
    if (momentum >= 0.7) {
      reasoning.push('Strong momentum indicates directional bias');
    } else if (momentum >= 0.5) {
      reasoning.push('Moderate momentum present');
    } else {
      reasoning.push('Weak momentum - sideways action likely');
    }

    // Technical reasoning
    if (technical >= 0.7) {
      reasoning.push('Strong technical setup identified');
    } else if (technical >= 0.5) {
      reasoning.push('Decent technical levels present');
    } else {
      reasoning.push('Weak technical setup');
    }

    // Liquidity reasoning
    if (liquidity >= 0.8) {
      reasoning.push('Excellent liquidity depth');
    } else if (liquidity >= 0.6) {
      reasoning.push('Good liquidity available');
    } else {
      reasoning.push('Limited liquidity may cause slippage');
    }

    // Risk reasoning
    if (risk <= 0.3) {
      reasoning.push('Low risk profile');
    } else if (risk <= 0.6) {
      reasoning.push('Moderate risk level');
    } else {
      reasoning.push('High risk - proceed with caution');
    }

    return reasoning;
  }

  private async getAIAnalysisIfAvailable(symbol: string): Promise<any | null> {
    try {
      const analysisKey = `analysis:current:${symbol}`;
      const cached = await redisService.get(analysisKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      return null;
    }
  }

  // Get top profit opportunities
  async getTopOpportunities(limit = 10): Promise<ProfitOpportunity[]> {
    try {
      const cacheKey = 'top_profit_opportunities';
      const cached = await redisService.get(cacheKey);

      if (cached) {
        const opportunities = JSON.parse(cached);
        return opportunities.slice(0, limit);
      }

      // If no cache, get top coins and score them
      const topCoins = await coinFilteringService.getCoinsForAnalysis(20);
      const opportunities = await this.scoreProfitOpportunities(topCoins);

      return opportunities.slice(0, limit);
    } catch (error) {
      console.error('Error getting top opportunities:', error);
      return [];
    }
  }

  // Get opportunities by risk level
  async getOpportunitiesByRisk(riskLevel: 'LOW' | 'MEDIUM' | 'HIGH', limit = 10): Promise<ProfitOpportunity[]> {
    try {
      const allOpportunities = await this.getTopOpportunities(50);
      return allOpportunities
        .filter(opp => opp.riskLevel === riskLevel)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting opportunities by risk:', error);
      return [];
    }
  }

  // Get opportunities with specific recommendation
  async getOpportunitiesByRecommendation(recommendation: 'BUY' | 'SELL', limit = 10): Promise<ProfitOpportunity[]> {
    try {
      const allOpportunities = await this.getTopOpportunities(50);
      return allOpportunities
        .filter(opp => opp.recommendation === recommendation && opp.confidence > 0.6)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting opportunities by recommendation:', error);
      return [];
    }
  }

  // Clean up old cached scores
  async cleanupCache(): Promise<void> {
    try {
      const keys = await redisService.keys('profit_score:*');
      if (keys.length > 0) {
        await redisService.del(...keys);
      }
      console.log('Profit scoring cache cleaned up');
    } catch (error) {
      console.error('Error cleaning up profit scoring cache:', error);
    }
  }
}

export const profitScoringService = new ProfitScoringService();