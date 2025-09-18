import { redisService } from './redisService';
import { binanceService } from './binanceService';
import { MarketData } from '../types';
import { SymbolConverter } from '../utils/symbolConverter';

interface MarketDataOptions {
  useCache?: boolean;
  fallbackToMongo?: boolean;
  maxAge?: number; // Maximum age in seconds
}

interface SymbolDataSnapshot {
  symbol: string;
  price: number;
  volume: number;
  change24h: number;
  high24h: number;
  low24h: number;
  lastUpdated: Date;
  source: 'redis' | 'api' | 'mongo';
}

export class MarketDataCacheService {
  private readonly DEFAULT_OPTIONS: MarketDataOptions = {
    useCache: true,
    fallbackToMongo: false,
    maxAge: 300 // 5 minutes
  };

  private localCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly LOCAL_CACHE_TTL = 30000; // 30 seconds for local memory cache

  // ===============================
  // MAIN DATA RETRIEVAL METHODS
  // ===============================

  async getMarketData(symbol: string, options: MarketDataOptions = {}): Promise<MarketData | null> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const normalizedSymbol = SymbolConverter.normalize(symbol);

    try {
      // Step 1: Try local memory cache first (fastest)
      if (opts.useCache) {
        const localData = this.getFromLocalCache(`market:${normalizedSymbol}`);
        if (localData) {
          return localData as MarketData;
        }
      }

      // Step 2: Try Redis cache
      if (opts.useCache) {
        const redisData = await redisService.getMarketData(normalizedSymbol);
        if (redisData && this.isDataFresh(redisData, opts.maxAge!)) {
          // Cache in local memory for faster subsequent access
          this.setLocalCache(`market:${normalizedSymbol}`, redisData, this.LOCAL_CACHE_TTL);
          return redisData;
        }
      }

      // Step 3: Fetch fresh data from Binance API
      const apiData = await this.fetchFreshMarketData(normalizedSymbol);
      if (apiData) {
        // Cache in both Redis and local memory
        await redisService.cacheMarketData(normalizedSymbol, apiData);
        this.setLocalCache(`market:${normalizedSymbol}`, apiData, this.LOCAL_CACHE_TTL);
        return apiData;
      }

      // Step 4: Fallback to MongoDB if enabled (not implemented yet, placeholder)
      if (opts.fallbackToMongo) {
        // TODO: Implement MongoDB fallback for historical data
        console.log(`MongoDB fallback not implemented for ${normalizedSymbol}`);
      }

      return null;
    } catch (error) {
      console.error(`Error getting market data for ${normalizedSymbol}:`, error);

      // Try to return stale data from Redis as last resort
      if (opts.useCache) {
        const staleData = await redisService.getMarketData(normalizedSymbol);
        if (staleData) {
          console.log(`Returning stale data for ${normalizedSymbol}`);
          return staleData;
        }
      }

      return null;
    }
  }

  async getMultipleMarketData(symbols: string[], options: MarketDataOptions = {}): Promise<Record<string, MarketData>> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const normalizedSymbols = symbols.map(s => SymbolConverter.normalize(s));
    const results: Record<string, MarketData> = {};

    // Process symbols in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < normalizedSymbols.length; i += batchSize) {
      const batch = normalizedSymbols.slice(i, i + batchSize);

      const batchPromises = batch.map(async (symbol) => {
        const data = await this.getMarketData(symbol, opts);
        if (data) {
          results[symbol] = data;
        }
      });

      await Promise.all(batchPromises);

      // Small delay between batches to respect rate limits
      if (i + batchSize < normalizedSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async getKlineData(
    symbol: string,
    interval: string,
    limit: number = 100,
    options: MarketDataOptions = {}
  ): Promise<any[] | null> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const normalizedSymbol = SymbolConverter.normalize(symbol);
    const cacheKey = `kline:${normalizedSymbol}:${interval}`;

    try {
      // Step 1: Try local memory cache first
      if (opts.useCache) {
        const localData = this.getFromLocalCache(cacheKey);
        if (localData && Array.isArray(localData) && localData.length >= limit) {
          return localData.slice(-limit);
        }
      }

      // Step 2: Try Redis cache
      if (opts.useCache) {
        const redisData = await redisService.getKlineData(normalizedSymbol, interval);
        if (redisData && redisData.length >= limit) {
          const result = redisData.slice(-limit);
          this.setLocalCache(cacheKey, redisData, this.getKlineCacheTime(interval));
          return result;
        }
      }

      // Step 3: Fetch from Binance API
      const apiData = await binanceService.getKlineData(normalizedSymbol, interval, limit);
      if (apiData) {
        // Cache the data
        await redisService.cacheKlineData(normalizedSymbol, interval, apiData);
        this.setLocalCache(cacheKey, apiData, this.getKlineCacheTime(interval));
        return apiData;
      }

      return null;
    } catch (error) {
      console.error(`Error getting kline data for ${normalizedSymbol}:`, error);

      // Try to return stale data as fallback
      if (opts.useCache) {
        const staleData = await redisService.getKlineData(normalizedSymbol, interval);
        if (staleData) {
          console.log(`Returning stale kline data for ${normalizedSymbol}:${interval}`);
          return staleData.slice(-limit);
        }
      }

      return null;
    }
  }

  async getOrderBook(
    symbol: string,
    limit: number = 100,
    options: MarketDataOptions = {}
  ): Promise<any | null> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const normalizedSymbol = SymbolConverter.normalize(symbol);
    const cacheKey = `orderbook:${normalizedSymbol}`;

    try {
      // Step 1: Try local memory cache first
      if (opts.useCache) {
        const localData = this.getFromLocalCache(cacheKey);
        if (localData) {
          return localData;
        }
      }

      // Step 2: Try Redis cache
      if (opts.useCache) {
        const redisData = await redisService.getOrderBook(normalizedSymbol);
        if (redisData) {
          this.setLocalCache(cacheKey, redisData, 2000); // 2 seconds for order book
          return redisData;
        }
      }

      // Step 3: Fetch from Binance API
      const apiData = await binanceService.getOrderBook(normalizedSymbol, limit);
      if (apiData) {
        // Cache the data
        await redisService.cacheOrderBook(normalizedSymbol, apiData);
        this.setLocalCache(cacheKey, apiData, 2000);
        return apiData;
      }

      return null;
    } catch (error) {
      console.error(`Error getting order book for ${normalizedSymbol}:`, error);

      // Try to return stale data as fallback
      if (opts.useCache) {
        const staleData = await redisService.getOrderBook(normalizedSymbol);
        if (staleData) {
          console.log(`Returning stale order book for ${normalizedSymbol}`);
          return staleData;
        }
      }

      return null;
    }
  }

  // ===============================
  // SNAPSHOT AND BULK OPERATIONS
  // ===============================

  async createMarketSnapshot(symbols: string[]): Promise<SymbolDataSnapshot[]> {
    const normalizedSymbols = symbols.map(s => SymbolConverter.normalize(s));
    const snapshots: SymbolDataSnapshot[] = [];

    for (const symbol of normalizedSymbols) {
      try {
        const marketData = await this.getMarketData(symbol, { useCache: true, maxAge: 60 });

        if (marketData) {
          snapshots.push({
            symbol,
            price: marketData.price,
            volume: marketData.volume,
            change24h: marketData.change24h,
            high24h: marketData.high24h,
            low24h: marketData.low24h,
            lastUpdated: new Date(marketData.timestamp),
            source: 'redis' // Could be enhanced to track actual source
          });
        }
      } catch (error) {
        console.error(`Error creating snapshot for ${symbol}:`, error);
      }
    }

    return snapshots;
  }

  async warmCache(symbols: string[]): Promise<void> {
    console.log(`Warming cache for ${symbols.length} symbols...`);

    const normalizedSymbols = symbols.map(s => SymbolConverter.normalize(s));

    // Pre-fetch market data for all symbols
    await this.getMultipleMarketData(normalizedSymbols, { useCache: false });

    // Pre-fetch kline data for common intervals
    const intervals = ['1m', '5m', '15m', '1h'];
    for (const interval of intervals) {
      const promises = normalizedSymbols.map(symbol =>
        this.getKlineData(symbol, interval, 100, { useCache: false }).catch(err => {
          console.error(`Error warming kline cache for ${symbol}:${interval}:`, err);
        })
      );

      await Promise.all(promises);

      // Small delay between intervals
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('Cache warming completed');
  }

  // ===============================
  // UTILITY METHODS
  // ===============================

  private async fetchFreshMarketData(symbol: string): Promise<MarketData | null> {
    try {
      const symbolInfo = await binanceService.getSymbolInfo(symbol);

      return {
        symbol,
        price: parseFloat(symbolInfo.lastPrice),
        volume: parseFloat(symbolInfo.volume),
        change24h: parseFloat(symbolInfo.priceChangePercent),
        high24h: parseFloat(symbolInfo.highPrice),
        low24h: parseFloat(symbolInfo.lowPrice),
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error fetching fresh market data for ${symbol}:`, error);
      return null;
    }
  }

  private isDataFresh(data: any, maxAge: number): boolean {
    if (!data || !data.timestamp) return false;

    const dataAge = (Date.now() - new Date(data.timestamp).getTime()) / 1000;
    return dataAge <= maxAge;
  }

  private getFromLocalCache(key: string): any | null {
    const cached = this.localCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > cached.ttl) {
      this.localCache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setLocalCache(key: string, data: any, ttl: number): void {
    // Prevent memory leaks by limiting cache size
    if (this.localCache.size > 1000) {
      const firstKey = this.localCache.keys().next().value;
      this.localCache.delete(firstKey);
    }

    this.localCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private getKlineCacheTime(interval: string): number {
    const intervalMap: Record<string, number> = {
      '1m': 10000,  // 10 seconds
      '3m': 20000,  // 20 seconds
      '5m': 30000,  // 30 seconds
      '15m': 60000, // 1 minute
      '30m': 120000, // 2 minutes
      '1h': 300000,  // 5 minutes
      '2h': 600000,  // 10 minutes
      '4h': 1200000, // 20 minutes
      '6h': 1800000, // 30 minutes
      '12h': 3600000, // 1 hour
      '1d': 7200000   // 2 hours
    };
    return intervalMap[interval] || 30000; // Default 30 seconds
  }

  // ===============================
  // CACHE MANAGEMENT
  // ===============================

  async clearSymbolCache(symbol: string): Promise<void> {
    const normalizedSymbol = SymbolConverter.normalize(symbol);

    // Clear from local cache
    for (const key of this.localCache.keys()) {
      if (key.includes(normalizedSymbol)) {
        this.localCache.delete(key);
      }
    }

    // Clear from Redis
    await redisService.flushByPattern(`*${normalizedSymbol}*`);

    console.log(`Cache cleared for symbol ${normalizedSymbol}`);
  }

  async getCacheStats(): Promise<any> {
    try {
      return {
        localCacheSize: this.localCache.size,
        redisStats: await redisService.getKeysByPattern('market:*').then(keys => keys.length),
        redisHealth: await redisService.checkRateLimit('health', 1, 1)
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return null;
    }
  }

  clearLocalCache(): void {
    this.localCache.clear();
    console.log('Local cache cleared');
  }

  // ===============================
  // REAL-TIME DATA SUBSCRIPTIONS
  // ===============================

  async subscribeToRealTimeUpdates(symbols: string[], callback: (data: MarketData) => void): Promise<void> {
    const normalizedSymbols = symbols.map(s => SymbolConverter.normalize(s));

    for (const symbol of normalizedSymbols) {
      await redisService.subscribe(`market:${symbol}`, (message) => {
        if (message.type === 'ticker' && message.data) {
          callback(message.data);
        }
      });
    }

    // Also subscribe to Binance WebSocket if not already connected
    const subscribedSymbols = binanceService.getSubscribedSymbols();
    const newSymbols = normalizedSymbols.filter(symbol => !subscribedSymbols.includes(symbol));

    if (newSymbols.length > 0) {
      binanceService.subscribeToTicker(newSymbols);
    }
  }
}

export const marketDataCacheService = new MarketDataCacheService();