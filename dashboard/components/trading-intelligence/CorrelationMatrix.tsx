'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Grid3X3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  RefreshCw,
  Eye,
  Settings,
  BarChart3,
  Activity
} from 'lucide-react';

interface CorrelationPair {
  symbol1: string;
  symbol2: string;
  correlation: number;
  pValue: number;
  significance: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  direction: 'POSITIVE' | 'NEGATIVE';
  stability: number;
  timeframe: string;
}

interface CorrelationCluster {
  symbols: string[];
  avgCorrelation: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  description: string;
}

interface CorrelationMatrixData {
  matrix: { [key: string]: { [key: string]: number } };
  pairs: CorrelationPair[];
  clusters: CorrelationCluster[];
  avgCorrelation: number;
  maxCorrelation: number;
  minCorrelation: number;
  diversificationRatio: number;
  concentrationRisk: number;
  breakdown: {
    strongPositive: number;
    strongNegative: number;
    weak: number;
    unstable: number;
  };
}

interface CorrelationMatrixProps {
  symbols: string[];
  timeframe?: '1h' | '4h' | '1d' | '1w';
  lookbackPeriods?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const CORRELATION_COLORS = {
  VERY_STRONG_POSITIVE: '#dc2626', // Red - high risk
  STRONG_POSITIVE: '#ea580c',      // Orange-red
  MODERATE_POSITIVE: '#f59e0b',    // Orange
  WEAK_POSITIVE: '#eab308',        // Yellow
  NEUTRAL: '#6b7280',              // Gray
  WEAK_NEGATIVE: '#10b981',        // Green
  MODERATE_NEGATIVE: '#059669',    // Darker green
  STRONG_NEGATIVE: '#047857',      // Even darker green
  VERY_STRONG_NEGATIVE: '#065f46'  // Dark green - good for diversification
};

const SIGNIFICANCE_LEVELS = {
  WEAK: { min: 0, max: 0.3, color: '#10b981' },
  MODERATE: { min: 0.3, max: 0.5, color: '#f59e0b' },
  STRONG: { min: 0.5, max: 0.7, color: '#ea580c' },
  VERY_STRONG: { min: 0.7, max: 1, color: '#dc2626' }
};

export default function CorrelationMatrix({
  symbols,
  timeframe = '1h',
  lookbackPeriods = 100,
  autoRefresh = true,
  refreshInterval = 300000, // 5 minutes for correlation analysis (was 30s - too aggressive)
  className = ''
}: CorrelationMatrixProps) {
  const [correlationData, setCorrelationData] = useState<CorrelationMatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<CorrelationPair | null>(null);
  const [showClusters, setShowClusters] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState<'correlation' | 'significance' | 'stability'>('correlation');

  // Calculate Pearson correlation coefficient
  const calculateCorrelation = (prices1: number[], prices2: number[]) => {
    if (prices1.length !== prices2.length || prices1.length < 2) {
      return { correlation: 0, pValue: 1 };
    }

    const n = prices1.length;
    const sum1 = prices1.reduce((a, b) => a + b, 0);
    const sum2 = prices2.reduce((a, b) => a + b, 0);
    const sum1Sq = prices1.reduce((a, b) => a + b * b, 0);
    const sum2Sq = prices2.reduce((a, b) => a + b * b, 0);
    const pSum = prices1.reduce((sum, a, i) => sum + a * prices2[i], 0);

    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));

    const correlation = den === 0 ? 0 : num / den;

    // Calculate t-statistic for significance
    const tStat = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
    const degreesOfFreedom = n - 2;

    // Simplified p-value calculation (would use proper t-distribution in production)
    const pValue = Math.max(0.001, Math.min(0.999, 1 - Math.abs(tStat) / 10));

    return { correlation, pValue };
  };

  // Determine correlation significance
  const getSignificance = (correlation: number): 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG' => {
    const absCorr = Math.abs(correlation);
    if (absCorr >= 0.7) return 'VERY_STRONG';
    if (absCorr >= 0.5) return 'STRONG';
    if (absCorr >= 0.3) return 'MODERATE';
    return 'WEAK';
  };

  // Get correlation color based on value
  const getCorrelationColor = (correlation: number): string => {
    const absCorr = Math.abs(correlation);

    if (correlation > 0) {
      if (absCorr >= 0.8) return CORRELATION_COLORS.VERY_STRONG_POSITIVE;
      if (absCorr >= 0.6) return CORRELATION_COLORS.STRONG_POSITIVE;
      if (absCorr >= 0.4) return CORRELATION_COLORS.MODERATE_POSITIVE;
      if (absCorr >= 0.2) return CORRELATION_COLORS.WEAK_POSITIVE;
    } else {
      if (absCorr >= 0.8) return CORRELATION_COLORS.VERY_STRONG_NEGATIVE;
      if (absCorr >= 0.6) return CORRELATION_COLORS.STRONG_NEGATIVE;
      if (absCorr >= 0.4) return CORRELATION_COLORS.MODERATE_NEGATIVE;
      if (absCorr >= 0.2) return CORRELATION_COLORS.WEAK_NEGATIVE;
    }

    return CORRELATION_COLORS.NEUTRAL;
  };

  // Identify correlation clusters using simple grouping
  const identifyCorrelationClusters = (matrix: { [key: string]: { [key: string]: number } }): CorrelationCluster[] => {
    const clusters: CorrelationCluster[] = [];
    const processedSymbols = new Set<string>();

    for (const symbol1 of symbols) {
      if (processedSymbols.has(symbol1)) continue;

      const highlyCorrelated = [symbol1];
      let totalCorrelation = 0;
      let count = 0;

      for (const symbol2 of symbols) {
        if (symbol1 !== symbol2 && !processedSymbols.has(symbol2)) {
          const correlation = Math.abs(matrix[symbol1]?.[symbol2] || 0);
          if (correlation > 0.6) {
            highlyCorrelated.push(symbol2);
            totalCorrelation += correlation;
            count++;
          }
        }
      }

      if (highlyCorrelated.length > 1) {
        const avgCorrelation = count > 0 ? totalCorrelation / count : 0;

        clusters.push({
          symbols: highlyCorrelated,
          avgCorrelation,
          riskLevel: avgCorrelation > 0.8 ? 'EXTREME' :
                    avgCorrelation > 0.7 ? 'HIGH' :
                    avgCorrelation > 0.5 ? 'MEDIUM' : 'LOW',
          description: `${highlyCorrelated.length} assets with ${(avgCorrelation * 100).toFixed(0)}% avg correlation`
        });

        highlyCorrelated.forEach(symbol => processedSymbols.add(symbol));
      } else {
        processedSymbols.add(symbol1);
      }
    }

    return clusters;
  };

  // Generate correlation matrix data
  const generateCorrelationData = async (): Promise<CorrelationMatrixData> => {
    try {
      // Fetch historical data for all symbols
      const dataPromises = symbols.map(async (symbol) => {
        const chartData = await marketApi.getChartData(symbol, timeframe, lookbackPeriods);
        const klines = safeArray.getValue(safeObject.get(chartData, 'data.klines', [])) as any[];
        const prices = klines.map((candle: any[]) => parseFloat(candle[4])); // Close prices
        return { symbol, prices };
      });

      const symbolsData = await Promise.all(dataPromises);

      // Calculate correlation matrix
      const matrix: { [key: string]: { [key: string]: number } } = {};
      const pairs: CorrelationPair[] = [];

      for (let i = 0; i < symbols.length; i++) {
        matrix[symbols[i]] = {};

        for (let j = 0; j < symbols.length; j++) {
          if (i === j) {
            matrix[symbols[i]][symbols[j]] = 1.0;
          } else {
            const { correlation, pValue } = calculateCorrelation(
              symbolsData[i].prices,
              symbolsData[j].prices
            );

            matrix[symbols[i]][symbols[j]] = correlation;

            // Add to pairs array (avoid duplicates)
            if (i < j) {
              const significance = getSignificance(correlation);

              pairs.push({
                symbol1: symbols[i],
                symbol2: symbols[j],
                correlation,
                pValue,
                significance,
                direction: correlation >= 0 ? 'POSITIVE' : 'NEGATIVE',
                stability: Math.max(0, 1 - pValue), // Higher stability = lower p-value
                timeframe
              });
            }
          }
        }
      }

      // Identify clusters
      const clusters = identifyCorrelationClusters(matrix);

      // Calculate statistics
      const correlations = pairs.map(pair => pair.correlation);
      const avgCorrelation = correlations.reduce((sum, corr) => sum + Math.abs(corr), 0) / correlations.length;
      const maxCorrelation = Math.max(...correlations.map(Math.abs));
      const minCorrelation = Math.min(...correlations.map(Math.abs));

      // Calculate diversification ratio (lower correlation = better diversification)
      const diversificationRatio = Math.max(0, 1 - avgCorrelation);

      // Calculate concentration risk
      const strongCorrelations = pairs.filter(pair => Math.abs(pair.correlation) > 0.6).length;
      const concentrationRisk = (strongCorrelations / pairs.length) * 100;

      // Breakdown statistics
      const breakdown = {
        strongPositive: pairs.filter(pair => pair.correlation > 0.6).length,
        strongNegative: pairs.filter(pair => pair.correlation < -0.6).length,
        weak: pairs.filter(pair => Math.abs(pair.correlation) < 0.3).length,
        unstable: pairs.filter(pair => pair.pValue > 0.05).length
      };

      return {
        matrix,
        pairs,
        clusters,
        avgCorrelation,
        maxCorrelation,
        minCorrelation,
        diversificationRatio,
        concentrationRisk,
        breakdown
      };

    } catch (error) {
      console.error('Error generating correlation data:', error);
      throw error;
    }
  };

  const fetchCorrelationData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await generateCorrelationData();
      setCorrelationData(data);
    } catch (error: any) {
      console.error('Error fetching correlation data:', error);
      setError(error.message || 'Failed to fetch correlation data');
      toast.error('Failed to fetch correlation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (symbols.length >= 2) {
      fetchCorrelationData();
    }
  }, [symbols, timeframe, lookbackPeriods]);

  useEffect(() => {
    if (!autoRefresh || symbols.length < 2) return;

    const interval = setInterval(fetchCorrelationData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbols, timeframe, lookbackPeriods]);

  const getCellContent = (symbol1: string, symbol2: string) => {
    if (!correlationData) return { value: '0.00', color: CORRELATION_COLORS.NEUTRAL };

    const correlation = correlationData.matrix[symbol1]?.[symbol2] || 0;

    if (symbol1 === symbol2) {
      return { value: '1.00', color: '#374151' }; // Dark gray for diagonal
    }

    let value: string;
    let color: string;

    switch (heatmapMode) {
      case 'correlation':
        value = correlation.toFixed(2);
        color = getCorrelationColor(correlation);
        break;
      case 'significance':
        const pair = correlationData.pairs.find(p =>
          (p.symbol1 === symbol1 && p.symbol2 === symbol2) ||
          (p.symbol1 === symbol2 && p.symbol2 === symbol1)
        );
        const significance = pair ? getSignificance(pair.correlation) : 'WEAK';
        value = significance.charAt(0);
        color = SIGNIFICANCE_LEVELS[significance].color;
        break;
      case 'stability':
        const stabilityPair = correlationData.pairs.find(p =>
          (p.symbol1 === symbol1 && p.symbol2 === symbol2) ||
          (p.symbol1 === symbol2 && p.symbol2 === symbol1)
        );
        const stability = stabilityPair ? stabilityPair.stability : 0;
        value = (stability * 100).toFixed(0);
        color = `rgba(59, 130, 246, ${stability})`; // Blue with stability-based opacity
        break;
      default:
        value = correlation.toFixed(2);
        color = getCorrelationColor(correlation);
    }

    return { value, color };
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading correlation matrix</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Grid3X3 className="h-6 w-6 text-indigo-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Correlation Matrix</h3>
            <p className="text-sm text-gray-600">Cross-Asset Correlation Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowClusters(!showClusters)}
            className={`p-2 rounded-lg transition-colors ${
              showClusters ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Toggle Clusters"
          >
            <Activity className="h-4 w-4" />
          </button>
          <button
            onClick={fetchCorrelationData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex items-center bg-gray-100 rounded-lg p-1 mb-6">
        {[
          { id: 'correlation', label: 'Correlation' },
          { id: 'significance', label: 'Significance' },
          { id: 'stability', label: 'Stability' }
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setHeatmapMode(id as any)}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              heatmapMode === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !correlationData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-2 text-gray-600">Calculating correlations...</span>
        </div>
      ) : correlationData ? (
        <div className="space-y-6">
          {/* Statistics Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-1">Avg Correlation</div>
              <div className={`text-lg font-bold ${
                correlationData.avgCorrelation > 0.6 ? 'text-red-600' :
                correlationData.avgCorrelation > 0.4 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {(correlationData.avgCorrelation * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-1">Diversification</div>
              <div className={`text-lg font-bold ${
                correlationData.diversificationRatio > 0.7 ? 'text-green-600' :
                correlationData.diversificationRatio > 0.5 ? 'text-orange-600' : 'text-red-600'
              }`}>
                {(correlationData.diversificationRatio * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-1">Concentration Risk</div>
              <div className={`text-lg font-bold ${
                correlationData.concentrationRisk > 50 ? 'text-red-600' :
                correlationData.concentrationRisk > 30 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {correlationData.concentrationRisk.toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-1">Strong Pairs</div>
              <div className={`text-lg font-bold ${
                correlationData.breakdown.strongPositive > 5 ? 'text-red-600' :
                correlationData.breakdown.strongPositive > 2 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {correlationData.breakdown.strongPositive}
              </div>
            </div>
          </div>

          {/* Correlation Matrix Grid */}
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="w-16"></th>
                    {symbols.map(symbol => (
                      <th key={symbol} className="px-2 py-1 text-xs font-medium text-gray-700 text-center min-w-16">
                        {symbol.replace('USDT', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {symbols.map(symbol1 => (
                    <tr key={symbol1}>
                      <td className="px-2 py-1 text-xs font-medium text-gray-700 text-right">
                        {symbol1.replace('USDT', '')}
                      </td>
                      {symbols.map(symbol2 => {
                        const { value, color } = getCellContent(symbol1, symbol2);
                        return (
                          <td
                            key={symbol2}
                            className="p-1"
                            onClick={() => {
                              if (symbol1 !== symbol2) {
                                const pair = correlationData.pairs.find(p =>
                                  (p.symbol1 === symbol1 && p.symbol2 === symbol2) ||
                                  (p.symbol1 === symbol2 && p.symbol2 === symbol1)
                                );
                                if (pair) setSelectedPair(pair);
                              }
                            }}
                          >
                            <div
                              className="h-8 w-16 flex items-center justify-center text-xs font-medium text-white rounded cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: color }}
                            >
                              {value}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Correlation Clusters */}
          {showClusters && correlationData.clusters.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Correlation Clusters ({correlationData.clusters.length})
              </h4>
              <div className="grid gap-3">
                {correlationData.clusters.map((cluster, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-3 ${
                      cluster.riskLevel === 'EXTREME' ? 'bg-red-50 border-red-200' :
                      cluster.riskLevel === 'HIGH' ? 'bg-orange-50 border-orange-200' :
                      cluster.riskLevel === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-green-50 border-green-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          cluster.riskLevel === 'EXTREME' ? 'bg-red-100 text-red-800' :
                          cluster.riskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                          cluster.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {cluster.riskLevel} RISK
                        </span>
                        <span className="text-sm font-medium">
                          {cluster.symbols.map(s => s.replace('USDT', '')).join(', ')}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600">
                        {(cluster.avgCorrelation * 100).toFixed(0)}% correlation
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{cluster.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="mb-3">
              <span className="font-medium text-gray-900">
                {heatmapMode.charAt(0).toUpperCase() + heatmapMode.slice(1)} Legend
              </span>
            </div>

            {heatmapMode === 'correlation' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: CORRELATION_COLORS.VERY_STRONG_NEGATIVE }}></div>
                  <span>Strong Negative (-0.8 to -1.0)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: CORRELATION_COLORS.NEUTRAL }}></div>
                  <span>Neutral (-0.2 to 0.2)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: CORRELATION_COLORS.MODERATE_POSITIVE }}></div>
                  <span>Moderate Positive (0.4 to 0.6)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: CORRELATION_COLORS.VERY_STRONG_POSITIVE }}></div>
                  <span>Strong Positive (0.8 to 1.0)</span>
                </div>
              </div>
            )}

            {heatmapMode === 'significance' && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: SIGNIFICANCE_LEVELS.WEAK.color }}></div>
                  <span>W - Weak (0-30%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: SIGNIFICANCE_LEVELS.MODERATE.color }}></div>
                  <span>M - Moderate (30-50%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: SIGNIFICANCE_LEVELS.STRONG.color }}></div>
                  <span>S - Strong (50-70%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: SIGNIFICANCE_LEVELS.VERY_STRONG.color }}></div>
                  <span>V - Very Strong (70%+)</span>
                </div>
              </div>
            )}

            {heatmapMode === 'stability' && (
              <div className="text-sm text-gray-600">
                Values show correlation stability (0-100%). Darker blue indicates more stable correlations.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Selected Pair Details Modal */}
      {selectedPair && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedPair(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">
                {selectedPair.symbol1.replace('USDT', '')} vs {selectedPair.symbol2.replace('USDT', '')}
              </h4>
              <button
                onClick={() => setSelectedPair(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Correlation</div>
                  <div className={`text-xl font-bold ${
                    Math.abs(selectedPair.correlation) > 0.6 ? 'text-red-600' :
                    Math.abs(selectedPair.correlation) > 0.3 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {selectedPair.correlation.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Significance</div>
                  <div className="font-medium">{selectedPair.significance}</div>
                </div>
                <div>
                  <div className="text-gray-500">Direction</div>
                  <div className={`font-medium flex items-center gap-1 ${
                    selectedPair.direction === 'POSITIVE' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {selectedPair.direction === 'POSITIVE' ?
                      <TrendingUp className="h-4 w-4" /> :
                      <TrendingDown className="h-4 w-4" />
                    }
                    {selectedPair.direction}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Stability</div>
                  <div className="font-medium">{(selectedPair.stability * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-500">P-Value</div>
                  <div className="font-medium">{selectedPair.pValue.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Timeframe</div>
                  <div className="font-medium">{selectedPair.timeframe}</div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-900 mb-2">Risk Assessment</div>
                <div className="text-sm text-gray-700">
                  {Math.abs(selectedPair.correlation) > 0.7 ? (
                    <span className="text-red-600">⚠️ High correlation risk - consider reducing exposure to one of these assets</span>
                  ) : Math.abs(selectedPair.correlation) > 0.5 ? (
                    <span className="text-orange-600">⚠️ Moderate correlation - monitor for diversification impact</span>
                  ) : selectedPair.correlation < -0.5 ? (
                    <span className="text-green-600">✅ Good diversification - negative correlation provides risk reduction</span>
                  ) : (
                    <span className="text-blue-600">ℹ️ Low correlation - good for portfolio diversification</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}