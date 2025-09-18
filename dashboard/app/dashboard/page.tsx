'use client';

import { useEffect, useState } from 'react';
import { agentApi, marketApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { Agent, MarketData } from '@/types';
import { toast } from 'react-hot-toast';
import { Activity, TrendingUp, DollarSign, Bot } from 'lucide-react';

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    wsClient.connect(token);
    loadDashboardData();

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

        const symbols = [...new Set(agentsResponse.data.map((a: Agent) => a.symbol))];
        const marketPromises = symbols.map(symbol =>
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Monitor your scalping agents and performance</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-green-100">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total P&L</p>
                <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${totalPnL.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-blue-100">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Trades</p>
                <p className="text-2xl font-bold text-gray-900">{totalTrades}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-purple-100">
                <Bot className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Agents</p>
                <p className="text-2xl font-bold text-gray-900">{activeAgents}/{agents.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center">
              <div className="p-3 rounded-full bg-orange-100">
                <TrendingUp className="h-6 w-6 text-orange-600" />
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
              <div key={agent._id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-gray-600">{agent.symbol}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    agent.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {agent.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {market && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Current Price</span>
                      <span className="font-medium">${market.price.toFixed(4)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">24h Change</span>
                      <span className={`font-medium ${
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

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => window.location.href = `/agents/${agent._id}`}
                    className="w-full bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {agents.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Agents Created</h3>
            <p className="text-gray-600 mb-6">Create your first scalping agent to get started</p>
            <button
              onClick={() => window.location.href = '/agents/create'}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Create Agent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}