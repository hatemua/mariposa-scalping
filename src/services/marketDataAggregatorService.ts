import { Opportunity, WhaleActivity, ConsolidatedAnalysis, BroadcastedSignal } from '../models';
import { binanceService } from './binanceService';
import mongoose from 'mongoose';

interface MarketSnapshot {
  date: Date;
  totalOpportunities: number;
  highConfidenceSignals: number;
  whaleActivitiesCount: number;
  averageOpportunityScore: number;
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  topGainers: Array<{ symbol: string; priceChange: number; volume: number }>;
  topLosers: Array<{ symbol: string; priceChange: number; volume: number }>;
  totalVolume: number;
}

interface OpportunitySummary {
  symbol: string;
  score: number;
  confidence: number;
  category: string;
  recommendation: string;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  expectedReturn: number;
  riskLevel: string;
  timeframe: string;
  indicators: {
    rsi: number;
    volume_ratio: number;
    volatility: number;
    momentum: number;
  };
  reasoning: string;
  llmInsights?: {
    traderThoughts: string;
    recommendation: string;
    confidence: number;
    keyFactors: string[];
  };
  detectedAt: Date;
}

interface WhaleActivitySummary {
  symbol: string;
  type: string;
  side: string;
  size: number;
  value: number;
  impact: string;
  confidence: number;
  volumeSpike: number;
  description: string;
  llmInsights?: {
    traderAnalysis: string;
    marketImpact: string;
    tradingStrategy: string;
    riskAssessment: string;
  };
  detectedAt: Date;
}

interface MarketBenchmarks {
  btcPerformance24h: number;
  ethPerformance24h: number;
  btcPerformance7d: number;
  ethPerformance7d: number;
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
}

interface MarketStatistics {
  opportunitiesByCategory: Map<string, number>;
  opportunitiesByRiskLevel: Map<string, number>;
  opportunitiesByTimeframe: Map<string, number>;
  topSymbolsByOpportunities: Array<{ symbol: string; count: number }>;
  confidenceDistribution: {
    high: number; // >0.7
    medium: number; // 0.4-0.7
    low: number; // <0.4
  };
  averageRiskReward: number;
  averageExpectedReturn: number;
}

export class MarketDataAggregatorService {
  /**
   * Get complete daily market snapshot
   */
  async getDailyMarketSnapshot(date: Date): Promise<MarketSnapshot> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Query opportunities for the day
      const opportunities = await Opportunity.find({
        detectedAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['ACTIVE', 'COMPLETED'] }
      });

      // Query whale activities
      const whaleActivities = await WhaleActivity.find({
        detectedAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['ACTIVE', 'EXECUTED'] }
      });

      // Calculate statistics
      const totalOpportunities = opportunities.length;
      const highConfidenceSignals = opportunities.filter(o => o.confidence >= 0.7).length;
      const averageOpportunityScore = opportunities.length > 0
        ? opportunities.reduce((sum, o) => sum + o.score, 0) / opportunities.length
        : 0;

      // Determine market sentiment based on buy vs sell recommendations
      const buyOpportunities = opportunities.filter(o =>
        o.llmInsights?.recommendation === 'BUY' || o.category === 'MOMENTUM' || o.category === 'BREAKOUT'
      ).length;
      const sellOpportunities = opportunities.filter(o =>
        o.llmInsights?.recommendation === 'SELL'
      ).length;

      let marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      if (buyOpportunities > sellOpportunities * 1.5) {
        marketSentiment = 'BULLISH';
      } else if (sellOpportunities > buyOpportunities * 1.5) {
        marketSentiment = 'BEARISH';
      }

      // Get top gainers and losers from opportunities
      const topGainers = opportunities
        .filter(o => o.priceChange > 0)
        .sort((a, b) => b.priceChange - a.priceChange)
        .slice(0, 5)
        .map(o => ({
          symbol: o.symbol,
          priceChange: o.priceChange,
          volume: o.volume24h
        }));

      const topLosers = opportunities
        .filter(o => o.priceChange < 0)
        .sort((a, b) => a.priceChange - b.priceChange)
        .slice(0, 5)
        .map(o => ({
          symbol: o.symbol,
          priceChange: o.priceChange,
          volume: o.volume24h
        }));

      // Calculate total volume from opportunities
      const totalVolume = opportunities.reduce((sum, o) => sum + o.volume24h, 0);

      return {
        date: startOfDay,
        totalOpportunities,
        highConfidenceSignals,
        whaleActivitiesCount: whaleActivities.length,
        averageOpportunityScore,
        marketSentiment,
        topGainers,
        topLosers,
        totalVolume
      };
    } catch (error) {
      console.error('Error getting daily market snapshot:', error);
      throw error;
    }
  }

  /**
   * Get top opportunities for the day
   */
  async getTopOpportunities(date: Date, limit: number = 10): Promise<OpportunitySummary[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const opportunities = await Opportunity.find({
        detectedAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['ACTIVE', 'COMPLETED'] }
      })
        .sort({ score: -1, confidence: -1 })
        .limit(limit)
        .lean();

      return opportunities.map(o => ({
        symbol: o.symbol,
        score: o.score,
        confidence: o.confidence,
        category: o.category,
        recommendation: o.llmInsights?.recommendation || 'HOLD',
        entry: o.entry,
        target: o.target,
        stopLoss: o.stopLoss,
        riskReward: o.riskReward,
        expectedReturn: o.expectedReturn,
        riskLevel: o.riskLevel,
        timeframe: o.timeframe,
        indicators: {
          rsi: o.indicators.rsi,
          volume_ratio: o.indicators.volume_ratio,
          volatility: o.indicators.volatility,
          momentum: o.indicators.momentum
        },
        reasoning: o.reasoning,
        llmInsights: o.llmInsights ? {
          traderThoughts: o.llmInsights.traderThoughts,
          recommendation: o.llmInsights.recommendation,
          confidence: o.llmInsights.confidence,
          keyFactors: o.llmInsights.keyFactors
        } : undefined,
        detectedAt: o.detectedAt
      }));
    } catch (error) {
      console.error('Error getting top opportunities:', error);
      return [];
    }
  }

  /**
   * Get whale activities for the day
   */
  async getWhaleActivities(date: Date, limit: number = 5): Promise<WhaleActivitySummary[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const whaleActivities = await WhaleActivity.find({
        detectedAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['ACTIVE', 'EXECUTED'] }
      })
        .sort({ impact: -1, value: -1 })
        .limit(limit)
        .lean();

      return whaleActivities.map(w => ({
        symbol: w.symbol,
        type: w.type,
        side: w.side,
        size: w.size,
        value: w.value,
        impact: w.impact,
        confidence: w.confidence,
        volumeSpike: w.volumeSpike,
        description: w.description,
        llmInsights: w.llmInsights ? {
          traderAnalysis: w.llmInsights.traderAnalysis,
          marketImpact: w.llmInsights.marketImpact,
          tradingStrategy: w.llmInsights.tradingStrategy,
          riskAssessment: w.llmInsights.riskAssessment
        } : undefined,
        detectedAt: w.detectedAt
      }));
    } catch (error) {
      console.error('Error getting whale activities:', error);
      return [];
    }
  }

  /**
   * Get market statistics and distributions
   */
  async getMarketStatistics(date: Date): Promise<MarketStatistics> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const opportunities = await Opportunity.find({
        detectedAt: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['ACTIVE', 'COMPLETED'] }
      }).lean();

      // Opportunities by category
      const opportunitiesByCategory = new Map<string, number>();
      opportunities.forEach(o => {
        const count = opportunitiesByCategory.get(o.category) || 0;
        opportunitiesByCategory.set(o.category, count + 1);
      });

      // Opportunities by risk level
      const opportunitiesByRiskLevel = new Map<string, number>();
      opportunities.forEach(o => {
        const count = opportunitiesByRiskLevel.get(o.riskLevel) || 0;
        opportunitiesByRiskLevel.set(o.riskLevel, count + 1);
      });

      // Opportunities by timeframe
      const opportunitiesByTimeframe = new Map<string, number>();
      opportunities.forEach(o => {
        const count = opportunitiesByTimeframe.get(o.timeframe) || 0;
        opportunitiesByTimeframe.set(o.timeframe, count + 1);
      });

      // Top symbols by opportunity count
      const symbolCounts = new Map<string, number>();
      opportunities.forEach(o => {
        const count = symbolCounts.get(o.symbol) || 0;
        symbolCounts.set(o.symbol, count + 1);
      });
      const topSymbolsByOpportunities = Array.from(symbolCounts.entries())
        .map(([symbol, count]) => ({ symbol, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Confidence distribution
      const high = opportunities.filter(o => o.confidence > 0.7).length;
      const medium = opportunities.filter(o => o.confidence >= 0.4 && o.confidence <= 0.7).length;
      const low = opportunities.filter(o => o.confidence < 0.4).length;

      // Average metrics
      const averageRiskReward = opportunities.length > 0
        ? opportunities.reduce((sum, o) => sum + o.riskReward, 0) / opportunities.length
        : 0;

      const averageExpectedReturn = opportunities.length > 0
        ? opportunities.reduce((sum, o) => sum + o.expectedReturn, 0) / opportunities.length
        : 0;

      return {
        opportunitiesByCategory,
        opportunitiesByRiskLevel,
        opportunitiesByTimeframe,
        topSymbolsByOpportunities,
        confidenceDistribution: { high, medium, low },
        averageRiskReward,
        averageExpectedReturn
      };
    } catch (error) {
      console.error('Error getting market statistics:', error);
      return {
        opportunitiesByCategory: new Map(),
        opportunitiesByRiskLevel: new Map(),
        opportunitiesByTimeframe: new Map(),
        topSymbolsByOpportunities: [],
        confidenceDistribution: { high: 0, medium: 0, low: 0 },
        averageRiskReward: 0,
        averageExpectedReturn: 0
      };
    }
  }

  /**
   * Get market benchmarks (BTC, ETH performance, etc.)
   */
  async getMarketBenchmarks(date: Date): Promise<MarketBenchmarks> {
    try {
      // Get current prices for BTC and ETH
      const btcData = await binanceService.getSymbolInfo('BTCUSDT');
      const ethData = await binanceService.getSymbolInfo('ETHUSDT');

      const btcPerformance24h = parseFloat(btcData.priceChangePercent || '0');
      const ethPerformance24h = parseFloat(ethData.priceChangePercent || '0');

      // For 7-day performance, we'll need historical data or approximate
      // For now, using 24h data as placeholder
      const btcPerformance7d = btcPerformance24h * 3; // Approximation
      const ethPerformance7d = ethPerformance24h * 3; // Approximation

      const btcPrice = parseFloat(btcData.lastPrice || btcData.price || '0');
      const ethPrice = parseFloat(ethData.lastPrice || ethData.price || '0');

      // Rough market cap estimates (placeholder calculations)
      const btcMarketCap = btcPrice * 19000000; // ~19M BTC supply
      const ethMarketCap = ethPrice * 120000000; // ~120M ETH supply
      const totalMarketCap = btcMarketCap + ethMarketCap * 2; // Rough estimate

      const btcVolume = parseFloat(String(btcData.volume || '0')) * btcPrice;
      const ethVolume = parseFloat(String(ethData.volume || '0')) * ethPrice;
      const totalVolume24h = btcVolume + ethVolume;

      const btcDominance = (btcMarketCap / totalMarketCap) * 100;
      const ethDominance = (ethMarketCap / totalMarketCap) * 100;

      return {
        btcPerformance24h,
        ethPerformance24h,
        btcPerformance7d,
        ethPerformance7d,
        totalMarketCap,
        totalVolume24h,
        btcDominance,
        ethDominance
      };
    } catch (error) {
      console.error('Error getting market benchmarks:', error);
      return {
        btcPerformance24h: 0,
        ethPerformance24h: 0,
        btcPerformance7d: 0,
        ethPerformance7d: 0,
        totalMarketCap: 0,
        totalVolume24h: 0,
        btcDominance: 0,
        ethDominance: 0
      };
    }
  }

  /**
   * Get top gainers and losers from opportunities
   */
  async getTopGainersLosers(date: Date, limit: number = 5): Promise<{
    gainers: Array<{ symbol: string; priceChange: number; volume: number }>;
    losers: Array<{ symbol: string; priceChange: number; volume: number }>;
  }> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const opportunities = await Opportunity.find({
        detectedAt: { $gte: startOfDay, $lte: endOfDay }
      }).lean();

      const gainers = opportunities
        .filter(o => o.priceChange > 0)
        .sort((a, b) => b.priceChange - a.priceChange)
        .slice(0, limit)
        .map(o => ({
          symbol: o.symbol,
          priceChange: o.priceChange,
          volume: o.volume24h
        }));

      const losers = opportunities
        .filter(o => o.priceChange < 0)
        .sort((a, b) => a.priceChange - b.priceChange)
        .slice(0, limit)
        .map(o => ({
          symbol: o.symbol,
          priceChange: o.priceChange,
          volume: o.volume24h
        }));

      return { gainers, losers };
    } catch (error) {
      console.error('Error getting top gainers/losers:', error);
      return { gainers: [], losers: [] };
    }
  }
}

export const marketDataAggregatorService = new MarketDataAggregatorService();
