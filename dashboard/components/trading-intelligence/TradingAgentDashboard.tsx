'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Bot,
  Play,
  Pause,
  Square,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Clock,
  Target,
  AlertTriangle,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  BarChart3,
  Zap,
  CheckCircle,
  XCircle,
  Plus
} from 'lucide-react';

interface AgentData {
  id: string;
  name: string;
  symbol: string;
  status: 'RUNNING' | 'STOPPED' | 'PAUSED' | 'ERROR';
  strategy: string;
  timeframe: string;
  performance: {
    totalPnL: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    maxDrawdown: number;
    sharpeRatio: number;
    avgWin: number;
    avgLoss: number;
  };
  currentPosition: {
    side: 'LONG' | 'SHORT' | null;
    size: number;
    entryPrice: number;
    unrealizedPnL: number;
    entryTime: string;
  } | null;
  lastSignal: {
    type: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    timestamp: string;
    reasoning: string;
  } | null;
  config: {
    maxPosition: number;
    stopLoss: number;
    takeProfit: number;
    riskPerTrade: number;
  };
  createdAt: string;
  lastUpdate: string;
}

interface TradingAgentDashboardProps {
  maxAgents?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const STATUS_COLORS = {
  RUNNING: 'text-green-600 bg-green-50 border-green-200',
  STOPPED: 'text-gray-600 bg-gray-50 border-gray-200',
  PAUSED: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  ERROR: 'text-red-600 bg-red-50 border-red-200'
};

const STATUS_ICONS = {
  RUNNING: Play,
  STOPPED: Square,
  PAUSED: Pause,
  ERROR: AlertTriangle
};

export default function TradingAgentDashboard({
  maxAgents = 6,
  autoRefresh = true,
  refreshInterval = 10000,
  className = ''
}: TradingAgentDashboardProps) {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);

      // Generate mock agent data - in real implementation, this would fetch from the backend
      const mockAgents: AgentData[] = [
        {
          id: 'agent-1',
          name: 'BTC Scalper Pro',
          symbol: 'BTCUSDT',
          status: 'RUNNING',
          strategy: 'Mean Reversion Scalping',
          timeframe: '1m',
          performance: {
            totalPnL: 2847.56,
            winRate: 68.5,
            totalTrades: 127,
            winningTrades: 87,
            losingTrades: 40,
            maxDrawdown: -156.23,
            sharpeRatio: 2.34,
            avgWin: 78.45,
            avgLoss: -45.23
          },
          currentPosition: {
            side: 'LONG',
            size: 0.0245,
            entryPrice: 97234.50,
            unrealizedPnL: 123.45,
            entryTime: new Date(Date.now() - 25 * 60 * 1000).toISOString()
          },
          lastSignal: {
            type: 'BUY',
            confidence: 0.78,
            timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            reasoning: 'Strong support bounce with volume confirmation'
          },
          config: {
            maxPosition: 1000,
            stopLoss: 2.5,
            takeProfit: 1.8,
            riskPerTrade: 2.0
          },
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          lastUpdate: new Date().toISOString()
        },
        {
          id: 'agent-2',
          name: 'ETH Momentum',
          symbol: 'ETHUSDT',
          status: 'RUNNING',
          strategy: 'Momentum Breakout',
          timeframe: '5m',
          performance: {
            totalPnL: 1523.89,
            winRate: 72.3,
            totalTrades: 89,
            winningTrades: 64,
            losingTrades: 25,
            maxDrawdown: -98.67,
            sharpeRatio: 1.89,
            avgWin: 95.67,
            avgLoss: -52.34
          },
          currentPosition: null,
          lastSignal: {
            type: 'HOLD',
            confidence: 0.45,
            timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
            reasoning: 'Waiting for clearer momentum signal'
          },
          config: {
            maxPosition: 500,
            stopLoss: 3.0,
            takeProfit: 2.2,
            riskPerTrade: 1.5
          },
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          lastUpdate: new Date().toISOString()
        },
        {
          id: 'agent-3',
          name: 'SOL Arbitrage',
          symbol: 'SOLUSDT',
          status: 'PAUSED',
          strategy: 'Cross-Exchange Arbitrage',
          timeframe: '1m',
          performance: {
            totalPnL: 456.23,
            winRate: 85.7,
            totalTrades: 42,
            winningTrades: 36,
            losingTrades: 6,
            maxDrawdown: -23.45,
            sharpeRatio: 3.12,
            avgWin: 34.56,
            avgLoss: -18.90
          },
          currentPosition: null,
          lastSignal: {
            type: 'HOLD',
            confidence: 0.23,
            timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
            reasoning: 'Insufficient arbitrage spread'
          },
          config: {
            maxPosition: 200,
            stopLoss: 1.0,
            takeProfit: 0.8,
            riskPerTrade: 1.0
          },
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          lastUpdate: new Date().toISOString()
        }
      ];

      setAgents(mockAgents);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching agents:', err);
      setError('Failed to fetch trading agents');
      toast.error('Failed to fetch trading agents');
    } finally {
      setLoading(false);
    }
  };

  const toggleAgentStatus = async (agentId: string, newStatus: 'RUNNING' | 'STOPPED' | 'PAUSED') => {
    try {
      // In real implementation, this would call the backend API
      setAgents(prev => prev.map(agent =>
        agent.id === agentId
          ? { ...agent, status: newStatus, lastUpdate: new Date().toISOString() }
          : agent
      ));

      const action = newStatus === 'RUNNING' ? 'started' :
                    newStatus === 'STOPPED' ? 'stopped' : 'paused';
      toast.success(`Agent ${action} successfully`);
    } catch (err) {
      console.error('Error updating agent status:', err);
      toast.error('Failed to update agent status');
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

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchAgents, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-blue-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Trading Agents</h3>
              <p className="text-sm text-gray-600">
                {agents.filter(a => a.status === 'RUNNING').length} running • {agents.length} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAgents}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Refresh Agents"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="p-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Create New Agent"
            >
              <Plus className="h-4 w-4" />
            </button>
            {lastUpdate && (
              <div className="text-xs text-gray-500">
                Updated {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>
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
            <span className="text-gray-600">Loading agents...</span>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Bot className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No trading agents configured</p>
            <button className="mt-2 text-blue-600 hover:text-blue-700 font-medium">
              Create your first agent
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => {
              const StatusIcon = STATUS_ICONS[agent.status];

              return (
                <div
                  key={agent.id}
                  className={`border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow ${
                    selectedAgent === agent.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <StatusIcon className={`h-5 w-5 mt-0.5 ${
                        agent.status === 'RUNNING' ? 'text-green-600' :
                        agent.status === 'ERROR' ? 'text-red-600' :
                        agent.status === 'PAUSED' ? 'text-yellow-600' : 'text-gray-600'
                      }`} />

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{agent.name}</span>
                          <span className="text-sm text-gray-500">({agent.symbol.replace('USDT', '')})</span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[agent.status]}`}>
                            {agent.status}
                          </span>
                        </div>

                        <div className="text-sm text-gray-600 mb-2">
                          {agent.strategy} • {agent.timeframe} • {formatTimeAgo(agent.lastUpdate)}
                        </div>

                        {/* Performance Summary */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500">Total P&L</span>
                            <div className={`font-semibold ${agent.performance.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${agent.performance.totalPnL.toFixed(2)}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500">Win Rate</span>
                            <div className="font-semibold text-blue-600">{agent.performance.winRate.toFixed(1)}%</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Total Trades</span>
                            <div className="font-semibold text-purple-600">{agent.performance.totalTrades}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Sharpe Ratio</span>
                            <div className="font-semibold text-orange-600">{agent.performance.sharpeRatio.toFixed(2)}</div>
                          </div>
                        </div>

                        {/* Current Position */}
                        {agent.currentPosition && (
                          <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">
                                {agent.currentPosition.side} Position • {agent.currentPosition.size} @ ${agent.currentPosition.entryPrice.toFixed(2)}
                              </span>
                              <span className={`font-semibold ${agent.currentPosition.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {agent.currentPosition.unrealizedPnL >= 0 ? '+' : ''}${agent.currentPosition.unrealizedPnL.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Last Signal */}
                        {agent.lastSignal && (
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="font-medium">{agent.lastSignal.type}</span> signal
                            ({(agent.lastSignal.confidence * 100).toFixed(0)}% confidence) •
                            {formatTimeAgo(agent.lastSignal.timestamp)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1 ml-3">
                      {agent.status === 'RUNNING' ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAgentStatus(agent.id, 'PAUSED');
                            }}
                            className="p-1 text-yellow-600 hover:bg-yellow-50 rounded"
                            title="Pause Agent"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAgentStatus(agent.id, 'STOPPED');
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Stop Agent"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAgentStatus(agent.id, 'RUNNING');
                          }}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Start Agent"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                        title="Agent Settings"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
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