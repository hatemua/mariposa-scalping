'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import { WhaleActivitySkeleton } from '@/components/ui/LoadingSkeleton';
import TradingErrorBoundary from '@/components/ui/TradingErrorBoundary';
import {
  Eye,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  DollarSign,
  Activity,
  RefreshCw,
  Filter,
  ArrowUp,
  ArrowDown,
  Volume2,
  Zap,
  Target,
  Bell,
  BellOff,
  Waves,
  BarChart3
} from 'lucide-react';

interface WhaleActivity {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  size: number;
  price: number;
  value: number;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  timestamp: string;
  exchange: string;
  orderType: 'MARKET' | 'LIMIT' | 'ICEBERG' | 'TWAP' | 'VWAP';
  priceImpact: number;
  volumeRatio: number;
  unusualActivity: string[];
  marketBehavior: {
    followThrough: boolean;
    resistanceBreak: boolean;
    supportHold: boolean;
    volumeSpike: boolean;
  };
  prediction: {
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    timeframe: string;
    probability: number;
  };
}

interface WhaleAlert {
  id: string;
  symbol: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  timestamp: string;
  actions: string[];
}

interface WhaleActivityMonitorProps {
  symbols?: string[];
  minWhaleSize?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableAlerts?: boolean;
  className?: string;
}

const IMPACT_COLORS = {
  LOW: 'text-blue-600 bg-blue-50 border-blue-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
  CRITICAL: 'text-red-600 bg-red-50 border-red-200'
};

const ALERT_COLORS = {
  INFO: 'text-blue-600 bg-blue-50 border-blue-200',
  WARNING: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  CRITICAL: 'text-red-600 bg-red-50 border-red-200'
};

function WhaleActivityMonitor({
  symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT'],
  minWhaleSize = 100000, // $100k minimum
  autoRefresh = true,
  refreshInterval = 180000, // 3 minutes for whale activity (was 10s - too aggressive)
  enableAlerts = true,
  className = ''
}: WhaleActivityMonitorProps) {
  const [whaleActivities, setWhaleActivities] = useState<WhaleActivity[]>([]);
  const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(enableAlerts);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const analyzeRealWhaleActivity = async (): Promise<WhaleActivity[]> => {
    const activities: WhaleActivity[] = [];

    try {
      // Analyze each symbol for whale activity using real market data
      for (const symbol of symbols) {
        try {
          // Get real market data and analysis with fallback
          const marketResponse = await marketApi.getMarketData(symbol);
          if (!marketResponse.success) {
            continue;
          }

          const marketData = marketResponse.data;

          // Detect whale activity based on real market conditions
          const whaleActivities = detectWhaleActivityFromMarketData(symbol, marketData, null);
          activities.push(...whaleActivities);

        } catch (error) {
          console.warn(`Failed to analyze whale activity for ${symbol}:`, error);
        }
      }

      return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error('Error analyzing whale activity:', error);
      return [];
    }
  };

  const detectWhaleActivityFromMarketData = (
    symbol: string,
    marketData: any,
    signalsData: any
  ): WhaleActivity[] => {
    const activities: WhaleActivity[] = [];
    const price = marketData.price || 0;
    const volume24h = marketData.volume || 0;
    const change24h = marketData.change24h || 0;

    // Calculate average volume baseline (estimate)
    const estimatedAvgVolume = volume24h * 0.7; // Estimate average as 70% of current

    // Detect volume-based whale activity
    if (volume24h > estimatedAvgVolume * 2) {
      const volumeRatio = volume24h / estimatedAvgVolume;
      const whaleType: 'BUY' | 'SELL' = change24h > 0 ? 'BUY' : 'SELL';

      // Estimate whale order size based on volume surge
      const estimatedWhaleValue = volume24h * 0.1 * price; // Assume 10% of volume is whale activity

      if (estimatedWhaleValue >= minWhaleSize) {
        const impact: WhaleActivity['impact'] =
          estimatedWhaleValue > 5000000 ? 'CRITICAL' :
          estimatedWhaleValue > 2000000 ? 'HIGH' :
          estimatedWhaleValue > 1000000 ? 'MEDIUM' : 'LOW';

        const confidence = Math.min(0.95, 0.5 + (volumeRatio - 2) * 0.1);

        // Determine unusual patterns based on market behavior
        const unusualPatterns = [];
        if (volumeRatio > 5) unusualPatterns.push('Massive volume spike detected');
        if (Math.abs(change24h) > 10) unusualPatterns.push('Large price impact identified');
        if (volumeRatio > 3 && Math.abs(change24h) < 2) unusualPatterns.push('Stealth accumulation pattern');

        activities.push({
          id: `whale-${symbol}-${Date.now()}`,
          symbol,
          type: whaleType,
          size: estimatedWhaleValue / price,
          price,
          value: estimatedWhaleValue,
          impact,
          confidence,
          timestamp: new Date().toISOString(),
          exchange: 'Binance', // Primary exchange for analysis
          orderType: volumeRatio > 4 ? 'MARKET' : 'ICEBERG',
          priceImpact: Math.abs(change24h),
          volumeRatio,
          unusualActivity: unusualPatterns.length > 0 ? unusualPatterns : ['Significant volume activity'],
          marketBehavior: {
            followThrough: Math.abs(change24h) > 1,
            resistanceBreak: change24h > 5,
            supportHold: change24h < -5 && change24h > -10,
            volumeSpike: volumeRatio > 2
          },
          prediction: {
            direction: whaleType === 'BUY' ? 'BULLISH' : 'BEARISH',
            timeframe: volumeRatio > 5 ? '1h' : '4h',
            probability: confidence
          }
        });
      }
    }

    // Detect price-based whale activity (large price movements with volume)
    if (Math.abs(change24h) > 8 && volume24h > estimatedAvgVolume * 1.5) {
      const priceWhaleType: 'BUY' | 'SELL' = change24h > 0 ? 'BUY' : 'SELL';
      const priceWhaleValue = volume24h * 0.15 * price; // Assume 15% for price-driven activity

      if (priceWhaleValue >= minWhaleSize) {
        const impact: WhaleActivity['impact'] =
          Math.abs(change24h) > 15 ? 'CRITICAL' :
          Math.abs(change24h) > 10 ? 'HIGH' : 'MEDIUM';

        activities.push({
          id: `price-whale-${symbol}-${Date.now()}`,
          symbol,
          type: priceWhaleType,
          size: priceWhaleValue / price,
          price,
          value: priceWhaleValue,
          impact,
          confidence: 0.7 + Math.min(0.25, Math.abs(change24h) * 0.02),
          timestamp: new Date().toISOString(),
          exchange: 'Binance',
          orderType: 'MARKET',
          priceImpact: Math.abs(change24h),
          volumeRatio: volume24h / estimatedAvgVolume,
          unusualActivity: ['Large price movement with volume confirmation'],
          marketBehavior: {
            followThrough: true,
            resistanceBreak: change24h > 8,
            supportHold: change24h < -8,
            volumeSpike: true
          },
          prediction: {
            direction: priceWhaleType === 'BUY' ? 'BULLISH' : 'BEARISH',
            timeframe: '30m',
            probability: 0.75
          }
        });
      }
    }

    return activities;
  };

  const generateAlerts = (activities: WhaleActivity[]): WhaleAlert[] => {
    const alerts: WhaleAlert[] = [];

    activities.forEach(activity => {
      if (activity.impact === 'CRITICAL' || activity.impact === 'HIGH') {
        const alertMessages = {
          CRITICAL: [
            `🚨 CRITICAL: ${activity.value > 1000000 ? 'Mega' : 'Large'} whale ${activity.type.toLowerCase()} detected`,
            `🐋 Institutional-size ${activity.type.toLowerCase()} order spotted`,
            `⚡ Market-moving whale activity identified`
          ],
          HIGH: [
            `⚠️ HIGH: Significant whale ${activity.type.toLowerCase()} detected`,
            `🎯 Large player entering ${activity.symbol}`,
            `📈 Major volume spike from whale activity`
          ]
        };

        const messages = alertMessages[activity.impact as 'CRITICAL' | 'HIGH'];
        const message = messages[Math.floor(Math.random() * messages.length)];

        alerts.push({
          id: `alert-${activity.id}`,
          symbol: activity.symbol,
          message,
          severity: activity.impact === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
          timestamp: activity.timestamp,
          actions: [
            'Monitor price action',
            'Check order book depth',
            'Watch for follow-through',
            'Consider position adjustment'
          ]
        });
      }
    });

    return alerts;
  };

  const fetchWhaleActivity = async () => {
    try {
      setLoading(true);
      setError(null);

      let activities: WhaleActivity[] = [];

      try {
        // Try to use enhanced whale activity API first
        console.log('🐋 Calling whale activity API with symbols:', symbols, 'minSize:', minWhaleSize);
        const whaleResponse = await marketApi.getWhaleActivity(symbols, minWhaleSize);
        console.log('🐋 Whale API response:', whaleResponse);

        if (whaleResponse.success && Array.isArray(whaleResponse.data)) {
          console.log(`✅ Received ${whaleResponse.data.length} whale activities from API`);
          activities = whaleResponse.data;
        } else {
          console.error('❌ Whale activity API returned invalid data:', whaleResponse);
          throw new Error(`API Error: ${whaleResponse.error || 'Invalid response format'}`);
        }
      } catch (apiError) {
        console.error('❌ Enhanced whale API failed:', apiError);
        const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown error';
        console.error('Error details:', errorMessage);

        // Show user-friendly error instead of fallback
        setError(`API Error: ${errorMessage}. Please check backend logs.`);
        toast.error(`Whale Activity API Error: ${errorMessage}`);

        // Still try fallback but let user know
        console.warn('Attempting fallback to market analysis...');
        activities = await analyzeRealWhaleActivity();
      }

      const newAlerts = generateAlerts(activities);
      setWhaleActivities(activities);

      if (alertsEnabled) {
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 20)); // Keep last 20 alerts
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching whale activity:', err);
      setError('Failed to fetch whale activity');
      toast.error('Failed to fetch whale activity');
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
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatValue = (value: number): string => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  useEffect(() => {
    fetchWhaleActivity();
  }, [symbols, minWhaleSize]);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchWhaleActivity, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, symbols, minWhaleSize]);

  const filteredActivities = selectedSymbol
    ? whaleActivities.filter(activity => activity.symbol === selectedSymbol)
    : whaleActivities;

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-purple-600" />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Whale Activity Monitor</h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {filteredActivities.length} whale activities • {alerts.length} active alerts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAlertsEnabled(!alertsEnabled)}
              className={`p-2 rounded-lg transition-colors ${
                alertsEnabled
                  ? 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title={alertsEnabled ? 'Disable Alerts' : 'Enable Alerts'}
            >
              {alertsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
            <button
              onClick={fetchWhaleActivity}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
              title={loading ? 'Updating...' : 'Refresh Activity'}
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

        {/* Controls */}
        <div className="mt-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={selectedSymbol || ''}
            onChange={(e) => setSelectedSymbol(e.target.value || null)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="">All Symbols</option>
            {symbols.map(symbol => (
              <option key={symbol} value={symbol}>{symbol.replace('USDT', '')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts Section */}
      {alertsEnabled && alerts.length > 0 && (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium text-gray-900">Active Alerts</span>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {alerts.slice(0, 3).map(alert => (
              <div
                key={alert.id}
                className={`p-2 rounded-lg text-xs ${ALERT_COLORS[alert.severity]}`}
              >
                <div className="font-medium">{alert.symbol.replace('USDT', '')} • {alert.message}</div>
                <div className="text-gray-600 mt-1">{formatTimeAgo(alert.timestamp)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {loading && whaleActivities.length === 0 ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded"></div>
                  <div className="space-y-2">
                    <div className="w-16 h-4 bg-gray-200 rounded"></div>
                    <div className="w-32 h-3 bg-gray-200 rounded"></div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="w-20 h-4 bg-gray-200 rounded"></div>
                  <div className="w-16 h-3 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Eye className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No whale activity detected</p>
            <p className="text-sm mt-1">Monitoring {symbols.length} symbols for large orders</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActivities.map((activity) => {
              const DirectionIcon = activity.type === 'BUY' ? ArrowUp : ArrowDown;

              return (
                <div key={activity.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <DirectionIcon className={`h-5 w-5 mt-0.5 ${
                        activity.type === 'BUY' ? 'text-green-600' : 'text-red-600'
                      }`} />

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{activity.symbol.replace('USDT', '')}</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            activity.type === 'BUY' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
                          }`}>
                            {activity.type}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${IMPACT_COLORS[activity.impact]}`}>
                            {activity.impact}
                          </span>
                          <span className="text-xs text-gray-500">{activity.exchange}</span>
                        </div>

                        <div className="text-sm text-gray-600 mb-2">
                          {formatValue(activity.value)} • {activity.size.toFixed(4)} @ ${activity.price.toFixed(2)} •
                          {activity.orderType} • {formatTimeAgo(activity.timestamp)}
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-2">
                          <div>
                            <span className="text-gray-500">Price Impact</span>
                            <div className="font-semibold text-purple-600">{activity.priceImpact.toFixed(2)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Volume Ratio</span>
                            <div className="font-semibold text-blue-600">{activity.volumeRatio.toFixed(1)}x</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Confidence</span>
                            <div className="font-semibold text-orange-600">{(activity.confidence * 100).toFixed(0)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Prediction</span>
                            <div className={`font-semibold ${
                              activity.prediction.direction === 'BULLISH' ? 'text-green-600' :
                              activity.prediction.direction === 'BEARISH' ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {activity.prediction.direction} ({(activity.prediction.probability * 100).toFixed(0)}%)
                            </div>
                          </div>
                        </div>

                        {/* Unusual Activity */}
                        {activity.unusualActivity.length > 0 && (
                          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                            <span className="font-medium text-yellow-800">Pattern: </span>
                            <span className="text-yellow-700">{activity.unusualActivity.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{formatValue(activity.value)}</div>
                      <div className="text-sm text-gray-600">{activity.orderType}</div>
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
export default function WhaleActivityMonitorWithErrorBoundary(props: WhaleActivityMonitorProps) {
  return (
    <TradingErrorBoundary
      componentName="Whale Activity Monitor"
      fallbackComponent="compact"
    >
      <WhaleActivityMonitor {...props} />
    </TradingErrorBoundary>
  );
}