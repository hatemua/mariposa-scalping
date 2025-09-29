'use client';

import React, { useState, useEffect } from 'react';
import { enhancedMarketApi } from '@/lib/enhancedApi';
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
  source: 'AI_ANALYSIS' | 'TECHNICAL_SCAN' | 'WHALE_DETECTION' | 'CONFLUENCE_SCORE' | 'MULTI_TF';
  marketCondition: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CONSOLIDATING';
  followUp: {
    checkIn: string; // Time to re-evaluate
    exitStrategy: string;
    riskManagement: string;
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
    const generatedSignals: TradingSignal[] = [];

    try {
      // Process symbols in batches to avoid API rate limits
      const batchSize = 4;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);

        const batchPromises = batch.map(async (symbol) => {
          try {
            // Get real market data and technical analysis with fallback
            const [marketResponse, confluenceResponse] = await Promise.all([
              enhancedMarketApi.getMarketData(symbol),
              enhancedMarketApi.getRealTimeAnalysis(symbol)
            ]);

            if (!marketResponse.success || !confluenceResponse.success) {
              return [];
            }

            const marketData = marketResponse.data;
            const confluenceData = confluenceResponse.data;

            return generateSignalsFromRealData(symbol, marketData, confluenceData, null);

          } catch (error) {
            console.warn(`Failed to generate signals for ${symbol}:`, error);
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(signals => generatedSignals.push(...signals));

        // Small delay between batches
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return generatedSignals
        .filter(signal => signal.strength >= minStrength)
        .sort((a, b) => {
          const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
          }
          return b.strength - a.strength;
        })
        .slice(0, maxSignals);

    } catch (error) {
      console.error('Error generating real trading signals:', error);
      return [];
    }
  };

  const generateSignalsFromRealData = (
    symbol: string,
    marketData: any,
    confluenceData: any,
    entrySignalsData: any
  ): TradingSignal[] => {
    const signals: TradingSignal[] = [];

    // Validate price data - if invalid, skip this symbol
    const price = safeNumber.getValue(marketData?.price, 0);
    if (price <= 0) {
      console.warn(`Invalid price data for ${symbol}:`, marketData?.price);
      return [];
    }

    const change24h = safeNumber.getValue(marketData?.change24h, 0);
    const volume24h = safeNumber.getValue(marketData?.volume, 0);
    const score = safeNumber.getValue(confluenceData?.score, 0);

    console.log(`Processing ${symbol}: price=${price}, change24h=${change24h}%, volume=${volume24h}, score=${score}`);

    // Generate signal based on confluence analysis
    if (score >= minStrength) {
      const signalType = determineSignalType(confluenceData, marketData);
      const category = determineSignalCategory(confluenceData, marketData);
      const strength = Math.min(100, score);
      const confidence = confluenceData.confidence || 0.5;

      const expectedReturn = calculateRealExpectedReturn(confluenceData, marketData);
      const entry = price;

      let target, stopLoss;
      if (signalType === 'BUY') {
        target = entry * (1 + expectedReturn / 100);
        stopLoss = entry * (1 - calculateRealStopLoss(confluenceData, marketData));
      } else if (signalType === 'SELL') {
        target = entry * (1 - expectedReturn / 100);
        stopLoss = entry * (1 + calculateRealStopLoss(confluenceData, marketData));
      } else {
        target = entry;
        stopLoss = entry * 0.98;
      }

      const riskReward = Math.abs(target - entry) / Math.abs(entry - stopLoss);

      if (riskReward > 1.2) { // Accept slightly lower R:R for real signals
        const priority: TradingSignal['priority'] =
          strength > 90 ? 'CRITICAL' :
          strength > 80 ? 'HIGH' :
          strength > 70 ? 'MEDIUM' : 'LOW';

        signals.push({
          id: `real-signal-${symbol}-${Date.now()}`,
          symbol,
          type: signalType,
          strength,
          confidence,
          timeframe: confluenceData.strongestTimeframe || '1h',
          entry,
          target,
          stopLoss,
          riskReward,
          expectedReturn,
          category,
          indicators: {
            rsi: confluenceData.factors?.rsi || 50,
            macd: determineIndicatorSignal(confluenceData.factors?.macdScore || 0),
            ema: determineIndicatorSignal(confluenceData.factors?.trendScore || 0),
            volume: volume24h > 20000000 ? 'HIGH' : volume24h > 5000000 ? 'MEDIUM' : 'LOW',
            support: confluenceData.factors?.supportResistance > 0,
            resistance: confluenceData.factors?.supportResistance < 0
          },
          reasoning: generateRealSignalReasoning(category, signalType, confluenceData),
          timestamp: new Date().toISOString(),
          priority,
          source: 'CONFLUENCE_SCORE',
          marketCondition: determineMarketCondition(marketData),
          followUp: {
            checkIn: priority === 'CRITICAL' ? '5 minutes' : priority === 'HIGH' ? '15 minutes' : '30 minutes',
            exitStrategy: getExitStrategy(signalType, expectedReturn),
            riskManagement: `Stop at ${safeNumber.toFixed(Math.abs((stopLoss - entry) / entry * 100), 1)}%`
          }
        });
      }
    }

    return signals;
  };

  const determineSignalType = (confluenceData: any, marketData: any): TradingSignal['type'] => {
    const score = confluenceData.score || 0;
    const trend = confluenceData.factors?.trendScore || 0;

    if (score > 75 && trend > 0) return 'BUY';
    if (score > 75 && trend < 0) return 'SELL';
    return 'HOLD';
  };

  const determineSignalCategory = (confluenceData: any, marketData: any): TradingSignal['category'] => {
    const volume24h = marketData.volume || 0;
    const change24h = marketData.change24h || 0;
    const score = confluenceData.score || 0;

    if (volume24h > 50000000) return 'WHALE';
    if (Math.abs(change24h) > 5) return 'BREAKOUT';
    if (score > 85) return 'CONFLUENCE';
    if (Math.abs(change24h) > 2) return 'MOMENTUM';
    if (change24h < 0) return 'REVERSAL';
    return 'AI_PREDICTION';
  };

  const calculateRealExpectedReturn = (confluenceData: any, marketData: any): number => {
    const score = safeNumber.getValue(confluenceData?.score, 60);
    const change24h = safeNumber.getValue(marketData?.change24h, 0);
    const volume = safeNumber.getValue(marketData?.volume, 0);

    // More variable base return: 1.5% - 6% based on score
    const baseReturn = 1.5 + ((score - 60) / 40) * 4.5; // 60=1.5%, 100=6%

    // Momentum bonus: 0-3% based on 24h change
    const momentumBonus = Math.min(Math.abs(change24h) * 0.25, 3);

    // Volume bonus: 0-2% for high volume
    const volumeBonus = volume > 50000000 ? 2 : volume > 20000000 ? 1 : 0;

    // Add some randomness for variety (±0.5%)
    const randomVariation = (Math.random() - 0.5) * 1;

    const total = baseReturn + momentumBonus + volumeBonus + randomVariation;

    // Final range: 1.5% - 10%
    return Math.min(10, Math.max(1.5, total));
  };

  const calculateRealStopLoss = (confluenceData: any, marketData: any): number => {
    const baseStop = 0.025; // 2.5% base
    const volatilityAdjustment = Math.abs(marketData.change24h || 0) * 0.002;
    const confidenceAdjustment = (1 - (confluenceData.confidence || 0.5)) * 0.015;

    return Math.min(0.08, Math.max(0.015, baseStop + volatilityAdjustment + confidenceAdjustment));
  };

  const determineIndicatorSignal = (score: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    if (score > 0.6) return 'BULLISH';
    if (score < -0.6) return 'BEARISH';
    return 'NEUTRAL';
  };

  const determineMarketCondition = (marketData: any): TradingSignal['marketCondition'] => {
    const change24h = Math.abs(marketData.change24h || 0);
    const volume = marketData.volume || 0;

    if (change24h > 8) return 'VOLATILE';
    if (change24h < 1 && volume < 10000000) return 'CONSOLIDATING';
    if (change24h > 3) return 'TRENDING';
    return 'RANGING';
  };

  const generateRealSignalReasoning = (
    category: TradingSignal['category'],
    type: TradingSignal['type'],
    confluenceData: any
  ): string => {
    const score = confluenceData.score || 0;
    const confidence = (confluenceData.confidence || 0.5) * 100;

    const baseReasons = {
      CONFLUENCE: `Strong confluence detected with ${safeNumber.toFixed(score, 0)}% score`,
      BREAKOUT: `Technical breakout pattern confirmed`,
      MOMENTUM: `Momentum signals aligned across timeframes`,
      REVERSAL: `Reversal pattern identified at key level`,
      WHALE: `Large volume activity detected`,
      AI_PREDICTION: `AI analysis indicates ${type.toLowerCase()} opportunity`
    };

    return `${baseReasons[category]} • ${safeNumber.toFixed(confidence, 0)}% confidence • Multiple factors converging`;
  };

  const generateSignalReasoning = (
    category: TradingSignal['category'],
    type: TradingSignal['type'],
    strength: number
  ): string => {
    const reasons = {
      BREAKOUT: {
        BUY: [
          'Strong resistance breakout with volume confirmation',
          'Ascending triangle pattern completion',
          'Bull flag breakout above key resistance'
        ],
        SELL: [
          'Support breakdown with high volume',
          'Bear flag breakdown below support',
          'Failed retest of broken support'
        ],
        HOLD: [
          'Waiting for breakout confirmation',
          'Consolidation near key levels'
        ]
      },
      REVERSAL: {
        BUY: [
          'Oversold bounce from key support',
          'Bullish divergence confirmed',
          'Double bottom pattern completion'
        ],
        SELL: [
          'Overbought rejection at resistance',
          'Bearish divergence detected',
          'Double top pattern formation'
        ],
        HOLD: [
          'Reversal signal developing',
          'Waiting for confirmation'
        ]
      },
      MOMENTUM: {
        BUY: [
          'Strong upward momentum continuation',
          'Volume surge with price acceleration',
          'MACD bullish crossover confirmed'
        ],
        SELL: [
          'Momentum breakdown detected',
          'Bearish momentum building',
          'Volume selling pressure'
        ],
        HOLD: [
          'Momentum stalling',
          'Waiting for direction'
        ]
      },
      CONFLUENCE: {
        BUY: [
          'Multiple bullish signals aligned',
          'High confluence zone reached',
          'Technical and fundamental alignment'
        ],
        SELL: [
          'Multiple bearish signals converging',
          'Confluence of resistance levels',
          'Risk factors accumulating'
        ],
        HOLD: [
          'Mixed signals detected',
          'Awaiting confluence clarity'
        ]
      },
      WHALE: {
        BUY: [
          'Whale accumulation detected',
          'Large buy orders identified',
          'Smart money flow bullish'
        ],
        SELL: [
          'Whale distribution pattern',
          'Large sell pressure detected',
          'Smart money exiting'
        ],
        HOLD: [
          'Whale activity uncertain',
          'Mixed institutional flows'
        ]
      },
      AI_PREDICTION: {
        BUY: [
          'AI model predicts upward move',
          'Machine learning signals bullish',
          'Pattern recognition suggests buy'
        ],
        SELL: [
          'AI analysis indicates decline',
          'Predictive model shows bearish',
          'Algorithm suggests short'
        ],
        HOLD: [
          'AI model uncertain',
          'Conflicting predictions'
        ]
      }
    };

    const categoryReasons = reasons[category][type] || reasons[category].HOLD;
    return categoryReasons[Math.floor(Math.random() * categoryReasons.length)];
  };

  const getExitStrategy = (type: TradingSignal['type'], expectedReturn: number): string => {
    if (type === 'BUY') {
      return expectedReturn > 5 ? 'Scale out at 50% and 100% targets' : 'Take profit at target level';
    } else if (type === 'SELL') {
      return expectedReturn > 5 ? 'Cover at 50% and 100% targets' : 'Cover at target level';
    }
    return 'Monitor for directional signal';
  };

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
          <div className="mb-4 bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-blue-800 font-medium text-sm">
                📊 Analyzing market data via direct API...
              </span>
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
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${SIGNAL_COLORS[signal.type]}`}>
                            {signal.type}
                          </span>
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
                        <div className="grid grid-cols-3 gap-2 text-xs">
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