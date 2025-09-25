import { redis } from '../config/redis';
import { MarketData, ConsolidatedAnalysis } from '../types';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  nx?: boolean; // Only set if key doesn't exist
}

interface QueueItem {
  id: string;
  data: any;
  timestamp: number;
  priority?: number;
}

export class RedisService {
  private readonly PREFIXES = {
    MARKET_DATA: 'market:',
    TICKER: 'ticker:',
    KLINE: 'kline:',
    ORDER_BOOK: 'orderbook:',
    AI_ANALYSIS: 'analysis:',
    TRADE_SIGNAL: 'signal:',
    USER_SESSION: 'session:',
    AGENT_PERFORMANCE: 'perf:',
    RATE_LIMIT: 'ratelimit:',
    JOB_QUEUE: 'queue:',
    WEBSOCKET_SUB: 'ws:sub:',
    ACTIVE_TRADES: 'trades:active:',
    CACHE: 'cache:'
  };

  // ===============================
  // GENERAL CACHE OPERATIONS
  // ===============================

  async get(key: string): Promise<any> {
    try {
      const client = redis.getClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, options: CacheOptions | number = {}): Promise<boolean> {
    try {
      const client = redis.getClient();
      const serialized = JSON.stringify(value);

      // Handle legacy number TTL or new CacheOptions
      const opts = typeof options === 'number' ? { ttl: options } : options;

      if (opts.ttl) {
        if (opts.nx) {
          const result = await client.set(key, serialized, 'EX', opts.ttl, 'NX');
          return result === 'OK';
        } else {
          await client.setex(key, opts.ttl, serialized);
          return true;
        }
      } else {
        if (opts.nx) {
          const result = await client.set(key, serialized, 'NX');
          return result === 'OK';
        } else {
          await client.set(key, serialized);
          return true;
        }
      }
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const client = redis.getClient();
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      console.error(`Redis DELETE error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = redis.getClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const client = redis.getClient();
      const result = await client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      console.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  // ===============================
  // MARKET DATA CACHING
  // ===============================

  async cacheMarketData(symbol: string, marketData: MarketData): Promise<boolean> {
    const key = `${this.PREFIXES.MARKET_DATA}${symbol}`;
    return this.set(key, marketData, { ttl: 5 }); // 5 seconds TTL for real-time data
  }

  async getMarketData(symbol: string): Promise<MarketData | null> {
    const key = `${this.PREFIXES.MARKET_DATA}${symbol}`;
    return this.get(key);
  }

  async cacheTicker(symbol: string, tickerData: any): Promise<boolean> {
    const key = `${this.PREFIXES.TICKER}${symbol}`;
    return this.set(key, tickerData, { ttl: 2 }); // 2 seconds TTL for ticker
  }

  async getTicker(symbol: string): Promise<any> {
    const key = `${this.PREFIXES.TICKER}${symbol}`;
    return this.get(key);
  }

  async cacheKlineData(symbol: string, interval: string, klineData: any[]): Promise<boolean> {
    const key = `${this.PREFIXES.KLINE}${symbol}:${interval}`;
    const ttl = this.getKlineTTL(interval);
    return this.set(key, klineData, { ttl });
  }

  async getKlineData(symbol: string, interval: string): Promise<any[] | null> {
    const key = `${this.PREFIXES.KLINE}${symbol}:${interval}`;
    return this.get(key);
  }

  async cacheOrderBook(symbol: string, orderBookData: any): Promise<boolean> {
    const key = `${this.PREFIXES.ORDER_BOOK}${symbol}`;
    return this.set(key, orderBookData, { ttl: 2 }); // 2 seconds TTL for order book
  }

  async getOrderBook(symbol: string): Promise<any> {
    const key = `${this.PREFIXES.ORDER_BOOK}${symbol}`;
    return this.get(key);
  }

  private getKlineTTL(interval: string): number {
    const intervalMap: Record<string, number> = {
      '1m': 30,    // 30 seconds
      '3m': 60,    // 1 minute
      '5m': 120,   // 2 minutes
      '15m': 300,  // 5 minutes
      '30m': 600,  // 10 minutes
      '1h': 1200,  // 20 minutes
      '2h': 2400,  // 40 minutes
      '4h': 3600,  // 1 hour
      '6h': 5400,  // 1.5 hours
      '12h': 7200, // 2 hours
      '1d': 10800  // 3 hours
    };
    return intervalMap[interval] || 300; // Default 5 minutes
  }

  // ===============================
  // AI ANALYSIS CACHING
  // ===============================

  async cacheAnalysis(symbol: string, analysis: ConsolidatedAnalysis): Promise<boolean> {
    const key = `${this.PREFIXES.AI_ANALYSIS}${symbol}:${Date.now()}`;
    return this.set(key, analysis, { ttl: 300 }); // 5 minutes TTL
  }

  async getCurrentAnalysis(symbol: string): Promise<ConsolidatedAnalysis | null> {
    try {
      const client = redis.getClient();
      const pattern = `${this.PREFIXES.AI_ANALYSIS}${symbol}:*`;
      const keys = await client.keys(pattern);

      if (keys.length === 0) return null;

      // Get the most recent analysis
      const sortedKeys = keys.sort().reverse();
      const analysis = await this.get(sortedKeys[0]);

      if (!analysis) return null;

      // Validate the analysis data and ensure all required properties exist
      return this.validateConsolidatedAnalysis(analysis);
    } catch (error) {
      console.error(`Error getting current analysis for ${symbol}:`, error);
      return null;
    }
  }

  private validateConsolidatedAnalysis(analysis: any): ConsolidatedAnalysis {
    // Ensure the analysis has all required properties
    const validatedAnalysis: ConsolidatedAnalysis = {
      symbol: analysis?.symbol || 'UNKNOWN',
      recommendation: this.validateRecommendation(analysis?.recommendation),
      confidence: this.validateConfidence(analysis?.confidence),
      targetPrice: analysis?.targetPrice && typeof analysis.targetPrice === 'number' ? analysis.targetPrice : undefined,
      stopLoss: analysis?.stopLoss && typeof analysis.stopLoss === 'number' ? analysis.stopLoss : undefined,
      reasoning: analysis?.reasoning || 'No reasoning provided from cache',
      individualAnalyses: this.validateIndividualAnalyses(analysis?.individualAnalyses),
      timestamp: analysis?.timestamp ? new Date(analysis.timestamp) : new Date()
    };

    // Log if we had to apply fallbacks
    if (!analysis?.reasoning) {
      console.warn(`ConsolidatedAnalysis missing reasoning for symbol ${validatedAnalysis.symbol}, using fallback`);
    }

    return validatedAnalysis;
  }

  private validateIndividualAnalyses(analyses: any): any[] {
    if (!Array.isArray(analyses)) {
      return [];
    }

    return analyses.map(analysis => ({
      model: analysis?.model || 'unknown',
      recommendation: this.validateRecommendation(analysis?.recommendation),
      confidence: this.validateConfidence(analysis?.confidence),
      reasoning: analysis?.reasoning || 'No reasoning provided',
      targetPrice: analysis?.targetPrice && typeof analysis.targetPrice === 'number' ? analysis.targetPrice : undefined,
      stopLoss: analysis?.stopLoss && typeof analysis.stopLoss === 'number' ? analysis.stopLoss : undefined,
      timestamp: analysis?.timestamp ? new Date(analysis.timestamp) : new Date()
    }));
  }

  private validateRecommendation(recommendation: any): 'BUY' | 'SELL' | 'HOLD' {
    const validRecommendations = ['BUY', 'SELL', 'HOLD'];
    if (typeof recommendation === 'string' && validRecommendations.includes(recommendation.toUpperCase())) {
      return recommendation.toUpperCase() as 'BUY' | 'SELL' | 'HOLD';
    }
    return 'HOLD';
  }

  private validateConfidence(confidence: any): number {
    if (typeof confidence === 'number' && confidence >= 0 && confidence <= 1) {
      return confidence;
    }
    return 0.5; // Default to neutral confidence
  }

  async cacheTradeSignal(agentId: string, signal: any): Promise<boolean> {
    const key = `${this.PREFIXES.TRADE_SIGNAL}${agentId}`;
    return this.set(key, signal, { ttl: 60 }); // 1 minute TTL
  }

  async getTradeSignal(agentId: string): Promise<any> {
    const key = `${this.PREFIXES.TRADE_SIGNAL}${agentId}`;
    return this.get(key);
  }

  // ===============================
  // PERFORMANCE CACHING
  // ===============================

  async cacheAgentPerformance(agentId: string, performance: any): Promise<boolean> {
    const key = `${this.PREFIXES.AGENT_PERFORMANCE}${agentId}`;
    return this.set(key, performance, { ttl: 30 }); // 30 seconds TTL
  }

  async getAgentPerformance(agentId: string): Promise<any> {
    const key = `${this.PREFIXES.AGENT_PERFORMANCE}${agentId}`;
    return this.get(key);
  }

  // ===============================
  // SESSION MANAGEMENT
  // ===============================

  async cacheUserSession(userId: string, sessionData: any): Promise<boolean> {
    const key = `${this.PREFIXES.USER_SESSION}${userId}`;
    return this.set(key, sessionData, { ttl: 86400 }); // 24 hours TTL
  }

  async getUserSession(userId: string): Promise<any> {
    const key = `${this.PREFIXES.USER_SESSION}${userId}`;
    return this.get(key);
  }

  async deleteUserSession(userId: string): Promise<boolean> {
    const key = `${this.PREFIXES.USER_SESSION}${userId}`;
    return this.delete(key);
  }

  // ===============================
  // WEBSOCKET SUBSCRIPTIONS
  // ===============================

  async addWebSocketSubscription(userId: string, subscription: string): Promise<boolean> {
    try {
      const client = redis.getClient();
      const key = `${this.PREFIXES.WEBSOCKET_SUB}${userId}`;
      await client.sadd(key, subscription);
      await client.expire(key, 3600); // 1 hour TTL
      return true;
    } catch (error) {
      console.error(`Error adding WebSocket subscription:`, error);
      return false;
    }
  }

  async removeWebSocketSubscription(userId: string, subscription: string): Promise<boolean> {
    try {
      const client = redis.getClient();
      const key = `${this.PREFIXES.WEBSOCKET_SUB}${userId}`;
      const result = await client.srem(key, subscription);
      return result > 0;
    } catch (error) {
      console.error(`Error removing WebSocket subscription:`, error);
      return false;
    }
  }

  async getUserWebSocketSubscriptions(userId: string): Promise<string[]> {
    try {
      const client = redis.getClient();
      const key = `${this.PREFIXES.WEBSOCKET_SUB}${userId}`;
      return await client.smembers(key);
    } catch (error) {
      console.error(`Error getting WebSocket subscriptions:`, error);
      return [];
    }
  }

  // ===============================
  // RATE LIMITING
  // ===============================

  async checkRateLimit(identifier: string, limit: number, window: number): Promise<{allowed: boolean, remaining: number}> {
    try {
      const client = redis.getClient();
      const key = `${this.PREFIXES.RATE_LIMIT}${identifier}`;

      const current = await client.incr(key);

      if (current === 1) {
        await client.expire(key, window);
      }

      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);

      return { allowed, remaining };
    } catch (error) {
      console.error(`Rate limit check error:`, error);
      return { allowed: true, remaining: limit };
    }
  }

  // ===============================
  // PUB/SUB OPERATIONS
  // ===============================

  async publish(channel: string, message: any): Promise<boolean> {
    try {
      const publisher = redis.getPublisher();
      const result = await publisher.publish(channel, JSON.stringify(message));
      return result > 0;
    } catch (error) {
      console.error(`Publish error for channel ${channel}:`, error);
      return false;
    }
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<boolean> {
    try {
      const subscriber = redis.getSubscriber();

      subscriber.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          try {
            const parsedMessage = JSON.parse(message);
            callback(parsedMessage);
          } catch (error) {
            console.error(`Error parsing message from channel ${channel}:`, error);
          }
        }
      });

      await subscriber.subscribe(channel);
      return true;
    } catch (error) {
      console.error(`Subscribe error for channel ${channel}:`, error);
      return false;
    }
  }

  async unsubscribe(channel: string): Promise<boolean> {
    try {
      const subscriber = redis.getSubscriber();
      await subscriber.unsubscribe(channel);
      return true;
    } catch (error) {
      console.error(`Unsubscribe error for channel ${channel}:`, error);
      return false;
    }
  }

  // ===============================
  // QUEUE OPERATIONS
  // ===============================

  async enqueue(queueName: string, item: QueueItem): Promise<boolean> {
    try {
      const client = redis.getClient();
      const key = `${this.PREFIXES.JOB_QUEUE}${queueName}`;
      const score = item.priority || Date.now();

      await client.zadd(key, score, JSON.stringify(item));
      return true;
    } catch (error) {
      console.error(`Enqueue error for queue ${queueName}:`, error);
      return false;
    }
  }

  async dequeue(queueName: string): Promise<QueueItem | null> {
    try {
      const client = redis.getClient();
      const key = `${this.PREFIXES.JOB_QUEUE}${queueName}`;

      const result = await client.zpopmin(key);
      if (result.length === 0) return null;

      return JSON.parse(result[0]);
    } catch (error) {
      console.error(`Dequeue error for queue ${queueName}:`, error);
      return null;
    }
  }

  async getQueueLength(queueName: string): Promise<number> {
    try {
      const client = redis.getClient();
      const key = `${this.PREFIXES.JOB_QUEUE}${queueName}`;
      return await client.zcard(key);
    } catch (error) {
      console.error(`Queue length error for queue ${queueName}:`, error);
      return 0;
    }
  }

  // ===============================
  // UTILITY METHODS
  // ===============================

  async flushByPattern(pattern: string): Promise<number> {
    try {
      const client = redis.getClient();
      const keys = await client.keys(pattern);
      if (keys.length === 0) return 0;

      const result = await client.del(...keys);
      return result;
    } catch (error) {
      console.error(`Flush by pattern error:`, error);
      return 0;
    }
  }

  async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      const client = redis.getClient();
      return await client.keys(pattern);
    } catch (error) {
      console.error(`Get keys by pattern error:`, error);
      return [];
    }
  }

  // ===============================
  // MISSING REDIS METHODS
  // ===============================

  async keys(pattern: string): Promise<string[]> {
    try {
      const client = redis.getClient();
      return await client.keys(pattern);
    } catch (error) {
      console.error(`Redis KEYS error:`, error);
      return [];
    }
  }

  async del(key: string): Promise<number> {
    try {
      const client = redis.getClient();
      return await client.del(key);
    } catch (error) {
      console.error(`Redis DEL error:`, error);
      return 0;
    }
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      const client = redis.getClient();
      return await client.sadd(key, ...members);
    } catch (error) {
      console.error(`Redis SADD error:`, error);
      return 0;
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      const client = redis.getClient();
      return await client.srem(key, ...members);
    } catch (error) {
      console.error(`Redis SREM error:`, error);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      const client = redis.getClient();
      return await client.smembers(key);
    } catch (error) {
      console.error(`Redis SMEMBERS error:`, error);
      return [];
    }
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    try {
      const client = redis.getClient();
      return await client.zadd(key, score, member);
    } catch (error) {
      console.error(`Redis ZADD error:`, error);
      return 0;
    }
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      const client = redis.getClient();
      return await client.zrevrange(key, start, stop);
    } catch (error) {
      console.error(`Redis ZREVRANGE error:`, error);
      return [];
    }
  }

  async zremrangebyrank(key: string, start: number, stop: number): Promise<number> {
    try {
      const client = redis.getClient();
      return await client.zremrangebyrank(key, start, stop);
    } catch (error) {
      console.error(`Redis ZREMRANGEBYRANK error:`, error);
      return 0;
    }
  }
}

export const redisService = new RedisService();