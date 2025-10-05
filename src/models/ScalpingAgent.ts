import mongoose, { Schema, Document } from 'mongoose';
import { ScalpingAgent, AgentConfig, AgentPerformance } from '../types';

interface ScalpingAgentDocument extends Omit<ScalpingAgent, '_id' | 'userId'>, Document {
  userId: mongoose.Types.ObjectId;
}

const AgentConfigSchema = new Schema<AgentConfig>({
  maxPositionSize: {
    type: Number,
    required: true,
    min: 0,
  },
  stopLossPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  takeProfitPercentage: {
    type: Number,
    required: true,
    min: 0,
  },
  riskPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  timeframes: [{
    type: String,
    enum: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'],
  }],
  indicators: [{
    type: String,
    enum: ['RSI', 'MACD', 'EMA', 'SMA', 'BB', 'STOCH', 'ADX', 'ATR'],
  }],
}, { _id: false });

const AgentPerformanceSchema = new Schema<AgentPerformance>({
  totalTrades: {
    type: Number,
    default: 0,
  },
  winRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  totalPnL: {
    type: Number,
    default: 0,
  },
  maxDrawdown: {
    type: Number,
    default: 0,
  },
  sharpeRatio: {
    type: Number,
    default: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const ScalpingAgentSchema = new Schema<ScalpingAgentDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  strategyType: {
    type: String,
    enum: ['SCALPING', 'MOMENTUM', 'BREAKOUT', 'MEAN_REVERSION', 'ARBITRAGE'],
    default: 'SCALPING',
  },
  tradingCategory: {
    type: String,
    enum: ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'],
    default: 'MODERATE',
  },
  riskTolerance: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM',
  },
  maxOpenPositions: {
    type: Number,
    default: 3,
    min: 1,
    max: 20,
  },
  enableLLMValidation: {
    type: Boolean,
    default: true,
  },
  minLLMConfidence: {
    type: Number,
    default: 0.7,
    min: 0,
    max: 1,
  },
  allowedSignalCategories: [{
    type: String,
    enum: ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY'],
  }],
  tags: [{
    type: String,
    trim: true,
  }],
  description: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  config: {
    type: AgentConfigSchema,
    required: true,
  },
  performance: {
    type: AgentPerformanceSchema,
    default: () => ({}),
  },
}, {
  timestamps: true,
});

ScalpingAgentSchema.index({ userId: 1 });
ScalpingAgentSchema.index({ symbol: 1 });
ScalpingAgentSchema.index({ isActive: 1 });

export default mongoose.model<ScalpingAgentDocument>('ScalpingAgent', ScalpingAgentSchema);