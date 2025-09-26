'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Grid3X3,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  RefreshCw,
  Eye,
  EyeOff,
  Settings
} from 'lucide-react';

interface HeatMapCell {
  symbol: string;
  allocation: number;
  riskScore: number;
  pnl: number;
  volatility: number;
  correlation: number;
  liquidity: number;
  trend: 'UP' | 'DOWN' | 'NEUTRAL';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  alerts: string[];
}

interface HeatMapData {
  cells: HeatMapCell[];
  totalRisk: number;
  concentration: number;
  diversification: number;
  efficiency: number;
  lastUpdate: string;
}

interface PortfolioHeatMapProps {
  symbols: string[];
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const RISK_COLORS = {
  LOW: '#10b981',      // green
  MEDIUM: '#eab308',   // yellow
  HIGH: '#f97316',     // orange
  EXTREME: '#ef4444'   // red
};

const PNL_COLORS = {
  positive: '#10b981',
  negative: '#ef4444',
  neutral: '#6b7280'
};

export default function PortfolioHeatMap({
  symbols,
  autoRefresh = true,
  refreshInterval = 10000,
  className = ''
}: PortfolioHeatMapProps) {
  const [heatMapData, setHeatMapData] = useState<HeatMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<HeatMapCell | null>(null);
  const [viewMode, setViewMode] = useState<'risk' | 'pnl' | 'allocation' | 'correlation'>('risk');
  const [showDetails, setShowDetails] = useState(false);

  // Calculate risk score based on multiple factors
  const calculateRiskScore = (volatility: number, correlation: number, liquidity: number, allocation: number) => {
    const volWeight = 0.4;
    const corrWeight = 0.3;
    const liqWeight = 0.2;
    const allocWeight = 0.1;

    const volScore = Math.min(100, volatility * 5);
    const corrScore = correlation * 100;
    const liqScore = Math.max(0, (0.01 - liquidity) * 10000); // Higher liquidity = lower risk
    const allocScore = Math.min(100, allocation * 2); // Higher allocation = higher concentration risk

    return volWeight * volScore + corrWeight * corrScore + liqWeight * liqScore + allocWeight * allocScore;
  };

  // Determine risk level from score
  const getRiskLevel = (score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' => {
    if (score >= 80) return 'EXTREME';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  };

  // Generate heat map data
  const generateHeatMapData = async (symbols: string[]): Promise<HeatMapData> => {
    try {
      const dataPromises = symbols.map(async (symbol) => {
        const [rtAnalysis, marketData] = await Promise.all([
          marketApi.getRealTimeAnalysis(symbol),
          marketApi.getMarketData(symbol)
        ]);
        return { symbol, rtAnalysis, marketData };
      });

      const symbolsData = await Promise.all(dataPromises);

      const cells: HeatMapCell[] = symbolsData.map((data, index) => {
        const mData = safeObject.get(data.marketData, 'data', {});
        const rtData = safeObject.get(data.rtAnalysis, 'data', {});
        const marketConditions = safeObject.get(rtData, 'marketConditions', {});

        const currentPrice = safeNumber.getValue(safeObject.get(mData, 'price', 0));
        const priceChange = safeNumber.getValue(safeObject.get(mData, 'change24h', 0));
        const volatility = Math.abs(priceChange);
        const spread = safeNumber.getValue(safeObject.get(marketConditions, 'spread', 0.001));

        // Simulate portfolio data (in real app, this would come from user's actual positions)
        const allocation = 100 / symbols.length; // Equal allocation for demo
        const correlation = 0.3 + Math.random() * 0.5; // Simulated correlation
        const liquidity = spread;
        const pnl = (Math.random() - 0.5) * allocation * 20; // Simulated PnL

        const riskScore = calculateRiskScore(volatility, correlation, liquidity, allocation);
        const riskLevel = getRiskLevel(riskScore);

        // Generate alerts based on conditions
        const alerts: string[] = [];
        if (riskScore > 80) alerts.push('High risk detected');
        if (volatility > 15) alerts.push('Extreme volatility');
        if (correlation > 0.8) alerts.push('High correlation risk');
        if (spread > 0.005) alerts.push('Poor liquidity');
        if (allocation > 25) alerts.push('Concentration risk');

        return {
          symbol: data.symbol,
          allocation,
          riskScore,
          pnl,
          volatility,
          correlation,
          liquidity,
          trend: priceChange > 2 ? 'UP' : priceChange < -2 ? 'DOWN' : 'NEUTRAL',
          riskLevel,
          alerts
        };
      });

      // Calculate portfolio metrics
      const totalRisk = cells.reduce((sum, cell) => sum + cell.riskScore * (cell.allocation / 100), 0);
      const maxAllocation = Math.max(...cells.map(cell => cell.allocation));
      const concentration = maxAllocation;
      const avgCorrelation = cells.reduce((sum, cell) => sum + cell.correlation, 0) / cells.length;
      const diversification = Math.max(0, 100 - avgCorrelation * 100);
      const efficiency = Math.max(0, 100 - totalRisk);

      return {
        cells,
        totalRisk,
        concentration,
        diversification,
        efficiency,
        lastUpdate: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error generating heat map data:', error);
      throw error;
    }
  };

  const fetchHeatMapData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await generateHeatMapData(symbols);
      setHeatMapData(data);
    } catch (error: any) {
      console.error('Error fetching heat map data:', error);
      setError(error.message || 'Failed to fetch heat map data');
      toast.error('Failed to fetch heat map data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (symbols.length > 0) {
      fetchHeatMapData();
    }
  }, [symbols]);

  useEffect(() => {
    if (!autoRefresh || symbols.length === 0) return;

    const interval = setInterval(fetchHeatMapData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbols]);

  // Get cell color based on view mode
  const getCellColor = (cell: HeatMapCell): string => {
    switch (viewMode) {
      case 'risk':
        return RISK_COLORS[cell.riskLevel];
      case 'pnl':
        if (cell.pnl > 0) return PNL_COLORS.positive;
        if (cell.pnl < 0) return PNL_COLORS.negative;
        return PNL_COLORS.neutral;
      case 'allocation':
        const allocOpacity = Math.min(1, cell.allocation / 25); // Max opacity at 25%
        return `rgba(59, 130, 246, ${allocOpacity})`; // Blue with varying opacity
      case 'correlation':
        const corrOpacity = cell.correlation;
        return `rgba(239, 68, 68, ${corrOpacity})`; // Red with correlation-based opacity
      default:
        return RISK_COLORS[cell.riskLevel];
    }
  };

  // Get cell value text based on view mode
  const getCellValue = (cell: HeatMapCell): string => {
    switch (viewMode) {
      case 'risk':
        return cell.riskScore.toFixed(0);
      case 'pnl':
        return cell.pnl >= 0 ? `+${cell.pnl.toFixed(1)}%` : `${cell.pnl.toFixed(1)}%`;
      case 'allocation':
        return `${cell.allocation.toFixed(1)}%`;
      case 'correlation':
        return cell.correlation.toFixed(2);
      default:
        return cell.riskScore.toFixed(0);
    }
  };

  // Calculate grid dimensions
  const gridSize = Math.ceil(Math.sqrt(symbols.length));
  const cellSize = Math.max(80, Math.min(120, 400 / gridSize));

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading portfolio heat map</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Grid3X3 className="h-6 w-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Portfolio Heat Map</h3>
            <p className="text-sm text-gray-600">Visual Risk Distribution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
            title="Toggle Details"
          >
            {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={fetchHeatMapData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* View Mode Selector */}
      <div className="flex items-center bg-gray-100 rounded-lg p-1 mb-6">
        {[
          { id: 'risk', label: 'Risk' },
          { id: 'pnl', label: 'P&L' },
          { id: 'allocation', label: 'Allocation' },
          { id: 'correlation', label: 'Correlation' }
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setViewMode(id as any)}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              viewMode === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !heatMapData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Generating heat map...</span>
        </div>
      ) : heatMapData ? (
        <div className="space-y-6">
          {/* Portfolio Summary */}
          {showDetails && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600 mb-1">Total Risk</div>
                <div className={`text-lg font-bold ${
                  heatMapData.totalRisk > 60 ? 'text-red-600' :
                  heatMapData.totalRisk > 40 ? 'text-orange-600' : 'text-green-600'
                }`}>
                  {heatMapData.totalRisk.toFixed(1)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600 mb-1">Concentration</div>
                <div className={`text-lg font-bold ${
                  heatMapData.concentration > 40 ? 'text-red-600' :
                  heatMapData.concentration > 25 ? 'text-orange-600' : 'text-green-600'
                }`}>
                  {heatMapData.concentration.toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600 mb-1">Diversification</div>
                <div className={`text-lg font-bold ${
                  heatMapData.diversification > 70 ? 'text-green-600' :
                  heatMapData.diversification > 50 ? 'text-orange-600' : 'text-red-600'
                }`}>
                  {heatMapData.diversification.toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm text-gray-600 mb-1">Efficiency</div>
                <div className={`text-lg font-bold ${
                  heatMapData.efficiency > 70 ? 'text-green-600' :
                  heatMapData.efficiency > 50 ? 'text-orange-600' : 'text-red-600'
                }`}>
                  {heatMapData.efficiency.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Heat Map Grid */}
          <div className="flex justify-center">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
                maxWidth: '100%'
              }}
            >
              {heatMapData.cells.map((cell) => (
                <div
                  key={cell.symbol}
                  className="relative rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border border-gray-200"
                  style={{
                    backgroundColor: getCellColor(cell),
                    height: `${cellSize}px`,
                    minHeight: '80px'
                  }}
                  onClick={() => setSelectedCell(cell)}
                >
                  {/* Cell Content */}
                  <div className="h-full flex flex-col justify-between p-2 text-white">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {cell.symbol.replace('USDT', '')}
                      </span>
                      {cell.alerts.length > 0 && (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                    </div>

                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {getCellValue(cell)}
                      </div>
                      {viewMode === 'risk' && (
                        <div className="text-xs opacity-90">
                          {cell.riskLevel}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      {cell.trend === 'UP' && <TrendingUp className="h-3 w-3" />}
                      {cell.trend === 'DOWN' && <TrendingDown className="h-3 w-3" />}
                      {cell.trend === 'NEUTRAL' && <div className="h-3 w-3" />}

                      <span className="text-xs">
                        {cell.volatility.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-gray-900">
                {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)} Legend
              </span>
              <span className="text-xs text-gray-500">
                Updated: {new Date(heatMapData.lastUpdate).toLocaleTimeString()}
              </span>
            </div>

            {viewMode === 'risk' && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: RISK_COLORS.LOW }}></div>
                  <span>Low (0-40)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: RISK_COLORS.MEDIUM }}></div>
                  <span>Medium (40-60)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: RISK_COLORS.HIGH }}></div>
                  <span>High (60-80)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: RISK_COLORS.EXTREME }}></div>
                  <span>Extreme (80+)</span>
                </div>
              </div>
            )}

            {viewMode === 'pnl' && (
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: PNL_COLORS.positive }}></div>
                  <span>Profit</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: PNL_COLORS.neutral }}></div>
                  <span>Breakeven</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: PNL_COLORS.negative }}></div>
                  <span>Loss</span>
                </div>
              </div>
            )}

            {(viewMode === 'allocation' || viewMode === 'correlation') && (
              <div className="text-sm text-gray-600">
                Darker colors indicate higher {viewMode} values
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Selected Cell Details Modal */}
      {selectedCell && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedCell(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">
                {selectedCell.symbol.replace('USDT', '')} Details
              </h4>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Risk Score</div>
                  <div className="font-medium">{selectedCell.riskScore.toFixed(0)} ({selectedCell.riskLevel})</div>
                </div>
                <div>
                  <div className="text-gray-500">Allocation</div>
                  <div className="font-medium">{selectedCell.allocation.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-500">Volatility</div>
                  <div className="font-medium">{selectedCell.volatility.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-gray-500">Correlation</div>
                  <div className="font-medium">{selectedCell.correlation.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-gray-500">P&L</div>
                  <div className={`font-medium ${selectedCell.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedCell.pnl >= 0 ? '+' : ''}{selectedCell.pnl.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Trend</div>
                  <div className="font-medium flex items-center gap-1">
                    {selectedCell.trend === 'UP' && <TrendingUp className="h-4 w-4 text-green-600" />}
                    {selectedCell.trend === 'DOWN' && <TrendingDown className="h-4 w-4 text-red-600" />}
                    {selectedCell.trend}
                  </div>
                </div>
              </div>

              {selectedCell.alerts.length > 0 && (
                <div>
                  <div className="text-sm text-gray-500 mb-2">Active Alerts</div>
                  <div className="space-y-1">
                    {selectedCell.alerts.map((alert, index) => (
                      <div key={index} className="text-sm bg-orange-50 text-orange-700 p-2 rounded">
                        {alert}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}