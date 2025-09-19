'use client';

import { useEffect, useState } from 'react';
import { marketApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { Analysis, LLMAnalysis } from '@/types';
import { toast } from 'react-hot-toast';
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, Target, Shield, Clock } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function RecommendationsPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      wsClient.connect(token);
      loadSymbols();
      loadAnalyses();
    }

    // Set up WebSocket listeners for real-time analysis updates
    wsClient.on('analysis-update', handleAnalysisUpdate);

    return () => {
      wsClient.off('analysis-update', handleAnalysisUpdate);
    };
  }, []);

  useEffect(() => {
    if (selectedSymbol) {
      loadAnalyses();
    }
  }, [selectedSymbol]);

  const loadSymbols = async () => {
    try {
      const response = await marketApi.getSymbols();
      if (response?.success && Array.isArray(response.data)) {
        setSymbols(response.data);
      } else {
        setSymbols(['BTCUSDT', 'ETHUSDT', 'ADAUSDT']); // fallback symbols
      }
    } catch (error) {
      console.error('Error loading symbols:', error);
      setSymbols(['BTCUSDT', 'ETHUSDT', 'ADAUSDT']); // fallback symbols
      toast.error('Failed to load symbols, using defaults');
    }
  };

  const loadAnalyses = async () => {
    if (!selectedSymbol) return;

    try {
      setLoading(true);
      const response = await marketApi.getAnalysis(selectedSymbol, 10);
      if (response?.success && Array.isArray(response.data)) {
        setAnalyses(response.data);
      } else {
        setAnalyses([]);
      }
    } catch (error) {
      console.error('Error loading analyses:', error);
      setAnalyses([]);
      toast.error('Failed to load analyses');
    } finally {
      setLoading(false);
    }
  };

  const triggerNewAnalysis = async () => {
    if (!selectedSymbol) return;

    try {
      setTriggering(true);
      const response = await marketApi.triggerAnalysis(selectedSymbol);
      if (response.success) {
        toast.success('Analysis triggered successfully');
        // Refresh analyses after a short delay
        setTimeout(() => {
          loadAnalyses();
        }, 2000);
      } else {
        toast.error(response.error || 'Failed to trigger analysis');
      }
    } catch (error) {
      toast.error('Failed to trigger analysis');
    } finally {
      setTriggering(false);
    }
  };

  const handleAnalysisUpdate = (data: any) => {
    try {
      if (data?.symbol === selectedSymbol && data?.analysis) {
        setAnalyses(prev => [data.analysis, ...prev.slice(0, 9)]);
        toast.success(`New analysis available for ${data.symbol}`);
      }
    } catch (error) {
      console.error('Error handling analysis update:', error);
    }
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY':
        return 'text-green-600 bg-green-100';
      case 'SELL':
        return 'text-red-600 bg-red-100';
      case 'HOLD':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'BUY':
        return <TrendingUp className="h-4 w-4" />;
      case 'SELL':
        return <TrendingDown className="h-4 w-4" />;
      case 'HOLD':
        return <Minus className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AI Recommendations</h1>
          <p className="text-gray-600">AI-powered market analysis and trading recommendations</p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Symbol
                </label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {symbols.map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={loadAnalyses}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors mt-6"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={triggerNewAnalysis}
                disabled={triggering}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 mt-6"
              >
                <Brain className="h-4 w-4" />
                {triggering ? 'Analyzing...' : 'New Analysis'}
              </button>
            </div>
          </div>
        </div>

        {/* Analyses List */}
        <div className="space-y-6">
          {analyses.map((analysis, index) => (
            <div key={`${analysis.symbol}-${analysis.timestamp}-${index}`} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              {/* Analysis Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-gray-900">{analysis.symbol}</h3>
                    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getRecommendationColor(analysis.recommendation)}`}>
                      {getRecommendationIcon(analysis.recommendation)}
                      {analysis.recommendation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    {new Date(analysis.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Confidence</div>
                  <div className={`text-lg font-bold ${getConfidenceColor(analysis.confidence)}`}>
                    {analysis.confidence.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Overall Analysis */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-2">Overall Analysis</h4>
                <p className="text-gray-700 mb-4">{analysis.reasoning}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.targetPrice && (
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-gray-600">Target Price:</span>
                      <span className="font-medium text-green-600">${analysis.targetPrice.toFixed(4)}</span>
                    </div>
                  )}
                  {analysis.stopLoss && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-red-600" />
                      <span className="text-sm text-gray-600">Stop Loss:</span>
                      <span className="font-medium text-red-600">${analysis.stopLoss.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Individual LLM Analyses */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-4">Individual AI Model Analysis</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.individualAnalyses?.map((llmAnalysis: LLMAnalysis, llmIndex) => (
                    <div key={`${analysis.timestamp}-${llmAnalysis.model}-${llmIndex}`} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4 text-primary-600" />
                          <span className="font-medium text-gray-900">{llmAnalysis.model}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getRecommendationColor(llmAnalysis.recommendation)}`}>
                            {getRecommendationIcon(llmAnalysis.recommendation)}
                            {llmAnalysis.recommendation}
                          </span>
                          <span className={`text-sm font-bold ${getConfidenceColor(llmAnalysis.confidence)}`}>
                            {llmAnalysis.confidence.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 mb-3">{llmAnalysis.reasoning}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                        {llmAnalysis.targetPrice && (
                          <div className="flex items-center gap-1">
                            <Target className="h-3 w-3 text-green-600" />
                            <span>Target: ${llmAnalysis.targetPrice.toFixed(4)}</span>
                          </div>
                        )}
                        {llmAnalysis.stopLoss && (
                          <div className="flex items-center gap-1">
                            <Shield className="h-3 w-3 text-red-600" />
                            <span>Stop: ${llmAnalysis.stopLoss.toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {analyses.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Analyses Available</h3>
            <p className="text-gray-600 mb-6">Trigger a new analysis to get AI-powered recommendations</p>
            <button
              onClick={triggerNewAnalysis}
              disabled={triggering}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {triggering ? 'Analyzing...' : 'Trigger Analysis'}
            </button>
          </div>
        )}
      </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}