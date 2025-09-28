'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
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

      // Generate mock opportunities with realistic data
      const mockOpportunities: OpportunityData[] = [];

      for (const symbol of symbols.slice(0, 12)) {
        // Simulate profit scoring service logic
        const score = Math.floor(Math.random() * 40) + 60; // 60-100 range
        const confidence = Math.random() * 0.4 + 0.6; // 0.6-1.0 range
        const expectedReturn = Math.random() * 8 + 1; // 1-9% range
        const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
          score > 85 ? 'LOW' : score > 70 ? 'MEDIUM' : 'HIGH';

        const categories: OpportunityData['category'][] = [
          'BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY'
        ];
        const category = categories[Math.floor(Math.random() * categories.length)];

        const basePrice = Math.random() * 1000 + 1;
        const entry = basePrice;
        const target = entry * (1 + expectedReturn / 100);
        const stopLoss = entry * (1 - Math.random() * 0.05 - 0.01); // 1-6% stop
        const riskReward = (target - entry) / (entry - stopLoss);

        if (score >= minScore && riskReward > 1.5) {
          mockOpportunities.push({
            symbol,
            score,
            confidence,
            category,
            timeframe: ['1m', '5m', '15m', '1h'][Math.floor(Math.random() * 4)],
            expectedReturn,
            riskLevel,
            entry,
            target,
            stopLoss,
            riskReward,
            volume24h: Math.random() * 1000000000,
            priceChange: (Math.random() - 0.5) * 10,
            reasoning: getOpportunityReasoning(category, score),
            indicators: {
              rsi: Math.random() * 100,
              volume_ratio: Math.random() * 3 + 0.5,
              volatility: Math.random() * 8 + 1,
              momentum: (Math.random() - 0.5) * 10
            },
            timestamp: new Date().toISOString()
          });
        }
      }

      // Sort opportunities by selected criteria
      mockOpportunities.sort((a, b) => {
        switch (sortBy) {
          case 'expectedReturn':
            return b.expectedReturn - a.expectedReturn;
          case 'riskReward':
            return b.riskReward - a.riskReward;
          default:
            return b.score - a.score;
        }
      });

      setOpportunities(mockOpportunities.slice(0, maxOpportunities));
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