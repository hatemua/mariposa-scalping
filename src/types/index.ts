export interface User {
  _id: string;
  email: string;
  okxApiKey?: string;
  okxSecretKey?: string;
  okxPassphrase?: string;
  // MT4 broker credentials (encrypted)
  mt4ServerUrl?: string;
  mt4AccountNumber?: string;
  mt4Password?: string;
  mt4BrokerName?: string;
  // Telegram notification settings
  telegramChatId?: string;
  telegramNotificationsEnabled?: boolean;
  // OTP authentication fields
  otpCode?: string;
  otpExpiry?: Date;
  otpAttempts?: number;
  isEmailVerified?: boolean;
  lastOtpRequest?: Date;
  // API key fields
  isAdmin?: boolean;
  apiKey?: string;
  apiKeyCreatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  _id: string;
  userId: string;
  keyPrefix: string;
  keyHash: string;
  name: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  requestsPerDay: number;
  requestsPerMinute: number;
  requestsUsedToday: number;
  requestsUsedThisMinute: number;
  lastResetDate: Date;
  lastMinuteResetDate: Date;
  allowedEndpoints: string[];
  allowedIPs: string[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiUsage {
  _id: string;
  apiKeyId: string;
  userId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  userAgent: string | null;
  ipAddress: string | null;
  errorMessage: string | null;
  timestamp: Date;
}

export interface ScalpingAgent {
  _id: string;
  userId: string;
  name: string;

  // Broker selection
  broker: 'OKX' | 'MT4' | 'BINANCE';

  // Simplified intelligent configuration
  category: 'SCALPING' | 'SWING' | 'DAY_TRADING' | 'LONG_TERM' | 'ARBITRAGE' | 'ALL';
  riskLevel: 1 | 2 | 3 | 4 | 5; // 1 = Very Conservative, 5 = Very Aggressive
  budget: number; // Total USDT allocation for this agent

  // Status
  isActive: boolean;

  // LLM-managed settings (no manual configuration needed)
  enableLLMValidation: boolean; // Always true for intelligent agents
  minLLMConfidence: number; // Auto-calculated based on risk level

  // Optional advanced settings
  maxOpenPositions: number; // Auto-calculated based on budget and risk
  validationStrictness: 'STRICT' | 'MODERATE' | 'RELAXED' | 'LLM_FIRST'; // How strictly to enforce validation rules
  allowedSignalCategories: ('BREAKOUT' | 'REVERSAL' | 'MOMENTUM' | 'ARBITRAGE' | 'VOLUME_SURGE' | 'WHALE_ACTIVITY' | 'FIBONACCI_SCALPING')[]; // Auto-set based on category
  tags: string[];
  description?: string;

  // Legacy fields (deprecated but kept for backward compatibility)
  symbol?: string; // No longer used - agents trade any symbol
  strategyType?: 'SCALPING' | 'MOMENTUM' | 'BREAKOUT' | 'MEAN_REVERSION' | 'ARBITRAGE';
  tradingCategory?: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  config?: AgentConfig;

  // Performance tracking
  performance: AgentPerformance;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentConfig {
  maxPositionSize: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  riskPercentage: number;
  timeframes: string[];
  indicators: string[];
}

export interface AgentPerformance {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  lastUpdated: Date;
}

export interface Trade {
  _id: string;
  userId: string;
  agentId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price: number;
  filledPrice?: number;
  filledQuantity?: number;
  status: 'pending' | 'filled' | 'cancelled' | 'rejected';
  pnl?: number;
  fees?: number;
  okxOrderId?: string;
  mt4Ticket?: number;
  signalId?: string;
  llmValidationScore?: number;
  expectedWinProbability?: number;
  actualOutcome?: 'WIN' | 'LOSS' | 'BREAKEVEN';
  performanceNotes?: string;
  closeReason?: 'manual' | 'sell-signal' | 'market-drop' | 'stop-loss' | 'take-profit';
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: Date;
}

export interface LLMAnalysis {
  model: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  targetPrice?: number;
  stopLoss?: number;
  timestamp: Date;
}

export interface ConsolidatedAnalysis {
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  reasoning: string;
  individualAnalyses: LLMAnalysis[];
  timestamp: Date;
}

export interface JobData {
  type: 'analyze' | 'trade' | 'monitor';
  payload: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}