import express from 'express';
import {
  generateDailyReport,
  previewReportData,
  getAvailableDates,
  sendReportToTelegram
} from '../controllers/marketReportController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/market-reports/daily
 * @desc Generate and download daily market report PDF
 * @query date (optional) - Date in YYYY-MM-DD format (defaults to today)
 * @returns PDF file download
 */
router.get('/daily', generateDailyReport);

/**
 * @route GET /api/market-reports/preview
 * @desc Preview report data without generating PDF (for debugging)
 * @query date (optional) - Date in YYYY-MM-DD format (defaults to today)
 * @returns JSON with report data summary
 */
router.get('/preview', previewReportData);

/**
 * @route GET /api/market-reports/available-dates
 * @desc Get list of dates with available market data
 * @returns JSON array of dates with opportunity counts
 */
router.get('/available-dates', getAvailableDates);

/**
 * @route POST /api/market-reports/send-telegram
 * @desc Manually trigger sending daily report to Telegram (for testing)
 * @query date (optional) - Date in YYYY-MM-DD format (defaults to yesterday)
 * @returns JSON success message
 */
router.post('/send-telegram', sendReportToTelegram);

export default router;
