'use client';

import { useEffect, useState } from 'react';
import { agentApi, marketApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { Agent, MarketData } from '@/types';
import { toast } from 'react-hot-toast';
import { Activity, TrendingUp, DollarSign, Bot } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      wsClient.connect(token);
      loadDashboardData();
    }

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

        const uniqueSymbols = new Set(agentsResponse.data.map((a: Agent) => a.symbol));
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Monitor your scalping agents and performance</p>

          {/* Navigation Links */}
          <div className="flex flex-wrap gap-4 mt-6">
            <a
              href="/dashboard/market"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <TrendingUp className="h-4 w-4" />
              Market Data
            </a>
            <a
              href="/dashboard/recommendations"
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Activity className="h-4 w-4" />
              AI Recommendations
            </a>
            <a
              href="/dashboard/agents/create"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Bot className="h-4 w-4" />
              Create Agent
            </a>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
            <div className="flex items-center">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-green-400 to-emerald-500 shadow-lg">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total P&L</p>
                <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${totalPnL.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
            <div className="flex items-center">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-400 to-cyan-500 shadow-lg">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Trades</p>
                <p className="text-2xl font-bold text-gray-900">{totalTrades}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
            <div className="flex items-center">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-400 to-pink-500 shadow-lg">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Agents</p>
                <p className="text-2xl font-bold text-gray-900">{activeAgents}/{agents.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
            <div className="flex items-center">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-orange-400 to-red-500 shadow-lg">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Avg Win Rate</p>
                <p className="text-2xl font-bold text-gray-900">{avgWinRate.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {agents.map(agent => {
            const market = marketData[agent.symbol];
            const pnl = agent.performance?.totalPnL || 0;

            return (
              <div key={agent._id} className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-all duration-300 hover:transform hover:scale-105">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-gray-600 font-medium">{agent.symbol}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium shadow-sm ${
                    agent.isActive
                      ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white'
                      : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white'
                  }`}>
                    {agent.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {market && (
                  <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Current Price</span>
                      <span className="font-bold text-gray-900">${market.price.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-medium text-gray-700">24h Change</span>
                      <span className={`font-bold ${
                        market.change24h >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {market.change24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">P&L</span>
                    <span className={`font-medium ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${pnl.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Win Rate</span>
                    <span className="font-medium">{agent.performance?.winRate.toFixed(1) || 0}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trades</span>
                    <span className="font-medium">{agent.performance?.totalTrades || 0}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => window.location.href = `/dashboard/agents/${agent._id}`}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-4 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {agents.length === 0 && (
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-12 text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Bot className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Agents Created</h3>
            <p className="text-gray-600 mb-8">Create your first scalping agent to get started</p>
            <button
              onClick={() => window.location.href = '/dashboard/agents/create'}
              className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Create Agent
            </button>
          </div>
        )}
      </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}