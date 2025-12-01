#!/usr/bin/env node

/**
 * MT4 Trading Diagnostics Script
 *
 * Runs comprehensive diagnostic checks on MT4 trading permissions
 * and identifies exactly why orders might be failing.
 *
 * Usage: node diagnose-mt4.js [symbol]
 * Example: node diagnose-mt4.js BTCUSDm
 */

const axios = require('axios');

// Configuration
const BRIDGE_URL = process.env.MT4_BRIDGE_URL || 'http://localhost:8080';
const BRIDGE_USERNAME = process.env.MT4_BRIDGE_USERNAME || 'admin';
const BRIDGE_PASSWORD = process.env.MT4_BRIDGE_PASSWORD || 'changeme123';

// Symbol from command line
const SYMBOL = process.argv[2] || '';

// Create axios client with auth
const client = axios.create({
  baseURL: BRIDGE_URL,
  timeout: 10000,
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

function logWarning(message) {
  log('⚠️ ', message);
}

function logInfo(message) {
  log('ℹ️ ', message);
}

async function runDiagnostics() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('         MT4 Trading Diagnostics');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Bridge URL: ${BRIDGE_URL}`);
  if (SYMBOL) {
    console.log(`Symbol: ${SYMBOL}`);
  }
  console.log('═══════════════════════════════════════════════════════\n');

  // Step 1: Test bridge connection
  log('🔍', 'Testing bridge connection...');
  try {
    const pingResponse = await client.get('/api/v1/ping');

    if (pingResponse.data.status === 'ok') {
      logSuccess('Bridge is online');

      if (pingResponse.data.zmq_connected) {
        logSuccess('ZeroMQ connected to MT4');
      } else {
        logError('ZeroMQ NOT connected to MT4');
        console.log('\n⚠️  Cannot run diagnostics without ZeroMQ connection.');
        console.log('   Check that MT4Bridge EA is running on the chart.\n');
        return;
      }
    }
  } catch (error) {
    logError(`Failed to connect to bridge: ${error.message}`);
    console.log('\n⚠️  Bridge is not responding. Check:');
    console.log('   1. MT4 bridge server is running (docker ps)');
    console.log('   2. Bridge URL is correct: ' + BRIDGE_URL);
    console.log('   3. Credentials are correct\n');
    return;
  }

  console.log('');

  // Step 2: Run comprehensive diagnostics
  log('🔍', 'Running comprehensive trading diagnostics...\n');

  try {
    const endpoint = SYMBOL ? `/api/v1/diagnose/${SYMBOL}` : '/api/v1/diagnose';
    const diagResponse = await client.get(endpoint);

    if (diagResponse.data.error) {
      logError('Diagnostic request failed: ' + diagResponse.data.error);
      return;
    }

    const { diagnostics, canTrade } = diagResponse.data.data;

    // Print the diagnostics
    console.log('─────────────────────────────────────────────────────');
    console.log(diagnostics);
    console.log('─────────────────────────────────────────────────────\n');

    // Summary
    if (canTrade) {
      console.log('');
      logSuccess('ALL CHECKS PASSED - MT4 IS READY TO TRADE!');
      console.log('\n✨ Your MT4 is properly configured.');
      console.log('   You can now execute orders successfully.\n');
    } else {
      console.log('');
      logError('TRADING NOT READY - CONFIGURATION REQUIRED');
      console.log('\n📋 Follow the FIX REQUIRED instructions above.');
      console.log('   After making changes, run this script again to verify.\n');
    }

    // Additional recommendations
    if (!canTrade) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('           Quick Fix Checklist');
      console.log('═══════════════════════════════════════════════════════');
      console.log('\n1. In MT4, go to: Tools → Options → Expert Advisors');
      console.log('   ✓ Check "Allow automated trading"');
      console.log('   ✓ Check "Allow DLL imports" (CRITICAL!)');
      console.log('   ✓ Click OK\n');
      console.log('2. Right-click the chart with MT4Bridge EA');
      console.log('   → Expert Advisors → Properties (or press F7)');
      console.log('   → Common tab');
      console.log('   ✓ Check "Allow live trading"');
      console.log('   ✓ Check "Allow DLL imports"');
      console.log('   ✓ Click OK\n');
      console.log('3. Check the AutoTrading button in MT4 toolbar');
      console.log('   → Should be GREEN (not red)\n');
      console.log('4. Restart this diagnostic to verify fixes\n');
      console.log('═══════════════════════════════════════════════════════\n');
    }

  } catch (error) {
    logError('Diagnostic request failed: ' + error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('\n⚠️  This may indicate the DIAGNOSE command is not');
    console.log('   available in your MT4Bridge EA version.\n');
  }
}

// Run diagnostics
runDiagnostics().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
