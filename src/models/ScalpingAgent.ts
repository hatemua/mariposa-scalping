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

  // Broker selection
  broker: {
    type: String,
    enum: ['OKX', 'MT4', 'BINANCE'],
    required: true,
    default: 'OKX',
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
  validationStrictness: {
    type: String,
    enum: ['STRICT', 'MODERATE', 'RELAXED', 'LLM_FIRST'],
    default: 'MODERATE',
  },
  allowedSignalCategories: [{
    type: String,
    enum: ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY', 'FIBONACCI_SCALPING'],
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
  // UPDATED: Lowered by ~10% to reduce false rejections while maintaining safety
  // Risk 1 (Very Conservative) = 0.75 confidence (was 0.85)
  // Risk 5 (Very Aggressive) = 0.52 confidence (was 0.55)
  const confidenceMap: { [key: number]: number } = {
    1: 0.75,
    2: 0.70,
    3: 0.65,
    4: 0.58,
    5: 0.52,
  };
  this.minLLMConfidence = confidenceMap[this.riskLevel] || 0.65;

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
    this.allowedSignalCategories = ['MOMENTUM', 'VOLUME_SURGE', 'WHALE_ACTIVITY', 'FIBONACCI_SCALPING'];
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
    this.allowedSignalCategories = ['BREAKOUT', 'REVERSAL', 'MOMENTUM', 'ARBITRAGE', 'VOLUME_SURGE', 'WHALE_ACTIVITY', 'FIBONACCI_SCALPING'];
  }

  next();
});

export default mongoose.model<ScalpingAgentDocument>('ScalpingAgent', ScalpingAgentSchema);