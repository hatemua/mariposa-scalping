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
import ConfluenceScorePanel from '@/components/trading-intelligence/ConfluenceScorePanel';
import SmartEntrySignals from '@/components/trading-intelligence/SmartEntrySignals';
import ExitStrategyPanel from '@/components/trading-intelligence/ExitStrategyPanel';
import RiskMonitorDashboard from '@/components/trading-intelligence/RiskMonitorDashboard';
import PositionSizingCalculator from '@/components/trading-intelligence/PositionSizingCalculator';
import AdvancedRiskManager from '@/components/trading-intelligence/AdvancedRiskManager';
import PortfolioHeatMap from '@/components/trading-intelligence/PortfolioHeatMap';
import CorrelationMatrix from '@/components/trading-intelligence/CorrelationMatrix';
import VaRCalculator from '@/components/trading-intelligence/VaRCalculator';
import MultiTimeframeConfluence from '@/components/trading-intelligence/MultiTimeframeConfluence';
import OrderBookAnalyzer from '@/components/trading-intelligence/OrderBookAnalyzer';
import OpportunityScanner from '@/components/trading-intelligence/OpportunityScanner';
import TradingAgentDashboard from '@/components/trading-intelligence/TradingAgentDashboard';
import WhaleActivityMonitor from '@/components/trading-intelligence/WhaleActivityMonitor';
import ProfessionalSignalFeed from '@/components/trading-intelligence/ProfessionalSignalFeed';

export default function MarketPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [viewMode, setViewMode] = useState<'analysis' | 'grid' | 'chart' | 'intelligence' | 'risk_manager' | 'professional'>('analysis');
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Enhanced Market Analysis</h1>
              <p className="text-sm text-gray-600 mt-1">
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
                <button
                  onClick={() => setViewMode('intelligence')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'intelligence'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Brain className="h-4 w-4 mr-1 inline" />
                  Intelligence
                </button>
                <button
                  onClick={() => setViewMode('risk_manager')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'risk_manager'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Settings className="h-4 w-4 mr-1 inline" />
                  Risk Manager
                </button>
                <button
                  onClick={() => setViewMode('professional')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'professional'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Eye className="h-4 w-4 mr-1 inline" />
                  Pro Suite
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

            {viewMode === 'intelligence' && (
              <div className="space-y-6">
                {/* Symbol Selector for Intelligence */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Brain className="h-5 w-5 text-purple-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Trading Intelligence Suite</h3>
                    </div>
                    <div className="text-sm text-gray-600">
                      Current: <span className="font-medium text-purple-600">{selectedSymbol}</span>
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
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {symbol.replace('USDT', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Top Row: Confluence Score + Risk Monitor + Position Sizing */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <SectionErrorBoundary>
                    <ConfluenceScorePanel
                      symbol={selectedSymbol}
                      autoRefresh={true}
                      refreshInterval={30000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <RiskMonitorDashboard
                      symbol={selectedSymbol}
                      portfolioSymbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT']}
                      autoRefresh={true}
                      refreshInterval={5000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <PositionSizingCalculator
                      symbol={selectedSymbol}
                      accountBalance={10000}
                      riskPerTrade={2}
                      autoRefresh={true}
                      refreshInterval={30000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Bottom Row: Entry Signals + Exit Strategy */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <SectionErrorBoundary>
                    <SmartEntrySignals
                      symbol={selectedSymbol}
                      autoRefresh={true}
                      refreshInterval={15000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <ExitStrategyPanel
                      symbol={selectedSymbol}
                      position={{
                        side: 'LONG',
                        entryPrice: 0, // Would be from actual position data
                        size: 0,
                        entryTime: new Date().toISOString()
                      }}
                      autoRefresh={true}
                      refreshInterval={10000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Info Panel */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Brain className="h-6 w-6 text-purple-600" />
                    <h3 className="text-lg font-semibold text-purple-900">Professional Trading Intelligence</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="font-medium text-purple-800">Confluence Scoring</div>
                      <div className="text-purple-600">Multi-factor analysis for entry confidence</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-800">Smart Entry Signals</div>
                      <div className="text-purple-600">Liquidity grabs & volume breakout detection</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-800">Dynamic Exit Strategy</div>
                      <div className="text-purple-600">Adaptive take-profits & trailing stops</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-800">Risk Management</div>
                      <div className="text-purple-600">Real-time risk monitoring & position sizing</div>
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-purple-700">
                    ⚡ All components update in real-time • Built for professional crypto traders
                  </div>
                </div>
              </div>
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

            {viewMode === 'risk_manager' && (
              <div className="space-y-6">
                {/* Symbol Selector for Risk Manager */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Settings className="h-5 w-5 text-purple-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Advanced Risk Management Suite</h3>
                    </div>
                    <div className="text-sm text-gray-600">
                      Primary Asset: <span className="font-medium text-purple-600">{selectedSymbol}</span>
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
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {symbol.replace('USDT', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main Risk Manager Component */}
                <SectionErrorBoundary>
                  <AdvancedRiskManager
                    symbol={selectedSymbol}
                    portfolioSymbols={[
                      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                      'MATICUSDT', 'LINKUSDT', 'UNIUSDT'
                    ]}
                    autoRefresh={true}
                    refreshInterval={5000}
                    className="w-full"
                  />
                </SectionErrorBoundary>

                {/* Portfolio Analysis Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <SectionErrorBoundary>
                    <PortfolioHeatMap
                      symbols={[
                        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                        'MATICUSDT', 'LINKUSDT', 'UNIUSDT'
                      ]}
                      autoRefresh={true}
                      refreshInterval={10000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <CorrelationMatrix
                      symbols={[
                        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                        'MATICUSDT', 'LINKUSDT', 'UNIUSDT'
                      ]}
                      timeframe="1h"
                      lookbackPeriods={100}
                      autoRefresh={true}
                      refreshInterval={30000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Enhanced Risk Monitoring Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <SectionErrorBoundary>
                    <RiskMonitorDashboard
                      symbol={selectedSymbol}
                      portfolioSymbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT']}
                      autoRefresh={true}
                      refreshInterval={5000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <SmartEntrySignals
                      symbol={selectedSymbol}
                      autoRefresh={true}
                      refreshInterval={15000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <ExitStrategyPanel
                      symbol={selectedSymbol}
                      position={{
                        side: 'LONG',
                        entryPrice: 0,
                        size: 0,
                        entryTime: new Date().toISOString()
                      }}
                      autoRefresh={true}
                      refreshInterval={10000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Info Panel */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Settings className="h-6 w-6 text-purple-600" />
                    <h3 className="text-lg font-semibold text-purple-900">Professional Risk Management</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="font-medium text-purple-800">Advanced Risk Analysis</div>
                      <div className="text-purple-600">VaR, stress testing, and portfolio optimization</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-800">Portfolio Heat Map</div>
                      <div className="text-purple-600">Visual risk distribution and concentration analysis</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-800">Correlation Matrix</div>
                      <div className="text-purple-600">Cross-asset correlation and diversification metrics</div>
                    </div>
                    <div>
                      <div className="font-medium text-purple-800">Real-time Monitoring</div>
                      <div className="text-purple-600">Continuous risk assessment and alert system</div>
                    </div>
                  </div>
                  <div className="mt-4 text-xs text-purple-700">
                    ⚡ Institutional-grade risk management • Real-time portfolio analysis • Advanced diversification metrics
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'professional' && (
              <div className="space-y-6">
                {/* Symbol Selector for Professional Suite */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-base font-semibold text-gray-900">Professional Trading Suite</h3>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                        INSTITUTIONAL GRADE
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      Active: <span className="font-medium text-emerald-600">{selectedSymbol}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-2">
                    {[
                      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                      'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
                      'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
                    ].map(symbol => (
                      <button
                        key={symbol}
                        onClick={() => setSelectedSymbol(symbol)}
                        className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          selectedSymbol === symbol
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {symbol.replace('USDT', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opportunity & Agent Monitoring Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SectionErrorBoundary>
                    <OpportunityScanner
                      symbols={[
                        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                        'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT'
                      ]}
                      maxOpportunities={8}
                      minScore={70}
                      autoRefresh={true}
                      refreshInterval={30000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <TradingAgentDashboard
                      maxAgents={6}
                      autoRefresh={true}
                      refreshInterval={15000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Whale Activity & Professional Signals Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SectionErrorBoundary>
                    <WhaleActivityMonitor
                      symbols={[selectedSymbol, 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT']}
                      minWhaleSize={50000}
                      autoRefresh={true}
                      refreshInterval={10000}
                      enableAlerts={true}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <ProfessionalSignalFeed
                      symbols={[
                        selectedSymbol, 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT'
                      ]}
                      maxSignals={12}
                      minStrength={65}
                      autoRefresh={true}
                      refreshInterval={15000}
                      enableNotifications={true}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Advanced Analytics Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <SectionErrorBoundary>
                    <VaRCalculator
                      symbols={[selectedSymbol, 'BTCUSDT', 'ETHUSDT']}
                      autoRefresh={true}
                      refreshInterval={30000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <MultiTimeframeConfluence
                      symbol={selectedSymbol}
                      timeframes={['1m', '5m', '15m', '1h', '4h']}
                      autoRefresh={true}
                      refreshInterval={15000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <OrderBookAnalyzer
                      symbol={selectedSymbol}
                      autoRefresh={true}
                      refreshInterval={5000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Professional Intelligence Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SectionErrorBoundary>
                    <SmartEntrySignals
                      symbol={selectedSymbol}
                      autoRefresh={true}
                      refreshInterval={10000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <ConfluenceScorePanel
                      symbol={selectedSymbol}
                      autoRefresh={true}
                      refreshInterval={15000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Risk & Portfolio Management Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <SectionErrorBoundary>
                    <RiskMonitorDashboard
                      symbol={selectedSymbol}
                      portfolioSymbols={['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT']}
                      autoRefresh={true}
                      refreshInterval={5000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <PositionSizingCalculator
                      symbol={selectedSymbol}
                      accountBalance={100000}
                      riskPerTrade={2}
                      autoRefresh={true}
                      refreshInterval={20000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <ExitStrategyPanel
                      symbol={selectedSymbol}
                      position={{
                        side: 'LONG',
                        entryPrice: 0,
                        size: 0,
                        entryTime: new Date().toISOString()
                      }}
                      autoRefresh={true}
                      refreshInterval={10000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Advanced Portfolio Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SectionErrorBoundary>
                    <PortfolioHeatMap
                      symbols={[
                        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                        'MATICUSDT', 'LINKUSDT', 'UNIUSDT'
                      ]}
                      autoRefresh={true}
                      refreshInterval={15000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <CorrelationMatrix
                      symbols={[
                        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
                        'MATICUSDT', 'LINKUSDT', 'UNIUSDT'
                      ]}
                      timeframe="1h"
                      lookbackPeriods={100}
                      autoRefresh={true}
                      refreshInterval={30000}
                      className="w-full"
                    />
                  </SectionErrorBoundary>
                </div>

                {/* Professional Suite Info Panel */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-base font-semibold text-emerald-900">Professional Trading Intelligence</h3>
                    <span className="px-2 py-0.5 bg-emerald-600 text-white text-xs font-medium rounded-full">
                      LIVE DATA
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
                    <div>
                      <div className="font-medium text-emerald-800">Opportunity Scanner</div>
                      <div className="text-emerald-600">Real-time profit opportunities with risk-adjusted scoring</div>
                    </div>
                    <div>
                      <div className="font-medium text-emerald-800">Trading Agents</div>
                      <div className="text-emerald-600">Autonomous trading bots with performance monitoring</div>
                    </div>
                    <div>
                      <div className="font-medium text-emerald-800">Whale Activity Monitor</div>
                      <div className="text-emerald-600">Large order detection and institutional flow analysis</div>
                    </div>
                    <div>
                      <div className="font-medium text-emerald-800">Professional Signal Feed</div>
                      <div className="text-emerald-600">AI-powered signals with entry/exit recommendations</div>
                    </div>
                    <div>
                      <div className="font-medium text-emerald-800">Advanced Analytics</div>
                      <div className="text-emerald-600">VaR calculations, confluence analysis, order book intelligence</div>
                    </div>
                    <div>
                      <div className="font-medium text-emerald-800">Risk Management</div>
                      <div className="text-emerald-600">Portfolio optimization and position sizing tools</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-emerald-700">
                    🚀 Complete professional trading suite • Out-of-the-box opportunities • Whale detection • AI-powered signals • Risk optimization
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </PageErrorBoundary>
  );
}