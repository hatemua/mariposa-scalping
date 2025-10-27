import express from 'express';
import { authenticate } from '../middleware/auth';
import * as telegramController from '../controllers/telegramController';

const router = express.Router();

// All telegram routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/telegram/test
 * @desc    Test Telegram bot connection
 * @access  Private
 */
router.post('/test', telegramController.testConnection);

/**
 * @route   GET /api/telegram/status
 * @desc    Get Telegram bot status
 * @access  Private
 */
router.get('/status', telegramController.getStatus);

/**
 * @route   POST /api/telegram/test-signal
 * @desc    Send a test trading signal to Telegram
 * @access  Private
 */
router.post('/test-signal', telegramController.sendTestSignal);

/**
 * @route   GET /api/telegram/diagnostics
 * @desc    Get diagnostic information about Telegram and signal generation
 * @access  Private
 */
router.get('/diagnostics', telegramController.getDiagnostics);

export default router;
