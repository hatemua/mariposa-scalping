#!/usr/bin/env node

/**
 * Simple MT4 Order Test Script
 *
 * Opens and closes an order to test MT4 connectivity.
 *
 * Usage: node test-simple-order.js [symbol] [side] [volume]
 * Example: node test-simple-order.js BTCUSDm BUY 0.05
 */

require('dotenv').config();

const axios = require('axios');

const BRIDGE_URL = process.env.MT4_BRIDGE_URL || 'http://localhost:8080';
const AUTH = {
  username: process.env.MT4_BRIDGE_USERNAME || 'admin',
  password: process.env.MT4_BRIDGE_PASSWORD || 'changeme123'
};

const client = axios.create({
  baseURL: BRIDGE_URL,
  timeout: 30000,
  auth: AUTH
});

async function checkBridge() {
  console.log('Checking bridge connection...');
  try {
    const res = await client.get('/api/v1/ping', { timeout: 5000 });
    console.log('Bridge status:', res.data);
    if (!res.data.zmq_connected) {
      console.log('WARNING: ZMQ not connected to MT4 terminal!');
      return false;
    }
    return true;
  } catch (e) {
    console.log('Bridge not reachable:', e.message);
    return false;
  }
}

async function main() {
  const symbol = process.argv[2] || 'BTCUSDm';
  const side = (process.argv[3] || 'BUY').toUpperCase();
  const volume = parseFloat(process.argv[4] || '0.05');

  console.log('\n=== Simple MT4 Order Test ===');
  console.log(`Bridge: ${BRIDGE_URL}`);
  console.log(`Auth: ${AUTH.username}:****`);
  console.log(`Symbol: ${symbol}, Side: ${side}, Volume: ${volume}\n`);

  // Check bridge first
  const bridgeOk = await checkBridge();
  if (!bridgeOk) {
    console.log('\nBridge check failed. Ensure:');
    console.log('1. MT4 bridge server is running');
    console.log('2. MT4 terminal with EA is connected');
    return;
  }

  // Step 1: Open order
  console.log('\nOpening order...');
  try {
    const openRes = await client.post('/api/v1/orders', {
      symbol,
      side,
      volume,
      stopLoss: 0,
      takeProfit: 0,
      comment: 'Simple test order'
    });

    if (!openRes.data.success) {
      console.log('Failed to open order:', openRes.data.error);
      return;
    }

    const ticket = openRes.data.data.ticket;
    const openPrice = openRes.data.data.openPrice;
    console.log(`Order OPENED! Ticket: ${ticket}, Price: ${openPrice}`);
    console.log('Order details:', JSON.stringify(openRes.data.data, null, 2));

    // Step 2: Wait
    console.log('\nWaiting 3 seconds before closing...');
    await new Promise(r => setTimeout(r, 3000));

    // Step 3: Close order
    console.log(`Closing order #${ticket}...`);
    const closeRes = await client.post('/api/v1/orders/close', { ticket });

    if (!closeRes.data.success) {
      console.log('Failed to close order:', closeRes.data.error);
      return;
    }

    const closePrice = closeRes.data.data.closePrice;
    const profit = closeRes.data.data.profit;
    console.log(`Order CLOSED! Price: ${closePrice}, Profit: ${profit}`);
    console.log('Close details:', JSON.stringify(closeRes.data.data, null, 2));

    console.log('\n=== Test Complete ===\n');

  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.log('TIMEOUT: Request timed out after 30s');
      console.log('This usually means MT4 EA is not responding.');
      console.log('Check MT4 terminal and EA status.');
    } else if (error.response) {
      console.log('API Error:', error.response.status, error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.log('Connection refused. Is the MT4 bridge running?');
    } else {
      console.log('Error:', error.message);
    }
  }
}

main();
