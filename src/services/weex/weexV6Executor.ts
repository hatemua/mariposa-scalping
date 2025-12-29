/**
 * MARIPOSA WEEX V6 - Trade Executor
 *
 * Executes V6 trade setups on WEEX exchange.
 * Called by zoneMonitorService when a setup is confirmed.
 */

import { EventEmitter } from 'events';
import { weexService } from '../weexService';
import { binanceService } from '../binanceService';
import { TradeSetup, SetupGrade, getPositionSizeMultiplier } from '../../types/v6/setup.types';
import {
  WeexExecutionResult,
  WeexOrderResult,
  WeexExecutorHealth,
  WeexV6Config,
  calculateWeexPositionSizeUSD,
} from '../../types/weex';
import { WEEX_V6_CONFIG } from '../../config/environment';
import { weexAiLogService } from './weexAiLogService';

// ============================================================================
// WEEX V6 EXECUTOR CLASS
// ============================================================================

class WeexV6Executor extends EventEmitter {
  private config: WeexV6Config;
  private executionStats = {
    total: 0,
    successful: 0,
    failed: 0,
    totalExecutionTimeMs: 0,
    lastExecutionTime: null as Date | null,
    lastError: null as string | null,
  };

  // Execution lock - prevents concurrent/duplicate executions
  private executionLock: boolean = false;
  private lastExecutionTime: number = 0;
  private readonly MIN_EXECUTION_INTERVAL_MS = 5000; // 5 second cooldown between trades

  constructor() {
    super();
    this.config = WEEX_V6_CONFIG;
  }

  /**
   * Round price to match WEEX stepSize requirement
   * Different symbols have different stepSize requirements:
   * - BTC: stepSize 0.1 (1 decimal)
   * - SOL: stepSize 0.1 (1 decimal)
   */
  private roundToStepSize(price: number, stepSize: number = 0.1): number {
    const decimals = Math.max(0, -Math.floor(Math.log10(stepSize)));
    const factor = Math.pow(10, decimals);
    return Math.round(price * factor) / factor;
  }

  /**
   * Execute a confirmed V6 setup on WEEX
   * Main entry point called by zone monitor when pattern is confirmed
   */
  async executeSetup(setup: TradeSetup, executionPrice: number): Promise<WeexExecutionResult> {
    const startTime = Date.now();

    // ============================================================================
    // FILTER 0: Execution lock - prevent concurrent/duplicate executions
    // ============================================================================
    if (this.executionLock) {
      console.log('[WEEX-EXECUTOR] BLOCKED: Execution already in progress');
      return { success: false, error: 'Execution lock active', timestamp: new Date() };
    }

    // Check cooldown - prevent rapid-fire executions
    const now = Date.now();
    if (now - this.lastExecutionTime < this.MIN_EXECUTION_INTERVAL_MS) {
      const timeSinceLast = now - this.lastExecutionTime;
      console.log(`[WEEX-EXECUTOR] BLOCKED: Cooldown active (${timeSinceLast}ms since last execution, need ${this.MIN_EXECUTION_INTERVAL_MS}ms)`);
      return { success: false, error: 'Execution cooldown active', timestamp: new Date() };
    }

    // Set execution lock
    this.executionLock = true;
    this.lastExecutionTime = now;

    this.executionStats.total++;

    console.log('');
    console.log('==================================================');
    console.log('[WEEX-EXECUTOR] Executing V6 setup on WEEX');
    console.log(`[WEEX-EXECUTOR] Setup ID: ${setup.id}`);
    console.log(`[WEEX-EXECUTOR] Direction: ${setup.direction}`);
    console.log(`[WEEX-EXECUTOR] Grade: ${setup.grade}`);
    console.log(`[WEEX-EXECUTOR] Bias: ${setup.bias || 'N/A'}`);
    console.log(`[WEEX-EXECUTOR] Entry Price: $${executionPrice.toFixed(2)}`);
    console.log(`[WEEX-EXECUTOR] SL: $${setup.stopLoss} | TP: $${setup.takeProfit1}`);
    console.log('==================================================');

    // ============================================================================
    // VALIDATION CHECKS - Must pass before executing
    // ============================================================================

    // FILTER 1: Block Grade C counter-trend trades
    if (setup.grade === 'C' && setup.bias === 'COUNTER_TREND') {
      console.log('[WEEX-EXECUTOR] BLOCKED: Grade C counter-trend trade rejected');
      console.log(`[WEEX-EXECUTOR]   Direction: ${setup.direction}, HTF Trend: ${setup.htfTrend || 'N/A'}`);
      this.executionStats.failed++;
      this.executionStats.lastError = 'Grade C counter-trend blocked';
      return {
        success: false,
        error: 'Grade C counter-trend trade blocked by trend filter',
        timestamp: new Date(),
      };
    }

    // FILTER 2: Block if position already exists (prevent double entries)
    try {
      const existingPosition = await weexService.getPosition(this.config.SYMBOL);
      // Handle both API field naming conventions (size vs hold_available)
      const existingQty = existingPosition
        ? parseFloat(existingPosition.size || existingPosition.hold_available || '0')
        : 0;
      if (existingPosition && existingQty > 0) {
        // Handle both side formats: "LONG"/"SHORT" or "1"/"2"
        const sideRaw = existingPosition.side || existingPosition.hold_side || '';
        const existingSide = (sideRaw === 'LONG' || sideRaw === '1') ? 'LONG' : 'SHORT';
        const existingEntry = parseFloat(existingPosition.hold_avg_price || '0');

        console.log('[WEEX-EXECUTOR] BLOCKED: Position already exists');
        console.log(`[WEEX-EXECUTOR]   Existing: ${existingSide} ${existingQty} @ $${existingEntry.toFixed(2)}`);
        console.log(`[WEEX-EXECUTOR]   Wanted: ${setup.direction} @ $${executionPrice.toFixed(2)}`);

        this.executionStats.failed++;
        this.executionStats.lastError = 'Position already exists';
        return {
          success: false,
          error: `Position already exists: ${existingSide} ${existingQty}`,
          timestamp: new Date(),
        };
      }
    } catch (posCheckErr: any) {
      console.error(`[WEEX-EXECUTOR] BLOCKED: Position check FAILED - ${posCheckErr.message}`);
      this.executionLock = false; // Release lock before returning
      this.executionStats.failed++;
      this.executionStats.lastError = `Position check failed: ${posCheckErr.message}`;
      return {
        success: false,
        error: `Position check failed: ${posCheckErr.message}`,
        timestamp: new Date(),
      };
    }

    // ============================================================================
    // FILTER 3: Validate R:R ratio before execution
    // ============================================================================
    const slDistance = Math.abs(setup.stopLoss - executionPrice);
    const tpDistance = Math.abs(setup.takeProfit1 - executionPrice);
    const actualRR = slDistance > 0 ? tpDistance / slDistance : 0;

    console.log(`[WEEX-EXECUTOR] R:R Check: SL dist=$${slDistance.toFixed(2)}, TP dist=$${tpDistance.toFixed(2)}, R:R=1:${actualRR.toFixed(2)}`);

    if (actualRR < 1.0) {
      console.error(`[WEEX-EXECUTOR] BLOCKED: R:R 1:${actualRR.toFixed(2)} is below 1:1 minimum`);
      console.error(`[WEEX-EXECUTOR]   Entry: $${executionPrice.toFixed(2)}, SL: $${setup.stopLoss.toFixed(2)}, TP: $${setup.takeProfit1.toFixed(2)}`);
      this.executionLock = false; // Release lock before returning
      this.executionStats.failed++;
      this.executionStats.lastError = `Invalid R:R ratio: 1:${actualRR.toFixed(2)}`;
      return {
        success: false,
        error: `Invalid R:R ratio: 1:${actualRR.toFixed(2)} (minimum 1:1 required)`,
        timestamp: new Date(),
      };
    }

    try {
      // Step 1: Calculate position size
      const positionSizeUSD = this.calculatePositionSize(setup);
      const positionSizeBTC = positionSizeUSD / executionPrice;

      console.log(`[WEEX-EXECUTOR] Position size: $${positionSizeUSD.toFixed(2)} (${positionSizeBTC.toFixed(6)} BTC)`);

      // Step 2: Verify we have enough balance
      const hasBalance = await this.verifyBalance(positionSizeUSD);
      if (!hasBalance) {
        throw new Error('Insufficient balance for trade');
      }

      // Step 3: Place the order with TP/SL preset on exchange
      const orderResult = await this.placeOrder(
        setup.direction,
        positionSizeBTC,
        this.config.SYMBOL,
        setup.takeProfit1,
        setup.stopLoss
      );

      if (!orderResult.success) {
        throw new Error(orderResult.error || 'Order placement failed');
      }

      // Step 4: Verify order execution
      const verifiedPrice = await this.verifyOrderFill(
        orderResult.orderId!.toString(),
        this.config.SYMBOL
      );

      // Step 5: Record success
      this.executionStats.successful++;
      this.executionStats.lastExecutionTime = new Date();
      const executionTimeMs = Date.now() - startTime;
      this.executionStats.totalExecutionTimeMs += executionTimeMs;

      const result: WeexExecutionResult = {
        success: true,
        orderId: orderResult.orderId?.toString(),
        clientOrderId: orderResult.clientOrderId,
        tpOrderId: orderResult.tpOrderId?.toString(),  // TP order ID for modification
        slOrderId: orderResult.slOrderId?.toString(),  // SL order ID for modification
        executionPrice: verifiedPrice || executionPrice,
        positionSizeUSD,
        positionSizeBTC,
        leverage: this.config.LEVERAGE,
        timestamp: new Date(),
      };

      console.log(`[WEEX-EXECUTOR] SUCCESS! Order ID: ${result.orderId}`);
      console.log(`[WEEX-EXECUTOR] Fill price: $${result.executionPrice?.toFixed(2)}`);
      console.log(`[WEEX-EXECUTOR] Execution time: ${executionTimeMs}ms`);
      if (result.tpOrderId || result.slOrderId) {
        console.log(`[WEEX-EXECUTOR] TP Order: ${result.tpOrderId || 'N/A'} | SL Order: ${result.slOrderId || 'N/A'}`);
      }

      // Log order execution to WEEX AI Log API (fire-and-forget)
      weexAiLogService.logOrderExecution({
        orderId: result.orderId || '0',
        setup: {
          direction: setup.direction,
          grade: setup.grade,
          entryPrice: result.executionPrice || executionPrice,
          stopLoss: setup.stopLoss,
          takeProfit: setup.takeProfit1,
          riskRewardRatio: setup.riskRewardRatio,
        },
        marketData: {
          currentPrice: executionPrice,
          htfTrend: setup.htfTrend,
          exhaustion: false,
        },
        execution: {
          action: setup.direction === 'BUY' ? 'OPEN_LONG' : 'OPEN_SHORT',
          positionSizeBTC: positionSizeBTC,
          positionSizeUSD: positionSizeUSD,
          leverage: this.config.LEVERAGE,
        },
      });

      // Emit event for position monitor to pick up
      this.emit('positionOpened', {
        type: 'POSITION_OPENED',
        positionId: result.orderId,
        setupId: setup.id,
        symbol: this.config.SYMBOL,
        direction: setup.direction,
        price: result.executionPrice,
        timestamp: new Date(),
      });

      return result;

    } catch (error: any) {
      this.executionStats.failed++;
      this.executionStats.lastError = error.message;
      this.executionStats.lastExecutionTime = new Date();

      console.error(`[WEEX-EXECUTOR] FAILED: ${error.message}`);
      console.error(`[WEEX-EXECUTOR] Stack: ${error.stack}`);

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    } finally {
      // Always release the execution lock
      this.executionLock = false;
    }
  }

  /**
   * Calculate position size based on setup grade and config
   */
  calculatePositionSize(setup: TradeSetup): number {
    const multiplier = getPositionSizeMultiplier(setup.grade);
    const baseSize = this.config.BASE_POSITION_SIZE_USD;
    const size = baseSize * multiplier;

    console.log(`[WEEX-EXECUTOR] Position sizing: Grade ${setup.grade} = ${multiplier}x = $${size}`);

    return size;
  }

  /**
   * Verify we have enough balance for the trade
   */
  private async verifyBalance(requiredUSD: number): Promise<boolean> {
    try {
      const assets = await weexService.getContractAssets();
      const usdtAsset = assets.find(a => a.coinName === 'USDT');

      if (!usdtAsset) {
        console.warn('[WEEX-EXECUTOR] No USDT balance found');
        return false;
      }

      const available = parseFloat(usdtAsset.available || '0');
      const equity = parseFloat(usdtAsset.equity || '0');

      // With leverage, we need less margin
      const requiredMargin = requiredUSD / this.config.LEVERAGE;

      console.log(`[WEEX-EXECUTOR] Balance check: Available=$${available.toFixed(2)}, Equity=$${equity.toFixed(2)}`);
      console.log(`[WEEX-EXECUTOR] Required margin (${this.config.LEVERAGE}x leverage): $${requiredMargin.toFixed(2)}`);

      if (available < requiredMargin) {
        console.error(`[WEEX-EXECUTOR] Insufficient margin! Need $${requiredMargin.toFixed(2)}, have $${available.toFixed(2)}`);
        return false;
      }

      return true;
    } catch (error: any) {
      console.error(`[WEEX-EXECUTOR] Balance check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Place order on WEEX with retry logic
   * Uses preset TP/SL on entry order (single API call)
   */
  async placeOrder(
    direction: 'BUY' | 'SELL',
    sizeBTC: number,
    symbol: string,
    takeProfit: number,
    stopLoss: number
  ): Promise<WeexOrderResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    // Round TP/SL to match WEEX stepSize requirement (0.1)
    const roundedTP = this.roundToStepSize(takeProfit, 0.1);
    const roundedSL = this.roundToStepSize(stopLoss, 0.1);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[WEEX-EXECUTOR] Placing ${direction} order (attempt ${attempt}/${maxRetries})`);
        console.log(`[WEEX-EXECUTOR] Size: ${sizeBTC.toFixed(6)} BTC on ${symbol}`);
        console.log(`[WEEX-EXECUTOR] TP: $${roundedTP} | SL: $${roundedSL} (preset on entry)`);

        // Single API call with preset TP/SL
        const result = await weexService.placeOrder({
          symbol,
          side: direction === 'BUY' ? 'buy' : 'sell',
          orderType: 'market',
          quantity: sizeBTC.toFixed(4),
          positionAction: 'open',
          takeProfitPrice: roundedTP,
          stopLossPrice: roundedSL,
        });

        if (!result || !result.data || !result.data.orderId) {
          throw new Error('Invalid order response - no orderId');
        }

        console.log(`[WEEX-EXECUTOR] Order placed with preset TP/SL: ${result.data.orderId}`);

        // Extract TP/SL order IDs from response
        let tpOrderId = result.data.tpOrderId;
        let slOrderId = result.data.slOrderId;

        // FALLBACK: If WEEX API didn't return TP/SL order IDs, place them separately
        if (!tpOrderId || !slOrderId) {
          console.log('[WEEX-EXECUTOR] No preset TP/SL order IDs in response, placing separately...');

          const holdSide = direction === 'BUY' ? '1' : '2';  // 1=long, 2=short

          // Place TP order if not returned
          if (!tpOrderId) {
            try {
              const tpResult = await weexService.placeTpSlOrder({
                symbol,
                planType: 'profit_plan',
                triggerPrice: roundedTP.toString(),
                holdSide: holdSide as '1' | '2',
              });
              if (tpResult.success && tpResult.orderId) {
                tpOrderId = tpResult.orderId;
                console.log(`[WEEX-EXECUTOR] TP order placed separately: ${tpOrderId}`);
              } else {
                console.warn(`[WEEX-EXECUTOR] Failed to place TP order: ${tpResult.error}`);
              }
            } catch (err: any) {
              console.error(`[WEEX-EXECUTOR] Error placing TP order: ${err.message}`);
            }
          }

          // Place SL order if not returned
          if (!slOrderId) {
            try {
              const slResult = await weexService.placeTpSlOrder({
                symbol,
                planType: 'loss_plan',
                triggerPrice: roundedSL.toString(),
                holdSide: holdSide as '1' | '2',
              });
              if (slResult.success && slResult.orderId) {
                slOrderId = slResult.orderId;
                console.log(`[WEEX-EXECUTOR] SL order placed separately: ${slOrderId}`);
              } else {
                console.warn(`[WEEX-EXECUTOR] Failed to place SL order: ${slResult.error}`);
              }
            } catch (err: any) {
              console.error(`[WEEX-EXECUTOR] Error placing SL order: ${err.message}`);
            }
          }
        }

        // Success - return with TP/SL order IDs (if available)
        return {
          success: true,
          orderId: result.data.orderId,
          clientOrderId: result.data.clientOrderId,
          tpOrderId: tpOrderId ? Number(tpOrderId) : undefined,
          slOrderId: slOrderId ? Number(slOrderId) : undefined,
        };

      } catch (error: any) {
        lastError = error;
        console.error(`[WEEX-EXECUTOR] Order attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          const delay = 1000 * attempt;
          console.log(`[WEEX-EXECUTOR] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Order failed after retries',
    };
  }

  /**
   * Verify order was filled and get actual fill price
   */
  private async verifyOrderFill(orderId: string, symbol: string): Promise<number | null> {
    const maxAttempts = 5;
    const delayMs = 500;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, delayMs));

        const orderStatus = await weexService.getOrderStatus(orderId, symbol);

        if (orderStatus.status === 'filled' || orderStatus.status === 'partially_filled') {
          const avgPrice = parseFloat(orderStatus.price_avg || '0');
          console.log(`[WEEX-EXECUTOR] Order ${orderId} filled at avg price: $${avgPrice.toFixed(2)}`);
          return avgPrice;
        }

        if (orderStatus.status === 'canceled' || orderStatus.status === 'rejected') {
          throw new Error(`Order ${orderId} was ${orderStatus.status}`);
        }

        console.log(`[WEEX-EXECUTOR] Order status check ${attempt}/${maxAttempts}: ${orderStatus.status}`);

      } catch (error: any) {
        console.warn(`[WEEX-EXECUTOR] Status check ${attempt} failed: ${error.message}`);
      }
    }

    console.warn('[WEEX-EXECUTOR] Could not verify fill price, using execution price');
    return null;
  }

  /**
   * Get current health status
   */
  getHealth(): WeexExecutorHealth {
    const avgExecutionTime = this.executionStats.total > 0
      ? this.executionStats.totalExecutionTimeMs / this.executionStats.total
      : 0;

    return {
      isHealthy: this.executionStats.failed < this.executionStats.successful || this.executionStats.total < 5,
      totalExecutions: this.executionStats.total,
      successfulExecutions: this.executionStats.successful,
      failedExecutions: this.executionStats.failed,
      lastExecutionTime: this.executionStats.lastExecutionTime || undefined,
      lastError: this.executionStats.lastError || undefined,
      averageExecutionTimeMs: avgExecutionTime,
    };
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return { ...this.executionStats };
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats() {
    this.executionStats = {
      total: 0,
      successful: 0,
      failed: 0,
      totalExecutionTimeMs: 0,
      lastExecutionTime: null,
      lastError: null,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const weexV6Executor = new WeexV6Executor();
export { WeexV6Executor };
