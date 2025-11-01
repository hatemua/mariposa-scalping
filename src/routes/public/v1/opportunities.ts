import express, { Response } from 'express';
import { authenticateApiKey, ApiKeyRequest, requireTier } from '../../../middleware/apiKeyAuth';
import OpportunityModel from '../../../models/Opportunity';
import { ApiResponse } from '../../../types';

const router = express.Router();

// All routes require API key authentication
router.use(authenticateApiKey);

/**
 * @route GET /api/v1/opportunities
 * @desc Get trading opportunities with filters
 * @access API Key (Free+)
 */
router.get('/', async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const {
      limit = '20',
      category,
      minConfidence,
      minScore,
      riskLevel,
      status = 'ACTIVE',
      sortBy = 'score',
      order = 'desc'
    } = req.query;

    // Build query
    const query: any = {
      status: status === 'ALL' ? { $in: ['ACTIVE', 'EXPIRED', 'COMPLETED'] } : status
    };

    if (category) {
      query.category = category;
    }

    if (minConfidence) {
      query.confidence = { $gte: parseFloat(minConfidence as string) };
    }

    if (minScore) {
      query.score = { $gte: parseFloat(minScore as string) };
    }

    if (riskLevel) {
      query.riskLevel = riskLevel;
    }

    // Parse limit (max 100)
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    // Get total count
    const total = await OpportunityModel.countDocuments(query);

    // Execute query with sorting
    const opportunities = await OpportunityModel
      .find(query)
      .sort({ [sortBy as string]: order === 'desc' ? -1 : 1 })
      .limit(limitNum)
      .lean();

    // For free tier, return limited fields
    const isFreeTier = req.apiKey?.tier === 'free';
    const formattedOpportunities = opportunities.map(opp => {
      const base = {
        id: opp._id,
        symbol: opp.symbol,
        score: opp.score,
        confidence: opp.confidence,
        category: opp.category,
        riskLevel: opp.riskLevel,
        riskReward: opp.riskReward,
        detectedAt: opp.detectedAt,
        expiresAt: opp.expiresAt
      };

      if (isFreeTier) {
        return base;
      }

      // Full details for paid tiers
      return {
        ...base,
        entry: opp.entry,
        target: opp.target,
        stopLoss: opp.stopLoss,
        expectedReturn: opp.expectedReturn,
        timeframe: opp.timeframe,
        volume24h: opp.volume24h,
        priceChange: opp.priceChange,
        reasoning: opp.reasoning,
        indicators: opp.indicators,
        llmInsights: opp.llmInsights,
        status: opp.status
      };
    });

    res.json({
      success: true,
      data: formattedOpportunities,
      pagination: {
        total,
        returned: formattedOpportunities.length,
        limit: limitNum
      },
      meta: {
        tier: req.apiKey?.tier,
        timestamp: new Date()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching opportunities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch opportunities'
    } as ApiResponse);
  }
});

/**
 * @route GET /api/v1/opportunities/top
 * @desc Get top ranked opportunities
 * @access API Key (Free+)
 */
router.get('/top', async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const {
      limit = '10',
      sortBy = 'score'
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 10, 50);

    const opportunities = await OpportunityModel
      .find({ status: 'ACTIVE', confidence: { $gte: 0.5 } })
      .sort({ [sortBy as string]: -1 })
      .limit(limitNum)
      .lean();

    const isFreeTier = req.apiKey?.tier === 'free';
    const formattedOpportunities = opportunities.map(opp => ({
      id: opp._id,
      symbol: opp.symbol,
      score: opp.score,
      confidence: opp.confidence,
      category: opp.category,
      riskReward: opp.riskReward,
      ...(isFreeTier ? {} : {
        entry: opp.entry,
        target: opp.target,
        stopLoss: opp.stopLoss,
        llmInsights: opp.llmInsights?.traderThoughts
      })
    }));

    res.json({
      success: true,
      data: formattedOpportunities,
      meta: {
        tier: req.apiKey?.tier,
        timestamp: new Date()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching top opportunities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top opportunities'
    } as ApiResponse);
  }
});

/**
 * @route GET /api/v1/opportunities/:id
 * @desc Get single opportunity by ID
 * @access API Key (Starter+)
 */
router.get('/:id', requireTier('starter'), async (req: ApiKeyRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const opportunity = await OpportunityModel.findById(id).lean();

    if (!opportunity) {
      res.status(404).json({
        success: false,
        error: 'Opportunity not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        id: opportunity._id,
        symbol: opportunity.symbol,
        score: opportunity.score,
        confidence: opportunity.confidence,
        category: opportunity.category,
        timeframe: opportunity.timeframe,
        expectedReturn: opportunity.expectedReturn,
        riskLevel: opportunity.riskLevel,
        entry: opportunity.entry,
        target: opportunity.target,
        stopLoss: opportunity.stopLoss,
        riskReward: opportunity.riskReward,
        volume24h: opportunity.volume24h,
        priceChange: opportunity.priceChange,
        reasoning: opportunity.reasoning,
        indicators: opportunity.indicators,
        llmInsights: opportunity.llmInsights,
        status: opportunity.status,
        detectedAt: opportunity.detectedAt,
        expiresAt: opportunity.expiresAt,
        createdAt: opportunity.createdAt
      },
      meta: {
        tier: req.apiKey?.tier,
        timestamp: new Date()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching opportunity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch opportunity'
    } as ApiResponse);
  }
});

export default router;
