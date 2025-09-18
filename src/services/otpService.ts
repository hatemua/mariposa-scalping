import crypto from 'crypto';
import { User } from '../models';
import { emailService } from './emailService';
import { redisService } from './redisService';

interface OTPResult {
  success: boolean;
  message: string;
  canResend?: boolean;
  nextResendTime?: Date;
}

export class OTPService {
  private readonly OTP_LENGTH = 6;
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RESEND_COOLDOWN_MINUTES = 2;
  private readonly MAX_DAILY_ATTEMPTS = 10;

  // Generate a 6-digit OTP code
  generateOTP(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  // Send OTP to user's email
  async sendOTP(userId: string, purpose: 'registration' | 'login' | '2fa' | 'password-reset' = 'registration'): Promise<OTPResult> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Check daily rate limit
      const dailyKey = `otp_daily:${userId}:${new Date().toDateString()}`;
      const dailyCount = await redisService.get(dailyKey) || 0;

      if (dailyCount >= this.MAX_DAILY_ATTEMPTS) {
        return {
          success: false,
          message: 'Daily OTP limit exceeded. Please try again tomorrow.'
        };
      }

      // Check resend cooldown
      if (user.lastOtpRequest) {
        const timeSinceLastRequest = Date.now() - user.lastOtpRequest.getTime();
        const cooldownMs = this.RESEND_COOLDOWN_MINUTES * 60 * 1000;

        if (timeSinceLastRequest < cooldownMs) {
          const nextResendTime = new Date(user.lastOtpRequest.getTime() + cooldownMs);
          return {
            success: false,
            message: `Please wait ${Math.ceil((cooldownMs - timeSinceLastRequest) / 1000)} seconds before requesting another OTP`,
            canResend: false,
            nextResendTime
          };
        }
      }

      // Generate new OTP
      const otpCode = this.generateOTP();
      const otpExpiry = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Update user with OTP
      await User.findByIdAndUpdate(userId, {
        otpCode,
        otpExpiry,
        otpAttempts: 0,
        lastOtpRequest: new Date()
      });

      // Increment daily counter
      await redisService.set(dailyKey, dailyCount + 1, { ttl: 24 * 60 * 60 });

      // Send email
      const emailSent = await emailService.sendOTPEmail(user.email, otpCode, user.email.split('@')[0]);

      if (!emailSent) {
        return {
          success: false,
          message: 'Failed to send OTP email. Please try again.'
        };
      }

      // Cache OTP for quick validation (backup)
      await redisService.set(`otp:${userId}`, {
        code: otpCode,
        expiry: otpExpiry,
        purpose
      }, { ttl: this.OTP_EXPIRY_MINUTES * 60 });

      return {
        success: true,
        message: `OTP sent to ${this.maskEmail(user.email)}`,
        canResend: false,
        nextResendTime: new Date(Date.now() + this.RESEND_COOLDOWN_MINUTES * 60 * 1000)
      };

    } catch (error) {
      console.error('Error sending OTP:', error);
      return {
        success: false,
        message: 'Failed to send OTP. Please try again.'
      };
    }
  }

  // Verify OTP code
  async verifyOTP(userId: string, inputCode: string, purpose: 'registration' | 'login' | '2fa' | 'password-reset' = 'registration'): Promise<OTPResult> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      // Check if OTP exists and hasn't expired
      if (!user.otpCode || !user.otpExpiry) {
        return {
          success: false,
          message: 'No OTP found. Please request a new one.'
        };
      }

      if (Date.now() > user.otpExpiry.getTime()) {
        // Clear expired OTP
        await User.findByIdAndUpdate(userId, {
          otpCode: null,
          otpExpiry: null,
          otpAttempts: 0
        });

        return {
          success: false,
          message: 'OTP has expired. Please request a new one.',
          canResend: true
        };
      }

      // Check attempt limit
      if ((user.otpAttempts || 0) >= this.MAX_ATTEMPTS) {
        // Clear OTP after max attempts
        await User.findByIdAndUpdate(userId, {
          otpCode: null,
          otpExpiry: null,
          otpAttempts: 0
        });

        return {
          success: false,
          message: 'Too many failed attempts. Please request a new OTP.',
          canResend: true
        };
      }

      // Verify the code
      if (inputCode !== user.otpCode) {
        // Increment attempt counter
        await User.findByIdAndUpdate(userId, {
          otpAttempts: (user.otpAttempts || 0) + 1
        });

        const remainingAttempts = this.MAX_ATTEMPTS - ((user.otpAttempts || 0) + 1);
        return {
          success: false,
          message: `Invalid OTP. ${remainingAttempts} attempts remaining.`
        };
      }

      // OTP is valid - clear it and perform purpose-specific actions
      const updateData: any = {
        otpCode: null,
        otpExpiry: null,
        otpAttempts: 0
      };

      if (purpose === 'registration') {
        updateData.isEmailVerified = true;
      }

      await User.findByIdAndUpdate(userId, updateData);

      // Clear Redis cache
      await redisService.delete(`otp:${userId}`);

      // Send welcome email for successful verification
      if (purpose === 'registration') {
        await emailService.sendWelcomeEmail(user.email, user.email.split('@')[0]);
      }

      return {
        success: true,
        message: 'OTP verified successfully!'
      };

    } catch (error) {
      console.error('Error verifying OTP:', error);
      return {
        success: false,
        message: 'Failed to verify OTP. Please try again.'
      };
    }
  }

  // Check if user can request OTP
  async canRequestOTP(userId: string): Promise<{ canRequest: boolean; nextResendTime?: Date; message?: string }> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { canRequest: false, message: 'User not found' };
      }

      // Check daily limit
      const dailyKey = `otp_daily:${userId}:${new Date().toDateString()}`;
      const dailyCount = await redisService.get(dailyKey) || 0;

      if (dailyCount >= this.MAX_DAILY_ATTEMPTS) {
        return {
          canRequest: false,
          message: 'Daily OTP limit exceeded. Please try again tomorrow.'
        };
      }

      // Check cooldown
      if (user.lastOtpRequest) {
        const timeSinceLastRequest = Date.now() - user.lastOtpRequest.getTime();
        const cooldownMs = this.RESEND_COOLDOWN_MINUTES * 60 * 1000;

        if (timeSinceLastRequest < cooldownMs) {
          const nextResendTime = new Date(user.lastOtpRequest.getTime() + cooldownMs);
          return {
            canRequest: false,
            nextResendTime,
            message: `Please wait ${Math.ceil((cooldownMs - timeSinceLastRequest) / 1000)} seconds`
          };
        }
      }

      return { canRequest: true };

    } catch (error) {
      console.error('Error checking OTP request eligibility:', error);
      return {
        canRequest: false,
        message: 'Unable to check OTP eligibility'
      };
    }
  }

  // Clean up expired OTPs (for background job)
  async cleanupExpiredOTPs(): Promise<number> {
    try {
      const result = await User.updateMany(
        {
          otpExpiry: { $lt: new Date() },
          otpCode: { $ne: null }
        },
        {
          $unset: {
            otpCode: 1,
            otpExpiry: 1
          },
          $set: {
            otpAttempts: 0
          }
        }
      );

      console.log(`Cleaned up ${result.modifiedCount} expired OTPs`);
      return result.modifiedCount;

    } catch (error) {
      console.error('Error cleaning up expired OTPs:', error);
      return 0;
    }
  }

  // Utility function to mask email for security
  private maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    const maskedUsername = username.length > 2
      ? username[0] + '*'.repeat(username.length - 2) + username[username.length - 1]
      : username;
    return `${maskedUsername}@${domain}`;
  }

  // Get OTP status for user
  async getOTPStatus(userId: string): Promise<{
    hasActiveOTP: boolean;
    expiresAt?: Date;
    attemptsRemaining?: number;
    canResend: boolean;
    nextResendTime?: Date;
  }> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { hasActiveOTP: false, canResend: true };
      }

      const hasActiveOTP = !!(user.otpCode && user.otpExpiry && Date.now() < user.otpExpiry.getTime());
      const attemptsRemaining = hasActiveOTP ? this.MAX_ATTEMPTS - (user.otpAttempts || 0) : 0;

      const canRequestResult = await this.canRequestOTP(userId);

      return {
        hasActiveOTP,
        expiresAt: hasActiveOTP ? user.otpExpiry : undefined,
        attemptsRemaining: hasActiveOTP ? attemptsRemaining : undefined,
        canResend: canRequestResult.canRequest,
        nextResendTime: canRequestResult.nextResendTime
      };

    } catch (error) {
      console.error('Error getting OTP status:', error);
      return { hasActiveOTP: false, canResend: false };
    }
  }
}

export const otpService = new OTPService();