'use client';

import { useEffect, useState, useCallback } from 'react';
import { marketApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { Analysis, LLMAnalysis, MarketData } from '@/types';
import { toast } from 'react-hot-toast';
import {
  Brain, TrendingUp, TrendingDown, Target, Shield, Clock,
  Zap, DollarSign, Activity, AlertTriangle, Star,
  ArrowUp, ArrowDown, Minus, Timer, BarChart3,
  Sparkles, Flame, Percent, Calculator
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function RecommendationsPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [prioritySymbols, setPrioritySymbols] = useState<string[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      wsClient.connect(token);
      loadSymbolsAndInitialData();
    }

    // Set up WebSocket listeners for real-time updates
    wsClient.on('analysis-update', handleAnalysisUpdate);
    wsClient.on('market-update', handleMarketUpdate);

    return () => {
      wsClient.off('analysis-update', handleAnalysisUpdate);
      wsClient.off('market-update', handleMarketUpdate);
    };
  }, []);

  // Auto-update every 30 seconds
  useEffect(() => {
    if (!autoUpdateEnabled) return;

    const interval = setInterval(() => {
      if (prioritySymbols.length > 0) {
        loadAnalysesForSymbols(prioritySymbols.slice(0, 12)); // Load top 12 symbols
        setLastUpdate(new Date());
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [prioritySymbols, autoUpdateEnabled]);

  const loadSymbolsAndInitialData = async () => {
    try {
      const response = await marketApi.getSymbols();
      if (response?.success && response.data) {
        const allSymbols = response.data.all || [];
        const priority = response.data.priority || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'TRXUSDT', 'ADAUSDT'];

        setSymbols(allSymbols);
        setPrioritySymbols(priority);

        // Load initial data for priority symbols
        await loadAnalysesForSymbols(priority.slice(0, 12));
        await loadMarketDataForSymbols(priority.slice(0, 12));
      } else {
        // Enhanced fallback with more tokens
        const fallbackSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'TRXUSDT', 'ADAUSDT', 'MATICUSDT', 'LINKUSDT'];
        setSymbols(fallbackSymbols);
        setPrioritySymbols(fallbackSymbols);
        await loadAnalysesForSymbols(fallbackSymbols);
        await loadMarketDataForSymbols(fallbackSymbols);
      }
    } catch (error) {
      console.error('Error loading symbols:', error);
      const fallbackSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'TRXUSDT', 'ADAUSDT'];
      setSymbols(fallbackSymbols);
      setPrioritySymbols(fallbackSymbols);
      toast.error('Failed to load symbols, using defaults');
    } finally {
      setLoading(false);
    }
  };

  const loadAnalysesForSymbols = async (symbolList: string[]) => {
    try {
      const promises = symbolList.map(async (symbol) => {
        try {
          const response = await marketApi.getAnalysis(symbol, 1);
          if (response?.success && response.data && response.data.length > 0) {
            return { symbol, analysis: response.data[0] };
          }
        } catch (error) {
          console.error(`Error loading analysis for ${symbol}:`, error);
        }
        return null;
      });

      const results = await Promise.all(promises);
      const newAnalyses: Record<string, Analysis> = {};

      results.forEach(result => {
        if (result) {
          newAnalyses[result.symbol] = result.analysis;
        }
      });

      setAnalyses(prev => ({ ...prev, ...newAnalyses }));
    } catch (error) {
      console.error('Error loading analyses:', error);
    }
  };

  const loadMarketDataForSymbols = async (symbolList: string[]) => {
    try {
      const promises = symbolList.map(async (symbol) => {
        try {
          const response = await marketApi.getMarketData(symbol);
          if (response?.success && response.data) {
            return { symbol, data: response.data };
          }
        } catch (error) {
          console.error(`Error loading market data for ${symbol}:`, error);
        }
        return null;
      });

      const results = await Promise.all(promises);
      const newMarketData: Record<string, MarketData> = {};

      results.forEach(result => {
        if (result) {
          newMarketData[result.symbol] = result.data;
        }
      });

      setMarketData(prev => ({ ...prev, ...newMarketData }));
    } catch (error) {
      console.error('Error loading market data:', error);
    }
  };

  const triggerAnalysisForSymbol = async (symbol: string) => {
    try {
      const response = await marketApi.triggerAnalysis(symbol);
      if (response.success) {
        toast.success(`New analysis generated for ${symbol}`);
        // Update the analysis for this symbol
        await loadAnalysesForSymbols([symbol]);
      } else {
        toast.error(response.error || `Failed to analyze ${symbol}`);
      }
    } catch (error) {
      toast.error(`Failed to analyze ${symbol}`);
    }
  };

  const handleAnalysisUpdate = useCallback((data: any) => {
    try {
      if (data?.symbol && data?.analysis) {
        setAnalyses(prev => ({ ...prev, [data.symbol]: data.analysis }));
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error handling analysis update:', error);
    }
  }, []);

  const handleMarketUpdate = useCallback((data: any) => {
    try {
      if (data?.symbol && data?.data) {
        setMarketData(prev => ({ ...prev, [data.symbol]: data.data }));
      }
    } catch (error) {
      console.error('Error handling market update:', error);
    }
  }, []);

  // Profit calculation functions
  const calculateProfitPotential = (analysis: Analysis, marketData: MarketData) => {
    if (!analysis.targetPrice || !marketData.price) return null;

    const currentPrice = typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price));
    const targetPrice = analysis.targetPrice;
    const stopLoss = analysis.stopLoss;

    const profitPct = ((targetPrice - currentPrice) / currentPrice) * 100;
    const riskPct = stopLoss ? ((currentPrice - stopLoss) / currentPrice) * 100 : 2;
    const riskReward = riskPct > 0 ? profitPct / riskPct : 0;

    return {
      profitPct: Math.abs(profitPct),
      riskPct,
      riskReward,
      potential: profitPct > 3 ? 'high' : profitPct > 1 ? 'medium' : 'low'
    };
  };

  const getRecommendationGradient = (recommendation: string, confidence: number) => {
    const intensity = Math.max(0.5, confidence);

    switch (recommendation) {
      case 'BUY':
        return `bg-gradient-to-br from-green-400 via-emerald-500 to-green-600 shadow-green-500/25`;
      case 'SELL':
        return `bg-gradient-to-br from-red-400 via-red-500 to-red-600 shadow-red-500/25`;
      case 'HOLD':
        return `bg-gradient-to-br from-orange-400 via-yellow-500 to-orange-600 shadow-orange-500/25`;
      default:
        return `bg-gradient-to-br from-gray-400 via-gray-500 to-gray-600 shadow-gray-500/25`;
    }
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY':
        return 'text-green-600 bg-green-100';
      case 'SELL':
        return 'text-red-600 bg-red-100';
      case 'HOLD':
        return 'text-orange-600 bg-orange-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getRecommendationIcon = (recommendation: string, size = 'h-4 w-4') => {
    switch (recommendation) {
      case 'BUY':
        return <ArrowUp className={size} />;
      case 'SELL':
        return <ArrowDown className={size} />;
      case 'HOLD':
        return <Minus className={size} />;
      default:
        return <Brain className={size} />;
    }
  };

  const getProfitIcon = (potential: string) => {
    switch (potential) {
      case 'high':
        return <Flame className="h-5 w-5 text-orange-500" />;
      case 'medium':
        return <Zap className="h-5 w-5 text-yellow-500" />;
      case 'low':
        return <Activity className="h-5 w-5 text-blue-500" />;
      default:
        return <BarChart3 className="h-5 w-5 text-gray-500" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    const pct = confidence * 100;
    if (pct >= 80) return 'text-emerald-600';
    if (pct >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getConfidenceGradient = (confidence: number) => {
    const pct = confidence * 100;
    if (pct >= 80) return 'from-emerald-400 to-green-600';
    if (pct >= 60) return 'from-orange-400 to-yellow-600';
    return 'from-red-400 to-red-600';
  };

  const formatPrice = (price: number) => {
    if (price >= 1) return `$${price.toFixed(4)}`;
    if (price >= 0.01) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(8)}`;
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  // Get top recommendations sorted by profit potential and confidence
  const getTopRecommendations = () => {
    const recommendations = prioritySymbols
      .map(symbol => {
        const analysis = analyses[symbol];
        const market = marketData[symbol];
        if (!analysis || !market) return null;

        const profit = calculateProfitPotential(analysis, market);
        const score = (analysis.confidence * 100) + (profit?.profitPct || 0);

        return {
          symbol,
          analysis,
          market,
          profit,
          score
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.score || 0) - (a?.score || 0))
      .slice(0, 12);

    return recommendations;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
            <Sparkles className="h-6 w-6 text-blue-600 absolute top-5 left-5 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Loading AI Recommendations</h3>
          <p className="text-gray-600">Analyzing market data and generating insights...</p>
        </div>
      </div>
    );
  }

  const topRecommendations = getTopRecommendations();

  return (
    <ErrorBoundary>
      <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Hero Header */}
        <div className="mb-8 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-3xl"></div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-2xl shadow-lg">
                  <Brain className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">AI Trading Signals</h1>
                  <p className="text-gray-600 text-lg">Real-time market analysis with profit potential insights</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                  <Clock className="h-4 w-4" />
                  <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
                  <div className={`w-2 h-2 rounded-full ${autoUpdateEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                </div>
                <button
                  onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    autoUpdateEnabled
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Auto-Update {autoUpdateEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-r from-green-400 to-emerald-500 p-3 rounded-xl">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-green-600">
                {topRecommendations.filter(r => r?.analysis.recommendation === 'BUY').length}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900">BUY Signals</h3>
            <p className="text-sm text-gray-600">Active buy opportunities</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-r from-red-400 to-red-500 p-3 rounded-xl">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-red-600">
                {topRecommendations.filter(r => r?.analysis.recommendation === 'SELL').length}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900">SELL Signals</h3>
            <p className="text-sm text-gray-600">Active sell opportunities</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-r from-orange-400 to-yellow-500 p-3 rounded-xl">
                <Timer className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-orange-600">
                {topRecommendations.filter(r => r?.analysis.recommendation === 'HOLD').length}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900">HOLD Signals</h3>
            <p className="text-sm text-gray-600">Wait for better entry</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/20 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-gradient-to-r from-purple-400 to-purple-500 p-3 rounded-xl">
                <Calculator className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-purple-600">
                {topRecommendations.filter(r => r?.profit?.potential === 'high').length}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900">High Profit</h3>
            <p className="text-sm text-gray-600">Potential &gt;3% gains</p>
          </div>
        </div>

        {/* AI Recommendations Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {topRecommendations.map((item) => {
            if (!item) return null;
            const { symbol, analysis, market, profit } = item;
            const confidencePct = analysis.confidence * 100;

            return (
              <div
                key={symbol}
                className="relative group"
              >
                {/* Background Glow Effect */}
                <div className={`absolute -inset-1 ${getRecommendationGradient(analysis.recommendation, analysis.confidence)} rounded-3xl blur opacity-25 group-hover:opacity-40 transition duration-300`}></div>

                {/* Main Card */}
                <div className="relative bg-white/90 backdrop-blur-xl rounded-3xl p-6 border border-white/30 shadow-xl hover:shadow-2xl transition-all duration-300 hover:transform hover:scale-105">

                  {/* Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center space-x-3">
                      <div className={`${getRecommendationGradient(analysis.recommendation, analysis.confidence)} p-3 rounded-2xl shadow-lg`}>
                        {getRecommendationIcon(analysis.recommendation, 'h-6 w-6 text-white')}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">{symbol}</h3>
                        <div className="flex items-center space-x-2">
                          <span className={`text-lg font-bold ${market.change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPrice(market.price)}
                          </span>
                          <span className={`text-sm px-2 py-1 rounded-lg font-medium ${
                            market.change24h >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {formatChange(market.change24h)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => triggerAnalysisForSymbol(symbol)}
                      className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                      title="Refresh analysis"
                    >
                      <Brain className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>

                  {/* Recommendation Badge */}
                  <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-2xl text-white font-bold text-lg mb-4 ${getRecommendationGradient(analysis.recommendation, analysis.confidence)} shadow-lg`}>
                    {getRecommendationIcon(analysis.recommendation, 'h-5 w-5')}
                    <span>{analysis.recommendation}</span>
                    <div className="bg-white/20 px-2 py-1 rounded-lg text-sm">
                      {confidencePct.toFixed(0)}%
                    </div>
                  </div>

                  {/* Profit Potential */}
                  {profit && (
                    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          {getProfitIcon(profit.potential)}
                          <span className="font-semibold text-gray-900">Profit Potential</span>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                          profit.potential === 'high' ? 'bg-green-100 text-green-700' :
                          profit.potential === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {profit.potential.toUpperCase()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-gray-600">Expected Gain</div>
                          <div className="text-lg font-bold text-green-600">+{profit.profitPct.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="text-gray-600">Risk/Reward</div>
                          <div className="text-lg font-bold text-blue-600">{profit.riskReward.toFixed(1)}:1</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Price Targets */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {analysis.targetPrice && (
                      <div className="bg-green-50 rounded-xl p-3">
                        <div className="flex items-center space-x-2 mb-1">
                          <Target className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-700">Target</span>
                        </div>
                        <div className="text-lg font-bold text-green-800">
                          {formatPrice(analysis.targetPrice)}
                        </div>
                      </div>
                    )}
                    {analysis.stopLoss && (
                      <div className="bg-red-50 rounded-xl p-3">
                        <div className="flex items-center space-x-2 mb-1">
                          <Shield className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-medium text-red-700">Stop Loss</span>
                        </div>
                        <div className="text-lg font-bold text-red-800">
                          {formatPrice(analysis.stopLoss)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Confidence Meter */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">AI Confidence</span>
                      <span className={`text-sm font-bold ${getConfidenceColor(analysis.confidence)}`}>
                        {confidencePct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full bg-gradient-to-r ${getConfidenceGradient(analysis.confidence)} transition-all duration-500`}
                        style={{ width: `${confidencePct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Analysis Summary */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center space-x-2">
                      <Sparkles className="h-4 w-4 text-purple-600" />
                      <span>AI Analysis</span>
                    </h4>
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {analysis.reasoning}
                    </p>

                    {/* Model Count Indicator */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Brain className="h-3 w-3" />
                        <span>{analysis.individualAnalyses?.length || 0} AI Models</span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-gray-600">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(analysis.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {topRecommendations.length === 0 && (
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-teal-500/10 rounded-3xl blur-3xl"></div>
            <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl p-12 text-center border border-white/20 shadow-xl">
              <div className="mb-6">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 rounded-2xl inline-block mb-4 shadow-lg">
                  <Brain className="h-12 w-12 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Loading AI Recommendations</h3>
                <p className="text-gray-600 text-lg">Our AI is analyzing {prioritySymbols.length} trading pairs to find the best opportunities</p>
              </div>

              <div className="flex justify-center space-x-2 mb-6">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  ></div>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-md mx-auto">
                {prioritySymbols.slice(0, 8).map((symbol, i) => (
                  <div key={symbol} className="bg-gray-100 rounded-lg p-3 text-sm font-medium text-gray-700">
                    {symbol}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Additional Info Section */}
        <div className="mt-12 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 rounded-3xl p-8 border border-white/30">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">How Our AI Trading Signals Work</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Our advanced AI analyzes multiple data points including technical indicators, market sentiment, and trading volume to generate high-confidence trading recommendations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-gradient-to-r from-green-400 to-emerald-500 p-4 rounded-2xl inline-block mb-4 shadow-lg">
                <BarChart3 className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Technical Analysis</h3>
              <p className="text-gray-600 text-sm">Advanced pattern recognition and trend analysis across multiple timeframes</p>
            </div>

            <div className="text-center">
              <div className="bg-gradient-to-r from-purple-400 to-purple-600 p-4 rounded-2xl inline-block mb-4 shadow-lg">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">AI Consensus</h3>
              <p className="text-gray-600 text-sm">Multiple AI models collaborate to provide balanced and accurate predictions</p>
            </div>

            <div className="text-center">
              <div className="bg-gradient-to-r from-orange-400 to-red-500 p-4 rounded-2xl inline-block mb-4 shadow-lg">
                <Calculator className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Risk Management</h3>
              <p className="text-gray-600 text-sm">Built-in profit targets and stop-loss recommendations for optimal risk/reward</p>
            </div>
          </div>
        </div>
      </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}