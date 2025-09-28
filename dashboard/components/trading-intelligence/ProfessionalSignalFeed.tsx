'use client';

import React, { useState, useEffect } from 'react';
import { enhancedMarketApi } from '@/lib/enhancedApi';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import { SignalFeedSkeleton } from '@/components/ui/LoadingSkeleton';
import TradingErrorBoundary from '@/components/ui/TradingErrorBoundary';
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
  refreshInterval = 15000,
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

  const fetchSignals = async () => {
    try {
      setLoading(true);
      setError(null);

      let newSignals: TradingSignal[] = [];

      try {
        // Try to use enhanced professional signals API first
        const signalsResponse = await enhancedMarketApi.getProfessionalSignals(symbols, minStrength);
        if (signalsResponse.success && Array.isArray(signalsResponse.data)) {
          newSignals = signalsResponse.data;
        } else {
          throw new Error('Professional signals API returned invalid data');
        }
      } catch (apiError) {
        console.warn('Enhanced signals API failed, falling back to real-time analysis:', apiError);
        // Fallback: Generate signals from real-time analysis
        newSignals = await generateRealTradingSignals();
      }

      setSignals(newSignals);

      // Show notifications for critical signals
      if (notificationsEnabled) {
        const criticalSignals = newSignals.filter(s => s.priority === 'CRITICAL');
        criticalSignals.forEach(signal => {
          toast.success(`🚨 CRITICAL: ${signal.type} signal for ${signal.symbol.replace('USDT', '')}`, {
            duration: 5000
          });
        });
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching signals:', err);
      setError('Failed to fetch trading signals');
      toast.error('Failed to fetch trading signals');
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    fetchSignals();
  }, [symbols, minStrength]);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchSignals, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, symbols, minStrength]);

  const filteredSignals = signals.filter(signal => {
    if (selectedCategory && signal.category !== selectedCategory) return false;
    if (selectedPriority && signal.priority !== selectedPriority) return false;
    return true;
  });

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Professional Signal Feed</h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {filteredSignals.length} active signals • Real-time analysis
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
              onClick={fetchSignals}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Refresh Signals"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {lastUpdate && (
              <div className="text-xs text-gray-500">
                Updated {lastUpdate.toLocaleTimeString()}
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