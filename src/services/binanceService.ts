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

      // Cache the market data in Redis
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

      this.emit('ticker', marketData);

      // Publish to Redis for WebSocket clients
      await redisService.publish(`market:${message.s}`, {
        type: 'ticker',
        data: marketData
      });

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

      // Publish to Redis for WebSocket clients
      await redisService.publish(`kline:${message.s}:${message.k.i}`, {
        type: 'kline',
        data: klineData
      });
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