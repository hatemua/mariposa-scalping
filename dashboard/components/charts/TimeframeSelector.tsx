'use client';

import React from 'react';
import { Clock } from 'lucide-react';

export interface Timeframe {
  value: string;
  label: string;
  description: string;
  isActive?: boolean;
}

interface TimeframeSelectorProps {
  selectedTimeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  disabled?: boolean;
  className?: string;
}

const TIMEFRAMES: Timeframe[] = [
  { value: '1m', label: '1m', description: '1 minute' },
  { value: '5m', label: '5m', description: '5 minutes' },
  { value: '15m', label: '15m', description: '15 minutes' },
  { value: '1h', label: '1h', description: '1 hour' },
  { value: '4h', label: '4h', description: '4 hours' },
  { value: '1d', label: '1d', description: '1 day' },
  { value: '1M', label: '1M', description: '1 month' },
];

export default function TimeframeSelector({
  selectedTimeframe,
  onTimeframeChange,
  disabled = false,
  className = ''
}: TimeframeSelectorProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
        <Clock className="h-4 w-4" />
        <span>Timeframe:</span>
      </div>

      <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {TIMEFRAMES.map((timeframe) => (
          <button
            key={timeframe.value}
            onClick={() => !disabled && onTimeframeChange(timeframe.value)}
            disabled={disabled}
            title={timeframe.description}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200
              ${selectedTimeframe === timeframe.value
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {timeframe.label}
          </button>
        ))}
      </div>

      {selectedTimeframe && (
        <div className="text-xs text-gray-500 dark:text-gray-400 ml-2">
          {TIMEFRAMES.find(tf => tf.value === selectedTimeframe)?.description}
        </div>
      )}
    </div>
  );
}

// Utility function to get timeframe info
export const getTimeframeInfo = (timeframe: string): Timeframe | undefined => {
  return TIMEFRAMES.find(tf => tf.value === timeframe);
};

// Utility function to get all available timeframes
export const getAllTimeframes = (): Timeframe[] => {
  return TIMEFRAMES;
};

// Utility function to validate timeframe
export const isValidTimeframe = (timeframe: string): boolean => {
  return TIMEFRAMES.some(tf => tf.value === timeframe);
};

// Utility function to get default timeframe
export const getDefaultTimeframe = (): string => {
  return '5m';
};