import { Request, Response } from 'express';
import { orderBookAnalysisService } from '../services/orderBookAnalysisService';
import { safeString, safeNumber } from '../utils/formatters';

export class OrderBookController {
  /**
   * Get real-time order book analysis for a symbol
   */
  async getOrderBookAnalysis(req: Request, res: Response) {
    try {
      const symbol = safeString.getValue(req.query.symbol as string, '');
      const levels = safeNumber.getValue(req.query.levels as string, 20);

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter is required'
        });
      }

      console.log(`📊 Getting order book analysis for ${symbol} with ${levels} levels`);

      const analysis = await orderBookAnalysisService.getOrderBookAnalysis(symbol, levels);

      res.json({
        success: true,
        data: analysis,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('❌ Error in order book analysis:', error);

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to analyze order book',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Subscribe to real-time order book updates for a symbol
   */
  async subscribeToOrderBook(req: Request, res: Response) {
    try {
      const symbol = safeString.getValue(req.body.symbol as string, '');
      const levels = safeNumber.getValue(req.body.levels as string, 20);

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter is required'
        });
      }

      console.log(`🔄 Subscribing to order book updates for ${symbol}`);

      await orderBookAnalysisService.subscribeToSymbol(symbol, levels);

      res.json({
        success: true,
        message: `Subscribed to order book updates for ${symbol}`,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('❌ Error subscribing to order book:', error);

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to subscribe to order book',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get current order book state without analysis
   */
  async getOrderBook(req: Request, res: Response) {
    try {
      const symbol = safeString.getValue(req.query.symbol as string, '');
      const limit = safeNumber.getValue(req.query.limit as string, 100);

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Symbol parameter is required'
        });
      }

      // This would call binanceService.getOrderBook directly
      const { binanceService } = await import('../services/binanceService');
      const orderBook = await binanceService.getOrderBook(symbol, limit);

      res.json({
        success: true,
        data: orderBook,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('❌ Error fetching order book:', error);

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch order book',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export const orderBookController = new OrderBookController();