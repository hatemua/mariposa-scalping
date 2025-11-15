/**
 * MT4 Routes
 *
 * API endpoints for MT4 broker integration
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  configureMT4Credentials,
  testMT4Connection,
  getMT4Account,
  getMT4Symbols,
  getMT4OpenPositions,
  createMT4Order,
  closeMT4Position,
  closeMT4AllPositions,
  getMT4Price,
  calculateMT4LotSize,
  getMT4Capabilities,
  getMT4RecommendedSymbols,
  deleteMT4Credentials
} from '../controllers/mt4Controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Configuration endpoints
router.post('/configure', configureMT4Credentials);
router.post('/test-connection', testMT4Connection);
router.delete('/credentials', deleteMT4Credentials);

// Account information
router.get('/account', getMT4Account);
router.get('/capabilities', getMT4Capabilities);

// Symbol information
router.get('/symbols', getMT4Symbols);
router.get('/symbols/recommended', getMT4RecommendedSymbols);
router.get('/price/:symbol', getMT4Price);
router.post('/calculate-lot-size', calculateMT4LotSize);

// Trading operations
router.get('/positions', getMT4OpenPositions);
router.post('/orders', createMT4Order);
router.post('/orders/close', closeMT4Position);
router.post('/orders/close-all', closeMT4AllPositions);

export default router;
