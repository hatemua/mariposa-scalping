'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Activity, Zap, AlertTriangle, Target, DollarSign } from 'lucide-react';

interface TokenAnalysis {
  symbol: string;
  timeframeData: {
    timeframe: string;
    marketData: {
      symbol: string;
      price: number;
      volume: number;
      change24h: number;
      high24h: number;
      low24h: number;
      timestamp: Date;
    };
    klineData: any[];
    orderBook: {
      bids: any[];
      asks: any[];
    };
  }[];
  analysis: {
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
    targetPrice?: number;
    stopLoss?: number;
    profitScore?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  } | null;
  profitPotential: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  error?: string;
}

interface MultiTokenGridProps {
  symbols: string[];
  onTokenSelect?: (symbol: string) => void;
  onAnalysisUpdate?: (analysis: TokenAnalysis) => void;
  refreshInterval?: number;
}

export default function MultiTokenGrid({
  symbols,
  onTokenSelect,
  onAnalysisUpdate,
  refreshInterval = 30000 // 30 seconds default
}: MultiTokenGridProps) {
  const [analyses, setAnalyses] = useState<Record<string, TokenAnalysis>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedTimeframes, setSelectedTimeframes] = useState(['5m', '15m', '1h']);

  const fetchMultiTokenAnalysis = useCallback(async () => {
    if (!symbols || symbols.length === 0) return;

    try {
      const response = await fetch('/api/market/analysis/multi-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          symbols,
          timeframes: selectedTimeframes
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch multi-token analysis');
      }

      const data = await response.json();

      if (data.success && data.data.analyses) {
        const newAnalyses: Record<string, TokenAnalysis> = {};

        data.data.analyses.forEach((analysis: TokenAnalysis) => {
          newAnalyses[analysis.symbol] = analysis;
          onAnalysisUpdate?.(analysis);
        });

        setAnalyses(newAnalyses);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching multi-token analysis:', error);
    } finally {
      setLoading(false);
    }
  }, [symbols, selectedTimeframes, onAnalysisUpdate]);

  useEffect(() => {
    fetchMultiTokenAnalysis();

    const interval = setInterval(fetchMultiTokenAnalysis, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchMultiTokenAnalysis, refreshInterval]);

  const getRiskColor = (riskLevel: 'LOW' | 'MEDIUM' | 'HIGH') => {
    switch (riskLevel) {
      case 'LOW': return 'text-green-600 bg-green-100';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
      case 'HIGH': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getRecommendationColor = (recommendation: 'BUY' | 'SELL' | 'HOLD') => {
    switch (recommendation) {
      case 'BUY': return 'text-green-600 bg-green-100 border-green-200';
      case 'SELL': return 'text-red-600 bg-red-100 border-red-200';
      case 'HOLD': return 'text-gray-600 bg-gray-100 border-gray-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getProfitScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 bg-green-100';
    if (score >= 6) return 'text-yellow-600 bg-yellow-100';
    if (score >= 4) return 'text-orange-600 bg-orange-100';
    return 'text-red-600 bg-red-100';
  };

  const formatPrice = (price: number) => {
    if (price < 1) return price.toFixed(6);
    if (price < 100) return price.toFixed(4);
    return price.toFixed(2);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000000) return `${(volume / 1000000000).toFixed(1)}B`;
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toFixed(0);
  };

  if (loading && Object.keys(analyses).length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(symbols || []).map(symbol => (
          <div key={symbol} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded mb-3"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timeframe Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Multi-Token Analysis</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Activity className="h-4 w-4" />
            {lastUpdate && `Updated ${lastUpdate.toLocaleTimeString()}`}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium text-gray-700">Timeframes:</span>
          {['1m', '5m', '15m', '1h', '4h', '1d'].map(timeframe => (
            <button
              key={timeframe}
              onClick={() => {
                setSelectedTimeframes(prev =>
                  prev.includes(timeframe)
                    ? prev.filter(t => t !== timeframe)
                    : [...prev, timeframe]
                );
              }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                selectedTimeframes.includes(timeframe)
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              {timeframe}
            </button>
          ))}
        </div>
      </div>

      {/* Token Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {symbols.map(symbol => {
          const analysis = analyses[symbol];
          const latestData = analysis?.timeframeData?.[0]?.marketData;
          const llmAnalysis = analysis?.analysis;

          return (
            <div
              key={symbol}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onTokenSelect?.(symbol)}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-gray-900">{symbol}</h4>
                  {analysis?.error && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
                {latestData && (
                  <div className="flex items-center gap-1">
                    {latestData.change24h >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                  </div>
                )}
              </div>

              {analysis?.error ? (
                <div className="text-center py-4">
                  <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-600">Analysis Error</p>
                </div>
              ) : latestData ? (
                <div className="space-y-3">
                  {/* Price and Change */}
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-gray-900">
                      ${formatPrice(latestData.price)}
                    </span>
                    <span className={`text-sm font-medium ${
                      latestData.change24h >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {latestData.change24h >= 0 ? '+' : ''}{latestData.change24h.toFixed(2)}%
                    </span>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Volume 24h:</span>
                    <span className="font-medium">${formatVolume(latestData.volume * latestData.price)}</span>
                  </div>

                  {/* LLM Analysis */}
                  {llmAnalysis && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-1 text-xs font-medium rounded-md border ${
                          getRecommendationColor(llmAnalysis.recommendation)
                        }`}>
                          {llmAnalysis.recommendation}
                        </span>
                        <span className="text-xs text-gray-600">
                          {(llmAnalysis.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>

                      {llmAnalysis.targetPrice && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            Target:
                          </span>
                          <span className="font-medium">${formatPrice(llmAnalysis.targetPrice)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Profit Potential & Risk */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-gray-400" />
                      <span className={`px-2 py-1 text-xs font-medium rounded-md ${
                        getProfitScoreColor(analysis?.profitPotential || 0)
                      }`}>
                        Profit: {analysis?.profitPotential || 0}/10
                      </span>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-md ${
                      getRiskColor(analysis?.riskLevel || 'HIGH')
                    }`}>
                      {analysis?.riskLevel || 'HIGH'} Risk
                    </span>
                  </div>

                  {/* Timeframe Analysis Summary */}
                  {analysis?.timeframeData && analysis.timeframeData.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-600 mb-1">Multi-timeframe:</div>
                      <div className="flex gap-1">
                        {analysis.timeframeData.map(tf => (
                          <div
                            key={tf.timeframe}
                            className={`px-1 py-0.5 text-xs rounded ${
                              tf.marketData.change24h >= 0
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {tf.timeframe}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <DollarSign className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Loading data...</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">Portfolio Overview</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Object.values(analyses).filter(a => a.analysis?.recommendation === 'BUY').length}
            </div>
            <div className="text-sm text-gray-600">Buy Signals</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {Object.values(analyses).filter(a => a.analysis?.recommendation === 'SELL').length}
            </div>
            <div className="text-sm text-gray-600">Sell Signals</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {Object.values(analyses).filter(a => a.profitPotential >= 7).length}
            </div>
            <div className="text-sm text-gray-600">High Profit Potential</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {Object.values(analyses).filter(a => a.riskLevel === 'LOW').length}
            </div>
            <div className="text-sm text-gray-600">Low Risk</div>
          </div>
        </div>
      </div>
    </div>
  );
}