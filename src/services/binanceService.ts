import WebSocket from 'ws';
import axios from 'axios';
import { EventEmitter } from 'events';
import { MarketData } from '../types';
import { config } from '../config/environment';
import { redisService } from './redisService';
import { SymbolConverter } from '../utils/symbolConverter';

export class BinanceService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private subscribedSymbols = new Set<string>();
  private baseURL = 'https://api.binance.com/api/v3';
  private wsURL = 'wss://stream.binance.com:9443/ws';

  constructor() {
    super();
    // Note: initializeCommonSymbols() moved to start() method
    // to prevent race conditions with Redis initialization
  }

  async start(): Promise<void> {
    try {
      // Wait for Redis to be ready before starting WebSocket connections
      await this.waitForRedisReady();

      // Now initialize common symbols and start WebSocket connections
      this.initializeCommonSymbols();

      console.log('✅ BinanceService started successfully with Redis integration');
    } catch (error) {
      console.error('❌ Failed to start BinanceService:', error);
      throw error;
    }
  }

  private async waitForRedisReady(timeoutMs: number = 30000): Promise<void> {
    const { redis } = await import('../config/redis');
    const startTime = Date.now();

    while (!redis.areAllClientsReady()) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Redis clients not ready within ${timeoutMs}ms timeout for BinanceService. ` +
          `Status: Client=${redis.isClientReady()}, Publisher=${redis.isPublisherReady()}, Subscriber=${redis.isSubscriberReady()}`);
      }

      console.log('⏳ BinanceService waiting for Redis clients to be ready...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('✅ Redis clients are ready for BinanceService');
  }

  private initializeCommonSymbols() {
    // Subscribe to most common trading pairs immediately to ensure volume data
    const commonSymbols = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
      'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
      'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
    ];

    console.log('🚀 Initializing ticker subscriptions for common symbols:', commonSymbols);
    this.subscribeToTicker(commonSymbols);
  }

  async getSymbolInfo(symbol: string) {
    const binanceSymbol = SymbolConverter.toBinanceFormat(symbol);

    try {
      // Try to get from Redis cache first
      const cachedData = await redisService.getTicker(binanceSymbol);
      if (cachedData) {
        return cachedData;
      }

      // If not in cache, fetch from Binance API
      const response = await axios.get(`${this.baseURL}/ticker/24hr`, {
        params: { symbol: binanceSymbol }
      });

      // Cache the result in Redis
      await redisService.cacheTicker(binanceSymbol, response.data);

      return response.data;
    } catch (error) {
      console.error(`Error fetching symbol info for ${symbol}:`, error);
      throw error;
    }
  }

  async getKlineData(symbol: string, interval: string, limit = 500) {
    const binanceSymbol = SymbolConverter.toBinanceFormat(symbol);

    try {
      // Try to get from Redis cache first
      const cachedData = await redisService.getKlineData(binanceSymbol, interval);
      if (cachedData && cachedData.length >= limit) {
        return cachedData.slice(-limit); // Return the requested amount
      }

      // If not in cache or insufficient data, fetch from Binance API
      const response = await axios.get(`${this.baseURL}/klines`, {
        params: {
          symbol: binanceSymbol,
          interval,
          limit
        }
      });

      // Cache the result in Redis
      await redisService.cacheKlineData(binanceSymbol, interval, response.data);

      return response.data;
    } catch (error) {
      console.error(`Error fetching kline data for ${symbol}:`, error);
      throw error;
    }
  }

  async getOrderBook(symbol: string, limit = 100) {
    const binanceSymbol = SymbolConverter.toBinanceFormat(symbol);

    try {
      // Try to get from Redis cache first
      const cachedData = await redisService.getOrderBook(binanceSymbol);
      if (cachedData) {
        return cachedData;
      }

      // If not in cache, fetch from Binance API
      const response = await axios.get(`${this.baseURL}/depth`, {
        params: {
          symbol: binanceSymbol,
          limit
        }
      });

      // Cache the result in Redis
      await redisService.cacheOrderBook(binanceSymbol, response.data);

      return response.data;
    } catch (error) {
      console.error(`Error fetching order book for ${symbol}:`, error);
      throw error;
    }
  }

  subscribeToTicker(symbols: string[]) {
    const binanceSymbols = symbols.map(symbol => SymbolConverter.toBinanceFormat(symbol));
    const streams = binanceSymbols.map(symbol =>
      `${symbol.toLowerCase()}@ticker`
    ).join('/');

    this.connectWebSocket(streams);
    binanceSymbols.forEach(symbol => this.subscribedSymbols.add(symbol));
  }

  subscribeToKline(symbols: string[], interval: string) {
    const binanceSymbols = symbols.map(symbol => SymbolConverter.toBinanceFormat(symbol));
    const streams = binanceSymbols.map(symbol =>
      `${symbol.toLowerCase()}@kline_${interval}`
    ).join('/');

    this.connectWebSocket(streams);
    binanceSymbols.forEach(symbol => this.subscribedSymbols.add(symbol));
  }

  subscribeToOrderBook(symbols: string[], levels: number = 20) {
    const binanceSymbols = symbols.map(symbol => SymbolConverter.toBinanceFormat(symbol));
    const streams = binanceSymbols.map(symbol =>
      `${symbol.toLowerCase()}@depth${levels}`
    ).join('/');

    this.connectWebSocket(streams);
    binanceSymbols.forEach(symbol => this.subscribedSymbols.add(symbol));
  }

  subscribeToTrades(symbols: string[]) {
    const binanceSymbols = symbols.map(symbol => SymbolConverter.toBinanceFormat(symbol));
    const streams = binanceSymbols.map(symbol =>
      `${symbol.toLowerCase()}@trade`
    ).join('/');

    this.connectWebSocket(streams);
    binanceSymbols.forEach(symbol => this.subscribedSymbols.add(symbol));
  }

  private connectWebSocket(streams: string) {
    const url = `${this.wsURL}/${streams}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('Binance WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('Binance WebSocket disconnected');
      this.emit('disconnected');
      this.handleReconnect(streams);
    });

    this.ws.on('error', (error) => {
      console.error('Binance WebSocket error:', error);
      this.emit('error', error);
    });
  }

  private async handleMessage(message: any) {
    try {
      if (message.e === '24hrTicker') {
        const marketData: MarketData = {
          symbol: message.s,
          price: parseFloat(message.c),
          volume: parseFloat(message.v),
          change24h: parseFloat(message.P),
          high24h: parseFloat(message.h),
          low24h: parseFloat(message.l),
          timestamp: new Date(message.E)
        };

        // Cache the market data in Redis with error resilience
        // Redis operations now have built-in connection validation
        try {
          await redisService.cacheMarketData(message.s, marketData);
          await redisService.cacheTicker(message.s, {
            lastPrice: message.c,
            volume: message.v,
            priceChangePercent: message.P,
            highPrice: message.h,
            lowPrice: message.l,
            openPrice: message.o,
            closeTime: message.E,
            count: message.n
          });
        } catch (redisError) {
          // Redis errors are already logged by RedisService, just continue processing
          console.debug(`Redis caching failed for ${message.s}, continuing with event emission`);
        }

        // Always emit the ticker event even if Redis fails
        this.emit('ticker', marketData);

        // Publish to Redis for WebSocket clients (with error handling)
        try {
          await redisService.publish(`market:${message.s}`, {
            type: 'ticker',
            data: marketData
          });
        } catch (publishError) {
          console.debug(`Redis publish failed for market:${message.s}, continuing processing`);
        }

      } else if (message.e === 'kline') {
      const klineData = {
        symbol: message.s,
        interval: message.k.i,
        openTime: message.k.t,
        closeTime: message.k.T,
        open: parseFloat(message.k.o),
        high: parseFloat(message.k.h),
        low: parseFloat(message.k.l),
        close: parseFloat(message.k.c),
        volume: parseFloat(message.k.v),
        trades: message.k.n,
        isFinal: message.k.x
      };

      // Only cache finalized klines to avoid overwriting
      if (klineData.isFinal) {
        try {
          // Get existing kline data and update it
          const existingData = await redisService.getKlineData(message.s, message.k.i) || [];

          // Remove the last incomplete kline if it exists and add the new complete one
          const filteredData = existingData.filter((k: any) => k[0] !== message.k.t);
          filteredData.push([
            message.k.t, // Open time
            message.k.o, // Open
            message.k.h, // High
            message.k.l, // Low
            message.k.c, // Close
            message.k.v, // Volume
            message.k.T, // Close time
            message.k.q, // Quote asset volume
            message.k.n, // Number of trades
            message.k.V, // Taker buy base asset volume
            message.k.Q, // Taker buy quote asset volume
            "0"          // Unused field
          ]);

          // Keep only the last 1000 klines to prevent memory issues
          const trimmedData = filteredData.slice(-1000);
          await redisService.cacheKlineData(message.s, message.k.i, trimmedData);
        } catch (error) {
          console.error(`Error caching kline data:`, error);
        }
      }

      this.emit('kline', klineData);

      // Publish to Redis for WebSocket clients (with error handling)
      try {
        await redisService.publish(`kline:${message.s}:${message.k.i}`, {
          type: 'kline',
          data: klineData
        });
      } catch (publishError) {
        console.debug(`Redis publish failed for kline:${message.s}:${message.k.i}, continuing processing`);
      }

    } else if (message.e === 'depthUpdate') {
      const orderBookData = {
        symbol: message.s,
        updateId: message.u,
        bids: message.b.map((bid: string[]) => ({
          price: parseFloat(bid[0]),
          quantity: parseFloat(bid[1])
        })),
        asks: message.a.map((ask: string[]) => ({
          price: parseFloat(ask[0]),
          quantity: parseFloat(ask[1])
        })),
        timestamp: new Date(message.E)
      };

      // Cache the order book update in Redis (with error handling)
      try {
        await redisService.cacheOrderBook(message.s, orderBookData);
      } catch (redisError) {
        console.debug(`Redis caching failed for orderbook ${message.s}, continuing with event emission`);
      }

      this.emit('orderBook', orderBookData);

      // Publish to Redis for WebSocket clients (with error handling)
      try {
        await redisService.publish(`orderbook:${message.s}`, {
          type: 'orderBook',
          data: orderBookData
        });
      } catch (publishError) {
        console.debug(`Redis publish failed for orderbook:${message.s}, continuing processing`);
      }

    } else if (message.e === 'trade') {
      const tradeData = {
        symbol: message.s,
        price: parseFloat(message.p),
        quantity: parseFloat(message.q),
        timestamp: new Date(message.T),
        tradeId: message.t,
        buyerMaker: message.m,
        isBuyerMaker: message.m
      };

      this.emit('trade', tradeData);

      // Publish to Redis for WebSocket clients (with error handling)
      try {
        await redisService.publish(`trades:${message.s}`, {
          type: 'trade',
          data: tradeData
        });
      } catch (publishError) {
        console.debug(`Redis publish failed for trades:${message.s}, continuing processing`);
      }
    }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      // Continue processing - don't crash the WebSocket connection
    }
  }

  private handleReconnect(streams: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connectWebSocket(streams);
      }, Math.pow(2, this.reconnectAttempts) * 1000);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  // Add common convenience methods with symbol conversion
  async get24hrTicker(symbol: string) {
    return this.getSymbolInfo(symbol);
  }

  async getKlines(symbol: string, interval: string, limit = 500) {
    return this.getKlineData(symbol, interval, limit);
  }

  async getMarketData(symbol: string) {
    const symbolInfo = await this.getSymbolInfo(symbol);
    return {
      symbol: SymbolConverter.normalize(symbol),
      price: symbolInfo.lastPrice,
      volume: symbolInfo.volume,
      change24h: symbolInfo.priceChangePercent,
      high24h: symbolInfo.highPrice,
      low24h: symbolInfo.lowPrice,
      timestamp: new Date()
    };
  }

  async getExchangeInfo() {
    try {
      const response = await axios.get(`${this.baseURL}/exchangeInfo`);
      return response.data;
    } catch (error) {
      console.error('Error fetching exchange info:', error);
      throw error;
    }
  }
}

export const binanceService = new BinanceService();