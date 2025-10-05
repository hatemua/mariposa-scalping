import { redisService } from './redisService';
import { dashboardAnalyticsService } from './dashboardAnalyticsService';

export class MetricsCacheService {
  private readonly CACHE_PREFIX = 'metrics:';
  private readonly DEFAULT_TTL = 60; // 1 minute

  /**
   * Get or compute dashboard summary with caching
   */
  async getDashboardSummary(userId: string, forceRefresh: boolean = false): Promise<any> {
    const key = `${this.CACHE_PREFIX}dashboard:${userId}`;

    if (!forceRefresh) {
      const cached = await redisService.get(key);
      if (cached) {
        console.log(`Cache hit for dashboard summary: ${userId}`);
        return cached;
      }
    }

    console.log(`Computing dashboard summary for: ${userId}`);
    const summary = await dashboardAnalyticsService.getUserDashboardSummary(userId);
    await redisService.set(key, summary, { ttl: 30 }); // 30 seconds cache

    return summary;
  }

  /**
   * Get or compute agent metrics with caching
   */
  async getAgentMetrics(userId: string, forceRefresh: boolean = false): Promise<any> {
    const key = `${this.CACHE_PREFIX}agents:${userId}`;

    if (!forceRefresh) {
      const cached = await redisService.get(key);
      if (cached) {
        console.log(`Cache hit for agent metrics: ${userId}`);
        return cached;
      }
    }

    console.log(`Computing agent metrics for: ${userId}`);
    const metrics = await dashboardAnalyticsService.getAllAgentMetrics(userId);
    await redisService.set(key, metrics, { ttl: this.DEFAULT_TTL });

    return metrics;
  }

  /**
   * Get or compute PnL chart data with caching
   */
  async getPnLChartData(
    userId: string,
    timeRange: 'day' | 'week' | 'month' | 'year',
    groupBy: 'hour' | 'day',
    forceRefresh: boolean = false
  ): Promise<any> {
    const key = `${this.CACHE_PREFIX}pnl:${userId}:${timeRange}:${groupBy}`;

    if (!forceRefresh) {
      const cached = await redisService.get(key);
      if (cached) {
        console.log(`Cache hit for PnL chart: ${userId}`);
        return cached;
      }
    }

    console.log(`Computing PnL chart for: ${userId}`);
    const data = await dashboardAnalyticsService.getPnLTimeSeries(userId, timeRange, groupBy);
    await redisService.set(key, data, { ttl: 300 }); // 5 minutes cache

    return data;
  }

  /**
   * Get or compute strategy performance with caching
   */
  async getStrategyPerformance(userId: string, forceRefresh: boolean = false): Promise<any> {
    const key = `${this.CACHE_PREFIX}strategy:${userId}`;

    if (!forceRefresh) {
      const cached = await redisService.get(key);
      if (cached) {
        console.log(`Cache hit for strategy performance: ${userId}`);
        return cached;
      }
    }

    console.log(`Computing strategy performance for: ${userId}`);
    const data = await dashboardAnalyticsService.getStrategyPerformance(userId);
    await redisService.set(key, data, { ttl: this.DEFAULT_TTL });

    return data;
  }

  /**
   * Invalidate all caches for a user (call after new trade)
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [
      `${this.CACHE_PREFIX}dashboard:${userId}`,
      `${this.CACHE_PREFIX}agents:${userId}`,
      `${this.CACHE_PREFIX}pnl:${userId}:*`,
      `${this.CACHE_PREFIX}strategy:${userId}`,
    ];

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const keys = await redisService.getKeysByPattern(pattern);
        for (const key of keys) {
          await redisService.delete(key);
        }
      } else {
        await redisService.delete(pattern);
      }
    }

    console.log(`Invalidated cache for user: ${userId}`);
  }

  /**
   * Warm up cache for active users (background job)
   */
  async warmUpCache(userIds: string[]): Promise<void> {
    console.log(`Warming up cache for ${userIds.length} users`);

    const promises = userIds.map(async userId => {
      try {
        await Promise.all([
          this.getDashboardSummary(userId, true),
          this.getAgentMetrics(userId, true),
          this.getPnLChartData(userId, 'week', 'day', true),
          this.getStrategyPerformance(userId, true),
        ]);
        console.log(`Cache warmed for user: ${userId}`);
      } catch (error) {
        console.error(`Error warming cache for user ${userId}:`, error);
      }
    });

    await Promise.all(promises);
    console.log('Cache warm-up complete');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    totalKeys: number;
    hitRate: number;
    size: string;
  }> {
    try {
      const keys = await redisService.getKeysByPattern(`${this.CACHE_PREFIX}*`);
      // This is a simplified version - in production you'd track hits/misses
      return {
        totalKeys: keys.length,
        hitRate: 0, // Would need to track this separately
        size: 'N/A',
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        totalKeys: 0,
        hitRate: 0,
        size: 'N/A',
      };
    }
  }

  /**
   * Clear all metrics cache
   */
  async clearAllCache(): Promise<number> {
    try {
      const keys = await redisService.getKeysByPattern(`${this.CACHE_PREFIX}*`);
      let deletedCount = 0;

      for (const key of keys) {
        await redisService.delete(key);
        deletedCount++;
      }

      console.log(`Cleared ${deletedCount} cache entries`);
      return deletedCount;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return 0;
    }
  }
}

export const metricsCacheService = new MetricsCacheService();
