'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { marketApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { Clock, TrendingUp, TrendingDown, Activity, AlertTriangle, Target, Shield } from 'lucide-react';
import EnhancedTradingChart from './EnhancedTradingChart';

interface TimeframeData {
  timeframe: string;
  marketData: any;
  klineData: any[];
  analysis: any;
  technicalIndicators: any;
  supportResistance: any;
  volumeProfile: any;
  momentum: any;
  chartPatterns?: any[];
  error?: string;
}

interface LLMAnalysisPoint {
  timestamp: number;
  price: number;
  type: 'buy' | 'sell' | 'support' | 'resistance' | 'target' | 'stop';
  confidence: number;
  reasoning: string;
  model: string;
  active: boolean;
}

interface TechnicalIndicator {
  name: string;
  values: number[];
  color: string;
  type: 'line' | 'area' | 'reference' | 'histogram';
  visible: boolean;
}

interface MultiTimeframeChartProps {
  symbol: string;
  defaultTimeframes?: string[];
  height?: number;
  className?: string;
}

const AVAILABLE_TIMEFRAMES = [
  { value: '1m', label: '1 Minute', type: 'ultra-short' },
  { value: '5m', label: '5 Minutes', type: 'short' },
  { value: '15m', label: '15 Minutes', type: 'short' },
  { value: '1h', label: '1 Hour', type: 'medium' },
  { value: '4h', label: '4 Hours', type: 'medium' },
  { value: '1d', label: '1 Day', type: 'long' },
  { value: '1w', label: '1 Week', type: 'long' },
  { value: '1M', label: '1 Month', type: 'very-long' }
];

export default function MultiTimeframeChart({
  symbol,
  defaultTimeframes = ['1m', '5m', '15m', '1h'],
  height = 400,
  className = ''
}: MultiTimeframeChartProps) {
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(defaultTimeframes);
  const [activeTimeframe, setActiveTimeframe] = useState<string>(defaultTimeframes[0]);
  const [timeframeData, setTimeframeData] = useState<Record<string, TimeframeData>>({});
  const [consolidatedAnalysis, setConsolidatedAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [realTimeMode, setRealTimeMode] = useState(false);

  // Load multi-timeframe data
  const loadTimeframeData = async () => {
    if (!symbol || selectedTimeframes.length === 0) return;

    setLoading(true);
    try {
      const response = await marketApi.getMultiTimeframeAnalysis(symbol, selectedTimeframes);

      if (response.success) {
        const newTimeframeData: Record<string, TimeframeData> = {};

        response.data.timeframes.forEach((tf: TimeframeData) => {
          newTimeframeData[tf.timeframe] = tf;
        });

        setTimeframeData(newTimeframeData);
        setConsolidatedAnalysis(response.data.consolidatedAnalysis);
      } else {
        toast.error('Failed to load timeframe data');
      }
    } catch (error) {
      console.error('Error loading timeframe data:', error);
      toast.error('Error loading market analysis');
    } finally {
      setLoading(false);
    }
  };

  // Load real-time analysis for short timeframes
  const loadRealTimeAnalysis = async () => {
    if (!symbol) return;

    try {
      const response = await marketApi.getRealTimeAnalysis(symbol);

      if (response.success) {
        // Update short-term timeframes with real-time data
        const rtData = response.data;
        const updatedData = { ...timeframeData };

        // Update 1m and 5m data if they exist
        if (updatedData['1m']) {
          updatedData['1m'].analysis = rtData.realTimeAnalysis;
        }
        if (updatedData['5m']) {
          updatedData['5m'].analysis = rtData.realTimeAnalysis;
        }

        setTimeframeData(updatedData);
      }
    } catch (error) {
      console.error('Error loading real-time analysis:', error);
    }
  };

  useEffect(() => {
    loadTimeframeData();
  }, [symbol, selectedTimeframes]);

  useEffect(() => {
    if (realTimeMode) {
      const interval = setInterval(loadRealTimeAnalysis, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [realTimeMode, symbol]);

  // Process chart data for active timeframe
  const chartData = useMemo(() => {
    const activeData = timeframeData[activeTimeframe];
    if (!activeData || !activeData.klineData) return [];

    return activeData.klineData.map((candle: any) => ({
      timestamp: candle[0],
      time: new Date(candle[0]).toISOString(),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  }, [timeframeData, activeTimeframe]);

  // Process technical indicators for active timeframe
  const technicalIndicators = useMemo(() => {
    const activeData = timeframeData[activeTimeframe];
    if (!activeData || !activeData.technicalIndicators) return [];

    return Object.entries(activeData.technicalIndicators).map(([name, data]: [string, any]) => ({
      name,
      values: Array.isArray(data) ? data : data.values || [data],
      color: getIndicatorColor(name),
      type: getIndicatorType(name),
      visible: true
    })) as TechnicalIndicator[];
  }, [timeframeData, activeTimeframe]);

  // Process LLM analysis overlays
  const llmAnalyses = useMemo(() => {
    const activeData = timeframeData[activeTimeframe];
    if (!activeData || !activeData.analysis) return [];

    const analysis = activeData.analysis;
    const overlays: LLMAnalysisPoint[] = [];

    // Add target and stop loss levels
    if (analysis.targetPrice) {
      overlays.push({
        timestamp: Date.now(),
        price: analysis.targetPrice,
        type: 'target',
        confidence: analysis.confidence || 0.7,
        reasoning: 'AI Price Target',
        model: 'Consolidated',
        active: true
      });
    }

    if (analysis.stopLoss) {
      overlays.push({
        timestamp: Date.now(),
        price: analysis.stopLoss,
        type: 'stop',
        confidence: analysis.confidence || 0.7,
        reasoning: 'AI Stop Loss',
        model: 'Consolidated',
        active: true
      });
    }

    // Add support/resistance levels
    if (activeData.supportResistance) {
      activeData.supportResistance.support?.forEach((level: number) => {
        overlays.push({
          timestamp: Date.now(),
          price: level,
          type: 'support',
          confidence: 0.6,
          reasoning: 'Technical Support Level',
          model: 'Technical',
          active: true
        });
      });

      activeData.supportResistance.resistance?.forEach((level: number) => {
        overlays.push({
          timestamp: Date.now(),
          price: level,
          type: 'resistance',
          confidence: 0.6,
          reasoning: 'Technical Resistance Level',
          model: 'Technical',
          active: true
        });
      });
    }

    return overlays;
  }, [timeframeData, activeTimeframe]);

  const toggleTimeframe = (timeframe: string) => {
    setSelectedTimeframes(prev =>
      prev.includes(timeframe)
        ? prev.filter(tf => tf !== timeframe)
        : [...prev, timeframe]
    );
  };

  const getTimeframeTypeColor = (type: string) => {
    switch (type) {
      case 'ultra-short': return 'bg-red-100 text-red-700 border-red-200';
      case 'short': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'long': return 'bg-green-100 text-green-700 border-green-200';
      case 'very-long': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'SELL': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getIndicatorColor = (name: string): string => {
    const colors: Record<string, string> = {
      'RSI': '#8884d8',
      'SMA20': '#82ca9d',
      'EMA20': '#ffc658',
      'BB': '#ff7300',
      'MACD': '#00ff88'
    };
    return colors[name] || '#888888';
  };

  const getIndicatorType = (name: string): 'line' | 'area' | 'reference' | 'histogram' => {
    const types: Record<string, 'line' | 'area' | 'reference' | 'histogram'> = {
      'RSI': 'line',
      'SMA20': 'line',
      'EMA20': 'line',
      'BB': 'area',
      'MACD': 'histogram'
    };
    return types[name] || 'line';
  };

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Multi-Timeframe Analysis - {symbol}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setRealTimeMode(!realTimeMode)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                realTimeMode
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              {realTimeMode ? 'Real-time ON' : 'Real-time OFF'}
            </button>

            <button
              onClick={loadTimeframeData}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Activity className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Timeframe Selection */}
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_TIMEFRAMES.map(tf => {
              const isSelected = selectedTimeframes.includes(tf.value);
              const isActive = activeTimeframe === tf.value;

              return (
                <button
                  key={tf.value}
                  onClick={() => {
                    if (isSelected) {
                      setActiveTimeframe(tf.value);
                    } else {
                      toggleTimeframe(tf.value);
                    }
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                      : isSelected
                        ? getTimeframeTypeColor(tf.type)
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Activity className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-gray-600">Loading multi-timeframe analysis...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Consolidated Analysis Summary */}
            {consolidatedAnalysis && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getRecommendationIcon(consolidatedAnalysis.recommendation)}
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Consolidated Recommendation: {consolidatedAnalysis.recommendation}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Confidence: {(consolidatedAnalysis.confidence * 100).toFixed(1)}% |
                        Risk Level: {consolidatedAnalysis.riskLevel || 'MEDIUM'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-600">Optimal Timeframes</div>
                    <div className="flex gap-1 mt-1">
                      {consolidatedAnalysis.optimalTimeframes?.slice(0, 3).map((tf: string) => (
                        <span key={tf} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          {tf}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Chart */}
            {chartData.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {activeTimeframe} Chart with AI Analysis
                  </h3>

                  {timeframeData[activeTimeframe]?.analysis && (
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        {getRecommendationIcon(timeframeData[activeTimeframe].analysis.recommendation)}
                        <span className="font-medium">
                          {timeframeData[activeTimeframe].analysis.recommendation}
                        </span>
                      </div>
                      <div className="text-gray-600">
                        {(timeframeData[activeTimeframe].analysis.confidence * 100).toFixed(1)}% confidence
                      </div>
                    </div>
                  )}
                </div>

                <EnhancedTradingChart
                  symbol={symbol}
                  timeframe={activeTimeframe}
                  data={chartData}
                  technicalIndicators={technicalIndicators}
                  llmAnalyses={llmAnalyses}
                  height={height}
                  showVolume={true}
                  showGrid={true}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 bg-gray-50 rounded-xl">
                <div className="text-center">
                  <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No chart data available for {activeTimeframe}</p>
                  <p className="text-sm text-gray-500 mt-1">Try selecting a different timeframe</p>
                </div>
              </div>
            )}

            {/* Timeframe Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {selectedTimeframes.map(tf => {
                const data = timeframeData[tf];
                if (!data || data.error) {
                  return (
                    <div key={tf} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="text-center text-gray-500">
                        <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
                        <div className="font-medium">{tf}</div>
                        <div className="text-sm">Data unavailable</div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={tf}
                    onClick={() => setActiveTimeframe(tf)}
                    className={`rounded-lg p-4 border cursor-pointer transition-all ${
                      activeTimeframe === tf
                        ? 'border-blue-300 bg-blue-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-semibold text-gray-900">{tf}</div>
                      {data.analysis && getRecommendationIcon(data.analysis.recommendation)}
                    </div>

                    <div className="space-y-2 text-sm">
                      {data.analysis && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Signal:</span>
                            <span className={`font-medium ${
                              data.analysis.recommendation === 'BUY' ? 'text-green-600' :
                              data.analysis.recommendation === 'SELL' ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {data.analysis.recommendation}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Confidence:</span>
                            <span className="font-medium">
                              {(data.analysis.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </>
                      )}

                      {data.momentum && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Momentum:</span>
                          <span className={`font-medium ${
                            data.momentum.direction === 'BULLISH' ? 'text-green-600' :
                            data.momentum.direction === 'BEARISH' ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {data.momentum.direction}
                          </span>
                        </div>
                      )}

                      {data.analysis?.targetPrice && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Target:</span>
                          <span className="font-medium text-blue-600">
                            ${data.analysis.targetPrice.toFixed(4)}
                          </span>
                        </div>
                      )}

                      {data.analysis?.stopLoss && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Stop:</span>
                          <span className="font-medium text-red-600">
                            ${data.analysis.stopLoss.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Pattern indicators */}
                    {data.chartPatterns && data.chartPatterns.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-xs text-gray-600 mb-1">Patterns:</div>
                        <div className="flex flex-wrap gap-1">
                          {data.chartPatterns.slice(0, 2).map((pattern: any, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs"
                            >
                              {pattern.type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}