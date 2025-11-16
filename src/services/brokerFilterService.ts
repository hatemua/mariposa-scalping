/**
 * Broker Filter Service
 *
 * Filters trading signals based on symbol availability at user's broker.
 * Prevents execution of signals for symbols not supported by the broker.
 *
 * Examples:
 * - OKX agent receives EURUSD signal → Skip (not available)
 * - MT4 agent receives AVAXUSD signal → Skip (not available)
 * - MT4 agent receives XAUUSD signal → Execute (available)
 */

import { symbolMappingService } from './symbolMappingService';
import { redisService } from './redisService';

interface BrokerCapabilities {
  broker: 'OKX' | 'MT4' | 'BINANCE';
  availableSymbols: string[];
  supportedAssetClasses: Array<'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'INDICES'>;
  lastUpdated: Date;
}

interface SignalFilterResult {
  allowed: boolean;
  reason?: string;
  brokerSymbol?: string;
}

export class BrokerFilterService {
  private readonly CACHE_PREFIX = 'broker_capabilities:';
  private readonly CACHE_TTL = 3600; // 1 hour

  /**
   * Check if signal can be executed by user's broker
   * NEW: Enforces BTC-only for MT4 scalping agents
   */
  async canExecuteSignal(
    universalSymbol: string,
    userBroker: 'OKX' | 'MT4' | 'BINANCE',
    agentCategory?: string
  ): Promise<SignalFilterResult> {
    try {
      // NEW: MT4 Scalping agents can ONLY trade BTC
      if (userBroker === 'MT4' && agentCategory === 'SCALPING') {
        const isBTC = this.isBTCSymbol(universalSymbol);

        if (!isBTC) {
          return {
            allowed: false,
            reason: `MT4 scalping agents can only trade BTC. Symbol ${universalSymbol} not allowed.`
          };
        }
      }

      // Convert to broker-specific symbol
      const brokerSymbol = await symbolMappingService.convertSymbol(
        universalSymbol,
        userBroker
      );

      if (!brokerSymbol) {
        return {
          allowed: false,
          reason: `Symbol ${universalSymbol} not available at ${userBroker}`
        };
      }

      // Check if symbol is in broker's available symbols
      const capabilities = await this.getBrokerCapabilities(userBroker);

      if (!capabilities.availableSymbols.includes(universalSymbol)) {
        return {
          allowed: false,
          reason: `Symbol ${universalSymbol} not supported by ${userBroker}`
        };
      }

      return {
        allowed: true,
        brokerSymbol: brokerSymbol
      };

    } catch (error) {
      console.error(`Error filtering signal for ${universalSymbol} at ${userBroker}:`, error);
      return {
        allowed: false,
        reason: `Error checking symbol availability: ${(error as Error).message}`
      };
    }
  }

  /**
   * Check if symbol is BTC
   */
  private isBTCSymbol(symbol: string): boolean {
    const normalizedSymbol = symbol.toUpperCase();
    const btcVariants = ['BTCUSD', 'BTCUSDT', 'BTC', 'BTCUSDM', 'XBTUSD'];

    return btcVariants.some(variant => normalizedSymbol.includes(variant));
  }

  /**
   * Filter signals for MT4 scalping (BTC only)
   */
  async filterBTCOnlyForMT4(
    signals: Array<{ symbol: string; [key: string]: any }>,
    agentBroker: 'OKX' | 'MT4' | 'BINANCE',
    agentCategory?: string
  ): Promise<Array<{ signal: any; brokerSymbol: string }>> {
    if (agentBroker !== 'MT4' || agentCategory !== 'SCALPING') {
      // Not an MT4 scalping agent, use normal filtering
      return this.filterSignalsForAgent(signals, agentBroker);
    }

    // MT4 scalping: Only allow BTC signals
    const filteredSignals: Array<{ signal: any; brokerSymbol: string }> = [];

    for (const signal of signals) {
      if (this.isBTCSymbol(signal.symbol)) {
        const filterResult = await this.canExecuteSignal(signal.symbol, agentBroker, agentCategory);

        if (filterResult.allowed && filterResult.brokerSymbol) {
          filteredSignals.push({
            signal,
            brokerSymbol: filterResult.brokerSymbol
          });
        }
      } else {
        console.log(`⏭️  Signal filtered: ${signal.symbol} not BTC - MT4 scalping agents trade BTC only`);
      }
    }

    return filteredSignals;
  }

  /**
   * Get broker capabilities (available symbols, asset classes)
   */
  async getBrokerCapabilities(broker: 'OKX' | 'MT4' | 'BINANCE'): Promise<BrokerCapabilities> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}${broker}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);
        parsed.lastUpdated = new Date(parsed.lastUpdated);
        return parsed;
      }

      // Fetch capabilities from symbol mapping service
      const availableSymbols = await symbolMappingService.getAvailableSymbols(broker);

      // Determine supported asset classes
      const supportedAssetClasses = new Set<'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'INDICES'>();

      for (const symbol of availableSymbols) {
        const info = await symbolMappingService.getSymbolInfo(symbol);
        if (info) {
          supportedAssetClasses.add(info.assetClass);
        }
      }

      const capabilities: BrokerCapabilities = {
        broker,
        availableSymbols,
        supportedAssetClasses: Array.from(supportedAssetClasses),
        lastUpdated: new Date()
      };

      // Cache capabilities
      await redisService.set(cacheKey, JSON.stringify(capabilities), this.CACHE_TTL);

      return capabilities;

    } catch (error) {
      console.error(`Error getting broker capabilities for ${broker}:`, error);
      throw error;
    }
  }

  /**
   * Filter signals for specific agent based on their broker
   */
  async filterSignalsForAgent(
    signals: Array<{ symbol: string; [key: string]: any }>,
    agentBroker: 'OKX' | 'MT4' | 'BINANCE'
  ): Promise<Array<{ signal: any; brokerSymbol: string }>> {
    try {
      const filteredSignals: Array<{ signal: any; brokerSymbol: string }> = [];

      for (const signal of signals) {
        const filterResult = await this.canExecuteSignal(signal.symbol, agentBroker);

        if (filterResult.allowed && filterResult.brokerSymbol) {
          filteredSignals.push({
            signal,
            brokerSymbol: filterResult.brokerSymbol
          });
        } else {
          // Log filtered signal
          console.log(
            `Signal filtered: ${signal.symbol} not available for ${agentBroker} - ${filterResult.reason}`
          );
        }
      }

      return filteredSignals;

    } catch (error) {
      console.error('Error filtering signals:', error);
      return [];
    }
  }

  /**
   * Check if broker supports specific asset class
   */
  async supportsAssetClass(
    broker: 'OKX' | 'MT4' | 'BINANCE',
    assetClass: 'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'INDICES'
  ): Promise<boolean> {
    try {
      const capabilities = await this.getBrokerCapabilities(broker);
      return capabilities.supportedAssetClasses.includes(assetClass);
    } catch (error) {
      console.error(`Error checking asset class support for ${broker}:`, error);
      return false;
    }
  }

  /**
   * Get symbols by asset class that are available at broker
   */
  async getSymbolsByAssetClass(
    broker: 'OKX' | 'MT4' | 'BINANCE',
    assetClass: 'FOREX' | 'COMMODITIES' | 'CRYPTO' | 'INDICES'
  ): Promise<string[]> {
    try {
      return await symbolMappingService.getSymbolsByAssetClass(assetClass, broker);
    } catch (error) {
      console.error(`Error getting symbols by asset class for ${broker}:`, error);
      return [];
    }
  }

  /**
   * Get recommended symbols for agent based on broker and strategy
   */
  async getRecommendedSymbols(
    broker: 'OKX' | 'MT4' | 'BINANCE',
    agentCategory: 'SCALPING' | 'SWING' | 'DAY_TRADING' | 'LONG_TERM' | 'ARBITRAGE'
  ): Promise<string[]> {
    try {
      const capabilities = await this.getBrokerCapabilities(broker);

      // Filter symbols based on agent category
      const recommended: string[] = [];

      for (const symbol of capabilities.availableSymbols) {
        const info = await symbolMappingService.getSymbolInfo(symbol);

        if (!info) continue;

        // Scalping: High liquidity, tight spreads (major pairs, BTC, ETH, Gold)
        if (agentCategory === 'SCALPING') {
          if (
            info.type === 'MAJOR' ||
            (info.assetClass === 'COMMODITIES' && symbol === 'XAUUSD') ||
            (info.assetClass === 'CRYPTO' && ['BTCUSD', 'ETHUSD'].includes(symbol))
          ) {
            recommended.push(symbol);
          }
        }
        // Swing/Day Trading: Major + some minor pairs
        else if (agentCategory === 'SWING' || agentCategory === 'DAY_TRADING') {
          if (info.type === 'MAJOR' || info.type === 'MINOR') {
            recommended.push(symbol);
          }
        }
        // Long-term: All available
        else if (agentCategory === 'LONG_TERM') {
          recommended.push(symbol);
        }
        // Arbitrage: Crypto only (needs multiple exchanges)
        else if (agentCategory === 'ARBITRAGE') {
          if (info.assetClass === 'CRYPTO') {
            recommended.push(symbol);
          }
        }
      }

      return recommended;

    } catch (error) {
      console.error('Error getting recommended symbols:', error);
      return [];
    }
  }

  /**
   * Validate agent configuration against broker capabilities
   */
  async validateAgentConfiguration(
    broker: 'OKX' | 'MT4' | 'BINANCE',
    agentConfig: {
      category?: string;
      symbols?: string[];
      assetClasses?: string[];
    }
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];

      const capabilities = await this.getBrokerCapabilities(broker);

      // Validate symbols if specified
      if (agentConfig.symbols && agentConfig.symbols.length > 0) {
        for (const symbol of agentConfig.symbols) {
          if (!capabilities.availableSymbols.includes(symbol)) {
            errors.push(`Symbol ${symbol} not available at ${broker}`);
          }
        }
      }

      // Validate asset classes if specified
      if (agentConfig.assetClasses && agentConfig.assetClasses.length > 0) {
        for (const assetClass of agentConfig.assetClasses) {
          if (!capabilities.supportedAssetClasses.includes(assetClass as any)) {
            errors.push(`Asset class ${assetClass} not supported by ${broker}`);
          }
        }
      }

      // Warnings for broker-specific limitations
      if (broker === 'MT4' && agentConfig.assetClasses?.includes('CRYPTO')) {
        const cryptoSymbols = await this.getSymbolsByAssetClass(broker, 'CRYPTO');
        if (cryptoSymbols.length < 5) {
          warnings.push('MT4 has limited crypto symbol support. Consider using OKX for crypto trading.');
        }
      }

      if (broker === 'OKX' && agentConfig.assetClasses?.includes('FOREX')) {
        warnings.push('OKX does not support traditional Forex pairs. Use MT4 for Forex trading.');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      console.error('Error validating agent configuration:', error);
      return {
        valid: false,
        errors: [`Validation error: ${(error as Error).message}`],
        warnings: []
      };
    }
  }

  /**
   * Clear broker capabilities cache
   */
  async clearCache(broker?: 'OKX' | 'MT4' | 'BINANCE'): Promise<void> {
    try {
      if (broker) {
        const cacheKey = `${this.CACHE_PREFIX}${broker}`;
        await redisService.del(cacheKey);
        console.log(`Cleared capabilities cache for ${broker}`);
      } else {
        // Clear all broker caches
        const keys = await redisService.keys(`${this.CACHE_PREFIX}*`);
        for (const key of keys) {
          await redisService.del(key);
        }
        console.log(`Cleared ${keys.length} broker capability cache entries`);
      }
    } catch (error) {
      console.error('Error clearing broker capabilities cache:', error);
    }
  }

  /**
   * Get broker comparison (which broker supports which symbols)
   */
  async getBrokerComparison(): Promise<{
    [symbol: string]: {
      okx: boolean;
      mt4: boolean;
      binance: boolean;
    };
  }> {
    try {
      const comparison: any = {};
      const allMappings = symbolMappingService.getAllMappings();

      for (const mapping of allMappings) {
        comparison[mapping.universal] = {
          okx: mapping.okx !== null,
          mt4: mapping.mt4 !== null,
          binance: mapping.binance !== null
        };
      }

      return comparison;
    } catch (error) {
      console.error('Error generating broker comparison:', error);
      return {};
    }
  }
}

export const brokerFilterService = new BrokerFilterService();
