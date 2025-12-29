/**
 * MARIPOSA V6 PRO - Zone Monitor Service
 *
 * Monitors price distance to setup entry zones every minute.
 * When price enters a zone, triggers math-only confirmation.
 * On pattern confirmation, executes the trade immediately.
 *
 * NO LLM CALLS - All math-based for speed (<100ms decision)
 */

import { binanceService } from '../binanceService';
import { normalizeKlines, NormalizedKline, getCurrentPrice } from './utils/normalizeKlines';

// Use NormalizedKline type from utils (matches expected format after normalization)
type Kline = NormalizedKline;
import { setupQueueService } from './setupQueueService';
import { candleConfirmationService } from './candleConfirmationService';
import {
  TradeSetup,
  ZoneDistanceResult,
  V6_SETUP_CONFIG,
} from '../../types/v6';
import { V6_ANALYSIS_CONFIG } from '../../types/v6';

// ============================================================================
// TYPES
// ============================================================================

interface MonitoringState {
  lastCheckTime: number;
  checkCount: number;
  setupsTriggered: number;
  setupsConfirmed: number;
  setupsRejected: number;
}

interface ZoneCheckResult {
  setupId: string;
  status: 'FAR' | 'APPROACHING' | 'IN_ZONE';
  distancePercent: number;
  shouldCheckConfirmation: boolean;
}

interface ExecutionCallback {
  (setup: TradeSetup, confirmationPrice: number): Promise<void>;
}

// ============================================================================
// ZONE MONITOR SERVICE
// ============================================================================

class ZoneMonitorService {
  private isRunning: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private state: MonitoringState = {
    lastCheckTime: 0,
    checkCount: 0,
    setupsTriggered: 0,
    setupsConfirmed: 0,
    setupsRejected: 0,
  };

  // Callback for executing setups (injected by worker)
  private onSetupConfirmed: ExecutionCallback | null = null;

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the zone monitoring service (runs every minute)
   */
  async start(executionCallback?: ExecutionCallback): Promise<void> {
    if (this.isRunning) {
      console.log('[V6-ZONE] Already running');
      return;
    }

    console.log('[V6-ZONE] Starting zone monitor service...');
    console.log(`[V6-ZONE] Check interval: ${V6_ANALYSIS_CONFIG.ZONE_CHECK_INTERVAL_SECONDS} seconds`);

    if (executionCallback) {
      this.onSetupConfirmed = executionCallback;
    }

    this.isRunning = true;

    // Run immediately on start
    await this.runMonitorCycle();

    // Then schedule recurring checks
    const intervalMs = V6_ANALYSIS_CONFIG.ZONE_CHECK_INTERVAL_SECONDS * 1000;
    this.monitorInterval = setInterval(async () => {
      await this.runMonitorCycle();
    }, intervalMs);

    console.log('[V6-ZONE] Service started successfully');
  }

  /**
   * Stop the zone monitoring service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[V6-ZONE] Stopping zone monitor service...');

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    this.isRunning = false;
    console.log('[V6-ZONE] Service stopped');
  }

  /**
   * Set the execution callback
   */
  setExecutionCallback(callback: ExecutionCallback): void {
    this.onSetupConfirmed = callback;
  }

  // ============================================================================
  // MAIN MONITORING CYCLE
  // ============================================================================

  /**
   * Run a single monitoring cycle
   */
  private async runMonitorCycle(): Promise<void> {
    const startTime = Date.now();
    this.state.checkCount++;

    try {
      // Get active setups from queue
      const activeSetups = setupQueueService.getActiveSetups();

      if (activeSetups.length === 0) {
        // No active setups, nothing to monitor
        return;
      }

      // Get current price and recent candles (for confirmation)
      const rawCandles = await binanceService.getKlines('BTCUSDT', '5m', 10);
      const candles = normalizeKlines(rawCandles);

      if (candles.length === 0) {
        console.warn('[V6-ZONE] No candle data available, skipping cycle');
        return;
      }

      const currentPrice = getCurrentPrice(candles);
      if (currentPrice <= 0) {
        console.warn('[V6-ZONE] Invalid price data, skipping cycle');
        return;
      }

      console.log(`[V6-ZONE] Checking ${activeSetups.length} setups @ $${currentPrice.toFixed(2)}`);

      // Check each setup
      for (const setup of activeSetups) {
        await this.checkSetup(setup, currentPrice, candles);
      }

      this.state.lastCheckTime = Date.now();

    } catch (error: any) {
      console.error('[V6-ZONE] Monitor cycle error:', error.message);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > 500) {
      console.warn(`[V6-ZONE] Slow cycle: ${elapsed}ms`);
    }
  }

  /**
   * Check a single setup against current price
   */
  private async checkSetup(setup: TradeSetup, currentPrice: number, candles: Kline[]): Promise<void> {
    // Calculate distance to zone
    const distance = this.calculateZoneDistance(setup, currentPrice);

    // Debug log for all setups (helps diagnose zone detection issues)
    const zoneLow = setup.entryZone.low;
    const zoneHigh = setup.entryZone.high;
    const priceVsZone = currentPrice < zoneLow ? 'BELOW' : currentPrice > zoneHigh ? 'ABOVE' : 'INSIDE';

    // Handle status transitions based on calculated distance status
    if (distance.status === 'IN_ZONE') {
      // Price is inside zone - handle entry/confirmation
      console.log(`[V6-ZONE] ${setup.id.slice(0, 8)} | ${setup.direction} Grade ${setup.grade} | IN_ZONE @ $${currentPrice.toFixed(0)}`);
      console.log(`[V6-ZONE]   Zone: $${zoneLow.toFixed(0)}-$${zoneHigh.toFixed(0)} | Price ${priceVsZone} | Edge dist: ${distance.distanceToNearestEdge.toFixed(3)}%`);
      await this.handleInZone(setup, currentPrice, candles);

    } else if (distance.status === 'PASSED_THROUGH') {
      // ========================================================================
      // SAFE MISSED DETECTION - Don't remove valid setups prematurely
      // ========================================================================
      const setupAge = Date.now() - new Date(setup.createdAt).getTime();
      const MIN_AGE_MS = 2 * 60 * 1000; // 2 minutes minimum before marking MISSED

      // Case 1: Brand new setup on wrong side of price = INVALID (not MISSED)
      // This catches inverted setups that slipped through validation
      if (setupAge < MIN_AGE_MS) {
        console.log(`[V6-ZONE] INVALID: ${setup.id.slice(0, 8)} | ${setup.direction} | Created on wrong side of price (${(setupAge / 1000).toFixed(0)}s old) - REMOVING`);
        console.log(`[V6-ZONE]   Zone: $${zoneLow.toFixed(0)}-$${zoneHigh.toFixed(0)} | Price: $${currentPrice.toFixed(0)} (${priceVsZone})`);
        await setupQueueService.removeSetup(setup.id);
        return;
      }

      // Case 2: Setup was never in zone = still waiting, let expiry handle removal
      // Price might come back to the zone
      if (!setup.wasEverInZone) {
        // Only log occasionally (every ~5 minutes) to reduce noise
        if (setupAge > 5 * 60 * 1000 && Math.random() < 0.1) {
          console.log(`[V6-ZONE] WAITING: ${setup.id.slice(0, 8)} | ${setup.direction} | Never reached zone yet (${(setupAge / 60000).toFixed(0)}m old)`);
        }
        return;
      }

      // Case 3: Setup WAS in zone, price left = legitimate MISSED
      console.log(`[V6-ZONE] MISSED: ${setup.id.slice(0, 8)} | ${setup.direction} | Price passed through zone after being IN_ZONE - REMOVING`);
      console.log(`[V6-ZONE]   Zone: $${zoneLow.toFixed(0)}-$${zoneHigh.toFixed(0)} | Price: $${currentPrice.toFixed(0)} (${priceVsZone}) | Dist: ${distance.distancePercent.toFixed(2)}%`);
      await setupQueueService.removeSetup(setup.id);

    } else if (distance.status === 'APPROACHING') {
      // Price is approaching zone from correct direction
      console.log(`[V6-ZONE] ${setup.id.slice(0, 8)} | ${setup.direction} | APPROACHING (${distance.distancePercent.toFixed(2)}% away)`);
      console.log(`[V6-ZONE]   Zone: $${zoneLow.toFixed(0)}-$${zoneHigh.toFixed(0)} | Price ${priceVsZone}`);

      // Update status based on previous state
      if (setup.status === 'WAITING') {
        await setupQueueService.updateSetupStatus(setup.id, 'APPROACHING');
      } else if (setup.status === 'IN_ZONE') {
        // Price left zone but can still re-enter - reset to APPROACHING
        console.log(`[V6-ZONE] ${setup.id.slice(0, 8)} | Price LEFT zone, resetting to APPROACHING`);
        await setupQueueService.updateSetupStatus(setup.id, 'APPROACHING');
      }

    } else {
      // FAR status - price is far from zone
      if (setup.status === 'IN_ZONE' || setup.status === 'APPROACHING') {
        // Was close/in zone, now far - reset to WAITING
        console.log(`[V6-ZONE] ${setup.id.slice(0, 8)} | Price moved away (${distance.distancePercent.toFixed(2)}%), resetting to WAITING`);
        await setupQueueService.updateSetupStatus(setup.id, 'WAITING');
      }
    }
  }

  /**
   * Calculate distance from current price to setup entry zone
   */
  private calculateZoneDistance(setup: TradeSetup, currentPrice: number): ZoneDistanceResult {
    const { entryZone, direction } = setup;
    const { low, high, midpoint } = entryZone;

    // Calculate distance as percentage from midpoint
    const distanceFromMidpoint = ((currentPrice - midpoint) / midpoint) * 100;

    // Calculate distance to nearest edge
    let distanceToNearestEdge: number;
    let priceDirection: 'ABOVE' | 'BELOW' | 'INSIDE';

    if (currentPrice > high) {
      distanceToNearestEdge = ((currentPrice - high) / high) * 100;
      priceDirection = 'ABOVE';
    } else if (currentPrice < low) {
      distanceToNearestEdge = ((low - currentPrice) / low) * 100;
      priceDirection = 'BELOW';
    } else {
      distanceToNearestEdge = 0;
      priceDirection = 'INSIDE';
    }

    // Determine status based on direction and position
    let status: 'FAR' | 'APPROACHING' | 'IN_ZONE' | 'PASSED_THROUGH';

    if (priceDirection === 'INSIDE') {
      status = 'IN_ZONE';
    } else {
      // Check if price PASSED THROUGH the zone (missed opportunity)
      // BUY setup: price should approach from ABOVE, if it's BELOW = passed through
      // SELL setup: price should approach from BELOW, if it's ABOVE = passed through
      const passedThrough = (
        (direction === 'BUY' && priceDirection === 'BELOW') ||
        (direction === 'SELL' && priceDirection === 'ABOVE')
      );

      if (passedThrough) {
        status = 'PASSED_THROUGH';
      } else {
        // Check if price is approaching the zone from the correct direction
        const isApproaching = (
          (direction === 'BUY' && priceDirection === 'ABOVE') ||
          (direction === 'SELL' && priceDirection === 'BELOW')
        );

        if (isApproaching && distanceToNearestEdge <= V6_SETUP_CONFIG.ZONE_APPROACHING_PERCENT) {
          status = 'APPROACHING';
        } else if (distanceToNearestEdge <= V6_SETUP_CONFIG.ZONE_IN_ZONE_BUFFER) {
          status = 'IN_ZONE';
        } else {
          status = 'FAR';
        }
      }
    }

    return {
      setupId: setup.id,
      currentPrice,
      entryZone,
      distancePercent: Math.abs(distanceFromMidpoint),
      distanceToNearestEdge,
      status,
      direction: priceDirection,
    };
  }

  // ============================================================================
  // ZONE ENTRY HANDLING
  // ============================================================================

  /**
   * Handle when price enters a setup's entry zone
   */
  private async handleInZone(setup: TradeSetup, currentPrice: number, candles: Kline[]): Promise<void> {
    // Track that this setup reached the zone (for safe MISSED detection)
    if (!setup.wasEverInZone) {
      await setupQueueService.markWasInZone(setup.id);
    }

    // ========================================================================
    // SCALPING MODE: INSTANT EXECUTION FOR ALL GRADES
    // When REQUIRE_PATTERN_CONFIRMATION is false, execute immediately
    // ========================================================================
    if (!V6_SETUP_CONFIG.REQUIRE_PATTERN_CONFIRMATION) {
      console.log(`[V6-ZONE] *** SCALPING MODE - INSTANT EXECUTION ***`);
      console.log(`[V6-ZONE] Setup: ${setup.id.slice(0, 8)} | ${setup.direction} Grade ${setup.grade} @ $${currentPrice.toFixed(2)}`);

      // Check daily trade limit
      if (!setupQueueService.canExecuteMoreTrades()) {
        console.log(`[V6-ZONE] Daily trade limit reached (${setupQueueService.getTodayTradeCount()}/${V6_SETUP_CONFIG.MAX_TRADES_PER_DAY}), skipping execution`);
        return;
      }

      this.state.setupsTriggered++;
      this.state.setupsConfirmed++;
      await setupQueueService.updateSetupStatus(setup.id, 'CONFIRMED');

      if (this.onSetupConfirmed) {
        try {
          console.log(`[V6-ZONE] Calling execution callback for scalping setup...`);
          await this.onSetupConfirmed(setup, currentPrice);
          console.log(`[V6-ZONE] Scalping execution callback completed successfully`);
        } catch (error: any) {
          console.error(`[V6-ZONE] Scalping execution FAILED: ${error.message}`);
          const isRetryable = error.message?.includes('connection') ||
                              error.message?.includes('timeout') ||
                              error.message?.includes('ECONNREFUSED');
          if (isRetryable) {
            await setupQueueService.updateSetupStatus(setup.id, 'IN_ZONE');
          } else {
            await setupQueueService.updateSetupStatus(setup.id, 'FAILED');
          }
        }
      } else {
        console.warn('[V6-ZONE] No execution callback set - scalping setup not executed');
        await setupQueueService.markExecuted(setup.id, currentPrice);
      }
      return; // Skip pattern confirmation in scalping mode
    }

    // ========================================================================
    // SWING MODE: GRADE A INSTANT EXECUTION
    // ========================================================================
    if (setup.grade === 'A') {
      console.log(`[V6-ZONE] *** GRADE A INSTANT EXECUTION ***`);
      console.log(`[V6-ZONE] Setup: ${setup.id.slice(0, 8)} | ${setup.direction} @ $${currentPrice.toFixed(2)}`);

      // Check daily trade limit
      if (!setupQueueService.canExecuteMoreTrades()) {
        console.log(`[V6-ZONE] Daily trade limit reached, skipping Grade A execution`);
        return;
      }

      this.state.setupsTriggered++;
      this.state.setupsConfirmed++;
      await setupQueueService.updateSetupStatus(setup.id, 'CONFIRMED');

      if (this.onSetupConfirmed) {
        try {
          console.log(`[V6-ZONE] Calling execution callback for Grade A setup...`);
          await this.onSetupConfirmed(setup, currentPrice);
          console.log(`[V6-ZONE] Grade A execution callback completed successfully`);
        } catch (error: any) {
          console.error(`[V6-ZONE] Grade A execution FAILED: ${error.message}`);
          const isRetryable = error.message?.includes('connection') ||
                              error.message?.includes('timeout') ||
                              error.message?.includes('ECONNREFUSED');
          if (isRetryable) {
            await setupQueueService.updateSetupStatus(setup.id, 'IN_ZONE');
          } else {
            await setupQueueService.updateSetupStatus(setup.id, 'FAILED');
          }
        }
      } else {
        console.warn('[V6-ZONE] No execution callback set - Grade A not executed');
        await setupQueueService.markExecuted(setup.id, currentPrice);
      }
      return; // Skip pattern confirmation for Grade A
    }

    // ========================================================================
    // GRADE B/C - Require pattern confirmation
    // ========================================================================

    // Check if we've exceeded max confirmation attempts
    if (setup.confirmationAttempts >= setup.maxConfirmationAttempts) {
      console.log(`[V6-ZONE] Setup ${setup.id.slice(0, 8)} exceeded max attempts (${setup.maxConfirmationAttempts})`);
      await setupQueueService.updateSetupStatus(setup.id, 'MAX_ATTEMPTS');
      return;
    }

    // Check if we can still execute trades today
    if (!setupQueueService.canExecuteMoreTrades()) {
      console.log(`[V6-ZONE] Daily trade limit reached, skipping confirmation check`);
      return;
    }

    // Update status to IN_ZONE
    if (setup.status !== 'IN_ZONE' && setup.status !== 'CONFIRMING') {
      await setupQueueService.updateSetupStatus(setup.id, 'IN_ZONE');
    }

    // Increment confirmation attempt
    const attemptCount = await setupQueueService.incrementConfirmationAttempts(setup.id);
    this.state.setupsTriggered++;

    console.log(`[V6-ZONE] Checking confirmation for ${setup.id.slice(0, 8)} (attempt ${attemptCount}/${setup.maxConfirmationAttempts})`);

    // Run math-only confirmation check
    // Convert Kline array to CandleData format
    const candleData = candles.map(k => ({
      openTime: k.openTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      closeTime: k.closeTime,
    }));

    const confirmationStart = Date.now();
    const confirmation = candleConfirmationService.checkConfirmation(
      setup,
      candleData
    );
    const confirmationTime = Date.now() - confirmationStart;

    console.log(`[V6-ZONE] Confirmation check: ${confirmationTime}ms | Result: ${confirmation.confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}`);

    if (confirmation.confirmed) {
      // Pattern confirmed - execute!
      const patternName = confirmation.patternsFound.length > 0 ? confirmation.patternsFound[0] : 'PATTERN';
      console.log(`[V6-ZONE] PATTERN CONFIRMED: ${patternName} (${confirmation.strength})`);
      console.log(`[V6-ZONE] Executing ${setup.direction} @ $${currentPrice.toFixed(2)}`);

      this.state.setupsConfirmed++;

      // Update status
      await setupQueueService.updateSetupStatus(setup.id, 'CONFIRMED');

      // Call execution callback if set
      if (this.onSetupConfirmed) {
        try {
          console.log(`[V6-ZONE] Calling execution callback for setup ${setup.id.slice(0, 8)}...`);
          await this.onSetupConfirmed(setup, currentPrice);
          console.log(`[V6-ZONE] Execution callback completed successfully`);
        } catch (error: any) {
          console.error(`[V6-ZONE] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
          console.error(`[V6-ZONE] !!!! EXECUTION CALLBACK FAILED !!!!`);
          console.error(`[V6-ZONE] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
          console.error(`[V6-ZONE] Setup: ${setup.id.slice(0, 8)}`);
          console.error(`[V6-ZONE] Error: ${error.message}`);

          // Check if it's a retryable error (network/connection issues)
          const isRetryable = error.message?.includes('connection') ||
                              error.message?.includes('timeout') ||
                              error.message?.includes('ECONNREFUSED');

          if (isRetryable) {
            console.error(`[V6-ZONE] Retryable error - reverting to IN_ZONE for retry`);
            await setupQueueService.updateSetupStatus(setup.id, 'IN_ZONE');
          } else {
            console.error(`[V6-ZONE] Non-retryable error - marking as FAILED`);
            await setupQueueService.updateSetupStatus(setup.id, 'FAILED');
          }
        }
      } else {
        console.warn('[V6-ZONE] No execution callback set - trade not executed');
        // Still mark as executed for testing
        await setupQueueService.markExecuted(setup.id, currentPrice);
      }
    } else {
      // No confirmation yet
      console.log(`[V6-ZONE] No pattern match - waiting (${attemptCount}/${setup.maxConfirmationAttempts} attempts)`);
      this.state.setupsRejected++;

      // If this was the last attempt, status will be updated by incrementConfirmationAttempts
      if (attemptCount < setup.maxConfirmationAttempts) {
        // Reset to IN_ZONE for next check
        await setupQueueService.updateSetupStatus(setup.id, 'IN_ZONE');
      }
    }
  }

  // ============================================================================
  // MANUAL TRIGGER (for testing)
  // ============================================================================

  /**
   * Force check a specific setup (for testing)
   */
  async forceCheckSetup(setupId: string): Promise<{
    found: boolean;
    status?: string;
    distance?: ZoneDistanceResult;
  }> {
    const setup = setupQueueService.getSetupById(setupId);
    if (!setup) {
      return { found: false };
    }

    const rawCandles = await binanceService.getKlines('BTCUSDT', '5m', 10);
    const candles = normalizeKlines(rawCandles);
    const currentPrice = getCurrentPrice(candles);

    const distance = this.calculateZoneDistance(setup, currentPrice);

    // Check the setup
    await this.checkSetup(setup, currentPrice, candles);

    return {
      found: true,
      status: setup.status,
      distance,
    };
  }

  // ============================================================================
  // STATUS & HEALTH
  // ============================================================================

  /**
   * Get monitoring state
   */
  getState(): MonitoringState {
    return { ...this.state };
  }

  /**
   * Get service health
   */
  getHealth(): {
    isRunning: boolean;
    lastCheckTime: number;
    checkCount: number;
    setupsTriggered: number;
    setupsConfirmed: number;
    setupsRejected: number;
    hasExecutionCallback: boolean;
  } {
    return {
      isRunning: this.isRunning,
      ...this.state,
      hasExecutionCallback: this.onSetupConfirmed !== null,
    };
  }

  /**
   * Log current monitoring status
   */
  logStatus(): void {
    const health = this.getHealth();
    const activeSetups = setupQueueService.getActiveSetups();

    console.log('');
    console.log('==================================================');
    console.log('[V6-ZONE] Monitor Status');
    console.log('==================================================');
    console.log(`  Running: ${health.isRunning}`);
    console.log(`  Last Check: ${health.lastCheckTime > 0 ? new Date(health.lastCheckTime).toISOString() : 'Never'}`);
    console.log(`  Total Checks: ${health.checkCount}`);
    console.log(`  Active Setups: ${activeSetups.length}`);
    console.log(`  Setups Triggered: ${health.setupsTriggered}`);
    console.log(`  Setups Confirmed: ${health.setupsConfirmed}`);
    console.log(`  Setups Rejected: ${health.setupsRejected}`);
    console.log(`  Execution Callback: ${health.hasExecutionCallback ? 'Set' : 'Not Set'}`);
    console.log('==================================================');
    console.log('');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const zoneMonitorService = new ZoneMonitorService();
export { ZoneMonitorService };
