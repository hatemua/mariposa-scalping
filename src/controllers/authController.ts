import { Request, Response } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/jwt';
import { encrypt } from '../utils/encryption';
import { ApiResponse } from '../types';
import { AuthRequest } from '../middleware/auth';
import { otpService } from '../services/otpService';
import { emailService } from '../services/emailService';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required'
      } as ApiResponse);
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        success: false,
        error: 'User already exists'
      } as ApiResponse);
      return;
    }

    const user = new User({ email, password });
    await user.save();

    // Send email verification OTP
    const otpResult = await otpService.sendOTP((user._id as any).toString(), 'registration');

    if (!otpResult.success) {
      // If OTP sending fails, still allow registration but notify user
      console.error('Failed to send verification email:', otpResult.message);
    }

    res.status(201).json({
      success: true,
      data: {
        userId: user._id,
        email: user.email,
        message: 'Account created successfully. Please check your email for verification code.',
        requiresEmailVerification: true
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required'
      } as ApiResponse);
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as ApiResponse);
      return;
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as ApiResponse);
      return;
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      res.status(403).json({
        success: false,
        error: 'Email not verified. Please verify your email before logging in.',
        requiresEmailVerification: true,
        userId: user._id
      } as ApiResponse);
      return;
    }

    const token = generateToken({
      userId: (user._id as any).toString(),
      email: user.email
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          hasOkxKeys: !!(user.okxApiKey && user.okxSecretKey && user.okxPassphrase)
        }
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

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
    const { userId, otpCode, purpose = 'registration' } = req.body;

    if (!userId || !otpCode) {
      res.status(400).json({
        success: false,
        error: 'User ID and OTP code are required'
      } as ApiResponse);
      return;
    }

    const result = await otpService.verifyOTP(userId, otpCode, purpose);

    if (result.success) {
      // For registration verification, generate token after verification
      if (purpose === 'registration') {
        const user = await User.findById(userId);
        if (user) {
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
                isEmailVerified: user.isEmailVerified
              }
            }
          } as ApiResponse);
          return;
        }
      }

      res.json({
        success: true,
        message: result.message
      } as ApiResponse);
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        data: {
          canResend: result.canResend
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

export const resendOTP = async (req: Request, res: Response): Promise<void> => {
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