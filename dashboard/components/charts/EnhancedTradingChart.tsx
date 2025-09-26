'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { safeArray, safeNumber } from '@/lib/formatters';
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Line,
  ReferenceLine,
  Area,
  Cell
} from 'recharts';
import { Loader2, TrendingUp, TrendingDown, Activity, Eye, EyeOff, Settings, Layers } from 'lucide-react';

interface CandleData {
  timestamp: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalIndicator {
  name: string;
  values: number[];
  color: string;
  type: 'line' | 'area' | 'reference' | 'histogram';
  visible: boolean;
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

interface EnhancedTradingChartProps {
  symbol: string;
  timeframe: string;
  data: CandleData[];
  technicalIndicators?: TechnicalIndicator[];
  llmAnalyses?: LLMAnalysisPoint[];
  loading?: boolean;
  height?: number;
  showVolume?: boolean;
  showGrid?: boolean;
  onCandleClick?: (candle: CandleData) => void;
  onAnalysisPointClick?: (analysis: LLMAnalysisPoint) => void;
}

// Enhanced Candlestick component with volume-based sizing
const EnhancedCandlestick = (props: any) => {
  const { payload, x, y, width, height, maxVolume } = props;
  if (!payload) return null;

  const { open, high, low, close, volume } = payload;
  const isGreen = close > open;
  const color = isGreen ? '#10b981' : '#ef4444';

  // Volume-based width scaling
  const volumeRatio = maxVolume ? volume / maxVolume : 0.5;
  const candleWidth = Math.max(width * (0.4 + volumeRatio * 0.4), 2);
  const wickWidth = Math.max(candleWidth * 0.1, 1);

  const range = high - low;
  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);

  const highY = y;
  const lowY = y + height;
  const bodyTopY = y + ((high - bodyTop) / range) * height;
  const bodyBottomY = y + ((high - bodyBottom) / range) * height;

  const bodyHeight = Math.max(bodyBottomY - bodyTopY, 1);

  return (
    <g>
      {/* High-Low wick */}
      <line
        x1={x + width / 2}
        y1={highY}
        x2={x + width / 2}
        y2={lowY}
        stroke={color}
        strokeWidth={wickWidth}
        opacity={0.8}
      />
      {/* Open-Close body */}
      <rect
        x={x + (width - candleWidth) / 2}
        y={bodyTopY}
        width={candleWidth}
        height={bodyHeight}
        fill={isGreen ? color : '#ffffff'}
        stroke={color}
        strokeWidth={1.5}
        rx={1}
      />
      {/* Volume indicator (opacity based on volume) */}
      <rect
        x={x + (width - candleWidth) / 2}
        y={bodyTopY}
        width={candleWidth}
        height={bodyHeight}
        fill={color}
        opacity={volumeRatio * 0.3}
        rx={1}
      />
    </g>
  );
};

// LLM Analysis Overlay Component
const LLMAnalysisOverlay = ({ analyses, priceRange, chartHeight }: any) => {
  return (
    <>
      {analyses.filter((a: LLMAnalysisPoint) => a.active).map((analysis: LLMAnalysisPoint, index: number) => {
        const yPosition = chartHeight * (1 - (analysis.price - priceRange.min) / (priceRange.max - priceRange.min));

        const getColor = () => {
          switch (analysis.type) {
            case 'buy': return '#10b981';
            case 'sell': return '#ef4444';
            case 'support': return '#3b82f6';
            case 'resistance': return '#f59e0b';
            case 'target': return '#8b5cf6';
            case 'stop': return '#ef4444';
            default: return '#6b7280';
          }
        };

        const getIcon = () => {
          switch (analysis.type) {
            case 'buy': return '↗';
            case 'sell': return '↘';
            case 'support': return '⬆';
            case 'resistance': return '⬇';
            case 'target': return '🎯';
            case 'stop': return '🛑';
            default: return '•';
          }
        };

        return (
          <g key={`${analysis.timestamp}-${index}`}>
            {/* Analysis line */}
            <line
              x1={0}
              y1={yPosition}
              x2="100%"
              y2={yPosition}
              stroke={getColor()}
              strokeWidth={analysis.type === 'target' || analysis.type === 'stop' ? 2 : 1}
              strokeDasharray={analysis.type === 'support' || analysis.type === 'resistance' ? '8 4' : '0'}
              opacity={0.7}
            />

            {/* Analysis point marker */}
            <circle
              cx="10"
              cy={yPosition}
              r={4}
              fill={getColor()}
              stroke="#ffffff"
              strokeWidth={1}
              opacity={analysis.confidence}
            />

            {/* Analysis label */}
            <text
              x="20"
              y={yPosition - 5}
              fill={getColor()}
              fontSize="10"
              fontWeight="600"
            >
              {getIcon()} {analysis.type.toUpperCase()} - {analysis.model} ({(analysis.confidence * 100).toFixed(0)}%)
            </text>
          </g>
        );
      })}
    </>
  );
};

// Enhanced Tooltip
const EnhancedTooltip = ({ active, payload, label, technicalIndicators, llmAnalyses }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  // Find relevant LLM analyses for this timestamp
  const relevantAnalyses = llmAnalyses?.filter((analysis: LLMAnalysisPoint) =>
    Math.abs(analysis.timestamp - data.timestamp) < 300000 // Within 5 minutes
  ) || [];

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg max-w-sm">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
        {new Date(data.timestamp).toLocaleString()}
      </p>

      {/* OHLCV Data */}
      <div className="space-y-1 text-xs mb-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex justify-between">
            <span className="text-gray-600">O:</span>
            <span className="font-medium">${data.open?.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">H:</span>
            <span className="font-medium text-green-600">${data.high?.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">L:</span>
            <span className="font-medium text-red-600">${data.low?.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">C:</span>
            <span className="font-medium">${data.close?.toFixed(4)}</span>
          </div>
        </div>
        <div className="flex justify-between border-t pt-1">
          <span className="text-gray-600">Volume:</span>
          <span className="font-medium">{data.volume?.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Change:</span>
          <span className={`font-medium ${data.close > data.open ? 'text-green-600' : 'text-red-600'}`}>
            {((data.close - data.open) / data.open * 100).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Technical Indicators */}
      {technicalIndicators && technicalIndicators.length > 0 && (
        <div className="border-t pt-2 mb-3">
          <p className="text-xs font-medium text-gray-700 mb-1">Technical Indicators:</p>
          <div className="space-y-1">
            {technicalIndicators.filter((indicator: TechnicalIndicator) => indicator.visible).map((indicator: TechnicalIndicator) => (
              <div key={indicator.name} className="flex justify-between text-xs">
                <span style={{ color: indicator.color }}>{indicator.name}:</span>
                <span className="font-medium" style={{ color: indicator.color }}>
                  {indicator.values[data.index]?.toFixed(4) || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LLM Analyses */}
      {relevantAnalyses.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-xs font-medium text-gray-700 mb-1">AI Analysis:</p>
          <div className="space-y-1">
            {relevantAnalyses.slice(0, 2).map((analysis: LLMAnalysisPoint, idx: number) => (
              <div key={idx} className="text-xs">
                <span className={`px-1 rounded text-white text-xs ${
                  analysis.type === 'buy' ? 'bg-green-600' :
                  analysis.type === 'sell' ? 'bg-red-600' : 'bg-blue-600'
                }`}>
                  {analysis.type.toUpperCase()}
                </span>
                <span className="ml-1 text-gray-600">
                  {analysis.model} ({(analysis.confidence * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function EnhancedTradingChart({
  symbol,
  timeframe,
  data,
  technicalIndicators = [],
  llmAnalyses = [],
  loading = false,
  height = 500,
  showVolume = true,
  showGrid = true,
  onCandleClick,
  onAnalysisPointClick
}: EnhancedTradingChartProps) {
  const [visibleIndicators, setVisibleIndicators] = useState<string[]>(
    safeArray.map(safeArray.filter(technicalIndicators, (i) => i.visible), (i) => i.name)
  );
  const [visibleAnalyses, setVisibleAnalyses] = useState<string[]>(['buy', 'sell', 'support', 'resistance']);
  const [showSettings, setShowSettings] = useState(false);

  // Calculate chart dimensions
  const chartHeight = showVolume ? height * 0.7 : height;
  const volumeHeight = showVolume ? height * 0.25 : 0;
  const indicatorHeight = height * 0.05;

  // Process data with technical indicators
  const processedData = useMemo(() => {
    return safeArray.map(data, (candle, index) => {
      const enhanced: any = { ...candle, index };

      // Add technical indicator values
      safeArray.forEach(technicalIndicators, (indicator) => {
        if (safeArray.getValue(indicator.values, [])[index] !== undefined) {
          enhanced[indicator.name.toLowerCase()] = indicator.values[index];
        }
      });

      return enhanced;
    });
  }, [data, technicalIndicators]);

  // Calculate price range with padding
  const priceRange = useMemo(() => {
    if (safeArray.length(data) === 0) return { min: 0, max: 100 };

    const highs = safeArray.map(data, (d) => d.high);
    const lows = safeArray.map(data, (d) => d.low);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const padding = (maxHigh - minLow) * 0.1;

    return {
      min: Math.max(0, minLow - padding),
      max: maxHigh + padding
    };
  }, [data]);

  // Calculate max volume for candle sizing
  const maxVolume = useMemo(() => {
    return safeArray.hasItems(data) ? Math.max(...safeArray.map(data, (d) => d.volume)) : 0;
  }, [data]);

  // Filter active LLM analyses
  const activeAnalyses = useMemo(() => {
    return safeArray.filter(llmAnalyses, (analysis) =>
      safeArray.getValue(visibleAnalyses, []).includes(analysis.type) && analysis.active
    );
  }, [llmAnalyses, visibleAnalyses]);

  const toggleIndicator = (indicatorName: string) => {
    setVisibleIndicators(prev =>
      prev.includes(indicatorName)
        ? prev.filter(name => name !== indicatorName)
        : [...prev, indicatorName]
    );
  };

  const toggleAnalysisType = (analysisType: string) => {
    setVisibleAnalyses(prev =>
      prev.includes(analysisType)
        ? prev.filter(type => type !== analysisType)
        : [...prev, analysisType]
    );
  };

  const formatYAxisTick = (value: number) => {
    if (value >= 1000) return `$${safeNumber.toFixed(value / 1000, 1)}k`;
    return `$${safeNumber.toFixed(value, 2)}`;
  };

  const formatXAxisTick = (timestamp: number) => {
    const date = new Date(timestamp);
    switch (timeframe) {
      case '1m':
      case '5m':
      case '15m':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      case '1h':
      case '4h':
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
               date.toLocaleTimeString([], { hour: '2-digit' });
      case '1d':
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      default:
        return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading enhanced chart data...</p>
        </div>
      </div>
    );
  }

  if (safeArray.length(data) === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No chart data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Enhanced Chart Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{symbol}</h3>
          <span className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
            {timeframe}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 text-gray-500 hover:text-gray-700 rounded"
            >
              <Settings className="h-4 w-4" />
            </button>
            <span className="text-xs text-gray-500">
              {technicalIndicators.filter(i => visibleIndicators.includes(i.name)).length} indicators
            </span>
            <span className="text-xs text-gray-500">
              {activeAnalyses.length} AI signals
            </span>
          </div>
        </div>

        {data.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              {data[data.length - 1].close > data[data.length - 1].open ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className="font-medium">${data[data.length - 1].close.toFixed(4)}</span>
            </div>
            <span className={`font-medium ${
              data[data.length - 1].close > data[data.length - 1].open ? 'text-green-600' : 'text-red-600'
            }`}>
              {(((data[data.length - 1].close - data[data.length - 1].open) / data[data.length - 1].open) * 100).toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="border-b border-gray-200 p-4 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Technical Indicators */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Layers className="h-4 w-4" />
                Technical Indicators
              </h4>
              <div className="space-y-2">
                {technicalIndicators.map(indicator => (
                  <label key={indicator.name} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleIndicators.includes(indicator.name)}
                      onChange={() => toggleIndicator(indicator.name)}
                      className="rounded border-gray-300"
                    />
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: indicator.color }}></div>
                    <span>{indicator.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* LLM Analysis Types */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Activity className="h-4 w-4" />
                AI Analysis Types
              </h4>
              <div className="space-y-2">
                {['buy', 'sell', 'support', 'resistance', 'target', 'stop'].map(type => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleAnalyses.includes(type)}
                      onChange={() => toggleAnalysisType(type)}
                      className="rounded border-gray-300"
                    />
                    <span className="capitalize">{type} Signals</span>
                    <span className="text-xs text-gray-500">
                      ({llmAnalyses.filter(a => a.type === type && a.active).length})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Price Chart */}
      <div className="p-2 relative">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={processedData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            onMouseMove={(e) => {
              if (e && e.activePayload && e.activePayload.length > 0) {
                // Handle hover events
              }
            }}
          >
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
            )}

            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxisTick}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />

            <YAxis
              domain={[priceRange.min, priceRange.max]}
              tickFormatter={formatYAxisTick}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              width={80}
            />

            <Tooltip
              content={
                <EnhancedTooltip
                  technicalIndicators={technicalIndicators.filter(i => visibleIndicators.includes(i.name))}
                  llmAnalyses={activeAnalyses}
                />
              }
            />

            {/* Candlestick bars */}
            <Bar
              dataKey="high"
              fill="transparent"
              shape={<EnhancedCandlestick maxVolume={maxVolume} />}
              onClick={(data) => onCandleClick?.(data)}
            />

            {/* Technical Indicators */}
            {technicalIndicators
              .filter(indicator => visibleIndicators.includes(indicator.name))
              .map((indicator) => {
                if (indicator.type === 'line') {
                  return (
                    <Line
                      key={indicator.name}
                      type="monotone"
                      dataKey={indicator.name.toLowerCase()}
                      stroke={indicator.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  );
                }
                if (indicator.type === 'area') {
                  return (
                    <Area
                      key={indicator.name}
                      type="monotone"
                      dataKey={indicator.name.toLowerCase()}
                      stroke={indicator.color}
                      fill={indicator.color}
                      fillOpacity={0.1}
                    />
                  );
                }
                return null;
              })}

            {/* LLM Analysis Reference Lines */}
            {activeAnalyses.map((analysis, index) => (
              <ReferenceLine
                key={`${analysis.timestamp}-${index}`}
                y={analysis.price}
                stroke={
                  analysis.type === 'buy' ? '#10b981' :
                  analysis.type === 'sell' ? '#ef4444' :
                  analysis.type === 'support' ? '#3b82f6' :
                  analysis.type === 'resistance' ? '#f59e0b' :
                  analysis.type === 'target' ? '#8b5cf6' : '#ef4444'
                }
                strokeWidth={analysis.type === 'target' || analysis.type === 'stop' ? 2 : 1}
                strokeDasharray={analysis.type === 'support' || analysis.type === 'resistance' ? '8 4' : '0'}
                label={{
                  value: `${analysis.type.toUpperCase()} (${(analysis.confidence * 100).toFixed(0)}%)`,
                  position: 'insideTopRight',
                  fontSize: 10
                }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume Chart */}
      {showVolume && (
        <div className="p-2 border-t border-gray-200 dark:border-gray-700">
          <ResponsiveContainer width="100%" height={volumeHeight}>
            <ComposedChart data={processedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatXAxisTick}
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
              />

              <YAxis
                tickFormatter={(value) => {
                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                  return value.toFixed(0);
                }}
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
                width={80}
              />

              <Tooltip
                formatter={(value: number) => [value.toLocaleString(), 'Volume']}
                labelFormatter={(timestamp: number) => new Date(timestamp).toLocaleString()}
              />

              <Bar dataKey="volume" radius={[2, 2, 0, 0]}>
                {processedData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.close > entry.open ? '#10b981' : '#ef4444'}
                    opacity={0.7}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}