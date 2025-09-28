import dotenv from 'dotenv';

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
  PORT: number;
  NODE_ENV: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
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
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
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