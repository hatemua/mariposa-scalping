import mongoose, { Schema, Document } from 'mongoose';

export interface IDailyTradingStats extends Document {
  date: string;                    // YYYY-MM-DD format (unique)
  totalTrades: number;
  winCount: number;
  lossCount: number;
  totalPnL: number;                // Total P&L in USD for the day
  consecutiveLosses: number;       // Current consecutive loss streak
  maxConsecutiveLosses: number;    // Max consecutive losses reached today
  lastTradeTime: Date | null;
  lastTradeResult: 'WIN' | 'LOSS' | null;
  isPaused: boolean;
  pauseReason: string | null;
  pauseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const DailyTradingStatsSchema = new Schema<IDailyTradingStats>(
  {
    date: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    totalTrades: {
      type: Number,
      default: 0,
    },
    winCount: {
      type: Number,
      default: 0,
    },
    lossCount: {
      type: Number,
      default: 0,
    },
    totalPnL: {
      type: Number,
      default: 0,
    },
    consecutiveLosses: {
      type: Number,
      default: 0,
    },
    maxConsecutiveLosses: {
      type: Number,
      default: 0,
    },
    lastTradeTime: {
      type: Date,
      default: null,
    },
    lastTradeResult: {
      type: String,
      enum: ['WIN', 'LOSS', null],
      default: null,
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
    pauseReason: {
      type: String,
      default: null,
    },
    pauseUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Static method to get today's stats (creates if not exists)
DailyTradingStatsSchema.statics.getTodayStats = async function (): Promise<IDailyTradingStats> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC

  let stats = await this.findOne({ date: today });

  if (!stats) {
    stats = await this.create({
      date: today,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      totalPnL: 0,
      consecutiveLosses: 0,
      maxConsecutiveLosses: 0,
      lastTradeTime: null,
      lastTradeResult: null,
      isPaused: false,
      pauseReason: null,
      pauseUntil: null,
    });
    console.log(`📊 Created new daily stats for ${today}`);
  }

  return stats;
};

// Index for efficient date lookups
DailyTradingStatsSchema.index({ date: -1 });
DailyTradingStatsSchema.index({ createdAt: -1 });

export interface IDailyTradingStatsModel extends mongoose.Model<IDailyTradingStats> {
  getTodayStats(): Promise<IDailyTradingStats>;
}

const DailyTradingStats = mongoose.model<IDailyTradingStats, IDailyTradingStatsModel>(
  'DailyTradingStats',
  DailyTradingStatsSchema
);

export default DailyTradingStats;
