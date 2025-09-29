'use client';

import React, { useState } from 'react';
import { ArrowLeft, Activity } from 'lucide-react';
import Link from 'next/link';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';
import { ProfessionalSignalFeed, SmartEntrySignals } from '@/lib/dynamicComponents';

const IntelligencePage = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');

  const symbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT'
  ];

  const allSymbols = [
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
            <Activity className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Trading Intelligence</h1>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              AI-POWERED
            </span>
          </div>
          <p className="text-gray-600">
            AI-powered signals with entry/exit recommendations and smart signal detection
          </p>
        </div>

        {/* Symbol Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Active Symbol</h3>
            <div className="text-sm text-gray-600">
              Selected: <span className="font-medium text-blue-600">{selectedSymbol}</span>
            </div>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2">
            {allSymbols.map(symbol => (
              <button
                key={symbol}
                onClick={() => setSelectedSymbol(symbol)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedSymbol === symbol
                    ? 'bg-blue-600 text-white shadow-sm'
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
          {/* Professional Signal Feed - Primary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <ProfessionalSignalFeed
              symbols={[selectedSymbol, ...symbols.filter(s => s !== selectedSymbol)]}
              maxSignals={15}
              minStrength={65}
              autoRefresh={true}
              refreshInterval={15000}
              enableNotifications={true}
              className="w-full"
            />
          </div>

          {/* Smart Entry Signals - Secondary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <SmartEntrySignals
              symbol={selectedSymbol}
              autoRefresh={true}
              refreshInterval={10000}
              className="w-full"
            />
          </div>

          {/* Intelligence Stats */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Intelligence Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">24</div>
                <div className="text-sm text-blue-700">Active Signals</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">Strong</div>
                <div className="text-sm text-blue-700">Signal Strength</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">94%</div>
                <div className="text-sm text-blue-700">Accuracy Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">18</div>
                <div className="text-sm text-blue-700">Entry Points</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntelligencePage;