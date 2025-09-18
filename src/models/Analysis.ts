import mongoose, { Schema, Document } from 'mongoose';
import { ConsolidatedAnalysis, LLMAnalysis } from '../types';

interface ConsolidatedAnalysisDocument extends Omit<ConsolidatedAnalysis, '_id'>, Document {}

const LLMAnalysisSchema = new Schema<LLMAnalysis>({
  model: {
    type: String,
    required: true,
  },
  recommendation: {
    type: String,
    required: true,
    enum: ['BUY', 'SELL', 'HOLD'],
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  reasoning: {
    type: String,
    required: true,
  },
  targetPrice: {
    type: Number,
    min: 0,
  },
  stopLoss: {
    type: Number,
    min: 0,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const ConsolidatedAnalysisSchema = new Schema<ConsolidatedAnalysisDocument>({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
  },
  recommendation: {
    type: String,
    required: true,
    enum: ['BUY', 'SELL', 'HOLD'],
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
  },
  targetPrice: {
    type: Number,
    min: 0,
  },
  stopLoss: {
    type: Number,
    min: 0,
  },
  reasoning: {
    type: String,
    required: true,
  },
  individualAnalyses: [LLMAnalysisSchema],
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

ConsolidatedAnalysisSchema.index({ symbol: 1 });
ConsolidatedAnalysisSchema.index({ timestamp: -1 });
ConsolidatedAnalysisSchema.index({ recommendation: 1 });

export default mongoose.model<ConsolidatedAnalysisDocument>('ConsolidatedAnalysis', ConsolidatedAnalysisSchema);