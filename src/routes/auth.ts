import express from 'express';
import {
  requestOTP,
  updateOkxKeys,
  verifyOTP,
  resendOTP,
  getOTPStatus,
  testEmail
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Passwordless OTP authentication routes
router.post('/request-otp', authRateLimiter, requestOTP);
router.post('/verify-otp', authRateLimiter, verifyOTP);
router.post('/resend-otp', authRateLimiter, resendOTP);
router.get('/otp-status/:userId', getOTPStatus);

// Authenticated routes
router.put('/okx-keys', authenticate, updateOkxKeys);

// Test routes (remove in production)
router.post('/test-email', testEmail);

export default router;