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

  // NEW: Simplified intelligent configuration
  category: {
    type: String,
    enum: ['SCALPING', 'SWING', 'DAY_TRADING', 'LONG_TERM', 'ARBITRAGE', 'ALL'],
    required: true,
    default: 'ALL',
  },
  riskLevel: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 3,
  },
  budget: {
    type: Number,
    required: true,
    min: 10,
    default: 100,
  },

  isActive: {
    type: Boolean,
    default: false,
  },

  // LLM-managed (auto-calculated)
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
  maxOpenPositions: {
    type: Number,
    default: 3,
    min: 1,
    max: 20,
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

  // LEGACY: Kept for backward compatibility (optional)
  symbol: {
    type: String,
    uppercase: true,
  },
  strategyType: {
    type: String,
    enum: ['SCALPING', 'MOMENTUM', 'BREAKOUT', 'MEAN_REVERSION', 'ARBITRAGE'],
  },
  tradingCategory: {
    type: String,
    enum: ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'],
  },
  riskTolerance: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  },
  config: {
    type: AgentConfigSchema,
  },

  performance: {
    type: AgentPerformanceSchema,
    default: () => ({}),
  },
}, {
  timestamps: true,
});

// Indexes
ScalpingAgentSchema.index({ userId: 1 });
ScalpingAgentSchema.index({ symbol: 1 }); // Legacy
ScalpingAgentSchema.index({ isActive: 1 });
ScalpingAgentSchema.index({ category: 1 });
ScalpingAgentSchema.index({ riskLevel: 1 });

// Pre-save hook to auto-calculate LLM settings based on risk level
ScalpingAgentSchema.pre('save', function(next) {
  // Auto-calculate minLLMConfidence based on risk level
  // Risk 1 (Very Conservative) = 0.85 confidence
  // Risk 5 (Very Aggressive) = 0.55 confidence
  const confidenceMap: { [key: number]: number } = {
    1: 0.85,
    2: 0.75,
    3: 0.70,
    4: 0.60,
    5: 0.55,
  };
  this.minLLMConfidence = confidenceMap[this.riskLevel] || 0.70;

  // Auto-calculate max open positions based on budget and risk
  // Risk 1: fewer positions (1-2)
  // Risk 5: more positions (5-10)
  if (this.budget < 100) {
    this.maxOpenPositions = 1;
  } else if (this.budget < 500) {
    this.maxOpenPositions = this.riskLevel <= 2 ? 2 : 3;
  } else if (this.budget < 1000) {
    this.maxOpenPositions = this.riskLevel <= 2 ? 3 : 5;
  } else {
    this.maxOpenPositions = Math.min(this.riskLevel * 2, 10);
  }

  // Auto-set allowed signal categories based on agent category
  if (this.category === 'SCALPING') {
    this.allowedSignalCategories = ['MOMENTUM', 'VOLUME_SURGE', 'WHALE_ACTIVITY'];
  } else if (this.category === 'SWING') {
    this.allowedSignalCategories = ['BREAKOUT', 'REVERSAL'];
  } else if (this.category === 'DAY_TRADING') {
    this.allowedSignalCategories = ['MOMENTUM', 'BREAKOUT'];
  } else if (this.category === 'LONG_TERM') {
    this.allowedSignalCategories = ['REVERSAL'];
  } else if (this.category === 'ARBITRAGE') {
    this.allowedSignalCategories = ['ARBITRAGE'];
  } else {
    // ALL category - accept all signal types
    this.allowedSignalCategories = ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY'];
  }

  next();
});

export default mongoose.model<ScalpingAgentDocument>('ScalpingAgent', ScalpingAgentSchema);