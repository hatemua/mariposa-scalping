'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeArray } from '@/lib/formatters';
import { TokenAnalysisGridSkeleton } from './ui/SkeletonLoaders';
import { toast } from 'react-hot-toast';
import {
  Grid3X3,
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  BarChart3,
  Target,
  AlertTriangle,
  Star,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Eye
} from 'lucide-react';

interface TokenMetrics {
  volatility: number;
  volumeUSD: number;
  profitPotential: number;
  riskScore: number;
  liquidityScore: number;
  momentumScore: number;
}

interface TokenAnalysis {
  symbol: string;
  marketData: {
    symbol: string;
    price: number;
    volume: number;
    change24h: number;
    high24h: number;
    low24h: number;
    timestamp: string;
  };
  analysis?: {
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
    targetPrice?: number;
    stopLoss?: number;
  };
  metrics: TokenMetrics;
  signals: Array<{
    type: string;
    strength: number;
    reason: string;
    level?: number;
  }>;
  rank: number;
  error?: string;
}

interface TokenAnalysisGridProps {
  defaultTokens?: string[];
  maxTokens?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onTokenSelect?: (symbol: string) => void;
  className?: string;
}

const DEFAULT_TOKENS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
  'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
  'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
];

const SORT_OPTIONS = [
  { value: 'profitPotential', label: 'Profit Potential', icon: Target },
  { value: 'volume', label: 'Volume', icon: BarChart3 },
  { value: 'volatility', label: 'Volatility', icon: Activity },
  { value: 'momentum', label: 'Momentum', icon: TrendingUp }
];

export default function TokenAnalysisGrid({
  defaultTokens = DEFAULT_TOKENS,
  maxTokens = 18,
  autoRefresh = true,
  refreshInterval = 300000, // 5 minutes
  onTokenSelect,
  className = ''
}: TokenAnalysisGridProps) {
  const [tokens, setTokens] = useState<TokenAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('profitPotential');
  const [filterRecommendation, setFilterRecommendation] = useState<'all' | 'BUY' | 'SELL' | 'HOLD'>('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const loadTokenAnalysis = async () => {
    setLoading(true);
    try {
      const response = await marketApi.getBulkTokenAnalysis({
        symbols: defaultTokens,
        sortBy,
        limit: maxTokens
      });

      if (safeObject.get(response, 'success', false)) {
        const tokens = safeObject.get(response, 'data.tokens', []);
        setTokens(Array.isArray(tokens) ? tokens : []);
        setLastUpdate(new Date());
      } else {
        toast.error('Failed to load token analysis');
      }
    } catch (error) {
      console.error('Error loading token analysis:', error);
      toast.error('Error loading market data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokenAnalysis();
  }, [sortBy]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadTokenAnalysis, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, sortBy]);

  // Filter and sort tokens
  const filteredTokens = useMemo(() => {
    let filtered = tokens;

    // Filter by recommendation
    if (filterRecommendation !== 'all') {
      filtered = safeArray.filter(filtered, token =>
        safeObject.get(token, 'analysis.recommendation', '') === filterRecommendation
      );
    }

    // Filter by confidence
    if (minConfidence > 0) {
      filtered = safeArray.filter(filtered, token =>
        (safeObject.get(token, 'analysis.confidence', 0)) >= minConfidence / 100
      );
    }

    return filtered;
  }, [tokens, filterRecommendation, minConfidence]);

  const getRecommendationColor = (recommendation?: string) => {
    switch (recommendation) {
      case 'BUY': return 'text-green-600 bg-green-50 border-green-200';
      case 'SELL': return 'text-red-600 bg-red-50 border-red-200';
      case 'HOLD': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-400 bg-gray-50 border-gray-200';
    }
  };

  const getRecommendationIcon = (recommendation?: string) => {
    switch (recommendation) {
      case 'BUY': return <TrendingUp className="h-4 w-4" />;
      case 'SELL': return <TrendingDown className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getScoreColor = (score: number, invert = false) => {
    if (invert) score = 10 - score;

    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-yellow-600';
    if (score >= 4) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBarColor = (score: number, invert = false) => {
    if (invert) score = 10 - score;

    if (score >= 8) return 'bg-green-500';
    if (score >= 6) return 'bg-yellow-500';
    if (score >= 4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const ScoreBar = ({ score, max = 10, invert = false }: { score: number; max?: number; invert?: boolean }) => {
    const displayScore = invert ? max - score : score;
    const percentage = (displayScore / max) * 100;

    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${getScoreBarColor(displayScore)}`}
          style={{ width: `${Math.max(5, percentage)}%` }}
        />
      </div>
    );
  };

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Grid3X3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Token Analysis Grid</h2>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
              {filteredTokens.length} tokens
            </span>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdate && (
              <div className="text-sm text-gray-500">
                Updated: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
            <button
              onClick={loadTokenAnalysis}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters and Sorting */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Sort By */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-gray-600" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  Sort by {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Recommendation */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600" />
            <select
              value={filterRecommendation}
              onChange={(e) => setFilterRecommendation(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Signals</option>
              <option value="BUY">BUY Signals</option>
              <option value="SELL">SELL Signals</option>
              <option value="HOLD">HOLD Signals</option>
            </select>
          </div>

          {/* Min Confidence */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Min Confidence:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              className="w-20"
            />
            <span className="text-sm text-gray-600 w-8">{minConfidence}%</span>
          </div>
        </div>
      </div>

      {/* Token Grid */}
      <div className="p-6">
        {loading && safeArray.length(tokens) === 0 ? (
          <TokenAnalysisGridSkeleton count={maxTokens || 6} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {safeArray.map(filteredTokens, (token) => (
              <div
                key={token.symbol}
                onClick={() => onTokenSelect?.(token.symbol)}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer bg-white hover:border-blue-300"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {safeObject.get(token, 'symbol', '').replace('USDT', '')}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-1 rounded">
                      #{safeObject.get(token, 'rank', 0)}
                    </span>
                  </div>

                  {safeObject.get(token, 'analysis') && (
                    <div className={`px-2 py-1 rounded border text-xs font-medium ${getRecommendationColor(safeObject.get(token, 'analysis.recommendation', ''))}`}>
                      {getRecommendationIcon(safeObject.get(token, 'analysis.recommendation', ''))}
                      <span className="ml-1">{safeObject.get(token, 'analysis.recommendation', '')}</span>
                    </div>
                  )}
                </div>

                {/* Price Info */}
                <div className="mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-gray-900">
                      {safeNumber.price(safeObject.get(token, 'marketData.price', 0))}
                    </span>
                    <span className={`text-sm font-medium ${
                      safeObject.get(token, 'marketData.change24h', 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {safeObject.get(token, 'marketData.change24h', 0) >= 0 ? '+' : ''}{safeNumber.toFixed(safeObject.get(token, 'marketData.change24h', 0), 2)}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    Vol: ${safeNumber.toFixed((safeObject.get(token, 'marketData.volume', 0)) / 1000000, 1)}M
                  </div>
                </div>

                {/* AI Analysis */}
                {safeObject.get(token, 'analysis') && (
                  <div className="mb-3 p-2 bg-gray-50 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">AI Confidence</span>
                      <span className="text-xs font-medium">
                        {safeNumber.toFixed(safeObject.get(token, 'analysis.confidence', 0) * 100, 0)}%
                      </span>
                    </div>
                    <ScoreBar score={safeObject.get(token, 'analysis.confidence', 0) * 10} />

                    {(safeObject.get(token, 'analysis.targetPrice') || safeObject.get(token, 'analysis.stopLoss')) && (
                      <div className="mt-2 text-xs space-y-1">
                        {safeObject.get(token, 'analysis.targetPrice') && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Target:</span>
                            <span className="font-medium text-green-600">
                              {safeNumber.price(safeObject.get(token, 'analysis.targetPrice', 0))}
                            </span>
                          </div>
                        )}
                        {safeObject.get(token, 'analysis.stopLoss') && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Stop:</span>
                            <span className="font-medium text-red-600">
                              {safeNumber.price(safeObject.get(token, 'analysis.stopLoss', 0))}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Metrics */}
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Profit Potential</span>
                      <span className={`font-medium ${getScoreColor(safeObject.get(token, 'metrics.profitPotential', 0))}`}>
                        {safeNumber.toFixed(safeObject.get(token, 'metrics.profitPotential', 0), 1)}/10
                      </span>
                    </div>
                    <ScoreBar score={safeObject.get(token, 'metrics.profitPotential', 0)} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Risk Score</span>
                      <span className={`font-medium ${getScoreColor(safeObject.get(token, 'metrics.riskScore', 0), true)}`}>
                        {safeNumber.toFixed(safeObject.get(token, 'metrics.riskScore', 0), 1)}/10
                      </span>
                    </div>
                    <ScoreBar score={safeObject.get(token, 'metrics.riskScore', 0)} invert />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Momentum</span>
                      <span className={`font-medium ${getScoreColor(safeObject.get(token, 'metrics.momentumScore', 0))}`}>
                        {safeNumber.toFixed(safeObject.get(token, 'metrics.momentumScore', 0), 1)}/10
                      </span>
                    </div>
                    <ScoreBar score={safeObject.get(token, 'metrics.momentumScore', 0)} />
                  </div>
                </div>

                {/* Signals */}
                {safeArray.hasItems(safeObject.get(token, 'signals', [])) && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-600 mb-1">Signals:</div>
                    <div className="flex flex-wrap gap-1">
                      {safeArray.map(safeArray.slice(safeObject.get(token, 'signals', []), 0, 3), (signal, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            safeObject.get(signal, 'type', '') === 'buy' ? 'bg-green-100 text-green-700' :
                            safeObject.get(signal, 'type', '') === 'sell' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {safeObject.get(signal, 'type', '').toUpperCase()}
                        </span>
                      ))}
                      {safeArray.length(safeObject.get(token, 'signals', [])) > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                          +{safeArray.length(safeObject.get(token, 'signals', [])) - 3}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Details Toggle */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const tokenSymbol = safeObject.get(token, 'symbol', '');
                      setShowDetails(showDetails === tokenSymbol ? null : tokenSymbol);
                    }}
                    className="w-full flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Eye className="h-3 w-3" />
                    {showDetails === safeObject.get(token, 'symbol', '') ? 'Hide Details' : 'Show Details'}
                  </button>

                  {showDetails === safeObject.get(token, 'symbol', '') && (
                    <div className="mt-2 text-xs space-y-1 bg-blue-50 p-2 rounded">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-gray-600">Volatility:</span>
                          <span className="ml-1 font-medium">{safeNumber.toFixed(safeObject.get(token, 'metrics.volatility', 0), 1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Liquidity:</span>
                          <span className="ml-1 font-medium">{safeNumber.toFixed(safeObject.get(token, 'metrics.liquidityScore', 0), 1)}/10</span>
                        </div>
                      </div>
                      {safeObject.get(token, 'analysis.reasoning') && (
                        <div className="mt-2">
                          <span className="text-gray-600">Analysis:</span>
                          <p className="text-gray-700 mt-1 line-clamp-3">
                            {safeObject.get(token, 'analysis.reasoning', '')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredTokens.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500">
            <Grid3X3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No tokens match your filters</p>
            <button
              onClick={() => {
                setFilterRecommendation('all');
                setMinConfidence(0);
              }}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}