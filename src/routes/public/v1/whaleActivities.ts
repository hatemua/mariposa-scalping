import express, { Response } from 'express';
import { authenticateApiKey, ApiKeyRequest, requireTier } from '../../../middleware/apiKeyAuth';
import WhaleActivityModel from '../../../models/WhaleActivity';
import { ApiResponse } from '../../../types';

const router = express.Router();

// All routes require API key authentication (Starter+)
router.use(authenticateApiKey);
router.use(requireTier('starter'));

/**
 * @route GET /api/v1/whale-activities
 * @desc Get whale activities with filters
 * @access API Key (Starter+)
 */
router.get('/', async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const {
      limit = '20',
      type,
      side,
      minValue,
      impact,
      status = 'ACTIVE',
      sortBy = 'detectedAt',
      order = 'desc'
    } = req.query;

    // Build query
    const query: any = {
      status: status === 'ALL' ? { $in: ['ACTIVE', 'EXPIRED', 'EXECUTED'] } : status
    };

    if (type) {
      query.type = type;
    }

    if (side) {
      query.side = side;
    }

    if (minValue) {
      query.value = { $gte: parseFloat(minValue as string) };
    }

    if (impact) {
      query.impact = impact;
    }

    // Parse limit (max 100)
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    // Get total count
    const total = await WhaleActivityModel.countDocuments(query);

    // Execute query with sorting
    const whaleActivities = await WhaleActivityModel
      .find(query)
      .sort({ [sortBy as string]: order === 'desc' ? -1 : 1 })
      .limit(limitNum)
      .lean();

    const formattedActivities = whaleActivities.map(activity => ({
      id: activity._id,
      symbol: activity.symbol,
      type: activity.type,
      side: activity.side,
      size: activity.size,
      value: activity.value,
      impact: activity.impact,
      confidence: activity.confidence,
      volumeSpike: activity.volumeSpike,
      description: activity.description,
      llmInsights: activity.llmInsights,
      status: activity.status,
      detectedAt: activity.detectedAt,
      expiresAt: activity.expiresAt,
      createdAt: activity.createdAt
    }));

    res.json({
      success: true,
      data: formattedActivities,
      pagination: {
        total,
        returned: formattedActivities.length,
        limit: limitNum
      },
      meta: {
        tier: req.apiKey?.tier,
        timestamp: new Date()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching whale activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch whale activities'
    } as ApiResponse);
  }
});

/**
 * @route GET /api/v1/whale-activities/:symbol
 * @desc Get whale activities for a specific symbol
 * @access API Key (Starter+)
 */
router.get('/:symbol', async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { symbol } = req.params;
    const { limit = '20', status = 'ACTIVE' } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    const whaleActivities = await WhaleActivityModel
      .find({
        symbol: symbol.toUpperCase(),
        status: status === 'ALL' ? { $in: ['ACTIVE', 'EXPIRED', 'EXECUTED'] } : status
      })
      .sort({ detectedAt: -1 })
      .limit(limitNum)
      .lean();

    const formattedActivities = whaleActivities.map(activity => ({
      id: activity._id,
      symbol: activity.symbol,
      type: activity.type,
      side: activity.side,
      size: activity.size,
      value: activity.value,
      impact: activity.impact,
      confidence: activity.confidence,
      volumeSpike: activity.volumeSpike,
      description: activity.description,
      llmInsights: activity.llmInsights,
      status: activity.status,
      detectedAt: activity.detectedAt,
      expiresAt: activity.expiresAt
    }));

    res.json({
      success: true,
      data: formattedActivities,
      meta: {
        symbol: symbol.toUpperCase(),
        tier: req.apiKey?.tier,
        timestamp: new Date()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching whale activities by symbol:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch whale activities'
    } as ApiResponse);
  }
});

export default router;
