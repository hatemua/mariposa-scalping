import express from 'express';
import {
  register,
  login,
  updateOkxKeys,
  sendOTP,
  verifyOTP,
  resendOTP,
  getOTPStatus,
  testEmail
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Authentication routes
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.put('/okx-keys', authenticate, updateOkxKeys);

// OTP routes
router.post('/send-otp', authRateLimiter, sendOTP);
router.post('/verify-otp', authRateLimiter, verifyOTP);
router.post('/resend-otp', authRateLimiter, resendOTP);
router.get('/otp-status/:userId', getOTPStatus);

// Test routes (remove in production)
router.post('/test-email', testEmail);

export default router;