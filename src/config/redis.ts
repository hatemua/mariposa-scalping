import Redis from 'ioredis';
import { config } from './environment';

class RedisConnection {
  private client: Redis | null = null;
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private isConnected = false;
  private clientConnected = false;
  private publisherConnected = false;
  private subscriberConnected = false;
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

      // Connect all clients and wait for them to be ready
      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);

      // Wait for all clients to be connected
      await this.waitForAllClientsReady(10000); // 10 second timeout

      this.reconnectAttempts = 0;
      console.log('✅ Redis connected successfully with all clients ready');
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
      this.clientConnected = true;
      this.updateConnectionStatus();
    });

    this.client.on('error', (error) => {
      console.error('Redis main client error:', error);
      this.clientConnected = false;
      this.updateConnectionStatus();
    });

    this.client.on('close', () => {
      console.log('Redis main client disconnected');
      this.clientConnected = false;
      this.updateConnectionStatus();
      this.handleReconnection();
    });

    // Publisher events
    this.publisher.on('connect', () => {
      console.log('Redis publisher connected');
      this.publisherConnected = true;
      this.updateConnectionStatus();
    });

    this.publisher.on('error', (error) => {
      console.error('Redis publisher error:', error);
      this.publisherConnected = false;
      this.updateConnectionStatus();
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      console.log('Redis subscriber connected');
      this.subscriberConnected = true;
      this.updateConnectionStatus();
    });

    this.subscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error);
      this.subscriberConnected = false;
      this.updateConnectionStatus();
    });

    this.subscriber.on('close', () => {
      console.log('Redis subscriber disconnected');
      this.subscriberConnected = false;
      this.updateConnectionStatus();
    });

    this.publisher.on('close', () => {
      console.log('Redis publisher disconnected');
      this.publisherConnected = false;
      this.updateConnectionStatus();
    });
  }

  // Update overall connection status based on individual client states
  private updateConnectionStatus(): void {
    const previousState = this.isConnected;
    this.isConnected = this.clientConnected && this.publisherConnected && this.subscriberConnected;

    if (previousState !== this.isConnected) {
      if (this.isConnected) {
        console.log('✅ All Redis clients connected successfully');
      } else {
        console.log('⚠️ Redis connection status changed - not all clients connected');
        console.log(`  Main: ${this.clientConnected}, Publisher: ${this.publisherConnected}, Subscriber: ${this.subscriberConnected}`);
      }
    }
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
    this.clientConnected = false;
    this.publisherConnected = false;
    this.subscriberConnected = false;
    this.isConnected = false;
    console.log('Redis disconnected');
  }

  getClient(): Redis {
    if (!this.client || !this.clientConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  getPublisher(): Redis {
    if (!this.publisher || !this.publisherConnected) {
      throw new Error('Redis publisher not connected');
    }
    return this.publisher;
  }

  getSubscriber(): Redis {
    if (!this.subscriber || !this.subscriberConnected) {
      throw new Error('Redis subscriber not connected');
    }
    return this.subscriber;
  }

  // Wait for all Redis clients to be ready
  async waitForAllClientsReady(timeoutMs: number = 10000): Promise<void> {
    const startTime = Date.now();

    while (!this.subscriberConnected || !this.publisherConnected || !this.clientConnected) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Redis clients not ready within ${timeoutMs}ms timeout. ` +
          `Status: Client=${this.clientConnected}, Publisher=${this.publisherConnected}, Subscriber=${this.subscriberConnected}`);
      }

      console.log('Waiting for Redis clients to be ready...');
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('✅ All Redis clients are ready');
  }

  // Check if specific client is ready
  isClientReady(): boolean {
    return this.clientConnected;
  }

  isPublisherReady(): boolean {
    return this.publisherConnected;
  }

  isSubscriberReady(): boolean {
    return this.subscriberConnected;
  }

  // Check if all clients are ready
  areAllClientsReady(): boolean {
    return this.clientConnected && this.publisherConnected && this.subscriberConnected;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.clientConnected) return false;
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
      // @ts-ignore - Redis memory command type issue
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