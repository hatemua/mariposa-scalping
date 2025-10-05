import { ScalpingAgent, Trade, UserDashboardMetrics } from '../models';
import mongoose from 'mongoose';

interface DashboardSummary {
  totalAgents: number;
  activeAgents: number;
  totalPnL: number;
  todayPnL: number;
  weekPnL: number;
  monthPnL: number;
  totalTrades: number;
  totalWinRate: number;
  bestAgent: { name: string; pnl: number } | null;
  worstAgent: { name: string; pnl: number } | null;
}

interface AgentMetrics {
  agentId: string;
  agentName: string;
  symbol: string;
  strategyType: string;
  status: 'RUNNING' | 'STOPPED';
  pnl: number;
  todayPnL: number;
  trades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  lastTradeAt?: Date;
}

export class DashboardAnalyticsService {
  /**
   * Get complete dashboard summary for a user
   */
  async getUserDashboardSummary(userId: string): Promise<DashboardSummary> {
    try {
      const agents = await ScalpingAgent.find({ userId });
      const activeAgents = agents.filter(a => a.isActive);

      // Get all trades for the user
      const allTrades = await Trade.find({
        userId: new mongoose.Types.ObjectId(userId),
        status: 'filled',
      });

      // Calculate total PnL
      const totalPnL = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

      // Calculate today's PnL
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayPnL = allTrades
        .filter(t => t.createdAt >= todayStart)
        .reduce((sum, t) => sum + (t.pnl || 0), 0);

      // Calculate week PnL
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekPnL = allTrades
        .filter(t => t.createdAt >= weekStart)
        .reduce((sum, t) => sum + (t.pnl || 0), 0);

      // Calculate month PnL
      const monthStart = new Date();
      monthStart.setMonth(monthStart.getMonth() - 1);
      const monthPnL = allTrades
        .filter(t => t.createdAt >= monthStart)
        .reduce((sum, t) => sum + (t.pnl || 0), 0);

      // Calculate win rate
      const winningTrades = allTrades.filter(t => (t.pnl || 0) > 0).length;
      const totalWinRate = allTrades.length > 0 ? (winningTrades / allTrades.length) * 100 : 0;

      // Find best and worst agents
      const agentPerformances = await Promise.all(
        agents.map(async agent => {
          const agentTrades = allTrades.filter(
            t => t.agentId.toString() === (agent._id as any).toString()
          );
          const agentPnL = agentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
          return { name: agent.name, pnl: agentPnL };
        })
      );

      const sortedByPnL = agentPerformances.sort((a, b) => b.pnl - a.pnl);
      const bestAgent = sortedByPnL.length > 0 ? sortedByPnL[0] : null;
      const worstAgent = sortedByPnL.length > 0 ? sortedByPnL[sortedByPnL.length - 1] : null;

      return {
        totalAgents: agents.length,
        activeAgents: activeAgents.length,
        totalPnL,
        todayPnL,
        weekPnL,
        monthPnL,
        totalTrades: allTrades.length,
        totalWinRate,
        bestAgent,
        worstAgent,
      };
    } catch (error) {
      console.error('Error getting dashboard summary:', error);
      throw error;
    }
  }

  /**
   * Get detailed metrics for all user's agents
   */
  async getAllAgentMetrics(userId: string): Promise<AgentMetrics[]> {
    try {
      const agents = await ScalpingAgent.find({ userId });

      const metricsPromises = agents.map(agent =>
        this.getAgentDetailedMetrics((agent._id as any).toString())
      );

      const metrics = await Promise.all(metricsPromises);
      return metrics.filter(m => m !== null) as AgentMetrics[];
    } catch (error) {
      console.error('Error getting all agent metrics:', error);
      return [];
    }
  }

  /**
   * Get detailed metrics for a single agent
   */
  async getAgentDetailedMetrics(agentId: string): Promise<AgentMetrics | null> {
    try {
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) return null;

      const trades = await Trade.find({ agentId, status: 'filled' });

      // Calculate total PnL
      const pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

      // Calculate today's PnL
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayPnL = trades
        .filter(t => t.createdAt >= todayStart)
        .reduce((sum, t) => sum + (t.pnl || 0), 0);

      // Win rate
      const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
      const losingTrades = trades.filter(t => (t.pnl || 0) < 0);
      const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

      // Average profit and loss
      const avgProfit = winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
        : 0;
      const avgLoss = losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length
        : 0;

      // Max drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let runningPnL = 0;
      for (const trade of trades) {
        runningPnL += trade.pnl || 0;
        if (runningPnL > peak) peak = runningPnL;
        const drawdown = peak - runningPnL;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Sharpe ratio (simplified)
      const returns = trades.map(t => t.pnl || 0);
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const stdDev = returns.length > 0
        ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
        : 1;
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      // Profit factor
      const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

      // Last trade time
      const lastTrade = trades.length > 0 ? trades[trades.length - 1] : null;

      return {
        agentId: (agent._id as any).toString(),
        agentName: agent.name,
        symbol: agent.symbol,
        strategyType: agent.strategyType,
        status: agent.isActive ? 'RUNNING' : 'STOPPED',
        pnl,
        todayPnL,
        trades: trades.length,
        winRate,
        avgProfit,
        avgLoss,
        maxDrawdown: -maxDrawdown,
        sharpeRatio,
        profitFactor,
        lastTradeAt: lastTrade?.createdAt,
      };
    } catch (error) {
      console.error('Error getting agent metrics:', error);
      return null;
    }
  }

  /**
   * Get PnL time series data for charts
   */
  async getPnLTimeSeries(
    userId: string,
    timeRange: 'day' | 'week' | 'month' | 'year' = 'week',
    groupBy: 'hour' | 'day' = 'day'
  ): Promise<Array<{ date: Date; pnl: number; trades: number }>> {
    try {
      const startDate = this.getStartDate(timeRange);

      const trades = await Trade.find({
        userId: new mongoose.Types.ObjectId(userId),
        status: 'filled',
        createdAt: { $gte: startDate },
      }).sort({ createdAt: 1 });

      // Group by time period
      const grouped = new Map<string, { pnl: number; trades: number }>();

      for (const trade of trades) {
        const key = this.getTimeKey(trade.createdAt, groupBy);
        const existing = grouped.get(key) || { pnl: 0, trades: 0 };
        grouped.set(key, {
          pnl: existing.pnl + (trade.pnl || 0),
          trades: existing.trades + 1,
        });
      }

      // Convert to array and calculate cumulative PnL
      const result: Array<{ date: Date; pnl: number; trades: number }> = [];
      let cumulativePnL = 0;

      Array.from(grouped.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([key, value]) => {
          cumulativePnL += value.pnl;
          result.push({
            date: this.parseTimeKey(key, groupBy),
            pnl: cumulativePnL,
            trades: value.trades,
          });
        });

      return result;
    } catch (error) {
      console.error('Error getting PnL time series:', error);
      return [];
    }
  }

  /**
   * Get strategy performance breakdown
   */
  async getStrategyPerformance(userId: string): Promise<
    Array<{
      strategy: string;
      pnl: number;
      trades: number;
      winRate: number;
      agents: number;
    }>
  > {
    try {
      const agents = await ScalpingAgent.find({ userId });
      const strategies = new Map<string, {
        pnl: number;
        trades: number;
        wins: number;
        agentIds: Set<string>;
      }>();

      for (const agent of agents) {
        const agentTrades = await Trade.find({
          agentId: agent._id,
          status: 'filled',
        });

        const strategy = agent.strategyType;
        const existing = strategies.get(strategy) || {
          pnl: 0,
          trades: 0,
          wins: 0,
          agentIds: new Set(),
        };

        const pnl = agentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const wins = agentTrades.filter(t => (t.pnl || 0) > 0).length;

        strategies.set(strategy, {
          pnl: existing.pnl + pnl,
          trades: existing.trades + agentTrades.length,
          wins: existing.wins + wins,
          agentIds: existing.agentIds.add((agent._id as any).toString()),
        });
      }

      return Array.from(strategies.entries()).map(([strategy, data]) => ({
        strategy,
        pnl: data.pnl,
        trades: data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
        agents: data.agentIds.size,
      }));
    } catch (error) {
      console.error('Error getting strategy performance:', error);
      return [];
    }
  }

  /**
   * Cache dashboard metrics in database
   */
  async cacheUserMetrics(userId: string): Promise<void> {
    try {
      const summary = await this.getUserDashboardSummary(userId);
      const agentMetrics = await this.getAllAgentMetrics(userId);
      const dailyPnL = await this.getPnLTimeSeries(userId, 'month', 'day');
      const strategyPerf = await this.getStrategyPerformance(userId);

      const agentMetricsSummary = agentMetrics.map(m => ({
        agentId: new mongoose.Types.ObjectId(m.agentId),
        agentName: m.agentName,
        symbol: m.symbol,
        strategyType: m.strategyType,
        pnl: m.pnl,
        trades: m.trades,
        winRate: m.winRate,
        status: m.status,
        lastTradeAt: m.lastTradeAt,
      }));

      const strategyPerformance = new Map();
      strategyPerf.forEach(s => {
        strategyPerformance.set(s.strategy, {
          pnl: s.pnl,
          trades: s.trades,
          winRate: s.winRate,
        });
      });

      await UserDashboardMetrics.findOneAndUpdate(
        { userId: new mongoose.Types.ObjectId(userId) },
        {
          totalAgents: summary.totalAgents,
          activeAgents: summary.activeAgents,
          totalPnL: summary.totalPnL,
          todayPnL: summary.todayPnL,
          weekPnL: summary.weekPnL,
          monthPnL: summary.monthPnL,
          totalTrades: summary.totalTrades,
          totalWinRate: summary.totalWinRate,
          agentMetrics: agentMetricsSummary,
          dailyPnL: dailyPnL.map(d => ({ date: d.date, pnl: d.pnl, trades: d.trades })),
          strategyPerformance,
          lastUpdated: new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`Cached metrics for user ${userId}`);
    } catch (error) {
      console.error('Error caching user metrics:', error);
    }
  }

  private getStartDate(timeRange: 'day' | 'week' | 'month' | 'year'): Date {
    const now = new Date();
    switch (timeRange) {
      case 'day':
        now.setHours(0, 0, 0, 0);
        return now;
      case 'week':
        now.setDate(now.getDate() - 7);
        return now;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        return now;
      case 'year':
        now.setFullYear(now.getFullYear() - 1);
        return now;
    }
  }

  private getTimeKey(date: Date, groupBy: 'hour' | 'day'): string {
    if (groupBy === 'hour') {
      return date.toISOString().substring(0, 13); // YYYY-MM-DDTHH
    }
    return date.toISOString().substring(0, 10); // YYYY-MM-DD
  }

  private parseTimeKey(key: string, groupBy: 'hour' | 'day'): Date {
    if (groupBy === 'hour') {
      return new Date(key + ':00:00.000Z');
    }
    return new Date(key + 'T00:00:00.000Z');
  }
}

export const dashboardAnalyticsService = new DashboardAnalyticsService();
