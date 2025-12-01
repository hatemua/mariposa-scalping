import { aiAnalysisService } from './aiAnalysisService';
import { positionMonitoringService } from './positionMonitoringService';
import { okxService } from './okxService';
import { redisService } from './redisService';
import { ScalpingAgent } from '../models';

interface ExitDecision {
  action: 'HOLD' | 'EXIT_NOW' | 'PARTIAL_EXIT' | 'EXIT_AT_TARGET';
  confidence: number;
  reasoning: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  // Exit parameters
  exitPercentage?: number; // For partial exits (0-100)
  suggestedExitPrice?: number;

  // Risk assessment
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  keyRisks: string[];
  keyOpportunities: string[];

  // Market analysis
  marketTrend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';

  timestamp: Date;
}

interface PositionContext {
  agentId: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  holdingTime: number; // minutes
  targetPrice?: number;
  stopLoss?: number;
}

export class LLMExitStrategyService {
  private readonly EXIT_DECISION_PREFIX = 'exit_decision:';

  /**
   * Calculate dynamic cache TTL based on position P&L state
   * - In profit > 1%: 60s (fast reaction to protect gains)
   * - Break-even (-0.5% to +0.5%): 120s
   * - Small loss (-0.5% to -1%): 150s
   * - Large loss < -1%: 180s (monitor but don't spam)
   */
  private getDynamicCacheTTL(unrealizedPnLPercent: number): number {
    if (unrealizedPnLPercent > 1.0) {
      return 60;  // In profit - fast reaction to protect gains
    } else if (unrealizedPnLPercent >= -0.5 && unrealizedPnLPercent <= 0.5) {
      return 120; // Break-even zone
    } else if (unrealizedPnLPercent > -1.0) {
      return 150; // Small loss
    } else {
      return 180; // Large loss - monitor but don't spam
    }
  }

  /**
   * Analyze a position and decide if/when to exit using LLM
   */
  async analyzeExitStrategy(
    agentId: string,
    position: PositionContext,
    marketConditions: any
  ): Promise<ExitDecision> {
    try {
      // Check cache first (don't spam LLM with same position)
      const cacheKey = `${this.EXIT_DECISION_PREFIX}${agentId}:${position.symbol}`;
      const cachedDecision = await redisService.get(cacheKey);
      if (cachedDecision) {
        return cachedDecision;
      }

      // Get agent configuration
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Build LLM prompt for exit analysis
      const decision = await this.getLLMExitDecision(agent, position, marketConditions);

      // Calculate dynamic TTL based on P&L state
      const dynamicTTL = this.getDynamicCacheTTL(position.unrealizedPnLPercent);

      // Cache the decision with dynamic TTL
      await redisService.set(cacheKey, decision, { ttl: dynamicTTL });

      // Log the decision with TTL info
      console.log(
        `Exit decision for ${agent.name} (${position.symbol}): ${decision.action} [PnL: ${position.unrealizedPnLPercent.toFixed(2)}%, TTL: ${dynamicTTL}s]`
      );

      return decision;
    } catch (error) {
      console.error('Error analyzing exit strategy:', error);

      // Return conservative decision on error
      return this.getConservativeExitDecision(position);
    }
  }

  /**
   * Use LLM to analyze position and recommend exit strategy
   */
  private async getLLMExitDecision(
    agent: any,
    position: PositionContext,
    marketConditions: any
  ): Promise<ExitDecision> {
    try {
      const holdingTimeHours = (position.holdingTime / 60).toFixed(1);
      const pnlSign = position.unrealizedPnL >= 0 ? '+' : '';

      const prompt = `You are an expert crypto trading analyst specializing in exit strategies. Analyze this open position and provide a clear recommendation on whether to exit now, hold for target, or take partial profits.

**Current Position:**
- Symbol: ${position.symbol}
- Side: ${position.side === 'buy' ? 'LONG' : 'SHORT'}
- Entry Price: $${position.entryPrice.toFixed(4)}
- Current Price: $${position.currentPrice.toFixed(4)}
- Position Size: ${position.quantity} (${position.quantity * position.currentPrice} USDT)
- Unrealized P&L: ${pnlSign}$${position.unrealizedPnL.toFixed(2)} (${pnlSign}${position.unrealizedPnLPercent.toFixed(2)}%)
- Holding Time: ${holdingTimeHours} hours
${position.targetPrice ? `- Target Price: $${position.targetPrice.toFixed(4)}` : ''}
${position.stopLoss ? `- Stop Loss: $${position.stopLoss.toFixed(4)}` : ''}

**Intelligent Agent Profile:**
- Category: ${agent.category}
- Risk Level: ${agent.riskLevel}/5 (1=Very Conservative, 5=Very Aggressive)
- Budget: $${agent.budget} USDT
- Min LLM Confidence: ${(agent.minLLMConfidence * 100).toFixed(0)}%

**Market Conditions:**
- Liquidity: ${marketConditions.liquidity}
- Spread: ${marketConditions.spread?.toFixed(4)}%
- Volatility: ${marketConditions.volatility?.toFixed(2)}%

**Critical Analysis Required:**

1. **Profit Protection:** We currently have ${position.unrealizedPnL >= 0 ? 'unrealized profit' : 'unrealized loss'}.
   - If in profit: Should we secure gains now or hold for larger target?
   - Risk of reversal vs. potential for more upside?

2. **Target Distance:** How close/far are we from target price?
   - Is the target still realistic given current market conditions?

3. **Market Momentum:** Is the current trend supporting our position?
   - Are there signs of reversal forming?
   - Is volatility increasing (risk) or decreasing (stable)?

4. **Agent Risk Profile:** This agent is ${agent.riskLevel === 1 ? 'very conservative' : agent.riskLevel === 5 ? 'very aggressive' : 'moderate'}.
   - Should we exit early to protect capital?
   - Or hold for maximum gains based on risk tolerance?

5. **Time-Based Analysis:** Position held for ${holdingTimeHours} hours.
   - For ${agent.category} strategy, is this duration appropriate?
   - Should we exit due to time decay of opportunity?

**Fear-Based Exit Scenario:**
Consider the trader's fear: "I have profit but market might reverse and I'll lose it all."
Should we exit now to lock in gains, or is this fear unfounded based on data?

Respond in JSON format:
{
  "action": "<HOLD | EXIT_NOW | PARTIAL_EXIT | EXIT_AT_TARGET>",
  "confidence": <0-100>,
  "reasoning": "<detailed 2-3 sentence explanation>",
  "urgency": "<LOW | MEDIUM | HIGH | CRITICAL>",
  "exitPercentage": <0-100, only for PARTIAL_EXIT>,
  "suggestedExitPrice": <number or null>,
  "riskLevel": "<LOW | MEDIUM | HIGH>",
  "keyRisks": ["<risk1>", "<risk2>", "<risk3>"],
  "keyOpportunities": ["<opp1>", "<opp2>"],
  "marketTrend": "<BULLISH | BEARISH | SIDEWAYS>",
  "volatility": "<LOW | MEDIUM | HIGH>"
}`;

      const analysis = await aiAnalysisService.analyzeWithLLM(prompt, position.symbol);

      // Parse LLM response
      try {
        const result = JSON.parse(analysis);

        return {
          action: result.action || 'HOLD',
          confidence: Math.min(100, Math.max(0, result.confidence || 50)) / 100,
          reasoning: result.reasoning || 'LLM analysis completed',
          urgency: result.urgency || 'MEDIUM',
          exitPercentage: result.exitPercentage,
          suggestedExitPrice: result.suggestedExitPrice || position.currentPrice,
          riskLevel: result.riskLevel || 'MEDIUM',
          keyRisks: result.keyRisks || [],
          keyOpportunities: result.keyOpportunities || [],
          marketTrend: result.marketTrend || 'SIDEWAYS',
          volatility: result.volatility || 'MEDIUM',
          timestamp: new Date()
        };
      } catch (parseError) {
        console.warn('Failed to parse LLM exit decision, using fallback');
        return this.getFallbackExitDecision(position, analysis);
      }
    } catch (error) {
      console.error('Error getting LLM exit decision:', error);
      return this.getConservativeExitDecision(position);
    }
  }

  /**
   * Get conservative exit decision when LLM fails
   */
  private getConservativeExitDecision(position: PositionContext): ExitDecision {
    // If in profit > 2%, recommend securing gains
    if (position.unrealizedPnLPercent >= 2) {
      return {
        action: 'PARTIAL_EXIT',
        confidence: 0.7,
        reasoning: 'LLM unavailable - securing 50% of position to protect profits',
        urgency: 'MEDIUM',
        exitPercentage: 50,
        suggestedExitPrice: position.currentPrice,
        riskLevel: 'MEDIUM',
        keyRisks: ['LLM analysis unavailable', 'Market uncertainty'],
        keyOpportunities: [],
        marketTrend: 'SIDEWAYS',
        volatility: 'MEDIUM',
        timestamp: new Date()
      };
    }

    // If in loss > 3%, recommend cutting losses
    if (position.unrealizedPnLPercent <= -3) {
      return {
        action: 'EXIT_NOW',
        confidence: 0.8,
        reasoning: 'LLM unavailable - position in significant loss, cutting to prevent further downside',
        urgency: 'HIGH',
        suggestedExitPrice: position.currentPrice,
        riskLevel: 'HIGH',
        keyRisks: ['Position in loss', 'LLM analysis unavailable'],
        keyOpportunities: [],
        marketTrend: 'BEARISH',
        volatility: 'MEDIUM',
        timestamp: new Date()
      };
    }

    // Otherwise hold
    return {
      action: 'HOLD',
      confidence: 0.6,
      reasoning: 'LLM unavailable - position within acceptable range, holding for target',
      urgency: 'LOW',
      riskLevel: 'MEDIUM',
      keyRisks: ['LLM analysis unavailable'],
      keyOpportunities: [],
      marketTrend: 'SIDEWAYS',
      volatility: 'MEDIUM',
      timestamp: new Date()
    };
  }

  /**
   * Get fallback decision from unparsed LLM response
   */
  private getFallbackExitDecision(position: PositionContext, analysis: string): ExitDecision {
    const lowerAnalysis = analysis.toLowerCase();

    // Try to infer action from text
    let action: ExitDecision['action'] = 'HOLD';
    let urgency: ExitDecision['urgency'] = 'MEDIUM';

    if (lowerAnalysis.includes('exit now') || lowerAnalysis.includes('sell now')) {
      action = 'EXIT_NOW';
      urgency = 'HIGH';
    } else if (lowerAnalysis.includes('partial') || lowerAnalysis.includes('take profit')) {
      action = 'PARTIAL_EXIT';
    } else if (lowerAnalysis.includes('hold') || lowerAnalysis.includes('wait')) {
      action = 'HOLD';
      urgency = 'LOW';
    }

    return {
      action,
      confidence: 0.5,
      reasoning: analysis.substring(0, 200),
      urgency,
      exitPercentage: action === 'PARTIAL_EXIT' ? 50 : undefined,
      suggestedExitPrice: position.currentPrice,
      riskLevel: 'MEDIUM',
      keyRisks: [],
      keyOpportunities: [],
      marketTrend: 'SIDEWAYS',
      volatility: 'MEDIUM',
      timestamp: new Date()
    };
  }

  /**
   * Execute exit decision
   */
  async executeExitDecision(
    agentId: string,
    tradeId: string,
    decision: ExitDecision,
    position: PositionContext
  ): Promise<boolean> {
    try {
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      if (decision.action === 'HOLD' || decision.action === 'EXIT_AT_TARGET') {
        console.log(`Not executing exit for ${position.symbol}: ${decision.action}`);
        return false;
      }

      // Calculate exit quantity
      let exitQuantity = position.quantity;
      if (decision.action === 'PARTIAL_EXIT' && decision.exitPercentage) {
        exitQuantity = position.quantity * (decision.exitPercentage / 100);
      }

      // Determine exit side (opposite of entry)
      const exitSide: 'buy' | 'sell' = position.side === 'buy' ? 'sell' : 'buy';

      // Execute the exit order
      console.log(
        `Executing ${decision.action} for ${agent.name}: ${exitSide} ${exitQuantity} ${position.symbol} @ market price`
      );

      await okxService.executeScalpingOrder(
        agent.userId.toString(),
        position.symbol,
        exitSide,
        exitQuantity,
        'market' // Use market orders for immediate exit
      );

      // Log the decision
      await this.logExitDecision(agentId, tradeId, decision, position);

      return true;
    } catch (error) {
      console.error('Error executing exit decision:', error);
      return false;
    }
  }

  /**
   * Log exit decision for analysis
   */
  private async logExitDecision(
    agentId: string,
    tradeId: string,
    decision: ExitDecision,
    position: PositionContext
  ): Promise<void> {
    const logKey = `exit_log:${agentId}:${tradeId}`;
    const logData = {
      agentId,
      tradeId,
      decision,
      position,
      timestamp: new Date()
    };

    await redisService.set(logKey, logData, { ttl: 86400 }); // 24 hours
  }

  /**
   * Get exit decision history for an agent
   */
  async getExitHistory(agentId: string, limit: number = 20): Promise<any[]> {
    try {
      const pattern = `exit_log:${agentId}:*`;
      const keys = await redisService.getKeysByPattern(pattern);

      const logs: any[] = [];
      for (const key of keys.slice(0, limit)) {
        const log = await redisService.get(key);
        if (log) {
          logs.push(log);
        }
      }

      return logs.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('Error getting exit history:', error);
      return [];
    }
  }
}

export const llmExitStrategyService = new LLMExitStrategyService();
