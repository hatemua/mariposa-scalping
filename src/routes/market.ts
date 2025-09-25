import express from 'express';
import {
  getMarketData,
  getAnalysis,
  triggerAnalysis,
  getBalance,
  getAvailableSymbols,
  getDeepAnalysis,
  triggerBatchAnalysis,
  getMultiTokenAnalysis,
  getRealtimeAnalysisStream,
  getTechnicalIndicators,
  getMultiTimeframeAnalysis,
  getRealTimeAnalysis,
  getChartData,
  getBulkTokenAnalysis
} from '../controllers/marketController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// CORS middleware for all market routes
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  next();
});

router.use(authenticate);

router.get('/symbols', getAvailableSymbols);
router.get('/balance', getBalance);
router.get('/technical-indicators', getTechnicalIndicators);
router.get('/stream', getRealtimeAnalysisStream);

// New enhanced endpoints
router.get('/:symbol/multi-timeframe', getMultiTimeframeAnalysis);
router.get('/:symbol/real-time', getRealTimeAnalysis);
router.get('/:symbol/chart/:timeframe', getChartData);

// Existing endpoints
router.get('/:symbol', getMarketData);
router.get('/:symbol/analysis', getAnalysis);
router.get('/:symbol/deep-analysis', getDeepAnalysis);

// Analysis endpoints
router.post('/analysis', triggerAnalysis);
router.post('/analysis/batch', triggerBatchAnalysis);
router.post('/analysis/multi-token', getMultiTokenAnalysis);
router.post('/analysis/bulk', getBulkTokenAnalysis);

export default router;