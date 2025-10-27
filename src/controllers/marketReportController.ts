import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { marketReportService } from '../services/marketReportService';

/**
 * Generate daily market report PDF
 */
export const generateDailyReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Parse date from query params (default to today)
    const dateParam = req.query.date as string;
    const date = dateParam ? new Date(dateParam) : new Date();

    // Validate date
    if (isNaN(date.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      } as ApiResponse);
      return;
    }

    console.log(`📊 Generating daily market report for ${date.toDateString()}...`);

    // Generate PDF
    const pdfBuffer = await marketReportService.generateDailyMarketReport(date);

    // Set response headers for PDF download
    const filename = `market-report-${date.toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);

    console.log(`✅ Daily market report generated successfully: ${filename}`);
  } catch (error) {
    console.error('Error generating daily report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate daily report'
    } as ApiResponse);
  }
};

/**
 * Preview report data without generating PDF (for debugging)
 */
export const previewReportData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dateParam = req.query.date as string;
    const date = dateParam ? new Date(dateParam) : new Date();

    if (isNaN(date.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      } as ApiResponse);
      return;
    }

    // Import the aggregator service
    const { marketDataAggregatorService } = await import('../services/marketDataAggregatorService');

    // Gather data
    const [snapshot, opportunities, whaleActivities, statistics, benchmarks] = await Promise.all([
      marketDataAggregatorService.getDailyMarketSnapshot(date),
      marketDataAggregatorService.getTopOpportunities(date, 10),
      marketDataAggregatorService.getWhaleActivities(date, 5),
      marketDataAggregatorService.getMarketStatistics(date),
      marketDataAggregatorService.getMarketBenchmarks(date)
    ]);

    res.json({
      success: true,
      data: {
        date: date.toISOString(),
        snapshot,
        opportunities: opportunities.length,
        whaleActivities: whaleActivities.length,
        statistics: {
          categoriesCount: statistics.opportunitiesByCategory.size,
          topSymbols: statistics.topSymbolsByOpportunities.slice(0, 5),
          confidenceDistribution: statistics.confidenceDistribution
        },
        benchmarks
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error previewing report data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preview report data'
    } as ApiResponse);
  }
};

/**
 * Get available report dates (dates with data)
 */
export const getAvailableDates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { Opportunity } = await import('../models');

    // Get distinct dates from opportunities collection
    const opportunities = await Opportunity.aggregate([
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$detectedAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: -1 }
      },
      {
        $limit: 30
      }
    ]);

    const dates = opportunities.map(o => ({
      date: o._id,
      opportunitiesCount: o.count
    }));

    res.json({
      success: true,
      data: dates
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting available dates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get available dates'
    } as ApiResponse);
  }
};

/**
 * Send daily report to Telegram (manual trigger for testing)
 */
export const sendReportToTelegram = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Parse date from query params (default to yesterday)
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
      // Default to yesterday
      date = new Date();
      date.setDate(date.getDate() - 1);
      date.setHours(0, 0, 0, 0);
    }

    console.log(`📊 Manually triggering market report for Telegram: ${date.toDateString()}...`);

    // Import and call the scheduled report service
    const { scheduledReportService } = await import('../services/scheduledReportService');
    await scheduledReportService.sendDailyReportToTelegram(date);

    res.json({
      success: true,
      message: `Market report for ${date.toDateString()} sent to Telegram successfully`
    } as ApiResponse);

    console.log(`✅ Market report sent to Telegram: ${date.toDateString()}`);
  } catch (error) {
    console.error('Error sending report to Telegram:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send report to Telegram'
    } as ApiResponse);
  }
};
