import { redisService } from './redisService';
import { agendaService } from './agendaService';
import { binanceService } from './binanceService';
import { okxService } from './okxService';
import { mt4Service } from './mt4Service';
import { mt4TradeManager } from './mt4TradeManager';
import { symbolMappingService } from './symbolMappingService';
import { brokerFilterService } from './brokerFilterService';
import { ScalpingAgent } from '../models';
import AgentSignalLogModel from '../models/AgentSignalLog';
import { riskManager, RISK_CONFIG } from './riskManager';

/**
 * Filter configuration for ValidatedSignalExecutor
 */
export interface ExecutorFilterConfig {
  symbolFilter?: string[];      // Only process signals for these symbols (e.g., ['BTCUSDT'])
  categoryFilter?: string[];    // Only process signals with these categories (e.g., ['FIBONACCI_SCALPING'])
  queueNames?: string[];        // Which queues to process (defaults to both)
}

/**
 * ValidatedSignalExecutor - Consumes validated signals from queue and executes trades
 * This is the MISSING LINK in the signal execution pipeline
 */
export class ValidatedSignalExecutor {
  private readonly VALIDATED_SIGNALS_QUEUE = 'validated_signals';
  private readonly FIBONACCI_PRIORITY_QUEUE = 'fibonacci_priority_signals'; // NEW: Priority queue for Fibonacci
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;

  // Filter configuration (optional - for specialized workers)
  private filterConfig?: ExecutorFilterConfig;

  /**
   * Constructor with optional filter configuration
   * @param filterConfig - Filter to restrict which signals this executor processes
   */
  constructor(filterConfig?: ExecutorFilterConfig) {
    this.filterConfig = filterConfig;

    if (filterConfig) {
      console.log('📋 ValidatedSignalExecutor initialized with filters:');
      if (filterConfig.symbolFilter) {
        console.log(`   - Symbols: ${filterConfig.symbolFilter.join(', ')}`);
      }
      if (filterConfig.categoryFilter) {
        console.log(`   - Categories: ${filterConfig.categoryFilter.join(', ')}`);
      }
      if (filterConfig.queueNames) {
        console.log(`   - Queues: ${filterConfig.queueNames.join(', ')}`);
      }
    }
  }

  /**
   * Start the validated signal executor
   * Processes queue every 5 seconds
   */
  async start(): Promise<void> {
    console.log('🚀 Starting ValidatedSignalExecutor...');

    // Process immediately on startup
    await this.processQueue();

    // Then process every 1 second (OPTIMIZED: Faster for MT4 Fibonacci scalping)
    this.processInterval = setInterval(async () => {
      await this.processQueue();
    }, 1000);

    console.log('✅ ValidatedSignalExecutor started - processing every 1 second (optimized for Fibonacci scalping)');
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

      // Process each signal (with optional filtering)
      let processedCount = 0;
      let filteredCount = 0;
      for (const signal of signals) {
        try {
          // Check if signal passes filters
          if (!this.shouldProcessSignal(signal)) {
            filteredCount++;
            const filterReason = `Signal filtered: category=${signal.category || 'unknown'}, passes shouldProcessSignal check=false`;
            console.log(`⏭️  Signal ${signal.signalId} filtered out: ${signal.symbol} - ${filterReason}`);

            // Log filtered signal to database so it's not lost
            await AgentSignalLogModel.updateOne(
              { signalId: signal.signalId, agentId: signal.agentId },
              {
                $set: {
                  status: 'FILTERED',
                  filterReason: filterReason,
                  processedAt: new Date()
                }
              }
            );
            continue;
          }

          await this.executeSignal(signal);
          processedCount++;
        } catch (error) {
          console.error(`Failed to execute signal ${signal.id}:`, error);
        }
      }

      console.log(`✅ Processed ${processedCount} validated signals${filteredCount > 0 ? ` (filtered: ${filteredCount})` : ''}`);
    } catch (error) {
      console.error('Error processing validated signals queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Check if a signal should be processed based on filter configuration
   */
  private shouldProcessSignal(signal: any): boolean {
    // No filters = process all signals
    if (!this.filterConfig) {
      return true;
    }

    // Check symbol filter
    if (this.filterConfig.symbolFilter && this.filterConfig.symbolFilter.length > 0) {
      if (!this.filterConfig.symbolFilter.includes(signal.symbol)) {
        return false;
      }
    }

    // Check category filter
    if (this.filterConfig.categoryFilter && this.filterConfig.categoryFilter.length > 0) {
      if (!signal.category || !this.filterConfig.categoryFilter.includes(signal.category)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Dequeue signals from Redis queue (PRIORITY: Fibonacci signals first)
   */
  private async dequeueSignals(limit: number): Promise<any[]> {
    try {
      const signals: any[] = [];

      // Determine which queues to process based on filter config
      const shouldProcessFibonacci = !this.filterConfig?.queueNames ||
        this.filterConfig.queueNames.includes('fibonacci_priority_signals');
      const shouldProcessRegular = !this.filterConfig?.queueNames ||
        this.filterConfig.queueNames.includes('validated_signals');

      // PRIORITY 1: Dequeue Fibonacci signals first (up to 50% of limit)
      let fibCount = 0;
      if (shouldProcessFibonacci) {
        const fibLimit = Math.ceil(limit / 2);
        for (let i = 0; i < fibLimit; i++) {
          const item = await redisService.dequeue(this.FIBONACCI_PRIORITY_QUEUE);
          if (!item) break;

          signals.push(item.data);
          fibCount++;
          console.log(`🎯 [PRIORITY] Dequeued Fibonacci signal ${item.data.signalId} for agent ${item.data.agentId}`);
        }
      }

      // PRIORITY 2: Fill remaining slots with regular signals
      let regularCount = 0;
      if (shouldProcessRegular) {
        const remaining = limit - signals.length;
        for (let i = 0; i < remaining; i++) {
          const item = await redisService.dequeue(this.VALIDATED_SIGNALS_QUEUE);
          if (!item) break;

          signals.push(item.data);
          regularCount++;
        }
      }

      if (signals.length > 0) {
        console.log(`📤 Dequeued ${signals.length} signals total (Fibonacci: ${fibCount}, Other: ${regularCount})`);
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
        console.warn(`[DEBUG] ❌ Signal ${signalId} VALIDATION FAILED, skipping execution`);
        console.warn(`[DEBUG] Agent ID: ${agentId}, Signal:`, {
          signalId,
          symbol,
          recommendation,
          category: validatedSignal.category
        });

        // Update DB with rejection reason
        await AgentSignalLogModel.updateOne(
          { signalId, agentId },
          {
            $set: {
              status: 'REJECTED',
              failedReason: 'Signal validation failed - isValid=false'
            }
          }
        );
        return;
      }

      // Safety check: position size must be valid
      if (!positionSize || positionSize <= 0 || isNaN(positionSize)) {
        console.error(`[DEBUG] ❌ INVALID POSITION SIZE: ${positionSize}, skipping execution`);
        console.error(`[DEBUG] Agent ID: ${agentId}, Signal:`, {
          signalId,
          symbol,
          recommendation,
          positionSize,
          category: validatedSignal.category
        });
        console.error(`[DEBUG] Full signal data:`, JSON.stringify(validatedSignal, null, 2));

        // Update DB with rejection reason
        await AgentSignalLogModel.updateOne(
          { signalId, agentId },
          {
            $set: {
              status: 'REJECTED',
              failedReason: `Invalid position size: ${positionSize}`
            }
          }
        );
        return;
      }

      // Get agent details
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) {
        console.error(`Agent ${agentId} not found, cannot execute signal`);
        return;
      }

      // DEBUG: Log execution start for MT4 agents
      if (agent.broker === 'MT4') {
        console.log(`[DEBUG] ========== MT4 SIGNAL EXECUTION START ==========`);
        console.log(`[DEBUG] Executing MT4 signal for agent ${agent.name}:`, {
          signalId,
          agentId,
          agentName: agent.name,
          broker: agent.broker,
          category: agent.category,
          symbol,
          recommendation,
          positionSize,
          isValid,
          allowedSignalCategories: agent.allowedSignalCategories
        });
      }

      // Check if agent is still active
      if (!agent.isActive) {
        console.warn(`Agent ${agentId} is not active, skipping execution`);
        return;
      }

      // NEW: Check if symbol is available at agent's broker (pass category for MT4 BTC-only filtering)
      const filterResult = await brokerFilterService.canExecuteSignal(
        symbol,
        agent.broker,
        validatedSignal.category  // Required for MT4 Fibonacci scalping BTC-only restriction
      );

      console.log(`🔍 Broker filter check for ${symbol} @ ${agent.broker} (${agent.category}): ${filterResult.allowed ? '✅ ALLOWED' : '❌ BLOCKED'} ${filterResult.reason ? `- ${filterResult.reason}` : ''}`);

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
    let executionPrice = validatedSignal.recommendedEntry || validatedSignal.takeProfitPrice;

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
   * Verify that Stop Loss and Take Profit were actually set in MT4
   */
  private async verifyMT4SLTP(
    userId: string,
    symbol: string,
    ticket: number,
    expectedStopLoss?: number,
    expectedTakeProfit?: number
  ): Promise<void> {
    try {
      // Wait a moment for MT4 to process the order
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get the position from MT4
      const positions = await mt4Service.getOpenPositions(userId, symbol);
      const position = positions.find(p => p.ticket === ticket);

      if (!position) {
        console.warn(`⚠️  [SL/TP VERIFY] Position ${ticket} not found in MT4 open positions`);
        return;
      }

      // Check Stop Loss
      if (expectedStopLoss) {
        const slDifference = position.stopLoss ? Math.abs(position.stopLoss - expectedStopLoss) : Infinity;
        const slTolerance = expectedStopLoss * 0.001; // 0.1% tolerance for price differences

        if (slDifference > slTolerance) {
          console.error(
            `❌ [SL/TP VERIFY] Stop Loss mismatch for position ${ticket}: ` +
            `Expected ${expectedStopLoss}, Got ${position.stopLoss || 'NONE'}`
          );
        } else {
          console.log(`✅ [SL/TP VERIFY] Stop Loss confirmed: ${position.stopLoss}`);
        }
      }

      // Check Take Profit
      if (expectedTakeProfit) {
        const tpDifference = position.takeProfit ? Math.abs(position.takeProfit - expectedTakeProfit) : Infinity;
        const tpTolerance = expectedTakeProfit * 0.001; // 0.1% tolerance

        if (tpDifference > tpTolerance) {
          console.error(
            `❌ [SL/TP VERIFY] Take Profit mismatch for position ${ticket}: ` +
            `Expected ${expectedTakeProfit}, Got ${position.takeProfit || 'NONE'}`
          );
        } else {
          console.log(`✅ [SL/TP VERIFY] Take Profit confirmed: ${position.takeProfit}`);
        }
      }

    } catch (error) {
      console.error(`⚠️  Error verifying SL/TP for position ${ticket}:`, error);
    }
  }

  /**
   * Execute signal on MT4 (NEW)
   */
  private async executeMT4Signal(agent: any, validatedSignal: any, universalSymbol: string, mt4Symbol: string): Promise<void> {
    const { signalId, agentId, recommendation, positionSize } = validatedSignal;

    console.log(`🎯 Starting MT4 execution: ${recommendation} ${universalSymbol} (${mt4Symbol}) for agent ${agent.name} (${agentId})`);

    // ============================================================
    // CRITICAL: All pre-trade validation via centralized RiskManager
    // This uses mutex locks to prevent race conditions
    // ============================================================

    // CRITICAL CHECK 1: Position limits (max 1 BUY, 1 SELL, 2 total) - with mutex lock
    // Pass userId to query LIVE MT4 positions instead of stale MongoDB data
    const positionCheck = await riskManager.canOpenPosition(recommendation.toUpperCase() as 'BUY' | 'SELL', agent.userId.toString());
    if (!positionCheck.allowed) {
      console.warn(`❌ POSITION LIMIT - Rejecting signal ${signalId}: ${positionCheck.reason}`);
      await AgentSignalLogModel.updateOne(
        { signalId: signalId, agentId: agentId },
        {
          $set: {
            status: 'REJECTED',
            executed: false,
            failedReason: positionCheck.reason
          }
        }
      );
      return;
    }

    // CRITICAL CHECK 2: Trade cooldown (15 min between trades, 30 min after loss, 60 min after 3 losses) - atomic
    const cooldownCheck = await riskManager.checkAndStartCooldown();
    if (!cooldownCheck.allowed) {
      console.warn(`⏳ COOLDOWN - Rejecting signal ${signalId}: ${cooldownCheck.reason}`);
      await AgentSignalLogModel.updateOne(
        { signalId: signalId, agentId: agentId },
        {
          $set: {
            status: 'REJECTED',
            executed: false,
            failedReason: cooldownCheck.reason
          }
        }
      );
      return;
    }

    // CRITICAL CHECK 3: Daily limits (max $100 loss, max 40 trades per day)
    const dailyCheck = await riskManager.checkDailyLimits();
    if (!dailyCheck.allowed) {
      console.warn(`🛑 DAILY LIMIT - Rejecting signal ${signalId}: ${dailyCheck.reason}`);
      await AgentSignalLogModel.updateOne(
        { signalId: signalId, agentId: agentId },
        {
          $set: {
            status: 'REJECTED',
            executed: false,
            failedReason: dailyCheck.reason
          }
        }
      );
      return;
    }

    // Log current position status (using live MT4 data)
    const positionSummary = await riskManager.getPositionCountSummary(agent.userId.toString());
    console.log(`📊 Position check passed: BUY=${positionSummary.buy}, SELL=${positionSummary.sell}, Total=${positionSummary.total}`);
    console.log(`🔍 [DEBUG] executeMT4Signal called:`, {
      signalId,
      agentId,
      agentName: agent.name,
      userId: agent.userId?.toString(),
      universalSymbol,
      mt4Symbol,
      recommendation,
      positionSize,
      category: validatedSignal.category,
      stopLoss: validatedSignal.stopLossPrice,
      takeProfit: validatedSignal.takeProfitPrice
    });

    // NOTE: Position limits are now checked earlier using mt4TradeManager.checkPositionLimits()
    // This legacy check is kept as a secondary validation against MT4 directly
    try {
      const openPositions = await mt4Service.getOpenPositions(agent.userId.toString(), universalSymbol);

      // Log MT4 position count for debugging
      const sameDirectionPositions = openPositions.filter(pos => {
        const posType = pos.type?.toLowerCase();
        const signalType = recommendation.toLowerCase();
        return posType === signalType;
      });

      console.log(`📊 MT4 position check: ${sameDirectionPositions.length} ${recommendation} positions for ${universalSymbol}`);

    } catch (error) {
      console.error(`⚠️  Error checking MT4 positions:`, error);
      // Continue - primary check was done earlier with mt4TradeManager
    }

    // Get current market price
    let executionPrice = validatedSignal.recommendedEntry || validatedSignal.takeProfitPrice;

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

    // ============================================================================
    // V3 SL/TP MANAGEMENT - ATR-BASED WITH SAFETY LIMITS
    // ============================================================================
    // V3 Mode: Trust the ATR-based SL from signal generator, only apply safety limits
    // This allows proper risk management based on market volatility

    const MAX_SL_POINTS = parseFloat(process.env.MT4_MAX_SL_POINTS || '600');
    const MIN_SL_POINTS = parseFloat(process.env.MT4_MIN_SL_POINTS || '100');
    const DEFAULT_SL_POINTS = parseFloat(process.env.MT4_DEFAULT_SL_POINTS || '300');
    const RR_RATIO = parseFloat(process.env.MT4_RR_RATIO || '1.67');
    const USE_V3_SL = process.env.MT4_USE_V3_SL === 'true';

    let stopLoss: number | undefined = validatedSignal.stopLossPrice;
    let takeProfit: number | undefined = validatedSignal.takeProfitPrice;

    // Calculate SL distance in points
    const isBuy = recommendation.toLowerCase() === 'buy';

    if (stopLoss && executionPrice) {
      const originalSlDistance = Math.abs(executionPrice - stopLoss);

      console.log(`📊 [SL/TP] V3 Original SL: ${stopLoss.toFixed(2)}, Distance: ${originalSlDistance.toFixed(2)} points`);

      let finalSlDistance = originalSlDistance;

      if (USE_V3_SL) {
        // V3 Mode: Trust the ATR-based SL from signal generator
        // Only apply absolute safety limits

        if (originalSlDistance > MAX_SL_POINTS) {
          // Extreme case: Cap at absolute maximum (safety)
          console.warn(`⚠️  [SL/TP] V3 SL exceeds safety max (${originalSlDistance.toFixed(2)} > ${MAX_SL_POINTS}), capping`);
          finalSlDistance = MAX_SL_POINTS;
        } else if (originalSlDistance < MIN_SL_POINTS) {
          // Too tight: Expand to minimum
          console.warn(`⚠️  [SL/TP] V3 SL too tight (${originalSlDistance.toFixed(2)} < ${MIN_SL_POINTS}), expanding`);
          finalSlDistance = MIN_SL_POINTS;
        } else {
          // V3 SL is within acceptable range - USE IT
          console.log(`✅ [SL/TP] V3 SL accepted: ${originalSlDistance.toFixed(2)} points (within ${MIN_SL_POINTS}-${MAX_SL_POINTS} range)`);
          finalSlDistance = originalSlDistance;
        }
      } else {
        // Legacy mode: Use old capping logic (200 points)
        const LEGACY_MAX = 200;
        if (originalSlDistance > LEGACY_MAX) {
          console.warn(`⚠️  [SL/TP] Legacy cap: ${originalSlDistance.toFixed(2)} → ${LEGACY_MAX} points`);
          finalSlDistance = LEGACY_MAX;
        }
      }

      // Apply final SL
      stopLoss = isBuy
        ? executionPrice - finalSlDistance
        : executionPrice + finalSlDistance;

      // Calculate TP based on final SL distance
      const tpDistance = finalSlDistance * RR_RATIO;
      takeProfit = isBuy
        ? executionPrice + tpDistance
        : executionPrice - tpDistance;

      console.log(`✅ [SL/TP] Final: Entry=${executionPrice.toFixed(2)}, SL=${stopLoss!.toFixed(2)}, TP=${takeProfit!.toFixed(2)}`);
      console.log(`   SL Distance: ${finalSlDistance.toFixed(2)} pts | TP Distance: ${tpDistance.toFixed(2)} pts | R:R: 1:${RR_RATIO}`);

    } else if (!stopLoss && executionPrice) {
      // No SL provided - set default
      console.warn(`⚠️  [SL/TP] No stop loss provided, setting default ${DEFAULT_SL_POINTS} points`);
      stopLoss = isBuy
        ? executionPrice - DEFAULT_SL_POINTS
        : executionPrice + DEFAULT_SL_POINTS;

      const tpDistance = DEFAULT_SL_POINTS * RR_RATIO;
      takeProfit = isBuy
        ? executionPrice + tpDistance
        : executionPrice - tpDistance;

      console.log(`   Default SL: ${stopLoss!.toFixed(2)}, Default TP: ${takeProfit!.toFixed(2)}`);
    }

    console.log(`✅ [SL/TP] Final values: Entry=${executionPrice.toFixed(2)}, SL=${stopLoss?.toFixed(2) || 'NONE'}, TP=${takeProfit?.toFixed(2) || 'NONE'}`);

    // Calculate lot size (MT4 uses lots, not quantity)
    // Now uses dynamic position sizing based on risk % and stop loss distance
    let lotSize: number;
    try {
      lotSize = await mt4Service.calculateLotSize(
        agent.userId.toString(),
        universalSymbol,
        positionSize,
        stopLoss,        // Pass stop loss for risk-based calculation
        executionPrice   // Pass entry price
      );
      console.log(`💰 MT4 Lot size calculation: Risk-based → ${lotSize} lots`);
    } catch (error) {
      console.error(`Failed to calculate lot size:`, error);
      return;
    }

    // NOTE: LLM consensus multiplier has been removed.
    // Position sizing is now handled by LLM risk classification (SAFE=100%, MODERATE=70%, RISKY=40%)
    // in signalValidationService.ts, which already accounts for signal quality and market conditions.
    const llmConsensus = validatedSignal.llmConsensus;
    if (llmConsensus && llmConsensus.votesFor !== undefined) {
      console.log(`📊 [LLM CONSENSUS] ${llmConsensus.votesFor}/4 agree, ${llmConsensus.votesAgainst || 0} disagree, ${llmConsensus.votesNeutral || 0} neutral`);
      console.log(`   Position size already adjusted by risk classification - no additional multiplier applied`);
    }

    // Validate lot size
    if (lotSize < 0.01) {
      console.error(`❌ Lot size too small: ${lotSize}. Minimum is 0.01 lots`);
      return;
    }

    console.log(`💰 MT4 Trade: ${positionSize} USDT → ${lotSize} lots ${mt4Symbol} @ ${executionPrice}`);

    // Execute MT4 order immediately (no scheduling needed - MT4 is ultra-fast)
    try {
      // Debug logging before execution
      console.log(`[ValidatedSignalExecutor] Executing MT4 signal:`, {
        agentId,
        agentName: agent.name,
        universalSymbol,
        mt4Symbol,
        recommendation,
        lotSize,
        stopLoss: stopLoss || 'none',
        takeProfit: takeProfit || 'none',
        executionPrice
      });
      console.log(`🔍 [DEBUG] About to call mt4Service.createMarketOrder with:`, {
        userId: agent.userId.toString(),
        symbol: universalSymbol,
        type: recommendation.toLowerCase(),
        lotSize,
        stopLoss,
        takeProfit
      });

      // CRITICAL: Check account balance before creating order
      const accountInfo = await mt4Service.getBalance(agent.userId.toString());
      const currentPrice = executionPrice || (await mt4Service.getPrice(agent.userId.toString(), universalSymbol)).ask;

      // Get symbol info for contract size
      const symbolInfo = await symbolMappingService.getSymbolInfo(universalSymbol);
      let contractSize = 1; // Default: 1 unit per lot for crypto
      let leverage = 100;   // Default: 1:100 leverage typical for crypto

      // Get broker-specific contract size if configured
      if (mt4Symbol) {
        const envKey = `MT4_CONTRACT_SIZE_${mt4Symbol.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        const configuredSize = process.env[envKey];
        console.log(`🔍 Looking for contract size: ${envKey} = ${configuredSize || 'NOT FOUND (using default)'}`);
        if (configuredSize) {
          contractSize = parseFloat(configuredSize);
          console.log(`✅ Using configured contract size: ${contractSize}`);
        } else {
          console.warn(`⚠️  Contract size not configured for ${mt4Symbol}. Using default: ${contractSize}`);
        }

        // Get leverage from environment or use default
        const leverageKey = `MT4_LEVERAGE_${mt4Symbol.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        const configuredLeverage = process.env[leverageKey];
        console.log(`🔍 Looking for leverage: ${leverageKey} = ${configuredLeverage || 'NOT FOUND (using default)'}`);
        if (configuredLeverage) {
          leverage = parseFloat(configuredLeverage);
          console.log(`✅ Using configured leverage: 1:${leverage}`);
        } else {
          console.warn(`⚠️  Leverage not configured for ${mt4Symbol}. Using default: 1:${leverage}`);
        }
      }

      // Validate contract size to detect configuration issues
      if (contractSize > 1000 || contractSize <= 0) {
        const errorMsg = `Invalid contract size: ${contractSize} for ${mt4Symbol}. Expected range: 0.01-1000`;
        console.error(`❌ ${errorMsg}`);
        await AgentSignalLogModel.updateOne(
          { signalId: signalId, agentId: agentId },
          {
            $set: {
              status: 'FAILED',
              executed: false,
              failedReason: errorMsg
            }
          }
        );
        throw new Error(errorMsg);
      }

      // Correct margin calculation: (lot size * contract size * price) / leverage
      const estimatedMargin = (lotSize * contractSize * currentPrice) / leverage;

      console.log(`💰 Balance check for ${mt4Symbol}:`);
      console.log(`   Lot size: ${lotSize}`);
      console.log(`   Contract size: ${contractSize}`);
      console.log(`   Price: $${currentPrice.toFixed(2)}`);
      console.log(`   Leverage: 1:${leverage}`);
      console.log(`   Free margin: $${accountInfo.freeMargin.toFixed(2)}`);
      console.log(`   Estimated margin required: $${estimatedMargin.toFixed(2)}`);

      // Validate margin calculation sanity - warn if margin seems unrealistic
      const positionValue = lotSize * contractSize * currentPrice;
      if (estimatedMargin > positionValue) {
        console.warn(`⚠️  WARNING: Estimated margin ($${estimatedMargin.toFixed(2)}) exceeds position value ($${positionValue.toFixed(2)}). This indicates a configuration error.`);
        console.warn(`⚠️  Check: Contract size=${contractSize}, Leverage=${leverage}, Price=${currentPrice}`);
      }

      if (accountInfo.freeMargin < estimatedMargin) {
        const errorMsg = `Insufficient margin: Free=${accountInfo.freeMargin.toFixed(2)}, Required=${estimatedMargin.toFixed(2)}`;
        console.error(`❌ ${errorMsg}`);

        // Mark as FAILED in log
        await AgentSignalLogModel.updateOne(
          { signalId: signalId, agentId: agentId },
          {
            $set: {
              status: 'FAILED',
              executed: false,
              failedReason: errorMsg
            }
          }
        );

        throw new Error(errorMsg);
      }

      const order = await mt4Service.createMarketOrder(
        agent.userId.toString(),
        universalSymbol,
        recommendation.toLowerCase() as 'buy' | 'sell',
        lotSize,
        stopLoss,
        takeProfit
      );

      console.log(`✅ MT4 Order executed: ${recommendation} ${lotSize} lots ${mt4Symbol} | Ticket: ${order.ticket} | Price: ${order.openPrice}`);

      // CRITICAL: Record trade opened for cooldown system and daily stats
      await riskManager.recordTradeOpened();

      // NEW: Verify SL/TP were actually set in MT4
      if (stopLoss || takeProfit) {
        await this.verifyMT4SLTP(agent.userId.toString(), universalSymbol, order.ticket, stopLoss, takeProfit);
      }

      // NEW: Track position in MT4 Trade Manager for auto-close monitoring
      await mt4TradeManager.trackPosition({
        userId: agent.userId.toString(),
        agentId: agentId,
        ticket: order.ticket,
        symbol: mt4Symbol,
        side: recommendation.toLowerCase() as 'buy' | 'sell',
        lotSize: lotSize,
        entryPrice: order.openPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit
      });

      // NEW: Track Fibonacci scalping positions for LLM-based early exit
      if (validatedSignal.category === 'FIBONACCI_SCALPING') {
        const { positionMonitorService } = await import('./positionMonitorService');
        await positionMonitorService.addPosition(
          signalId,
          agent.userId.toString(),
          agentId,
          universalSymbol,
          order.openPrice,
          validatedSignal, // Store full signal data for exit analysis
          order.ticket
        );
        console.log(`📊 Added Fibonacci position ${signalId} to LLM monitoring`);
      }

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

      console.log(`📝 Position tracking started for ticket ${order.ticket}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to execute MT4 order for ${agent.name}:`, errorMessage);

      // Check for specific MT4 error 4109 (AutoTrading disabled)
      if (errorMessage.includes('4109')) {
        console.error(`⚠️  MT4 ERROR 4109: AutoTrading is disabled or EA not allowed to trade`);
        console.error(`    Fix: Enable AutoTrading in MT4:`);
        console.error(`    1. Tools → Options → Expert Advisors → Check "Allow automated trading"`);
        console.error(`    2. Right-click chart → EA Properties (F7) → Check "Allow live trading"`);
      }

      // Mark as FAILED in log
      await AgentSignalLogModel.updateOne(
        { signalId: signalId, agentId: agentId },
        {
          $set: {
            status: 'FAILED',
            executed: false,
            failedReason: errorMessage
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

  /**
   * Execute a signal immediately without queueing
   * Used for MT4 signals that need ultra-low latency execution
   */
  async executeSignalDirect(agent: any, validatedSignal: any, symbol: string): Promise<void> {
    try {
      console.log(`⚡ DIRECT EXECUTION (no queue): ${symbol} for agent ${agent.name} (${agent.broker})`);
      console.log(`🔍 [DEBUG] executeSignalDirect called with:`, {
        agentId: agent._id?.toString(),
        agentName: agent.name,
        broker: agent.broker,
        symbol,
        category: validatedSignal.category,
        recommendation: validatedSignal.recommendation,
        positionSize: validatedSignal.positionSize
      });

      // Call the main executeSignal method directly
      // This bypasses the Redis queue and processes immediately
      await this.executeSignal(validatedSignal);

      console.log(`✅ Direct execution completed for ${agent.name}: ${symbol}`);
    } catch (error) {
      console.error(`❌ Direct execution failed for ${agent.name}:`, error);
      throw error; // Re-throw so caller knows it failed
    }
  }

  // ============================================================================
  // V6 PRO SNIPER - Direct Setup Execution
  // ============================================================================

  /**
   * Convert percentage-based SL/TP to absolute prices
   * Detection: Values < 100 are likely percentages, > 1000 are absolute prices
   *
   * @param value - The SL or TP value from setup
   * @param executionPrice - Current execution price
   * @param direction - Trade direction (BUY or SELL)
   * @param isStopLoss - True for SL, false for TP
   * @returns Object with converted value and flag indicating if conversion occurred
   */
  private convertToAbsolutePrice(
    value: number,
    executionPrice: number,
    direction: 'BUY' | 'SELL',
    isStopLoss: boolean
  ): { converted: number; wasPercentage: boolean } {
    // Heuristic: If value < 100, it's likely a percentage
    // BTC prices are always > 1000, so this is a safe threshold
    const isLikelyPercentage = value < 100;

    if (!isLikelyPercentage) {
      return { converted: value, wasPercentage: false };
    }

    const percentValue = value; // e.g., 0.185 means 0.185%
    let converted: number;

    if (direction === 'BUY') {
      converted = isStopLoss
        ? executionPrice * (1 - percentValue / 100)  // BUY SL below entry
        : executionPrice * (1 + percentValue / 100); // BUY TP above entry
    } else {
      converted = isStopLoss
        ? executionPrice * (1 + percentValue / 100)  // SELL SL above entry
        : executionPrice * (1 - percentValue / 100); // SELL TP below entry
    }

    return { converted, wasPercentage: true };
  }

  /**
   * Execute a V6 trade setup directly (called from zoneMonitorService)
   * This method bypasses the signal queue and LLM validation - the setup is already confirmed.
   *
   * @param setup - The V6 trade setup to execute
   * @param executionPrice - The confirmed entry price
   * @returns Promise with execution result
   */
  async executeV6Setup(setup: {
    id: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    grade: 'A' | 'B' | 'C';
    entryZone: { low: number; high: number; midpoint: number };
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    riskRewardRatio: number;
    marketContext: string;
  }, executionPrice: number): Promise<{
    success: boolean;
    ticket?: number;
    error?: string;
  }> {
    console.log('');
    console.log('==================================================');
    console.log(`[V6-EXECUTE] Executing setup ${setup.id.slice(0, 8)}`);
    console.log('==================================================');
    console.log(`  Direction: ${setup.direction}`);
    console.log(`  Grade: ${setup.grade}`);
    console.log(`  Entry: $${executionPrice.toFixed(2)}`);
    console.log(`  SL: $${setup.stopLoss.toFixed(2)}`);
    console.log(`  TP: $${setup.takeProfit1.toFixed(2)}`);
    console.log(`  R:R: ${setup.riskRewardRatio.toFixed(2)}`);
    console.log('');

    try {
      // Get the V6 agent (MT4 agent for V6 execution)
      // NOTE: Agent category is 'SCALPING', which auto-includes 'FIBONACCI_SCALPING' in allowedSignalCategories
      console.log(`[V6-EXECUTE-DEBUG] Step 1: Looking for MT4 SCALPING agent...`);
      const agent = await ScalpingAgent.findOne({
        broker: 'MT4',
        isActive: true,
        category: 'SCALPING'
      });

      if (!agent) {
        console.error('[V6-EXECUTE-DEBUG] Step 1 FAILED: No active MT4 SCALPING agent found');
        console.error('[V6-EXECUTE] No active MT4 SCALPING agent found');
        return { success: false, error: 'No active MT4 agent found' };
      }

      console.log(`[V6-EXECUTE-DEBUG] Step 1 PASSED: Agent found`);
      console.log(`[V6-EXECUTE] Using agent: ${agent.name} (${agent._id})`);

      // ============================================================
      // RISK CHECKS (same as executeMT4Signal)
      // ============================================================
      console.log(`[V6-EXECUTE-DEBUG] Step 2: Checking risk limits...`);

      // CRITICAL CHECK 1: Position limits
      const positionCheck = await riskManager.canOpenPosition(setup.direction, agent.userId.toString());
      if (!positionCheck.allowed) {
        console.error(`[V6-EXECUTE-DEBUG] Step 2 FAILED: Position limit - ${positionCheck.reason}`);
        console.warn(`[V6-EXECUTE] Position limit reached: ${positionCheck.reason}`);
        return { success: false, error: positionCheck.reason };
      }

      // CRITICAL CHECK 2: Trade cooldown
      const cooldownCheck = await riskManager.checkAndStartCooldown();
      if (!cooldownCheck.allowed) {
        console.error(`[V6-EXECUTE-DEBUG] Step 2 FAILED: Cooldown - ${cooldownCheck.reason}`);
        console.warn(`[V6-EXECUTE] Cooldown active: ${cooldownCheck.reason}`);
        return { success: false, error: cooldownCheck.reason };
      }

      // CRITICAL CHECK 3: Daily limits
      const dailyCheck = await riskManager.checkDailyLimits();
      if (!dailyCheck.allowed) {
        console.error(`[V6-EXECUTE-DEBUG] Step 2 FAILED: Daily limit - ${dailyCheck.reason}`);
        console.warn(`[V6-EXECUTE] Daily limit reached: ${dailyCheck.reason}`);
        return { success: false, error: dailyCheck.reason };
      }

      console.log(`[V6-EXECUTE-DEBUG] Step 2 PASSED: All risk checks passed`);

      // ============================================================
      // POSITION SIZING BY GRADE
      // ============================================================
      console.log(`[V6-EXECUTE-DEBUG] Step 3: Calculating position size...`);

      const BASE_POSITION_USD = parseFloat(process.env.V6_BASE_POSITION_USD || '800');
      const GRADE_MULTIPLIERS = {
        A: 1.0,   // 100% of base
        B: 0.75,  // 75% of base
        C: 0.5,   // 50% of base
      };

      const positionSizeUSD = BASE_POSITION_USD * GRADE_MULTIPLIERS[setup.grade];
      console.log(`[V6-EXECUTE-DEBUG] Step 3 PASSED: Position $${positionSizeUSD}`);
      console.log(`[V6-EXECUTE] Position size: $${positionSizeUSD} (Grade ${setup.grade}: ${GRADE_MULTIPLIERS[setup.grade] * 100}%)`);

      // ============================================================
      // SL/TP VALIDATION AND CONVERSION
      // ============================================================
      console.log(`[V6-EXECUTE-DEBUG] Step 4: Validating and converting SL/TP...`);

      // Detect and convert percentage-based SL/TP to absolute prices
      const slResult = this.convertToAbsolutePrice(setup.stopLoss, executionPrice, setup.direction, true);
      const tpResult = this.convertToAbsolutePrice(setup.takeProfit1, executionPrice, setup.direction, false);

      let stopLoss = slResult.converted;
      let takeProfit = tpResult.converted;

      // Log conversion if it occurred
      if (slResult.wasPercentage) {
        console.log(`[V6-EXECUTE] SL converted: ${setup.stopLoss}% -> $${stopLoss.toFixed(2)}`);
      }
      if (tpResult.wasPercentage) {
        console.log(`[V6-EXECUTE] TP converted: ${setup.takeProfit1}% -> $${takeProfit.toFixed(2)}`);
      }

      // Sanity check: Values should be within reasonable BTC range
      if (stopLoss < 50000 || stopLoss > 200000) {
        console.error(`[V6-EXECUTE-DEBUG] Step 4 FAILED: SL out of range: $${stopLoss.toFixed(2)}`);
        console.error(`[V6-EXECUTE] SL out of range: $${stopLoss.toFixed(2)}`);
        return { success: false, error: `SL out of range: ${stopLoss}` };
      }
      if (takeProfit < 50000 || takeProfit > 200000) {
        console.error(`[V6-EXECUTE-DEBUG] Step 4 FAILED: TP out of range: $${takeProfit.toFixed(2)}`);
        console.error(`[V6-EXECUTE] TP out of range: $${takeProfit.toFixed(2)}`);
        return { success: false, error: `TP out of range: ${takeProfit}` };
      }

      // Ensure SL is on the correct side
      const isBuy = setup.direction === 'BUY';
      if (isBuy && stopLoss >= executionPrice) {
        console.error(`[V6-EXECUTE-DEBUG] Step 4 FAILED: Invalid BUY SL ${stopLoss.toFixed(2)} >= entry ${executionPrice.toFixed(2)}`);
        console.error(`[V6-EXECUTE] Invalid BUY SL: ${stopLoss.toFixed(2)} >= entry ${executionPrice.toFixed(2)}`);
        return { success: false, error: 'Invalid stop loss for BUY' };
      }
      if (!isBuy && stopLoss <= executionPrice) {
        console.error(`[V6-EXECUTE-DEBUG] Step 4 FAILED: Invalid SELL SL ${stopLoss.toFixed(2)} <= entry ${executionPrice.toFixed(2)}`);
        console.error(`[V6-EXECUTE] Invalid SELL SL: ${stopLoss.toFixed(2)} <= entry ${executionPrice.toFixed(2)}`);
        return { success: false, error: 'Invalid stop loss for SELL' };
      }
      console.log(`[V6-EXECUTE-DEBUG] Step 4 PASSED: SL/TP valid and converted`);

      // Calculate actual R:R
      const slDistance = Math.abs(executionPrice - stopLoss);
      const tpDistance = Math.abs(takeProfit - executionPrice);
      const actualRR = tpDistance / slDistance;

      console.log(`[V6-EXECUTE] SL Distance: $${slDistance.toFixed(2)} | TP Distance: $${tpDistance.toFixed(2)} | R:R: ${actualRR.toFixed(2)}`);

      // ============================================================
      // GET MT4 SYMBOL
      // ============================================================

      const mt4Symbol = await symbolMappingService.convertSymbol(setup.symbol, 'MT4') || setup.symbol;
      console.log(`[V6-EXECUTE] Symbol mapping: ${setup.symbol} -> ${mt4Symbol}`);

      // ============================================================
      // CALCULATE LOT SIZE
      // ============================================================
      console.log(`[V6-EXECUTE-DEBUG] Step 5: Calculating lot size...`);

      let lotSize: number;
      try {
        lotSize = await mt4Service.calculateLotSize(
          agent.userId.toString(),
          setup.symbol,
          positionSizeUSD,
          stopLoss,
          executionPrice
        );
        console.log(`[V6-EXECUTE-DEBUG] Step 5 PASSED: Lot size ${lotSize}`);
        console.log(`[V6-EXECUTE] Lot size: ${lotSize} lots`);
      } catch (error: any) {
        console.error(`[V6-EXECUTE-DEBUG] Step 5 FAILED: ${error.message}`);
        console.error(`[V6-EXECUTE] Lot size calculation failed:`, error.message);
        return { success: false, error: `Lot size calculation failed: ${error.message}` };
      }

      if (lotSize < 0.01) {
        console.error(`[V6-EXECUTE-DEBUG] Step 5 FAILED: Lot size too small ${lotSize}`);
        console.error(`[V6-EXECUTE] Lot size too small: ${lotSize} (minimum 0.01)`);
        return { success: false, error: `Lot size too small: ${lotSize}` };
      }

      // ============================================================
      // EXECUTE MT4 ORDER
      // ============================================================
      console.log(`[V6-EXECUTE-DEBUG] Step 6: Placing MT4 order...`);
      console.log(`[V6-EXECUTE-DEBUG] Order params:`, JSON.stringify({
        userId: agent.userId.toString().slice(0, 8) + '...',
        symbol: setup.symbol,
        mt4Symbol,
        direction: setup.direction,
        lotSize,
        stopLoss,
        takeProfit
      }, null, 2));

      console.log(`[V6-EXECUTE] Placing MT4 order...`);
      console.log(`  Symbol: ${setup.symbol} (${mt4Symbol})`);
      console.log(`  Type: ${setup.direction}`);
      console.log(`  Lots: ${lotSize}`);
      console.log(`  SL: ${stopLoss}`);
      console.log(`  TP: ${takeProfit}`);

      const orderResult = await mt4Service.createMarketOrder(
        agent.userId.toString(),
        setup.symbol,
        setup.direction.toLowerCase() as 'buy' | 'sell',
        lotSize,
        stopLoss,
        takeProfit
      );

      console.log(`[V6-EXECUTE-DEBUG] Step 6 MT4 Response:`, JSON.stringify(orderResult, null, 2));

      if (!orderResult || !orderResult.ticket) {
        console.error(`[V6-EXECUTE-DEBUG] Step 6 FAILED: No ticket returned`);
        console.error(`[V6-EXECUTE] MT4 order failed - no ticket returned`);
        return { success: false, error: 'MT4 order failed - no ticket' };
      }

      const ticket = orderResult.ticket;
      console.log(`[V6-EXECUTE-DEBUG] Step 6 PASSED: Order placed, ticket ${ticket}`);
      console.log(`[V6-EXECUTE] MT4 order placed successfully! Ticket: ${ticket}`);

      // ============================================================
      // LOG EXECUTION
      // ============================================================

      // Create signal log entry for V6 execution
      await AgentSignalLogModel.create({
        signalId: `v6-${setup.id}`,
        agentId: agent._id,
        userId: agent.userId,
        symbol: setup.symbol,
        category: 'V6_SNIPER',
        recommendation: setup.direction,
        positionSize: positionSizeUSD,
        isValid: true,
        status: 'EXECUTED',
        executed: true,
        executedAt: new Date(),
        executionPrice: executionPrice,
        mt4Ticket: ticket,
        metadata: {
          setupId: setup.id,
          grade: setup.grade,
          riskReward: actualRR,
          stopLoss: stopLoss,
          takeProfit: takeProfit,
          marketContext: setup.marketContext,
        }
      });

      // CRITICAL: Track position in MT4 Trade Manager for time-based exit monitoring
      // This enables the 15min/30min exit rules in mt4TradeManager.checkTimeBasedExit()
      await mt4TradeManager.trackPosition({
        userId: agent.userId.toString(),
        agentId: agent._id?.toString() || '',
        ticket: ticket,
        symbol: mt4Symbol,
        side: setup.direction.toLowerCase() as 'buy' | 'sell',
        lotSize: lotSize,
        entryPrice: orderResult.openPrice,
        stopLoss: stopLoss,
        takeProfit: takeProfit
      });
      console.log(`[V6-EXECUTE] Position tracked for monitoring (30min max hold)`);

      console.log('');
      console.log(`[V6-EXECUTE] Execution complete!`);
      console.log(`  Ticket: ${ticket}`);
      console.log(`  Entry: $${executionPrice.toFixed(2)}`);
      console.log(`  Size: ${lotSize} lots ($${positionSizeUSD})`);
      console.log('==================================================');
      console.log('');

      return { success: true, ticket };

    } catch (error: any) {
      console.error(`[V6-EXECUTE] Execution error:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

export const validatedSignalExecutor = new ValidatedSignalExecutor();
