import express from 'express';
import {
  getMarketData,
  getAnalysis,
  triggerAnalysis,
  getBalance,
  getAvailableSymbols
} from '../controllers/marketController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

router.get('/symbols', getAvailableSymbols);
router.get('/balance', getBalance);
router.get('/:symbol', getMarketData);
router.get('/:symbol/analysis', getAnalysis);
router.post('/analysis', triggerAnalysis);

export default router;