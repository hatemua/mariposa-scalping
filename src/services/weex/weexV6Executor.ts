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

  constructor() {
    super();
    this.config = WEEX_V6_CONFIG;
  }

  /**
   * Execute a confirmed V6 setup on WEEX
   * Main entry point called by zone monitor when pattern is confirmed
   */
  async executeSetup(setup: TradeSetup, executionPrice: number): Promise<WeexExecutionResult> {
    const startTime = Date.now();
    this.executionStats.total++;

    console.log('');
    console.log('==================================================');
    console.log('[WEEX-EXECUTOR] Executing V6 setup on WEEX');
    console.log(`[WEEX-EXECUTOR] Setup ID: ${setup.id}`);
    console.log(`[WEEX-EXECUTOR] Direction: ${setup.direction}`);
    console.log(`[WEEX-EXECUTOR] Grade: ${setup.grade}`);
    console.log(`[WEEX-EXECUTOR] Entry Price: $${executionPrice.toFixed(2)}`);
    console.log(`[WEEX-EXECUTOR] SL: $${setup.stopLoss} | TP: $${setup.takeProfit1}`);
    console.log('==================================================');

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

      // Step 3: Place the order
      const orderResult = await this.placeOrder(
        setup.direction,
        positionSizeBTC,
        this.config.SYMBOL
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
        executionPrice: verifiedPrice || executionPrice,
        positionSizeUSD,
        positionSizeBTC,
        leverage: this.config.LEVERAGE,
        timestamp: new Date(),
      };

      console.log(`[WEEX-EXECUTOR] SUCCESS! Order ID: ${result.orderId}`);
      console.log(`[WEEX-EXECUTOR] Fill price: $${result.executionPrice?.toFixed(2)}`);
      console.log(`[WEEX-EXECUTOR] Execution time: ${executionTimeMs}ms`);

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
   */
  async placeOrder(
    direction: 'BUY' | 'SELL',
    sizeBTC: number,
    symbol: string
  ): Promise<WeexOrderResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[WEEX-EXECUTOR] Placing ${direction} order (attempt ${attempt}/${maxRetries})`);
        console.log(`[WEEX-EXECUTOR] Size: ${sizeBTC.toFixed(6)} BTC on ${symbol}`);

        let result;
        if (direction === 'BUY') {
          // Open long position
          result = await weexService.placeOrder({
            symbol,
            side: 'buy',
            orderType: 'market',
            quantity: sizeBTC.toFixed(4),
            positionAction: 'open',
          });
        } else {
          // Open short position
          result = await weexService.openShort(sizeBTC.toFixed(4), symbol);
        }

        if (result && result.data && result.data.orderId) {
          console.log(`[WEEX-EXECUTOR] Order placed successfully: ${result.data.orderId}`);
          return {
            success: true,
            orderId: result.data.orderId,
            clientOrderId: result.data.clientOrderId,
          };
        }

        throw new Error('Invalid order response');

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
