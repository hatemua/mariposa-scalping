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
      id: `startup_test_${Date.now()}`,
      symbol: 'BTC/USDT',
      recommendation: 'BUY' as 'BUY',
      confidence: 0.85,
      entryPrice: 44200,
      targetPrice: 45000,
      stopLoss: 43500,
      reasoning: '🧪 This is a startup test signal to verify Telegram integration is working correctly. Real signals will appear here when detected by the system.',
      category: 'STARTUP_TEST',
      priority: 100, // Ensure it passes the ≥70 filter
      timestamp: new Date()
    };

    const testStats = {
      totalAgents: 5,
      validatedAgents: 4, // >2 to pass filter
      rejectedAgents: 1
    };

    await telegramService.sendSignalNotification(testSignal, testStats);

    res.status(200).json({
      success: true,
      message: 'Test signal sent to Telegram! Check your group for the message.'
    } as ApiResponse);
  } catch (error) {
    console.error('Error sending test signal:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test signal'
    } as ApiResponse);
  }
};

/**
 * Get diagnostic information about Telegram and signal generation
 */
export const getDiagnostics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ScalpingAgent = require('../models').ScalpingAgent;
    const agents = await ScalpingAgent.find({});
    const activeAgents = agents.filter((a: any) => a.isActive);

    const status = telegramService.getStatus();

    const diagnostics = {
      telegram: {
        enabled: status.enabled,
        connected: status.connected,
        chatId: status.chatId,
        queueSize: status.queueSize
      },
      agents: {
        total: agents.length,
        active: activeAgents.length,
        inactive: agents.length - activeAgents.length,
        list: activeAgents.map((a: any) => ({
          id: a._id,
          name: a.name,
          category: a.category,
          riskLevel: a.riskLevel,
          budget: a.budget
        }))
      },
      signalFilters: {
        minimumPriority: 70,
        minimumValidatedAgents: 2,
        note: 'Signals must meet ONE of these criteria to trigger Telegram notification'
      },
      troubleshooting: {
        issues: [
          activeAgents.length === 0 ? '⚠️ No active agents - signals cannot be validated' : '✅ Active agents found',
          !status.enabled ? '⚠️ Telegram disabled - check TELEGRAM_ENABLED=true' : '✅ Telegram enabled',
          !status.connected ? '⚠️ Telegram not connected - check BOT_TOKEN and CHAT_ID' : '✅ Telegram connected',
          status.queueSize > 10 ? `⚠️ Large queue (${status.queueSize}) - messages may be delayed` : '✅ Queue normal'
        ].filter(Boolean),
        recommendations: activeAgents.length === 0
          ? ['Create and activate at least one agent to start receiving signals']
          : ['Signals will be sent automatically when detected', 'Use POST /api/telegram/test-signal to send a test notification']
      }
    };

    res.status(200).json({
      success: true,
      data: diagnostics
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting diagnostics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get diagnostics'
    } as ApiResponse);
  }
};
