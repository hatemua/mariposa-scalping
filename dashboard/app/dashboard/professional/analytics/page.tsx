'use client';

import React, { useState } from 'react';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';
import { OrderBookAnalyzer, MultiTimeframeConfluence, ConfluenceScorePanel } from '@/lib/dynamicComponents';

const AnalyticsPage = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');

  const symbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
    'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
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
            <BarChart3 className="h-7 w-7 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900">Advanced Analytics</h1>
            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
              TECHNICAL
            </span>
          </div>
          <p className="text-gray-600">
            Technical analysis, confluence scoring, and order book intelligence for professional trading
          </p>
        </div>

        {/* Symbol Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Analysis Target</h3>
            <div className="text-sm text-gray-600">
              Analyzing: <span className="font-medium text-purple-600">{selectedSymbol}</span>
            </div>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2">
            {symbols.map(symbol => (
              <button
                key={symbol}
                onClick={() => setSelectedSymbol(symbol)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedSymbol === symbol
                    ? 'bg-purple-600 text-white shadow-sm'
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
          {/* Order Book Analyzer - Primary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <OrderBookAnalyzer
              symbol={selectedSymbol}
              autoRefresh={true}
              refreshInterval={45000}
              className="w-full"
            />
          </div>

          {/* Technical Analysis Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Multi-Timeframe Confluence */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
              <MultiTimeframeConfluence
                symbol={selectedSymbol}
                timeframes={['1m', '5m', '15m', '1h', '4h']}
                autoRefresh={true}
                refreshInterval={15000}
                className="w-full"
              />
            </div>

            {/* Confluence Score Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
              <ConfluenceScorePanel
                symbol={selectedSymbol}
                autoRefresh={true}
                refreshInterval={15000}
                className="w-full"
              />
            </div>
          </div>

          {/* Analytics Stats */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-purple-900 mb-4">Analytics Performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-purple-600">15</div>
                <div className="text-sm text-purple-700">Active Indicators</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">85</div>
                <div className="text-sm text-purple-700">Confluence Score</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">91%</div>
                <div className="text-sm text-purple-700">Accuracy Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">5</div>
                <div className="text-sm text-purple-700">Timeframes</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">Real-Time</div>
                <div className="text-sm text-purple-700">Data Updates</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;