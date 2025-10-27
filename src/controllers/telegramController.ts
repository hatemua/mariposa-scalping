import { Response } from 'express';
import { telegramService } from '../services/telegramService';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';

/**
 * Test Telegram bot connection
 */
export const testConnection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await telegramService.testConnection();

    res.status(result.success ? 200 : 400).json({
      success: result.success,
      message: result.message
    } as ApiResponse);
  } catch (error) {
    console.error('Error testing Telegram connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test Telegram connection'
    } as ApiResponse);
  }
};

/**
 * Get Telegram bot status
 */
export const getStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = telegramService.getStatus();

    res.status(200).json({
      success: true,
      data: status
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting Telegram status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Telegram status'
    } as ApiResponse);
  }
};

/**
 * Send a test signal to Telegram
 */
export const sendTestSignal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const testSignal = {
      id: `test_${Date.now()}`,
      symbol: 'BTC/USDT',
      recommendation: 'BUY' as 'BUY',
      confidence: 0.85,
      targetPrice: 45000,
      stopLoss: 43500,
      reasoning: 'This is a test signal to verify Telegram integration',
      category: 'TEST',
      priority: 95,
      timestamp: new Date()
    };

    const testStats = {
      totalAgents: 5,
      validatedAgents: 4,
      rejectedAgents: 1
    };

    await telegramService.sendSignalNotification(testSignal, testStats);

    res.status(200).json({
      success: true,
      message: 'Test signal queued for Telegram notification'
    } as ApiResponse);
  } catch (error) {
    console.error('Error sending test signal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test signal'
    } as ApiResponse);
  }
};
