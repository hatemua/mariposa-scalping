'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Target,
  TrendingUp,
  Volume2,
  Eye,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle,
  Activity,
  BarChart3,
  RefreshCw,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

interface LiquidityGrab {
  type: 'SWEEP_HIGH' | 'SWEEP_LOW';
  price: number;
  volume: number;
  confidence: number;
  timeframe: string;
  reversalPotential: number;
}

interface VolumeProfileBreakout {
  level: number;
  volumeAtLevel: number;
  breakoutDirection: 'UP' | 'DOWN';
  confidence: number;
  targetPrice: number;
  stopLoss: number;
}

interface SmartMoneyFlow {
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  exchanges: string[];
  timeDetected: string;
  significance: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

interface EntryOpportunity {
  id: string;
  type: 'LIQUIDITY_GRAB' | 'VOLUME_BREAKOUT' | 'SMART_MONEY' | 'CONFLUENCE';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  timeWindow: string;
  reasoning: string;
  urgency: number;
  active: boolean;
}

interface SmartEntryData {
  symbol: string;
  liquidityGrabs: LiquidityGrab[];
  volumeBreakouts: VolumeProfileBreakout[];
  smartMoneyFlows: SmartMoneyFlow[];
  entryOpportunities: EntryOpportunity[];
  optimalEntryWindow: {
    start: string;
    end: string;
    reasoning: string;
  };
  marketLiquidity: {
    depth: number;
    spread: number;
    impact: number;
    condition: string;
  };
}

interface SmartEntrySignalsProps {
  symbol: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const URGENCY_COLORS = {
  10: 'bg-red-500 text-white',
  9: 'bg-red-400 text-white',
  8: 'bg-orange-500 text-white',
  7: 'bg-orange-400 text-white',
  6: 'bg-yellow-500 text-white',
  5: 'bg-yellow-400 text-black',
  4: 'bg-blue-400 text-white',
  3: 'bg-blue-300 text-white',
  2: 'bg-gray-400 text-white',
  1: 'bg-gray-300 text-black'
};

const SIGNIFICANCE_COLORS = {
  EXTREME: 'text-red-600 bg-red-50 border-red-200',
  HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
  MEDIUM: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  LOW: 'text-green-600 bg-green-50 border-green-200'
};

export default function SmartEntrySignals({
  symbol,
  autoRefresh = true,
  refreshInterval = 60000, // 60 seconds for entry signals (was 15s - too aggressive)
  className = ''
}: SmartEntrySignalsProps) {
  const [entryData, setEntryData] = useState<SmartEntryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Analyze entry signals from market data
  const analyzeEntrySignals = async (symbol: string): Promise<SmartEntryData> => {
    try {
      // Get real-time data and chart data for analysis
      const [rtAnalysis, chartData1m, chartData5m, marketData] = await Promise.all([
        marketApi.getRealTimeAnalysis(symbol),
        marketApi.getChartData(symbol, '1m', 100),
        marketApi.getChartData(symbol, '5m', 50),
        marketApi.getMarketData(symbol)
      ]);

      const rtData = safeObject.get(rtAnalysis, 'data', {});
      const chart1m = safeObject.get(chartData1m, 'data.klines', []);
      const chart5m = safeObject.get(chartData5m, 'data.klines', []);
      const mData = safeObject.get(marketData, 'data', {});
      const currentPrice = safeNumber.getValue(safeObject.get(mData, 'price', 0));

      // Analyze liquidity grabs
      const liquidityGrabs: LiquidityGrab[] = [];
      if (chart1m.length > 20) {
        const recentCandles = chart1m.slice(-20);
        const highs = recentCandles.map((c: any[]) => parseFloat(c[2]));
        const lows = recentCandles.map((c: any[]) => parseFloat(c[3]));
        const volumes = recentCandles.map((c: any[]) => parseFloat(c[5]));

        const maxHigh = Math.max(...highs);
        const minLow = Math.min(...lows);

        // Check for high sweep with reversal
        if (currentPrice < maxHigh * 0.995) {
          liquidityGrabs.push({
            type: 'SWEEP_HIGH',
            price: maxHigh,
            volume: Math.max(...volumes),
            confidence: 0.75,
            timeframe: '1-5m',
            reversalPotential: 0.8
          });
        }

        // Check for low sweep with reversal
        if (currentPrice > minLow * 1.005) {
          liquidityGrabs.push({
            type: 'SWEEP_LOW',
            price: minLow,
            volume: Math.max(...volumes),
            confidence: 0.7,
            timeframe: '1-5m',
            reversalPotential: 0.75
          });
        }
      }

      // Analyze volume profile breakouts
      const volumeBreakouts: VolumeProfileBreakout[] = [];
      if (chart5m.length > 10) {
        const recentCandles = chart5m.slice(-10);
        const avgVolume = recentCandles.reduce((sum: number, c: any[]) => sum + parseFloat(c[5]), 0) / recentCandles.length;
        const lastCandle = recentCandles[recentCandles.length - 1];
        const lastVolume = parseFloat(lastCandle[5]);

        if (lastVolume > avgVolume * 2) {
          const close = parseFloat(lastCandle[4]);
          const high = parseFloat(lastCandle[2]);
          const low = parseFloat(lastCandle[3]);

          if (close > high * 0.95) {
            volumeBreakouts.push({
              level: close,
              volumeAtLevel: lastVolume,
              breakoutDirection: 'UP',
              confidence: 0.8,
              targetPrice: close * 1.02,
              stopLoss: close * 0.99
            });
          } else if (close < low * 1.05) {
            volumeBreakouts.push({
              level: close,
              volumeAtLevel: lastVolume,
              breakoutDirection: 'DOWN',
              confidence: 0.8,
              targetPrice: close * 0.98,
              stopLoss: close * 1.01
            });
          }
        }
      }

      // Smart money flow analysis (simulated based on volume and price action)
      const smartMoneyFlows: SmartMoneyFlow[] = [];
      const marketConditions = safeObject.get(rtData, 'marketConditions', {});
      const volume24h = safeNumber.getValue(safeObject.get(marketConditions, 'volume24h', 0));
      const priceChange = safeNumber.getValue(safeObject.get(mData, 'change24h', 0));

      if (volume24h > 0) {
        if (Math.abs(priceChange) > 5 && volume24h > 1000000) {
          smartMoneyFlows.push({
            direction: priceChange > 0 ? 'INFLOW' : 'OUTFLOW',
            amount: volume24h,
            exchanges: ['Binance', 'Coinbase'],
            timeDetected: new Date().toISOString(),
            significance: volume24h > 10000000 ? 'EXTREME' :
                         volume24h > 5000000 ? 'HIGH' :
                         volume24h > 2000000 ? 'MEDIUM' : 'LOW'
          });
        }
      }

      // Generate entry opportunities
      const entryOpportunities: EntryOpportunity[] = [];
      const consensus = safeObject.get(rtData, 'consensus', {});
      const confidence = safeNumber.getValue(safeObject.get(consensus, 'confidence', 0));

      // High confidence AI consensus entry
      if (confidence > 0.7 && consensus.recommendation !== 'HOLD') {
        const isLong = consensus.recommendation === 'BUY';
        entryOpportunities.push({
          id: 'ai-consensus',
          type: 'CONFLUENCE',
          entryPrice: currentPrice,
          stopLoss: isLong ? currentPrice * 0.98 : currentPrice * 1.02,
          takeProfit: isLong ? currentPrice * 1.04 : currentPrice * 0.96,
          riskReward: 2.0,
          confidence: confidence,
          timeWindow: safeObject.get(consensus, 'timeToAction', '1-4 hours'),
          reasoning: `High AI consensus (${Math.round(confidence * 100)}%) for ${consensus.recommendation}`,
          urgency: Math.round(safeNumber.getValue(safeObject.get(consensus, 'urgency', 5))),
          active: true
        });
      }

      // Volume breakout entry
      if (volumeBreakouts.length > 0) {
        const breakout = volumeBreakouts[0];
        entryOpportunities.push({
          id: 'volume-breakout',
          type: 'VOLUME_BREAKOUT',
          entryPrice: breakout.level,
          stopLoss: breakout.stopLoss,
          takeProfit: breakout.targetPrice,
          riskReward: Math.abs(breakout.targetPrice - breakout.level) / Math.abs(breakout.level - breakout.stopLoss),
          confidence: breakout.confidence,
          timeWindow: '5-15 minutes',
          reasoning: `Volume breakout ${breakout.breakoutDirection} with ${(breakout.volumeAtLevel / 1000).toFixed(0)}K volume`,
          urgency: 8,
          active: true
        });
      }

      // Liquidity grab entry
      if (liquidityGrabs.length > 0) {
        const grab = liquidityGrabs[0];
        const isReversal = grab.type === 'SWEEP_HIGH';
        entryOpportunities.push({
          id: 'liquidity-grab',
          type: 'LIQUIDITY_GRAB',
          entryPrice: currentPrice,
          stopLoss: isReversal ? currentPrice * 1.005 : currentPrice * 0.995,
          takeProfit: isReversal ? currentPrice * 0.985 : currentPrice * 1.015,
          riskReward: 3.0,
          confidence: grab.confidence,
          timeWindow: grab.timeframe,
          reasoning: `Liquidity ${grab.type.toLowerCase()} detected at ${grab.price.toFixed(4)}`,
          urgency: 7,
          active: true
        });
      }

      return {
        symbol,
        liquidityGrabs,
        volumeBreakouts,
        smartMoneyFlows,
        entryOpportunities,
        optimalEntryWindow: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          reasoning: 'Based on current market microstructure and AI analysis'
        },
        marketLiquidity: {
          depth: safeNumber.getValue(safeObject.get(marketConditions, 'liquidity', 0)),
          spread: safeNumber.getValue(safeObject.get(marketConditions, 'spread', 0)),
          impact: Math.min(10, safeNumber.getValue(safeObject.get(marketConditions, 'spread', 0)) * 1000),
          condition: safeObject.get(marketConditions, 'tradingCondition', 'UNKNOWN')
        }
      };

    } catch (error) {
      console.error('Error analyzing entry signals:', error);
      throw error;
    }
  };

  const fetchEntryData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await analyzeEntrySignals(symbol);
      setEntryData(data);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error fetching entry data:', error);
      setError(error.message || 'Failed to fetch entry signals');
      toast.error('Failed to fetch entry signals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntryData();
  }, [symbol]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchEntryData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbol]);

  const EntryOpportunityCard = ({ opportunity }: { opportunity: EntryOpportunity }) => {
    const urgencyColor = URGENCY_COLORS[Math.min(10, Math.max(1, opportunity.urgency)) as keyof typeof URGENCY_COLORS];

    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-gray-900">{opportunity.type.replace('_', ' ')}</span>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${urgencyColor}`}>
            {opportunity.urgency}/10
          </div>
        </div>

        <div className="text-sm text-gray-600">{opportunity.reasoning}</div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Entry</div>
            <div className="font-medium">${opportunity.entryPrice.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-gray-500">R:R</div>
            <div className="font-medium">{opportunity.riskReward.toFixed(1)}:1</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Stop Loss</div>
            <div className="font-medium text-red-600">${opportunity.stopLoss.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-gray-500">Take Profit</div>
            <div className="font-medium text-green-600">${opportunity.takeProfit.toFixed(4)}</div>
          </div>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Confidence: {Math.round(opportunity.confidence * 100)}%</span>
          <span className="text-gray-500">{opportunity.timeWindow}</span>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertCircle className="h-8 w-8 mr-2" />
          <span>Error loading entry signals</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-green-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Smart Entry Signals</h3>
            <p className="text-sm text-gray-600">{symbol} • Real-time Opportunities</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchEntryData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !entryData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-2 text-gray-600">Analyzing entry signals...</span>
        </div>
      ) : entryData ? (
        <div className="space-y-6">
          {/* Entry Opportunities */}
          {entryData.entryOpportunities.length > 0 ? (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Active Entry Opportunities ({entryData.entryOpportunities.length})
              </h4>
              <div className="grid gap-4">
                {entryData.entryOpportunities.map((opportunity) => (
                  <EntryOpportunityCard key={opportunity.id} opportunity={opportunity} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No high-confidence entry opportunities detected</p>
              <p className="text-sm">Monitoring for optimal entry conditions...</p>
            </div>
          )}

          {/* Market Liquidity Conditions */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Volume2 className="h-4 w-4" />
              Market Liquidity Analysis
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500">Depth</div>
                <div className="font-medium">{entryData.marketLiquidity.depth.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-gray-500">Spread</div>
                <div className="font-medium">{(entryData.marketLiquidity.spread * 100).toFixed(3)}%</div>
              </div>
              <div>
                <div className="text-gray-500">Impact</div>
                <div className="font-medium">{entryData.marketLiquidity.impact.toFixed(2)}bp</div>
              </div>
              <div>
                <div className="text-gray-500">Condition</div>
                <div className="font-medium">{entryData.marketLiquidity.condition}</div>
              </div>
            </div>
          </div>

          {/* Smart Money Flows */}
          {entryData.smartMoneyFlows.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Smart Money Activity
              </h4>
              {entryData.smartMoneyFlows.map((flow, index) => (
                <div key={index} className={`p-3 rounded-lg border ${SIGNIFICANCE_COLORS[flow.significance]}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {flow.direction === 'INFLOW' ? (
                        <ArrowUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-medium">{flow.direction}</span>
                      <span className="text-sm">({flow.significance})</span>
                    </div>
                    <span className="text-sm font-medium">
                      ${(flow.amount / 1000000).toFixed(1)}M
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Optimal Entry Window */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-900">Optimal Entry Window</span>
            </div>
            <p className="text-sm text-blue-700 mb-2">{entryData.optimalEntryWindow.reasoning}</p>
            <div className="text-sm text-blue-600">
              Next 15 minutes • Monitor for confluence signals
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}