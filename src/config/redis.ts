import Redis from 'ioredis';
import { config } from './environment';

class RedisConnection {
  private client: Redis | null = null;
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;

  async connect(): Promise<void> {
    try {
      const redisConfig = {
        host: this.extractHost(config.REDIS_URL),
        port: this.extractPort(config.REDIS_URL),
        password: config.REDIS_PASSWORD || undefined,
        db: config.REDIS_DB,
        connectTimeout: config.REDIS_TIMEOUT,
        lazyConnect: true,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: config.REDIS_RETRY_ATTEMPTS,
        enableOfflineQueue: false,
      };

      // Main Redis client for general operations
      this.client = new Redis(redisConfig);

      // Separate clients for pub/sub to avoid blocking
      this.publisher = new Redis(redisConfig);
      this.subscriber = new Redis(redisConfig);

      // Setup event handlers
      this.setupEventHandlers();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.client || !this.publisher || !this.subscriber) return;

    // Main client events
    this.client.on('connect', () => {
      console.log('Redis main client connected');
    });

    this.client.on('error', (error) => {
      console.error('Redis main client error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Redis main client disconnected');
      this.isConnected = false;
      this.handleReconnection();
    });

    // Publisher events
    this.publisher.on('connect', () => {
      console.log('Redis publisher connected');
    });

    this.publisher.on('error', (error) => {
      console.error('Redis publisher error:', error);
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      console.log('Redis subscriber connected');
    });

    this.subscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error);
    });
  }

  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= config.REDIS_RETRY_ATTEMPTS) {
      console.error('Max Redis reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`Attempting Redis reconnection (${this.reconnectAttempts}/${config.REDIS_RETRY_ATTEMPTS}) in ${delay}ms`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('Redis reconnection failed:', error);
      }
    }, delay);
  }

  private extractHost(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return 'localhost';
    }
  }

  private extractPort(url: string): number {
    try {
      const parsed = new URL(url);
      return parseInt(parsed.port) || 6379;
    } catch {
      return 6379;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    if (this.publisher) {
      await this.publisher.quit();
      this.publisher = null;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    this.isConnected = false;
    console.log('Redis disconnected');
  }

  getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  getPublisher(): Redis {
    if (!this.publisher || !this.isConnected) {
      throw new Error('Redis publisher not connected');
    }
    return this.publisher;
  }

  getSubscriber(): Redis {
    if (!this.subscriber || !this.isConnected) {
      throw new Error('Redis subscriber not connected');
    }
    return this.subscriber;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) return false;
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  async getStats(): Promise<any> {
    try {
      if (!this.client || !this.isConnected) return null;

      const info = await this.client.info();
      const memory = await this.client.memory('usage');
      const dbSize = await this.client.dbsize();

      return {
        connected: this.isConnected,
        memory: memory,
        dbSize: dbSize,
        info: info
      };
    } catch (error) {
      console.error('Error getting Redis stats:', error);
      return null;
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }
}

export const redis = new RedisConnection();