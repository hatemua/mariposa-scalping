'use client';

import React from 'react';
import { Eye, TrendingUp, Activity, BarChart3, Shield, PieChart, Bot, Monitor } from 'lucide-react';
import Link from 'next/link';

const ProfessionalDashboard = () => {
  const modules = [
    {
      id: 'opportunities',
      title: 'Market Opportunities',
      description: 'Real-time profit opportunities with risk-adjusted scoring',
      icon: TrendingUp,
      path: '/dashboard/professional/opportunities',
      color: 'emerald',
      metrics: { active: 12, highScore: 8, avgScore: 78 }
    },
    {
      id: 'intelligence',
      title: 'Trading Intelligence',
      description: 'AI-powered signals with entry/exit recommendations',
      icon: Activity,
      path: '/dashboard/professional/intelligence',
      color: 'blue',
      metrics: { signals: 24, strength: 'Strong', accuracy: '94%' }
    },
    {
      id: 'analytics',
      title: 'Advanced Analytics',
      description: 'Technical analysis, confluence scoring, and order book intelligence',
      icon: BarChart3,
      path: '/dashboard/professional/analytics',
      color: 'purple',
      metrics: { indicators: 15, confluence: 85, accuracy: '91%' }
    },
    {
      id: 'risk',
      title: 'Risk Management',
      description: 'VaR calculations, position sizing, and risk monitoring',
      icon: Shield,
      path: '/dashboard/professional/risk',
      color: 'red',
      metrics: { riskLevel: 'Low', exposure: '15%', var: '2.3%' }
    },
    {
      id: 'portfolio',
      title: 'Portfolio Analysis',
      description: 'Portfolio heat maps, correlation matrix, and performance tracking',
      icon: PieChart,
      path: '/dashboard/professional/portfolio',
      color: 'indigo',
      metrics: { assets: 9, performance: '+12.4%', sharpe: 1.8 }
    },
    {
      id: 'agents',
      title: 'Trading Agents',
      description: 'Autonomous trading bots with performance monitoring',
      icon: Bot,
      path: '/dashboard/professional/agents',
      color: 'cyan',
      metrics: { active: 6, performance: '+8.7%', trades: 142 }
    },
    {
      id: 'monitoring',
      title: 'Market Monitoring',
      description: 'Whale activity detection and institutional flow analysis',
      icon: Monitor,
      path: '/dashboard/professional/monitoring',
      color: 'orange',
      metrics: { whales: 3, volume: '$2.4M', alerts: 5 }
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900 hover:from-emerald-100 hover:to-emerald-200',
      blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-900 hover:from-blue-100 hover:to-blue-200',
      purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-900 hover:from-purple-100 hover:to-purple-200',
      red: 'from-red-50 to-red-100 border-red-200 text-red-900 hover:from-red-100 hover:to-red-200',
      indigo: 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-900 hover:from-indigo-100 hover:to-indigo-200',
      cyan: 'from-cyan-50 to-cyan-100 border-cyan-200 text-cyan-900 hover:from-cyan-100 hover:to-cyan-200',
      orange: 'from-orange-50 to-orange-100 border-orange-200 text-orange-900 hover:from-orange-100 hover:to-orange-200'
    };
    return colors[color as keyof typeof colors] || colors.emerald;
  };

  const getIconColor = (color: string) => {
    const colors = {
      emerald: 'text-emerald-600',
      blue: 'text-blue-600',
      purple: 'text-purple-600',
      red: 'text-red-600',
      indigo: 'text-indigo-600',
      cyan: 'text-cyan-600',
      orange: 'text-orange-600'
    };
    return colors[color as keyof typeof colors] || colors.emerald;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Eye className="h-8 w-8 text-emerald-600" />
            <h1 className="text-3xl font-bold text-gray-900">Professional Trading Suite</h1>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
              INSTITUTIONAL GRADE
            </span>
          </div>
          <p className="text-gray-600 text-lg">
            Advanced trading tools and analytics for professional traders
          </p>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Link key={module.id} href={module.path}>
                <div className={`bg-gradient-to-br ${getColorClasses(module.color)} border rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:scale-[1.02] cursor-pointer`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-white shadow-sm`}>
                      <Icon className={`h-6 w-6 ${getIconColor(module.color)}`} />
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium opacity-75">MODULE</div>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold mb-2">{module.title}</h3>
                  <p className="text-sm opacity-75 mb-4 leading-relaxed">{module.description}</p>

                  {/* Module-specific metrics */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {Object.entries(module.metrics).map(([key, value]) => (
                      <div key={key} className="text-center">
                        <div className="font-bold text-sm">{value}</div>
                        <div className="opacity-60 capitalize">{key}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-end">
                    <span className="text-xs font-medium opacity-60">Open Module →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Stats */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">System Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-emerald-600">94.2%</div>
              <div className="text-xs text-gray-600">Signal Accuracy</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">$2.4M</div>
              <div className="text-xs text-gray-600">Total Volume</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">78</div>
              <div className="text-xs text-gray-600">Avg Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">2.3%</div>
              <div className="text-xs text-gray-600">Portfolio VaR</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-600">+12.4%</div>
              <div className="text-xs text-gray-600">Performance</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-cyan-600">6</div>
              <div className="text-xs text-gray-600">Active Bots</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">3</div>
              <div className="text-xs text-gray-600">Whale Alerts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalDashboard;