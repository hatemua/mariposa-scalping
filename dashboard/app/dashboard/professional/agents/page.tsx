'use client';

import React from 'react';
import { ArrowLeft, Bot } from 'lucide-react';
import Link from 'next/link';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';
import { TradingAgentDashboard } from '@/lib/dynamicComponents';

const TradingAgentsPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/dashboard/professional" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <Bot className="h-7 w-7 text-cyan-600" />
            <h1 className="text-2xl font-bold text-gray-900">Trading Agents</h1>
            <span className="px-2 py-1 bg-cyan-100 text-cyan-700 text-xs font-medium rounded-full">
              AUTOMATED
            </span>
          </div>
          <p className="text-gray-600">
            Autonomous trading bots with performance monitoring and intelligent strategy execution
          </p>
        </div>

        {/* Agent Status Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Fleet Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">6</div>
              <div className="text-sm text-green-700">Active Agents</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">142</div>
              <div className="text-sm text-blue-700">Total Trades</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600">+8.7%</div>
              <div className="text-sm text-emerald-700">Net Performance</div>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">0</div>
              <div className="text-sm text-orange-700">Errors Today</div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Trading Agent Dashboard - Primary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <TradingAgentDashboard
              maxAgents={8}
              autoRefresh={true}
              refreshInterval={15000}
              className="w-full"
            />
          </div>

          {/* Agent Performance Stats */}
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-cyan-900 mb-4">Fleet Performance Analytics</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-cyan-600">6</div>
                <div className="text-sm text-cyan-700">Active Bots</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-600">+8.7%</div>
                <div className="text-sm text-cyan-700">Performance</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-600">142</div>
                <div className="text-sm text-cyan-700">Total Trades</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-600">73%</div>
                <div className="text-sm text-cyan-700">Win Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-600">1.4</div>
                <div className="text-sm text-cyan-700">Profit Factor</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-cyan-600">24/7</div>
                <div className="text-sm text-cyan-700">Uptime</div>
              </div>
            </div>
          </div>

          {/* Agent Management */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h4>
              <div className="space-y-3">
                <button className="w-full px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
                  Deploy New Agent
                </button>
                <button className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  Pause All Agents
                </button>
                <button className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors">
                  Emergency Stop
                </button>
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Concurrent</span>
                  <span className="font-medium">8 agents</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Risk Per Agent</span>
                  <span className="font-medium">1.5%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Auto-Rebalance</span>
                  <span className="font-medium text-green-600">Enabled</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Strategy</span>
                  <span className="font-medium">Adaptive</span>
                </div>
              </div>
            </div>

            {/* Health Monitor */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">System Health</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">API Connection</span>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">Stable</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">WebSocket</span>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">Connected</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Memory Usage</span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">45%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">CPU Load</span>
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">23%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingAgentsPage;