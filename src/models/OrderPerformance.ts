import mongoose, { Schema, Document } from 'mongoose';

export interface OrderPerformanceDocument extends Document {
  tradeId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  signalId: string;

  // Signal validation data
  llmValidationScore: number;
  expectedWinProbability: number;
  llmReasoning: string;

  // Actual trade outcome
  actualPnL: number;
  actualOutcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  actualWinProbability: number; // 1 for win, 0 for loss, 0.5 for breakeven

  // Accuracy metrics
  predictionAccuracy: number; // How close the prediction was to reality
  confidenceCalibration: number; // How well-calibrated the confidence was

  // Market conditions at execution
  symbol: string;
  entryPrice: number;
  exitPrice?: number;
  marketVolatility: number;
  marketTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';

  // Performance evaluation
  evaluationNotes: string;
  llmModelUsed: string;

  // Timestamps
  signalGeneratedAt: Date;
  tradeExecutedAt: Date;
  tradeClosedAt?: Date;
  evaluatedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const OrderPerformanceSchema = new Schema<OrderPerformanceDocument>({
  tradeId: {
    type: Schema.Types.ObjectId,
    ref: 'Trade',
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'ScalpingAgent',
    required: true,
    index: true,
  },
  signalId: {
    type: String,
    required: true,
    index: true,
  },

  llmValidationScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  expectedWinProbability: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  llmReasoning: {
    type: String,
    required: true,
  },

  actualPnL: {
    type: Number,
    required: true,
  },
  actualOutcome: {
    type: String,
    required: true,
    enum: ['WIN', 'LOSS', 'BREAKEVEN'],
  },
  actualWinProbability: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },

  predictionAccuracy: {
    type: Number,
    min: 0,
    max: 100,
  },
  confidenceCalibration: {
    type: Number,
    min: 0,
    max: 100,
  },

  symbol: {
    type: String,
    required: true,
    uppercase: true,
  },
  entryPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  exitPrice: {
    type: Number,
    min: 0,
  },
  marketVolatility: {
    type: Number,
    default: 0,
  },
  marketTrend: {
    type: String,
    enum: ['BULLISH', 'BEARISH', 'NEUTRAL'],
  },

  evaluationNotes: {
    type: String,
  },
  llmModelUsed: {
    type: String,
  },

  signalGeneratedAt: {
    type: Date,
    required: true,
  },
  tradeExecutedAt: {
    type: Date,
    required: true,
  },
  tradeClosedAt: {
    type: Date,
  },
  evaluatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient querying
OrderPerformanceSchema.index({ userId: 1, createdAt: -1 });
OrderPerformanceSchema.index({ agentId: 1, actualOutcome: 1 });
OrderPerformanceSchema.index({ llmValidationScore: -1 });
OrderPerformanceSchema.index({ predictionAccuracy: -1 });

export default mongoose.model<OrderPerformanceDocument>('OrderPerformance', OrderPerformanceSchema);
