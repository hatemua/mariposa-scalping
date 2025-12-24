/**
 * WEEX Futures Order History Script
 *
 * Fetches your FUTURES/CONTRACT order history from WEEX
 *
 * Usage:
 *   npx ts-node scripts/weex-order-history.ts              # Last 20 orders
 *   npx ts-node scripts/weex-order-history.ts --limit 50   # Last 50 orders
 *   npx ts-node scripts/weex-order-history.ts --days 7     # Orders from last 7 days
 */

import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import * as crypto from 'crypto';

// =============================================================================
// CONFIGURATION
// =============================================================================
const API_BASE_URL = 'https://api-contract.weex.com';
const SYMBOL = 'cmt_btcusdt';

// =============================================================================
// TYPES
// =============================================================================
interface OrderHistoryItem {
  symbol: string;
  size: string;
  client_oid: string;
  createTime: string;
  filled_qty: string;
  fee: string;
  order_id: string;
  price: string;
  price_avg: string;
  status: string;
  type: string;
  order_type: string;
  totalProfits: string;
  contracts: number;
  filledQtyContracts: number;
  presetTakeProfitPrice: string | null;
  presetStopLossPrice: string | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function parseArgs(): { limit: number; days: number } {
  const args = process.argv.slice(2);
  let limit = 20;
  let days = 90; // Max allowed by API

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      days = Math.min(parseInt(args[i + 1], 10), 90); // Max 90 days
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: npx ts-node scripts/weex-order-history.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --limit <n>   Number of orders to fetch (default: 20)');
      console.log('  --days <n>    Fetch orders from last N days (max: 90)');
      console.log('  --help, -h    Show this help message');
      process.exit(0);
    }
  }

  return { limit, days };
}

function createSignature(secretKey: string, timestamp: string, method: string, path: string, body: string): string {
  const message = timestamp + method + path + body;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function formatDate(timestamp: string): string {
  const date = new Date(parseInt(timestamp, 10));
  return date.toLocaleString();
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  return num > 0 ? `$${num.toLocaleString()}` : '-';
}

function getTypeEmoji(type: string): string {
  switch (type) {
    case 'open_long': return 'LONG';
    case 'open_short': return 'SHORT';
    case 'close_long': return 'CLOSE LONG';
    case 'close_short': return 'CLOSE SHORT';
    default: return type.toUpperCase();
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'filled': return 'FILLED';
    case 'canceled': return 'CANCELED';
    case 'pending': return 'PENDING';
    case 'open': return 'OPEN';
    default: return status.toUpperCase();
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

async function main() {
  const { limit, days } = parseArgs();

  console.log('');
  console.log('================================================================');
  console.log('        WEEX FUTURES ORDER HISTORY');
  console.log('================================================================');
  console.log(`  API:          ${API_BASE_URL}`);
  console.log(`  Product:      USDT-FUTURES`);
  console.log(`  Limit:        ${limit} orders`);
  console.log('================================================================');
  console.log('');

  // Check credentials
  const apiKey = process.env.WEEX_API_KEY || '';
  const secretKey = process.env.WEEX_SECRET_KEY || '';
  const passphrase = process.env.WEEX_PASSPHRASE || '';

  if (!apiKey || !secretKey || !passphrase) {
    console.error('ERROR: Missing WEEX credentials in .env file');
    process.exit(1);
  }

  try {
    // Build request - productType is required
    // Note: createDate param seems to break the request, so we skip it
    const timestamp = Date.now().toString();
    const params = new URLSearchParams({
      productType: 'USDT-FUTURES',  // Required for history endpoint
      pageSize: limit.toString(),
    });

    const path = `/capi/v2/order/history?${params.toString()}`;
    const signature = createSignature(secretKey, timestamp, 'GET', path, '');

    console.log('Fetching order history...');
    console.log(`Endpoint: GET ${API_BASE_URL}${path}`);
    console.log('');

    const response = await axios.get<OrderHistoryItem[]>(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'ACCESS-KEY': apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-PASSPHRASE': passphrase,
        'ACCESS-TIMESTAMP': timestamp,
        'locale': 'en-US',
      },
      timeout: 30000,
    });

    const orders = response.data;

    if (!orders || orders.length === 0) {
      console.log('No orders found in the specified time range.');
      console.log('');
      return;
    }

    console.log(`Found ${orders.length} orders:`);
    console.log('');
    console.log('================================================================');

    // Print each order
    orders.forEach((order, index) => {
      const typeLabel = getTypeEmoji(order.type);
      const statusLabel = getStatusEmoji(order.status);
      const fillPrice = formatPrice(order.price_avg);
      const fee = parseFloat(order.fee || '0').toFixed(6);
      const pnl = parseFloat(order.totalProfits || '0');
      const pnlStr = pnl !== 0 ? (pnl > 0 ? `+${pnl.toFixed(4)}` : pnl.toFixed(4)) : '0';

      console.log(`[${index + 1}] Order ID: ${order.order_id}`);
      console.log(`    Date:       ${formatDate(order.createTime)}`);
      console.log(`    Type:       ${typeLabel}`);
      console.log(`    Status:     ${statusLabel}`);
      console.log(`    Size:       ${order.filled_qty} BTC (${order.filledQtyContracts} contracts)`);
      console.log(`    Fill Price: ${fillPrice}`);
      console.log(`    Fee:        ${fee} USDT`);
      if (pnl !== 0) {
        console.log(`    PnL:        ${pnlStr} USDT`);
      }
      console.log('');
    });

    console.log('================================================================');

    // Summary statistics
    const filledOrders = orders.filter(o => o.status === 'filled');
    const totalFees = orders.reduce((sum, o) => sum + parseFloat(o.fee || '0'), 0);
    const totalPnL = orders.reduce((sum, o) => sum + parseFloat(o.totalProfits || '0'), 0);

    console.log('SUMMARY');
    console.log('================================================================');
    console.log(`  Total Orders:    ${orders.length}`);
    console.log(`  Filled Orders:   ${filledOrders.length}`);
    console.log(`  Total Fees:      ${totalFees.toFixed(6)} USDT`);
    console.log(`  Total PnL:       ${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(4)} USDT`);
    console.log('================================================================');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('================================================================');
    console.error('                 REQUEST FAILED');
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
