import mongoose, { Schema, Document } from 'mongoose';

export interface IAgentSignalLog extends Document {
  signalId: string;
  agentId: mongoose.Types.ObjectId;
  agentName: string;
  agentCategory: string;
  agentRiskLevel: number;
  agentBudget: number;
  agentStatus: 'RUNNING' | 'STOPPED' | 'PAUSED' | 'ERROR';

  // Signal details (denormalized for query performance)
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  signalCategory?: string;

  // Agent processing status
  status: 'EXCLUDED' | 'RECEIVED' | 'VALIDATED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'FILTERED';

  // If EXCLUDED - why didn't agent receive signal?
  exclusionReasons: string[];

  // If FILTERED - why was signal filtered?
  filterReason?: string;

  // If FAILED - why did execution fail?
  failedReason?: string;

  // If RECEIVED - validation results
  isValid: boolean;
  llmValidationScore?: number;
  winProbability?: number;
  reasoning?: string;
  rejectionReasons?: string[];
  riskRewardRatio?: number;

  // Market conditions at validation time
  marketConditions?: {
    liquidity: string;
    spread: number;
    volatility: number;
  };

  // Position sizing
  positionSize?: number;
  availableBalance?: number;

  // If EXECUTED
  executed: boolean;
  executedAt?: Date;
  orderId?: string;
  executionPrice?: number;
  executionQuantity?: number;

  // Broker-specific fields
  broker?: 'OKX' | 'MT4' | 'BINANCE';
  mt4Ticket?: number;

  // Timestamps
  processedAt: Date;
  validatedAt?: Date;
}

const AgentSignalLogSchema = new Schema<IAgentSignalLog>({
  signalId: {
    type: String,
    required: true,
    index: true,
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'ScalpingAgent',
    required: true,
    index: true,
  },
  agentName: {
    type: String,
    required: true,
  },
  agentCategory: {
    type: String,
    required: true,
  },
  agentRiskLevel: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  agentBudget: {
    type: Number,
    required: true,
  },
  agentStatus: {
    type: String,
    required: true,
    enum: ['RUNNING', 'STOPPED', 'PAUSED', 'ERROR'],
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
  signalCategory: {
    type: String,
  },
  status: {
    type: String,
    required: true,
    enum: ['EXCLUDED', 'RECEIVED', 'VALIDATED', 'REJECTED', 'EXECUTED', 'FAILED', 'FILTERED'],
    index: true,
  },
  exclusionReasons: {
    type: [String],
    default: [],
  },
  filterReason: {
    type: String,
  },
  failedReason: {
    type: String,
  },
  isValid: {
    type: Boolean,
    default: false,
  },
  llmValidationScore: {
    type: Number,
    min: 0,
    max: 100,
  },
  winProbability: {
    type: Number,
    min: 0,
    max: 1,
  },
  reasoning: {
    type: String,
  },
  rejectionReasons: {
    type: [String],
    default: [],
  },
  riskRewardRatio: {
    type: Number,
  },
  marketConditions: {
    liquidity: String,
    spread: Number,
    volatility: Number,
  },
  positionSize: {
    type: Number,
  },
  availableBalance: {
    type: Number,
  },
  executed: {
    type: Boolean,
    default: false,
  },
  executedAt: {
    type: Date,
  },
  orderId: {
    type: String,
  },
  executionPrice: {
    type: Number,
  },
  executionQuantity: {
    type: Number,
  },
  broker: {
    type: String,
    enum: ['OKX', 'MT4', 'BINANCE'],
  },
  mt4Ticket: {
    type: Number,
  },
  processedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  validatedAt: {
    type: Date,
  },
});

// Compound indexes for common queries
AgentSignalLogSchema.index({ signalId: 1, agentId: 1 }, { unique: true });
AgentSignalLogSchema.index({ signalId: 1, status: 1 });
AgentSignalLogSchema.index({ agentId: 1, processedAt: -1 });
AgentSignalLogSchema.index({ status: 1, processedAt: -1 });
AgentSignalLogSchema.index({ agentId: 1, status: 1, processedAt: -1 });

export default mongoose.model<IAgentSignalLog>('AgentSignalLog', AgentSignalLogSchema);
