'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  CheckSquare,
  Square,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Clock,
  DollarSign,
  RefreshCw,
  Eye,
  ArrowUp,
  ArrowDown,
  Minus,
  Bell,
  Settings,
  Play,
  Pause,
  Check,
  X
} from 'lucide-react';

interface TodoItem {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL' | 'WATCH' | 'EXIT' | 'ADJUST_STOP';
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  urgency: 'IMMEDIATE' | 'WITHIN_HOUR' | 'TODAY' | 'THIS_WEEK';
  price: number;
  targetPrice?: number;
  stopLoss?: number;
  reasoning: string;
  confidence: number;
  expectedReturn?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: string;
  completed: boolean;
  createdAt: string;
  dueBy?: string;
  marketCondition: string;
  actionSteps: string[];
}

interface TradingTodoListProps {
  symbols?: string[];
  maxTodos?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const PRIORITY_COLORS = {
  HIGH: 'text-red-600 bg-red-50 border-red-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  LOW: 'text-blue-600 bg-blue-50 border-blue-200'
};

const URGENCY_COLORS = {
  IMMEDIATE: 'text-red-700 bg-red-100',
  WITHIN_HOUR: 'text-orange-700 bg-orange-100',
  TODAY: 'text-yellow-700 bg-yellow-100',
  THIS_WEEK: 'text-blue-700 bg-blue-100'
};

const ACTION_ICONS = {
  BUY: ArrowUp,
  SELL: ArrowDown,
  WATCH: Eye,
  EXIT: X,
  ADJUST_STOP: Settings
};

const ACTION_COLORS = {
  BUY: 'text-green-600',
  SELL: 'text-red-600',
  WATCH: 'text-blue-600',
  EXIT: 'text-orange-600',
  ADJUST_STOP: 'text-purple-600'
};

export default function TradingTodoList({
  symbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT'
  ],
  maxTodos = 15,
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute
  className = ''
}: TradingTodoListProps) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const generateTradingTodos = async (): Promise<TodoItem[]> => {
    const todos: TodoItem[] = [];

    try {
      // Process symbols in batches for better performance
      const batchSize = 4;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);

        const batchPromises = batch.map(async (symbol) => {
          try {
            // Get real market data and analysis
            const [marketResponse, confluenceResponse] = await Promise.all([
              marketApi.getMarketData(symbol),
              marketApi.getRealTimeAnalysis(symbol)
            ]);

            if (!marketResponse.success || !confluenceResponse.success) {
              return [];
            }

            const marketData = marketResponse.data;
            const confluenceData = confluenceResponse.data;

            return generateTodosFromMarketData(symbol, marketData, confluenceData, null);

          } catch (error) {
            console.warn(`Failed to generate todos for ${symbol}:`, error);
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(symbolTodos => todos.push(...symbolTodos));

        // Small delay between batches
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      return todos
        .sort((a, b) => {
          const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
          const urgencyOrder = { IMMEDIATE: 4, WITHIN_HOUR: 3, TODAY: 2, THIS_WEEK: 1 };

          if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
          }
          if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
            return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
          }
          return b.confidence - a.confidence;
        })
        .slice(0, maxTodos);

    } catch (error) {
      console.error('Error generating trading todos:', error);
      return [];
    }
  };

  const generateTodosFromMarketData = (
    symbol: string,
    marketData: any,
    confluenceData: any,
    entrySignalsData: any
  ): TodoItem[] => {
    const todos: TodoItem[] = [];
    const price = marketData.price || 0;
    const change24h = marketData.change24h || 0;
    const volume24h = marketData.volume || 0;
    const score = confluenceData.score || 0;

    // Generate Buy/Sell recommendations
    if (score > 70) {
      const action = confluenceData.factors?.trendScore > 0 ? 'BUY' : 'SELL';
      const confidence = confluenceData.confidence || 0.5;
      const expectedReturn = Math.min(8, Math.max(1, score / 15));

      const priority: TodoItem['priority'] =
        score > 85 ? 'HIGH' : score > 75 ? 'MEDIUM' : 'LOW';

      const urgency: TodoItem['urgency'] =
        score > 90 ? 'IMMEDIATE' :
        score > 80 ? 'WITHIN_HOUR' :
        score > 75 ? 'TODAY' : 'THIS_WEEK';

      const targetPrice = action === 'BUY' ?
        price * (1 + expectedReturn / 100) :
        price * (1 - expectedReturn / 100);

      const stopLoss = action === 'BUY' ?
        price * 0.975 : // 2.5% stop for buy
        price * 1.025;  // 2.5% stop for sell

      todos.push({
        id: `${action.toLowerCase()}-${symbol}-${Date.now()}`,
        symbol,
        action,
        title: `${action} ${symbol.replace('USDT', '')} - Strong Signal`,
        description: `${action === 'BUY' ? 'Enter long position' : 'Enter short position'} on ${symbol.replace('USDT', '')} at current levels`,
        priority,
        urgency,
        price,
        targetPrice,
        stopLoss,
        reasoning: `${score.toFixed(0)}% confluence score with strong ${action.toLowerCase()} signals across multiple timeframes`,
        confidence: confidence * 100,
        expectedReturn,
        riskLevel: volume24h > 20000000 ? 'LOW' : volume24h > 5000000 ? 'MEDIUM' : 'HIGH',
        timeframe: confluenceData.strongestTimeframe || '1h',
        completed: false,
        createdAt: new Date().toISOString(),
        dueBy: urgency === 'IMMEDIATE' ?
          new Date(Date.now() + 15 * 60 * 1000).toISOString() : // 15 minutes
          urgency === 'WITHIN_HOUR' ?
          new Date(Date.now() + 60 * 60 * 1000).toISOString() : // 1 hour
          new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours
        marketCondition: determineMarketCondition(marketData),
        actionSteps: generateActionSteps(action, symbol, price, targetPrice, stopLoss)
      });
    }

    // Generate Watch recommendations for moderate signals
    if (score > 55 && score <= 70) {
      todos.push({
        id: `watch-${symbol}-${Date.now()}`,
        symbol,
        action: 'WATCH',
        title: `Watch ${symbol.replace('USDT', '')} - Developing Setup`,
        description: `Monitor ${symbol.replace('USDT', '')} for potential entry opportunity`,
        priority: 'LOW',
        urgency: 'TODAY',
        price,
        reasoning: `Moderate confluence score (${score.toFixed(0)}%) suggests developing opportunity`,
        confidence: (confluenceData.confidence || 0.4) * 100,
        riskLevel: 'MEDIUM',
        timeframe: '1h',
        completed: false,
        createdAt: new Date().toISOString(),
        marketCondition: determineMarketCondition(marketData),
        actionSteps: [
          'Monitor price action near current levels',
          'Watch for volume confirmation',
          'Wait for confluence score to improve above 70%',
          'Set alerts for key price levels'
        ]
      });
    }

    // Generate exit recommendations for high volatility
    if (Math.abs(change24h) > 10) {
      const action = change24h > 0 ? 'SELL' : 'BUY';
      todos.push({
        id: `exit-${symbol}-${Date.now()}`,
        symbol,
        action: 'EXIT',
        title: `Consider Exit on ${symbol.replace('USDT', '')} - High Volatility`,
        description: `Consider taking profits or cutting losses due to extreme price movement`,
        priority: 'HIGH',
        urgency: 'IMMEDIATE',
        price,
        reasoning: `Extreme ${change24h > 0 ? 'upward' : 'downward'} movement (${Math.abs(change24h).toFixed(1)}%) suggests potential reversal`,
        confidence: 75,
        riskLevel: 'HIGH',
        timeframe: '15m',
        completed: false,
        createdAt: new Date().toISOString(),
        dueBy: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
        marketCondition: 'VOLATILE',
        actionSteps: [
          'Review current positions in this asset',
          'Consider taking partial profits if in profit',
          'Tighten stop losses to protect gains',
          'Avoid new entries until volatility subsides'
        ]
      });
    }

    return todos;
  };

  const determineMarketCondition = (marketData: any): string => {
    const change24h = Math.abs(marketData.change24h || 0);
    const volume = marketData.volume || 0;

    if (change24h > 8) return 'Highly Volatile';
    if (change24h > 3 && volume > 20000000) return 'Strong Trending';
    if (change24h < 1 && volume < 5000000) return 'Low Activity';
    if (change24h > 2) return 'Active Trading';
    return 'Stable';
  };

  const generateActionSteps = (
    action: 'BUY' | 'SELL',
    symbol: string,
    price: number,
    targetPrice: number,
    stopLoss: number
  ): string[] => {
    const steps = [];

    if (action === 'BUY') {
      steps.push(`Place buy order for ${symbol.replace('USDT', '')} at market price (~$${price.toFixed(4)})`);
      steps.push(`Set take profit at $${targetPrice.toFixed(4)} (+${((targetPrice - price) / price * 100).toFixed(1)}%)`);
      steps.push(`Set stop loss at $${stopLoss.toFixed(4)} (-${((price - stopLoss) / price * 100).toFixed(1)}%)`);
      steps.push('Monitor price action and volume for confirmation');
    } else {
      steps.push(`Place sell order for ${symbol.replace('USDT', '')} at market price (~$${price.toFixed(4)})`);
      steps.push(`Set take profit at $${targetPrice.toFixed(4)} (-${((price - targetPrice) / price * 100).toFixed(1)}%)`);
      steps.push(`Set stop loss at $${stopLoss.toFixed(4)} (+${((stopLoss - price) / price * 100).toFixed(1)}%)`);
      steps.push('Monitor price action and volume for confirmation');
    }

    return steps;
  };

  const fetchTodos = async () => {
    try {
      setLoading(true);
      setError(null);

      const newTodos = await generateTradingTodos();
      setTodos(newTodos);
      setLastUpdate(new Date());

    } catch (err) {
      console.error('Error fetching trading todos:', err);
      setError('Failed to fetch trading recommendations');
      toast.error('Failed to fetch trading recommendations');
    } finally {
      setLoading(false);
    }
  };

  const toggleTodoCompletion = (id: string) => {
    setTodos(prev => prev.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
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

  const formatDueBy = (timestamp: string): string => {
    const now = new Date();
    const due = new Date(timestamp);
    const diffMs = due.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 0) return 'Overdue';
    if (diffMins < 60) return `${diffMins}m left`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h left`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d left`;
  };

  useEffect(() => {
    fetchTodos();
  }, [symbols, maxTodos]);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchTodos, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, symbols, maxTodos]);

  const filteredTodos = todos.filter(todo => {
    if (filter === 'PENDING') return !todo.completed;
    if (filter === 'COMPLETED') return todo.completed;
    return true;
  });

  const completedCount = todos.filter(todo => todo.completed).length;

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-6 w-6 text-green-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Trading Action Items</h3>
              <p className="text-sm text-gray-600">
                {filteredTodos.length} tasks • {completedCount} completed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchTodos}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Refresh Todos"
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

        {/* Filter Controls */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            {(['ALL', 'PENDING', 'COMPLETED'] as const).map(filterType => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  filter === filterType
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {filterType === 'ALL' ? 'All' : filterType === 'PENDING' ? 'To Do' : 'Done'}
              </button>
            ))}
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
            <RefreshCw className="h-6 w-6 text-green-600 animate-spin mr-2" />
            <span className="text-gray-600">Analyzing markets...</span>
          </div>
        ) : filteredTodos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No {filter.toLowerCase()} tasks found</p>
            <p className="text-sm mt-1">
              {filter === 'PENDING' ? 'All caught up! Check back later for new opportunities.' : 'Tasks will appear here as market conditions develop'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTodos.map((todo) => {
              const ActionIcon = ACTION_ICONS[todo.action];
              const isOverdue = todo.dueBy && new Date(todo.dueBy) < new Date();

              return (
                <div
                  key={todo.id}
                  className={`border rounded-lg p-4 transition-all ${
                    todo.completed
                      ? 'border-gray-200 bg-gray-50 opacity-75'
                      : isOverdue
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleTodoCompletion(todo.id)}
                      className={`mt-1 p-1 rounded transition-colors ${
                        todo.completed
                          ? 'text-green-600 hover:text-green-700'
                          : 'text-gray-400 hover:text-green-600'
                      }`}
                    >
                      {todo.completed ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </button>

                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ActionIcon className={`h-4 w-4 ${ACTION_COLORS[todo.action]}`} />
                          <span className={`font-semibold ${todo.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                            {todo.title}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${PRIORITY_COLORS[todo.priority]}`}>
                            {todo.priority}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${URGENCY_COLORS[todo.urgency]}`}>
                            {todo.urgency.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <div>{formatTimeAgo(todo.createdAt)}</div>
                          {todo.dueBy && (
                            <div className={isOverdue ? 'text-red-600 font-medium' : ''}>
                              {formatDueBy(todo.dueBy)}
                            </div>
                          )}
                        </div>
                      </div>

                      <p className={`text-sm mb-2 ${todo.completed ? 'text-gray-500' : 'text-gray-600'}`}>
                        {todo.description}
                      </p>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs mb-3">
                        <div>
                          <span className="text-gray-500">Price</span>
                          <div className="font-semibold">${todo.price.toFixed(4)}</div>
                        </div>
                        {todo.targetPrice && (
                          <div>
                            <span className="text-gray-500">Target</span>
                            <div className="font-semibold text-green-600">${todo.targetPrice.toFixed(4)}</div>
                          </div>
                        )}
                        {todo.stopLoss && (
                          <div>
                            <span className="text-gray-500">Stop Loss</span>
                            <div className="font-semibold text-red-600">${todo.stopLoss.toFixed(4)}</div>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">Confidence</span>
                          <div className="font-semibold text-blue-600">{todo.confidence.toFixed(0)}%</div>
                        </div>
                      </div>

                      <div className="text-xs text-gray-600 mb-2">
                        <strong>Why:</strong> {todo.reasoning}
                      </div>

                      {/* Action Steps */}
                      <div className="text-xs">
                        <span className="text-gray-500 font-medium">Action Steps:</span>
                        <ul className="mt-1 space-y-1">
                          {todo.actionSteps.map((step, index) => (
                            <li key={index} className="flex items-start gap-2 text-gray-600">
                              <span className="text-blue-500 font-bold">{index + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
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