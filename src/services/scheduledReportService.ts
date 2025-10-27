import { marketReportService } from './marketReportService';
import { marketDataAggregatorService } from './marketDataAggregatorService';
import { telegramService } from './telegramService';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

export class ScheduledReportService {
  /**
   * Send daily market report to Telegram
   * This is the main method called by the scheduled job
   */
  async sendDailyReportToTelegram(date?: Date): Promise<void> {
    try {
      // Default to yesterday (reports are for previous day's data)
      const reportDate = date || this.getYesterday();

      console.log(`📊 Starting automated market report generation for ${reportDate.toDateString()}...`);

      // Generate PDF report
      console.log('📄 Generating PDF report...');
      const pdfBuffer = await marketReportService.generateDailyMarketReport(reportDate);

      // Get data for summary message
      console.log('📈 Gathering market data for summary...');
      const [snapshot, topOpportunities] = await Promise.all([
        marketDataAggregatorService.getDailyMarketSnapshot(reportDate),
        marketDataAggregatorService.getTopOpportunities(reportDate, 3)
      ]);

      // Save PDF temporarily
      const tempDir = path.join(process.cwd(), 'temp');
      await this.ensureDirectoryExists(tempDir);

      const filename = `market-report-${reportDate.toISOString().split('T')[0]}.pdf`;
      const tempPath = path.join(tempDir, filename);

      console.log(`💾 Saving PDF temporarily to ${tempPath}...`);
      await writeFile(tempPath, pdfBuffer);

      // Send summary message first
      console.log('📱 Sending summary message to Telegram...');
      await telegramService.sendMarketReportSummary(reportDate, snapshot, topOpportunities);

      // Send PDF document
      console.log('📎 Sending PDF document to Telegram...');
      await telegramService.sendDocument(tempPath, filename);

      // Clean up temporary file
      console.log('🧹 Cleaning up temporary file...');
      await unlink(tempPath);

      console.log('✅ Daily market report sent successfully to Telegram!');
    } catch (error) {
      console.error('❌ Error sending daily market report to Telegram:', error);
      console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');

      throw error;
    }
  }

  /**
   * Get yesterday's date (reports are typically for previous day)
   */
  private getYesterday(): Date {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  }

  /**
   * Ensure directory exists, create if not
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Test method to send report for specific date (useful for debugging)
   */
  async testSendReport(dateString: string): Promise<void> {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    await this.sendDailyReportToTelegram(date);
  }
}

export const scheduledReportService = new ScheduledReportService();
