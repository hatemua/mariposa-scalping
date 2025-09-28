'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
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

export default function WhaleActivityMonitor({
  symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT'],
  minWhaleSize = 100000, // $100k minimum
  autoRefresh = true,
  refreshInterval = 10000,
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

  const generateWhaleActivity = (): WhaleActivity[] => {
    const activities: WhaleActivity[] = [];

    symbols.forEach(symbol => {
      // Generate 1-3 whale activities per symbol
      const count = Math.floor(Math.random() * 3) + 1;

      for (let i = 0; i < count; i++) {
        const type: 'BUY' | 'SELL' = Math.random() > 0.5 ? 'BUY' : 'SELL';
        const size = Math.random() * 50 + 10; // 10-60 units
        const price = Math.random() * 1000 + 100; // $100-1100
        const value = size * price;

        if (value >= minWhaleSize) {
          const impact: WhaleActivity['impact'] =
            value > 1000000 ? 'CRITICAL' :
            value > 500000 ? 'HIGH' :
            value > 200000 ? 'MEDIUM' : 'LOW';

          const orderTypes: WhaleActivity['orderType'][] = ['MARKET', 'LIMIT', 'ICEBERG', 'TWAP', 'VWAP'];
          const orderType = orderTypes[Math.floor(Math.random() * orderTypes.length)];

          const unusualPatterns = [
            'Large order split detected',
            'Accumulation pattern identified',
            'Distribution pattern observed',
            'Smart money flow detected',
            'Institutional footprint found',
            'Stealth buying pattern'
          ];

          activities.push({
            id: `whale-${symbol}-${Date.now()}-${i}`,
            symbol,
            type,
            size,
            price,
            value,
            impact,
            confidence: Math.random() * 0.3 + 0.7, // 70-100%
            timestamp: new Date(Date.now() - Math.random() * 3600000).toISOString(), // Last hour
            exchange: ['Binance', 'OKX', 'Bybit'][Math.floor(Math.random() * 3)],
            orderType,
            priceImpact: Math.random() * 2 + 0.1, // 0.1-2.1%
            volumeRatio: Math.random() * 5 + 1, // 1-6x average
            unusualActivity: [unusualPatterns[Math.floor(Math.random() * unusualPatterns.length)]],
            marketBehavior: {
              followThrough: Math.random() > 0.5,
              resistanceBreak: Math.random() > 0.7,
              supportHold: Math.random() > 0.6,
              volumeSpike: Math.random() > 0.4
            },
            prediction: {
              direction: type === 'BUY' ?
                (Math.random() > 0.3 ? 'BULLISH' : 'NEUTRAL') :
                (Math.random() > 0.3 ? 'BEARISH' : 'NEUTRAL'),
              timeframe: ['5m', '15m', '1h', '4h'][Math.floor(Math.random() * 4)],
              probability: Math.random() * 0.4 + 0.6 // 60-100%
            }
          });
        }
      }
    });

    return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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

      // Generate mock whale activity data
      const activities = generateWhaleActivity();
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
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-6 w-6 text-purple-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Whale Activity Monitor</h3>
              <p className="text-sm text-gray-600">
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
              className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Refresh Activity"
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
        <div className="mt-4 flex items-center gap-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={selectedSymbol || ''}
            onChange={(e) => setSelectedSymbol(e.target.value || null)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1 bg-white"
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
      <div className="p-6">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 text-purple-600 animate-spin mr-2" />
            <span className="text-gray-600">Monitoring whale activity...</span>
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