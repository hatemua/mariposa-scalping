/**
 * MARIPOSA WEEX V6 - Multi-Coin Worker
 *
 * Entry point for multi-coin trading on WEEX.
 * Trades BTC, ETH, SOL, DOGE with:
 * - Max 1 position per coin
 * - Max 3 total positions
 * - Simplified exit strategy (preset TP/SL, no breakeven/trailing)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { redis } from './config/redis';
import { redisService } from './services/redisService';
import { binanceService } from './services/binanceService';
import { multiCoinOrchestrator } from './services/weex/multiCoinOrchestrator';
import { weexPositionMonitor } from './services/weex/weexPositionMonitor';
import {
  TRADING_PAIRS,
  MAX_POSITIONS_PER_COIN,
  MAX_TOTAL_POSITIONS,
} from './config/environment';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mariposa-scalping';

// ============================================================================
// STARTUP
// ============================================================================

async function startMultiCoinWorker() {
  console.log('');
  console.log('================================================================');
  console.log('   MARIPOSA WEEX V6 - MULTI-COIN WORKER');
  console.log('================================================================');
  console.log('');
  console.log('   Trading Strategy: Simplified (No Breakeven/Trailing)');
  console.log('   Exit: Preset TP/SL on exchange - 2 fees only');
  console.log('');
  console.log('   Trading Pairs:');
  for (const pair of TRADING_PAIRS) {
    console.log(`     - ${pair.binanceSymbol}: Size ${pair.positionSize}, TP ${pair.minTpPercent}%, SL ${pair.minSlPercent}%`);
  }
  console.log('');
  console.log(`   Position Limits:`);
  console.log(`     - Max per coin: ${MAX_POSITIONS_PER_COIN}`);
  console.log(`     - Max total: ${MAX_TOTAL_POSITIONS}`);
  console.log('');
  console.log('================================================================');
  console.log('');

  try {
    // Step 1: Connect to MongoDB
    console.log('[MULTI-WORKER] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('[MULTI-WORKER] MongoDB connected');

    // Step 2: Connect to Redis
    console.log('[MULTI-WORKER] Connecting to Redis...');
    await redis.connect();
    console.log('[MULTI-WORKER] Redis connected');

    // Verify Redis connection
    await redisService.set('multi_worker_health', 'online', { ttl: 300 });
    console.log('[MULTI-WORKER] Redis verified');

    // Wait for connections to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 3: Start Binance service (for price data)
    console.log('[MULTI-WORKER] Starting Binance service...');
    await binanceService.start();
    console.log('[MULTI-WORKER] Binance service started');

    // Step 4: Start the multi-coin orchestrator
    console.log('[MULTI-WORKER] Starting multi-coin orchestrator...');
    await multiCoinOrchestrator.start();
    console.log('[MULTI-WORKER] Multi-coin orchestrator started');

    // Worker is ready
    console.log('');
    console.log('================================================================');
    console.log('   MULTI-COIN WORKER READY');
    console.log('================================================================');
    console.log('');

    // Health check every 5 minutes
    setInterval(async () => {
      try {
        const health = multiCoinOrchestrator.getHealth();
        const monitorHealth = weexPositionMonitor.getHealth();

        console.log('');
        console.log('================================================================');
        console.log(`[${new Date().toISOString()}] MULTI-COIN HEALTH CHECK`);
        console.log('================================================================');
        console.log(`  Orchestrator: ${health.isRunning ? 'RUNNING' : 'STOPPED'}`);
        console.log(`  Cycles: ${health.cycleCount}`);
        console.log(`  Open Positions: ${health.totalOpenPositions}/${MAX_TOTAL_POSITIONS}`);
        console.log('  Positions per Coin:');
        for (const [symbol, count] of Object.entries(health.positionsPerCoin)) {
          const pair = TRADING_PAIRS.find(p => p.weexSymbol === symbol);
          console.log(`    ${pair?.binanceSymbol || symbol}: ${count}`);
        }
        console.log(`  Monitor: ${monitorHealth.isRunning ? 'RUNNING' : 'STOPPED'}`);
        console.log(`  Total P&L: $${monitorHealth.totalPnlUSD.toFixed(2)}`);

        if (health.errors.length > 0) {
          console.log('  Recent Errors:');
          for (const err of health.errors.slice(-3)) {
            console.log(`    - ${err}`);
          }
        }
        console.log('================================================================');
        console.log('');
      } catch (error: any) {
        console.error('[MULTI-WORKER] Health check error:', error.message);
      }
    }, 300000); // 5 minutes

  } catch (error) {
    console.error('[MULTI-WORKER] Startup failed:', error);
    process.exit(1);
  }
}

// ============================================================================
// SHUTDOWN
// ============================================================================

async function shutdown(signal: string) {
  console.log(`\n[MULTI-WORKER] Received ${signal} - shutting down...`);

  try {
    console.log('[MULTI-WORKER] Stopping orchestrator...');
    multiCoinOrchestrator.stop();

    console.log('[MULTI-WORKER] Disconnecting MongoDB...');
    await mongoose.disconnect();

    console.log('[MULTI-WORKER] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[MULTI-WORKER] Shutdown error:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[MULTI-WORKER] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[MULTI-WORKER] Unhandled Rejection:', reason);
  process.exit(1);
});

// ============================================================================
// START WORKER
// ============================================================================

startMultiCoinWorker().catch((error) => {
  console.error('[MULTI-WORKER] Fatal error:', error);
  process.exit(1);
});
