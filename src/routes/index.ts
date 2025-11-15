import express from 'express';
import authRoutes from './auth';
import agentRoutes from './agents';
import marketRoutes from './market';
import orderBookRoutes from './orderbook';
import dashboardRoutes from './dashboard';
import signalLogsRoutes from './signalLogs';
import signalPipelineRoutes from './signalPipeline';
import telegramRoutes from './telegram';
import marketReportsRoutes from './marketReports';
import apiKeysRoutes from './apiKeys';
import mt4Routes from './mt4Routes';
import publicV1Routes from './public/v1';

const router = express.Router();

// Internal API routes (require JWT authentication)
router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/market', marketRoutes);
router.use('/orderbook', orderBookRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/signal-logs', signalLogsRoutes);
router.use('/signal-pipeline', signalPipelineRoutes);
router.use('/telegram', telegramRoutes);
router.use('/market-reports', marketReportsRoutes);
router.use('/api-keys', apiKeysRoutes);
router.use('/mt4', mt4Routes);

// Public API routes (require API key authentication)
router.use('/v1', publicV1Routes);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Mariposa Scalping Bot API is running',
    timestamp: new Date(),
    version: '1.0.0'
  });
});

export default router;