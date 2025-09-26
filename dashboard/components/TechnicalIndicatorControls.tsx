'use client';

import React, { useState, useEffect } from 'react';
import { safeArray } from '@/lib/formatters';
import { TechnicalIndicatorsSkeleton } from './ui/SkeletonLoaders';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Settings,
  Eye,
  EyeOff,
  Palette,
  Sliders,
  RefreshCw,
  Layers
} from 'lucide-react';

interface TechnicalIndicator {
  name: string;
  displayName: string;
  type: 'overlay' | 'oscillator' | 'volume';
  color: string;
  visible: boolean;
  parameters: {
    [key: string]: number;
  };
  description: string;
}

interface TechnicalIndicatorControlsProps {
  availableIndicators?: TechnicalIndicator[];
  onIndicatorChange: (indicators: TechnicalIndicator[]) => void;
  onParameterChange: (indicatorName: string, parameters: { [key: string]: number }) => void;
  className?: string;
}

const DEFAULT_INDICATORS: TechnicalIndicator[] = [
  {
    name: 'SMA20',
    displayName: 'Simple Moving Average (20)',
    type: 'overlay',
    color: '#82ca9d',
    visible: true,
    parameters: { period: 20 },
    description: 'Simple Moving Average over 20 periods'
  },
  {
    name: 'EMA20',
    displayName: 'Exponential Moving Average (20)',
    type: 'overlay',
    color: '#ffc658',
    visible: true,
    parameters: { period: 20 },
    description: 'Exponential Moving Average over 20 periods'
  },
  {
    name: 'SMA50',
    displayName: 'Simple Moving Average (50)',
    type: 'overlay',
    color: '#8dd1e1',
    visible: false,
    parameters: { period: 50 },
    description: 'Simple Moving Average over 50 periods'
  },
  {
    name: 'EMA50',
    displayName: 'Exponential Moving Average (50)',
    type: 'overlay',
    color: '#d084d0',
    visible: false,
    parameters: { period: 50 },
    description: 'Exponential Moving Average over 50 periods'
  },
  {
    name: 'BB',
    displayName: 'Bollinger Bands',
    type: 'overlay',
    color: '#ff7300',
    visible: true,
    parameters: { period: 20, stdDev: 2 },
    description: 'Bollinger Bands with 2 standard deviations'
  },
  {
    name: 'RSI',
    displayName: 'Relative Strength Index',
    type: 'oscillator',
    color: '#8884d8',
    visible: true,
    parameters: { period: 14 },
    description: 'RSI oscillator (0-100) showing overbought/oversold conditions'
  },
  {
    name: 'MACD',
    displayName: 'MACD',
    type: 'oscillator',
    color: '#00ff88',
    visible: true,
    parameters: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    description: 'Moving Average Convergence Divergence indicator'
  },
  {
    name: 'STOCH',
    displayName: 'Stochastic Oscillator',
    type: 'oscillator',
    color: '#ff6b6b',
    visible: false,
    parameters: { kPeriod: 14, dPeriod: 3 },
    description: 'Stochastic oscillator showing momentum'
  },
  {
    name: 'VOLUME_SMA',
    displayName: 'Volume Moving Average',
    type: 'volume',
    color: '#95a5a6',
    visible: true,
    parameters: { period: 20 },
    description: 'Simple Moving Average of volume'
  },
  {
    name: 'OBV',
    displayName: 'On-Balance Volume',
    type: 'volume',
    color: '#f39c12',
    visible: false,
    parameters: {},
    description: 'On-Balance Volume indicator'
  }
];

const INDICATOR_COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff88',
  '#ff6b6b', '#8dd1e1', '#d084d0', '#95a5a6', '#f39c12',
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6'
];

export default function TechnicalIndicatorControls({
  availableIndicators = DEFAULT_INDICATORS,
  onIndicatorChange,
  onParameterChange,
  className = ''
}: TechnicalIndicatorControlsProps) {
  const [indicators, setIndicators] = useState<TechnicalIndicator[]>(availableIndicators || DEFAULT_INDICATORS);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedIndicator, setSelectedIndicator] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overlay' | 'oscillator' | 'volume'>('overlay');

  useEffect(() => {
    setIndicators(availableIndicators || DEFAULT_INDICATORS);
  }, [availableIndicators]);

  const toggleIndicator = (name: string) => {
    const updatedIndicators = safeArray.map(indicators, (indicator) =>
      indicator.name === name
        ? { ...indicator, visible: !indicator.visible }
        : indicator
    );

    setIndicators(updatedIndicators);
    onIndicatorChange(updatedIndicators);
  };

  const updateIndicatorColor = (name: string, color: string) => {
    const updatedIndicators = safeArray.map(indicators, (indicator) =>
      indicator.name === name
        ? { ...indicator, color }
        : indicator
    );

    setIndicators(updatedIndicators);
    onIndicatorChange(updatedIndicators);
  };

  const updateIndicatorParameters = (name: string, parameters: { [key: string]: number }) => {
    const updatedIndicators = safeArray.map(indicators, (indicator) =>
      indicator.name === name
        ? { ...indicator, parameters: { ...indicator.parameters, ...parameters } }
        : indicator
    );

    setIndicators(updatedIndicators);
    onIndicatorChange(updatedIndicators);
    onParameterChange(name, parameters);
  };

  const resetToDefaults = () => {
    setIndicators(DEFAULT_INDICATORS);
    onIndicatorChange(DEFAULT_INDICATORS);
  };

  const enableAllOverlays = () => {
    const updatedIndicators = safeArray.map(indicators, (indicator) =>
      indicator.type === 'overlay'
        ? { ...indicator, visible: true }
        : indicator
    );

    setIndicators(updatedIndicators);
    onIndicatorChange(updatedIndicators);
  };

  const disableAll = () => {
    const updatedIndicators = safeArray.map(indicators, (indicator) =>
      ({ ...indicator, visible: false })
    );

    setIndicators(updatedIndicators);
    onIndicatorChange(updatedIndicators);
  };

  const getIndicatorsByType = (type: 'overlay' | 'oscillator' | 'volume') => {
    return safeArray.filter(indicators, (indicator) => indicator.type === type);
  };

  const visibleCount = safeArray.filter(indicators, (i) => i.visible).length;

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Technical Indicators</h3>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
              {visibleCount} active
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-colors ${
                showSettings
                  ? 'bg-blue-100 text-blue-700'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={enableAllOverlays}
            className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 transition-colors"
          >
            Enable Overlays
          </button>
          <button
            onClick={disableAll}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
          >
            Disable All
          </button>
          <button
            onClick={resetToDefaults}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          {(['overlay', 'oscillator', 'volume'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                {tab === 'overlay' && <TrendingUp className="h-4 w-4" />}
                {tab === 'oscillator' && <Activity className="h-4 w-4" />}
                {tab === 'volume' && <BarChart3 className="h-4 w-4" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                  {getIndicatorsByType(tab).filter(i => i.visible).length}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Indicator List */}
      <div className="p-4">
        <div className="space-y-3">
          {getIndicatorsByType(activeTab).map((indicator) => (
            <div
              key={indicator.name}
              className={`p-3 rounded-lg border transition-all ${
                indicator.visible
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleIndicator(indicator.name)}
                    className={`p-1 rounded transition-colors ${
                      indicator.visible
                        ? 'text-blue-600 hover:text-blue-700'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {indicator.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>

                  <div
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{ backgroundColor: indicator.color }}
                  />

                  <div>
                    <div className="font-medium text-gray-900">{indicator.displayName}</div>
                    <div className="text-xs text-gray-600">{indicator.description}</div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedIndicator(
                    selectedIndicator === indicator.name ? null : indicator.name
                  )}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <Sliders className="h-4 w-4" />
                </button>
              </div>

              {/* Indicator Settings */}
              {selectedIndicator === indicator.name && showSettings && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                  {/* Color Picker */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Color</label>
                    <div className="flex gap-2">
                      {INDICATOR_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => updateIndicatorColor(indicator.name, color)}
                          className={`w-6 h-6 rounded border-2 transition-all ${
                            indicator.color === color
                              ? 'border-gray-600 scale-110'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Parameters */}
                  {Object.keys(indicator.parameters).length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Parameters</label>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(indicator.parameters).map(([param, value]) => (
                          <div key={param}>
                            <label className="text-xs text-gray-600 capitalize">
                              {param.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            <input
                              type="number"
                              value={value}
                              onChange={(e) => updateIndicatorParameters(
                                indicator.name,
                                { [param]: Number(e.target.value) }
                              )}
                              className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              min="1"
                              max={param.includes('period') ? 200 : 10}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {getIndicatorsByType(activeTab).length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No {activeTab} indicators available</p>
          </div>
        )}
      </div>

      {/* Summary */}
      {visibleCount > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{visibleCount}</span> indicators active:
            <div className="mt-1 flex flex-wrap gap-1">
              {indicators
                .filter(i => i.visible)
                .map(indicator => (
                  <span
                    key={indicator.name}
                    className="px-2 py-1 bg-white rounded border text-xs"
                    style={{ borderLeftColor: indicator.color, borderLeftWidth: '3px' }}
                  >
                    {indicator.displayName}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}