import { Trade } from '../models';
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

      // Get current trade status
      const trade = await Trade.findById(position.tradeId);
      if (!trade || trade.status !== 'filled') {
        // Position already closed or cancelled
        this.removePosition(position.tradeId);
        return;
      }

      // Get current price and P&L
      let currentPrice = position.entryPrice;
      let currentPnL = 0;
      let currentPnLPercent = 0;

      // Try to get actual MT4 position data if available
      if (position.mt4Ticket) {
        try {
          // Get position from MT4 trade manager's tracked positions
          const trackedPosition = (mt4Service as any).trackedPositions?.get(position.mt4Ticket);

          if (trackedPosition && trackedPosition.status === 'open') {
            currentPrice = trackedPosition.currentPrice || currentPrice;
            currentPnL = trackedPosition.profit || 0;
            currentPnLPercent = (currentPnL / (position.entryPrice * (trade.quantity || 0.01))) * 100;
          } else if (!trackedPosition) {
            // Position no longer tracked (likely closed)
            this.removePosition(position.tradeId);
            return;
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

      console.log(`📊 Position ${position.tradeId}: P&L ${currentPnLPercent.toFixed(2)}%, Exit signal: ${exitSignal.shouldExit ? 'YES' : 'NO'} (${exitSignal.confidence.toFixed(0)}%)`);

      // Act on exit signal
      if (exitSignal.shouldExit) {
        await this.executeExit(position, exitSignal, trade);
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

      // Full exit: Close entire position
      if (exitSignal.exitType === 'FULL') {
        const closeResult = await mt4Service.closePosition(
          trade.userId.toString(),
          position.mt4Ticket
        );

        if (closeResult && closeResult.status === 'closed') {
          console.log(`✅ Position ${position.tradeId} closed successfully`);

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
