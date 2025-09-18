import mongoose, { Schema, Document } from 'mongoose';
import { Trade } from '../types';

interface TradeDocument extends Omit<Trade, '_id'>, Document {}

const TradeSchema = new Schema<TradeDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'ScalpingAgent',
    required: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
  },
  side: {
    type: String,
    required: true,
    enum: ['buy', 'sell'],
  },
  type: {
    type: String,
    required: true,
    enum: ['market', 'limit'],
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  filledPrice: {
    type: Number,
    min: 0,
  },
  filledQuantity: {
    type: Number,
    min: 0,
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'filled', 'cancelled', 'rejected'],
    default: 'pending',
  },
  pnl: {
    type: Number,
  },
  fees: {
    type: Number,
    min: 0,
  },
  okxOrderId: {
    type: String,
  },
}, {
  timestamps: true,
});

TradeSchema.index({ userId: 1 });
TradeSchema.index({ agentId: 1 });
TradeSchema.index({ symbol: 1 });
TradeSchema.index({ status: 1 });
TradeSchema.index({ createdAt: -1 });

export default mongoose.model<TradeDocument>('Trade', TradeSchema);