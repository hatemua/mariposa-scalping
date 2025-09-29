'use client';

import React from 'react';
import { ArrowLeft, PieChart } from 'lucide-react';
import Link from 'next/link';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';
import { PortfolioHeatMap, CorrelationMatrix } from '@/lib/dynamicComponents';

const PortfolioPage = () => {
  const portfolioSymbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT'
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
            <PieChart className="h-7 w-7 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Portfolio Analysis</h1>
            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
              COMPREHENSIVE
            </span>
          </div>
          <p className="text-gray-600">
            Portfolio heat maps, correlation analysis, and performance tracking for optimal asset allocation
          </p>
        </div>

        {/* Portfolio Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Overview</h3>
          <div className="grid grid-cols-3 md:grid-cols-9 gap-3">
            {portfolioSymbols.map(symbol => (
              <div key={symbol} className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="font-medium text-sm text-gray-900">{symbol.replace('USDT', '')}</div>
                <div className="text-xs text-gray-600 mt-1">Active</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Portfolio Heat Map - Primary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <PortfolioHeatMap
              symbols={portfolioSymbols}
              autoRefresh={true}
              refreshInterval={15000}
              className="w-full"
            />
          </div>

          {/* Correlation Matrix - Secondary Widget */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <CorrelationMatrix
              symbols={portfolioSymbols}
              timeframe="1h"
              lookbackPeriods={100}
              autoRefresh={true}
              refreshInterval={30000}
              className="w-full"
            />
          </div>

          {/* Portfolio Stats */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-indigo-900 mb-4">Portfolio Performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-indigo-600">9</div>
                <div className="text-sm text-indigo-700">Active Assets</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">+12.4%</div>
                <div className="text-sm text-indigo-700">Total Return</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">1.8</div>
                <div className="text-sm text-indigo-700">Sharpe Ratio</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">-8.5%</div>
                <div className="text-sm text-indigo-700">Max Drawdown</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">0.65</div>
                <div className="text-sm text-indigo-700">Beta to BTC</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">18.2%</div>
                <div className="text-sm text-indigo-700">Volatility</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioPage;