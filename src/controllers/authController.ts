import { Request, Response } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/jwt';
import { encrypt } from '../utils/encryption';
import { ApiResponse } from '../types';

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

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email
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

    const token = generateToken({
      userId: user._id.toString(),
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

export const updateOkxKeys = async (req: Request, res: Response): Promise<void> => {
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