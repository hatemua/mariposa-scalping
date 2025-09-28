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
import {
  getConfluenceScore,
  getEntrySignals,
  getProfessionalSignals,
  getWhaleActivity,
  getOpportunityScanner
} from '../controllers/tradingIntelligenceController';
import { authenticate } from '../middleware/auth';
import {
  marketDataRateLimiter,
  aiAnalysisRateLimiter,
  professionalSignalsRateLimiter,
  bulkAnalysisRateLimiter
} from '../middleware/rateLimiter';

const router = express.Router();

// CORS middleware for all market routes
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  next();
});

router.use(authenticate);

// Basic market data endpoints (moderate rate limiting)
router.get('/symbols', marketDataRateLimiter, getAvailableSymbols);
router.get('/balance', marketDataRateLimiter, getBalance);
router.get('/technical-indicators', marketDataRateLimiter, getTechnicalIndicators);
router.get('/stream', getRealtimeAnalysisStream); // No additional limiting for websocket stream

// AI Analysis endpoints (higher rate limiting for Professional Trading Suite)
router.get('/:symbol/multi-timeframe', aiAnalysisRateLimiter, getMultiTimeframeAnalysis);
router.get('/:symbol/real-time', aiAnalysisRateLimiter, getRealTimeAnalysis);
router.get('/:symbol/chart/:timeframe', marketDataRateLimiter, getChartData);

// Standard market data endpoints
router.get('/:symbol', marketDataRateLimiter, getMarketData);
router.get('/:symbol/analysis', aiAnalysisRateLimiter, getAnalysis);
router.get('/:symbol/deep-analysis', aiAnalysisRateLimiter, getDeepAnalysis);

// Analysis endpoints with appropriate rate limiting
router.post('/analysis', aiAnalysisRateLimiter, triggerAnalysis);
router.post('/analysis/batch', bulkAnalysisRateLimiter, triggerBatchAnalysis);
router.post('/analysis/multi-token', bulkAnalysisRateLimiter, getMultiTokenAnalysis);
router.post('/analysis/bulk', bulkAnalysisRateLimiter, getBulkTokenAnalysis);

// Trading intelligence endpoints (Professional Trading Suite)
router.get('/:symbol/confluence', aiAnalysisRateLimiter, getConfluenceScore);
router.get('/:symbol/entry-signals', aiAnalysisRateLimiter, getEntrySignals);
router.post('/professional-signals', professionalSignalsRateLimiter, getProfessionalSignals);
router.post('/whale-activity', professionalSignalsRateLimiter, getWhaleActivity);
router.post('/opportunity-scanner', professionalSignalsRateLimiter, getOpportunityScanner);

export default router;