#!/usr/bin/env node

/**
 * MT4 BTC Complete Trading Flow Test (JavaScript)
 * Tests: Health Check → Get Price → Open Order → Monitor → Close → Verify
 *
 * Usage:
 *   node scripts/test-mt4-btc-flow.js
 *   VOLUME=0.05 MONITOR_TIME=15 node scripts/test-mt4-btc-flow.js
 *   TOKEN="jwt_token" node scripts/test-mt4-btc-flow.js
 */

const axios = require('axios');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Configuration from environment variables
const config = {
  apiUrl: process.env.API_URL || 'http://localhost:5004/api',
  bridgeUrl: process.env.BRIDGE_URL || 'http://localhost:8080',
  bridgeUser: process.env.BRIDGE_USER || 'admin',
  bridgePass: process.env.BRIDGE_PASS || 'changeme123',
  jwtToken: process.env.TOKEN || null,
  volume: parseFloat(process.env.VOLUME || '0.01'),
  monitorTime: parseInt(process.env.MONITOR_TIME || '10', 10),
};

// Create axios instance for MT4 bridge
const bridgeClient = axios.create({
  baseURL: config.bridgeUrl,
  auth: {
    username: config.bridgeUser,
    password: config.bridgePass,
  },
  timeout: 10000,
});

// Create axios instance for backend API
const apiClient = axios.create({
  baseURL: config.apiUrl,
  headers: config.jwtToken ? { Authorization: `Bearer ${config.jwtToken}` } : {},
  timeout: 10000,
});

// Helper functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log('═'.repeat(80), 'blue');
  log(`  ${title}`, 'blue');
  log('═'.repeat(80), 'blue');
  console.log('');
}

function logStep(step, message) {
  log(`[Step ${step}] ${message}`, 'yellow');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test function
async function runTest() {
  logSection('MT4 BTC Trading Flow Test');

  log('Configuration:', 'cyan');
  console.log(`  API URL: ${config.apiUrl}`);
  console.log(`  Bridge URL: ${config.bridgeUrl}`);
  console.log(`  Volume: ${config.volume} lots`);
  console.log(`  Monitor Time: ${config.monitorTime} seconds`);
  console.log(`  Mode: ${config.jwtToken ? 'Backend API' : 'Direct Bridge'}`);
  console.log('');

  let ticket = null;
  let agentId = null;

  try {
    // Step 1: Health Check
    logStep(1, 'Running Health Check...');
    const pingResponse = await bridgeClient.get('/api/v1/ping');

    if (!pingResponse.data.zmq_connected) {
      throw new Error('ZeroMQ not connected to MT4!');
    }

    logSuccess('MT4 Bridge is healthy');
    console.log(JSON.stringify(pingResponse.data, null, 2));
    console.log('');

    // Step 2: Create Agent (if using backend API)
    if (config.jwtToken) {
      logStep(2, 'Creating MT4 Scalping Agent...');

      const agentPayload = {
        name: `Test BTC Scalper ${Date.now()}`,
        broker: 'MT4',
        category: 'SCALPING',
        riskLevel: 3,
        budget: 100,
        description: 'Automated test agent for BTC scalping',
      };

      const agentResponse = await apiClient.post('/agents', agentPayload);

      if (!agentResponse.data.success) {
        throw new Error('Failed to create agent');
      }

      agentId = agentResponse.data.data._id;
      logSuccess(`Agent created: ${agentId}`);
      console.log(JSON.stringify({
        name: agentResponse.data.data.name,
        broker: agentResponse.data.data.broker,
        category: agentResponse.data.data.category,
        minLLMConfidence: agentResponse.data.data.minLLMConfidence,
        maxOpenPositions: agentResponse.data.data.maxOpenPositions,
      }, null, 2));
    } else {
      logInfo('Skipping agent creation (using bridge directly)');
    }
    console.log('');

    // Step 3: Get Current BTC Price
    logStep(config.jwtToken ? 3 : 2, 'Fetching Current BTC Price...');

    const priceResponse = await bridgeClient.get('/api/v1/price/BTCUSDm');
    const { bid, ask, spread } = priceResponse.data;

    logSuccess('BTC Price Retrieved');
    console.log(`  Bid: $${bid}`);
    console.log(`  Ask: $${ask}`);
    console.log(`  Spread: $${spread}`);
    console.log('');

    // Calculate SL/TP (100 points range for test)
    const stopLoss = ask - 100;
    const takeProfit = ask + 100;

    logInfo(`Calculated Stop Loss: $${stopLoss.toFixed(2)}`);
    logInfo(`Calculated Take Profit: $${takeProfit.toFixed(2)}`);
    console.log('');

    // Step 4: Open BTC Buy Order
    logStep(config.jwtToken ? 4 : 3, 'Opening BTC Buy Order...');
    console.log(`  Symbol: BTCUSDm`);
    console.log(`  Side: BUY`);
    console.log(`  Volume: ${config.volume} lots`);
    console.log(`  SL: $${stopLoss.toFixed(2)}`);
    console.log(`  TP: $${takeProfit.toFixed(2)}`);
    console.log('');

    const orderPayload = {
      symbol: 'BTCUSDm',
      side: 'BUY',
      volume: config.volume,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      comment: `Test Order - JS Flow ${Date.now()}`,
    };

    let orderResponse;
    let order;

    if (config.jwtToken) {
      // Use backend API
      orderResponse = await apiClient.post('/mt4/orders', {
        symbol: 'BTCUSD',
        side: 'buy',
        volume: config.volume,
        stopLoss,
        takeProfit,
      });
      order = orderResponse.data.data;
      ticket = order.ticket;
    } else {
      // Use bridge directly
      orderResponse = await bridgeClient.post('/api/v1/orders', orderPayload);
      // Bridge returns order directly, not wrapped
      order = orderResponse.data;
      ticket = order.ticket;
    }

    logSuccess('Order Opened Successfully');
    console.log(`  Ticket: #${ticket}`);
    console.log(JSON.stringify({
      ticket: order.ticket,
      symbol: order.symbol,
      type: order.type,
      volume: order.volume,
      openPrice: order.openPrice,
      profit: order.profit || 0,
    }, null, 2));
    console.log('');

    // Step 5: Monitor Position
    logStep(config.jwtToken ? 5 : 4, `Monitoring Position for ${config.monitorTime} seconds...`);
    console.log('');

    let positionClosed = false;

    for (let i = 1; i <= config.monitorTime; i++) {
      try {
        const posResponse = await bridgeClient.get(`/api/v1/orders/${ticket}`);
        // Bridge returns order directly
        const position = posResponse.data;

        if (position.status && position.status !== 'open') {
          log(`⚠️  Position closed automatically (${position.status})`, 'yellow');
          console.log(`   Close Price: $${position.closePrice}`);
          console.log(`   Profit: $${position.profit}`);
          positionClosed = true;
          break;
        }

        const currentPrice = position.currentPrice || order.openPrice;
        const profit = position.profit || 0;

        log(`[${i}/${config.monitorTime}] Price: $${currentPrice} | P&L: $${profit.toFixed(2)}`, 'cyan');
      } catch (error) {
        log(`[${i}/${config.monitorTime}] Failed to fetch position data`, 'red');
      }

      await sleep(1000);
    }

    console.log('');

    // Step 6: Close Position
    logStep(config.jwtToken ? 6 : 5, 'Closing Position...');

    let closedOrder;

    if (!positionClosed) {
      // Position still open, close it
      let closeResponse;

      if (config.jwtToken) {
        closeResponse = await apiClient.post('/mt4/orders/close', { ticket });
        closedOrder = closeResponse.data.data;
      } else {
        closeResponse = await bridgeClient.post('/api/v1/orders/close', { ticket });
        // Bridge returns order directly
        closedOrder = closeResponse.data;
      }

      logSuccess('Position Closed Successfully');
      console.log(JSON.stringify({
        ticket: closedOrder.ticket,
        openPrice: closedOrder.openPrice,
        closePrice: closedOrder.closePrice,
        profit: closedOrder.profit,
        status: closedOrder.status,
      }, null, 2));
    } else {
      logInfo('Position already closed (SL/TP or auto-close)');
      const finalCheckResponse = await bridgeClient.get(`/api/v1/orders/${ticket}`);
      closedOrder = finalCheckResponse.data;
    }

    console.log('');

    // Step 7: Verify Position is Closed
    logStep(config.jwtToken ? 7 : 6, 'Verifying Position Closure...');

    await sleep(2000);

    const verifyResponse = await bridgeClient.get('/api/v1/orders/open?symbol=BTCUSDm');
    const openCount = verifyResponse.data.orders.length;

    console.log(`  Open BTC positions: ${openCount}`);

    if (openCount === 0) {
      logSuccess('No open positions remaining');
    } else {
      log(`⚠️  Still has ${openCount} open position(s)`, 'yellow');
      console.log(JSON.stringify(verifyResponse.data.orders, null, 2));
    }

    console.log('');

    // Final Summary
    logSection('Test Summary');

    const finalPnl = closedOrder.profit || 0;

    logSuccess('Test Completed Successfully!');
    console.log('');
    console.log(`  Ticket Number: #${ticket}`);
    if (agentId) {
      console.log(`  Agent ID: ${agentId}`);
    }
    console.log(`  Entry Price: $${ask.toFixed(2)}`);
    console.log(`  Volume: ${config.volume} lots`);
    console.log(`  Final P&L: $${finalPnl.toFixed(2)}`);
    console.log('');

    if (finalPnl > 0) {
      log('💰 Trade was profitable!', 'green');
    } else if (finalPnl < 0) {
      log('📉 Trade had a loss', 'red');
    } else {
      log('➖ Trade broke even', 'cyan');
    }

    console.log('');
    logInfo('View detailed logs:');
    console.log('  pm2 logs 0 --lines 50');
    console.log('');
    logInfo('Check debug output:');
    console.log('  grep "[MT4]" ~/.pm2/logs/npm-out.log');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.log('');
    logSection('❌ Test Failed');

    if (axios.isAxiosError(error)) {
      logError('Error Type: API Request Failed');
      console.log(`  Status: ${error.response?.status || 'N/A'}`);
      console.log(`  Message: ${error.message}`);
      console.log(`  URL: ${error.config?.url}`);

      if (error.response?.data) {
        console.log('  Response Data:');
        console.log(JSON.stringify(error.response.data, null, 2));
      }
    } else if (error instanceof Error) {
      logError(`Error Type: ${error.constructor.name}`);
      console.log(`  Message: ${error.message}`);
      if (error.stack) {
        console.log('  Stack:');
        console.log(error.stack.split('\n').slice(0, 5).join('\n'));
      }
    } else {
      logError('Unknown error:');
      console.log(error);
    }

    console.log('');
    logInfo('💡 Troubleshooting:');
    console.log('  1. Check MT4 bridge: curl http://localhost:8080/api/v1/ping');
    console.log('  2. Verify Docker containers: docker ps | grep mt4');
    console.log('  3. Check bridge logs: docker logs mt4-bridge-server --tail 50');
    console.log('  4. Check credentials: npx tsx scripts/check-mt4-credentials.ts');
    console.log('');

    // Try to close orphaned position if it was opened
    if (ticket) {
      try {
        logInfo('⚠️  Attempting to close orphaned position...');
        await bridgeClient.post('/api/v1/orders/close', { ticket });
        logSuccess('Orphaned position closed');
      } catch (closeError) {
        logError(`Failed to close orphaned position: ${closeError.message}`);
      }
      console.log('');
    }

    process.exit(1);
  }
}

// Run the test
runTest().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
