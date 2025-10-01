'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { OpportunityScanner, WhaleActivityMonitor } from '@/lib/dynamicComponents';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';
import SymbolSelector from '@/components/ui/SymbolSelector';

const AVAILABLE_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
  'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
  'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
];

const QUICK_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT'];

const OpportunitiesPage = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [opportunityStats, setOpportunityStats] = useState({
    activeCount: 0,
    avgScore: 0,
    whaleVolume: 0,
    successRate: 0
  });

  // Update stats when opportunities/whales change (passed from child components via events)
  useEffect(() => {
    // Stats will be updated by the child components via custom events
    const handleStatsUpdate = (event: CustomEvent) => {
      setOpportunityStats(event.detail);
    };

    window.addEventListener('opportunityStatsUpdate' as any, handleStatsUpdate);
    return () => window.removeEventListener('opportunityStatsUpdate' as any, handleStatsUpdate);
  }, []);

  // Keyboard shortcuts for quick symbol switching
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '6') {
        const index = parseInt(e.key) - 1;
        if (QUICK_SYMBOLS[index]) {
          setSelectedSymbol(QUICK_SYMBOLS[index]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
  };

  return (
    <ProfessionalLayout
      title={`Market Opportunities - ${selectedSymbol}`}
      description="Deep analysis for selected trading pair with professional insights"
      icon={TrendingUp}
      badge="REAL-TIME"
      badgeColor="emerald"
    >
      <div className="space-y-6">
        {/* Symbol Selector and Quick Switcher */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex-1">
            <SymbolSelector
              selectedSymbol={selectedSymbol}
              onSymbolChange={setSelectedSymbol}
              availableSymbols={AVAILABLE_SYMBOLS}
            />
          </div>

          {/* Quick Switcher */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-sm text-gray-500 self-center mr-2">Quick:</span>
            {QUICK_SYMBOLS.map((symbol, index) => (
              <button
                key={symbol}
                onClick={() => setSelectedSymbol(symbol)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  selectedSymbol === symbol
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={`Press ${index + 1} for ${symbol}`}
              >
                {symbol.replace('USDT', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Opportunity Scanner - Primary Widget */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <OpportunityScanner
            symbols={[selectedSymbol]}
            maxOpportunities={5}
            minScore={60}
            autoRefresh={true}
            refreshInterval={30000}
            className="w-full"
          />
        </div>

        {/* Whale Activity Monitor - Secondary Widget */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <WhaleActivityMonitor
            symbols={[selectedSymbol]}
            minWhaleSize={50000}
            autoRefresh={true}
            refreshInterval={10000}
            enableAlerts={true}
            className="w-full"
          />
        </div>

        {/* Quick Stats for Selected Symbol */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-emerald-900 mb-4">
            {selectedSymbol} Statistics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-emerald-600">
                {opportunityStats.activeCount || '0'}
              </div>
              <div className="text-sm text-emerald-700">Active Opportunities</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">
                {opportunityStats.avgScore || '0'}
              </div>
              <div className="text-sm text-emerald-700">Average Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">
                {formatVolume(opportunityStats.whaleVolume || 0)}
              </div>
              <div className="text-sm text-emerald-700">Whale Volume</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">
                {opportunityStats.successRate || '0'}%
              </div>
              <div className="text-sm text-emerald-700">Confidence Avg</div>
            </div>
          </div>
        </div>
      </div>
    </ProfessionalLayout>
  );
};

export default OpportunitiesPage;