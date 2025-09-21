'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart,
  CandlestickChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Line,
  ReferenceLine,
  Area
} from 'recharts';
import { Loader2, TrendingUp, TrendingDown, Activity } from 'lucide-react';

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
  value: number;
  color: string;
  type: 'line' | 'area' | 'reference';
}

interface AnalysisOverlay {
  price: number;
  timestamp: number;
  type: 'buy' | 'sell' | 'support' | 'resistance';
  confidence: number;
  reasoning: string;
  model: string;
}

interface TradingChartProps {
  symbol: string;
  timeframe: string;
  data: CandleData[];
  indicators?: TechnicalIndicator[];
  analysisOverlays?: AnalysisOverlay[];
  loading?: boolean;
  height?: number;
  showVolume?: boolean;
  showGrid?: boolean;
  onCandleClick?: (candle: CandleData) => void;
}

// Custom Candlestick component for Recharts
const CustomCandlestick = (props: any) => {
  const { payload, x, y, width, height } = props;
  if (!payload) return null;

  const { open, high, low, close } = payload;
  const isGreen = close > open;
  const color = isGreen ? '#10b981' : '#ef4444';
  const candleWidth = Math.max(width * 0.6, 1);
  const wickWidth = Math.max(candleWidth * 0.1, 1);

  const highY = y;
  const lowY = y + height;
  const openY = y + ((open - high) / (low - high)) * height;
  const closeY = y + ((close - high) / (low - high)) * height;

  const candleTop = Math.min(openY, closeY);
  const candleBottom = Math.max(openY, closeY);
  const candleHeight = Math.max(candleBottom - candleTop, 1);

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
      />
      {/* Open-Close body */}
      <rect
        x={x + (width - candleWidth) / 2}
        y={candleTop}
        width={candleWidth}
        height={candleHeight}
        fill={isGreen ? color : '#ffffff'}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
        {new Date(data.timestamp).toLocaleString()}
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">Open:</span>
          <span className="font-medium">${data.open?.toFixed(4)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">High:</span>
          <span className="font-medium text-green-600">${data.high?.toFixed(4)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">Low:</span>
          <span className="font-medium text-red-600">${data.low?.toFixed(4)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">Close:</span>
          <span className="font-medium">${data.close?.toFixed(4)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">Volume:</span>
          <span className="font-medium">{data.volume?.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600 dark:text-gray-400">Change:</span>
          <span className={`font-medium ${data.close > data.open ? 'text-green-600' : 'text-red-600'}`}>
            {((data.close - data.open) / data.open * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default function TradingChart({
  symbol,
  timeframe,
  data,
  indicators = [],
  analysisOverlays = [],
  loading = false,
  height = 400,
  showVolume = true,
  showGrid = true,
  onCandleClick
}: TradingChartProps) {
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);

  // Calculate chart dimensions
  const chartHeight = showVolume ? height * 0.7 : height;
  const volumeHeight = showVolume ? height * 0.3 : 0;

  // Process data for better rendering
  const processedData = useMemo(() => {
    return data.map((candle, index) => ({
      ...candle,
      index,
      // Add moving averages or other indicators if needed
      sma20: indicators.find(i => i.name === 'SMA20')?.value,
      ema20: indicators.find(i => i.name === 'EMA20')?.value,
    }));
  }, [data, indicators]);

  // Calculate price range for better Y-axis scaling
  const priceRange = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 100 };

    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const padding = (maxHigh - minLow) * 0.1; // 10% padding

    return {
      min: Math.max(0, minLow - padding),
      max: maxHigh + padding
    };
  }, [data]);

  // Format Y-axis tick
  const formatYAxisTick = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(2)}`;
  };

  // Format X-axis tick
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
      case '1M':
        return date.toLocaleDateString([], { year: 'numeric', month: 'short' });
      default:
        return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-center">
          <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No chart data available</p>
          <p className="text-xs text-gray-400 mt-1">Select a symbol to view price data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Chart Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {symbol}
          </h3>
          <span className="text-sm text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
            {timeframe}
          </span>
        </div>

        {data.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              {data[data.length - 1].close > data[data.length - 1].open ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className="font-medium">
                ${data[data.length - 1].close.toFixed(4)}
              </span>
            </div>
            <span className={`font-medium ${
              data[data.length - 1].close > data[data.length - 1].open
                ? 'text-green-600'
                : 'text-red-600'
            }`}>
              {(((data[data.length - 1].close - data[data.length - 1].open) / data[data.length - 1].open) * 100).toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Main Price Chart */}
      <div className="p-2">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={processedData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            onMouseMove={(e) => {
              if (e && e.activePayload && e.activePayload.length > 0) {
                setHoveredCandle(e.activePayload[0].payload);
              }
            }}
            onMouseLeave={() => setHoveredCandle(null)}
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

            <Tooltip content={<CustomTooltip />} />

            {/* Candlestick bars */}
            <Bar
              dataKey="high"
              fill="transparent"
              shape={<CustomCandlestick />}
              onClick={(data) => onCandleClick?.(data)}
            />

            {/* Technical Indicators */}
            {indicators.map((indicator) => {
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
              if (indicator.type === 'reference') {
                return (
                  <ReferenceLine
                    key={indicator.name}
                    y={indicator.value}
                    stroke={indicator.color}
                    strokeDasharray="5 5"
                    label={{ value: indicator.name, position: 'insideTopRight' }}
                  />
                );
              }
              return null;
            })}

            {/* Analysis Overlays */}
            {analysisOverlays.map((overlay, index) => (
              <ReferenceLine
                key={index}
                y={overlay.price}
                stroke={overlay.type === 'buy' ? '#10b981' : overlay.type === 'sell' ? '#ef4444' : '#6b7280'}
                strokeWidth={2}
                strokeDasharray={overlay.type === 'support' || overlay.type === 'resistance' ? '8 4' : '0'}
                label={{
                  value: `${overlay.type.toUpperCase()} (${(overlay.confidence * 100).toFixed(0)}%)`,
                  position: 'insideTopRight',
                  fill: overlay.type === 'buy' ? '#10b981' : overlay.type === 'sell' ? '#ef4444' : '#6b7280'
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

              <Bar
                dataKey="volume"
                fill="#8884d8"
                opacity={0.7}
                radius={[2, 2, 0, 0]}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}