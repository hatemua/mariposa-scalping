/**
 * WEEX Futures Order Script with Clear Logging
 *
 * This script places FUTURES/CONTRACT orders (NOT spot orders!)
 *
 * Usage:
 *   npx ts-node scripts/weex-futures-order.ts --long 10      # Open 10 USDT long
 *   npx ts-node scripts/weex-futures-order.ts --short 10     # Open 10 USDT short
 *   npx ts-node scripts/weex-futures-order.ts --long 10 --dry-run  # Preview only
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { weexService } from '../src/services/weexService';

// =============================================================================
// CONFIGURATION
// =============================================================================
const SYMBOL = 'cmt_btcusdt';
const API_BASE_URL = 'https://api-contract.weex.com';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function printBanner() {
  console.log('');
  console.log('================================================================');
  console.log('        WEEX FUTURES ORDER (NOT SPOT!)');
  console.log('================================================================');
  console.log('  Market Type:    PERPETUAL CONTRACT');
  console.log('  API Base:       ' + API_BASE_URL);
  console.log('  Where to find:  WEEX App > Futures > Orders/Positions');
  console.log('================================================================');
  console.log('');
}

function printStep(step: number, total: number, title: string) {
  console.log(`[STEP ${step}/${total}] ${title}`);
}

function printSuccess(message: string) {
  console.log(`  Status:      OK - ${message}`);
}

function printError(message: string) {
  console.log(`  Status:      FAILED - ${message}`);
}

function printValue(label: string, value: string) {
  console.log(`  ${label.padEnd(12)} ${value}`);
}

function maskApiKey(key: string): string {
  if (!key || key.length < 10) return '****';
  return key.substring(0, 6) + '...' + key.substring(key.length - 4);
}

function parseArgs(): { direction: 'long' | 'short'; amount: number; dryRun: boolean } {
  const args = process.argv.slice(2);

  let direction: 'long' | 'short' = 'long';
  let amount = 10;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--long') {
      direction = 'long';
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        amount = parseFloat(args[i + 1]);
        i++;
      }
    } else if (arg === '--short') {
      direction = 'short';
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        amount = parseFloat(args[i + 1]);
        i++;
      }
    } else if (arg === '--amount') {
      if (args[i + 1]) {
        amount = parseFloat(args[i + 1]);
        i++;
      }
    } else if (arg === '--dry-run' || arg === '--dryrun') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npx ts-node scripts/weex-futures-order.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --long [amount]   Open LONG position (default: 10 USDT)');
      console.log('  --short [amount]  Open SHORT position');
      console.log('  --amount <value>  Specify notional value in USDT');
      console.log('  --dry-run         Preview order without executing');
      console.log('  --help, -h        Show this help message');
      console.log('');
      console.log('Examples:');
      console.log('  npx ts-node scripts/weex-futures-order.ts --long 10');
      console.log('  npx ts-node scripts/weex-futures-order.ts --short 20');
      console.log('  npx ts-node scripts/weex-futures-order.ts --long 10 --dry-run');
      process.exit(0);
    }
  }

  return { direction, amount, dryRun };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

async function main() {
  const { direction, amount, dryRun } = parseArgs();

  printBanner();

  if (dryRun) {
    console.log('  *** DRY RUN MODE - No order will be placed ***');
    console.log('');
  }

  const totalSteps = dryRun ? 4 : 5;

  try {
    // =========================================================================
    // STEP 1: Check Credentials
    // =========================================================================
    printStep(1, totalSteps, 'CHECKING CREDENTIALS');

    const apiKey = process.env.WEEX_API_KEY || '';
    const secretKey = process.env.WEEX_SECRET_KEY || '';
    const passphrase = process.env.WEEX_PASSPHRASE || '';

    printValue('API Key:', maskApiKey(apiKey));
    printValue('Secret:', secretKey ? '********' : 'MISSING!');
    printValue('Passphrase:', passphrase ? '****' : 'MISSING!');

    if (!apiKey || !secretKey || !passphrase) {
      printError('Missing credentials in .env file');
      console.log('');
      console.log('  Required environment variables:');
      console.log('    WEEX_API_KEY');
      console.log('    WEEX_SECRET_KEY');
      console.log('    WEEX_PASSPHRASE');
      process.exit(1);
    }

    printSuccess('All credentials loaded');
    console.log('');

    // =========================================================================
    // STEP 2: Fetch Current Price
    // =========================================================================
    printStep(2, totalSteps, 'FETCHING CURRENT PRICE');

    printValue('Endpoint:', `GET ${API_BASE_URL}/capi/v2/market/tickers`);
    printValue('Symbol:', SYMBOL);

    const currentPrice = await weexService.getTickerPrice(SYMBOL);

    printValue('Last Price:', `$${currentPrice.toLocaleString()}`);
    printSuccess('Price fetched');
    console.log('');

    // =========================================================================
    // STEP 3: Calculate Position
    // =========================================================================
    printStep(3, totalSteps, 'CALCULATING POSITION');

    const directionLabel = direction === 'long' ? 'LONG' : 'SHORT';
    const typeCode = direction === 'long' ? '1' : '2';
    const typeDescription = direction === 'long' ? 'Open Long' : 'Open Short';

    const quantity = (amount / currentPrice).toFixed(4);
    const estimatedValue = (parseFloat(quantity) * currentPrice).toFixed(2);

    printValue('Direction:', `${directionLabel} (type=${typeCode}: ${typeDescription})`);
    printValue('Notional:', `${amount.toFixed(2)} USDT`);
    printValue('Quantity:', `${quantity} BTC`);
    printValue('Est. Value:', `$${estimatedValue}`);
    console.log('');

    // =========================================================================
    // STEP 4: Place Order (or show preview)
    // =========================================================================
    printStep(4, totalSteps, dryRun ? 'ORDER PREVIEW (DRY RUN)' : 'PLACING ORDER');

    const clientOid = `weex_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const orderRequest = {
      symbol: SYMBOL,
      client_oid: clientOid,
      size: quantity,
      type: typeCode,           // 1=Open Long, 2=Open Short
      order_type: '0',          // 0=Normal
      match_price: '1',         // 1=Market
      price: '0',
    };

    printValue('Endpoint:', `POST ${API_BASE_URL}/capi/v2/order/placeOrder`);
    console.log('  Request Body:');
    console.log('  {');
    console.log(`    "symbol": "${orderRequest.symbol}",`);
    console.log(`    "client_oid": "${orderRequest.client_oid}",`);
    console.log(`    "size": "${orderRequest.size}",`);
    console.log(`    "type": "${orderRequest.type}",           // ${typeCode === '1' ? '1=Open Long' : '2=Open Short'}`);
    console.log(`    "order_type": "${orderRequest.order_type}",     // 0=Normal`);
    console.log(`    "match_price": "${orderRequest.match_price}",   // 1=Market`);
    console.log(`    "price": "${orderRequest.price}"`);
    console.log('  }');
    console.log('');

    if (dryRun) {
      console.log('  *** DRY RUN - Order NOT sent ***');
      printSuccess('Preview complete');
      console.log('');

      // Print summary for dry run
      console.log('================================================================');
      console.log('              DRY RUN COMPLETE');
      console.log('================================================================');
      console.log(`  Direction:    ${directionLabel}`);
      console.log(`  Quantity:     ${quantity} BTC`);
      console.log(`  Est. Price:   $${currentPrice.toLocaleString()}`);
      console.log(`  Est. Value:   $${estimatedValue} USDT`);
      console.log('');
      console.log('  To execute this order, run without --dry-run flag');
      console.log('================================================================');
      console.log('');
      return;
    }

    // Actually place the order
    const result = await weexService.placeOrder({
      symbol: SYMBOL,
      side: direction === 'long' ? 'buy' : 'sell',
      orderType: 'market',
      quantity,
      positionAction: 'open',
    });

    console.log('  Response:');
    console.log('  {');
    console.log(`    "order_id": ${result.data.orderId},`);
    console.log(`    "client_oid": "${result.data.clientOrderId}"`);
    console.log('  }');
    printSuccess('Order placed');
    console.log('');

    // =========================================================================
    // STEP 5: Verify Order Status
    // =========================================================================
    printStep(5, totalSteps, 'VERIFYING ORDER STATUS');

    const orderId = result.data.orderId.toString();
    printValue('Endpoint:', `GET ${API_BASE_URL}/capi/v2/order/detail?orderId=${orderId}`);
    printValue('Order ID:', orderId);

    // Wait a moment for order to be processed
    console.log('  Waiting for fill...');
    await sleep(1000);

    let orderStatus;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        orderStatus = await weexService.getOrderStatus(orderId, SYMBOL);

        // API uses snake_case: status, not state
        if (orderStatus.status === 'filled' || orderStatus.status === 'canceled') {
          break;
        }

        console.log(`  Status: ${orderStatus.status} (attempt ${attempts + 1}/${maxAttempts})`);
        await sleep(1000);
        attempts++;
      } catch (err: any) {
        console.log(`  Warning: Could not fetch status - ${err.message}`);
        attempts++;
        await sleep(1000);
      }
    }

    if (orderStatus) {
      // API uses snake_case: status, price_avg, filled_qty
      printValue('Status:', orderStatus.status?.toUpperCase() || 'UNKNOWN');
      printValue('Fill Price:', orderStatus.price_avg ? `$${parseFloat(orderStatus.price_avg).toLocaleString()}` : 'N/A');
      printValue('Fill Qty:', orderStatus.filled_qty || quantity);
      printValue('Fee:', orderStatus.fee ? `${orderStatus.fee} USDT` : 'N/A');
      printSuccess('Order verified');
    } else {
      console.log('  Warning: Could not verify order status');
      console.log('  Check WEEX App for order details');
    }
    console.log('');

    // =========================================================================
    // SUCCESS SUMMARY
    // =========================================================================
    console.log('================================================================');
    console.log('                 ORDER SUCCESSFUL!');
    console.log('================================================================');
    console.log(`  Order ID:     ${orderId}`);
    console.log(`  Client ID:    ${result.data.clientOrderId}`);
    console.log(`  Direction:    ${directionLabel}`);
    console.log(`  Quantity:     ${quantity} BTC`);
    if (orderStatus?.price_avg) {
      console.log(`  Fill Price:   $${parseFloat(orderStatus.price_avg).toLocaleString()}`);
    } else {
      console.log(`  Est. Price:   $${currentPrice.toLocaleString()}`);
    }
    console.log(`  Total Value:  ~$${estimatedValue} USDT`);
    console.log('');
    console.log('  WHERE TO FIND THIS ORDER:');
    console.log('  1. Open WEEX App or Web (weex.com)');
    console.log('  2. Go to "Futures" section (NOT Spot!)');
    console.log('  3. Click "Orders" > "Order History"');
    console.log('  4. Or check "Positions" for open position');
    console.log('================================================================');
    console.log('');

  } catch (error: any) {
    console.log('');
    console.log('================================================================');
    console.log('                 ORDER FAILED!');
    console.log('================================================================');
    console.log(`  Error: ${error.message}`);

    if (error.response?.data) {
      console.log('  API Response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.log(`  HTTP Status: ${error.response.status}`);
    }
    console.log('================================================================');
    console.log('');
    process.exit(1);
  }
}

main();
