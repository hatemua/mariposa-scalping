import express, { Response } from 'express';
import { authenticateApiKey, ApiKeyRequest, requireTier } from '../../../middleware/apiKeyAuth';
import { ApiResponse } from '../../../types';
import { marketReportService } from '../../../services/marketReportService';
import { scheduledReportService } from '../../../services/scheduledReportService';

const router = express.Router();

// All routes require API key authentication
router.use(authenticateApiKey);

/**
 * @route GET /api/v1/market-reports/daily
 * @desc Generate and download daily market report PDF
 * @access API Key (Starter+)
 */
router.get('/daily', requireTier('starter'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const dateParam = req.query.date as string;
    let date: Date;

    if (dateParam) {
      date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        } as ApiResponse);
        return;
      }
    } else {
      date = new Date();
      date.setDate(date.getDate() - 1);
      date.setHours(0, 0, 0, 0);
    }

    const pdfBuffer = await marketReportService.generateDailyMarketReport(date);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="market-report-${date.toISOString().split('T')[0]}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating market report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate market report'
    } as ApiResponse);
  }
});

/**
 * @route POST /api/v1/market-reports/send-telegram
 * @desc Send daily report to Telegram
 * @access API Key (Pro+)
 */
router.post('/send-telegram', requireTier('pro'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const dateParam = req.query.date as string;
    let date: Date;

    if (dateParam) {
      date = new Date(dateParam);
      if (isNaN(date.getTime())) {
        res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        } as ApiResponse);
        return;
      }
    } else {
      date = new Date();
      date.setDate(date.getDate() - 1);
      date.setHours(0, 0, 0, 0);
    }

    await scheduledReportService.sendDailyReportToTelegram(date);

    res.json({
      success: true,
      message: `Market report for ${date.toDateString()} sent to Telegram successfully`,
      meta: {
        date: date.toISOString().split('T')[0],
        tier: req.apiKey?.tier,
        timestamp: new Date()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error sending report to Telegram:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send report to Telegram'
    } as ApiResponse);
  }
});

export default router;
