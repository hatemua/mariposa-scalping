import mongoose, { Schema, Document } from 'mongoose';

export interface LLMOpportunityInsights {
  traderThoughts: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  keyFactors: string[];
}

export interface OpportunityDocument extends Document {
  symbol: string;
  score: number;
  confidence: number;
  category: 'BREAKOUT' | 'REVERSAL' | 'MOMENTUM' | 'ARBITRAGE' | 'VOLUME_SURGE' | 'WHALE_ACTIVITY';
  timeframe: string;
  expectedReturn: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  volume24h: number;
  priceChange: number;
  reasoning: string;
  indicators: {
    rsi: number;
    volume_ratio: number;
    volatility: number;
    momentum: number;
    macd?: number;
  };
  llmInsights?: LLMOpportunityInsights;
  isActive: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'COMPLETED';
  detectedAt: Date;
  expiresAt: Date;
  userId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OpportunitySchema = new Schema<OpportunityDocument>({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  category: {
    type: String,
    required: true,
    enum: ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY']
  },
  timeframe: {
    type: String,
    required: true
  },
  expectedReturn: {
    type: Number,
    required: true
  },
  riskLevel: {
    type: String,
    required: true,
    enum: ['LOW', 'MEDIUM', 'HIGH']
  },
  entry: {
    type: Number,
    required: true,
    min: 0
  },
  target: {
    type: Number,
    required: true,
    min: 0
  },
  stopLoss: {
    type: Number,
    required: true,
    min: 0
  },
  riskReward: {
    type: Number,
    required: true
  },
  volume24h: {
    type: Number,
    required: true
  },
  priceChange: {
    type: Number,
    required: true
  },
  reasoning: {
    type: String,
    required: true
  },
  indicators: {
    rsi: { type: Number, required: true },
    volume_ratio: { type: Number, required: true },
    volatility: { type: Number, required: true },
    momentum: { type: Number, required: true },
    macd: { type: Number }
  },
  llmInsights: {
    traderThoughts: { type: String },
    recommendation: {
      type: String,
      enum: ['BUY', 'SELL', 'HOLD']
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    keyFactors: [{ type: String }]
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
    enum: ['ACTIVE', 'EXPIRED', 'COMPLETED'],
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
OpportunitySchema.index({ symbol: 1, isActive: 1 });
OpportunitySchema.index({ isActive: 1, expiresAt: 1 });
OpportunitySchema.index({ status: 1, detectedAt: -1 });
OpportunitySchema.index({ score: -1, isActive: 1 });
OpportunitySchema.index({ createdAt: -1 });

export default mongoose.model<OpportunityDocument>('Opportunity', OpportunitySchema);
