import mongoose, { Schema, Document } from 'mongoose';

export interface LLMWhaleInsights {
  traderAnalysis: string;
  marketImpact: string;
  tradingStrategy: string;
  riskAssessment: string;
}

export interface WhaleActivityDocument extends Document {
  symbol: string;
  type: 'BUY_WALL' | 'SELL_WALL' | 'ACCUMULATION' | 'LARGE_TRADE';
  side: 'BUY' | 'SELL';
  size: number;
  value: number;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  volumeSpike: number;
  description: string;
  llmInsights?: LLMWhaleInsights;
  isActive: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'EXECUTED';
  detectedAt: Date;
  expiresAt: Date;
  userId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WhaleActivitySchema = new Schema<WhaleActivityDocument>({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['BUY_WALL', 'SELL_WALL', 'ACCUMULATION', 'LARGE_TRADE']
  },
  side: {
    type: String,
    required: true,
    enum: ['BUY', 'SELL']
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  impact: {
    type: String,
    required: true,
    enum: ['LOW', 'MEDIUM', 'HIGH']
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  volumeSpike: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  llmInsights: {
    traderAnalysis: { type: String },
    marketImpact: { type: String },
    tradingStrategy: { type: String },
    riskAssessment: { type: String }
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['ACTIVE', 'EXPIRED', 'EXECUTED'],
    default: 'ACTIVE',
    index: true
  },
  detectedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
WhaleActivitySchema.index({ symbol: 1, isActive: 1 });
WhaleActivitySchema.index({ isActive: 1, expiresAt: 1 });
WhaleActivitySchema.index({ status: 1, detectedAt: -1 });
WhaleActivitySchema.index({ impact: 1, isActive: 1 });
WhaleActivitySchema.index({ createdAt: -1 });

export default mongoose.model<WhaleActivityDocument>('WhaleActivity', WhaleActivitySchema);
