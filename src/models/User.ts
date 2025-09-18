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
}, {
  timestamps: true,
});

// Removed password hashing middleware - OTP-only authentication

UserSchema.index({ email: 1 });

export default mongoose.model<UserDocument>('User', UserSchema);