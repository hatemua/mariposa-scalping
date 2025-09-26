'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Calculator,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  Activity,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Sliders
} from 'lucide-react';

interface KellyCriterionData {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  kellyPercentage: number;
  recommendation: string;
}

interface VolatilityBasedSizing {
  atr: number;
  volatilityAdjustment: number;
  recommendedSize: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

interface PositionSizeRecommendation {
  method: string;
  size: number;
  reasoning: string;
  confidence: number;
  riskRating: number;
}

interface RiskScenario {
  name: string;
  probability: number;
  potentialLoss: number;
  description: string;
}

interface PositionSizingData {
  symbol: string;
  currentPrice: number;
  accountBalance: number;
  riskPerTrade: number;
  kellyCriterion: KellyCriterionData;
  volatilityBased: VolatilityBasedSizing;
  recommendations: PositionSizeRecommendation[];
  optimalSize: {
    amount: number;
    percentage: number;
    method: string;
    reasoning: string;
  };
  riskScenarios: RiskScenario[];
  stopLossLevels: Array<{
    price: number;
    distance: number;
    positionSize: number;
  }>;
}

interface PositionSizingCalculatorProps {
  symbol: string;
  accountBalance?: number;
  riskPerTrade?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const RISK_COLORS = {
  LOW: 'text-green-600 bg-green-50 border-green-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
  EXTREME: 'text-red-600 bg-red-50 border-red-200'
};

export default function PositionSizingCalculator({
  symbol,
  accountBalance = 10000, // Default $10k account
  riskPerTrade = 2, // Default 2% risk
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  className = ''
}: PositionSizingCalculatorProps) {
  const [sizingData, setSizingData] = useState<PositionSizingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Interactive inputs
  const [customBalance, setCustomBalance] = useState(accountBalance);
  const [customRisk, setCustomRisk] = useState(riskPerTrade);
  const [customStopLoss, setCustomStopLoss] = useState(2); // 2% default stop loss

  // Calculate position sizing recommendations
  const calculatePositionSizing = async (symbol: string): Promise<PositionSizingData> => {
    try {
      // Get market data for analysis
      const [rtAnalysis, chartData, marketData] = await Promise.all([
        marketApi.getRealTimeAnalysis(symbol),
        marketApi.getChartData(symbol, '15m', 50),
        marketApi.getMarketData(symbol)
      ]);

      const rtData = safeObject.get(rtAnalysis, 'data', {});
      const mData = safeObject.get(marketData, 'data', {});
      const chartKlines = safeObject.get(chartData, 'data.klines', []);

      const currentPrice = safeNumber.getValue(safeObject.get(mData, 'price', 0));
      const marketConditions = safeObject.get(rtData, 'marketConditions', {});
      const consensus = safeObject.get(rtData, 'consensus', {});

      // Calculate ATR for volatility-based sizing
      const atr = chartKlines.length > 14 ?
        chartKlines.slice(-14).reduce((sum: number, candle: any) => {
          const high = parseFloat(candle[2]);
          const low = parseFloat(candle[3]);
          const prevClose = parseFloat(candle[4]);
          const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
          return sum + tr;
        }, 0) / 14 : currentPrice * 0.02;

      // Kelly Criterion calculation (simulated based on AI confidence)
      const winRate = Math.max(0.3, Math.min(0.8, safeNumber.getValue(safeObject.get(consensus, 'confidence', 0.5))));
      const avgWin = 2.5; // Simulated average win multiplier
      const avgLoss = 1.0; // Risk 1 to make X
      const kellyPercentage = Math.max(0, Math.min(25,
        ((winRate * avgWin) - (1 - winRate) * avgLoss) / avgWin * 100
      ));

      const kellyCriterion: KellyCriterionData = {
        winRate,
        avgWin,
        avgLoss,
        kellyPercentage,
        recommendation: kellyPercentage > 10 ? 'Aggressive sizing possible' :
                        kellyPercentage > 5 ? 'Moderate sizing recommended' :
                        'Conservative sizing advised'
      };

      // Volatility-based sizing
      const volatility = safeNumber.getValue(safeObject.get(marketConditions, 'volatility', 2));
      const volatilityAdjustment = Math.max(0.25, Math.min(2, 2 / Math.max(0.5, volatility / 2)));

      const volatilityBased: VolatilityBasedSizing = {
        atr,
        volatilityAdjustment,
        recommendedSize: customRisk * volatilityAdjustment,
        riskLevel: volatility > 8 ? 'EXTREME' :
                  volatility > 5 ? 'HIGH' :
                  volatility > 3 ? 'MEDIUM' : 'LOW'
      };

      // Generate position size recommendations
      const recommendations: PositionSizeRecommendation[] = [
        {
          method: 'Fixed Risk %',
          size: (customBalance * (customRisk / 100)) / (currentPrice * (customStopLoss / 100)),
          reasoning: `Risk ${customRisk}% of capital with ${customStopLoss}% stop loss`,
          confidence: 0.9,
          riskRating: 5
        },
        {
          method: 'Kelly Criterion',
          size: (customBalance * (kellyPercentage / 100)) / currentPrice,
          reasoning: `Kelly formula suggests ${kellyPercentage.toFixed(1)}% allocation`,
          confidence: 0.7,
          riskRating: kellyPercentage > 10 ? 8 : kellyPercentage > 5 ? 6 : 4
        },
        {
          method: 'Volatility Adjusted',
          size: (customBalance * (volatilityBased.recommendedSize / 100)) / currentPrice,
          reasoning: `Adjusted for ${volatility.toFixed(1)}% volatility`,
          confidence: 0.8,
          riskRating: volatility > 5 ? 7 : volatility > 3 ? 5 : 3
        },
        {
          method: 'ATR Based',
          size: (customBalance * (customRisk / 100)) / (atr * 2),
          reasoning: `2x ATR stop with ${customRisk}% risk`,
          confidence: 0.85,
          riskRating: 4
        }
      ];

      // Find optimal size (weighted average of high-confidence methods)
      const highConfidenceMethods = recommendations.filter(r => r.confidence > 0.75);
      const optimalSize = highConfidenceMethods.reduce((sum, r) => sum + r.size * r.confidence, 0) /
                         highConfidenceMethods.reduce((sum, r) => sum + r.confidence, 0);

      // Generate risk scenarios
      const riskScenarios: RiskScenario[] = [
        {
          name: 'Normal Market',
          probability: 0.7,
          potentialLoss: customBalance * (customRisk / 100),
          description: 'Standard stop loss hit in normal conditions'
        },
        {
          name: 'Gap Down',
          probability: 0.15,
          potentialLoss: customBalance * (customRisk / 100) * 2,
          description: 'Gap below stop loss level'
        },
        {
          name: 'Flash Crash',
          probability: 0.05,
          potentialLoss: customBalance * (customRisk / 100) * 5,
          description: 'Extreme market event with significant slippage'
        },
        {
          name: 'Black Swan',
          probability: 0.01,
          potentialLoss: customBalance * 0.5,
          description: 'Catastrophic market event'
        }
      ];

      // Calculate stop loss levels for different position sizes
      const stopLossLevels = [1, 2, 3, 5].map(percentage => ({
        price: currentPrice * (1 - percentage / 100),
        distance: percentage,
        positionSize: (customBalance * (customRisk / 100)) / (currentPrice * (percentage / 100))
      }));

      return {
        symbol,
        currentPrice,
        accountBalance: customBalance,
        riskPerTrade: customRisk,
        kellyCriterion,
        volatilityBased,
        recommendations,
        optimalSize: {
          amount: optimalSize,
          percentage: (optimalSize * currentPrice / customBalance) * 100,
          method: 'Weighted Average',
          reasoning: 'Combination of high-confidence methods'
        },
        riskScenarios,
        stopLossLevels
      };

    } catch (error) {
      console.error('Error calculating position sizing:', error);
      throw error;
    }
  };

  const fetchSizingData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await calculatePositionSizing(symbol);
      setSizingData(data);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error fetching sizing data:', error);
      setError(error.message || 'Failed to calculate position sizing');
      toast.error('Failed to calculate position sizing');
    } finally {
      setLoading(false);
    }
  };

  // Recalculate when inputs change
  useEffect(() => {
    const delayedCalculation = setTimeout(() => {
      if (sizingData) fetchSizingData();
    }, 500);

    return () => clearTimeout(delayedCalculation);
  }, [customBalance, customRisk, customStopLoss]);

  useEffect(() => {
    fetchSizingData();
  }, [symbol]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchSizingData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbol]);

  const RecommendationCard = ({ rec }: { rec: PositionSizeRecommendation }) => {
    const getRiskColor = (rating: number) => {
      if (rating >= 8) return 'text-red-600 bg-red-50';
      if (rating >= 6) return 'text-orange-600 bg-orange-50';
      if (rating >= 4) return 'text-yellow-600 bg-yellow-50';
      return 'text-green-600 bg-green-50';
    };

    const dollarAmount = sizingData ? rec.size * sizingData.currentPrice : 0;

    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium text-gray-900">{rec.method}</span>
          <div className={`px-2 py-1 rounded text-xs ${getRiskColor(rec.riskRating)}`}>
            Risk: {rec.riskRating}/10
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Position Size:</span>
            <span className="font-medium">{rec.size.toFixed(4)} {symbol.replace('USDT', '')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Dollar Amount:</span>
            <span className="font-medium">${dollarAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Confidence:</span>
            <span className="font-medium">{Math.round(rec.confidence * 100)}%</span>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600">{rec.reasoning}</div>
      </div>
    );
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading position sizing</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Position Sizing</h3>
            <p className="text-sm text-gray-600">{symbol} • Intelligent Size Calculator</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchSizingData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !sizingData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Calculating optimal sizing...</span>
        </div>
      ) : sizingData ? (
        <div className="space-y-6">
          {/* Interactive Controls */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-gray-900">Parameters</h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">Account Balance</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    value={customBalance}
                    onChange={(e) => setCustomBalance(Number(e.target.value))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="10000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">Risk Per Trade (%)</label>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.1"
                  value={customRisk}
                  onChange={(e) => setCustomRisk(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-center text-sm font-medium mt-1">{customRisk.toFixed(1)}%</div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">Stop Loss (%)</label>
                <input
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.1"
                  value={customStopLoss}
                  onChange={(e) => setCustomStopLoss(Number(e.target.value))}
                  className="w-full"
                />
                <div className="text-center text-sm font-medium mt-1">{customStopLoss.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Optimal Size Recommendation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-900">Optimal Position Size</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-blue-600">Size</div>
                <div className="font-bold text-blue-900">
                  {sizingData.optimalSize.amount.toFixed(4)} {symbol.replace('USDT', '')}
                </div>
              </div>
              <div>
                <div className="text-blue-600">Value</div>
                <div className="font-bold text-blue-900">
                  ${(sizingData.optimalSize.amount * sizingData.currentPrice).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-blue-600">% of Account</div>
                <div className="font-bold text-blue-900">
                  {sizingData.optimalSize.percentage.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-blue-600">Method</div>
                <div className="font-bold text-blue-900">{sizingData.optimalSize.method}</div>
              </div>
            </div>

            <div className="mt-3 text-sm text-blue-700">
              {sizingData.optimalSize.reasoning}
            </div>
          </div>

          {/* All Recommendations */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Size Recommendations
            </h4>
            <div className="grid gap-3">
              {sizingData.recommendations.map((rec, index) => (
                <RecommendationCard key={index} rec={rec} />
              ))}
            </div>
          </div>

          {/* Kelly Criterion Analysis */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-900 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Kelly Criterion Analysis
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-green-600">Win Rate</div>
                <div className="font-medium">{Math.round(sizingData.kellyCriterion.winRate * 100)}%</div>
              </div>
              <div>
                <div className="text-green-600">Avg Win</div>
                <div className="font-medium">{sizingData.kellyCriterion.avgWin.toFixed(1)}x</div>
              </div>
              <div>
                <div className="text-green-600">Kelly %</div>
                <div className="font-medium">{sizingData.kellyCriterion.kellyPercentage.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-green-600">Status</div>
                <div className="font-medium">{sizingData.kellyCriterion.recommendation}</div>
              </div>
            </div>
          </div>

          {/* Risk Scenarios */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Risk Scenarios
            </h4>
            <div className="space-y-2">
              {sizingData.riskScenarios.map((scenario, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{scenario.name}</span>
                    <span className="text-sm text-gray-600">
                      {Math.round(scenario.probability * 100)}% chance
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">{scenario.description}</span>
                    <span className="font-medium text-red-600">
                      -${scenario.potentialLoss.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Volatility Assessment */}
          <div className={`rounded-lg border p-4 ${RISK_COLORS[sizingData.volatilityBased.riskLevel]}`}>
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" />
              <span className="font-medium">Volatility Assessment</span>
            </div>
            <div className="text-sm">
              Risk Level: <span className="font-medium">{sizingData.volatilityBased.riskLevel}</span>
              {' • '}
              Adjustment Factor: <span className="font-medium">{sizingData.volatilityBased.volatilityAdjustment.toFixed(2)}x</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}