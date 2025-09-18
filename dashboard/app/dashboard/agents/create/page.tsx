'use client';

import { useEffect, useState } from 'react';
import { agentApi, marketApi } from '@/lib/api';
import { AgentConfig } from '@/types';
import { toast } from 'react-hot-toast';
import { Bot, DollarSign, Shield, Target, TrendingUp, Activity, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CreateAgentPage() {
  const router = useRouter();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    symbol: 'BTCUSDT',
    config: {
      maxPositionSize: 100,
      stopLossPercentage: 2.0,
      takeProfitPercentage: 3.0,
      riskPercentage: 1.0,
      timeframes: ['1m', '5m'],
      indicators: ['RSI', 'MACD']
    } as AgentConfig
  });

  const availableTimeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];
  const availableIndicators = ['RSI', 'MACD', 'SMA', 'EMA', 'Bollinger Bands', 'Stochastic', 'VWAP', 'Volume'];

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    loadSymbols();
  }, []);

  const loadSymbols = async () => {
    try {
      const response = await marketApi.getSymbols();
      if (response.success) {
        setSymbols(response.data);
      }
    } catch (error) {
      toast.error('Failed to load symbols');
    }
  };

  const handleInputChange = (field: string, value: any) => {
    if (field.startsWith('config.')) {
      const configField = field.replace('config.', '');
      setFormData(prev => ({
        ...prev,
        config: {
          ...prev.config,
          [configField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleTimeframeToggle = (timeframe: string) => {
    setFormData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        timeframes: prev.config.timeframes.includes(timeframe)
          ? prev.config.timeframes.filter(t => t !== timeframe)
          : [...prev.config.timeframes, timeframe]
      }
    }));
  };

  const handleIndicatorToggle = (indicator: string) => {
    setFormData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        indicators: prev.config.indicators.includes(indicator)
          ? prev.config.indicators.filter(i => i !== indicator)
          : [...prev.config.indicators, indicator]
      }
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error('Agent name is required');
      return false;
    }
    if (!formData.symbol) {
      toast.error('Symbol is required');
      return false;
    }
    if (formData.config.maxPositionSize <= 0) {
      toast.error('Max position size must be greater than 0');
      return false;
    }
    if (formData.config.stopLossPercentage <= 0 || formData.config.stopLossPercentage > 50) {
      toast.error('Stop loss percentage must be between 0.1% and 50%');
      return false;
    }
    if (formData.config.takeProfitPercentage <= 0 || formData.config.takeProfitPercentage > 100) {
      toast.error('Take profit percentage must be between 0.1% and 100%');
      return false;
    }
    if (formData.config.riskPercentage <= 0 || formData.config.riskPercentage > 10) {
      toast.error('Risk percentage must be between 0.1% and 10%');
      return false;
    }
    if (formData.config.timeframes.length === 0) {
      toast.error('At least one timeframe must be selected');
      return false;
    }
    if (formData.config.indicators.length === 0) {
      toast.error('At least one indicator must be selected');
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
        symbol: formData.symbol,
        config: formData.config
      });

      if (response.success) {
        toast.success('Agent created successfully!');
        router.push('/dashboard');
      } else {
        toast.error(response.error || 'Failed to create agent');
      }
    } catch (error) {
      toast.error('Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Create Trading Agent</h1>
          <p className="text-gray-600">Configure a new automated trading agent</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Bot className="h-5 w-5 text-primary-600" />
              <h2 className="text-xl font-semibold text-gray-900">Basic Information</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Agent Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., BTC Scalper Pro"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trading Symbol *
                </label>
                <select
                  value={formData.symbol}
                  onChange={(e) => handleInputChange('symbol', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {symbols.map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Trading Configuration */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-6">
              <DollarSign className="h-5 w-5 text-green-600" />
              <h2 className="text-xl font-semibold text-gray-900">Trading Configuration</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Position Size (USDT) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={formData.config.maxPositionSize}
                  onChange={(e) => handleInputChange('config.maxPositionSize', parseFloat(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Risk Per Trade (%) *
                </label>
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={formData.config.riskPercentage}
                  onChange={(e) => handleInputChange('config.riskPercentage', parseFloat(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* Risk Management */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Shield className="h-5 w-5 text-red-600" />
              <h2 className="text-xl font-semibold text-gray-900">Risk Management</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stop Loss (%) *
                </label>
                <input
                  type="number"
                  min="0.1"
                  max="50"
                  step="0.1"
                  value={formData.config.stopLossPercentage}
                  onChange={(e) => handleInputChange('config.stopLossPercentage', parseFloat(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Maximum loss per trade</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Take Profit (%) *
                </label>
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={formData.config.takeProfitPercentage}
                  onChange={(e) => handleInputChange('config.takeProfitPercentage', parseFloat(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Target profit per trade</p>
              </div>
            </div>
          </div>

          {/* Technical Analysis */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-6">
              <Activity className="h-5 w-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Technical Analysis</h2>
            </div>

            {/* Timeframes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Timeframes *
              </label>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {availableTimeframes.map(timeframe => (
                  <button
                    key={timeframe}
                    type="button"
                    onClick={() => handleTimeframeToggle(timeframe)}
                    className={`p-2 text-sm rounded-lg border transition-colors ${
                      formData.config.timeframes.includes(timeframe)
                        ? 'bg-primary-100 border-primary-300 text-primary-800'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {timeframe}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Select timeframes for analysis</p>
            </div>

            {/* Indicators */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Technical Indicators *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {availableIndicators.map(indicator => (
                  <button
                    key={indicator}
                    type="button"
                    onClick={() => handleIndicatorToggle(indicator)}
                    className={`p-2 text-sm rounded-lg border transition-colors ${
                      formData.config.indicators.includes(indicator)
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {indicator}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Select indicators for trading signals</p>
            </div>
          </div>

          {/* Configuration Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Agent Name:</span>
                  <span className="font-medium">{formData.name || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Symbol:</span>
                  <span className="font-medium">{formData.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Position:</span>
                  <span className="font-medium">${formData.config.maxPositionSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Risk per Trade:</span>
                  <span className="font-medium">{formData.config.riskPercentage}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Stop Loss:</span>
                  <span className="font-medium text-red-600">{formData.config.stopLossPercentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Take Profit:</span>
                  <span className="font-medium text-green-600">{formData.config.takeProfitPercentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Timeframes:</span>
                  <span className="font-medium">{formData.config.timeframes.length} selected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Indicators:</span>
                  <span className="font-medium">{formData.config.indicators.length} selected</span>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <Bot className="h-4 w-4" />
              {loading ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}