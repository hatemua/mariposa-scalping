import express from 'express';
import {
  createAgent,
  getUserAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  startAgent,
  stopAgent,
  pauseAgent,
  getAgentTrades,
  getAgentSignalHistory,
  updateAgentPreferences,
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
router.post('/:agentId/pause', pauseAgent);
router.get('/:agentId/trades', getAgentTrades);
router.get('/:agentId/signals', getAgentSignalHistory);
router.put('/:agentId/preferences', updateAgentPreferences);

export default router;