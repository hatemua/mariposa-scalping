import { EventEmitter } from 'events';
import { binanceService } from './binanceService';
import { redisService } from './redisService';
import { SymbolConverter } from '../utils/symbolConverter';

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
  percentage: number;
  orders?: number;
}

export interface OrderBookImbalance {
  bidAskRatio: number;
  bidPressure: number;
  askPressure: number;
  imbalanceStrength: 'WEAK' | 'MODERATE' | 'STRONG' | 'EXTREME';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
}

export interface LiquidityAnalysis {
  bidLiquidity: number;
  askLiquidity: number;
  totalLiquidity: number;
  liquidityRatio: number;
  depthAtPercentage: { [key: string]: { bid: number; ask: number } };
  liquidityGaps: { price: number; side: 'BID' | 'ASK'; size: number }[];
}

export interface MarketMicrostructure {
  spread: number;
  spreadPercentage: number;
  midPrice: number;
  weightedMidPrice: number;
  priceImpact: { [size: string]: { buy: number; sell: number } };
  marketDepth: number;
  resilience: number;
  efficiency: number;
}

export interface FlowAnalysis {
  aggressiveBuys: number;
  aggressiveSells: number;
  passiveBuys: number;
  passiveSells: number;
  flowRatio: number;
  institutionalFlow: number;
  retailFlow: number;
  flowTrend: 'BUYING_PRESSURE' | 'SELLING_PRESSURE' | 'BALANCED';
}

export interface OrderBookData {
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

interface TradeData {
  symbol: string;
  price: number;
  quantity: number;
  timestamp: Date;
  tradeId: number;
  buyerMaker: boolean;
  isBuyerMaker: boolean;
}

export class OrderBookAnalysisService extends EventEmitter {
  private orderBooks = new Map<string, any>();
  private recentTrades = new Map<string, TradeData[]>();
  private analysisCache = new Map<string, OrderBookData>();
  private subscribedSymbols = new Set<string>();

  constructor() {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for order book updates from BinanceService
    binanceService.on('orderBook', (data) => {
      this.updateOrderBook(data);
    });

    // Listen for trade updates from BinanceService
    binanceService.on('trade', (data) => {
      this.updateTrades(data);
    });
  }

  private updateOrderBook(data: any) {
    this.orderBooks.set(data.symbol, {
      ...data,
      lastUpdate: new Date()
    });

    // Generate analysis when order book is updated
    this.generateAnalysis(data.symbol);
  }

  private updateTrades(data: TradeData) {
    const symbol = data.symbol;
    if (!this.recentTrades.has(symbol)) {
      this.recentTrades.set(symbol, []);
    }

    const trades = this.recentTrades.get(symbol)!;
    trades.push(data);

    // Keep only last 100 trades for analysis
    if (trades.length > 100) {
      trades.splice(0, trades.length - 100);
    }

    this.recentTrades.set(symbol, trades);
  }

  async subscribeToSymbol(symbol: string, levels: number = 20) {
    const binanceSymbol = SymbolConverter.toBinanceFormat(symbol);

    if (!this.subscribedSymbols.has(binanceSymbol)) {
      // Subscribe to order book and trades for this symbol
      binanceService.subscribeToOrderBook([symbol], levels);
      binanceService.subscribeToTrades([symbol]);
      this.subscribedSymbols.add(binanceSymbol);
    }
  }

  async getOrderBookAnalysis(symbol: string, levels: number = 20): Promise<OrderBookData> {
    const binanceSymbol = SymbolConverter.toBinanceFormat(symbol);

    // Ensure we're subscribed to this symbol
    await this.subscribeToSymbol(symbol, levels);

    // Check if we have cached analysis
    const cached = this.analysisCache.get(binanceSymbol);
    if (cached && (Date.now() - new Date(cached.timestamp).getTime()) < 2000) {
      return cached;
    }

    // Get the latest order book from REST API if WebSocket data isn't available yet
    let orderBookRaw = this.orderBooks.get(binanceSymbol);
    if (!orderBookRaw) {
      try {
        orderBookRaw = await binanceService.getOrderBook(symbol, levels);
      } catch (error) {
        console.error(`Error fetching order book for ${symbol}:`, error);
        throw error;
      }
    }

    return this.generateAnalysis(binanceSymbol, orderBookRaw);
  }

  private async generateAnalysis(symbol: string, orderBookRaw?: any): Promise<OrderBookData> {
    const orderBook = orderBookRaw || this.orderBooks.get(symbol);
    if (!orderBook) {
      throw new Error(`No order book data available for ${symbol}`);
    }

    // Process bids and asks into our format
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    let bidTotal = 0;
    let askTotal = 0;

    // Process bids (buy orders)
    if (orderBook.bids) {
      for (const [priceStr, quantityStr] of orderBook.bids) {
        const price = parseFloat(priceStr);
        const size = parseFloat(quantityStr);
        bidTotal += size;

        bids.push({
          price,
          size,
          total: bidTotal,
          percentage: 0, // Will be calculated later
          orders: Math.floor(size / (50 + Math.random() * 100)) // Estimate
        });
      }
    }

    // Process asks (sell orders)
    if (orderBook.asks) {
      for (const [priceStr, quantityStr] of orderBook.asks) {
        const price = parseFloat(priceStr);
        const size = parseFloat(quantityStr);
        askTotal += size;

        asks.push({
          price,
          size,
          total: askTotal,
          percentage: 0, // Will be calculated later
          orders: Math.floor(size / (50 + Math.random() * 100)) // Estimate
        });
      }
    }

    // Calculate percentages
    const maxBidTotal = bids[bids.length - 1]?.total || 0;
    const maxAskTotal = asks[asks.length - 1]?.total || 0;

    bids.forEach(bid => {
      bid.percentage = maxBidTotal > 0 ? (bid.total / maxBidTotal) * 100 : 0;
    });

    asks.forEach(ask => {
      ask.percentage = maxAskTotal > 0 ? (ask.total / maxAskTotal) * 100 : 0;
    });

    // Calculate order book imbalance
    const topBids = bids.slice(0, 10);
    const topAsks = asks.slice(0, 10);
    const bidSum = topBids.reduce((sum, bid) => sum + bid.size, 0);
    const askSum = topAsks.reduce((sum, ask) => sum + ask.size, 0);
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
    const liquidityRatio = askLiquidity > 0 ? bidLiquidity / askLiquidity : 0;

    // Calculate depth at different percentages
    const midPrice = bids.length > 0 && asks.length > 0 ? (bids[0].price + asks[0].price) / 2 : 0;
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
    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const spreadValue = bestAsk - bestBid;
    const spreadPercentage = midPrice > 0 ? (spreadValue / midPrice) * 100 : 0;

    const weightedBidPrice = topBids.length > 0 ?
      topBids.reduce((sum, bid) => sum + (bid.price * bid.size), 0) / topBids.reduce((sum, bid) => sum + bid.size, 0) : 0;
    const weightedAskPrice = topAsks.length > 0 ?
      topAsks.reduce((sum, ask) => sum + (ask.price * ask.size), 0) / topAsks.reduce((sum, ask) => sum + ask.size, 0) : 0;
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
      const avgBuyPrice = orderSize > 0 ? totalCost / orderSize : 0;
      const buyImpact = midPrice > 0 ? ((avgBuyPrice - midPrice) / midPrice) * 100 : 0;

      // Calculate sell impact (eating through bids)
      remainingSize = orderSize;
      totalCost = 0;
      for (const bid of bids) {
        if (remainingSize <= 0) break;
        const sizeToTake = Math.min(remainingSize, bid.size);
        totalCost += sizeToTake * bid.price;
        remainingSize -= sizeToTake;
      }
      const avgSellPrice = orderSize > 0 ? totalCost / orderSize : 0;
      const sellImpact = midPrice > 0 ? ((midPrice - avgSellPrice) / midPrice) * 100 : 0;

      priceImpact[size] = { buy: buyImpact, sell: sellImpact };
    });

    const marketDepth = Math.min(bidLiquidity, askLiquidity);
    const resilience = priceImpact['10000'] ? 1 / Math.max(priceImpact['10000'].buy, priceImpact['10000'].sell, 0.001) : 0;
    const efficiency = spreadPercentage > 0 ? 1 / spreadPercentage : 0;

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

    // Analyze recent trades for flow analysis
    const recentTrades = this.recentTrades.get(symbol) || [];
    const now = new Date();
    const last5Minutes = recentTrades.filter(trade =>
      (now.getTime() - trade.timestamp.getTime()) < 5 * 60 * 1000
    );

    const aggressiveBuys = last5Minutes.filter(t => !t.buyerMaker).reduce((sum, t) => sum + (t.price * t.quantity), 0);
    const aggressiveSells = last5Minutes.filter(t => t.buyerMaker).reduce((sum, t) => sum + (t.price * t.quantity), 0);
    const passiveBuys = last5Minutes.filter(t => t.buyerMaker).reduce((sum, t) => sum + (t.price * t.quantity), 0) * 0.3; // Estimate
    const passiveSells = last5Minutes.filter(t => !t.buyerMaker).reduce((sum, t) => sum + (t.price * t.quantity), 0) * 0.3; // Estimate

    const totalBuyFlow = aggressiveBuys + passiveBuys;
    const totalSellFlow = aggressiveSells + passiveSells;
    const flowRatio = (totalBuyFlow + totalSellFlow) > 0 ? totalBuyFlow / (totalBuyFlow + totalSellFlow) : 0.5;

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

    // Detect trading signals based on real data
    const liquidityGrab = this.detectLiquidityGrab(bids, asks, recentTrades);
    const sweepAlert = this.detectSweepAlert(bids, asks, recentTrades);
    const whaleActivity = this.detectWhaleActivity(recentTrades);
    const algorithmicActivity = this.detectAlgorithmicActivity(recentTrades);

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

    const analysis: OrderBookData = {
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

    // Cache the analysis
    this.analysisCache.set(symbol, analysis);

    // Emit the analysis
    this.emit('analysis', analysis);

    return analysis;
  }

  private detectLiquidityGrab(bids: OrderBookLevel[], asks: OrderBookLevel[], trades: TradeData[]) {
    // Look for sudden removal of large orders or price sweeps
    const recentTrades = trades.slice(-10);
    const hasLargeTrade = recentTrades.some(trade => trade.quantity * trade.price > 50000);

    return {
      detected: hasLargeTrade,
      side: hasLargeTrade && recentTrades[recentTrades.length - 1]?.buyerMaker ? 'ASK' as const : 'BID' as const,
      strength: hasLargeTrade ? 0.7 : 0
    };
  }

  private detectSweepAlert(bids: OrderBookLevel[], asks: OrderBookLevel[], trades: TradeData[]) {
    // Look for multiple levels being hit in quick succession
    const recentTrades = trades.slice(-5);
    const priceRange = recentTrades.length > 1 ?
      Math.max(...recentTrades.map(t => t.price)) - Math.min(...recentTrades.map(t => t.price)) : 0;

    const sweepDetected = recentTrades.length >= 3 && priceRange > 0;

    return {
      detected: sweepDetected,
      levels: sweepDetected ? recentTrades.length : 0,
      impact: sweepDetected ? (priceRange / recentTrades[0]?.price || 1) * 100 : 0
    };
  }

  private detectWhaleActivity(trades: TradeData[]) {
    // Look for unusually large individual trades
    const recentTrades = trades.slice(-20);
    const avgTradeSize = recentTrades.length > 0 ?
      recentTrades.reduce((sum, t) => sum + (t.quantity * t.price), 0) / recentTrades.length : 0;

    const largeTrade = recentTrades.find(trade =>
      (trade.quantity * trade.price) > avgTradeSize * 5 && (trade.quantity * trade.price) > 10000
    );

    return {
      detected: !!largeTrade,
      size: largeTrade ? largeTrade.quantity * largeTrade.price : 0,
      side: largeTrade ? (largeTrade.buyerMaker ? 'SELL' as const : 'BUY' as const) : null
    };
  }

  private detectAlgorithmicActivity(trades: TradeData[]) {
    // Look for patterns in trade timing and sizing that suggest algorithmic trading
    const recentTrades = trades.slice(-10);

    if (recentTrades.length < 5) {
      return { detected: false, pattern: 'NONE', confidence: 0 };
    }

    // Check for regular time intervals (TWAP-like behavior)
    const intervals = [];
    for (let i = 1; i < recentTrades.length; i++) {
      intervals.push(recentTrades[i].timestamp.getTime() - recentTrades[i-1].timestamp.getTime());
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const regularTiming = intervals.every(interval => Math.abs(interval - avgInterval) < avgInterval * 0.3);

    // Check for similar trade sizes (VWAP-like behavior)
    const sizes = recentTrades.map(t => t.quantity);
    const avgSize = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
    const regularSizing = sizes.every(size => Math.abs(size - avgSize) < avgSize * 0.2);

    if (regularTiming && regularSizing) {
      return { detected: true, pattern: 'TWAP', confidence: 0.8 };
    } else if (regularTiming) {
      return { detected: true, pattern: 'VWAP', confidence: 0.6 };
    } else if (sizes.some(size => size < avgSize * 0.1)) {
      return { detected: true, pattern: 'ICEBERG', confidence: 0.7 };
    }

    return { detected: false, pattern: 'NONE', confidence: 0 };
  }
}

export const orderBookAnalysisService = new OrderBookAnalysisService();