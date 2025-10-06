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
      console.log(`Broadcasting signal ${signal.id} for ${signal.symbol} to all active agents`);

      // Get ALL active agents (not filtered by symbol - intelligent agents trade any symbol)
      const activeAgents = await ScalpingAgent.find({
        isActive: true,
      });

      console.log(`Found ${activeAgents.length} active agents (broadcasting to all regardless of symbol)`);

      const validatedSignals: ValidatedSignalForAgent[] = [];
      let validatedCount = 0;
      let rejectedCount = 0;

      // Validate signal for each agent concurrently
      const validationPromises = activeAgents.map(async (agent) => {
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
            llmValidationScore: validationResult.llmValidationScore,
            winProbability: validationResult.winProbability,
            reasoning: validationResult.reasoning,
            rejectionReasons: validationResult.rejectionReasons,
            riskRewardRatio: validationResult.riskRewardRatio,
            timestamp: new Date(),
          };

          if (validationResult.isValid) {
            validatedCount++;
            // Queue for execution
            await this.queueValidatedSignal(validatedSignal);
          } else {
            rejectedCount++;
            console.log(
              `Signal ${signal.id} rejected for agent ${agent.name}: ${validationResult.rejectionReasons.join(', ')}`
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
            llmValidationScore: validationResult.llmValidationScore,
            winProbability: validationResult.winProbability,
            reasoning: validationResult.reasoning,
            rejectionReasons: validationResult.rejectionReasons,
            riskRewardRatio: validationResult.riskRewardRatio,
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
        totalAgents: activeAgents.length,
        validatedAgents: validatedCount,
        rejectedAgents: rejectedCount,
        timestamp: new Date(),
      });

      console.log(
        `Broadcast complete: ${validatedCount} validated, ${rejectedCount} rejected out of ${activeAgents.length} agents`
      );

      // Log the broadcast to database
      await signalDatabaseLoggingService.logBroadcastedSignal({
        signalId: signal.id,
        symbol: signal.symbol,
        recommendation: signal.recommendation,
        confidence: signal.confidence,
        category: signal.category,
        reasoning: signal.reasoning,
        targetPrice: signal.targetPrice,
        stopLoss: signal.stopLoss,
        totalAgentsConsidered: activeAgents.length,
        totalAgentsEligible: activeAgents.length, // Will be updated later with exclusion logic
        validatedAgents: validatedCount,
        rejectedAgents: rejectedCount,
        excludedAgents: 0, // Will be updated later with exclusion logic
        broadcastedAt: new Date()
      });

      return {
        totalAgents: activeAgents.length,
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
}

export const signalBroadcastService = new SignalBroadcastService();
