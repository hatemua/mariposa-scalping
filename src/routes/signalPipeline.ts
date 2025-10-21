import express from 'express';
import {
  getSignalPipelineHealth,
  getSignalLogs,
  getBroadcastedSignals,
  clearExecutionQueue
} from '../controllers/signalPipelineController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

/**
 * Signal Pipeline Health Monitoring Routes
 * Provides visibility into the entire signal detection and execution flow
 */

// Get overall pipeline health
router.get('/health', authenticate, getSignalPipelineHealth);

// Get detailed signal logs
router.get('/logs', authenticate, getSignalLogs);

// Get broadcasted signals
router.get('/broadcasts', authenticate, getBroadcastedSignals);

// Clear execution queue (maintenance endpoint)
router.post('/queue/clear', authenticate, clearExecutionQueue);

export default router;
