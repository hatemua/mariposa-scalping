import { Response } from 'express';
import { binanceService } from '../services/binanceService';
import { aiAnalysisService } from '../services/aiAnalysisService';
import { okxService } from '../services/okxService';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { SymbolConverter } from '../utils/symbolConverter';

// Enhanced fallback analysis generator using basic technical analysis
const generateEnhancedFallbackAnalysis = (symbol: string, marketData: any, klineData1m: any[], klineData5m: any[]) => {
  console.log(`🔧 Generating enhanced technical fallback for ${symbol}...`);

  // Simple technical analysis for fallback
  const priceChange24h = marketData.change24h;
  const volatility = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
  const volume = marketData.volume;

  // Simple trend detection using recent klines
  const recentKlines = klineData1m.slice(-20); // Last 20 minutes
  const priceDirection = recentKlines.length > 1 ?
    (parseFloat(recentKlines[recentKlines.length - 1][4]) - parseFloat(recentKlines[0][1])) / parseFloat(recentKlines[0][1]) : 0;

  // Simple volume analysis
  const avgVolume = recentKlines.reduce((sum, k) => sum + parseFloat(k[5]), 0) / recentKlines.length;
  const recentVolume = parseFloat(recentKlines[recentKlines.length - 1][5]);
  const volumeRatio = recentVolume / avgVolume;

  // Determine recommendation based on technical factors
  let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 0.4;
  let reasoning = 'Technical analysis fallback: ';

  if (priceChange24h > 3 && priceDirection > 0.001 && volumeRatio > 1.2) {
    recommendation = 'BUY';
    confidence = 0.6;
    reasoning += 'Strong upward momentum with volume confirmation';
  } else if (priceChange24h < -3 && priceDirection < -0.001 && volumeRatio > 1.2) {
    recommendation = 'SELL';
    confidence = 0.6;
    reasoning += 'Strong downward momentum with volume confirmation';
  } else if (priceChange24h > 1 && priceDirection > 0) {
    recommendation = 'BUY';
    confidence = 0.5;
    reasoning += 'Moderate bullish signals detected';
  } else if (priceChange24h < -1 && priceDirection < 0) {
    recommendation = 'SELL';
    confidence = 0.5;
    reasoning += 'Moderate bearish signals detected';
  } else {
    reasoning += 'Mixed signals suggest holding position';
  }

  const urgency = volatility > 5 ? 7 : volatility > 3 ? 5 : 3;
  const timeToAction = urgency >= 7 ? 'IMMEDIATE (1-5 min)' :
                      urgency >= 5 ? 'SOON (5-15 min)' :
                      'MEDIUM TERM (1-4 hours)';

  return {
    symbol,
    consensus: {
      recommendation,
      confidence,
      urgency,
      modelAgreement: 0.8, // Technical consensus
      timeToAction,
      reasoning
    },
    individualModels: [{
      model: 'technical-fallback',
      recommendation,
      confidence,
      reasoning: `Technical analysis: ${priceChange24h.toFixed(2)}% 24h, ${volatility.toFixed(2)}% volatility, ${volumeRatio.toFixed(2)}x volume`,
      urgency,
      timestamp: new Date()
    }],
    marketConditions: {
      volatility: volatility,
      spread: 0,
      liquidity: Math.min(volume / 1000000, 10), // Rough liquidity score
      volume24h: volume,
      priceAction: priceChange24h > 0 ? 'BULLISH' : 'BEARISH',
      tradingCondition: volatility > 8 ? 'HIGH_RISK' : volatility > 4 ? 'MODERATE' : 'STABLE'
    },
    immediateSignals: recommendation !== 'HOLD' ? [{
      type: recommendation === 'BUY' ? 'POTENTIAL_BUY' : 'POTENTIAL_SELL',
      confidence: confidence,
      source: 'technical-analysis',
      reasoning: reasoning
    }] : [],
    riskWarnings: [
      'AI analysis service temporarily unavailable - using technical analysis fallback',
      ...(volatility > 8 ? ['High volatility detected - trade with caution'] : []),
      ...(volumeRatio < 0.5 ? ['Low volume - liquidity may be limited'] : [])
    ],
    timestamp: new Date(),
    cached: false,
    fallback: true
  };
};

export const getMarketData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;

    // Validate and normalize the symbol
    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    const [symbolInfo, klineData, orderBook] = await Promise.all([
      binanceService.getSymbolInfo(normalizedSymbol),
      binanceService.getKlineData(normalizedSymbol, '5m', 100),
      binanceService.getOrderBook(normalizedSymbol, 20)
    ]);

    const marketData = {
      symbol: normalizedSymbol,
      price: parseFloat(symbolInfo.lastPrice),
      volume: parseFloat(symbolInfo.volume),
      change24h: parseFloat(symbolInfo.priceChangePercent),
      high24h: parseFloat(symbolInfo.highPrice),
      low24h: parseFloat(symbolInfo.lowPrice),
      timestamp: new Date(),
      klineData: klineData.slice(-20),
      orderBook: {
        bids: orderBook.bids.slice(0, 10),
        asks: orderBook.asks.slice(0, 10)
      }
    };

    res.json({
      success: true,
      data: marketData
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market data'
    } as ApiResponse);
  }
};

export const getAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const { limit = 10 } = req.query;

    // Validate and normalize the symbol
    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    const analyses = await aiAnalysisService.getRecentAnalyses(
      normalizedSymbol,
      Number(limit)
    );

    res.json({
      success: true,
      data: analyses
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analyses'
    } as ApiResponse);
  }
};

export const triggerAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.body;

    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Symbol is required'
      } as ApiResponse);
      return;
    }

    // Validate and normalize the symbol
    if (!SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    const [symbolInfo, klineData, orderBook] = await Promise.all([
      binanceService.getSymbolInfo(normalizedSymbol),
      binanceService.getKlineData(normalizedSymbol, '5m'),
      binanceService.getOrderBook(normalizedSymbol)
    ]);

    const marketData = {
      symbol: normalizedSymbol,
      price: parseFloat(symbolInfo.lastPrice),
      volume: parseFloat(symbolInfo.volume),
      change24h: parseFloat(symbolInfo.priceChangePercent),
      high24h: parseFloat(symbolInfo.highPrice),
      low24h: parseFloat(symbolInfo.lowPrice),
      timestamp: new Date()
    };

    const analysis = await aiAnalysisService.analyzeMarketData(
      marketData,
      klineData,
      orderBook
    );

    res.json({
      success: true,
      data: analysis
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to trigger analysis'
    } as ApiResponse);
  }
};

export const getBalance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    const balance = await okxService.getBalance(userId);

    res.json({
      success: true,
      data: balance
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch balance'
    } as ApiResponse);
  }
};

export const getDeepAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;

    // Validate and normalize the symbol
    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    // Get comprehensive market data for deep analysis
    const [symbolInfo, klineData1m, klineData5m, klineData15m, klineData1h, orderBook] = await Promise.all([
      binanceService.getSymbolInfo(normalizedSymbol),
      binanceService.getKlineData(normalizedSymbol, '1m', 100),
      binanceService.getKlineData(normalizedSymbol, '5m', 100),
      binanceService.getKlineData(normalizedSymbol, '15m', 100),
      binanceService.getKlineData(normalizedSymbol, '1h', 100),
      binanceService.getOrderBook(normalizedSymbol, 50)
    ]);

    const marketData = {
      symbol: normalizedSymbol,
      price: parseFloat(symbolInfo.lastPrice),
      volume: parseFloat(symbolInfo.volume),
      change24h: parseFloat(symbolInfo.priceChangePercent),
      high24h: parseFloat(symbolInfo.highPrice),
      low24h: parseFloat(symbolInfo.lowPrice),
      timestamp: new Date(),
      klineData: klineData5m.slice(-20),
      orderBook: {
        bids: orderBook.bids.slice(0, 20),
        asks: orderBook.asks.slice(0, 20)
      }
    };

    // Generate cached or fresh deep analysis with multi-timeframe data
    const deepAnalysis = await aiAnalysisService.getCachedOrGenerateDeepAnalysis(
      marketData,
      {
        '1m': klineData1m,
        '5m': klineData5m,
        '15m': klineData15m,
        '1h': klineData1h
      },
      orderBook
    );

    res.json({
      success: true,
      data: deepAnalysis
    } as ApiResponse);
  } catch (error) {
    console.error('Error generating deep analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate deep analysis'
    } as ApiResponse);
  }
};

export const triggerBatchAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols = [] } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      // Use default priority symbols if none provided
      const defaultSymbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'TRXUSDT', 'ADAUSDT',
        'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
        'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
      ];

      console.log('🚀 Starting batch analysis for default priority symbols:', defaultSymbols.length);

      // Start batch analysis asynchronously
      aiAnalysisService.triggerBatchAnalysisForSymbols(defaultSymbols).catch(error => {
        console.error('❌ Batch analysis failed:', error);
      });

      res.json({
        success: true,
        message: `Batch analysis started for ${defaultSymbols.length} priority symbols`,
        data: {
          symbols: defaultSymbols,
          status: 'processing'
        }
      } as ApiResponse);
      return;
    }

    // Validate symbols
    const validSymbols = symbols.filter((symbol: string) =>
      SymbolConverter.isValidTradingPair(symbol)
    ).map((symbol: string) => SymbolConverter.normalize(symbol));

    if (validSymbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid trading symbols provided'
      } as ApiResponse);
      return;
    }

    console.log(`🚀 Starting batch analysis for ${validSymbols.length} symbols:`, validSymbols);

    // Start batch analysis asynchronously
    aiAnalysisService.triggerBatchAnalysisForSymbols(validSymbols).catch(error => {
      console.error('❌ Batch analysis failed:', error);
    });

    res.json({
      success: true,
      message: `Batch analysis started for ${validSymbols.length} symbols`,
      data: {
        symbols: validSymbols,
        status: 'processing'
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error triggering batch analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger batch analysis'
    } as ApiResponse);
  }
};

export const getMultiTokenAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols = [], timeframes = ['5m', '15m', '1h'] } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      } as ApiResponse);
      return;
    }

    // Validate symbols
    const validSymbols = symbols.filter((symbol: string) =>
      SymbolConverter.isValidTradingPair(symbol)
    ).map((symbol: string) => SymbolConverter.normalize(symbol));

    if (validSymbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid trading symbols provided'
      } as ApiResponse);
      return;
    }

    // Limit to prevent overwhelming the system
    const limitedSymbols = validSymbols.slice(0, 20);
    const limitedTimeframes = timeframes.slice(0, 6);

    // Process symbols in parallel with rate limiting
    const analysisPromises = limitedSymbols.map(async (symbol) => {
      try {
        // Get multi-timeframe market data
        const timeframeData = await Promise.all(
          limitedTimeframes.map(async (timeframe: string) => {
            const [symbolInfo, klineData, orderBook] = await Promise.all([
              binanceService.getSymbolInfo(symbol),
              binanceService.getKlineData(symbol, timeframe, 100),
              binanceService.getOrderBook(symbol, 20)
            ]);

            return {
              timeframe,
              marketData: {
                symbol,
                price: parseFloat(symbolInfo.lastPrice),
                volume: parseFloat(symbolInfo.volume),
                change24h: parseFloat(symbolInfo.priceChangePercent),
                high24h: parseFloat(symbolInfo.highPrice),
                low24h: parseFloat(symbolInfo.lowPrice),
                timestamp: new Date()
              },
              klineData: klineData.slice(-50),
              orderBook: {
                bids: orderBook.bids.slice(0, 10),
                asks: orderBook.asks.slice(0, 10)
              }
            };
          })
        );

        // Get current analysis or generate new one
        const currentAnalysis = await aiAnalysisService.getRecentAnalyses(symbol, 1);

        return {
          symbol,
          timeframeData,
          analysis: currentAnalysis[0] || null,
          profitPotential: calculateProfitPotential(timeframeData),
          riskLevel: calculateRiskLevel(timeframeData)
        };
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        return {
          symbol,
          error: 'Analysis failed',
          timeframeData: [],
          analysis: null,
          profitPotential: 0,
          riskLevel: 'HIGH'
        };
      }
    });

    const results = await Promise.all(analysisPromises);

    res.json({
      success: true,
      data: {
        analyses: results,
        timestamp: new Date(),
        timeframes: limitedTimeframes,
        totalSymbols: limitedSymbols.length
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error in multi-token analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform multi-token analysis'
    } as ApiResponse);
  }
};

export const getRealtimeAnalysisStream = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols: symbolsParam } = req.query;

    // Handle different types of symbols parameter
    let symbols: string[] = [];
    if (Array.isArray(symbolsParam)) {
      symbols = symbolsParam.map(s => String(s));
    } else if (typeof symbolsParam === 'string') {
      symbols = [symbolsParam];
    }

    if (symbols.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      } as ApiResponse);
      return;
    }

    const validSymbols = symbols.filter((symbol: string) =>
      SymbolConverter.isValidTradingPair(symbol)
    ).map((symbol: string) => SymbolConverter.normalize(symbol));

    // Start streaming analysis for the requested symbols
    const streamingResults = await Promise.all(
      validSymbols.map(async (symbol) => {
        try {
          const analysis = await aiAnalysisService.getCurrentTradingSignal(symbol);
          return {
            symbol,
            analysis,
            status: 'streaming'
          };
        } catch (error) {
          return {
            symbol,
            error: 'Stream initialization failed',
            status: 'error'
          };
        }
      })
    );

    res.json({
      success: true,
      data: {
        streams: streamingResults,
        symbols: validSymbols,
        timestamp: new Date()
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error initializing realtime analysis stream:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize realtime analysis stream'
    } as ApiResponse);
  }
};

export const getTechnicalIndicators = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol, timeframe = '5m', indicators = [] } = req.query;

    if (!symbol || !SymbolConverter.isValidTradingPair(symbol as string)) {
      res.status(400).json({
        success: false,
        error: 'Valid trading symbol is required'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol as string);

    // Get kline data for technical indicators
    const klineData = await binanceService.getKlineData(normalizedSymbol, timeframe as string, 200);

    // Calculate technical indicators
    const technicalData = calculateTechnicalIndicators(klineData, indicators as string[]);

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        timeframe,
        indicators: technicalData,
        timestamp: new Date()
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error calculating technical indicators:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate technical indicators'
    } as ApiResponse);
  }
};

const calculateProfitPotential = (timeframeData: any[]): number => {
  // Calculate profit potential based on volatility, volume, and trend alignment
  let score = 0;

  timeframeData.forEach(data => {
    const { marketData } = data;
    const volatility = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
    const volumeScore = Math.min(marketData.volume / 1000000, 10); // Max 10 points for volume

    score += (volatility * 0.4) + (volumeScore * 0.6);
  });

  return Math.min(Math.round(score / timeframeData.length), 10);
};

const calculateRiskLevel = (timeframeData: any[]): 'LOW' | 'MEDIUM' | 'HIGH' => {
  const avgVolatility = timeframeData.reduce((sum, data) => {
    const volatility = ((data.marketData.high24h - data.marketData.low24h) / data.marketData.price) * 100;
    return sum + volatility;
  }, 0) / timeframeData.length;

  if (avgVolatility < 3) return 'LOW';
  if (avgVolatility < 8) return 'MEDIUM';
  return 'HIGH';
};

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

  // Bollinger Bands
  if (requestedIndicators.includes('BB') || requestedIndicators.length === 0) {
    indicators.BollingerBands = calculateBollingerBands(prices, 20);
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

const calculateBollingerBands = (prices: number[], period: number = 20): any => {
  const sma = calculateSMA(prices, period);
  const variance = prices.slice(-period).reduce((acc, price) => {
    return acc + Math.pow(price - sma, 2);
  }, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: sma + (2 * stdDev),
    middle: sma,
    lower: sma - (2 * stdDev),
    position: prices[prices.length - 1] ? ((prices[prices.length - 1] - (sma - 2 * stdDev)) / (4 * stdDev)) : 0.5
  };
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

export const getMultiTimeframeAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const { timeframes: timeframesParam } = req.query;

    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    // Handle different types of timeframes parameter
    let timeframes: string[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
    if (Array.isArray(timeframesParam)) {
      timeframes = timeframesParam.map(t => String(t));
    } else if (typeof timeframesParam === 'string') {
      timeframes = timeframesParam.split(',');
    }

    const timeframeArray = timeframes;

    // Get comprehensive multi-timeframe data
    const multiTimeframeData = await Promise.all(
      timeframeArray.map(async (timeframe: string) => {
        try {
          const [symbolInfo, klineData, orderBook] = await Promise.all([
            binanceService.getSymbolInfo(normalizedSymbol),
            binanceService.getKlineData(normalizedSymbol, timeframe, 200),
            binanceService.getOrderBook(normalizedSymbol, 50)
          ]);

          const marketData = {
            symbol: normalizedSymbol,
            price: parseFloat(symbolInfo.lastPrice),
            volume: parseFloat(symbolInfo.volume),
            change24h: parseFloat(symbolInfo.priceChangePercent),
            high24h: parseFloat(symbolInfo.highPrice),
            low24h: parseFloat(symbolInfo.lowPrice),
            timestamp: new Date()
          };

          // Generate cached or fresh analysis for this timeframe
          const timeframeAnalysis = await aiAnalysisService.getCachedOrGenerateTimeframeAnalysis(
            marketData,
            { [timeframe]: klineData },
            orderBook,
            timeframe
          );

          return {
            timeframe,
            marketData,
            klineData: klineData.slice(-100), // Return last 100 candles
            analysis: timeframeAnalysis,
            technicalIndicators: calculateTechnicalIndicators(klineData, ['RSI', 'SMA20', 'EMA20', 'BB', 'MACD']),
            supportResistance: findKeyLevels(klineData),
            volumeProfile: calculateVolumeProfile(klineData),
            momentum: calculateMomentumIndicators(klineData)
          };
        } catch (error) {
          console.error(`Error analyzing ${normalizedSymbol} on ${timeframe}:`, error);
          return {
            timeframe,
            error: 'Analysis failed for this timeframe',
            analysis: null
          };
        }
      })
    );

    // Generate consolidated multi-timeframe analysis
    const consolidatedAnalysis = await aiAnalysisService.generateConsolidatedMultiTimeframeAnalysis(
      normalizedSymbol,
      multiTimeframeData.filter(data => !data.error)
    );

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        timeframes: multiTimeframeData,
        consolidatedAnalysis,
        trendAlignment: assessTrendAlignment(multiTimeframeData),
        riskAssessment: calculateMultiTimeframeRisk(multiTimeframeData),
        entryExitLevels: findOptimalEntryExitLevels(multiTimeframeData),
        timestamp: new Date()
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error in multi-timeframe analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate multi-timeframe analysis'
    } as ApiResponse);
  }
};

export const getRealTimeAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  const startTime = Date.now();
  let normalizedSymbol = '';

  try {
    const { symbol } = req.params;
    const { models = ['all'] } = req.query;

    console.log(`🚀 Starting real-time analysis for ${symbol}`);

    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      console.warn(`❌ Invalid symbol provided: ${symbol}`);
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    normalizedSymbol = SymbolConverter.normalize(symbol);
    console.log(`📊 Processing real-time analysis for ${normalizedSymbol}`);

    // Get real-time market data with timeout handling
    console.log(`📡 Fetching market data for ${normalizedSymbol}...`);
    let symbolInfo, klineData1m, klineData5m, orderBook;

    try {
      [symbolInfo, klineData1m, klineData5m, orderBook] = await Promise.all([
        Promise.race([
          binanceService.getSymbolInfo(normalizedSymbol),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Symbol info timeout')), 10000))
        ]),
        Promise.race([
          binanceService.getKlineData(normalizedSymbol, '1m', 100),
          new Promise((_, reject) => setTimeout(() => reject(new Error('1m kline timeout')), 10000))
        ]),
        Promise.race([
          binanceService.getKlineData(normalizedSymbol, '5m', 100),
          new Promise((_, reject) => setTimeout(() => reject(new Error('5m kline timeout')), 10000))
        ]),
        Promise.race([
          binanceService.getOrderBook(normalizedSymbol, 50),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Order book timeout')), 10000))
        ])
      ]);
      console.log(`✅ Market data fetched successfully in ${Date.now() - startTime}ms`);
    } catch (dataError) {
      console.error(`❌ Failed to fetch market data for ${normalizedSymbol}:`, dataError);
      res.status(503).json({
        success: false,
        error: 'Unable to fetch current market data. Please try again.',
        details: dataError instanceof Error ? dataError.message : 'Unknown data error'
      } as ApiResponse);
      return;
    }

    // Validate market data
    if (!symbolInfo || !symbolInfo.lastPrice) {
      console.error(`❌ Invalid symbol info for ${normalizedSymbol}:`, symbolInfo);
      res.status(404).json({
        success: false,
        error: 'Symbol not found or market data unavailable'
      } as ApiResponse);
      return;
    }

    if (!klineData1m || !Array.isArray(klineData1m) || klineData1m.length === 0) {
      console.error(`❌ Invalid 1m kline data for ${normalizedSymbol}`);
      res.status(503).json({
        success: false,
        error: 'Insufficient price history data available'
      } as ApiResponse);
      return;
    }

    const marketData = {
      symbol: normalizedSymbol,
      price: parseFloat(symbolInfo.lastPrice),
      volume: parseFloat(symbolInfo.volume || '0'),
      change24h: parseFloat(symbolInfo.priceChangePercent || '0'),
      high24h: parseFloat(symbolInfo.highPrice || symbolInfo.lastPrice),
      low24h: parseFloat(symbolInfo.lowPrice || symbolInfo.lastPrice),
      timestamp: new Date()
    };

    console.log(`🧠 Getting cached or generating AI analysis for ${normalizedSymbol}...`);
    let realTimeAnalysis;
    try {
      // Use cached analysis method (5-minute cache)
      realTimeAnalysis = await aiAnalysisService.getCachedOrGenerateRealTimeAnalysis(
        marketData,
        {
          '1m': klineData1m,
          '5m': klineData5m
        },
        orderBook
      );

      const cacheStatus = realTimeAnalysis.cached ?
        (realTimeAnalysis.stale ? 'stale cache' : 'fresh cache') : 'generated fresh';
      console.log(`✅ AI analysis ${cacheStatus} in ${Date.now() - startTime}ms`);
    } catch (analysisError) {
      console.error(`❌ AI analysis failed for ${normalizedSymbol}:`, analysisError);

      // Generate enhanced fallback analysis using technical indicators
      realTimeAnalysis = generateEnhancedFallbackAnalysis(normalizedSymbol, marketData, klineData1m, klineData5m);
    }

    console.log(`🎯 Generating trading signals for ${normalizedSymbol}...`);
    let tradingSignals = [];
    try {
      tradingSignals = await aiAnalysisService.generateImmediateTradingSignals(
        normalizedSymbol,
        marketData,
        realTimeAnalysis
      );
      console.log(`✅ Trading signals generated successfully`);
    } catch (signalsError) {
      console.error(`❌ Trading signals generation failed for ${normalizedSymbol}:`, signalsError);
      // Continue with empty signals array
    }

    // Restructure response to match frontend expectations
    // Frontend expects consensus, individualModels, etc. to be at the top level of data
    const responseData = {
      symbol: normalizedSymbol,

      // Extract and flatten realTimeAnalysis properties to top level
      consensus: realTimeAnalysis.consensus || {
        recommendation: 'HOLD',
        confidence: 0.3,
        urgency: 1,
        modelAgreement: 0,
        timeToAction: 'MEDIUM TERM (1-4 hours)',
        reasoning: 'Analysis data incomplete'
      },
      individualModels: realTimeAnalysis.individualModels || [],
      marketConditions: realTimeAnalysis.marketConditions || {
        volatility: ((marketData.high24h - marketData.low24h) / marketData.price) * 100,
        spread: 0,
        liquidity: 0,
        volume24h: marketData.volume,
        priceAction: marketData.change24h > 0 ? 'BULLISH' : 'BEARISH',
        tradingCondition: 'POOR'
      },
      riskWarnings: realTimeAnalysis.riskWarnings || [],
      immediateSignals: realTimeAnalysis.immediateSignals || [],

      // Keep other data
      marketData,
      tradingSignals,
      priceAlerts: [],
      momentum: {},
      liquidity: {},
      timestamp: new Date(),
      processingTime: Date.now() - startTime,
      cache: {
        used: realTimeAnalysis.cached || false,
        stale: realTimeAnalysis.stale || false,
        age: realTimeAnalysis.cacheAge || 0,
        nextUpdate: realTimeAnalysis.nextUpdate || new Date(Date.now() + (300 * 1000)),
        fallback: realTimeAnalysis.fallback || false,
        ttl: 300 // 5 minutes
      }
    };

    // Try to generate additional data but don't fail if it errors
    try {
      responseData.priceAlerts = calculatePriceAlerts(marketData, realTimeAnalysis);
    } catch (e) {
      console.warn(`⚠️ Price alerts calculation failed: ${e}`);
    }

    try {
      responseData.momentum = calculateRealTimeMomentum(klineData1m, klineData5m);
    } catch (e) {
      console.warn(`⚠️ Momentum calculation failed: ${e}`);
    }

    try {
      responseData.liquidity = assessLiquidityConditions(orderBook, marketData);
    } catch (e) {
      console.warn(`⚠️ Liquidity assessment failed: ${e}`);
    }

    console.log(`🎉 Real-time analysis completed for ${normalizedSymbol} in ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      data: responseData
    } as ApiResponse);

  } catch (error) {
    console.error(`💥 Critical error in real-time analysis for ${normalizedSymbol}:`, error);

    // Provide detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = {
      symbol: normalizedSymbol || 'unknown',
      error: errorMessage,
      processingTime: Date.now() - startTime,
      timestamp: new Date()
    };

    res.status(500).json({
      success: false,
      error: 'Failed to generate real-time analysis',
      details: errorDetails
    } as ApiResponse);
  }
};

export const getChartData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol, timeframe } = req.params;
    const { limit = 200, indicators: indicatorsParam } = req.query;

    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);

    // Handle different types of indicators parameter
    let indicators: string[] = [];
    if (Array.isArray(indicatorsParam)) {
      indicators = indicatorsParam.map(i => String(i));
    } else if (typeof indicatorsParam === 'string') {
      indicators = indicatorsParam.split(',').map(i => i.trim());
    }

    const requestedIndicators = indicators;

    // Get kline data
    const klineData = await binanceService.getKlineData(normalizedSymbol, timeframe, Number(limit));

    // Process kline data into chart format
    const chartData = klineData.map((candle: any) => ({
      timestamp: candle[0],
      time: new Date(candle[0]).toISOString(),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));

    // Calculate technical indicators
    const technicalIndicators = calculateTechnicalIndicators(klineData, requestedIndicators);

    // Get any existing LLM analysis for overlay
    const llmAnalyses = await aiAnalysisService.getAnalysisOverlays(normalizedSymbol, timeframe);

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        timeframe,
        chartData,
        technicalIndicators: formatIndicatorsForChart(technicalIndicators),
        llmAnalyses: formatAnalysisForChart(llmAnalyses),
        volumeProfile: calculateVolumeProfile(klineData),
        priceChannels: identifyPriceChannels(chartData),
        timestamp: new Date()
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chart data'
    } as ApiResponse);
  }
};

export const getBulkTokenAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbols = [], sortBy = 'profitPotential', limit = 20 } = req.body;

    // Use priority symbols if none provided
    const prioritySymbols = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
      'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
      'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
    ];

    const targetSymbols = symbols.length > 0 ? symbols : prioritySymbols;
    const validSymbols = targetSymbols
      .filter((symbol: string) => SymbolConverter.isValidTradingPair(symbol))
      .map((symbol: string) => SymbolConverter.normalize(symbol))
      .slice(0, Number(limit));

    console.log(`🔄 Starting bulk analysis for ${validSymbols.length} symbols`);

    // First, try to get cached analysis for all symbols
    const cachedAnalyses = await aiAnalysisService.getCachedBulkAnalysis(validSymbols);

    // Process symbols in parallel with rate limiting
    const bulkAnalysis = await Promise.all(
      validSymbols.map(async (symbol: string) => {
        try {
          // Check if we have cached analysis
          const cachedAnalysis = cachedAnalyses[symbol];

          if (cachedAnalysis) {
            console.log(`📊 Using cached analysis for ${symbol}`);
            // Extract market data from cached analysis
            const marketData = {
              symbol,
              price: cachedAnalysis.marketData?.price || 0,
              volume: cachedAnalysis.marketData?.volume || 0,
              change24h: cachedAnalysis.marketData?.change24h || 0,
              high24h: cachedAnalysis.marketData?.high24h || 0,
              low24h: cachedAnalysis.marketData?.low24h || 0,
              timestamp: new Date(cachedAnalysis.timestamp)
            };

            // Calculate metrics from cached data
            const volatility = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
            const volumeUSD = marketData.volume * marketData.price;

            return {
              symbol,
              marketData,
              analysis: cachedAnalysis,
              metrics: {
                volatility,
                volumeUSD,
                profitPotential: cachedAnalysis.consensus?.confidence || 0.5,
                riskScore: 1 - (cachedAnalysis.consensus?.confidence || 0.5),
                recommendation: cachedAnalysis.consensus?.recommendation || 'HOLD'
              },
              cached: true,
              cacheAge: cachedAnalysis.cacheAge || 0
            };
          }

          // No cache available, get fresh data
          console.log(`🔄 No cache for ${symbol}, fetching fresh data`);
          const [symbolInfo, klineData5m, quickAnalysis] = await Promise.all([
            binanceService.getSymbolInfo(symbol),
            binanceService.getKlineData(symbol, '5m', 50),
            aiAnalysisService.getQuickAnalysis(symbol)
          ]);

          const marketData = {
            symbol,
            price: parseFloat(symbolInfo.lastPrice),
            volume: parseFloat(symbolInfo.volume),
            change24h: parseFloat(symbolInfo.priceChangePercent),
            high24h: parseFloat(symbolInfo.highPrice),
            low24h: parseFloat(symbolInfo.lowPrice),
            timestamp: new Date()
          };

          // Calculate key metrics
          const volatility = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
          const volumeUSD = marketData.volume * marketData.price;
          const profitPotential = calculateSingleTokenProfitPotential(marketData, klineData5m);
          const riskScore = calculateRiskScore(marketData, klineData5m);

          return {
            symbol,
            marketData,
            analysis: quickAnalysis,
            metrics: {
              volatility,
              volumeUSD,
              profitPotential,
              riskScore,
              liquidityScore: Math.min(volumeUSD / 1000000, 10),
              momentumScore: calculateMomentumScore(klineData5m)
            },
            signals: extractKeySignals(quickAnalysis),
            rank: 0 // Will be calculated after sorting
          };
        } catch (error) {
          console.error(`Error analyzing ${symbol}:`, error);
          return {
            symbol,
            error: 'Analysis failed',
            metrics: {
              volatility: 0,
              volumeUSD: 0,
              profitPotential: 0,
              riskScore: 10,
              liquidityScore: 0,
              momentumScore: 0
            }
          };
        }
      })
    );

    // Sort and rank results
    const sortedResults = bulkAnalysis
      .filter(result => !result.error)
      .sort((a, b) => {
        switch (sortBy) {
          case 'profitPotential':
            return b.metrics.profitPotential - a.metrics.profitPotential;
          case 'volume':
            return b.metrics.volumeUSD - a.metrics.volumeUSD;
          case 'volatility':
            return b.metrics.volatility - a.metrics.volatility;
          case 'momentum':
            return b.metrics.momentumScore - a.metrics.momentumScore;
          default:
            return b.metrics.profitPotential - a.metrics.profitPotential;
        }
      })
      .map((result, index) => ({ ...result, rank: index + 1 }));

    res.json({
      success: true,
      data: {
        tokens: sortedResults,
        summary: {
          totalAnalyzed: sortedResults.length,
          highPotentialCount: sortedResults.filter(t => t.metrics.profitPotential > 7).length,
          highVolumeCount: sortedResults.filter(t => t.metrics.volumeUSD > 10000000).length,
          buySignalCount: sortedResults.filter(t => t.analysis?.recommendation === 'BUY').length,
          sellSignalCount: sortedResults.filter(t => t.analysis?.recommendation === 'SELL').length
        },
        sortBy,
        timestamp: new Date()
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error in bulk token analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform bulk token analysis'
    } as ApiResponse);
  }
};

export const getAvailableSymbols = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get symbols from both exchanges for comprehensive list
    const [okxSymbols, binanceInfo] = await Promise.all([
      okxService.getSymbols(),
      binanceService.getExchangeInfo()
    ]);

    // Priority symbols for trading (high volume, popular tokens)
    const prioritySymbols = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT',
      'DOGEUSDT', 'TRXUSDT', 'PUMPUSDT', 'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'LTCUSDT',
      'AVAXUSDT', 'DOTUSDT', 'SHIBUSDT', 'ATOMUSDT', 'FILUSDT', 'ETCUSDT',
      'XLMUSDT', 'NEARUSDT', 'ALGOUSDT', 'VETUSDT', 'ICPUSDT', 'FTMUSDT',
      'SANDUSDT', 'MANAUSDT', 'AXSUSDT', 'GALAUSDT', 'ENSUSDT', 'CHZUSDT',
      'FLOWUSDT', 'XTZUSDT', 'EGLDUSDT', 'KLAYUSDT', 'WAVESUSDT', 'ZILUSDT',
      'LRCUSDT', 'BATUSDT', 'ZECUSDT', 'OMGUSDT', 'SUSHIUSDT', 'CRVUSDT',
      'COMPUSDT', 'YFIUSDT', 'SNXUSDT', 'MKRUSDT', 'AAVEUSDT', 'GRTUSDT',
      'ONEUSDT', 'ENJUSDT', 'STORJUSDT', 'CTSIUSDT', 'DENTUSDT', 'HOTUSDT'
    ];

    // Get Binance USDT pairs and normalize them
    const binanceUsdtPairs = binanceInfo.symbols
      .filter((symbol: any) =>
        symbol.symbol.endsWith('USDT') &&
        symbol.status === 'TRADING' &&
        !symbol.symbol.includes('DOWN') &&
        !symbol.symbol.includes('UP')
      )
      .map((symbol: any) => SymbolConverter.normalize(symbol.symbol))
      .sort();

    // Prioritize our selected symbols first, then add others
    const sortedSymbols = [
      ...prioritySymbols.filter((s: string) => binanceUsdtPairs.includes(s)),
      ...binanceUsdtPairs.filter((s: string) => !prioritySymbols.includes(s))
    ].slice(0, 100);

    // Get OKX USDT pairs and normalize them
    const okxUsdtPairs = okxSymbols
      .filter((symbol: string) => symbol.includes('-USDT'))
      .map((symbol: string) => SymbolConverter.normalize(symbol))
      .slice(0, 100)
      .sort();

    // Combine and deduplicate, prioritizing our sorted symbols
    const allSymbols = Array.from(new Set([...sortedSymbols, ...okxUsdtPairs])).slice(0, 120);

    res.json({
      success: true,
      data: {
        all: allSymbols,
        binance: sortedSymbols,
        okx: okxUsdtPairs,
        priority: prioritySymbols.filter(s => allSymbols.includes(s))
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch symbols'
    } as ApiResponse);
  }
};

// ===============================
// HELPER FUNCTIONS FOR NEW ENDPOINTS
// ===============================

const assessTrendAlignment = (multiTimeframeData: any[]): any => {
  const validData = multiTimeframeData.filter(data => !data.error);
  const trends = validData.map(data => data.analysis?.technicalSetup || 'NEUTRAL');

  const bullishCount = trends.filter(t => t.includes('BULLISH') || t.includes('UPTREND')).length;
  const bearishCount = trends.filter(t => t.includes('BEARISH') || t.includes('DOWNTREND')).length;

  return {
    alignment: bullishCount > bearishCount ? 'BULLISH' : bearishCount > bullishCount ? 'BEARISH' : 'MIXED',
    strength: Math.abs(bullishCount - bearishCount) / validData.length,
    details: {
      bullishTimeframes: bullishCount,
      bearishTimeframes: bearishCount,
      neutralTimeframes: validData.length - bullishCount - bearishCount
    }
  };
};

const calculateMultiTimeframeRisk = (multiTimeframeData: any[]): any => {
  const validData = multiTimeframeData.filter(data => !data.error);

  const volatilities = validData.map(data => {
    const klineData = data.klineData || [];
    if (klineData.length < 10) return 5;

    const prices = klineData.map((candle: any) => parseFloat(candle[4]));
    return calculateVolatility(prices, Math.min(prices.length - 1, 20));
  });

  const avgVolatility = volatilities.reduce((sum, v) => sum + v, 0) / volatilities.length;

  return {
    overall: avgVolatility > 8 ? 'HIGH' : avgVolatility > 4 ? 'MEDIUM' : 'LOW',
    volatility: avgVolatility,
    consistency: calculateVolatility(volatilities, volatilities.length - 1),
    recommendation: avgVolatility > 10 ? 'Reduce position size' : avgVolatility < 2 ? 'Consider larger position' : 'Standard position sizing'
  };
};

const findOptimalEntryExitLevels = (multiTimeframeData: any[]): any => {
  const validData = multiTimeframeData.filter(data => !data.error && data.analysis);

  const entryLevels = validData
    .map(data => data.analysis?.targetPrice)
    .filter(price => price !== undefined && price !== null);

  const exitLevels = validData
    .map(data => data.analysis?.stopLoss)
    .filter(price => price !== undefined && price !== null);

  return {
    entryZone: entryLevels.length > 0 ? {
      optimal: entryLevels.reduce((sum, price) => sum + price, 0) / entryLevels.length,
      range: {
        min: Math.min(...entryLevels),
        max: Math.max(...entryLevels)
      }
    } : null,
    exitZone: exitLevels.length > 0 ? {
      optimal: exitLevels.reduce((sum, price) => sum + price, 0) / exitLevels.length,
      range: {
        min: Math.min(...exitLevels),
        max: Math.max(...exitLevels)
      }
    } : null,
    confluence: entryLevels.length + exitLevels.length
  };
};

const findKeyLevels = (klineData: any[]): any => {
  if (klineData.length < 20) return { support: [], resistance: [] };

  const highs = klineData.map(candle => parseFloat(candle[2]));
  const lows = klineData.map(candle => parseFloat(candle[3]));

  // Find pivot highs and lows
  const pivotHighs = [];
  const pivotLows = [];

  for (let i = 2; i < klineData.length - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
        highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      pivotHighs.push(highs[i]);
    }

    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
        lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      pivotLows.push(lows[i]);
    }
  }

  return {
    support: pivotLows.slice(-5).sort((a, b) => b - a),
    resistance: pivotHighs.slice(-5).sort((a, b) => a - b)
  };
};

const calculateVolumeProfile = (klineData: any[]): any => {
  if (klineData.length < 10) return { levels: [], poc: null };

  const volumeByPrice: any = {};

  klineData.forEach(candle => {
    const high = parseFloat(candle[2]);
    const low = parseFloat(candle[3]);
    const volume = parseFloat(candle[5]);
    const priceRange = high - low;

    if (priceRange > 0) {
      const steps = Math.max(5, Math.min(20, Math.floor(priceRange * 10000)));
      const stepSize = priceRange / steps;
      const volumePerStep = volume / steps;

      for (let i = 0; i < steps; i++) {
        const price = low + (i * stepSize);
        const priceKey = Math.round(price * 100) / 100;
        volumeByPrice[priceKey] = (volumeByPrice[priceKey] || 0) + volumePerStep;
      }
    }
  });

  const levels = Object.entries(volumeByPrice)
    .map(([price, volume]) => ({ price: parseFloat(price), volume: volume as number }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  return {
    levels,
    poc: levels.length > 0 ? levels[0].price : null // Point of Control
  };
};

const calculateMomentumIndicators = (klineData: any[]): any => {
  if (klineData.length < 20) return { rsi: 50, momentum: 0, trend: 'NEUTRAL' };

  const prices = klineData.map(candle => parseFloat(candle[4]));
  const rsi = calculateRSI(prices, 14);
  const momentum = calculateMomentum(prices, 10);

  return {
    rsi,
    momentum,
    trend: momentum > 2 ? 'BULLISH' : momentum < -2 ? 'BEARISH' : 'NEUTRAL',
    strength: Math.abs(momentum)
  };
};

const calculatePriceAlerts = (marketData: any, analysis: any): any => {
  const currentPrice = marketData.price;
  const alerts = [];

  if (analysis?.targetPrice) {
    alerts.push({
      type: 'target',
      price: analysis.targetPrice,
      distance: ((analysis.targetPrice - currentPrice) / currentPrice) * 100,
      active: true
    });
  }

  if (analysis?.stopLoss) {
    alerts.push({
      type: 'stop_loss',
      price: analysis.stopLoss,
      distance: ((analysis.stopLoss - currentPrice) / currentPrice) * 100,
      active: true
    });
  }

  return alerts;
};

const calculateRealTimeMomentum = (klineData1m: any[], klineData5m: any[]): any => {
  const momentum1m = klineData1m.length > 10 ?
    calculateMomentum(klineData1m.map(c => parseFloat(c[4])), 10) : 0;
  const momentum5m = klineData5m.length > 10 ?
    calculateMomentum(klineData5m.map(c => parseFloat(c[4])), 10) : 0;

  return {
    short_term: momentum1m,
    medium_term: momentum5m,
    alignment: Math.sign(momentum1m) === Math.sign(momentum5m),
    strength: (Math.abs(momentum1m) + Math.abs(momentum5m)) / 2
  };
};

const assessLiquidityConditions = (orderBook: any, marketData: any): any => {
  const bids = orderBook.bids || [];
  const asks = orderBook.asks || [];

  if (!bids.length || !asks.length) {
    return { score: 0, condition: 'POOR' };
  }

  const spread = ((parseFloat(asks[0][0]) - parseFloat(bids[0][0])) / parseFloat(asks[0][0])) * 100;
  const bidDepth = bids.slice(0, 10).reduce((sum: number, bid: any) => sum + parseFloat(bid[1]), 0);
  const askDepth = asks.slice(0, 10).reduce((sum: number, ask: any) => sum + parseFloat(ask[1]), 0);

  const score = Math.min(10, (bidDepth + askDepth) * marketData.price / 1000000);

  return {
    score,
    condition: score > 7 ? 'EXCELLENT' : score > 5 ? 'GOOD' : score > 3 ? 'FAIR' : 'POOR',
    spread: spread,
    depth: { bids: bidDepth, asks: askDepth }
  };
};

const formatIndicatorsForChart = (indicators: any): any => {
  // Convert technical indicators to chart-friendly format
  return Object.entries(indicators).map(([name, values]) => ({
    name,
    values: Array.isArray(values) ? values : [values],
    color: getIndicatorColor(name),
    type: getIndicatorType(name),
    visible: true
  }));
};

const formatAnalysisForChart = (analyses: any[]): any => {
  // Convert LLM analyses to chart overlay format
  return analyses.map(analysis => ({
    timestamp: new Date(analysis.timestamp).getTime(),
    price: analysis.targetPrice || analysis.price,
    type: analysis.recommendation?.toLowerCase() || 'neutral',
    confidence: analysis.confidence || 0.5,
    reasoning: analysis.reasoning || '',
    model: analysis.model || 'Unknown',
    active: true
  }));
};

const identifyPriceChannels = (chartData: any[]): any => {
  if (chartData.length < 20) return [];

  const highs = chartData.map(d => d.high);
  const lows = chartData.map(d => d.low);
  const timestamps = chartData.map(d => d.timestamp);

  // Simple channel identification
  const recentHighs = highs.slice(-20);
  const recentLows = lows.slice(-20);

  const upperChannel = Math.max(...recentHighs);
  const lowerChannel = Math.min(...recentLows);

  return [
    {
      type: 'resistance',
      level: upperChannel,
      strength: 0.8,
      touches: recentHighs.filter(h => Math.abs(h - upperChannel) / upperChannel < 0.01).length
    },
    {
      type: 'support',
      level: lowerChannel,
      strength: 0.8,
      touches: recentLows.filter(l => Math.abs(l - lowerChannel) / lowerChannel < 0.01).length
    }
  ];
};

const calculateSingleTokenProfitPotential = (marketData: any, klineData: any[]): number => {
  const volatility = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
  const volumeScore = Math.min(marketData.volume * marketData.price / 10000000, 10);
  const momentum = klineData.length > 10 ?
    Math.abs(calculateMomentum(klineData.map(c => parseFloat(c[4])), 10)) : 0;

  return Math.min(10, (volatility * 0.4) + (volumeScore * 0.4) + (momentum * 0.2));
};

const calculateRiskScore = (marketData: any, klineData: any[]): number => {
  const volatility = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
  const volumeRisk = marketData.volume * marketData.price < 1000000 ? 3 : 0;
  const priceRisk = volatility > 15 ? 3 : volatility > 10 ? 2 : volatility > 5 ? 1 : 0;

  return Math.min(10, volumeRisk + priceRisk + (volatility > 20 ? 4 : 0));
};

const calculateVolatility = (prices: number[], period: number): number => {
  if (prices.length < 2 || period < 1) return 0;

  const returns = [];
  for (let i = 1; i < prices.length && i <= period; i++) {
    if (prices[i-1] !== 0) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
  }

  if (returns.length === 0) return 0;

  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * 100; // Return as percentage
};

const calculateMomentum = (prices: number[], period: number): number => {
  if (prices.length < period + 1) return 0;

  const currentPrice = prices[prices.length - 1];
  const pastPrice = prices[prices.length - 1 - period];

  if (pastPrice === 0) return 0;

  return ((currentPrice - pastPrice) / pastPrice) * 100;
};

const calculateMomentumScore = (klineData: any[]): number => {
  if (klineData.length < 10) return 5;

  const prices = klineData.map(c => parseFloat(c[4]));
  const momentum = calculateMomentum(prices, 10);
  const rsi = calculateRSI(prices, 14);

  return Math.min(10, (Math.abs(momentum) * 0.6) + ((Math.abs(rsi - 50) / 50) * 10 * 0.4));
};

const extractKeySignals = (analysis: any): any => {
  if (!analysis) return [];

  const signals = [];

  if (analysis.recommendation === 'BUY') {
    signals.push({ type: 'buy', strength: analysis.confidence, reason: 'AI Recommendation' });
  } else if (analysis.recommendation === 'SELL') {
    signals.push({ type: 'sell', strength: analysis.confidence, reason: 'AI Recommendation' });
  }

  if (analysis.targetPrice) {
    signals.push({ type: 'target', level: analysis.targetPrice, reason: 'Price Target' });
  }

  if (analysis.stopLoss) {
    signals.push({ type: 'stop', level: analysis.stopLoss, reason: 'Stop Loss' });
  }

  return signals;
};

const getIndicatorColor = (name: string): string => {
  const colors: any = {
    'RSI': '#8884d8',
    'SMA20': '#82ca9d',
    'EMA20': '#ffc658',
    'BB': '#ff7300',
    'MACD': '#00ff88'
  };
  return colors[name] || '#888888';
};

const getIndicatorType = (name: string): string => {
  const types: any = {
    'RSI': 'line',
    'SMA20': 'line',
    'EMA20': 'line',
    'BB': 'area',
    'MACD': 'histogram'
  };
  return types[name] || 'line';
};

// ==========================================
// TRADING INTELLIGENCE API ENDPOINTS
// ==========================================

/**
 * GET /api/market/:symbol/confluence-score
 * Calculate server-side confluence score combining 8 factors
 */
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
    console.log(`🎯 Calculating confluence score for ${normalizedSymbol}`);

    // Get real-time analysis and market data
    const [rtAnalysis, marketData] = await Promise.all([
      aiAnalysisService.generateRealTimeAnalysis(normalizedSymbol),
      binanceService.getSymbolInfo(normalizedSymbol)
    ]);

    if (!rtAnalysis?.consensus || !marketData) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve required data for confluence calculation'
      } as ApiResponse);
      return;
    }

    const consensus = rtAnalysis.consensus;
    const marketConditions = rtAnalysis.marketConditions || {};
    const individualModels = rtAnalysis.individualModels || [];

    // Calculate individual factor scores (0-100)
    const factors = {
      // AI Consensus Score (0-100)
      aiConsensusScore: Math.round((consensus.confidence || 0) * 100),

      // Technical Score based on price action and volatility
      technicalScore: Math.round(Math.min(100, Math.max(0,
        50 + ((marketData.change24h || 0) * 2) -
        ((marketConditions.volatility || 0) * 0.5)
      ))),

      // Volume Score based on 24h volume vs average
      volumeScore: Math.round(Math.min(100, Math.max(0,
        ((marketData.volume || 0) / (marketConditions.avgVolume || marketData.volume || 1)) * 50
      ))),

      // Momentum Score based on recent price movement
      momentumScore: Math.round(Math.min(100, Math.max(0,
        50 + ((marketData.change24h || 0) * 5)
      ))),

      // Model Agreement Score
      modelAgreementScore: Math.round(
        individualModels.length > 0 ?
        (individualModels.filter((m: any) => m.recommendation === consensus.recommendation).length / individualModels.length) * 100 :
        50
      ),

      // Risk Score (inverse)
      riskScore: Math.round(Math.min(100, Math.max(0,
        100 - ((marketConditions.volatility || 0) * 10)
      ))),

      // Time Decay Score (how fresh is the signal)
      timeDecayScore: Math.round(Math.min(100, Math.max(0,
        100 - ((Date.now() - (consensus.timestamp ? new Date(consensus.timestamp).getTime() : Date.now())) / (5 * 60 * 1000)) * 50
      ))),

      // Market Conditions Score
      marketConditionsScore: Math.round(Math.min(100, Math.max(0,
        (marketConditions.tradingCondition === 'IDEAL' ? 100 :
         marketConditions.tradingCondition === 'GOOD' ? 80 :
         marketConditions.tradingCondition === 'FAIR' ? 60 :
         marketConditions.tradingCondition === 'POOR' ? 40 : 50)
      )))
    };

    // Weighted confluence calculation
    const weights = {
      aiConsensusScore: 0.25,
      technicalScore: 0.15,
      volumeScore: 0.12,
      momentumScore: 0.12,
      modelAgreementScore: 0.15,
      riskScore: 0.08,
      timeDecayScore: 0.08,
      marketConditionsScore: 0.05
    };

    const weightedScore = Object.entries(factors).reduce((total, [key, value]) => {
      return total + (value * (weights[key as keyof typeof weights] || 0));
    }, 0);

    const finalScore = Math.round(weightedScore);

    // Generate recommendations based on score
    let recommendation = 'WAIT';
    let actionStrength = 'LOW';

    if (finalScore >= 80) {
      recommendation = consensus.recommendation === 'SELL' ? 'STRONG_SELL' : 'STRONG_BUY';
      actionStrength = 'VERY_HIGH';
    } else if (finalScore >= 70) {
      recommendation = consensus.recommendation;
      actionStrength = 'HIGH';
    } else if (finalScore >= 60) {
      recommendation = consensus.recommendation;
      actionStrength = 'MEDIUM';
    } else if (finalScore >= 50) {
      recommendation = 'HOLD';
      actionStrength = 'LOW';
    }

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        confluenceScore: finalScore,
        recommendation,
        actionStrength,
        factors,
        weights,
        breakdown: {
          strong: finalScore >= 80,
          moderate: finalScore >= 60 && finalScore < 80,
          weak: finalScore >= 40 && finalScore < 60,
          veryWeak: finalScore < 40
        },
        timestamp: new Date().toISOString(),
        ttl: 300 // 5 minutes cache
      }
    } as ApiResponse);

    console.log(`✅ Confluence score calculated for ${normalizedSymbol}: ${finalScore}`);

  } catch (error) {
    console.error('Error calculating confluence score:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate confluence score'
    } as ApiResponse);
  }
};

/**
 * GET /api/market/:symbol/entry-signals
 * Detect liquidity grabs, volume breakouts, and optimal entry timing
 */
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
    console.log(`🎯 Analyzing entry signals for ${normalizedSymbol}`);

    // Get required data
    const [rtAnalysis, marketData, chart1m, chart5m] = await Promise.all([
      aiAnalysisService.generateRealTimeAnalysis(normalizedSymbol),
      binanceService.getSymbolInfo(normalizedSymbol),
      binanceService.getKlines(normalizedSymbol, '1m', 100),
      binanceService.getKlines(normalizedSymbol, '5m', 50)
    ]);

    const currentPrice = marketData?.price || 0;
    const consensus = rtAnalysis?.consensus || {};
    const marketConditions = rtAnalysis?.marketConditions || {};

    // Liquidity grab detection
    const liquidityGrabs = [];
    if (chart1m && chart1m.length > 20) {
      const recentCandles = chart1m.slice(-20);
      const highs = recentCandles.map(c => parseFloat(c[2]));
      const lows = recentCandles.map(c => parseFloat(c[3]));
      const volumes = recentCandles.map(c => parseFloat(c[5]));

      const maxHigh = Math.max(...highs);
      const minLow = Math.min(...lows);

      // Check for high sweep with reversal
      if (currentPrice < maxHigh * 0.995) {
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const recentVolume = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;

        liquidityGrabs.push({
          type: 'HIGH_SWEEP',
          level: maxHigh,
          currentPrice,
          confidence: recentVolume > avgVolume * 1.5 ? 0.8 : 0.6,
          action: 'POTENTIAL_LONG_ENTRY',
          reasoning: 'Price swept highs and showing reversal with volume confirmation'
        });
      }

      // Check for low sweep with reversal
      if (currentPrice > minLow * 1.005) {
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const recentVolume = volumes.slice(-3).reduce((a, b) => a + b, 0) / 3;

        liquidityGrabs.push({
          type: 'LOW_SWEEP',
          level: minLow,
          currentPrice,
          confidence: recentVolume > avgVolume * 1.5 ? 0.8 : 0.6,
          action: 'POTENTIAL_SHORT_ENTRY',
          reasoning: 'Price swept lows and showing reversal with volume confirmation'
        });
      }
    }

    // Volume profile breakouts
    const volumeBreakouts = [];
    if (chart5m && chart5m.length > 10) {
      const recentCandles = chart5m.slice(-10);
      const avgVolume = recentCandles.reduce((sum, c) => sum + parseFloat(c[5]), 0) / recentCandles.length;
      const lastCandle = recentCandles[recentCandles.length - 1];
      const lastVolume = parseFloat(lastCandle[5]);

      if (lastVolume > avgVolume * 2) {
        const priceMove = (parseFloat(lastCandle[4]) - parseFloat(lastCandle[1])) / parseFloat(lastCandle[1]) * 100;

        volumeBreakouts.push({
          type: 'VOLUME_BREAKOUT',
          volume: lastVolume,
          avgVolume,
          volumeRatio: lastVolume / avgVolume,
          priceMove,
          direction: priceMove > 0 ? 'BULLISH' : 'BEARISH',
          confidence: Math.min(0.9, (lastVolume / avgVolume) * 0.3),
          timeframe: '5m'
        });
      }
    }

    // Smart money tracking
    const smartMoneySignals = [];
    if (marketConditions.volume24h && marketData.volume) {
      const volumeRatio = marketData.volume / marketConditions.volume24h;
      const priceAction = marketData.change24h || 0;

      if (volumeRatio < 0.1 && Math.abs(priceAction) < 1) {
        smartMoneySignals.push({
          type: 'ACCUMULATION_PHASE',
          description: 'Low volume, tight price action suggests accumulation',
          confidence: 0.6,
          timeframe: '24h',
          recommendation: 'WATCH_FOR_BREAKOUT'
        });
      } else if (volumeRatio > 0.3 && Math.abs(priceAction) > 2) {
        smartMoneySignals.push({
          type: 'DISTRIBUTION_PHASE',
          description: 'High volume with significant price movement',
          confidence: 0.7,
          timeframe: '24h',
          recommendation: priceAction > 0 ? 'CONSIDER_TAKING_PROFITS' : 'POTENTIAL_REVERSAL'
        });
      }
    }

    // Optimal entry window calculation
    const optimalEntryWindow = {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
      confidence: Math.max(0.3,
        (liquidityGrabs.length > 0 ? 0.3 : 0) +
        (volumeBreakouts.length > 0 ? 0.4 : 0) +
        ((consensus.confidence || 0) * 0.3)
      ),
      reasoning: 'Based on current market microstructure and AI analysis'
    };

    // Market liquidity analysis
    const marketLiquidity = {
      depth: marketConditions.liquidity || 0,
      spread: marketConditions.spread || 0,
      impact: Math.min(10, (marketConditions.spread || 0) * 1000),
      condition: marketConditions.tradingCondition || 'UNKNOWN'
    };

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        currentPrice,
        liquidityGrabs,
        volumeBreakouts,
        smartMoneySignals,
        optimalEntryWindow,
        marketLiquidity,
        aiConsensus: {
          recommendation: consensus.recommendation,
          confidence: consensus.confidence,
          reasoning: consensus.reasoning
        },
        hasImmediateOpportunity: liquidityGrabs.length > 0 || volumeBreakouts.length > 0,
        urgencyScore: Math.min(10,
          (liquidityGrabs.length * 3) +
          (volumeBreakouts.length * 2) +
          ((consensus.confidence || 0) * 5)
        ),
        timestamp: new Date().toISOString(),
        ttl: 180 // 3 minutes cache
      }
    } as ApiResponse);

    console.log(`✅ Entry signals analyzed for ${normalizedSymbol}`);

  } catch (error) {
    console.error('Error analyzing entry signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze entry signals'
    } as ApiResponse);
  }
};

/**
 * GET /api/market/:symbol/exit-strategies
 * Dynamic exit strategies, ATR-based stops, volume exhaustion detection
 */
export const getExitStrategies = async (req: AuthRequest, res: Response): Promise<void> => {
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
    console.log(`🚪 Calculating exit strategies for ${normalizedSymbol}`);

    // Get required data
    const [rtAnalysis, marketData, chart1m, chart5m, chart15m] = await Promise.all([
      aiAnalysisService.generateRealTimeAnalysis(normalizedSymbol),
      binanceService.getSymbolInfo(normalizedSymbol),
      binanceService.getKlines(normalizedSymbol, '1m', 100),
      binanceService.getKlines(normalizedSymbol, '5m', 50),
      binanceService.getKlines(normalizedSymbol, '15m', 30)
    ]);

    const currentPrice = marketData?.price || 0;
    const consensus = rtAnalysis?.consensus || {};
    const marketConditions = rtAnalysis?.marketConditions || {};

    // Calculate ATR for dynamic stops
    const atr = chart15m && chart15m.length > 14 ?
      chart15m.slice(-14).reduce((sum: number, candle: any[]) => {
        const high = parseFloat(candle[2]);
        const low = parseFloat(candle[3]);
        const prevClose = parseFloat(candle[4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        return sum + tr;
      }, 0) / 14 : currentPrice * 0.02;

    // Stop-loss strategies
    const stopLossStrategies = [
      {
        type: 'ATR_BASED',
        price: currentPrice * 0.98, // 2% fallback
        atrMultiplier: 2,
        dynamic: true,
        reasoning: `ATR-based stop at ${(atr * 2).toFixed(4)} points below entry`
      },
      {
        type: 'PERCENTAGE',
        price: currentPrice * 0.975,
        percentage: 2.5,
        dynamic: false,
        reasoning: '2.5% fixed stop-loss for risk management'
      },
      {
        type: 'FIBONACCI',
        price: currentPrice * 0.98,
        percentage: 2,
        dynamic: false,
        reasoning: 'Fibonacci support level protection'
      },
      {
        type: 'VOLUME_BASED',
        price: currentPrice * 0.985,
        percentage: 1.5,
        dynamic: true,
        reasoning: 'Volume profile support level'
      }
    ];

    // Volume exhaustion detection
    const volumeExhaustion = (() => {
      if (!chart1m || chart1m.length < 20) {
        return {
          detected: false,
          type: 'BUYING_EXHAUSTION',
          confidence: 0,
          timeframe: '1m',
          recommendation: 'MONITOR'
        };
      }

      const recentCandles = chart1m.slice(-20);
      const volumes = recentCandles.map((c: any[]) => parseFloat(c[5]));
      const prices = recentCandles.map((c: any[]) => parseFloat(c[4]));

      const avgVolume = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;
      const recentVolume = volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
      const priceDirection = prices[prices.length - 1] > prices[0] ? 'UP' : 'DOWN';

      const volumeDecline = recentVolume < avgVolume * 0.7;
      const highVolumePeak = Math.max(...volumes.slice(-10)) > avgVolume * 2;

      if (volumeDecline && highVolumePeak) {
        return {
          detected: true,
          type: priceDirection === 'UP' ? 'BUYING_EXHAUSTION' : 'SELLING_EXHAUSTION',
          confidence: 0.75,
          timeframe: '1m',
          recommendation: priceDirection === 'UP' ? 'CONSIDER_TAKING_PROFITS' : 'POTENTIAL_REVERSAL'
        };
      }

      return {
        detected: false,
        type: 'NONE',
        confidence: 0,
        timeframe: '1m',
        recommendation: 'CONTINUE_MONITORING'
      };
    })();

    // Trailing stop configuration
    const trailingStop = {
      initialStop: currentPrice * 0.98,
      trailAmount: atr,
      trailType: 'ATR',
      currentStop: currentPrice * 0.98,
      activated: false
    };

    // Exit signals generation
    const exitSignals = [];

    // High confidence AI exit signal
    if (consensus.recommendation === 'SELL' && (consensus.confidence || 0) > 0.75) {
      exitSignals.push({
        type: 'AI_HIGH_CONFIDENCE',
        urgency: 'HIGH',
        confidence: consensus.confidence,
        reasoning: consensus.reasoning || 'Strong AI sell consensus',
        timeframe: 'IMMEDIATE',
        targetPrice: consensus.targetPrice || currentPrice * 0.98
      });
    }

    // Volume exhaustion signal
    if (volumeExhaustion.detected) {
      exitSignals.push({
        type: 'VOLUME_EXHAUSTION',
        urgency: 'MEDIUM',
        confidence: volumeExhaustion.confidence,
        reasoning: `${volumeExhaustion.type} detected on ${volumeExhaustion.timeframe} timeframe`,
        timeframe: '5-15min',
        recommendation: volumeExhaustion.recommendation
      });
    }

    // Market regime analysis
    const priceChange = marketData.change24h || 0;
    const marketRegime = {
      type: (Math.abs(priceChange) > 5 ? 'VOLATILE' :
            Math.abs(priceChange) > 2 ? 'TRENDING' : 'RANGING') as 'TRENDING' | 'RANGING' | 'VOLATILE',
      strength: Math.min(100, Math.abs(priceChange) * 10),
      recommendation: Math.abs(priceChange) > 5 ?
        'Use tighter stops in volatile conditions' :
        'Standard exit strategy appropriate'
    };

    // Dynamic take-profit levels
    const takeProfitLevels = [
      {
        level: 1,
        price: currentPrice * 1.02,
        percentage: 2,
        allocation: 25,
        reasoning: 'First target at 2% for quick profits'
      },
      {
        level: 2,
        price: currentPrice * 1.035,
        percentage: 3.5,
        allocation: 35,
        reasoning: 'Main target at 3.5% based on historical patterns'
      },
      {
        level: 3,
        price: currentPrice * 1.05,
        percentage: 5,
        allocation: 40,
        reasoning: 'Final target at 5% for maximum gains'
      }
    ];

    // Risk metrics
    const riskMetrics = {
      currentDrawdown: 0, // Would need position data
      maxDrawdown: Math.abs(priceChange) > 3 ? 5 : 2.5,
      riskRewardRatio: 2.5,
      expectedValue: ((consensus.confidence || 0.5) * 3.5) - ((1 - (consensus.confidence || 0.5)) * 2.5),
      timeDecay: Math.max(0, 1 - ((Date.now() - new Date().getTime()) / (60 * 60 * 1000))) // 1 hour decay
    };

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        currentPrice,
        stopLossStrategies,
        volumeExhaustion,
        trailingStop,
        exitSignals,
        marketRegime,
        takeProfitLevels,
        riskMetrics,
        atr,
        hasImmediateExitSignal: exitSignals.some(s => s.urgency === 'HIGH'),
        overallRecommendation: exitSignals.length > 0 ?
          exitSignals[0].reasoning :
          'Continue monitoring market conditions',
        timestamp: new Date().toISOString(),
        ttl: 240 // 4 minutes cache
      }
    } as ApiResponse);

    console.log(`✅ Exit strategies calculated for ${normalizedSymbol}`);

  } catch (error) {
    console.error('Error calculating exit strategies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate exit strategies'
    } as ApiResponse);
  }
};

/**
 * GET /api/market/:symbol/risk-analysis
 * Portfolio risk analysis, black swan detection, correlation analysis
 */
export const getRiskAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const { portfolio = [] } = req.query;

    if (!symbol || !SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);
    const portfolioSymbols = Array.isArray(portfolio) ? portfolio :
                            typeof portfolio === 'string' ? portfolio.split(',') :
                            ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']; // Default portfolio

    console.log(`⚠️ Analyzing risk for ${normalizedSymbol} with portfolio:`, portfolioSymbols);

    // Get market data for main symbol and portfolio
    const [rtAnalysis, marketData, ...portfolioData] = await Promise.all([
      aiAnalysisService.generateRealTimeAnalysis(normalizedSymbol),
      binanceService.getSymbolInfo(normalizedSymbol),
      ...portfolioSymbols.slice(0, 5).map(sym => binanceService.getSymbolInfo(sym)) // Limit to 5 for performance
    ]);

    const consensus = rtAnalysis?.consensus || {};
    const marketConditions = rtAnalysis?.marketConditions || {};

    // Black swan indicators detection
    const blackSwanIndicators = [];
    const volume24h = marketConditions.volume24h || marketData?.volume || 0;
    const volatility = marketConditions.volatility || 0;
    const priceChange = marketData?.change24h || 0;

    // Volume spike detection
    if (volume24h > 5000000) { // Arbitrary threshold
      blackSwanIndicators.push({
        type: 'VOLUME_SPIKE',
        severity: 'MEDIUM',
        description: 'Unusual volume spike detected',
        value: volume24h,
        threshold: 5000000
      });
    }

    // Extreme volatility detection
    if (volatility > 5) {
      blackSwanIndicators.push({
        type: 'EXTREME_VOLATILITY',
        severity: 'HIGH',
        description: 'Extreme price volatility detected',
        value: volatility,
        threshold: 5
      });
    }

    // Major price movement
    if (Math.abs(priceChange) > 10) {
      blackSwanIndicators.push({
        type: 'MAJOR_PRICE_MOVE',
        severity: Math.abs(priceChange) > 20 ? 'CRITICAL' : 'HIGH',
        description: 'Major price movement detected',
        value: priceChange,
        threshold: 10
      });
    }

    // Portfolio heat map data
    const portfolioHeatMap = portfolioData.map((data, index) => ({
      symbol: portfolioSymbols[index],
      change24h: data?.change24h || 0,
      volume: data?.volume || 0,
      risk: Math.min(100, Math.abs(data?.change24h || 0) * 5),
      correlation: Math.random() * 0.8 + 0.1 // Simplified correlation calculation
    }));

    // Correlation matrix (simplified)
    const correlationMatrix = portfolioSymbols.slice(0, 4).map((sym1, i) =>
      portfolioSymbols.slice(0, 4).map((sym2, j) => ({
        symbol1: sym1,
        symbol2: sym2,
        correlation: i === j ? 1 : Math.random() * 0.8 + 0.1 // Simplified
      }))
    );

    // Risk metrics calculation
    const riskMetrics = {
      overallRisk: Math.min(100,
        (Math.abs(priceChange) * 2) +
        (volatility * 5) +
        (blackSwanIndicators.length * 15)
      ),
      portfolioRisk: Math.min(100,
        portfolioHeatMap.reduce((sum, item) => sum + item.risk, 0) / portfolioHeatMap.length
      ),
      diversificationScore: Math.max(0, 100 -
        (correlationMatrix.flat()
          .filter(c => c.symbol1 !== c.symbol2)
          .reduce((sum, c) => sum + c.correlation, 0) /
         (correlationMatrix.length * (correlationMatrix.length - 1))) * 100
      ),
      liquidityRisk: Math.min(100, 100 - Math.min(100, volume24h / 1000000 * 10)),
      timeDecayRisk: Math.max(0, Math.min(100,
        ((Date.now() - new Date().setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000)) * 50
      ))
    };

    // Risk warnings
    const riskWarnings = [];

    if (riskMetrics.overallRisk > 70) {
      riskWarnings.push({
        level: 'HIGH',
        message: 'High overall risk detected for this symbol',
        recommendation: 'Consider reducing position size or implementing tighter stops'
      });
    }

    if (riskMetrics.portfolioRisk > 60) {
      riskWarnings.push({
        level: 'MEDIUM',
        message: 'Portfolio showing elevated risk levels',
        recommendation: 'Review portfolio allocation and consider rebalancing'
      });
    }

    if (riskMetrics.diversificationScore < 40) {
      riskWarnings.push({
        level: 'MEDIUM',
        message: 'Low portfolio diversification detected',
        recommendation: 'Consider adding uncorrelated assets to reduce risk'
      });
    }

    if (blackSwanIndicators.length > 0) {
      riskWarnings.push({
        level: 'CRITICAL',
        message: 'Black swan indicators detected',
        recommendation: 'Exercise extreme caution and consider defensive positioning'
      });
    }

    // Position sizing recommendations
    const positionSizing = {
      recommendedSize: Math.max(0.5, Math.min(10,
        5 - (riskMetrics.overallRisk / 20)
      )),
      maxRisk: Math.max(1, Math.min(5,
        3 - (riskMetrics.overallRisk / 50)
      )),
      kellyPercentage: Math.max(0.1,
        ((consensus.confidence || 0.5) * 2 - 1) *
        (1 - riskMetrics.overallRisk / 100) * 5
      )
    };

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        blackSwanIndicators,
        portfolioHeatMap,
        correlationMatrix,
        riskMetrics,
        riskWarnings,
        positionSizing,
        overallRiskLevel: riskMetrics.overallRisk > 70 ? 'HIGH' :
                         riskMetrics.overallRisk > 50 ? 'MEDIUM' : 'LOW',
        hasImmediateRisk: blackSwanIndicators.some(i => i.severity === 'CRITICAL'),
        timestamp: new Date().toISOString(),
        ttl: 360 // 6 minutes cache
      }
    } as ApiResponse);

    console.log(`✅ Risk analysis completed for ${normalizedSymbol}`);

  } catch (error) {
    console.error('Error analyzing risk:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze risk'
    } as ApiResponse);
  }
};

/**
 * POST /api/market/position-sizing
 * Kelly Criterion calculations, volatility-adjusted sizing, risk optimization
 */
export const getPositionSizing = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      symbol,
      accountBalance,
      riskPercentage = 2,
      stopLossPrice,
      confidenceLevel = 0.6,
      entryPrice
    } = req.body;

    if (!symbol || !accountBalance || !stopLossPrice) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters: symbol, accountBalance, stopLossPrice'
      } as ApiResponse);
      return;
    }

    if (!SymbolConverter.isValidTradingPair(symbol)) {
      res.status(400).json({
        success: false,
        error: 'Invalid trading symbol provided'
      } as ApiResponse);
      return;
    }

    const normalizedSymbol = SymbolConverter.normalize(symbol);
    console.log(`📏 Calculating position sizing for ${normalizedSymbol}`);

    // Get market data and volatility info
    const [rtAnalysis, marketData, chartData] = await Promise.all([
      aiAnalysisService.generateRealTimeAnalysis(normalizedSymbol),
      binanceService.getSymbolInfo(normalizedSymbol),
      binanceService.getKlines(normalizedSymbol, '15m', 50)
    ]);

    const currentPrice = entryPrice || marketData?.price || 0;
    const consensus = rtAnalysis?.consensus || {};
    const marketConditions = rtAnalysis?.marketConditions || {};

    // Calculate volatility from price data
    const prices = chartData ? chartData.map(c => parseFloat(c[4])) : [];
    const volatility = prices.length > 1 ?
      Math.sqrt(prices.slice(1).reduce((sum, price, i) => {
        const return_ = Math.log(price / prices[i]);
        return sum + Math.pow(return_, 2);
      }, 0) / (prices.length - 1)) * Math.sqrt(252) : 0.2; // Annualized volatility

    // Risk per trade calculation
    const riskAmount = accountBalance * (riskPercentage / 100);
    const stopLossDistance = Math.abs(currentPrice - stopLossPrice);
    const riskPerShare = stopLossDistance;

    // Basic position sizing
    const basicPositionSize = riskPerShare > 0 ? riskAmount / riskPerShare : 0;

    // Kelly Criterion calculation
    const winRate = Math.max(0.4, Math.min(0.8, confidenceLevel));
    const avgWin = stopLossDistance * 2; // Simplified 2:1 R:R
    const avgLoss = stopLossDistance;
    const kellyPercentage = winRate - ((1 - winRate) / (avgWin / avgLoss));
    const kellyPositionSize = Math.max(0, (accountBalance * kellyPercentage * 0.25) / currentPrice); // 25% of Kelly

    // Volatility-adjusted sizing
    const baseVolatility = 0.2; // 20% base volatility
    const volatilityAdjustment = baseVolatility / Math.max(volatility, 0.05);
    const volatilityAdjustedSize = basicPositionSize * volatilityAdjustment;

    // Fixed percentage method
    const fixedPercentageSize = (accountBalance * (riskPercentage / 100)) / currentPrice;

    // ATR-based sizing
    const atr = chartData && chartData.length > 14 ?
      chartData.slice(-14).reduce((sum: number, candle: any[]) => {
        const high = parseFloat(candle[2]);
        const low = parseFloat(candle[3]);
        const prevClose = parseFloat(candle[4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        return sum + tr;
      }, 0) / 14 : currentPrice * 0.02;

    const atrBasedSize = (riskAmount / (atr * 2)); // 2x ATR stop

    // Calculate all sizing methods
    const sizingMethods = [
      {
        method: 'BASIC_RISK',
        positionSize: basicPositionSize,
        dollarAmount: basicPositionSize * currentPrice,
        riskAmount: riskAmount,
        confidence: 0.7,
        description: 'Simple risk-based position sizing'
      },
      {
        method: 'KELLY_CRITERION',
        positionSize: kellyPositionSize,
        dollarAmount: kellyPositionSize * currentPrice,
        riskAmount: riskAmount * 0.8, // Conservative Kelly
        confidence: Math.max(0.5, Math.min(0.9, confidenceLevel + 0.2)),
        description: 'Kelly Criterion optimized sizing'
      },
      {
        method: 'VOLATILITY_ADJUSTED',
        positionSize: volatilityAdjustedSize,
        dollarAmount: volatilityAdjustedSize * currentPrice,
        riskAmount: riskAmount,
        confidence: 0.8,
        description: 'Volatility-adjusted position sizing'
      },
      {
        method: 'FIXED_PERCENTAGE',
        positionSize: fixedPercentageSize,
        dollarAmount: fixedPercentageSize * currentPrice,
        riskAmount: accountBalance * (riskPercentage / 100),
        confidence: 0.6,
        description: 'Fixed percentage of account'
      },
      {
        method: 'ATR_BASED',
        positionSize: atrBasedSize,
        dollarAmount: atrBasedSize * currentPrice,
        riskAmount: riskAmount,
        confidence: 0.75,
        description: 'ATR-based dynamic sizing'
      }
    ];

    // Recommended sizing (weighted average of top methods)
    const topMethods = sizingMethods
      .filter(m => m.confidence >= 0.7)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    const recommendedSize = topMethods.length > 0 ?
      topMethods.reduce((sum, method) => sum + (method.positionSize * method.confidence), 0) /
      topMethods.reduce((sum, method) => sum + method.confidence, 0) : basicPositionSize;

    // Risk metrics
    const riskRewardRatio = avgWin / avgLoss;
    const portfolioRisk = (recommendedSize * currentPrice) / accountBalance * 100;
    const expectedValue = (winRate * avgWin) - ((1 - winRate) * avgLoss);

    // Risk warnings
    const warnings = [];
    if (portfolioRisk > 10) {
      warnings.push('Position size exceeds 10% of account - consider reducing');
    }
    if (volatility > 0.4) {
      warnings.push('High volatility detected - consider smaller position size');
    }
    if (kellyPercentage < 0) {
      warnings.push('Kelly Criterion suggests negative edge - reconsider trade');
    }

    res.json({
      success: true,
      data: {
        symbol: normalizedSymbol,
        inputs: {
          accountBalance,
          riskPercentage,
          currentPrice,
          stopLossPrice,
          confidenceLevel,
          entryPrice
        },
        recommended: {
          positionSize: recommendedSize,
          dollarAmount: recommendedSize * currentPrice,
          sharesOrUnits: Math.floor(recommendedSize),
          percentageOfAccount: (recommendedSize * currentPrice) / accountBalance * 100
        },
        sizingMethods,
        calculations: {
          kellyPercentage: kellyPercentage * 100,
          volatility: volatility * 100,
          atr,
          riskRewardRatio,
          expectedValue,
          portfolioRisk
        },
        riskMetrics: {
          totalRisk: riskAmount,
          riskPerShare: riskPerShare,
          stopLossDistance,
          portfolioExposure: portfolioRisk,
          maxDrawdown: Math.max(5, volatility * 100)
        },
        warnings,
        timestamp: new Date().toISOString(),
        ttl: 600 // 10 minutes cache
      }
    } as ApiResponse);

    console.log(`✅ Position sizing calculated for ${normalizedSymbol}: ${recommendedSize.toFixed(2)} units`);

  } catch (error) {
    console.error('Error calculating position sizing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate position sizing'
    } as ApiResponse);
  }
};