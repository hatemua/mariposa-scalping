'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Volume2,
  Brain,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Zap,
  RefreshCw
} from 'lucide-react';

interface ConfluenceFactors {
  technicalScore: number;
  volumeScore: number;
  momentumScore: number;
  sentimentScore: number;
  liquidityScore: number;
  riskScore: number;
  aiConsensusScore: number;
  marketStructureScore: number;
}

interface ConfluenceData {
  symbol: string;
  overallScore: number;
  factors: ConfluenceFactors;
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  timeframe: string;
  reasoning: string;
  historicalScores: Array<{
    timestamp: string;
    score: number;
  }>;
  alerts: Array<{
    type: 'ENTRY' | 'EXIT' | 'RISK' | 'OPPORTUNITY';
    message: string;
    urgency: number;
  }>;
}

interface ConfluenceScorePanelProps {
  symbol: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const SCORE_COLORS = {
  EXTREME: 'text-red-600 bg-red-50 border-red-200',
  HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  LOW: 'text-green-600 bg-green-50 border-green-200'
};

const RECOMMENDATION_COLORS = {
  STRONG_BUY: 'text-green-700 bg-green-100 border-green-300',
  BUY: 'text-green-600 bg-green-50 border-green-200',
  HOLD: 'text-gray-600 bg-gray-50 border-gray-200',
  SELL: 'text-red-600 bg-red-50 border-red-200',
  STRONG_SELL: 'text-red-700 bg-red-100 border-red-300'
};

export default function ConfluenceScorePanel({
  symbol,
  autoRefresh = true,
  refreshInterval = 120000, // 2 minutes for confluence analysis (was 30s - too aggressive)
  className = ''
}: ConfluenceScorePanelProps) {
  const [confluenceData, setConfluenceData] = useState<ConfluenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calculate confluence score from available data
  const calculateConfluenceScore = async (symbol: string): Promise<ConfluenceData> => {
    try {
      // Get real-time analysis and market data
      const [rtAnalysis, marketData] = await Promise.all([
        marketApi.getRealTimeAnalysis(symbol),
        marketApi.getMarketData(symbol)
      ]);

      const rtData = safeObject.get(rtAnalysis, 'data', {});
      const mData = safeObject.get(marketData, 'data', {});
      const consensus = safeObject.get(rtData, 'consensus', {});
      const marketConditions = safeObject.get(rtData, 'marketConditions', {});
      const individualModels = safeObject.get(rtData, 'individualModels', []);

      // Calculate individual factor scores (0-100)
      const factors: ConfluenceFactors = {
        // AI Consensus Score (0-100)
        aiConsensusScore: Math.round(safeNumber.getValue(safeObject.get(consensus, 'confidence', 0)) * 100),

        // Technical Score based on price action and volatility
        technicalScore: Math.round(Math.min(100, Math.max(0,
          50 + (safeNumber.getValue(safeObject.get(mData, 'change24h', 0)) * 2) -
          (safeNumber.getValue(safeObject.get(marketConditions, 'volatility', 0)) * 0.5)
        ))),

        // Volume Score based on 24h volume and trading condition
        volumeScore: Math.round(
          marketConditions.tradingCondition === 'EXCELLENT' ? 90 :
          marketConditions.tradingCondition === 'FAIR' ? 60 :
          marketConditions.tradingCondition === 'MODERATE' ? 40 : 20
        ),

        // Momentum Score based on model agreement and urgency
        momentumScore: Math.round(
          (safeNumber.getValue(safeObject.get(consensus, 'modelAgreement', 0)) * 50) +
          (Math.min(safeNumber.getValue(safeObject.get(consensus, 'urgency', 1)), 10) * 5)
        ),

        // Sentiment Score based on recommendation distribution
        sentimentScore: Math.round(
          consensus.recommendation === 'BUY' ? 80 :
          consensus.recommendation === 'SELL' ? 20 : 50
        ),

        // Liquidity Score based on spread and volume
        liquidityScore: Math.round(Math.max(0,
          100 - (safeNumber.getValue(safeObject.get(marketConditions, 'spread', 0)) * 1000)
        )),

        // Risk Score (inverted - lower is better)
        riskScore: Math.round(100 - Math.min(100,
          (safeNumber.getValue(safeObject.get(marketConditions, 'volatility', 0)) * 2) +
          (rtData.riskWarnings?.length || 0) * 20
        )),

        // Market Structure Score based on price action and volume
        marketStructureScore: Math.round(
          marketConditions.priceAction === 'BULLISH' ? 75 :
          marketConditions.priceAction === 'BEARISH' ? 25 : 50
        )
      };

      // Calculate weighted overall score
      const weights = {
        aiConsensusScore: 0.25,
        technicalScore: 0.15,
        volumeScore: 0.15,
        momentumScore: 0.15,
        sentimentScore: 0.10,
        liquidityScore: 0.10,
        riskScore: 0.05,
        marketStructureScore: 0.05
      };

      const overallScore = Math.round(
        Object.entries(factors).reduce((sum, [key, value]) => {
          return sum + (value * weights[key as keyof typeof weights]);
        }, 0)
      );

      // Determine recommendation based on score
      const recommendation =
        overallScore >= 80 ? 'STRONG_BUY' :
        overallScore >= 65 ? 'BUY' :
        overallScore >= 35 ? 'HOLD' :
        overallScore >= 20 ? 'SELL' : 'STRONG_SELL';

      // Determine risk level
      const riskLevel =
        factors.riskScore >= 80 ? 'LOW' :
        factors.riskScore >= 60 ? 'MEDIUM' :
        factors.riskScore >= 40 ? 'HIGH' : 'EXTREME';

      // Generate alerts
      const alerts = [];
      if (overallScore >= 85) {
        alerts.push({
          type: 'ENTRY' as const,
          message: 'High confluence entry opportunity detected',
          urgency: 8
        });
      }
      if (factors.riskScore < 30) {
        alerts.push({
          type: 'RISK' as const,
          message: 'High risk conditions - consider reducing exposure',
          urgency: 9
        });
      }
      if (factors.volumeScore > 80 && factors.momentumScore > 70) {
        alerts.push({
          type: 'OPPORTUNITY' as const,
          message: 'Strong volume + momentum alignment',
          urgency: 7
        });
      }

      return {
        symbol,
        overallScore,
        factors,
        recommendation,
        confidence: safeNumber.getValue(safeObject.get(consensus, 'confidence', 0)),
        riskLevel,
        timeframe: safeObject.get(consensus, 'timeToAction', 'UNKNOWN'),
        reasoning: safeObject.get(consensus, 'reasoning', 'Analysis based on multiple technical factors'),
        historicalScores: [], // Would be populated from historical data
        alerts
      };

    } catch (error) {
      console.error('Error calculating confluence score:', error);
      throw error;
    }
  };

  const fetchConfluenceData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await calculateConfluenceScore(symbol);
      setConfluenceData(data);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error fetching confluence data:', error);
      setError(error.message || 'Failed to fetch confluence data');
      toast.error('Failed to fetch confluence data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfluenceData();
  }, [symbol]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchConfluenceData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbol]);

  // Gauge component for score visualization
  const ScoreGauge = ({ score, size = 120 }: { score: number; size?: number }) => {
    const normalizedScore = Math.max(0, Math.min(100, score));
    const angle = (normalizedScore / 100) * 180 - 90;
    const radius = size / 2 - 10;
    const circumference = Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

    const getColor = (score: number) => {
      if (score >= 80) return '#10b981'; // green
      if (score >= 65) return '#22c55e'; // light green
      if (score >= 35) return '#eab308'; // yellow
      if (score >= 20) return '#f97316'; // orange
      return '#ef4444'; // red
    };

    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${circumference / 2} ${circumference}`}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={getColor(score)}
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${(circumference / 2) * (score / 100)} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold" style={{ color: getColor(score) }}>
            {score}
          </div>
          <div className="text-xs text-gray-500">Score</div>
        </div>
      </div>
    );
  };

  const FactorBar = ({ label, score, icon: Icon }: {
    label: string;
    score: number;
    icon: React.ComponentType<any>;
  }) => {
    const getBarColor = (score: number) => {
      if (score >= 80) return 'bg-green-500';
      if (score >= 65) return 'bg-green-400';
      if (score >= 35) return 'bg-yellow-400';
      if (score >= 20) return 'bg-orange-400';
      return 'bg-red-500';
    };

    return (
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-gray-600 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-700">{label}</span>
            <span className="font-medium">{score}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${getBarColor(score)}`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <XCircle className="h-8 w-8 mr-2" />
          <span>Error loading confluence data</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Confluence Score</h3>
            <p className="text-sm text-gray-600">{symbol} • Multi-Factor Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchConfluenceData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !confluenceData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Calculating confluence...</span>
        </div>
      ) : confluenceData ? (
        <div className="space-y-6">
          {/* Main Score Display */}
          <div className="flex items-center justify-center">
            <ScoreGauge score={confluenceData.overallScore} size={140} />
          </div>

          {/* Recommendation and Risk */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`p-3 rounded-lg border ${RECOMMENDATION_COLORS[confluenceData.recommendation]}`}>
              <div className="text-center">
                <div className="text-sm font-medium mb-1">Recommendation</div>
                <div className="text-lg font-bold">{confluenceData.recommendation.replace('_', ' ')}</div>
              </div>
            </div>
            <div className={`p-3 rounded-lg border ${SCORE_COLORS[confluenceData.riskLevel]}`}>
              <div className="text-center">
                <div className="text-sm font-medium mb-1">Risk Level</div>
                <div className="text-lg font-bold">{confluenceData.riskLevel}</div>
              </div>
            </div>
          </div>

          {/* Factor Breakdown */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Factor Analysis</h4>
            <div className="space-y-3">
              <FactorBar label="AI Consensus" score={confluenceData.factors.aiConsensusScore} icon={Brain} />
              <FactorBar label="Technical" score={confluenceData.factors.technicalScore} icon={BarChart3} />
              <FactorBar label="Volume" score={confluenceData.factors.volumeScore} icon={Volume2} />
              <FactorBar label="Momentum" score={confluenceData.factors.momentumScore} icon={TrendingUp} />
              <FactorBar label="Sentiment" score={confluenceData.factors.sentimentScore} icon={Activity} />
              <FactorBar label="Liquidity" score={confluenceData.factors.liquidityScore} icon={Zap} />
            </div>
          </div>

          {/* Alerts */}
          {confluenceData.alerts.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900">Alerts</h4>
              {confluenceData.alerts.map((alert, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border flex items-center gap-2 ${
                    alert.type === 'RISK' ? 'bg-red-50 border-red-200 text-red-700' :
                    alert.type === 'ENTRY' ? 'bg-green-50 border-green-200 text-green-700' :
                    'bg-blue-50 border-blue-200 text-blue-700'
                  }`}
                >
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Confidence and Timeframe */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Confidence</div>
              <div className="font-medium">{Math.round(confluenceData.confidence * 100)}%</div>
            </div>
            <div>
              <div className="text-gray-600">Time Frame</div>
              <div className="font-medium">{confluenceData.timeframe}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}