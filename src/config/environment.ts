import dotenv from 'dotenv';
import { WeexV6Config } from '../types/weex';

dotenv.config();

interface Config {
  MONGODB_URI: string;
  REDIS_URL: string;
  REDIS_PASSWORD: string;
  REDIS_DB: number;
  REDIS_TIMEOUT: number;
  REDIS_RETRY_ATTEMPTS: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  ENCRYPTION_KEY: string;
  BINANCE_API_KEY: string;
  BINANCE_API_SECRET: string;
  TOGETHER_AI_API_KEY: string;
  MT4_BRIDGE_URL: string;
  // WEEX API
  WEEX_API_KEY: string;
  WEEX_SECRET_KEY: string;
  WEEX_PASSPHRASE: string;
  PORT: number;
  NODE_ENV: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  RATE_LIMIT_BLOCK_DURATION: number;
  AI_ANALYSIS_RATE_LIMIT: number;
  MARKET_DATA_RATE_LIMIT: number;
  AUTH_RATE_LIMIT: number;
  DEVELOPMENT_RATE_LIMIT_MULTIPLIER: number;
  FRONTEND_URL?: string;
  EMAIL_HOST: string;
  EMAIL_PORT: number;
  EMAIL_SECURE: boolean;
  EMAIL_USER: string;
  EMAIL_PASS: string;
  AI_ANALYSIS_TIMEOUT: number;
  MARKET_DATA_TIMEOUT: number;
  BULK_ANALYSIS_TIMEOUT: number;
  SERVER_TIMEOUT: number;
}

const requiredEnvVars = [
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'TOGETHER_AI_API_KEY',
  'EMAIL_HOST',
  'EMAIL_USER',
  'EMAIL_PASS'
];

const validateEnvironment = (): void => {
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

validateEnvironment();

export const config: Config = {
  MONGODB_URI: process.env.MONGODB_URI!,
  REDIS_URL: process.env.REDIS_URL!,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),
  REDIS_TIMEOUT: parseInt(process.env.REDIS_TIMEOUT || '5000', 10),
  REDIS_RETRY_ATTEMPTS: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3', 10),
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,
  BINANCE_API_KEY: process.env.BINANCE_API_KEY || '',
  BINANCE_API_SECRET: process.env.BINANCE_API_SECRET || '',
  TOGETHER_AI_API_KEY: process.env.TOGETHER_AI_API_KEY!,
  MT4_BRIDGE_URL: process.env.MT4_BRIDGE_URL || 'http://localhost:8080',
  // WEEX API
  WEEX_API_KEY: process.env.WEEX_API_KEY || '',
  WEEX_SECRET_KEY: process.env.WEEX_SECRET_KEY || '',
  WEEX_PASSPHRASE: process.env.WEEX_PASSPHRASE || '',
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute default
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300', 10), // 300 requests per minute
  RATE_LIMIT_BLOCK_DURATION: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION || '30', 10), // 30 seconds block
  AI_ANALYSIS_RATE_LIMIT: parseInt(process.env.AI_ANALYSIS_RATE_LIMIT || '20', 10), // 20 per minute
  MARKET_DATA_RATE_LIMIT: parseInt(process.env.MARKET_DATA_RATE_LIMIT || '60', 10), // 60 per minute
  AUTH_RATE_LIMIT: parseInt(process.env.AUTH_RATE_LIMIT || '5', 10), // 5 per 5 minutes
  DEVELOPMENT_RATE_LIMIT_MULTIPLIER: parseInt(process.env.DEVELOPMENT_RATE_LIMIT_MULTIPLIER || '10', 10), // 10x higher in dev
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  EMAIL_HOST: process.env.EMAIL_HOST!,
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT || '465', 10),
  EMAIL_SECURE: process.env.EMAIL_SECURE === 'true',
  EMAIL_USER: process.env.EMAIL_USER!,
  EMAIL_PASS: process.env.EMAIL_PASS!,
  AI_ANALYSIS_TIMEOUT: parseInt(process.env.AI_ANALYSIS_TIMEOUT || '120000', 10),
  MARKET_DATA_TIMEOUT: parseInt(process.env.MARKET_DATA_TIMEOUT || '30000', 10),
  BULK_ANALYSIS_TIMEOUT: parseInt(process.env.BULK_ANALYSIS_TIMEOUT || '300000', 10),
  SERVER_TIMEOUT: parseInt(process.env.SERVER_TIMEOUT || '600000', 10)
};

// ============================================================================
// V6 SCALPING MODE CONFIGURATION (Environment Variable Overrides)
// ============================================================================
// Default values are for SCALPING mode. Set V6_MODE=SWING to use swing defaults.

export type V6Mode = 'SCALPING' | 'SWING';

const v6Mode = (process.env.V6_MODE || 'SCALPING') as V6Mode;

// Default values based on mode
const V6_DEFAULTS = {
  SCALPING: {
    ANALYSIS_INTERVAL_MINUTES: 15,
    ZONE_CHECK_SECONDS: 30,
    MAX_ENTRY_DISTANCE_PCT: 0.30,  // SCALPING: Entries must be NEAR current price ($279 at $93k) for immediate execution
    MIN_RISK_REWARD: 1.2,          // LOWERED: Allow more setups to pass - was 1.3
    STOP_LOSS_PCT: 0.35,           // WIDENED: Avoid wick stop-outs ($326 at $93k) - was 0.30
    MAX_STOP_LOSS_PCT: 0.50,       // WIDENED: More room for volatility - was 0.40
    TAKE_PROFIT_1_PCT: 0.80,       // DOUBLED: $20 profit covers $6 fees = $14 NET - was 0.40
    TAKE_PROFIT_2_PCT: 1.20,       // DOUBLED: $30 profit covers $6 fees = $24 NET - was 0.60
    MAX_TRADES_PER_DAY: 50,
    SETUP_EXPIRY_HOURS: 0.5,  // SCALPING: Setups expire in 30 min - no waiting for distant levels
    REQUIRE_PATTERN_CONFIRM: false,
    MIN_ZONE_WIDTH_PCT: 0.05,      // TIGHTER: More precise entries - was 0.08
    MAX_ZONE_WIDTH_PCT: 0.30,      // WIDER: Handle volatility - was 0.20
    DUPLICATE_THRESHOLD_PCT: 0.20, // WIDER: Reduce duplicate rejections - was 0.15
  },
  SWING: {
    ANALYSIS_INTERVAL_MINUTES: 30,
    ZONE_CHECK_SECONDS: 60,
    MAX_ENTRY_DISTANCE_PCT: 0.50,
    MIN_RISK_REWARD: 1.4,
    STOP_LOSS_PCT: 0.30,
    MAX_STOP_LOSS_PCT: 0.50,
    TAKE_PROFIT_1_PCT: 0.50,
    TAKE_PROFIT_2_PCT: 1.00,
    MAX_TRADES_PER_DAY: 50,
    SETUP_EXPIRY_HOURS: 6,
    REQUIRE_PATTERN_CONFIRM: true,
    MIN_ZONE_WIDTH_PCT: 0.10,
    MAX_ZONE_WIDTH_PCT: 0.50,
    DUPLICATE_THRESHOLD_PCT: 0.30,
  },
} as const;

const defaults = V6_DEFAULTS[v6Mode];

export const V6_ENV_CONFIG = {
  // Mode
  MODE: v6Mode,

  // Timing
  ANALYSIS_INTERVAL_MINUTES: parseInt(process.env.V6_ANALYSIS_INTERVAL_MINUTES || String(defaults.ANALYSIS_INTERVAL_MINUTES)),
  ZONE_CHECK_SECONDS: parseInt(process.env.V6_ZONE_CHECK_SECONDS || String(defaults.ZONE_CHECK_SECONDS)),

  // Entry distance
  MAX_ENTRY_DISTANCE_PCT: parseFloat(process.env.V6_MAX_ENTRY_DISTANCE || String(defaults.MAX_ENTRY_DISTANCE_PCT)),

  // Risk/Reward
  MIN_RISK_REWARD: parseFloat(process.env.V6_MIN_RISK_REWARD || String(defaults.MIN_RISK_REWARD)),

  // Stop Loss
  STOP_LOSS_PCT: parseFloat(process.env.V6_STOP_LOSS_PCT || String(defaults.STOP_LOSS_PCT)),
  MAX_STOP_LOSS_PCT: parseFloat(process.env.V6_MAX_STOP_LOSS_PCT || String(defaults.MAX_STOP_LOSS_PCT)),

  // Take Profit
  TAKE_PROFIT_1_PCT: parseFloat(process.env.V6_TAKE_PROFIT_1_PCT || String(defaults.TAKE_PROFIT_1_PCT)),
  TAKE_PROFIT_2_PCT: parseFloat(process.env.V6_TAKE_PROFIT_2_PCT || String(defaults.TAKE_PROFIT_2_PCT)),

  // Limits
  MAX_TRADES_PER_DAY: parseInt(process.env.V6_MAX_TRADES_PER_DAY || String(defaults.MAX_TRADES_PER_DAY)),
  SETUP_EXPIRY_HOURS: parseInt(process.env.V6_SETUP_EXPIRY_HOURS || String(defaults.SETUP_EXPIRY_HOURS)),

  // Pattern confirmation (false = instant execution in scalping mode)
  REQUIRE_PATTERN_CONFIRM: process.env.V6_REQUIRE_PATTERN_CONFIRM === 'true' ? true :
                           process.env.V6_REQUIRE_PATTERN_CONFIRM === 'false' ? false :
                           defaults.REQUIRE_PATTERN_CONFIRM,

  // Zone width
  MIN_ZONE_WIDTH_PCT: parseFloat(process.env.V6_MIN_ZONE_WIDTH_PCT || String(defaults.MIN_ZONE_WIDTH_PCT)),
  MAX_ZONE_WIDTH_PCT: parseFloat(process.env.V6_MAX_ZONE_WIDTH_PCT || String(defaults.MAX_ZONE_WIDTH_PCT)),

  // Duplicate prevention
  DUPLICATE_THRESHOLD_PCT: parseFloat(process.env.V6_DUPLICATE_THRESHOLD_PCT || String(defaults.DUPLICATE_THRESHOLD_PCT)),
} as const;

// ============================================================================
// WEEX V6 MULTI-COIN TRADING PAIR CONFIGURATION
// ============================================================================

export interface TradingPairConfig {
  weexSymbol: string;          // e.g., 'cmt_btcusdt'
  binanceSymbol: string;       // e.g., 'BTCUSDT'
  positionSize: number;        // Size in base currency (0.05 BTC, 1.5 ETH, etc.)
  minTpPercent: number;        // Minimum TP distance %
  minSlPercent: number;        // Minimum SL distance %
  tickSize: number;            // Price tick size for rounding
}

export const TRADING_PAIRS: TradingPairConfig[] = [
  {
    weexSymbol: 'cmt_btcusdt',
    binanceSymbol: 'BTCUSDT',
    positionSize: 0.05,      // 0.05 BTC (~$5,000 at $100k)
    minTpPercent: 0.35,      // SMALL TP: 0.35% for frequent wins at 20x leverage
    minSlPercent: 0.25,      // TIGHT SL: 0.25% min SL
    tickSize: 0.1,           // BTC price tick
  },
  {
    weexSymbol: 'cmt_ethusdt',
    binanceSymbol: 'ETHUSDT',
    positionSize: 1.5,       // 1.5 ETH (~$5,000 at $3,300)
    minTpPercent: 0.40,      // SMALL TP: 0.40% for frequent wins
    minSlPercent: 0.30,      // TIGHT SL: 0.30% min SL
    tickSize: 0.01,          // ETH price tick
  },
  {
    weexSymbol: 'cmt_solusdt',
    binanceSymbol: 'SOLUSDT',
    positionSize: 25,        // 25 SOL (~$5,000 at $200)
    minTpPercent: 0.45,      // SMALL TP: 0.45% for frequent wins
    minSlPercent: 0.35,      // TIGHT SL: 0.35% min SL
    tickSize: 0.01,          // SOL price tick
  },
  {
    weexSymbol: 'cmt_dogeusdt',
    binanceSymbol: 'DOGEUSDT',
    positionSize: 15000,     // 15000 DOGE (~$5,000 at $0.33)
    minTpPercent: 0.50,      // SMALL TP: 0.50% for frequent wins
    minSlPercent: 0.40,      // TIGHT SL: 0.40% min SL
    tickSize: 0.00001,       // DOGE price tick
  },
];

// Position limits for multi-coin trading
export const MAX_POSITIONS_PER_COIN = 1;
export const MAX_TOTAL_POSITIONS = 3;

/**
 * Get trading pair config by symbol
 */
export function getTradingPairConfig(binanceSymbol: string): TradingPairConfig | undefined {
  return TRADING_PAIRS.find(p => p.binanceSymbol === binanceSymbol);
}

/**
 * Get trading pair config by WEEX symbol
 */
export function getTradingPairByWeexSymbol(weexSymbol: string): TradingPairConfig | undefined {
  return TRADING_PAIRS.find(p => p.weexSymbol === weexSymbol);
}

// ============================================================================
// WEEX V6 CONFIGURATION (DEFAULT - BTC, backwards compatible)
// ============================================================================

export const WEEX_V6_CONFIG: WeexV6Config = {
  // Trading pair (default for single-coin mode / backwards compatibility)
  SYMBOL: process.env.WEEX_SYMBOL || 'cmt_btcusdt',
  BINANCE_SYMBOL: process.env.WEEX_BINANCE_SYMBOL || 'BTCUSDT',

  // Position sizing - REDUCED SIZE for smaller risk
  LEVERAGE: parseInt(process.env.WEEX_LEVERAGE || '5', 10),
  BASE_POSITION_SIZE_USD: parseFloat(process.env.WEEX_POSITION_SIZE_USD || '2500'),
  MIN_POSITION_SIZE_BTC: parseFloat(process.env.WEEX_MIN_POSITION_SIZE_BTC || '0.05'),  // REDUCED from 0.09

  // Grade multipliers (matching V6 setup config)
  GRADE_A_MULTIPLIER: parseFloat(process.env.WEEX_GRADE_A_MULT || '1.0'),
  GRADE_B_MULTIPLIER: parseFloat(process.env.WEEX_GRADE_B_MULT || '0.75'),
  GRADE_C_MULTIPLIER: parseFloat(process.env.WEEX_GRADE_C_MULT || '0.5'),

  // Position monitoring
  POSITION_MONITOR_INTERVAL_MS: parseInt(process.env.WEEX_MONITOR_INTERVAL_MS || '15000', 10),
  MAX_POSITION_DURATION_MINUTES: parseInt(process.env.WEEX_MAX_POSITION_MINUTES || '60', 10),

  // Exit management - SIMPLIFIED (breakeven/trailing REMOVED to reduce fees)
  // These config values kept for backwards compatibility but NOT used
  BREAKEVEN_TRIGGER_PCT: parseFloat(process.env.WEEX_BREAKEVEN_PCT || '0.50'),
  TRAILING_TRIGGER_PCT: parseFloat(process.env.WEEX_TRAILING_PCT || '0.70'),
  TRAILING_DISTANCE_PCT: parseFloat(process.env.WEEX_TRAIL_DISTANCE_PCT || '0.30'),

  // Profit pullback protection - DISABLED to reduce fees
  PROFIT_PULLBACK_PCT: parseFloat(process.env.WEEX_PROFIT_PULLBACK_PCT || '0.50'),
  MIN_PEAK_PROFIT_USD: parseFloat(process.env.WEEX_MIN_PEAK_PROFIT_USD || '5'),

  // Risk management - Updated for multi-coin
  MAX_CONCURRENT_POSITIONS: parseInt(process.env.WEEX_MAX_POSITIONS || '3', 10),  // Increased for multi-coin
  MAX_DAILY_LOSS_USD: parseFloat(process.env.WEEX_MAX_DAILY_LOSS_USD || '200'),
  COOLDOWN_AFTER_LOSS_MINUTES: parseInt(process.env.WEEX_COOLDOWN_MINUTES || '30', 10),

  // Profit prediction filter
  PROFIT_PREDICTION: {
    MIN_PROFIT_THRESHOLD_USD: parseFloat(process.env.WEEX_MIN_PROFIT_USD || '30'),
    LEVERAGE: parseInt(process.env.WEEX_PROFIT_LEVERAGE || '20', 10),  // User's actual leverage on WEEX
  },
};