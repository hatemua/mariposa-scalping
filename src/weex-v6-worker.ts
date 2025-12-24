/**
 * MARIPOSA WEEX V6 - Trading Worker
 *
 * Dedicated worker for WEEX trading using the V6 sniper architecture.
 * Reuses existing V6 services (strategicAnalysis, setupQueue, zoneMonitor)
 * but executes trades on WEEX exchange instead of MT4.
 *
 * Architecture:
 * - 30-minute strategic analysis cycle (LLM-based) - reused from V6
 * - 1-minute zone monitoring cycle (MATH-only) - reused from V6
 * - WEEX-specific execution via weexV6Executor
 * - Position monitoring via weexPositionMonitor
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { redis } from './config/redis';
import { redisService } from './services/redisService';
import { binanceService } from './services/binanceService';

// V6 Services (reused)
import {
  setupQueueService,
  strategicAnalysisService,
  zoneMonitorService,
} from './services/v6';

// WEEX Services (new)
import {
  weexV6Executor,
  weexPositionMonitor,
} from './services/weex';

// V6 Utilities
import { normalizeKlines, getCurrentPrice } from './services/v6/utils/normalizeKlines';

// Types
import { TradeSetup } from './types/v6';

// Config
import { V6_ENV_CONFIG, WEEX_V6_CONFIG } from './config/environment';

// Load environment variables
dotenv.config();

// Environment diagnostics
console.log('[WEEX-V6-WORKER] Environment Check:');
console.log(`[WEEX-V6-WORKER]   TOGETHER_AI_API_KEY: ${process.env.TOGETHER_AI_API_KEY ? 'SET' : 'NOT SET!'}`);
console.log(`[WEEX-V6-WORKER]   WEEX_API_KEY: ${process.env.WEEX_API_KEY ? 'SET' : 'NOT SET!'}`);
console.log(`[WEEX-V6-WORKER]   MONGODB_URI: ${process.env.MONGODB_URI ? 'SET' : 'Using default'}`);
console.log(`[WEEX-V6-WORKER]   Symbol: ${WEEX_V6_CONFIG.SYMBOL}`);
console.log(`[WEEX-V6-WORKER]   Leverage: ${WEEX_V6_CONFIG.LEVERAGE}x`);
console.log(`[WEEX-V6-WORKER]   Position Size: $${WEEX_V6_CONFIG.BASE_POSITION_SIZE_USD}`);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mariposa-scalping';

// ============================================================================
// WEEX V6 EXECUTION CALLBACK
// ============================================================================

/**
 * Called by zoneMonitorService when a setup pattern is confirmed
 * This replaces the MT4 execution with WEEX execution
 */
async function onSetupConfirmed(setup: TradeSetup, executionPrice: number): Promise<void> {
  console.log('');
  console.log('==================================================');
  console.log('[WEEX-V6-WORKER] Setup confirmed - executing on WEEX!');
  console.log(`[WEEX-V6-WORKER] Setup ID: ${setup.id}`);
  console.log(`[WEEX-V6-WORKER] Direction: ${setup.direction} @ $${executionPrice.toFixed(2)}`);
  console.log(`[WEEX-V6-WORKER] Grade: ${setup.grade} | SL: $${setup.stopLoss} | TP: $${setup.takeProfit1}`);
  console.log('==================================================');

  try {
    // Execute on WEEX
    console.log('[WEEX-V6-WORKER] Calling weexV6Executor.executeSetup...');
    const result = await weexV6Executor.executeSetup(setup, executionPrice);

    console.log(`[WEEX-V6-WORKER] Execution result:`, JSON.stringify(result, null, 2));

    if (result.success) {
      // Mark setup as executed in queue
      console.log(`[WEEX-V6-WORKER] SUCCESS! Marking setup as executed...`);
      await setupQueueService.markExecuted(
        setup.id,
        result.executionPrice || executionPrice,
        result.orderId || `weex-${setup.id}`,
        undefined // No MT4 ticket for WEEX
      );

      // Add to position monitor
      weexPositionMonitor.addPosition(setup, result);

      console.log(`[WEEX-V6-WORKER] Trade executed successfully!`);
      console.log(`[WEEX-V6-WORKER] Order ID: ${result.orderId}`);
      console.log(`[WEEX-V6-WORKER] Position added to monitor`);

    } else {
      console.error(`[WEEX-V6-WORKER] !!!! TRADE EXECUTION FAILED !!!!`);
      console.error(`[WEEX-V6-WORKER] FAILURE REASON: ${result.error}`);
      // Mark as FAILED - don't throw (that causes status revert to IN_ZONE)
      await setupQueueService.updateSetupStatus(setup.id, 'FAILED');
      console.error(`[WEEX-V6-WORKER] Setup marked as FAILED - will not retry`);
      return;
    }
  } catch (error: any) {
    console.error('[WEEX-V6-WORKER] !!!! EXECUTION ERROR !!!!');
    console.error('[WEEX-V6-WORKER] Error:', error.message);
    console.error('[WEEX-V6-WORKER] Stack:', error.stack);
    // Re-throw so zoneMonitorService can handle status revert
    throw error;
  }
}

// ============================================================================
// STARTUP
// ============================================================================

/**
 * Start the WEEX V6 Worker
 */
async function startWeexV6Worker() {
  const modeLabel = V6_ENV_CONFIG.MODE === 'SCALPING' ? 'SCALPING MODE' : 'SWING MODE';

  console.log('');
  console.log('===================================================================');
  console.log(`   MARIPOSA WEEX V6 - ${modeLabel}`);
  console.log('===================================================================');
  console.log('');
  console.log('   This worker runs the V6 sniper system on WEEX exchange');
  console.log(`   ${V6_ENV_CONFIG.ANALYSIS_INTERVAL_MINUTES}-minute LLM analysis -> Setup creation -> Zone monitoring`);
  console.log('');
  console.log('   WEEX Configuration:');
  console.log(`   - Symbol: ${WEEX_V6_CONFIG.SYMBOL}`);
  console.log(`   - Leverage: ${WEEX_V6_CONFIG.LEVERAGE}x`);
  console.log(`   - Base Position: $${WEEX_V6_CONFIG.BASE_POSITION_SIZE_USD}`);
  console.log(`   - Max Positions: ${WEEX_V6_CONFIG.MAX_CONCURRENT_POSITIONS}`);
  console.log(`   - Breakeven: ${WEEX_V6_CONFIG.BREAKEVEN_TRIGGER_PCT * 100}% of TP`);
  console.log(`   - Trailing: ${WEEX_V6_CONFIG.TRAILING_TRIGGER_PCT * 100}% of TP`);
  console.log('');
  console.log('===================================================================');
  console.log('');

  try {
    // Step 1: Connect to MongoDB
    console.log('[WEEX-V6-WORKER] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('[WEEX-V6-WORKER] MongoDB connected');

    // Step 2: Connect to Redis
    console.log('[WEEX-V6-WORKER] Connecting to Redis...');
    await redis.connect();
    console.log('[WEEX-V6-WORKER] Redis connected');

    // Verify Redis connection
    await redisService.set('weex_v6_worker_health', 'online', { ttl: 300 });
    console.log('[WEEX-V6-WORKER] Redis verified');

    // Wait for Redis pub/sub to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Start Binance service (for price data)
    console.log('[WEEX-V6-WORKER] Starting Binance service...');
    await binanceService.start();
    console.log('[WEEX-V6-WORKER] Binance service started');

    // Step 4: Initialize V6 Queue Service
    console.log('[WEEX-V6-WORKER] Initializing setup queue...');
    await setupQueueService.initialize();
    console.log('[WEEX-V6-WORKER] Setup queue initialized');

    // Clear old setups on startup for fresh start
    const activeCount = setupQueueService.getActiveSetups().length;
    if (activeCount > 0) {
      console.log('[WEEX-V6-WORKER] Clearing old setups for fresh start...');
      await setupQueueService.clearAllSetups();
      console.log('[WEEX-V6-WORKER] Queue cleared');
    }

    // Log queue state
    setupQueueService.logQueueState();

    // Step 5: Start Strategic Analysis Service (30-min cycle)
    console.log('[WEEX-V6-WORKER] Starting strategic analysis service...');
    await strategicAnalysisService.start();
    console.log('[WEEX-V6-WORKER] Strategic analysis service started');

    // Step 6: Start Zone Monitor Service (1-min cycle)
    // Pass WEEX execution callback instead of MT4 callback
    console.log('[WEEX-V6-WORKER] Starting zone monitor service...');
    await zoneMonitorService.start(onSetupConfirmed);
    console.log('[WEEX-V6-WORKER] Zone monitor service started');

    // Step 7: Start WEEX Position Monitor
    console.log('[WEEX-V6-WORKER] Starting WEEX position monitor...');
    weexPositionMonitor.start();
    console.log('[WEEX-V6-WORKER] WEEX position monitor started');

    // Worker is ready
    console.log('');
    console.log('===================================================================');
    console.log('   WEEX V6 WORKER READY');
    console.log('===================================================================');
    console.log('');
    console.log(`   Symbol: ${WEEX_V6_CONFIG.SYMBOL} (${WEEX_V6_CONFIG.BINANCE_SYMBOL})`);
    console.log(`   Analysis: Every ${V6_ENV_CONFIG.ANALYSIS_INTERVAL_MINUTES} minutes (LLM-based)`);
    console.log(`   Zone Check: Every ${V6_ENV_CONFIG.ZONE_CHECK_SECONDS} seconds (math-only)`);
    console.log(`   Position Check: Every ${WEEX_V6_CONFIG.POSITION_MONITOR_INTERVAL_MS / 1000}s`);
    console.log(`   Max Setups: 5 active`);
    console.log(`   Max Trades/Day: ${V6_ENV_CONFIG.MAX_TRADES_PER_DAY}`);
    console.log(`   Setup Expiry: ${V6_ENV_CONFIG.SETUP_EXPIRY_HOURS} hours`);
    console.log('');
    console.log('===================================================================');
    console.log('');

    // Health check logging every 5 minutes
    setInterval(async () => {
      try {
        const queueHealth = setupQueueService.getQueueHealth();
        const monitorHealth = zoneMonitorService.getHealth();
        const analysisHealth = strategicAnalysisService.getHealth();
        const executorHealth = weexV6Executor.getHealth();
        const posMonitorHealth = weexPositionMonitor.getHealth();
        const activeSetups = setupQueueService.getActiveSetups();

        // Get current price
        const rawCandles = await binanceService.getKlines(WEEX_V6_CONFIG.BINANCE_SYMBOL, '15m', 1);
        const candles = normalizeKlines(rawCandles);
        const currentPrice = getCurrentPrice(candles);

        console.log('');
        console.log('===================================================================');
        console.log(`[${new Date().toISOString()}] WEEX V6 HEALTH CHECK`);
        console.log('===================================================================');
        console.log(`  BTC Price: $${currentPrice.toFixed(2)}`);
        console.log(`  Active Setups: ${queueHealth.activeSetups}/${queueHealth.maxSetups} | Trades Today: ${queueHealth.todayTrades}/${queueHealth.maxTrades}`);
        console.log(`  Analysis Cycles: ${analysisHealth.cycleCount} | Total Setups Created: ${analysisHealth.totalSetupsCreated}`);
        console.log(`  Zone Checks: ${monitorHealth.checkCount} | Triggered: ${monitorHealth.setupsTriggered} | Confirmed: ${monitorHealth.setupsConfirmed}`);
        console.log(`  WEEX Executions: ${executorHealth.totalExecutions} (${executorHealth.successfulExecutions} success, ${executorHealth.failedExecutions} failed)`);
        console.log(`  WEEX Positions: ${posMonitorHealth.openPositions} open | ${posMonitorHealth.totalPositionsClosed} closed | P&L: $${posMonitorHealth.totalPnlUSD.toFixed(2)}`);

        if (activeSetups.length > 0 && currentPrice > 0) {
          console.log('');
          console.log('  ACTIVE SETUPS:');
          for (const setup of activeSetups) {
            const midpoint = setup.entryZone?.midpoint || 0;
            const distFromEntry = currentPrice > 0 ? ((currentPrice - midpoint) / currentPrice * 100).toFixed(2) : 'N/A';
            console.log(`    ${setup.id.slice(0, 8)} | ${setup.direction} @ $${midpoint.toFixed(0)} | Grade ${setup.grade} | ${setup.status} | ${distFromEntry}% away`);
          }
        }

        // Show open positions
        const openPositions = weexPositionMonitor.getOpenPositions();
        if (openPositions.length > 0) {
          console.log('');
          console.log('  OPEN POSITIONS:');
          for (const pos of openPositions) {
            const pnlSign = pos.unrealizedPnl >= 0 ? '+' : '';
            console.log(`    ${pos.id.slice(0, 8)} | ${pos.direction} @ $${pos.entryPrice.toFixed(0)} | ${pnlSign}$${pos.unrealizedPnl.toFixed(2)} (${pos.unrealizedPnlPercent.toFixed(2)}%)`);
          }
        }

        if (executorHealth.lastError) {
          console.log('');
          console.log(`  Last Error: ${executorHealth.lastError}`);
        }

        console.log('===================================================================');
        console.log('');
      } catch (error: any) {
        console.error('[WEEX-V6-WORKER] Health check error:', error.message);
      }
    }, 300000); // 5 minutes

    // Detailed status every 15 minutes
    setInterval(() => {
      console.log('');
      console.log('===================================================================');
      console.log('[WEEX-V6-WORKER] DETAILED STATUS');
      console.log('===================================================================');
      setupQueueService.logQueueState();
      zoneMonitorService.logStatus();
      weexPositionMonitor.logStatus();
      console.log('===================================================================');
      console.log('');
    }, 900000); // 15 minutes

  } catch (error) {
    console.error('[WEEX-V6-WORKER] Startup failed:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    process.exit(1);
  }
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Handle graceful shutdown
 */
async function shutdown(signal: string) {
  console.log(`\n[WEEX-V6-WORKER] Received ${signal} - shutting down...`);

  try {
    // Stop services in reverse order
    console.log('[WEEX-V6-WORKER] Stopping WEEX position monitor...');
    weexPositionMonitor.stop();

    console.log('[WEEX-V6-WORKER] Stopping zone monitor...');
    zoneMonitorService.stop();

    console.log('[WEEX-V6-WORKER] Stopping strategic analysis...');
    strategicAnalysisService.stop();

    console.log('[WEEX-V6-WORKER] Disconnecting MongoDB...');
    await mongoose.disconnect();

    console.log('[WEEX-V6-WORKER] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[WEEX-V6-WORKER] Shutdown error:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[WEEX-V6-WORKER] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[WEEX-V6-WORKER] Unhandled Rejection:', reason);
  process.exit(1);
});

// ============================================================================
// START WORKER
// ============================================================================

startWeexV6Worker().catch((error) => {
  console.error('[WEEX-V6-WORKER] Fatal error:', error);
  process.exit(1);
});
