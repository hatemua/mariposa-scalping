'use client';

import React, { useState, useEffect } from 'react';
import { enhancedMarketApi } from '@/lib/enhancedApi';
import { io, Socket } from 'socket.io-client';
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
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [currentSymbol, setCurrentSymbol] = useState<string | undefined>(undefined);
  const [estimatedRemainingTime, setEstimatedRemainingTime] = useState(0);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [cachedSignals, setCachedSignals] = useState<TradingSignal[]>([]);
  const [cacheTimestamp, setCacheTimestamp] = useState<Date | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Debug state tracking
  const [debugInfo, setDebugInfo] = useState<any>({
    stateChanges: [],
    webSocketEvents: [],
    timeouts: [],
    lastHealthCheck: null,
    recoveryAttempts: 0
  });

  // Enhanced logging function
  const logDebug = (category: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category,
      message,
      data,
      jobId: currentJobId,
      isProcessing: isAIProcessing,
      socketConnected
    };

    console.log(`[${category}] ${timestamp}: ${message}`, data || '');

    setDebugInfo((prev: any) => ({
      ...prev,
      [category === 'STATE' ? 'stateChanges' :
        category === 'WEBSOCKET' ? 'webSocketEvents' :
        category === 'TIMEOUT' ? 'timeouts' : 'other']: [
        ...(prev[category === 'STATE' ? 'stateChanges' :
           category === 'WEBSOCKET' ? 'webSocketEvents' :
           category === 'TIMEOUT' ? 'timeouts' : 'other'] || []),
        logEntry
      ].slice(-50) // Keep last 50 entries
    }));
  };

  // Enhanced state setters with logging
  const setIsAIProcessingWithLog = (value: boolean, reason: string) => {
    logDebug('STATE', `isAIProcessing: ${isAIProcessing} -> ${value}`, { reason });
    setIsAIProcessing(value);
  };

  const setCurrentJobIdWithLog = (jobId: string | null, reason: string) => {
    logDebug('STATE', `currentJobId: ${currentJobId} -> ${jobId}`, { reason });
    setCurrentJobId(jobId);
  };

  const setProcessingStartTimeWithLog = (time: Date | null, reason: string) => {
    logDebug('STATE', `processingStartTime: ${processingStartTime?.toISOString()} -> ${time?.toISOString()}`, { reason });
    setProcessingStartTime(time);
  };

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

    const price = marketData.price || 0;
    const change24h = marketData.change24h || 0;
    const volume24h = marketData.volume || 0;
    const score = confluenceData.score || 0;

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
            riskManagement: `Stop at ${Math.abs((stopLoss - entry) / entry * 100).toFixed(1)}%`
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
    const baseReturn = (confluenceData.score || 50) / 25; // 2-4% base
    const momentumBonus = Math.min(Math.abs(marketData.change24h || 0) * 0.3, 3);
    const volumeBonus = (marketData.volume || 0) > 30000000 ? 1.5 : 0;

    return Math.min(10, Math.max(1, baseReturn + momentumBonus + volumeBonus));
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
      CONFLUENCE: `Strong confluence detected with ${score.toFixed(0)}% score`,
      BREAKOUT: `Technical breakout pattern confirmed`,
      MOMENTUM: `Momentum signals aligned across timeframes`,
      REVERSAL: `Reversal pattern identified at key level`,
      WHALE: `Large volume activity detected`,
      AI_PREDICTION: `AI analysis indicates ${type.toLowerCase()} opportunity`
    };

    return `${baseReasons[category]} • ${confidence.toFixed(0)}% confidence • Multiple factors converging`;
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
  const performHealthCheck = async () => {
    if (!isAIProcessing || !currentJobId) return;

    try {
      logDebug('HEALTH', 'Performing health check', {
        jobId: currentJobId,
        elapsedTime: processingStartTime ? Date.now() - processingStartTime.getTime() : 0
      });

      // Check job status via API
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://scalping.backend.mariposa.plus'}/api/market/analysis-status/${currentJobId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const result = await response.json();

      if (result.success) {
        const jobData = result.data;
        logDebug('HEALTH', 'Health check response', jobData);

        if (jobData.status === 'completed') {
          logDebug('HEALTH', 'Job completed during health check, fetching results');
          fetchJobResults(currentJobId);
        } else if (jobData.status === 'failed') {
          logDebug('HEALTH', 'Job failed during health check', { error: jobData.error });
          setIsAIProcessingWithLog(false, 'Health check found failed job');
          setCurrentJobIdWithLog(null, 'Health check cleanup');
          setError(jobData.error || 'Analysis failed');
        } else {
          // Update progress from health check
          setJobProgress(jobData.progress || 0);
          setCurrentSymbol(jobData.currentSymbol);
          setEstimatedRemainingTime(jobData.estimatedRemainingTime || 0);
        }

        setDebugInfo((prev: any) => ({ ...prev, lastHealthCheck: new Date() }));
      } else {
        logDebug('HEALTH', 'Health check failed', { error: result.error });
        if (response.status === 404) {
          logDebug('HEALTH', 'Job not found during health check, resetting state');
          setIsAIProcessingWithLog(false, 'Health check - job not found');
          setCurrentJobIdWithLog(null, 'Health check cleanup');
          setError('Analysis job not found - may have expired');
        }
      }
    } catch (error) {
      logDebug('HEALTH', 'Health check exception', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // Initialize WebSocket connection for analysis jobs
  const initializeWebSocket = () => {
    if (socket) {
      logDebug('WEBSOCKET', 'Disconnecting existing WebSocket');
      socket.disconnect();
    }

    logDebug('WEBSOCKET', 'Initializing WebSocket connection');
    setSocketError(null);

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'https://scalping.backend.mariposa.plus', {
      path: '/analysis/',
      auth: {
        token: localStorage.getItem('token')
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      randomizationFactor: 0.5,
      forceNew: true
    });

    newSocket.on('connect', () => {
      logDebug('WEBSOCKET', 'Connected to analysis WebSocket', { socketId: newSocket.id });
      setSocketConnected(true);
      setSocketError(null);

      // If we have an active job, try to resubscribe
      if (currentJobId && isAIProcessing) {
        logDebug('WEBSOCKET', 'Resubscribing to active job after connection', { jobId: currentJobId });
        newSocket.emit('subscribeToJob', { jobId: currentJobId });
        newSocket.emit('getJobStatus', { jobId: currentJobId });
      }
    });

    newSocket.on('connect_error', (error) => {
      logDebug('WEBSOCKET', 'Connection error', { error: error.message });
      setSocketConnected(false);
      setSocketError(`Connection failed: ${error.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      logDebug('WEBSOCKET', 'Disconnected', { reason });
      setSocketConnected(false);

      if (reason !== 'io client disconnect') {
        setSocketError(`Disconnected: ${reason}`);
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      logDebug('WEBSOCKET', 'Reconnected', { attemptNumber });
      setSocketConnected(true);
      setSocketError(null);
    });

    newSocket.on('reconnect_error', (error) => {
      logDebug('WEBSOCKET', 'Reconnection error', { error: error.message });
      setSocketError(`Reconnection failed: ${error.message}`);
    });

    newSocket.on('reconnect_failed', () => {
      logDebug('WEBSOCKET', 'Reconnection failed after all attempts');
      setSocketError('Connection failed - please refresh the page');
    });

    newSocket.on('jobUpdate', (data) => {
      logDebug('WEBSOCKET', 'Job update received', data);

      // Verify this update is for our current job
      if (data.jobId === currentJobId) {
        setJobProgress(data.progress || 0);
        setCurrentSymbol(data.currentSymbol);
        setEstimatedRemainingTime(data.estimatedRemainingTime || 0);

        if (data.status === 'completed') {
          logDebug('WEBSOCKET', 'Job completed, fetching results');
          fetchJobResults(data.jobId);
        } else if (data.status === 'failed') {
          logDebug('WEBSOCKET', 'Job failed', { error: data.error });
          setIsAIProcessingWithLog(false, 'WebSocket job failed');
          setCurrentJobIdWithLog(null, 'WebSocket cleanup');
          setProcessingStartTimeWithLog(null, 'WebSocket cleanup');
          setError(data.error || 'Analysis failed');
          toast.error('Analysis failed: ' + (data.error || 'Unknown error'));
          localStorage.removeItem('currentAnalysisJob');
        }
      } else {
        logDebug('WEBSOCKET', 'Job update for different job ignored', {
          receivedJobId: data.jobId,
          currentJobId
        });
      }
    });

    newSocket.on('jobStatus', (data) => {
      logDebug('WEBSOCKET', 'Job status received', data);

      // Handle job status responses (from getJobStatus requests)
      if (data.jobId === currentJobId) {
        if (data.status === 'not_found') {
          logDebug('WEBSOCKET', 'Job not found, resetting state');
          setIsAIProcessingWithLog(false, 'WebSocket job not found');
          setCurrentJobIdWithLog(null, 'WebSocket cleanup');
          setProcessingStartTimeWithLog(null, 'WebSocket cleanup');
          setError('Analysis job not found - may have expired');
          localStorage.removeItem('currentAnalysisJob');
        } else if (data.status === 'completed' && data.resultsCount > 0) {
          logDebug('WEBSOCKET', 'Job status shows completed, fetching results');
          fetchJobResults(data.jobId);
        } else {
          // Update progress from status
          setJobProgress(data.progress || 0);
          setCurrentSymbol(data.currentSymbol);
          setEstimatedRemainingTime(data.estimatedRemainingTime || 0);
        }
      }
    });

    newSocket.on('error', (error) => {
      logDebug('WEBSOCKET', 'General error', { error });
      setSocketError(`WebSocket error: ${error}`);
    });

    setSocket(newSocket);
  };

  // Fetch job results when analysis is completed
  const fetchJobResults = async (jobId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://scalping.backend.mariposa.plus'}/api/market/analysis-results/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();

      if (result.success) {
        const newSignals = result.data || [];
        setSignals(newSignals);
        setCachedSignals(newSignals); // Cache the results
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
        setError(result.error || 'Failed to fetch analysis results');
      }
    } catch (error) {
      console.error('Error fetching job results:', error);
      setError('Failed to fetch analysis results');
    } finally {
      setIsAIProcessingWithLog(false, 'Job results fetched');
      setCurrentJobIdWithLog(null, 'Job completion cleanup');
      setProcessingStartTimeWithLog(null, 'Job completion cleanup');
      setLoading(false);

      // Clear persisted job state on completion
      localStorage.removeItem('currentAnalysisJob');
      logDebug('STATE', 'Job completion cleanup finished');
    }
  };

  const fetchSignals = async () => {
    // Prevent new analysis during active AI processing
    if (isAIProcessing) {
      console.log('🔒 Analysis protection: Skipping refresh during AI processing');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHasInitialized(true);

      // Start new job-based analysis
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://scalping.backend.mariposa.plus'}/api/market/start-professional-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          symbols,
          minStrength
        })
      });

      const result = await response.json();

      if (result.success) {
        const jobId = result.data.jobId;
        logDebug('STATE', 'Starting new analysis job', { jobId, symbols, minStrength });

        setCurrentJobIdWithLog(jobId, 'New job started');
        setIsAIProcessingWithLog(true, 'New job started');
        setProcessingStartTimeWithLog(new Date(), 'New job started');
        setJobProgress(5);

        // Store job state for persistence across page refreshes
        localStorage.setItem('currentAnalysisJob', JSON.stringify({
          jobId,
          startTime: new Date().getTime(),
          symbols,
          minStrength
        }));

        // Initialize WebSocket if not already connected
        if (!socket) {
          initializeWebSocket();
        }

        // Wait for WebSocket to be ready before subscribing
        const subscribeToJob = () => {
          if (socket && socketConnected) {
            socket.emit('subscribeToJob', { jobId });
            console.log(`📡 Subscribed to job ${jobId}`);
          } else {
            // Retry subscription after a short delay
            setTimeout(subscribeToJob, 500);
          }
        };

        subscribeToJob();

        console.log(`🚀 Started analysis job ${jobId}`);
      } else if (result.data?.isResumed) {
        // Auto-resumed existing job
        const existingJobId = result.data.jobId;
        logDebug('STATE', 'Auto-resuming existing job', {
          jobId: existingJobId,
          progress: result.data.currentProgress
        });

        setCurrentJobIdWithLog(existingJobId, 'Auto-resume existing job');
        setIsAIProcessingWithLog(true, 'Auto-resume existing job');
        setProcessingStartTimeWithLog(new Date(), 'Auto-resume existing job');
        setJobProgress(result.data.currentProgress || 5);

        const subscribeToExistingJob = () => {
          if (socket && socketConnected) {
            socket.emit('subscribeToJob', { jobId: existingJobId });
            console.log(`📡 Subscribed to resumed job ${existingJobId}`);
          } else {
            setTimeout(subscribeToExistingJob, 500);
          }
        };

        subscribeToExistingJob();
      } else {
        throw new Error(result.error || 'Failed to start analysis');
      }
    } catch (err) {
      logDebug('STATE', 'Error starting analysis', { error: err instanceof Error ? err.message : String(err) });

      let errorMessage = 'Failed to start professional analysis';
      if (err instanceof Error) {
        if (err.message.includes('fetch')) {
          errorMessage = 'Network error: Cannot connect to analysis service';
        } else if (err.message.includes('WebSocket')) {
          errorMessage = 'WebSocket connection failed: Real-time updates unavailable';
        } else {
          errorMessage = `Analysis error: ${err.message}`;
        }
      }

      setError(errorMessage);
      toast.error(errorMessage);
      setLoading(false);
      setIsAIProcessingWithLog(false, 'Analysis start error');
    }
  };

  // Analysis-aware refresh function
  const protectedFetchSignals = async () => {
    // Skip refresh if analysis is in progress
    if (isAIProcessing) {
      console.log('🔒 Analysis protection: Skipping refresh during AI processing');
      return;
    }

    // Check if analysis timed out (more than 90 seconds)
    if (processingStartTime) {
      const elapsedTime = Date.now() - processingStartTime.getTime();
      if (elapsedTime > 90000) { // 90 seconds timeout for 6 symbols
        console.log('⏰ Analysis timeout detected, resetting...');
        setIsAIProcessing(false);
        setProcessingStartTime(null);
      }
    }

    await fetchSignals();
  };

  // Smart refresh integration with analysis protection - disabled by default
  const { enabled: refreshEnabled, interval: effectiveInterval, refreshFn } = useComponentRefresh(
    'ProfessionalSignalFeed',
    refreshInterval,
    protectedFetchSignals
  );

  const smartRefresh = useSmartRefresh({
    refreshFn: protectedFetchSignals,
    interval: effectiveInterval,
    enabled: false, // Disabled - use manual refresh for better performance
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

  // Recover job state from localStorage
  const recoverJobState = () => {
    try {
      const savedJob = localStorage.getItem('currentAnalysisJob');
      if (savedJob) {
        const jobData = JSON.parse(savedJob);
        const elapsedTime = Date.now() - jobData.startTime;

        logDebug('STATE', 'Attempting job state recovery', {
          jobId: jobData.jobId,
          elapsedTime,
          maxAge: 120000
        });

        // Only recover if job is less than 2 minutes old
        if (elapsedTime < 120000) {
          logDebug('STATE', 'Recovering job state', { jobId: jobData.jobId });

          setCurrentJobIdWithLog(jobData.jobId, 'Job state recovery');
          setIsAIProcessingWithLog(true, 'Job state recovery');
          setProcessingStartTimeWithLog(new Date(jobData.startTime), 'Job state recovery');
          setJobProgress(Math.min(90, Math.floor(elapsedTime / 1000))); // Estimate progress

          setDebugInfo((prev: any) => ({ ...prev, recoveryAttempts: prev.recoveryAttempts + 1 }));
          return jobData.jobId;
        } else {
          logDebug('STATE', 'Job too old, cleaning up', { elapsedTime });
          localStorage.removeItem('currentAnalysisJob');
        }
      } else {
        logDebug('STATE', 'No saved job found');
      }
    } catch (error) {
      logDebug('STATE', 'Job recovery failed', { error: error instanceof Error ? error.message : String(error) });
      localStorage.removeItem('currentAnalysisJob');
    }
    return null;
  };

  // Initialize WebSocket on component mount
  useEffect(() => {
    initializeWebSocket();

    // Try to recover any existing job state first
    const recoveredJobId = recoverJobState();

    // If we recovered a job, set up WebSocket subscription after connection
    if (recoveredJobId && socket) {
      const setupRecoveredSubscription = () => {
        if (socketConnected) {
          socket.emit('subscribeToJob', { jobId: recoveredJobId });
          socket.emit('getJobStatus', { jobId: recoveredJobId });
          console.log(`🔄 Set up subscription for recovered job ${recoveredJobId}`);
        } else {
          // Retry in 1 second
          setTimeout(setupRecoveredSubscription, 1000);
        }
      };
      setupRecoveredSubscription();
    } else {
      // Load cached signals if no active job
      loadCachedSignals();
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Only load cache when dependencies change (no auto-analysis)
  useEffect(() => {
    if (!isAIProcessing && hasInitialized) {
      loadCachedSignals(); // Only load cache, don't start new analysis
    }
  }, [symbols, minStrength]);

  // Health check monitoring during processing
  useEffect(() => {
    if (!isAIProcessing || !currentJobId) return;

    logDebug('HEALTH', 'Starting health check monitoring');

    // Immediate health check
    performHealthCheck();

    // Periodic health checks every 30 seconds during processing
    const healthCheckInterval = setInterval(() => {
      performHealthCheck();
    }, 30000);

    return () => {
      logDebug('HEALTH', 'Stopping health check monitoring');
      clearInterval(healthCheckInterval);
    };
  }, [isAIProcessing, currentJobId]);

  // Timeout protection for stuck analysis (dual timeout system)
  useEffect(() => {
    if (!isAIProcessing || !processingStartTime) return;

    logDebug('TIMEOUT', 'Setting up timeout protection', {
      startTime: processingStartTime.toISOString()
    });

    // Primary timeout at 90 seconds
    const primaryTimeoutId = setTimeout(() => {
      const elapsedTime = Date.now() - processingStartTime.getTime();
      if (elapsedTime > 90000 && isAIProcessing) {
        logDebug('TIMEOUT', 'Primary timeout triggered (90s)', { elapsedTime });
        setIsAIProcessingWithLog(false, 'Primary timeout (90s)');
        setProcessingStartTimeWithLog(null, 'Primary timeout');
        setError('Analysis timed out after 90 seconds - please try again');
        toast.error('Analysis timed out - please try again');
        localStorage.removeItem('currentAnalysisJob');
      }
    }, 90000);

    // Secondary timeout at 120 seconds (failsafe)
    const secondaryTimeoutId = setTimeout(() => {
      const elapsedTime = Date.now() - processingStartTime.getTime();
      if (elapsedTime > 120000 && isAIProcessing) {
        logDebug('TIMEOUT', 'Secondary failsafe timeout triggered (120s)', { elapsedTime });
        setIsAIProcessingWithLog(false, 'Secondary failsafe timeout (120s)');
        setProcessingStartTimeWithLog(null, 'Secondary timeout');
        setCurrentJobIdWithLog(null, 'Secondary timeout');
        setError('Analysis stuck - system reset');
        toast.error('Analysis was stuck - system has been reset');
        localStorage.removeItem('currentAnalysisJob');

        // Force cleanup backend
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://scalping.backend.mariposa.plus'}/api/market/force-cleanup`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).catch(err => logDebug('TIMEOUT', 'Force cleanup failed', { error: err.message }));
      }
    }, 120000);

    return () => {
      logDebug('TIMEOUT', 'Clearing timeout protection');
      clearTimeout(primaryTimeoutId);
      clearTimeout(secondaryTimeoutId);
    };
  }, [isAIProcessing, processingStartTime]);

  // Manual refresh with protection
  const handleManualRefresh = () => {
    if (isAIProcessing) {
      console.log('⚠️ Manual refresh blocked - Analysis in progress');
      return;
    }
    protectedFetchSignals();
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

  // Cancel current analysis
  const handleCancelAnalysis = async () => {
    if (!currentJobId) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://scalping.backend.mariposa.plus'}/api/market/analysis/${currentJobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();

      if (result.success) {
        setIsAIProcessing(false);
        setCurrentJobId(null);
        setProcessingStartTime(null);
        setJobProgress(0);
        setCurrentSymbol(undefined);
        toast.success('Analysis cancelled successfully');
        console.log('❌ Analysis cancelled by user');
      } else {
        toast.error('Failed to cancel analysis');
      }
    } catch (error) {
      console.error('Error cancelling analysis:', error);
      toast.error('Failed to cancel analysis');
    }
  };

  // Force reset stuck analysis state
  const handleForceReset = async () => {
    try {
      logDebug('STATE', 'Starting force reset', {
        currentJobId,
        isProcessing: isAIProcessing,
        elapsedTime: processingStartTime ? Date.now() - processingStartTime.getTime() : 0
      });

      setIsAIProcessingWithLog(false, 'Force reset');
      setCurrentJobIdWithLog(null, 'Force reset');
      setProcessingStartTimeWithLog(null, 'Force reset');
      setJobProgress(0);
      setCurrentSymbol(undefined);
      setError(null);
      setLoading(false);

      // Clear any stored job state
      localStorage.removeItem('currentAnalysisJob');
      logDebug('STATE', 'Cleared localStorage');

      // Reset debug info
      setDebugInfo({
        stateChanges: [],
        webSocketEvents: [],
        timeouts: [],
        lastHealthCheck: null,
        recoveryAttempts: 0
      });

      // Try to cleanup backend state
      try {
        logDebug('STATE', 'Attempting backend cleanup');
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://scalping.backend.mariposa.plus'}/api/market/force-cleanup`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const result = await response.json();
        logDebug('STATE', 'Backend cleanup response', result);
      } catch (cleanupError) {
        logDebug('STATE', 'Backend cleanup failed', { error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
      }

      // Reinitialize WebSocket connection
      if (socket) {
        logDebug('WEBSOCKET', 'Reinitializing WebSocket after force reset');
        socket.disconnect();
        setTimeout(initializeWebSocket, 1000);
      }

      toast.success('Analysis state reset successfully - you can start a new analysis');
      logDebug('STATE', 'Force reset completed successfully');
    } catch (error) {
      logDebug('STATE', 'Error during force reset', { error: error instanceof Error ? error.message : String(error) });
      toast.error('Reset completed with warnings');
    }
  };

  // Detect if analysis appears stuck
  const isAnalysisStuck = () => {
    if (!isAIProcessing || !processingStartTime) return false;
    const elapsedTime = Date.now() - processingStartTime.getTime();
    const progressPerSecond = jobProgress / (elapsedTime / 1000);

    // Consider stuck if no progress for 30 seconds or very slow progress
    return elapsedTime > 30000 && (progressPerSecond < 0.5 || jobProgress < 10);
  };

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
                  'Real-time analysis'
                )} •
                <span className={`font-medium ${socketConnected ? 'text-green-600' : socketError ? 'text-red-600' : 'text-yellow-600'}`}>
                  {socketConnected ? '🟢 Connected' : socketError ? '🔴 Connection error' : '🟡 Connecting...'}
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

        {isAIProcessing && processingStartTime && (
          <div className="mb-4 bg-orange-50 border-l-4 border-orange-400 p-4 rounded">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse"></div>
              <span className="text-orange-800 font-medium text-sm">
                🔒 Analysis Protected - Refresh temporarily disabled
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-orange-800 font-medium">Analysis Progress</span>
                <span className="text-orange-600 text-sm">{jobProgress}%</span>
              </div>

              <div className="w-full bg-orange-200 rounded-full h-3">
                <div
                  className="bg-orange-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${jobProgress}%` }}
                />
              </div>

              {currentSymbol && (
                <div className="text-sm text-orange-700">
                  Currently analyzing: <span className="font-medium">{currentSymbol}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-xs text-orange-600">
                <span>Job ID: {currentJobId?.slice(0, 8)}...</span>
                <div className="flex items-center gap-2">
                  <span>Est. {estimatedRemainingTime}s remaining</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCancelAnalysis}
                      className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 transition-colors"
                      title="Cancel Analysis"
                    >
                      Cancel
                    </button>
                    {isAnalysisStuck() && (
                      <button
                        onClick={handleForceReset}
                        className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200 transition-colors animate-pulse"
                        title="Force Reset Stuck Analysis"
                      >
                        🔄 Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-xs text-orange-700 mt-2">
              Analysis will complete without interruption. Auto-refresh will resume afterwards.
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
              Processing: {isAIProcessing ? '✅' : '❌'} |
              Socket: {socketConnected ? '🟢' : '🔴'} |
              Job: {currentJobId ? currentJobId.slice(0, 8) : 'None'} |
              Recovery: {debugInfo.recoveryAttempts}
            </div>
          </div>

          {showDebugPanel && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Current State */}
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">Current State</h4>
                  <div className="text-xs space-y-1">
                    <div><span className="font-medium">Processing:</span> {isAIProcessing ? '✅' : '❌'}</div>
                    <div><span className="font-medium">Job ID:</span> {currentJobId || 'None'}</div>
                    <div><span className="font-medium">Progress:</span> {jobProgress}%</div>
                    <div><span className="font-medium">Symbol:</span> {currentSymbol || 'None'}</div>
                    <div><span className="font-medium">Socket:</span> {socketConnected ? '🟢 Connected' : '🔴 Disconnected'}</div>
                    <div><span className="font-medium">Error:</span> {socketError || 'None'}</div>
                    <div><span className="font-medium">Cache:</span> {cachedSignals.length} signals</div>
                    <div><span className="font-medium">Last Health:</span> {debugInfo.lastHealthCheck ? new Date(debugInfo.lastHealthCheck).toLocaleTimeString() : 'Never'}</div>
                  </div>
                </div>

                {/* Recent State Changes */}
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">Recent State Changes</h4>
                  <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                    {debugInfo.stateChanges.slice(-5).reverse().map((change: any, i: number) => (
                      <div key={i} className="border-b border-gray-100 pb-1">
                        <div className="font-medium text-blue-600">{change.message}</div>
                        <div className="text-gray-500">{new Date(change.timestamp).toLocaleTimeString()}</div>
                        {change.data?.reason && <div className="text-gray-400">{change.data.reason}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* WebSocket Events */}
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">WebSocket Events</h4>
                  <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                    {debugInfo.webSocketEvents.slice(-5).reverse().map((event: any, i: number) => (
                      <div key={i} className="border-b border-gray-100 pb-1">
                        <div className="font-medium text-green-600">{event.message}</div>
                        <div className="text-gray-500">{new Date(event.timestamp).toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timing Information */}
              {processingStartTime && (
                <div className="bg-white rounded p-3 border">
                  <h4 className="font-medium text-gray-900 mb-2">Timing Information</h4>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="font-medium">Started:</span><br />
                      {processingStartTime.toLocaleTimeString()}
                    </div>
                    <div>
                      <span className="font-medium">Elapsed:</span><br />
                      {Math.round((Date.now() - processingStartTime.getTime()) / 1000)}s
                    </div>
                    <div>
                      <span className="font-medium">Remaining:</span><br />
                      {estimatedRemainingTime}s
                    </div>
                    <div>
                      <span className="font-medium">Progress Rate:</span><br />
                      {processingStartTime ? (jobProgress / ((Date.now() - processingStartTime.getTime()) / 1000)).toFixed(2) : '0'}%/s
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
                  {isAIProcessing && (
                    <button
                      onClick={performHealthCheck}
                      className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded hover:bg-green-200"
                    >
                      Manual Health Check
                    </button>
                  )}
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
                            <div className="font-semibold text-purple-600">{(signal.confidence * 100).toFixed(0)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Expected Return</span>
                            <div className="font-semibold text-green-600">+{signal.expectedReturn.toFixed(1)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Risk/Reward</span>
                            <div className="font-semibold text-orange-600">{signal.riskReward.toFixed(2)}:1</div>
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
                            <div className="font-semibold">${signal.entry.toFixed(4)}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Target</span>
                            <div className="font-semibold text-green-600">${signal.target.toFixed(4)}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Stop</span>
                            <div className="font-semibold text-red-600">${signal.stopLoss.toFixed(4)}</div>
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