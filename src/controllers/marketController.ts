import { Response } from 'express';
import { binanceService } from '../services/binanceService';
import { aiAnalysisService } from '../services/aiAnalysisService';
import { okxService } from '../services/okxService';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { SymbolConverter } from '../utils/symbolConverter';

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

    // Generate deep analysis with multi-timeframe data
    const deepAnalysis = await aiAnalysisService.generateDeepAnalysis(
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

          // Generate deep analysis for this timeframe
          const timeframeAnalysis = await aiAnalysisService.generateTimeframeSpecificAnalysis(
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

    console.log(`🧠 Generating AI analysis for ${normalizedSymbol}...`);
    let realTimeAnalysis;
    try {
      realTimeAnalysis = await aiAnalysisService.generateRealTimeAnalysis(
        marketData,
        {
          '1m': klineData1m,
          '5m': klineData5m
        },
        orderBook
      );
      console.log(`✅ AI analysis completed in ${Date.now() - startTime}ms`);
    } catch (analysisError) {
      console.error(`❌ AI analysis failed for ${normalizedSymbol}:`, analysisError);

      // Provide fallback analysis
      realTimeAnalysis = {
        symbol: normalizedSymbol,
        consensus: {
          recommendation: 'HOLD',
          confidence: 0.3,
          urgency: 1,
          modelAgreement: 0,
          timeToAction: 'MEDIUM TERM (1-4 hours)',
          reasoning: 'AI analysis temporarily unavailable - using fallback recommendation'
        },
        individualModels: [],
        marketConditions: {
          volatility: ((marketData.high24h - marketData.low24h) / marketData.price) * 100,
          spread: 0,
          liquidity: 0,
          volume24h: marketData.volume,
          priceAction: marketData.change24h > 0 ? 'BULLISH' : 'BEARISH',
          tradingCondition: 'UNKNOWN'
        },
        immediateSignals: [],
        riskWarnings: ['AI analysis service temporarily unavailable'],
        timestamp: new Date()
      };
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

    const responseData = {
      symbol: normalizedSymbol,
      marketData,
      realTimeAnalysis,
      tradingSignals,
      priceAlerts: [],
      momentum: {},
      liquidity: {},
      timestamp: new Date(),
      processingTime: Date.now() - startTime
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

    // Process symbols in parallel with rate limiting
    const bulkAnalysis = await Promise.all(
      validSymbols.map(async (symbol: string) => {
        try {
          // Get basic market data
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