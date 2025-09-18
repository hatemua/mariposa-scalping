import { okxService } from './okxService';
import { redisService } from './redisService';
import { agendaService } from './agendaService';
import { SymbolConverter } from '../utils/symbolConverter';

interface OrderTrackingData {
  orderId: string;
  userId: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  expectedPrice?: number;
  actualFillPrice?: number;
  status: 'pending' | 'filled' | 'partially_filled' | 'canceled' | 'failed';
  timestamp: number;
  completedAt?: number;
  profit?: number;
  fees?: number;
}

interface TradePerformanceMetrics {
  totalTrades: number;
  successfulTrades: number;
  totalProfit: number;
  totalFees: number;
  averageFillSlippage: number;
  bestTrade: number;
  worstTrade: number;
}

export class OrderTrackingService {
  private trackingInterval = 3000; // 3 seconds
  private maxTrackingDuration = 300000; // 5 minutes

  async trackOrder(
    orderId: string,
    userId: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    expectedPrice?: number
  ): Promise<void> {
    try {
      const trackingData: OrderTrackingData = {
        orderId,
        userId,
        symbol,
        side,
        amount,
        expectedPrice,
        status: 'pending',
        timestamp: Date.now()
      };

      // Store tracking data in Redis
      const trackingKey = `order_tracking:${orderId}`;
      await redisService.set(trackingKey, JSON.stringify(trackingData), 3600); // 1 hour TTL

      // Add to active tracking set
      await redisService.sadd('active_orders', orderId);

      // Schedule tracking job
      await this.scheduleOrderTracking(orderId);

      console.log(`Started tracking order ${orderId} for user ${userId}`);
    } catch (error) {
      console.error('Error starting order tracking:', error);
      throw error;
    }
  }

  private async scheduleOrderTracking(orderId: string): Promise<void> {
    try {
      // Schedule immediate tracking
      await agendaService.schedule('now', 'track-order-status', { orderId });

      // Schedule periodic tracking for next 5 minutes
      const trackingJobs = [];
      for (let i = 1; i <= 10; i++) {
        const delay = i * 30; // Every 30 seconds for 5 minutes
        trackingJobs.push(
          agendaService.schedule(`in ${delay} seconds`, 'track-order-status', { orderId })
        );
      }

      await Promise.all(trackingJobs);
    } catch (error) {
      console.error('Error scheduling order tracking:', error);
    }
  }

  async checkOrderStatus(orderId: string): Promise<OrderTrackingData | null> {
    try {
      const trackingKey = `order_tracking:${orderId}`;
      const trackingDataStr = await redisService.get(trackingKey);

      if (!trackingDataStr) {
        console.log(`No tracking data found for order ${orderId}`);
        return null;
      }

      const trackingData: OrderTrackingData = JSON.parse(trackingDataStr);

      // Get latest order status from OKX
      const orderStatus = await okxService.getOrderStatus(
        trackingData.userId,
        orderId,
        trackingData.symbol
      );

      if (!orderStatus) {
        console.log(`Order ${orderId} not found on OKX`);
        return trackingData;
      }

      // Update tracking data based on current status
      const updatedTrackingData = await this.updateTrackingData(trackingData, orderStatus);

      // Save updated data
      await redisService.set(trackingKey, JSON.stringify(updatedTrackingData), 3600);

      // If order is complete, process final metrics
      if (updatedTrackingData.status === 'filled') {
        await this.processCompletedOrder(updatedTrackingData);
        await redisService.srem('active_orders', orderId);
      } else if (updatedTrackingData.status === 'canceled' || updatedTrackingData.status === 'failed') {
        await redisService.srem('active_orders', orderId);
      }

      return updatedTrackingData;
    } catch (error) {
      console.error(`Error checking order status for ${orderId}:`, error);
      return null;
    }
  }

  private async updateTrackingData(
    trackingData: OrderTrackingData,
    orderStatus: any
  ): Promise<OrderTrackingData> {
    const updated: OrderTrackingData = { ...trackingData };

    // Update status
    if (orderStatus.status === 'closed') {
      updated.status = 'filled';
      updated.completedAt = Date.now();
    } else if (orderStatus.filled > 0 && orderStatus.remaining > 0) {
      updated.status = 'partially_filled';
    } else if (orderStatus.status === 'canceled') {
      updated.status = 'canceled';
      updated.completedAt = Date.now();
    } else if (orderStatus.status === 'failed') {
      updated.status = 'failed';
      updated.completedAt = Date.now();
    }

    // Update fill price if available
    if (orderStatus.avgFillPrice) {
      updated.actualFillPrice = orderStatus.avgFillPrice;

      // Calculate profit/loss if we have both prices
      if (updated.expectedPrice) {
        const priceDiff = updated.side === 'buy'
          ? updated.actualFillPrice - updated.expectedPrice
          : updated.expectedPrice - updated.actualFillPrice;

        updated.profit = priceDiff * updated.amount;
      }
    }

    // Update fees if available
    if (orderStatus.fee) {
      updated.fees = orderStatus.fee.cost;
    }

    return updated;
  }

  private async processCompletedOrder(trackingData: OrderTrackingData): Promise<void> {
    try {
      // Publish order completion event
      await redisService.publish(`order_completed:${trackingData.userId}`, {
        type: 'order_completed',
        orderId: trackingData.orderId,
        symbol: trackingData.symbol,
        side: trackingData.side,
        amount: trackingData.amount,
        actualFillPrice: trackingData.actualFillPrice,
        profit: trackingData.profit,
        fees: trackingData.fees,
        timestamp: trackingData.completedAt
      });

      // Update user performance metrics
      await this.updateUserPerformanceMetrics(trackingData);

      // Store completed order in historical data
      await this.storeCompletedOrder(trackingData);

      console.log(`Order ${trackingData.orderId} completed - Profit: ${trackingData.profit}, Fill Price: ${trackingData.actualFillPrice}`);
    } catch (error) {
      console.error('Error processing completed order:', error);
    }
  }

  private async updateUserPerformanceMetrics(trackingData: OrderTrackingData): Promise<void> {
    try {
      const metricsKey = `user_performance:${trackingData.userId}`;
      const existingMetricsStr = await redisService.get(metricsKey);

      let metrics: TradePerformanceMetrics = existingMetricsStr
        ? JSON.parse(existingMetricsStr)
        : {
            totalTrades: 0,
            successfulTrades: 0,
            totalProfit: 0,
            totalFees: 0,
            averageFillSlippage: 0,
            bestTrade: 0,
            worstTrade: 0
          };

      // Update metrics
      metrics.totalTrades += 1;

      if (trackingData.profit !== undefined) {
        if (trackingData.profit > 0) {
          metrics.successfulTrades += 1;
        }
        metrics.totalProfit += trackingData.profit;

        if (trackingData.profit > metrics.bestTrade) {
          metrics.bestTrade = trackingData.profit;
        }
        if (trackingData.profit < metrics.worstTrade) {
          metrics.worstTrade = trackingData.profit;
        }
      }

      if (trackingData.fees !== undefined) {
        metrics.totalFees += trackingData.fees;
      }

      // Calculate slippage if both prices available
      if (trackingData.expectedPrice && trackingData.actualFillPrice) {
        const slippage = Math.abs(trackingData.actualFillPrice - trackingData.expectedPrice) / trackingData.expectedPrice;

        // Update average slippage (simple moving average)
        metrics.averageFillSlippage = ((metrics.averageFillSlippage * (metrics.totalTrades - 1)) + slippage) / metrics.totalTrades;
      }

      // Store updated metrics
      await redisService.set(metricsKey, JSON.stringify(metrics), 86400); // 24 hour TTL
    } catch (error) {
      console.error('Error updating user performance metrics:', error);
    }
  }

  private async storeCompletedOrder(trackingData: OrderTrackingData): Promise<void> {
    try {
      const historyKey = `order_history:${trackingData.userId}`;
      const orderData = JSON.stringify(trackingData);

      // Add to user's order history (sorted set by timestamp)
      await redisService.zadd(historyKey, trackingData.timestamp, orderData);

      // Keep only last 1000 orders per user
      await redisService.zremrangebyrank(historyKey, 0, -1001);

      // Also store by symbol for analysis
      const symbolHistoryKey = `symbol_history:${SymbolConverter.normalize(trackingData.symbol)}`;
      await redisService.zadd(symbolHistoryKey, trackingData.timestamp, orderData);

      // Keep only last 500 orders per symbol
      await redisService.zremrangebyrank(symbolHistoryKey, 0, -501);
    } catch (error) {
      console.error('Error storing completed order:', error);
    }
  }

  async getUserPerformanceMetrics(userId: string): Promise<TradePerformanceMetrics | null> {
    try {
      const metricsKey = `user_performance:${userId}`;
      const metricsStr = await redisService.get(metricsKey);

      return metricsStr ? JSON.parse(metricsStr) : null;
    } catch (error) {
      console.error('Error getting user performance metrics:', error);
      return null;
    }
  }

  async getActiveOrders(): Promise<string[]> {
    try {
      return await redisService.smembers('active_orders');
    } catch (error) {
      console.error('Error getting active orders:', error);
      return [];
    }
  }

  async getOrderHistory(userId: string, limit = 50): Promise<OrderTrackingData[]> {
    try {
      const historyKey = `order_history:${userId}`;
      const orderDataList = await redisService.zrevrange(historyKey, 0, limit - 1);

      return orderDataList.map(data => JSON.parse(data));
    } catch (error) {
      console.error('Error getting order history:', error);
      return [];
    }
  }

  async getSymbolOrderHistory(symbol: string, limit = 100): Promise<OrderTrackingData[]> {
    try {
      const normalizedSymbol = SymbolConverter.normalize(symbol);
      const historyKey = `symbol_history:${normalizedSymbol}`;
      const orderDataList = await redisService.zrevrange(historyKey, 0, limit - 1);

      return orderDataList.map(data => JSON.parse(data));
    } catch (error) {
      console.error('Error getting symbol order history:', error);
      return [];
    }
  }

  // Get fill price for a specific order
  async getOrderFillPrice(orderId: string): Promise<number | null> {
    try {
      const trackingKey = `order_tracking:${orderId}`;
      const trackingDataStr = await redisService.get(trackingKey);

      if (trackingDataStr) {
        const trackingData: OrderTrackingData = JSON.parse(trackingDataStr);
        return trackingData.actualFillPrice || null;
      }

      return null;
    } catch (error) {
      console.error('Error getting order fill price:', error);
      return null;
    }
  }

  // Cleanup old tracking data
  async cleanupOldData(): Promise<void> {
    try {
      const activeOrders = await this.getActiveOrders();
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const orderId of activeOrders) {
        const trackingKey = `order_tracking:${orderId}`;
        const trackingDataStr = await redisService.get(trackingKey);

        if (trackingDataStr) {
          const trackingData: OrderTrackingData = JSON.parse(trackingDataStr);

          // Remove orders older than 24 hours from active tracking
          if (now - trackingData.timestamp > maxAge) {
            await redisService.srem('active_orders', orderId);
            console.log(`Removed stale order ${orderId} from active tracking`);
          }
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

export const orderTrackingService = new OrderTrackingService();