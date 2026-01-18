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
import { sessionFilterService } from '../v6/sessionFilterService';

// ============================================================================
// PROFIT PREDICTION TYPES & FUNCTION
// ============================================================================

interface ProfitPrediction {
  expectedProfitUSD: number;     // Expected profit in USD if TP hit
  expectedLossUSD: number;       // Expected loss in USD if SL hit
  riskRewardRatio: number;       // R:R ratio
  positionSizeUSD: number;       // Position size used
  tpDistancePct: number;         // TP distance in %
  slDistancePct: number;         // SL distance in %
  passesFilter: boolean;         // true if expectedProfitUSD >= threshold
  reason: string;                // Why passed or blocked
}

/**
 * Calculate expected profit/loss for a trade setup
 *
 * @param entryPrice - Entry price
 * @param stopLoss - Stop loss price
 * @param takeProfit - Take profit price
 * @param positionSizeUSD - Position size in USD
 * @param leverage - Leverage multiplier (default: 20)
 * @returns ProfitPrediction with expected P&L
 */
function predictProfit(
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  positionSizeUSD: number,
  leverage: number = WEEX_V6_CONFIG.PROFIT_PREDICTION.LEVERAGE
): ProfitPrediction {
  // Calculate distances as percentages
  const tpDistancePct = Math.abs(takeProfit - entryPrice) / entryPrice * 100;
  const slDistancePct = Math.abs(stopLoss - entryPrice) / entryPrice * 100;

  // Expected profit if TP hit (using leverage)
  const expectedProfitUSD = positionSizeUSD * (tpDistancePct / 100) * leverage;

  // Expected loss if SL hit (using leverage)
  const expectedLossUSD = positionSizeUSD * (slDistancePct / 100) * leverage;

  // Risk:Reward ratio
  const riskRewardRatio = slDistancePct > 0 ? tpDistancePct / slDistancePct : 0;

  // Check if passes minimum profit threshold
  const minProfitThreshold = WEEX_V6_CONFIG.PROFIT_PREDICTION.MIN_PROFIT_THRESHOLD_USD;
  const passesFilter = expectedProfitUSD >= minProfitThreshold;

  const reason = passesFilter
    ? `Expected profit $${expectedProfitUSD.toFixed(2)} >= $${minProfitThreshold} threshold`
    : `Expected profit $${expectedProfitUSD.toFixed(2)} < $${minProfitThreshold} threshold - BLOCKED`;

  return {
    expectedProfitUSD,
    expectedLossUSD,
    riskRewardRatio,
    positionSizeUSD,
    tpDistancePct,
    slDistancePct,
    passesFilter,
    reason,
  };
}

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
      this.executionLock = false; // Release lock before returning
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
        this.executionLock = false; // Release lock before returning
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
    // FIX: Use entry zone midpoint (not current price) for R:R calculation
    // ============================================================================
    const entryMidpoint = setup.entryZone.midpoint;
    const slDistance = Math.abs(setup.stopLoss - entryMidpoint);
    const tpDistance = Math.abs(setup.takeProfit1 - entryMidpoint);
    const actualRR = slDistance > 0 ? tpDistance / slDistance : 0;
    // FIX: Round to 2 decimals to avoid floating point precision issues (e.g., 1.4999... < 1.5)
    const roundedRR = Math.round(actualRR * 100) / 100;

    console.log(`[WEEX-EXECUTOR] R:R Check (entry=$${entryMidpoint.toFixed(2)}): SL dist=$${slDistance.toFixed(2)}, TP dist=$${tpDistance.toFixed(2)}, R:R=1:${roundedRR.toFixed(2)}`);

    // Require minimum 1.5 R:R for edge
    const MIN_RR_RATIO = 1.5;
    if (roundedRR < MIN_RR_RATIO) {
      console.error(`[WEEX-EXECUTOR] BLOCKED: R:R 1:${roundedRR.toFixed(2)} is below 1:${MIN_RR_RATIO} minimum`);
      console.error(`[WEEX-EXECUTOR]   Entry: $${entryMidpoint.toFixed(2)}, SL: $${setup.stopLoss.toFixed(2)}, TP: $${setup.takeProfit1.toFixed(2)}`);
      this.executionLock = false; // Release lock before returning
      this.executionStats.failed++;
      this.executionStats.lastError = `Invalid R:R ratio: 1:${roundedRR.toFixed(2)}`;
      return {
        success: false,
        error: `Invalid R:R ratio: 1:${roundedRR.toFixed(2)} (minimum 1:${MIN_RR_RATIO} required for edge)`,
        timestamp: new Date(),
      };
    }
    console.log(`[WEEX-EXECUTOR] R:R Check PASSED: 1:${roundedRR.toFixed(2)} >= 1:${MIN_RR_RATIO}`)

    try {
      // Step 1: Calculate position size
      const positionSizeUSD = this.calculatePositionSize(setup);
      let positionSizeBTC = positionSizeUSD / executionPrice;

      // Enforce minimum position size
      if (positionSizeBTC < this.config.MIN_POSITION_SIZE_BTC) {
        console.log(`[WEEX-EXECUTOR] Position size ${positionSizeBTC.toFixed(6)} BTC below minimum, using ${this.config.MIN_POSITION_SIZE_BTC} BTC`);
        positionSizeBTC = this.config.MIN_POSITION_SIZE_BTC;
      }

      console.log(`[WEEX-EXECUTOR] Position size: $${positionSizeUSD.toFixed(2)} (${positionSizeBTC.toFixed(6)} BTC)`);

      // ========================================================================
      // FILTER 4: PROFIT PREDICTION FILTER
      // Block trades with expected profit < $30 (configurable)
      // ========================================================================
      const prediction = predictProfit(
        executionPrice,
        setup.stopLoss,
        setup.takeProfit1,
        positionSizeUSD
      );

      console.log(`[V6-PROFIT] === PROFIT PREDICTION ===`);
      console.log(`[V6-PROFIT]   Position: $${positionSizeUSD.toFixed(2)} x ${this.config.PROFIT_PREDICTION.LEVERAGE}x leverage`);
      console.log(`[V6-PROFIT]   Entry: $${executionPrice.toFixed(2)} | TP: $${setup.takeProfit1.toFixed(2)} | SL: $${setup.stopLoss.toFixed(2)}`);
      console.log(`[V6-PROFIT]   TP distance: ${prediction.tpDistancePct.toFixed(3)}% | SL distance: ${prediction.slDistancePct.toFixed(3)}%`);
      console.log(`[V6-PROFIT]   Expected Profit: $${prediction.expectedProfitUSD.toFixed(2)} | Expected Loss: $${prediction.expectedLossUSD.toFixed(2)}`);
      console.log(`[V6-PROFIT]   FILTER: ${prediction.passesFilter ? 'PASSED' : 'BLOCKED'} (min: $${this.config.PROFIT_PREDICTION.MIN_PROFIT_THRESHOLD_USD})`);

      if (!prediction.passesFilter) {
        console.log(`[WEEX-EXECUTOR] BLOCKED: ${prediction.reason}`);
        this.executionStats.failed++;
        this.executionStats.lastError = prediction.reason;
        this.executionLock = false;
        return {
          success: false,
          error: prediction.reason,
          timestamp: new Date(),
        };
      }

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
   * Calculate position size based on setup grade and session
   *
   * SOFT FILTER POSITION SIZING:
   * Final Size = Base × Grade Multiplier × Session Multiplier
   *
   * Examples:
   * - OVERLAP Grade A: $800 × 1.0 × 1.25 = $1000 (aggressive)
   * - ASIA Grade A:    $800 × 1.0 × 0.6 = $480 (conservative)
   * - LONDON Grade B:  $800 × 0.75 × 1.0 = $600 (normal)
   */
  calculatePositionSize(setup: TradeSetup): number {
    const gradeMultiplier = getPositionSizeMultiplier(setup.grade);
    const sessionResult = sessionFilterService.analyze();
    const sessionMultiplier = sessionResult.positionMultiplier;

    const baseSize = this.config.BASE_POSITION_SIZE_USD;
    const size = baseSize * gradeMultiplier * sessionMultiplier;

    console.log(`[WEEX-EXECUTOR] Position sizing: Grade ${setup.grade} (${gradeMultiplier}x) × ${sessionResult.sessionInfo.session} session (${sessionMultiplier}x) = $${size.toFixed(2)}`);
    console.log(`[WEEX-EXECUTOR]   Strategy: ${sessionResult.strategy} | Base: $${baseSize}`);

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
   * Place order on WEEX - NO RETRIES
   * Uses preset TP/SL on entry order (single API call)
   *
   * IMPORTANT: Retry logic REMOVED to prevent:
   * - High fees ($4 per API call x 3 retries = $12)
   * - Order cancellations (duplicate orders at same price)
   * If order fails, it may have been partially created - don't retry
   */
  async placeOrder(
    direction: 'BUY' | 'SELL',
    sizeBTC: number,
    symbol: string,
    takeProfit: number,
    stopLoss: number
  ): Promise<WeexOrderResult> {
    // Round TP/SL to match WEEX stepSize requirement (0.1)
    const roundedTP = this.roundToStepSize(takeProfit, 0.1);
    const roundedSL = this.roundToStepSize(stopLoss, 0.1);

    try {
      console.log(`[WEEX-EXECUTOR] Placing ${direction} order (single attempt - no retries)`);
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
        console.error('[WEEX-EXECUTOR] Invalid order response - no orderId');
        return {
          success: false,
          error: 'Invalid order response - no orderId (order may have been created)',
        };
      }

      console.log(`[WEEX-EXECUTOR] Order placed with preset TP/SL: ${result.data.orderId}`);

      // Extract TP/SL order IDs from response (preset TP/SL is already placed with entry order)
      const tpOrderId = result.data.tpOrderId;
      const slOrderId = result.data.slOrderId;

      // Note: Preset TP/SL orders are created by WEEX even if order IDs aren't returned
      // Do NOT place them separately - this causes Error 400 (duplicate orders)

      // Success - return with TP/SL order IDs (if available)
      return {
        success: true,
        orderId: result.data.orderId,
        clientOrderId: result.data.clientOrderId,
        tpOrderId: tpOrderId ? Number(tpOrderId) : undefined,
        slOrderId: slOrderId ? Number(slOrderId) : undefined,
      };

    } catch (error: any) {
      console.error(`[WEEX-EXECUTOR] Order failed: ${error.message}`);
      console.error(`[WEEX-EXECUTOR] NOT retrying - order may have been created`);
      return {
        success: false,
        error: error.message || 'Order failed (not retrying to avoid duplicates)',
      };
    }
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
