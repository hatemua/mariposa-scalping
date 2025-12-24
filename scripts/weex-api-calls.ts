/**
 * WEEX API Calls - Standalone Script
 *
 * All working WEEX Contract/Futures API calls in one file.
 *
 * Usage:
 *   npx ts-node scripts/weex-api-calls.ts                  # Show help
 *   npx ts-node scripts/weex-api-calls.ts ticker           # Get BTC price
 *   npx ts-node scripts/weex-api-calls.ts balance          # Get account balance
 *   npx ts-node scripts/weex-api-calls.ts history          # Get order history
 *   npx ts-node scripts/weex-api-calls.ts detail <orderId> # Get order detail
 *   npx ts-node scripts/weex-api-calls.ts open-long 0.001  # Open long position
 *   npx ts-node scripts/weex-api-calls.ts close-long 0.001 # Close long (type=3)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

// =============================================================================
// CONFIGURATION
// =============================================================================
const API_BASE_URL = 'https://api-contract.weex.com';
const SYMBOL = 'cmt_btcusdt';

// =============================================================================
// TYPES
// =============================================================================

interface WeexContractTicker {
  symbol: string;
  last: string;
  best_ask: string;
  best_bid: string;
  high_24h: string;
  low_24h: string;
  volume_24h: string;
  markPrice: string;
  indexPrice: string;
}

interface BalanceItem {
  coinName: string;
  available: string;
  frozen: string;
}

interface OrderResponse {
  order_id: string;
  client_oid: string;
}

interface OrderDetail {
  symbol: string;
  size: string;
  order_id: string;
  client_oid: string;
  filled_qty: string;
  fee: string;
  price: string;
  price_avg: string;
  status: string;
  type: string;
  order_type: string;
  totalProfits: string;
  createTime: string;
}

// =============================================================================
// WEEX API CLASS
// =============================================================================

class WeexAPI {
  private apiKey: string;
  private secretKey: string;
  private passphrase: string;
  private client: AxiosInstance;

  constructor() {
    this.apiKey = process.env.WEEX_API_KEY || '';
    this.secretKey = process.env.WEEX_SECRET_KEY || '';
    this.passphrase = process.env.WEEX_PASSPHRASE || '';

    if (!this.apiKey || !this.secretKey || !this.passphrase) {
      console.error('ERROR: Missing WEEX credentials in .env');
      console.error('Required: WEEX_API_KEY, WEEX_SECRET_KEY, WEEX_PASSPHRASE');
      process.exit(1);
    }

    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'locale': 'en-US',
      },
    });
  }

  // ---------------------------------------------------------------------------
  // SIGNATURE
  // ---------------------------------------------------------------------------
  private sign(timestamp: string, method: string, path: string, body: string = ''): string {
    const message = timestamp + method + path + body;
    return crypto.createHmac('sha256', this.secretKey).update(message).digest('base64');
  }

  private getHeaders(method: string, path: string, body: string = ''): Record<string, string> {
    const timestamp = Date.now().toString();
    return {
      'ACCESS-KEY': this.apiKey,
      'ACCESS-SIGN': this.sign(timestamp, method, path, body),
      'ACCESS-PASSPHRASE': this.passphrase,
      'ACCESS-TIMESTAMP': timestamp,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. GET TICKER PRICE
  // ---------------------------------------------------------------------------
  // GET /capi/v2/market/tickers
  // No auth required
  async getTickerPrice(symbol: string = SYMBOL): Promise<number> {
    const path = '/capi/v2/market/tickers';

    console.log(`\n[API] GET ${path}`);

    const response = await this.client.get<WeexContractTicker[]>(path);

    if (Array.isArray(response.data)) {
      const ticker = response.data.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
      if (ticker) {
        const price = parseFloat(ticker.last);
        console.log(`[RESULT] ${symbol} = $${price.toLocaleString()}`);
        console.log(`         Mark: $${ticker.markPrice}, Index: $${ticker.indexPrice}`);
        return price;
      }
    }

    throw new Error(`Symbol ${symbol} not found`);
  }

  // ---------------------------------------------------------------------------
  // 2. GET ACCOUNT BALANCE
  // ---------------------------------------------------------------------------
  // GET /api/v2/spot/account/assets
  async getBalance(): Promise<BalanceItem[]> {
    const path = '/api/v2/spot/account/assets';
    const headers = this.getHeaders('GET', path);

    console.log(`\n[API] GET ${path}`);

    const response = await this.client.get<{ code: string; data: BalanceItem[] }>(path, { headers });

    if (response.data.code === '00000') {
      const balances = response.data.data.filter(b => parseFloat(b.available) > 0);
      console.log('[RESULT] Balances with funds:');
      balances.forEach(b => {
        console.log(`         ${b.coinName}: ${b.available} (frozen: ${b.frozen})`);
      });
      return balances;
    }

    throw new Error(`Failed to get balance: ${response.data.code}`);
  }

  // ---------------------------------------------------------------------------
  // 3. PLACE ORDER (generic)
  // ---------------------------------------------------------------------------
  // POST /capi/v2/order/placeOrder
  // type: 1=Open Long, 2=Open Short, 3=Close Long, 4=Close Short
  // match_price: 0=Limit, 1=Market
  // order_type: 0=Normal, 1=Post-Only, 2=FOK, 3=IOC
  private async placeOrder(
    symbol: string,
    type: '1' | '2' | '3' | '4',
    quantity: string,
    isMarket: boolean = true
  ): Promise<OrderResponse> {
    const path = '/capi/v2/order/placeOrder';

    const body = {
      symbol,
      client_oid: `weex_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      size: quantity,
      type,           // 1=Open Long, 2=Open Short, 3=Close Long, 4=Close Short
      order_type: '0', // Normal
      match_price: isMarket ? '1' : '0',
      price: '0',
    };

    const bodyStr = JSON.stringify(body);
    const headers = this.getHeaders('POST', path, bodyStr);

    const typeLabel = {
      '1': 'OPEN LONG',
      '2': 'OPEN SHORT',
      '3': 'CLOSE LONG',
      '4': 'CLOSE SHORT',
    }[type];

    console.log(`\n[API] POST ${path}`);
    console.log(`[BODY] ${typeLabel} ${quantity} ${symbol}`);

    const response = await this.client.post<OrderResponse>(path, body, { headers });

    if (response.data.order_id) {
      console.log(`[RESULT] Order ID: ${response.data.order_id}`);
      console.log(`         Client ID: ${response.data.client_oid}`);
      return response.data;
    }

    throw new Error(`Order failed: ${JSON.stringify(response.data)}`);
  }

  // ---------------------------------------------------------------------------
  // 3a. OPEN LONG (type=1)
  // ---------------------------------------------------------------------------
  async openLong(quantity: string, symbol: string = SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '1', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 3b. OPEN SHORT (type=2)
  // ---------------------------------------------------------------------------
  async openShort(quantity: string, symbol: string = SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '2', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 3c. CLOSE LONG (type=3) - Sell to close long position
  // ---------------------------------------------------------------------------
  async closeLong(quantity: string, symbol: string = SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '3', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 3d. CLOSE SHORT (type=4) - Buy to close short position
  // ---------------------------------------------------------------------------
  async closeShort(quantity: string, symbol: string = SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '4', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 4. GET ORDER DETAIL
  // ---------------------------------------------------------------------------
  // GET /capi/v2/order/detail?symbol=xxx&orderId=xxx
  async getOrderDetail(orderId: string, symbol: string = SYMBOL): Promise<OrderDetail> {
    const params = new URLSearchParams({ symbol, orderId });
    const path = `/capi/v2/order/detail?${params.toString()}`;
    const headers = this.getHeaders('GET', path);

    console.log(`\n[API] GET ${path}`);

    const response = await this.client.get<OrderDetail>(
      '/capi/v2/order/detail',
      { params: { symbol, orderId }, headers }
    );

    const order = response.data;

    if (order.order_id) {
      console.log(`[RESULT] Order ${order.order_id}`);
      console.log(`         Type: ${order.type}`);
      console.log(`         Status: ${order.status}`);
      console.log(`         Filled: ${order.filled_qty}`);
      console.log(`         Avg Price: $${order.price_avg}`);
      console.log(`         Fee: ${order.fee} USDT`);
      console.log(`         PnL: ${order.totalProfits} USDT`);
      return order;
    }

    throw new Error(`Order not found: ${orderId}`);
  }

  // ---------------------------------------------------------------------------
  // 4b. GET ORDER DETAIL (Simple - orderId only)
  // ---------------------------------------------------------------------------
  // GET /capi/v2/order/detail?orderId=xxx
  async getOrderDetailSimple(orderId: string): Promise<OrderDetail> {
    const path = `/capi/v2/order/detail?orderId=${orderId}`;
    const headers = this.getHeaders('GET', path);

    console.log(`\n[API] GET ${path}`);

    const response = await this.client.get<OrderDetail>(
      '/capi/v2/order/detail',
      { params: { orderId }, headers }
    );

    const order = response.data;

    if (order.order_id) {
      console.log(`[RESULT] Order ${order.order_id}`);
      console.log(`         Symbol: ${order.symbol}`);
      console.log(`         Type: ${order.type}`);
      console.log(`         Status: ${order.status}`);
      console.log(`         Size: ${order.size}`);
      console.log(`         Filled: ${order.filled_qty}`);
      console.log(`         Avg Price: $${order.price_avg}`);
      console.log(`         Fee: ${order.fee} USDT`);
      console.log(`         PnL: ${order.totalProfits} USDT`);
      return order;
    }

    throw new Error(`Order not found: ${orderId}`);
  }

  // ---------------------------------------------------------------------------
  // 5. GET ORDER HISTORY
  // ---------------------------------------------------------------------------
  // GET /capi/v2/order/history?productType=USDT-FUTURES&pageSize=xxx
  async getOrderHistory(limit: number = 20): Promise<OrderDetail[]> {
    const params = new URLSearchParams({
      productType: 'USDT-FUTURES',
      pageSize: limit.toString(),
    });
    const path = `/capi/v2/order/history?${params.toString()}`;
    const headers = this.getHeaders('GET', path);

    console.log(`\n[API] GET ${path}`);

    const response = await this.client.get<OrderDetail[]>(
      '/capi/v2/order/history',
      { params: { productType: 'USDT-FUTURES', pageSize: limit.toString() }, headers }
    );

    const orders = response.data;

    if (Array.isArray(orders)) {
      console.log(`[RESULT] Found ${orders.length} orders:`);
      orders.forEach((o, i) => {
        const pnl = parseFloat(o.totalProfits || '0');
        const pnlStr = pnl !== 0 ? (pnl > 0 ? `+${pnl.toFixed(4)}` : pnl.toFixed(4)) : '';
        console.log(`  [${i + 1}] ${o.order_id} | ${o.type.padEnd(12)} | ${o.status.padEnd(8)} | ${o.filled_qty} @ $${o.price_avg} ${pnlStr}`);
      });
      return orders;
    }

    throw new Error(`Failed to get order history`);
  }
}

// =============================================================================
// MAIN / CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(`
WEEX API Calls - Standalone Script
===================================

Commands:
  ticker              Get BTC/USDT price
  balance             Get account balances
  history [limit]     Get order history (default: 20)
  detail <orderId>    Get order details (requires symbol)
  detail-simple <id>  Get order details (orderId only)

  open-long <qty>     Open long position (type=1)
  open-short <qty>    Open short position (type=2)
  close-long <qty>    Close long position (type=3)
  close-short <qty>   Close short position (type=4)

Examples:
  npx ts-node scripts/weex-api-calls.ts ticker
  npx ts-node scripts/weex-api-calls.ts balance
  npx ts-node scripts/weex-api-calls.ts history 50
  npx ts-node scripts/weex-api-calls.ts detail 123456789
  npx ts-node scripts/weex-api-calls.ts detail-simple 123456789
  npx ts-node scripts/weex-api-calls.ts open-long 0.001
  npx ts-node scripts/weex-api-calls.ts close-long 0.001
`);
    return;
  }

  const api = new WeexAPI();

  try {
    switch (command) {
      case 'ticker':
      case 'price':
        await api.getTickerPrice();
        break;

      case 'balance':
      case 'bal':
        await api.getBalance();
        break;

      case 'history':
      case 'orders':
        const limit = parseInt(args[1] || '20', 10);
        await api.getOrderHistory(limit);
        break;

      case 'detail':
      case 'order':
        if (!args[1]) {
          console.error('Usage: detail <orderId>');
          process.exit(1);
        }
        await api.getOrderDetail(args[1]);
        break;

      case 'detail-simple':
      case 'ds':
        if (!args[1]) {
          console.error('Usage: detail-simple <orderId>');
          process.exit(1);
        }
        await api.getOrderDetailSimple(args[1]);
        break;

      case 'open-long':
      case 'long':
        if (!args[1]) {
          console.error('Usage: open-long <quantity>');
          process.exit(1);
        }
        await api.openLong(args[1]);
        break;

      case 'open-short':
      case 'short':
        if (!args[1]) {
          console.error('Usage: open-short <quantity>');
          process.exit(1);
        }
        await api.openShort(args[1]);
        break;

      case 'close-long':
        if (!args[1]) {
          console.error('Usage: close-long <quantity>');
          process.exit(1);
        }
        await api.closeLong(args[1]);
        break;

      case 'close-short':
        if (!args[1]) {
          console.error('Usage: close-short <quantity>');
          process.exit(1);
        }
        await api.closeShort(args[1]);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run with --help for usage');
        process.exit(1);
    }
  } catch (error: any) {
    console.error('\n[ERROR]', error.message);
    if (error.response?.data) {
      console.error('[API Response]', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error('[HTTP Status]', error.response.status);
    }
    process.exit(1);
  }
}

main();
