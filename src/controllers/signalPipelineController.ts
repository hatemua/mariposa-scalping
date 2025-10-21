import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { validatedSignalExecutor } from '../services/validatedSignalExecutor';
import { signalBroadcastService } from '../services/signalBroadcastService';
import { agendaService } from '../services/agendaService';
import BroadcastedSignalModel from '../models/BroadcastedSignal';
import AgentSignalLogModel from '../models/AgentSignalLog';
import OpportunityModel from '../models/Opportunity';
import WhaleActivityModel from '../models/WhaleActivity';
import { Trade } from '../models';

/**
 * Signal Pipeline Health Controller
 * Monitors the entire signal detection → validation → execution pipeline
 */

/**
 * Get signal pipeline health status
 */
export const getSignalPipelineHealth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🩺 Checking signal pipeline health...');

    // Get queue stats
    const queueStats = await validatedSignalExecutor.getQueueStats();

    // Get broadcast stats
    const broadcastStats = await signalBroadcastService.getBroadcastStats();

    // Get recent opportunities count
    const recentOpportunities = await OpportunityModel.countDocuments({
      detectedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    // Get recent whale activities count
    const recentWhaleActivities = await WhaleActivityModel.countDocuments({
      detectedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    // Get recent signal logs (last 10 minutes)
    const recentSignalLogs = await AgentSignalLogModel.countDocuments({
      processedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
    });

    // Get recent executions (last 10 minutes)
    const recentExecutions = await AgentSignalLogModel.countDocuments({
      executedAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
      executed: true
    });

    // Get recent trades (last hour)
    const recentTrades = await Trade.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    });

    // Get agenda job stats
    const jobStats = await agendaService.getJobStats();

    // Calculate health score
    const healthScore = calculateHealthScore({
      queueLength: queueStats.queueLength,
      recentOpportunities,
      recentWhaleActivities,
      recentSignalLogs,
      recentExecutions,
      recentTrades
    });

    const health = {
      status: healthScore >= 70 ? 'HEALTHY' : healthScore >= 40 ? 'DEGRADED' : 'CRITICAL',
      score: healthScore,
      timestamp: new Date(),
      components: {
        signalDetection: {
          status: (recentOpportunities + recentWhaleActivities) > 0 ? 'ACTIVE' : 'IDLE',
          opportunitiesDetected: recentOpportunities,
          whaleActivitiesDetected: recentWhaleActivities,
          lastHour: true
        },
        signalBroadcasting: {
          status: broadcastStats.totalBroadcasts > 0 ? 'ACTIVE' : 'IDLE',
          totalBroadcasts: broadcastStats.totalBroadcasts,
          validationRate: broadcastStats.avgValidationRate,
          validated: broadcastStats.totalSignalsValidated,
          rejected: broadcastStats.totalSignalsRejected
        },
        signalValidation: {
          status: recentSignalLogs > 0 ? 'ACTIVE' : 'IDLE',
          logsCreated: recentSignalLogs,
          last10Minutes: true
        },
        executionQueue: {
          status: queueStats.isProcessing ? 'PROCESSING' : 'IDLE',
          queueLength: queueStats.queueLength,
          isProcessing: queueStats.isProcessing
        },
        tradeExecution: {
          status: recentExecutions > 0 ? 'ACTIVE' : 'IDLE',
          executionsLast10Min: recentExecutions,
          tradesLast1Hour: recentTrades
        },
        scheduledJobs: {
          status: jobStats ? 'RUNNING' : 'UNKNOWN',
          stats: jobStats
        }
      },
      recommendations: generateRecommendations({
        queueLength: queueStats.queueLength,
        recentOpportunities,
        recentWhaleActivities,
        recentSignalLogs,
        recentExecutions,
        recentTrades
      })
    };

    console.log(`✅ Pipeline health: ${health.status} (score: ${healthScore})`);

    res.json({
      success: true,
      data: health
    } as ApiResponse);

  } catch (error) {
    console.error('Error checking signal pipeline health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check signal pipeline health',
      details: error instanceof Error ? error.message : 'Unknown error'
    } as ApiResponse);
  }
};

/**
 * Get detailed signal logs (for debugging)
 */
export const getSignalLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 50, status, agentId, signalId } = req.query;

    const query: any = {};
    if (status) query.status = status;
    if (agentId) query.agentId = agentId;
    if (signalId) query.signalId = signalId;

    const logs = await AgentSignalLogModel.find(query)
      .sort({ processedAt: -1 })
      .limit(Number(limit))
      .lean();

    // Group by status for summary
    const summary = {
      total: logs.length,
      excluded: logs.filter(l => l.status === 'EXCLUDED').length,
      validated: logs.filter(l => l.status === 'VALIDATED').length,
      rejected: logs.filter(l => l.status === 'REJECTED').length,
      executed: logs.filter(l => l.status === 'EXECUTED').length
    };

    res.json({
      success: true,
      data: {
        logs,
        summary
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching signal logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch signal logs'
    } as ApiResponse);
  }
};

/**
 * Get broadcasted signals
 */
export const getBroadcastedSignals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 50 } = req.query;

    const signals = await BroadcastedSignalModel.find({})
      .sort({ broadcastedAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      data: signals
    } as ApiResponse);

  } catch (error) {
    console.error('Error fetching broadcasted signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch broadcasted signals'
    } as ApiResponse);
  }
};

/**
 * Clear execution queue (maintenance)
 */
export const clearExecutionQueue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cleared = await validatedSignalExecutor.clearQueue();

    res.json({
      success: true,
      data: {
        cleared,
        message: `Cleared ${cleared} signals from execution queue`
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error clearing execution queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear execution queue'
    } as ApiResponse);
  }
};

// Helper functions

function calculateHealthScore(metrics: {
  queueLength: number;
  recentOpportunities: number;
  recentWhaleActivities: number;
  recentSignalLogs: number;
  recentExecutions: number;
  recentTrades: number;
}): number {
  let score = 0;

  // Signal detection (40 points max)
  const totalSignals = metrics.recentOpportunities + metrics.recentWhaleActivities;
  if (totalSignals >= 10) score += 40;
  else if (totalSignals >= 5) score += 30;
  else if (totalSignals >= 1) score += 20;
  else score += 0; // No signals detected

  // Signal validation (30 points max)
  if (metrics.recentSignalLogs >= 10) score += 30;
  else if (metrics.recentSignalLogs >= 5) score += 20;
  else if (metrics.recentSignalLogs >= 1) score += 10;
  else score += 0;

  // Execution (30 points max)
  if (metrics.recentExecutions >= 5) score += 30;
  else if (metrics.recentExecutions >= 2) score += 20;
  else if (metrics.recentExecutions >= 1) score += 10;
  else if (metrics.queueLength > 0) score += 5; // Queue has items waiting
  else score += 0;

  return score;
}

function generateRecommendations(metrics: {
  queueLength: number;
  recentOpportunities: number;
  recentWhaleActivities: number;
  recentSignalLogs: number;
  recentExecutions: number;
  recentTrades: number;
}): string[] {
  const recommendations: string[] = [];

  // No signals detected
  if (metrics.recentOpportunities === 0 && metrics.recentWhaleActivities === 0) {
    recommendations.push('⚠️  No signals detected in last hour - check market conditions or lower detection thresholds');
  }

  // Signals detected but no logs
  if ((metrics.recentOpportunities > 0 || metrics.recentWhaleActivities > 0) && metrics.recentSignalLogs === 0) {
    recommendations.push('🔍 Signals detected but not being logged - check broadcast service');
  }

  // Logs created but no executions
  if (metrics.recentSignalLogs > 0 && metrics.recentExecutions === 0) {
    recommendations.push('⚡ Signals validated but not executing - check agent configurations and LLM validation');
  }

  // Large queue backlog
  if (metrics.queueLength > 20) {
    recommendations.push(`📊 Large queue backlog (${metrics.queueLength} items) - execution may be slow`);
  }

  // All good
  if (recommendations.length === 0) {
    recommendations.push('✅ Pipeline is healthy - signals are being detected, validated, and executed');
  }

  return recommendations;
}
