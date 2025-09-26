'use client';

import { useEffect, useState } from 'react';
import { marketApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { storage } from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';
import { MarketData } from '@/types';
import { toast } from 'react-hot-toast';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  Volume2,
  RefreshCw,
  Grid3X3,
  BarChart3,
  Brain,
  Layers,
  Eye,
  EyeOff,
  Settings,
  Maximize2,
  Minimize2
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ErrorBoundary from '@/components/ErrorBoundary';
import MultiTimeframeChart from '@/components/charts/MultiTimeframeChart';
import ProgressiveMultiTimeframeChart from '@/components/charts/ProgressiveMultiTimeframeChart';
import { PageErrorBoundary, SectionErrorBoundary } from '@/components/ErrorBoundaryEnhanced';
import LLMAnalysisPanel from '@/components/LLMAnalysisPanel';
import TechnicalIndicatorControls from '@/components/TechnicalIndicatorControls';
import TokenAnalysisGrid from '@/components/TokenAnalysisGrid';

export default function MarketPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [viewMode, setViewMode] = useState<'analysis' | 'grid' | 'chart'>('analysis');
  const [showIndicators, setShowIndicators] = useState(false);
  const [showLLMPanel, setShowLLMPanel] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [technicalIndicators, setTechnicalIndicators] = useState<any[]>([]);
  const isClient = useIsClient();

  useEffect(() => {
    const token = storage.getItem('token');
    if (token) {
      wsClient.connect(token);
    }
  }, []);

  const handleTokenSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    setViewMode('analysis');
  };

  const handleIndicatorChange = (indicators: any[]) => {
    setTechnicalIndicators(indicators);
  };

  const handleParameterChange = (indicatorName: string, parameters: any) => {
    // Handle indicator parameter changes
    console.log('Parameter change:', indicatorName, parameters);
  };

  // Show loading state during SSR to prevent hydration issues
  if (!isClient) {
    return (
      <DashboardLayout>
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading market dashboard...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <PageErrorBoundary>
      <DashboardLayout>
        <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'max-w-full'} px-4 sm:px-6 lg:px-8 py-6`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Enhanced Market Analysis</h1>
              <p className="text-gray-600">
                Deep technical analysis with AI insights across multiple timeframes
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Selector */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('analysis')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'analysis'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <BarChart3 className="h-4 w-4 mr-1 inline" />
                  Analysis
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Grid3X3 className="h-4 w-4 mr-1 inline" />
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('chart')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'chart'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <TrendingUp className="h-4 w-4 mr-1 inline" />
                  Chart
                </button>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {viewMode === 'analysis' && (
                  <>
                    <button
                      onClick={() => setShowIndicators(!showIndicators)}
                      className={`p-2 rounded-lg transition-colors ${
                        showIndicators
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title="Toggle Technical Indicators"
                    >
                      <Layers className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setShowLLMPanel(!showLLMPanel)}
                      className={`p-2 rounded-lg transition-colors ${
                        showLLMPanel
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title="Toggle LLM Analysis Panel"
                    >
                      <Brain className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {viewMode === 'grid' && (
              <SectionErrorBoundary>
                <TokenAnalysisGrid
                defaultTokens={[
                  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                  'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
                  'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
                ]}
                maxTokens={18}
                autoRefresh={true}
                refreshInterval={300000}
                onTokenSelect={handleTokenSelect}
                className="w-full"
              />
              </SectionErrorBoundary>
            )}

            {viewMode === 'chart' && (
              <SectionErrorBoundary>
                <div className="grid grid-cols-1 gap-6">
                  <ProgressiveMultiTimeframeChart
                    symbol={selectedSymbol}
                    defaultTimeframes={['1m', '5m', '15m', '1h', '4h', '1d']}
                    height={600}
                    className="w-full"
                  />
                </div>
              </SectionErrorBoundary>
            )}

            {viewMode === 'analysis' && (
              <div className="space-y-6">
                {/* Symbol Selector */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Select Token for Analysis</h3>
                    </div>
                    <div className="text-sm text-gray-600">
                      Current: <span className="font-medium text-blue-600">{selectedSymbol}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-2">
                    {[
                      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                      'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
                      'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
                    ].map(symbol => (
                      <button
                        key={symbol}
                        onClick={() => setSelectedSymbol(symbol)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          selectedSymbol === symbol
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {symbol.replace('USDT', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main Analysis Layout */}
                <div className={`grid gap-6 ${showLLMPanel ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1'}`}>
                  {/* Multi-Timeframe Chart */}
                  <div className={`${showLLMPanel ? 'xl:col-span-2' : 'col-span-1'} space-y-6`}>
                    <SectionErrorBoundary>
                      <ProgressiveMultiTimeframeChart
                        symbol={selectedSymbol}
                        defaultTimeframes={['1m', '5m', '15m', '1h', '4h', '1d']}
                        height={isFullscreen ? 700 : 500}
                        className="w-full"
                      />
                    </SectionErrorBoundary>

                    {/* Technical Indicators Panel */}
                    {showIndicators && (
                      <SectionErrorBoundary>
                        <TechnicalIndicatorControls
                          onIndicatorChange={handleIndicatorChange}
                          onParameterChange={handleParameterChange}
                          className="w-full"
                        />
                      </SectionErrorBoundary>
                    )}
                  </div>

                  {/* LLM Analysis Panel */}
                  {showLLMPanel && (
                    <div className="space-y-6">
                      <SectionErrorBoundary>
                        <LLMAnalysisPanel
                          symbol={selectedSymbol}
                          autoRefresh={true}
                          refreshInterval={60000}
                          className="w-full"
                        />
                      </SectionErrorBoundary>
                    </div>
                  )}
                </div>

                {/* Quick Access Token Grid */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Grid3X3 className="h-5 w-5 text-blue-600" />
                      Quick Token Overview
                    </h3>
                    <button
                      onClick={() => setViewMode('grid')}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      View Full Grid →
                    </button>
                  </div>

                  <SectionErrorBoundary>
                    <TokenAnalysisGrid
                      defaultTokens={['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT']}
                      maxTokens={6}
                      autoRefresh={false}
                      onTokenSelect={handleTokenSelect}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </PageErrorBoundary>
  );
}