'use client';

import { useEffect, useState } from 'react';
import { agentApi, marketApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { Agent, MarketData } from '@/types';
import { toast } from 'react-hot-toast';
import { Activity, TrendingUp, DollarSign, Bot } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ErrorBoundary from '@/components/ErrorBoundary';
import OKXSetupPrompt from '@/components/OKXSetupPrompt';
import { useOKXCredentials } from '@/hooks/useOKXCredentials';

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);
  const [showOKXPrompt, setShowOKXPrompt] = useState(false);
  const [user, setUser] = useState<any>(null);

  const { hasCredentials, isLoading: credentialsLoading } = useOKXCredentials();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      wsClient.connect(token);
      loadDashboardData();
    }

    // Load user data (similar to DashboardLayout)
    const userData = {
      name: 'Trading User',
      email: localStorage.getItem('userEmail') || 'user@example.com'
    };
    setUser(userData);

    return () => {
      wsClient.disconnect();
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      const [agentsResponse, balanceResponse] = await Promise.all([
        agentApi.getAgents(),
        marketApi.getBalance(),
      ]);

      if (agentsResponse.success) {
        setAgents(agentsResponse.data);

        // Extract unique symbols, filtering out intelligent agents (no symbol or symbol='ALL')
        const uniqueSymbols = new Set(
          agentsResponse.data
            .map((a: Agent) => a.symbol)
            .filter((symbol: string | undefined): symbol is string => symbol != null && symbol !== 'ALL')
        );
        const symbols = Array.from(uniqueSymbols) as string[];
        const marketPromises = symbols.map((symbol: string) =>
          marketApi.getMarketData(symbol).catch(() => null)
        );

        const marketResponses = await Promise.all(marketPromises);
        const marketDataMap: Record<string, MarketData> = {};

        marketResponses.forEach((response, index) => {
          if (response?.success) {
            marketDataMap[symbols[index]] = response.data;
          }
        });

        setMarketData(marketDataMap);
      }

      if (balanceResponse.success) {
        setBalance(balanceResponse.data);
      }
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const totalPnL = agents.reduce((sum, agent) => sum + (agent.performance?.totalPnL || 0), 0);
  const totalTrades = agents.reduce((sum, agent) => sum + (agent.performance?.totalTrades || 0), 0);
  const activeAgents = agents.filter(agent => agent.isActive).length;
  const avgWinRate = agents.length > 0
    ? agents.reduce((sum, agent) => sum + (agent.performance?.winRate || 0), 0) / agents.length
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-dark-50 dark:via-dark-100 dark:to-dark-200 flex items-center justify-center">
        <div className="glass-effect rounded-2xl p-8 text-center animate-fade-in">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <span className="text-gray-600 dark:text-gray-300 font-medium">Loading dashboard data...</span>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout>
      <div className="responsive-container py-6 space-y-8">
        {/* Header Section */}
        <div className="animate-fade-in-down">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Welcome back, {user?.name?.split(' ')[0] || 'Trader'}
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Monitor your scalping agents and trading performance
              </p>
            </div>
            <div className="mt-4 sm:mt-0">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce-gentle"></div>
                <span>Live data</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in-up">
            <a
              href="/dashboard/market"
              className="group glass-effect rounded-xl p-4 card-hover border border-blue-200/50 dark:border-blue-800/50 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Market Data</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Real-time market analysis</p>
                </div>
              </div>
            </a>

            <a
              href="/dashboard/recommendations"
              className="group glass-effect rounded-xl p-4 card-hover border border-purple-200/50 dark:border-purple-800/50 hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:scale-110 transition-transform duration-300">
                  <Activity className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">AI Insights</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Trading recommendations</p>
                </div>
              </div>
            </a>

            <a
              href="/dashboard/agents/create"
              className="group glass-effect rounded-xl p-4 card-hover border border-green-200/50 dark:border-green-800/50 hover:border-green-300 dark:hover:border-green-700 transition-all duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:scale-110 transition-transform duration-300">
                  <Bot className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Create Agent</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Deploy new trading bot</p>
                </div>
              </div>
            </a>
          </div>
        </div>

        {/* OKX Setup Prompt */}
        {!credentialsLoading && !hasCredentials && (
          <div className="mb-8">
            <OKXSetupPrompt
              variant="card"
              showFeatures={true}
              onDismiss={() => setShowOKXPrompt(false)}
              className="w-full"
            />
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in-up">
          {/* Total P&L Card */}
          <div className="group glass-effect rounded-2xl p-6 card-hover border border-white/20 dark:border-gray-700/30 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-green-400/5 to-emerald-500/5 dark:from-green-400/10 dark:to-emerald-500/10"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl gradient-secondary shadow-medium group-hover:scale-110 transition-transform duration-300">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  totalPnL >= 0
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {totalPnL >= 0 ? '↗' : '↘'} {totalPnL >= 0 ? 'Profit' : 'Loss'}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Total P&L</p>
                <p className={`text-3xl font-bold mb-2 ${
                  totalPnL >= 0 ? 'price-positive' : 'price-negative'
                }`}>
                  ${Math.abs(totalPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-1000 ${
                      totalPnL >= 0 ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(Math.abs(totalPnL) / 1000 * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Total Trades Card */}
          <div className="group glass-effect rounded-2xl p-6 card-hover border border-white/20 dark:border-gray-700/30 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 to-cyan-500/5 dark:from-blue-400/10 dark:to-cyan-500/10"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 shadow-medium group-hover:scale-110 transition-transform duration-300">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <div className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  Active
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Total Trades</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {totalTrades.toLocaleString()}
                </p>
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-bounce-gentle"></div>
                  <span>Real-time tracking</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Agents Card */}
          <div className="group glass-effect rounded-2xl p-6 card-hover border border-white/20 dark:border-gray-700/30 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 to-pink-500/5 dark:from-purple-400/10 dark:to-pink-500/10"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 shadow-medium group-hover:scale-110 transition-transform duration-300">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <div className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                  {((activeAgents / Math.max(agents.length, 1)) * 100).toFixed(0)}% Active
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Trading Agents</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {activeAgents}<span className="text-lg text-gray-500 dark:text-gray-400">/{agents.length}</span>
                </p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000"
                    style={{ width: `${(activeAgents / Math.max(agents.length, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Average Win Rate Card */}
          <div className="group glass-effect rounded-2xl p-6 card-hover border border-white/20 dark:border-gray-700/30 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400/5 to-red-500/5 dark:from-orange-400/10 dark:to-red-500/10"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 shadow-medium group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  avgWinRate >= 60
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : avgWinRate >= 40
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {avgWinRate >= 60 ? 'Excellent' : avgWinRate >= 40 ? 'Good' : 'Improving'}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Avg Win Rate</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {avgWinRate.toFixed(1)}<span className="text-lg">%</span>
                </p>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-1000 ${
                      avgWinRate >= 60 ? 'bg-green-500' : avgWinRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${avgWinRate}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Agents Grid */}
        <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Your Trading Agents</h2>
            <a
              href="/dashboard/agents"
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium text-sm transition-colors duration-200"
            >
              View all agents →
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {agents.map((agent, index) => {
              const market = agent.symbol && agent.symbol !== 'ALL' ? marketData[agent.symbol] : null;
              const pnl = agent.performance?.totalPnL || 0;
              const winRate = agent.performance?.winRate || 0;
              const trades = agent.performance?.totalTrades || 0;
              const isIntelligent = !agent.symbol || agent.symbol === 'ALL';

              return (
                <div
                  key={agent._id}
                  className="group glass-effect rounded-2xl shadow-medium border border-white/20 dark:border-gray-700/30 p-6 card-hover animate-scale-in"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Agent Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors duration-200">
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isIntelligent ? (
                          <>
                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-semibold rounded-full">
                              {agent.category || 'INTELLIGENT'}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">
                              Risk {agent.riskLevel || 3}/5
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-gray-600 dark:text-gray-400 font-medium">{agent.symbol}</span>
                            {market && (
                              <span className={`text-sm font-medium ${
                                market.change24h >= 0 ? 'price-positive' : 'price-negative'
                              }`}>
                                {market.change24h >= 0 ? '+' : ''}{market.change24h.toFixed(2)}%
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium shadow-sm transition-all duration-300 group-hover:scale-105 ${
                        agent.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ring-1 ring-gray-200 dark:ring-gray-700'
                      }`}>
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            agent.isActive ? 'bg-green-500 animate-bounce-gentle' : 'bg-gray-400'
                          }`}></div>
                          {agent.isActive ? 'Active' : 'Inactive'}
                        </div>
                      </span>
                    </div>
                  </div>

                  {/* Market Data */}
                  {market && (
                    <div className="mb-4 p-4 glass-effect-strong rounded-xl border border-blue-100/50 dark:border-blue-800/30">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current Price</span>
                          <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                            ${market.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">24h Volume</span>
                          <p className="font-medium text-gray-700 dark:text-gray-300">
                            ${market.volume?.toLocaleString() || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Performance Metrics */}
                  <div className="space-y-4 mb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">P&L</span>
                      <div className="text-right">
                        <span className={`font-bold text-lg ${
                          pnl >= 0 ? 'price-positive' : 'price-negative'
                        }`}>
                          {pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Win Rate</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-1000 ${
                              winRate >= 60 ? 'bg-green-500' : winRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${winRate}%` }}
                          ></div>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                          {winRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Trades</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {trades.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={() => window.location.href = `/dashboard/agents/${agent._id}`}
                    className="w-full gradient-primary text-white py-3 px-4 rounded-xl hover:shadow-medium transition-all duration-300 font-medium group-hover:scale-105 flex items-center justify-center gap-2"
                  >
                    <span>View Details</span>
                    <TrendingUp className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {agents.length === 0 && (
          <div className="glass-effect rounded-2xl shadow-medium border border-white/20 dark:border-gray-700/30 p-12 text-center animate-fade-in">
            <div className="w-20 h-20 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-medium animate-float">
              <Bot className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">No Trading Agents Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto leading-relaxed">
              Create your first automated trading agent to start capitalizing on market opportunities 24/7
            </p>
            <div className="space-y-4">
              <button
                onClick={() => window.location.href = '/dashboard/agents/create'}
                className="gradient-primary text-white px-8 py-4 rounded-xl hover:shadow-medium transition-all duration-300 font-medium hover:scale-105 inline-flex items-center gap-2"
              >
                <Bot className="h-5 w-5" />
                Create Your First Agent
              </button>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Get started in just a few minutes with our guided setup
              </p>
            </div>
          </div>
        )}
      </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}