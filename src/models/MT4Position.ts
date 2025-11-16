import mongoose, { Schema, Document } from 'mongoose';

export interface MT4PositionData {
  _id?: string;
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  ticket: number;
  symbol: string;
  side: 'buy' | 'sell';
  lotSize: number;
  entryPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'open' | 'closed' | 'auto-closed';
  profit?: number;
  openedAt: Date;
  closedAt?: Date;
  closeReason?: 'manual' | 'sell-signal' | 'market-drop' | 'take-profit' | 'stop-loss';
  createdAt?: Date;
  updatedAt?: Date;
}

interface MT4PositionDocument extends Omit<MT4PositionData, '_id' | 'userId' | 'agentId'>, Document {
  userId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
}

const MT4PositionSchema = new Schema<MT4PositionDocument>({
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
  ticket: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    default: 'BTCUSDm',
  },
  side: {
    type: String,
    required: true,
    enum: ['buy', 'sell'],
  },
  lotSize: {
    type: Number,
    required: true,
    min: 0.01,
  },
  entryPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  currentPrice: {
    type: Number,
    min: 0,
  },
  stopLoss: {
    type: Number,
    min: 0,
  },
  takeProfit: {
    type: Number,
    min: 0,
  },
  status: {
    type: String,
    required: true,
    enum: ['open', 'closed', 'auto-closed'],
    default: 'open',
    index: true,
  },
  profit: {
    type: Number,
    default: 0,
  },
  openedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  closedAt: {
    type: Date,
  },
  closeReason: {
    type: String,
    enum: ['manual', 'sell-signal', 'market-drop', 'take-profit', 'stop-loss'],
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
MT4PositionSchema.index({ userId: 1, status: 1 });
MT4PositionSchema.index({ agentId: 1, status: 1 });
MT4PositionSchema.index({ symbol: 1, status: 1 });
MT4PositionSchema.index({ openedAt: -1 });

export default mongoose.model<MT4PositionDocument>('MT4Position', MT4PositionSchema);
