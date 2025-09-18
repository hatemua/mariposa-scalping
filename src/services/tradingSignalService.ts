import { redisService } from './redisService';
import { aiAnalysisService } from './aiAnalysisService';
import { okxService } from './okxService';
import { orderTrackingService } from './orderTrackingService';
import { ScalpingAgent, Trade } from '../models';
import { ConsolidatedAnalysis } from '../types';
import { SymbolConverter } from '../utils/symbolConverter';

interface TradingSignal {
  id: string;
  agentId: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  reasoning: string;
  priority: number;
  timestamp: Date;
  analysisId?: string;
  status: 'pending' | 'processing' | 'executed' | 'cancelled' | 'failed';
}

interface TradeExecution {
  signalId: string;
  agentId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price?: number;
  executionTime: Date;
  status: 'queued' | 'executing' | 'completed' | 'failed';
}

export class TradingSignalService {
  private readonly SIGNAL_QUEUE = 'trading_signals';
  private readonly EXECUTION_QUEUE = 'trade_executions';
  private readonly PRIORITY_QUEUE = 'priority_signals';

  // ===============================
  // SIGNAL GENERATION & QUEUING
  // ===============================

  async generateAndQueueSignal(agentId: string, symbol: string): Promise<string> {
    const normalizedSymbol = SymbolConverter.normalize(symbol);

    try {
      // Get agent configuration
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent || !agent.isActive) {
        throw new Error(`Agent ${agentId} not found or inactive`);
      }

      // Generate trading signal using AI analysis
      const signalData = await aiAnalysisService.generateTradingSignal(normalizedSymbol, agentId);

      const signal: TradingSignal = {
        id: `${agentId}:${Date.now()}`,
        agentId,
        symbol: normalizedSymbol,
        recommendation: signalData.recommendation,
        confidence: signalData.confidence,
        targetPrice: signalData.targetPrice,
        stopLoss: signalData.stopLoss,
        reasoning: signalData.reasoning,
        priority: this.calculatePriority(signalData.confidence, agent.config.riskPercentage),
        timestamp: new Date(),
        analysisId: signalData.analysisId,
        status: 'pending'
      };

      // Queue the signal based on priority
      if (signal.priority >= 80) {
        await redisService.enqueue(this.PRIORITY_QUEUE, {
          id: signal.id,
          data: signal,
          timestamp: Date.now(),
          priority: signal.priority
        });
      } else {
        await redisService.enqueue(this.SIGNAL_QUEUE, {
          id: signal.id,
          data: signal,
          timestamp: Date.now(),
          priority: signal.priority
        });
      }

      // Cache the signal for quick access
      await redisService.cacheTradeSignal(agentId, signal);

      // Publish signal update
      await redisService.publish(`signal:${agentId}`, {
        type: 'signal_generated',
        data: signal
      });

      console.log(`Trading signal generated and queued: ${signal.id} for ${normalizedSymbol}`);
      return signal.id;

    } catch (error) {
      console.error(`Error generating signal for agent ${agentId}:`, error);
      throw error;
    }
  }

  async processSignalQueue(): Promise<void> {
    try {
      // Process priority queue first
      await this.processQueue(this.PRIORITY_QUEUE);

      // Then process regular queue
      await this.processQueue(this.SIGNAL_QUEUE);

    } catch (error) {
      console.error('Error processing signal queue:', error);
    }
  }

  private async processQueue(queueName: string): Promise<void> {
    const batchSize = 5; // Process 5 signals at a time

    for (let i = 0; i < batchSize; i++) {
      const queueItem = await redisService.dequeue(queueName);
      if (!queueItem) {
        break; // Queue is empty
      }

      const signal = queueItem.data as TradingSignal;

      try {
        await this.processSignal(signal);
      } catch (error) {
        console.error(`Error processing signal ${signal.id}:`, error);

        // Update signal status to failed
        signal.status = 'failed';
        await redisService.cacheTradeSignal(signal.agentId, signal);

        // Publish failure update
        await redisService.publish(`signal:${signal.agentId}`, {
          type: 'signal_failed',
          data: signal,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async processSignal(signal: TradingSignal): Promise<void> {
    console.log(`Processing trading signal: ${signal.id} - ${signal.recommendation} ${signal.symbol}`);

    // Update signal status to processing
    signal.status = 'processing';
    await redisService.cacheTradeSignal(signal.agentId, signal);

    try {
      // Get agent configuration
      const agent = await ScalpingAgent.findById(signal.agentId).populate('userId');
      if (!agent || !agent.isActive) {
        throw new Error(`Agent ${signal.agentId} not found or inactive`);
      }

      // Check if we should execute this signal
      if (!this.shouldExecuteSignal(signal)) {
        signal.status = 'cancelled';
        await redisService.cacheTradeSignal(signal.agentId, signal);
        return;
      }

      // Generate trade execution
      const execution = await this.generateTradeExecution(signal, agent);

      if (execution) {
        // Queue the execution
        await redisService.enqueue(this.EXECUTION_QUEUE, {
          id: execution.signalId,
          data: execution,
          timestamp: Date.now(),
          priority: signal.priority
        });

        signal.status = 'executed';
        await redisService.cacheTradeSignal(signal.agentId, signal);

        // Publish execution update
        await redisService.publish(`signal:${signal.agentId}`, {
          type: 'signal_executed',
          data: { signal, execution }
        });
      }

    } catch (error) {
      signal.status = 'failed';
      await redisService.cacheTradeSignal(signal.agentId, signal);
      throw error;
    }
  }

  private shouldExecuteSignal(signal: TradingSignal): boolean {
    // Basic validation rules
    if (signal.recommendation === 'HOLD') {
      return false;
    }

    if (signal.confidence < 0.6) {
      console.log(`Signal ${signal.id} confidence too low: ${signal.confidence}`);
      return false;
    }

    // Check if signal is not too old
    const signalAge = (Date.now() - new Date(signal.timestamp).getTime()) / 1000;
    if (signalAge > 300) { // 5 minutes
      console.log(`Signal ${signal.id} too old: ${signalAge} seconds`);
      return false;
    }

    return true;
  }

  private async generateTradeExecution(signal: TradingSignal, agent: any): Promise<TradeExecution | null> {
    try {
      // Get current balance and calculate position size
      const balance = await okxService.getBalance(agent.userId.toString());
      const availableBalance = balance.free.USDT || 0;

      if (availableBalance < 10) {
        console.log(`Insufficient balance for agent ${agent._id}: $${availableBalance}`);
        return null;
      }

      // Calculate position size based on risk management
      const currentPrice = signal.targetPrice || 0;
      const positionSize = okxService.calculatePositionSize(
        availableBalance,
        currentPrice,
        agent.config.riskPercentage,
        agent.config.stopLossPercentage
      );

      const maxPositionValue = agent.config.maxPositionSize;
      const finalQuantity = Math.min(positionSize, maxPositionValue / currentPrice);

      if (finalQuantity < 0.01) {
        console.log(`Position size too small for agent ${agent._id}: ${finalQuantity}`);
        return null;
      }

      const execution: TradeExecution = {
        signalId: signal.id,
        agentId: signal.agentId,
        symbol: signal.symbol,
        side: signal.recommendation === 'BUY' ? 'buy' : 'sell',
        type: 'market', // Use market orders for scalping
        quantity: finalQuantity,
        price: signal.targetPrice,
        executionTime: new Date(),
        status: 'queued'
      };

      return execution;

    } catch (error) {
      console.error(`Error generating trade execution for signal ${signal.id}:`, error);
      return null;
    }
  }

  // ===============================
  // TRADE EXECUTION PROCESSING
  // ===============================

  async processExecutionQueue(): Promise<void> {
    const batchSize = 3; // Process 3 executions at a time

    try {
      for (let i = 0; i < batchSize; i++) {
        const queueItem = await redisService.dequeue(this.EXECUTION_QUEUE);
        if (!queueItem) {
          break;
        }

        const execution = queueItem.data as TradeExecution;

        try {
          await this.executeTradeOrder(execution);
        } catch (error) {
          console.error(`Error executing trade ${execution.signalId}:`, error);

          // Update execution status
          execution.status = 'failed';
          await this.cacheExecution(execution);

          // Publish failure update
          await redisService.publish(`execution:${execution.agentId}`, {
            type: 'execution_failed',
            data: execution,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } catch (error) {
      console.error('Error processing execution queue:', error);
    }
  }

  private async executeTradeOrder(execution: TradeExecution): Promise<void> {
    console.log(`Executing trade: ${execution.side} ${execution.quantity} ${execution.symbol}`);

    execution.status = 'executing';
    await this.cacheExecution(execution);

    try {
      // Get user ID from agent
      const agent = await ScalpingAgent.findById(execution.agentId);
      if (!agent) {
        throw new Error(`Agent ${execution.agentId} not found`);
      }

      // Execute the trade using OKX service - OKX expects its own format
      const order = await okxService.executeScalpingOrder(
        agent.userId.toString(),
        execution.symbol, // This will be converted to OKX format inside OKX service
        execution.side,
        execution.quantity,
        execution.type,
        execution.price
      );

      // Start tracking the order for fill price monitoring
      await orderTrackingService.trackOrder(
        order.orderId,
        agent.userId.toString(),
        execution.symbol,
        execution.side,
        execution.quantity,
        execution.price
      );

      // Create trade record with normalized symbol
      const trade = new Trade({
        userId: agent.userId,
        agentId: execution.agentId,
        symbol: SymbolConverter.normalize(execution.symbol),
        side: execution.side,
        type: execution.type,
        quantity: execution.quantity,
        price: execution.price || order.price,
        filledPrice: order.avgFillPrice,
        filledQuantity: order.filled,
        status: order.status === 'closed' ? 'filled' : 'pending',
        okxOrderId: order.orderId,
        fees: order.fee?.cost
      });

      await trade.save();

      execution.status = 'completed';
      await this.cacheExecution(execution);

      // Publish success update
      await redisService.publish(`execution:${execution.agentId}`, {
        type: 'execution_completed',
        data: { execution, trade, order }
      });

      console.log(`Trade executed successfully: ${(order as any).id || order.orderId}`);

    } catch (error) {
      execution.status = 'failed';
      await this.cacheExecution(execution);
      throw error;
    }
  }

  // ===============================
  // UTILITY METHODS
  // ===============================

  private calculatePriority(confidence: number, riskPercentage: number): number {
    // Higher confidence and lower risk = higher priority
    const confidenceScore = confidence * 100;
    const riskScore = (10 - riskPercentage) * 5; // Lower risk = higher score

    return Math.min(100, confidenceScore * 0.7 + riskScore * 0.3);
  }

  private async cacheExecution(execution: TradeExecution): Promise<void> {
    const key = `execution:${execution.signalId}`;
    await redisService.set(key, execution, { ttl: 3600 }); // 1 hour cache
  }

  // ===============================
  // QUEUE MONITORING
  // ===============================

  async getQueueStats(): Promise<any> {
    try {
      const [signalQueueSize, priorityQueueSize, executionQueueSize] = await Promise.all([
        redisService.getQueueLength(this.SIGNAL_QUEUE),
        redisService.getQueueLength(this.PRIORITY_QUEUE),
        redisService.getQueueLength(this.EXECUTION_QUEUE)
      ]);

      return {
        signalQueue: signalQueueSize,
        priorityQueue: priorityQueueSize,
        executionQueue: executionQueueSize,
        totalQueued: signalQueueSize + priorityQueueSize + executionQueueSize,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return null;
    }
  }

  async getActiveSignals(agentId?: string): Promise<TradingSignal[]> {
    try {
      if (agentId) {
        const signal = await redisService.getTradeSignal(agentId);
        return signal ? [signal] : [];
      }

      // Get all active signals (this is a simplified approach)
      const signalKeys = await redisService.getKeysByPattern('signal:*');
      const signals: TradingSignal[] = [];

      for (const key of signalKeys.slice(0, 20)) { // Limit to 20 for performance
        const signal = await redisService.get(key);
        if (signal && signal.status !== 'completed' && signal.status !== 'failed') {
          signals.push(signal);
        }
      }

      return signals;
    } catch (error) {
      console.error('Error getting active signals:', error);
      return [];
    }
  }

  async cancelSignal(signalId: string): Promise<boolean> {
    try {
      // Find the signal in queues and remove it
      // This is simplified - in production, you'd want more robust queue management

      const signal = await this.findSignalInQueues(signalId);
      if (signal) {
        signal.status = 'cancelled';

        // Update cached signal
        await redisService.cacheTradeSignal(signal.agentId, signal);

        // Publish cancellation update
        await redisService.publish(`signal:${signal.agentId}`, {
          type: 'signal_cancelled',
          data: signal
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error cancelling signal ${signalId}:`, error);
      return false;
    }
  }

  private async findSignalInQueues(signalId: string): Promise<TradingSignal | null> {
    // This is a simplified implementation
    // In production, you'd want more efficient signal tracking
    const queues = [this.SIGNAL_QUEUE, this.PRIORITY_QUEUE];

    for (const queueName of queues) {
      // In a real implementation, you'd need to search through the queue
      // For now, we'll just check the cache
      const agentId = signalId.split(':')[0];
      const cachedSignal = await redisService.getTradeSignal(agentId);

      if (cachedSignal && cachedSignal.id === signalId) {
        return cachedSignal;
      }
    }

    return null;
  }

  // ===============================
  // CLEANUP AND MAINTENANCE
  // ===============================

  async cleanupOldSignals(): Promise<void> {
    try {
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

      // Clean up old signals from cache
      const signalKeys = await redisService.getKeysByPattern('signal:*');

      for (const key of signalKeys) {
        const signal = await redisService.get(key);
        if (signal && new Date(signal.timestamp).getTime() < cutoffTime) {
          await redisService.delete(key);
        }
      }

      console.log('Old signals cleanup completed');
    } catch (error) {
      console.error('Error cleaning up old signals:', error);
    }
  }
}

export const tradingSignalService = new TradingSignalService();