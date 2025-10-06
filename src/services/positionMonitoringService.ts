import { ScalpingAgent, Trade } from '../models';
import { redisService } from './redisService';
import { okxService } from './okxService';
import { binanceService } from './binanceService';
import { SymbolConverter } from '../utils/symbolConverter';

interface OpenPosition {
  agentId: string;
  tradeId: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  entryTime: Date;
  lastPnLCheck: Date;
  targetPrice?: number;
  stopLoss?: number;
}

interface PnLChangeEvent {
  agentId: string;
  position: OpenPosition;
  previousPnL: number;
  currentPnL: number;
  changePercent: number;
  timestamp: Date;
}

export class PositionMonitoringService {
  private readonly PNL_CHECK_INTERVAL = 5000; // 5 seconds
  private readonly SIGNIFICANT_CHANGE_THRESHOLD = 0.5; // 0.5% change triggers event
  private readonly POSITION_CACHE_PREFIX = 'position:';
  private readonly PNL_HISTORY_PREFIX = 'pnl_history:';

  /**
   * Monitor all open positions for a specific agent
   */
  async monitorAgentPositions(agentId: string): Promise<PnLChangeEvent[]> {
    try {
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent || !agent.isActive) {
        return [];
      }

      // Get all open trades for this agent
      const openTrades = await Trade.find({
        agentId,
        status: { $in: ['pending', 'filled'] }
      }).sort({ createdAt: -1 });

      if (openTrades.length === 0) {
        return [];
      }

      const pnlEvents: PnLChangeEvent[] = [];

      // Check each position
      for (const trade of openTrades) {
        try {
          const position = await this.buildPosition(trade, agent);
          if (!position) continue;

          const event = await this.checkPnLChange(position);
          if (event) {
            pnlEvents.push(event);

            // Publish event to Redis for agent workers to consume
            await redisService.publish(`pnl_change:${agentId}`, {
              type: 'pnl_change',
              data: event
            });
          }

          // Cache the position for quick access
          await this.cachePosition(position);

        } catch (error) {
          console.error(`Error monitoring position for trade ${trade._id}:`, error);
        }
      }

      return pnlEvents;
    } catch (error) {
      console.error(`Error monitoring agent ${agentId} positions:`, error);
      return [];
    }
  }

  /**
   * Build position data from trade
   */
  private async buildPosition(trade: any, agent: any): Promise<OpenPosition | null> {
    try {
      // Get current market price
      const currentPrice = await this.getCurrentPrice(trade.symbol);
      if (!currentPrice) {
        return null;
      }

      const entryPrice = trade.filledPrice || trade.price;
      const quantity = trade.filledQuantity || trade.quantity;

      // Calculate unrealized PnL
      let unrealizedPnL: number;
      if (trade.side === 'buy') {
        unrealizedPnL = (currentPrice - entryPrice) * quantity;
      } else {
        unrealizedPnL = (entryPrice - currentPrice) * quantity;
      }

      const unrealizedPnLPercent = (unrealizedPnL / (entryPrice * quantity)) * 100;

      return {
        agentId: agent._id.toString(),
        tradeId: trade._id.toString(),
        symbol: trade.symbol,
        side: trade.side,
        entryPrice,
        currentPrice,
        quantity,
        unrealizedPnL,
        unrealizedPnLPercent,
        entryTime: trade.createdAt,
        lastPnLCheck: new Date(),
        targetPrice: undefined, // Can be set from agent config
        stopLoss: undefined // Can be set from agent config
      };
    } catch (error) {
      console.error('Error building position:', error);
      return null;
    }
  }

  /**
   * Get current market price for a symbol
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const normalizedSymbol = SymbolConverter.normalize(symbol);

      // Try to get from cache first
      const cacheKey = `current_price:${normalizedSymbol}`;
      const cachedPrice = await redisService.get(cacheKey);
      if (cachedPrice) {
        return parseFloat(cachedPrice);
      }

      // Get from Binance (more reliable for price data)
      const symbolInfo = await binanceService.getSymbolInfo(normalizedSymbol);
      const price = parseFloat(symbolInfo.lastPrice || symbolInfo.price || '0');

      if (price > 0) {
        // Cache for 5 seconds
        await redisService.set(cacheKey, price.toString(), { ttl: 5 });
        return price;
      }

      return null;
    } catch (error) {
      console.error(`Error getting current price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Check if PnL has changed significantly and create event
   */
  private async checkPnLChange(position: OpenPosition): Promise<PnLChangeEvent | null> {
    try {
      // Get previous PnL from cache
      const historyKey = `${this.PNL_HISTORY_PREFIX}${position.agentId}:${position.tradeId}`;
      const previousPnLStr = await redisService.get(historyKey);

      if (!previousPnLStr) {
        // First check - store current PnL
        await redisService.set(historyKey, position.unrealizedPnL.toString(), { ttl: 3600 });
        return null;
      }

      const previousPnL = parseFloat(previousPnLStr);
      const currentPnL = position.unrealizedPnL;

      // Calculate change percentage
      const changeAmount = Math.abs(currentPnL - previousPnL);
      const changePercent = previousPnL !== 0
        ? (changeAmount / Math.abs(previousPnL)) * 100
        : 100;

      // Check if change is significant
      if (changePercent >= this.SIGNIFICANT_CHANGE_THRESHOLD) {
        // Update stored PnL
        await redisService.set(historyKey, currentPnL.toString(), { ttl: 3600 });

        return {
          agentId: position.agentId,
          position,
          previousPnL,
          currentPnL,
          changePercent,
          timestamp: new Date()
        };
      }

      return null;
    } catch (error) {
      console.error('Error checking PnL change:', error);
      return null;
    }
  }

  /**
   * Cache position for quick access
   */
  private async cachePosition(position: OpenPosition): Promise<void> {
    const key = `${this.POSITION_CACHE_PREFIX}${position.agentId}:${position.tradeId}`;
    await redisService.set(key, position, { ttl: 300 }); // 5 minutes cache
  }

  /**
   * Get all cached positions for an agent
   */
  async getAgentPositions(agentId: string): Promise<OpenPosition[]> {
    try {
      const pattern = `${this.POSITION_CACHE_PREFIX}${agentId}:*`;
      const keys = await redisService.getKeysByPattern(pattern);

      const positions: OpenPosition[] = [];
      for (const key of keys) {
        const position = await redisService.get(key);
        if (position) {
          positions.push(position);
        }
      }

      return positions;
    } catch (error) {
      console.error(`Error getting positions for agent ${agentId}:`, error);
      return [];
    }
  }

  /**
   * Get position summary for an agent
   */
  async getPositionSummary(agentId: string): Promise<{
    totalPositions: number;
    totalUnrealizedPnL: number;
    profitablePositions: number;
    losingPositions: number;
    avgPnLPercent: number;
  }> {
    const positions = await this.getAgentPositions(agentId);

    const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
    const profitablePositions = positions.filter(p => p.unrealizedPnL > 0).length;
    const losingPositions = positions.filter(p => p.unrealizedPnL < 0).length;
    const avgPnLPercent = positions.length > 0
      ? positions.reduce((sum, p) => sum + p.unrealizedPnLPercent, 0) / positions.length
      : 0;

    return {
      totalPositions: positions.length,
      totalUnrealizedPnL,
      profitablePositions,
      losingPositions,
      avgPnLPercent
    };
  }

  /**
   * Check if position should trigger stop loss
   */
  async shouldTriggerStopLoss(position: OpenPosition, agent: any): Promise<boolean> {
    // If agent has config with stop loss percentage
    if (agent.config?.stopLossPercentage) {
      const stopLossThreshold = -agent.config.stopLossPercentage;
      return position.unrealizedPnLPercent <= stopLossThreshold;
    }

    // For intelligent agents, use risk level based stop loss
    const riskLevelStopLoss = [-2, -3, -4, -5, -7]; // % loss thresholds
    const stopLossThreshold = riskLevelStopLoss[agent.riskLevel - 1] || -4;

    return position.unrealizedPnLPercent <= stopLossThreshold;
  }

  /**
   * Check if position should trigger take profit
   */
  async shouldTriggerTakeProfit(position: OpenPosition, agent: any): Promise<boolean> {
    // If agent has config with take profit percentage
    if (agent.config?.takeProfitPercentage) {
      return position.unrealizedPnLPercent >= agent.config.takeProfitPercentage;
    }

    // For intelligent agents, use risk level based take profit
    const riskLevelTakeProfit = [3, 2.5, 2, 1.5, 1]; // % profit thresholds
    const takeProfitThreshold = riskLevelTakeProfit[agent.riskLevel - 1] || 2;

    return position.unrealizedPnLPercent >= takeProfitThreshold;
  }

  /**
   * Monitor all active agents
   */
  async monitorAllActiveAgents(): Promise<void> {
    try {
      const activeAgents = await ScalpingAgent.find({ isActive: true });

      console.log(`Monitoring positions for ${activeAgents.length} active agents`);

      for (const agent of activeAgents) {
        try {
          await this.monitorAgentPositions(agent._id.toString());
        } catch (error) {
          console.error(`Error monitoring agent ${agent._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error monitoring all active agents:', error);
    }
  }

  /**
   * Subscribe to PnL change events for an agent
   */
  async subscribeToPnLChanges(agentId: string, callback: (event: PnLChangeEvent) => void): Promise<void> {
    const channel = `pnl_change:${agentId}`;
    await redisService.subscribe(channel, (message) => {
      if (message.type === 'pnl_change') {
        callback(message.data);
      }
    });
  }

  /**
   * Clean up old position data
   */
  async cleanup(): Promise<void> {
    try {
      // Clean position cache older than 5 minutes
      const positionKeys = await redisService.getKeysByPattern(`${this.POSITION_CACHE_PREFIX}*`);

      for (const key of positionKeys) {
        const position = await redisService.get(key);
        if (position && position.lastPnLCheck) {
          const age = Date.now() - new Date(position.lastPnLCheck).getTime();
          if (age > 300000) { // 5 minutes
            await redisService.delete(key);
          }
        }
      }

      console.log('Position monitoring cleanup completed');
    } catch (error) {
      console.error('Error during position monitoring cleanup:', error);
    }
  }
}

export const positionMonitoringService = new PositionMonitoringService();
