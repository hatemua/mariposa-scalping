'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  Layers,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  Zap,
  Eye,
  Settings
} from 'lucide-react';

interface TimeframeSignal {
  timeframe: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number;
  confidence: number;
  signals: {
    rsi: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; weight: number };
    macd: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; weight: number };
    ema: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; weight: number };
    volume: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; weight: number };
    support: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; weight: number };
    momentum: { value: number; signal: 'BUY' | 'SELL' | 'NEUTRAL'; weight: number };
  };
  keyLevels: {
    support: number[];
    resistance: number[];
    pivot: number;
  };
  volumeProfile: {
    highVolumeNodes: number[];
    lowVolumeNodes: number[];
    poc: number; // Point of Control
  };
}

interface ConfluenceZone {
  price: number;
  strength: number;
  timeframes: string[];
  signalTypes: string[];
  confluence: 'STRONG_BUY' | 'BUY' | 'WEAK_BUY' | 'NEUTRAL' | 'WEAK_SELL' | 'SELL' | 'STRONG_SELL';
  description: string;
}

interface MarketStructure {
  higherHighs: boolean;
  higherLows: boolean;
  trend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  strength: number;
  duration: string;
  breakoutPotential: number;
}

interface MultiTimeframeData {
  symbol: string;
  currentPrice: number;
  timeframeSignals: TimeframeSignal[];
  confluenceZones: ConfluenceZone[];
  marketStructure: MarketStructure;
  overallConfluence: {
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    strength: number;
    confidence: number;
    timeAlignment: number;
    recommendation: string;
  };
  keyInsights: string[];
  tradingPlan: {
    entry: { price: number; reasoning: string };
    stopLoss: { price: number; reasoning: string };
    takeProfit: { price: number; reasoning: string };
    riskReward: number;
    timeframe: string;
  };
}

interface MultiTimeframeConfluenceProps {
  symbol: string;
  timeframes?: string[];
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const DEFAULT_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

const TIMEFRAME_WEIGHTS = {
  '1m': 0.5,
  '5m': 0.8,
  '15m': 1.0,
  '1h': 1.5,
  '4h': 2.0,
  '1d': 2.5,
  '1w': 3.0
};

const CONFLUENCE_COLORS = {
  STRONG_BUY: 'bg-green-600 text-white',
  BUY: 'bg-green-500 text-white',
  WEAK_BUY: 'bg-green-300 text-green-800',
  NEUTRAL: 'bg-gray-300 text-gray-800',
  WEAK_SELL: 'bg-red-300 text-red-800',
  SELL: 'bg-red-500 text-white',
  STRONG_SELL: 'bg-red-600 text-white'
};

const SIGNAL_ICONS = {
  BUY: TrendingUp,
  SELL: TrendingDown,
  NEUTRAL: Activity
};

export default function MultiTimeframeConfluence({
  symbol,
  timeframes = DEFAULT_TIMEFRAMES,
  autoRefresh = true,
  refreshInterval = 120000, // 2 minutes for multi-timeframe analysis (was 30s - too aggressive)
  className = ''
}: MultiTimeframeConfluenceProps) {
  const [confluenceData, setConfluenceData] = useState<MultiTimeframeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);

  // Calculate RSI
  const calculateRSI = (prices: number[], period: number = 14): number => {
    if (prices.length < period + 1) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  // Calculate MACD
  const calculateMACD = (prices: number[]): { macd: number; signal: number; histogram: number } => {
    if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };

    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;

    // Simplified signal line calculation
    const signalLine = macdLine * 0.9; // Approximation
    const histogram = macdLine - signalLine;

    return { macd: macdLine, signal: signalLine, histogram };
  };

  // Calculate EMA
  const calculateEMA = (prices: number[], period: number): number => {
    if (prices.length === 0) return 0;
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  };

  // Detect support and resistance levels
  const detectKeyLevels = (highs: number[], lows: number[], currentPrice: number) => {
    const allPrices = [...highs, ...lows].sort((a, b) => a - b);
    const priceRanges = new Map<number, number>();

    // Group prices into ranges
    allPrices.forEach(price => {
      const range = Math.round(price / (currentPrice * 0.005)) * (currentPrice * 0.005);
      priceRanges.set(range, (priceRanges.get(range) || 0) + 1);
    });

    // Find significant levels
    const significantLevels = Array.from(priceRanges.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([price, _]) => price);

    const support = significantLevels.filter(level => level < currentPrice).slice(0, 3);
    const resistance = significantLevels.filter(level => level > currentPrice).slice(0, 3);

    return {
      support: support.sort((a, b) => b - a), // Closest first
      resistance: resistance.sort((a, b) => a - b), // Closest first
      pivot: (Math.max(...highs) + Math.min(...lows) + currentPrice) / 3
    };
  };

  // Calculate confluence strength
  const calculateConfluenceStrength = (signals: TimeframeSignal['signals']): number => {
    let totalWeight = 0;
    let signalStrength = 0;

    Object.values(signals).forEach(signal => {
      totalWeight += signal.weight;
      const signalValue = signal.signal === 'BUY' ? 1 : signal.signal === 'SELL' ? -1 : 0;
      signalStrength += signalValue * signal.weight;
    });

    return totalWeight > 0 ? Math.abs(signalStrength) / totalWeight : 0;
  };

  // Analyze timeframe signals
  const analyzeTimeframeSignals = async (symbol: string, timeframe: string): Promise<TimeframeSignal> => {
    try {
      const chartData = await marketApi.getChartData(symbol, timeframe, 100);
      const klines = safeArray.getValue(safeObject.get(chartData, 'data.klines', [])) as any[];

      if (klines.length === 0) {
        throw new Error(`No data available for ${timeframe}`);
      }

      const highs = klines.map((candle: any[]) => parseFloat(candle[2]));
      const lows = klines.map((candle: any[]) => parseFloat(candle[3]));
      const closes = klines.map((candle: any[]) => parseFloat(candle[4]));
      const volumes = klines.map((candle: any[]) => parseFloat(candle[5]));

      const currentPrice = closes[closes.length - 1];
      const previousPrice = closes[closes.length - 2];
      const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;

      // Calculate indicators
      const rsi = calculateRSI(closes);
      const macd = calculateMACD(closes);
      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);
      const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
      const currentVolume = volumes[volumes.length - 1];

      // Generate signals
      const signals: TimeframeSignal['signals'] = {
        rsi: {
          value: rsi,
          signal: rsi > 70 ? 'SELL' : rsi < 30 ? 'BUY' : 'NEUTRAL',
          weight: 1.0
        },
        macd: {
          value: macd.histogram,
          signal: macd.histogram > 0 ? 'BUY' : macd.histogram < 0 ? 'SELL' : 'NEUTRAL',
          weight: 1.2
        },
        ema: {
          value: (currentPrice - ema20) / ema20 * 100,
          signal: currentPrice > ema20 && ema20 > ema50 ? 'BUY' :
                 currentPrice < ema20 && ema20 < ema50 ? 'SELL' : 'NEUTRAL',
          weight: 1.5
        },
        volume: {
          value: currentVolume / avgVolume,
          signal: currentVolume > avgVolume * 1.5 && priceChange > 0 ? 'BUY' :
                 currentVolume > avgVolume * 1.5 && priceChange < 0 ? 'SELL' : 'NEUTRAL',
          weight: 1.0
        },
        support: {
          value: 0,
          signal: 'NEUTRAL',
          weight: 0.8
        },
        momentum: {
          value: priceChange,
          signal: priceChange > 1 ? 'BUY' : priceChange < -1 ? 'SELL' : 'NEUTRAL',
          weight: 1.1
        }
      };

      // Calculate key levels
      const keyLevels = detectKeyLevels(highs, lows, currentPrice);

      // Adjust support signal based on proximity to support/resistance
      const nearestSupport = keyLevels.support[0];
      const nearestResistance = keyLevels.resistance[0];

      if (nearestSupport && Math.abs(currentPrice - nearestSupport) / currentPrice < 0.01) {
        signals.support.signal = 'BUY';
        signals.support.value = 1;
      } else if (nearestResistance && Math.abs(currentPrice - nearestResistance) / currentPrice < 0.01) {
        signals.support.signal = 'SELL';
        signals.support.value = -1;
      }

      // Calculate overall trend and strength
      const strength = calculateConfluenceStrength(signals);
      const bullishSignals = Object.values(signals).filter(s => s.signal === 'BUY').length;
      const bearishSignals = Object.values(signals).filter(s => s.signal === 'SELL').length;

      const trend = bullishSignals > bearishSignals ? 'BULLISH' :
                   bearishSignals > bullishSignals ? 'BEARISH' : 'NEUTRAL';

      const confidence = Math.max(bullishSignals, bearishSignals) / Object.keys(signals).length;

      // Volume profile (simplified)
      const volumeProfile = {
        highVolumeNodes: [currentPrice * 0.98, currentPrice * 1.02],
        lowVolumeNodes: [currentPrice * 0.95, currentPrice * 1.05],
        poc: currentPrice
      };

      return {
        timeframe,
        trend,
        strength,
        confidence,
        signals,
        keyLevels,
        volumeProfile
      };

    } catch (error) {
      console.error(`Error analyzing timeframe ${timeframe}:`, error);
      throw error;
    }
  };

  // Generate confluence analysis
  const generateConfluenceAnalysis = async (symbol: string): Promise<MultiTimeframeData> => {
    try {
      // Analyze all timeframes
      const timeframePromises = timeframes.map(tf => analyzeTimeframeSignals(symbol, tf));
      const timeframeSignals = await Promise.all(timeframePromises);

      // Get current price
      const marketData = await marketApi.getMarketData(symbol);
      const currentPrice = safeNumber.getValue(safeObject.get(marketData, 'data.price', 0));

      // Identify confluence zones
      const confluenceZones: ConfluenceZone[] = [];

      // Collect all key levels from all timeframes
      const allLevels: { price: number; timeframes: string[]; types: string[] }[] = [];

      timeframeSignals.forEach(signal => {
        // Add support levels
        signal.keyLevels.support.forEach(level => {
          const existing = allLevels.find(l => Math.abs(l.price - level) / currentPrice < 0.005);
          if (existing) {
            existing.timeframes.push(signal.timeframe);
            existing.types.push('support');
          } else {
            allLevels.push({
              price: level,
              timeframes: [signal.timeframe],
              types: ['support']
            });
          }
        });

        // Add resistance levels
        signal.keyLevels.resistance.forEach(level => {
          const existing = allLevels.find(l => Math.abs(l.price - level) / currentPrice < 0.005);
          if (existing) {
            existing.timeframes.push(signal.timeframe);
            existing.types.push('resistance');
          } else {
            allLevels.push({
              price: level,
              timeframes: [signal.timeframe],
              types: ['resistance']
            });
          }
        });
      });

      // Create confluence zones from levels with multiple timeframe confirmations
      allLevels
        .filter(level => level.timeframes.length >= 2)
        .forEach(level => {
          const strength = level.timeframes.reduce((sum, tf) =>
            sum + (TIMEFRAME_WEIGHTS[tf as keyof typeof TIMEFRAME_WEIGHTS] || 1), 0
          );

          const isSupport = level.types.includes('support');
          const isResistance = level.types.includes('resistance');

          let confluence: ConfluenceZone['confluence'];
          if (isSupport && currentPrice > level.price) {
            confluence = strength > 6 ? 'STRONG_BUY' : strength > 4 ? 'BUY' : 'WEAK_BUY';
          } else if (isResistance && currentPrice < level.price) {
            confluence = strength > 6 ? 'STRONG_SELL' : strength > 4 ? 'SELL' : 'WEAK_SELL';
          } else {
            confluence = 'NEUTRAL';
          }

          confluenceZones.push({
            price: level.price,
            strength,
            timeframes: level.timeframes,
            signalTypes: Array.from(new Set(level.types)),
            confluence,
            description: `${level.types.join('/')} confluence across ${level.timeframes.length} timeframes`
          });
        });

      // Analyze market structure
      const longerTimeframes = timeframeSignals.filter(s => ['4h', '1d', '1w'].includes(s.timeframe));
      const marketStructure: MarketStructure = {
        higherHighs: longerTimeframes.some(s => s.trend === 'BULLISH'),
        higherLows: longerTimeframes.some(s => s.trend === 'BULLISH'),
        trend: longerTimeframes.length > 0 ?
               longerTimeframes.filter(s => s.trend === 'BULLISH').length > longerTimeframes.length / 2 ? 'UPTREND' :
               longerTimeframes.filter(s => s.trend === 'BEARISH').length > longerTimeframes.length / 2 ? 'DOWNTREND' : 'SIDEWAYS' : 'SIDEWAYS',
        strength: longerTimeframes.reduce((sum, s) => sum + s.strength, 0) / Math.max(longerTimeframes.length, 1),
        duration: '1-2 weeks', // Simplified
        breakoutPotential: confluenceZones.length > 0 ? Math.max(...confluenceZones.map(z => z.strength)) / 10 : 0.5
      };

      // Calculate overall confluence
      const weightedBullishScore = timeframeSignals.reduce((sum, signal) => {
        const weight = TIMEFRAME_WEIGHTS[signal.timeframe as keyof typeof TIMEFRAME_WEIGHTS] || 1;
        const score = signal.trend === 'BULLISH' ? 1 : signal.trend === 'BEARISH' ? -1 : 0;
        return sum + (score * weight * signal.confidence);
      }, 0);

      const totalWeight = timeframeSignals.reduce((sum, signal) =>
        sum + (TIMEFRAME_WEIGHTS[signal.timeframe as keyof typeof TIMEFRAME_WEIGHTS] || 1), 0
      );

      const normalizedScore = weightedBullishScore / totalWeight;
      const overallDirection = normalizedScore > 0.2 ? 'BULLISH' :
                              normalizedScore < -0.2 ? 'BEARISH' : 'NEUTRAL';

      const overallStrength = Math.abs(normalizedScore);
      const timeAlignment = timeframeSignals.filter(s => s.trend === overallDirection).length / timeframeSignals.length;

      // Generate insights
      const keyInsights: string[] = [];

      if (timeAlignment > 0.8) {
        keyInsights.push(`Strong ${overallDirection.toLowerCase()} alignment across ${Math.round(timeAlignment * 100)}% of timeframes`);
      }

      if (confluenceZones.length > 0) {
        const strongZones = confluenceZones.filter(z => z.strength > 4);
        keyInsights.push(`${strongZones.length} strong confluence zones identified`);
      }

      if (marketStructure.breakoutPotential > 0.7) {
        keyInsights.push('High breakout potential detected based on market structure');
      }

      const shortTermSignals = timeframeSignals.filter(s => ['1m', '5m', '15m'].includes(s.timeframe));
      const shortTermBullish = shortTermSignals.filter(s => s.trend === 'BULLISH').length;
      if (shortTermBullish === shortTermSignals.length) {
        keyInsights.push('All short-term timeframes showing bullish signals');
      } else if (shortTermBullish === 0) {
        keyInsights.push('All short-term timeframes showing bearish signals');
      }

      // Generate trading plan
      const primaryTimeframe = timeframes.find(tf => ['15m', '1h', '4h'].includes(tf)) || '1h';
      const primarySignal = timeframeSignals.find(s => s.timeframe === primaryTimeframe);

      const nearestSupport = confluenceZones
        .filter(z => z.price < currentPrice && z.signalTypes.includes('support'))
        .sort((a, b) => b.price - a.price)[0];

      const nearestResistance = confluenceZones
        .filter(z => z.price > currentPrice && z.signalTypes.includes('resistance'))
        .sort((a, b) => a.price - b.price)[0];

      const tradingPlan = {
        entry: {
          price: overallDirection === 'BULLISH' ? currentPrice * 1.002 : currentPrice * 0.998,
          reasoning: `Enter on ${overallDirection.toLowerCase()} confluence with ${Math.round(overallStrength * 100)}% strength`
        },
        stopLoss: {
          price: overallDirection === 'BULLISH' ?
                (nearestSupport ? nearestSupport.price * 0.995 : currentPrice * 0.98) :
                (nearestResistance ? nearestResistance.price * 1.005 : currentPrice * 1.02),
          reasoning: overallDirection === 'BULLISH' ?
                    'Below nearest confluence support' : 'Above nearest confluence resistance'
        },
        takeProfit: {
          price: overallDirection === 'BULLISH' ?
                (nearestResistance ? nearestResistance.price * 0.995 : currentPrice * 1.04) :
                (nearestSupport ? nearestSupport.price * 1.005 : currentPrice * 0.96),
          reasoning: overallDirection === 'BULLISH' ?
                    'At nearest confluence resistance' : 'At nearest confluence support'
        },
        riskReward: 0,
        timeframe: primaryTimeframe
      };

      // Calculate risk-reward ratio
      const riskDistance = Math.abs(tradingPlan.entry.price - tradingPlan.stopLoss.price);
      const rewardDistance = Math.abs(tradingPlan.takeProfit.price - tradingPlan.entry.price);
      tradingPlan.riskReward = riskDistance > 0 ? rewardDistance / riskDistance : 0;

      return {
        symbol,
        currentPrice,
        timeframeSignals,
        confluenceZones: confluenceZones.sort((a, b) => b.strength - a.strength),
        marketStructure,
        overallConfluence: {
          direction: overallDirection,
          strength: overallStrength,
          confidence: Math.max(...timeframeSignals.map(s => s.confidence)),
          timeAlignment,
          recommendation: overallStrength > 0.6 && timeAlignment > 0.7 ?
                         `Strong ${overallDirection.toLowerCase()} setup with high confluence` :
                         'Mixed signals - wait for clearer confluence'
        },
        keyInsights,
        tradingPlan
      };

    } catch (error) {
      console.error('Error generating confluence analysis:', error);
      throw error;
    }
  };

  const fetchConfluenceData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await generateConfluenceAnalysis(symbol);
      setConfluenceData(data);
    } catch (error: any) {
      console.error('Error fetching confluence data:', error);
      setError(error.message || 'Failed to analyze multi-timeframe confluence');
      toast.error('Failed to analyze confluence');
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

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading confluence analysis</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6 text-purple-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Multi-Timeframe Confluence</h3>
            <p className="text-sm text-gray-600">{symbol} • Signal Alignment Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`p-2 rounded-lg transition-colors ${
              showDetails ? 'bg-purple-100 text-purple-700' : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Toggle Details"
          >
            <Eye className="h-4 w-4" />
          </button>
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          <span className="ml-2 text-gray-600">Analyzing confluence...</span>
        </div>
      ) : confluenceData ? (
        <div className="space-y-6">
          {/* Overall Confluence */}
          <div className={`rounded-lg p-4 border-2 ${
            confluenceData.overallConfluence.direction === 'BULLISH' ? 'bg-green-50 border-green-200' :
            confluenceData.overallConfluence.direction === 'BEARISH' ? 'bg-red-50 border-red-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className={`h-5 w-5 ${
                  confluenceData.overallConfluence.direction === 'BULLISH' ? 'text-green-600' :
                  confluenceData.overallConfluence.direction === 'BEARISH' ? 'text-red-600' :
                  'text-gray-600'
                }`} />
                <span className="font-semibold text-lg">
                  {confluenceData.overallConfluence.direction} Confluence
                </span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">
                  {Math.round(confluenceData.overallConfluence.strength * 100)}% Strength
                </div>
                <div className="text-sm text-gray-600">
                  {Math.round(confluenceData.overallConfluence.timeAlignment * 100)}% alignment
                </div>
              </div>
            </div>
            <p className="text-sm mb-2">{confluenceData.overallConfluence.recommendation}</p>
            <div className="text-xs text-gray-600">
              Confidence: {Math.round(confluenceData.overallConfluence.confidence * 100)}%
            </div>
          </div>

          {/* Timeframe Signals */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Timeframe Analysis ({confluenceData.timeframeSignals.length})
            </h4>
            <div className="grid gap-3">
              {confluenceData.timeframeSignals.map((signal) => {
                const SignalIcon = SIGNAL_ICONS[signal.trend === 'BULLISH' ? 'BUY' : signal.trend === 'BEARISH' ? 'SELL' : 'NEUTRAL'];

                return (
                  <div
                    key={signal.timeframe}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedTimeframe === signal.timeframe
                        ? 'border-purple-300 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedTimeframe(
                      selectedTimeframe === signal.timeframe ? null : signal.timeframe
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          signal.trend === 'BULLISH' ? 'bg-green-100 text-green-600' :
                          signal.trend === 'BEARISH' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          <SignalIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium">{signal.timeframe}</div>
                          <div className="text-sm text-gray-600">
                            {signal.trend} • {Math.round(signal.strength * 100)}% strength
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {Math.round(signal.confidence * 100)}% confidence
                        </div>
                        <div className="text-xs text-gray-600">
                          Weight: {TIMEFRAME_WEIGHTS[signal.timeframe as keyof typeof TIMEFRAME_WEIGHTS] || 1}x
                        </div>
                      </div>
                    </div>

                    {/* Signal Details */}
                    {selectedTimeframe === signal.timeframe && showDetails && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          {Object.entries(signal.signals).map(([name, signalData]) => {
                            const SignalDetailIcon = SIGNAL_ICONS[signalData.signal];
                            return (
                              <div key={name} className="flex items-center justify-between">
                                <span className="capitalize">{name}</span>
                                <div className="flex items-center gap-1">
                                  <SignalDetailIcon className={`h-3 w-3 ${
                                    signalData.signal === 'BUY' ? 'text-green-600' :
                                    signalData.signal === 'SELL' ? 'text-red-600' :
                                    'text-gray-600'
                                  }`} />
                                  <span className="text-xs">{signalData.value.toFixed(2)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Confluence Zones */}
          {confluenceData.confluenceZones.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Confluence Zones ({confluenceData.confluenceZones.length})
              </h4>
              <div className="space-y-2">
                {confluenceData.confluenceZones.slice(0, 5).map((zone, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${CONFLUENCE_COLORS[zone.confluence]}`}>
                          {zone.confluence.replace('_', ' ')}
                        </span>
                        <span className="font-medium">${zone.price.toFixed(4)}</span>
                      </div>
                      <div className="text-right text-sm">
                        <div>Strength: {zone.strength.toFixed(1)}</div>
                        <div className="text-gray-600">
                          {((zone.price - confluenceData.currentPrice) / confluenceData.currentPrice * 100).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-700 mb-1">{zone.description}</div>
                    <div className="text-xs text-gray-600">
                      Timeframes: {zone.timeframes.join(', ')} • Types: {zone.signalTypes.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trading Plan */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Confluence-Based Trading Plan
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
              <div>
                <div className="text-sm text-blue-600 mb-1">Entry</div>
                <div className="font-medium">${confluenceData.tradingPlan.entry.price.toFixed(4)}</div>
                <div className="text-xs text-blue-700">{confluenceData.tradingPlan.entry.reasoning}</div>
              </div>
              <div>
                <div className="text-sm text-blue-600 mb-1">Stop Loss</div>
                <div className="font-medium text-red-600">${confluenceData.tradingPlan.stopLoss.price.toFixed(4)}</div>
                <div className="text-xs text-blue-700">{confluenceData.tradingPlan.stopLoss.reasoning}</div>
              </div>
              <div>
                <div className="text-sm text-blue-600 mb-1">Take Profit</div>
                <div className="font-medium text-green-600">${confluenceData.tradingPlan.takeProfit.price.toFixed(4)}</div>
                <div className="text-xs text-blue-700">{confluenceData.tradingPlan.takeProfit.reasoning}</div>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span>Risk:Reward Ratio: <span className="font-medium">{confluenceData.tradingPlan.riskReward.toFixed(2)}:1</span></span>
              <span>Primary Timeframe: <span className="font-medium">{confluenceData.tradingPlan.timeframe}</span></span>
            </div>
          </div>

          {/* Key Insights */}
          {confluenceData.keyInsights.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-medium text-purple-900 mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Key Insights
              </h4>
              <div className="space-y-2">
                {confluenceData.keyInsights.map((insight, index) => (
                  <div key={index} className="text-sm text-purple-800 flex items-start gap-2">
                    <span className="text-purple-600 mt-1">•</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market Structure */}
          {showDetails && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Market Structure Analysis
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Overall Trend</div>
                  <div className={`font-medium ${
                    confluenceData.marketStructure.trend === 'UPTREND' ? 'text-green-600' :
                    confluenceData.marketStructure.trend === 'DOWNTREND' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {confluenceData.marketStructure.trend}
                  </div>
                </div>
                <div>
                  <div className="text-gray-600">Trend Strength</div>
                  <div className="font-medium">{Math.round(confluenceData.marketStructure.strength * 100)}%</div>
                </div>
                <div>
                  <div className="text-gray-600">Duration</div>
                  <div className="font-medium">{confluenceData.marketStructure.duration}</div>
                </div>
                <div>
                  <div className="text-gray-600">Breakout Potential</div>
                  <div className="font-medium">{Math.round(confluenceData.marketStructure.breakoutPotential * 100)}%</div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}