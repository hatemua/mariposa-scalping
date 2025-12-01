import { redisService } from './redisService';
import { signalValidationService } from './signalValidationService';
import { signalDatabaseLoggingService } from './signalDatabaseLoggingService';
import { telegramService } from './telegramService';
import { validatedSignalExecutor } from './validatedSignalExecutor';
import { ScalpingAgent } from '../models';

interface BroadcastSignal {
  id: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  entryPrice?: number;
  reasoning: string;
  category?: string;
  priority: number;
  timestamp: Date;
  // NEW: Quality score from signal generation (bypass LLM validation)
  qualityScore?: {
    total: number;
    grade: 'A' | 'B' | 'C' | 'D';
    positionSizeMultiplier: number;
  };
  positionSizeMultiplier?: number; // Final multiplier including HTF adjustments
}

// Base position size for grade-based trading
const BASE_POSITION_SIZE_USD = 800;

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
  category?: string; // NEW: Signal category for priority routing
  // Execution parameters from LLM validation
  positionSize: number;
  positionSizePercent: number;
  riskLevel: 'SAFE' | 'MODERATE' | 'RISKY'; // Risk classification for position sizing
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  recommendedEntry: number | null;
  keyRisks: string[];
  keyOpportunities: string[];
  // NEW: Quality score fields (for bypassing LLM validation)
  qualityGrade?: 'A' | 'B' | 'C' | 'D';
  llmConsensus?: any; // Pass through from original signal
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
      console.log(`\n[DEBUG] ========== SIGNAL BROADCAST START ==========`);
      console.log(`[DEBUG] Broadcasting signal ${signal.id}:`, {
        symbol: signal.symbol,
        category: signal.category,
        recommendation: signal.recommendation,
        confidence: (signal.confidence * 100).toFixed(1) + '%',
        entryPrice: signal.entryPrice,
        timestamp: signal.timestamp
      });

      // Get ALL agents (including inactive) to track exclusions
      const allAgents = await ScalpingAgent.find({});

      console.log(`[DEBUG] Found ${allAgents.length} total agents in system`);

      // Count MT4 agents specifically
      const mt4Agents = allAgents.filter(a => a.broker === 'MT4');
      const mt4ActiveAgents = mt4Agents.filter(a => a.isActive);
      console.log(`[DEBUG] MT4 agents: ${mt4Agents.length} total, ${mt4ActiveAgents.length} active`);

      const eligibleAgents: any[] = [];
      const validatedSignals: ValidatedSignalForAgent[] = [];
      let validatedCount = 0;
      let rejectedCount = 0;
      let excludedCount = 0;

      // FIRST PASS: Filter eligibility and log exclusions
      for (const agent of allAgents) {
        console.log(`🔍 [DEBUG] Checking eligibility for agent: ${agent.name} (${agent.broker}) | Category: ${agent.category} | Active: ${agent.isActive} | Allowed categories: [${agent.allowedSignalCategories?.join(', ') || 'none'}]`);

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

          console.log(`❌ [DEBUG] Agent ${agent.name} EXCLUDED: ${exclusionReasons.join(', ')}`);
        } else {
          // Agent is ELIGIBLE
          console.log(`✅ [DEBUG] Agent ${agent.name} ELIGIBLE for signal ${signal.id}`);
          eligibleAgents.push(agent);
        }
      }

      const eligibleMT4Agents = eligibleAgents.filter(a => a.broker === 'MT4');
      console.log(`[DEBUG] Eligible agents: ${eligibleAgents.length} (${eligibleMT4Agents.length} MT4), Excluded: ${excludedCount}`);

      // SECOND PASS: Validate signal for each eligible agent
      // BYPASS LLM validation if qualityScore is present (signal already validated by 4 LLMs)
      const bypassLLMValidation = !!(signal.category === 'FIBONACCI_SCALPING' && signal.qualityScore);

      // CRITICAL FIX: Process MT4 agents SEQUENTIALLY to prevent race conditions
      // The RiskManager uses mutex locks, but sequential processing ensures
      // position limits are enforced properly between checks
      const mt4EligibleAgents = eligibleAgents.filter(a => a.broker === 'MT4');
      const nonMT4EligibleAgents = eligibleAgents.filter(a => a.broker !== 'MT4');

      if (bypassLLMValidation) {
        console.log(`⚡ BYPASSING LLM validation - signal already validated by 4 LLMs (Grade ${signal.qualityScore?.grade})`);
      }

      // Process MT4 agents SEQUENTIALLY (prevents race conditions)
      if (mt4EligibleAgents.length > 0) {
        console.log(`🔒 Processing ${mt4EligibleAgents.length} MT4 agents SEQUENTIALLY to prevent race conditions`);

        for (const agent of mt4EligibleAgents) {
          const result = await this.processAgentSignal(agent, signal, bypassLLMValidation);
          if (result) {
            validatedSignals.push(result);
            if (result.isValid) {
              validatedCount++;
            } else {
              rejectedCount++;
            }
          }
        }
      }

      // Process non-MT4 agents in batches (parallel is OK for other brokers)
      if (nonMT4EligibleAgents.length > 0) {
        console.log(`🔄 Processing ${nonMT4EligibleAgents.length} non-MT4 agents in parallel batches`);

        const batchSize = bypassLLMValidation ? 5 : 3;

        for (let i = 0; i < nonMT4EligibleAgents.length; i += batchSize) {
          const batch = nonMT4EligibleAgents.slice(i, i + batchSize);
          const batchPromises = batch.map(agent => this.processAgentSignal(agent, signal, bypassLLMValidation));

          // Process batch concurrently
          const batchResults = await Promise.all(batchPromises);

          // Collect results
          for (const result of batchResults) {
            if (result) {
              validatedSignals.push(result);
              if (result.isValid) {
                validatedCount++;
              } else {
                rejectedCount++;
              }
            }
          }

          // Small delay between batches to prevent LLM API rate limiting
          // Skip delay for last batch
          if (i + batchSize < nonMT4EligibleAgents.length) {
            await new Promise(resolve => setTimeout(resolve, 400)); // 400ms between batches
            console.log(`  Processed batch ${Math.floor(i / batchSize) + 1}, waiting 400ms before next batch...`);
          }
        }
      }

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

      const validatedMT4Agents = validatedSignals.filter(s => {
        const agent = eligibleAgents.find(a => a._id.toString() === s.agentId);
        return agent?.broker === 'MT4';
      });

      console.log(`[DEBUG] ========== SIGNAL BROADCAST COMPLETE ==========`);
      console.log(`[DEBUG] Broadcast summary for signal ${signal.id}:`, {
        symbol: signal.symbol,
        category: signal.category,
        recommendation: signal.recommendation,
        totalAgents: allAgents.length,
        eligibleAgents: eligibleAgents.length,
        excludedAgents: excludedCount,
        validatedAgents: validatedCount,
        validatedMT4Agents: validatedMT4Agents.length,
        rejectedAgents: rejectedCount
      });
      console.log(`[DEBUG] ==================================================\n`);

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

      // Send Telegram notification if enabled
      // Only send for high-priority signals or signals validated by multiple agents
      // Skip Telegram for MT4-only signals (MT4 executes immediately without notification)
      const mt4AgentIds = mt4Agents.map((a: any) => a._id.toString());
      const hasNonMT4Validated = validatedSignals.some(s => !mt4AgentIds.includes(s.agentId));
      const shouldNotify = (signal.priority >= 70 || validatedCount >= 2) && hasNonMT4Validated;

      if (shouldNotify) {
        try {
          // Get entry price from validated signals or fetch current market price
          let entryPrice = signal.entryPrice;

          if (!entryPrice) {
            // Try to get entry price from validated signals
            const validSignal = validatedSignals.find(s => s && s.recommendedEntry);
            if (validSignal?.recommendedEntry) {
              entryPrice = validSignal.recommendedEntry;
            } else {
              // Fetch current market price as fallback
              try {
                const { binanceService } = await import('./binanceService');
                const marketData = await binanceService.getSymbolInfo(signal.symbol);
                entryPrice = parseFloat(marketData.lastPrice || marketData.price || '0');
              } catch (error) {
                console.warn('Failed to fetch entry price for Telegram notification:', error);
              }
            }
          }

          console.log(`📱 Sending Telegram notification: ${signal.symbol} (priority: ${signal.priority}, validated: ${validatedCount}/${allAgents.length})`);
          await telegramService.sendSignalNotification(
            { ...signal, entryPrice },
            {
              totalAgents: allAgents.length,
              validatedAgents: validatedCount,
              rejectedAgents: rejectedCount
            }
          );
          console.log(`✅ Telegram notification sent successfully for ${signal.symbol}`);
        } catch (error: any) {
          console.error(`❌ Error sending Telegram notification (non-critical) for ${signal.symbol}:`, error.message);
          // Don't throw - Telegram failures shouldn't break trading
        }
      } else {
        console.log(`📱 Telegram notification skipped for ${signal.symbol}: priority=${signal.priority} (need ≥70), validated=${validatedCount} (need ≥2)`);
      }

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
   * NEW: Fibonacci signals get priority queue routing
   */
  private async queueValidatedSignal(validatedSignal: ValidatedSignalForAgent): Promise<void> {
    const priority = validatedSignal.llmValidationScore;

    // Determine queue based on signal category (Fibonacci signals get priority)
    const queueName = validatedSignal.category === 'FIBONACCI_SCALPING'
      ? 'fibonacci_priority_signals'
      : this.VALIDATED_SIGNALS_QUEUE;

    await redisService.enqueue(queueName, {
      id: `${validatedSignal.signalId}:${validatedSignal.agentId}`,
      data: validatedSignal,
      timestamp: Date.now(),
      priority,
    });

    // Cache the validated signal
    const key = `validated_signal:${validatedSignal.agentId}:${validatedSignal.signalId}`;
    await redisService.set(key, validatedSignal, { ttl: 3600 });

    console.log(
      `✅ Queued ${validatedSignal.category || 'signal'} to ${queueName === 'fibonacci_priority_signals' ? 'PRIORITY' : 'regular'} queue for agent ${validatedSignal.agentName} (priority: ${priority})`
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

    // DEBUG: Log agent details for MT4 agents
    if (agent.broker === 'MT4') {
      console.log(`[DEBUG] Checking eligibility for MT4 agent ${agent.name} (${agent._id}):`, {
        isActive: agent.isActive,
        category: agent.category,
        broker: agent.broker,
        allowedSignalCategories: agent.allowedSignalCategories,
        signalCategory: signal.category,
        signalSymbol: signal.symbol,
        signalRecommendation: signal.recommendation
      });
    }

    // Check 1: Is agent active?
    if (!agent.isActive) {
      reasons.push(`Agent not active (status: STOPPED)`);
      console.log(`[DEBUG] ❌ Agent ${agent.name} rejected: not active`);
      return reasons; // Skip other checks if inactive
    }

    // Check 2: Category compatibility (for intelligent agents)
    if (signal.category && agent.allowedSignalCategories && agent.allowedSignalCategories.length > 0) {
      if (!agent.allowedSignalCategories.includes(signal.category)) {
        const reason = `Signal category '${signal.category}' not in allowed [${agent.allowedSignalCategories.join(', ')}]`;
        reasons.push(reason);
        console.log(`[DEBUG] ❌ Agent ${agent.name} rejected: ${reason}`);
      }
    }

    // Check 3: Available balance
    try {
      const balance = await this.getAgentAvailableBalance(agent);
      if (balance < 10) {
        const reason = `Insufficient balance: $${balance.toFixed(2)} (min $10)`;
        reasons.push(reason);
        console.log(`[DEBUG] ❌ Agent ${agent.name} rejected: ${reason}`);
      }
    } catch (error) {
      console.error(`Error checking balance for agent ${agent.name}:`, error);
      reasons.push('Failed to check balance');
    }

    // Check 4: Max open positions
    try {
      const openPositions = await this.getAgentOpenPositions((agent._id as any).toString());
      if (openPositions >= agent.maxOpenPositions) {
        const reason = `Max open positions reached (${openPositions}/${agent.maxOpenPositions})`;
        reasons.push(reason);
        console.log(`[DEBUG] ❌ Agent ${agent.name} rejected: ${reason}`);
      }
    } catch (error) {
      console.error(`Error checking open positions for agent ${agent.name}:`, error);
    }

    // Check 5: Signal confidence vs agent minimum
    if (agent.minLLMConfidence && signal.confidence < agent.minLLMConfidence) {
      const reason = `Signal confidence ${(signal.confidence * 100).toFixed(0)}% below min ${(agent.minLLMConfidence * 100).toFixed(0)}%`;
      reasons.push(reason);
      console.log(`[DEBUG] ❌ Agent ${agent.name} rejected: ${reason}`);
    }

    // DEBUG: Log if agent passed all checks
    if (reasons.length === 0 && agent.broker === 'MT4') {
      console.log(`[DEBUG] ✅ Agent ${agent.name} PASSED all eligibility checks`);
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

  /**
   * Process a single agent's signal validation and execution
   * Extracted to allow both sequential (MT4) and parallel (non-MT4) processing
   */
  private async processAgentSignal(
    agent: any,
    signal: BroadcastSignal,
    bypassLLMValidation: boolean
  ): Promise<ValidatedSignalForAgent | null> {
    try {
      let validatedSignal: ValidatedSignalForAgent;
      let isValid = false;

      if (bypassLLMValidation && signal.qualityScore) {
        // FAST PATH: Bypass LLM validation, use quality score directly
        // Calculate position size: $800 base * positionSizeMultiplier
        const multiplier = signal.positionSizeMultiplier || signal.qualityScore.positionSizeMultiplier || 1.0;
        const positionSize = BASE_POSITION_SIZE_USD * multiplier;

        console.log(`⚡ [FAST] Grade ${signal.qualityScore.grade} signal for ${agent.name}: $${positionSize.toFixed(0)} (${(multiplier * 100).toFixed(0)}% of $${BASE_POSITION_SIZE_USD})`);

        isValid = true;
        validatedSignal = {
          signalId: signal.id,
          agentId: (agent._id as any).toString(),
          agentName: agent.name,
          symbol: signal.symbol,
          recommendation: signal.recommendation,
          isValid: true,
          llmValidationScore: signal.qualityScore.total,
          winProbability: signal.confidence,
          reasoning: `Grade ${signal.qualityScore.grade} signal (score: ${signal.qualityScore.total}/100) - bypassed LLM validation`,
          rejectionReasons: [],
          riskRewardRatio: 0,
          timestamp: new Date(),
          category: signal.category,
          positionSize: positionSize,
          positionSizePercent: (multiplier * 100),
          riskLevel: signal.qualityScore.grade === 'A' ? 'SAFE' : 'MODERATE',
          stopLossPrice: signal.stopLoss || null,
          takeProfitPrice: signal.targetPrice || null,
          recommendedEntry: signal.entryPrice || null,
          keyRisks: [],
          keyOpportunities: [`Grade ${signal.qualityScore.grade} setup`],
          qualityGrade: signal.qualityScore.grade,
        };
      } else {
        // SLOW PATH: Use LLM validation service
        const validationSignal = {
          ...signal,
          agentId: (agent._id as any).toString(),
        };

        const validationResult = await signalValidationService.validateSignalForAgent(
          validationSignal,
          (agent._id as any).toString()
        );

        isValid = validationResult.isValid;
        validatedSignal = {
          signalId: signal.id,
          agentId: (agent._id as any).toString(),
          agentName: agent.name,
          symbol: signal.symbol,
          recommendation: signal.recommendation,
          isValid: validationResult.isValid,
          llmValidationScore: validationResult.confidence * 100,
          winProbability: validationResult.confidence,
          reasoning: validationResult.reasoning,
          rejectionReasons: validationResult.isValid ? [] : [validationResult.reasoning],
          riskRewardRatio: 0,
          timestamp: new Date(),
          category: signal.category,
          positionSize: validationResult.positionSize,
          positionSizePercent: validationResult.positionSizePercent,
          riskLevel: validationResult.riskLevel,
          stopLossPrice: validationResult.stopLossPrice,
          takeProfitPrice: validationResult.takeProfitPrice,
          recommendedEntry: validationResult.stopLossPrice,
          keyRisks: validationResult.keyRisks,
          keyOpportunities: validationResult.keyOpportunities,
        };
      }

      if (isValid) {
        // MT4 signals: Execute immediately without queueing (ultra-low latency)
        // Other brokers: Queue for execution (rate limiting, scheduling)
        if (agent.broker === 'MT4') {
          console.log(`🔍 [DEBUG] Validated MT4 signal for ${agent.name} (${agent.broker}): ${signal.symbol} ${signal.recommendation} | Category: ${signal.category} | Confidence: ${signal.confidence}`);
          await this.executeMT4SignalDirectly(agent, validatedSignal, signal);
        } else {
          await this.queueValidatedSignal(validatedSignal);
        }
      } else {
        console.log(
          `Signal ${signal.id} rejected for agent ${agent.name}: ${validatedSignal.reasoning}`
        );
      }

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
        isValid: validatedSignal.isValid,
        llmValidationScore: validatedSignal.llmValidationScore,
        winProbability: validatedSignal.winProbability,
        reasoning: validatedSignal.reasoning,
        rejectionReasons: validatedSignal.rejectionReasons,
        riskRewardRatio: 0,
        marketConditions: { liquidity: 'MEDIUM', spread: 0.1, volatility: 1.0 },
        positionSize: validatedSignal.positionSize,
        availableBalance: 0, // Not available in bypass mode
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
      return null;
    }
  }

  /**
   * Execute MT4 signal immediately without queueing
   * Called directly from validation loop for ultra-low latency execution
   */
  private async executeMT4SignalDirectly(
    agent: any,
    validatedSignal: ValidatedSignalForAgent,
    signal: BroadcastSignal
  ): Promise<void> {
    try {
      console.log(`⚡ IMMEDIATE MT4 EXECUTION (no queue): ${signal.symbol} for agent ${agent.name}`);

      // Call the validated signal executor's execute method directly
      // This bypasses the Redis queue entirely for instant execution
      await validatedSignalExecutor.executeSignalDirect(agent, validatedSignal, signal.symbol);

      console.log(`✅ MT4 signal executed immediately for ${agent.name}: ${signal.symbol}`);
    } catch (error) {
      console.error(`❌ Failed to execute MT4 signal directly for ${agent.name}:`, error);
      // Log the failure but don't throw - other agents should still process
    }
  }
}

export const signalBroadcastService = new SignalBroadcastService();
