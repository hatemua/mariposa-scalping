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
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT'
  ],
  maxSignals = 20,
  minStrength = 60,
  autoRefresh = true,
  refreshInterval = 60000, // 60 seconds for signal feed (was 15s - too aggressive)
  enableNotifications = true,
  className = ''
}: ProfessionalSignalFeedProps) {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Initialize WebSocket connection for analysis jobs
  const initializeWebSocket = () => {
    if (socket) return;

    console.log('🔄 Initializing analysis WebSocket connection...');
    setSocketError(null);

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      path: '/analysis/',
      auth: {
        token: localStorage.getItem('token')
      },
      transports: ['websocket', 'polling'],
      timeout: 5000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    newSocket.on('connect', () => {
      console.log('🔗 Connected to analysis WebSocket on /analysis/ path');
      setSocketConnected(true);
      setSocketError(null);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      setSocketConnected(false);
      setSocketError(`Connection failed: ${error.message}`);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      setSocketConnected(false);
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        newSocket.connect();
      }
    });

    newSocket.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      setSocketError(`WebSocket error: ${error}`);
    });

    newSocket.on('jobUpdate', (data) => {
      console.log('📊 Job update received:', data);
      setJobProgress(data.progress);
      setCurrentSymbol(data.currentSymbol);
      setEstimatedRemainingTime(data.estimatedRemainingTime);

      if (data.status === 'completed') {
        // Fetch the results
        fetchJobResults(data.jobId);
      } else if (data.status === 'failed') {
        setIsAIProcessing(false);
        setCurrentJobId(null);
        setError(data.error || 'Analysis failed');
        toast.error('Analysis failed: ' + (data.error || 'Unknown error'));
      }
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    setSocket(newSocket);
  };

  // Fetch job results when analysis is completed
  const fetchJobResults = async (jobId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/market/analysis-results/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();

      if (result.success) {
        setSignals(result.data || []);
        setLastUpdate(new Date());

        // Show notifications for critical signals
        if (notificationsEnabled) {
          const criticalSignals = (result.data || []).filter((s: TradingSignal) => s.priority === 'CRITICAL');
          criticalSignals.forEach((signal: TradingSignal) => {
            toast.success(`🚨 CRITICAL: ${signal.type} signal for ${signal.symbol.replace('USDT', '')}`, {
              duration: 5000
            });
          });
        }

        console.log(`✅ Analysis completed with ${result.data?.length || 0} signals`);
      } else {
        setError(result.error || 'Failed to fetch analysis results');
      }
    } catch (error) {
      console.error('Error fetching job results:', error);
      setError('Failed to fetch analysis results');
    } finally {
      setIsAIProcessing(false);
      setCurrentJobId(null);
      setProcessingStartTime(null);
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

      // Start new job-based analysis
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/market/start-professional-analysis`, {
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
        setCurrentJobId(jobId);
        setIsAIProcessing(true);
        setProcessingStartTime(new Date());
        setJobProgress(5);

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
      } else if (response.status === 409) {
        // User already has a running job
        const existingJobId = result.data?.existingJobId;
        if (existingJobId) {
          setCurrentJobId(existingJobId);
          setIsAIProcessing(true);
          setProcessingStartTime(new Date());

          const subscribeToExistingJob = () => {
            if (socket && socketConnected) {
              socket.emit('subscribeToJob', { jobId: existingJobId });
              console.log(`📡 Subscribed to existing job ${existingJobId}`);
            } else {
              setTimeout(subscribeToExistingJob, 500);
            }
          };

          subscribeToExistingJob();

          console.log(`🔄 Reconnected to existing job ${existingJobId}`);
        }
      } else {
        throw new Error(result.error || 'Failed to start analysis');
      }
    } catch (err) {
      console.error('Error starting analysis:', err);

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
      setIsAIProcessing(false);
    }
  };

  // Analysis-aware refresh function
  const protectedFetchSignals = async () => {
    // Skip refresh if analysis is in progress
    if (isAIProcessing) {
      console.log('🔒 Analysis protection: Skipping refresh during AI processing');
      return;
    }

    // Check if analysis timed out (more than 3 minutes)
    if (processingStartTime) {
      const elapsedTime = Date.now() - processingStartTime.getTime();
      if (elapsedTime > 180000) { // 3 minutes timeout
        console.log('⏰ Analysis timeout detected, resetting...');
        setIsAIProcessing(false);
        setProcessingStartTime(null);
      }
    }

    await fetchSignals();
  };

  // Smart refresh integration with analysis protection
  const { enabled: refreshEnabled, interval: effectiveInterval, refreshFn } = useComponentRefresh(
    'ProfessionalSignalFeed',
    refreshInterval,
    protectedFetchSignals
  );

  const smartRefresh = useSmartRefresh({
    refreshFn: protectedFetchSignals,
    interval: effectiveInterval,
    enabled: autoRefresh && refreshEnabled && !isAIProcessing, // Disable during analysis
    pauseOnHover: true,
    pauseOnFocus: true,
    pauseOnInteraction: true,
    interactionPauseDuration: 15000, // 15 seconds pause after interaction
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

  // Initialize WebSocket on component mount
  useEffect(() => {
    initializeWebSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Initial fetch when dependencies change
  useEffect(() => {
    // Only trigger if not currently processing
    if (!isAIProcessing) {
      protectedFetchSignals();
    }
  }, [symbols, minStrength]);

  // Timeout protection for stuck analysis
  useEffect(() => {
    if (!isAIProcessing || !processingStartTime) return;

    const timeoutId = setTimeout(() => {
      const elapsedTime = Date.now() - processingStartTime.getTime();
      if (elapsedTime > 180000 && isAIProcessing) { // 3 minutes timeout
        console.log('⏰ Analysis timeout: Resetting after 3 minutes');
        setIsAIProcessing(false);
        setProcessingStartTime(null);
        setError('Analysis timed out - please try again');
      }
    }, 180000); // 3 minutes

    return () => clearTimeout(timeoutId);
  }, [isAIProcessing, processingStartTime]);

  // Manual refresh with protection
  const handleManualRefresh = () => {
    if (isAIProcessing) {
      console.log('⚠️ Manual refresh blocked - Analysis in progress');
      return;
    }
    protectedFetchSignals();
  };

  // Cancel current analysis
  const handleCancelAnalysis = async () => {
    if (!currentJobId) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/market/analysis/${currentJobId}`, {
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
            {smartRefresh.lastRefresh && (
              <div className="text-xs text-gray-500">
                Updated {smartRefresh.lastRefresh.toLocaleTimeString()}
                {smartRefresh.isPaused && (
                  <span className="ml-1 text-yellow-600">(Paused)</span>
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
                  <button
                    onClick={handleCancelAnalysis}
                    className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 transition-colors"
                    title="Cancel Analysis"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            <div className="text-xs text-orange-700 mt-2">
              Analysis will complete without interruption. Auto-refresh will resume afterwards.
            </div>
          </div>
        )}

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
        ) : filteredSignals.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Zap className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No signals match your criteria</p>
            <p className="text-sm mt-1">Adjust filters or wait for new signals</p>
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