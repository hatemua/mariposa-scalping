import express from 'express';
import opportunitiesRoutes from './opportunities';
import whaleActivitiesRoutes from './whaleActivities';
import marketReportsRoutes from './marketReports';

const router = express.Router();

// Mount v1 API routes
router.use('/opportunities', opportunitiesRoutes);
router.use('/whale-activities', whaleActivitiesRoutes);
router.use('/market-reports', marketReportsRoutes);

// API health check (no authentication required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Mariposa Public API v1',
    version: '1.0.0',
    timestamp: new Date(),
    docs: 'https://docs.mariposa.com/api/v1'
  });
});

export default router;
