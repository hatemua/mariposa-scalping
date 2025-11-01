import mongoose, { Schema, Document } from 'mongoose';
import { User } from '../types';

interface UserDocument extends Omit<User, '_id'>, Document {}

const UserSchema = new Schema<UserDocument>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  okxApiKey: {
    type: String,
    default: null,
  },
  okxSecretKey: {
    type: String,
    default: null,
  },
  okxPassphrase: {
    type: String,
    default: null,
  },
  // Telegram notification settings
  telegramChatId: {
    type: String,
    default: null,
  },
  telegramNotificationsEnabled: {
    type: Boolean,
    default: false,
  },
  // OTP and email verification fields
  otpCode: {
    type: String,
    default: null,
  },
  otpExpiry: {
    type: Date,
    default: null,
  },
  otpAttempts: {
    type: Number,
    default: 0,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  lastOtpRequest: {
    type: Date,
    default: null,
  },
  // Admin and API key fields
  isAdmin: {
    type: Boolean,
    default: false,
  },
  apiKey: {
    type: String,
    default: null,
  },
  apiKeyCreatedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Removed password hashing middleware - OTP-only authentication
// Note: email index is automatically created by unique: true constraint

export default mongoose.model<UserDocument>('User', UserSchema);