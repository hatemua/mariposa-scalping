// AI Processing Indicator Component
// Provides better UX for long-running AI model operations

import React, { useEffect, useState } from 'react';
import { Brain, Clock, Zap, TrendingUp, Activity } from 'lucide-react';

interface AIProcessingIndicatorProps {
  operation?: string;
  symbol?: string;
  estimatedTime?: number; // in seconds
  stage?: 'fetching' | 'analyzing' | 'finalizing';
  showProgress?: boolean;
  className?: string;
}

const processingStages = {
  fetching: {
    icon: Activity,
    title: 'Fetching Market Data',
    description: 'Gathering real-time market information...',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  analyzing: {
    icon: Brain,
    title: 'AI Analysis in Progress',
    description: 'AI models are processing complex trading patterns...',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  finalizing: {
    icon: TrendingUp,
    title: 'Finalizing Results',
    description: 'Preparing trading insights and recommendations...',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
};

export default function AIProcessingIndicator({
  operation = 'AI Analysis',
  symbol,
  estimatedTime = 60,
  stage = 'analyzing',
  showProgress = true,
  className = ''
}: AIProcessingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [currentStage, setCurrentStage] = useState(stage);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-progress through stages based on elapsed time
  useEffect(() => {
    if (elapsed > estimatedTime * 0.2 && currentStage === 'fetching') {
      setCurrentStage('analyzing');
    } else if (elapsed > estimatedTime * 0.8 && currentStage === 'analyzing') {
      setCurrentStage('finalizing');
    }
  }, [elapsed, estimatedTime, currentStage]);

  const stageInfo = processingStages[currentStage];
  const Icon = stageInfo.icon;
  const progress = Math.min((elapsed / estimatedTime) * 100, 95); // Max 95% to avoid 100% before completion

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getMotivationalMessage = (): string => {
    if (elapsed < 30) return 'Advanced AI models require processing time for accurate analysis';
    if (elapsed < 60) return 'Analyzing multiple timeframes and market indicators';
    if (elapsed < 90) return 'Deep learning models are processing complex patterns';
    if (elapsed < 120) return 'Finalizing comprehensive trading insights';
    return 'Almost ready - generating final recommendations';
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${stageInfo.bgColor} ${stageInfo.color}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{stageInfo.title}</h3>
            <p className="text-sm text-gray-600">
              {symbol && `${symbol} • `}{operation}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500 mb-1">Elapsed Time</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatTime(elapsed)}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {showProgress && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progress</span>
            <span className="text-sm text-gray-500">
              Est. {formatTime(estimatedTime)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${
                currentStage === 'fetching' ? 'bg-blue-500' :
                currentStage === 'analyzing' ? 'bg-purple-500' :
                'bg-green-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stage Description */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <p className="text-sm text-gray-700 mb-2">
          {stageInfo.description}
        </p>
        <p className="text-xs text-gray-500 italic">
          {getMotivationalMessage()}
        </p>
      </div>

      {/* Processing Steps */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <div className={`w-2 h-2 rounded-full ${
            elapsed > 5 ? 'bg-green-500' : 'bg-gray-300'
          }`} />
          <span className={elapsed > 5 ? 'text-gray-900' : 'text-gray-500'}>
            Market data collection
          </span>
          {elapsed > 5 && <span className="text-green-600 text-xs">✓</span>}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className={`w-2 h-2 rounded-full ${
            elapsed > 15 ? 'bg-green-500' : elapsed > 5 ? 'bg-yellow-500 animate-pulse' : 'bg-gray-300'
          }`} />
          <span className={elapsed > 15 ? 'text-gray-900' : elapsed > 5 ? 'text-yellow-700' : 'text-gray-500'}>
            AI model processing
          </span>
          {elapsed > 15 && <span className="text-green-600 text-xs">✓</span>}
          {elapsed > 5 && elapsed <= 15 && (
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-1 bg-yellow-500 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <div className={`w-2 h-2 rounded-full ${
            elapsed > estimatedTime * 0.8 ? 'bg-green-500' : elapsed > 15 ? 'bg-yellow-500 animate-pulse' : 'bg-gray-300'
          }`} />
          <span className={elapsed > estimatedTime * 0.8 ? 'text-gray-900' : elapsed > 15 ? 'text-yellow-700' : 'text-gray-500'}>
            Generating recommendations
          </span>
          {elapsed > estimatedTime * 0.8 && <span className="text-green-600 text-xs">✓</span>}
        </div>
      </div>

      {/* Tips for long waits */}
      {elapsed > 90 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Why does AI analysis take time?</span>
          </div>
          <p className="text-xs text-blue-700">
            Our AI models analyze vast amounts of market data across multiple timeframes to provide the most accurate trading insights.
            Quality analysis takes time - the wait ensures you get professional-grade recommendations.
          </p>
        </div>
      )}
    </div>
  );
}

// Compact version for smaller spaces
export function AIProcessingIndicatorCompact({
  operation = 'AI Processing',
  elapsed = 0,
  className = ''
}: {
  operation?: string;
  elapsed?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg ${className}`}>
      <div className="flex items-center gap-2">
        <div className="animate-spin">
          <Brain className="h-4 w-4 text-purple-600" />
        </div>
        <div className="flex gap-1">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-1 h-1 bg-purple-500 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-purple-800">{operation}</div>
        <div className="text-xs text-purple-600">
          AI models processing... {elapsed > 0 && `${elapsed}s elapsed`}
        </div>
      </div>
      <div className="text-xs text-purple-600 animate-pulse">
        Please wait
      </div>
    </div>
  );
}