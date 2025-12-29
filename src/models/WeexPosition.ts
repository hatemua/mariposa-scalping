/**
 * WEEX Position Database Model
 *
 * Stores WEEX trading positions with orderId for tracking and restart recovery.
 * Persists position state including TP/SL, breakeven, and trailing stop status.
 */

import mongoose, { Schema, Document } from 'mongoose';

// ============================================================================
// TYPES
// ============================================================================

export type WeexPositionStatus = 'OPEN' | 'CLOSING' | 'CLOSED' | 'ERROR';
export type WeexDirection = 'BUY' | 'SELL';
export type WeexGrade = 'A' | 'B' | 'C';
export type WeexCloseReason =
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'TRAILING_STOP'
  | 'BREAKEVEN_STOP'
  | 'TIME_EXIT'
  | 'MANUAL'
  | 'API_CLOSE'
  | 'EXTERNAL_CLOSE'
  | 'ERROR';

export interface IWeexPosition extends Document {
  // Identity - CRITICAL for tracking
  orderId: string;           // WEEX order ID from exchange
  setupId: string;           // V6 setup ID that created this position
  positionId: string;        // Internal position ID (weex_setupId_timestamp)
  tpOrderId?: string;        // WEEX Take Profit order ID (for modification)
  slOrderId?: string;        // WEEX Stop Loss order ID (for modification)

  // Trade details
  symbol: string;
  direction: WeexDirection;
  grade: WeexGrade;

  // Prices
  entryPrice: number;
  stopLoss: number;          // Original stop loss
  takeProfit: number;        // Take profit target
  currentStopLoss: number;   // Current SL (may change with breakeven/trailing)
  closePrice?: number;       // Filled when position closes

  // Size
  positionSizeBTC: number;
  positionSizeUSD: number;
  leverage: number;

  // Status
  status: WeexPositionStatus;
  closeReason?: WeexCloseReason;
  realizedPnl?: number;

  // Exit management state
  breakevenActivated: boolean;
  trailingActivated: boolean;

  // Timestamps
  openedAt: Date;
  closedAt?: Date;
  lastUpdateAt: Date;

  // Mongoose timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// SCHEMA
// ============================================================================

const WeexPositionSchema = new Schema<IWeexPosition>({
  // Identity
  orderId: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  setupId: {
    type: String,
    required: true,
    index: true
  },
  positionId: {
    type: String,
    required: true,
    index: true
  },
  tpOrderId: {
    type: String,
    index: true
  },
  slOrderId: {
    type: String,
    index: true
  },

  // Trade details
  symbol: {
    type: String,
    required: true,
    default: 'cmt_btcusdt'
  },
  direction: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  grade: {
    type: String,
    enum: ['A', 'B', 'C'],
    required: true
  },

  // Prices
  entryPrice: {
    type: Number,
    required: true,
    min: 0
  },
  stopLoss: {
    type: Number,
    required: true,
    min: 0
  },
  takeProfit: {
    type: Number,
    required: true,
    min: 0
  },
  currentStopLoss: {
    type: Number,
    required: true,
    min: 0
  },
  closePrice: {
    type: Number,
    min: 0
  },

  // Size
  positionSizeBTC: {
    type: Number,
    required: true,
    min: 0
  },
  positionSizeUSD: {
    type: Number,
    required: true,
    min: 0
  },
  leverage: {
    type: Number,
    default: 5
  },

  // Status
  status: {
    type: String,
    enum: ['OPEN', 'CLOSING', 'CLOSED', 'ERROR'],
    default: 'OPEN',
    index: true
  },
  closeReason: {
    type: String,
    enum: [
      'TAKE_PROFIT',
      'STOP_LOSS',
      'TRAILING_STOP',
      'BREAKEVEN_STOP',
      'TIME_EXIT',
      'MANUAL',
      'API_CLOSE',
      'EXTERNAL_CLOSE',
      'ERROR'
    ]
  },
  realizedPnl: {
    type: Number
  },

  // Exit management
  breakevenActivated: {
    type: Boolean,
    default: false
  },
  trailingActivated: {
    type: Boolean,
    default: false
  },

  // Timestamps
  openedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  closedAt: {
    type: Date
  },
  lastUpdateAt: {
    type: Date,
    default: Date.now
  },
}, {
  timestamps: true,
  collection: 'weexpositions'
});

// ============================================================================
// INDEXES
// ============================================================================

// Compound indexes for common queries
WeexPositionSchema.index({ status: 1, openedAt: -1 });
WeexPositionSchema.index({ orderId: 1, status: 1 });
WeexPositionSchema.index({ setupId: 1, status: 1 });
WeexPositionSchema.index({ closedAt: -1 });

// ============================================================================
// EXPORT
// ============================================================================

export const WeexPosition = mongoose.model<IWeexPosition>('WeexPosition', WeexPositionSchema);
export default WeexPosition;
