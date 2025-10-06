import mongoose, { Schema, Document } from 'mongoose';

export interface IBroadcastedSignal extends Document {
  signalId: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  category?: string;
  reasoning: string;
  targetPrice?: number;
  stopLoss?: number;

  // Broadcast results
  totalAgentsConsidered: number;
  totalAgentsEligible: number;
  validatedAgents: number;
  rejectedAgents: number;
  excludedAgents: number;

  // Metadata
  broadcastedAt: Date;
  userId?: mongoose.Types.ObjectId;
}

const BroadcastedSignalSchema = new Schema<IBroadcastedSignal>({
  signalId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    index: true,
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
  category: {
    type: String,
  },
  reasoning: {
    type: String,
    required: true,
  },
  targetPrice: {
    type: Number,
  },
  stopLoss: {
    type: Number,
  },
  totalAgentsConsidered: {
    type: Number,
    required: true,
    default: 0,
  },
  totalAgentsEligible: {
    type: Number,
    required: true,
    default: 0,
  },
  validatedAgents: {
    type: Number,
    required: true,
    default: 0,
  },
  rejectedAgents: {
    type: Number,
    required: true,
    default: 0,
  },
  excludedAgents: {
    type: Number,
    required: true,
    default: 0,
  },
  broadcastedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
});

// Indexes for common queries
BroadcastedSignalSchema.index({ broadcastedAt: -1 });
BroadcastedSignalSchema.index({ symbol: 1, broadcastedAt: -1 });
BroadcastedSignalSchema.index({ recommendation: 1, broadcastedAt: -1 });

export default mongoose.model<IBroadcastedSignal>('BroadcastedSignal', BroadcastedSignalSchema);
