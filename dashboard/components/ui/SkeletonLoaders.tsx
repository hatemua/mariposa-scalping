import React from 'react';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', width, height }) => {
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={style}
    />
  );
};

export const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 400 }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <div className="flex items-center justify-between mb-4">
      <Skeleton width="150px" height="24px" />
      <div className="flex gap-2">
        <Skeleton width="60px" height="32px" />
        <Skeleton width="60px" height="32px" />
        <Skeleton width="60px" height="32px" />
      </div>
    </div>
    <Skeleton width="100%" height={`${height}px`} className="mb-4" />
    <div className="flex justify-between">
      <Skeleton width="120px" height="20px" />
      <Skeleton width="100px" height="20px" />
    </div>
  </div>
);

export const MultiTimeframeChartSkeleton: React.FC<{ height?: number }> = ({ height = 500 }) => (
  <div className="space-y-6">
    {/* Timeframe Selector Skeleton */}
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <Skeleton width="200px" height="20px" />
        <Skeleton width="150px" height="16px" />
      </div>
      <div className="flex gap-2">
        {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
          <Skeleton key={tf} width="40px" height="28px" className="rounded-md" />
        ))}
      </div>
    </div>

    {/* Main Chart Skeleton */}
    <ChartSkeleton height={height} />

    {/* Analysis Summary Skeleton */}
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <Skeleton width="180px" height="20px" className="mb-3" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="text-center">
            <Skeleton width="60px" height="32px" className="mx-auto mb-2" />
            <Skeleton width="80px" height="16px" className="mx-auto" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const LLMAnalysisSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <div className="flex items-center gap-2 mb-4">
      <Skeleton width="24px" height="24px" className="rounded-full" />
      <Skeleton width="150px" height="20px" />
    </div>

    {/* Consensus Section */}
    <div className="mb-6">
      <Skeleton width="120px" height="16px" className="mb-3" />
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton width="60px" height="24px" className="rounded-md" />
          <Skeleton width="80px" height="16px" />
        </div>
        <Skeleton width="100%" height="60px" className="mb-3" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Skeleton width="60px" height="14px" className="mb-1" />
            <Skeleton width="80px" height="20px" />
          </div>
          <div>
            <Skeleton width="70px" height="14px" className="mb-1" />
            <Skeleton width="85px" height="20px" />
          </div>
        </div>
      </div>
    </div>

    {/* Individual Analyses */}
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <Skeleton width="120px" height="16px" />
            <Skeleton width="60px" height="20px" className="rounded-md" />
          </div>
          <Skeleton width="100%" height="40px" className="mb-2" />
          <div className="flex gap-4">
            <Skeleton width="70px" height="14px" />
            <Skeleton width="80px" height="14px" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const TokenAnalysisGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <Skeleton width="80px" height="24px" />
          <Skeleton width="24px" height="24px" className="rounded-full" />
        </div>
        <div className="flex items-center justify-between mb-2">
          <Skeleton width="100px" height="28px" />
          <Skeleton width="60px" height="16px" />
        </div>
        <div className="flex items-center justify-between mb-2">
          <Skeleton width="80px" height="14px" />
          <Skeleton width="70px" height="14px" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <Skeleton width="90px" height="20px" className="rounded-md" />
          <Skeleton width="50px" height="20px" className="rounded-md" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, j) => (
            <Skeleton key={j} width="30px" height="16px" className="rounded" />
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const TechnicalIndicatorsSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl shadow-lg border border-gray-200">
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton width="24px" height="24px" />
          <Skeleton width="180px" height="20px" />
        </div>
        <Skeleton width="32px" height="32px" className="rounded-lg" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="100px" height="28px" className="rounded-lg" />
        ))}
      </div>
    </div>

    <div className="border-b border-gray-200">
      <div className="flex">
        {['Overlay', 'Oscillator', 'Volume'].map((tab) => (
          <div key={tab} className="flex-1 px-4 py-3 border-b-2 border-transparent">
            <div className="flex items-center justify-center gap-1">
              <Skeleton width="16px" height="16px" />
              <Skeleton width="60px" height="16px" />
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="p-4">
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-3 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton width="16px" height="16px" />
                <Skeleton width="16px" height="16px" className="rounded" />
                <div>
                  <Skeleton width="150px" height="16px" className="mb-1" />
                  <Skeleton width="200px" height="12px" />
                </div>
              </div>
              <Skeleton width="16px" height="16px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);