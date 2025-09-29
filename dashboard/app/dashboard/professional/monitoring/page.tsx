'use client';

import React, { useState } from 'react';
import { ArrowLeft, Monitor } from 'lucide-react';
import Link from 'next/link';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';
import { WhaleActivityMonitor, ExitStrategyPanel } from '@/lib/dynamicComponents';

const MarketMonitoringPage = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');

  const monitoredSymbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/dashboard/professional" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <Monitor className="h-7 w-7 text-orange-600" />
            <h1 className="text-2xl font-bold text-gray-900">Market Monitoring</h1>
            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
              SURVEILLANCE
            </span>
          </div>
          <p className="text-gray-600">
            Whale activity detection, institutional flow analysis, and intelligent exit strategy management
          </p>
        </div>

        {/* Monitoring Dashboard */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Active Surveillance</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">Live Monitoring</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">3</div>
              <div className="text-sm text-orange-700">Whale Alerts</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">$2.4M</div>
              <div className="text-sm text-blue-700">Large Orders</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">10</div>
              <div className="text-sm text-purple-700">Monitored Assets</div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">5</div>
              <div className="text-sm text-green-700">Exit Signals</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">2</div>
              <div className="text-sm text-red-700">Risk Alerts</div>
            </div>
          </div>
        </div>

        {/* Symbol Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Focus Symbol</h3>
            <div className="text-sm text-gray-600">
              Tracking: <span className="font-medium text-orange-600">{selectedSymbol}</span>
            </div>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2">
            {monitoredSymbols.map(symbol => (
              <button
                key={symbol}
                onClick={() => setSelectedSymbol(symbol)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedSymbol === symbol
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {symbol.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Whale Activity Monitor - Primary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <WhaleActivityMonitor
              symbols={[selectedSymbol, ...monitoredSymbols.filter(s => s !== selectedSymbol).slice(0, 4)]}
              minWhaleSize={50000}
              autoRefresh={true}
              refreshInterval={10000}
              enableAlerts={true}
              className="w-full"
            />
          </div>

          {/* Exit Strategy Panel - Secondary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <ExitStrategyPanel
              symbol={selectedSymbol}
              position={{
                side: 'LONG',
                entryPrice: 0,
                size: 0,
                entryTime: new Date().toISOString()
              }}
              autoRefresh={true}
              refreshInterval={10000}
              className="w-full"
            />
          </div>

          {/* Monitoring Stats */}
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-orange-900 mb-4">Surveillance Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-orange-600">3</div>
                <div className="text-sm text-orange-700">Whale Alerts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">$2.4M</div>
                <div className="text-sm text-orange-700">Total Volume</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">5</div>
                <div className="text-sm text-orange-700">Exit Signals</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">10</div>
                <div className="text-sm text-orange-700">Assets Tracked</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">Real-Time</div>
                <div className="text-sm text-orange-700">Data Feed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">24/7</div>
                <div className="text-sm text-orange-700">Monitoring</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketMonitoringPage;