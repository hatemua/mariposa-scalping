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
  private sharedClient: AxiosInstance;
  private readonly bridgeURL = process.env.MT4_BRIDGE_URL || 'http://localhost:8080';
  private readonly bridgeUsername = process.env.MT4_BRIDGE_USERNAME || 'admin';
  private readonly bridgePassword = process.env.MT4_BRIDGE_PASSWORD || 'changeme123';
  private readonly orderPollingInterval = 2000; // 2 seconds
  private readonly orderCache = new Map<number, MT4Order>();
  private readonly ORDER_CACHE_MAX_SIZE = 1000; // Prevent unbounded growth
  private readonly orderCacheAccessTime = new Map<number, number>(); // Track access time for LRU
  private symbolInfoCache = new Map<string, { info: MT4SymbolInfo; timestamp: number }>();
  private readonly SYMBOL_CACHE_TTL = 300000; // 5 minutes

  constructor() {
    // Create ONE shared client for all users using environment credentials
    console.log(`🔧 Initializing MT4 Service with shared bridge: ${this.bridgeURL}`);

    this.sharedClient = axios.create({
      baseURL: this.bridgeURL,
      timeout: 5000, // 5 seconds - optimized for scalping
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for Basic Authentication with shared bridge credentials
    this.sharedClient.interceptors.request.use((config) => {
      const auth = Buffer.from(`${this.bridgeUsername}:${this.bridgePassword}`).toString('base64');
      config.headers['Authorization'] = `Basic ${auth}`;
      return config;
    });

    // Add response interceptor for error handling
    this.sharedClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          console.error(`MT4 Bridge Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          console.error('MT4 Bridge Error: No response from bridge. Is MT4 bridge running?');
          console.error(`  Bridge URL: ${this.bridgeURL}`);
        } else {
          console.error(`MT4 Bridge Error: ${error.message}`);
        }
        throw error;
      }
    );

    console.log(`✅ MT4 Service initialized - using shared bridge at ${this.bridgeURL}`);
  }

  /**
   * Get MT4 client (now returns shared client for all users)
   * userId parameter kept for backward compatibility and logging
   */
  async getClient(userId: string): Promise<AxiosInstance> {
    // Simply return the shared client - no user credential lookup needed
    console.log(`[MT4 Service] Getting shared client for user ${userId.substring(0, 8)}...`);
    return this.sharedClient;
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

      // Generate agent-specific magic number (use first 6 digits of userId hash)
      const magicNumber = this.generateMagicNumber(userId);

      // Retry logic for order creation (handles requotes/slippage errors)
      let response;
      let lastError;
      const maxRetries = 3;
      const retryDelay = 500; // ms

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await client.post('/api/v1/orders', {
            symbol: mt4Symbol,
            side: side === 'buy' ? 'BUY' : 'SELL',
            volume: volume,
            stopLoss: stopLoss ?? 0,
            takeProfit: takeProfit ?? 0,
            magicNumber: magicNumber
          });

          // Debug: Log full response to verify structure
          console.log(`[DEBUG] MT4 Bridge create order response (attempt ${attempt}):`, JSON.stringify(response.data, null, 2));

          if (response.data.success) {
            // Success! Break out of retry loop
            break;
          }

          // Check if error is retryable
          const error = response.data.error || '';
          const isRetryable = error.includes('138') || // Requote
                              error.includes('136') || // Off quotes
                              error.includes('146');   // Trade context busy

          if (!isRetryable || attempt === maxRetries) {
            throw new Error(`MT4 order failed: ${error}`);
          }

          // Retryable error - wait and retry
          console.warn(`⚠️  Retryable error (attempt ${attempt}/${maxRetries}): ${error}`);
          console.log(`   Waiting ${retryDelay}ms before retry...`);
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Exponential backoff

        } catch (error: any) {
          if (attempt === maxRetries) {
            throw error;
          }
          lastError = error.message;
          console.warn(`⚠️  Request failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }

      if (!response || !response.data.success) {
        throw new Error(`MT4 order failed after ${maxRetries} attempts: ${lastError}`);
      }

      // FIX: MT4 Bridge returns { success, data: {...}, error }
      // We need response.data.data (the nested order object)
      const order = this.mapMT4OrderResponse(response.data.data);

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

      // Pre-close validation: Verify position still exists in MT4
      try {
        const openPositions = await this.getOpenPositions(userId);
        const positionExists = openPositions.some(p => p.ticket === ticket);

        if (!positionExists) {
          console.warn(`[MT4 Service] Position ${ticket} not found in MT4. It may already be closed.`);
          const error = new Error(`Position ${ticket} already closed or does not exist`);
          (error as any).code = 'ERR_4108';
          (error as any).mt4ErrorCode = 4108;
          throw error;
        }
      } catch (validationError: any) {
        // If validation itself failed, log but continue (might be network issue)
        if (validationError.code === 'ERR_4108' || validationError.mt4ErrorCode === 4108) {
          throw validationError; // Re-throw 4108 errors
        }
        console.warn(`[MT4 Service] Could not validate position ${ticket} before closing:`, validationError.message);
      }

      // Retry logic for retryable errors (like 146 - trade context busy)
      const maxRetries = 3;
      const baseDelay = 500; // ms
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await client.post('/api/v1/orders/close', {
            ticket: ticket,
            volume: volume || 0 // 0 means close full position
          });

          // Debug: Log full response
          console.log('[DEBUG] MT4 Bridge close order response:', JSON.stringify(response.data, null, 2));

          if (response.data.success) {
            // Success - return the result
            const closedOrder = this.mapMT4OrderResponse(response.data.data);
            // Force status to 'closed' since MT4 bridge close response is minimal and doesn't include closeTime
            closedOrder.status = 'closed';

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
          }

          // Error occurred - analyze if retryable
          const errorMsg = response.data.error || '';
          const mt4ErrorMatch = errorMsg.match(/error code:\s*(\d+)/i);
          const mt4ErrorCode = mt4ErrorMatch ? parseInt(mt4ErrorMatch[1]) : null;

          // Non-retryable errors (throw immediately)
          if (mt4ErrorCode === 4108 || errorMsg.includes('invalid ticket')) {
            // Invalid ticket - position doesn't exist
            const error = new Error(`MT4 close order failed: ${errorMsg}`);
            (error as any).mt4ErrorCode = mt4ErrorCode;
            throw error;
          }

          // Retryable errors (e.g., 146 = trade context busy, 4 = trade server busy)
          const retryableErrors = [4, 6, 8, 129, 136, 137, 146];
          const isRetryable = mt4ErrorCode && retryableErrors.includes(mt4ErrorCode);

          if (!isRetryable || attempt === maxRetries) {
            // Not retryable or max retries reached
            const error = new Error(`MT4 close order failed: ${errorMsg}`);
            (error as any).mt4ErrorCode = mt4ErrorCode;
            throw error;
          }

          // Log retry attempt
          console.log(
            `[MT4 Service] Retryable error (${mt4ErrorCode}) on attempt ${attempt}/${maxRetries}: ${errorMsg}. ` +
            `Retrying in ${baseDelay * attempt}ms...`
          );

          lastError = new Error(`MT4 close order failed: ${errorMsg}`);
          (lastError as any).mt4ErrorCode = mt4ErrorCode;

          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));

        } catch (error: any) {
          lastError = error;

          // If it's a non-retryable error (like 4108), throw immediately
          if (error.mt4ErrorCode === 4108 || error.message?.includes('already closed')) {
            throw error;
          }

          // If max retries reached, throw
          if (attempt === maxRetries) {
            throw error;
          }

          // Otherwise wait and retry
          console.log(`[MT4 Service] Request failed on attempt ${attempt}/${maxRetries}. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
        }
      }

      // If we get here, all retries failed
      throw lastError || new Error('Failed to close position after multiple attempts');

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
        closed: response.data.data.closed || 0,
        failed: response.data.data.failed || 0,
        totalProfit: response.data.data.totalProfit || 0
      };

      console.log(`MT4 Close All | Closed: ${result.closed} | Failed: ${result.failed} | Profit: ${result.totalProfit}`);

      return result;

    } catch (error) {
      console.error('Error closing all MT4 positions:', error);
      throw error;
    }
  }

  /**
   * Modify stop loss and/or take profit for an existing position
   * Used for break-even and trailing stop functionality
   */
  async modifyStopLoss(
    userId: string,
    ticket: number,
    newStopLoss?: number,
    newTakeProfit?: number
  ): Promise<MT4Order> {
    try {
      const client = await this.getClient(userId);

      console.log(`[MT4 Service] Modifying position ${ticket}:`, {
        userId: userId.substring(0, 8) + '...',
        ticket,
        newStopLoss: newStopLoss || 'unchanged',
        newTakeProfit: newTakeProfit || 'unchanged'
      });

      // Retry logic for retryable errors
      const maxRetries = 3;
      const baseDelay = 500;
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await client.put(`/api/v1/orders/${ticket}`, {
            stopLoss: newStopLoss ?? null,
            takeProfit: newTakeProfit ?? null
          });

          console.log('[DEBUG] MT4 Bridge modify order response:', JSON.stringify(response.data, null, 2));

          if (response.data.success) {
            const modifiedOrder = this.mapMT4OrderResponse(response.data.data);

            // Update cache
            await this.cacheOrderData(modifiedOrder);

            console.log(`[MT4 Service] ✅ Position ${ticket} modified successfully:`, {
              stopLoss: modifiedOrder.stopLoss,
              takeProfit: modifiedOrder.takeProfit
            });

            return modifiedOrder;
          }

          // Check for retryable errors
          const errorMsg = response.data.error || '';
          const mt4ErrorCode = parseInt(errorMsg.match(/\d+/)?.[0] || '0');
          const isRetryable = [138, 136, 146].includes(mt4ErrorCode);

          if (!isRetryable || attempt === maxRetries) {
            throw new Error(`MT4 modify order failed: ${errorMsg}`);
          }

          console.log(`[MT4 Service] Retryable error on attempt ${attempt}/${maxRetries}: ${errorMsg}`);
          lastError = new Error(errorMsg);
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));

        } catch (error: any) {
          lastError = error;
          if (attempt === maxRetries) throw error;
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
        }
      }

      throw lastError || new Error('Failed to modify position after multiple attempts');

    } catch (error) {
      console.error(`Error modifying MT4 position ${ticket}:`, error);
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

      // Debug: Log response structure
      console.log('[DEBUG] MT4 Bridge open positions response:', JSON.stringify(response.data, null, 2));

      if (!response.data.success) {
        throw new Error(`MT4 get positions failed: ${response.data.error}`);
      }

      // FIX: MT4 Bridge returns { success, data: { orders: [...] } }
      // Access response.data.data.orders or response.data.orders
      const ordersArray = response.data.data?.orders || response.data.orders || [];
      const positions: MT4Order[] = ordersArray.map((pos: any) =>
        this.mapMT4OrderResponse(pos)
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

      // MT4 EA returns data flat (not nested under 'account')
      const data = response.data.data;
      const margin = parseFloat(data.margin);
      const equity = parseFloat(data.equity);

      const account: MT4AccountInfo = {
        accountNumber: 0, // Not returned by MT4 EA
        broker: 'MT4', // Not returned by MT4 EA
        currency: data.currency,
        balance: parseFloat(data.balance),
        equity: equity,
        margin: margin,
        freeMargin: parseFloat(data.freeMargin),
        marginLevel: margin > 0 ? (equity / margin) * 100 : 0,
        profit: parseFloat(data.profit)
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

      const symbols: MT4SymbolInfo[] = response.data.data.symbols.map((sym: any) => ({
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
        bid: parseFloat(response.data.data.bid),
        ask: parseFloat(response.data.data.ask),
        spread: parseFloat(response.data.data.spread)
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
   * Calculate lot size for MT4 trading
   *
   * STRATEGY: Use FIXED LOT SIZE for predictable risk management
   * This ensures consistent position sizing regardless of signal/LLM recommendations
   *
   * Config from .env:
   * - MT4_DEFAULT_LOT_SIZE: Fixed lot size to use (default: 0.10)
   * - MT4_MIN_LOT_SIZE: Minimum allowed (default: 0.01)
   * - MT4_MAX_LOT_SIZE: Maximum allowed (default: 1.0)
   *
   * Why fixed lot size?
   * - Predictable risk: 0.10 lot with 200 pt SL = ~$20 max loss
   * - No complex calculations that could fail
   * - Easy to adjust in .env without code changes
   * - LLM position size recommendations were unreliable (varied wildly)
   */
  async calculateLotSize(
    userId: string,
    universalSymbol: string,
    usdtAmount: number,
    stopLossPrice?: number,
    entryPrice?: number
  ): Promise<number> {
    try {
      // Get fixed lot size from environment
      const defaultLotSize = parseFloat(process.env.MT4_DEFAULT_LOT_SIZE || '0.10');
      const minLot = parseFloat(process.env.MT4_MIN_LOT_SIZE || '0.01');
      const maxLot = parseFloat(process.env.MT4_MAX_LOT_SIZE || '1.0');

      console.log(`💰 [LOT SIZE] Using FIXED lot size strategy:`);
      console.log(`   Default lot: ${defaultLotSize}`);
      console.log(`   Min lot: ${minLot}`);
      console.log(`   Max lot: ${maxLot}`);
      console.log(`   (Input usdtAmount=${usdtAmount} ignored - using fixed sizing)`);

      // Apply limits
      let lotSize = Math.max(minLot, Math.min(maxLot, defaultLotSize));

      // Round to 2 decimal places (standard for MT4)
      const finalLotSize = Math.floor(lotSize * 100) / 100;

      console.log(`   Final lot size: ${finalLotSize}`);

      // Log estimated risk for transparency
      if (stopLossPrice && entryPrice) {
        const slDistance = Math.abs(entryPrice - stopLossPrice);
        const estimatedRisk = finalLotSize * slDistance;
        console.log(`   Estimated risk: $${estimatedRisk.toFixed(2)} (SL distance: ${slDistance.toFixed(2)} pts)`);
      }

      return finalLotSize;

    } catch (error) {
      console.error(`Error calculating lot size for ${universalSymbol}:`, error);
      // Return default on error
      const fallbackLot = parseFloat(process.env.MT4_DEFAULT_LOT_SIZE || '0.10');
      console.warn(`   Using fallback lot size: ${fallbackLot}`);
      return fallbackLot;
    }
  }

  /**
   * Generate unique magic number based on userId
   * Creates a 6-digit number from userId hash for tracking orders per agent
   */
  private generateMagicNumber(userId: string): number {
    // Create a simple hash from userId
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }

    // Use absolute value and ensure it's 6 digits (100000-999999)
    const magicNumber = 100000 + (Math.abs(hash) % 900000);

    return magicNumber;
  }

  /**
   * Decrypt MT4 credentials
   */
  /**
   * DEPRECATED: No longer needed with shared bridge credentials
   * Kept for reference only
   */
  // private decryptCredentials(encryptedCreds: any): MT4Credentials {
  //   try {
  //     return {
  //       serverUrl: decrypt(JSON.parse(encryptedCreds.serverUrl)),
  //       accountNumber: decrypt(JSON.parse(encryptedCreds.accountNumber)),
  //       password: decrypt(JSON.parse(encryptedCreds.password)),
  //       brokerName: encryptedCreds.brokerName
  //     };
  //   } catch (error) {
  //     console.error('Error decrypting MT4 credentials:', error);
  //     throw new Error('Invalid MT4 credentials format');
  //   }
  // }

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
      stopLoss: data.stopLoss ? parseFloat(data.stopLoss) : undefined,
      takeProfit: data.takeProfit ? parseFloat(data.takeProfit) : undefined,
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

      // Add to memory cache with LRU eviction
      if (this.orderCache.size >= this.ORDER_CACHE_MAX_SIZE) {
        // Find and remove least recently used entry
        let oldestTicket: number | null = null;
        let oldestTime = Date.now();

        for (const [ticket, accessTime] of this.orderCacheAccessTime.entries()) {
          if (accessTime < oldestTime) {
            oldestTime = accessTime;
            oldestTicket = ticket;
          }
        }

        if (oldestTicket !== null) {
          this.orderCache.delete(oldestTicket);
          this.orderCacheAccessTime.delete(oldestTicket);
          console.log(`🗑️  Evicted order ${oldestTicket} from cache (LRU)`);
        }
      }

      this.orderCache.set(order.ticket, order);
      this.orderCacheAccessTime.set(order.ticket, Date.now());

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

        if (response.data.success && response.data.data.order) {
          const order = this.mapMT4OrderResponse(response.data.data.order);
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
  /**
   * DEPRECATED: No longer needed with shared client
   * Kept for backward compatibility (does nothing)
   */
  clearUserClient(userId: string): void {
    console.log(`[MT4 Service] clearUserClient called for ${userId} - no-op with shared client`);
  }
}

export const mt4Service = new MT4Service();
