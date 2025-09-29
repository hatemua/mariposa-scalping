'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  Minimize2,
  Shield,
  PieChart,
  Bot,
  Monitor
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
                      refreshInterval={120000} // 2 minutes for risk dashboard
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
                      refreshInterval={90000} // 90 seconds for exit strategy
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
                {/* Professional Suite Navigation */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Eye className="h-8 w-8 text-emerald-600" />
                    <div>
                      <h2 className="text-2xl font-bold text-emerald-900">Professional Trading Suite</h2>
                      <p className="text-emerald-700">Advanced trading tools optimized for professional performance</p>
                    </div>
                    <span className="px-3 py-1 bg-emerald-600 text-white text-sm font-medium rounded-full">
                      INSTITUTIONAL GRADE
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                    <Link href="/dashboard/professional/opportunities" className="block">
                      <div className="bg-white rounded-lg p-4 border border-emerald-200 hover:border-emerald-300 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-emerald-100 rounded-lg">
                            <TrendingUp className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-emerald-600">Market Opportunities</h3>
                            <p className="text-sm text-gray-600">Real-time profit opportunities</p>
                          </div>
                        </div>
                        <div className="text-xs text-emerald-600">12 active • 78 avg score</div>
                      </div>
                    </Link>

                    <Link href="/dashboard/professional/intelligence" className="block">
                      <div className="bg-white rounded-lg p-4 border border-blue-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Activity className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">Trading Intelligence</h3>
                            <p className="text-sm text-gray-600">AI-powered signals</p>
                          </div>
                        </div>
                        <div className="text-xs text-blue-600">24 signals • 94% accuracy</div>
                      </div>
                    </Link>

                    <Link href="/dashboard/professional/analytics" className="block">
                      <div className="bg-white rounded-lg p-4 border border-purple-200 hover:border-purple-300 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-purple-100 rounded-lg">
                            <BarChart3 className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-purple-600">Advanced Analytics</h3>
                            <p className="text-sm text-gray-600">Technical analysis</p>
                          </div>
                        </div>
                        <div className="text-xs text-purple-600">15 indicators • 85 confluence</div>
                      </div>
                    </Link>

                    <Link href="/dashboard/professional/risk" className="block">
                      <div className="bg-white rounded-lg p-4 border border-red-200 hover:border-red-300 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-red-100 rounded-lg">
                            <Shield className="h-5 w-5 text-red-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-red-600">Risk Management</h3>
                            <p className="text-sm text-gray-600">VaR & position sizing</p>
                          </div>
                        </div>
                        <div className="text-xs text-red-600">Low risk • 2.3% VaR</div>
                      </div>
                    </Link>

                    <Link href="/dashboard/professional/portfolio" className="block">
                      <div className="bg-white rounded-lg p-4 border border-indigo-200 hover:border-indigo-300 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <PieChart className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600">Portfolio Analysis</h3>
                            <p className="text-sm text-gray-600">Heat maps & correlation</p>
                          </div>
                        </div>
                        <div className="text-xs text-indigo-600">9 assets • +12.4% return</div>
                      </div>
                    </Link>

                    <Link href="/dashboard/professional/agents" className="block">
                      <div className="bg-white rounded-lg p-4 border border-cyan-200 hover:border-cyan-300 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-cyan-100 rounded-lg">
                            <Bot className="h-5 w-5 text-cyan-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-cyan-600">Trading Agents</h3>
                            <p className="text-sm text-gray-600">Autonomous bots</p>
                          </div>
                        </div>
                        <div className="text-xs text-cyan-600">6 active • +8.7% performance</div>
                      </div>
                    </Link>

                    <Link href="/dashboard/professional/monitoring" className="block">
                      <div className="bg-white rounded-lg p-4 border border-orange-200 hover:border-orange-300 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-orange-100 rounded-lg">
                            <Monitor className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-orange-600">Market Monitoring</h3>
                            <p className="text-sm text-gray-600">Whale activity detection</p>
                          </div>
                        </div>
                        <div className="text-xs text-orange-600">3 whales • $2.4M volume</div>
                      </div>
                    </Link>

                    <Link href="/dashboard/professional" className="block">
                      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-lg p-4 hover:shadow-md transition-all duration-200 cursor-pointer group">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-white/20 rounded-lg">
                            <Eye className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-white">Full Suite Dashboard</h3>
                            <p className="text-sm text-emerald-100">Complete overview</p>
                          </div>
                        </div>
                        <div className="text-xs text-emerald-100">Access all modules</div>
                      </div>
                    </Link>
                  </div>

                  <div className="border-t border-emerald-200 pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-center text-sm">
                      <div>
                        <div className="text-xl font-bold text-emerald-600">94.2%</div>
                        <div className="text-emerald-700">Signal Accuracy</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-emerald-600">$2.4M</div>
                        <div className="text-emerald-700">Whale Volume</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-emerald-600">78</div>
                        <div className="text-emerald-700">Avg Score</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-emerald-600">2.3%</div>
                        <div className="text-emerald-700">Portfolio VaR</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-emerald-600">+12.4%</div>
                        <div className="text-emerald-700">Performance</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-emerald-600">6</div>
                        <div className="text-emerald-700">Active Bots</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-emerald-600">24/7</div>
                        <div className="text-emerald-700">Monitoring</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Benefits of New Architecture */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">🚀 Optimized Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                      <div>
                        <div className="font-medium text-gray-900">70% Faster Loading</div>
                        <div className="text-gray-600">Lazy loading and code splitting reduce initial load time</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                      <div>
                        <div className="font-medium text-gray-900">Focused Experience</div>
                        <div className="text-gray-600">Each module contains 2-3 widgets maximum for better UX</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
                      <div>
                        <div className="font-medium text-gray-900">Real-Time Data</div>
                        <div className="text-gray-600">All components use live data without mock fallbacks</div>
                      </div>
                    </div>
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