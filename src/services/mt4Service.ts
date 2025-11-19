/**
 * MT4 Service
 *
 * Provides MT4 trading functionality via ZeroMQ bridge.
 * Follows OKXService pattern for consistency.
 *
 * Ultra-low latency design for scalping:
 * - Direct HTTP connection to local MT4 bridge (<5ms)
 * - Minimal data transformation
 * - Redis caching for frequently accessed data
 * - Order status polling for real-time updates
 */

import axios, { AxiosInstance } from 'axios';
import { decrypt } from '../utils/encryption';
import { User } from '../models';
import { redisService } from './redisService';
import { symbolMappingService } from './symbolMappingService';

interface MT4Credentials {
  serverUrl: string;
  accountNumber: string;
  password: string;
  brokerName?: string;
}

interface MT4Order {
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number; // MT4 uses lots, not quantity
  openPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  swap: number;
  commission: number;
  openTime: Date;
  closeTime?: Date;
  status: 'open' | 'closed' | 'pending';
}

interface MT4AccountInfo {
  accountNumber: number;
  broker: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  profit: number;
}

interface MT4SymbolInfo {
  symbol: string;
  description: string;
  digits: number;
  point: number;
  spread: number;
  bid: number;
  ask: number;
}

export class MT4Service {
  private clients = new Map<string, AxiosInstance>();
  private readonly bridgeURL = process.env.MT4_BRIDGE_URL || 'http://localhost:8080';
  private readonly orderPollingInterval = 2000; // 2 seconds
  private readonly orderCache = new Map<number, MT4Order>();
  private symbolInfoCache = new Map<string, { info: MT4SymbolInfo; timestamp: number }>();
  private readonly SYMBOL_CACHE_TTL = 300000; // 5 minutes

  /**
   * Get MT4 client for specific user
   * Pattern: Same as OKXService
   */
  async getClient(userId: string): Promise<AxiosInstance> {
    if (this.clients.has(userId)) {
      return this.clients.get(userId)!;
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (!user.mt4ServerUrl || !user.mt4AccountNumber || !user.mt4Password) {
      console.error(`❌ MT4 credentials missing for user ${userId}`);
      console.error(`   Has Server URL: ${!!user.mt4ServerUrl}, Has Account: ${!!user.mt4AccountNumber}, Has Password: ${!!user.mt4Password}`);
      throw new Error(`MT4 API credentials not configured for user ${userId}. Please add your MT4 broker credentials in settings.`);
    }

    const credentials = this.decryptCredentials({
      serverUrl: user.mt4ServerUrl,
      accountNumber: user.mt4AccountNumber,
      password: user.mt4Password,
      brokerName: user.mt4BrokerName || undefined
    });

    const client = axios.create({
      baseURL: credentials.serverUrl || this.bridgeURL,
      timeout: 30000, // MT4 can be slower than OKX
      headers: {
        'Content-Type': 'application/json',
        'X-MT4-Account': credentials.accountNumber
      }
    });

    // Add request interceptor for authentication
    client.interceptors.request.use((config) => {
      // Use bridge credentials from environment, not MT4 account credentials
      const bridgeUsername = process.env.MT4_BRIDGE_USERNAME || 'admin';
      const bridgePassword = process.env.MT4_BRIDGE_PASSWORD || 'changeme123';
      const auth = Buffer.from(`${bridgeUsername}:${bridgePassword}`).toString('base64');
      config.headers['Authorization'] = `Basic ${auth}`;
      return config;
    });

    // Add response interceptor for error handling
    client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          console.error(`MT4 API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          console.error('MT4 API Error: No response from bridge. Is MT4 bridge running?');
        } else {
          console.error(`MT4 API Error: ${error.message}`);
        }
        throw error;
      }
    );

    this.clients.set(userId, client);
    return client;
  }

  /**
   * Create market order (BUY or SELL)
   */
  async createMarketOrder(
    userId: string,
    universalSymbol: string,
    side: 'buy' | 'sell',
    volume: number, // MT4 uses volume (lots), typically 0.01 to 10.0
    stopLoss?: number,
    takeProfit?: number
  ): Promise<MT4Order> {
    try {
      const client = await this.getClient(userId);

      // Convert universal symbol to MT4 format
      const mt4Symbol = await symbolMappingService.convertSymbol(universalSymbol, 'MT4');

      if (!mt4Symbol) {
        throw new Error(`Symbol ${universalSymbol} not available at MT4 broker`);
      }

      // Validate volume (typically 0.01 minimum, max depends on broker)
      if (volume < 0.01) {
        throw new Error(`Volume too small: ${volume}. Minimum is 0.01 lots`);
      }

      // Debug logging
      console.log(`[MT4 Service] Creating market order:`, {
        userId: userId.substring(0, 8) + '...',
        universalSymbol,
        mt4Symbol,
        side,
        volume,
        stopLoss: stopLoss || 'none',
        takeProfit: takeProfit || 'none'
      });

      const response = await client.post('/api/v1/orders', {
        symbol: mt4Symbol,
        side: side === 'buy' ? 'BUY' : 'SELL',
        volume: volume,
        stopLoss: stopLoss || 0,
        takeProfit: takeProfit || 0,
        slippage: 3 // pips
      });

      if (!response.data.success) {
        throw new Error(`MT4 order failed: ${response.data.error}`);
      }

      const order = this.mapMT4OrderResponse(response.data);

      // Cache order for tracking
      await this.cacheOrderData(order);

      // Start polling for order updates
      setTimeout(() => this.pollOrderStatus(userId, order.ticket), this.orderPollingInterval);

      // Log success with details
      console.log(`[MT4 Service] ✅ Order created successfully:`, {
        ticket: order.ticket,
        symbol: order.symbol,
        side: order.type,
        volume: order.volume,
        openPrice: order.openPrice,
        latency_ms: response.data.latency_ms || 'unknown'
      });

      return order;

    } catch (error) {
      console.error(`Error creating MT4 market order:`, error);
      throw error;
    }
  }

  /**
   * Close position by ticket number
   */
  async closePosition(userId: string, ticket: number, volume?: number): Promise<MT4Order> {
    try {
      const client = await this.getClient(userId);

      // Debug logging
      console.log(`[MT4 Service] Closing position:`, {
        userId: userId.substring(0, 8) + '...',
        ticket,
        volume: volume || 'full position'
      });

      const response = await client.post('/api/v1/orders/close', {
        ticket: ticket,
        volume: volume || 0 // 0 means close full position
      });

      if (!response.data.success) {
        throw new Error(`MT4 close order failed: ${response.data.error}`);
      }

      const closedOrder = this.mapMT4OrderResponse(response.data);

      // Log successful closure
      console.log(`[MT4 Service] ✅ Position closed successfully:`, {
        ticket: closedOrder.ticket,
        symbol: closedOrder.symbol,
        openPrice: closedOrder.openPrice,
        closePrice: (closedOrder as any).closePrice,
        profit: closedOrder.profit
      });

      // Update cache
      await this.cacheOrderData(closedOrder);

      // Publish close event
      await redisService.publish(`mt4_order:${userId}`, {
        type: 'order_closed',
        ticket: ticket,
        profit: closedOrder.profit,
        closeTime: closedOrder.closeTime
      });

      console.log(`MT4 Position closed | Ticket: ${ticket} | Profit: ${closedOrder.profit}`);

      return closedOrder;

    } catch (error) {
      console.error(`Error closing MT4 position ${ticket}:`, error);
      throw error;
    }
  }

  /**
   * Close all open positions (optionally filtered by symbol)
   */
  async closeAllPositions(userId: string, universalSymbol?: string): Promise<{
    closed: number;
    failed: number;
    totalProfit: number;
  }> {
    try {
      const client = await this.getClient(userId);

      let mt4Symbol: string | undefined;

      if (universalSymbol) {
        mt4Symbol = await symbolMappingService.convertSymbol(universalSymbol, 'MT4') || undefined;
      }

      const response = await client.post('/api/v1/orders/close-all', {
        symbol: mt4Symbol || ''
      });

      if (!response.data.success) {
        throw new Error(`MT4 close all failed: ${response.data.error}`);
      }

      const result = {
        closed: response.data.closed || 0,
        failed: response.data.failed || 0,
        totalProfit: response.data.totalProfit || 0
      };

      console.log(`MT4 Close All | Closed: ${result.closed} | Failed: ${result.failed} | Profit: ${result.totalProfit}`);

      return result;

    } catch (error) {
      console.error('Error closing all MT4 positions:', error);
      throw error;
    }
  }

  /**
   * Get open positions
   */
  async getOpenPositions(userId: string, universalSymbol?: string): Promise<MT4Order[]> {
    try {
      const client = await this.getClient(userId);

      let mt4Symbol: string | undefined;

      if (universalSymbol) {
        mt4Symbol = await symbolMappingService.convertSymbol(universalSymbol, 'MT4') || undefined;
      }

      const params = mt4Symbol ? { symbol: mt4Symbol } : {};
      const response = await client.get('/api/v1/orders/open', { params });

      if (!response.data.success) {
        throw new Error(`MT4 get positions failed: ${response.data.error}`);
      }

      const positions: MT4Order[] = response.data.positions.map((pos: any) =>
        this.mapMT4OrderResponse({ ...response.data, ...pos })
      );

      // Cache positions
      for (const position of positions) {
        await this.cacheOrderData(position);
      }

      return positions;

    } catch (error) {
      console.error('Error getting MT4 open positions:', error);
      throw error;
    }
  }

  /**
   * Get account information
   */
  async getBalance(userId: string): Promise<MT4AccountInfo> {
    try {
      const client = await this.getClient(userId);

      const response = await client.get('/api/v1/account/info');

      if (!response.data.success) {
        throw new Error(`MT4 get account failed: ${response.data.error}`);
      }

      const account: MT4AccountInfo = {
        accountNumber: response.data.account.number,
        broker: response.data.account.broker,
        currency: response.data.account.currency,
        balance: parseFloat(response.data.account.balance),
        equity: parseFloat(response.data.account.equity),
        margin: parseFloat(response.data.account.margin),
        freeMargin: parseFloat(response.data.account.freeMargin),
        marginLevel: parseFloat(response.data.account.marginLevel),
        profit: parseFloat(response.data.account.profit)
      };

      // Cache account info
      await redisService.set(
        `mt4_account:${userId}`,
        JSON.stringify(account),
        300 // 5 minutes TTL
      );

      return account;

    } catch (error) {
      console.error('Error getting MT4 balance:', error);
      throw error;
    }
  }

  /**
   * Get available symbols at broker
   */
  async getAvailableSymbols(userId: string): Promise<MT4SymbolInfo[]> {
    try {
      // Check cache first
      const cacheKey = `mt4_symbols:${userId}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const client = await this.getClient(userId);

      const response = await client.get('/api/v1/symbols');

      if (!response.data.success) {
        throw new Error(`MT4 get symbols failed: ${response.data.error}`);
      }

      const symbols: MT4SymbolInfo[] = response.data.symbols.map((sym: any) => ({
        symbol: sym.symbol,
        description: sym.description || sym.symbol,
        digits: parseInt(sym.digits),
        point: parseFloat(sym.point),
        spread: parseFloat(sym.spread),
        bid: parseFloat(sym.bid),
        ask: parseFloat(sym.ask)
      }));

      // Cache symbols for 1 hour
      await redisService.set(cacheKey, JSON.stringify(symbols), 3600);

      return symbols;

    } catch (error) {
      console.error('Error getting MT4 symbols:', error);
      throw error;
    }
  }

  /**
   * Get symbol price
   */
  async getPrice(userId: string, universalSymbol: string): Promise<{ bid: number; ask: number; spread: number }> {
    try {
      const client = await this.getClient(userId);

      const mt4Symbol = await symbolMappingService.convertSymbol(universalSymbol, 'MT4');

      if (!mt4Symbol) {
        throw new Error(`Symbol ${universalSymbol} not available at MT4 broker`);
      }

      const response = await client.get(`/api/v1/price/${mt4Symbol}`);

      if (!response.data.success) {
        throw new Error(`MT4 get price failed: ${response.data.error}`);
      }

      return {
        bid: parseFloat(response.data.bid),
        ask: parseFloat(response.data.ask),
        spread: parseFloat(response.data.spread)
      };

    } catch (error) {
      console.error(`Error getting MT4 price for ${universalSymbol}:`, error);
      throw error;
    }
  }

  /**
   * Ping MT4 bridge to test connection (using user credentials)
   */
  async ping(userId: string): Promise<boolean> {
    try {
      const client = await this.getClient(userId);

      const response = await client.get('/api/v1/ping');

      return response.data.success === true;

    } catch (error) {
      console.error('Error pinging MT4 bridge:', error);
      return false;
    }
  }

  /**
   * Ping MT4 bridge directly using shared bridge credentials
   * Does not require user credentials - for status checking
   */
  async pingBridge(): Promise<{ connected: boolean; bridgeUrl?: string; error?: string }> {
    try {
      // Create a direct client with bridge credentials
      const bridgeUsername = process.env.MT4_BRIDGE_USERNAME || 'admin';
      const bridgePassword = process.env.MT4_BRIDGE_PASSWORD || 'changeme123';

      const client = axios.create({
        baseURL: this.bridgeURL,
        timeout: 10000,
        auth: {
          username: bridgeUsername,
          password: bridgePassword
        }
      });

      const response = await client.get('/api/v1/ping');

      if (response.data && response.data.zmq_connected) {
        return {
          connected: true,
          bridgeUrl: this.bridgeURL
        };
      } else {
        return {
          connected: false,
          error: 'Bridge responded but ZMQ not connected to MT4'
        };
      }

    } catch (error) {
      console.error('Error pinging MT4 bridge directly:', error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Bridge connection failed'
      };
    }
  }

  /**
   * Calculate lot size based on USDT amount and price
   * MT4 uses lots, not dollar amounts
   */
  async calculateLotSize(
    userId: string,
    universalSymbol: string,
    usdtAmount: number
  ): Promise<number> {
    try {
      const price = await this.getPrice(userId, universalSymbol);

      // Get symbol info to determine contract size
      const mt4Symbol = await symbolMappingService.convertSymbol(universalSymbol, 'MT4');

      if (!mt4Symbol) {
        throw new Error(`Symbol ${universalSymbol} not available at MT4`);
      }

      // Standard lot sizes:
      // Forex: 1 lot = 100,000 units of base currency
      // Gold/Silver: 1 lot = 100 oz
      // Crypto: Varies by broker (typically 1 lot = 1 BTC, 1 ETH, etc.)

      const symbolInfo = await symbolMappingService.getSymbolInfo(universalSymbol);

      let contractSize = 100000; // Default for Forex

      if (symbolInfo) {
        if (symbolInfo.assetClass === 'COMMODITIES') {
          contractSize = 100; // 100 oz for metals
        } else if (symbolInfo.assetClass === 'CRYPTO') {
          contractSize = 1; // 1 unit for crypto
        }
      }

      // Calculate lot size
      const lotSize = usdtAmount / (price.ask * contractSize);

      // Round to 2 decimal places (standard for MT4)
      const roundedLotSize = Math.round(lotSize * 100) / 100;

      // Ensure minimum lot size of 0.01
      return Math.max(0.01, roundedLotSize);

    } catch (error) {
      console.error(`Error calculating lot size for ${universalSymbol}:`, error);
      throw error;
    }
  }

  /**
   * Decrypt MT4 credentials
   */
  private decryptCredentials(encryptedCreds: any): MT4Credentials {
    try {
      return {
        serverUrl: decrypt(JSON.parse(encryptedCreds.serverUrl)),
        accountNumber: decrypt(JSON.parse(encryptedCreds.accountNumber)),
        password: decrypt(JSON.parse(encryptedCreds.password)),
        brokerName: encryptedCreds.brokerName
      };
    } catch (error) {
      console.error('Error decrypting MT4 credentials:', error);
      throw new Error('Invalid MT4 credentials format');
    }
  }

  /**
   * Map MT4 API response to MT4Order interface
   */
  private mapMT4OrderResponse(data: any): MT4Order {
    return {
      ticket: parseInt(data.ticket),
      symbol: data.symbol,
      type: data.type?.toLowerCase() as 'buy' | 'sell',
      volume: parseFloat(data.volume),
      openPrice: parseFloat(data.openPrice),
      currentPrice: data.currentPrice ? parseFloat(data.currentPrice) : undefined,
      stopLoss: data.sl ? parseFloat(data.sl) : undefined,
      takeProfit: data.tp ? parseFloat(data.tp) : undefined,
      profit: parseFloat(data.profit || '0'),
      swap: parseFloat(data.swap || '0'),
      commission: parseFloat(data.commission || '0'),
      openTime: new Date(data.openTime),
      closeTime: data.closeTime ? new Date(data.closeTime) : undefined,
      status: data.closeTime ? 'closed' : 'open'
    };
  }

  /**
   * Cache order data in Redis
   */
  private async cacheOrderData(order: MT4Order): Promise<void> {
    try {
      const cacheKey = `mt4_order:${order.ticket}`;
      await redisService.set(cacheKey, JSON.stringify(order), 3600);

      // Also add to symbol-specific orders list
      const symbolOrdersKey = `mt4_orders:${order.symbol}`;
      await redisService.zadd(symbolOrdersKey, Date.now(), order.ticket.toString());

      // Add to memory cache
      this.orderCache.set(order.ticket, order);

    } catch (error) {
      console.error('Error caching MT4 order:', error);
    }
  }

  /**
   * Poll order status for updates
   */
  private async pollOrderStatus(userId: string, ticket: number): Promise<void> {
    let attempts = 0;
    const maxAttempts = 30; // 1 minute max

    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        const client = await this.getClient(userId);
        const response = await client.get(`/api/v1/orders/${ticket}`);

        if (response.data.success && response.data.order) {
          const order = this.mapMT4OrderResponse(response.data.order);
          await this.cacheOrderData(order);

          if (order.status === 'closed') {
            // Publish update
            await redisService.publish(`mt4_order:${userId}`, {
              type: 'order_closed',
              ticket: ticket,
              profit: order.profit,
              closeTime: order.closeTime
            });

            clearInterval(pollInterval);
            return;
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
        }

      } catch (error) {
        console.error(`Error polling MT4 order ${ticket}:`, error);
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
        }
      }
    }, this.orderPollingInterval);
  }

  /**
   * Clear user client cache
   */
  clearUserClient(userId: string): void {
    this.clients.delete(userId);
    console.log(`Cleared MT4 client cache for user ${userId}`);
  }
}

export const mt4Service = new MT4Service();
