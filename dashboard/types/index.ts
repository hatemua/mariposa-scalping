export interface User {
  id: string;
  email: string;
  hasOkxKeys: boolean;
  isEmailVerified?: boolean;
}

export interface Agent {
  _id: string;
  name: string;
  isActive: boolean;

  // Broker selection
  broker?: 'OKX' | 'MT4' | 'BINANCE';

  // Intelligent agent fields
  category?: 'SCALPING' | 'SWING' | 'DAY_TRADING' | 'LONG_TERM' | 'ARBITRAGE' | 'ALL';
  riskLevel?: 1 | 2 | 3 | 4 | 5;
  budget?: number;
  description?: string;

  // Auto-calculated settings
  enableLLMValidation?: boolean;
  minLLMConfidence?: number;
  maxOpenPositions?: number;
  allowedSignalCategories?: string[];

  // Legacy fields (for backward compatibility)
  symbol?: string;
  config?: AgentConfig;
  strategyType?: string;

  performance: AgentPerformance;
  createdAt: string;
  updatedAt: string;
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
  lastUpdated: string;
}

export interface Trade {
  _id: string;
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
  createdAt: string;
}

export interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  change24h: number;
  high24h: number;
  low24h: number;
  timestamp: string;
  klineData?: any[];
  orderBook?: {
    bids: [string, string][];
    asks: [string, string][];
  };
}

export interface Analysis {
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  targetPrice?: number;
  stopLoss?: number;
  timestamp: string;
  individualAnalyses: LLMAnalysis[];
}

export interface LLMAnalysis {
  model: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  targetPrice?: number;
  stopLoss?: number;
  timestamp: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  requiresEmailVerification?: boolean;
  userId?: string;
}

// OTP-related interfaces
export interface OTPResult {
  success: boolean;
  message: string;
  canResend?: boolean;
  nextResendTime?: Date;
}

export interface OTPStatus {
  hasActiveOTP: boolean;
  expiresAt?: Date;
  attemptsRemaining?: number;
  canResend: boolean;
  nextResendTime?: Date;
}

export interface OTPVerificationData {
  userId: string;
  otpCode: string;
  purpose?: 'registration' | 'login' | '2fa' | 'password-reset';
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

// MT4-related interfaces
export interface MT4Position {
  ticket: number;
  symbol: string;
  type: number; // 0 = BUY, 1 = SELL
  side: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  openTime: string;
}

export interface MT4AccountInfo {
  account: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  leverage: number;
  profit: number;
  credit: number;
}

export interface MT4BridgeStatus {
  connected: boolean;
  status?: string;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface MT4Price {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  timestamp: string;
}