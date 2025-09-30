'use client';

import React, { useState, useEffect } from 'react';
import { marketApi, agentApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import { SignalFeedSkeleton } from '@/components/ui/LoadingSkeleton';
import TradingErrorBoundary from '@/components/ui/TradingErrorBoundary';
import AIProcessingIndicator from '@/components/ui/AIProcessingIndicator';
import { useSmartRefresh } from '@/hooks/useSmartRefresh';
import { useComponentRefresh } from '@/contexts/RefreshContext';
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Clock,
  DollarSign,
  Activity,
  RefreshCw,
  Filter,
  Star,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Bell,
  BellOff,
  Settings,
  BarChart3,
  Volume2,
  Brain
} from 'lucide-react';

interface TradingSignal {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: number; // 1-100
  confidence: number; // 0-1
  timeframe: string;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  expectedReturn: number;
  category: 'BREAKOUT' | 'REVERSAL' | 'MOMENTUM' | 'CONFLUENCE' | 'WHALE' | 'AI_PREDICTION';
  indicators: {
    rsi: number;
    macd: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    ema: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volume: 'HIGH' | 'MEDIUM' | 'LOW';
    support: boolean;
    resistance: boolean;
  };
  reasoning: string;
  timestamp: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source: 'AI_ANALYSIS' | 'TECHNICAL_SCAN' | 'WHALE_DETECTION' | 'CONFLUENCE_SCORE' | 'MULTI_TF' | 'AI_AGENT';
  marketCondition: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CONSOLIDATING';
  followUp: {
    checkIn: string; // Time to re-evaluate
    exitStrategy: string;
    riskManagement: string;
  };
  agentData?: {
    agentName: string;
    llmConsensus: Record<string, string>;
    confidenceLevel: number;
  };
  advancedLLMData?: {
    llmConsensus: Record<string, any>;
    actionPlan: any;
    opportunitySignals: any[];
    marketContext: any;
    confidenceLevel: number;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

interface ProfessionalSignalFeedProps {
  symbols?: string[];
  maxSignals?: number;
  minStrength?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableNotifications?: boolean;
  className?: string;
}

const SIGNAL_COLORS = {
  BUY: 'text-green-600 bg-green-50 border-green-200',
  SELL: 'text-red-600 bg-red-50 border-red-200',
  HOLD: 'text-gray-600 bg-gray-50 border-gray-200'
};

const PRIORITY_COLORS = {
  LOW: 'text-blue-600 bg-blue-50',
  MEDIUM: 'text-yellow-600 bg-yellow-50',
  HIGH: 'text-orange-600 bg-orange-50',
  CRITICAL: 'text-red-600 bg-red-50'
};

const CATEGORY_ICONS = {
  BREAKOUT: ArrowUpRight,
  REVERSAL: TrendingUp,
  MOMENTUM: Zap,
  CONFLUENCE: Target,
  WHALE: Eye,
  AI_PREDICTION: Brain
};

function ProfessionalSignalFeed({
  symbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT' // Reduced to 6 high-volume symbols
  ],
  maxSignals = 20,
  minStrength = 60,
  autoRefresh = false, // Disabled by default for manual control
  refreshInterval = 60000,
  enableNotifications = true,
  className = ''
}: ProfessionalSignalFeedProps) {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(false); // Changed to false for lazy loading
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(enableNotifications);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState<Date | null>(null);
  // Removed WebSocket-related state variables - using direct API calls instead
  const [hasInitialized, setHasInitialized] = useState(false);
  const [cachedSignals, setCachedSignals] = useState<TradingSignal[]>([]);
  const [cacheTimestamp, setCacheTimestamp] = useState<Date | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Debug state tracking
  const [debugInfo, setDebugInfo] = useState<any>({
    apiCalls: [],
    lastAnalysis: null,
    errorCount: 0
  });

  // Simple logging function
  const logDebug = (category: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[${category}] ${timestamp}: ${message}`, data || '');

    setDebugInfo((prev: any) => ({
      ...prev,
      apiCalls: [
        ...(prev.apiCalls || []),
        { timestamp, category, message, data }
      ].slice(-20) // Keep last 20 entries
    }));
  };




  // Simplified state management - no complex job tracking needed

  const generateRealTradingSignals = async (): Promise<TradingSignal[]> => {
    try {
      console.log('🚀 Starting advanced multi-LLM analysis...');
      logDebug('API', 'Calling advanced LLM analysis', { symbols, minStrength });

      // Call the existing professional signals endpoint with enhanced LLM integration
      const analysisResponse = await marketApi.getProfessionalSignals(symbols, minStrength);

      if (!analysisResponse.success) {
        console.warn('❌ Professional signals API failed:', analysisResponse.error);
        throw new Error(analysisResponse.error || 'Failed to fetch professional signals');
      }

      const signalsData = analysisResponse.data?.signals || [];
      console.log(`✅ Received ${signalsData.length} professional signals from API`);

      if (signalsData.length === 0) {
        console.warn('⚠️ No signals returned from professional signals API');
        return [];
      }

      // Convert professional signals to frontend format
      const signals = convertProfessionalSignalsToTradingSignals(signalsData);

      console.log(`🎯 Generated ${signals.length} enhanced trading signals with 4-LLM consensus`);

      return signals
        .sort((a, b) => {
          const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
          }
          return b.strength - a.strength;
        })
        .slice(0, maxSignals);

    } catch (error) {
      console.error('❌ Error in advanced LLM analysis:', error);
      logDebug('API', 'Advanced LLM analysis error', { error: error instanceof Error ? error.message : String(error) });

      // Fallback: Return empty array to show error message
      return [];
    }
  };

  // Convert professional signals response to trading signals
  const convertProfessionalSignalsToTradingSignals = (signalsData: any[]): TradingSignal[] => {
    return signalsData.map((signal: any) => {
      // Use currentPrice from API if available, otherwise fallback to entryZone.min
      const currentPrice = signal.currentPrice || signal.entryZone?.min || 0;
      const entryPrice = signal.entryZone?.min || currentPrice;
      const targetPrice = signal.targets?.[0] || 0;
      const stopLossPrice = signal.stopLoss || 0;
      const riskReward = targetPrice && stopLossPrice && entryPrice ?
        Math.abs(targetPrice - entryPrice) / Math.abs(entryPrice - stopLossPrice) : 1;

      console.log(`📊 Signal for ${signal.symbol}: CurrentPrice=${currentPrice}, Entry=${entryPrice}, Target=${targetPrice}, Stop=${stopLossPrice}`);

      const tradingSignal: TradingSignal = {
        id: `prof-${signal.symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        symbol: signal.symbol,
        type: signal.action as 'BUY' | 'SELL' | 'HOLD',
        strength: signal.strength || 75,
        confidence: signal.confidence || 0.75,
        timeframe: signal.timeHorizon === 'SCALP' ? '5m' : signal.timeHorizon === 'SWING' ? '1h' : '4h',
        entry: entryPrice,
        target: targetPrice,
        stopLoss: stopLossPrice,
        riskReward: riskReward,
        expectedReturn: entryPrice > 0 ? ((targetPrice - entryPrice) / entryPrice) * 100 : 0,
        category: signal.type === 'REVERSAL' ? 'REVERSAL' :
                 signal.type === 'BREAKOUT' ? 'BREAKOUT' :
                 signal.type === 'MOMENTUM' ? 'MOMENTUM' : 'AI_PREDICTION',
        indicators: {
          rsi: signal.indicators?.rsi || 50,
          macd: signal.indicators?.macd?.histogram > 0 ? 'BULLISH' : 'BEARISH',
          ema: signal.indicators?.ema20 ? 'BULLISH' : 'BEARISH',
          volume: signal.indicators?.volume24h > 50000000 ? 'HIGH' : 'MEDIUM',
          support: true,
          resistance: true
        },
        reasoning: signal.reasoning || `${signal.type} signal with ${signal.strength}% strength`,
        timestamp: signal.timestamp || new Date().toISOString(),
        priority: signal.strength > 85 ? 'HIGH' :
                 signal.strength > 75 ? 'MEDIUM' : 'LOW',
        source: signal.advancedLLMData ? 'AI_AGENT' : 'TECHNICAL_SCAN',
        marketCondition: signal.indicators?.priceChange24h > 3 ? 'TRENDING' :
                        signal.indicators?.priceChange24h < -3 ? 'TRENDING' : 'RANGING',
        followUp: {
          checkIn: signal.timeHorizon === 'SCALP' ? '15 minutes' :
                   signal.timeHorizon === 'SWING' ? '2 hours' : '6 hours',
          exitStrategy: signal.targets?.length > 1 ?
                       `Scale out at ${signal.targets.length} target levels` :
                       'Take profit at target level',
          riskManagement: `Stop loss: ${((Math.abs(entryPrice - stopLossPrice) / entryPrice) * 100).toFixed(1)}%`
        },
        // Enhanced data for LLM analysis (if available)
        advancedLLMData: signal.advancedLLMData || null
      };

      return tradingSignal;
    }).filter(signal => signal.entry > 0 && signal.target > 0); // Filter out invalid signals
  };

  // Old reasoning functions removed - signals now come with reasoning from API/agent


  // Health check monitoring
  // Removed all WebSocket and job-related functions - using direct API calls instead

  const fetchSignals = async () => {
    try {
      setLoading(true);
      setError(null);
      setHasInitialized(true);

      console.log('🚀 Starting direct API analysis for symbols:', symbols);

      // Use the working generateRealTradingSignals function
      const newSignals = await generateRealTradingSignals();

      if (newSignals.length > 0) {
        setSignals(newSignals);
        setCachedSignals(newSignals);
        setCacheTimestamp(new Date());
        setLastUpdate(new Date());

        // Show notifications for critical signals
        if (notificationsEnabled) {
          const criticalSignals = newSignals.filter((s: TradingSignal) => s.priority === 'CRITICAL');
          criticalSignals.forEach((signal: TradingSignal) => {
            toast.success(`🚨 CRITICAL: ${signal.type} signal for ${signal.symbol.replace('USDT', '')}`, {
              duration: 5000
            });
          });
        }

        console.log(`✅ Analysis completed with ${newSignals.length} signals`);
      } else {
        console.log('⚠️ No signals generated - API may have returned empty/invalid data');
        setError('No signals generated - check API connectivity');
      }
    } catch (err) {
      console.error('Error in fetchSignals:', err);

      let errorMessage = 'Failed to generate signals';
      if (err instanceof Error) {
        if (err.message.includes('fetch') || err.message.includes('NetworkError')) {
          errorMessage = 'Network error: Cannot connect to API service';
        } else {
          errorMessage = `API error: ${err.message}`;
        }
      }

      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Simple refresh function - no job protection needed
  const refreshSignals = async () => {
    await fetchSignals();
  };

  // Smart refresh integration - simplified
  const { enabled: refreshEnabled, interval: effectiveInterval, refreshFn } = useComponentRefresh(
    'ProfessionalSignalFeed',
    refreshInterval,
    refreshSignals
  );

  const smartRefresh = useSmartRefresh({
    refreshFn: refreshSignals,
    interval: effectiveInterval,
    enabled: autoRefresh, // Use the autoRefresh prop
    pauseOnHover: true,
    pauseOnFocus: true,
    pauseOnInteraction: true,
    interactionPauseDuration: 15000,
  });

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  // Simple component initialization - load cached signals on mount
  useEffect(() => {
    loadCachedSignals();
  }, []);

  // Load cache when dependencies change
  useEffect(() => {
    if (hasInitialized) {
      loadCachedSignals();
    }
  }, [symbols, minStrength]);

  // Simple manual refresh function
  const handleManualRefresh = () => {
    refreshSignals();
  };

  // Start analysis manually
  const handleStartAnalysis = () => {
    if (isAIProcessing) {
      console.log('⚠️ Analysis already in progress');
      return;
    }
    fetchSignals();
  };

  // Load cached signals if available and recent
  const loadCachedSignals = () => {
    if (cachedSignals.length > 0 && cacheTimestamp) {
      const cacheAge = Date.now() - cacheTimestamp.getTime();
      const cacheValidityMs = 5 * 60 * 1000; // 5 minutes

      if (cacheAge < cacheValidityMs) {
        setSignals(cachedSignals);
        setLastUpdate(cacheTimestamp);
        console.log(`📦 Loaded ${cachedSignals.length} cached signals (${Math.round(cacheAge / 1000)}s old)`);
        return true;
      } else {
        console.log('💾 Cache expired, clearing old signals');
        setCachedSignals([]);
        setCacheTimestamp(null);
      }
    }
    return false;
  };

  // Check if we have recent data
  const hasRecentData = () => {
    return signals.length > 0 && lastUpdate && (Date.now() - lastUpdate.getTime()) < 10 * 60 * 1000; // 10 minutes
  };

  // No cancellation needed with direct API calls

  // Simple reset function for clearing errors and cache
  const handleForceReset = async () => {
    logDebug('STATE', 'Clearing all state and cache');

    setError(null);
    setLoading(false);
    setSignals([]);
    setCachedSignals([]);
    setCacheTimestamp(null);
    setLastUpdate(null);
    setIsAIProcessing(false);
    setProcessingStartTime(null);

    // Clear any old job state from previous version
    localStorage.removeItem('currentAnalysisJob');

    // Reset debug info
    setDebugInfo({
      apiCalls: [],
      lastAnalysis: null,
      errorCount: 0
    });

    toast.success('System reset successfully');
    console.log('🔄 Simple reset completed');
  };

  // No stuck detection needed with direct API calls

  const filteredSignals = signals.filter(signal => {
    if (selectedCategory && signal.category !== selectedCategory) return false;
    if (selectedPriority && signal.priority !== selectedPriority) return false;
    return true;
  });

  return (
    <div ref={smartRefresh.elementRef} className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Professional Signal Feed</h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {filteredSignals.length} active signals •
                {isAIProcessing ? (
                  <span className="text-orange-600 font-medium">
                    🔒 Analysis protected from refresh
                  </span>
                ) : (
                  'Direct API analysis'
                )} •
                <span className={`font-medium ${error ? 'text-red-600' : signals.length > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                  {error ? '🔴 API Error' : signals.length > 0 ? '🟢 Ready' : '⚪ Standby'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`p-2 rounded-lg transition-colors ${
                notificationsEnabled
                  ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title={notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications'}
            >
              {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>

            {/* Start Analysis Button */}
            {!hasInitialized || (!isAIProcessing && !hasRecentData()) ? (
              <button
                onClick={handleStartAnalysis}
                disabled={loading || isAIProcessing}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                title="Start AI Analysis (30-45 seconds)"
              >
                <Brain className="h-3 w-3" />
                {loading ? 'Starting...' : 'Start Analysis'}
              </button>
            ) : (
              <button
                onClick={handleManualRefresh}
                disabled={smartRefresh.isRefreshing || isAIProcessing}
                className={`p-2 rounded-lg transition-colors ${
                  isAIProcessing
                    ? 'text-orange-600 bg-orange-50 cursor-not-allowed'
                    : smartRefresh.isPaused
                    ? 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                }`}
                title={
                  isAIProcessing
                    ? 'Refresh blocked - Analysis in progress'
                    : smartRefresh.isPaused
                    ? 'Refresh Paused (Interacting)'
                    : 'Manual Refresh'
                }
              >
                <RefreshCw className={`h-4 w-4 ${smartRefresh.isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}

            {lastUpdate && (
              <div className="text-xs text-gray-500">
                Updated {lastUpdate.toLocaleTimeString()}
                {smartRefresh.isPaused && (
                  <span className="ml-1 text-yellow-600">(Paused)</span>
                )}
                {cacheTimestamp && (
                  <span className="ml-1 text-blue-600 opacity-75">💾</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="">All Categories</option>
            <option value="BREAKOUT">Breakout</option>
            <option value="REVERSAL">Reversal</option>
            <option value="MOMENTUM">Momentum</option>
            <option value="CONFLUENCE">Confluence</option>
            <option value="WHALE">Whale</option>
            <option value="AI_PREDICTION">AI Prediction</option>
          </select>

          <select
            value={selectedPriority || ''}
            onChange={(e) => setSelectedPriority(e.target.value || null)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {loading && (
          <div className="mb-4 space-y-3">
            {/* Main Loading Status */}
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
                <span className="text-blue-800 font-medium text-sm">
                  📊 Analyzing market data via professional signals API...
                </span>
              </div>
            </div>

            {/* Advanced Multi-LLM Processing Status */}
            <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse"></div>
                  <span className="text-purple-800 font-medium text-sm">
                    🧠 Advanced 4-LLM Analysis in Progress
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-purple-700">
                    TogetherAI Multi-Model Consensus
                  </div>
                </div>
              </div>

              {/* 4-LLM Model Status Indicators */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-purple-700">Llama-3.1-8B-Turbo</span>
                  <span className="text-xs text-purple-600">(Fast)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-purple-700">Llama-3.1-70B-Turbo</span>
                  <span className="text-xs text-purple-600">(Deep)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-purple-700">Mixtral-8x7B</span>
                  <span className="text-xs text-purple-600">(Pattern)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-purple-700">Llama-3.1-405B</span>
                  <span className="text-xs text-purple-600">(Master)</span>
                </div>
              </div>

              <div className="mt-2 text-center">
                <div className="text-xs text-purple-600">
                  Generating consensus & action plans...
                </div>
              </div>
            </div>

            {/* Binance Data Integration Status */}
            <div className="bg-orange-50 border-l-4 border-orange-400 p-3 rounded">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse"></div>
                <span className="text-orange-800 font-medium text-sm">
                  🔗 Integrating real-time Binance market data
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Debug Panel */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-md hover:bg-gray-200 transition-colors"
              title="Toggle debug information"
            >
              🔍 Debug Info {showDebugPanel ? '▼' : '▶'}
            </button>
            <div className="text-xs text-gray-500">
              Loading: {loading ? '✅' : '❌'} |
              Signals: {signals.length} |
              Error: {error ? '🔴' : '🟢'} |
              API Calls: {debugInfo.apiCalls?.length || 0}
            </div>
          </div>

          {showDebugPanel && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Current State */}
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">Current State</h4>
                  <div className="text-xs space-y-1">
                    <div><span className="font-medium">Loading:</span> {loading ? '✅' : '❌'}</div>
                    <div><span className="font-medium">Signals:</span> {signals.length}</div>
                    <div><span className="font-medium">Cache:</span> {cachedSignals.length} signals</div>
                    <div><span className="font-medium">Error:</span> {error || 'None'}</div>
                    <div><span className="font-medium">Last Update:</span> {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}</div>
                    <div><span className="font-medium">API Calls:</span> {debugInfo.apiCalls?.length || 0}</div>
                  </div>
                </div>

                {/* Recent API Calls */}
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">Recent API Calls</h4>
                  <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                    {debugInfo.apiCalls?.slice(-5).reverse().map((call: any, i: number) => (
                      <div key={i} className="border-b border-gray-100 pb-1">
                        <div className="font-medium text-blue-600">{call.message}</div>
                        <div className="text-gray-500">{new Date(call.timestamp).toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Component Health */}
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">Component Health</h4>
                  <div className="text-xs space-y-1">
                    <div><span className="font-medium">Status:</span> {error ? '🔴 Error' : signals.length > 0 ? '🟢 Active' : '🟡 Ready'}</div>
                    <div><span className="font-medium">Cache Age:</span> {cacheTimestamp ? Math.round((Date.now() - cacheTimestamp.getTime()) / 1000) + 's' : 'N/A'}</div>
                    <div><span className="font-medium">Auto Refresh:</span> {autoRefresh ? '✅' : '❌'}</div>
                  </div>
                </div>
              </div>

              {/* System Information */}
              {lastUpdate && (
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">Last Analysis</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="font-medium">Time:</span><br />
                      {lastUpdate.toLocaleTimeString()}
                    </div>
                    <div>
                      <span className="font-medium">Signals:</span><br />
                      {signals.length} found
                    </div>
                    <div>
                      <span className="font-medium">Symbols:</span><br />
                      {symbols.length}
                    </div>
                    <div>
                      <span className="font-medium">Cache Valid:</span><br />
                      {hasRecentData() ? '✅' : '❌'}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="bg-white rounded p-3 border">
                <h4 className="font-medium text-gray-900 mb-2">Debug Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => console.log('Current debug state:', debugInfo)}
                    className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded hover:bg-blue-200"
                  >
                    Log Debug State
                  </button>
                  <button
                    onClick={() => {
                      setDebugInfo({
                        stateChanges: [],
                        webSocketEvents: [],
                        timeouts: [],
                        lastHealthCheck: null,
                        recoveryAttempts: 0
                      });
                    }}
                    className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded hover:bg-yellow-200"
                  >
                    Clear Debug Logs
                  </button>
                  <button
                    onClick={handleForceReset}
                    className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200"
                  >
                    Emergency Reset
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading && signals.length === 0 ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 bg-gray-200 rounded"></div>
                    <div className="w-16 h-4 bg-gray-200 rounded"></div>
                    <div className="w-12 h-4 bg-gray-200 rounded-full"></div>
                  </div>
                  <div className="w-20 h-4 bg-gray-200 rounded"></div>
                </div>
                <div className="space-y-2 mb-3">
                  <div className="w-full h-3 bg-gray-200 rounded"></div>
                  <div className="w-3/4 h-3 bg-gray-200 rounded"></div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="space-y-1">
                      <div className="w-full h-3 bg-gray-200 rounded"></div>
                      <div className="w-3/4 h-4 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !hasInitialized && signals.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Brain className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <h4 className="text-lg font-medium text-gray-700 mb-2">Ready to Analyze Markets</h4>
            <p className="text-sm mb-4">Click "Start Analysis" to begin AI-powered signal generation</p>
            <div className="space-y-2 text-xs text-gray-600">
              <div>• Analyzes {symbols.length} high-volume symbols</div>
              <div>• Uses multi-timeframe confluence</div>
              <div>• Completes in 30-45 seconds</div>
              <div>• Filters signals by {minStrength}% minimum strength</div>
            </div>
            <button
              onClick={handleStartAnalysis}
              disabled={loading || isAIProcessing}
              className="mt-6 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 mx-auto"
            >
              <Brain className="h-4 w-4" />
              {loading ? 'Starting Analysis...' : 'Start AI Analysis'}
            </button>
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Zap className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No signals match your criteria</p>
            <p className="text-sm mt-1">Adjust filters or start a new analysis</p>
            {hasInitialized && (
              <button
                onClick={handleStartAnalysis}
                disabled={loading || isAIProcessing}
                className="mt-3 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1 mx-auto"
              >
                <Brain className="h-3 w-3" />
                New Analysis
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSignals.map((signal) => {
              const CategoryIcon = CATEGORY_ICONS[signal.category];
              const SignalIcon = signal.type === 'BUY' ? TrendingUp :
                                signal.type === 'SELL' ? TrendingDown : Minus;

              return (
                <div key={signal.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex items-center gap-1">
                        <CategoryIcon className="h-4 w-4 text-gray-600" />
                        <SignalIcon className={`h-5 w-5 ${
                          signal.type === 'BUY' ? 'text-green-600' :
                          signal.type === 'SELL' ? 'text-red-600' : 'text-gray-600'
                        }`} />
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{signal.symbol.replace('USDT', '')}</span>

                          {/* Enhanced BUY/SELL Action Indicator */}
                          <div className={`px-3 py-1 text-sm font-bold rounded-lg shadow-sm border-2 ${
                            signal.type === 'BUY'
                              ? 'bg-green-50 text-green-800 border-green-300 shadow-green-100'
                              : signal.type === 'SELL'
                              ? 'bg-red-50 text-red-800 border-red-300 shadow-red-100'
                              : 'bg-yellow-50 text-yellow-800 border-yellow-300 shadow-yellow-100'
                          }`}>
                            {signal.type === 'BUY' ? '🚀 BUY' : signal.type === 'SELL' ? '📉 SELL' : '⏸️ HOLD'}
                          </div>

                          {/* Advanced 4-LLM Consensus Indicator */}
                          {signal.advancedLLMData?.llmConsensus && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-purple-50 rounded-lg border border-purple-200">
                              <span className="text-xs text-purple-700 font-medium">🧠 4-LLM Consensus</span>
                              <div className="flex gap-1">
                                {Object.entries(signal.advancedLLMData.llmConsensus).map(([model, analysis]) => {
                                  const signal_type = analysis?.signal || analysis?.recommendation || 'HOLD';
                                  const modelName = model.includes('llama') && model.includes('8') ? '8B' :
                                                  model.includes('llama') && model.includes('70') ? '70B' :
                                                  model.includes('llama') && model.includes('405') ? '405B' :
                                                  model.includes('mixtral') ? 'MX' : model.slice(0, 2).toUpperCase();
                                  return (
                                    <span
                                      key={model}
                                      className={`px-1 py-0.5 text-xs font-medium rounded ${
                                        signal_type === 'BUY' ? 'bg-green-500 text-white' :
                                        signal_type === 'SELL' ? 'bg-red-500 text-white' : 'bg-yellow-500 text-white'
                                      }`}
                                      title={`${modelName}: ${signal_type} (${Math.round((analysis?.confidence || 0) * 100)}%)`}
                                    >
                                      {modelName}
                                    </span>
                                  );
                                })}
                              </div>
                              {signal.advancedLLMData.urgency && (
                                <span className={`px-1 py-0.5 text-xs font-bold rounded ${
                                  signal.advancedLLMData.urgency === 'HIGH' ? 'bg-red-100 text-red-700' :
                                  signal.advancedLLMData.urgency === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {signal.advancedLLMData.urgency}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Fallback for old agentData format */}
                          {!signal.advancedLLMData?.llmConsensus && signal.agentData?.llmConsensus && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-lg border border-blue-200">
                              <span className="text-xs text-blue-700 font-medium">🤖 LLM Consensus</span>
                              <div className="flex gap-1">
                                {Object.entries(signal.agentData.llmConsensus).map(([model, recommendation]) => (
                                  <span
                                    key={model}
                                    className={`w-2 h-2 rounded-full ${
                                      recommendation === 'BUY' ? 'bg-green-500' :
                                      recommendation === 'SELL' ? 'bg-red-500' : 'bg-yellow-500'
                                    }`}
                                    title={`${model}: ${recommendation}`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${PRIORITY_COLORS[signal.priority]}`}>
                            {signal.priority}
                          </span>
                          <span className="text-xs text-gray-500">{signal.timeframe}</span>
                        </div>

                        <p className="text-sm text-gray-600 mb-2">{signal.reasoning}</p>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-xs mb-2">
                          <div>
                            <span className="text-gray-500">Strength</span>
                            <div className="font-semibold text-blue-600">{signal.strength}/100</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Confidence</span>
                            <div className="font-semibold text-purple-600">{safeNumber.toFixed((signal.confidence || 0) * 100, 0)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Expected Return</span>
                            <div className="font-semibold text-green-600">+{safeNumber.toFixed(signal.expectedReturn, 1)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Risk/Reward</span>
                            <div className="font-semibold text-orange-600">{safeNumber.toFixed(signal.riskReward, 2)}:1</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Source</span>
                            <div className="font-semibold text-gray-600">{signal.source.replace('_', ' ')}</div>
                          </div>
                        </div>

                        {/* Levels */}
                        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                          <div>
                            <span className="text-gray-500">Entry</span>
                            <div className="font-semibold">${safeNumber.toFixed(signal.entry, 4)}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Target</span>
                            <div className="font-semibold text-green-600">${safeNumber.toFixed(signal.target, 4)}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Stop</span>
                            <div className="font-semibold text-red-600">${safeNumber.toFixed(signal.stopLoss, 4)}</div>
                          </div>
                        </div>

                        {/* Advanced Action Plan */}
                        {signal.advancedLLMData?.actionPlan && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                            <h4 className="text-xs font-semibold text-blue-800 mb-2">🎯 Action Plan</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                              {signal.advancedLLMData.actionPlan.target_prices?.length > 1 && (
                                <div>
                                  <span className="text-blue-600 font-medium">Multiple Targets:</span>
                                  <div className="text-blue-700">
                                    {signal.advancedLLMData.actionPlan.target_prices.map((price: number, idx: number) => (
                                      <span key={idx}>${safeNumber.toFixed(price, 2)}{idx < (signal.advancedLLMData?.actionPlan?.target_prices?.length || 0) - 1 ? ', ' : ''}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {signal.advancedLLMData.actionPlan.position_size && (
                                <div>
                                  <span className="text-blue-600 font-medium">Position Size:</span>
                                  <div className="text-blue-700">{signal.advancedLLMData.actionPlan.position_size}</div>
                                </div>
                              )}
                              {signal.advancedLLMData.actionPlan.time_horizon && (
                                <div>
                                  <span className="text-blue-600 font-medium">Time Horizon:</span>
                                  <div className="text-blue-700">{signal.advancedLLMData.actionPlan.time_horizon}</div>
                                </div>
                              )}
                              {signal.advancedLLMData.actionPlan.risk_reward && (
                                <div>
                                  <span className="text-blue-600 font-medium">Risk/Reward:</span>
                                  <div className="text-blue-700">{safeNumber.toFixed(signal.advancedLLMData.actionPlan.risk_reward, 1)}:1</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Opportunity Signals */}
                        {(signal.advancedLLMData?.opportunitySignals?.length || 0) > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <h4 className="text-xs font-semibold text-green-800 mb-2">⚡ Opportunity Signals</h4>
                            <div className="space-y-1">
                              {signal.advancedLLMData?.opportunitySignals?.slice(0, 2).map((opportunity: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1">
                                    <span className={`w-2 h-2 rounded-full ${
                                      opportunity.probability > 0.8 ? 'bg-green-500' :
                                      opportunity.probability > 0.6 ? 'bg-yellow-500' : 'bg-orange-500'
                                    }`}></span>
                                    <span className="text-green-700 font-medium">{opportunity.type}:</span>
                                    <span className="text-green-600">{opportunity.description}</span>
                                  </div>
                                  <span className="text-green-800 font-semibold">
                                    {Math.round(opportunity.probability * 100)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right text-xs text-gray-500">
                      <div>{formatTimeAgo(signal.timestamp)}</div>
                      <div className="mt-1">Check in {signal.followUp.checkIn}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// Wrap component with error boundary
export default function ProfessionalSignalFeedWithErrorBoundary(props: ProfessionalSignalFeedProps) {
  return (
    <TradingErrorBoundary
      componentName="Professional Signal Feed"
      fallbackComponent="compact"
    >
      <ProfessionalSignalFeed {...props} />
    </TradingErrorBoundary>
  );
}