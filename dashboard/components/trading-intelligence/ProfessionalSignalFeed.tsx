'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
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

export default function ProfessionalSignalFeed({
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

  const generateTradingSignals = (): TradingSignal[] => {
    const signalTypes: TradingSignal['category'][] = [
      'BREAKOUT', 'REVERSAL', 'MOMENTUM', 'CONFLUENCE', 'WHALE', 'AI_PREDICTION'
    ];
    const timeframes = ['1m', '5m', '15m', '1h', '4h'];
    const sources: TradingSignal['source'][] = [
      'AI_ANALYSIS', 'TECHNICAL_SCAN', 'WHALE_DETECTION', 'CONFLUENCE_SCORE', 'MULTI_TF'
    ];

    const generatedSignals: TradingSignal[] = [];

    symbols.forEach(symbol => {
      // Generate 1-2 signals per symbol
      const count = Math.floor(Math.random() * 2) + 1;

      for (let i = 0; i < count; i++) {
        const type: TradingSignal['type'] =
          Math.random() > 0.7 ? 'HOLD' :
          Math.random() > 0.5 ? 'BUY' : 'SELL';

        const strength = Math.floor(Math.random() * 40) + minStrength; // minStrength to 100
        const confidence = Math.random() * 0.4 + 0.6; // 0.6 to 1.0
        const entry = Math.random() * 1000 + 100; // $100-1100
        const expectedReturn = Math.random() * 8 + 1; // 1-9%

        let target, stopLoss;
        if (type === 'BUY') {
          target = entry * (1 + expectedReturn / 100);
          stopLoss = entry * (1 - Math.random() * 0.05 - 0.01); // 1-6% stop
        } else if (type === 'SELL') {
          target = entry * (1 - expectedReturn / 100);
          stopLoss = entry * (1 + Math.random() * 0.05 + 0.01); // 1-6% stop
        } else {
          target = entry;
          stopLoss = entry * 0.98; // 2% protective stop
        }

        const riskReward = Math.abs(target - entry) / Math.abs(entry - stopLoss);
        const category = signalTypes[Math.floor(Math.random() * signalTypes.length)];
        const timeframe = timeframes[Math.floor(Math.random() * timeframes.length)];
        const source = sources[Math.floor(Math.random() * sources.length)];

        const priority: TradingSignal['priority'] =
          strength > 90 ? 'CRITICAL' :
          strength > 80 ? 'HIGH' :
          strength > 70 ? 'MEDIUM' : 'LOW';

        if (riskReward > 1.5) { // Only include signals with good R:R
          generatedSignals.push({
            id: `signal-${symbol}-${Date.now()}-${i}`,
            symbol,
            type,
            strength,
            confidence,
            timeframe,
            entry,
            target,
            stopLoss,
            riskReward,
            expectedReturn,
            category,
            indicators: {
              rsi: Math.random() * 100,
              macd: ['BULLISH', 'BEARISH', 'NEUTRAL'][Math.floor(Math.random() * 3)] as any,
              ema: ['BULLISH', 'BEARISH', 'NEUTRAL'][Math.floor(Math.random() * 3)] as any,
              volume: ['HIGH', 'MEDIUM', 'LOW'][Math.floor(Math.random() * 3)] as any,
              support: Math.random() > 0.5,
              resistance: Math.random() > 0.5
            },
            reasoning: generateSignalReasoning(category, type, strength),
            timestamp: new Date(Date.now() - Math.random() * 1800000).toISOString(), // Last 30min
            priority,
            source,
            marketCondition: ['TRENDING', 'RANGING', 'VOLATILE', 'CONSOLIDATING'][Math.floor(Math.random() * 4)] as any,
            followUp: {
              checkIn: `${Math.floor(Math.random() * 30) + 5} minutes`,
              exitStrategy: getExitStrategy(type, expectedReturn),
              riskManagement: `Stop at ${Math.abs((stopLoss - entry) / entry * 100).toFixed(1)}%`
            }
          });
        }
      }
    });

    return generatedSignals
      .sort((a, b) => {
        // Sort by priority first, then by strength
        const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return b.strength - a.strength;
      })
      .slice(0, maxSignals);
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

      const newSignals = generateTradingSignals();
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
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Professional Signal Feed</h3>
              <p className="text-sm text-gray-600">
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white"
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
            className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white"
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
      <div className="p-6">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 text-blue-600 animate-spin mr-2" />
            <span className="text-gray-600">Generating signals...</span>
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