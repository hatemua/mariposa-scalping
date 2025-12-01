import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { dashboardAnalyticsService } from '../services/dashboardAnalyticsService';
import { tradeQueryService, TradeFilters } from '../services/tradeQueryService';
import { metricsCacheService } from '../services/metricsCacheService';
import { exportService } from '../services/exportService';
import { orderEvaluationService } from '../services/orderEvaluationService';
import { signalBroadcastService } from '../services/signalBroadcastService';
import { profitEstimationService } from '../services/profitEstimationService';

/**
 * Get dashboard summary with all aggregated metrics
 */
export const getDashboardSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const forceRefresh = req.query.refresh === 'true';

    const summary = await metricsCacheService.getDashboardSummary(userId, forceRefresh);

    res.json({
      success: true,
      data: summary,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard summary',
    } as ApiResponse);
  }
};

/**
 * Get all agent metrics
 */
export const getAgentMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const forceRefresh = req.query.refresh === 'true';

    const metrics = await metricsCacheService.getAgentMetrics(userId, forceRefresh);

    res.json({
      success: true,
      data: metrics,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting agent metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent metrics',
    } as ApiResponse);
  }
};

/**
 * Get filtered trades with pagination
 */
export const getFilteredTrades = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();

    // Parse filters from query params
    const filters: TradeFilters = {
      agentIds: req.query.agentIds ? String(req.query.agentIds).split(',') : undefined,
      symbols: req.query.symbols ? String(req.query.symbols).split(',') : undefined,
      strategyTypes: req.query.strategyTypes ? String(req.query.strategyTypes).split(',') : undefined,
      tradingCategories: req.query.tradingCategories ? String(req.query.tradingCategories).split(',') : undefined,
      sides: req.query.sides ? String(req.query.sides).split(',') as ('buy' | 'sell')[] : undefined,
      status: req.query.status ? String(req.query.status).split(',') as any : undefined,
      timeRange: req.query.timeRange as any,
      dateFrom: req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined,
      dateTo: req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined,
      minPnL: req.query.minPnL ? parseFloat(String(req.query.minPnL)) : undefined,
      maxPnL: req.query.maxPnL ? parseFloat(String(req.query.maxPnL)) : undefined,
      onlyWinners: req.query.onlyWinners === 'true',
      onlyLosers: req.query.onlyLosers === 'true',
      minLLMConfidence: req.query.minLLMConfidence ? parseFloat(String(req.query.minLLMConfidence)) : undefined,
      wasLLMValidated: req.query.wasLLMValidated ? req.query.wasLLMValidated === 'true' : undefined,
      page: req.query.page ? parseInt(String(req.query.page)) : 1,
      limit: req.query.limit ? parseInt(String(req.query.limit)) : 50,
      sortBy: String(req.query.sortBy || 'createdAt'),
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    };

    const result = await tradeQueryService.queryTrades(userId, filters);

    res.json({
      success: true,
      data: result,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting filtered trades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trades',
    } as ApiResponse);
  }
};

/**
 * Get PnL chart data
 */
export const getPnLChart = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const timeRange = (req.query.range as 'day' | 'week' | 'month' | 'year') || 'week';
    const groupBy = (req.query.groupBy as 'hour' | 'day') || 'day';
    const forceRefresh = req.query.refresh === 'true';

    const data = await metricsCacheService.getPnLChartData(userId, timeRange, groupBy, forceRefresh);

    res.json({
      success: true,
      data,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting PnL chart:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get PnL chart data',
    } as ApiResponse);
  }
};

/**
 * Get strategy performance breakdown
 */
export const getStrategyPerformance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const forceRefresh = req.query.refresh === 'true';

    const data = await metricsCacheService.getStrategyPerformance(userId, forceRefresh);

    res.json({
      success: true,
      data,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting strategy performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get strategy performance',
    } as ApiResponse);
  }
};

/**
 * Compare multiple agents
 */
export const compareAgents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const agentIds = req.query.agentIds ? String(req.query.agentIds).split(',') : [];

    if (agentIds.length < 2) {
      res.status(400).json({
        success: false,
        error: 'At least 2 agent IDs required for comparison',
      } as ApiResponse);
      return;
    }

    const comparisons = await Promise.all(
      agentIds.map(id => dashboardAnalyticsService.getAgentDetailedMetrics(id))
    );

    const validComparisons = comparisons.filter(c => c !== null);

    res.json({
      success: true,
      data: validComparisons,
    } as ApiResponse);
  } catch (error) {
    console.error('Error comparing agents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare agents',
    } as ApiResponse);
  }
};

/**
 * Get trade distribution for charts
 */
export const getTradeDistribution = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();

    const filters: TradeFilters = {
      timeRange: req.query.timeRange as any || 'month',
      agentIds: req.query.agentIds ? String(req.query.agentIds).split(',') : undefined,
    };

    const distribution = await tradeQueryService.getTradeDistribution(userId, filters);

    res.json({
      success: true,
      data: distribution,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting trade distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get trade distribution',
    } as ApiResponse);
  }
};

/**
 * Get filter options
 */
export const getFilterOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const options = await tradeQueryService.getFilterOptions(userId);

    res.json({
      success: true,
      data: options,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting filter options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get filter options',
    } as ApiResponse);
  }
};

/**
 * Export trades to CSV
 */
export const exportTrades = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const format = (req.query.format as 'csv' | 'json') || 'csv';

    const filters: TradeFilters = {
      timeRange: req.query.timeRange as any,
      agentIds: req.query.agentIds ? String(req.query.agentIds).split(',') : undefined,
    };

    let data: string;
    let contentType: string;
    let filename: string;

    if (format === 'csv') {
      data = await exportService.exportToCSV(userId, filters);
      contentType = 'text/csv';
      filename = exportService.generateFilename('csv', 'trades');
    } else {
      data = await exportService.exportToJSON(userId, filters);
      contentType = 'application/json';
      filename = exportService.generateFilename('json', 'trades');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error) {
    console.error('Error exporting trades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export trades',
    } as ApiResponse);
  }
};

/**
 * Export agent summary
 */
export const exportAgentSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const data = await exportService.exportAgentSummary(userId);

    const filename = exportService.generateFilename('csv', 'agents');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error) {
    console.error('Error exporting agent summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export agent summary',
    } as ApiResponse);
  }
};

/**
 * Get LLM performance stats
 */
export const getLLMPerformance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const agentId = req.query.agentId as string;

    let performance;
    if (agentId) {
      performance = await orderEvaluationService.getAgentLLMAccuracy(agentId);
    } else {
      performance = await orderEvaluationService.getUserLLMPerformance(userId);
    }

    res.json({
      success: true,
      data: performance,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting LLM performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM performance',
    } as ApiResponse);
  }
};

/**
 * Get validated signals
 */
export const getValidatedSignals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const agentId = req.query.agentId as string;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 50;

    let signals;
    if (agentId) {
      signals = await signalBroadcastService.getValidatedSignalsForAgent(agentId, limit);
    } else {
      signals = await signalBroadcastService.getAllValidatedSignals(userId, limit);
    }

    res.json({
      success: true,
      data: signals,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting validated signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get validated signals',
    } as ApiResponse);
  }
};

/**
 * Invalidate cache
 */
export const invalidateCache = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    await metricsCacheService.invalidateUserCache(userId);

    res.json({
      success: true,
      message: 'Cache invalidated successfully',
    } as ApiResponse);
  } catch (error) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache',
    } as ApiResponse);
  }
};

/**
 * Get profit estimation report
 * Query params:
 *   - budget (default: 5000)
 *   - parallelOrders (default: 3)
 *   - amountPerOrder (default: 900)
 *   - days (historical lookback, default: 30)
 */
export const getProfitEstimation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id.toString();

    // Parse config from query params
    const config = {
      totalBudget: req.query.budget ? parseFloat(String(req.query.budget)) : 5000,
      parallelOrders: req.query.parallelOrders ? parseInt(String(req.query.parallelOrders)) : 3,
      amountPerOrder: req.query.amountPerOrder ? parseFloat(String(req.query.amountPerOrder)) : 900,
      cryptoPipValue: req.query.pipValue ? parseFloat(String(req.query.pipValue)) : 10,
    };

    const days = req.query.days ? parseInt(String(req.query.days)) : 30;

    const report = await profitEstimationService.generateProfitEstimation(userId, config, days);

    // Log summary for debugging
    console.log(profitEstimationService.formatReportSummary(report));

    res.json({
      success: true,
      data: report,
    } as ApiResponse);
  } catch (error) {
    console.error('Error getting profit estimation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profit estimation',
    } as ApiResponse);
  }
};
