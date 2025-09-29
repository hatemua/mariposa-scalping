import { Response } from 'express';
import { binanceService } from '../services/binanceService';
import { aiAnalysisService } from '../services/aiAnalysisService';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { SymbolConverter } from '../utils/symbolConverter';

// Helper function to calculate technical indicators
const calculateTechnicalIndicators = (klineData: any[], requestedIndicators: string[]) => {
  const prices = klineData.map(candle => parseFloat(candle[4])); // Close prices
  const highs = klineData.map(candle => parseFloat(candle[2])); // High prices
  const lows = klineData.map(candle => parseFloat(candle[3])); // Low prices
  const volumes = klineData.map(candle => parseFloat(candle[5])); // Volumes

  const indicators: any = {};

  // RSI
  if (requestedIndicators.includes('RSI') || requestedIndicators.length === 0) {
    indicators.RSI = calculateRSI(prices, 14);
  }

  // Moving Averages
  if (requestedIndicators.includes('SMA20') || requestedIndicators.length === 0) {
    indicators.SMA20 = calculateSMA(prices, 20);
  }

  if (requestedIndicators.includes('EMA20') || requestedIndicators.length === 0) {
    indicators.EMA20 = calculateEMA(prices, 20);
  }

  // MACD
  if (requestedIndicators.includes('MACD') || requestedIndicators.length === 0) {
    indicators.MACD = calculateMACD(prices);
  }

  return indicators;
};

const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[prices.length - i] - prices[prices.length - i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateSMA = (values: number[], period: number): number => {
  if (values.length < period) return values[values.length - 1] || 0;
  const sum = values.slice(-period).reduce((acc, val) => acc + val, 0);
  return sum / period;
};

const calculateEMA = (prices: number[], period: number): number => {
  if (prices.length < period) return prices[prices.length - 1] || 0;

  const multiplier = 2 / (period + 1);
  let ema = prices[prices.length - period];

  for (let i = prices.length - period + 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }

  return ema;
};

const calculateMACD = (prices: number[]): any => {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;

  // Simplified signal line calculation
  const signalLine = macdLine * 0.9; // Simplified for brevity
  const histogram = macdLine - signalLine;

  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram
  };
};

export const getConfluenceScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;

    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    // Get market data and calculate confluence score
    const marketData = await binanceService.getSymbolInfo(normalizedSymbol);

    // Calculate multiple timeframe signals
    const timeframes = ['1m', '5m', '15m', '1h'];
    const signals: any[] = [];

    for (const timeframe of timeframes) {
      try {
        const tfKlineData = await binanceService.getKlineData(normalizedSymbol, timeframe, 50);
        const indicators = calculateTechnicalIndicators(tfKlineData, ['RSI', 'MACD', 'SMA20', 'EMA20']);

        // Calculate signal strength for this timeframe
        let signalStrength = 0;
        let direction = 'NEUTRAL';

        // RSI signal
        if (indicators.RSI < 30) {
          signalStrength += 0.3;
          direction = 'BULLISH';
        } else if (indicators.RSI > 70) {
          signalStrength += 0.3;
          direction = 'BEARISH';
        }

        // MACD signal
        if (indicators.MACD.histogram > 0) {
          signalStrength += 0.2;
          if (direction !== 'BEARISH') direction = 'BULLISH';
        } else {
          signalStrength += 0.2;
          if (direction !== 'BULLISH') direction = 'BEARISH';
        }

        // Price vs Moving Averages
        const currentPrice = parseFloat(marketData.price);
        if (currentPrice > indicators.SMA20 && currentPrice > indicators.EMA20) {
          signalStrength += 0.2;
          if (direction !== 'BEARISH') direction = 'BULLISH';
        } else if (currentPrice < indicators.SMA20 && currentPrice < indicators.EMA20) {
          signalStrength += 0.2;
          if (direction !== 'BULLISH') direction = 'BEARISH';
        }

        signals.push({
          timeframe,
          direction,
          strength: signalStrength,
          indicators
        });
      } catch (error) {
        console.warn(`Failed to get ${timeframe} data for ${normalizedSymbol}:`, error);
      }
    }

    // Calculate overall confluence score
    const bullishSignals = signals.filter(s => s.direction === 'BULLISH');
    const bearishSignals = signals.filter(s => s.direction === 'BEARISH');

    const avgBullishStrength = bullishSignals.length > 0
      ? bullishSignals.reduce((sum, s) => sum + s.strength, 0) / bullishSignals.length
      : 0;
    const avgBearishStrength = bearishSignals.length > 0
      ? bearishSignals.reduce((sum, s) => sum + s.strength, 0) / bearishSignals.length
      : 0;

    const confluenceScore = Math.round(
      ((bullishSignals.length * avgBullishStrength) - (bearishSignals.length * avgBearishStrength) + 2) * 25
    );

    const strongestTimeframe = signals.reduce((strongest, current) =>
      current.strength > strongest.strength ? current : strongest,
      signals[0] || { timeframe: '1h', strength: 0 }
    ).timeframe;

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        score: Math.max(0, Math.min(100, confluenceScore)),
        confidence: Math.max(0.3, Math.min(0.9, avgBullishStrength > avgBearishStrength ? avgBullishStrength : avgBearishStrength)),
        strongestTimeframe,
        signals,
        bullishSignals: bullishSignals.length,
        bearishSignals: bearishSignals.length,
        timestamp: new Date().toISOString()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error calculating confluence score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate confluence score'
    } as ApiResponse);
  }
};

export const getEntrySignals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;

    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    // Get market data for entry signal analysis
    const marketData = await binanceService.getSymbolInfo(normalizedSymbol);
    const klineData1m = await binanceService.getKlineData(normalizedSymbol, '1m', 50);
    const klineData5m = await binanceService.getKlineData(normalizedSymbol, '5m', 20);

    const currentPrice = parseFloat(marketData.price);
    const signals: any[] = [];

    // Volume breakout detection
    const recentVolumes = klineData1m.slice(-10).map((k: any) => parseFloat(k[5]));
    const avgVolume = recentVolumes.reduce((sum: number, v: number) => sum + v, 0) / recentVolumes.length;
    const currentVolume = recentVolumes[recentVolumes.length - 1];

    if (currentVolume > avgVolume * 1.5) {
      signals.push({
        type: 'VOLUME_BREAKOUT',
        strength: Math.min(90, 60 + (currentVolume / avgVolume - 1.5) * 20),
        description: `Volume spike detected: ${(currentVolume / avgVolume).toFixed(2)}x average`,
        timeframe: '1m',
        action: currentPrice > parseFloat(klineData1m[klineData1m.length - 2][4]) ? 'BUY' : 'SELL'
      });
    }

    // Support/Resistance levels
    const recent5mLows = klineData5m.map((k: any) => parseFloat(k[3]));
    const recent5mHighs = klineData5m.map((k: any) => parseFloat(k[2]));
    const supportLevel = Math.min(...recent5mLows);
    const resistanceLevel = Math.max(...recent5mHighs);

    const distanceToSupport = (currentPrice - supportLevel) / currentPrice;
    const distanceToResistance = (resistanceLevel - currentPrice) / currentPrice;

    if (distanceToSupport < 0.005) { // Within 0.5% of support
      signals.push({
        type: 'SUPPORT_BOUNCE',
        strength: 75,
        description: `Price near support level: $${supportLevel.toFixed(4)}`,
        timeframe: '5m',
        action: 'BUY',
        level: supportLevel
      });
    }

    if (distanceToResistance < 0.005) { // Within 0.5% of resistance
      signals.push({
        type: 'RESISTANCE_REJECTION',
        strength: 75,
        description: `Price near resistance level: $${resistanceLevel.toFixed(4)}`,
        timeframe: '5m',
        action: 'SELL',
        level: resistanceLevel
      });
    }

    // Momentum signals
    const priceChanges = klineData1m.slice(-5).map((k: any, i: number, arr: any[]) => {
      if (i === 0) return 0;
      return (parseFloat(k[4]) - parseFloat(arr[i-1][4])) / parseFloat(arr[i-1][4]);
    });

    const momentum = priceChanges.reduce((sum: number, change: number) => sum + change, 0);
    const avgMomentum = momentum / priceChanges.length;

    if (Math.abs(avgMomentum) > 0.001) { // More than 0.1% average change
      signals.push({
        type: 'MOMENTUM',
        strength: Math.min(85, 50 + Math.abs(avgMomentum) * 10000),
        description: `${avgMomentum > 0 ? 'Bullish' : 'Bearish'} momentum detected`,
        timeframe: '1m',
        action: avgMomentum > 0 ? 'BUY' : 'SELL',
        momentum: avgMomentum
      });
    }

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        signals,
        signalCount: signals.length,
        strongestSignal: signals.length > 0 ? signals.reduce((max, current) =>
          current.strength > max.strength ? current : max
        ) : null,
        marketConditions: {
          price: currentPrice,
          support: supportLevel,
          resistance: resistanceLevel,
          volume: currentVolume,
          avgVolume: avgVolume
        },
        timestamp: new Date().toISOString()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error generating entry signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate entry signals'
    } as ApiResponse);
  }
};

export const getProfessionalSignals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols, minStrength = 60 } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      } as ApiResponse);
      return;
    }

    const professionalSignals: any[] = [];

    console.log(`🔍 Starting professional signal generation for ${symbols.length} symbols with minStrength: ${minStrength}`);

    for (const symbol of symbols.slice(0, 10)) { // Limit to 10 symbols for performance
      try {
        const normalizedSymbol = SymbolConverter.normalize(symbol);
        console.log(`📊 Analyzing ${normalizedSymbol}...`);

        const marketData = await binanceService.getSymbolInfo(normalizedSymbol);
        const klineData = await binanceService.getKlineData(normalizedSymbol, '1h', 50);

        // Calculate technical indicators for signal generation
        const indicators = calculateTechnicalIndicators(klineData, ['RSI', 'MACD', 'SMA20', 'EMA20']);
        const currentPrice = parseFloat(marketData.price);
        const priceChange24h = parseFloat(marketData.change24h || '0');
        const volume24h = parseFloat(marketData.volume || '0');

        console.log(`📈 ${normalizedSymbol} market data: Price=${currentPrice}, Change24h=${priceChange24h}%, Volume=${(volume24h/1000000).toFixed(1)}M, RSI=${indicators.RSI.toFixed(1)}`);

        // Calculate signal strength based on real technical analysis
        let signalStrength = 50; // Base strength

        // RSI contribution
        if (indicators.RSI < 30) signalStrength += 20; // Oversold
        else if (indicators.RSI > 70) signalStrength += 20; // Overbought
        else if (indicators.RSI > 45 && indicators.RSI < 55) signalStrength += 10; // Neutral

        // MACD contribution
        if (indicators.MACD.histogram > 0) signalStrength += 15;

        // Volume contribution
        if (volume24h > 10000000) signalStrength += 10; // High volume

        // Price action contribution
        if (Math.abs(priceChange24h) > 3) signalStrength += 15; // Significant movement

        // Determine signal type based on technical analysis
        let signalType = 'MOMENTUM';
        let action = 'HOLD';

        // Reversal signals (oversold/overbought conditions)
        if (indicators.RSI < 35 && indicators.MACD.histogram > 0) {
          signalType = 'REVERSAL';
          action = 'BUY';
        } else if (indicators.RSI > 65 && indicators.MACD.histogram < 0) {
          signalType = 'REVERSAL';
          action = 'SELL';
        }
        // Breakout signals (relaxed thresholds)
        else if (Math.abs(priceChange24h) > 3 && volume24h > 5000000) {
          signalType = 'BREAKOUT';
          action = priceChange24h > 0 ? 'BUY' : 'SELL';
        }
        // Trend following signals
        else if (currentPrice > indicators.SMA20 && indicators.MACD.histogram > 0) {
          signalType = 'MOMENTUM';
          action = 'BUY';
        } else if (currentPrice < indicators.SMA20 && indicators.MACD.histogram < 0) {
          signalType = 'MOMENTUM';
          action = 'SELL';
        }
        // Strong momentum signals (new conditions)
        else if (priceChange24h > 2 && indicators.RSI > 50 && volume24h > 2000000) {
          signalType = 'MOMENTUM';
          action = 'BUY';
        } else if (priceChange24h < -2 && indicators.RSI < 50 && volume24h > 2000000) {
          signalType = 'MOMENTUM';
          action = 'SELL';
        }
        // MACD crossover signals (new conditions)
        else if (indicators.MACD.histogram > 0.001 && indicators.RSI > 40) {
          signalType = 'MOMENTUM';
          action = 'BUY';
        } else if (indicators.MACD.histogram < -0.001 && indicators.RSI < 60) {
          signalType = 'MOMENTUM';
          action = 'SELL';
        }

        console.log(`💡 ${normalizedSymbol} signal analysis: Strength=${signalStrength}, Type=${signalType}, Action=${action}, MACD=${indicators.MACD.histogram.toFixed(4)}`);

        // Lower threshold for more signals and include moderate strength signals
        const effectiveMinStrength = Math.min(minStrength, 50);
        if (signalStrength >= effectiveMinStrength && action !== 'HOLD') {
          console.log(`✅ ${normalizedSymbol} passed filters: Strength=${signalStrength} >= ${effectiveMinStrength}, Action=${action}`);
          const riskLevel = Math.abs(priceChange24h);
          const stopLossPercent = Math.max(1, Math.min(5, riskLevel * 0.5));
          const targetPercent = stopLossPercent * 2; // 2:1 risk/reward ratio

          // Enhanced signal with LLM analysis for moderate-strength signals
          let advancedLLMData = null;
          if (signalStrength >= 60) {
            try {
              // Get orderbook data for LLM analysis
              const orderBook = await binanceService.getOrderBook(normalizedSymbol, 20);

              // Create market data object for AI analysis
              const marketDataForAI: any = {
                symbol: normalizedSymbol,
                price: currentPrice,
                change24h: parseFloat(marketData.change24h || '0'),
                volume: volume24h,
                high24h: parseFloat(marketData.high24h || currentPrice.toString()),
                low24h: parseFloat(marketData.low24h || currentPrice.toString()),
                timestamp: new Date()
              };

              // Get AI analysis with 4 cost-effective reasoning models
              const llmAnalysis = await aiAnalysisService.analyzeMarketData(
                marketDataForAI,
                klineData,
                orderBook
              );

              if (llmAnalysis && llmAnalysis.individualAnalyses && llmAnalysis.individualAnalyses.length > 0) {
                // Create LLM consensus from individual analyses
                const llmConsensus = llmAnalysis.individualAnalyses.reduce((acc: any, analysis: any, index: number) => {
                  const modelName = `model_${index + 1}`;
                  acc[modelName] = {
                    signal: analysis.recommendation,
                    confidence: analysis.confidence,
                    reasoning: analysis.reasoning
                  };
                  return acc;
                }, {});

                advancedLLMData = {
                  llmConsensus,
                  consensus: {
                    recommendation: llmAnalysis.recommendation,
                    confidence: llmAnalysis.confidence,
                    reasoning: llmAnalysis.reasoning || `Multi-LLM consensus: ${llmAnalysis.recommendation}`,
                    targetPrice: llmAnalysis.targetPrice || (currentPrice * (action === 'BUY' ? 1 + targetPercent / 100 : 1 - targetPercent / 100)),
                    stopLoss: llmAnalysis.stopLoss || (currentPrice * (action === 'BUY' ? 1 - stopLossPercent / 100 : 1 + stopLossPercent / 100)),
                    timeToAction: '1h'
                  },
                  source: 'AI_AGENT',
                  modelCount: llmAnalysis.individualAnalyses.length
                };
              }
            } catch (error) {
              console.warn(`Failed to get LLM analysis for ${normalizedSymbol}:`, error);
            }
          }

          professionalSignals.push({
            symbol: normalizedSymbol,
            type: signalType,
            action: action,
            strength: Math.round(signalStrength),
            confidence: Math.max(0.6, Math.min(0.95, signalStrength / 100)),
            timeHorizon: signalStrength > 80 ? 'SCALP' : signalStrength > 65 ? 'SWING' : 'POSITION',
            entryZone: {
              min: currentPrice * (action === 'BUY' ? 0.998 : 1.002),
              max: currentPrice * (action === 'BUY' ? 1.002 : 0.998)
            },
            targets: [
              currentPrice * (action === 'BUY' ? 1 + targetPercent / 200 : 1 - targetPercent / 200),
              currentPrice * (action === 'BUY' ? 1 + targetPercent / 100 : 1 - targetPercent / 100)
            ],
            stopLoss: currentPrice * (action === 'BUY' ? 1 - stopLossPercent / 100 : 1 + stopLossPercent / 100),
            reasoning: `${signalType} signal based on RSI: ${indicators.RSI.toFixed(1)}, MACD: ${indicators.MACD.histogram.toFixed(4)}, Volume: ${(volume24h / 1000000).toFixed(1)}M`,
            indicators: {
              rsi: indicators.RSI,
              macd: indicators.MACD,
              sma20: indicators.SMA20,
              ema20: indicators.EMA20,
              volume24h: volume24h,
              priceChange24h: priceChange24h
            },
            advancedLLMData: advancedLLMData,
            timestamp: new Date().toISOString()
          });

          console.log(`🎯 ${normalizedSymbol} signal generated: ${action} ${signalType} with ${Math.round(signalStrength)}% strength`);
        } else {
          console.log(`❌ ${normalizedSymbol} filtered out: Strength=${signalStrength} < ${effectiveMinStrength} OR Action=${action}`);
        }
      } catch (error) {
        console.warn(`❌ Failed to generate professional signal for ${symbol}:`, error);
      }
    }

    console.log(`📊 Professional signals summary: Generated ${professionalSignals.length} signals from ${symbols.length} symbols (minStrength: ${minStrength})`);

    if (professionalSignals.length > 0) {
      console.log(`🎯 Signal breakdown:`, professionalSignals.map(s => `${s.symbol}: ${s.action} ${s.type} (${s.strength}%)`));
    } else {
      console.warn(`⚠️ No professional signals generated - check market conditions and thresholds`);
    }

    res.json({
      success: true,
      data: {
        signals: professionalSignals,
        signalCount: professionalSignals.length,
        minStrength,
        generatedAt: new Date().toISOString()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error generating professional signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate professional signals'
    } as ApiResponse);
  }
};

export const getWhaleActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols, minSize = 50000 } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      } as ApiResponse);
      return;
    }

    const whaleActivities: any[] = [];

    for (const symbol of symbols.slice(0, 8)) { // Limit for performance
      try {
        const normalizedSymbol = SymbolConverter.normalize(symbol);
        const marketData = await binanceService.getSymbolInfo(normalizedSymbol);
        const klineData = await binanceService.getKlineData(normalizedSymbol, '1m', 20);

        const volume24h = parseFloat(marketData.volume || '0');
        const currentPrice = parseFloat(marketData.price);

        // Analyze recent volume spikes for whale activity
        const recentVolumes = klineData.map((k: any) => parseFloat(k[5]));
        const avgVolume = recentVolumes.reduce((sum: number, v: number) => sum + v, 0) / recentVolumes.length;
        const maxVolume = Math.max(...recentVolumes);
        const volumeSpike = maxVolume / avgVolume;

        // Only detect whale activity in liquid markets
        if (volume24h > minSize * 10 && volumeSpike > 2) {
          const whaleTradeValue = maxVolume * currentPrice;

          if (whaleTradeValue > minSize) {
            // Determine whale activity type based on price action and volume
            const priceMovement = parseFloat(marketData.change24h || '0');
            let whaleType = 'LARGE_TRADE';
            let impact = 'LOW';

            if (volumeSpike > 5) {
              whaleType = priceMovement > 0 ? 'BUY_WALL' : 'SELL_WALL';
              impact = 'HIGH';
            } else if (volumeSpike > 3) {
              whaleType = 'ACCUMULATION';
              impact = 'MEDIUM';
            }

            // Determine side based on price action during volume spike
            const spikeIndex = recentVolumes.indexOf(maxVolume);
            const priceDuringSpike = parseFloat(klineData[spikeIndex][4]);
            const priceBefore = spikeIndex > 0 ? parseFloat(klineData[spikeIndex - 1][4]) : priceDuringSpike;
            const priceAfter = spikeIndex < klineData.length - 1 ? parseFloat(klineData[spikeIndex + 1][4]) : priceDuringSpike;

            const side = (priceDuringSpike > priceBefore || priceAfter > priceDuringSpike) ? 'BUY' : 'SELL';

            whaleActivities.push({
              symbol: normalizedSymbol,
              type: whaleType,
              side: side,
              size: Math.round(maxVolume),
              value: Math.round(whaleTradeValue),
              impact: impact,
              confidence: Math.min(0.95, 0.6 + (volumeSpike - 2) * 0.1),
              volumeSpike: volumeSpike,
              description: `${whaleType.toLowerCase().replace('_', ' ')} detected with ${volumeSpike.toFixed(1)}x volume spike`,
              timestamp: new Date(Date.now() - (recentVolumes.length - spikeIndex) * 60 * 1000).toISOString() // Estimate time based on position
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to analyze whale activity for ${symbol}:`, error);
      }
    }

    res.json({
      success: true,
      data: {
        activities: whaleActivities,
        activityCount: whaleActivities.length,
        minSize,
        detectedAt: new Date().toISOString()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error detecting whale activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect whale activity'
    } as ApiResponse);
  }
};

export const getOpportunityScanner = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols, minScore = 70 } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      } as ApiResponse);
      return;
    }

    const opportunities: any[] = [];

    for (const symbol of symbols.slice(0, 12)) { // Limit for performance
      try {
        const normalizedSymbol = SymbolConverter.normalize(symbol);
        const marketData = await binanceService.getSymbolInfo(normalizedSymbol);
        const klineData = await binanceService.getKlineData(normalizedSymbol, '1h', 24);

        // Calculate opportunity score based on multiple real factors
        const priceChange24h = parseFloat(marketData.change24h || '0');
        const volume24h = parseFloat(marketData.volume || '0');
        const currentPrice = parseFloat(marketData.price);
        const high24h = parseFloat(marketData.high24h);
        const low24h = parseFloat(marketData.low24h);
        const volatility = ((high24h - low24h) / currentPrice) * 100;

        // Calculate technical indicators
        const indicators = calculateTechnicalIndicators(klineData, ['RSI', 'MACD', 'SMA20', 'EMA20']);

        let score = 50; // Base score

        // Volume factor (weighted heavily for opportunities)
        if (volume24h > 100000000) score += 20;
        else if (volume24h > 50000000) score += 15;
        else if (volume24h > 10000000) score += 10;
        else if (volume24h > 1000000) score += 5;

        // Volatility factor (opportunities need movement but not too extreme)
        if (volatility > 3 && volatility < 12) score += 15; // Sweet spot
        else if (volatility > 2 && volatility < 15) score += 10;
        else if (volatility > 1) score += 5;

        // Price movement factor
        if (Math.abs(priceChange24h) > 5) score += 15;
        else if (Math.abs(priceChange24h) > 3) score += 10;
        else if (Math.abs(priceChange24h) > 1) score += 5;

        // Technical analysis factor
        if (indicators.RSI < 30 || indicators.RSI > 70) score += 10; // Oversold/overbought
        if (indicators.MACD.histogram > 0 && priceChange24h > 0) score += 5; // Bullish momentum
        if (indicators.MACD.histogram < 0 && priceChange24h < 0) score += 5; // Bearish momentum

        // Market position factor
        const pricePosition = (currentPrice - low24h) / (high24h - low24h);
        if (pricePosition < 0.2 || pricePosition > 0.8) score += 8; // Near extremes

        // Calculate expected return and risk metrics
        const expectedReturn = Math.min(10, Math.abs(priceChange24h) * 0.3 + volatility * 0.2);
        const riskLevel = volatility > 8 ? 'HIGH' : volatility > 4 ? 'MEDIUM' : 'LOW';

        // Risk/reward calculation
        const entry = currentPrice;
        const stopLossPercent = Math.max(1, Math.min(5, volatility * 0.3));
        const target = entry * (1 + expectedReturn / 100);
        const stopLoss = entry * (1 - stopLossPercent / 100);
        const riskReward = Math.abs(target - entry) / Math.abs(entry - stopLoss);

        // Only include opportunities with good risk/reward and above minimum score
        if (score >= minScore && riskReward > 1.5) {
          // Determine category based on dominant factor
          let category = 'MOMENTUM';
          if (volume24h > 50000000) category = 'VOLUME_SURGE';
          else if (Math.abs(priceChange24h) > 5) category = 'BREAKOUT';
          else if (indicators.RSI < 30 || indicators.RSI > 70) category = 'REVERSAL';

          opportunities.push({
            symbol: normalizedSymbol,
            score: Math.min(100, Math.round(score)),
            confidence: Math.max(0.5, Math.min(0.9, score / 100)),
            category: category,
            timeframe: '1h',
            expectedReturn: parseFloat(expectedReturn.toFixed(2)),
            riskLevel: riskLevel,
            entry: entry,
            target: parseFloat(target.toFixed(6)),
            stopLoss: parseFloat(stopLoss.toFixed(6)),
            riskReward: parseFloat(riskReward.toFixed(2)),
            volume24h: volume24h,
            priceChange: priceChange24h,
            reasoning: `${category} opportunity: ${score >= 85 ? 'Strong' : score >= 75 ? 'Good' : 'Moderate'} signals with ${riskReward.toFixed(1)}:1 R/R`,
            indicators: {
              rsi: parseFloat(indicators.RSI.toFixed(1)),
              volume_ratio: parseFloat((volume24h / (volume24h * 0.7)).toFixed(2)),
              volatility: parseFloat(volatility.toFixed(2)),
              momentum: priceChange24h,
              macd: indicators.MACD.histogram
            },
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn(`Failed to analyze opportunity for ${symbol}:`, error);
      }
    }

    // Sort by score descending
    opportunities.sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      data: {
        opportunities,
        opportunityCount: opportunities.length,
        minScore,
        scannedAt: new Date().toISOString()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error scanning opportunities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scan opportunities'
    } as ApiResponse);
  }
};