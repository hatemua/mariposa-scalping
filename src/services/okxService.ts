import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { decrypt } from '../utils/encryption';
import { User } from '../models';
import { Trade } from '../types';
import { redisService } from './redisService';
import { SymbolConverter } from '../utils/symbolConverter';

interface OKXCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

interface OKXOrder {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
  filled: number;
  remaining: number;
  status: 'open' | 'closed' | 'canceled' | 'failed';
  timestamp: number;
  fee?: {
    cost: number;
    currency: string;
  };
  avgFillPrice?: number;
  trades?: OKXTrade[];
}

interface OKXTrade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  cost: number;
  fee: {
    cost: number;
    currency: string;
  };
  timestamp: number;
}

interface OKXOrderResponse {
  code: string;
  msg: string;
  data: Array<{
    ordId: string;
    clOrdId: string;
    tag: string;
    sCode: string;
    sMsg: string;
  }>;
}

interface OKXOrderHistoryResponse {
  code: string;
  msg: string;
  data: Array<{
    ordId: string;
    clOrdId: string;
    instId: string;
    side: 'buy' | 'sell';
    ordType: 'market' | 'limit';
    sz: string;
    px: string;
    fillSz: string;
    fillPx: string;
    avgPx: string;
    state: 'live' | 'filled' | 'canceled';
    cTime: string;
    uTime: string;
    fee: string;
    feeCcy: string;
  }>;
}

interface OKXInstrumentInfo {
  instId: string;
  minSz: string;      // Minimum order size in base currency
  lotSz: string;      // Order size increment
  tickSz: string;     // Price tick size
  ctVal: string;      // Contract value
  ctMult: string;     // Contract multiplier
}

export class OKXService {
  private clients = new Map<string, AxiosInstance>();
  private readonly baseURL = process.env.NODE_ENV === 'production'
    ? 'https://www.okx.com'
    : 'https://www.okx.com'; // OKX doesn't have a separate sandbox URL
  private readonly orderPollingInterval = 2000; // 2 seconds
  private readonly orderHistoryCache = new Map<string, OKXOrder>();
  private instrumentInfoCache = new Map<string, { info: OKXInstrumentInfo; timestamp: number }>();
  private readonly INSTRUMENT_CACHE_TTL = 3600000; // 1 hour

  async getClient(userId: string): Promise<AxiosInstance> {
    if (this.clients.has(userId)) {
      return this.clients.get(userId)!;
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.okxApiKey || !user.okxSecretKey || !user.okxPassphrase) {
      console.error(`❌ OKX credentials missing for user ${userId}`);
      console.error(`   Has API Key: ${!!user.okxApiKey}, Has Secret: ${!!user.okxSecretKey}, Has Passphrase: ${!!user.okxPassphrase}`);
      throw new Error(`OKX API credentials not configured for user ${userId}. Please add your OKX API credentials in settings.`);
    }

    const credentials = this.decryptCredentials({
      apiKey: user.okxApiKey,
      secret: user.okxSecretKey,
      passphrase: user.okxPassphrase
    });

    const client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'OK-ACCESS-KEY': credentials.apiKey,
        'OK-ACCESS-PASSPHRASE': credentials.passphrase,
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for signing
    client.interceptors.request.use((config) => {
      const timestamp = new Date().toISOString();
      const method = config.method?.toUpperCase() || 'GET';

      // Build the full path with query parameters for signature
      let path = config.url || '';

      // For GET requests, include query parameters in the signature
      if (config.params && Object.keys(config.params).length > 0) {
        const queryString = new URLSearchParams(config.params).toString();
        path = `${path}?${queryString}`;
      }

      const body = config.data ? JSON.stringify(config.data) : '';

      // OKX signature format: timestamp + method + requestPath + body
      const message = timestamp + method + path + body;

      const signature = crypto
        .createHmac('sha256', credentials.secret)
        .update(message)
        .digest('base64');

      console.log(`🔐 OKX Signature Debug:
        Timestamp: ${timestamp}
        Method: ${method}
        Path: ${path}
        Body: ${body || '(empty)'}
        Message: ${message}
        Signature: ${signature}`);

      // @ts-ignore - Axios header typing issue
      config.headers = {
        ...config.headers,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp
      };

      return config;
    });

    this.clients.set(userId, client);
    return client;
  }

  private decryptCredentials(encryptedCreds: any): OKXCredentials {
    return {
      apiKey: decrypt(JSON.parse(encryptedCreds.apiKey)),
      secret: decrypt(JSON.parse(encryptedCreds.secret)),
      passphrase: decrypt(JSON.parse(encryptedCreds.passphrase))
    };
  }

  async getBalance(userId: string): Promise<any> {
    try {
      const client = await this.getClient(userId);
      const response = await client.get('/api/v5/account/balance');

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Error fetching balance:', error);
      throw error;
    }
  }

  async getAccountInfo(userId: string): Promise<any> {
    try {
      const client = await this.getClient(userId);
      const response = await client.get('/api/v5/account/config');

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('Error fetching account info:', error);
      throw error;
    }
  }

  /**
   * Get instrument information including minimum order sizes
   * This is a PUBLIC endpoint, no authentication needed
   */
  async getInstrumentInfo(symbol: string): Promise<OKXInstrumentInfo> {
    const okxSymbol = SymbolConverter.toOKXFormat(symbol);

    // Check cache first
    const cached = this.instrumentInfoCache.get(okxSymbol);
    if (cached && Date.now() - cached.timestamp < this.INSTRUMENT_CACHE_TTL) {
      return cached.info;
    }

    try {
      // Use unauthenticated axios instance for public endpoints
      const response = await axios.get(`${this.baseURL}/api/v5/public/instruments`, {
        params: {
          instType: 'SPOT',
          instId: okxSymbol
        }
      });

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      if (!response.data.data || response.data.data.length === 0) {
        throw new Error(`No instrument info found for ${okxSymbol}`);
      }

      const info: OKXInstrumentInfo = {
        instId: response.data.data[0].instId,
        minSz: response.data.data[0].minSz,
        lotSz: response.data.data[0].lotSz,
        tickSz: response.data.data[0].tickSz,
        ctVal: response.data.data[0].ctVal,
        ctMult: response.data.data[0].ctMult
      };

      // Cache for 1 hour
      this.instrumentInfoCache.set(okxSymbol, { info, timestamp: Date.now() });

      console.log(`📊 Instrument Info for ${okxSymbol}: minSz=${info.minSz}, lotSz=${info.lotSz}`);

      return info;
    } catch (error) {
      console.error(`Error fetching instrument info for ${okxSymbol}:`, error);
      throw error;
    }
  }

  async createMarketOrder(
    userId: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number
  ): Promise<OKXOrder> {
    try {
      const client = await this.getClient(userId);
      const okxSymbol = SymbolConverter.toOKXFormat(symbol);

      // CRITICAL: Fetch instrument info to validate minimum order size
      const instrumentInfo = await this.getInstrumentInfo(symbol);
      const minSize = parseFloat(instrumentInfo.minSz);
      const lotSize = parseFloat(instrumentInfo.lotSz);

      // Validate minimum size
      if (amount < minSize) {
        throw new Error(
          `Order size ${amount} ${symbol} is below minimum ${minSize}. ` +
          `Please increase position size to at least ${minSize} ${symbol.replace('USDT', '')}.`
        );
      }

      // Round to lot size increment
      const adjustedAmount = Math.floor(amount / lotSize) * lotSize;
      if (adjustedAmount !== amount) {
        console.log(`📊 Adjusted order size from ${amount} to ${adjustedAmount} (lot size: ${lotSize})`);
      }

      const orderData = {
        instId: okxSymbol,
        tdMode: 'cash',
        side: side,
        ordType: 'market',
        sz: adjustedAmount.toString()
      };

      console.log(`📤 OKX Order Request:`, JSON.stringify(orderData, null, 2));
      console.log(`   Min Size: ${minSize}, Lot Size: ${lotSize}`);

      const response = await client.post('/api/v5/trade/order', orderData);

      console.log(`📥 OKX Response: code=${response.data.code}, msg=${response.data.msg}`);

      if (response.data.code !== '0') {
        console.error(`❌ OKX API Error Details:`, {
          code: response.data.code,
          msg: response.data.msg,
          data: response.data.data,
          orderData: orderData,
          instrumentInfo: { minSz: minSize, lotSz: lotSize }
        });
        throw new Error(`OKX API Error [${response.data.code}]: ${response.data.msg}`);
      }

      const orderResult = response.data.data[0];
      const orderId = orderResult.ordId;

      // Start polling for order completion and fill price
      setTimeout(() => this.pollOrderCompletion(userId, orderId, okxSymbol), 1000);

      return {
        orderId: orderId,
        clientOrderId: orderResult.clOrdId,
        symbol: okxSymbol,
        side: side,
        type: 'market',
        amount: amount,
        filled: 0,
        remaining: amount,
        status: 'open',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error creating market order:', error);
      throw error;
    }
  }

  async createLimitOrder(
    userId: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    price: number
  ): Promise<OKXOrder> {
    try {
      const client = await this.getClient(userId);
      const okxSymbol = SymbolConverter.toOKXFormat(symbol);

      const orderData = {
        instId: okxSymbol,
        tdMode: 'cash',
        side: side,
        ordType: 'limit',
        sz: amount.toString(),
        px: price.toString()
      };

      const response = await client.post('/api/v5/trade/order', orderData);

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      const orderResult = response.data.data[0];
      const orderId = orderResult.ordId;

      // Start polling for order completion
      setTimeout(() => this.pollOrderCompletion(userId, orderId, okxSymbol), 1000);

      return {
        orderId: orderId,
        clientOrderId: orderResult.clOrdId,
        symbol: okxSymbol,
        side: side,
        type: 'limit',
        amount: amount,
        price: price,
        filled: 0,
        remaining: amount,
        status: 'open',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error creating limit order:', error);
      throw error;
    }
  }

  async cancelOrder(userId: string, orderId: string, symbol: string): Promise<any> {
    try {
      const client = await this.getClient(userId);
      const okxSymbol = SymbolConverter.toOKXFormat(symbol);

      const cancelData = {
        instId: okxSymbol,
        ordId: orderId
      };

      const response = await client.post('/api/v5/trade/cancel-order', cancelData);

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      return response.data.data[0];
    } catch (error) {
      console.error('Error cancelling order:', error);
      throw error;
    }
  }

  async getOrderStatus(userId: string, orderId: string, symbol: string): Promise<OKXOrder | null> {
    try {
      const client = await this.getClient(userId);
      const okxSymbol = SymbolConverter.toOKXFormat(symbol);

      const response = await client.get('/api/v5/trade/order', {
        params: {
          instId: okxSymbol,
          ordId: orderId
        }
      });

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      const orderData = response.data.data[0];
      if (!orderData) return null;

      return this.mapOKXOrderResponse(orderData);
    } catch (error) {
      console.error('Error fetching order status:', error);
      throw error;
    }
  }

  async getOpenOrders(userId: string, symbol?: string): Promise<OKXOrder[]> {
    try {
      const client = await this.getClient(userId);
      const params: any = {};

      if (symbol) {
        params.instId = SymbolConverter.toOKXFormat(symbol);
      }

      const response = await client.get('/api/v5/trade/orders-pending', { params });

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      return response.data.data.map((order: any) => this.mapOKXOrderResponse(order));
    } catch (error) {
      console.error('Error fetching open orders:', error);
      throw error;
    }
  }

  async getOrderHistory(userId: string, symbol?: string, limit = 100): Promise<OKXOrder[]> {
    try {
      const client = await this.getClient(userId);
      const params: any = {
        limit: limit.toString()
      };

      if (symbol) {
        params.instId = SymbolConverter.toOKXFormat(symbol);
      }

      const response = await client.get('/api/v5/trade/orders-history', { params });

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      const orders = response.data.data.map((order: any) => this.mapOKXOrderResponse(order));

      // Cache orders for quick access
      // @ts-ignore - order typing
      orders.forEach((order: any) => {
        this.orderHistoryCache.set(order.orderId, order);
      });

      return orders;
    } catch (error) {
      console.error('Error fetching order history:', error);
      throw error;
    }
  }

  async getTicker(symbol: string): Promise<any> {
    try {
      const okxSymbol = SymbolConverter.toOKXFormat(symbol);
      const response = await axios.get(`${this.baseURL}/api/v5/market/ticker`, {
        params: { instId: okxSymbol }
      });

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      return response.data.data[0];
    } catch (error) {
      console.error('Error fetching ticker:', error);
      throw error;
    }
  }

  async getSymbols(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseURL}/api/v5/public/instruments`, {
        params: { instType: 'SPOT' }
      });

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      return response.data.data.map((instrument: any) => instrument.instId);
    } catch (error) {
      console.error('Error fetching symbols:', error);
      throw error;
    }
  }

  calculatePositionSize(
    balance: number,
    price: number,
    riskPercentage: number,
    stopLossPercentage: number
  ): number {
    const riskAmount = balance * (riskPercentage / 100);
    const stopLossDistance = price * (stopLossPercentage / 100);
    const positionSize = riskAmount / stopLossDistance;

    return Math.floor(positionSize * 100) / 100; // Round down to 2 decimal places
  }

  validateOrder(symbol: string, side: 'buy' | 'sell', amount: number, price?: number): boolean {
    if (!symbol || !side || amount <= 0) {
      return false;
    }

    if (price && price <= 0) {
      return false;
    }

    return true;
  }

  async executeScalpingOrder(
    userId: string,
    symbol: string,
    side: 'buy' | 'sell',
    amount: number,
    type: 'market' | 'limit' = 'market',
    price?: number
  ): Promise<OKXOrder> {
    try {
      if (!this.validateOrder(symbol, side, amount, price)) {
        throw new Error('Invalid order parameters');
      }

      let order: OKXOrder;
      if (type === 'market') {
        order = await this.createMarketOrder(userId, symbol, side, amount);
      } else {
        if (!price) {
          throw new Error('Price is required for limit orders');
        }
        order = await this.createLimitOrder(userId, symbol, side, amount, price);
      }

      // Cache order for tracking
      await this.cacheOrderData(order);

      console.log(`Scalping order executed: ${side} ${amount} ${symbol} at ${price || 'market'}`);
      return order;
    } catch (error) {
      console.error('Error executing scalping order:', error);
      throw error;
    }
  }

  clearUserExchange(userId: string): void {
    this.clients.delete(userId);
  }

  // Helper method to map OKX API response to our order interface
  private mapOKXOrderResponse(orderData: any): OKXOrder {
    return {
      orderId: orderData.ordId,
      clientOrderId: orderData.clOrdId,
      symbol: orderData.instId,
      side: orderData.side,
      type: orderData.ordType,
      amount: parseFloat(orderData.sz),
      price: orderData.px ? parseFloat(orderData.px) : undefined,
      filled: parseFloat(orderData.fillSz || '0'),
      remaining: parseFloat(orderData.sz) - parseFloat(orderData.fillSz || '0'),
      status: this.mapOrderStatus(orderData.state),
      timestamp: parseInt(orderData.cTime || orderData.uTime),
      avgFillPrice: orderData.avgPx ? parseFloat(orderData.avgPx) : undefined,
      fee: orderData.fee ? {
        cost: Math.abs(parseFloat(orderData.fee)),
        currency: orderData.feeCcy
      } : undefined
    };
  }

  // Map OKX order status to our standard format
  private mapOrderStatus(okxStatus: string): 'open' | 'closed' | 'canceled' | 'failed' {
    switch (okxStatus) {
      case 'live':
      case 'partially_filled':
        return 'open';
      case 'filled':
        return 'closed';
      case 'canceled':
        return 'canceled';
      default:
        return 'failed';
    }
  }

  // Poll for order completion and get actual fill price
  private async pollOrderCompletion(userId: string, orderId: string, symbol: string): Promise<void> {
    try {
      let attempts = 0;
      const maxAttempts = 30; // 30 attempts × 2s = 1 minute timeout

      const pollInterval = setInterval(async () => {
        attempts++;

        try {
          const orderStatus = await this.getOrderStatus(userId, orderId, symbol);

          if (!orderStatus) {
            console.log(`Order ${orderId} not found, stopping poll`);
            clearInterval(pollInterval);
            return;
          }

          // Update cached order
          this.orderHistoryCache.set(orderId, orderStatus);
          await this.cacheOrderData(orderStatus);

          // If order is completed or failed, stop polling
          if (orderStatus.status === 'closed' || orderStatus.status === 'canceled' || orderStatus.status === 'failed') {
            console.log(`Order ${orderId} completed with status: ${orderStatus.status}, avg fill price: ${orderStatus.avgFillPrice}`);

            // Publish order update to Redis for real-time updates
            await redisService.publish(`order:${userId}`, {
              type: 'order_update',
              orderId: orderId,
              status: orderStatus.status,
              avgFillPrice: orderStatus.avgFillPrice,
              filled: orderStatus.filled,
              timestamp: Date.now()
            });

            clearInterval(pollInterval);
            return;
          }

          // Stop polling after max attempts
          if (attempts >= maxAttempts) {
            console.log(`Order ${orderId} polling timeout after ${maxAttempts} attempts`);
            clearInterval(pollInterval);
          }
        } catch (error) {
          console.error(`Error polling order ${orderId}:`, error);
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
          }
        }
      }, this.orderPollingInterval);
    } catch (error) {
      console.error('Error setting up order polling:', error);
    }
  }

  // Cache order data in Redis for quick access
  private async cacheOrderData(order: OKXOrder): Promise<void> {
    try {
      const cacheKey = `order:${order.orderId}`;
      await redisService.set(cacheKey, JSON.stringify(order), 3600); // Cache for 1 hour

      // Also cache by symbol for quick lookups
      const symbolOrdersKey = `orders:${order.symbol}`;
      await redisService.zadd(symbolOrdersKey, order.timestamp, order.orderId);
    } catch (error) {
      console.error('Error caching order data:', error);
    }
  }

  // Get cached order data
  async getCachedOrder(orderId: string): Promise<OKXOrder | null> {
    try {
      const cacheKey = `order:${orderId}`;
      const cachedData = await redisService.get(cacheKey);

      if (cachedData) {
        return JSON.parse(cachedData);
      }

      // Check memory cache
      return this.orderHistoryCache.get(orderId) || null;
    } catch (error) {
      console.error('Error getting cached order:', error);
      return null;
    }
  }

  // Get recent orders for a symbol from cache
  async getRecentOrdersForSymbol(symbol: string, limit = 10): Promise<string[]> {
    try {
      const okxSymbol = SymbolConverter.toOKXFormat(symbol);
      const symbolOrdersKey = `orders:${okxSymbol}`;

      // Get most recent order IDs (highest scores/timestamps first)
      const orderIds = await redisService.zrevrange(symbolOrdersKey, 0, limit - 1);
      return orderIds;
    } catch (error) {
      console.error('Error getting recent orders for symbol:', error);
      return [];
    }
  }

  // Get fill price for a completed order
  async getOrderFillPrice(userId: string, orderId: string, symbol: string): Promise<number | null> {
    try {
      // First check cache
      const cachedOrder = await this.getCachedOrder(orderId);
      if (cachedOrder && cachedOrder.avgFillPrice) {
        return cachedOrder.avgFillPrice;
      }

      // If not in cache, fetch from API
      const orderStatus = await this.getOrderStatus(userId, orderId, symbol);
      if (orderStatus && orderStatus.avgFillPrice) {
        // Cache the result
        await this.cacheOrderData(orderStatus);
        return orderStatus.avgFillPrice;
      }

      // Try order history if individual order fetch fails
      const orderHistory = await this.getOrderHistory(userId, symbol, 50);
      const order = orderHistory.find(o => o.orderId === orderId);

      if (order && order.avgFillPrice) {
        return order.avgFillPrice;
      }

      return null;
    } catch (error) {
      console.error('Error getting order fill price:', error);
      return null;
    }
  }

  // Get order fills/trades for detailed analysis
  async getOrderFills(userId: string, orderId: string): Promise<OKXTrade[]> {
    try {
      const client = await this.getClient(userId);

      const response = await client.get('/api/v5/trade/fills', {
        params: {
          ordId: orderId
        }
      });

      if (response.data.code !== '0') {
        throw new Error(`OKX API Error: ${response.data.msg}`);
      }

      return response.data.data.map((fill: any) => ({
        id: fill.tradeId,
        orderId: fill.ordId,
        symbol: fill.instId,
        side: fill.side,
        amount: parseFloat(fill.fillSz),
        price: parseFloat(fill.fillPx),
        cost: parseFloat(fill.fillSz) * parseFloat(fill.fillPx),
        fee: {
          cost: Math.abs(parseFloat(fill.fee)),
          currency: fill.feeCcy
        },
        timestamp: parseInt(fill.ts)
      }));
    } catch (error) {
      console.error('Error getting order fills:', error);
      return [];
    }
  }
}

export const okxService = new OKXService();