import express from 'express';
import authRoutes from './auth';
import agentRoutes from './agents';
import marketRoutes from './market';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/agents', agentRoutes);
router.use('/market', marketRoutes);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Mariposa Scalping Bot API is running',
    timestamp: new Date(),
    version: '1.0.0'
  });
});

export default router;