'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { marketApi } from '@/lib/api';
import { safeArray, safeObject } from '@/lib/formatters';
import { useProgressiveLoading } from '@/hooks/useProgressiveLoading';
import { toast } from 'react-hot-toast';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Target,
  Shield,
  CheckCircle,
  Loader2
} from 'lucide-react';
import EnhancedTradingChart from './EnhancedTradingChart';
import { MultiTimeframeChartSkeleton, ChartSkeleton } from '../ui/SkeletonLoaders';
import { ChartErrorBoundary } from '../ErrorBoundaryEnhanced';

interface TimeframeData {
  timeframe: string;
  marketData: any;
  klineData: any[];
  analysis: any;
  technicalIndicators: any;
  supportResistance: any;
  volumeProfile: any;
  momentum: any;
}

interface ProgressiveMultiTimeframeChartProps {
  symbol: string;
  defaultTimeframes?: string[];
  height?: number;
  className?: string;
}

const TIMEFRAME_CONFIG = [
  { value: '1m', label: '1M', type: 'ULTRA_SHORT' },
  { value: '5m', label: '5M', type: 'SHORT' },
  { value: '15m', label: '15M', type: 'SHORT' },
  { value: '1h', label: '1H', type: 'MEDIUM' },
  { value: '4h', label: '4H', type: 'MEDIUM' },
  { value: '1d', label: '1D', type: 'LONG' }
];

export default function ProgressiveMultiTimeframeChart({
  symbol,
  defaultTimeframes = ['1m', '5m', '15m', '1h'],
  height = 500,
  className = ''
}: ProgressiveMultiTimeframeChartProps) {
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(defaultTimeframes);
  const [activeTimeframe, setActiveTimeframe] = useState(defaultTimeframes[0] || '5m');

  // Progressive loading setup
  const progressiveLoader = useProgressiveLoading({
    stages: [
      {
        name: 'essential_data',
        loader: async () => {
          // Load just market data and basic analysis first
          const response = await marketApi.getMultiTimeframeAnalysis(symbol, [activeTimeframe]);
          const timeframes = safeObject.get(response, 'data.timeframes', []);

          if (safeArray.hasItems(timeframes)) {
            const essential = timeframes[0];
            return {
              [activeTimeframe]: {
                timeframe: essential.timeframe,
                marketData: essential.marketData,
                analysis: essential.analysis,
                // Include minimal kline data for immediate chart display
                klineData: safeArray.slice(essential.klineData, -50) // Last 50 candles
              }
            };
          }
          return {};
        },
        timeout: 15000,
        retries: 2
      },
      {
        name: 'full_chart_data',
        loader: async () => {
          // Load complete kline data and technical indicators
          const response = await marketApi.getMultiTimeframeAnalysis(symbol, [activeTimeframe]);
          const timeframes = safeObject.get(response, 'data.timeframes', []);

          if (safeArray.hasItems(timeframes)) {
            const fullData = timeframes[0];
            return {
              [activeTimeframe]: {
                ...fullData,
                klineData: fullData.klineData, // Full dataset
                technicalIndicators: fullData.technicalIndicators,
                supportResistance: fullData.supportResistance,
                volumeProfile: fullData.volumeProfile,
                momentum: fullData.momentum
              }
            };
          }
          return {};
        },
        timeout: 45000,
        retries: 2,
        optional: true
      },
      {
        name: 'additional_timeframes',
        loader: async () => {
          // Load additional timeframes in background
          const additionalTimeframes = selectedTimeframes.filter(tf => tf !== activeTimeframe);
          if (additionalTimeframes.length === 0) return {};

          const response = await marketApi.getMultiTimeframeAnalysis(symbol, additionalTimeframes);
          const timeframes = safeObject.get(response, 'data.timeframes', []);

          const additionalData: Record<string, TimeframeData> = {};
          safeArray.forEach(timeframes, (tf: TimeframeData) => {
            if (tf?.timeframe) {
              additionalData[tf.timeframe] = tf;
            }
          });

          return additionalData;
        },
        timeout: 60000,
        retries: 1,
        optional: true
      }
    ],
    onStageComplete: (stage, data) => {
      console.log(`Stage "${stage}" completed with data:`, data);
    },
    onError: (stage, error) => {
      console.warn(`Stage "${stage}" failed:`, error);
      if (stage === 'essential_data') {
        toast.error('Failed to load essential chart data');
      }
    },
    onComplete: (allData) => {
      console.log('All progressive loading completed:', allData);
    }
  });

  // Combine all loaded data
  const timeframeData = useMemo(() => {
    const combined: Record<string, TimeframeData> = {};

    // Merge data from all stages
    const essentialData = progressiveLoader.getStageData('essential_data') || {};
    const fullChartData = progressiveLoader.getStageData('full_chart_data') || {};
    const additionalData = progressiveLoader.getStageData('additional_timeframes') || {};

    // Essential data first (quick display)
    Object.assign(combined, essentialData);

    // Override with full chart data when available
    Object.assign(combined, fullChartData);

    // Add additional timeframes
    Object.assign(combined, additionalData);

    return combined;
  }, [
    progressiveLoader.getStageData('essential_data'),
    progressiveLoader.getStageData('full_chart_data'),
    progressiveLoader.getStageData('additional_timeframes')
  ]);

  // Load data when symbol or timeframes change
  useEffect(() => {
    if (symbol && selectedTimeframes.length > 0) {
      progressiveLoader.load();
    }
  }, [symbol, selectedTimeframes.join(','), activeTimeframe]);

  // Process chart data for active timeframe
  const chartData = useMemo(() => {
    const activeData = timeframeData[activeTimeframe];
    if (!activeData?.klineData) return [];

    return safeArray.map(activeData.klineData, (candle: any) => ({
      timestamp: candle[0],
      time: new Date(candle[0]).toISOString(),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  }, [timeframeData, activeTimeframe]);

  const toggleTimeframe = (timeframe: string) => {
    if (selectedTimeframes.includes(timeframe)) {
      setSelectedTimeframes(prev => prev.filter(tf => tf !== timeframe));
    } else {
      setSelectedTimeframes(prev => [...prev, timeframe]);
    }
  };

  const getTimeframeTypeColor = (type: string) => {
    switch (type) {
      case 'ULTRA_SHORT': return 'bg-red-100 text-red-700 border-red-200';
      case 'SHORT': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'MEDIUM': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'LONG': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getStageIcon = (stageName: string) => {
    if (progressiveLoader.isStageComplete(stageName)) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    } else if (progressiveLoader.isStageLoading(stageName)) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    } else {
      return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <ChartErrorBoundary>
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
        {/* Progressive Loading Status */}
        {progressiveLoader.isLoading && (
          <div className="p-4 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  Loading {progressiveLoader.currentStage?.replace('_', ' ')}...
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  {getStageIcon('essential_data')}
                  <span>Essential</span>
                  {getStageIcon('full_chart_data')}
                  <span>Full Chart</span>
                  {getStageIcon('additional_timeframes')}
                  <span>Additional</span>
                </div>
                <div className="text-xs text-blue-700">
                  {Math.round(progressiveLoader.progress)}%
                </div>
              </div>
            </div>
            <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressiveLoader.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error State */}
        {progressiveLoader.error && (
          <div className="p-4 border-b border-gray-200 bg-red-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  {progressiveLoader.error}
                </span>
              </div>
              <button
                onClick={progressiveLoader.retry}
                className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Target className="h-6 w-6 text-blue-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {symbol} Multi-Timeframe Analysis
                </h3>
                <p className="text-sm text-gray-600">
                  Progressive loading • {selectedTimeframes.length} timeframes selected
                </p>
              </div>
            </div>
          </div>

          {/* Timeframe Selector */}
          <div className="flex flex-wrap gap-2">
            {TIMEFRAME_CONFIG.map(tf => {
              const isSelected = selectedTimeframes.includes(tf.value);
              const isActive = activeTimeframe === tf.value;
              const hasData = tf.value in timeframeData;

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
                        ? hasData
                          ? getTimeframeTypeColor(tf.type)
                          : 'bg-gray-100 text-gray-500 border-gray-300 animate-pulse'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {tf.label}
                    {hasData && isSelected && (
                      <CheckCircle className="h-3 w-3" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Show skeleton while loading essential data */}
          {progressiveLoader.isStageLoading('essential_data') ? (
            <ChartSkeleton height={height} />
          ) : chartData.length > 0 ? (
            <>
              <EnhancedTradingChart
                symbol={symbol}
                timeframe={activeTimeframe}
                data={chartData}
                loading={progressiveLoader.isStageLoading('full_chart_data')}
                height={height}
                showVolume={true}
                showGrid={true}
              />

              {/* Loading indicator for additional data */}
              {progressiveLoader.isStageLoading('full_chart_data') && (
                <div className="flex items-center justify-center py-4 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading detailed chart data...
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No chart data available</p>
                <button
                  onClick={progressiveLoader.load}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Reload Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ChartErrorBoundary>
  );
}