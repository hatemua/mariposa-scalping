/**
 * Close All Weex Positions Script
 *
 * Closes all open WEEX futures positions immediately.
 *
 * Usage:
 *   npx ts-node scripts/close-all-orders.ts              # Close all positions
 *   npx ts-node scripts/close-all-orders.ts --dry-run    # Preview only (no close)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { weexService, WeexPositionResponse } from '../src/services/weexService';

// =============================================================================
// CONFIGURATION
// =============================================================================
const SYMBOL = 'cmt_btcusdt';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '--dryrun') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npx ts-node scripts/close-all-orders.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --dry-run     Preview positions without closing');
      console.log('  --help, -h    Show this help message');
      process.exit(0);
    }
  }

  return { dryRun };
}

function getSideLabel(holdSide: string): string {
  return holdSide === '1' ? 'LONG' : holdSide === '2' ? 'SHORT' : 'UNKNOWN';
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

async function main() {
  const { dryRun } = parseArgs();

  console.log('');
  console.log('================================================================');
  console.log('        CLOSE ALL WEEX POSITIONS');
  console.log('================================================================');
  console.log(`  Symbol:       ${SYMBOL}`);
  console.log(`  Mode:         ${dryRun ? 'DRY RUN (preview only)' : 'LIVE (will close positions)'}`);
  console.log('================================================================');
  console.log('');

  // Check credentials
  const apiKey = process.env.WEEX_API_KEY || '';
  const secretKey = process.env.WEEX_SECRET_KEY || '';
  const passphrase = process.env.WEEX_PASSPHRASE || '';

  if (!apiKey || !secretKey || !passphrase) {
    console.error('ERROR: Missing WEEX credentials in .env file');
    console.error('Required: WEEX_API_KEY, WEEX_SECRET_KEY, WEEX_PASSPHRASE');
    process.exit(1);
  }

  try {
    // =========================================================================
    // STEP 1: Fetch Current Position using weexService
    // =========================================================================
    console.log('[STEP 1] Fetching current position...');

    const position = await weexService.getPosition(SYMBOL);

    if (!position) {
      console.log('');
      console.log('  No open positions found.');
      console.log('');
      console.log('================================================================');
      console.log('                 NO POSITIONS TO CLOSE');
      console.log('================================================================');
      console.log('');
      process.exit(0);
    }

    // =========================================================================
    // STEP 2: Display Position Details
    // =========================================================================
    console.log('');
    console.log('[STEP 2] Current position:');
    console.log(`  Symbol:       ${position.symbol || SYMBOL}`);
    console.log(`  Side:         ${getSideLabel(position.hold_side)}`);
    console.log(`  Size:         ${position.hold_available} BTC`);
    console.log(`  Entry Price:  $${parseFloat(position.hold_avg_price || '0').toLocaleString()}`);
    console.log(`  Unrealized:   ${parseFloat(position.unrealized_pnl || '0') >= 0 ? '+' : ''}${parseFloat(position.unrealized_pnl || '0').toFixed(4)} USDT`);
    console.log(`  Margin:       ${position.margin || 'N/A'} USDT`);
    console.log(`  Leverage:     ${position.leverage || 'N/A'}x`);
    console.log('');

    if (dryRun) {
      console.log('================================================================');
      console.log('              DRY RUN - NO ACTION TAKEN');
      console.log('================================================================');
      console.log('');
      console.log('  To close this position, run without --dry-run flag:');
      console.log('  npx ts-node scripts/close-all-orders.ts');
      console.log('');
      process.exit(0);
    }

    // =========================================================================
    // STEP 3: Close Position using weexService
    // =========================================================================
    console.log('[STEP 3] Closing position...');

    const side: 'LONG' | 'SHORT' = position.hold_side === '1' ? 'LONG' : 'SHORT';
    const quantity = position.hold_available;

    console.log(`  Action:       Close ${side} (${side === 'LONG' ? 'sell' : 'buy'})`);
    console.log(`  Quantity:     ${quantity} BTC`);
    console.log('');

    const result = await weexService.closePosition(SYMBOL, side, quantity);

    if (!result.success) {
      throw new Error(result.error || 'Unknown error closing position');
    }

    console.log(`  Order ID:     ${result.orderId}`);
    console.log(`  Client ID:    ${result.clientOrderId}`);
    console.log('');

    // =========================================================================
    // STEP 4: Display Results
    // =========================================================================
    console.log('[STEP 4] Close result:');
    if (result.fillPrice) {
      console.log(`  Fill Price:   $${result.fillPrice.toLocaleString()}`);
    }
    if (result.realizedPnl !== undefined) {
      console.log(`  Realized PnL: ${result.realizedPnl >= 0 ? '+' : ''}${result.realizedPnl.toFixed(4)} USDT`);
    }
    console.log('');

    // =========================================================================
    // SUCCESS
    // =========================================================================
    console.log('================================================================');
    console.log('              POSITION CLOSED SUCCESSFULLY');
    console.log('================================================================');
    console.log(`  Order ID:     ${result.orderId}`);
    console.log(`  Side:         ${side}`);
    console.log(`  Size:         ${quantity} BTC`);
    if (result.fillPrice) {
      console.log(`  Close Price:  $${result.fillPrice.toLocaleString()}`);
    }
    if (result.realizedPnl !== undefined) {
      console.log(`  Realized PnL: ${result.realizedPnl >= 0 ? '+' : ''}${result.realizedPnl.toFixed(4)} USDT`);
    }
    console.log('================================================================');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('================================================================');
    console.error('                 CLOSE FAILED');
    console.error('================================================================');
    console.error(`  Error: ${error.message}`);

    if (error.response?.data) {
      console.error('  API Response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error(`  HTTP Status: ${error.response.status}`);
    }
    console.error('================================================================');
    process.exit(1);
  }
}

main();
