'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Clock,
  Shield,
  Target,
  AlertTriangle,
  Zap,
  Eye,
  CheckCircle,
  XCircle,
  Activity
} from 'lucide-react';

interface LLMModel {
  model: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  urgency: number;
  timeToAction: string;
  targetPrice?: number;
  stopLoss?: number;
}

interface RealTimeAnalysis {
  symbol: string;
  consensus: {
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    urgency: number;
    modelAgreement: number;
    timeToAction: string;
    reasoning: string;
  };
  individualModels: LLMModel[];
  marketConditions: {
    volatility: number;
    spread: number;
    liquidity: number;
    volume24h: number;
    priceAction: string;
    tradingCondition: string;
  };
  immediateSignals: any[];
  riskWarnings: string[];
  timestamp: string;
}

interface TradingSignal {
  type: string;
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  timeWindow: string;
  reasoning: string;
  level?: string;
  warnings?: string[];
  action?: string;
}

interface LLMAnalysisPanelProps {
  symbol: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const MODEL_COLORS: Record<string, string> = {
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': 'bg-blue-100 text-blue-700 border-blue-200',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': 'bg-green-100 text-green-700 border-green-200',
  'mistralai/Mixtral-8x7B-Instruct-v0.1': 'bg-purple-100 text-purple-700 border-purple-200',
  'Qwen/Qwen2.5-7B-Instruct-Turbo': 'bg-orange-100 text-orange-700 border-orange-200'
};

const MODEL_NAMES: Record<string, string> = {
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': 'Llama 3.1 8B',
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': 'Llama 3.1 70B',
  'mistralai/Mixtral-8x7B-Instruct-v0.1': 'Mixtral 8x7B',
  'Qwen/Qwen2.5-7B-Instruct-Turbo': 'Qwen 2.5 7B'
};

export default function LLMAnalysisPanel({
  symbol,
  autoRefresh = true,
  refreshInterval = 60000,
  className = ''
}: LLMAnalysisPanelProps) {
  const [realTimeAnalysis, setRealTimeAnalysis] = useState<RealTimeAnalysis | null>(null);
  const [tradingSignals, setTradingSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);

  const loadRealTimeAnalysis = async () => {
    if (!symbol) return;

    setLoading(true);
    try {
      // Load both real-time analysis and trading signals
      const [analysisResponse, signalsResponse] = await Promise.all([
        marketApi.getRealTimeAnalysis(symbol),
        marketApi.getImmediateTradingSignals(symbol)
      ]);

      if (analysisResponse.success) {
        setRealTimeAnalysis(analysisResponse.data);
        setLastUpdate(new Date());
      }

      if (signalsResponse.success) {
        setTradingSignals(signalsResponse.data.signals || []);
      }
    } catch (error) {
      console.error('Error loading real-time analysis:', error);
      toast.error('Failed to load AI analysis');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRealTimeAnalysis();
  }, [symbol]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadRealTimeAnalysis, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, symbol]);

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'SELL': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY': return 'text-green-600 bg-green-50 border-green-200';
      case 'SELL': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getUrgencyColor = (urgency: number) => {
    if (urgency >= 7) return 'text-red-600 bg-red-50 border-red-200';
    if (urgency >= 5) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (urgency >= 3) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const getSignalIcon = (type: string) => {
    switch (type) {
      case 'IMMEDIATE_BUY': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'IMMEDIATE_SELL': return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'RISK_WARNING': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-blue-600" />;
    }
  };

  const formatModelName = (fullName: string): string => {
    return MODEL_NAMES[fullName] || fullName.split('/').pop() || fullName;
  };

  const getModelColor = (fullName: string): string => {
    return MODEL_COLORS[fullName] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (!realTimeAnalysis && !loading) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <Brain className="h-8 w-8 mx-auto mb-2" />
          <p>No AI analysis available</p>
          <button
            onClick={loadRealTimeAnalysis}
            className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
          >
            Load Analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">AI Analysis - {symbol}</h2>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdate && (
              <div className="text-sm text-gray-500">
                Updated: {lastUpdate.toLocaleTimeString()}
              </div>
            )}
            <button
              onClick={loadRealTimeAnalysis}
              disabled={loading}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Zap className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading && !realTimeAnalysis ? (
        <div className="p-6 text-center">
          <Activity className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading AI analysis...</p>
        </div>
      ) : realTimeAnalysis && realTimeAnalysis.consensus ? (
        <div className="p-6 space-y-6">
          {/* Consensus Analysis */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border ${getRecommendationColor(realTimeAnalysis.consensus.recommendation)}`}>
                  {getRecommendationIcon(realTimeAnalysis.consensus.recommendation)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Consensus: {realTimeAnalysis.consensus.recommendation}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {safeNumber.toFixed((realTimeAnalysis.consensus?.confidence ?? 0) * 100, 1)}% confidence
                  </p>
                </div>
              </div>

              <div className="text-right">
                <div className={`px-3 py-1 rounded-lg border text-sm font-medium ${getUrgencyColor(realTimeAnalysis.consensus.urgency)}`}>
                  Urgency: {realTimeAnalysis.consensus.urgency}/10
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {realTimeAnalysis.consensus.timeToAction}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-purple-100">
              <p className="text-sm text-gray-700">{realTimeAnalysis.consensus.reasoning}</p>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <div className="text-gray-600">
                Model Agreement: {safeNumber.toFixed((realTimeAnalysis.consensus?.modelAgreement ?? 0) * 100, 0)}%
              </div>
              <div className="text-gray-600">
                Market Condition: {realTimeAnalysis.marketConditions.tradingCondition}
              </div>
            </div>
          </div>

          {/* Trading Signals */}
          {tradingSignals && tradingSignals.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-600" />
                Immediate Trading Signals
              </h3>

              <div className="space-y-3">
                {(tradingSignals || []).map((signal, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getSignalIcon(signal.type)}
                        <span className="font-medium text-gray-900">
                          {signal.type.replace('_', ' ')}
                        </span>
                      </div>
                      {signal.confidence && (
                        <span className="text-sm text-gray-600">
                          {safeNumber.toFixed((signal.confidence ?? 0) * 100, 0)}% confidence
                        </span>
                      )}
                    </div>

                    {signal.reasoning && (
                      <p className="text-sm text-gray-700 mb-3">{signal.reasoning}</p>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {signal.targetPrice && (
                        <div>
                          <span className="text-gray-600">Target Price:</span>
                          <span className="ml-2 font-medium text-green-600">
                            {safeNumber.price(signal.targetPrice)}
                          </span>
                        </div>
                      )}
                      {signal.stopLoss && (
                        <div>
                          <span className="text-gray-600">Stop Loss:</span>
                          <span className="ml-2 font-medium text-red-600">
                            {safeNumber.price(signal.stopLoss)}
                          </span>
                        </div>
                      )}
                      {signal.timeWindow && (
                        <div>
                          <span className="text-gray-600">Time Window:</span>
                          <span className="ml-2 font-medium">{signal.timeWindow}</span>
                        </div>
                      )}
                      {signal.level && (
                        <div>
                          <span className="text-gray-600">Risk Level:</span>
                          <span className="ml-2 font-medium">{signal.level}</span>
                        </div>
                      )}
                    </div>

                    {signal.warnings && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-sm text-gray-600 mb-2">Warnings:</div>
                        <div className="space-y-1">
                          {(signal.warnings || []).map((warning: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-orange-700">
                              <AlertTriangle className="h-3 w-3" />
                              {warning}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Individual Model Analysis */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                Individual Models ({realTimeAnalysis.individualModels?.length ?? 0})
              </h3>
              <button
                onClick={() => setShowAllModels(!showAllModels)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Eye className="h-4 w-4" />
                {showAllModels ? 'Show Less' : 'Show All'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(showAllModels ? (realTimeAnalysis.individualModels || []) : (realTimeAnalysis.individualModels || []).slice(0, 2))
                .map((model, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`px-2 py-1 rounded text-xs font-medium border ${getModelColor(model.model)}`}>
                      {formatModelName(model.model)}
                    </div>
                    <div className="flex items-center gap-2">
                      {getRecommendationIcon(model.recommendation)}
                      <span className="font-medium">{model.recommendation}</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Confidence:</span>
                      <span className="font-medium">{(model.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Urgency:</span>
                      <span className={`font-medium ${getUrgencyColor(model.urgency).split(' ')[0]}`}>
                        {model.urgency}/10
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Time to Action:</span>
                      <span className="font-medium">{model.timeToAction}</span>
                    </div>
                  </div>

                  {model.reasoning && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-600 line-clamp-3">{model.reasoning}</p>
                    </div>
                  )}

                  {(model.targetPrice || model.stopLoss) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                      {model.targetPrice && (
                        <div>
                          <span className="text-gray-600">Target:</span>
                          <span className="ml-1 font-medium text-green-600">
                            ${model.targetPrice.toFixed(4)}
                          </span>
                        </div>
                      )}
                      {model.stopLoss && (
                        <div>
                          <span className="text-gray-600">Stop:</span>
                          <span className="ml-1 font-medium text-red-600">
                            ${model.stopLoss.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Market Conditions */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Market Conditions
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Volatility:</span>
                <span className="ml-2 font-medium">
                  {realTimeAnalysis.marketConditions.volatility.toFixed(2)}%
                </span>
              </div>
              <div>
                <span className="text-gray-600">Spread:</span>
                <span className="ml-2 font-medium">
                  {realTimeAnalysis.marketConditions.spread.toFixed(4)}%
                </span>
              </div>
              <div>
                <span className="text-gray-600">Liquidity:</span>
                <span className="ml-2 font-medium">
                  {realTimeAnalysis.marketConditions.liquidity}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Volume 24h:</span>
                <span className="ml-2 font-medium">
                  ${(realTimeAnalysis.marketConditions.volume24h / 1000000).toFixed(1)}M
                </span>
              </div>
              <div>
                <span className="text-gray-600">Price Action:</span>
                <span className={`ml-2 font-medium ${
                  realTimeAnalysis.marketConditions.priceAction === 'BULLISH' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {realTimeAnalysis.marketConditions.priceAction}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Condition:</span>
                <span className={`ml-2 font-medium ${
                  realTimeAnalysis.marketConditions.tradingCondition === 'EXCELLENT' ? 'text-green-600' : 'text-orange-600'
                }`}>
                  {realTimeAnalysis.marketConditions.tradingCondition}
                </span>
              </div>
            </div>
          </div>

          {/* Risk Warnings */}
          {realTimeAnalysis.riskWarnings && realTimeAnalysis.riskWarnings.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <h3 className="text-lg font-semibold text-red-900 mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-600" />
                Risk Warnings
              </h3>
              <div className="space-y-2">
                {(realTimeAnalysis.riskWarnings || []).map((warning, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    {warning}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : realTimeAnalysis ? (
        <div className="p-6 text-center">
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
            <p className="text-yellow-700 font-medium">Analysis data incomplete</p>
            <p className="text-sm text-yellow-600">Consensus data is not available</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}