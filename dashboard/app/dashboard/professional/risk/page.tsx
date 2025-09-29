'use client';

import React, { useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';
import { VaRCalculator, RiskMonitorDashboard, PositionSizingCalculator } from '@/lib/dynamicComponents';

const RiskManagementPage = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');

  const symbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT'
  ];

  const portfolioSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/dashboard/professional" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-6 w-6" />
            </Link>
            <Shield className="h-7 w-7 text-red-600" />
            <h1 className="text-2xl font-bold text-gray-900">Risk Management</h1>
            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
              CRITICAL
            </span>
          </div>
          <p className="text-gray-600">
            VaR calculations, position sizing, and comprehensive risk monitoring for portfolio protection
          </p>
        </div>

        {/* Symbol Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Risk Analysis Target</h3>
            <div className="text-sm text-gray-600">
              Monitoring: <span className="font-medium text-red-600">{selectedSymbol}</span>
            </div>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {symbols.map(symbol => (
              <button
                key={symbol}
                onClick={() => setSelectedSymbol(symbol)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedSymbol === symbol
                    ? 'bg-red-600 text-white shadow-sm'
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
          {/* Risk Monitor Dashboard - Primary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <RiskMonitorDashboard
              symbol={selectedSymbol}
              portfolioSymbols={portfolioSymbols}
              autoRefresh={true}
              refreshInterval={5000}
              className="w-full"
            />
          </div>

          {/* Risk Tools Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* VaR Calculator */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
              <VaRCalculator
                symbols={[selectedSymbol, 'BTCUSDT', 'ETHUSDT']}
                autoRefresh={true}
                refreshInterval={30000}
                className="w-full"
              />
            </div>

            {/* Position Sizing Calculator */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
              <PositionSizingCalculator
                symbol={selectedSymbol}
                accountBalance={100000}
                riskPerTrade={2}
                autoRefresh={true}
                refreshInterval={20000}
                className="w-full"
              />
            </div>
          </div>

          {/* Risk Stats */}
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-red-900 mb-4">Risk Assessment</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-red-600">Low</div>
                <div className="text-sm text-red-700">Risk Level</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">15%</div>
                <div className="text-sm text-red-700">Portfolio Exposure</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">2.3%</div>
                <div className="text-sm text-red-700">Daily VaR</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">$100K</div>
                <div className="text-sm text-red-700">Account Balance</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">2%</div>
                <div className="text-sm text-red-700">Risk Per Trade</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskManagementPage;