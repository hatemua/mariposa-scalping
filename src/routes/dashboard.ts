import express from 'express';
import {
  getDashboardSummary,
  getAgentMetrics,
  getFilteredTrades,
  getPnLChart,
  getStrategyPerformance,
  compareAgents,
  getTradeDistribution,
  getFilterOptions,
  exportTrades,
  exportAgentSummary,
  getLLMPerformance,
  getValidatedSignals,
  invalidateCache,
} from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Dashboard summary
router.get('/summary', getDashboardSummary);

// Agent metrics
router.get('/agents', getAgentMetrics);

// Trades
router.get('/trades', getFilteredTrades);
router.get('/trades/distribution', getTradeDistribution);

// Charts
router.get('/chart/pnl', getPnLChart);
router.get('/chart/strategy', getStrategyPerformance);

// Comparison
router.get('/compare', compareAgents);

// Filters
router.get('/filters', getFilterOptions);

// Export
router.get('/export/trades', exportTrades);
router.get('/export/agents', exportAgentSummary);

// LLM Performance
router.get('/llm-performance', getLLMPerformance);

// Validated signals
router.get('/signals', getValidatedSignals);

// Cache management
router.post('/cache/invalidate', invalidateCache);

export default router;
