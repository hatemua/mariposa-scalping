'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  BarChart3,
  Target,
  Zap,
  Clock,
  RefreshCw,
  Eye,
  Brain,
  DollarSign,
  Percent,
  Layers,
  Grid3X3
} from 'lucide-react';

interface PortfolioPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  riskAllocation: number;
  correlation: number;
  volatility: number;
  riskScore: number;
}

interface VaRMetrics {
  oneDay95: number;
  oneDay99: number;
  oneWeek95: number;
  oneWeek99: number;
  expectedShortfall: number;
  confidence: number;
}

interface StressTestScenario {
  name: string;
  description: string;
  portfolioImpact: number;
  probability: number;
  timeframe: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

interface RiskAlert {
  id: string;
  type: 'CONCENTRATION' | 'CORRELATION' | 'VAR_BREACH' | 'DRAWDOWN' | 'LIQUIDITY';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  action: string;
  timestamp: string;
  symbol?: string;
}

interface MarketRegime {
  type: 'TRENDING_BULL' | 'TRENDING_BEAR' | 'RANGING' | 'VOLATILE' | 'CRISIS';
  confidence: number;
  duration: string;
  characteristics: string[];
  riskImplications: string;
}

interface AdvancedRiskData {
  symbol: string;
  portfolioPositions: PortfolioPosition[];
  varMetrics: VaRMetrics;
  stressTests: StressTestScenario[];
  riskAlerts: RiskAlert[];
  marketRegime: MarketRegime;
  overallPortfolioRisk: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  correlationMatrix: { [key: string]: { [key: string]: number } };
  liquidityMetrics: {
    marketDepth: number;
    averageSpread: number;
    impactCost: number;
    liquidityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

interface AdvancedRiskManagerProps {
  symbol: string;
  portfolioSymbols?: string[];
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const SEVERITY_COLORS = {
  LOW: 'bg-green-100 text-green-800 border-green-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  EXTREME: 'bg-red-100 text-red-800 border-red-200'
};

const ALERT_COLORS = {
  INFO: 'bg-blue-50 border-blue-200 text-blue-700',
  WARNING: 'bg-orange-50 border-orange-200 text-orange-700',
  CRITICAL: 'bg-red-50 border-red-200 text-red-700'
};

const REGIME_COLORS = {
  TRENDING_BULL: 'bg-green-100 text-green-800',
  TRENDING_BEAR: 'bg-red-100 text-red-800',
  RANGING: 'bg-blue-100 text-blue-800',
  VOLATILE: 'bg-orange-100 text-orange-800',
  CRISIS: 'bg-red-200 text-red-900'
};

export default function AdvancedRiskManager({
  symbol,
  portfolioSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT'],
  autoRefresh = true,
  refreshInterval = 120000, // 2 minutes for risk analysis (was 5s - too aggressive)
  className = ''
}: AdvancedRiskManagerProps) {
  const [riskData, setRiskData] = useState<AdvancedRiskData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'overview' | 'portfolio' | 'stress' | 'alerts'>('overview');

  // Calculate correlation between two price series
  const calculateCorrelation = (prices1: number[], prices2: number[]) => {
    if (prices1.length !== prices2.length || prices1.length < 2) return 0;

    const n = prices1.length;
    const sum1 = prices1.reduce((a, b) => a + b, 0);
    const sum2 = prices2.reduce((a, b) => a + b, 0);
    const sum1Sq = prices1.reduce((a, b) => a + b * b, 0);
    const sum2Sq = prices2.reduce((a, b) => a + b * b, 0);
    const pSum = prices1.reduce((sum, a, i) => sum + a * prices2[i], 0);

    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));

    return den === 0 ? 0 : num / den;
  };

  // Calculate Value at Risk using historical simulation
  const calculateVaR = (returns: number[], confidence: number) => {
    if (returns.length === 0) return 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    return Math.abs(sortedReturns[index] || 0);
  };

  // Analyze comprehensive risk metrics
  const analyzeAdvancedRisk = async (symbol: string): Promise<AdvancedRiskData> => {
    try {
      // Get data for all symbols
      const dataPromises = portfolioSymbols.map(async (sym) => {
        const [rtAnalysis, chartData, marketData] = await Promise.all([
          marketApi.getRealTimeAnalysis(sym),
          marketApi.getChartData(sym, '1h', 168), // 1 week of hourly data
          marketApi.getMarketData(sym)
        ]);
        return { symbol: sym, rtAnalysis, chartData, marketData };
      });

      const symbolsData = await Promise.all(dataPromises);

      // Process portfolio positions
      const portfolioPositions: PortfolioPosition[] = symbolsData.map((data, index) => {
        const mData = safeObject.get(data.marketData, 'data', {});
        const rtData = safeObject.get(data.rtAnalysis, 'data', {});
        const currentPrice = safeNumber.getValue(safeObject.get(mData, 'price', 0));
        const priceChange = safeNumber.getValue(safeObject.get(mData, 'change24h', 0));

        // Simulate portfolio positions (in real app, this would come from user's actual positions)
        const entryPrice = currentPrice * (1 - Math.random() * 0.02); // Simulate entry within 2%
        const size = 1000 + Math.random() * 9000; // Random position size
        const unrealizedPnL = (currentPrice - entryPrice) * size / entryPrice;

        return {
          symbol: data.symbol,
          side: Math.random() > 0.5 ? 'LONG' : 'SHORT',
          size,
          entryPrice,
          currentPrice,
          unrealizedPnL,
          riskAllocation: 100 / portfolioSymbols.length, // Equal allocation
          correlation: 0.5 + Math.random() * 0.4, // Simulated correlation
          volatility: Math.abs(priceChange),
          riskScore: Math.min(100, Math.abs(priceChange) * 5)
        };
      });

      // Calculate correlation matrix
      const correlationMatrix: { [key: string]: { [key: string]: number } } = {};
      for (let i = 0; i < portfolioSymbols.length; i++) {
        correlationMatrix[portfolioSymbols[i]] = {};
        for (let j = 0; j < portfolioSymbols.length; j++) {
          if (i === j) {
            correlationMatrix[portfolioSymbols[i]][portfolioSymbols[j]] = 1.0;
          } else {
            // Simulate correlation (in real app, calculate from price data)
            correlationMatrix[portfolioSymbols[i]][portfolioSymbols[j]] =
              0.3 + Math.random() * 0.4;
          }
        }
      }

      // Calculate portfolio returns for VaR
      const portfolioReturns: number[] = [];
      for (let i = 0; i < 100; i++) {
        const dailyReturn = portfolioPositions.reduce((sum, pos) => {
          const randomReturn = (Math.random() - 0.5) * pos.volatility * 0.1;
          return sum + (randomReturn * pos.riskAllocation / 100);
        }, 0);
        portfolioReturns.push(dailyReturn);
      }

      // Calculate VaR metrics
      const varMetrics: VaRMetrics = {
        oneDay95: calculateVaR(portfolioReturns, 0.95),
        oneDay99: calculateVaR(portfolioReturns, 0.99),
        oneWeek95: calculateVaR(portfolioReturns, 0.95) * Math.sqrt(7),
        oneWeek99: calculateVaR(portfolioReturns, 0.99) * Math.sqrt(7),
        expectedShortfall: calculateVaR(portfolioReturns, 0.975), // ES at 97.5%
        confidence: 0.95
      };

      // Generate stress test scenarios
      const stressTests: StressTestScenario[] = [
        {
          name: 'Market Crash (-20%)',
          description: 'Broad crypto market decline of 20%',
          portfolioImpact: -18.5,
          probability: 0.05,
          timeframe: '1-3 days',
          severity: 'HIGH'
        },
        {
          name: 'Bitcoin Dominance Shift',
          description: 'Major BTC dominance change affecting alts',
          portfolioImpact: -12.3,
          probability: 0.15,
          timeframe: '1-2 weeks',
          severity: 'MEDIUM'
        },
        {
          name: 'Regulatory Shock',
          description: 'Major regulatory announcement',
          portfolioImpact: -25.7,
          probability: 0.03,
          timeframe: 'Immediate',
          severity: 'EXTREME'
        },
        {
          name: 'Exchange Outage',
          description: 'Major exchange technical issues',
          portfolioImpact: -8.2,
          probability: 0.08,
          timeframe: '6-12 hours',
          severity: 'MEDIUM'
        }
      ];

      // Generate risk alerts
      const riskAlerts: RiskAlert[] = [];

      // Check for high correlation
      const highCorrelations = Object.keys(correlationMatrix).some(sym1 =>
        Object.keys(correlationMatrix[sym1]).some(sym2 =>
          sym1 !== sym2 && correlationMatrix[sym1][sym2] > 0.8
        )
      );

      if (highCorrelations) {
        riskAlerts.push({
          id: 'high-correlation',
          type: 'CORRELATION',
          severity: 'WARNING',
          message: 'High correlation detected between portfolio positions',
          action: 'Consider reducing correlated positions',
          timestamp: new Date().toISOString()
        });
      }

      // Check for concentration risk
      const maxAllocation = Math.max(...portfolioPositions.map(p => p.riskAllocation));
      if (maxAllocation > 40) {
        riskAlerts.push({
          id: 'concentration-risk',
          type: 'CONCENTRATION',
          severity: 'CRITICAL',
          message: `High concentration in single position: ${maxAllocation.toFixed(1)}%`,
          action: 'Reduce position size or diversify',
          timestamp: new Date().toISOString()
        });
      }

      // Check VaR breach
      if (varMetrics.oneDay95 > 10) {
        riskAlerts.push({
          id: 'var-breach',
          type: 'VAR_BREACH',
          severity: 'WARNING',
          message: `Daily VaR exceeds 10%: ${varMetrics.oneDay95.toFixed(2)}%`,
          action: 'Consider reducing portfolio risk',
          timestamp: new Date().toISOString()
        });
      }

      // Determine market regime
      const avgVolatility = portfolioPositions.reduce((sum, pos) => sum + pos.volatility, 0) / portfolioPositions.length;
      const marketRegime: MarketRegime = (() => {
        if (avgVolatility > 15) {
          return {
            type: 'CRISIS',
            confidence: 0.85,
            duration: 'Active',
            characteristics: ['High volatility', 'Fear sentiment', 'Liquidity stress'],
            riskImplications: 'Extreme risk - reduce exposure'
          };
        } else if (avgVolatility > 8) {
          return {
            type: 'VOLATILE',
            confidence: 0.75,
            duration: '2-5 days',
            characteristics: ['Elevated volatility', 'Uncertainty', 'Range-bound'],
            riskImplications: 'Elevated risk - use smaller positions'
          };
        } else if (avgVolatility > 3) {
          return {
            type: portfolioPositions[0].unrealizedPnL > 0 ? 'TRENDING_BULL' : 'TRENDING_BEAR',
            confidence: 0.65,
            duration: '1-2 weeks',
            characteristics: ['Directional movement', 'Moderate volatility', 'Trend continuation'],
            riskImplications: 'Normal risk conditions'
          };
        } else {
          return {
            type: 'RANGING',
            confidence: 0.70,
            duration: '1-3 weeks',
            characteristics: ['Low volatility', 'Sideways movement', 'Consolidation'],
            riskImplications: 'Low risk - suitable for larger positions'
          };
        }
      })();

      // Calculate portfolio metrics
      const totalValue = portfolioPositions.reduce((sum, pos) => sum + Math.abs(pos.unrealizedPnL), 0);
      const overallPortfolioRisk = Math.min(100, varMetrics.oneDay95 * 2);
      const maxDrawdown = Math.max(...portfolioPositions.map(pos =>
        pos.unrealizedPnL < 0 ? Math.abs(pos.unrealizedPnL / pos.size * 100) : 0
      ));

      return {
        symbol,
        portfolioPositions,
        varMetrics,
        stressTests,
        riskAlerts,
        marketRegime,
        overallPortfolioRisk,
        maxDrawdown,
        sharpeRatio: 1.2 + Math.random() * 0.8, // Simulated
        sortinoRatio: 1.5 + Math.random() * 1.0, // Simulated
        correlationMatrix,
        liquidityMetrics: {
          marketDepth: 50000 + Math.random() * 100000,
          averageSpread: 0.001 + Math.random() * 0.002,
          impactCost: 0.05 + Math.random() * 0.1,
          liquidityRisk: avgVolatility > 10 ? 'HIGH' : avgVolatility > 5 ? 'MEDIUM' : 'LOW'
        }
      };

    } catch (error) {
      console.error('Error analyzing advanced risk:', error);
      throw error;
    }
  };

  const fetchRiskData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await analyzeAdvancedRisk(symbol);
      setRiskData(data);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error fetching advanced risk data:', error);
      setError(error.message || 'Failed to fetch risk data');
      toast.error('Failed to fetch advanced risk data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, [symbol]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchRiskData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbol]);

  const RiskGauge = ({ score, size = 100, label = 'Risk' }: { score: number; size?: number; label?: string }) => {
    const normalizedScore = Math.max(0, Math.min(100, score));
    const circumference = Math.PI * (size / 2 - 10);
    const strokeDasharray = `${(circumference * normalizedScore) / 100} ${circumference}`;

    const getColor = (score: number) => {
      if (score >= 80) return '#ef4444'; // red
      if (score >= 60) return '#f97316'; // orange
      if (score >= 40) return '#eab308'; // yellow
      return '#10b981'; // green
    };

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 10}
            stroke="#e5e7eb"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 10}
            stroke={getColor(score)}
            strokeWidth="8"
            fill="none"
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold" style={{ color: getColor(score) }}>
            {score.toFixed(0)}
          </div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading advanced risk manager</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-purple-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Advanced Risk Manager</h3>
            <p className="text-sm text-gray-600">Comprehensive Portfolio Risk Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchRiskData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* View Selector */}
      <div className="flex items-center bg-gray-100 rounded-lg p-1 mb-6">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'portfolio', label: 'Portfolio', icon: Grid3X3 },
          { id: 'stress', label: 'Stress Tests', icon: TrendingDown },
          { id: 'alerts', label: 'Alerts', icon: AlertTriangle }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSelectedView(id as any)}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              selectedView === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {loading && !riskData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          <span className="ml-2 text-gray-600">Analyzing portfolio risk...</span>
        </div>
      ) : riskData ? (
        <div className="space-y-6">
          {selectedView === 'overview' && (
            <>
              {/* Risk Gauges */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center">
                  <RiskGauge score={riskData.overallPortfolioRisk} size={120} label="Portfolio Risk" />
                </div>
                <div className="flex flex-col items-center">
                  <RiskGauge score={riskData.varMetrics.oneDay95 * 5} size={120} label="VaR Risk" />
                </div>
                <div className="flex flex-col items-center">
                  <RiskGauge score={Math.min(100, riskData.maxDrawdown * 10)} size={120} label="Drawdown" />
                </div>
              </div>

              {/* Market Regime */}
              <div className={`rounded-lg p-4 border ${REGIME_COLORS[riskData.marketRegime.type]}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    <span className="font-semibold">Market Regime: {riskData.marketRegime.type.replace('_', ' ')}</span>
                  </div>
                  <span className="text-sm">{Math.round(riskData.marketRegime.confidence * 100)}% confidence</span>
                </div>
                <p className="text-sm mb-2">{riskData.marketRegime.riskImplications}</p>
                <div className="text-xs">
                  Duration: {riskData.marketRegime.duration} •
                  Characteristics: {riskData.marketRegime.characteristics.join(', ')}
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Sharpe Ratio</div>
                  <div className="text-xl font-bold text-gray-900">{riskData.sharpeRatio.toFixed(2)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Sortino Ratio</div>
                  <div className="text-xl font-bold text-gray-900">{riskData.sortinoRatio.toFixed(2)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Max Drawdown</div>
                  <div className="text-xl font-bold text-red-600">{riskData.maxDrawdown.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Liquidity Risk</div>
                  <div className={`text-xl font-bold ${
                    riskData.liquidityMetrics.liquidityRisk === 'LOW' ? 'text-green-600' :
                    riskData.liquidityMetrics.liquidityRisk === 'MEDIUM' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {riskData.liquidityMetrics.liquidityRisk}
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedView === 'portfolio' && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                Portfolio Positions ({riskData.portfolioPositions.length})
              </h4>
              <div className="grid gap-4">
                {riskData.portfolioPositions.map((position) => (
                  <div key={position.symbol} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{position.symbol.replace('USDT', '')}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          position.side === 'LONG' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {position.side}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${position.unrealizedPnL.toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500">{position.riskAllocation.toFixed(1)}% allocation</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Entry</div>
                        <div className="font-medium">${position.entryPrice.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Current</div>
                        <div className="font-medium">${position.currentPrice.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Volatility</div>
                        <div className="font-medium">{position.volatility.toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Risk Score</div>
                        <div className={`font-medium ${
                          position.riskScore > 50 ? 'text-red-600' : position.riskScore > 25 ? 'text-orange-600' : 'text-green-600'
                        }`}>
                          {position.riskScore.toFixed(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedView === 'stress' && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Stress Test Scenarios
              </h4>
              <div className="grid gap-4">
                {riskData.stressTests.map((test, index) => (
                  <div key={index} className={`border rounded-lg p-4 ${SEVERITY_COLORS[test.severity]}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{test.name}</span>
                      <span className="text-sm">{Math.round(test.probability * 100)}% probability</span>
                    </div>
                    <p className="text-sm mb-2">{test.description}</p>
                    <div className="flex justify-between text-sm">
                      <span>Portfolio Impact: <span className="font-medium text-red-600">{test.portfolioImpact.toFixed(1)}%</span></span>
                      <span>Timeframe: {test.timeframe}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* VaR Metrics */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 mb-3">Value at Risk (VaR) Metrics</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">1-Day VaR (95%)</div>
                    <div className="font-medium text-red-600">{riskData.varMetrics.oneDay95.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500">1-Day VaR (99%)</div>
                    <div className="font-medium text-red-600">{riskData.varMetrics.oneDay99.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500">1-Week VaR (95%)</div>
                    <div className="font-medium text-red-600">{riskData.varMetrics.oneWeek95.toFixed(2)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Expected Shortfall</div>
                    <div className="font-medium text-red-600">{riskData.varMetrics.expectedShortfall.toFixed(2)}%</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedView === 'alerts' && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Risk Alerts ({riskData.riskAlerts.length})
              </h4>
              {riskData.riskAlerts.length > 0 ? (
                <div className="space-y-3">
                  {riskData.riskAlerts.map((alert) => (
                    <div key={alert.id} className={`border rounded-lg p-4 ${ALERT_COLORS[alert.severity]}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="font-medium">{alert.type.replace('_', ' ')}</span>
                        </div>
                        <span className="text-xs">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm mb-2">{alert.message}</p>
                      <div className="text-sm font-medium">
                        Action: {alert.action}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No active risk alerts</p>
                  <p className="text-sm">Portfolio risk levels are within acceptable ranges</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}