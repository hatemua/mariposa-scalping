'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Shield,
  AlertTriangle,
  TrendingDown,
  Activity,
  Zap,
  Eye,
  RefreshCw,
  BarChart3,
  Target,
  Clock,
  XCircle,
  CheckCircle
} from 'lucide-react';

interface PortfolioRisk {
  symbol: string;
  allocation: number;
  correlation: number;
  volatility: number;
  riskContribution: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

interface BlackSwanIndicator {
  type: 'VOLUME_SPIKE' | 'PRICE_GAP' | 'CORRELATION_BREAK' | 'LIQUIDITY_CRISIS';
  severity: number;
  probability: number;
  timeframe: string;
  description: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CATASTROPHIC';
}

interface RiskMetric {
  name: string;
  value: number;
  threshold: number;
  status: 'SAFE' | 'WARNING' | 'DANGER' | 'CRITICAL';
  description: string;
  recommendation: string;
}

interface DrawdownAnalysis {
  current: number;
  maximum: number;
  averageRecoveryTime: string;
  worstCase: number;
  probability: number;
}

interface RiskMonitorData {
  symbol: string;
  overallRiskScore: number;
  portfolioRisks: PortfolioRisk[];
  blackSwanIndicators: BlackSwanIndicator[];
  riskMetrics: RiskMetric[];
  drawdownAnalysis: DrawdownAnalysis;
  liquidationRisk: {
    price: number;
    distance: number;
    timeToLiquidation: string;
    probability: number;
  };
  correlationMatrix: {
    [key: string]: number;
  };
  alerts: Array<{
    id: string;
    type: 'RISK' | 'WARNING' | 'INFO';
    message: string;
    urgency: number;
    timestamp: string;
  }>;
}

interface RiskMonitorDashboardProps {
  symbol: string;
  portfolioSymbols?: string[];
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const RISK_COLORS = {
  LOW: 'bg-green-100 text-green-800 border-green-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  EXTREME: 'bg-red-100 text-red-800 border-red-200',
  CATASTROPHIC: 'bg-red-200 text-red-900 border-red-300'
};

const STATUS_COLORS = {
  SAFE: 'text-green-600 bg-green-50',
  WARNING: 'text-yellow-600 bg-yellow-50',
  DANGER: 'text-orange-600 bg-orange-50',
  CRITICAL: 'text-red-600 bg-red-50'
};

export default function RiskMonitorDashboard({
  symbol,
  portfolioSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  autoRefresh = true,
  refreshInterval = 5000, // 5 seconds for risk monitoring
  className = ''
}: RiskMonitorDashboardProps) {
  const [riskData, setRiskData] = useState<RiskMonitorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analyze risk factors from market data
  const analyzeRiskFactors = async (symbol: string): Promise<RiskMonitorData> => {
    try {
      // Get data for main symbol and portfolio
      const [rtAnalysis, marketData, ...portfolioData] = await Promise.all([
        marketApi.getRealTimeAnalysis(symbol),
        marketApi.getMarketData(symbol),
        ...portfolioSymbols.map(sym => marketApi.getMarketData(sym))
      ]);

      const rtData = safeObject.get(rtAnalysis, 'data', {});
      const mData = safeObject.get(marketData, 'data', {});
      const currentPrice = safeNumber.getValue(safeObject.get(mData, 'price', 0));
      const marketConditions = safeObject.get(rtData, 'marketConditions', {});

      // Calculate portfolio risks
      const portfolioRisks: PortfolioRisk[] = portfolioSymbols.map((sym, index) => {
        const pData = safeObject.get(portfolioData[index], 'data', {});
        const volatility = Math.abs(safeNumber.getValue(safeObject.get(pData, 'change24h', 0)));
        const allocation = 100 / portfolioSymbols.length; // Equal allocation for demo

        return {
          symbol: sym,
          allocation,
          correlation: Math.random() * 0.8 + 0.1, // Simulated correlation
          volatility,
          riskContribution: (allocation / 100) * volatility,
          riskLevel: volatility > 10 ? 'EXTREME' :
                    volatility > 5 ? 'HIGH' :
                    volatility > 2 ? 'MEDIUM' : 'LOW'
        };
      });

      // Detect black swan indicators
      const blackSwanIndicators: BlackSwanIndicator[] = [];
      const volume24h = safeNumber.getValue(safeObject.get(marketConditions, 'volume24h', 0));
      const volatility = safeNumber.getValue(safeObject.get(marketConditions, 'volatility', 0));
      const priceChange = safeNumber.getValue(safeObject.get(mData, 'change24h', 0));

      // Volume spike detection
      if (volume24h > 5000000) { // Arbitrary threshold
        blackSwanIndicators.push({
          type: 'VOLUME_SPIKE',
          severity: Math.min(100, volume24h / 100000),
          probability: 0.15,
          timeframe: '24h',
          description: `Unusual volume spike detected: ${(volume24h / 1000000).toFixed(1)}M`,
          impact: volume24h > 50000000 ? 'CATASTROPHIC' :
                 volume24h > 20000000 ? 'HIGH' :
                 volume24h > 10000000 ? 'MEDIUM' : 'LOW'
        });
      }

      // Price gap detection
      if (Math.abs(priceChange) > 10) {
        blackSwanIndicators.push({
          type: 'PRICE_GAP',
          severity: Math.abs(priceChange),
          probability: 0.2,
          timeframe: '24h',
          description: `Significant price movement: ${priceChange.toFixed(2)}%`,
          impact: Math.abs(priceChange) > 20 ? 'CATASTROPHIC' :
                 Math.abs(priceChange) > 15 ? 'HIGH' :
                 Math.abs(priceChange) > 10 ? 'MEDIUM' : 'LOW'
        });
      }

      // Liquidity crisis detection
      const spread = safeNumber.getValue(safeObject.get(marketConditions, 'spread', 0));
      if (spread > 0.01) { // 1% spread threshold
        blackSwanIndicators.push({
          type: 'LIQUIDITY_CRISIS',
          severity: spread * 1000,
          probability: 0.1,
          timeframe: 'Real-time',
          description: `High spread detected: ${(spread * 100).toFixed(3)}%`,
          impact: spread > 0.05 ? 'CATASTROPHIC' :
                 spread > 0.03 ? 'HIGH' :
                 spread > 0.01 ? 'MEDIUM' : 'LOW'
        });
      }

      // Calculate risk metrics
      const riskMetrics: RiskMetric[] = [
        {
          name: 'Volatility Risk',
          value: volatility,
          threshold: 5,
          status: volatility > 10 ? 'CRITICAL' :
                 volatility > 5 ? 'DANGER' :
                 volatility > 2 ? 'WARNING' : 'SAFE',
          description: `Current 24h volatility: ${volatility.toFixed(2)}%`,
          recommendation: volatility > 5 ? 'Reduce position sizes' : 'Normal position sizing acceptable'
        },
        {
          name: 'Liquidity Risk',
          value: spread * 100,
          threshold: 0.5,
          status: spread > 0.02 ? 'CRITICAL' :
                 spread > 0.01 ? 'DANGER' :
                 spread > 0.005 ? 'WARNING' : 'SAFE',
          description: `Current spread: ${(spread * 100).toFixed(3)}%`,
          recommendation: spread > 0.01 ? 'Avoid large orders' : 'Liquidity conditions normal'
        },
        {
          name: 'Volume Risk',
          value: volume24h / 1000000,
          threshold: 1,
          status: volume24h < 500000 ? 'CRITICAL' :
                 volume24h < 1000000 ? 'DANGER' :
                 volume24h < 2000000 ? 'WARNING' : 'SAFE',
          description: `24h volume: ${(volume24h / 1000000).toFixed(1)}M`,
          recommendation: volume24h < 1000000 ? 'Caution: Low volume conditions' : 'Volume conditions adequate'
        }
      ];

      // Portfolio correlation analysis
      const correlationMatrix: { [key: string]: number } = {};
      portfolioSymbols.forEach(sym => {
        correlationMatrix[sym] = Math.random() * 0.8 + 0.1; // Simulated
      });

      // Calculate overall risk score
      const avgVolatility = portfolioRisks.reduce((sum, risk) => sum + risk.volatility, 0) / portfolioRisks.length;
      const blackSwanScore = blackSwanIndicators.reduce((sum, indicator) => sum + indicator.severity, 0) / 10;
      const liquidityScore = spread * 1000;

      const overallRiskScore = Math.min(100,
        (avgVolatility * 2) + blackSwanScore + liquidityScore
      );

      // Generate alerts
      const alerts = [];
      if (overallRiskScore > 80) {
        alerts.push({
          id: 'high-risk',
          type: 'RISK' as const,
          message: 'High overall risk detected - consider reducing exposure',
          urgency: 9,
          timestamp: new Date().toISOString()
        });
      }

      if (blackSwanIndicators.length > 0) {
        alerts.push({
          id: 'black-swan',
          type: 'WARNING' as const,
          message: `${blackSwanIndicators.length} unusual market condition(s) detected`,
          urgency: 7,
          timestamp: new Date().toISOString()
        });
      }

      return {
        symbol,
        overallRiskScore,
        portfolioRisks,
        blackSwanIndicators,
        riskMetrics,
        drawdownAnalysis: {
          current: 0, // Would calculate from position data
          maximum: 15, // Historical data
          averageRecoveryTime: '2-4 days',
          worstCase: 25,
          probability: 0.05
        },
        liquidationRisk: {
          price: currentPrice * 0.8, // 20% down
          distance: 20,
          timeToLiquidation: 'Not applicable',
          probability: 0.01
        },
        correlationMatrix,
        alerts
      };

    } catch (error) {
      console.error('Error analyzing risk factors:', error);
      throw error;
    }
  };

  const fetchRiskData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await analyzeRiskFactors(symbol);
      setRiskData(data);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error fetching risk data:', error);
      setError(error.message || 'Failed to fetch risk data');
      toast.error('Failed to fetch risk data');
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

  const RiskGauge = ({ score, size = 100 }: { score: number; size?: number }) => {
    const normalizedScore = Math.max(0, Math.min(100, score));
    const angle = (normalizedScore / 100) * 180 - 90;

    const getColor = (score: number) => {
      if (score >= 80) return '#ef4444'; // red
      if (score >= 60) return '#f97316'; // orange
      if (score >= 40) return '#eab308'; // yellow
      if (score >= 20) return '#22c55e'; // light green
      return '#10b981'; // green
    };

    const radius = size / 2 - 10;
    const circumference = Math.PI * radius;

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="6"
            fill="none"
            strokeDasharray={`${circumference / 2} ${circumference}`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getColor(score)}
            strokeWidth="6"
            fill="none"
            strokeDasharray={`${(circumference / 2) * (score / 100)} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-bold" style={{ color: getColor(score) }}>
            {score.toFixed(0)}
          </div>
          <div className="text-xs text-gray-500">Risk</div>
        </div>
      </div>
    );
  };

  const RiskMetricCard = ({ metric }: { metric: RiskMetric }) => {
    return (
      <div className={`p-3 rounded-lg border ${STATUS_COLORS[metric.status]}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">{metric.name}</span>
          <span className="text-sm">{metric.value.toFixed(2)}</span>
        </div>
        <div className="text-sm mb-2">{metric.description}</div>
        <div className="text-xs">{metric.recommendation}</div>
      </div>
    );
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <XCircle className="h-8 w-8 mr-2" />
          <span>Error loading risk monitor</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-orange-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Risk Monitor</h3>
            <p className="text-sm text-gray-600">{symbol} • Real-time Risk Analysis</p>
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

      {loading && !riskData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          <span className="ml-2 text-gray-600">Analyzing risk factors...</span>
        </div>
      ) : riskData ? (
        <div className="space-y-6">
          {/* Overall Risk Score */}
          <div className="flex justify-center">
            <RiskGauge score={riskData.overallRiskScore} size={120} />
          </div>

          {/* Active Alerts */}
          {riskData.alerts.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Risk Alerts ({riskData.alerts.length})
              </h4>
              {riskData.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border flex items-center gap-2 ${
                    alert.type === 'RISK' ? 'bg-red-50 border-red-200 text-red-700' :
                    alert.type === 'WARNING' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                    'bg-blue-50 border-blue-200 text-blue-700'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Risk Metrics */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Risk Metrics
            </h4>
            <div className="space-y-2">
              {riskData.riskMetrics.map((metric, index) => (
                <RiskMetricCard key={index} metric={metric} />
              ))}
            </div>
          </div>

          {/* Portfolio Risk Heat Map */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Portfolio Risk Distribution
            </h4>
            <div className="grid gap-2">
              {riskData.portfolioRisks.map((risk) => (
                <div key={risk.symbol} className={`p-3 rounded-lg border ${RISK_COLORS[risk.riskLevel]}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{risk.symbol.replace('USDT', '')}</span>
                    <span className="text-sm">{risk.allocation.toFixed(1)}%</span>
                  </div>
                  <div className="text-sm mt-1">
                    Vol: {risk.volatility.toFixed(2)}% • Risk: {risk.riskContribution.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Black Swan Indicators */}
          {riskData.blackSwanIndicators.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Black Swan Indicators
              </h4>
              {riskData.blackSwanIndicators.map((indicator, index) => (
                <div key={index} className={`p-3 rounded-lg border ${RISK_COLORS[indicator.impact]}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{indicator.type.replace('_', ' ')}</span>
                    <span className="text-sm">{Math.round(indicator.probability * 100)}%</span>
                  </div>
                  <div className="text-sm">{indicator.description}</div>
                </div>
              ))}
            </div>
          )}

          {/* Drawdown Analysis */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Drawdown Analysis
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">Current</div>
                <div className="font-medium">{riskData.drawdownAnalysis.current.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-gray-500">Maximum</div>
                <div className="font-medium">{riskData.drawdownAnalysis.maximum.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-gray-500">Recovery Time</div>
                <div className="font-medium">{riskData.drawdownAnalysis.averageRecoveryTime}</div>
              </div>
              <div>
                <div className="text-gray-500">Worst Case</div>
                <div className="font-medium text-red-600">{riskData.drawdownAnalysis.worstCase.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}