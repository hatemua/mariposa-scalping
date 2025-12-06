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

// BUG FIX #2: Profit protection threshold - block LLM exits when trade is 40%+ of way to TP
const PROFIT_PROTECTION_THRESHOLD = 0.40; // 40% progress to TP = let winner run
const REQUIRE_UNANIMOUS_EXIT_FOR_WINNERS = true; // Require 4/4 LLM votes to exit profitable trades

// BUG FIX #5: Stagnant loser exit configuration
const STAGNANT_LOSER_CONFIG = {
  MIN_TIME_MINUTES: 10,         // Exit losers after 10 minutes
  SL_DISTANCE_THRESHOLD: 0.50,  // If price is 50%+ of the way to SL
  ENABLED: true
};

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

      // IMPORTANT: Block LLM exits when trailing stop is active
      // This lets winners run to TP instead of being cut short by LLM signals
      if (mt4Position?.trailingStopActivated || mt4Position?.breakEvenActivated) {
        console.log(`⏳ Position ${position.tradeId}: Trailing stop active (breakeven: ${mt4Position?.breakEvenActivated}, trailing: ${mt4Position?.trailingStopActivated}) - LLM exit blocked, letting winner run to TP`);
        console.log(`   Current: $${currentPrice.toFixed(2)}, P&L: $${currentPnL.toFixed(2)}, SL: ${mt4Position?.stopLoss?.toFixed(2) || 'N/A'}`);
        return; // Skip LLM exit evaluation - let MT4 SL/TP handle the exit
      }

      // BUG FIX #2: Block LLM exits when trade is 40%+ of the way to TP
      // This prevents premature exits that cut winning trades short
      const entryPrice = mt4Position?.entryPrice || position.entryPrice;
      const takeProfit = mt4Position?.takeProfit;
      const stopLoss = mt4Position?.stopLoss;
      let progressToTP = 0;
      let isInProfit = currentPnL > 0;

      if (takeProfit && entryPrice) {
        const direction = mt4Position?.side === 'buy' ? 1 : -1;
        const tpDistance = Math.abs(takeProfit - entryPrice);
        const currentProgress = (currentPrice - entryPrice) * direction;
        progressToTP = tpDistance > 0 ? currentProgress / tpDistance : 0;

        if (progressToTP >= PROFIT_PROTECTION_THRESHOLD) {
          console.log(`🛡️ Position ${position.tradeId}: Profit protection active - ${(progressToTP * 100).toFixed(1)}% to TP (threshold: ${PROFIT_PROTECTION_THRESHOLD * 100}%)`);
          console.log(`   Entry: $${entryPrice.toFixed(2)}, Current: $${currentPrice.toFixed(2)}, TP: $${takeProfit.toFixed(2)}, P&L: $${currentPnL.toFixed(2)}`);
          console.log(`   LLM exit BLOCKED - letting winner run to TP`);
          return; // Skip LLM exit evaluation - let the winner run
        }
      }

      // BUG FIX #5: Stagnant loser exit - exit losing positions that aren't recovering
      // Conditions: 10+ minutes open AND price is 50%+ of the way to SL
      if (STAGNANT_LOSER_CONFIG.ENABLED && stopLoss && entryPrice && !isInProfit) {
        const openTime = position.entryTime ? new Date(position.entryTime).getTime() : Date.now();
        const minutesOpen = (Date.now() - openTime) / 60000;

        if (minutesOpen >= STAGNANT_LOSER_CONFIG.MIN_TIME_MINUTES) {
          const direction = mt4Position?.side === 'buy' ? 1 : -1;
          const slDistance = Math.abs(entryPrice - stopLoss);
          const currentDrawdown = (entryPrice - currentPrice) * direction; // Positive when losing

          const progressToSL = slDistance > 0 ? currentDrawdown / slDistance : 0;

          if (progressToSL >= STAGNANT_LOSER_CONFIG.SL_DISTANCE_THRESHOLD) {
            console.log(`⏰ STAGNANT LOSER EXIT: Position ${position.tradeId}`);
            console.log(`   Open for ${minutesOpen.toFixed(1)} min (threshold: ${STAGNANT_LOSER_CONFIG.MIN_TIME_MINUTES} min)`);
            console.log(`   Progress to SL: ${(progressToSL * 100).toFixed(1)}% (threshold: ${STAGNANT_LOSER_CONFIG.SL_DISTANCE_THRESHOLD * 100}%)`);
            console.log(`   Entry: $${entryPrice.toFixed(2)}, Current: $${currentPrice.toFixed(2)}, SL: $${stopLoss.toFixed(2)}`);
            console.log(`   Closing to avoid full SL hit - stagnant loser not recovering`);

            // Execute exit immediately
            const stagnantExitSignal = {
              shouldExit: true,
              exitType: 'FULL',
              confidence: 80,
              reason: `Stagnant loser: ${minutesOpen.toFixed(0)}min open, ${(progressToSL * 100).toFixed(0)}% to SL`,
              llmRecommendations: {
                fibonacci: { recommendation: 'EXIT', reason: 'Stagnant loser auto-exit' },
                chartPattern: { recommendation: 'EXIT', reason: 'Stagnant loser auto-exit' },
                candlestick: { recommendation: 'EXIT', reason: 'Stagnant loser auto-exit' },
                supportResistance: { recommendation: 'EXIT', reason: 'Stagnant loser auto-exit' }
              }
            };

            await this.executeExit(position, stagnantExitSignal, mt4Position);
            return; // Exit executed, stop monitoring
          }
        }
      }

      // Generate exit signal based on current market conditions
      const exitSignal = await btcMultiPatternScalpingService.generateExitSignal(
        position.entryPrice,
        currentPnLPercent,
        position.entrySignalData
      );

      console.log(`📊 Position ${position.tradeId}: Price $${currentPrice.toFixed(2)}, P&L $${currentPnL.toFixed(2)} (${currentPnLPercent.toFixed(2)}%), Exit signal: ${exitSignal.shouldExit ? 'YES' : 'NO'} (${exitSignal.confidence.toFixed(0)}%)`);

      // Act on exit signal
      if (exitSignal.shouldExit) {
        // BUG FIX #2: For profitable trades, require 4/4 unanimous LLM vote to exit
        if (REQUIRE_UNANIMOUS_EXIT_FOR_WINNERS && isInProfit && exitSignal.llmRecommendations) {
          const recommendations = exitSignal.llmRecommendations;
          const exitVotes = [
            recommendations.fibonacci?.exit === true,
            recommendations.trendMomentum?.exit === true,
            recommendations.volumePriceAction?.exit === true,
            recommendations.supportResistance?.exit === true
          ];
          const exitVoteCount = exitVotes.filter(Boolean).length;

          if (exitVoteCount < 4) {
            console.log(`🛡️ Position ${position.tradeId}: Profitable trade requires 4/4 unanimous exit vote, got ${exitVoteCount}/4`);
            console.log(`   Votes: Fib=${recommendations.fibonacci?.exit ? 'EXIT' : 'HOLD'}, Trend=${recommendations.trendMomentum?.exit ? 'EXIT' : 'HOLD'}, Vol=${recommendations.volumePriceAction?.exit ? 'EXIT' : 'HOLD'}, SR=${recommendations.supportResistance?.exit ? 'EXIT' : 'HOLD'}`);
            console.log(`   LLM exit BLOCKED - holding profitable position`);
            return; // Don't exit - not unanimous
          }
          console.log(`✅ Position ${position.tradeId}: Got 4/4 unanimous exit vote for profitable trade - proceeding with exit`);
        }

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
