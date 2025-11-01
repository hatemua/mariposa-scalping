import { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../services/apiKeyService';
import { isEndpointAllowed } from '../config/apiTiers';
import ApiUsage from '../models/ApiUsage';
import { ApiResponse } from '../types';

export interface ApiKeyRequest extends Request {
  apiKey?: any;
  apiKeyUser?: any;
}

/**
 * Middleware to authenticate API key and enforce rate limits
 */
export const authenticateApiKey = async (
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const startTime = Date.now();

  try {
    // Extract API key from headers
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;

    let apiKey: string | undefined;

    // Check Authorization: Bearer mk_live_xxx
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    }
    // Check X-API-Key: mk_live_xxx
    else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required. Provide via Authorization: Bearer <key> or X-API-Key: <key>'
      } as ApiResponse);
      return;
    }

    // Validate API key
    const validatedKey = await apiKeyService.validateAndGetApiKey(apiKey);
    if (!validatedKey) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired API key'
      } as ApiResponse);
      return;
    }

    // Check if endpoint is allowed for this tier
    const endpoint = req.path;
    const isAllowed = isEndpointAllowed(validatedKey.tier, endpoint);
    if (!isAllowed) {
      res.status(403).json({
        success: false,
        error: `This endpoint is not available for your tier (${validatedKey.tier}). Upgrade to access this feature.`
      } as ApiResponse);
      return;
    }

    // Check IP whitelist (if configured)
    if (validatedKey.allowedIPs && validatedKey.allowedIPs.length > 0) {
      const clientIP = req.ip || req.socket.remoteAddress || '';
      if (!validatedKey.allowedIPs.includes(clientIP)) {
        res.status(403).json({
          success: false,
          error: 'IP address not whitelisted for this API key'
        } as ApiResponse);
        return;
      }
    }

    // Check rate limits
    const rateLimitCheck = await apiKeyService.checkRateLimits(validatedKey);
    if (!rateLimitCheck.allowed) {
      res.status(429).json({
        success: false,
        error: rateLimitCheck.reason,
        resetAt: rateLimitCheck.resetAt
      } as ApiResponse);
      return;
    }

    // Increment usage counters
    await apiKeyService.incrementUsage((validatedKey._id as any).toString());

    // Attach API key and user to request
    req.apiKey = validatedKey;
    req.apiKeyUser = { _id: validatedKey.userId };

    // Add rate limit headers to response
    const remaining = rateLimitCheck.remaining !== undefined ? rateLimitCheck.remaining : -1;
    res.setHeader('X-RateLimit-Limit', validatedKey.requestsPerDay);
    res.setHeader('X-RateLimit-Remaining', remaining >= 0 ? remaining : 'unlimited');

    if (validatedKey.lastResetDate) {
      const resetAt = new Date(validatedKey.lastResetDate);
      resetAt.setDate(resetAt.getDate() + 1);
      resetAt.setHours(0, 0, 0, 0);
      res.setHeader('X-RateLimit-Reset', Math.floor(resetAt.getTime() / 1000));
    }

    // Track usage (async, don't wait)
    trackApiUsage(req, res, validatedKey, startTime).catch(err =>
      console.error('Error tracking API usage:', err)
    );

    next();

  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error'
    } as ApiResponse);
  }
};

/**
 * Track API usage for analytics
 */
async function trackApiUsage(
  req: ApiKeyRequest,
  res: Response,
  apiKey: any,
  startTime: number
): Promise<void> {
  // Wait for response to finish to get status code
  res.on('finish', async () => {
    try {
      const responseTime = Date.now() - startTime;

      await ApiUsage.create({
        apiKeyId: apiKey._id,
        userId: apiKey.userId,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.socket.remoteAddress || null,
        errorMessage: res.statusCode >= 400 ? res.statusMessage : null,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error saving API usage:', error);
    }
  });
}

/**
 * Optional middleware: Require specific tier
 */
export const requireTier = (minimumTier: 'free' | 'starter' | 'pro' | 'enterprise') => {
  const tierHierarchy = { free: 0, starter: 1, pro: 2, enterprise: 3 };

  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required'
      } as ApiResponse);
      return;
    }

    const userTierLevel = tierHierarchy[req.apiKey.tier as keyof typeof tierHierarchy] || 0;
    const requiredTierLevel = tierHierarchy[minimumTier];

    if (userTierLevel < requiredTierLevel) {
      res.status(403).json({
        success: false,
        error: `This endpoint requires ${minimumTier} tier or higher. Current tier: ${req.apiKey.tier}`
      } as ApiResponse);
      return;
    }

    next();
  };
};
