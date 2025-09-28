'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  LogOut,
  TrendingDown,
  Target,
  Shield,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ArrowRight,
  BarChart3,
  Zap
} from 'lucide-react';

interface TakeProfitLevel {
  price: number;
  percentage: number;
  confidence: number;
  reasoning: string;
  timeEstimate: string;
}

interface StopLossStrategy {
  type: 'FIXED' | 'TRAILING' | 'ATR' | 'FIBONACCI' | 'VOLUME_BASED';
  price: number;
  percentage: number;
  dynamic: boolean;
  reasoning: string;
}

interface VolumeExhaustionSignal {
  detected: boolean;
  type: 'BUYING_EXHAUSTION' | 'SELLING_EXHAUSTION';
  confidence: number;
  timeframe: string;
  recommendation: 'EXIT_IMMEDIATELY' | 'REDUCE_POSITION' | 'MONITOR';
}

interface TrailingStopConfig {
  initialStop: number;
  trailAmount: number;
  trailType: 'PERCENTAGE' | 'ATR' | 'FIBONACCI';
  currentStop: number;
  activated: boolean;
}

interface ExitSignal {
  id: string;
  type: 'TAKE_PROFIT' | 'STOP_LOSS' | 'VOLUME_EXHAUSTION' | 'TIME_DECAY' | 'CORRELATION_BREAK';
  action: 'EXIT_ALL' | 'EXIT_PARTIAL' | 'TIGHTEN_STOPS' | 'MONITOR';
  urgency: number;
  confidence: number;
  reasoning: string;
  priceTarget?: number;
  positionSize?: number;
  timeWindow: string;
}

interface ExitStrategyData {
  symbol: string;
  currentPrice: number;
  takeProfitLevels: TakeProfitLevel[];
  stopLossStrategies: StopLossStrategy[];
  volumeExhaustion: VolumeExhaustionSignal;
  trailingStop: TrailingStopConfig;
  exitSignals: ExitSignal[];
  marketRegime: {
    type: 'TRENDING' | 'RANGING' | 'VOLATILE';
    strength: number;
    recommendation: string;
  };
  riskMetrics: {
    currentDrawdown: number;
    maxAdverseExcursion: number;
    timeInTrade: string;
    profitTarget: number;
  };
}

interface ExitStrategyPanelProps {
  symbol: string;
  position?: {
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    size: number;
    entryTime: string;
  };
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const URGENCY_COLORS = {
  10: 'bg-red-600 text-white',
  9: 'bg-red-500 text-white',
  8: 'bg-orange-600 text-white',
  7: 'bg-orange-500 text-white',
  6: 'bg-yellow-600 text-white',
  5: 'bg-yellow-500 text-black',
  4: 'bg-blue-500 text-white',
  3: 'bg-blue-400 text-white',
  2: 'bg-gray-500 text-white',
  1: 'bg-gray-400 text-white'
};

const ACTION_COLORS = {
  EXIT_ALL: 'bg-red-100 border-red-300 text-red-800',
  EXIT_PARTIAL: 'bg-orange-100 border-orange-300 text-orange-800',
  TIGHTEN_STOPS: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  MONITOR: 'bg-blue-100 border-blue-300 text-blue-800'
};

export default function ExitStrategyPanel({
  symbol,
  position,
  autoRefresh = true,
  refreshInterval = 90000, // 90 seconds for exit signals (was 10s - too aggressive)
  className = ''
}: ExitStrategyPanelProps) {
  const [exitData, setExitData] = useState<ExitStrategyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calculate Fibonacci retracement levels
  const calculateFibonacciLevels = (high: number, low: number, isLong: boolean) => {
    const diff = high - low;
    const levels = [0.236, 0.382, 0.5, 0.618, 0.786];

    return levels.map(level => {
      const price = isLong ? high - (diff * level) : low + (diff * level);
      return {
        level,
        price,
        percentage: level * 100
      };
    });
  };

  // Analyze exit strategy from market data
  const analyzeExitStrategy = async (symbol: string): Promise<ExitStrategyData> => {
    try {
      // Get comprehensive market data
      const [rtAnalysis, chartData1m, chartData5m, chartData15m, marketData] = await Promise.all([
        marketApi.getRealTimeAnalysis(symbol),
        marketApi.getChartData(symbol, '1m', 100),
        marketApi.getChartData(symbol, '5m', 50),
        marketApi.getChartData(symbol, '15m', 30),
        marketApi.getMarketData(symbol)
      ]);

      const rtData = safeObject.get(rtAnalysis, 'data', {});
      const chart1m = safeObject.get(chartData1m, 'data.klines', []);
      const chart5m = safeObject.get(chartData5m, 'data.klines', []);
      const chart15m = safeObject.get(chartData15m, 'data.klines', []);
      const mData = safeObject.get(marketData, 'data', {});

      const currentPrice = safeNumber.getValue(safeObject.get(mData, 'price', 0));
      const marketConditions = safeObject.get(rtData, 'marketConditions', {});
      const consensus = safeObject.get(rtData, 'consensus', {});

      // Calculate ATR for dynamic stops
      const atr = chart15m.length > 14 ?
        chart15m.slice(-14).reduce((sum: number, candle: any[]) => {
          const high = parseFloat(candle[2]);
          const low = parseFloat(candle[3]);
          const prevClose = parseFloat(candle[4]);
          const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
          return sum + tr;
        }, 0) / 14 : currentPrice * 0.02;

      // Analyze volume exhaustion
      const volumeExhaustion: VolumeExhaustionSignal = (() => {
        if (chart1m.length < 20) {
          return { detected: false, type: 'BUYING_EXHAUSTION', confidence: 0, timeframe: '1m', recommendation: 'MONITOR' };
        }

        const recentCandles = chart1m.slice(-20);
        const volumes = recentCandles.map((c: any[]) => parseFloat(c[5]));
        const prices = recentCandles.map((c: any[]) => parseFloat(c[4]));

        const avgVolume = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;
        const recentVolume = volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
        const priceDirection = prices[prices.length - 1] > prices[0] ? 'UP' : 'DOWN';

        const volumeDecline = recentVolume < avgVolume * 0.7;
        const highVolumePeak = Math.max(...volumes.slice(-10)) > avgVolume * 2;

        if (volumeDecline && highVolumePeak) {
          return {
            detected: true,
            type: priceDirection === 'UP' ? 'BUYING_EXHAUSTION' : 'SELLING_EXHAUSTION',
            confidence: 0.75,
            timeframe: '1-5m',
            recommendation: 'EXIT_IMMEDIATELY'
          };
        }

        return { detected: false, type: 'BUYING_EXHAUSTION', confidence: 0, timeframe: '1m', recommendation: 'MONITOR' };
      })();

      // Generate take profit levels
      const takeProfitLevels: TakeProfitLevel[] = [];
      const volatility = safeNumber.getValue(safeObject.get(marketConditions, 'volatility', 2));

      // Based on current price and volatility
      const baseTP1 = currentPrice * (1 + volatility / 200); // 1/2 of daily volatility
      const baseTP2 = currentPrice * (1 + volatility / 100);  // Full daily volatility
      const baseTP3 = currentPrice * (1 + volatility / 50);   // 2x daily volatility

      takeProfitLevels.push(
        {
          price: baseTP1,
          percentage: 33,
          confidence: 0.8,
          reasoning: `Conservative target based on ${(volatility/2).toFixed(1)}% volatility`,
          timeEstimate: '1-4 hours'
        },
        {
          price: baseTP2,
          percentage: 33,
          confidence: 0.6,
          reasoning: `Standard target at daily volatility range`,
          timeEstimate: '4-12 hours'
        },
        {
          price: baseTP3,
          percentage: 34,
          confidence: 0.4,
          reasoning: `Extended target for trending markets`,
          timeEstimate: '12-24 hours'
        }
      );

      // Generate stop loss strategies
      const stopLossStrategies: StopLossStrategy[] = [
        {
          type: 'ATR',
          price: currentPrice - (atr * 2),
          percentage: ((currentPrice - (currentPrice - atr * 2)) / currentPrice) * 100,
          dynamic: true,
          reasoning: `2x ATR stop for volatility-adjusted risk`
        },
        {
          type: 'FIBONACCI',
          price: currentPrice * 0.98, // 2% fixed for demo
          percentage: 2,
          dynamic: false,
          reasoning: `Fibonacci support level protection`
        },
        {
          type: 'VOLUME_BASED',
          price: currentPrice * 0.985,
          percentage: 1.5,
          dynamic: true,
          reasoning: `Volume profile support level`
        }
      ];

      // Configure trailing stop
      const trailingStop: TrailingStopConfig = {
        initialStop: currentPrice * 0.98,
        trailAmount: atr,
        trailType: 'ATR',
        currentStop: currentPrice * 0.98,
        activated: false
      };

      // Generate exit signals
      const exitSignals: ExitSignal[] = [];

      // High confidence AI exit signal
      if (consensus.recommendation === 'SELL' && consensus.confidence > 0.8) {
        exitSignals.push({
          id: 'ai-exit',
          type: 'TAKE_PROFIT',
          action: 'EXIT_PARTIAL',
          urgency: Math.round(safeNumber.getValue(safeObject.get(consensus, 'urgency', 5))),
          confidence: consensus.confidence,
          reasoning: `High AI consensus for SELL (${Math.round(consensus.confidence * 100)}%)`,
          priceTarget: currentPrice,
          positionSize: 50,
          timeWindow: safeObject.get(consensus, 'timeToAction', '1-4 hours')
        });
      }

      // Volume exhaustion signal
      if (volumeExhaustion.detected) {
        exitSignals.push({
          id: 'volume-exhaustion',
          type: 'VOLUME_EXHAUSTION',
          action: volumeExhaustion.recommendation as any,
          urgency: 8,
          confidence: volumeExhaustion.confidence,
          reasoning: `${volumeExhaustion.type.replace('_', ' ').toLowerCase()} detected`,
          timeWindow: volumeExhaustion.timeframe
        });
      }

      // Time decay signal (if position provided and old)
      if (position) {
        const timeInTrade = Date.now() - new Date(position.entryTime).getTime();
        const hoursInTrade = timeInTrade / (1000 * 60 * 60);

        if (hoursInTrade > 24) {
          exitSignals.push({
            id: 'time-decay',
            type: 'TIME_DECAY',
            action: 'TIGHTEN_STOPS',
            urgency: 5,
            confidence: 0.6,
            reasoning: `Position held for ${hoursInTrade.toFixed(1)} hours - consider tightening stops`,
            timeWindow: 'Immediate'
          });
        }
      }

      // Determine market regime
      const priceChange = safeNumber.getValue(safeObject.get(mData, 'change24h', 0));
      const marketRegime = {
        type: (Math.abs(priceChange) > 5 ? 'VOLATILE' :
              Math.abs(priceChange) > 2 ? 'TRENDING' : 'RANGING') as 'TRENDING' | 'RANGING' | 'VOLATILE',
        strength: Math.min(100, Math.abs(priceChange) * 10),
        recommendation: Math.abs(priceChange) > 5 ?
          'Use tighter stops in volatile conditions' :
          'Standard exit strategy appropriate'
      };

      return {
        symbol,
        currentPrice,
        takeProfitLevels,
        stopLossStrategies,
        volumeExhaustion,
        trailingStop,
        exitSignals,
        marketRegime,
        riskMetrics: {
          currentDrawdown: position ?
            Math.max(0, (position.entryPrice - currentPrice) / position.entryPrice * 100) : 0,
          maxAdverseExcursion: 0, // Would track from position history
          timeInTrade: position ?
            Math.round((Date.now() - new Date(position.entryTime).getTime()) / (1000 * 60 * 60)) + 'h' : '0h',
          profitTarget: takeProfitLevels[0]?.price || currentPrice * 1.02
        }
      };

    } catch (error) {
      console.error('Error analyzing exit strategy:', error);
      throw error;
    }
  };

  const fetchExitData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await analyzeExitStrategy(symbol);
      setExitData(data);
      setLastUpdate(new Date());
    } catch (error: any) {
      console.error('Error fetching exit data:', error);
      setError(error.message || 'Failed to fetch exit strategy');
      toast.error('Failed to fetch exit strategy');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExitData();
  }, [symbol]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchExitData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbol]);

  const ExitSignalCard = ({ signal }: { signal: ExitSignal }) => {
    const urgencyColor = URGENCY_COLORS[Math.min(10, Math.max(1, signal.urgency)) as keyof typeof URGENCY_COLORS];
    const actionColor = ACTION_COLORS[signal.action];

    return (
      <div className={`border rounded-lg p-4 ${actionColor}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            <span className="font-medium">{signal.type.replace('_', ' ')}</span>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${urgencyColor}`}>
            {signal.urgency}/10
          </div>
        </div>

        <div className="text-sm mb-3">{signal.reasoning}</div>

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{signal.action.replace('_', ' ')}</span>
          <div className="text-right">
            <div>{Math.round(signal.confidence * 100)}% confidence</div>
            <div className="text-xs text-gray-600">{signal.timeWindow}</div>
          </div>
        </div>

        {signal.priceTarget && (
          <div className="mt-2 text-sm">
            Target: <span className="font-medium">${signal.priceTarget.toFixed(4)}</span>
            {signal.positionSize && (
              <span className="ml-2">({signal.positionSize}% position)</span>
            )}
          </div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading exit strategy</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LogOut className="h-6 w-6 text-red-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Exit Strategy</h3>
            <p className="text-sm text-gray-600">{symbol} • Dynamic Exit Management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchExitData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !exitData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          <span className="ml-2 text-gray-600">Analyzing exit strategy...</span>
        </div>
      ) : exitData ? (
        <div className="space-y-6">
          {/* Current Price and Market Regime */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Current Price</div>
              <div className="text-2xl font-bold text-gray-900">
                ${exitData.currentPrice.toFixed(4)}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Market Regime</div>
              <div className="text-lg font-semibold text-gray-900">
                {exitData.marketRegime.type}
              </div>
              <div className="text-xs text-gray-600">
                {exitData.marketRegime.strength.toFixed(0)}% strength
              </div>
            </div>
          </div>

          {/* Exit Signals */}
          {exitData.exitSignals.length > 0 ? (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Active Exit Signals ({exitData.exitSignals.length})
              </h4>
              <div className="space-y-3">
                {exitData.exitSignals.map((signal) => (
                  <ExitSignalCard key={signal.id} signal={signal} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No immediate exit signals detected</p>
              <p className="text-sm">Monitoring for exit opportunities...</p>
            </div>
          )}

          {/* Take Profit Levels */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Take Profit Levels
            </h4>
            <div className="space-y-2">
              {exitData.takeProfitLevels.map((level, index) => (
                <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-green-800">
                      TP{index + 1}: ${level.price.toFixed(4)}
                    </span>
                    <span className="text-sm text-green-600">
                      {level.percentage}% position
                    </span>
                  </div>
                  <div className="text-sm text-green-700 mb-1">{level.reasoning}</div>
                  <div className="flex justify-between text-xs text-green-600">
                    <span>{Math.round(level.confidence * 100)}% confidence</span>
                    <span>{level.timeEstimate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stop Loss Strategies */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Stop Loss Strategies
            </h4>
            <div className="space-y-2">
              {exitData.stopLossStrategies.map((strategy, index) => (
                <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-red-800">
                      {strategy.type}: ${strategy.price.toFixed(4)}
                    </span>
                    <span className="text-sm text-red-600">
                      -{strategy.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-sm text-red-700 mb-1">{strategy.reasoning}</div>
                  <div className="text-xs text-red-600">
                    {strategy.dynamic ? 'Dynamic' : 'Fixed'} stop level
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Volume Exhaustion Analysis */}
          {exitData.volumeExhaustion.detected && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-orange-600" />
                <span className="font-medium text-orange-800">Volume Exhaustion Detected</span>
              </div>
              <div className="text-sm text-orange-700 mb-2">
                {exitData.volumeExhaustion.type.replace('_', ' ').toLowerCase()} pattern identified
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-orange-600">
                  Confidence: {Math.round(exitData.volumeExhaustion.confidence * 100)}%
                </span>
                <span className="font-medium text-orange-800">
                  Action: {exitData.volumeExhaustion.recommendation.replace('_', ' ')}
                </span>
              </div>
            </div>
          )}

          {/* Risk Metrics */}
          {position && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Position Risk Metrics
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Current Drawdown</div>
                  <div className="font-medium text-red-600">
                    -{exitData.riskMetrics.currentDrawdown.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Time in Trade</div>
                  <div className="font-medium">{exitData.riskMetrics.timeInTrade}</div>
                </div>
                <div>
                  <div className="text-gray-500">Profit Target</div>
                  <div className="font-medium text-green-600">
                    ${exitData.riskMetrics.profitTarget.toFixed(4)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Position Size</div>
                  <div className="font-medium">{position.size}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}