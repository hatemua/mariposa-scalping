import { redisService } from './redisService';
import { ScalpingAgent, Trade } from '../models';
import { AgentPerformance } from '../types';

interface MetricsSnapshot {
  timestamp: Date;
  agentId: string;
  metrics: AgentPerformance;
}

interface SystemMetrics {
  totalActiveAgents: number;
  totalTrades: number;
  totalPnL: number;
  averageWinRate: number;
  topPerformers: Array<{
    agentId: string;
    name: string;
    symbol: string;
    pnl: number;
    winRate: number;
  }>;
  recentActivity: Array<{
    timestamp: Date;
    action: string;
    agentId: string;
    symbol: string;
    value?: number;
  }>;
}

export class PerformanceMetricsService {
  private readonly CACHE_TTL = {
    REAL_TIME: 10,    // 10 seconds for real-time metrics
    AGENT_PERF: 30,   // 30 seconds for agent performance
    SYSTEM_PERF: 60,  // 1 minute for system-wide metrics
    HISTORICAL: 300   // 5 minutes for historical data
  };

  private readonly PREFIXES = {
    AGENT_METRICS: 'metrics:agent:',
    SYSTEM_METRICS: 'metrics:system:',
    TRADE_METRICS: 'metrics:trades:',
    PERFORMANCE_SNAPSHOT: 'metrics:snapshot:',
    LEADERBOARD: 'metrics:leaderboard'
  };

  // ===============================
  // AGENT PERFORMANCE CACHING
  // ===============================

  async cacheAgentPerformance(agentId: string, performance: AgentPerformance): Promise<void> {
    const key = `${this.PREFIXES.AGENT_METRICS}${agentId}`;
    await redisService.cacheAgentPerformance(agentId, performance);

    // Also maintain a time-series for historical tracking
    const snapshotKey = `${this.PREFIXES.PERFORMANCE_SNAPSHOT}${agentId}:${Date.now()}`;
    const snapshot: MetricsSnapshot = {
      timestamp: new Date(),
      agentId,
      metrics: performance
    };

    await redisService.set(snapshotKey, snapshot, { ttl: this.CACHE_TTL.HISTORICAL });

    // Publish real-time update
    await redisService.publish(`metrics:${agentId}`, {
      type: 'performance_update',
      data: performance,
      timestamp: new Date()
    });
  }

  async getAgentPerformance(agentId: string): Promise<AgentPerformance | null> {
    try {
      // Try Redis cache first
      const cachedPerformance = await redisService.getAgentPerformance(agentId);
      if (cachedPerformance) {
        return cachedPerformance;
      }

      // Fallback to database and cache result
      const agent = await ScalpingAgent.findById(agentId);
      if (agent && agent.performance) {
        await this.cacheAgentPerformance(agentId, agent.performance);
        return agent.performance;
      }

      return null;
    } catch (error) {
      console.error(`Error getting agent performance for ${agentId}:`, error);
      return null;
    }
  }

  async updateAgentMetrics(agentId: string): Promise<AgentPerformance> {
    try {
      const trades = await Trade.find({
        agentId,
        status: 'filled'
      }).sort({ createdAt: 1 });

      const performance = this.calculatePerformanceMetrics(trades);

      // Update database
      await ScalpingAgent.findByIdAndUpdate(agentId, {
        'performance': performance,
        'performance.lastUpdated': new Date()
      });

      // Cache the updated metrics
      await this.cacheAgentPerformance(agentId, performance);

      return performance;
    } catch (error) {
      console.error(`Error updating agent metrics for ${agentId}:`, error);
      throw error;
    }
  }

  private calculatePerformanceMetrics(trades: any[]): AgentPerformance {
    const totalTrades = trades.length;

    if (totalTrades === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        totalPnL: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        lastUpdated: new Date()
      };
    }

    // Calculate P&L for each trade
    const tradesWithPnL = trades.map(trade => {
      let pnl = trade.pnl || 0;

      // If P&L not calculated, try to estimate
      if (pnl === 0 && trade.side === 'sell') {
        const buyTrade = trades.find(t =>
          t.symbol === trade.symbol &&
          t.side === 'buy' &&
          t.createdAt < trade.createdAt &&
          Math.abs(t.filledQuantity - trade.filledQuantity) < 0.001
        );

        if (buyTrade && trade.filledPrice && buyTrade.filledPrice) {
          pnl = (trade.filledPrice - buyTrade.filledPrice) * trade.filledQuantity;
        }
      }

      return { ...trade, calculatedPnL: pnl };
    });

    // Calculate metrics
    const winningTrades = tradesWithPnL.filter(t => t.calculatedPnL > 0);
    const winRate = (winningTrades.length / totalTrades) * 100;
    const totalPnL = tradesWithPnL.reduce((sum, trade) => sum + trade.calculatedPnL, 0);

    // Calculate returns for Sharpe ratio
    const returns = tradesWithPnL.map(t => {
      const tradeValue = t.price * t.quantity;
      return tradeValue > 0 ? t.calculatedPnL / tradeValue : 0;
    });

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const returnVariance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1);
    const returnStdDev = Math.sqrt(returnVariance);
    const sharpeRatio = returnStdDev > 0 ? avgReturn / returnStdDev : 0;

    // Calculate maximum drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;

    for (const trade of tradesWithPnL) {
      runningPnL += trade.calculatedPnL;
      if (runningPnL > peak) {
        peak = runningPnL;
      }

      if (peak > 0) {
        const drawdown = ((peak - runningPnL) / peak) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    return {
      totalTrades,
      winRate: Math.round(winRate * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 1000) / 1000,
      lastUpdated: new Date()
    };
  }

  // ===============================
  // SYSTEM-WIDE METRICS
  // ===============================

  async cacheSystemMetrics(): Promise<SystemMetrics> {
    try {
      const cacheKey = this.PREFIXES.SYSTEM_METRICS;

      // Check if we have recent cached data
      const cachedMetrics = await redisService.get(cacheKey);
      if (cachedMetrics) {
        return cachedMetrics;
      }

      // Calculate fresh metrics
      const agents = await ScalpingAgent.find({}).populate('userId', 'email');
      const totalActiveAgents = agents.filter(agent => agent.isActive).length;

      const allTrades = await Trade.find({ status: 'filled' });
      const totalTrades = allTrades.length;
      const totalPnL = allTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);

      // Calculate average win rate
      const agentPerformances = agents
        .filter(agent => agent.performance && agent.performance.totalTrades > 0)
        .map(agent => agent.performance!);

      const averageWinRate = agentPerformances.length > 0
        ? agentPerformances.reduce((sum, perf) => sum + perf.winRate, 0) / agentPerformances.length
        : 0;

      // Get top performers
      const topPerformers = agents
        .filter(agent => agent.performance && agent.performance.totalTrades >= 5)
        .sort((a, b) => (b.performance?.totalPnL || 0) - (a.performance?.totalPnL || 0))
        .slice(0, 10)
        .map(agent => ({
          agentId: (agent._id as any).toString(),
          name: agent.name,
          symbol: agent.symbol,
          pnl: agent.performance?.totalPnL || 0,
          winRate: agent.performance?.winRate || 0
        }));

      // Get recent activity (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentTrades = await Trade.find({
        createdAt: { $gte: oneDayAgo }
      }).sort({ createdAt: -1 }).limit(50);

      const recentActivity = recentTrades.map(trade => ({
        timestamp: trade.createdAt,
        action: `${trade.side.toUpperCase()} ${trade.symbol}`,
        agentId: trade.agentId.toString(),
        symbol: trade.symbol,
        value: trade.pnl
      }));

      const systemMetrics: SystemMetrics = {
        totalActiveAgents,
        totalTrades,
        totalPnL: Math.round(totalPnL * 100) / 100,
        averageWinRate: Math.round(averageWinRate * 100) / 100,
        topPerformers,
        recentActivity
      };

      // Cache the metrics
      await redisService.set(cacheKey, systemMetrics, { ttl: this.CACHE_TTL.SYSTEM_PERF });

      return systemMetrics;
    } catch (error) {
      console.error('Error caching system metrics:', error);
      throw error;
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics | null> {
    try {
      return await this.cacheSystemMetrics();
    } catch (error) {
      console.error('Error getting system metrics:', error);
      return null;
    }
  }

  // ===============================
  // REAL-TIME TRADE METRICS
  // ===============================

  async updateTradeMetrics(trade: any): Promise<void> {
    try {
      const agentId = trade.agentId;
      const symbol = trade.symbol;

      // Update real-time counters
      const tradeCountKey = `${this.PREFIXES.TRADE_METRICS}count:${agentId}`;
      const volumeKey = `${this.PREFIXES.TRADE_METRICS}volume:${symbol}`;
      const pnlKey = `${this.PREFIXES.TRADE_METRICS}pnl:${agentId}`;

      // Increment counters using Redis atomic operations
      const pipeline = [
        redisService.set(tradeCountKey, await this.incrementCounter(tradeCountKey), { ttl: this.CACHE_TTL.AGENT_PERF }),
        redisService.set(volumeKey, await this.incrementCounter(volumeKey, trade.quantity || 0), { ttl: this.CACHE_TTL.REAL_TIME }),
        redisService.set(pnlKey, await this.incrementCounter(pnlKey, trade.pnl || 0), { ttl: this.CACHE_TTL.AGENT_PERF })
      ];

      await Promise.all(pipeline);

      // Publish real-time trade update
      await redisService.publish(`trades:${agentId}`, {
        type: 'trade_executed',
        data: {
          tradeId: trade._id,
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          price: trade.filledPrice || trade.price,
          pnl: trade.pnl,
          timestamp: new Date()
        }
      });

      // Update agent metrics asynchronously
      this.updateAgentMetrics(agentId).catch(error => {
        console.error(`Error updating agent metrics for ${agentId}:`, error);
      });

    } catch (error) {
      console.error('Error updating trade metrics:', error);
    }
  }

  private async incrementCounter(key: string, increment: number = 1): Promise<number> {
    try {
      const current = await redisService.get(key) || 0;
      return (typeof current === 'number' ? current : 0) + increment;
    } catch (error) {
      console.error(`Error incrementing counter ${key}:`, error);
      return increment;
    }
  }

  // ===============================
  // PERFORMANCE LEADERBOARD
  // ===============================

  async updateLeaderboard(): Promise<void> {
    try {
      const agents = await ScalpingAgent.find({
        'performance.totalTrades': { $gte: 5 } // Minimum 5 trades to be on leaderboard
      }).populate('userId', 'email');

      const leaderboardData = agents
        .filter(agent => agent.performance)
        .map(agent => ({
          agentId: (agent._id as any).toString(),
          name: agent.name,
          symbol: agent.symbol,
          userEmail: (agent.userId as any)?.email || 'Unknown',
          totalPnL: agent.performance!.totalPnL,
          winRate: agent.performance!.winRate,
          totalTrades: agent.performance!.totalTrades,
          sharpeRatio: agent.performance!.sharpeRatio,
          maxDrawdown: agent.performance!.maxDrawdown,
          score: this.calculateLeaderboardScore(agent.performance!)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 50); // Top 50

      await redisService.set(this.PREFIXES.LEADERBOARD, leaderboardData, {
        ttl: this.CACHE_TTL.SYSTEM_PERF
      });

      console.log(`Leaderboard updated with ${leaderboardData.length} agents`);
    } catch (error) {
      console.error('Error updating leaderboard:', error);
    }
  }

  private calculateLeaderboardScore(performance: AgentPerformance): number {
    // Weighted scoring system
    const pnlWeight = 0.4;
    const winRateWeight = 0.3;
    const sharpeWeight = 0.2;
    const tradeCountWeight = 0.1;

    // Normalize scores (0-100 scale)
    const pnlScore = Math.max(0, Math.min(100, performance.totalPnL * 0.1)); // $10 PnL = 1 point
    const winRateScore = Math.min(100, performance.winRate);
    const sharpeScore = Math.max(0, Math.min(100, (performance.sharpeRatio + 1) * 50)); // -1 to 1 Sharpe -> 0 to 100
    const tradeCountScore = Math.min(100, performance.totalTrades * 2); // 50 trades = max score

    return (
      pnlScore * pnlWeight +
      winRateScore * winRateWeight +
      sharpeScore * sharpeWeight +
      tradeCountScore * tradeCountWeight
    );
  }

  async getLeaderboard(): Promise<any[]> {
    try {
      const leaderboard = await redisService.get(this.PREFIXES.LEADERBOARD);
      return leaderboard || [];
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }

  // ===============================
  // HISTORICAL PERFORMANCE DATA
  // ===============================

  async getAgentPerformanceHistory(agentId: string, hours: number = 24): Promise<MetricsSnapshot[]> {
    try {
      const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
      const pattern = `${this.PREFIXES.PERFORMANCE_SNAPSHOT}${agentId}:*`;

      const keys = await redisService.getKeysByPattern(pattern);
      const snapshots: MetricsSnapshot[] = [];

      for (const key of keys) {
        const timestamp = parseInt(key.split(':').pop() || '0');
        if (timestamp >= cutoffTime) {
          const snapshot = await redisService.get(key);
          if (snapshot) {
            snapshots.push(snapshot);
          }
        }
      }

      return snapshots.sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    } catch (error) {
      console.error(`Error getting performance history for ${agentId}:`, error);
      return [];
    }
  }

  // ===============================
  // CLEANUP AND MAINTENANCE
  // ===============================

  async cleanupOldMetrics(): Promise<void> {
    try {
      const patterns = [
        `${this.PREFIXES.PERFORMANCE_SNAPSHOT}*`,
        `${this.PREFIXES.TRADE_METRICS}*`
      ];

      for (const pattern of patterns) {
        const keys = await redisService.getKeysByPattern(pattern);
        const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

        for (const key of keys) {
          const parts = key.split(':');
          const timestamp = parseInt(parts[parts.length - 1]);

          if (!isNaN(timestamp) && timestamp < cutoffTime) {
            await redisService.delete(key);
          }
        }
      }

      console.log('Old metrics cleanup completed');
    } catch (error) {
      console.error('Error cleaning up old metrics:', error);
    }
  }

  // ===============================
  // MONITORING DASHBOARD DATA
  // ===============================

  async getDashboardMetrics(): Promise<any> {
    try {
      const [systemMetrics, leaderboard] = await Promise.all([
        this.getSystemMetrics(),
        this.getLeaderboard()
      ]);

      // Get real-time stats from Redis
      const activeTraders = await this.getActiveTraderCount();
      const tradingVolume = await this.getTradingVolume();

      return {
        system: systemMetrics,
        leaderboard: leaderboard.slice(0, 10), // Top 10
        realTime: {
          activeTraders,
          tradingVolume,
          lastUpdated: new Date()
        }
      };
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      return null;
    }
  }

  private async getActiveTraderCount(): Promise<number> {
    try {
      const activeAgents = await ScalpingAgent.countDocuments({ isActive: true });
      return activeAgents;
    } catch (error) {
      return 0;
    }
  }

  private async getTradingVolume(): Promise<number> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const trades = await Trade.find({
        createdAt: { $gte: oneDayAgo },
        status: 'filled'
      });

      return trades.reduce((sum, trade) => sum + (trade.quantity * (trade.filledPrice || trade.price)), 0);
    } catch (error) {
      return 0;
    }
  }
}

export const performanceMetricsService = new PerformanceMetricsService();