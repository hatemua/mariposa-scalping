import { redisService } from './redisService';
import { agendaService } from './agendaService';
import { binanceService } from './binanceService';
import { okxService } from './okxService';
import { ScalpingAgent } from '../models';
import AgentSignalLogModel from '../models/AgentSignalLog';

/**
 * ValidatedSignalExecutor - Consumes validated signals from queue and executes trades
 * This is the MISSING LINK in the signal execution pipeline
 */
export class ValidatedSignalExecutor {
  private readonly VALIDATED_SIGNALS_QUEUE = 'validated_signals';
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;

  /**
   * Start the validated signal executor
   * Processes queue every 5 seconds
   */
  async start(): Promise<void> {
    console.log('🚀 Starting ValidatedSignalExecutor...');

    // Process immediately on startup
    await this.processQueue();

    // Then process every 5 seconds
    this.processInterval = setInterval(async () => {
      await this.processQueue();
    }, 5000);

    console.log('✅ ValidatedSignalExecutor started - processing every 5 seconds');
  }

  /**
   * Stop the executor
   */
  stop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
      console.log('⏹️  ValidatedSignalExecutor stopped');
    }
  }

  /**
   * Process the validated signals queue
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Dequeue up to 10 signals (priority-based)
      const signals = await this.dequeueSignals(10);

      if (signals.length === 0) {
        // No signals to process - this is normal
        return;
      }

      console.log(`📤 Processing ${signals.length} validated signals from queue`);

      // Process each signal
      for (const signal of signals) {
        try {
          await this.executeSignal(signal);
        } catch (error) {
          console.error(`Failed to execute signal ${signal.id}:`, error);
        }
      }

      console.log(`✅ Processed ${signals.length} validated signals`);
    } catch (error) {
      console.error('Error processing validated signals queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Dequeue signals from Redis queue (priority-sorted)
   */
  private async dequeueSignals(limit: number): Promise<any[]> {
    try {
      const signals: any[] = [];

      for (let i = 0; i < limit; i++) {
        const item = await redisService.dequeue(this.VALIDATED_SIGNALS_QUEUE);
        if (!item) break;

        signals.push(item.data);
      }

      return signals;
    } catch (error) {
      console.error('Error dequeuing signals:', error);
      return [];
    }
  }

  /**
   * Execute a validated signal (schedule trade execution)
   */
  private async executeSignal(validatedSignal: any): Promise<void> {
    try {
      const { signalId, agentId, symbol, recommendation, positionSize, isValid } = validatedSignal;

      console.log(`🎯 Executing signal ${signalId} for agent ${agentId} (${symbol} ${recommendation})`);
      console.log(`📊 Signal data: positionSize=${positionSize}, isValid=${isValid}`);

      // Safety check: only execute if signal is valid
      if (!isValid) {
        console.warn(`⚠️  Signal ${signalId} is not valid, skipping execution`);
        return;
      }

      // Safety check: position size must be valid
      if (!positionSize || positionSize <= 0 || isNaN(positionSize)) {
        console.error(`⚠️  Invalid position size: ${positionSize}, skipping execution`);
        console.error(`📋 Full signal data:`, JSON.stringify(validatedSignal, null, 2));
        return;
      }

      // Get agent details
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) {
        console.error(`Agent ${agentId} not found, cannot execute signal`);
        return;
      }

      // Check if agent is still active
      if (!agent.isActive) {
        console.warn(`Agent ${agentId} is not active, skipping execution`);
        return;
      }

      // Get current market price (CRITICAL: fetch real-time price if not in signal)
      let executionPrice = validatedSignal.takeProfitPrice || validatedSignal.recommendedEntry;

      // If no price in signal, fetch current market price from Binance
      if (!executionPrice || executionPrice <= 0) {
        console.log(`⚠️  No price in signal, fetching current market price for ${symbol}...`);
        try {
          const marketData = await binanceService.getSymbolInfo(symbol);
          executionPrice = parseFloat(marketData.lastPrice || marketData.price || '0');
          console.log(`✅ Fetched current market price for ${symbol}: ${executionPrice}`);
        } catch (error) {
          console.error(`Failed to fetch market price for ${symbol}:`, error);
          return;
        }
      }

      const stopLoss = validatedSignal.stopLossPrice;

      // CRITICAL: Fetch instrument info to ensure we meet minimum order size
      let instrumentInfo;
      try {
        instrumentInfo = await okxService.getInstrumentInfo(symbol);
      } catch (error) {
        console.error(`Failed to fetch instrument info for ${symbol}:`, error);
        return;
      }

      const minSize = parseFloat(instrumentInfo.minSz);
      const lotSize = parseFloat(instrumentInfo.lotSz);
      const MIN_ORDER_VALUE_USDT = 20; // OKX requirement

      // Calculate quantity based on position size
      // positionSize is in USDT, we need to convert to coin quantity
      let quantity = executionPrice > 0 ? positionSize / executionPrice : 0;

      // CRITICAL #1: Ensure quantity meets exchange minimum SIZE
      if (quantity < minSize) {
        console.log(`⚠️  Calculated quantity ${quantity} below minimum ${minSize} for ${symbol}`);
        quantity = minSize;
        console.log(`   Adjusted quantity to minimum: ${quantity}`);
      }

      // CRITICAL #2: Ensure order VALUE meets $20 minimum
      let orderValue = quantity * executionPrice;
      if (orderValue < MIN_ORDER_VALUE_USDT) {
        console.log(`⚠️  Order value $${orderValue.toFixed(2)} below OKX minimum $${MIN_ORDER_VALUE_USDT}`);

        // Calculate quantity needed for $20 order
        const requiredQuantity = MIN_ORDER_VALUE_USDT / executionPrice;

        // Ensure it's also above minSize
        quantity = Math.max(requiredQuantity, minSize);

        // Round UP to lot size to ensure we don't go below minimum
        quantity = Math.ceil(quantity / lotSize) * lotSize;

        orderValue = quantity * executionPrice;
        console.log(`   Adjusted to $${orderValue.toFixed(2)} (${quantity} ${symbol.replace('USDT', '')})`);
      } else {
        // Round to lot size increment
        quantity = Math.floor(quantity / lotSize) * lotSize;
      }

      // Final validation
      if (quantity <= 0 || executionPrice <= 0 || quantity < minSize) {
        console.error(`❌ Invalid quantity for ${symbol}: quantity=${quantity}, minSz=${minSize}, price=${executionPrice}, positionSize=${positionSize}`);
        return;
      }

      const finalOrderValue = quantity * executionPrice;
      if (finalOrderValue < MIN_ORDER_VALUE_USDT) {
        console.error(`❌ Final order value $${finalOrderValue.toFixed(2)} still below $${MIN_ORDER_VALUE_USDT} minimum`);
        return;
      }

      console.log(`💰 Trade calculation: $${finalOrderValue.toFixed(2)} → ${quantity} ${symbol} @ $${executionPrice}`);

      // Schedule trade execution via Agenda
      await agendaService.scheduleTradeExecution({
        userId: agent.userId.toString(),
        agentId: agentId,
        symbol: symbol,
        side: recommendation.toLowerCase(),
        type: 'market',
        amount: quantity,
        price: executionPrice
      });

      console.log(`✅ Trade scheduled: ${recommendation} ${quantity.toFixed(6)} ${symbol} @ $${executionPrice} (${positionSize} USDT)`);

      // Update agent signal log to mark as EXECUTED
      await AgentSignalLogModel.updateOne(
        {
          signalId: signalId,
          agentId: agentId
        },
        {
          $set: {
            status: 'EXECUTED',
            executed: true,
            executedAt: new Date(),
            executionPrice: executionPrice,
            executionQuantity: quantity
          }
        }
      );

      console.log(`📝 Updated agent signal log for ${signalId}`);

    } catch (error) {
      console.error('Error executing signal:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    queueLength: number;
    isProcessing: boolean;
  }> {
    try {
      const queueLength = await redisService.getQueueLength(this.VALIDATED_SIGNALS_QUEUE);

      return {
        queueLength,
        isProcessing: this.isProcessing
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        queueLength: 0,
        isProcessing: false
      };
    }
  }

  /**
   * Clear the queue (for testing/maintenance)
   */
  async clearQueue(): Promise<number> {
    try {
      let count = 0;
      while (await redisService.dequeue(this.VALIDATED_SIGNALS_QUEUE)) {
        count++;
      }
      console.log(`🗑️  Cleared ${count} signals from queue`);
      return count;
    } catch (error) {
      console.error('Error clearing queue:', error);
      return 0;
    }
  }
}

export const validatedSignalExecutor = new ValidatedSignalExecutor();
