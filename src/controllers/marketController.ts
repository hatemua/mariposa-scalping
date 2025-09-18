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

export const getAvailableSymbols = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get symbols from both exchanges for comprehensive list
    const [okxSymbols, binanceInfo] = await Promise.all([
      okxService.getSymbols(),
      binanceService.getExchangeInfo()
    ]);

    // Get Binance USDT pairs and normalize them
    const binanceUsdtPairs = binanceInfo.symbols
      .filter((symbol: any) =>
        symbol.symbol.endsWith('USDT') &&
        symbol.status === 'TRADING' &&
        !symbol.symbol.includes('DOWN') &&
        !symbol.symbol.includes('UP')
      )
      .map((symbol: any) => SymbolConverter.normalize(symbol.symbol))
      .slice(0, 100)
      .sort();

    // Get OKX USDT pairs and normalize them
    const okxUsdtPairs = okxSymbols
      .filter((symbol: string) => symbol.includes('-USDT'))
      .map((symbol: string) => SymbolConverter.normalize(symbol))
      .slice(0, 100)
      .sort();

    // Combine and deduplicate
    const allSymbols = Array.from(new Set([...binanceUsdtPairs, ...okxUsdtPairs])).sort();

    res.json({
      success: true,
      data: {
        all: allSymbols,
        binance: binanceUsdtPairs,
        okx: okxUsdtPairs
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch symbols'
    } as ApiResponse);
  }
};