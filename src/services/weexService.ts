import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { config } from '../config/environment';

// WEEX API Configuration - Contract/Futures API
const WEEX_BASE_URL = 'https://api-contract.weex.com';

// Contract API Order Request
export interface WeexContractOrderRequest {
  symbol: string;           // e.g., "cmt_btcusdt"
  client_oid: string;       // Max 40 chars
  size: string;             // Quantity
  type: string;             // 1=Open long, 2=Open short, 3=Close long, 4=Close short
  order_type: string;       // 0=Normal, 1=Post-Only, 2=FOK, 3=IOC
  match_price: string;      // 0=Limit, 1=Market
  price: string;            // Required even for market orders
  presetTakeProfitPrice?: number;  // BigDecimal - must be number, not string
  presetStopLossPrice?: number;    // BigDecimal - must be number, not string
  marginMode?: number;      // 1=Cross (default), 3=Isolated
}

// Legacy spot interface (kept for reference)
export interface WeexOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  force: 'normal' | 'postOnly' | 'fok' | 'ioc';
  price?: string;
  quantity: string;
  clientOrderId: string;
}

export interface WeexOrderResponse {
  code: string;
  msg: string;
  requestTime: number;
  data: {
    orderId: number;
    clientOrderId: string;
    tpOrderId?: string;   // Take Profit order ID from preset TP/SL
    slOrderId?: string;   // Stop Loss order ID from preset TP/SL
  };
}

// Contract API Ticker Response (array of tickers)
export interface WeexContractTicker {
  symbol: string;
  last: string;           // Latest price
  best_ask: string;       // Ask price
  best_bid: string;       // Bid price
  high_24h: string;
  low_24h: string;
  volume_24h: string;
  timestamp: string;
  priceChangePercent: string;
  base_volume: string;
  markPrice: string;
  indexPrice: string;
}

// Legacy spot interface (kept for reference)
export interface WeexTickerResponse {
  code: string;
  msg: string;
  data: {
    symbol: string;
    lastPr: string;
    askPr: string;
    bidPr: string;
    high24h: string;
    low24h: string;
    ts: string;
  };
}

export interface WeexBalanceResponse {
  code: string;
  msg: string;
  data: Array<{
    coinName: string;
    available: string;
    frozen: string;
  }>;
}

// Order Detail Response (for checking order status)
// Note: WEEX API uses snake_case for field names
export interface WeexOrderDetailResponse {
  symbol: string;
  size: string;
  order_id: string;
  client_oid: string;
  filled_qty: string;
  fee: string;
  price: string;
  price_avg: string;       // Average fill price
  status: string;          // Order status: new, partially_filled, filled, canceled
  type: string;            // open_long, open_short, close_long, close_short
  order_type: string;      // ioc, gtc, etc.
  totalProfits: string;
  contracts: number;
  filledQtyContracts: number;
  presetTakeProfitPrice: string | null;
  presetStopLossPrice: string | null;
  createTime: string;
}

// Position response from GET /capi/v2/account/position/allPosition
// Note: WEEX API returns different field names than documented
export interface WeexPositionResponse {
  symbol: string;
  // New API field names (actual response)
  id?: number | string;
  side?: string;              // "LONG" or "SHORT"
  size?: string;              // Position quantity
  unrealizePnl?: string;      // Unrealized P&L
  liquidatePrice?: string;    // Liquidation price
  // Legacy field names (for backwards compatibility)
  hold_side?: string;         // "1"=Long, "2"=Short
  hold_available?: string;    // Quantity
  hold_avg_price?: string;    // Entry price
  unrealized_pnl?: string;
  margin?: string;
  leverage?: string;
}

// Helper to normalize WEEX position response field names
// Handles both new API format (side/size) and legacy format (hold_side/hold_available)
function normalizePosition(p: WeexPositionResponse): {
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  avgPrice: number;
  unrealizedPnl: number;
} {
  const sideRaw = p.side || p.hold_side || '';
  const side: 'LONG' | 'SHORT' =
    sideRaw === 'LONG' || sideRaw === '1' ? 'LONG' : 'SHORT';

  return {
    symbol: p.symbol,
    side,
    quantity: parseFloat(p.size || p.hold_available || '0'),
    avgPrice: parseFloat(p.hold_avg_price || '0'),
    unrealizedPnl: parseFloat(p.unrealizePnl || p.unrealized_pnl || '0'),
  };
}

// Contract account assets response from GET /capi/v2/account/assets
export interface WeexContractAsset {
  coinName: string;         // e.g., "USDT"
  available: string;        // Available balance
  frozen: string;           // Frozen/in-use balance
  equity: string;           // Total equity
  unrealizedPL: string;     // Unrealized P&L
  margin: string;           // Used margin
}

// Close position result
export interface ClosePositionResult {
  success: boolean;
  orderId?: number;
  clientOrderId?: string;
  side: 'LONG' | 'SHORT' | 'NONE';
  quantity: string;
  fillPrice?: number;
  realizedPnl?: number;
  error?: string;
}

class WeexService {
  private apiKey: string;
  private secretKey: string;
  private passphrase: string;
  private client: AxiosInstance;

  constructor() {
    this.apiKey = config.WEEX_API_KEY;
    this.secretKey = config.WEEX_SECRET_KEY;
    this.passphrase = config.WEEX_PASSPHRASE;

    this.client = axios.create({
      baseURL: WEEX_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'locale': 'en-US',
        'User-Agent': 'Mariposa-Trading/1.0.0',
      },
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 10,
        timeout: 30000,
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 10,
        timeout: 30000,
        rejectUnauthorized: true,
      }),
    });

    // Add request interceptor to sign all requests
    this.client.interceptors.request.use((requestConfig) => {
      const timestamp = Date.now().toString();
      const method = requestConfig.method?.toUpperCase() || 'GET';

      // Build path WITH query parameters for GET requests (required for signature)
      let path = requestConfig.url || '';
      if (requestConfig.params && Object.keys(requestConfig.params).length > 0) {
        const queryString = new URLSearchParams(requestConfig.params).toString();
        path = `${path}?${queryString}`;
      }

      const body = requestConfig.data ? JSON.stringify(requestConfig.data) : '';

      const signature = this.createSignature(timestamp, method, path, body);

      requestConfig.headers['ACCESS-KEY'] = this.apiKey;
      requestConfig.headers['ACCESS-SIGN'] = signature;
      requestConfig.headers['ACCESS-PASSPHRASE'] = this.passphrase;
      requestConfig.headers['ACCESS-TIMESTAMP'] = timestamp;

      console.log(`[WEEX] Request: ${method} ${path}`);
      console.log(`[WEEX] Timestamp: ${timestamp}`);
      console.log(`[WEEX] Body: ${body}`);

      return requestConfig;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[WEEX] Response: ${response.status} - ${JSON.stringify(response.data)}`);
        return response;
      },
      (error) => {
        console.error(`[WEEX] Error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
        throw error;
      }
    );
  }

  /**
   * Create HMAC-SHA256 signature for WEEX API
   * Message format: timestamp + method + path + body
   */
  private createSignature(timestamp: string, method: string, path: string, body: string): string {
    const message = timestamp + method + path + body;
    console.log(`[WEEX] Signature message: ${message}`);

    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(message)
      .digest('base64');

    return signature;
  }

  /**
   * Generate unique client order ID
   */
  private generateClientOrderId(): string {
    return `weex_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Retry wrapper for transient errors (521, 502, 503, 504, ECONNRESET, ETIMEDOUT)
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;
        const code = error.code;

        // Retry on transient errors
        const isRetryable =
          status === 521 || status === 502 || status === 503 || status === 504 ||
          code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`[WEEX] Retry ${attempt}/${maxRetries} after ${delay}ms (${code || status})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Get current ticker price for a symbol (Contract API)
   * Contract symbols use format: cmt_btcusdt (lowercase with cmt_ prefix)
   */
  async getTickerPrice(symbol: string = 'cmt_btcusdt'): Promise<number> {
    return this.withRetry(async () => {
      // Contract API returns array of all tickers
      const response = await this.client.get<WeexContractTicker[]>('/capi/v2/market/tickers');

      if (Array.isArray(response.data)) {
        // Find the ticker for the requested symbol
        const ticker = response.data.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());

        if (ticker) {
          const price = parseFloat(ticker.last);
          console.log(`[WEEX] ${symbol} price: ${price} (mark: ${ticker.markPrice})`);
          return price;
        }

        throw new Error(`Symbol ${symbol} not found in ticker list`);
      }

      throw new Error(`Failed to get tickers: Invalid response format`);
    });
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<WeexBalanceResponse['data']> {
    return this.withRetry(async () => {
      const response = await this.client.get<WeexBalanceResponse>('/api/v2/spot/account/assets');

      if (response.data.code === '00000') {
        console.log(`[WEEX] Balance retrieved successfully`);
        return response.data.data;
      }

      throw new Error(`Failed to get balance: ${response.data.msg}`);
    });
  }

  /**
   * Get contract/futures account assets
   * Uses GET /capi/v2/account/assets endpoint
   * @returns Array of asset balances
   */
  async getContractAssets(): Promise<WeexContractAsset[]> {
    return this.withRetry(async () => {
      const response = await this.client.get<WeexContractAsset[]>(
        '/capi/v2/account/assets'
      );

      const assets = response.data;

      if (!Array.isArray(assets)) {
        console.log(`[WEEX] Invalid assets response`);
        return [];
      }

      console.log(`[WEEX] Contract account assets retrieved:`);
      for (const asset of assets) {
        if (parseFloat(asset.available || '0') > 0 || parseFloat(asset.equity || '0') > 0) {
          console.log(`[WEEX]   ${asset.coinName}: Available=${asset.available}, Equity=${asset.equity}`);
        }
      }

      return assets;
    });
  }

  /**
   * Get order details/status (Contract API)
   * Note: This endpoint returns order data directly (not wrapped in {code, data})
   * @param orderId - The order ID to query
   * @param symbol - Contract symbol (default: cmt_btcusdt)
   */
  async getOrderStatus(orderId: string, symbol: string = 'cmt_btcusdt'): Promise<WeexOrderDetailResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get<WeexOrderDetailResponse | { code: string; msg: string }>(
        `/capi/v2/order/detail`,
        { params: { symbol, orderId } }
      );

      // Check if it's an error response (has code field that's not a valid order field)
      const data = response.data as any;
      if (data.code && data.msg && !data.order_id) {
        throw new Error(`Failed to get order status: ${data.msg}`);
      }

      // Response is direct order data
      if (data.order_id && data.status) {
        console.log(`[WEEX] Order ${orderId} status: ${data.status}`);
        return data as WeexOrderDetailResponse;
      }

      throw new Error(`Failed to get order status: Invalid response format`);
    });
  }

  /**
   * Get order history for contract orders
   * @param symbol - Contract symbol (default: cmt_btcusdt)
   * @param pageSize - Number of orders to return (default: 20)
   * @param createDate - Optional Unix millisecond timestamp (must be ≤90 days ago)
   */
  async getOrderHistory(
    symbol: string = 'cmt_btcusdt',
    pageSize: number = 20,
    createDate?: number
  ): Promise<any[]> {
    return this.withRetry(async () => {
      const params: Record<string, any> = { symbol, pageSize };
      if (createDate) {
        params.createDate = createDate;
      }

      const response = await this.client.get<any>(
        '/capi/v2/order/history',
        { params }
      );

      const data = response.data;

      // Check for error response
      if (data.code && data.code !== '0' && data.code !== 0) {
        throw new Error(`Failed to get order history: ${data.msg || 'Unknown error'}`);
      }

      // Return order list (may be in data.orderList or directly in data)
      if (Array.isArray(data)) {
        return data;
      }
      if (data.orderList && Array.isArray(data.orderList)) {
        return data.orderList;
      }
      if (data.data && Array.isArray(data.data)) {
        return data.data;
      }

      console.log('[WEEX] Order history response:', JSON.stringify(data, null, 2));
      return [];
    });
  }

  /**
   * Place a contract/futures order
   * Contract API order types:
   *   type: 1=Open Long, 2=Open Short, 3=Close Long, 4=Close Short
   *   order_type: 0=Normal, 1=Post-Only, 2=FOK, 3=IOC
   *   match_price: 0=Limit, 1=Market
   */
  async placeOrder(params: {
    symbol?: string;
    side: 'buy' | 'sell';
    orderType: 'limit' | 'market';
    quantity: string;
    price?: string;
    positionAction?: 'open' | 'close';  // New: open or close position
    takeProfitPrice?: number;  // Preset TP price on entry order
    stopLossPrice?: number;    // Preset SL price on entry order
  }): Promise<WeexOrderResponse> {
    // Determine contract order type based on side and action
    // 1=Open Long (buy to open), 2=Open Short (sell to open)
    // 3=Close Long (sell to close), 4=Close Short (buy to close)
    let contractType: string;
    const action = params.positionAction || 'open';

    if (action === 'open') {
      contractType = params.side === 'buy' ? '1' : '2';  // Open long or short
    } else {
      contractType = params.side === 'sell' ? '3' : '4'; // Close long or short
    }

    const orderRequest: WeexContractOrderRequest = {
      symbol: params.symbol || 'cmt_btcusdt',
      client_oid: this.generateClientOrderId(),
      size: params.quantity,
      type: contractType,
      order_type: '0',  // Normal order
      match_price: params.orderType === 'market' ? '1' : '0',
      price: params.price || '0',
      presetTakeProfitPrice: params.takeProfitPrice,
      presetStopLossPrice: params.stopLossPrice,
    };

    console.log(`[WEEX] Placing contract order:`, orderRequest);
    console.log(`[WEEX] Action: ${action} ${params.side} (type=${contractType})`);

    return this.withRetry(async () => {
      const response = await this.client.post<any>(
        '/capi/v2/order/placeOrder',
        orderRequest
      );

      // Contract API response format
      if (response.data && response.data.order_id) {
        console.log(`[WEEX] Order placed successfully!`);
        console.log(`[WEEX] Order ID: ${response.data.order_id}`);
        console.log(`[WEEX] Client Order ID: ${response.data.client_oid}`);

        // Extract TP/SL order IDs if present (preset TP/SL orders)
        // WEEX API may return these in various field names
        const tpOrderId = response.data.presetTakeProfitOrderId ||
                          response.data.tpOrderId ||
                          response.data.tp_order_id ||
                          response.data.takeProfitOrderId;
        const slOrderId = response.data.presetStopLossOrderId ||
                          response.data.slOrderId ||
                          response.data.sl_order_id ||
                          response.data.stopLossOrderId;

        if (tpOrderId || slOrderId) {
          console.log(`[WEEX] TP Order ID: ${tpOrderId || 'N/A'} | SL Order ID: ${slOrderId || 'N/A'}`);
        } else {
          // Log full response to help debug if IDs are not found
          console.log(`[WEEX] Full response for TP/SL ID extraction:`, JSON.stringify(response.data, null, 2));
        }

        // Return in compatible format with TP/SL order IDs
        return {
          code: '00000',
          msg: 'success',
          requestTime: Date.now(),
          data: {
            orderId: response.data.order_id,
            clientOrderId: response.data.client_oid,
            tpOrderId: tpOrderId?.toString(),
            slOrderId: slOrderId?.toString(),
          },
        };
      }

      // Check for error response
      if (response.data && response.data.code) {
        throw new Error(`Order failed: ${response.data.code} - ${response.data.msg}`);
      }

      throw new Error(`Order failed: Unknown response format`);
    });
  }

  /**
   * Open a LONG position with USDT notional value (Contract/Futures)
   * Calculates the BTC quantity based on current price
   */
  async buyWithNotional(notionalUSDT: number, symbol: string = 'cmt_btcusdt'): Promise<WeexOrderResponse> {
    // Get current price (has retry logic)
    const currentPrice = await this.getTickerPrice(symbol);

    // Calculate quantity (notional / price)
    // Contract trading typically uses number of contracts, adjust precision as needed
    const quantity = (notionalUSDT / currentPrice).toFixed(4);

    console.log(`[WEEX] Opening LONG position worth ${notionalUSDT} USDT`);
    console.log(`[WEEX] Current price: ${currentPrice}`);
    console.log(`[WEEX] Calculated quantity: ${quantity}`);

    return this.placeOrder({
      symbol,
      side: 'buy',
      orderType: 'market',
      quantity,
      positionAction: 'open',
    });
  }

  /**
   * Open a SHORT position (Contract/Futures)
   */
  async openShort(quantity: string, symbol: string = 'cmt_btcusdt'): Promise<WeexOrderResponse> {
    console.log(`[WEEX] Opening SHORT position: ${quantity} ${symbol}`);
    return await this.placeOrder({
      symbol,
      side: 'sell',
      orderType: 'market',
      quantity,
      positionAction: 'open',
    });
  }

  /**
   * Close a LONG position (sell to close)
   */
  async closeLong(quantity: string, symbol: string = 'cmt_btcusdt'): Promise<WeexOrderResponse> {
    console.log(`[WEEX] Closing LONG position: ${quantity} ${symbol}`);
    return await this.placeOrder({
      symbol,
      side: 'sell',
      orderType: 'market',
      quantity,
      positionAction: 'close',
    });
  }

  /**
   * Close a SHORT position (buy to close)
   */
  async closeShort(quantity: string, symbol: string = 'cmt_btcusdt'): Promise<WeexOrderResponse> {
    console.log(`[WEEX] Closing SHORT position: ${quantity} ${symbol}`);
    return await this.placeOrder({
      symbol,
      side: 'buy',
      orderType: 'market',
      quantity,
      positionAction: 'close',
    });
  }

  /**
   * Legacy sell method - now closes a long position
   * @deprecated Use closeLong() instead
   */
  async sell(quantity: string, symbol: string = 'cmt_btcusdt'): Promise<WeexOrderResponse> {
    return await this.placeOrder({
      symbol,
      side: 'sell',
      orderType: 'market',
      quantity,
    });
  }

  /**
   * Get current position for a symbol
   * Uses getAllPositions and filters by symbol since /capi/v2/position/single doesn't exist
   * @param symbol - Contract symbol (default: cmt_btcusdt)
   * @returns Position data or null if no position
   */
  async getPosition(symbol: string = 'cmt_btcusdt'): Promise<WeexPositionResponse | null> {
    // Use getAllPositions and filter by symbol since /capi/v2/position/single doesn't exist
    const positions = await this.getAllPositions();
    const position = positions.find(p => p.symbol === symbol);

    if (!position) {
      console.log(`[WEEX] No open position for ${symbol}`);
      return null;
    }

    const norm = normalizePosition(position);
    console.log(`[WEEX] Position found: ${norm.side} ${norm.quantity} ${symbol}`);
    console.log(`[WEEX] Entry: $${norm.avgPrice.toLocaleString()}`);
    console.log(`[WEEX] Unrealized PnL: ${norm.unrealizedPnl} USDT`);

    return position;
  }

  /**
   * Get all open positions across all symbols
   * Uses GET /capi/v2/account/position/allPosition endpoint
   * @returns Array of position data or empty array if no positions
   */
  async getAllPositions(): Promise<WeexPositionResponse[]> {
    return this.withRetry(async () => {
      const response = await this.client.get<WeexPositionResponse[]>(
        '/capi/v2/account/position/allPosition'
      );

      const positions = response.data;

      if (!Array.isArray(positions)) {
        console.log(`[WEEX] No positions found or invalid response`);
        return [];
      }

      // Filter out positions with no holdings (check both field naming conventions)
      const activePositions = positions.filter(p => {
        const qty = parseFloat(p.size || p.hold_available || '0');
        return qty > 0;
      });

      console.log(`[WEEX] Found ${activePositions.length} open position(s)`);
      for (const pos of activePositions) {
        const norm = normalizePosition(pos);
        console.log(`[WEEX]   ${norm.symbol}: ${norm.side} ${norm.quantity} @ $${norm.avgPrice}`);
      }

      return activePositions;
    });
  }

  /**
   * Close a specific position
   * @param symbol - Contract symbol
   * @param side - Position side: 'LONG' or 'SHORT'
   * @param quantity - Quantity to close
   * @returns Close order result
   */
  async closePosition(
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: string
  ): Promise<ClosePositionResult> {
    try {
      console.log(`[WEEX] Closing ${side} position: ${quantity} ${symbol}`);

      let result;
      if (side === 'LONG') {
        result = await this.closeLong(quantity, symbol);
      } else {
        result = await this.closeShort(quantity, symbol);
      }

      // Wait a moment then get order status for fill details
      await new Promise(resolve => setTimeout(resolve, 1000));

      let fillPrice: number | undefined;
      let realizedPnl: number | undefined;

      try {
        const orderStatus = await this.getOrderStatus(result.data.orderId.toString(), symbol);
        fillPrice = parseFloat(orderStatus.price_avg || '0');
        realizedPnl = parseFloat(orderStatus.totalProfits || '0');
      } catch (statusErr) {
        console.warn(`[WEEX] Could not fetch order status: ${(statusErr as Error).message}`);
      }

      return {
        success: true,
        orderId: result.data.orderId,
        clientOrderId: result.data.clientOrderId,
        side,
        quantity,
        fillPrice,
        realizedPnl,
      };
    } catch (error: any) {
      console.error(`[WEEX] Failed to close position: ${error.message}`);
      return {
        success: false,
        side,
        quantity,
        error: error.message,
      };
    }
  }

  /**
   * Close all open positions for a symbol
   * High-level method that fetches current position and closes it
   * @param symbol - Contract symbol (default: cmt_btcusdt)
   * @returns Close result with details
   */
  async closeAllPositions(symbol: string = 'cmt_btcusdt'): Promise<ClosePositionResult> {
    console.log(`[WEEX] closeAllPositions called for ${symbol}`);

    // Step 1: Get current position
    const position = await this.getPosition(symbol);

    if (!position) {
      console.log(`[WEEX] No positions to close for ${symbol}`);
      return {
        success: true,
        side: 'NONE',
        quantity: '0',
      };
    }

    // Step 2: Normalize and close
    const norm = normalizePosition(position);

    // Step 3: Close the position
    return this.closePosition(symbol, norm.side, norm.quantity.toString());
  }

  /**
   * Close all positions via API endpoint
   * Uses POST /capi/v2/order/closePositions
   * @param symbol - Optional symbol. If not provided, closes ALL positions
   */
  async closePositionsViaAPI(symbol?: string): Promise<any> {
    return this.withRetry(async () => {
      const body = symbol ? { symbol } : {};
      const response = await this.client.post('/capi/v2/order/closePositions', body);
      console.log(`[WEEX] closePositions response:`, response.data);
      return response.data;
    });
  }

  /**
   * Upload AI log to WEEX API
   * POST /capi/v2/order/uploadAiLog
   *
   * Used to log AI model usage for compliance and verification.
   * This method is fire-and-forget safe - catches all errors internally.
   */
  async uploadAiLog(params: {
    orderId?: string;
    stage: string;
    model: string;
    input: Record<string, any>;
    output: Record<string, any>;
    explanation: string;
  }): Promise<boolean> {
    try {
      // Truncate explanation to max 1000 characters as per API spec
      const explanation = params.explanation.substring(0, 1000);

      // Build request body - only include orderId if it's a valid non-empty string
      const body: Record<string, any> = {
        stage: params.stage,
        model: params.model,
        input: params.input,
        output: params.output,
        explanation: explanation,
      };

      // Only include orderId if it's a valid non-empty string (not null, undefined, '0', or empty)
      if (params.orderId && params.orderId !== '0' && params.orderId !== '') {
        body.orderId = params.orderId;
      }

      const response = await this.client.post('/capi/v2/order/uploadAiLog', body);

      if (response.data?.code === '00000') {
        console.log(`[WEEX-AI-LOG] Uploaded: ${params.stage} (${params.model})`);
        return true;
      } else {
        console.warn(`[WEEX-AI-LOG] Upload response: ${response.data?.code} - ${response.data?.msg}`);
        return false;
      }
    } catch (error: any) {
      // Log warning but don't throw - AI logging should never block trading
      console.warn(`[WEEX-AI-LOG] Upload failed: ${error.message}`);
      return false;
    }
  }

  // ============================================================================
  // TP/SL ORDER MANAGEMENT
  // ============================================================================

  /**
   * Modify an existing TP or SL order on WEEX
   * POST /capi/v2/order/modifyTpSlOrder
   *
   * @param params.orderId - Order ID of the TP/SL order to modify
   * @param params.triggerPrice - New trigger price
   * @param params.executePrice - New execution price (0 = market, >0 = limit)
   * @param params.triggerPriceType - 1=Last price (default), 3=Mark price
   */
  async modifyTpSlOrder(params: {
    orderId: string;
    triggerPrice: string;
    executePrice?: string;
    triggerPriceType?: number;
  }): Promise<{ success: boolean; error?: string }> {
    return this.withRetry(async () => {
      const body = {
        orderId: params.orderId,
        triggerPrice: params.triggerPrice,
        executePrice: params.executePrice || '0',
        triggerPriceType: params.triggerPriceType || 1,
      };

      console.log(`[WEEX] Modifying TP/SL order:`, body);

      const response = await this.client.post<any>('/capi/v2/order/modifyTpSlOrder', body);

      if (response.data?.code === '00000') {
        console.log(`[WEEX] TP/SL modified successfully: ${params.orderId} -> $${params.triggerPrice}`);
        return { success: true };
      }

      const errorMsg = response.data?.msg || 'Unknown error';
      console.error(`[WEEX] Failed to modify TP/SL: ${response.data?.code} - ${errorMsg}`);
      return { success: false, error: errorMsg };
    });
  }

  /**
   * Place a new TP or SL order for an existing position
   * POST /capi/v2/order/placeTpSlOrder
   *
   * Use this AFTER entry order to create proper conditional TP/SL orders.
   * Do NOT use presetTakeProfitPrice/presetStopLossPrice in entry order as
   * they create IOC orders that execute immediately.
   *
   * @param params.symbol - Contract symbol (e.g., 'cmt_btcusdt')
   * @param params.planType - 'profit_plan' for TP, 'loss_plan' for SL
   * @param params.triggerPrice - Price at which to trigger the order
   * @param params.executePrice - Execution price (0 = market price)
   * @param params.holdSide - '1' for long position, '2' for short position
   * @param params.size - Position size (optional, defaults to full position)
   */
  async placeTpSlOrder(params: {
    symbol: string;
    planType: 'profit_plan' | 'loss_plan';
    triggerPrice: string;
    executePrice?: string;
    holdSide: '1' | '2';
    size?: string;
  }): Promise<{ success: boolean; orderId?: string; error?: string }> {
    return this.withRetry(async () => {
      const body: Record<string, any> = {
        symbol: params.symbol,
        planType: params.planType,
        triggerPrice: params.triggerPrice,
        executePrice: params.executePrice || '0',
        holdSide: params.holdSide,
      };

      // Only include size if specified
      if (params.size) {
        body.size = params.size;
      }

      console.log(`[WEEX] Placing ${params.planType} order:`, body);

      const response = await this.client.post<any>('/capi/v2/order/placeTpSlOrder', body);

      // Check for success - response may have order_id directly or in nested structure
      if (response.data?.code === '00000' || response.data?.order_id) {
        const orderId = response.data.order_id || response.data.orderId || response.data.data?.order_id;
        console.log(`[WEEX] ${params.planType} order placed successfully: ${orderId}`);
        return { success: true, orderId: orderId?.toString() };
      }

      const errorMsg = response.data?.msg || 'Unknown error';
      console.error(`[WEEX] Failed to place ${params.planType}: ${response.data?.code} - ${errorMsg}`);
      return { success: false, error: errorMsg };
    });
  }

  /**
   * Cancel an order on WEEX
   * POST /capi/v2/order/cancel_order
   *
   * @param params.orderId - Order ID to cancel (either orderId or clientOid required)
   * @param params.clientOid - Client order ID (either orderId or clientOid required)
   */
  async cancelOrder(params: {
    orderId?: string;
    clientOid?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!params.orderId && !params.clientOid) {
      return { success: false, error: 'Either orderId or clientOid is required' };
    }

    return this.withRetry(async () => {
      const body: Record<string, string> = {};
      if (params.orderId) body.orderId = params.orderId;
      if (params.clientOid) body.clientOid = params.clientOid;

      console.log(`[WEEX] Cancelling order:`, body);

      const response = await this.client.post<any>('/capi/v2/order/cancel_order', body);

      if (response.data?.code === '00000') {
        console.log(`[WEEX] Order cancelled successfully: ${params.orderId || params.clientOid}`);
        return { success: true };
      }

      const errorMsg = response.data?.msg || 'Unknown error';
      console.error(`[WEEX] Failed to cancel order: ${response.data?.code} - ${errorMsg}`);
      return { success: false, error: errorMsg };
    });
  }
}

// Export singleton instance
export const weexService = new WeexService();
export default weexService;
