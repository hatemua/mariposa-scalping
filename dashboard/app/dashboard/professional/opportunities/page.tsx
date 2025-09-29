'use client';

import React from 'react';
import { TrendingUp } from 'lucide-react';
import { OpportunityScanner, WhaleActivityMonitor } from '@/lib/dynamicComponents';
import ProfessionalLayout from '@/components/layout/ProfessionalLayout';

const OpportunitiesPage = () => {
  const symbols = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
    'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT'
  ];

  return (
    <ProfessionalLayout
      title="Market Opportunities"
      description="Real-time profit opportunities with risk-adjusted scoring and institutional flow analysis"
      icon={TrendingUp}
      badge="REAL-TIME"
      badgeColor="emerald"
    >
      <div className="space-y-6">
        {/* Opportunity Scanner - Primary Widget */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <OpportunityScanner
            symbols={symbols}
            maxOpportunities={12}
            minScore={70}
            autoRefresh={true}
            refreshInterval={30000}
            className="w-full"
          />
        </div>

        {/* Whale Activity Monitor - Secondary Widget */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
          <WhaleActivityMonitor
            symbols={symbols.slice(0, 6)}
            minWhaleSize={50000}
            autoRefresh={true}
            refreshInterval={10000}
            enableAlerts={true}
            className="w-full"
          />
        </div>

        {/* Quick Stats */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-emerald-900 mb-4">Opportunity Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-emerald-600">12</div>
              <div className="text-sm text-emerald-700">Active Opportunities</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">78</div>
              <div className="text-sm text-emerald-700">Average Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">$2.4M</div>
              <div className="text-sm text-emerald-700">Whale Volume</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">94%</div>
              <div className="text-sm text-emerald-700">Success Rate</div>
            </div>
          </div>
        </div>
      </div>
    </ProfessionalLayout>
  );
};

export default OpportunitiesPage;