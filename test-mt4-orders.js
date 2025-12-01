#!/usr/bin/env node

/**
 * MT4 Order Testing Script
 *
 * Tests the complete order flow:
 * 1. Connection to MT4 bridge
 * 2. Getting account info
 * 3. Getting symbol price
 * 4. Opening an order
 * 5. Getting open positions
 * 6. Closing the order
 *
 * Usage: node test-mt4-orders.js [symbol] [volume]
 * Example: node test-mt4-orders.js BTCUSD 0.01
 */

const axios = require('axios');

// Configuration
const BRIDGE_URL = process.env.MT4_BRIDGE_URL || 'http://localhost:8080';
const BRIDGE_USERNAME = process.env.MT4_BRIDGE_USERNAME || 'admin';
const BRIDGE_PASSWORD = process.env.MT4_BRIDGE_PASSWORD || 'changeme123';

// Test parameters (can be overridden via command line)
const SYMBOL = process.argv[2] || 'BTCUSD';
const VOLUME = parseFloat(process.argv[3] || '0.01');

// Create axios client with auth
const client = axios.create({
  baseURL: BRIDGE_URL,
  timeout: 30000,
  auth: {
    username: BRIDGE_USERNAME,
    password: BRIDGE_PASSWORD
  }
});

// Helper functions
function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function logSuccess(message) {
  log('✅', message);
}

function logError(message) {
  log('❌', message);
}

function logInfo(message) {
  log('ℹ️ ', message);
}

function logData(label, data) {
  console.log(`   ${label}:`, JSON.stringify(data, null, 2));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test functions
async function testPing() {
  log('🔍', 'Testing bridge connection...');
  try {
    const response = await client.get('/api/v1/ping');
    logSuccess('Bridge is online');
    logData('Response', response.data);

    if (response.data.zmq_connected) {
      logSuccess('ZeroMQ connected to MT4');
    } else {
      logError('ZeroMQ NOT connected to MT4');
      return false;
    }
    return true;
  } catch (error) {
    logError(`Failed to connect to bridge: ${error.message}`);
    return false;
  }
}

async function testAccountInfo() {
  log('🔍', 'Getting account information...');
  try {
    const response = await client.get('/api/v1/account/info');

    if (response.data.success) {
      logSuccess('Account info retrieved');
      logData('Account', response.data.data);
      return response.data.data;
    } else {
      logError(`Failed to get account info: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    logError(`Error getting account info: ${error.message}`);
    if (error.response) {
      logData('Error Response', error.response.data);
    }
    return null;
  }
}

async function testGetPrice(symbol) {
  log('🔍', `Getting price for ${symbol}...`);
  try {
    const response = await client.get(`/api/v1/price/${symbol}`);

    if (response.data.success) {
      logSuccess(`Price retrieved for ${symbol}`);
      logData('Price', response.data.data);
      return response.data.data;
    } else {
      logError(`Failed to get price: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    logError(`Error getting price: ${error.message}`);
    if (error.response) {
      logData('Error Response', error.response.data);
    }
    return null;
  }
}

async function testOpenOrder(symbol, side, volume) {
  log('🔍', `Opening ${side} order for ${symbol} (volume: ${volume})...`);
  try {
    const orderRequest = {
      symbol: symbol,
      side: side,
      volume: volume,
      stopLoss: 0,
      takeProfit: 0,
      comment: 'Test order from script'
    };

    logInfo('Order request:');
    logData('Request', orderRequest);

    const response = await client.post('/api/v1/orders', orderRequest);

    if (response.data.success) {
      logSuccess('Order opened successfully!');
      logData('Order', response.data.data);
      return response.data.data;
    } else {
      logError(`Failed to open order: ${response.data.error}`);
      logData('Error Response', response.data);
      return null;
    }
  } catch (error) {
    logError(`Error opening order: ${error.message}`);
    if (error.response) {
      logData('Error Response', error.response.data);
      logData('Status Code', error.response.status);
    }
    return null;
  }
}

async function testGetOpenPositions() {
  log('🔍', 'Getting open positions...');
  try {
    const response = await client.get('/api/v1/orders/open');

    if (response.data.success) {
      const orders = response.data.data.orders || [];
      logSuccess(`Found ${orders.length} open position(s)`);
      if (orders.length > 0) {
        logData('Open Positions', orders);
      }
      return orders;
    } else {
      logError(`Failed to get positions: ${response.data.error}`);
      return [];
    }
  } catch (error) {
    logError(`Error getting positions: ${error.message}`);
    if (error.response) {
      logData('Error Response', error.response.data);
    }
    return [];
  }
}

async function testCloseOrder(ticket) {
  log('🔍', `Closing order #${ticket}...`);
  try {
    const response = await client.post('/api/v1/orders/close', {
      ticket: ticket
    });

    if (response.data.success) {
      logSuccess('Order closed successfully!');
      logData('Closed Order', response.data.data);
      return response.data.data;
    } else {
      logError(`Failed to close order: ${response.data.error}`);
      logData('Error Response', response.data);
      return null;
    }
  } catch (error) {
    logError(`Error closing order: ${error.message}`);
    if (error.response) {
      logData('Error Response', error.response.data);
    }
    return null;
  }
}

// Main test flow
async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('         MT4 Order Flow Test');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Bridge URL: ${BRIDGE_URL}`);
  console.log(`Test Symbol: ${SYMBOL}`);
  console.log(`Test Volume: ${VOLUME}`);
  console.log('═══════════════════════════════════════════════════════\n');

  let testsPassed = 0;
  let testsFailed = 0;
  let orderTicket = null;

  // Test 1: Ping
  if (await testPing()) {
    testsPassed++;
  } else {
    testsFailed++;
    console.log('\n❌ Cannot continue without bridge connection');
    return;
  }
  console.log('');

  // Test 2: Account Info
  const accountInfo = await testAccountInfo();
  if (accountInfo) {
    testsPassed++;
  } else {
    testsFailed++;
  }
  console.log('');

  // Test 3: Get Price
  const priceInfo = await testGetPrice(SYMBOL);
  if (priceInfo) {
    testsPassed++;
  } else {
    testsFailed++;
  }
  console.log('');

  // Test 4: Open Order
  const order = await testOpenOrder(SYMBOL, 'BUY', VOLUME);
  if (order && order.ticket) {
    testsPassed++;
    orderTicket = order.ticket;
  } else {
    testsFailed++;
    logInfo('Skipping remaining tests due to order creation failure');
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`Test Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('═══════════════════════════════════════════════════════');
    return;
  }
  console.log('');

  // Wait a moment for order to settle
  logInfo('Waiting 2 seconds for order to settle...');
  await sleep(2000);
  console.log('');

  // Test 5: Get Open Positions
  const positions = await testGetOpenPositions();
  if (positions && positions.length > 0) {
    testsPassed++;

    // Find our order
    const ourOrder = positions.find(p => p.ticket === orderTicket);
    if (ourOrder) {
      logSuccess(`Found our order #${orderTicket} in open positions`);
    } else {
      logError(`Our order #${orderTicket} not found in open positions`);
    }
  } else {
    testsFailed++;
  }
  console.log('');

  // Test 6: Close Order
  if (orderTicket) {
    const closedOrder = await testCloseOrder(orderTicket);
    if (closedOrder) {
      testsPassed++;
    } else {
      testsFailed++;
    }
    console.log('');

    // Verify it's closed
    logInfo('Verifying order is closed...');
    await sleep(2000);
    const remainingPositions = await testGetOpenPositions();
    const stillOpen = remainingPositions.find(p => p.ticket === orderTicket);
    if (!stillOpen) {
      logSuccess(`Order #${orderTicket} confirmed closed`);
    } else {
      logError(`Order #${orderTicket} still appears to be open!`);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                   Test Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log('═══════════════════════════════════════════════════════');

  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! MT4 order flow is working correctly.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above for details.\n');
  }
}

// Run the tests
runTests().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
