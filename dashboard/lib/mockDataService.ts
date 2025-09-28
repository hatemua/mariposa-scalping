// Mock Data Service for Professional Trading Suite
// Provides realistic fallback data when API calls fail or timeout

import { ApiResponse } from '@/types';

// Configuration for mock data generation
const MOCK_CONFIG = {
  enabled: true,
  fallbackOnError: true,
  simulateLatency: true,
  latencyMs: 100,
  symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT'],
};

// Utility functions for realistic data generation
const randomBetween = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

const randomChoice = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

const generateRealisticPrice = (symbol: string): number => {
  const basePrices: { [key: string]: number } = {
    'BTCUSDT': 43000,
    'ETHUSDT': 2600,
    'SOLUSDT': 95,
    'PUMPUSDT': 0.0025,
    'TRXUSDT': 0.1,
    'ADAUSDT': 0.45,
    'MATICUSDT': 0.8,
    'LINKUSDT': 15,
    'UNIUSDT': 7,
    'AVAXUSDT': 25,
    'DOTUSDT': 6,
    'LTCUSDT': 75,
    'BNBUSDT': 310,
    'XRPUSDT': 0.6,
    'SHIBUSDT': 0.000024,
    'ATOMUSDT': 8,
    'NEARUSDT': 2.5,
    'FTMUSDT': 0.4,
  };

  const basePrice = basePrices[symbol] || 1;
  const variation = randomBetween(-0.05, 0.05); // ±5% variation
  return basePrice * (1 + variation);
};

const generateRealisticVolume = (symbol: string): number => {
  const baseVolumes: { [key: string]: number } = {
    'BTCUSDT': 25000000,
    'ETHUSDT': 15000000,
    'SOLUSDT': 8000000,
    'PUMPUSDT': 50000000,
    'TRXUSDT': 12000000,
    'ADAUSDT': 6000000,
  };

  const baseVolume = baseVolumes[symbol] || 5000000;
  const variation = randomBetween(0.5, 2.0); // 50% to 200% of base
  return Math.floor(baseVolume * variation);
};

// Mock Data Generators
export const mockDataService = {
  // General configuration
  config: MOCK_CONFIG,

  // Market data mock
  generateMarketData: (symbol: string) => {
    const price = generateRealisticPrice(symbol);
    const change24h = randomBetween(-8, 12);
    const volume = generateRealisticVolume(symbol);

    return {
      symbol,
      price,
      change24h,
      priceChangePercent: change24h,
      volume,
      high24h: price * (1 + Math.abs(change24h) / 100 + 0.02),
      low24h: price * (1 - Math.abs(change24h) / 100 - 0.02),
      quoteVolume: volume * price,
      count: Math.floor(randomBetween(50000, 200000)),
      openPrice: price * (1 - change24h / 100),
      prevClosePrice: price * (1 - change24h / 100),
      weightedAvgPrice: price * 0.999,
      timestamp: Date.now(),
    };
  },

  // Whale Activity Mock Data
  generateWhaleActivity: (symbols: string[], minWhaleSize: number = 50000) => {
    const activities = [];
    const activityTypes: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
    const impacts: ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const exchanges = ['Binance', 'Coinbase', 'Kraken', 'OKX'];
    const orderTypes: ('MARKET' | 'LIMIT' | 'ICEBERG' | 'TWAP' | 'VWAP')[] = ['MARKET', 'LIMIT', 'ICEBERG', 'TWAP', 'VWAP'];

    // Generate 3-8 whale activities
    const count = Math.floor(randomBetween(3, 8));

    for (let i = 0; i < count; i++) {
      const symbol = randomChoice(symbols);
      const type = randomChoice(activityTypes);
      const price = generateRealisticPrice(symbol);
      const value = randomBetween(minWhaleSize, 5000000);
      const size = value / price;
      const impact = randomChoice(impacts);

      activities.push({
        id: `whale-${symbol}-${Date.now()}-${i}`,
        symbol,
        type,
        size,
        price,
        value,
        impact,
        confidence: randomBetween(0.6, 0.95),
        timestamp: new Date(Date.now() - randomBetween(0, 3600000)).toISOString(),
        exchange: randomChoice(exchanges),
        orderType: randomChoice(orderTypes),
        priceImpact: randomBetween(0.1, 5.0),
        volumeRatio: randomBetween(1.5, 8.0),
        unusualActivity: [
          'Large volume spike detected',
          'Stealth accumulation pattern',
          'Price level breakthrough',
          'Institutional flow pattern'
        ].slice(0, Math.floor(randomBetween(1, 3))),
        marketBehavior: {
          followThrough: Math.random() > 0.4,
          resistanceBreak: type === 'BUY' && Math.random() > 0.6,
          supportHold: type === 'SELL' && Math.random() > 0.6,
          volumeSpike: Math.random() > 0.3,
        },
        prediction: {
          direction: type === 'BUY' ? 'BULLISH' : 'BEARISH',
          timeframe: randomChoice(['15m', '30m', '1h', '4h']),
          probability: randomBetween(0.65, 0.9),
        },
      });
    }

    return activities.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  },

  // Professional Signal Feed Mock Data
  generateTradingSignals: (symbols: string[], minStrength: number = 60) => {
    const signals = [];
    const signalTypes: ('BUY' | 'SELL' | 'HOLD')[] = ['BUY', 'SELL', 'HOLD'];
    const categories: ('BREAKOUT' | 'REVERSAL' | 'MOMENTUM' | 'CONFLUENCE' | 'WHALE' | 'AI_PREDICTION')[] = ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'CONFLUENCE', 'WHALE', 'AI_PREDICTION'];
    const priorities: ('LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const sources: ('AI_ANALYSIS' | 'TECHNICAL_SCAN' | 'WHALE_DETECTION' | 'CONFLUENCE_SCORE')[] = ['AI_ANALYSIS', 'TECHNICAL_SCAN', 'WHALE_DETECTION', 'CONFLUENCE_SCORE'];
    const marketConditions: ('TRENDING' | 'RANGING' | 'VOLATILE' | 'CONSOLIDATING')[] = ['TRENDING', 'RANGING', 'VOLATILE', 'CONSOLIDATING'];

    // Generate 5-15 signals
    const count = Math.floor(randomBetween(5, 15));

    for (let i = 0; i < count; i++) {
      const symbol = randomChoice(symbols);
      const type = randomChoice(signalTypes);
      const category = randomChoice(categories);
      const strength = Math.floor(randomBetween(minStrength, 100));
      const confidence = randomBetween(0.6, 0.95);
      const expectedReturn = randomBetween(1.5, 8.0);
      const entry = generateRealisticPrice(symbol);

      const target = type === 'BUY'
        ? entry * (1 + expectedReturn / 100)
        : entry * (1 - expectedReturn / 100);

      const stopLoss = type === 'BUY'
        ? entry * (1 - randomBetween(0.02, 0.06))
        : entry * (1 + randomBetween(0.02, 0.06));

      const riskReward = Math.abs(target - entry) / Math.abs(entry - stopLoss);

      if (riskReward > 1.2) { // Only include signals with good R:R
        signals.push({
          id: `signal-${symbol}-${Date.now()}-${i}`,
          symbol,
          type,
          strength,
          confidence,
          timeframe: randomChoice(['5m', '15m', '30m', '1h', '4h']),
          entry,
          target,
          stopLoss,
          riskReward,
          expectedReturn,
          category,
          indicators: {
            rsi: randomBetween(20, 80),
            macd: randomChoice(['BULLISH', 'BEARISH', 'NEUTRAL']),
            ema: randomChoice(['BULLISH', 'BEARISH', 'NEUTRAL']),
            volume: randomChoice(['HIGH', 'MEDIUM', 'LOW']),
            support: Math.random() > 0.5,
            resistance: Math.random() > 0.5,
          },
          reasoning: getMockSignalReasoning(category, type),
          timestamp: new Date(Date.now() - randomBetween(0, 1800000)).toISOString(),
          priority: randomChoice(priorities),
          source: randomChoice(sources),
          marketCondition: randomChoice(marketConditions),
          followUp: {
            checkIn: randomChoice(['5 minutes', '15 minutes', '30 minutes', '1 hour']),
            exitStrategy: type === 'BUY' ? 'Scale out at targets' : 'Cover at targets',
            riskManagement: `Stop at ${Math.abs((stopLoss - entry) / entry * 100).toFixed(1)}%`,
          },
        });
      }
    }

    // Sort by strength and priority
    return signals.sort((a, b) => {
      const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return b.strength - a.strength;
    });
  },

  // Opportunity Scanner Mock Data
  generateOpportunities: (symbols: string[], minScore: number = 70) => {
    const opportunities = [];
    const categories: ('BREAKOUT' | 'REVERSAL' | 'MOMENTUM' | 'ARBITRAGE' | 'VOLUME_SURGE' | 'WHALE_ACTIVITY')[] = ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY'];
    const riskLevels: ('LOW' | 'MEDIUM' | 'HIGH')[] = ['LOW', 'MEDIUM', 'HIGH'];

    // Generate 4-10 opportunities
    const count = Math.floor(randomBetween(4, 10));

    for (let i = 0; i < count; i++) {
      const symbol = randomChoice(symbols);
      const category = randomChoice(categories);
      const score = Math.floor(randomBetween(minScore, 100));
      const confidence = randomBetween(0.65, 0.95);
      const expectedReturn = randomBetween(2.0, 12.0);
      const entry = generateRealisticPrice(symbol);
      const target = entry * (1 + expectedReturn / 100);
      const stopLoss = entry * (1 - randomBetween(0.015, 0.05));
      const riskReward = Math.abs(target - entry) / Math.abs(entry - stopLoss);

      if (riskReward > 1.5) {
        opportunities.push({
          symbol,
          score,
          confidence,
          category,
          timeframe: randomChoice(['15m', '30m', '1h', '4h']),
          expectedReturn,
          riskLevel: randomChoice(riskLevels),
          entry,
          target,
          stopLoss,
          riskReward,
          volume24h: generateRealisticVolume(symbol),
          priceChange: randomBetween(-5, 10),
          reasoning: getMockOpportunityReasoning(category),
          indicators: {
            rsi: randomBetween(25, 75),
            volume_ratio: randomBetween(1.2, 4.0),
            volatility: randomBetween(2, 15),
            momentum: randomBetween(-1, 1),
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    return opportunities.sort((a, b) => b.score - a.score);
  },

  // VaR Calculator Mock Data
  generateVaRData: (symbols: string[], confidence: number = 95, timeHorizon: number = 1) => {
    const portfolioValue = 100000;
    const historicalVaR = randomBetween(0.02, 0.08);
    const parametricVaR = historicalVaR * randomBetween(0.9, 1.1);
    const monteCarloVaR = historicalVaR * randomBetween(0.95, 1.05);

    const varResults = [
      {
        method: 'HISTORICAL' as const,
        confidence,
        timeHorizon,
        value: historicalVaR * Math.sqrt(timeHorizon),
        expectedShortfall: historicalVaR * 1.3 * Math.sqrt(timeHorizon),
        conditionalVaR: historicalVaR * 1.3 * Math.sqrt(timeHorizon),
        backTestSuccess: randomBetween(92, 98),
        reliability: 'HIGH' as const,
      },
      {
        method: 'PARAMETRIC' as const,
        confidence,
        timeHorizon,
        value: parametricVaR * Math.sqrt(timeHorizon),
        expectedShortfall: parametricVaR * 1.25 * Math.sqrt(timeHorizon),
        conditionalVaR: parametricVaR * 1.25 * Math.sqrt(timeHorizon),
        backTestSuccess: randomBetween(85, 95),
        reliability: 'MEDIUM' as const,
      },
      {
        method: 'MONTE_CARLO' as const,
        confidence,
        timeHorizon,
        value: monteCarloVaR * Math.sqrt(timeHorizon),
        expectedShortfall: monteCarloVaR * 1.28 * Math.sqrt(timeHorizon),
        conditionalVaR: monteCarloVaR * 1.28 * Math.sqrt(timeHorizon),
        backTestSuccess: randomBetween(94, 99),
        reliability: 'HIGH' as const,
      },
    ];

    // Generate component VaRs
    const componentVaRs: { [symbol: string]: number } = {};
    const marginalVaRs: { [symbol: string]: number } = {};
    const incrementalVaRs: { [symbol: string]: number } = {};

    symbols.forEach(symbol => {
      const weight = 1 / symbols.length;
      const symbolVaR = randomBetween(0.015, 0.1);
      componentVaRs[symbol] = symbolVaR * weight * Math.sqrt(timeHorizon);
      marginalVaRs[symbol] = symbolVaR * Math.sqrt(timeHorizon);
      incrementalVaRs[symbol] = symbolVaR * weight * Math.sqrt(timeHorizon);
    });

    const portfolioVaR = historicalVaR * Math.sqrt(timeHorizon);
    const sumComponentVaRs = Object.values(componentVaRs).reduce((sum, var_) => sum + var_, 0);
    const diversificationBenefit = Math.max(0, sumComponentVaRs - portfolioVaR);

    return {
      symbol: symbols[0] || 'PORTFOLIO',
      portfolioValue,
      varResults,
      varBreakdown: {
        portfolioVaR,
        componentVaRs,
        marginalVaRs,
        incrementalVaRs,
        diversificationBenefit,
      },
      stressTests: [
        {
          scenario: 'Black Monday Repeat',
          description: '20% market crash similar to 1987',
          probability: 0.01,
          portfolioImpact: -18.5,
          worstCaseVaR: portfolioVaR * 2.5,
          recoveryTime: '3-6 months',
          hedgeRecommendation: 'Increase cash allocation, add put options',
        },
        {
          scenario: 'Crypto Winter',
          description: 'Extended bear market with 60% decline',
          probability: 0.05,
          portfolioImpact: -55.2,
          worstCaseVaR: portfolioVaR * 4.0,
          recoveryTime: '12-24 months',
          hedgeRecommendation: 'Reduce crypto exposure, hedge with stablecoins',
        },
      ],
      riskMetrics: {
        sharpeRatio: randomBetween(0.5, 2.5),
        sortinoRatio: randomBetween(0.8, 3.0),
        maxDrawdown: randomBetween(10, 35),
        calmarRatio: randomBetween(0.3, 1.5),
        volatility: randomBetween(15, 45),
        skewness: randomBetween(-0.8, 0.5),
        kurtosis: randomBetween(0.5, 4.0),
      },
      backtestResults: {
        violations: Math.floor(randomBetween(8, 25)),
        expectedViolations: Math.floor(252 * (1 - confidence / 100)),
        kupiecTest: randomBetween(0.5, 2.5),
        independenceTest: randomBetween(0.7, 0.95),
        accuracy: randomBetween(88, 96),
      },
      recommendations: [
        'Portfolio VaR within acceptable ranges',
        'Diversification providing good risk reduction',
        'Monitor correlation changes during stress periods',
        'Consider tail risk hedging for extreme events',
      ],
    };
  },

  // Order Book Analysis Mock Data
  generateOrderBookData: (symbol: string, levels: number = 20) => {
    const currentPrice = generateRealisticPrice(symbol);
    const spread = currentPrice * randomBetween(0.0001, 0.001);

    // Generate bids and asks
    const bids = [];
    const asks = [];

    for (let i = 0; i < levels; i++) {
      const bidPrice = currentPrice - spread / 2 - (i * spread * 0.1);
      const askPrice = currentPrice + spread / 2 + (i * spread * 0.1);

      const bidSize = randomBetween(100, 5000);
      const askSize = randomBetween(100, 5000);

      bids.push({
        price: bidPrice,
        size: bidSize,
        total: bidSize * (i + 1),
        percentage: randomBetween(1, 100),
        orders: Math.floor(randomBetween(1, 50)),
      });

      asks.push({
        price: askPrice,
        size: askSize,
        total: askSize * (i + 1),
        percentage: randomBetween(1, 100),
        orders: Math.floor(randomBetween(1, 50)),
      });
    }

    return {
      symbol,
      timestamp: new Date().toISOString(),
      bids,
      asks,
      imbalance: {
        bidAskRatio: randomBetween(0.3, 0.7),
        bidPressure: randomBetween(0.2, 0.8),
        askPressure: randomBetween(0.2, 0.8),
        imbalanceStrength: randomChoice(['WEAK', 'MODERATE', 'STRONG'] as const),
        direction: randomChoice(['BULLISH', 'BEARISH', 'NEUTRAL'] as const),
        confidence: randomBetween(0.6, 0.9),
      },
      liquidity: {
        bidLiquidity: randomBetween(10000, 100000),
        askLiquidity: randomBetween(10000, 100000),
        totalLiquidity: randomBetween(20000, 200000),
        liquidityRatio: randomBetween(0.8, 1.2),
        depthAtPercentage: {
          '0.1': { bid: randomBetween(5000, 15000), ask: randomBetween(5000, 15000) },
          '0.5': { bid: randomBetween(15000, 35000), ask: randomBetween(15000, 35000) },
          '1.0': { bid: randomBetween(25000, 55000), ask: randomBetween(25000, 55000) },
        },
        liquidityGaps: [],
      },
      microstructure: {
        spread,
        spreadPercentage: (spread / currentPrice) * 100,
        midPrice: currentPrice,
        weightedMidPrice: currentPrice * randomBetween(0.999, 1.001),
        priceImpact: {
          '1000': { buy: randomBetween(0.01, 0.05), sell: randomBetween(0.01, 0.05) },
          '5000': { buy: randomBetween(0.05, 0.15), sell: randomBetween(0.05, 0.15) },
          '10000': { buy: randomBetween(0.1, 0.3), sell: randomBetween(0.1, 0.3) },
        },
        marketDepth: randomBetween(50000, 200000),
        resilience: randomBetween(0.7, 0.95),
        efficiency: randomBetween(85, 98),
      },
      flow: {
        aggressiveBuys: randomBetween(1000, 10000),
        aggressiveSells: randomBetween(1000, 10000),
        passiveBuys: randomBetween(2000, 15000),
        passiveSells: randomBetween(2000, 15000),
        flowRatio: randomBetween(0.3, 0.7),
        institutionalFlow: randomBetween(5000, 25000),
        retailFlow: randomBetween(3000, 15000),
        flowTrend: randomChoice(['BUYING_PRESSURE', 'SELLING_PRESSURE', 'BALANCED'] as const),
      },
      signals: {
        liquidityGrab: {
          detected: Math.random() > 0.7,
          side: randomChoice([null, 'BID', 'ASK']),
          strength: randomBetween(0.5, 0.9)
        },
        sweepAlert: {
          detected: Math.random() > 0.8,
          levels: Math.floor(randomBetween(2, 8)),
          impact: randomBetween(0.1, 2.0)
        },
        whaleActivity: {
          detected: Math.random() > 0.6,
          size: randomBetween(50000, 500000),
          side: randomChoice([null, 'BUY', 'SELL'])
        },
        algorithmicActivity: {
          detected: Math.random() > 0.5,
          pattern: randomChoice(['TWAP', 'VWAP', 'ICEBERG', 'LAYERED']),
          confidence: randomBetween(0.6, 0.9)
        },
      },
      recommendations: {
        execution: 'Use TWAP strategy for large orders',
        timing: 'Current liquidity adequate for execution',
        risk: 'Monitor for sudden liquidity changes',
        opportunity: 'Consider scaling into position during dips',
      },
    };
  },

  // Utility function to create API-compatible responses
  wrapAsApiResponse: <T>(data: T, delay: boolean = true): Promise<ApiResponse<T>> => {
    return new Promise((resolve) => {
      const execute = () => {
        resolve({
          success: true,
          data,
          message: 'Mock data generated successfully',
        });
      };

      if (delay && MOCK_CONFIG.simulateLatency) {
        setTimeout(execute, MOCK_CONFIG.latencyMs);
      } else {
        execute();
      }
    });
  },

  // Check if mock data should be used
  shouldUseMockData: (error?: any): boolean => {
    return false; // Always use real data, never fallback to mock
  },
};

// Helper functions for generating realistic text content
function getMockSignalReasoning(category: string, type: string): string {
  const reasons: { [key: string]: { [key: string]: string[] } } = {
    BREAKOUT: {
      BUY: [
        'Strong resistance breakout with volume confirmation and RSI momentum',
        'Ascending triangle pattern completion with target projection intact',
        'Multi-timeframe confluence showing bullish momentum acceleration',
      ],
      SELL: [
        'Support breakdown with increasing volume and bearish divergence',
        'Descending triangle breakdown pattern with momentum confirmation',
        'Failed retest of broken support level with selling pressure',
      ],
      HOLD: ['Breakout attempt lacking volume confirmation', 'Waiting for clear directional break'],
    },
    MOMENTUM: {
      BUY: [
        'Strong upward momentum with MACD bullish crossover and volume surge',
        'Trend acceleration pattern with consecutive higher highs forming',
        'Momentum divergence resolved to upside with buying pressure',
      ],
      SELL: [
        'Momentum breakdown with bearish MACD divergence confirmed',
        'Trend deceleration pattern showing distribution signs',
        'Volume selling climax with momentum failure at resistance',
      ],
      HOLD: ['Momentum consolidation phase', 'Waiting for momentum direction'],
    },
    CONFLUENCE: {
      BUY: [
        'Multiple bullish factors aligned: RSI oversold bounce, support hold, volume increase',
        'High probability setup with technical and fundamental convergence',
        'Risk-reward optimized entry with confluence of support levels',
      ],
      SELL: [
        'Multiple bearish signals converging: overbought conditions, resistance, volume decline',
        'High confidence short setup with technical and flow analysis alignment',
        'Confluence of resistance levels creating optimal risk-reward short',
      ],
      HOLD: ['Mixed signals requiring further confluence development', 'Awaiting clearer factor alignment'],
    },
  };

  const categoryReasons = reasons[category] || reasons.CONFLUENCE;
  const typeReasons = categoryReasons[type] || categoryReasons.HOLD;
  return randomChoice(typeReasons);
}

function getMockOpportunityReasoning(category: string): string {
  const reasons: { [key: string]: string[] } = {
    BREAKOUT: [
      'Technical breakout pattern with strong volume confirmation and momentum',
      'Key resistance level breakthrough with institutional buying interest',
      'Multi-timeframe alignment showing continuation potential',
    ],
    REVERSAL: [
      'Oversold conditions with bullish divergence at key support level',
      'Mean reversion opportunity after extended downtrend with volume pickup',
      'Double bottom pattern completion with momentum shift confirmed',
    ],
    MOMENTUM: [
      'Strong momentum continuation with accelerating trend characteristics',
      'Trend following opportunity with institutional flow confirmation',
      'Momentum breakout with volume expansion and technical follow-through',
    ],
    VOLUME_SURGE: [
      'Unusual volume spike indicating institutional accumulation pattern',
      'Volume breakout suggesting smart money positioning ahead of move',
      '300% above average volume with price confirmation developing',
    ],
    WHALE_ACTIVITY: [
      'Large order flow detected suggesting institutional positioning',
      'Whale accumulation pattern with stealth buying characteristics',
      'Smart money activity with coordinated buying across timeframes',
    ],
    ARBITRAGE: [
      'Cross-exchange price discrepancy with profitable arbitrage window',
      'Funding rate differential creating risk-adjusted return opportunity',
      'Temporary market inefficiency with quantifiable profit potential',
    ],
  };

  const categoryReasons = reasons[category] || reasons.MOMENTUM;
  return randomChoice(categoryReasons);
}

export default mockDataService;