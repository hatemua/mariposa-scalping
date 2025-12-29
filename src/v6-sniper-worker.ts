/**
 * MARIPOSA V6 PRO - Sniper Worker
 *
 * Dedicated worker for the V6 intelligent sniper scalping system.
 * Runs completely independently from the V5 system.
 *
 * Architecture:
 * - 30-minute strategic analysis cycle (LLM-based)
 * - 1-minute zone monitoring cycle (MATH-only)
 * - Position monitoring uses existing V5 exit system
 *
 * This worker:
 * 1. Creates trade setups based on LLM analysis of key levels
 * 2. Monitors price approach to setup zones
 * 3. Triggers on math-based candle pattern confirmation
 * 4. Executes trades immediately (no queue delay)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { redis } from './config/redis';
import { redisService } from './services/redisService';
import { binanceService } from './services/binanceService';
import { positionMonitorService } from './services/positionMonitorService';
import { validatedSignalExecutor } from './services/validatedSignalExecutor';
import { mt4TradeManager } from './services/mt4TradeManager';
import { ScalpingAgent } from './models';

// V6 Services
import {
  setupQueueService,
  strategicAnalysisService,
  zoneMonitorService,
} from './services/v6';

// V6 Utilities
import { normalizeKlines, getCurrentPrice } from './services/v6/utils/normalizeKlines';

// Types
import { TradeSetup } from './types/v6';

// Config
import { V6_ENV_CONFIG } from './config/environment';

// Load environment variables
dotenv.config();

// Environment diagnostics
console.log('[V6-WORKER-DEBUG] Environment Check:');
console.log(`[V6-WORKER-DEBUG]   TOGETHER_AI_API_KEY: ${process.env.TOGETHER_AI_API_KEY ? 'SET (' + process.env.TOGETHER_AI_API_KEY.length + ' chars)' : 'NOT SET!'}`);
console.log(`[V6-WORKER-DEBUG]   MONGODB_URI: ${process.env.MONGODB_URI ? 'SET' : 'Using default'}`);
console.log(`[V6-WORKER-DEBUG]   REDIS: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mariposa-scalping';

// ============================================================================
// V6 EXECUTION CALLBACK
// ============================================================================

/**
 * Called by zoneMonitorService when a setup pattern is confirmed
 */
async function onSetupConfirmed(setup: TradeSetup, executionPrice: number): Promise<void> {
  console.log('');
  console.log('==================================================');
  console.log('[V6-WORKER] Setup confirmed - executing trade!');
  console.log(`[V6-WORKER] Setup ID: ${setup.id}`);
  console.log(`[V6-WORKER] Direction: ${setup.direction} @ $${executionPrice.toFixed(2)}`);
  console.log(`[V6-WORKER] Grade: ${setup.grade} | SL: $${setup.stopLoss} | TP: $${setup.takeProfit1}`);
  console.log('==================================================');

  try {
    console.log('[V6-WORKER] Calling validatedSignalExecutor.executeV6Setup...');
    const result = await validatedSignalExecutor.executeV6Setup(setup, executionPrice);

    console.log(`[V6-WORKER] Execution result:`, JSON.stringify(result, null, 2));

    if (result.success) {
      // Mark setup as executed in queue
      console.log(`[V6-WORKER] SUCCESS! Marking setup as executed...`);
      await setupQueueService.markExecuted(
        setup.id,
        executionPrice,
        `v6-${setup.id}`,
        result.ticket
      );
      console.log(`[V6-WORKER] Trade executed successfully! Ticket: ${result.ticket}`);
    } else {
      console.error(`[V6-WORKER] !!!! TRADE EXECUTION FAILED !!!!`);
      console.error(`[V6-WORKER] FAILURE REASON: ${result.error}`);
      // Mark as FAILED - don't throw (that causes status revert to IN_ZONE)
      await setupQueueService.updateSetupStatus(setup.id, 'FAILED');
      console.error(`[V6-WORKER] Setup marked as FAILED - will not retry`);
      // Don't throw - just return to prevent zone monitor from reverting status
      return;
    }
  } catch (error: any) {
    console.error('[V6-WORKER] !!!! EXECUTION ERROR !!!!');
    console.error('[V6-WORKER] Error:', error.message);
    console.error('[V6-WORKER] Stack:', error.stack);
    // Re-throw so zoneMonitorService can handle status revert
    throw error;
  }
}

// ============================================================================
// STARTUP
// ============================================================================

/**
 * Start the V6 Sniper Worker
 */
async function startV6SniperWorker() {
  const modeLabel = V6_ENV_CONFIG.MODE === 'SCALPING' ? '⚡ SCALPING MODE' : '📊 SWING MODE';
  const modeEmoji = V6_ENV_CONFIG.MODE === 'SCALPING' ? '⚡' : '📊';

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🎯 MARIPOSA V6 PRO - ${modeLabel}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('📌 This worker runs the V6 intelligent sniper system');
  console.log(`📌 ${V6_ENV_CONFIG.ANALYSIS_INTERVAL_MINUTES}-minute LLM analysis → Setup creation → Zone monitoring`);
  if (V6_ENV_CONFIG.MODE === 'SCALPING') {
    console.log('📌 INSTANT EXECUTION - No pattern confirmation required');
    console.log(`📌 Entry distance: Max ${V6_ENV_CONFIG.MAX_ENTRY_DISTANCE_PCT}% from price`);
    console.log(`📌 Targets: ${V6_ENV_CONFIG.TAKE_PROFIT_1_PCT}%-${V6_ENV_CONFIG.TAKE_PROFIT_2_PCT}% | Stop: ${V6_ENV_CONFIG.STOP_LOSS_PCT}%-${V6_ENV_CONFIG.MAX_STOP_LOSS_PCT}%`);
  } else {
    console.log('📌 Pattern confirmation required for B/C grade setups');
  }
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  try {
    // Step 1: Connect to MongoDB
    console.log('[V6-WORKER] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('[V6-WORKER] MongoDB connected');

    // Step 2: Connect to Redis
    console.log('[V6-WORKER] Connecting to Redis...');
    await redis.connect();
    console.log('[V6-WORKER] Redis connected');

    // Verify Redis connection
    await redisService.set('v6_worker_health', 'online', { ttl: 300 });
    console.log('[V6-WORKER] Redis verified');

    // Wait for Redis pub/sub to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Start Binance service (for price data)
    console.log('[V6-WORKER] Starting Binance service...');
    await binanceService.start();
    console.log('[V6-WORKER] Binance service started');

    // Step 4: Initialize V6 Queue Service
    console.log('[V6-WORKER] Initializing setup queue...');
    await setupQueueService.initialize();
    console.log('[V6-WORKER] Setup queue initialized');

    // SCALPING MODE: Clear old swing setups on startup
    if (V6_ENV_CONFIG.MODE === 'SCALPING') {
      const activeCount = setupQueueService.getActiveSetups().length;
      if (activeCount > 0) {
        console.log('[V6-WORKER] SCALPING MODE: Clearing old swing setups...');
        await setupQueueService.clearAllSetups();
        console.log('[V6-WORKER] Queue cleared - starting fresh with scalping setups');
      } else {
        console.log('[V6-WORKER] SCALPING MODE: Queue already empty - good to go');
      }
    }

    // Log queue state
    setupQueueService.logQueueState();

    // Step 4.5: Verify MT4 agent exists for V6 execution
    // NOTE: Agent category is 'SCALPING', which auto-includes 'FIBONACCI_SCALPING' in allowedSignalCategories
    console.log('[V6-WORKER] Verifying MT4 SCALPING agent...');
    const fibAgent = await ScalpingAgent.findOne({
      broker: 'MT4',
      isActive: true,
      category: 'SCALPING'
    });

    if (!fibAgent) {
      console.error('');
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.error('[V6-WORKER] CRITICAL: No MT4 SCALPING agent found!');
      console.error('[V6-WORKER] V6 trades will NOT execute until agent is configured.');
      console.error('[V6-WORKER] Required: broker=MT4, isActive=true, category=SCALPING');
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.error('');
    } else {
      console.log(`[V6-WORKER] MT4 agent verified: ${fibAgent.name} (${fibAgent._id})`);
      console.log(`[V6-WORKER] Agent userId: ${fibAgent.userId}`);
    }

    // Step 5: Start Strategic Analysis Service (30-min cycle)
    console.log('[V6-WORKER] Starting strategic analysis service (30-min cycle)...');
    await strategicAnalysisService.start();
    console.log('[V6-WORKER] Strategic analysis service started');

    // Step 6: Start Zone Monitor Service (1-min cycle)
    console.log('[V6-WORKER] Starting zone monitor service (1-min cycle)...');
    await zoneMonitorService.start(onSetupConfirmed);
    console.log('[V6-WORKER] Zone monitor service started');

    // Step 7: Start MT4 Trade Manager (for exits - trailing/breakeven/time-based)
    // This replaces the old positionMonitorService interval with the more comprehensive
    // mt4TradeManager which monitors every 10s with full exit logic
    console.log('[V6-WORKER] Starting MT4 Trade Manager (exit system)...');
    await mt4TradeManager.start();
    console.log('[V6-WORKER] MT4 Trade Manager started (10s monitoring interval)');

    // Also load positions into the LLM monitor for additional analysis (optional layer)
    await positionMonitorService.loadExistingPositions();
    console.log('[V6-WORKER] Position monitor initialized');

    // Worker is ready
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ V6 SNIPER WORKER READY - ${modeLabel}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('📊 Symbol: BTCUSDT');
    console.log(`🕐 Analysis: Every ${V6_ENV_CONFIG.ANALYSIS_INTERVAL_MINUTES} minutes (LLM-based)`);
    console.log(`⏱️  Zone Check: Every ${V6_ENV_CONFIG.ZONE_CHECK_SECONDS} seconds (math-only)`);
    console.log('🎯 Max Setups: 5 active');
    console.log(`📈 Max Trades/Day: ${V6_ENV_CONFIG.MAX_TRADES_PER_DAY}`);
    console.log(`⏳ Setup Expiry: ${V6_ENV_CONFIG.SETUP_EXPIRY_HOURS} hours`);
    if (V6_ENV_CONFIG.MODE === 'SCALPING') {
      console.log(`📐 Entry Distance: Max ${V6_ENV_CONFIG.MAX_ENTRY_DISTANCE_PCT}% from price`);
      console.log(`💰 Targets: ${V6_ENV_CONFIG.TAKE_PROFIT_1_PCT}%-${V6_ENV_CONFIG.TAKE_PROFIT_2_PCT}% | Stop: ${V6_ENV_CONFIG.STOP_LOSS_PCT}%-${V6_ENV_CONFIG.MAX_STOP_LOSS_PCT}%`);
      console.log(`${modeEmoji} Execution: INSTANT (no pattern confirmation)`);
    }
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    // Enhanced health check logging every 5 minutes
    setInterval(async () => {
      try {
        const queueHealth = setupQueueService.getQueueHealth();
        const monitorHealth = zoneMonitorService.getHealth();
        const analysisHealth = strategicAnalysisService.getHealth();
        const posCount = positionMonitorService.getMonitoredCount();
        const activeSetups = setupQueueService.getActiveSetups();

        // Get current price (normalize raw Binance data)
        const rawCandles = await binanceService.getKlines('BTCUSDT', '15m', 1);
        const candles = normalizeKlines(rawCandles);
        const currentPrice = getCurrentPrice(candles);

        console.log('');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`[${new Date().toISOString()}] V6 HEALTH CHECK`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`  BTC Price: $${currentPrice.toFixed(2)}`);
        console.log(`  Active Setups: ${queueHealth.activeSetups}/${queueHealth.maxSetups} | Trades Today: ${queueHealth.todayTrades}/${queueHealth.maxTrades}`);
        console.log(`  Analysis Cycles: ${analysisHealth.cycleCount} | Total Setups Created: ${analysisHealth.totalSetupsCreated}`);
        console.log(`  Zone Checks: ${monitorHealth.checkCount} | Triggered: ${monitorHealth.setupsTriggered} | Confirmed: ${monitorHealth.setupsConfirmed}`);
        console.log(`  Positions Monitored: ${posCount}`);

        if (activeSetups.length > 0 && currentPrice > 0) {
          console.log('');
          console.log('  ACTIVE SETUPS:');
          for (const setup of activeSetups) {
            const midpoint = setup.entryZone?.midpoint || 0;
            const distFromEntry = currentPrice > 0 ? ((currentPrice - midpoint) / currentPrice * 100).toFixed(2) : 'N/A';
            console.log(`    ${setup.id.slice(0, 8)} | ${setup.direction} @ $${midpoint.toFixed(0)} | Grade ${setup.grade} | ${setup.status} | ${distFromEntry}% away`);
          }
        } else if (activeSetups.length > 0) {
          console.log('');
          console.log('  ACTIVE SETUPS: Price data unavailable');
        } else {
          console.log('');
          console.log('  ACTIVE SETUPS: None (waiting for next analysis cycle)');
        }

        if (analysisHealth.recentErrors && analysisHealth.recentErrors.length > 0) {
          console.log('');
          console.log('  RECENT ERRORS:');
          for (const err of analysisHealth.recentErrors.slice(-3)) {
            console.log(`    - ${err}`);
          }
        }

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('');
      } catch (error: any) {
        console.error('[V6-WORKER] Health check error:', error.message);
      }
    }, 300000); // 5 minutes

    // Detailed status every 15 minutes
    setInterval(() => {
      console.log('');
      console.log('═════════════════════════════════════════════════════════');
      console.log('[V6-WORKER] DETAILED STATUS');
      console.log('═════════════════════════════════════════════════════════');
      setupQueueService.logQueueState();
      zoneMonitorService.logStatus();
      console.log('═════════════════════════════════════════════════════════');
      console.log('');
    }, 900000); // 15 minutes

  } catch (error) {
    console.error('[V6-WORKER] Startup failed:', error);
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
  console.log(`\n[V6-WORKER] Received ${signal} - shutting down...`);

  try {
    // Stop services in reverse order
    console.log('[V6-WORKER] Stopping zone monitor...');
    zoneMonitorService.stop();

    console.log('[V6-WORKER] Stopping strategic analysis...');
    strategicAnalysisService.stop();

    console.log('[V6-WORKER] Stopping MT4 Trade Manager...');
    mt4TradeManager.stop();

    console.log('[V6-WORKER] Disconnecting MongoDB...');
    await mongoose.disconnect();

    console.log('[V6-WORKER] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[V6-WORKER] Shutdown error:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[V6-WORKER] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[V6-WORKER] Unhandled Rejection:', reason);
  process.exit(1);
});

// ============================================================================
// START WORKER
// ============================================================================

startV6SniperWorker().catch((error) => {
  console.error('[V6-WORKER] Fatal error:', error);
  process.exit(1);
});
