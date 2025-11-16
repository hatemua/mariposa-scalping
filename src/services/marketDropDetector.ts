import { EventEmitter } from 'events';
import { mt4Service } from './mt4Service';
import { binanceService } from './binanceService';
import { redisService } from './redisService';

export interface MarketCondition {
  symbol: string;
  currentPrice: number;
  priceChange1m: number;
  priceChange3m: number;
  priceChange5m: number;
  volumeChange: number;
  velocity: number; // Price change per second
  dropLevel: 'none' | 'moderate' | 'severe';
  timestamp: Date;
}

export interface DropAlert {
  symbol: string;
  dropLevel: 'moderate' | 'severe';
  priceChange: number;
  timeframe: string;
  currentPrice: number;
  previousPrice: number;
  velocity: number;
  timestamp: Date;
  recommendation: 'ALERT' | 'CLOSE_POSITIONS';
}

export class MarketDropDetector extends EventEmitter {
  private readonly MODERATE_DROP_THRESHOLD = -2; // 2% drop
  private readonly SEVERE_DROP_THRESHOLD = -5; // 5% drop
  private readonly CHECK_INTERVAL = 10000; // 10 seconds
  private readonly PRICE_HISTORY_LENGTH = 60; // Keep 60 data points (10 min if checking every 10s)

  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private priceHistory: Map<string, Array<{ price: number; timestamp: number; volume?: number }>> = new Map();
  private lastAlert: Map<string, number> = new Map(); // Prevent alert spam
  private readonly ALERT_COOLDOWN = 60000; // 1 minute between alerts

  constructor() {
    super();
  }

  /**
   * Start monitoring market for drops
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Market Drop Detector already running');
      return;
    }

    console.log('🚨 Starting Market Drop Detector for BTCUSD...');

    this.isRunning = true;

    // Initialize price history from Binance (more reliable than MT4)
    await this.initializePriceHistory('BTCUSDT');

    // Start monitoring loop
    this.monitorInterval = setInterval(async () => {
      await this.checkForDrops('BTCUSDT');
    }, this.CHECK_INTERVAL);

    console.log(`✅ Market Drop Detector started (checking every ${this.CHECK_INTERVAL / 1000}s)`);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.isRunning = false;
    console.log('⏹️  Market Drop Detector stopped');
  }

  /**
   * Initialize price history from recent data
   */
  private async initializePriceHistory(symbol: string): Promise<void> {
    try {
      // Get recent 1-minute klines from Binance
      const klines = await binanceService.getKlineData(symbol, '1m', 10);

      const history: Array<{ price: number; timestamp: number; volume?: number }> = [];

      for (const kline of klines) {
        history.push({
          price: parseFloat(kline[4]), // close price
          timestamp: kline[6], // close time
          volume: parseFloat(kline[5])
        });
      }

      this.priceHistory.set(symbol, history);

      console.log(`📊 Initialized price history for ${symbol} with ${history.length} data points`);
    } catch (error) {
      console.error(`Error initializing price history for ${symbol}:`, error);
      this.priceHistory.set(symbol, []);
    }
  }

  /**
   * Check for market drops
   */
  private async checkForDrops(symbol: string): Promise<void> {
    try {
      // Get current price from Binance ticker
      const ticker = await binanceService.getSymbolInfo(symbol);
      const currentPrice = parseFloat(ticker.lastPrice || ticker.price || '0');

      if (currentPrice <= 0) {
        console.error(`Invalid price for ${symbol}: ${currentPrice}`);
        return;
      }

      // Update price history
      const history = this.priceHistory.get(symbol) || [];

      history.push({
        price: currentPrice,
        timestamp: Date.now(),
        volume: parseFloat(ticker.volume || ticker.quoteVolume || '0')
      });

      // Keep only recent history
      if (history.length > this.PRICE_HISTORY_LENGTH) {
        history.shift();
      }

      this.priceHistory.set(symbol, history);

      // Analyze market condition
      const condition = this.analyzeMarketCondition(symbol, currentPrice, history);

      // Store in Redis for other services
      await redisService.set(
        `market_condition:${symbol}`,
        JSON.stringify(condition),
        60 // 1 minute TTL
      );

      // Detect drops
      if (condition.dropLevel !== 'none') {
        await this.handleDrop(condition);
      }

    } catch (error) {
      console.error(`Error checking for drops on ${symbol}:`, error);
    }
  }

  /**
   * Analyze market condition
   */
  private analyzeMarketCondition(
    symbol: string,
    currentPrice: number,
    history: Array<{ price: number; timestamp: number; volume?: number }>
  ): MarketCondition {
    const condition: MarketCondition = {
      symbol,
      currentPrice,
      priceChange1m: 0,
      priceChange3m: 0,
      priceChange5m: 0,
      volumeChange: 0,
      velocity: 0,
      dropLevel: 'none',
      timestamp: new Date()
    };

    if (history.length < 2) {
      return condition;
    }

    const now = Date.now();

    // Calculate price changes for different timeframes
    // 1 minute (6 data points if checking every 10s)
    const price1mAgo = this.getPriceAt(history, now - 60000);
    if (price1mAgo) {
      condition.priceChange1m = ((currentPrice - price1mAgo) / price1mAgo) * 100;
    }

    // 3 minutes
    const price3mAgo = this.getPriceAt(history, now - 180000);
    if (price3mAgo) {
      condition.priceChange3m = ((currentPrice - price3mAgo) / price3mAgo) * 100;
    }

    // 5 minutes
    const price5mAgo = this.getPriceAt(history, now - 300000);
    if (price5mAgo) {
      condition.priceChange5m = ((currentPrice - price5mAgo) / price5mAgo) * 100;
    }

    // Calculate velocity (price change per second)
    const prevPrice = history[history.length - 2].price;
    const prevTime = history[history.length - 2].timestamp;
    const timeDiff = (now - prevTime) / 1000; // seconds

    if (timeDiff > 0) {
      const priceDiff = currentPrice - prevPrice;
      condition.velocity = priceDiff / timeDiff;
    }

    // Volume change (if available)
    if (history.length >= 20) {
      const recentVolumes = history.slice(-20).map(h => h.volume || 0);
      const avgVolume = recentVolumes.slice(0, -1).reduce((sum, v) => sum + v, 0) / 19;
      const currentVolume = recentVolumes[recentVolumes.length - 1];

      if (avgVolume > 0) {
        condition.volumeChange = ((currentVolume - avgVolume) / avgVolume) * 100;
      }
    }

    // Determine drop level
    if (condition.priceChange3m <= this.SEVERE_DROP_THRESHOLD ||
        condition.priceChange5m <= this.SEVERE_DROP_THRESHOLD) {
      condition.dropLevel = 'severe';
    } else if (condition.priceChange1m <= this.MODERATE_DROP_THRESHOLD ||
               condition.priceChange3m <= this.MODERATE_DROP_THRESHOLD) {
      condition.dropLevel = 'moderate';
    }

    return condition;
  }

  /**
   * Get price at specific timestamp (closest match)
   */
  private getPriceAt(
    history: Array<{ price: number; timestamp: number }>,
    targetTime: number
  ): number | null {
    if (history.length === 0) return null;

    // Find closest price to target time
    let closest = history[0];
    let minDiff = Math.abs(history[0].timestamp - targetTime);

    for (const entry of history) {
      const diff = Math.abs(entry.timestamp - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }

    // Only return if within 30 seconds of target
    if (minDiff < 30000) {
      return closest.price;
    }

    return null;
  }

  /**
   * Handle detected drop
   */
  private async handleDrop(condition: MarketCondition): Promise<void> {
    const { symbol, dropLevel, priceChange3m, priceChange5m, currentPrice, velocity } = condition;

    // Check cooldown to prevent alert spam
    const lastAlertTime = this.lastAlert.get(symbol) || 0;
    const now = Date.now();

    if (now - lastAlertTime < this.ALERT_COOLDOWN) {
      return; // Skip this alert
    }

    this.lastAlert.set(symbol, now);

    // Determine which timeframe had the biggest drop
    let timeframe = '3m';
    let priceChange = priceChange3m;

    if (Math.abs(priceChange5m) > Math.abs(priceChange3m)) {
      timeframe = '5m';
      priceChange = priceChange5m;
    }

    const previousPrice = currentPrice / (1 + priceChange / 100);

    const alert: DropAlert = {
      symbol,
      dropLevel,
      priceChange,
      timeframe,
      currentPrice,
      previousPrice,
      velocity,
      timestamp: new Date(),
      recommendation: dropLevel === 'severe' ? 'CLOSE_POSITIONS' : 'ALERT'
    };

    // Log the alert
    console.log(
      `🚨 ${dropLevel.toUpperCase()} MARKET DROP DETECTED: ${symbol} ` +
      `${priceChange.toFixed(2)}% in ${timeframe} | Price: $${currentPrice.toFixed(2)} | ` +
      `Velocity: $${velocity.toFixed(2)}/s`
    );

    // Store alert in Redis
    await redisService.publish('market_drops', {
      type: 'drop_detected',
      alert,
      timestamp: new Date()
    });

    // Emit event for other services (MT4 Trade Manager will listen)
    this.emit('drop_detected', alert);

    // Store alert history
    await this.storeAlertHistory(alert);
  }

  /**
   * Store alert in history
   */
  private async storeAlertHistory(alert: DropAlert): Promise<void> {
    try {
      const key = `drop_alerts:${alert.symbol}`;
      const alertData = JSON.stringify(alert);

      // Use sorted set with timestamp as score
      await redisService.zadd(key, Date.now(), alertData);

      // Keep only last 100 alerts
      const count = await redisService.zcard(key);
      if (count > 100) {
        await redisService.zremrangebyrank(key, 0, count - 101);
      }
    } catch (error) {
      console.error('Error storing alert history:', error);
    }
  }

  /**
   * Get current market condition
   */
  async getMarketCondition(symbol: string = 'BTCUSDT'): Promise<MarketCondition | null> {
    try {
      const cached = await redisService.get(`market_condition:${symbol}`);

      if (cached) {
        const condition = JSON.parse(cached);
        condition.timestamp = new Date(condition.timestamp);
        return condition;
      }

      return null;
    } catch (error) {
      console.error('Error getting market condition:', error);
      return null;
    }
  }

  /**
   * Get recent drop alerts
   */
  async getRecentAlerts(symbol: string = 'BTCUSDT', limit: number = 10): Promise<DropAlert[]> {
    try {
      const key = `drop_alerts:${symbol}`;

      // Get recent alerts from sorted set (newest first)
      const alerts = await redisService.zrevrange(key, 0, limit - 1);

      return alerts.map((alertStr: string) => {
        const alert = JSON.parse(alertStr);
        alert.timestamp = new Date(alert.timestamp);
        return alert;
      });
    } catch (error) {
      console.error('Error getting recent alerts:', error);
      return [];
    }
  }

  /**
   * Check if market is currently in drop
   */
  async isMarketDropping(symbol: string = 'BTCUSDT'): Promise<boolean> {
    try {
      const condition = await this.getMarketCondition(symbol);

      if (!condition) return false;

      return condition.dropLevel !== 'none';
    } catch (error) {
      console.error('Error checking if market is dropping:', error);
      return false;
    }
  }

  /**
   * Get drop statistics
   */
  async getDropStats(symbol: string = 'BTCUSDT'): Promise<any> {
    try {
      const alerts = await this.getRecentAlerts(symbol, 100);

      const moderateDrops = alerts.filter(a => a.dropLevel === 'moderate').length;
      const severeDrops = alerts.filter(a => a.dropLevel === 'severe').length;

      const avgDropSize = alerts.length > 0
        ? alerts.reduce((sum, a) => sum + Math.abs(a.priceChange), 0) / alerts.length
        : 0;

      return {
        symbol,
        totalAlerts: alerts.length,
        moderateDrops,
        severeDrops,
        avgDropSize: avgDropSize.toFixed(2),
        lastAlert: alerts.length > 0 ? alerts[0] : null,
        isCurrentlyDropping: await this.isMarketDropping(symbol)
      };
    } catch (error) {
      console.error('Error getting drop stats:', error);
      return null;
    }
  }
}

export const marketDropDetector = new MarketDropDetector();
