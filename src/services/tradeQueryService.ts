import { Trade, ScalpingAgent } from '../models';
import mongoose, { FilterQuery } from 'mongoose';

export interface TradeFilters {
  // Agent filters
  agentIds?: string[];
  strategyTypes?: string[];
  tradingCategories?: string[];

  // Trade filters
  symbols?: string[];
  sides?: ('buy' | 'sell')[];
  status?: ('pending' | 'filled' | 'cancelled' | 'rejected')[];

  // Time filters
  dateFrom?: Date;
  dateTo?: Date;
  timeRange?: 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all';

  // Performance filters
  minPnL?: number;
  maxPnL?: number;
  onlyWinners?: boolean;
  onlyLosers?: boolean;

  // LLM validation filters
  minLLMConfidence?: number;
  wasLLMValidated?: boolean;

  // Pagination
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TradeQueryResult {
  trades: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  summary: {
    totalTrades: number;
    totalPnL: number;
    winRate: number;
    avgPnL: number;
  };
}

export class TradeQueryService {
  /**
   * Query trades with advanced filtering
   */
  async queryTrades(userId: string, filters: TradeFilters): Promise<TradeQueryResult> {
    try {
      // Build MongoDB query
      const query = await this.buildQuery(userId, filters);

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const skip = (page - 1) * limit;

      // Sorting
      const sortBy = filters.sortBy || 'createdAt';
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
      const sort: any = { [sortBy]: sortOrder };

      // Execute query
      const [trades, total] = await Promise.all([
        Trade.find(query)
          .populate('agentId', 'name symbol strategyType')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Trade.countDocuments(query),
      ]);

      // Calculate summary
      const allTrades = await Trade.find(query).select('pnl').lean();
      const totalPnL = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winningTrades = allTrades.filter(t => (t.pnl || 0) > 0).length;
      const winRate = allTrades.length > 0 ? (winningTrades / allTrades.length) * 100 : 0;
      const avgPnL = allTrades.length > 0 ? totalPnL / allTrades.length : 0;

      return {
        trades,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        summary: {
          totalTrades: allTrades.length,
          totalPnL,
          winRate,
          avgPnL,
        },
      };
    } catch (error) {
      console.error('Error querying trades:', error);
      throw error;
    }
  }

  /**
   * Build MongoDB query from filters
   */
  private async buildQuery(userId: string, filters: TradeFilters): Promise<FilterQuery<any>> {
    const query: FilterQuery<any> = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    // Agent filters
    if (filters.agentIds && filters.agentIds.length > 0) {
      query.agentId = { $in: filters.agentIds.map(id => new mongoose.Types.ObjectId(id)) };
    }

    // Strategy type filter (requires joining with ScalpingAgent)
    if (filters.strategyTypes && filters.strategyTypes.length > 0) {
      const agents = await ScalpingAgent.find({
        userId: new mongoose.Types.ObjectId(userId),
        strategyType: { $in: filters.strategyTypes },
      }).select('_id');

      const agentIds = agents.map(a => a._id);
      if (query.agentId) {
        // Intersect with existing agentId filter
        const existingIds = Array.isArray(query.agentId.$in) ? query.agentId.$in : [query.agentId];
        query.agentId = {
          $in: agentIds.filter(id => existingIds.some((eid: any) => eid.equals(id))),
        };
      } else {
        query.agentId = { $in: agentIds };
      }
    }

    // Trading category filter
    if (filters.tradingCategories && filters.tradingCategories.length > 0) {
      const agents = await ScalpingAgent.find({
        userId: new mongoose.Types.ObjectId(userId),
        tradingCategory: { $in: filters.tradingCategories },
      }).select('_id');

      const agentIds = agents.map(a => a._id);
      if (query.agentId) {
        const existingIds = Array.isArray(query.agentId.$in) ? query.agentId.$in : [query.agentId];
        query.agentId = {
          $in: agentIds.filter(id => existingIds.some((eid: any) => eid.equals(id))),
        };
      } else {
        query.agentId = { $in: agentIds };
      }
    }

    // Symbol filter
    if (filters.symbols && filters.symbols.length > 0) {
      query.symbol = { $in: filters.symbols.map(s => s.toUpperCase()) };
    }

    // Side filter
    if (filters.sides && filters.sides.length > 0) {
      query.side = { $in: filters.sides };
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      query.status = { $in: filters.status };
    }

    // Time range filter
    if (filters.timeRange) {
      const timeFilter = this.getTimeRangeFilter(filters.timeRange);
      if (timeFilter) {
        query.createdAt = timeFilter;
      }
    }

    // Date range filter (overrides timeRange if both provided)
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) {
        query.createdAt.$gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        query.createdAt.$lte = filters.dateTo;
      }
    }

    // PnL filters
    if (filters.minPnL !== undefined || filters.maxPnL !== undefined) {
      query.pnl = {};
      if (filters.minPnL !== undefined) {
        query.pnl.$gte = filters.minPnL;
      }
      if (filters.maxPnL !== undefined) {
        query.pnl.$lte = filters.maxPnL;
      }
    }

    // Winners/Losers filter
    if (filters.onlyWinners) {
      query.pnl = { ...query.pnl, $gt: 0 };
    } else if (filters.onlyLosers) {
      query.pnl = { ...query.pnl, $lt: 0 };
    }

    // LLM confidence filter
    if (filters.minLLMConfidence !== undefined) {
      query.expectedWinProbability = { $gte: filters.minLLMConfidence };
    }

    // LLM validated filter
    if (filters.wasLLMValidated !== undefined) {
      if (filters.wasLLMValidated) {
        query.llmValidationScore = { $exists: true, $ne: null };
      } else {
        query.$or = [
          { llmValidationScore: { $exists: false } },
          { llmValidationScore: null },
        ];
      }
    }

    return query;
  }

  /**
   * Get time range filter
   */
  private getTimeRangeFilter(timeRange: string): any {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        return { $gte: startDate };

      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { $gte: yesterday, $lte: yesterdayEnd };

      case 'week':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        return { $gte: startDate };

      case 'month':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        return { $gte: startDate };

      case 'year':
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        return { $gte: startDate };

      case 'all':
      default:
        return undefined;
    }
  }

  /**
   * Get available filter options for a user
   */
  async getFilterOptions(userId: string): Promise<{
    agents: Array<{ id: string; name: string; symbol: string }>;
    symbols: string[];
    strategyTypes: string[];
    tradingCategories: string[];
  }> {
    try {
      const agents = await ScalpingAgent.find({ userId }).lean();

      const agentOptions = agents.map(a => ({
        id: a._id.toString(),
        name: a.name,
        symbol: a.symbol,
      }));

      const symbols = [...new Set(agents.map(a => a.symbol))];
      const strategyTypes = [...new Set(agents.map(a => a.strategyType))];
      const tradingCategories = [...new Set(agents.map(a => a.tradingCategory))];

      return {
        agents: agentOptions,
        symbols,
        strategyTypes,
        tradingCategories,
      };
    } catch (error) {
      console.error('Error getting filter options:', error);
      return {
        agents: [],
        symbols: [],
        strategyTypes: [],
        tradingCategories: [],
      };
    }
  }

  /**
   * Get trade distribution (for charts)
   */
  async getTradeDistribution(
    userId: string,
    filters: TradeFilters
  ): Promise<{
    byOutcome: { wins: number; losses: number; breakeven: number };
    byHour: Array<{ hour: number; count: number; pnl: number }>;
    bySymbol: Array<{ symbol: string; count: number; pnl: number }>;
    byStrategy: Array<{ strategy: string; count: number; pnl: number }>;
  }> {
    try {
      const query = await this.buildQuery(userId, filters);
      const trades = await Trade.find(query).populate('agentId', 'strategyType').lean();

      // By outcome
      const wins = trades.filter(t => (t.pnl || 0) > 0.5).length;
      const losses = trades.filter(t => (t.pnl || 0) < -0.5).length;
      const breakeven = trades.length - wins - losses;

      // By hour
      const hourlyMap = new Map<number, { count: number; pnl: number }>();
      trades.forEach(t => {
        const hour = new Date(t.createdAt).getHours();
        const existing = hourlyMap.get(hour) || { count: 0, pnl: 0 };
        hourlyMap.set(hour, {
          count: existing.count + 1,
          pnl: existing.pnl + (t.pnl || 0),
        });
      });

      const byHour = Array.from(hourlyMap.entries())
        .map(([hour, data]) => ({ hour, ...data }))
        .sort((a, b) => a.hour - b.hour);

      // By symbol
      const symbolMap = new Map<string, { count: number; pnl: number }>();
      trades.forEach(t => {
        const existing = symbolMap.get(t.symbol) || { count: 0, pnl: 0 };
        symbolMap.set(t.symbol, {
          count: existing.count + 1,
          pnl: existing.pnl + (t.pnl || 0),
        });
      });

      const bySymbol = Array.from(symbolMap.entries())
        .map(([symbol, data]) => ({ symbol, ...data }))
        .sort((a, b) => b.pnl - a.pnl);

      // By strategy
      const strategyMap = new Map<string, { count: number; pnl: number }>();
      trades.forEach(t => {
        const strategy = (t.agentId as any)?.strategyType || 'UNKNOWN';
        const existing = strategyMap.get(strategy) || { count: 0, pnl: 0 };
        strategyMap.set(strategy, {
          count: existing.count + 1,
          pnl: existing.pnl + (t.pnl || 0),
        });
      });

      const byStrategy = Array.from(strategyMap.entries())
        .map(([strategy, data]) => ({ strategy, ...data }))
        .sort((a, b) => b.pnl - a.pnl);

      return {
        byOutcome: { wins, losses, breakeven },
        byHour,
        bySymbol,
        byStrategy,
      };
    } catch (error) {
      console.error('Error getting trade distribution:', error);
      return {
        byOutcome: { wins: 0, losses: 0, breakeven: 0 },
        byHour: [],
        bySymbol: [],
        byStrategy: [],
      };
    }
  }
}

export const tradeQueryService = new TradeQueryService();
