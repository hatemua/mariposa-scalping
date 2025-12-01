#!/usr/bin/env node

/**
 * Direct MT4 Bridge API Test Script
 *
 * Calls the MT4 Bridge REST API directly to test buy/sell orders.
 * Does NOT use server.js or mt4Service - pure HTTP calls to the bridge.
 *
 * Usage:
 *   node test-direct-api.js [symbol] [side] [volume]
 *
 * Examples:
 *   node test-direct-api.js BTCUSDm BUY 0.05
 *   node test-direct-api.js BTCUSDm SELL 0.1
 *   node test-direct-api.js              # defaults: BTCUSDm BUY 0.05
 */

const http = require('http');

// Configuration - direct values, no dotenv needed
const BRIDGE_HOST = 'localhost';
const BRIDGE_PORT = 8080;
const USERNAME = 'admin';
const PASSWORD = 'changeme123';

// Base64 encode credentials for Basic Auth
const AUTH = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

// Parse command line arguments
const symbol = process.argv[2] || 'BTCUSDm';
const side = (process.argv[3] || 'BUY').toUpperCase();
const volume = parseFloat(process.argv[4] || '0.05');

console.log('\n========================================');
console.log('   MT4 Direct API Test');
console.log('========================================');
console.log(`Symbol: ${symbol}`);
console.log(`Side:   ${side}`);
console.log(`Volume: ${volume}`);
console.log(`Bridge: http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
console.log('========================================\n');

/**
 * Make HTTP request to bridge API
 */
function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BRIDGE_HOST,
      port: BRIDGE_PORT,
      path: path,
      method: method,
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60 second timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (60s)'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main test flow
 */
async function main() {
  try {
    // Step 1: Health check
    console.log('[1] Health Check...');
    const health = await apiRequest('GET', '/api/v1/ping');
    console.log(JSON.stringify(health.data, null, 2));

    if (!health.data.zmq_connected) {
      console.log('\nERROR: ZMQ not connected to MT4!');
      return;
    }
    console.log('');

    // Step 2: Open order
    console.log(`[2] Opening ${side} order for ${symbol} (${volume} lots)...`);
    const orderBody = {
      symbol: symbol,
      side: side,
      volume: volume,
      stopLoss: 0,
      takeProfit: 0,
      comment: 'Direct API test'
    };
    console.log('Request:', JSON.stringify(orderBody));

    const openResult = await apiRequest('POST', '/api/v1/orders', orderBody);
    console.log('Response:', JSON.stringify(openResult.data, null, 2));

    if (!openResult.data.success) {
      console.log('\nERROR: Failed to open order:', openResult.data.error);
      return;
    }

    const ticket = openResult.data.data.ticket;
    const openPrice = openResult.data.data.openPrice;
    console.log(`\nOrder OPENED! Ticket: ${ticket}, Price: ${openPrice}`);

    // Step 3: Wait
    console.log('\n[3] Waiting 5 seconds before closing...');
    await sleep(5000);

    // Step 4: Close order
    console.log(`\n[4] Closing order #${ticket}...`);
    const closeResult = await apiRequest('POST', '/api/v1/orders/close', { ticket });
    console.log('Response:', JSON.stringify(closeResult.data, null, 2));

    if (!closeResult.data.success) {
      console.log('\nERROR: Failed to close order:', closeResult.data.error);
      return;
    }

    console.log('\nOrder CLOSED!');

    // Summary
    console.log('\n========================================');
    console.log('   Test Complete');
    console.log('========================================');
    console.log(`Ticket: ${ticket}`);
    console.log(`Open:   ${openPrice}`);
    if (closeResult.data.data) {
      console.log(`Close:  ${closeResult.data.data.closePrice || 'N/A'}`);
      console.log(`Profit: ${closeResult.data.data.profit || 'N/A'}`);
    }
    console.log('========================================\n');

  } catch (error) {
    console.log('\nERROR:', error.message);
    if (error.message.includes('timeout')) {
      console.log('\nThe request timed out. This means:');
      console.log('1. MT4 Bridge received the request');
      console.log('2. But MT4 EA is not responding via ZMQ');
      console.log('\nCheck MT4 terminal via VNC (localhost:5900)');
      console.log('- Is MT4 running?');
      console.log('- Is EA showing smiley face?');
      console.log('- Is AutoTrading enabled (green)?');
    }
  }
}

main();
