/**
 * WEEX API Calls - Standalone Script (Multi-Coin Support)
 *
 * All working WEEX Contract/Futures API calls in one file.
 * Supports: BTC, ETH, SOL, DOGE
 *
 * Usage:
 *   npx ts-node scripts/weex-api-calls.ts                       # Show help
 *   npx ts-node scripts/weex-api-calls.ts ticker [coin]         # Get price (default: btc)
 *   npx ts-node scripts/weex-api-calls.ts balance               # Get account balance
 *   npx ts-node scripts/weex-api-calls.ts positions             # List all open positions
 *   npx ts-node scripts/weex-api-calls.ts history               # Get order history
 *   npx ts-node scripts/weex-api-calls.ts close-long btc 0.001  # Close BTC long
 *   npx ts-node scripts/weex-api-calls.ts close-all             # Close ALL positions
 */

import * as dotenv from 'dotenv';
dotenv.config();

import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

// =============================================================================
// CONFIGURATION
// =============================================================================
const API_BASE_URL = 'https://api-contract.weex.com';

// Multi-coin symbols
const SYMBOLS: Record<string, string> = {
  btc: 'cmt_btcusdt',
  eth: 'cmt_ethusdt',
  sol: 'cmt_solusdt',
  doge: 'cmt_dogeusdt',
};

const DEFAULT_SYMBOL = SYMBOLS.btc;

// Helper to resolve coin name to symbol
function resolveSymbol(coin?: string): string {
  if (!coin) return DEFAULT_SYMBOL;
  const lower = coin.toLowerCase();
  if (SYMBOLS[lower]) return SYMBOLS[lower];
  // If already a full symbol, return as-is
  if (lower.startsWith('cmt_')) return lower;
  console.error(`Unknown coin: ${coin}. Available: ${Object.keys(SYMBOLS).join(', ')}`);
  process.exit(1);
}

// Helper to get coin name from symbol
function getCoinFromSymbol(symbol: string): string {
  for (const [coin, sym] of Object.entries(SYMBOLS)) {
    if (sym.toLowerCase() === symbol.toLowerCase()) return coin.toUpperCase();
  }
  return symbol;
}

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

interface Position {
  symbol: string;
  // New API field names
  id?: number | string;
  side?: string;              // "LONG" or "SHORT"
  size?: string;              // Position quantity
  unrealizePnl?: string;      // Unrealized P&L
  liquidatePrice?: string;    // Liquidation price
  // Legacy field names
  hold_side?: string;         // "1"=Long, "2"=Short
  hold_available?: string;    // Quantity
  hold_avg_price?: string;    // Entry price
  unrealized_pnl?: string;
  margin?: string;
  leverage?: string;
}

// Helper to normalize position field names
function normalizePosition(p: Position): {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  avgPrice: number;
  unrealizedPnl: number;
} {
  // Handle both new format (side/size) and legacy format (hold_side/hold_available)
  let side: 'LONG' | 'SHORT';
  if (p.side) {
    side = p.side.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
  } else if (p.hold_side) {
    side = p.hold_side === '1' ? 'LONG' : 'SHORT';
  } else {
    side = 'LONG'; // Default
  }

  const quantity = parseFloat(p.size || p.hold_available || '0');
  const avgPrice = parseFloat(p.hold_avg_price || '0');
  const unrealizedPnl = parseFloat(p.unrealizePnl || p.unrealized_pnl || '0');

  return { symbol: p.symbol, side, quantity, avgPrice, unrealizedPnl };
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
  async getTickerPrice(symbol: string = DEFAULT_SYMBOL): Promise<number> {
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
  async openLong(quantity: string, symbol: string = DEFAULT_SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '1', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 3b. OPEN SHORT (type=2)
  // ---------------------------------------------------------------------------
  async openShort(quantity: string, symbol: string = DEFAULT_SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '2', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 3c. CLOSE LONG (type=3) - Sell to close long position
  // ---------------------------------------------------------------------------
  async closeLong(quantity: string, symbol: string = DEFAULT_SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '3', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 3d. CLOSE SHORT (type=4) - Buy to close short position
  // ---------------------------------------------------------------------------
  async closeShort(quantity: string, symbol: string = DEFAULT_SYMBOL): Promise<OrderResponse> {
    return this.placeOrder(symbol, '4', quantity, true);
  }

  // ---------------------------------------------------------------------------
  // 3e. GET OPEN POSITIONS
  // ---------------------------------------------------------------------------
  // GET /capi/v2/account/position/allPosition
  async getOpenPositions(filterSymbol?: string): Promise<Position[]> {
    const path = '/capi/v2/account/position/allPosition';
    const headers = this.getHeaders('GET', path);

    console.log(`\n[API] GET ${path}`);

    const response = await this.client.get<Position[]>(path, { headers });

    let positions = response.data;

    if (!Array.isArray(positions)) {
      console.log('[RESULT] No positions found or invalid response');
      return [];
    }

    // Filter positions with actual holdings
    positions = positions.filter(p => {
      const qty = parseFloat(p.size || p.hold_available || '0');
      return qty > 0;
    });

    // Filter by symbol if requested
    if (filterSymbol) {
      positions = positions.filter(p => p.symbol.toLowerCase() === filterSymbol.toLowerCase());
    }

    if (positions.length === 0) {
      console.log('[RESULT] No open positions');
      return [];
    }

    console.log(`[RESULT] Found ${positions.length} open position(s):`);
    positions.forEach((p, i) => {
      const norm = normalizePosition(p);
      const coin = getCoinFromSymbol(p.symbol);
      const pnlStr = norm.unrealizedPnl >= 0 ? `+$${norm.unrealizedPnl.toFixed(2)}` : `-$${Math.abs(norm.unrealizedPnl).toFixed(2)}`;
      const pnlColor = norm.unrealizedPnl >= 0 ? '\x1b[32m' : '\x1b[31m';
      console.log(`  [${i + 1}] ${coin.padEnd(5)} | ${norm.side.padEnd(5)} | Size: ${norm.quantity.toString().padEnd(10)} | Entry: $${norm.avgPrice.toFixed(2)} | PnL: ${pnlColor}${pnlStr}\x1b[0m | Lev: ${p.leverage || 'N/A'}x`);
    });

    return positions;
  }

  // ---------------------------------------------------------------------------
  // 3f. CLOSE ALL POSITIONS
  // ---------------------------------------------------------------------------
  async closeAllPositions(): Promise<{ closed: number; errors: number }> {
    console.log('\n[CLOSE-ALL] Fetching all open positions...');

    const positions = await this.getOpenPositions();

    if (positions.length === 0) {
      console.log('[CLOSE-ALL] No positions to close');
      return { closed: 0, errors: 0 };
    }

    console.log(`\n[CLOSE-ALL] Closing ${positions.length} position(s)...`);

    let closed = 0;
    let errors = 0;

    for (const pos of positions) {
      const norm = normalizePosition(pos);
      const coin = getCoinFromSymbol(pos.symbol);

      try {
        console.log(`\n  Closing ${coin} ${norm.side} (${norm.quantity})...`);

        if (norm.side === 'LONG') {
          await this.closeLong(norm.quantity.toString(), pos.symbol);
        } else {
          await this.closeShort(norm.quantity.toString(), pos.symbol);
        }

        console.log(`  [OK] ${coin} ${norm.side} closed`);
        closed++;
      } catch (error: any) {
        console.error(`  [ERROR] Failed to close ${coin} ${norm.side}: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n[CLOSE-ALL] Complete: ${closed} closed, ${errors} errors`);
    return { closed, errors };
  }

  // ---------------------------------------------------------------------------
  // 4. GET ORDER DETAIL
  // ---------------------------------------------------------------------------
  // GET /capi/v2/order/detail?symbol=xxx&orderId=xxx
  async getOrderDetail(orderId: string, symbol: string = DEFAULT_SYMBOL): Promise<OrderDetail> {
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
WEEX API Calls - Multi-Coin Support
====================================
Supported coins: btc, eth, sol, doge

MARKET DATA:
  ticker [coin]           Get price (default: btc)
  ticker all              Get all coin prices

ACCOUNT:
  balance                 Get account balances
  positions               List all open positions
  history [limit]         Get order history (default: 20)

ORDERS:
  detail <orderId>        Get order details (requires symbol)
  detail-simple <id>      Get order details (orderId only)

TRADING (specify coin: btc, eth, sol, doge):
  open-long <coin> <qty>   Open long position
  open-short <coin> <qty>  Open short position
  close-long <coin> <qty>  Close long position
  close-short <coin> <qty> Close short position

CLOSE ALL:
  close-all               Close ALL open positions (all coins)

EXAMPLES:
  npx ts-node scripts/weex-api-calls.ts ticker              # BTC price
  npx ts-node scripts/weex-api-calls.ts ticker eth          # ETH price
  npx ts-node scripts/weex-api-calls.ts ticker all          # All prices
  npx ts-node scripts/weex-api-calls.ts positions           # List positions
  npx ts-node scripts/weex-api-calls.ts close-long btc 0.05 # Close BTC long
  npx ts-node scripts/weex-api-calls.ts close-all           # Close everything
`);
    return;
  }

  const api = new WeexAPI();

  try {
    switch (command) {
      case 'ticker':
      case 'price': {
        const coinArg = args[1]?.toLowerCase();
        if (coinArg === 'all') {
          // Get all coin prices
          console.log('\n=== All Coin Prices ===');
          for (const coin of Object.keys(SYMBOLS)) {
            await api.getTickerPrice(SYMBOLS[coin]);
          }
        } else {
          const symbol = resolveSymbol(coinArg);
          await api.getTickerPrice(symbol);
        }
        break;
      }

      case 'balance':
      case 'bal':
        await api.getBalance();
        break;

      case 'positions':
      case 'pos': {
        const posSymbol = args[1] ? resolveSymbol(args[1]) : undefined;
        await api.getOpenPositions(posSymbol);
        break;
      }

      case 'history':
      case 'orders': {
        const limit = parseInt(args[1] || '20', 10);
        await api.getOrderHistory(limit);
        break;
      }

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
      case 'long': {
        // Format: open-long <coin> <qty> OR open-long <qty> (defaults to btc)
        let coin: string, qty: string;
        if (args[2]) {
          coin = args[1];
          qty = args[2];
        } else {
          coin = 'btc';
          qty = args[1];
        }
        if (!qty) {
          console.error('Usage: open-long <coin> <quantity>');
          console.error('       open-long <quantity>  (defaults to btc)');
          process.exit(1);
        }
        const openLongSymbol = resolveSymbol(coin);
        await api.openLong(qty, openLongSymbol);
        break;
      }

      case 'open-short':
      case 'short': {
        let coin: string, qty: string;
        if (args[2]) {
          coin = args[1];
          qty = args[2];
        } else {
          coin = 'btc';
          qty = args[1];
        }
        if (!qty) {
          console.error('Usage: open-short <coin> <quantity>');
          console.error('       open-short <quantity>  (defaults to btc)');
          process.exit(1);
        }
        const openShortSymbol = resolveSymbol(coin);
        await api.openShort(qty, openShortSymbol);
        break;
      }

      case 'close-long': {
        let coin: string, qty: string;
        if (args[2]) {
          coin = args[1];
          qty = args[2];
        } else {
          coin = 'btc';
          qty = args[1];
        }
        if (!qty) {
          console.error('Usage: close-long <coin> <quantity>');
          console.error('       close-long <quantity>  (defaults to btc)');
          process.exit(1);
        }
        const closeLongSymbol = resolveSymbol(coin);
        await api.closeLong(qty, closeLongSymbol);
        break;
      }

      case 'close-short': {
        let coin: string, qty: string;
        if (args[2]) {
          coin = args[1];
          qty = args[2];
        } else {
          coin = 'btc';
          qty = args[1];
        }
        if (!qty) {
          console.error('Usage: close-short <coin> <quantity>');
          console.error('       close-short <quantity>  (defaults to btc)');
          process.exit(1);
        }
        const closeShortSymbol = resolveSymbol(coin);
        await api.closeShort(qty, closeShortSymbol);
        break;
      }

      case 'close-all':
        await api.closeAllPositions();
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
