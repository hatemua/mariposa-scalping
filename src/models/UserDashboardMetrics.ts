import mongoose, { Schema, Document } from 'mongoose';

export interface AgentMetricsSummary {
  agentId: mongoose.Types.ObjectId;
  agentName: string;
  symbol: string;
  strategyType: string;
  pnl: number;
  trades: number;
  winRate: number;
  status: 'RUNNING' | 'STOPPED';
  lastTradeAt?: Date;
}

export interface DailyPnL {
  date: Date;
  pnl: number;
  trades: number;
}

export interface HourlyActivity {
  hour: number;
  trades: number;
  volume: number;
  pnl: number;
}

export interface UserDashboardMetricsDocument extends Document {
  userId: mongoose.Types.ObjectId;

  // Aggregated counts
  totalAgents: number;
  activeAgents: number;

  // Aggregated PnL across all agents
  totalPnL: number;
  todayPnL: number;
  weekPnL: number;
  monthPnL: number;
  yearPnL: number;

  // Aggregated performance
  totalTrades: number;
  totalWinningTrades: number;
  totalLosingTrades: number;
  totalWinRate: number;
  totalVolume: number;
  totalFees: number;

  // Risk metrics
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;

  // Per-agent breakdown
  agentMetrics: AgentMetricsSummary[];

  // Time-series data for charts
  dailyPnL: DailyPnL[];
  hourlyActivity: HourlyActivity[];

  // Strategy performance
  strategyPerformance: Map<string, {
    pnl: number;
    trades: number;
    winRate: number;
  }>;

  // Symbol performance
  symbolPerformance: Map<string, {
    pnl: number;
    trades: number;
    winRate: number;
  }>;

  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgentMetricsSummarySchema = new Schema({
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'ScalpingAgent',
    required: true,
  },
  agentName: {
    type: String,
    required: true,
  },
  symbol: {
    type: String,
    required: true,
  },
  strategyType: {
    type: String,
    required: true,
  },
  pnl: {
    type: Number,
    default: 0,
  },
  trades: {
    type: Number,
    default: 0,
  },
  winRate: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['RUNNING', 'STOPPED'],
    required: true,
  },
  lastTradeAt: {
    type: Date,
  },
}, { _id: false });

const DailyPnLSchema = new Schema({
  date: {
    type: Date,
    required: true,
  },
  pnl: {
    type: Number,
    default: 0,
  },
  trades: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const HourlyActivitySchema = new Schema({
  hour: {
    type: Number,
    required: true,
    min: 0,
    max: 23,
  },
  trades: {
    type: Number,
    default: 0,
  },
  volume: {
    type: Number,
    default: 0,
  },
  pnl: {
    type: Number,
    default: 0,
  },
}, { _id: false });

const UserDashboardMetricsSchema = new Schema<UserDashboardMetricsDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  totalAgents: {
    type: Number,
    default: 0,
  },
  activeAgents: {
    type: Number,
    default: 0,
  },

  totalPnL: {
    type: Number,
    default: 0,
  },
  todayPnL: {
    type: Number,
    default: 0,
  },
  weekPnL: {
    type: Number,
    default: 0,
  },
  monthPnL: {
    type: Number,
    default: 0,
  },
  yearPnL: {
    type: Number,
    default: 0,
  },

  totalTrades: {
    type: Number,
    default: 0,
  },
  totalWinningTrades: {
    type: Number,
    default: 0,
  },
  totalLosingTrades: {
    type: Number,
    default: 0,
  },
  totalWinRate: {
    type: Number,
    default: 0,
  },
  totalVolume: {
    type: Number,
    default: 0,
  },
  totalFees: {
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
  profitFactor: {
    type: Number,
    default: 0,
  },

  agentMetrics: [AgentMetricsSummarySchema],

  dailyPnL: [DailyPnLSchema],

  hourlyActivity: [HourlyActivitySchema],

  strategyPerformance: {
    type: Map,
    of: new Schema({
      pnl: { type: Number, default: 0 },
      trades: { type: Number, default: 0 },
      winRate: { type: Number, default: 0 },
    }, { _id: false }),
  },

  symbolPerformance: {
    type: Map,
    of: new Schema({
      pnl: { type: Number, default: 0 },
      trades: { type: Number, default: 0 },
      winRate: { type: Number, default: 0 },
    }, { _id: false }),
  },

  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes for efficient querying
UserDashboardMetricsSchema.index({ userId: 1 });
UserDashboardMetricsSchema.index({ lastUpdated: -1 });

export default mongoose.model<UserDashboardMetricsDocument>('UserDashboardMetrics', UserDashboardMetricsSchema);
