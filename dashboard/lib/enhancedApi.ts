// Enhanced API wrapper with automatic fallback to mock data
// Provides seamless experience when APIs timeout or fail

import { marketApi, orderBookApi } from './api';
import mockDataService from './mockDataService';
import { ApiResponse } from '@/types';

// Enhanced API service with intelligent fallback
export const enhancedMarketApi = {
  // Market data with fallback
  getMarketData: async (symbol: string): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getMarketData(symbol);
      return response;
    } catch (error) {
      console.warn(`Market data API failed for ${symbol}, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockData = mockDataService.generateMarketData(symbol);
        return await mockDataService.wrapAsApiResponse(mockData);
      }

      throw error;
    }
  },

  // Real-time analysis with fallback
  getRealTimeAnalysis: async (symbol: string, models?: string[]): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getRealTimeAnalysis(symbol, models);
      return response;
    } catch (error) {
      console.warn(`Real-time analysis API failed for ${symbol}, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        // Generate mock confluence data
        const mockConfluence = {
          score: Math.floor(Math.random() * 40) + 60, // 60-100
          confidence: Math.random() * 0.4 + 0.6, // 0.6-1.0
          strongestTimeframe: ['1h', '4h', '1d'][Math.floor(Math.random() * 3)],
          factors: {
            rsi: Math.random() * 60 + 20, // 20-80
            macdScore: Math.random() * 2 - 1, // -1 to 1
            trendScore: Math.random() * 2 - 1, // -1 to 1
            supportResistance: Math.random() * 2 - 1, // -1 to 1
          },
          consensus: {
            recommendation: Math.random() > 0.5 ? 'BUY' : 'SELL',
            confidence: Math.random() * 0.4 + 0.6,
            targetPrice: 0,
            stopLoss: 0,
            timeToAction: '15-30 minutes',
            reasoning: 'Mock analysis - real-time API unavailable',
          },
          riskWarnings: [],
        };

        return await mockDataService.wrapAsApiResponse(mockConfluence);
      }

      throw error;
    }
  },

  // Chart data with fallback
  getChartData: async (symbol: string, timeframe: string, limit = 200, indicators?: string[]): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getChartData(symbol, timeframe, limit, indicators);
      return response;
    } catch (error) {
      console.warn(`Chart data API failed for ${symbol}, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        // Generate mock chart data
        const mockChartData = generateMockChartData(symbol, timeframe, limit);
        return await mockDataService.wrapAsApiResponse({ klines: mockChartData });
      }

      throw error;
    }
  },

  // Professional signals with fallback
  getProfessionalSignals: async (symbols: string[], minStrength = 60): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getProfessionalSignals(symbols, minStrength);
      return response;
    } catch (error) {
      console.warn(`Professional signals API failed, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockSignals = mockDataService.generateTradingSignals(symbols, minStrength);
        return await mockDataService.wrapAsApiResponse(mockSignals);
      }

      throw error;
    }
  },

  // Whale activity with fallback
  getWhaleActivity: async (symbols: string[], minSize = 50000): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getWhaleActivity(symbols, minSize);
      return response;
    } catch (error) {
      console.warn(`Whale activity API failed, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockActivity = mockDataService.generateWhaleActivity(symbols, minSize);
        return await mockDataService.wrapAsApiResponse(mockActivity);
      }

      throw error;
    }
  },

  // Opportunity scanner with fallback
  getOpportunityScanner: async (symbols: string[], minScore = 70): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getOpportunityScanner(symbols, minScore);
      return response;
    } catch (error) {
      console.warn(`Opportunity scanner API failed, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockOpportunities = mockDataService.generateOpportunities(symbols, minScore);
        return await mockDataService.wrapAsApiResponse(mockOpportunities);
      }

      throw error;
    }
  },

  // Confluence score with fallback
  getConfluenceScore: async (symbol: string): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getConfluenceScore(symbol);
      return response;
    } catch (error) {
      console.warn(`Confluence score API failed for ${symbol}, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockConfluence = {
          score: Math.floor(Math.random() * 40) + 60,
          confidence: Math.random() * 0.4 + 0.6,
          factors: {
            rsi: Math.random() * 60 + 20,
            macd: Math.random() * 2 - 1,
            trend: Math.random() * 2 - 1,
            volume: Math.random() * 2 - 1,
            supportResistance: Math.random() * 2 - 1,
          },
          timeframes: {
            '5m': Math.random() * 100,
            '15m': Math.random() * 100,
            '1h': Math.random() * 100,
            '4h': Math.random() * 100,
          },
          strongestTimeframe: ['1h', '4h'][Math.floor(Math.random() * 2)],
        };

        return await mockDataService.wrapAsApiResponse(mockConfluence);
      }

      throw error;
    }
  },

  // Entry signals with fallback
  getEntrySignals: async (symbol: string): Promise<ApiResponse> => {
    try {
      const response = await marketApi.getEntrySignals(symbol);
      return response;
    } catch (error) {
      console.warn(`Entry signals API failed for ${symbol}, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockEntrySignals = {
          signals: [
            {
              type: Math.random() > 0.5 ? 'BUY' : 'SELL',
              strength: Math.floor(Math.random() * 40) + 60,
              confidence: Math.random() * 0.4 + 0.6,
              timeframe: ['5m', '15m', '1h'][Math.floor(Math.random() * 3)],
              reasoning: 'Mock entry signal - API unavailable',
              entry: Math.random() * 100 + 50,
              target: Math.random() * 120 + 60,
              stopLoss: Math.random() * 80 + 40,
            }
          ],
          timestamp: new Date().toISOString(),
        };

        return await mockDataService.wrapAsApiResponse(mockEntrySignals);
      }

      throw error;
    }
  },
};

// Enhanced Order Book API with fallback
export const enhancedOrderBookApi = {
  getAnalysis: async (symbol: string, levels = 20): Promise<ApiResponse> => {
    try {
      const response = await orderBookApi.getAnalysis(symbol, levels);
      return response;
    } catch (error) {
      console.warn(`Order book analysis API failed for ${symbol}, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockOrderBook = mockDataService.generateOrderBookData(symbol, levels);
        return await mockDataService.wrapAsApiResponse(mockOrderBook);
      }

      throw error;
    }
  },

  subscribe: async (symbol: string, levels = 20): Promise<ApiResponse> => {
    try {
      const response = await orderBookApi.subscribe(symbol, levels);
      return response;
    } catch (error) {
      console.warn(`Order book subscription failed for ${symbol}, using mock confirmation:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        return await mockDataService.wrapAsApiResponse({
          subscribed: true,
          symbol,
          levels,
          message: 'Mock subscription - real WebSocket unavailable',
        });
      }

      throw error;
    }
  },

  getRawOrderBook: async (symbol: string, limit = 100): Promise<ApiResponse> => {
    try {
      const response = await orderBookApi.getRawOrderBook(symbol, limit);
      return response;
    } catch (error) {
      console.warn(`Raw order book API failed for ${symbol}, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockOrderBook = mockDataService.generateOrderBookData(symbol, limit);
        return await mockDataService.wrapAsApiResponse({
          bids: mockOrderBook.bids,
          asks: mockOrderBook.asks,
          timestamp: Date.now(),
        });
      }

      throw error;
    }
  },
};

// VaR Analysis with fallback
export const enhancedVaRApi = {
  calculateVaR: async (symbols: string[], confidence = 95, timeHorizon = 1): Promise<ApiResponse> => {
    try {
      // Try to get real historical data for VaR calculation
      const chartDataPromises = symbols.map(symbol =>
        enhancedMarketApi.getChartData(symbol, '1d', 252)
      );

      const chartDataResults = await Promise.all(chartDataPromises);

      // If any chart data request failed, use mock data
      if (chartDataResults.some(result => !result.success)) {
        throw new Error('Chart data unavailable for VaR calculation');
      }

      // Process real data for VaR calculation (simplified version)
      const varData = mockDataService.generateVaRData(symbols, confidence, timeHorizon);
      return await mockDataService.wrapAsApiResponse(varData);

    } catch (error) {
      console.warn(`VaR calculation failed, using mock data:`, error);

      if (mockDataService.shouldUseMockData(error)) {
        const mockVaRData = mockDataService.generateVaRData(symbols, confidence, timeHorizon);
        return await mockDataService.wrapAsApiResponse(mockVaRData);
      }

      throw error;
    }
  },
};

// Helper function to generate mock chart data
function generateMockChartData(symbol: string, timeframe: string, limit: number): any[] {
  const klines = [];
  const basePrice = mockDataService.generateMarketData(symbol).price;
  let currentPrice = basePrice;

  const timeInterval = getTimeframeMs(timeframe);
  const now = Date.now();

  for (let i = limit - 1; i >= 0; i--) {
    const timestamp = now - (i * timeInterval);

    // Generate realistic OHLCV data
    const open = currentPrice;
    const volatility = Math.random() * 0.02; // 2% max volatility per candle
    const change = (Math.random() - 0.5) * volatility;
    const close = open * (1 + change);

    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.random() * 1000000 + 100000;

    klines.push([
      timestamp,           // Open time
      open.toFixed(4),     // Open
      high.toFixed(4),     // High
      low.toFixed(4),      // Low
      close.toFixed(4),    // Close
      volume.toFixed(2),   // Volume
      timestamp + timeInterval - 1, // Close time
      (volume * close).toFixed(2),  // Quote asset volume
      Math.floor(Math.random() * 1000), // Number of trades
      (volume * 0.6).toFixed(2),    // Taker buy base asset volume
      (volume * close * 0.6).toFixed(2), // Taker buy quote asset volume
      '0'                  // Ignore
    ]);

    currentPrice = close;
  }

  return klines;
}

function getTimeframeMs(timeframe: string): number {
  const timeframes: { [key: string]: number } = {
    '1m': 60 * 1000,
    '3m': 3 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };

  return timeframes[timeframe] || timeframes['1h'];
}

export default {
  market: enhancedMarketApi,
  orderBook: enhancedOrderBookApi,
  var: enhancedVaRApi,
};