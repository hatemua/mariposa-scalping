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
  values: number[];
  color: string;
  type: 'line' | 'area' | 'reference' | 'histogram';
  visible: boolean;
}

interface TradingChartProps {
  symbol: string;
  timeframe: string;
  data: CandleData[];
  technicalIndicators?: TechnicalIndicator[];
  loading?: boolean;
  height?: number;
  showVolume?: boolean;
  showGrid?: boolean;
  onCandleClick?: (candle: CandleData) => void;
}

const CustomCandlestick = (props: any) => {
  const { payload, x, y, width, height } = props;
  if (!payload) return null;

  const { open, high, low, close } = payload;
  const isGreen = close > open;
  const color = isGreen ? '#10b981' : '#ef4444';

  const range = high - low;
  if (range === 0) return null;

  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);

  const highY = y;
  const lowY = y + height;
  const bodyTopY = y + ((high - bodyTop) / range) * height;
  const bodyBottomY = y + ((high - bodyBottom) / range) * height;

  const bodyHeight = Math.max(bodyBottomY - bodyTopY, 1);

  return (
    <g>
      <line
        x1={x + width / 2}
        y1={highY}
        x2={x + width / 2}
        y2={lowY}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x + width * 0.25}
        y={bodyTopY}
        width={width * 0.5}
        height={bodyHeight}
        fill={isGreen ? color : '#ffffff'}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

export default function TradingChart({
  symbol,
  timeframe,
  data,
  technicalIndicators = [],
  loading = false,
  height = 400,
  showVolume = true,
  showGrid = true,
  onCandleClick
}: TradingChartProps) {
  const [visibleIndicators, setVisibleIndicators] = useState<string[]>(
    safeArray.map(safeArray.filter(technicalIndicators, (i) => i.visible), (i) => i.name)
  );

  const chartHeight = showVolume ? height * 0.75 : height;
  const volumeHeight = showVolume ? height * 0.25 : 0;

  const processedData = useMemo(() => {
    return safeArray.map(data, (candle, index) => {
      const enhanced: any = { ...candle, index };

      safeArray.forEach(technicalIndicators, (indicator) => {
        if (safeArray.getValue(indicator.values, [])[index] !== undefined) {
          enhanced[indicator.name.toLowerCase()] = indicator.values[index];
        }
      });

      return enhanced;
    });
  }, [data, technicalIndicators]);

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
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (safeArray.length(data) === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
        <div className="text-center">
          <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No chart data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">{symbol}</h3>
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {timeframe}
          </span>
        </div>

        {safeArray.hasItems(data) && (() => {
          const lastCandle = data[data.length - 1];
          if (!lastCandle) return null;
          return (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                {lastCandle.close > lastCandle.open ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span className="font-medium">${safeNumber.toFixed(lastCandle.close, 4)}</span>
              </div>
              <span className={`font-medium ${
                lastCandle.close > lastCandle.open ? 'text-green-600' : 'text-red-600'
              }`}>
                {safeNumber.toFixed(((lastCandle.close - lastCandle.open) / lastCandle.open) * 100, 2)}%
              </span>
            </div>
          );
        })()}
      </div>

      <div className="p-2">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <ComposedChart
            data={processedData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
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
              tickFormatter={formatYAxisTick}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              width={80}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0]?.payload;
                if (!data) return null;

                return (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      {new Date(data.timestamp).toLocaleString()}
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">O:</span>
                          <span className="font-medium">${safeNumber.toFixed(data.open, 4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">H:</span>
                          <span className="font-medium text-green-600">${safeNumber.toFixed(data.high, 4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">L:</span>
                          <span className="font-medium text-red-600">${safeNumber.toFixed(data.low, 4)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">C:</span>
                          <span className="font-medium">${safeNumber.toFixed(data.close, 4)}</span>
                        </div>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span className="text-gray-600">Volume:</span>
                        <span className="font-medium">{data.volume?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            <Bar
              dataKey="high"
              fill="transparent"
              shape={<CustomCandlestick />}
              onClick={(data) => onCandleClick?.(data)}
            />

            {safeArray.map(
              safeArray.filter(technicalIndicators, (indicator) => safeArray.getValue(visibleIndicators, []).includes(indicator.name)),
              (indicator) => {
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {showVolume && (
        <div className="p-2 border-t border-gray-200">
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
                  if (value >= 1000000) return `${safeNumber.toFixed(value / 1000000, 1)}M`;
                  if (value >= 1000) return `${safeNumber.toFixed(value / 1000, 1)}k`;
                  return safeNumber.toFixed(value, 0);
                }}
                tick={{ fontSize: 12 }}
                stroke="#6b7280"
                width={80}
              />

              <Tooltip
                formatter={(value: number) => [safeNumber.isValid(value) ? value.toLocaleString() : '0', 'Volume']}
                labelFormatter={(timestamp: number) => new Date(timestamp).toLocaleString()}
              />

              <Bar dataKey="volume" fill="#8884d8" opacity={0.6} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}