import express from 'express';
import { orderBookController } from '../controllers/orderBookController';

const router = express.Router();

/**
 * @route GET /api/orderbook/analyze
 * @desc Get real-time order book analysis for a symbol
 * @query symbol - Trading symbol (e.g., BTCUSDT)
 * @query levels - Number of order book levels to analyze (default: 20)
 */
router.get('/analyze', orderBookController.getOrderBookAnalysis.bind(orderBookController));

/**
 * @route POST /api/orderbook/subscribe
 * @desc Subscribe to real-time order book updates for a symbol
 * @body symbol - Trading symbol (e.g., BTCUSDT)
 * @body levels - Number of order book levels to subscribe to (default: 20)
 */
router.post('/subscribe', orderBookController.subscribeToOrderBook.bind(orderBookController));

/**
 * @route GET /api/orderbook/raw
 * @desc Get raw order book data without analysis
 * @query symbol - Trading symbol (e.g., BTCUSDT)
 * @query limit - Maximum number of bids/asks to return (default: 100)
 */
router.get('/raw', orderBookController.getOrderBook.bind(orderBookController));

export default router;