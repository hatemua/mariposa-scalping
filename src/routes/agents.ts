import express from 'express';
import {
  createAgent,
  getUserAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  startAgent,
  stopAgent,
  getAgentTrades
} from '../controllers/agentController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

router.post('/', createAgent);
router.get('/', getUserAgents);
router.get('/:agentId', getAgent);
router.put('/:agentId', updateAgent);
router.delete('/:agentId', deleteAgent);
router.post('/:agentId/start', startAgent);
router.post('/:agentId/stop', stopAgent);
router.get('/:agentId/trades', getAgentTrades);

export default router;