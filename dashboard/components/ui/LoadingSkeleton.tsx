// Enhanced Loading Skeleton Components
// Provides professional loading states for trading intelligence components

import React from 'react';

interface LoadingSkeletonProps {
  className?: string;
}

interface TradingCardSkeletonProps {
  showHeader?: boolean;
  showStats?: boolean;
  showChart?: boolean;
  className?: string;
}

// Basic skeleton animation
export const Skeleton: React.FC<LoadingSkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

// Text skeleton with proper spacing
export const TextSkeleton: React.FC<{ lines?: number; className?: string }> = ({
  lines = 1,
  className = ''
}) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className={`h-4 bg-gray-200 rounded animate-pulse ${
          i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
        }`}
      />
    ))}
  </div>
);

// Trading card skeleton for professional components
export const TradingCardSkeleton: React.FC<TradingCardSkeletonProps> = ({
  showHeader = true,
  showStats = true,
  showChart = false,
  className = ''
}) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
    {/* Header */}
    {showHeader && (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="w-32 h-5" />
          <Skeleton className="w-16 h-4" />
        </div>
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
    )}

    {/* Stats Grid */}
    {showStats && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="w-full h-3" />
            <Skeleton className="w-3/4 h-6" />
          </div>
        ))}
      </div>
    )}

    {/* Chart Area */}
    {showChart && (
      <div className="mb-4">
        <Skeleton className="w-full h-32" />
      </div>
    )}

    {/* Content Lines */}
    <div className="space-y-3">
      <TextSkeleton lines={2} />
      <div className="flex gap-2">
        <Skeleton className="w-16 h-6 rounded-full" />
        <Skeleton className="w-20 h-6 rounded-full" />
        <Skeleton className="w-12 h-6 rounded-full" />
      </div>
    </div>
  </div>
);

// Whale Activity Skeleton
export const WhaleActivitySkeleton: React.FC<LoadingSkeletonProps> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    {/* Header */}
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="w-40 h-5" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="w-4 h-4" />
        <Skeleton className="w-24 h-4" />
      </div>
    </div>

    {/* Content */}
    <div className="p-4 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded" />
            <div className="space-y-2">
              <Skeleton className="w-16 h-4" />
              <Skeleton className="w-32 h-3" />
            </div>
          </div>
          <div className="text-right space-y-2">
            <Skeleton className="w-20 h-4" />
            <Skeleton className="w-16 h-3" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Professional Signal Feed Skeleton
export const SignalFeedSkeleton: React.FC<LoadingSkeletonProps> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    {/* Header */}
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="w-36 h-5" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="w-4 h-4" />
        <Skeleton className="w-20 h-6 rounded-md" />
        <Skeleton className="w-20 h-6 rounded-md" />
      </div>
    </div>

    {/* Content */}
    <div className="p-4 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <Skeleton className="w-5 h-5" />
              <Skeleton className="w-16 h-4" />
              <Skeleton className="w-12 h-4 rounded-full" />
            </div>
            <Skeleton className="w-20 h-4" />
          </div>
          <TextSkeleton lines={2} className="mb-3" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="space-y-1">
                <Skeleton className="w-full h-3" />
                <Skeleton className="w-3/4 h-4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Opportunity Scanner Skeleton
export const OpportunitySkeleton: React.FC<LoadingSkeletonProps> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    {/* Header */}
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="w-32 h-5" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-16 h-4" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="w-4 h-4" />
        <Skeleton className="w-24 h-6 rounded-md" />
        <Skeleton className="w-24 h-6 rounded-md" />
      </div>
    </div>

    {/* Content */}
    <div className="p-4 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3 flex-1">
              <Skeleton className="w-5 h-5 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-12 h-4" />
                  <Skeleton className="w-12 h-4 rounded-full" />
                  <Skeleton className="w-8 h-3" />
                </div>
                <TextSkeleton lines={1} />
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="w-full h-3" />
                      <Skeleton className="w-3/4 h-4" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-right space-y-1">
              <Skeleton className="w-20 h-5" />
              <Skeleton className="w-16 h-4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Order Book Skeleton
export const OrderBookSkeleton: React.FC<LoadingSkeletonProps> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    {/* Header */}
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="w-32 h-5" />
        </div>
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>

      {/* Mode Selector */}
      <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-8 rounded-md" />
        ))}
      </div>
    </div>

    {/* Content */}
    <div className="p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Order Book */}
        <div className="space-y-3">
          {/* Asks */}
          <div>
            <Skeleton className="w-32 h-4 mb-2" />
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                </div>
              ))}
            </div>
          </div>

          {/* Spread */}
          <div className="bg-gray-100 rounded-lg p-3">
            <Skeleton className="w-16 h-3 mb-1 mx-auto" />
            <Skeleton className="w-24 h-4 mx-auto" />
          </div>

          {/* Bids */}
          <div>
            <Skeleton className="w-32 h-4 mb-2" />
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analysis */}
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-lg p-3 space-y-3">
            <Skeleton className="w-28 h-4" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="w-20 h-3" />
                <Skeleton className="w-16 h-3" />
              </div>
            ))}
          </div>

          <div className="bg-blue-50 rounded-lg p-3 space-y-2">
            <Skeleton className="w-24 h-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="w-12 h-3" />
                <div className="space-y-1">
                  <Skeleton className="w-16 h-3" />
                  <Skeleton className="w-16 h-3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

// VaR Calculator Skeleton
export const VaRCalculatorSkeleton: React.FC<LoadingSkeletonProps> = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
    {/* Header */}
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="w-28 h-5" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="w-20 h-3" />
            <Skeleton className="w-full h-8 rounded-lg" />
          </div>
        ))}
      </div>
    </div>

    {/* Content */}
    <div className="p-4 space-y-4">
      {/* Main VaR Display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
            <Skeleton className="w-24 h-3" />
            <Skeleton className="w-16 h-6" />
            <Skeleton className="w-20 h-3" />
          </div>
        ))}
      </div>

      {/* Methods Comparison */}
      <div className="space-y-2">
        <Skeleton className="w-32 h-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-12 h-4 rounded-full" />
              </div>
              <div className="space-y-1">
                <Skeleton className="w-16 h-4" />
                <Skeleton className="w-20 h-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Generic loading overlay
export const LoadingOverlay: React.FC<{ message?: string; className?: string }> = ({
  message = 'Loading...',
  className = ''
}) => (
  <div className={`absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center ${className}`}>
    <div className="flex items-center gap-3">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      <span className="text-gray-600 text-sm">{message}</span>
    </div>
  </div>
);

export default {
  Skeleton,
  TextSkeleton,
  TradingCardSkeleton,
  WhaleActivitySkeleton,
  SignalFeedSkeleton,
  OpportunitySkeleton,
  OrderBookSkeleton,
  VaRCalculatorSkeleton,
  LoadingOverlay,
};