import { redisService } from './redisService';
import { signalValidationService } from './signalValidationService';
import { signalDatabaseLoggingService } from './signalDatabaseLoggingService';
import { ScalpingAgent } from '../models';

interface BroadcastSignal {
  id: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  reasoning: string;
  category?: string;
  priority: number;
  timestamp: Date;
}

interface ValidatedSignalForAgent {
  signalId: string;
  agentId: string;
  agentName: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  isValid: boolean;
  llmValidationScore: number;
  winProbability: number;
  reasoning: string;
  rejectionReasons: string[];
  riskRewardRatio: number;
  timestamp: Date;
}

export class SignalBroadcastService {
  private readonly BROADCAST_CHANNEL = 'signal_broadcast';
  private readonly VALIDATED_SIGNALS_QUEUE = 'validated_signals';

  /**
   * Broadcast a signal to all active agents and validate for each
   */
  async broadcastSignal(signal: BroadcastSignal): Promise<{
    totalAgents: number;
    validatedAgents: number;
    rejectedAgents: number;
    validatedSignals: ValidatedSignalForAgent[];
  }> {
    try {
      console.log(`Broadcasting signal ${signal.id} for ${signal.symbol} to all agents`);

      // Get ALL agents (including inactive) to track exclusions
      const allAgents = await ScalpingAgent.find({});

      console.log(`Found ${allAgents.length} total agents in system`);

      const eligibleAgents = [];
      const validatedSignals: ValidatedSignalForAgent[] = [];
      let validatedCount = 0;
      let rejectedCount = 0;
      let excludedCount = 0;

      // FIRST PASS: Filter eligibility and log exclusions
      for (const agent of allAgents) {
        const exclusionReasons = await this.checkAgentEligibility(agent, signal);

        if (exclusionReasons.length > 0) {
          // Agent is EXCLUDED
          excludedCount++;

          await signalDatabaseLoggingService.logAgentExclusion({
            signalId: signal.id,
            agentId: (agent._id as any).toString(),
            agentName: agent.name,
            agentCategory: agent.category || 'ALL',
            agentRiskLevel: agent.riskLevel,
            agentBudget: agent.budget,
            agentStatus: agent.isActive ? 'RUNNING' : 'STOPPED',
            symbol: signal.symbol,
            recommendation: signal.recommendation,
            signalCategory: signal.category,
            exclusionReasons,
            processedAt: new Date()
          });

          console.log(`Agent ${agent.name} excluded: ${exclusionReasons.join(', ')}`);
        } else {
          // Agent is ELIGIBLE
          eligibleAgents.push(agent);
        }
      }

      console.log(`Eligible agents: ${eligibleAgents.length}, Excluded agents: ${excludedCount}`);

      // SECOND PASS: Validate signal for each eligible agent concurrently
      const validationPromises = eligibleAgents.map(async (agent) => {
        try {
          // Create validation signal with agentId
          const validationSignal = {
            ...signal,
            agentId: (agent._id as any).toString(),
          };

          const validationResult = await signalValidationService.validateSignalForAgent(
            validationSignal,
            (agent._id as any).toString()
          );

          const validatedSignal: ValidatedSignalForAgent = {
            signalId: signal.id,
            agentId: (agent._id as any).toString(),
            agentName: agent.name,
            symbol: signal.symbol,
            recommendation: signal.recommendation,
            isValid: validationResult.isValid,
            llmValidationScore: validationResult.confidence * 100, // Convert confidence to score
            winProbability: validationResult.confidence,
            reasoning: validationResult.reasoning,
            rejectionReasons: validationResult.isValid ? [] : [validationResult.reasoning],
            riskRewardRatio: 0, // No longer calculated - LLM handles this
            timestamp: new Date(),
          };

          if (validationResult.isValid) {
            validatedCount++;
            // Queue for execution
            await this.queueValidatedSignal(validatedSignal);
          } else {
            rejectedCount++;
            console.log(
              `Signal ${signal.id} rejected for agent ${agent.name}: ${validationResult.reasoning}`
            );
          }

          validatedSignals.push(validatedSignal);

          // Log agent validation to database
          await signalDatabaseLoggingService.logAgentValidation({
            signalId: signal.id,
            agentId: (agent._id as any).toString(),
            agentName: agent.name,
            agentCategory: agent.category || 'ALL',
            agentRiskLevel: agent.riskLevel,
            agentBudget: agent.budget,
            agentStatus: agent.isActive ? 'RUNNING' : 'STOPPED',
            symbol: signal.symbol,
            recommendation: signal.recommendation,
            signalCategory: signal.category,
            isValid: validationResult.isValid,
            llmValidationScore: validationResult.confidence * 100,
            winProbability: validationResult.confidence,
            reasoning: validationResult.reasoning,
            rejectionReasons: validationResult.isValid ? [] : [validationResult.reasoning],
            riskRewardRatio: 0,
            marketConditions: validationResult.marketConditions,
            positionSize: validationResult.positionSize,
            availableBalance: validationResult.availableBalance,
            processedAt: new Date(),
            validatedAt: new Date()
          });

          // Publish to agent-specific channel
          await redisService.publish(`signal:agent:${agent._id}`, {
            type: 'signal_validated',
            data: validatedSignal,
          });

          return validatedSignal;
        } catch (error) {
          console.error(`Error validating signal for agent ${agent._id}:`, error);
          rejectedCount++;
          return null;
        }
      });

      await Promise.all(validationPromises);

      // Publish broadcast summary
      await redisService.publish(this.BROADCAST_CHANNEL, {
        type: 'broadcast_complete',
        signalId: signal.id,
        symbol: signal.symbol,
        totalAgents: eligibleAgents.length,
        validatedAgents: validatedCount,
        rejectedAgents: rejectedCount,
        timestamp: new Date(),
      });

      console.log(
        `Broadcast complete: ${validatedCount} validated, ${rejectedCount} rejected out of ${eligibleAgents.length} eligible agents`
      );

      // Log the broadcast to database with correct counts
      await signalDatabaseLoggingService.logBroadcastedSignal({
        signalId: signal.id,
        symbol: signal.symbol,
        recommendation: signal.recommendation,
        confidence: signal.confidence,
        category: signal.category,
        reasoning: signal.reasoning,
        targetPrice: signal.targetPrice,
        stopLoss: signal.stopLoss,
        totalAgentsConsidered: allAgents.length,
        totalAgentsEligible: eligibleAgents.length,
        validatedAgents: validatedCount,
        rejectedAgents: rejectedCount,
        excludedAgents: excludedCount,
        broadcastedAt: new Date()
      });

      return {
        totalAgents: allAgents.length,
        validatedAgents: validatedCount,
        rejectedAgents: rejectedCount,
        validatedSignals: validatedSignals.filter(s => s !== null) as ValidatedSignalForAgent[],
      };
    } catch (error) {
      console.error('Error broadcasting signal:', error);
      throw error;
    }
  }

  /**
   * Queue a validated signal for execution
   */
  private async queueValidatedSignal(validatedSignal: ValidatedSignalForAgent): Promise<void> {
    const priority = validatedSignal.llmValidationScore;

    await redisService.enqueue(this.VALIDATED_SIGNALS_QUEUE, {
      id: `${validatedSignal.signalId}:${validatedSignal.agentId}`,
      data: validatedSignal,
      timestamp: Date.now(),
      priority,
    });

    // Cache the validated signal
    const key = `validated_signal:${validatedSignal.agentId}:${validatedSignal.signalId}`;
    await redisService.set(key, validatedSignal, { ttl: 3600 });

    console.log(
      `Queued validated signal for agent ${validatedSignal.agentName} with priority ${priority}`
    );
  }

  /**
   * Get validated signals for a specific agent
   */
  async getValidatedSignalsForAgent(agentId: string, limit: number = 10): Promise<ValidatedSignalForAgent[]> {
    try {
      const pattern = `validated_signal:${agentId}:*`;
      const keys = await redisService.getKeysByPattern(pattern);

      const signals: ValidatedSignalForAgent[] = [];
      for (const key of keys.slice(0, limit)) {
        const signal = await redisService.get(key);
        if (signal) {
          signals.push(signal);
        }
      }

      return signals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('Error getting validated signals:', error);
      return [];
    }
  }

  /**
   * Get all validated signals across all agents (for dashboard)
   */
  async getAllValidatedSignals(userId?: string, limit: number = 50): Promise<ValidatedSignalForAgent[]> {
    try {
      // If userId provided, filter by user's agents
      let agentIds: string[] = [];
      if (userId) {
        const agents = await ScalpingAgent.find({ userId }).select('_id');
        agentIds = agents.map(a => (a._id as any).toString());
      }

      const pattern = 'validated_signal:*';
      const keys = await redisService.getKeysByPattern(pattern);

      const signals: ValidatedSignalForAgent[] = [];
      for (const key of keys.slice(0, limit * 2)) {
        const signal = await redisService.get(key);
        if (signal) {
          // Filter by user's agents if specified
          if (agentIds.length === 0 || agentIds.includes(signal.agentId)) {
            signals.push(signal);
          }
        }
      }

      return signals
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting all validated signals:', error);
      return [];
    }
  }

  /**
   * Get broadcast statistics
   */
  async getBroadcastStats(): Promise<{
    totalBroadcasts: number;
    avgValidationRate: number;
    totalSignalsValidated: number;
    totalSignalsRejected: number;
  }> {
    try {
      // This is a simplified version - in production, you'd want to store these in Redis or DB
      const allSignals = await this.getAllValidatedSignals();

      const validated = allSignals.filter(s => s.isValid).length;
      const rejected = allSignals.filter(s => !s.isValid).length;
      const total = validated + rejected;

      return {
        totalBroadcasts: allSignals.length,
        avgValidationRate: total > 0 ? (validated / total) * 100 : 0,
        totalSignalsValidated: validated,
        totalSignalsRejected: rejected,
      };
    } catch (error) {
      console.error('Error getting broadcast stats:', error);
      return {
        totalBroadcasts: 0,
        avgValidationRate: 0,
        totalSignalsValidated: 0,
        totalSignalsRejected: 0,
      };
    }
  }

  /**
   * Clear old validated signals (cleanup job)
   */
  async clearOldSignals(maxAgeHours: number = 24): Promise<number> {
    try {
      const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;
      const pattern = 'validated_signal:*';
      const keys = await redisService.getKeysByPattern(pattern);

      let deletedCount = 0;
      for (const key of keys) {
        const signal = await redisService.get(key);
        if (signal && new Date(signal.timestamp).getTime() < cutoffTime) {
          await redisService.delete(key);
          deletedCount++;
        }
      }

      console.log(`Cleared ${deletedCount} old validated signals`);
      return deletedCount;
    } catch (error) {
      console.error('Error clearing old signals:', error);
      return 0;
    }
  }

  /**
   * Subscribe to agent-specific signal updates
   */
  async subscribeToAgentSignals(agentId: string, callback: (signal: ValidatedSignalForAgent) => void): Promise<void> {
    const channel = `signal:agent:${agentId}`;
    await redisService.subscribe(channel, callback);
  }

  /**
   * Subscribe to broadcast channel
   */
  async subscribeToBroadcasts(callback: (message: any) => void): Promise<void> {
    await redisService.subscribe(this.BROADCAST_CHANNEL, callback);
  }

  /**
   * Check if agent is eligible to receive signal
   * Returns array of exclusion reasons (empty if eligible)
   */
  private async checkAgentEligibility(agent: any, signal: BroadcastSignal): Promise<string[]> {
    const reasons = [];

    // Check 1: Is agent active?
    if (!agent.isActive) {
      reasons.push(`Agent not active (status: STOPPED)`);
      return reasons; // Skip other checks if inactive
    }

    // Check 2: Category compatibility (for intelligent agents)
    if (signal.category && agent.allowedSignalCategories && agent.allowedSignalCategories.length > 0) {
      if (!agent.allowedSignalCategories.includes(signal.category)) {
        reasons.push(
          `Signal category '${signal.category}' not in allowed [${agent.allowedSignalCategories.join(', ')}]`
        );
      }
    }

    // Check 3: Available balance
    try {
      const balance = await this.getAgentAvailableBalance(agent);
      if (balance < 10) {
        reasons.push(`Insufficient balance: $${balance.toFixed(2)} (min $10)`);
      }
    } catch (error) {
      console.error(`Error checking balance for agent ${agent.name}:`, error);
      reasons.push('Failed to check balance');
    }

    // Check 4: Max open positions
    try {
      const openPositions = await this.getAgentOpenPositions((agent._id as any).toString());
      if (openPositions >= agent.maxOpenPositions) {
        reasons.push(
          `Max open positions reached (${openPositions}/${agent.maxOpenPositions})`
        );
      }
    } catch (error) {
      console.error(`Error checking open positions for agent ${agent.name}:`, error);
    }

    // Check 5: Signal confidence vs agent minimum
    if (agent.minLLMConfidence && signal.confidence < agent.minLLMConfidence) {
      reasons.push(
        `Signal confidence ${(signal.confidence * 100).toFixed(0)}% below min ${(agent.minLLMConfidence * 100).toFixed(0)}%`
      );
    }

    return reasons;
  }

  /**
   * Get agent's available balance
   */
  private async getAgentAvailableBalance(agent: any): Promise<number> {
    try {
      // Use the method from signalValidationService
      const balanceInfo = await signalValidationService['getAgentBalance'](agent);
      return balanceInfo.availableBalance;
    } catch (error) {
      console.error('Error getting agent balance:', error);
      return 0;
    }
  }

  /**
   * Get number of open positions for agent
   */
  private async getAgentOpenPositions(agentId: string): Promise<number> {
    try {
      const { Trade } = await import('../models');
      const count = await Trade.countDocuments({
        agentId,
        status: { $in: ['pending', 'filled'] }
      });
      return count;
    } catch (error) {
      console.error('Error getting open positions:', error);
      return 0;
    }
  }
}

export const signalBroadcastService = new SignalBroadcastService();
