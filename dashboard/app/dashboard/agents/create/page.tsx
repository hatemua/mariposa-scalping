'use client';

import { useState } from 'react';
import { agentApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { Bot, DollarSign, Shield, TrendingUp, ArrowLeft, Sparkles, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ErrorBoundary from '@/components/ErrorBoundary';

type AgentCategory = 'SCALPING' | 'SWING' | 'DAY_TRADING' | 'LONG_TERM' | 'ARBITRAGE' | 'ALL';

const CATEGORY_INFO = {
  SCALPING: {
    label: 'Scalping',
    description: 'Quick trades lasting seconds to minutes',
    icon: '⚡',
    signals: ['MOMENTUM', 'VOLUME_SURGE', 'WHALE_ACTIVITY']
  },
  SWING: {
    label: 'Swing Trading',
    description: 'Positions held for days to weeks',
    icon: '📈',
    signals: ['BREAKOUT', 'REVERSAL', 'MOMENTUM']
  },
  DAY_TRADING: {
    label: 'Day Trading',
    description: 'Intraday positions, closed daily',
    icon: '☀️',
    signals: ['MOMENTUM', 'BREAKOUT', 'VOLUME_SURGE']
  },
  LONG_TERM: {
    label: 'Long Term',
    description: 'Positions held for weeks to months',
    icon: '🎯',
    signals: ['BREAKOUT', 'REVERSAL']
  },
  ARBITRAGE: {
    label: 'Arbitrage',
    description: 'Exploit price differences',
    icon: '🔄',
    signals: ['ARBITRAGE']
  },
  ALL: {
    label: 'Mixed Strategy',
    description: 'Flexible, all trading styles',
    icon: '🌟',
    signals: ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY']
  }
};

const RISK_LEVELS = [
  { value: 1, label: 'Very Conservative', color: 'text-green-600', bgColor: 'bg-green-50', description: '10% position size, 85% min confidence' },
  { value: 2, label: 'Conservative', color: 'text-blue-600', bgColor: 'bg-blue-50', description: '15% position size, 75% min confidence' },
  { value: 3, label: 'Moderate', color: 'text-yellow-600', bgColor: 'bg-yellow-50', description: '20% position size, 70% min confidence' },
  { value: 4, label: 'Aggressive', color: 'text-orange-600', bgColor: 'bg-orange-50', description: '30% position size, 60% min confidence' },
  { value: 5, label: 'Very Aggressive', color: 'text-red-600', bgColor: 'bg-red-50', description: '40% position size, 55% min confidence' },
];

export default function CreateAgentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'SCALPING' as AgentCategory,
    riskLevel: 3 as 1 | 2 | 3 | 4 | 5,
    budget: 100,
    description: ''
  });

  // Calculate auto-settings based on risk level and budget
  const getAutoSettings = () => {
    const confidenceMap = { 1: 0.85, 2: 0.75, 3: 0.70, 4: 0.60, 5: 0.55 };
    const positionPercentageMap = { 1: 0.10, 2: 0.15, 3: 0.20, 4: 0.30, 5: 0.40 };

    const minLLMConfidence = confidenceMap[formData.riskLevel];
    const positionPercentage = positionPercentageMap[formData.riskLevel];

    let maxOpenPositions = 1;
    if (formData.budget < 100) {
      maxOpenPositions = 1;
    } else if (formData.budget < 500) {
      maxOpenPositions = formData.riskLevel <= 2 ? 2 : 3;
    } else if (formData.budget < 1000) {
      maxOpenPositions = formData.riskLevel <= 2 ? 3 : 5;
    } else {
      maxOpenPositions = Math.min(formData.riskLevel * 2, 10);
    }

    const positionSize = formData.budget * positionPercentage;

    return {
      minLLMConfidence,
      maxOpenPositions,
      positionSize,
      allowedSignals: CATEGORY_INFO[formData.category].signals
    };
  };

  const autoSettings = getAutoSettings();

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error('Agent name is required');
      return false;
    }
    if (formData.budget < 10) {
      toast.error('Minimum budget is $10 USDT');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setLoading(true);
      const response = await agentApi.createAgent({
        name: formData.name.trim(),
        category: formData.category,
        riskLevel: formData.riskLevel,
        budget: formData.budget,
        description: formData.description.trim() || undefined
      });

      if (response.success) {
        toast.success(response.message || 'Intelligent agent created successfully!');
        router.push('/dashboard');
      } else {
        toast.error(response.error || 'Failed to create agent');
      }
    } catch (error) {
      console.error('Create agent error:', error);
      toast.error('Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  const selectedRisk = RISK_LEVELS[formData.riskLevel - 1];

  return (
    <ErrorBoundary>
      <DashboardLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center gap-3 mb-2">
              <Sparkles className="h-8 w-8 text-primary-600" />
              <h1 className="text-3xl font-bold text-gray-900">Create Intelligent Trading Agent</h1>
            </div>
            <p className="text-gray-600">AI-powered autonomous trading with dynamic strategy adaptation</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Bot className="h-5 w-5 text-primary-600" />
                <h2 className="text-xl font-semibold text-gray-900">Agent Identity</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Agent Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                    placeholder="e.g., Alpha Scalper, Bitcoin Swing Bot"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow resize-none"
                    placeholder="Brief description of your trading strategy or goals"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Trading Category */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Trading Category</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: key as AgentCategory })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      formData.category === key
                        ? 'border-primary-500 bg-primary-50 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-2xl mb-1">{info.icon}</div>
                    <div className="font-semibold text-gray-900 text-sm mb-1">{info.label}</div>
                    <div className="text-xs text-gray-600">{info.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Risk Level */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Shield className="h-5 w-5 text-red-600" />
                <h2 className="text-xl font-semibold text-gray-900">Risk Level</h2>
              </div>

              <div className="space-y-4">
                {/* Risk Slider */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700">Select Risk Level</span>
                    <div className={`px-3 py-1 rounded-full ${selectedRisk.bgColor} ${selectedRisk.color} text-sm font-semibold`}>
                      {selectedRisk.label}
                    </div>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={formData.riskLevel}
                    onChange={(e) => setFormData({ ...formData, riskLevel: parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5 })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />

                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                  </div>
                </div>

                {/* Risk Description */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">{selectedRisk.description}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Budget Allocation */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-6">
                <DollarSign className="h-5 w-5 text-green-600" />
                <h2 className="text-xl font-semibold text-gray-900">Budget Allocation</h2>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Budget (USDT) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                  <input
                    type="number"
                    min="10"
                    step="1"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-lg pl-8 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow"
                    placeholder="100"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">Minimum: $10 USDT</p>
              </div>
            </div>

            {/* Auto-Calculated Settings Preview */}
            <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-xl shadow-sm border border-primary-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-primary-600" />
                <h3 className="text-lg font-semibold text-gray-900">Auto-Calculated Settings</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Min LLM Confidence</div>
                  <div className="text-2xl font-bold text-primary-600">
                    {(autoSettings.minLLMConfidence * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Required AI confidence for trades</div>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Max Open Positions</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {autoSettings.maxOpenPositions}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Simultaneous trades allowed</div>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Position Size per Trade</div>
                  <div className="text-2xl font-bold text-green-600">
                    ${autoSettings.positionSize.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {((autoSettings.positionSize / formData.budget) * 100).toFixed(0)}% of available balance
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Allowed Signal Types</div>
                  <div className="text-sm font-semibold text-gray-900 mt-1">
                    {autoSettings.allowedSignals.length}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-1">
                    {autoSettings.allowedSignals.map(signal => (
                      <span key={signal} className="inline-block px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs">
                        {signal}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <p className="font-medium mb-1">How Intelligent Agents Work</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-800">
                    <li>Trades <strong>ANY symbol</strong> - not limited to one market</li>
                    <li>Receives signals broadcast to all agents</li>
                    <li>AI validates each signal against your category and risk profile</li>
                    <li>Automatically calculates position sizes based on available balance</li>
                    <li>Manages entry, exit, stop-loss, and take-profit autonomously</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                <Sparkles className="h-4 w-4" />
                {loading ? 'Creating...' : 'Create Intelligent Agent'}
              </button>
            </div>
          </form>
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}
