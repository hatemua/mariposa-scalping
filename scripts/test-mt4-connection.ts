/**
 * MT4 Connection Test Script
 * Usage: npx ts-node scripts/test-mt4-connection.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BRIDGE_URL = process.env.MT4_BRIDGE_URL || 'http://localhost:8080';
const USERNAME = process.env.MT4_BRIDGE_USERNAME || 'admin';
const PASSWORD = process.env.MT4_BRIDGE_PASSWORD || 'changeme123';

// Create basic auth header
const authHeader = 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>) {
  console.log(`\n🧪 Running: ${name}`);
  try {
    await testFn();
    results.push({
      test: name,
      passed: true,
      message: 'Success'
    });
    console.log('✅ PASSED');
  } catch (error: any) {
    results.push({
      test: name,
      passed: false,
      message: error.message || 'Unknown error'
    });
    console.log(`❌ FAILED: ${error.message}`);
  }
}

async function testPing() {
  const response = await axios.get(`${BRIDGE_URL}/api/v1/ping`, {
    timeout: 5000
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  console.log('Response:', response.data);
}

async function testAccountInfo() {
  const response = await axios.get(`${BRIDGE_URL}/api/v1/account/info`, {
    headers: {
      Authorization: authHeader
    },
    timeout: 10000
  });

  if (!response.data || response.data.error) {
    throw new Error(response.data?.error || 'No data returned');
  }

  console.log('Account Balance:', response.data.balance);
  console.log('Account Equity:', response.data.equity);
  console.log('Account Currency:', response.data.currency);
}

async function testSymbols() {
  const response = await axios.get(`${BRIDGE_URL}/api/v1/symbols`, {
    headers: {
      Authorization: authHeader
    },
    timeout: 10000
  });

  if (!response.data || response.data.error) {
    throw new Error(response.data?.error || 'No data returned');
  }

  const symbols = response.data.symbols || [];
  console.log(`Found ${symbols.length} symbols`);
  console.log('Sample symbols:', symbols.slice(0, 5));
}

async function testPrice() {
  const symbol = 'BTCUSD'; // Bitcoin - available on most crypto brokers

  const response = await axios.get(`${BRIDGE_URL}/api/v1/price/${symbol}`, {
    headers: {
      Authorization: authHeader
    },
    timeout: 10000
  });

  if (!response.data || response.data.error) {
    throw new Error(response.data?.error || 'No data returned');
  }

  console.log(`${symbol} Bid:`, response.data.bid);
  console.log(`${symbol} Ask:`, response.data.ask);
  console.log(`${symbol} Spread:`, response.data.spread);
}

async function testOpenPositions() {
  const response = await axios.get(`${BRIDGE_URL}/api/v1/orders/open`, {
    headers: {
      Authorization: authHeader
    },
    timeout: 10000
  });

  if (!response.data || response.data.error) {
    throw new Error(response.data?.error || 'No data returned');
  }

  const orders = response.data.orders || [];
  console.log(`Found ${orders.length} open positions`);

  if (orders.length > 0) {
    console.log('Sample position:', orders[0]);
  }
}

async function testInvalidAuth() {
  try {
    await axios.get(`${BRIDGE_URL}/api/v1/account/info`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from('wrong:credentials').toString('base64')
      },
      timeout: 5000
    });
    throw new Error('Should have failed with 401');
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.log('Correctly rejected invalid credentials');
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('MT4 BRIDGE CONNECTION TEST');
  console.log('='.repeat(60));
  console.log(`Bridge URL: ${BRIDGE_URL}`);
  console.log(`Username: ${USERNAME}`);
  console.log('='.repeat(60));

  // Run all tests
  await runTest('1. Ping (Health Check)', testPing);
  await runTest('2. Authentication Test (Invalid)', testInvalidAuth);
  await runTest('3. Get Account Info', testAccountInfo);
  await runTest('4. Get Available Symbols', testSymbols);
  await runTest('5. Get Price (BTCUSD)', testPrice);
  await runTest('6. Get Open Positions', testOpenPositions);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.test}: ${result.message}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));

  if (failed === 0) {
    console.log('\n🎉 All tests passed! MT4 bridge is working correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the bridge configuration.');
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  console.error('\nTroubleshooting:');
  console.error('1. Make sure MT4 bridge server is running (docker-compose up)');
  console.error('2. Check MT4 terminal is connected and logged in');
  console.error('3. Verify MT4Bridge.mq4 EA is attached to a chart');
  console.error('4. Check firewall/network settings');
  console.error(`5. Verify bridge URL: ${BRIDGE_URL}`);
  process.exit(1);
});
