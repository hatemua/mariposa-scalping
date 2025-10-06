import express from 'express';
import { signalLogsController } from '../controllers/signalLogsController';

const router = express.Router();

// Get all broadcasted signals
router.get('/broadcasts', (req, res) => signalLogsController.getAllSignals(req, res));

// Get specific signal details with all agent logs
router.get('/broadcast/:signalId', (req, res) => signalLogsController.getSignalDetails(req, res));

// Get agent signal history
router.get('/agent/:agentId/signals', (req, res) => signalLogsController.getAgentHistory(req, res));

// Get agent exclusion statistics
router.get('/agent/:agentId/exclusions', (req, res) => signalLogsController.getAgentExclusions(req, res));

// Get overall statistics
router.get('/statistics', (req, res) => signalLogsController.getOverallStatistics(req, res));

export default router;
