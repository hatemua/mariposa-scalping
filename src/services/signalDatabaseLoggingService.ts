import BroadcastedSignal from '../models/BroadcastedSignal';
import AgentSignalLog from '../models/AgentSignalLog';

interface BroadcastLog {
  signalId: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  category?: string;
  reasoning: string;
  targetPrice?: number;
  stopLoss?: number;
  totalAgentsConsidered: number;
  totalAgentsEligible: number;
  validatedAgents: number;
  rejectedAgents: number;
  excludedAgents: number;
  broadcastedAt?: Date;
  userId?: string;
}

interface AgentExclusionLog {
  signalId: string;
  agentId: string;
  agentName: string;
  agentCategory: string;
  agentRiskLevel: number;
  agentBudget: number;
  agentStatus: 'RUNNING' | 'STOPPED' | 'PAUSED' | 'ERROR';
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  signalCategory?: string;
  exclusionReasons: string[];
  processedAt?: Date;
}

interface AgentValidationLog {
  signalId: string;
  agentId: string;
  agentName: string;
  agentCategory: string;
  agentRiskLevel: number;
  agentBudget: number;
  agentStatus?: 'RUNNING' | 'STOPPED' | 'PAUSED' | 'ERROR';
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  signalCategory?: string;
  isValid: boolean;
  llmValidationScore: number;
  winProbability: number;
  reasoning: string;
  rejectionReasons: string[];
  riskRewardRatio: number;
  marketConditions: {
    liquidity: string;
    spread: number;
    volatility: number;
  };
  positionSize?: number;
  availableBalance?: number;
  processedAt?: Date;
  validatedAt?: Date;
}

interface ExecutionUpdate {
  executed: true;
  executedAt: Date;
  orderId: string;
  executionPrice?: number;
  executionQuantity?: number;
}

export class SignalDatabaseLoggingService {
  /**
   * Log a broadcasted signal (master record)
   */
  async logBroadcastedSignal(data: BroadcastLog): Promise<void> {
    try {
      const signal = new BroadcastedSignal({
        signalId: data.signalId,
        symbol: data.symbol,
        recommendation: data.recommendation,
        confidence: data.confidence,
        category: data.category,
        reasoning: data.reasoning,
        targetPrice: data.targetPrice,
        stopLoss: data.stopLoss,
        totalAgentsConsidered: data.totalAgentsConsidered,
        totalAgentsEligible: data.totalAgentsEligible,
        validatedAgents: data.validatedAgents,
        rejectedAgents: data.rejectedAgents,
        excludedAgents: data.excludedAgents,
        broadcastedAt: data.broadcastedAt || new Date(),
        userId: data.userId,
      });

      await signal.save();

      console.log(`Logged broadcast signal: ${data.signalId} (${data.symbol})`);
    } catch (error) {
      console.error('Error logging broadcasted signal:', error);
    }
  }

  /**
   * Log agent exclusion (agent didn't receive signal)
   */
  async logAgentExclusion(data: AgentExclusionLog): Promise<void> {
    try {
      const log = new AgentSignalLog({
        signalId: data.signalId,
        agentId: data.agentId,
        agentName: data.agentName,
        agentCategory: data.agentCategory,
        agentRiskLevel: data.agentRiskLevel,
        agentBudget: data.agentBudget,
        agentStatus: data.agentStatus,
        symbol: data.symbol,
        recommendation: data.recommendation,
        signalCategory: data.signalCategory,
        status: 'EXCLUDED',
        exclusionReasons: data.exclusionReasons,
        isValid: false,
        executed: false,
        processedAt: data.processedAt || new Date(),
      });

      await log.save();
    } catch (error) {
      console.error(`Error logging agent exclusion for ${data.agentId}:`, error);
    }
  }

  /**
   * Log agent validation (agent received and validated signal)
   */
  async logAgentValidation(data: AgentValidationLog): Promise<void> {
    try {
      const status = data.isValid ? 'VALIDATED' : 'REJECTED';

      const log = new AgentSignalLog({
        signalId: data.signalId,
        agentId: data.agentId,
        agentName: data.agentName,
        agentCategory: data.agentCategory,
        agentRiskLevel: data.agentRiskLevel,
        agentBudget: data.agentBudget,
        agentStatus: data.agentStatus || 'RUNNING',
        symbol: data.symbol,
        recommendation: data.recommendation,
        signalCategory: data.signalCategory,
        status,
        exclusionReasons: [],
        isValid: data.isValid,
        llmValidationScore: data.llmValidationScore,
        winProbability: data.winProbability,
        reasoning: data.reasoning,
        rejectionReasons: data.rejectionReasons,
        riskRewardRatio: data.riskRewardRatio,
        marketConditions: data.marketConditions,
        positionSize: data.positionSize,
        availableBalance: data.availableBalance,
        executed: false,
        processedAt: data.processedAt || new Date(),
        validatedAt: data.validatedAt || new Date(),
      });

      await log.save();
    } catch (error) {
      console.error(`Error logging agent validation for ${data.agentId}:`, error);
    }
  }

  /**
   * Update execution status for a validated signal
   */
  async updateExecutionStatus(
    signalId: string,
    agentId: string,
    executionData: ExecutionUpdate
  ): Promise<void> {
    try {
      await AgentSignalLog.findOneAndUpdate(
        { signalId, agentId },
        {
          $set: {
            status: 'EXECUTED',
            executed: true,
            executedAt: executionData.executedAt,
            orderId: executionData.orderId,
            executionPrice: executionData.executionPrice,
            executionQuantity: executionData.executionQuantity,
          },
        }
      );

      console.log(`Updated execution status for signal ${signalId}, agent ${agentId}`);
    } catch (error) {
      console.error(`Error updating execution status for ${signalId}:`, error);
    }
  }

  /**
   * Get signal with all agent logs
   */
  async getSignalWithAgentLogs(signalId: string): Promise<{
    signal: any;
    excludedAgents: any[];
    receivedAgents: any[];
    validatedAgents: any[];
    rejectedAgents: any[];
    executedAgents: any[];
  }> {
    try {
      const signal = await BroadcastedSignal.findOne({ signalId });

      if (!signal) {
        throw new Error(`Signal ${signalId} not found`);
      }

      const allLogs = await AgentSignalLog.find({ signalId }).populate('agentId');

      return {
        signal,
        excludedAgents: allLogs.filter((l) => l.status === 'EXCLUDED'),
        receivedAgents: allLogs.filter((l) => l.status !== 'EXCLUDED'),
        validatedAgents: allLogs.filter((l) => l.status === 'VALIDATED' || l.status === 'EXECUTED'),
        rejectedAgents: allLogs.filter((l) => l.status === 'REJECTED'),
        executedAgents: allLogs.filter((l) => l.status === 'EXECUTED'),
      };
    } catch (error) {
      console.error(`Error getting signal with agent logs for ${signalId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent signal history with filters
   */
  async getAgentSignalHistory(
    agentId: string,
    filters?: {
      status?: 'EXCLUDED' | 'RECEIVED' | 'VALIDATED' | 'REJECTED' | 'EXECUTED';
      dateFrom?: Date;
      dateTo?: Date;
      symbol?: string;
    }
  ): Promise<any[]> {
    try {
      const query: any = { agentId };

      if (filters?.status) {
        query.status = filters.status;
      }

      if (filters?.dateFrom || filters?.dateTo) {
        query.processedAt = {};
        if (filters.dateFrom) {
          query.processedAt.$gte = filters.dateFrom;
        }
        if (filters.dateTo) {
          query.processedAt.$lte = filters.dateTo;
        }
      }

      if (filters?.symbol) {
        query.symbol = filters.symbol;
      }

      return await AgentSignalLog.find(query).sort({ processedAt: -1 }).limit(100);
    } catch (error) {
      console.error(`Error getting agent signal history for ${agentId}:`, error);
      return [];
    }
  }

  /**
   * Get exclusion statistics for an agent
   */
  async getExclusionStatistics(agentId: string): Promise<{
    totalSignals: number;
    excluded: number;
    received: number;
    exclusionRate: number;
    topExclusionReasons: { reason: string; count: number }[];
  }> {
    try {
      const logs = await AgentSignalLog.find({ agentId });

      const totalSignals = logs.length;
      const excluded = logs.filter((l) => l.status === 'EXCLUDED').length;
      const received = totalSignals - excluded;
      const exclusionRate = totalSignals > 0 ? (excluded / totalSignals) * 100 : 0;

      // Count exclusion reasons
      const reasonCounts: Record<string, number> = {};
      logs
        .filter((l) => l.status === 'EXCLUDED')
        .forEach((log) => {
          log.exclusionReasons.forEach((reason) => {
            reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
          });
        });

      const topExclusionReasons = Object.entries(reasonCounts)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        totalSignals,
        excluded,
        received,
        exclusionRate,
        topExclusionReasons,
      };
    } catch (error) {
      console.error(`Error getting exclusion statistics for ${agentId}:`, error);
      return {
        totalSignals: 0,
        excluded: 0,
        received: 0,
        exclusionRate: 0,
        topExclusionReasons: [],
      };
    }
  }

  /**
   * Get all broadcasted signals with filters
   */
  async getBroadcastedSignals(filters?: {
    symbol?: string;
    dateFrom?: Date;
    dateTo?: Date;
    recommendation?: 'BUY' | 'SELL' | 'HOLD';
  }): Promise<any[]> {
    try {
      const query: any = {};

      if (filters?.symbol) {
        query.symbol = filters.symbol;
      }

      if (filters?.recommendation) {
        query.recommendation = filters.recommendation;
      }

      if (filters?.dateFrom || filters?.dateTo) {
        query.broadcastedAt = {};
        if (filters.dateFrom) {
          query.broadcastedAt.$gte = filters.dateFrom;
        }
        if (filters.dateTo) {
          query.broadcastedAt.$lte = filters.dateTo;
        }
      }

      return await BroadcastedSignal.find(query).sort({ broadcastedAt: -1 }).limit(100);
    } catch (error) {
      console.error('Error getting broadcasted signals:', error);
      return [];
    }
  }

  /**
   * Get overall statistics
   */
  async getOverallStatistics(dateFrom?: Date, dateTo?: Date): Promise<{
    totalSignals: number;
    totalAgentLogs: number;
    avgValidationRate: number;
    avgExecutionRate: number;
    avgExclusionRate: number;
  }> {
    try {
      const query: any = {};

      if (dateFrom || dateTo) {
        query.broadcastedAt = {};
        if (dateFrom) {
          query.broadcastedAt.$gte = dateFrom;
        }
        if (dateTo) {
          query.broadcastedAt.$lte = dateTo;
        }
      }

      const signals = await BroadcastedSignal.find(query);

      const totalSignals = signals.length;
      const totalValidated = signals.reduce((sum, s) => sum + s.validatedAgents, 0);
      const totalEligible = signals.reduce((sum, s) => sum + s.totalAgentsEligible, 0);
      const totalExcluded = signals.reduce((sum, s) => sum + s.excludedAgents, 0);
      const totalConsidered = signals.reduce((sum, s) => sum + s.totalAgentsConsidered, 0);

      const executedCount = await AgentSignalLog.countDocuments({ status: 'EXECUTED' });

      const avgValidationRate = totalEligible > 0 ? (totalValidated / totalEligible) * 100 : 0;
      const avgExecutionRate = totalValidated > 0 ? (executedCount / totalValidated) * 100 : 0;
      const avgExclusionRate = totalConsidered > 0 ? (totalExcluded / totalConsidered) * 100 : 0;

      return {
        totalSignals,
        totalAgentLogs: totalConsidered,
        avgValidationRate,
        avgExecutionRate,
        avgExclusionRate,
      };
    } catch (error) {
      console.error('Error getting overall statistics:', error);
      return {
        totalSignals: 0,
        totalAgentLogs: 0,
        avgValidationRate: 0,
        avgExecutionRate: 0,
        avgExclusionRate: 0,
      };
    }
  }
}

export const signalDatabaseLoggingService = new SignalDatabaseLoggingService();
