import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { apiKeyService } from '../services/apiKeyService';
import ApiUsage from '../models/ApiUsage';
import { ApiResponse } from '../types';
import mongoose from 'mongoose';

/**
 * Generate a new API key for the user
 */
export const generateApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, tier = 'free', expiresInDays, allowedIPs } = req.body;
    const userId = (req.user._id as any).toString();

    if (!name || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'API key name is required'
      } as ApiResponse);
      return;
    }

    if (!['free', 'starter', 'pro', 'enterprise'].includes(tier)) {
      res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be: free, starter, pro, or enterprise'
      } as ApiResponse);
      return;
    }

    const result = await apiKeyService.generateApiKey({
      userId,
      name: name.trim(),
      tier,
      expiresInDays,
      allowedIPs: allowedIPs || []
    });

    if (result.success) {
      res.json({
        success: true,
        data: {
          apiKey: result.apiKey,  // Full key shown ONCE
          keyPrefix: result.keyPrefix,
          keyId: result.keyId,
          tier,
          warning: 'Store this API key securely. It will not be shown again.'
        },
        message: result.message
      } as ApiResponse);
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      } as ApiResponse);
    }

  } catch (error) {
    console.error('Error generating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate API key'
    } as ApiResponse);
  }
};

/**
 * Get all API keys for the user
 */
export const getUserApiKeys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = (req.user._id as any).toString();
    const apiKeys = await apiKeyService.getUserApiKeys(userId);

    res.json({
      success: true,
      data: apiKeys,
      total: apiKeys.length
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch API keys'
    } as ApiResponse);
  }
};

/**
 * Revoke an API key
 */
export const revokeApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { keyId } = req.params;
    const userId = (req.user._id as any).toString();

    const result = await apiKeyService.revokeApiKey(keyId, userId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      } as ApiResponse);
    } else {
      res.status(404).json({
        success: false,
        error: result.message
      } as ApiResponse);
    }

  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key'
    } as ApiResponse);
  }
};

/**
 * Rotate an API key (generate new, revoke old)
 */
export const rotateApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { keyId } = req.params;
    const userId = (req.user._id as any).toString();

    const result = await apiKeyService.rotateApiKey(keyId, userId);

    if (result.success) {
      res.json({
        success: true,
        data: {
          apiKey: result.apiKey,
          keyPrefix: result.keyPrefix,
          keyId: result.keyId,
          warning: 'Store this API key securely. The old key has been revoked.'
        },
        message: result.message
      } as ApiResponse);
    } else {
      res.status(404).json({
        success: false,
        error: result.message
      } as ApiResponse);
    }

  } catch (error) {
    console.error('Error rotating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rotate API key'
    } as ApiResponse);
  }
};

/**
 * Get API key usage analytics
 */
export const getApiKeyUsage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { keyId } = req.params;
    const userId = (req.user._id as any).toString();
    const { from, to } = req.query;

    // Verify ownership
    const apiKeys = await apiKeyService.getUserApiKeys(userId);
    const apiKey = apiKeys.find(k => k.id.toString() === keyId);

    if (!apiKey) {
      res.status(404).json({
        success: false,
        error: 'API key not found'
      } as ApiResponse);
      return;
    }

    // Build date range query
    const dateQuery: any = { apiKeyId: new mongoose.Types.ObjectId(keyId) };

    if (from || to) {
      dateQuery.timestamp = {};
      if (from) dateQuery.timestamp.$gte = new Date(from as string);
      if (to) dateQuery.timestamp.$lte = new Date(to as string);
    }

    // Get usage statistics
    const [
      requestsToday,
      requestsThisMonth,
      topEndpoints,
      errorCount,
      avgResponseTime
    ] = await Promise.all([
      // Requests today
      ApiUsage.countDocuments({
        apiKeyId: new mongoose.Types.ObjectId(keyId),
        timestamp: { $gte: new Date(new Date().toDateString()) }
      }),

      // Requests this month
      ApiUsage.countDocuments({
        apiKeyId: new mongoose.Types.ObjectId(keyId),
        timestamp: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }),

      // Top endpoints
      ApiUsage.aggregate([
        { $match: dateQuery },
        { $group: { _id: '$endpoint', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),

      // Error count
      ApiUsage.countDocuments({
        ...dateQuery,
        statusCode: { $gte: 400 }
      }),

      // Average response time
      ApiUsage.aggregate([
        { $match: dateQuery },
        { $group: { _id: null, avg: { $avg: '$responseTime' } } }
      ])
    ]);

    const totalRequests = await ApiUsage.countDocuments(dateQuery);
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) : 0;

    res.json({
      success: true,
      data: {
        keyId,
        keyPrefix: apiKey.keyPrefix,
        tier: apiKey.tier,
        requestsToday,
        requestsThisMonth,
        quotaUsage: apiKey.requestsPerDay > 0
          ? requestsToday / apiKey.requestsPerDay
          : 0,
        requestsPerDay: apiKey.requestsPerDay,
        remaining: apiKey.requestsPerDay > 0
          ? apiKey.requestsPerDay - requestsToday
          : -1,
        topEndpoints: topEndpoints.map(e => ({
          endpoint: e._id,
          count: e.count
        })),
        errorRate: parseFloat((errorRate * 100).toFixed(2)),
        avgResponseTime: avgResponseTime[0]?.avg ? Math.round(avgResponseTime[0].avg) : 0
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching API key usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage statistics'
    } as ApiResponse);
  }
};
