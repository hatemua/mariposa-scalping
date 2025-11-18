/**
 * Dedicated Fibonacci Scalping Worker
 *
 * This worker runs ONLY the BTC Fibonacci scalping service in complete isolation
 * from all other signal detection services. This ensures:
 *
 * 1. No LLM API competition with other services
 * 2. Dedicated resources and event loop
 * 3. Independent restart/scaling capability
 * 4. Cleaner logs and easier debugging
 *
 * The worker connects to shared MongoDB and Redis but runs its own service instances.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { redis } from './config/redis';
import { redisService } from './services/redisService';
import { btcMultiPatternScalpingService } from './services/btcMultiPatternScalpingService';
import { ValidatedSignalExecutor } from './services/validatedSignalExecutor';
import { binanceService } from './services/binanceService';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mariposa-scalping';

// Create a filtered signal executor for BTC Fibonacci signals ONLY
const fibonacciExecutor = new ValidatedSignalExecutor({
  symbolFilter: ['BTCUSDT'],
  categoryFilter: ['FIBONACCI_SCALPING'],
  queueNames: ['fibonacci_priority_signals']
});

/**
 * Start the Fibonacci Scalping Worker
 */
async function startFibonacciWorker() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Starting Fibonacci Scalping Worker (Isolated)');
  console.log('═══════════════════════════════════════════════════════');
  console.log('📌 This worker ONLY processes BTC Fibonacci scalping');
  console.log('📌 All other signals run in the main server');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    // Step 2: Connect to Redis explicitly (lazyConnect: true requires explicit call)
    console.log('🔗 Connecting to Redis...');
    await redis.connect();
    console.log('✅ Redis connected successfully\n');

    // Verify connection
    await redisService.set('fibonacci_worker_health', 'online', { ttl: 300 });
    console.log('✅ Redis service verified\n');

    // Step 3: Wait a moment for Redis pub/sub to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 4: Start Binance service (for WebSocket kline streams)
    console.log('🔗 Starting Binance WebSocket service...');
    await binanceService.start();
    console.log('✅ Binance service started\n');

    // Step 5: Start ONLY the BTC Fibonacci Scalping Service
    console.log('🎯 Starting BTC Fibonacci Scalping Service...');
    await btcMultiPatternScalpingService.start();
    console.log('✅ BTC Fibonacci Scalping Service started\n');

    // Step 5: Start ONLY the FILTERED Signal Executor (for executing Fibonacci signals ONLY)
    console.log('⚡ Starting Filtered Signal Executor (BTC Fibonacci ONLY)...');
    await fibonacciExecutor.start();
    console.log('✅ Filtered Signal Executor started\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Fibonacci Worker Ready');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 Monitoring: BTCUSDT only');
    console.log('📈 Timeframes: 1m, 5m, 15m, 30m');
    console.log('🤖 LLMs: 4 specialists (Fibonacci, Chart, Candle, S/R)');
    console.log('⏱️  Signal generation: Every 5m candle close');
    console.log('🎯 Priority: 100% dedicated to Fibonacci scalping');
    console.log('═══════════════════════════════════════════════════════\n');

    // Log worker health status every 5 minutes
    setInterval(() => {
      console.log(`[${new Date().toISOString()}] ❤️  Fibonacci Worker healthy`);
    }, 300000); // 5 minutes

  } catch (error) {
    console.error('❌ Fibonacci Worker startup failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
async function shutdown(signal: string) {
  console.log(`\n⏹️  Received ${signal} - shutting down Fibonacci Worker...`);

  try {
    // Stop services in reverse order
    console.log('Stopping Filtered Signal Executor...');
    fibonacciExecutor.stop();

    console.log('Stopping BTC Fibonacci Scalping Service...');
    btcMultiPatternScalpingService.stop();

    console.log('Disconnecting from MongoDB...');
    await mongoose.disconnect();

    console.log('✅ Fibonacci Worker shut down gracefully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception in Fibonacci Worker:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection in Fibonacci Worker:', reason);
  process.exit(1);
});

// Start the worker
startFibonacciWorker().catch((error) => {
  console.error('❌ Fatal error starting Fibonacci Worker:', error);
  process.exit(1);
});
