'use client';

import { useState, useEffect } from 'react';
import { Analysis, MarketData } from '@/types';
import { marketApi } from '@/lib/api';
import { safeArray } from '@/lib/formatters';
import {
  X, TrendingUp, TrendingDown, Target, Shield, Brain,
  DollarSign, Percent, Calculator, BarChart3, Activity,
  ArrowUp, ArrowDown, Minus, Clock, Star, AlertTriangle,
  Zap, Flame, Timer, Sparkles
} from 'lucide-react';

interface TokenDetailModalProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  initialAnalysis?: Analysis;
  initialMarketData?: MarketData;
}

interface ProfitScenario {
  name: string;
  probability: number;
  targetPrice: number;
  profitPercent: number;
  timeframe: string;
  color: string;
  icon: React.ReactNode;
}

export default function TokenDetailModal({
  symbol,
  isOpen,
  onClose,
  initialAnalysis,
  initialMarketData
}: TokenDetailModalProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(initialAnalysis || null);
  const [marketData, setMarketData] = useState<MarketData | null>(initialMarketData || null);
  const [loading, setLoading] = useState(false);
  const [positionSize, setPositionSize] = useState<number>(100);

  useEffect(() => {
    if (isOpen && symbol && (!analysis || !marketData)) {
      loadDetailedData();
    }
  }, [isOpen, symbol]);

  const loadDetailedData = async () => {
    setLoading(true);
    try {
      const [deepAnalysisResponse, marketResponse] = await Promise.all([
        marketApi.getDeepAnalysis(symbol),
        marketApi.getMarketData(symbol)
      ]);

      if (deepAnalysisResponse?.success && deepAnalysisResponse.data) {
        setAnalysis(deepAnalysisResponse.data);
      }

      if (marketResponse?.success && marketResponse.data) {
        setMarketData(marketResponse.data);
      }
    } catch (error) {
      console.error('Error loading detailed data:', error);
      // Fallback to basic analysis if deep analysis fails
      try {
        const fallbackResponse = await marketApi.getAnalysis(symbol, 1);
        if (fallbackResponse?.success && safeArray.hasItems(fallbackResponse.data)) {
          setAnalysis(fallbackResponse.data[0]);
        }
      } catch (fallbackError) {
        console.error('Error loading fallback analysis:', fallbackError);
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateProfitScenarios = (): ProfitScenario[] => {
    if (!analysis || !marketData) return [];

    const currentPrice = typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price));
    const confidence = analysis.confidence * 100;

    const scenarios: ProfitScenario[] = [
      {
        name: 'Conservative',
        probability: Math.min(confidence + 20, 90),
        targetPrice: currentPrice * (analysis.recommendation === 'BUY' ? 1.005 : 0.995),
        profitPercent: analysis.recommendation === 'BUY' ? 0.5 : -0.5,
        timeframe: '15-30 min',
        color: 'bg-blue-500',
        icon: <Shield className="h-4 w-4" />
      },
      {
        name: 'Moderate',
        probability: Math.max(confidence - 10, 40),
        targetPrice: currentPrice * (analysis.recommendation === 'BUY' ? 1.015 : 0.985),
        profitPercent: analysis.recommendation === 'BUY' ? 1.5 : -1.5,
        timeframe: '30-60 min',
        color: 'bg-yellow-500',
        icon: <Zap className="h-4 w-4" />
      },
      {
        name: 'Aggressive',
        probability: Math.max(confidence - 30, 20),
        targetPrice: analysis.targetPrice || (currentPrice * (analysis.recommendation === 'BUY' ? 1.03 : 0.97)),
        profitPercent: analysis.recommendation === 'BUY' ? 3.0 : -3.0,
        timeframe: '1-4 hours',
        color: 'bg-red-500',
        icon: <Flame className="h-4 w-4" />
      }
    ];

    return scenarios;
  };

  const getRecommendationGradient = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY':
        return 'bg-gradient-to-r from-green-500 to-emerald-600';
      case 'SELL':
        return 'bg-gradient-to-r from-red-500 to-red-600';
      case 'HOLD':
        return 'bg-gradient-to-r from-orange-500 to-yellow-600';
      default:
        return 'bg-gradient-to-r from-gray-500 to-gray-600';
    }
  };

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY':
        return <ArrowUp className="h-6 w-6" />;
      case 'SELL':
        return <ArrowDown className="h-6 w-6" />;
      case 'HOLD':
        return <Minus className="h-6 w-6" />;
      default:
        return <Brain className="h-6 w-6" />;
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1) return `$${price.toFixed(4)}`;
    if (price >= 0.01) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(8)}`;
  };

  const calculatePositionValue = (scenario: ProfitScenario) => {
    return (positionSize * scenario.profitPercent) / 100;
  };

  if (!isOpen) return null;

  const scenarios = calculateProfitScenarios();
  const currentPrice = marketData ? (typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price))) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal */}
      <div className="absolute inset-4 md:inset-8 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-6 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="flex items-center space-x-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <Activity className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">{symbol}</h2>
              <p className="text-white/80 text-lg">Detailed Analysis & Trading Strategy</p>
            </div>
          </div>

          {marketData && (
            <div className="mt-4 flex items-center space-x-6">
              <div>
                <div className="text-white/70 text-sm">Current Price</div>
                <div className="text-2xl font-bold">{formatPrice(currentPrice)}</div>
              </div>
              <div>
                <div className="text-white/70 text-sm">24h Change</div>
                <div className={`text-xl font-bold ${marketData.change24h >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  {marketData.change24h >= 0 ? '+' : ''}{marketData.change24h.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-white/70 text-sm">Volume 24h</div>
                <div className="text-xl font-bold">${(marketData.volume / 1000000).toFixed(2)}M</div>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : analysis ? (
            <div className="space-y-8">
              {/* AI Recommendation */}
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-gray-900">AI Recommendation</h3>
                  <div className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-white ${getRecommendationGradient(analysis.recommendation)}`}>
                    {getRecommendationIcon(analysis.recommendation)}
                    <span className="font-bold text-lg">{analysis.recommendation}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-xl p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Brain className="h-5 w-5 text-purple-600" />
                      <span className="font-semibold text-gray-700">AI Confidence</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                      {(analysis.confidence * 100).toFixed(1)}%
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-purple-600 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${analysis.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {analysis.targetPrice && (
                    <div className="bg-white rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Target className="h-5 w-5 text-green-600" />
                        <span className="font-semibold text-gray-700">Target Price</span>
                      </div>
                      <div className="text-2xl font-bold text-green-600">
                        {formatPrice(analysis.targetPrice)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {((analysis.targetPrice - currentPrice) / currentPrice * 100).toFixed(2)}% potential
                      </div>
                    </div>
                  )}

                  {analysis.stopLoss && (
                    <div className="bg-white rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Shield className="h-5 w-5 text-red-600" />
                        <span className="font-semibold text-gray-700">Stop Loss</span>
                      </div>
                      <div className="text-2xl font-bold text-red-600">
                        {formatPrice(analysis.stopLoss)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {((currentPrice - analysis.stopLoss) / currentPrice * 100).toFixed(2)}% max loss
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 bg-white rounded-xl p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center space-x-2">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    <span>AI Analysis Summary</span>
                  </h4>
                  <p className="text-gray-700 leading-relaxed">{analysis.reasoning}</p>
                </div>
              </div>

              {/* Profit Scenarios */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
                  <Calculator className="h-6 w-6 text-purple-600" />
                  <span>Profit Scenarios</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {safeArray.map(scenarios, (scenario, index) => (
                    <div key={index} className="bg-white rounded-xl p-6 border-2 border-transparent hover:border-purple-200 transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <div className={`p-2 rounded-lg ${scenario.color}`}>
                            <div className="text-white">
                              {scenario.icon}
                            </div>
                          </div>
                          <span className="font-bold text-gray-900">{scenario.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">Probability</div>
                          <div className="font-bold text-gray-900">{scenario.probability}%</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Target Price:</span>
                          <span className="font-semibold">{formatPrice(scenario.targetPrice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Expected Gain:</span>
                          <span className={`font-bold ${scenario.profitPercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {scenario.profitPercent > 0 ? '+' : ''}{scenario.profitPercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Timeframe:</span>
                          <span className="font-semibold">{scenario.timeframe}</span>
                        </div>
                        <div className="flex justify-between text-lg">
                          <span className="text-gray-600">Profit ($):</span>
                          <span className={`font-bold ${scenario.profitPercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {calculatePositionValue(scenario) > 0 ? '+' : ''}${calculatePositionValue(scenario).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Position Calculator */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
                  <DollarSign className="h-6 w-6 text-green-600" />
                  <span>Position Calculator</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl p-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Position Size (USDT)
                    </label>
                    <input
                      type="number"
                      value={positionSize}
                      onChange={(e) => setPositionSize(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                      min="1"
                      max="10000"
                    />
                    <div className="mt-4 space-y-2 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <span>Token Quantity:</span>
                        <span className="font-semibold">{(positionSize / currentPrice).toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Current Value:</span>
                        <span className="font-semibold">${positionSize.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Risk Assessment</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Max Loss (2%):</span>
                        <span className="font-bold text-red-600">-${(positionSize * 0.02).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Conservative Gain:</span>
                        <span className="font-bold text-green-600">+${(positionSize * 0.005).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Aggressive Gain:</span>
                        <span className="font-bold text-green-600">+${(positionSize * 0.03).toFixed(2)}</span>
                      </div>
                      <div className="pt-3 border-t border-gray-200">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Risk/Reward Ratio:</span>
                          <span className="font-bold text-blue-600">1.5:1</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enhanced Deep Analysis Metrics */}
              {(analysis as any).analysisType === 'DEEP_ANALYSIS' && (analysis as any).technicalIndicators && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
                    <BarChart3 className="h-6 w-6 text-purple-600" />
                    <span>Deep Technical Analysis</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Profit Score */}
                    <div className="bg-white rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Star className="h-5 w-5 text-yellow-600" />
                        <span className="font-semibold text-gray-700">Profit Score</span>
                      </div>
                      <div className="text-3xl font-bold text-yellow-600">
                        {(analysis as any).profitScore || 'N/A'}/10
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {(analysis as any).riskLevel || 'MEDIUM'} Risk
                      </div>
                    </div>

                    {/* Multi-timeframe RSI */}
                    <div className="bg-white rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Activity className="h-5 w-5 text-blue-600" />
                        <span className="font-semibold text-gray-700">RSI Signals</span>
                      </div>
                      {safeArray.map(Object.entries((analysis as any).technicalIndicators || {}), ([timeframe, indicators]: [string, any]) => (
                        <div key={timeframe} className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{timeframe.toUpperCase()}:</span>
                          <span className={`font-bold ${
                            indicators.rsi > 70 ? 'text-red-600' :
                            indicators.rsi < 30 ? 'text-green-600' : 'text-gray-600'
                          }`}>
                            {indicators.rsi.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Volume Analysis */}
                    <div className="bg-white rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <BarChart3 className="h-5 w-5 text-green-600" />
                        <span className="font-semibold text-gray-700">Volume Ratios</span>
                      </div>
                      {safeArray.map(Object.entries((analysis as any).technicalIndicators || {}), ([timeframe, indicators]: [string, any]) => (
                        <div key={timeframe} className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{timeframe.toUpperCase()}:</span>
                          <span className={`font-bold ${
                            indicators.volumeRatio > 1.5 ? 'text-green-600' :
                            indicators.volumeRatio < 0.8 ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {indicators.volumeRatio.toFixed(2)}x
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Trend Alignment */}
                    <div className="bg-white rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <TrendingUp className="h-5 w-5 text-purple-600" />
                        <span className="font-semibold text-gray-700">Trend Signals</span>
                      </div>
                      {safeArray.map(Object.entries((analysis as any).technicalIndicators || {}), ([timeframe, indicators]: [string, any]) => (
                        <div key={timeframe} className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{timeframe.toUpperCase()}:</span>
                          <span className={`font-bold ${
                            indicators.trend === 'UPTREND' ? 'text-green-600' :
                            indicators.trend === 'DOWNTREND' ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {indicators.trend === 'UPTREND' ? '↗️' :
                             indicators.trend === 'DOWNTREND' ? '↘️' : '→'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Risk Metrics */}
                  {(analysis as any).riskMetrics && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-xl p-4">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                          <AlertTriangle className="h-5 w-5 text-orange-600" />
                          <span>Risk Assessment</span>
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Value at Risk (5%):</span>
                            <span className="font-bold text-red-600">{((analysis as any).riskMetrics.var5 || 0).toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Max Drawdown:</span>
                            <span className="font-bold text-red-600">{((analysis as any).riskMetrics.maxDrawdown || 0).toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Sharpe Ratio:</span>
                            <span className="font-bold text-blue-600">{((analysis as any).riskMetrics.sharpeRatio || 0).toFixed(3)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl p-4">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                          <Percent className="h-5 w-5 text-blue-600" />
                          <span>Position Sizing</span>
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Conservative:</span>
                            <span className="font-bold text-green-600">{(((analysis as any).riskMetrics.positionSizing?.conservative || 0) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Moderate:</span>
                            <span className="font-bold text-yellow-600">{(((analysis as any).riskMetrics.positionSizing?.moderate || 0) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Recommended:</span>
                            <span className="font-bold text-blue-600">{(((analysis as any).riskMetrics.positionSizing?.recommended || 0) * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl p-4">
                        <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                          <Shield className="h-5 w-5 text-red-600" />
                          <span>Dynamic Stop Loss</span>
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Conservative:</span>
                            <span className="font-bold text-green-600">{formatPrice((analysis as any).riskMetrics.dynamicStopLoss?.conservative || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Moderate:</span>
                            <span className="font-bold text-yellow-600">{formatPrice((analysis as any).riskMetrics.dynamicStopLoss?.moderate || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">ATR-Based:</span>
                            <span className="font-bold text-red-600">{formatPrice((analysis as any).riskMetrics.dynamicStopLoss?.atrBased || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Enhanced Trading Strategy */}
                  {(analysis as any).entryStrategy && (
                    <div className="mt-6 bg-white rounded-xl p-6">
                      <h4 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                        <Sparkles className="h-5 w-5 text-purple-600" />
                        <span>Enhanced Trading Strategy</span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h5 className="font-medium text-gray-700 mb-2">Entry Strategy:</h5>
                          <p className="text-sm text-gray-600 mb-4">{(analysis as any).entryStrategy}</p>

                          <h5 className="font-medium text-gray-700 mb-2">Optimal Timeframe:</h5>
                          <p className="text-sm text-gray-600">{(analysis as any).timeframe}</p>
                        </div>
                        <div>
                          <h5 className="font-medium text-gray-700 mb-2">Exit Strategy:</h5>
                          <p className="text-sm text-gray-600 mb-4">{(analysis as any).exitStrategy}</p>

                          <h5 className="font-medium text-gray-700 mb-2">Key Catalysts:</h5>
                          <div className="flex flex-wrap gap-2">
                            {safeArray.map((analysis as any).keyCatalysts || [], (catalyst: string, index: number) => (
                              <span key={index} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-lg">
                                {catalyst}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Individual AI Models */}
              {analysis.individualAnalyses && safeArray.hasItems(analysis.individualAnalyses) && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-2">
                    <Brain className="h-6 w-6 text-blue-600" />
                    <span>Individual AI Model Analysis</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {safeArray.map(analysis.individualAnalyses, (llmAnalysis, index) => (
                      <div key={index} className="bg-white rounded-xl p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Brain className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-gray-900">{llmAnalysis.model}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                              llmAnalysis.recommendation === 'BUY' ? 'bg-green-100 text-green-700' :
                              llmAnalysis.recommendation === 'SELL' ? 'bg-red-100 text-red-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {llmAnalysis.recommendation}
                            </span>
                            <span className="text-sm font-bold text-gray-600">
                              {(llmAnalysis.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 mb-3 line-clamp-3">{llmAnalysis.reasoning}</p>
                        {(llmAnalysis.targetPrice || llmAnalysis.stopLoss) && (
                          <div className="flex space-x-4 text-xs text-gray-600">
                            {llmAnalysis.targetPrice && (
                              <div className="flex items-center space-x-1">
                                <Target className="h-3 w-3 text-green-600" />
                                <span>Target: {formatPrice(llmAnalysis.targetPrice)}</span>
                              </div>
                            )}
                            {llmAnalysis.stopLoss && (
                              <div className="flex items-center space-x-1">
                                <Shield className="h-3 w-3 text-red-600" />
                                <span>Stop: {formatPrice(llmAnalysis.stopLoss)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <AlertTriangle className="h-12 w-12 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Analysis Available</h3>
              <p>Analysis data is not available for {symbol} at this time.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}