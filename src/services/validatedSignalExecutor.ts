import { redisService } from './redisService';
import { agendaService } from './agendaService';
import { binanceService } from './binanceService';
import { okxService } from './okxService';
import { mt4Service } from './mt4Service';
import { symbolMappingService } from './symbolMappingService';
import { brokerFilterService } from './brokerFilterService';
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
   * NEW: Routes to correct broker based on agent configuration
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

      // NEW: Check if symbol is available at agent's broker
      const filterResult = await brokerFilterService.canExecuteSignal(symbol, agent.broker);

      if (!filterResult.allowed) {
        console.log(`⏭️  Signal filtered: ${symbol} not available at ${agent.broker} - ${filterResult.reason}`);

        // Mark signal as FILTERED in log
        await AgentSignalLogModel.updateOne(
          { signalId: signalId, agentId: agentId },
          {
            $set: {
              status: 'FILTERED',
              executed: false,
              filterReason: filterResult.reason
            }
          }
        );

        return;
      }

      console.log(`✅ Symbol ${symbol} available at ${agent.broker} as ${filterResult.brokerSymbol}`);

      // NEW: Route execution based on broker type
      if (agent.broker === 'MT4') {
        await this.executeMT4Signal(agent, validatedSignal, symbol, filterResult.brokerSymbol!);
      } else if (agent.broker === 'OKX') {
        await this.executeOKXSignal(agent, validatedSignal, symbol);
      } else if (agent.broker === 'BINANCE') {
        // TODO: Implement Binance execution when needed
        console.warn(`⚠️  Binance execution not yet implemented, skipping signal`);
        return;
      } else {
        console.error(`❌ Unknown broker type: ${agent.broker}`);
        return;
      }

    } catch (error) {
      console.error('Error executing signal:', error);
      throw error;
    }
  }

  /**
   * Execute signal on OKX (legacy implementation)
   */
  private async executeOKXSignal(agent: any, validatedSignal: any, symbol: string): Promise<void> {
    const { signalId, agentId, recommendation, positionSize } = validatedSignal;

    // Get current market price
    let executionPrice = validatedSignal.takeProfitPrice || validatedSignal.recommendedEntry;

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

    // Fetch instrument info
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

    // Calculate quantity
    let quantity = executionPrice > 0 ? positionSize / executionPrice : 0;

    // Ensure minimum SIZE
    if (quantity < minSize) {
      console.log(`⚠️  Calculated quantity ${quantity} below minimum ${minSize} for ${symbol}`);
      quantity = minSize;
      console.log(`   Adjusted quantity to minimum: ${quantity}`);
    }

    // Ensure minimum VALUE
    let orderValue = quantity * executionPrice;
    if (orderValue < MIN_ORDER_VALUE_USDT) {
      console.log(`⚠️  Order value $${orderValue.toFixed(2)} below OKX minimum $${MIN_ORDER_VALUE_USDT}`);
      const requiredQuantity = MIN_ORDER_VALUE_USDT / executionPrice;
      quantity = Math.max(requiredQuantity, minSize);
      quantity = Math.ceil(quantity / lotSize) * lotSize;
      orderValue = quantity * executionPrice;
      console.log(`   Adjusted to $${orderValue.toFixed(2)} (${quantity} ${symbol.replace('USDT', '')})`);
    } else {
      quantity = Math.floor(quantity / lotSize) * lotSize;
    }

    // Final validation
    if (quantity <= 0 || executionPrice <= 0 || quantity < minSize) {
      console.error(`❌ Invalid quantity for ${symbol}: quantity=${quantity}, minSz=${minSize}, price=${executionPrice}`);
      return;
    }

    const finalOrderValue = quantity * executionPrice;
    if (finalOrderValue < MIN_ORDER_VALUE_USDT) {
      console.error(`❌ Final order value $${finalOrderValue.toFixed(2)} still below $${MIN_ORDER_VALUE_USDT} minimum`);
      return;
    }

    console.log(`💰 OKX Trade: $${finalOrderValue.toFixed(2)} → ${quantity} ${symbol} @ $${executionPrice}`);

    // Schedule trade execution
    await agendaService.scheduleTradeExecution({
      userId: agent.userId.toString(),
      agentId: agentId,
      symbol: symbol,
      side: recommendation.toLowerCase(),
      type: 'market',
      amount: quantity,
      price: executionPrice
    });

    console.log(`✅ OKX Trade scheduled: ${recommendation} ${quantity.toFixed(6)} ${symbol} @ $${executionPrice}`);

    // Update signal log
    await AgentSignalLogModel.updateOne(
      { signalId: signalId, agentId: agentId },
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
  }

  /**
   * Execute signal on MT4 (NEW)
   */
  private async executeMT4Signal(agent: any, validatedSignal: any, universalSymbol: string, mt4Symbol: string): Promise<void> {
    const { signalId, agentId, recommendation, positionSize } = validatedSignal;

    // Get current market price
    let executionPrice = validatedSignal.takeProfitPrice || validatedSignal.recommendedEntry;

    if (!executionPrice || executionPrice <= 0) {
      console.log(`⚠️  No price in signal, fetching current MT4 price for ${mt4Symbol}...`);
      try {
        const priceData = await mt4Service.getPrice(agent.userId.toString(), universalSymbol);
        executionPrice = recommendation.toLowerCase() === 'buy' ? priceData.ask : priceData.bid;
        console.log(`✅ Fetched MT4 price for ${mt4Symbol}: ${executionPrice}`);
      } catch (error) {
        console.error(`Failed to fetch MT4 price for ${mt4Symbol}:`, error);
        return;
      }
    }

    const stopLoss = validatedSignal.stopLossPrice;
    const takeProfit = validatedSignal.takeProfitPrice;

    // Calculate lot size (MT4 uses lots, not quantity)
    let lotSize: number;
    try {
      lotSize = await mt4Service.calculateLotSize(agent.userId.toString(), universalSymbol, positionSize);
      console.log(`💰 MT4 Lot size calculation: ${positionSize} USDT → ${lotSize} lots`);
    } catch (error) {
      console.error(`Failed to calculate lot size:`, error);
      return;
    }

    // Validate lot size
    if (lotSize < 0.01) {
      console.error(`❌ Lot size too small: ${lotSize}. Minimum is 0.01 lots`);
      return;
    }

    console.log(`💰 MT4 Trade: ${positionSize} USDT → ${lotSize} lots ${mt4Symbol} @ ${executionPrice}`);

    // Execute MT4 order immediately (no scheduling needed - MT4 is ultra-fast)
    try {
      const order = await mt4Service.createMarketOrder(
        agent.userId.toString(),
        universalSymbol,
        recommendation.toLowerCase() as 'buy' | 'sell',
        lotSize,
        stopLoss,
        takeProfit
      );

      console.log(`✅ MT4 Order executed: ${recommendation} ${lotSize} lots ${mt4Symbol} | Ticket: ${order.ticket} | Price: ${order.openPrice}`);

      // Update signal log
      await AgentSignalLogModel.updateOne(
        { signalId: signalId, agentId: agentId },
        {
          $set: {
            status: 'EXECUTED',
            executed: true,
            executedAt: new Date(),
            executionPrice: order.openPrice,
            executionQuantity: lotSize,
            mt4Ticket: order.ticket,
            broker: 'MT4'
          }
        }
      );

    } catch (error) {
      console.error(`Failed to execute MT4 order:`, error);

      // Mark as FAILED in log
      await AgentSignalLogModel.updateOne(
        { signalId: signalId, agentId: agentId },
        {
          $set: {
            status: 'FAILED',
            executed: false,
            failedReason: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      );
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
