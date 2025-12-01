import { Trade } from '../models';
import MT4Position from '../models/MT4Position';
import { btcMultiPatternScalpingService } from './btcMultiPatternScalpingService';
import { mt4Service } from './mt4Service';
import { telegramService } from './telegramService';

interface MonitoredPosition {
  tradeId: string;
  userId: string;
  agentId: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  entryTime: Date;
  entrySignalData: any; // Store original signal data for comparison
  lastCheckTime: Date;
  mt4Ticket?: number;
}

export class PositionMonitorService {
  private monitoredPositions: Map<string, MonitoredPosition> = new Map();

  /**
   * Add a position to monitoring
   */
  async addPosition(
    tradeId: string,
    userId: string,
    agentId: string,
    symbol: string,
    entryPrice: number,
    entrySignalData: any,
    mt4Ticket?: number
  ): Promise<void> {
    const position: MonitoredPosition = {
      tradeId,
      userId,
      agentId,
      symbol,
      entryPrice,
      currentPrice: entryPrice,
      entryTime: new Date(),
      entrySignalData,
      lastCheckTime: new Date(),
      mt4Ticket
    };

    this.monitoredPositions.set(tradeId, position);
    console.log(`📊 Added position ${tradeId} to monitoring (${symbol} @ $${entryPrice})`);
  }

  /**
   * Remove a position from monitoring (when closed)
   */
  removePosition(tradeId: string): void {
    if (this.monitoredPositions.has(tradeId)) {
      this.monitoredPositions.delete(tradeId);
      console.log(`🗑️ Removed position ${tradeId} from monitoring`);
    }
  }

  /**
   * Monitor all open Fibonacci scalping positions
   * Called every 1 minute by Agenda job
   */
  async monitorAllPositions(): Promise<void> {
    try {
      console.log(`🔍 Monitoring ${this.monitoredPositions.size} positions...`);

      if (this.monitoredPositions.size === 0) {
        return;
      }

      // Process each position
      const monitorPromises = Array.from(this.monitoredPositions.values()).map(
        position => this.monitorPosition(position)
      );

      await Promise.all(monitorPromises);
    } catch (error: any) {
      console.error('❌ Error monitoring positions:', error.message);
    }
  }

  /**
   * Monitor a single position
   */
  private async monitorPosition(position: MonitoredPosition): Promise<void> {
    try {
      // Only monitor BTC Fibonacci scalping positions
      if (position.symbol !== 'BTCUSDT' || position.entrySignalData?.category !== 'FIBONACCI_SCALPING') {
        return;
      }

      // Get current position status from MT4Position collection
      const mt4Position = await MT4Position.findOne({ ticket: position.mt4Ticket });
      if (!mt4Position || mt4Position.status !== 'open') {
        // Position already closed or cancelled - remove from monitoring
        console.log(`📍 Position ${position.mt4Ticket} no longer open (status: ${mt4Position?.status || 'not found'}) - removing from monitoring`);
        this.removePosition(position.tradeId);
        return;
      }

      // NOTE: MT4 position verification is handled by mt4TradeManager (every 3 seconds)
      // which updates MT4Position.status in the database. The check above (status !== 'open')
      // is sufficient - no need to call MT4 API here to avoid overloading the bridge.

      // Get current price and P&L
      let currentPrice = position.entryPrice;
      let currentPnL = 0;
      let currentPnLPercent = 0;

      // Fetch LIVE position data from MT4 (not from stale DB)
      if (position.mt4Ticket) {
        try {
          const mt4Positions = await mt4Service.getOpenPositions(position.userId);
          const livePosition = mt4Positions.find((p: any) => p.ticket === position.mt4Ticket);

          if (livePosition) {
            currentPrice = livePosition.currentPrice || livePosition.openPrice || currentPrice;
            currentPnL = livePosition.profit || 0;  // Real profit from MT4

            // Calculate PnL percentage
            const lotSize = livePosition.volume || mt4Position?.lotSize || 0.01;
            const positionValue = position.entryPrice * lotSize;

            if (positionValue > 0) {
              currentPnLPercent = (currentPnL / positionValue) * 100;
            } else {
              // Fallback: Calculate from price change
              const priceChange = currentPrice - position.entryPrice;
              currentPnLPercent = (priceChange / position.entryPrice) * 100;
            }

            // Also update the MT4Position document for consistency
            if (mt4Position) {
              mt4Position.currentPrice = currentPrice;
              mt4Position.profit = currentPnL;
              await mt4Position.save();
            }
          } else if (mt4Position) {
            // Fallback to DB values if live position not found
            currentPrice = mt4Position.currentPrice || currentPrice;
            currentPnL = mt4Position.profit || 0;
            const lotSize = mt4Position.lotSize || 0.01;
            const positionValue = position.entryPrice * lotSize;
            if (positionValue > 0) {
              currentPnLPercent = (currentPnL / positionValue) * 100;
            }
          }
        } catch (error: any) {
          console.warn(`⚠️ Could not fetch MT4 position ${position.mt4Ticket}:`, error.message);
          // Continue with monitoring even if MT4 data unavailable
        }
      }

      // Update current price
      position.currentPrice = currentPrice;
      position.lastCheckTime = new Date();

      // Generate exit signal based on current market conditions
      const exitSignal = await btcMultiPatternScalpingService.generateExitSignal(
        position.entryPrice,
        currentPnLPercent,
        position.entrySignalData
      );

      console.log(`📊 Position ${position.tradeId}: Price $${currentPrice.toFixed(2)}, P&L $${currentPnL.toFixed(2)} (${currentPnLPercent.toFixed(2)}%), Exit signal: ${exitSignal.shouldExit ? 'YES' : 'NO'} (${exitSignal.confidence.toFixed(0)}%)`);

      // Act on exit signal
      if (exitSignal.shouldExit) {
        await this.executeExit(position, exitSignal, mt4Position);
      }
    } catch (error: any) {
      console.error(`❌ Error monitoring position ${position.tradeId}:`, error.message);
    }
  }

  /**
   * Execute exit (close position)
   */
  private async executeExit(
    position: MonitoredPosition,
    exitSignal: any,
    trade: any
  ): Promise<void> {
    try {
      console.log(`🚪 Executing ${exitSignal.exitType} exit for position ${position.tradeId}`);
      console.log(`   Reason: ${exitSignal.reason}`);

      if (!position.mt4Ticket) {
        console.warn('⚠️ No MT4 ticket found, cannot close position');
        return;
      }

      // Verify position still exists in MT4 before attempting close
      const mt4OpenPositions = await mt4Service.getOpenPositions(
        trade.userId.toString(),
        position.symbol
      );
      const positionExistsInMT4 = mt4OpenPositions.some(
        (p: any) => p.ticket === position.mt4Ticket
      );

      if (!positionExistsInMT4) {
        console.log(`📍 Position ${position.mt4Ticket} no longer exists in MT4 - removing from monitoring`);
        this.removePosition(position.tradeId);
        // Update MT4Position record
        await MT4Position.updateOne(
          { ticket: position.mt4Ticket },
          { $set: { status: 'closed', closedAt: new Date(), closeReason: 'mt4-already-closed' } }
        );
        return;
      }

      // Full exit: Close entire position
      if (exitSignal.exitType === 'FULL') {
        const closeResult = await mt4Service.closePosition(
          trade.userId.toString(),
          position.mt4Ticket
        );

        // Check for success based on ticket being returned (status may not be 'closed' due to minimal response)
        if (closeResult && closeResult.ticket) {
          console.log(`✅ Position ${position.tradeId} closed successfully (ticket: ${closeResult.ticket})`);

          // Update trade record
          trade.status = 'filled'; // Keep as filled but add close info
          trade.closeReason = 'early-exit-llm';
          trade.performanceNotes = `LLM early exit: ${exitSignal.reason} (${exitSignal.confidence.toFixed(0)}% confidence)`;
          trade.pnl = closeResult.profit || 0;
          await trade.save();

          // Remove from monitoring
          this.removePosition(position.tradeId);

          // Send notification
          await this.sendExitNotification(position, exitSignal, closeResult.profit || 0);
        } else {
          console.error(`❌ Failed to close position ${position.tradeId}`);
        }
      }

      // Partial exit: Close portion of position
      else if (exitSignal.exitType === 'PARTIAL' && exitSignal.partialExitPercentage) {
        console.log(`📉 Partial exit (${exitSignal.partialExitPercentage}%) not yet implemented for MT4`);
        // TODO: Implement partial close if MT4 bridge supports it
        // For now, we'll skip partial exits
      }
    } catch (error: any) {
      console.error(`❌ Error executing exit for ${position.tradeId}:`, error.message);
    }
  }

  /**
   * Send notification about exit
   */
  private async sendExitNotification(
    position: MonitoredPosition,
    exitSignal: any,
    finalPnL: number
  ): Promise<void> {
    try {
      const message = `
🚪 **Position Closed (LLM Exit)**

Symbol: ${position.symbol}
Entry: $${position.entryPrice.toFixed(2)}
Exit: $${position.currentPrice.toFixed(2)}
P&L: ${finalPnL >= 0 ? '+' : ''}$${finalPnL.toFixed(2)}

**Reason:** ${exitSignal.reason}
**Confidence:** ${exitSignal.confidence.toFixed(0)}%

**LLM Recommendations:**
• Fibonacci: ${exitSignal.llmRecommendations.fibonacci.reason}
• Chart Pattern: ${exitSignal.llmRecommendations.chartPattern.reason}
• Candlestick: ${exitSignal.llmRecommendations.candlestick.reason}
• S/R: ${exitSignal.llmRecommendations.supportResistance.reason}
`;

      // Try to send via telegram service if available
      if (telegramService && typeof (telegramService as any).sendMessage === 'function') {
        await (telegramService as any).sendMessage(message);
      } else {
        console.log('📧 Telegram notification (service unavailable):', message);
      }
    } catch (error: any) {
      console.warn('⚠️ Failed to send exit notification:', error.message);
    }
  }

  /**
   * Load existing open positions on service startup
   */
  async loadExistingPositions(): Promise<void> {
    try {
      console.log('🔄 Loading existing Fibonacci scalping positions...');

      // Find all open trades with Fibonacci scalping signals
      const openTrades = await Trade.find({
        status: 'filled',
        // We'll need to add a way to identify Fibonacci scalping trades
        // For now, check if signalId exists and trade is recent (last 24h)
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).limit(100);

      console.log(`Found ${openTrades.length} recent open trades`);

      // TODO: Add logic to identify which trades are Fibonacci scalping
      // and restore them to monitoring

      // For now, positions will be added when new trades are executed
    } catch (error: any) {
      console.error('❌ Error loading existing positions:', error.message);
    }
  }

  /**
   * Get current monitored positions count
   */
  getMonitoredCount(): number {
    return this.monitoredPositions.size;
  }

  /**
   * Get all monitored positions
   */
  getAllPositions(): MonitoredPosition[] {
    return Array.from(this.monitoredPositions.values());
  }
}

export const positionMonitorService = new PositionMonitorService();
