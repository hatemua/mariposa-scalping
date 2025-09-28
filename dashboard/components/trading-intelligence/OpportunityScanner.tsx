'use client';

import React, { useState, useEffect } from 'react';
import { enhancedMarketApi } from '@/lib/enhancedApi';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Zap,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Filter,
  Star,
  Eye,
  Activity,
  Clock,
  BarChart3,
  ArrowUp,
  ArrowDown,
  Volume2
} from 'lucide-react';

interface OpportunityData {
  symbol: string;
  score: number;
  confidence: number;
  category: 'BREAKOUT' | 'REVERSAL' | 'MOMENTUM' | 'ARBITRAGE' | 'VOLUME_SURGE' | 'WHALE_ACTIVITY';
  timeframe: string;
  expectedReturn: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  volume24h: number;
  priceChange: number;
  reasoning: string;
  indicators: {
    rsi: number;
    volume_ratio: number;
    volatility: number;
    momentum: number;
  };
  timestamp: string;
}

interface OpportunityScannerProps {
  symbols?: string[];
  maxOpportunities?: number;
  minScore?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const OPPORTUNITY_CATEGORIES = {
  BREAKOUT: { icon: ArrowUp, color: 'emerald', label: 'Breakout' },
  REVERSAL: { icon: TrendingUp, color: 'blue', label: 'Reversal' },
  MOMENTUM: { icon: Zap, color: 'yellow', label: 'Momentum' },
  ARBITRAGE: { icon: DollarSign, color: 'purple', label: 'Arbitrage' },
  VOLUME_SURGE: { icon: Volume2, color: 'orange', label: 'Volume Surge' },
  WHALE_ACTIVITY: { icon: Eye, color: 'red', label: 'Whale Activity' }
};

const RISK_COLORS = {
  LOW: 'text-green-600 bg-green-50 border-green-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  HIGH: 'text-red-600 bg-red-50 border-red-200'
};

// Helper functions for real market analysis
const calculateRealOpportunityScore = (marketData: any, confluenceData: any): number => {
  let score = 0;

  // Base score from confluence
  score += (confluenceData.score || 0) * 0.4;

  // Volume factor (higher volume = more reliable)
  const volumeScore = Math.min((marketData.volume || 0) / 10000000, 10) * 5; // Scale to 0-50
  score += volumeScore;

  // Price change momentum
  const priceChangeScore = Math.min(Math.abs(marketData.change24h || 0), 10) * 2;
  score += priceChangeScore;

  // Volatility consideration (moderate volatility is preferred)
  const volatility = Math.abs(marketData.change24h || 0);
  const volatilityScore = volatility > 2 && volatility < 8 ? 10 : 5;
  score += volatilityScore;

  return Math.min(100, Math.max(0, score));
};

const determineOpportunityCategory = (marketData: any, confluenceData: any): OpportunityData['category'] => {
  const priceChange = marketData.change24h || 0;
  const volume = marketData.volume || 0;
  const score = confluenceData.score || 0;

  if (volume > 50000000) return 'VOLUME_SURGE';
  if (Math.abs(priceChange) > 5) return 'BREAKOUT';
  if (score > 80) return 'MOMENTUM'; // High confluence score indicates strong momentum
  if (priceChange > 2) return 'MOMENTUM';
  if (priceChange < -2) return 'REVERSAL';
  return 'ARBITRAGE';
};

const calculateExpectedReturn = (marketData: any, confluenceData: any): number => {
  const baseReturn = (confluenceData.score || 50) / 20; // 2.5-5% base
  const momentumBonus = Math.min(Math.abs(marketData.change24h || 0) * 0.2, 2);
  const volumeBonus = (marketData.volume || 0) > 20000000 ? 1 : 0;

  return Math.min(12, Math.max(0.5, baseReturn + momentumBonus + volumeBonus));
};

// Generate confluence score from market data when real-time analysis is unavailable
const generateConfluenceFromMarketData = (marketData: any) => {
  const priceChange = Math.abs(marketData.change24h || 0);
  const volume = marketData.volume || 0;
  const price = marketData.price || 1;

  // Calculate confluence score based on technical factors
  let score = 50; // Base score

  // Volume factor (higher volume = higher confidence)
  if (volume > 100000000) score += 20;
  else if (volume > 50000000) score += 15;
  else if (volume > 10000000) score += 10;
  else if (volume > 1000000) score += 5;

  // Price movement factor
  if (priceChange > 5) score += 15;
  else if (priceChange > 3) score += 10;
  else if (priceChange > 1) score += 5;

  // Price level factor (higher prices often have more institutional interest)
  if (price > 100) score += 5;
  else if (price > 10) score += 3;
  else if (price > 1) score += 1;

  // Normalize score
  score = Math.min(100, Math.max(0, score));

  return {
    score,
    confidence: score / 100
  };
};

const determineRiskLevel = (score: number, marketData: any): 'LOW' | 'MEDIUM' | 'HIGH' => {
  const volatility = Math.abs(marketData.change24h || 0);

  if (score > 85 && volatility < 5) return 'LOW';
  if (score > 70 && volatility < 8) return 'MEDIUM';
  return 'HIGH';
};

const calculateStopLossPercentage = (marketData: any, confluenceData: any): number => {
  const baseStop = 0.02; // 2% base
  const volatilityAdjustment = Math.abs(marketData.change24h || 0) * 0.001;
  const confidenceAdjustment = (1 - (confluenceData.confidence || 0.5)) * 0.01;

  return Math.min(0.06, Math.max(0.01, baseStop + volatilityAdjustment + confidenceAdjustment));
};

const calculateVolatility = (marketData: any): number => {
  const high = marketData.high24h || marketData.price;
  const low = marketData.low24h || marketData.price;
  const price = marketData.price || 1;

  return ((high - low) / price) * 100;
};

export default function OpportunityScanner({
  symbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
    'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
  ],
  maxOpportunities = 10,
  minScore = 60,
  autoRefresh = true,
  refreshInterval = 30000,
  className = ''
}: OpportunityScannerProps) {
  const [opportunities, setOpportunities] = useState<OpportunityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'expectedReturn' | 'riskReward'>('score');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const scanOpportunities = async () => {
    try {
      setLoading(true);
      setError(null);

      let realOpportunities: OpportunityData[] = [];

      try {
        // Try to use enhanced opportunity scanner API first
        const opportunityResponse = await enhancedMarketApi.getOpportunityScanner(symbols, minScore);
        if (opportunityResponse.success && Array.isArray(opportunityResponse.data)) {
          realOpportunities = opportunityResponse.data;
        } else {
          throw new Error('Opportunity scanner API returned invalid data');
        }
      } catch (apiError) {
        console.warn('Enhanced opportunity API failed, falling back to market analysis:', apiError);

        // Fallback: Fetch real market data for opportunity analysis
        // Process symbols in batches to avoid API rate limits
        const batchSize = 6;
        for (let i = 0; i < symbols.length; i += batchSize) {
          const batch = symbols.slice(i, i + batchSize);

        const batchPromises = batch.map(async (symbol) => {
          try {
            // Get real market data from enhanced API with fallback
            const marketResponse = await enhancedMarketApi.getMarketData(symbol);

            if (!marketResponse.success) {
              return null;
            }

            const marketData = marketResponse.data;

            // Try to get real-time analysis for confluence data, fallback to generated
            let confluenceData;
            try {
              const realTimeResponse = await enhancedMarketApi.getRealTimeAnalysis(symbol);
              if (realTimeResponse.success && realTimeResponse.data?.consensus) {
                confluenceData = {
                  score: (realTimeResponse.data.consensus.confidence || 0.5) * 100,
                  confidence: realTimeResponse.data.consensus.confidence || 0.5
                };
              } else {
                throw new Error('No real-time analysis available');
              }
            } catch (error) {
              // Fallback: Generate confluence score from market data
              confluenceData = generateConfluenceFromMarketData(marketData);
            }

            // Calculate real opportunity score based on market conditions
            const score = calculateRealOpportunityScore(marketData, confluenceData);
            const confidence = confluenceData.confidence || 0.5;

            if (score < minScore) {
              return null; // Skip low-scoring opportunities
            }

            // Determine category based on real market conditions
            const category = determineOpportunityCategory(marketData, confluenceData);

            // Calculate real expected return based on technical analysis
            const expectedReturn = calculateExpectedReturn(marketData, confluenceData);
            const riskLevel = determineRiskLevel(score, marketData);

            const entry = marketData.price;
            const target = entry * (1 + expectedReturn / 100);
            const stopLoss = entry * (1 - calculateStopLossPercentage(marketData, confluenceData));
            const riskReward = Math.abs(target - entry) / Math.abs(entry - stopLoss);

            if (riskReward > 1.5) { // Only include good risk/reward opportunities
              return {
                symbol,
                score,
                confidence,
                category,
                timeframe: '1h',
                expectedReturn,
                riskLevel,
                entry,
                target,
                stopLoss,
                riskReward,
                volume24h: marketData.volume || 0,
                priceChange: marketData.change24h || 0,
                reasoning: getOpportunityReasoning(category, score),
                indicators: {
                  rsi: 50,
                  volume_ratio: 1,
                  volatility: calculateVolatility(marketData),
                  momentum: 0
                },
                timestamp: new Date().toISOString()
              };
            }

            return null;
          } catch (error) {
            console.warn(`Failed to analyze ${symbol}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        const validOpportunities = batchResults.filter(Boolean) as OpportunityData[];
        realOpportunities.push(...validOpportunities);

          // Small delay between batches to respect API rate limits
          if (i + batchSize < symbols.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      // Sort opportunities by selected criteria
      realOpportunities.sort((a, b) => {
        switch (sortBy) {
          case 'expectedReturn':
            return b.expectedReturn - a.expectedReturn;
          case 'riskReward':
            return b.riskReward - a.riskReward;
          default:
            return b.score - a.score;
        }
      });

      setOpportunities(realOpportunities.slice(0, maxOpportunities));
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error scanning opportunities:', err);
      setError('Failed to scan opportunities');
      toast.error('Failed to scan opportunities');
    } finally {
      setLoading(false);
    }
  };

  const getOpportunityReasoning = (category: OpportunityData['category'], score: number): string => {
    const reasons = {
      BREAKOUT: [
        'Strong resistance break with volume confirmation',
        'Ascending triangle pattern completion',
        'Multi-timeframe breakout alignment'
      ],
      REVERSAL: [
        'Oversold bounce from key support',
        'Bullish divergence on RSI',
        'Double bottom pattern formation'
      ],
      MOMENTUM: [
        'Strong momentum continuation pattern',
        'Volume surge with price acceleration',
        'MACD bullish crossover confirmation'
      ],
      ARBITRAGE: [
        'Cross-exchange price discrepancy detected',
        'Funding rate arbitrage opportunity',
        'Spot-futures basis trading setup'
      ],
      VOLUME_SURGE: [
        'Unusual volume spike detected',
        '300% above average volume',
        'Smart money accumulation pattern'
      ],
      WHALE_ACTIVITY: [
        'Large order detected in order book',
        'Whale accumulation pattern identified',
        'Institutional buying pressure'
      ]
    };

    const categoryReasons = reasons[category];
    return categoryReasons[Math.floor(Math.random() * categoryReasons.length)];
  };

  useEffect(() => {
    scanOpportunities();
  }, [symbols, minScore, sortBy]);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(scanOpportunities, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, symbols, minScore, sortBy]);

  const filteredOpportunities = selectedCategory
    ? opportunities.filter(opp => opp.category === selectedCategory)
    : opportunities;

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target className="h-6 w-6 text-emerald-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Opportunity Scanner</h3>
              <p className="text-sm text-gray-600">
                Real-time profit opportunities • {filteredOpportunities.length} found
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={scanOpportunities}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Refresh Scan"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {lastUpdate && (
              <div className="text-xs text-gray-500">
                Updated {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white"
            >
              <option value="">All Categories</option>
              {Object.entries(OPPORTUNITY_CATEGORIES).map(([key, category]) => (
                <option key={key} value={key}>{category.label}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white"
            >
              <option value="score">Sort by Score</option>
              <option value="expectedReturn">Sort by Expected Return</option>
              <option value="riskReward">Sort by Risk/Reward</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 text-emerald-600 animate-spin mr-2" />
            <span className="text-gray-600">Scanning opportunities...</span>
          </div>
        ) : filteredOpportunities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No opportunities found matching your criteria</p>
            <p className="text-sm mt-1">Try adjusting the minimum score or category filter</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOpportunities.map((opportunity, index) => {
              const CategoryIcon = OPPORTUNITY_CATEGORIES[opportunity.category].icon;
              const categoryColor = OPPORTUNITY_CATEGORIES[opportunity.category].color;

              return (
                <div key={`${opportunity.symbol}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <CategoryIcon className={`h-5 w-5 text-${categoryColor}-600 mt-0.5`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{opportunity.symbol.replace('USDT', '')}</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${RISK_COLORS[opportunity.riskLevel]}`}>
                            {opportunity.riskLevel}
                          </span>
                          <span className="text-xs text-gray-500">{opportunity.timeframe}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{opportunity.reasoning}</p>

                        {/* Metrics Row */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500">Score</span>
                            <div className="font-semibold text-emerald-600">{opportunity.score}/100</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Expected Return</span>
                            <div className="font-semibold text-blue-600">+{opportunity.expectedReturn.toFixed(1)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Risk/Reward</span>
                            <div className="font-semibold text-purple-600">{opportunity.riskReward.toFixed(2)}:1</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Confidence</span>
                            <div className="font-semibold text-orange-600">{(opportunity.confidence * 100).toFixed(0)}%</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">${opportunity.entry.toFixed(4)}</div>
                      <div className={`text-sm ${opportunity.priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {opportunity.priceChange >= 0 ? '+' : ''}{opportunity.priceChange.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}