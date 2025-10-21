import express from 'express';
import authRoutes from './auth';
import agentRoutes from './agents';
import marketRoutes from './market';
import orderBookRoutes from './orderbook';
import dashboardRoutes from './dashboard';
import signalLogsRoutes from './signalLogs';
import signalPipelineRoutes from './signalPipeline';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/market', marketRoutes);
router.use('/orderbook', orderBookRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/signal-logs', signalLogsRoutes);
router.use('/signal-pipeline', signalPipelineRoutes);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Mariposa Scalping Bot API is running',
    timestamp: new Date(),
    version: '1.0.0'
  });
});

export default router;