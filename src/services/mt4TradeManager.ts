import { EventEmitter } from 'events';
import MT4Position from '../models/MT4Position';
import { Trade } from '../models';
import { mt4Service } from './mt4Service';
import { scalpingPatternService } from './scalpingPatternService';
import { marketDropDetector, DropAlert } from './marketDropDetector';
import { redisService } from './redisService';

export interface PositionMonitoringResult {
  positionsChecked: number;
  positionsClosed: number;
  closeReasons: string[];
  errors: string[];
}

export class MT4TradeManager extends EventEmitter {
  private readonly MONITORING_INTERVAL = 10000; // 10 seconds
  private readonly POSITION_CACHE_PREFIX = 'mt4_pos:';
  private readonly POSITION_CACHE_TTL = 300; // 5 minutes

  private isRunning = false;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();

    // Listen to market drop alerts
    marketDropDetector.on('drop_detected', async (alert: DropAlert) => {
      await this.handleMarketDrop(alert);
    });
  }

  /**
   * Start the MT4 trade manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  MT4 Trade Manager already running');
      return;
    }

    console.log('🤖 Starting MT4 Trade Manager...');

    this.isRunning = true;

    // Start monitoring loop
    this.monitorInterval = setInterval(async () => {
      await this.monitorOpenPositions();
    }, this.MONITORING_INTERVAL);

    console.log(`✅ MT4 Trade Manager started (monitoring every ${this.MONITORING_INTERVAL / 1000}s)`);
  }

  /**
   * Stop the trade manager
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.isRunning = false;
    console.log('⏹️  MT4 Trade Manager stopped');
  }

  /**
   * Monitor all open MT4 positions
   */
  private async monitorOpenPositions(): Promise<PositionMonitoringResult> {
    const result: PositionMonitoringResult = {
      positionsChecked: 0,
      positionsClosed: 0,
      closeReasons: [],
      errors: []
    };

    try {
      // Get all open positions from database
      const openPositions = await MT4Position.find({ status: 'open' }).populate('agentId userId');

      result.positionsChecked = openPositions.length;

      if (openPositions.length === 0) {
        return result; // No positions to monitor
      }

      console.log(`🔍 Monitoring ${openPositions.length} open MT4 positions...`);

      // Check each position
      for (const position of openPositions) {
        try {
          await this.checkPosition(position, result);
        } catch (error) {
          const errorMsg = `Error checking position ${position.ticket}: ${(error as Error).message}`;
          console.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      if (result.positionsClosed > 0) {
        console.log(
          `✅ Closed ${result.positionsClosed} positions. ` +
          `Reasons: ${result.closeReasons.join(', ')}`
        );
      }

    } catch (error) {
      console.error('Error monitoring open positions:', error);
      result.errors.push(`Monitor error: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Check individual position for close conditions
   */
  private async checkPosition(position: any, result: PositionMonitoringResult): Promise<void> {
    const { ticket, userId, agentId, symbol, side } = position;

    // Only auto-close LONG (buy) positions on SELL signals
    if (side !== 'buy') {
      return;
    }

    // Check for SELL signal from scalping pattern service
    const pattern = await scalpingPatternService.getLatestPattern('BTCUSDT');

    if (pattern && pattern.direction === 'SELL' && pattern.confidence >= 60) {
      console.log(
        `📉 SELL signal detected for ${symbol} (confidence: ${pattern.confidence}%) - ` +
        `Closing position ${ticket}`
      );

      // Debug logging for auto-close trigger
      console.log(`[MT4 TradeManager] Auto-close triggered:`, {
        ticket,
        symbol,
        side,
        reason: 'sell-signal',
        patternConfidence: pattern.confidence,
        patternDirection: pattern.direction,
        reasoning: pattern.reasoning.substring(0, 100) + '...'
      });

      await this.closePosition(ticket, userId._id.toString(), 'sell-signal', pattern.reasoning);

      result.positionsClosed++;
      result.closeReasons.push('sell-signal');

      return;
    }

    // Check MT4 for updated position status (in case closed manually or hit SL/TP)
    try {
      const mt4Position = await mt4Service.getOpenPositions(userId._id.toString(), symbol);

      // If position not found in MT4 open positions, it was closed
      const stillOpen = mt4Position.some((p: any) => p.ticket === ticket);

      if (!stillOpen) {
        console.log(`📍 Position ${ticket} no longer open in MT4 - Updating database`);

        // Mark as closed in database
        await this.updateClosedPosition(ticket, 'stop-loss'); // Could be SL, TP, or manual

        result.positionsClosed++;
        result.closeReasons.push('mt4-closed');
      } else {
        // Update current price for open position
        const mt4Pos = mt4Position.find((p: any) => p.ticket === ticket);
        if (mt4Pos && mt4Pos.currentPrice !== undefined && mt4Pos.profit !== undefined) {
          await this.updatePositionPrice(position, mt4Pos.currentPrice, mt4Pos.profit);
        }
      }

    } catch (error) {
      console.error(`Error checking MT4 status for position ${ticket}:`, error);
    }
  }

  /**
   * Close MT4 position
   */
  async closePosition(
    ticket: number,
    userId: string,
    reason: 'sell-signal' | 'market-drop' | 'manual' | 'stop-loss' | 'take-profit',
    notes?: string
  ): Promise<void> {
    try {
      console.log(`🔐 Closing MT4 position ${ticket} - Reason: ${reason}`);

      // Close via MT4 service
      const closedOrder = await mt4Service.closePosition(userId, ticket);

      // Update database
      const position = await MT4Position.findOne({ ticket });

      if (position) {
        position.status = reason === 'sell-signal' || reason === 'market-drop' ? 'auto-closed' : 'closed';
        position.closedAt = new Date();
        position.closeReason = reason;
        position.profit = closedOrder.profit;
        position.currentPrice = closedOrder.currentPrice;

        await position.save();

        // Also create/update Trade record
        await this.syncToTradeModel(position, notes);

        // Emit event
        this.emit('position_closed', {
          ticket,
          reason,
          profit: closedOrder.profit,
          timestamp: new Date()
        });

        console.log(
          `✅ Position ${ticket} closed successfully | ` +
          `Profit: $${closedOrder.profit.toFixed(2)} | Reason: ${reason}`
        );
      }

    } catch (error) {
      console.error(`Failed to close position ${ticket}:`, error);
      throw error;
    }
  }

  /**
   * Handle market drop event
   */
  private async handleMarketDrop(alert: DropAlert): Promise<void> {
    console.log(
      `🚨 MARKET DROP ALERT: ${alert.dropLevel.toUpperCase()} - ` +
      `${alert.priceChange.toFixed(2)}% drop detected`
    );

    // For severe drops, close ALL open positions immediately
    if (alert.dropLevel === 'severe') {
      console.log('⚠️  SEVERE DROP - Closing ALL open MT4 positions for protection');

      const openPositions = await MT4Position.find({ status: 'open', side: 'buy' });

      for (const position of openPositions) {
        try {
          await this.closePosition(
            position.ticket,
            position.userId.toString(),
            'market-drop',
            `Severe market drop: ${alert.priceChange.toFixed(2)}% in ${alert.timeframe}`
          );
        } catch (error) {
          console.error(`Failed to close position ${position.ticket} during market drop:`, error);
        }
      }

      // Publish alert to all users
      await redisService.publish('mt4_emergency', {
        type: 'positions_closed_market_drop',
        alert,
        positionsClosed: openPositions.length,
        timestamp: new Date()
      });
    }
  }

  /**
   * Track new MT4 position
   */
  async trackPosition(positionData: {
    userId: string;
    agentId: string;
    ticket: number;
    symbol: string;
    side: 'buy' | 'sell';
    lotSize: number;
    entryPrice: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<void> {
    try {
      // Debug logging
      console.log(`[MT4 TradeManager] Tracking new position:`, {
        ticket: positionData.ticket,
        agentId: positionData.agentId,
        symbol: positionData.symbol,
        side: positionData.side,
        lotSize: positionData.lotSize,
        entryPrice: positionData.entryPrice,
        stopLoss: positionData.stopLoss || 'none',
        takeProfit: positionData.takeProfit || 'none'
      });

      // Check if position already exists
      const existing = await MT4Position.findOne({ ticket: positionData.ticket });

      if (existing) {
        console.log(`⚠️  Position ${positionData.ticket} already tracked`);
        return;
      }

      // Create new position record
      const position = new MT4Position({
        userId: positionData.userId,
        agentId: positionData.agentId,
        ticket: positionData.ticket,
        symbol: positionData.symbol,
        side: positionData.side,
        lotSize: positionData.lotSize,
        entryPrice: positionData.entryPrice,
        currentPrice: positionData.entryPrice,
        stopLoss: positionData.stopLoss,
        takeProfit: positionData.takeProfit,
        status: 'open',
        openedAt: new Date()
      });

      await position.save();

      // Cache in Redis for fast access
      await this.cachePosition(position);

      console.log(
        `📝 Tracking new MT4 position | Ticket: ${positionData.ticket} | ` +
        `${positionData.side.toUpperCase()} ${positionData.lotSize} lots ${positionData.symbol} @ $${positionData.entryPrice}`
      );
      console.log(`[MT4 TradeManager] ✅ Position saved to database and cached`);

      // Emit event
      this.emit('position_opened', {
        ticket: positionData.ticket,
        symbol: positionData.symbol,
        side: positionData.side,
        lotSize: positionData.lotSize,
        entryPrice: positionData.entryPrice,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error tracking position:', error);
      throw error;
    }
  }

  /**
   * Update position price
   */
  private async updatePositionPrice(position: any, currentPrice: number, profit: number): Promise<void> {
    try {
      position.currentPrice = currentPrice;
      position.profit = profit;

      await position.save();

      // Update cache
      await this.cachePosition(position);

    } catch (error) {
      console.error(`Error updating position ${position.ticket} price:`, error);
    }
  }

  /**
   * Update closed position in database
   */
  private async updateClosedPosition(ticket: number, reason: string): Promise<void> {
    try {
      const position = await MT4Position.findOne({ ticket });

      if (position) {
        position.status = 'closed';
        position.closedAt = new Date();
        position.closeReason = reason as any;

        await position.save();

        // Sync to Trade model
        await this.syncToTradeModel(position);

        // Remove from cache
        await this.removeCachedPosition(ticket);
      }

    } catch (error) {
      console.error(`Error updating closed position ${ticket}:`, error);
    }
  }

  /**
   * Sync position to Trade model
   */
  private async syncToTradeModel(position: any, notes?: string): Promise<void> {
    try {
      // Check if trade already exists
      let trade = await Trade.findOne({ mt4Ticket: position.ticket });

      if (!trade) {
        // Create new trade
        trade = new Trade({
          userId: position.userId,
          agentId: position.agentId,
          symbol: position.symbol, // Symbol mapping now correct - no workaround needed
          side: position.side,
          type: 'market',
          quantity: position.lotSize,
          price: position.entryPrice,
          filledPrice: position.entryPrice,
          filledQuantity: position.lotSize,
          status: position.status === 'open' ? 'filled' : 'filled',
          pnl: position.profit || 0,
          mt4Ticket: position.ticket,
          performanceNotes: notes
        });
      } else {
        // Update existing trade
        trade.pnl = position.profit || 0;
        trade.status = 'filled';
        if (notes) {
          trade.performanceNotes = notes;
        }
      }

      await trade.save();

    } catch (error) {
      console.error(`Error syncing position ${position.ticket} to Trade model:`, error);
    }
  }

  /**
   * Cache position in Redis
   */
  private async cachePosition(position: any): Promise<void> {
    try {
      const key = `${this.POSITION_CACHE_PREFIX}${position.ticket}`;
      const data = {
        ticket: position.ticket,
        userId: position.userId,
        agentId: position.agentId,
        symbol: position.symbol,
        side: position.side,
        lotSize: position.lotSize,
        entryPrice: position.entryPrice,
        currentPrice: position.currentPrice,
        profit: position.profit,
        status: position.status
      };

      await redisService.set(key, JSON.stringify(data), this.POSITION_CACHE_TTL);

    } catch (error) {
      console.error('Error caching position:', error);
    }
  }

  /**
   * Remove cached position
   */
  private async removeCachedPosition(ticket: number): Promise<void> {
    try {
      const key = `${this.POSITION_CACHE_PREFIX}${ticket}`;
      await redisService.del(key);
    } catch (error) {
      console.error('Error removing cached position:', error);
    }
  }

  /**
   * Get all open positions
   */
  async getOpenPositions(userId?: string, agentId?: string): Promise<any[]> {
    try {
      const filter: any = { status: 'open' };

      if (userId) filter.userId = userId;
      if (agentId) filter.agentId = agentId;

      return await MT4Position.find(filter).populate('agentId userId');

    } catch (error) {
      console.error('Error getting open positions:', error);
      return [];
    }
  }

  /**
   * Get position statistics
   */
  async getPositionStats(userId?: string): Promise<any> {
    try {
      const filter: any = {};
      if (userId) filter.userId = userId;

      const [totalPositions, openPositions, closedPositions, autoClosedPositions] = await Promise.all([
        MT4Position.countDocuments(filter),
        MT4Position.countDocuments({ ...filter, status: 'open' }),
        MT4Position.countDocuments({ ...filter, status: 'closed' }),
        MT4Position.countDocuments({ ...filter, status: 'auto-closed' })
      ]);

      // Calculate P&L
      const positions = await MT4Position.find({ ...filter, status: { $ne: 'open' } });
      const totalProfit = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
      const winningTrades = positions.filter(p => (p.profit || 0) > 0).length;
      const losingTrades = positions.filter(p => (p.profit || 0) < 0).length;
      const winRate = totalPositions > 0 ? (winningTrades / (winningTrades + losingTrades)) * 100 : 0;

      return {
        totalPositions,
        openPositions,
        closedPositions,
        autoClosedPositions,
        totalProfit: totalProfit.toFixed(2),
        winningTrades,
        losingTrades,
        winRate: winRate.toFixed(2),
        isRunning: this.isRunning
      };

    } catch (error) {
      console.error('Error getting position stats:', error);
      return null;
    }
  }

  /**
   * Manual close position (for admin/user action)
   */
  async manualClosePosition(ticket: number, userId: string): Promise<void> {
    await this.closePosition(ticket, userId, 'manual', 'Manually closed by user');
  }
}

export const mt4TradeManager = new MT4TradeManager();
