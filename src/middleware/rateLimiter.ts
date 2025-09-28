import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { config } from '../config/environment';
import { redis } from '../config/redis';
import { redisService } from '../services/redisService';
import { ApiResponse } from '../types';
import { AuthRequest } from './auth';

// Create Redis-based rate limiter
let rateLimiter: RateLimiterRedis;

const initializeRateLimiter = () => {
  try {
    if (redis.connected) {
      // Apply development multiplier if in development mode
      const isDevelopment = config.NODE_ENV === 'development';
      const multiplier = isDevelopment ? config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER : 1;

      rateLimiter = new RateLimiterRedis({
        storeClient: redis.getClient(),
        keyPrefix: 'rl:',
        points: config.RATE_LIMIT_MAX_REQUESTS * multiplier,
        duration: config.RATE_LIMIT_WINDOW_MS / 1000,
        blockDuration: config.RATE_LIMIT_BLOCK_DURATION,
        execEvenly: true, // Spread requests evenly across the duration
      });

      console.log(`📊 Rate limiter initialized: ${config.RATE_LIMIT_MAX_REQUESTS * multiplier} requests per ${config.RATE_LIMIT_WINDOW_MS / 1000}s window${isDevelopment ? ' (Development Mode)' : ''}`);
    }
  } catch (error) {
    console.error('Failed to initialize Redis rate limiter:', error);
  }
};

// Initialize when Redis is ready
setTimeout(initializeRateLimiter, 2000);

export const rateLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Skip rate limiting in development if configured
    if (config.NODE_ENV === 'development' && config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER >= 100) {
      next();
      return;
    }

    // Create identifier - prefer user ID for authenticated requests, fallback to IP
    const authReq = req as AuthRequest;
    const userId = authReq.user?._id?.toString();
    const identifier = userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`;

    // Apply development multiplier
    const isDevelopment = config.NODE_ENV === 'development';
    const multiplier = isDevelopment ? config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER : 1;
    const effectiveLimit = config.RATE_LIMIT_MAX_REQUESTS * multiplier;

    // Use Redis rate limiter if available, otherwise use Redis service directly
    if (rateLimiter) {
      try {
        await rateLimiter.consume(identifier);
        next();
      } catch (rejRes: any) {
        const remainingTime = Math.round(rejRes.msBeforeNext / 1000) || config.RATE_LIMIT_BLOCK_DURATION;
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Try again in ${remainingTime} seconds.`,
          retryAfter: remainingTime,
          limit: effectiveLimit,
          window: config.RATE_LIMIT_WINDOW_MS / 1000
        } as ApiResponse);
      }
    } else {
      // Fallback to direct Redis service usage
      const rateCheck = await redisService.checkRateLimit(
        identifier,
        effectiveLimit,
        Math.floor(config.RATE_LIMIT_WINDOW_MS / 1000)
      );

      if (rateCheck.allowed) {
        next();
      } else {
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: `Rate limit exceeded. ${rateCheck.remaining} requests remaining.`,
          remaining: rateCheck.remaining,
          limit: effectiveLimit,
          window: config.RATE_LIMIT_WINDOW_MS / 1000
        } as ApiResponse);
      }
    }
  } catch (error) {
    console.error('Rate limiting error:', error);
    // In case of error, allow the request to proceed to avoid blocking
    next();
  }
};

// Enhanced rate limiters for specific endpoints
export const createCustomRateLimiter = (options: {
  points: number;
  duration: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  const customRateLimiter = rateLimiter ? new RateLimiterRedis({
    storeClient: redis.connected ? redis.getClient() : undefined,
    keyPrefix: 'rl:custom:',
    points: options.points,
    duration: options.duration,
    blockDuration: options.duration,
  }) : null;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = options.keyGenerator ? options.keyGenerator(req) : (req.ip || 'unknown');

      if (customRateLimiter) {
        try {
          await customRateLimiter.consume(identifier);
          next();
        } catch (rejRes: any) {
          const remainingTime = Math.round(rejRes.msBeforeNext / 1000) || options.duration;
          res.status(429).json({
            success: false,
            error: 'Rate limit exceeded for this endpoint',
            message: `Too many requests. Try again in ${remainingTime} seconds.`,
            retryAfter: remainingTime
          } as ApiResponse);
        }
      } else {
        // Fallback using Redis service
        const rateCheck = await redisService.checkRateLimit(
          identifier,
          options.points,
          options.duration
        );

        if (rateCheck.allowed) {
          next();
        } else {
          res.status(429).json({
            success: false,
            error: 'Rate limit exceeded for this endpoint',
            message: `Too many requests. ${rateCheck.remaining} requests remaining.`,
            remaining: rateCheck.remaining
          } as ApiResponse);
        }
      }
    } catch (error) {
      console.error('Custom rate limiting error:', error);
      next();
    }
  };
};

// Specific rate limiters for different endpoints
export const authRateLimiter = createCustomRateLimiter({
  points: config.AUTH_RATE_LIMIT, // 5 attempts by default
  duration: 300, // Per 5 minutes
  keyGenerator: (req) => `auth:${req.ip}`,
  skipSuccessfulRequests: true
});

export const aiAnalysisRateLimiter = createCustomRateLimiter({
  points: config.AI_ANALYSIS_RATE_LIMIT * (config.NODE_ENV === 'development' ? config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER : 1),
  duration: 60, // Per minute
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user?._id?.toString();
    return userId ? `ai_analysis:${userId}` : `ai_analysis:${req.ip || 'unknown'}`;
  },
  skipFailedRequests: true
});

export const marketDataRateLimiter = createCustomRateLimiter({
  points: config.MARKET_DATA_RATE_LIMIT * (config.NODE_ENV === 'development' ? config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER : 1),
  duration: 60, // Per minute
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user?._id?.toString();
    return userId ? `market_data:${userId}` : `market_data:${req.ip || 'unknown'}`;
  },
  skipFailedRequests: true
});

export const tradingRateLimiter = createCustomRateLimiter({
  points: 20 * (config.NODE_ENV === 'development' ? config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER : 1), // 20 trades per minute
  duration: 60, // Per minute
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user?._id?.toString();
    return userId ? `trading:${userId}` : `trading:${req.ip || 'unknown'}`;
  }
});

// Professional Trading Suite specific rate limiters
export const professionalSignalsRateLimiter = createCustomRateLimiter({
  points: 15 * (config.NODE_ENV === 'development' ? config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER : 1), // 15 requests per minute
  duration: 60,
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user?._id?.toString();
    return userId ? `pro_signals:${userId}` : `pro_signals:${req.ip || 'unknown'}`;
  }
});

export const bulkAnalysisRateLimiter = createCustomRateLimiter({
  points: 5 * (config.NODE_ENV === 'development' ? config.DEVELOPMENT_RATE_LIMIT_MULTIPLIER : 1), // 5 requests per minute
  duration: 60,
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user?._id?.toString();
    return userId ? `bulk_analysis:${userId}` : `bulk_analysis:${req.ip || 'unknown'}`;
  }
});

export const websocketRateLimiter = createCustomRateLimiter({
  points: 100, // 100 connections
  duration: 3600, // Per hour
  keyGenerator: (req) => `ws:${req.ip}`
});

// User-specific rate limiting
export const createUserRateLimiter = (points: number, duration: number) => {
  return createCustomRateLimiter({
    points,
    duration,
    keyGenerator: (req) => {
      const authReq = req as AuthRequest;
      const userId = authReq.user?._id?.toString();
      return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`;
    }
  });
};

// Rate limiting with Redis Lua scripts for atomic operations
export const atomicRateLimiter = async (
  identifier: string,
  limit: number,
  window: number,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const windowStart = now - (window * 1000);

    // Use Redis Lua script for atomic operation
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])

      redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window * 1000)
      local current = redis.call('ZCARD', key)

      if current < limit then
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, window)
        return {1, limit - current - 1}
      else
        return {0, 0}
      end
    `;

    const client = redis.getClient();
    const result = await client.eval(luaScript, 1, key, now.toString(), window.toString(), limit.toString()) as number[];

    if (result[0] === 1) {
      // Request allowed
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', result[1]);
      res.setHeader('X-RateLimit-Reset', Math.ceil(now / 1000) + window);
      next();
    } else {
      // Request blocked
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Window resets in ${window} seconds.`,
        retryAfter: window
      } as ApiResponse);
    }
  } catch (error) {
    console.error('Atomic rate limiting error:', error);
    next(); // Allow request on error
  }
};