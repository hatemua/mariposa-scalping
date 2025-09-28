'use client';

import React, { useState } from 'react';
import { useRefreshContext } from '@/contexts/RefreshContext';
import { RefreshSpeed } from '@/hooks/useSmartRefresh';
import {
  RefreshCw,
  Pause,
  Play,
  Settings,
  Gauge,
  Clock,
  Activity,
  BarChart3,
  Zap,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react';

interface RefreshControlsProps {
  className?: string;
  compact?: boolean;
}

export function RefreshControls({ className = '', compact = false }: RefreshControlsProps) {
  const {
    state,
    toggleGlobal,
    setRefreshSpeed,
    resetAll,
  } = useRefreshContext();

  const [showSettings, setShowSettings] = useState(false);

  const refreshSpeedOptions: Array<{ value: RefreshSpeed; label: string; icon: React.ReactNode; description: string }> = [
    {
      value: 'FAST',
      label: 'Fast',
      icon: <Zap className="h-4 w-4" />,
      description: '50% faster refresh (more real-time)',
    },
    {
      value: 'NORMAL',
      label: 'Normal',
      icon: <Activity className="h-4 w-4" />,
      description: 'Balanced refresh rate (recommended)',
    },
    {
      value: 'SLOW',
      label: 'Slow',
      icon: <Clock className="h-4 w-4" />,
      description: '50% slower refresh (easier interaction)',
    },
  ];

  const getActiveComponentsCount = () => {
    return Object.values(state.componentStates).filter(comp => comp.enabled).length;
  };

  const getRefreshingComponentsCount = () => {
    return Object.values(state.componentStates).filter(comp => comp.isRefreshing).length;
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Global Toggle */}
        <button
          onClick={() => toggleGlobal(!state.globalEnabled)}
          className={`p-2 rounded-lg transition-colors ${
            state.globalEnabled
              ? 'text-green-600 bg-green-50 hover:bg-green-100'
              : 'text-gray-400 bg-gray-50 hover:bg-gray-100'
          }`}
          title={state.globalEnabled ? 'Pause auto-refresh' : 'Resume auto-refresh'}
        >
          {state.globalEnabled ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>

        {/* Speed Indicator */}
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded text-xs text-gray-600">
          {refreshSpeedOptions.find(opt => opt.value === state.refreshSpeed)?.icon}
          <span>{state.refreshSpeed}</span>
        </div>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
          title="Refresh settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Settings Dropdown */}
        {showSettings && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            <FullRefreshSettings onClose={() => setShowSettings(false)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Refresh Controls</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${state.globalEnabled ? 'bg-green-500' : 'bg-red-500'}`} />
            {state.globalEnabled ? 'Active' : 'Paused'}
          </div>
          <span>•</span>
          <span>{getActiveComponentsCount()} components</span>
        </div>
      </div>

      <FullRefreshSettings />
    </div>
  );
}

function FullRefreshSettings({ onClose }: { onClose?: () => void }) {
  const {
    state,
    toggleGlobal,
    setRefreshSpeed,
    resetAll,
  } = useRefreshContext();

  const refreshSpeedOptions: Array<{ value: RefreshSpeed; label: string; icon: React.ReactNode; description: string }> = [
    {
      value: 'FAST',
      label: 'Fast',
      icon: <Zap className="h-4 w-4" />,
      description: '50% faster refresh (more real-time)',
    },
    {
      value: 'NORMAL',
      label: 'Normal',
      icon: <Activity className="h-4 w-4" />,
      description: 'Balanced refresh rate (recommended)',
    },
    {
      value: 'SLOW',
      label: 'Slow',
      icon: <Clock className="h-4 w-4" />,
      description: '50% slower refresh (easier interaction)',
    },
  ];

  const getActiveComponentsCount = () => {
    return Object.values(state.componentStates).filter(comp => comp.enabled).length;
  };

  const getRefreshingComponentsCount = () => {
    return Object.values(state.componentStates).filter(comp => comp.isRefreshing).length;
  };

  return (
    <div className="space-y-4">
      {onClose && (
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 className="text-sm font-semibold text-gray-900">Refresh Settings</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Global Control */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-gray-900">Auto-Refresh</span>
          </div>
          <button
            onClick={() => toggleGlobal(!state.globalEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              state.globalEnabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                state.globalEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="text-xs text-gray-500">
          {state.globalEnabled
            ? `${getActiveComponentsCount()} components active, ${getRefreshingComponentsCount()} refreshing`
            : 'All auto-refresh paused'
          }
        </div>
      </div>

      {/* Speed Control */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-purple-600" />
          <span className="text-sm font-medium text-gray-900">Refresh Speed</span>
        </div>

        <div className="space-y-2">
          {refreshSpeedOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setRefreshSpeed(option.value)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                state.refreshSpeed === option.value
                  ? 'border-blue-200 bg-blue-50 text-blue-900'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className={`p-1 rounded ${
                state.refreshSpeed === option.value ? 'bg-blue-100' : 'bg-gray-100'
              }`}>
                {option.icon}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-gray-500">{option.description}</div>
              </div>
              {state.refreshSpeed === option.value && (
                <CheckCircle className="h-4 w-4 text-blue-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Component Status */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-gray-900">Component Status</span>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          {Object.keys(state.componentStates).length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-2">
              No components registered yet
            </div>
          ) : (
            Object.entries(state.componentStates).map(([componentId, componentState]) => (
              <div key={componentId} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate">{componentId}</span>
                <div className="flex items-center gap-2">
                  {componentState.isRefreshing && (
                    <RefreshCw className="h-3 w-3 text-blue-500 animate-spin" />
                  )}
                  <div className={`w-2 h-2 rounded-full ${
                    componentState.enabled ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Reset Button */}
      <div className="pt-3 border-t border-gray-200">
        <button
          onClick={() => {
            if (confirm('Reset all refresh settings to defaults?')) {
              resetAll();
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        >
          <AlertCircle className="h-4 w-4" />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}