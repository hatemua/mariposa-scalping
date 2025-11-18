/**
 * Symbol Mapping Service
 *
 * Provides universal symbol format translation between different brokers:
 * - OKX: GOLD-USDT, BTC-USDT, AVAX-USDT
 * - MT4: XAUUSD, BTCUSD, (no AVAX)
 * - Binance: BTCUSDT, AVAXUSDT
 *
 * Universal format: XAUUSD, XAGUSD, EURUSD, BTCUSD, ETHUSD, etc.
 */

import { redisService } from './redisService';

interface SymbolMapping {
  universal: string;
  okx?: string;
  mt4?: string;
  binance?: string;
  description: string;
  assetClass: 'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'INDICES';
  type: 'MAJOR' | 'MINOR' | 'EXOTIC' | 'SPOT' | 'FUTURES';
}

export class SymbolMappingService {
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly CACHE_PREFIX = 'symbol_mapping:';

  // Static symbol mappings (most common)
  private readonly STATIC_MAPPINGS: SymbolMapping[] = [
    // Forex Major Pairs
    { universal: 'EURUSD', okx: undefined, mt4: 'EURUSD', binance: undefined, description: 'Euro vs US Dollar', assetClass: 'FOREX', type: 'MAJOR' },
    { universal: 'GBPUSD', okx: undefined, mt4: 'GBPUSD', binance: undefined, description: 'British Pound vs US Dollar', assetClass: 'FOREX', type: 'MAJOR' },
    { universal: 'USDJPY', okx: undefined, mt4: 'USDJPY', binance: undefined, description: 'US Dollar vs Japanese Yen', assetClass: 'FOREX', type: 'MAJOR' },
    { universal: 'USDCHF', okx: undefined, mt4: 'USDCHF', binance: undefined, description: 'US Dollar vs Swiss Franc', assetClass: 'FOREX', type: 'MAJOR' },
    { universal: 'AUDUSD', okx: undefined, mt4: 'AUDUSD', binance: undefined, description: 'Australian Dollar vs US Dollar', assetClass: 'FOREX', type: 'MAJOR' },
    { universal: 'USDCAD', okx: undefined, mt4: 'USDCAD', binance: undefined, description: 'US Dollar vs Canadian Dollar', assetClass: 'FOREX', type: 'MAJOR' },
    { universal: 'NZDUSD', okx: undefined, mt4: 'NZDUSD', binance: undefined, description: 'New Zealand Dollar vs US Dollar', assetClass: 'FOREX', type: 'MAJOR' },

    // Forex Cross Pairs
    { universal: 'EURGBP', okx: undefined, mt4: 'EURGBP', binance: undefined, description: 'Euro vs British Pound', assetClass: 'FOREX', type: 'MINOR' },
    { universal: 'EURJPY', okx: undefined, mt4: 'EURJPY', binance: undefined, description: 'Euro vs Japanese Yen', assetClass: 'FOREX', type: 'MINOR' },
    { universal: 'GBPJPY', okx: undefined, mt4: 'GBPJPY', binance: undefined, description: 'British Pound vs Japanese Yen', assetClass: 'FOREX', type: 'MINOR' },
    { universal: 'EURAUD', okx: undefined, mt4: 'EURAUD', binance: undefined, description: 'Euro vs Australian Dollar', assetClass: 'FOREX', type: 'MINOR' },

    // Precious Metals / Commodities
    { universal: 'XAUUSD', okx: 'GOLD-USDT', mt4: 'XAUUSD', binance: undefined, description: 'Gold vs US Dollar', assetClass: 'COMMODITIES', type: 'SPOT' },
    { universal: 'XAGUSD', okx: 'SILVER-USDT', mt4: 'XAGUSD', binance: undefined, description: 'Silver vs US Dollar', assetClass: 'COMMODITIES', type: 'SPOT' },

    // Crypto (Major)
    { universal: 'BTCUSD', okx: 'BTC-USDT', mt4: 'BTCUSD', binance: 'BTCUSDT', description: 'Bitcoin vs US Dollar', assetClass: 'CRYPTO', type: 'MAJOR' },
    { universal: 'ETHUSD', okx: 'ETH-USDT', mt4: 'ETHUSD', binance: 'ETHUSDT', description: 'Ethereum vs US Dollar', assetClass: 'CRYPTO', type: 'MAJOR' },
    { universal: 'BNBUSD', okx: 'BNB-USDT', mt4: undefined, binance: 'BNBUSDT', description: 'Binance Coin vs US Dollar', assetClass: 'CRYPTO', type: 'MAJOR' },
    { universal: 'SOLUSD', okx: 'SOL-USDT', mt4: 'SOLUSD', binance: 'SOLUSDT', description: 'Solana vs US Dollar', assetClass: 'CRYPTO', type: 'MAJOR' },
    { universal: 'XRPUSD', okx: 'XRP-USDT', mt4: 'XRPUSD', binance: 'XRPUSDT', description: 'Ripple vs US Dollar', assetClass: 'CRYPTO', type: 'MAJOR' },

    // Crypto (Altcoins)
    { universal: 'ADAUSD', okx: 'ADA-USDT', mt4: undefined, binance: 'ADAUSDT', description: 'Cardano vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'DOTUSD', okx: 'DOT-USDT', mt4: undefined, binance: 'DOTUSDT', description: 'Polkadot vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'AVAXUSD', okx: 'AVAX-USDT', mt4: undefined, binance: 'AVAXUSDT', description: 'Avalanche vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'MATICUSD', okx: 'MATIC-USDT', mt4: undefined, binance: 'MATICUSDT', description: 'Polygon vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'LINKUSD', okx: 'LINK-USDT', mt4: undefined, binance: 'LINKUSDT', description: 'Chainlink vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'ATOMUSD', okx: 'ATOM-USDT', mt4: undefined, binance: 'ATOMUSDT', description: 'Cosmos vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'UNIUSD', okx: 'UNI-USDT', mt4: undefined, binance: 'UNIUSDT', description: 'Uniswap vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'LTCUSD', okx: 'LTC-USDT', mt4: 'LTCUSD', binance: 'LTCUSDT', description: 'Litecoin vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
    { universal: 'DOGEUSD', okx: 'DOGE-USDT', mt4: undefined, binance: 'DOGEUSDT', description: 'Dogecoin vs US Dollar', assetClass: 'CRYPTO', type: 'SPOT' },
  ];

  /**
   * Convert universal symbol to broker-specific format
   */
  async convertSymbol(
    universalSymbol: string,
    targetBroker: 'OKX' | 'MT4' | 'BINANCE'
  ): Promise<string | null> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}${universalSymbol}:${targetBroker}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return cached === 'null' ? null : cached;
      }

      // Find in static mappings
      const mapping = this.STATIC_MAPPINGS.find(m => m.universal === universalSymbol);

      if (mapping) {
        let result: string | null = null;

        switch (targetBroker) {
          case 'OKX':
            result = mapping.okx || null;
            break;
          case 'MT4':
            result = mapping.mt4 || null;
            break;
          case 'BINANCE':
            result = mapping.binance || null;
            break;
        }

        // Cache result
        await redisService.set(cacheKey, result || 'null', this.CACHE_TTL);
        return result;
      }

      // Not found in static mappings
      await redisService.set(cacheKey, 'null', this.CACHE_TTL);
      return null;

    } catch (error) {
      console.error(`Error converting symbol ${universalSymbol} to ${targetBroker}:`, error);
      return null;
    }
  }

  /**
   * Convert broker-specific symbol to universal format
   */
  async convertToUniversal(
    brokerSymbol: string,
    sourceBroker: 'OKX' | 'MT4' | 'BINANCE'
  ): Promise<string | null> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}${sourceBroker}:${brokerSymbol}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return cached === 'null' ? null : cached;
      }

      // Find in static mappings
      let mapping: SymbolMapping | undefined;

      switch (sourceBroker) {
        case 'OKX':
          mapping = this.STATIC_MAPPINGS.find(m => m.okx === brokerSymbol);
          break;
        case 'MT4':
          mapping = this.STATIC_MAPPINGS.find(m => m.mt4 === brokerSymbol);
          break;
        case 'BINANCE':
          mapping = this.STATIC_MAPPINGS.find(m => m.binance === brokerSymbol);
          break;
      }

      const result = mapping ? mapping.universal : null;

      // Cache result
      await redisService.set(cacheKey, result || 'null', this.CACHE_TTL);
      return result;

    } catch (error) {
      console.error(`Error converting ${sourceBroker} symbol ${brokerSymbol} to universal:`, error);
      return null;
    }
  }

  /**
   * Get symbol information
   */
  async getSymbolInfo(universalSymbol: string): Promise<SymbolMapping | null> {
    try {
      const mapping = this.STATIC_MAPPINGS.find(m => m.universal === universalSymbol);
      return mapping || null;
    } catch (error) {
      console.error(`Error getting symbol info for ${universalSymbol}:`, error);
      return null;
    }
  }

  /**
   * Check if symbol is available at specific broker
   */
  async isSymbolAvailable(
    universalSymbol: string,
    broker: 'OKX' | 'MT4' | 'BINANCE'
  ): Promise<boolean> {
    const brokerSymbol = await this.convertSymbol(universalSymbol, broker);
    return brokerSymbol !== null;
  }

  /**
   * Get all symbols available at broker
   */
  async getAvailableSymbols(broker: 'OKX' | 'MT4' | 'BINANCE'): Promise<string[]> {
    try {
      const symbols: string[] = [];

      for (const mapping of this.STATIC_MAPPINGS) {
        const isAvailable = await this.isSymbolAvailable(mapping.universal, broker);
        if (isAvailable) {
          symbols.push(mapping.universal);
        }
      }

      return symbols;
    } catch (error) {
      console.error(`Error getting available symbols for ${broker}:`, error);
      return [];
    }
  }

  /**
   * Get symbols by asset class
   */
  async getSymbolsByAssetClass(
    assetClass: 'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'INDICES',
    broker?: 'OKX' | 'MT4' | 'BINANCE'
  ): Promise<string[]> {
    try {
      let symbols = this.STATIC_MAPPINGS
        .filter(m => m.assetClass === assetClass)
        .map(m => m.universal);

      // Filter by broker availability if specified
      if (broker) {
        const availableSymbols: string[] = [];
        for (const symbol of symbols) {
          const isAvailable = await this.isSymbolAvailable(symbol, broker);
          if (isAvailable) {
            availableSymbols.push(symbol);
          }
        }
        return availableSymbols;
      }

      return symbols;
    } catch (error) {
      console.error(`Error getting symbols by asset class ${assetClass}:`, error);
      return [];
    }
  }

  /**
   * Get all symbol mappings
   */
  getAllMappings(): SymbolMapping[] {
    return [...this.STATIC_MAPPINGS];
  }

  /**
   * Clear symbol mapping cache
   */
  async clearCache(): Promise<void> {
    try {
      // Get all cache keys with the prefix
      const keys = await redisService.keys(`${this.CACHE_PREFIX}*`);

      // Delete all keys
      for (const key of keys) {
        await redisService.del(key);
      }

      console.log(`Cleared ${keys.length} symbol mapping cache entries`);
    } catch (error) {
      console.error('Error clearing symbol mapping cache:', error);
    }
  }

  /**
   * Add dynamic symbol mapping (for custom broker symbols)
   */
  async addDynamicMapping(mapping: SymbolMapping): Promise<void> {
    try {
      // Add to static mappings (in-memory)
      const existingIndex = this.STATIC_MAPPINGS.findIndex(
        m => m.universal === mapping.universal
      );

      if (existingIndex >= 0) {
        this.STATIC_MAPPINGS[existingIndex] = mapping;
      } else {
        this.STATIC_MAPPINGS.push(mapping);
      }

      // Clear cache for this symbol
      const cacheKeys = [
        `${this.CACHE_PREFIX}${mapping.universal}:OKX`,
        `${this.CACHE_PREFIX}${mapping.universal}:MT4`,
        `${this.CACHE_PREFIX}${mapping.universal}:BINANCE`,
      ];

      for (const key of cacheKeys) {
        await redisService.del(key);
      }

      console.log(`Added dynamic mapping for ${mapping.universal}`);
    } catch (error) {
      console.error('Error adding dynamic mapping:', error);
      throw error;
    }
  }
}

export const symbolMappingService = new SymbolMappingService();
