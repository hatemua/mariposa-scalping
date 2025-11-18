/**
 * MT4 Order Test Helper (TypeScript)
 *
 * Programmatic testing of MT4 order creation and closure
 * with full error handling and detailed logging.
 */

import axios from 'axios';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:5004/api';
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:8080';
const BRIDGE_USER = process.env.BRIDGE_USER || 'admin';
const BRIDGE_PASS = process.env.BRIDGE_PASS || 'changeme123';
const JWT_TOKEN = process.env.TOKEN;

const VOLUME = parseFloat(process.env.VOLUME || '0.01');
const MONITOR_TIME = parseInt(process.env.MONITOR_TIME || '10');

// Create axios instance for MT4 bridge with basic auth
const bridgeClient = axios.create({
  baseURL: BRIDGE_URL,
  auth: {
    username: BRIDGE_USER,
    password: BRIDGE_PASS
  },
  timeout: 10000
});

// Create axios instance for backend API
const apiClient = axios.create({
  baseURL: API_URL,
  headers: JWT_TOKEN ? { Authorization: `Bearer ${JWT_TOKEN}` } : {},
  timeout: 10000
});

interface MT4Order {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  closePrice?: number;
  profit?: number;
  status: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testMT4Flow() {
  console.log('━'.repeat(80));
  console.log('  MT4 BTC Order Test (TypeScript)');
  console.log('━'.repeat(80));
  console.log('');
  console.log('Configuration:');
  console.log(`  API URL: ${API_URL}`);
  console.log(`  Bridge URL: ${BRIDGE_URL}`);
  console.log(`  Volume: ${VOLUME} lots`);
  console.log(`  Monitor Time: ${MONITOR_TIME}s`);
  console.log(`  Mode: ${JWT_TOKEN ? 'Backend API' : 'Direct Bridge'}`);
  console.log('');

  let ticket: number | null = null;

  try {
    // Step 1: Health Check
    console.log('[Step 1] Checking MT4 Bridge Health...');
    const pingResponse = await bridgeClient.get('/api/v1/ping');

    if (!pingResponse.data.zmq_connected) {
      throw new Error('ZeroMQ not connected to MT4!');
    }

    console.log('✅ MT4 Bridge is healthy');
    console.log(`   ZMQ: ${pingResponse.data.zmq_connected ? 'Connected' : 'Disconnected'}`);
    console.log('');

    // Step 2: Get BTC Price
    console.log('[Step 2] Fetching BTC Price...');
    const priceResponse = await bridgeClient.get('/api/v1/price/BTCUSDm');
    const { bid, ask, spread } = priceResponse.data;

    console.log(`✅ BTC Price: Bid=$${bid}, Ask=$${ask}, Spread=$${spread}`);
    console.log('');

    // Calculate SL/TP
    const stopLoss = ask - 100;
    const takeProfit = ask + 100;

    console.log(`   Stop Loss: $${stopLoss}`);
    console.log(`   Take Profit: $${takeProfit}`);
    console.log('');

    // Step 3: Open Order
    console.log('[Step 3] Opening BTC Buy Order...');
    console.log(`   Symbol: BTCUSDm`);
    console.log(`   Side: BUY`);
    console.log(`   Volume: ${VOLUME} lots`);
    console.log('');

    const orderPayload = {
      symbol: 'BTCUSDm',
      side: 'BUY' as const,
      volume: VOLUME,
      stopLoss,
      takeProfit,
      comment: `Test Order - TS Helper ${Date.now()}`
    };

    const orderResponse = await bridgeClient.post('/api/v1/orders', orderPayload);

    if (!orderResponse.data.success) {
      throw new Error(`Order failed: ${orderResponse.data.error}`);
    }

    const order: MT4Order = orderResponse.data.order;
    ticket = order.ticket;

    console.log('✅ Order Opened Successfully!');
    console.log(`   Ticket: #${ticket}`);
    console.log(`   Open Price: $${order.openPrice}`);
    console.log(`   Volume: ${order.volume} lots`);
    console.log(`   Status: ${order.status}`);
    console.log('');

    // Step 4: Monitor Position
    console.log(`[Step 4] Monitoring Position for ${MONITOR_TIME} seconds...`);
    console.log('');

    for (let i = 1; i <= MONITOR_TIME; i++) {
      try {
        const posResponse = await bridgeClient.get(`/api/v1/orders/${ticket}`);
        const position: MT4Order = posResponse.data.order;

        if (position.status !== 'open') {
          console.log(`⚠️  Position closed automatically (${position.status})`);
          console.log(`   Close Price: $${position.closePrice}`);
          console.log(`   Profit: $${position.profit}`);
          break;
        }

        const currentPrice = (position as any).currentPrice || order.openPrice;
        const profit = position.profit || 0;

        console.log(`[${i}/${MONITOR_TIME}] Price: $${currentPrice} | P&L: $${profit.toFixed(2)}`);
      } catch (error) {
        console.log(`[${i}/${MONITOR_TIME}] Failed to fetch position data`);
      }

      await sleep(1000);
    }

    console.log('');

    // Step 5: Close Position
    console.log('[Step 5] Closing Position...');

    // Check if still open
    const finalCheckResponse = await bridgeClient.get(`/api/v1/orders/${ticket}`);
    const finalStatus = finalCheckResponse.data.order.status;

    if (finalStatus === 'open') {
      const closeResponse = await bridgeClient.post('/api/v1/orders/close', { ticket });

      if (!closeResponse.data.success) {
        throw new Error(`Close failed: ${closeResponse.data.error}`);
      }

      const closedOrder: MT4Order = closeResponse.data.order;

      console.log('✅ Position Closed Successfully!');
      console.log(`   Ticket: #${closedOrder.ticket}`);
      console.log(`   Open Price: $${closedOrder.openPrice}`);
      console.log(`   Close Price: $${closedOrder.closePrice}`);
      console.log(`   Profit: $${closedOrder.profit}`);
    } else {
      console.log(`✅ Position already closed (${finalStatus})`);
      console.log(`   Profit: $${finalCheckResponse.data.order.profit}`);
    }

    console.log('');

    // Step 6: Verify Closure
    console.log('[Step 6] Verifying Position Closure...');
    await sleep(2000);

    const openPositions = await bridgeClient.get('/api/v1/orders/open?symbol=BTCUSDm');
    const openCount = openPositions.data.orders.length;

    console.log(`   Open BTC positions: ${openCount}`);
    console.log('');

    // Summary
    console.log('━'.repeat(80));
    console.log('  Test Summary');
    console.log('━'.repeat(80));
    console.log('');
    console.log('✅ Test Completed Successfully!');
    console.log('');
    console.log(`   Ticket: #${ticket}`);
    console.log(`   Entry Price: $${ask}`);
    console.log(`   Volume: ${VOLUME} lots`);
    console.log('');
    console.log('📊 View detailed logs:');
    console.log('   pm2 logs 0 --lines 50');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('━'.repeat(80));
    console.error('  ❌ Test Failed');
    console.error('━'.repeat(80));
    console.error('');

    if (axios.isAxiosError(error)) {
      console.error('Error Type: API Request Failed');
      console.error(`Status: ${error.response?.status || 'N/A'}`);
      console.error(`Message: ${error.message}`);
      console.error(`URL: ${error.config?.url}`);

      if (error.response?.data) {
        console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      }
    } else if (error instanceof Error) {
      console.error('Error Type:', error.constructor.name);
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error('Unknown error:', error);
    }

    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('   1. Check MT4 bridge: curl http://localhost:8080/api/v1/ping');
    console.error('   2. Verify Docker containers: docker ps | grep mt4');
    console.error('   3. Check bridge logs: docker logs mt4-bridge-server --tail 50');
    console.error('   4. Run health check: ./scripts/check-mt4-health.sh');
    console.error('');

    // Try to close position if it was opened
    if (ticket) {
      try {
        console.error('⚠️  Attempting to close orphaned position...');
        await bridgeClient.post('/api/v1/orders/close', { ticket });
        console.error('✅ Orphaned position closed');
      } catch (closeError) {
        console.error('❌ Failed to close orphaned position:', (closeError as Error).message);
      }
    }

    process.exit(1);
  }
}

// Run the test
testMT4Flow().catch(console.error);
