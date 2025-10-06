'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import TradingAgentDashboard from '@/components/trading-intelligence/TradingAgentDashboard';
import { Bot, Plus, Filter, SlidersHorizontal } from 'lucide-react';

export default function AgentsPage() {
  const router = useRouter();
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterRiskLevel, setFilterRiskLevel] = useState<string>('ALL');

  const handleCreateAgent = () => {
    router.push('/dashboard/agents/create');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600 rounded-lg">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Trading Agents</h1>
                <p className="text-gray-600 mt-1">Manage and monitor your intelligent trading agents</p>
              </div>
            </div>
            <button
              onClick={handleCreateAgent}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-xl"
            >
              <Plus className="h-5 w-5" />
              Create New Agent
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>

              {/* Category Filter */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ALL">All Categories</option>
                <option value="SCALPING">Scalping</option>
                <option value="SWING">Swing Trading</option>
                <option value="DAY_TRADING">Day Trading</option>
                <option value="LONG_TERM">Long Term</option>
                <option value="ARBITRAGE">Arbitrage</option>
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ALL">All Status</option>
                <option value="RUNNING">Running</option>
                <option value="STOPPED">Stopped</option>
                <option value="PAUSED">Paused</option>
                <option value="ERROR">Error</option>
              </select>

              {/* Risk Level Filter */}
              <select
                value={filterRiskLevel}
                onChange={(e) => setFilterRiskLevel(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="ALL">All Risk Levels</option>
                <option value="1">Risk 1 - Very Conservative</option>
                <option value="2">Risk 2 - Conservative</option>
                <option value="3">Risk 3 - Moderate</option>
                <option value="4">Risk 4 - Aggressive</option>
                <option value="5">Risk 5 - Very Aggressive</option>
              </select>

              {filterCategory !== 'ALL' || filterStatus !== 'ALL' || filterRiskLevel !== 'ALL' ? (
                <button
                  onClick={() => {
                    setFilterCategory('ALL');
                    setFilterStatus('ALL');
                    setFilterRiskLevel('ALL');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear Filters
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Agent Dashboard Component */}
        <TradingAgentDashboard
          maxAgents={50}
          autoRefresh={true}
          refreshInterval={10000}
          className="mb-6"
        />

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Total Agents</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">--</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Active Agents</div>
            <div className="text-2xl font-bold text-green-600 mt-1">--</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Total P&L Today</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">$--</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Avg Win Rate</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">--%</div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">How Intelligent Agents Work</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Each agent analyzes market signals and uses AI to validate trades before execution</li>
            <li>• Position sizes are automatically calculated based on your risk level and available budget</li>
            <li>• Agents continuously monitor open positions and can exit early if market conditions change</li>
            <li>• LLM validation ensures only high-probability trades matching your agent's profile are executed</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
