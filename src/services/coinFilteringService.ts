import { binanceService } from './binanceService';
import { redisService } from './redisService';
import { SymbolConverter } from '../utils/symbolConverter';

interface CoinMetrics {
  symbol: string;
  price: number;
  volume24h: number;
  volumeUSDT: number;
  change24h: number;
  volatility: number;
  liquidity: number;
  marketCap?: number;
  profitPotentialScore: number;
  lastUpdated: number;
}

interface FilterCriteria {
  minVolume?: number; // Minimum 24h volume in USDT
  minVolatility?: number; // Minimum volatility percentage
  minLiquidity?: number; // Minimum liquidity score
  maxCoins?: number; // Maximum number of coins to return
  excludeCoins?: string[]; // Coins to exclude
  includeOnly?: string[]; // Only include these coins
  sortBy?: 'volume' | 'volatility' | 'profitScore' | 'change';
  timeFrame?: '1h' | '4h' | '24h';
}

export class CoinFilteringService {
  private metricsCache = new Map<string, CoinMetrics>();
  private cacheExpiry = 60000; // 1 minute cache

  async getTopScalpingCoins(criteria: FilterCriteria = {}): Promise<CoinMetrics[]> {
    try {
      const cacheKey = `top_scalping_coins:${JSON.stringify(criteria)}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        console.log('Using cached top scalping coins');
        return JSON.parse(cached);
      }

      // Set default criteria for scalping
      const defaultCriteria: FilterCriteria = {
        minVolume: 5000000, // $5M minimum volume
        minVolatility: 2, // 2% minimum volatility
        minLiquidity: 100000, // $100k minimum liquidity
        maxCoins: 20, // Top 20 coins
        sortBy: 'profitScore',
        timeFrame: '24h',
        ...criteria
      };

      // Get all trading symbols from Binance
      const symbols = await this.getValidTradingSymbols();

      // Get metrics for all symbols
      const allMetrics = await this.calculateMetricsForSymbols(symbols);

      // Apply filters
      let filteredCoins = this.applyFilters(allMetrics, defaultCriteria);

      // Sort by criteria
      filteredCoins = this.sortCoins(filteredCoins, defaultCriteria.sortBy!);

      // Limit results
      if (defaultCriteria.maxCoins) {
        filteredCoins = filteredCoins.slice(0, defaultCriteria.maxCoins);
      }

      // Cache results for 2 minutes
      await redisService.set(cacheKey, JSON.stringify(filteredCoins), 120);

      console.log(`Found ${filteredCoins.length} qualifying scalping coins`);
      return filteredCoins;
    } catch (error) {
      console.error('Error getting top scalping coins:', error);
      return [];
    }
  }

  private async getValidTradingSymbols(): Promise<string[]> {
    try {
      const cacheKey = 'valid_trading_symbols';
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const exchangeInfo = await binanceService.getExchangeInfo();
      const activeSymbols = exchangeInfo.symbols
        .filter((symbol: any) =>
          symbol.status === 'TRADING' &&
          symbol.symbol.endsWith('USDT') &&
          !symbol.symbol.includes('DOWN') &&
          !symbol.symbol.includes('UP') &&
          !symbol.symbol.includes('BULL') &&
          !symbol.symbol.includes('BEAR')
        )
        .map((symbol: any) => symbol.symbol);

      // Cache for 1 hour
      await redisService.set(cacheKey, JSON.stringify(activeSymbols), 3600);

      return activeSymbols;
    } catch (error) {
      console.error('Error getting valid trading symbols:', error);
      return [];
    }
  }

  private async calculateMetricsForSymbols(symbols: string[]): Promise<CoinMetrics[]> {
    const batchSize = 50; // Process in batches to avoid rate limiting
    const allMetrics: CoinMetrics[] = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchMetrics = await Promise.allSettled(
        batch.map(symbol => this.calculateCoinMetrics(symbol))
      );

      batchMetrics.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          allMetrics.push(result.value);
        } else {
          console.warn(`Failed to get metrics for ${batch[index]}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
        }
      });

      // Small delay between batches to respect rate limits
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allMetrics;
  }

  private async calculateCoinMetrics(symbol: string): Promise<CoinMetrics | null> {
    try {
      // Check cache first
      const cacheKey = `coin_metrics:${symbol}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        const metrics = JSON.parse(cached);
        if (Date.now() - metrics.lastUpdated < this.cacheExpiry) {
          return metrics;
        }
      }

      // Get 24h ticker data
      const ticker = await binanceService.get24hrTicker(symbol);
      if (!ticker) return null;

      // Get recent kline data for volatility calculation
      const klineData = await binanceService.getKlines(symbol, '5m', 288); // 24h of 5min candles
      if (!klineData || klineData.length === 0) return null;

      // Get order book for liquidity assessment
      const orderBook = await binanceService.getOrderBook(symbol, 100);
      if (!orderBook) return null;

      // Calculate metrics
      const price = parseFloat(ticker.lastPrice);
      const volume24h = parseFloat(ticker.volume);
      const volumeUSDT = parseFloat(ticker.quoteVolume);
      const change24h = parseFloat(ticker.priceChangePercent);
      const high24h = parseFloat(ticker.highPrice);
      const low24h = parseFloat(ticker.lowPrice);

      // Calculate volatility as the range percentage
      const volatility = ((high24h - low24h) / price) * 100;

      // Calculate liquidity score based on order book depth
      const bidDepth = orderBook.bids.slice(0, 20).reduce((sum: number, bid: any) => sum + parseFloat(bid[1]) * parseFloat(bid[0]), 0);
      const askDepth = orderBook.asks.slice(0, 20).reduce((sum: number, ask: any) => sum + parseFloat(ask[1]) * parseFloat(ask[0]), 0);
      const liquidity = (bidDepth + askDepth) / 2;

      // Calculate recent price momentum
      // @ts-ignore - kline data typing
      const recentPrices = klineData.slice(-12).map((candle: any) => parseFloat(candle[4])); // Last hour
      const priceChange1h = recentPrices.length >= 2 ?
        ((recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0]) * 100 : 0;

      // Calculate volume trend
      // @ts-ignore - kline data typing
      const recentVolumes = klineData.slice(-12).map((candle: any) => parseFloat(candle[5]));
      // @ts-ignore - reduce typing
      const avgRecentVolume = recentVolumes.reduce((sum: any, vol: any) => sum + vol, 0) / recentVolumes.length;
      // @ts-ignore - kline data typing
      const avgEarlierVolume = klineData.slice(-24, -12).map((candle: any) => parseFloat(candle[5])).reduce((sum: any, vol: any) => sum + vol, 0) / 12;
      const volumeTrend = avgEarlierVolume > 0 ? (avgRecentVolume - avgEarlierVolume) / avgEarlierVolume * 100 : 0;

      // Calculate profit potential score (0-10)
      let profitPotentialScore = 0;

      // Volume component (0-3 points)
      if (volumeUSDT > 50000000) profitPotentialScore += 3; // >$50M
      else if (volumeUSDT > 20000000) profitPotentialScore += 2.5; // >$20M
      else if (volumeUSDT > 10000000) profitPotentialScore += 2; // >$10M
      else if (volumeUSDT > 5000000) profitPotentialScore += 1.5; // >$5M
      else if (volumeUSDT > 2000000) profitPotentialScore += 1; // >$2M

      // Volatility component (0-3 points)
      if (volatility > 8) profitPotentialScore += 3; // >8%
      else if (volatility > 5) profitPotentialScore += 2.5; // >5%
      else if (volatility > 3) profitPotentialScore += 2; // >3%
      else if (volatility > 2) profitPotentialScore += 1.5; // >2%
      else if (volatility > 1) profitPotentialScore += 1; // >1%

      // Momentum component (0-2 points)
      const absPriceChange1h = Math.abs(priceChange1h);
      if (absPriceChange1h > 3) profitPotentialScore += 2; // >3% 1h change
      else if (absPriceChange1h > 2) profitPotentialScore += 1.5; // >2% 1h change
      else if (absPriceChange1h > 1) profitPotentialScore += 1; // >1% 1h change
      else if (absPriceChange1h > 0.5) profitPotentialScore += 0.5; // >0.5% 1h change

      // Liquidity component (0-2 points)
      if (liquidity > 1000000) profitPotentialScore += 2; // >$1M liquidity
      else if (liquidity > 500000) profitPotentialScore += 1.5; // >$500k liquidity
      else if (liquidity > 200000) profitPotentialScore += 1; // >$200k liquidity
      else if (liquidity > 100000) profitPotentialScore += 0.5; // >$100k liquidity

      // Volume trend bonus (0-1 point)
      if (volumeTrend > 50) profitPotentialScore += 1; // Volume increasing by >50%
      else if (volumeTrend > 20) profitPotentialScore += 0.5; // Volume increasing by >20%

      const metrics: CoinMetrics = {
        symbol,
        price,
        volume24h,
        volumeUSDT,
        change24h,
        volatility,
        liquidity,
        profitPotentialScore: Math.min(profitPotentialScore, 10), // Cap at 10
        lastUpdated: Date.now()
      };

      // Cache for 1 minute
      await redisService.set(cacheKey, JSON.stringify(metrics), 60);

      return metrics;
    } catch (error) {
      console.error(`Error calculating metrics for ${symbol}:`, error);
      return null;
    }
  }

  private applyFilters(metrics: CoinMetrics[], criteria: FilterCriteria): CoinMetrics[] {
    return metrics.filter(coin => {
      // Volume filter
      if (criteria.minVolume && coin.volumeUSDT < criteria.minVolume) {
        return false;
      }

      // Volatility filter
      if (criteria.minVolatility && coin.volatility < criteria.minVolatility) {
        return false;
      }

      // Liquidity filter
      if (criteria.minLiquidity && coin.liquidity < criteria.minLiquidity) {
        return false;
      }

      // Exclusion filter
      if (criteria.excludeCoins && criteria.excludeCoins.includes(coin.symbol)) {
        return false;
      }

      // Inclusion filter
      if (criteria.includeOnly && !criteria.includeOnly.includes(coin.symbol)) {
        return false;
      }

      return true;
    });
  }

  private sortCoins(coins: CoinMetrics[], sortBy: string): CoinMetrics[] {
    return coins.sort((a, b) => {
      switch (sortBy) {
        case 'volume':
          return b.volumeUSDT - a.volumeUSDT;
        case 'volatility':
          return b.volatility - a.volatility;
        case 'profitScore':
          return b.profitPotentialScore - a.profitPotentialScore;
        case 'change':
          return Math.abs(b.change24h) - Math.abs(a.change24h);
        default:
          return b.profitPotentialScore - a.profitPotentialScore;
      }
    });
  }

  async getCoinMetrics(symbol: string): Promise<CoinMetrics | null> {
    return await this.calculateCoinMetrics(symbol);
  }

  async getHighVolumeCoins(minVolume = 10000000): Promise<string[]> {
    try {
      const cacheKey = `high_volume_coins:${minVolume}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const coins = await this.getTopScalpingCoins({
        minVolume,
        sortBy: 'volume',
        maxCoins: 50
      });

      const symbols = coins.map(coin => coin.symbol);

      // Cache for 5 minutes
      await redisService.set(cacheKey, JSON.stringify(symbols), 300);

      return symbols;
    } catch (error) {
      console.error('Error getting high volume coins:', error);
      return [];
    }
  }

  async getHighVolatilityCoins(minVolatility = 3): Promise<string[]> {
    try {
      const cacheKey = `high_volatility_coins:${minVolatility}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const coins = await this.getTopScalpingCoins({
        minVolatility,
        sortBy: 'volatility',
        maxCoins: 50
      });

      const symbols = coins.map(coin => coin.symbol);

      // Cache for 5 minutes
      await redisService.set(cacheKey, JSON.stringify(symbols), 300);

      return symbols;
    } catch (error) {
      console.error('Error getting high volatility coins:', error);
      return [];
    }
  }

  async getBreakoutCoins(): Promise<string[]> {
    try {
      const cacheKey = 'breakout_coins';
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const coins = await this.getTopScalpingCoins({
        minVolume: 5000000,
        minVolatility: 2,
        sortBy: 'change',
        maxCoins: 30
      });

      // Filter for coins with strong momentum
      const breakoutCoins = coins.filter(coin =>
        Math.abs(coin.change24h) > 5 && // >5% 24h change
        coin.profitPotentialScore > 6 && // High profit potential
        coin.liquidity > 200000 // Good liquidity
      );

      const symbols = breakoutCoins.map(coin => coin.symbol);

      // Cache for 3 minutes
      await redisService.set(cacheKey, JSON.stringify(symbols), 180);

      return symbols;
    } catch (error) {
      console.error('Error getting breakout coins:', error);
      return [];
    }
  }

  async getCoinsForAnalysis(maxCoins = 10): Promise<string[]> {
    try {
      const cacheKey = `analysis_coins:${maxCoins}`;
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      // Get top coins based on comprehensive criteria
      const topCoins = await this.getTopScalpingCoins({
        minVolume: 8000000, // Higher volume requirement for analysis
        minVolatility: 1.5,
        minLiquidity: 150000,
        maxCoins,
        sortBy: 'profitScore'
      });

      const symbols = topCoins.map(coin => coin.symbol);

      // Cache for 2 minutes
      await redisService.set(cacheKey, JSON.stringify(symbols), 120);

      console.log(`Selected ${symbols.length} coins for AI analysis:`, symbols);
      return symbols;
    } catch (error) {
      console.error('Error getting coins for analysis:', error);
      // Fallback to popular pairs
      return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT'];
    }
  }

  // Get market overview for dashboard
  async getMarketOverview(): Promise<{
    totalCoins: number;
    highVolumeCoins: number;
    highVolatilityCoins: number;
    topMomentumCoins: string[];
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
  }> {
    try {
      const cacheKey = 'market_overview';
      const cached = await redisService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const allCoins = await this.getTopScalpingCoins({
        minVolume: 1000000, // Lower threshold for overview
        maxCoins: 200
      });

      const highVolumeCoins = allCoins.filter(coin => coin.volumeUSDT > 10000000).length;
      const highVolatilityCoins = allCoins.filter(coin => coin.volatility > 3).length;

      const topMomentumCoins = allCoins
        .filter(coin => coin.profitPotentialScore > 7)
        .slice(0, 10)
        .map(coin => coin.symbol);

      // Calculate market sentiment
      const positiveChange = allCoins.filter(coin => coin.change24h > 0).length;
      const negativeChange = allCoins.filter(coin => coin.change24h < 0).length;
      const neutralRatio = positiveChange / (positiveChange + negativeChange);

      let marketSentiment: 'bullish' | 'bearish' | 'neutral';
      if (neutralRatio > 0.6) marketSentiment = 'bullish';
      else if (neutralRatio < 0.4) marketSentiment = 'bearish';
      else marketSentiment = 'neutral';

      const overview = {
        totalCoins: allCoins.length,
        highVolumeCoins,
        highVolatilityCoins,
        topMomentumCoins,
        marketSentiment
      };

      // Cache for 5 minutes
      await redisService.set(cacheKey, JSON.stringify(overview), 300);

      return overview;
    } catch (error) {
      console.error('Error getting market overview:', error);
      return {
        totalCoins: 0,
        highVolumeCoins: 0,
        highVolatilityCoins: 0,
        topMomentumCoins: [],
        marketSentiment: 'neutral'
      };
    }
  }

  // Cleanup old cache entries
  async cleanupCache(): Promise<void> {
    try {
      const patterns = [
        'coin_metrics:*',
        'top_scalping_coins:*',
        'high_volume_coins:*',
        'high_volatility_coins:*',
        'breakout_coins',
        'analysis_coins:*',
        'market_overview'
      ];

      for (const pattern of patterns) {
        const keys = await redisService.keys(pattern);
        if (keys.length > 0) {
          // @ts-ignore - spread operator typing
          await redisService.del(...keys);
        }
      }

      console.log('Coin filtering cache cleaned up');
    } catch (error) {
      console.error('Error cleaning up coin filtering cache:', error);
    }
  }
}

export const coinFilteringService = new CoinFilteringService();