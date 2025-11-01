import mongoose, { Schema, Document } from 'mongoose';

export interface ApiKeyDocument extends Document {
  userId: mongoose.Types.ObjectId;
  keyPrefix: string;           // Visible part: "mk_abc123"
  keyHash: string;              // bcrypt hash of full key
  name: string;                 // User-defined name: "Production Server"
  tier: 'free' | 'starter' | 'pro' | 'enterprise';

  // Rate Limits
  requestsPerDay: number;
  requestsPerMinute: number;
  requestsUsedToday: number;
  requestsUsedThisMinute: number;
  lastResetDate: Date;
  lastMinuteResetDate: Date;

  // Access Control
  allowedEndpoints: string[];   // e.g., ['/api/v1/opportunities', '/api/v1/signals']
  allowedIPs: string[];         // Optional IP whitelist
  isActive: boolean;

  // Metadata
  lastUsedAt: Date | null;
  expiresAt: Date | null;       // For trial keys
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<ApiKeyDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  keyPrefix: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  keyHash: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  tier: {
    type: String,
    required: true,
    enum: ['free', 'starter', 'pro', 'enterprise'],
    default: 'free'
  },
  requestsPerDay: {
    type: Number,
    required: true,
    default: 100
  },
  requestsPerMinute: {
    type: Number,
    required: true,
    default: 10
  },
  requestsUsedToday: {
    type: Number,
    default: 0,
    min: 0
  },
  requestsUsedThisMinute: {
    type: Number,
    default: 0,
    min: 0
  },
  lastResetDate: {
    type: Date,
    default: () => new Date()
  },
  lastMinuteResetDate: {
    type: Date,
    default: () => new Date()
  },
  allowedEndpoints: {
    type: [String],
    default: []
  },
  allowedIPs: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for performance
ApiKeySchema.index({ userId: 1, isActive: 1 });
ApiKeySchema.index({ expiresAt: 1 });

export default mongoose.model<ApiKeyDocument>('ApiKey', ApiKeySchema);
