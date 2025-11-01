import mongoose, { Schema, Document } from 'mongoose';

export interface ApiUsageDocument extends Document {
  apiKeyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  userAgent: string | null;
  ipAddress: string | null;
  errorMessage: string | null;
  timestamp: Date;
}

const ApiUsageSchema = new Schema<ApiUsageDocument>({
  apiKeyId: {
    type: Schema.Types.ObjectId,
    ref: 'ApiKey',
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  endpoint: {
    type: String,
    required: true,
    index: true
  },
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  },
  statusCode: {
    type: Number,
    required: true,
    index: true
  },
  responseTime: {
    type: Number,
    required: true,
    min: 0
  },
  userAgent: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: () => new Date(),
    index: true
  }
}, {
  timestamps: false
});

// Compound indexes for analytics queries
ApiUsageSchema.index({ apiKeyId: 1, timestamp: -1 });
ApiUsageSchema.index({ userId: 1, timestamp: -1 });
ApiUsageSchema.index({ endpoint: 1, timestamp: -1 });

// TTL index: Auto-delete records older than 90 days
ApiUsageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model<ApiUsageDocument>('ApiUsage', ApiUsageSchema);
