import { Request, Response } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/jwt';
import { encrypt } from '../utils/encryption';
import { ApiResponse } from '../types';
import { AuthRequest } from '../middleware/auth';
import { otpService } from '../services/otpService';
import { emailService } from '../services/emailService';

export const requestOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email is required'
      } as ApiResponse);
      return;
    }

    // Find or create user with email only
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user with email only (passwordless)
      user = new User({ email, isEmailVerified: false });
      await user.save();
    }

    // Send OTP for login/registration
    const otpResult = await otpService.sendOTP((user._id as any).toString(), 'login');

    if (!otpResult.success) {
      res.status(500).json({
        success: false,
        error: otpResult.message || 'Failed to send verification code'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        userId: user._id,
        message: otpResult.message,
        nextResendTime: otpResult.nextResendTime
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

// Removed traditional login - replaced with OTP-only authentication

export const updateOkxKeys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { okxApiKey, okxSecretKey, okxPassphrase } = req.body;
    const userId = req.user._id;

    if (!okxApiKey || !okxSecretKey || !okxPassphrase) {
      res.status(400).json({
        success: false,
        error: 'All OKX API credentials are required'
      } as ApiResponse);
      return;
    }

    const encryptedApiKey = encrypt(okxApiKey);
    const encryptedSecretKey = encrypt(okxSecretKey);
    const encryptedPassphrase = encrypt(okxPassphrase);

    await User.findByIdAndUpdate(userId, {
      okxApiKey: JSON.stringify(encryptedApiKey),
      okxSecretKey: JSON.stringify(encryptedSecretKey),
      okxPassphrase: JSON.stringify(encryptedPassphrase)
    });

    res.json({
      success: true,
      message: 'OKX API keys updated successfully'
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

// OTP Endpoints

export const sendOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, purpose = 'registration' } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'User ID is required'
      } as ApiResponse);
      return;
    }

    const result = await otpService.sendOTP(userId, purpose);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: {
          nextResendTime: result.nextResendTime
        }
      } as ApiResponse);
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        data: {
          canResend: result.canResend,
          nextResendTime: result.nextResendTime
        }
      } as ApiResponse);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const verifyOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, otpCode } = req.body;

    if (!userId || !otpCode) {
      res.status(400).json({
        success: false,
        error: 'User ID and OTP code are required'
      } as ApiResponse);
      return;
    }

    const result = await otpService.verifyOTP(userId, otpCode, 'login');

    if (result.success) {
      const user = await User.findById(userId);
      if (user) {
        // Update user as verified and generate token
        await User.findByIdAndUpdate(userId, { isEmailVerified: true });

        const token = generateToken({
          userId: (user._id as any).toString(),
          email: user.email
        });

        res.json({
          success: true,
          message: result.message,
          data: {
            token,
            user: {
              id: user._id,
              email: user.email,
              isEmailVerified: true,
              hasOkxKeys: !!(user.okxApiKey && user.okxSecretKey && user.okxPassphrase)
            }
          }
        } as ApiResponse);
        return;
      }
    }

    res.status(400).json({
      success: false,
      error: result.message,
      data: {
        canResend: result.canResend
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const resendOTP = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'User ID is required'
      } as ApiResponse);
      return;
    }

    const result = await otpService.sendOTP(userId, 'login');

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: {
          nextResendTime: result.nextResendTime
        }
      } as ApiResponse);
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        data: {
          canResend: result.canResend,
          nextResendTime: result.nextResendTime
        }
      } as ApiResponse);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const getOTPStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'User ID is required'
      } as ApiResponse);
      return;
    }

    const status = await otpService.getOTPStatus(userId);

    res.json({
      success: true,
      data: status
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const testEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: 'Email is required'
      } as ApiResponse);
      return;
    }

    const result = await emailService.sendTestEmail(email);

    if (result) {
      res.json({
        success: true,
        message: 'Test email sent successfully'
      } as ApiResponse);
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send test email'
      } as ApiResponse);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};