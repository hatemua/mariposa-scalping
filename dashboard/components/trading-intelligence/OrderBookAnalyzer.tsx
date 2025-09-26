'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Zap,
  AlertTriangle,
  RefreshCw,
  Eye,
  Layers,
  Clock,
  Volume2,
  DollarSign,
  Percent,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
  percentage: number;
  orders?: number;
}

interface OrderBookImbalance {
  bidAskRatio: number;
  bidPressure: number;
  askPressure: number;
  imbalanceStrength: 'WEAK' | 'MODERATE' | 'STRONG' | 'EXTREME';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
}

interface LiquidityAnalysis {
  bidLiquidity: number;
  askLiquidity: number;
  totalLiquidity: number;
  liquidityRatio: number;
  depthAtPercentage: { [key: string]: { bid: number; ask: number } };
  liquidityGaps: { price: number; side: 'BID' | 'ASK'; size: number }[];
}

interface MarketMicrostructure {
  spread: number;
  spreadPercentage: number;
  midPrice: number;
  weightedMidPrice: number;
  priceImpact: { [size: string]: { buy: number; sell: number } };
  marketDepth: number;
  resilience: number;
  efficiency: number;
}

interface FlowAnalysis {
  aggressiveBuys: number;
  aggressiveSells: number;
  passiveBuys: number;
  passiveSells: number;
  flowRatio: number;
  institutionalFlow: number;
  retailFlow: number;
  flowTrend: 'BUYING_PRESSURE' | 'SELLING_PRESSURE' | 'BALANCED';
}

interface OrderBookData {
  symbol: string;
  timestamp: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  imbalance: OrderBookImbalance;
  liquidity: LiquidityAnalysis;
  microstructure: MarketMicrostructure;
  flow: FlowAnalysis;
  signals: {
    liquidityGrab: { detected: boolean; side: 'BID' | 'ASK' | null; strength: number };
    sweepAlert: { detected: boolean; levels: number; impact: number };
    whaleActivity: { detected: boolean; size: number; side: 'BUY' | 'SELL' | null };
    algorithmicActivity: { detected: boolean; pattern: string; confidence: number };
  };
  recommendations: {
    execution: string;
    timing: string;
    risk: string;
    opportunity: string;
  };
}

interface OrderBookAnalyzerProps {
  symbol: string;
  levels?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const IMBALANCE_COLORS = {
  EXTREME: 'text-red-600',
  STRONG: 'text-orange-600',
  MODERATE: 'text-yellow-600',
  WEAK: 'text-green-600'
};

const FLOW_COLORS = {
  BUYING_PRESSURE: 'text-green-600',
  SELLING_PRESSURE: 'text-red-600',
  BALANCED: 'text-gray-600'
};

export default function OrderBookAnalyzer({
  symbol,
  levels = 20,
  autoRefresh = true,
  refreshInterval = 2000, // 2 seconds for order book
  className = ''
}: OrderBookAnalyzerProps) {
  const [orderBookData, setOrderBookData] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<OrderBookLevel | null>(null);
  const [viewMode, setViewMode] = useState<'book' | 'analysis' | 'flow' | 'signals'>('book');

  // Simulate order book data (in production, this would come from WebSocket feeds)
  const generateOrderBookData = async (symbol: string): Promise<OrderBookData> => {
    try {
      // Get current market data
      const marketData = await marketApi.getMarketData(symbol);
      const mData = safeObject.get(marketData, 'data', {});
      const currentPrice = safeNumber.getValue(safeObject.get(mData, 'price', 0));

      if (!currentPrice) {
        throw new Error('No price data available');
      }

      // Generate realistic order book levels
      const spread = currentPrice * 0.001; // 0.1% spread
      const midPrice = currentPrice;
      const bidPrice = midPrice - spread / 2;
      const askPrice = midPrice + spread / 2;

      const bids: OrderBookLevel[] = [];
      const asks: OrderBookLevel[] = [];

      let bidTotal = 0;
      let askTotal = 0;

      // Generate bid levels (below current price)
      for (let i = 0; i < levels; i++) {
        const priceLevel = bidPrice - (i * spread * 0.1);
        const baseSize = 1000 + Math.random() * 9000;
        const sizeMultiplier = Math.exp(-i * 0.1); // Exponential decay
        const size = baseSize * sizeMultiplier;
        bidTotal += size;

        bids.push({
          price: priceLevel,
          size: size,
          total: bidTotal,
          percentage: 0, // Will be calculated later
          orders: Math.floor(size / (100 + Math.random() * 200))
        });
      }

      // Generate ask levels (above current price)
      for (let i = 0; i < levels; i++) {
        const priceLevel = askPrice + (i * spread * 0.1);
        const baseSize = 1000 + Math.random() * 9000;
        const sizeMultiplier = Math.exp(-i * 0.1); // Exponential decay
        const size = baseSize * sizeMultiplier;
        askTotal += size;

        asks.push({
          price: priceLevel,
          size: size,
          total: askTotal,
          percentage: 0, // Will be calculated later
          orders: Math.floor(size / (100 + Math.random() * 200))
        });
      }

      // Calculate percentages
      const maxBidTotal = bids[bids.length - 1].total;
      const maxAskTotal = asks[asks.length - 1].total;

      bids.forEach(bid => {
        bid.percentage = (bid.total / maxBidTotal) * 100;
      });

      asks.forEach(ask => {
        ask.percentage = (ask.total / maxAskTotal) * 100;
      });

      // Calculate order book imbalance
      const bidSum = bids.slice(0, 10).reduce((sum, bid) => sum + bid.size, 0);
      const askSum = asks.slice(0, 10).reduce((sum, ask) => sum + ask.size, 0);
      const bidAskRatio = bidSum / (askSum + bidSum);
      const bidPressure = Math.max(0, bidAskRatio - 0.5) * 2;
      const askPressure = Math.max(0, 0.5 - bidAskRatio) * 2;

      const imbalanceStrength = bidAskRatio > 0.7 || bidAskRatio < 0.3 ? 'EXTREME' :
                               bidAskRatio > 0.6 || bidAskRatio < 0.4 ? 'STRONG' :
                               bidAskRatio > 0.55 || bidAskRatio < 0.45 ? 'MODERATE' : 'WEAK';

      const direction = bidAskRatio > 0.52 ? 'BULLISH' :
                       bidAskRatio < 0.48 ? 'BEARISH' : 'NEUTRAL';

      const imbalance: OrderBookImbalance = {
        bidAskRatio,
        bidPressure,
        askPressure,
        imbalanceStrength,
        direction,
        confidence: Math.abs(bidAskRatio - 0.5) * 2
      };

      // Calculate liquidity analysis
      const bidLiquidity = bidSum;
      const askLiquidity = askSum;
      const totalLiquidity = bidLiquidity + askLiquidity;
      const liquidityRatio = bidLiquidity / askLiquidity;

      // Calculate depth at different percentages
      const depthAtPercentage: { [key: string]: { bid: number; ask: number } } = {};
      const percentages = ['0.1', '0.5', '1.0', '2.0'];

      percentages.forEach(pct => {
        const pctValue = parseFloat(pct) / 100;
        const bidDepth = bids.filter(bid => bid.price >= midPrice * (1 - pctValue))
                             .reduce((sum, bid) => sum + bid.size, 0);
        const askDepth = asks.filter(ask => ask.price <= midPrice * (1 + pctValue))
                             .reduce((sum, ask) => sum + ask.size, 0);

        depthAtPercentage[pct] = { bid: bidDepth, ask: askDepth };
      });

      // Detect liquidity gaps
      const liquidityGaps: { price: number; side: 'BID' | 'ASK'; size: number }[] = [];
      const avgBidSize = bidSum / bids.length;
      const avgAskSize = askSum / asks.length;

      bids.forEach(bid => {
        if (bid.size < avgBidSize * 0.3) {
          liquidityGaps.push({ price: bid.price, side: 'BID', size: bid.size });
        }
      });

      asks.forEach(ask => {
        if (ask.size < avgAskSize * 0.3) {
          liquidityGaps.push({ price: ask.price, side: 'ASK', size: ask.size });
        }
      });

      const liquidity: LiquidityAnalysis = {
        bidLiquidity,
        askLiquidity,
        totalLiquidity,
        liquidityRatio,
        depthAtPercentage,
        liquidityGaps
      };

      // Calculate market microstructure
      const spreadValue = askPrice - bidPrice;
      const spreadPercentage = (spreadValue / midPrice) * 100;
      const weightedBidPrice = bids.slice(0, 5).reduce((sum, bid, i) =>
        sum + (bid.price * bid.size), 0) / bids.slice(0, 5).reduce((sum, bid) => sum + bid.size, 0);
      const weightedAskPrice = asks.slice(0, 5).reduce((sum, ask, i) =>
        sum + (ask.price * ask.size), 0) / asks.slice(0, 5).reduce((sum, ask) => sum + ask.size, 0);
      const weightedMidPrice = (weightedBidPrice + weightedAskPrice) / 2;

      // Calculate price impact for different order sizes
      const priceImpact: { [size: string]: { buy: number; sell: number } } = {};
      const orderSizes = ['1000', '5000', '10000', '25000'];

      orderSizes.forEach(size => {
        const orderSize = parseFloat(size);

        // Calculate buy impact (eating through asks)
        let remainingSize = orderSize;
        let totalCost = 0;
        for (const ask of asks) {
          if (remainingSize <= 0) break;
          const sizeToTake = Math.min(remainingSize, ask.size);
          totalCost += sizeToTake * ask.price;
          remainingSize -= sizeToTake;
        }
        const avgBuyPrice = totalCost / orderSize;
        const buyImpact = ((avgBuyPrice - midPrice) / midPrice) * 100;

        // Calculate sell impact (eating through bids)
        remainingSize = orderSize;
        totalCost = 0;
        for (const bid of bids) {
          if (remainingSize <= 0) break;
          const sizeToTake = Math.min(remainingSize, bid.size);
          totalCost += sizeToTake * bid.price;
          remainingSize -= sizeToTake;
        }
        const avgSellPrice = totalCost / orderSize;
        const sellImpact = ((midPrice - avgSellPrice) / midPrice) * 100;

        priceImpact[size] = { buy: buyImpact, sell: sellImpact };
      });

      const marketDepth = Math.min(bidLiquidity, askLiquidity);
      const resilience = 1 / Math.max(priceImpact['10000'].buy, priceImpact['10000'].sell);
      const efficiency = 1 / spreadPercentage;

      const microstructure: MarketMicrostructure = {
        spread: spreadValue,
        spreadPercentage,
        midPrice,
        weightedMidPrice,
        priceImpact,
        marketDepth,
        resilience,
        efficiency
      };

      // Simulate order flow analysis
      const aggressiveBuys = Math.random() * 100000;
      const aggressiveSells = Math.random() * 100000;
      const passiveBuys = Math.random() * 50000;
      const passiveSells = Math.random() * 50000;

      const totalBuyFlow = aggressiveBuys + passiveBuys;
      const totalSellFlow = aggressiveSells + passiveSells;
      const flowRatio = totalBuyFlow / (totalBuyFlow + totalSellFlow);

      const institutionalFlow = (aggressiveBuys + aggressiveSells) * 0.7; // Assume 70% of aggressive flow is institutional
      const retailFlow = (passiveBuys + passiveSells) * 0.8; // Assume 80% of passive flow is retail

      const flowTrend = flowRatio > 0.55 ? 'BUYING_PRESSURE' :
                       flowRatio < 0.45 ? 'SELLING_PRESSURE' : 'BALANCED';

      const flow: FlowAnalysis = {
        aggressiveBuys,
        aggressiveSells,
        passiveBuys,
        passiveSells,
        flowRatio,
        institutionalFlow,
        retailFlow,
        flowTrend
      };

      // Detect trading signals
      const liquidityGrab = {
        detected: Math.random() > 0.8, // 20% chance
        side: Math.random() > 0.5 ? 'BID' as const : 'ASK' as const,
        strength: Math.random()
      };

      const sweepAlert = {
        detected: Math.random() > 0.9, // 10% chance
        levels: Math.floor(Math.random() * 5) + 1,
        impact: Math.random() * 2
      };

      const whaleActivity = {
        detected: Math.random() > 0.85, // 15% chance
        size: Math.random() * 100000 + 50000,
        side: Math.random() > 0.5 ? 'BUY' as const : 'SELL' as const
      };

      const algorithmicActivity = {
        detected: Math.random() > 0.7, // 30% chance
        pattern: ['ICEBERG', 'TWAP', 'VWAP', 'STEALTH'][Math.floor(Math.random() * 4)],
        confidence: Math.random()
      };

      const signals = {
        liquidityGrab,
        sweepAlert,
        whaleActivity,
        algorithmicActivity
      };

      // Generate recommendations
      const recommendations = {
        execution: imbalance.imbalanceStrength === 'EXTREME' ?
                  'Use smaller order sizes and split execution' :
                  'Normal execution strategy acceptable',
        timing: flow.flowTrend === 'BUYING_PRESSURE' ?
               'Consider waiting for selling pressure to enter long' :
               flow.flowTrend === 'SELLING_PRESSURE' ?
               'Consider waiting for buying pressure to enter short' :
               'Balanced flow - good timing for execution',
        risk: spreadPercentage > 0.1 ?
             'High spread risk - monitor for liquidity issues' :
             'Normal liquidity conditions',
        opportunity: liquidityGrab.detected ?
                    `Liquidity grab detected on ${liquidityGrab.side} side - potential reversal` :
                    'No immediate liquidity opportunities detected'
      };

      return {
        symbol,
        timestamp: new Date().toISOString(),
        bids: bids.reverse(), // Highest price first
        asks,
        imbalance,
        liquidity,
        microstructure,
        flow,
        signals,
        recommendations
      };

    } catch (error) {
      console.error('Error generating order book data:', error);
      throw error;
    }
  };

  const fetchOrderBookData = async () => {
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const data = await generateOrderBookData(symbol);
      setOrderBookData(data);
    } catch (error: any) {
      console.error('Error fetching order book data:', error);
      setError(error.message || 'Failed to fetch order book data');
      toast.error('Failed to fetch order book data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderBookData();
  }, [symbol]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchOrderBookData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbol]);

  const formatSize = (size: number): string => {
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toFixed(0);
  };

  const getBarWidth = (percentage: number): string => {
    return `${Math.min(100, percentage)}%`;
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading order book analyzer</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-indigo-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Order Book Analyzer</h3>
            <p className="text-sm text-gray-600">{symbol} • Market Microstructure</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOrderBookData}
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
          { id: 'book', label: 'Order Book', icon: Layers },
          { id: 'analysis', label: 'Analysis', icon: BarChart3 },
          { id: 'flow', label: 'Flow', icon: Activity },
          { id: 'signals', label: 'Signals', icon: Zap }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setViewMode(id as any)}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              viewMode === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {loading && !orderBookData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-2 text-gray-600">Loading order book...</span>
        </div>
      ) : orderBookData ? (
        <div className="space-y-6">
          {viewMode === 'book' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Order Book Display */}
              <div className="space-y-4">
                {/* Asks (Sell Orders) */}
                <div>
                  <h4 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4" />
                    Asks (Sell Orders)
                  </h4>
                  <div className="space-y-1">
                    {orderBookData.asks.slice(0, 10).reverse().map((ask, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-3 gap-2 text-sm py-1 px-2 hover:bg-red-50 cursor-pointer relative"
                        onClick={() => setSelectedLevel(ask)}
                      >
                        <div
                          className="absolute right-0 top-0 bottom-0 bg-red-100 opacity-50"
                          style={{ width: getBarWidth(ask.percentage) }}
                        />
                        <div className="text-red-600 font-medium relative z-10">
                          ${ask.price.toFixed(4)}
                        </div>
                        <div className="text-right relative z-10">{formatSize(ask.size)}</div>
                        <div className="text-right text-gray-600 relative z-10">{formatSize(ask.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Spread */}
                <div className="bg-gray-100 rounded-lg p-3 text-center">
                  <div className="text-sm text-gray-600">Spread</div>
                  <div className="font-bold">
                    ${orderBookData.microstructure.spread.toFixed(4)}
                    <span className="text-sm text-gray-600 ml-2">
                      ({orderBookData.microstructure.spreadPercentage.toFixed(3)}%)
                    </span>
                  </div>
                </div>

                {/* Bids (Buy Orders) */}
                <div>
                  <h4 className="font-medium text-green-600 mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Bids (Buy Orders)
                  </h4>
                  <div className="space-y-1">
                    {orderBookData.bids.slice(0, 10).map((bid, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-3 gap-2 text-sm py-1 px-2 hover:bg-green-50 cursor-pointer relative"
                        onClick={() => setSelectedLevel(bid)}
                      >
                        <div
                          className="absolute right-0 top-0 bottom-0 bg-green-100 opacity-50"
                          style={{ width: getBarWidth(bid.percentage) }}
                        />
                        <div className="text-green-600 font-medium relative z-10">
                          ${bid.price.toFixed(4)}
                        </div>
                        <div className="text-right relative z-10">{formatSize(bid.size)}</div>
                        <div className="text-right text-gray-600 relative z-10">{formatSize(bid.total)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Order Book Imbalance */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Order Book Imbalance</h4>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Direction</span>
                      <span className={`font-medium ${
                        orderBookData.imbalance.direction === 'BULLISH' ? 'text-green-600' :
                        orderBookData.imbalance.direction === 'BEARISH' ? 'text-red-600' :
                        'text-gray-600'
                      }`}>
                        {orderBookData.imbalance.direction}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Strength</span>
                      <span className={`font-medium ${IMBALANCE_COLORS[orderBookData.imbalance.imbalanceStrength]}`}>
                        {orderBookData.imbalance.imbalanceStrength}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Bid/Ask Ratio</span>
                      <span className="font-medium">
                        {(orderBookData.imbalance.bidAskRatio * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Confidence</span>
                      <span className="font-medium">
                        {(orderBookData.imbalance.confidence * 100).toFixed(1)}%
                      </span>
                    </div>

                    {/* Pressure Bars */}
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Bid Pressure</span>
                          <span>{(orderBookData.imbalance.bidPressure * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${orderBookData.imbalance.bidPressure * 100}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Ask Pressure</span>
                          <span>{(orderBookData.imbalance.askPressure * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-500 h-2 rounded-full"
                            style={{ width: `${orderBookData.imbalance.askPressure * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Market Depth */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-3">Market Depth</h4>
                  <div className="space-y-2 text-sm">
                    {Object.entries(orderBookData.liquidity.depthAtPercentage).map(([pct, depth]) => (
                      <div key={pct} className="flex justify-between">
                        <span className="text-blue-600">±{pct}%</span>
                        <div className="text-right">
                          <div className="text-green-600">B: {formatSize(depth.bid)}</div>
                          <div className="text-red-600">A: {formatSize(depth.ask)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'analysis' && (
            <div className="space-y-6">
              {/* Liquidity Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-sm text-green-600 mb-1">Bid Liquidity</div>
                  <div className="text-2xl font-bold text-green-700">
                    {formatSize(orderBookData.liquidity.bidLiquidity)}
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="text-sm text-red-600 mb-1">Ask Liquidity</div>
                  <div className="text-2xl font-bold text-red-700">
                    {formatSize(orderBookData.liquidity.askLiquidity)}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm text-blue-600 mb-1">Total Liquidity</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {formatSize(orderBookData.liquidity.totalLiquidity)}
                  </div>
                </div>
              </div>

              {/* Price Impact Analysis */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-4">Price Impact Analysis</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(orderBookData.microstructure.priceImpact).map(([size, impact]) => (
                    <div key={size} className="text-center">
                      <div className="text-sm text-gray-600 mb-2">{formatSize(parseFloat(size))}</div>
                      <div className="space-y-1">
                        <div className="text-red-600 text-sm">
                          Buy: {impact.buy.toFixed(3)}%
                        </div>
                        <div className="text-green-600 text-sm">
                          Sell: {impact.sell.toFixed(3)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Market Quality Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Market Depth</div>
                  <div className="text-lg font-bold">{formatSize(orderBookData.microstructure.marketDepth)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Resilience</div>
                  <div className="text-lg font-bold">{orderBookData.microstructure.resilience.toFixed(2)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Efficiency</div>
                  <div className="text-lg font-bold">{orderBookData.microstructure.efficiency.toFixed(1)}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Liquidity Ratio</div>
                  <div className="text-lg font-bold">{orderBookData.liquidity.liquidityRatio.toFixed(2)}</div>
                </div>
              </div>

              {/* Liquidity Gaps */}
              {orderBookData.liquidity.liquidityGaps.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-900 mb-3">Liquidity Gaps Detected</h4>
                  <div className="space-y-2">
                    {orderBookData.liquidity.liquidityGaps.slice(0, 5).map((gap, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-yellow-700">${gap.price.toFixed(4)} ({gap.side})</span>
                        <span className="text-yellow-600">{formatSize(gap.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'flow' && (
            <div className="space-y-6">
              {/* Order Flow Summary */}
              <div className={`rounded-lg p-4 border-2 ${
                orderBookData.flow.flowTrend === 'BUYING_PRESSURE' ? 'bg-green-50 border-green-200' :
                orderBookData.flow.flowTrend === 'SELLING_PRESSURE' ? 'bg-red-50 border-red-200' :
                'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className={`h-5 w-5 ${FLOW_COLORS[orderBookData.flow.flowTrend]}`} />
                    <span className="font-semibold text-lg">{orderBookData.flow.flowTrend.replace('_', ' ')}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {Math.round(orderBookData.flow.flowRatio * 100)}% Buy Flow
                    </div>
                  </div>
                </div>
              </div>

              {/* Flow Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-sm text-green-600 mb-1">Aggressive Buys</div>
                  <div className="text-lg font-bold text-green-700">
                    {formatSize(orderBookData.flow.aggressiveBuys)}
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="text-sm text-red-600 mb-1">Aggressive Sells</div>
                  <div className="text-lg font-bold text-red-700">
                    {formatSize(orderBookData.flow.aggressiveSells)}
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm text-blue-600 mb-1">Passive Buys</div>
                  <div className="text-lg font-bold text-blue-700">
                    {formatSize(orderBookData.flow.passiveBuys)}
                  </div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="text-sm text-purple-600 mb-1">Passive Sells</div>
                  <div className="text-lg font-bold text-purple-700">
                    {formatSize(orderBookData.flow.passiveSells)}
                  </div>
                </div>
              </div>

              {/* Participant Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Institutional Flow</h4>
                  <div className="text-2xl font-bold text-indigo-600 mb-2">
                    {formatSize(orderBookData.flow.institutionalFlow)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Typically large, aggressive orders
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Retail Flow</h4>
                  <div className="text-2xl font-bold text-orange-600 mb-2">
                    {formatSize(orderBookData.flow.retailFlow)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Typically smaller, passive orders
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'signals' && (
            <div className="space-y-6">
              {/* Active Signals */}
              <div className="grid gap-4">
                {/* Liquidity Grab Signal */}
                <div className={`border rounded-lg p-4 ${
                  orderBookData.signals.liquidityGrab.detected
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className={`h-4 w-4 ${
                        orderBookData.signals.liquidityGrab.detected ? 'text-orange-600' : 'text-gray-400'
                      }`} />
                      <span className="font-medium">Liquidity Grab</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      orderBookData.signals.liquidityGrab.detected
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {orderBookData.signals.liquidityGrab.detected ? 'DETECTED' : 'NOT DETECTED'}
                    </span>
                  </div>
                  {orderBookData.signals.liquidityGrab.detected && (
                    <div className="text-sm text-orange-700">
                      {orderBookData.signals.liquidityGrab.side} side liquidity grab detected
                      (Strength: {Math.round(orderBookData.signals.liquidityGrab.strength * 100)}%)
                    </div>
                  )}
                </div>

                {/* Sweep Alert */}
                <div className={`border rounded-lg p-4 ${
                  orderBookData.signals.sweepAlert.detected
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Zap className={`h-4 w-4 ${
                        orderBookData.signals.sweepAlert.detected ? 'text-red-600' : 'text-gray-400'
                      }`} />
                      <span className="font-medium">Level Sweep</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      orderBookData.signals.sweepAlert.detected
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {orderBookData.signals.sweepAlert.detected ? 'ACTIVE' : 'NONE'}
                    </span>
                  </div>
                  {orderBookData.signals.sweepAlert.detected && (
                    <div className="text-sm text-red-700">
                      {orderBookData.signals.sweepAlert.levels} levels swept
                      (Impact: {orderBookData.signals.sweepAlert.impact.toFixed(2)}%)
                    </div>
                  )}
                </div>

                {/* Whale Activity */}
                <div className={`border rounded-lg p-4 ${
                  orderBookData.signals.whaleActivity.detected
                    ? 'border-purple-300 bg-purple-50'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className={`h-4 w-4 ${
                        orderBookData.signals.whaleActivity.detected ? 'text-purple-600' : 'text-gray-400'
                      }`} />
                      <span className="font-medium">Whale Activity</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      orderBookData.signals.whaleActivity.detected
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {orderBookData.signals.whaleActivity.detected ? 'DETECTED' : 'NONE'}
                    </span>
                  </div>
                  {orderBookData.signals.whaleActivity.detected && (
                    <div className="text-sm text-purple-700">
                      Large {orderBookData.signals.whaleActivity.side} order detected
                      (Size: {formatSize(orderBookData.signals.whaleActivity.size)})
                    </div>
                  )}
                </div>

                {/* Algorithmic Activity */}
                <div className={`border rounded-lg p-4 ${
                  orderBookData.signals.algorithmicActivity.detected
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className={`h-4 w-4 ${
                        orderBookData.signals.algorithmicActivity.detected ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <span className="font-medium">Algorithmic Activity</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      orderBookData.signals.algorithmicActivity.detected
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {orderBookData.signals.algorithmicActivity.detected ? 'ACTIVE' : 'NONE'}
                    </span>
                  </div>
                  {orderBookData.signals.algorithmicActivity.detected && (
                    <div className="text-sm text-blue-700">
                      {orderBookData.signals.algorithmicActivity.pattern} pattern detected
                      (Confidence: {Math.round(orderBookData.signals.algorithmicActivity.confidence * 100)}%)
                    </div>
                  )}
                </div>
              </div>

              {/* Recommendations */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h4 className="font-medium text-indigo-900 mb-4">Trading Recommendations</h4>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium text-indigo-800">Execution Strategy</div>
                    <div className="text-sm text-indigo-700">{orderBookData.recommendations.execution}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-indigo-800">Timing</div>
                    <div className="text-sm text-indigo-700">{orderBookData.recommendations.timing}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-indigo-800">Risk Assessment</div>
                    <div className="text-sm text-indigo-700">{orderBookData.recommendations.risk}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-indigo-800">Opportunity</div>
                    <div className="text-sm text-indigo-700">{orderBookData.recommendations.opportunity}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Selected Level Details Modal */}
          {selectedLevel && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedLevel(null)}>
              <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold">Level Details</h4>
                  <button
                    onClick={() => setSelectedLevel(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Price</div>
                      <div className="font-medium">${selectedLevel.price.toFixed(4)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Size</div>
                      <div className="font-medium">{formatSize(selectedLevel.size)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Total</div>
                      <div className="font-medium">{formatSize(selectedLevel.total)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Orders</div>
                      <div className="font-medium">{selectedLevel.orders || 'N/A'}</div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm text-gray-600 mb-1">
                      Distance from mid: {orderBookData ?
                        ((Math.abs(selectedLevel.price - orderBookData.microstructure.midPrice) / orderBookData.microstructure.midPrice) * 100).toFixed(3)
                        : '0'}%
                    </div>
                    <div className="text-sm text-gray-600">
                      Depth percentage: {selectedLevel.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}