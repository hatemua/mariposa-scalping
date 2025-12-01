import { aiAnalysisService } from './aiAnalysisService';
import { okxService } from './okxService';
import { ScalpingAgent, Trade } from '../models';
import { redisService } from './redisService';

interface ValidationSignal {
  id: string;
  agentId: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  reasoning: string;
  category?: string;
  timestamp: Date;
}

interface LLMExecutionDecision {
  shouldExecute: boolean;
  riskLevel: 'SAFE' | 'MODERATE' | 'RISKY'; // Risk classification for position sizing
  reasoning: string;
  recommendedEntry: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  confidence: number; // 0-1
  keyRisks: string[];
  keyOpportunities: string[];
}

// Risk level to position size percentage mapping
const RISK_POSITION_SIZE: Record<string, number> = {
  'SAFE': 100,      // 100% of available margin - high confidence trades
  'MODERATE': 70,   // 70% of available margin - normal conditions
  'RISKY': 40       // 40% of available margin - uncertain conditions
};

interface ValidationResult {
  isValid: boolean;
  confidence: number;
  reasoning: string;
  positionSize: number; // Calculated position size in USDT
  positionSizePercent: number; // Percentage of available balance
  riskLevel: 'SAFE' | 'MODERATE' | 'RISKY'; // Risk classification
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  keyRisks: string[];
  keyOpportunities: string[];
  marketConditions: {
    liquidity: 'HIGH' | 'MEDIUM' | 'LOW';
    spread: number;
    volatility: number;
  };
  availableBalance: number;
  openPositions: number;
  agentHealth: {
    consecutiveLosses: number;
    recentWinRate: number;
    currentDrawdown: number;
  };
}

export class SignalValidationService {
  /**
   * Validate a signal using LLM-only decision making
   * LLM receives ALL context and makes unified execution decision
   */
  async validateSignalForAgent(
    signal: ValidationSignal,
    agentId: string
  ): Promise<ValidationResult> {
    try {
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Step 1: Check if agent has LLM validation enabled
      // If disabled, use simple validation (faster, cheaper)
      if (!agent.enableLLMValidation) {
        const { availableBalance } = await this.getAgentBalance(agent);
        const openPositions = await this.getAgentOpenPositions(agentId);

        // Simple validation: just check balance and positions
        // Use 70% of available balance (MODERATE risk) when LLM validation is disabled
        const positionSizePercent = RISK_POSITION_SIZE['MODERATE'];
        const positionSize = availableBalance * (positionSizePercent / 100);

        return {
          isValid: availableBalance >= 10 && openPositions < agent.maxOpenPositions,
          confidence: signal.confidence,
          reasoning: availableBalance < 10
            ? `Insufficient balance: $${availableBalance.toFixed(2)}`
            : openPositions >= agent.maxOpenPositions
            ? `Max positions reached: ${openPositions}/${agent.maxOpenPositions}`
            : 'LLM validation disabled - using basic validation',
          positionSize,
          positionSizePercent,
          riskLevel: 'MODERATE' as const,
          stopLossPrice: signal.stopLoss || null,
          takeProfitPrice: signal.targetPrice || null,
          keyRisks: [],
          keyOpportunities: [],
          marketConditions: {
            liquidity: 'MEDIUM',
            spread: 0.1,
            volatility: 1.0,
          },
          availableBalance,
          openPositions,
          agentHealth: {
            consecutiveLosses: 0,
            recentWinRate: 0,
            currentDrawdown: 0,
          },
        };
      }

      // Step 2: Gather all context data for LLM validation
      const { availableBalance, totalAllocated } = await this.getAgentBalance(agent);
      const openPositions = await this.getAgentOpenPositions(agentId);
      const recentPerformance = await this.getRecentPerformance(agentId);
      const marketConditions = await this.getMarketConditions(signal.symbol, agent.userId.toString());

      // Step 3: Check ONLY critical safety rules (hard stops)
      if (availableBalance < 10) {
        return {
          isValid: false,
          confidence: 0,
          reasoning: `Cannot execute: Insufficient available balance ($${availableBalance.toFixed(2)}, minimum $10 required)`,
          positionSize: 0,
          positionSizePercent: 0,
          riskLevel: 'RISKY' as const,
          stopLossPrice: null,
          takeProfitPrice: null,
          keyRisks: ['Insufficient funds'],
          keyOpportunities: [],
          marketConditions,
          availableBalance,
          openPositions,
          agentHealth: {
            consecutiveLosses: recentPerformance.consecutiveLosses,
            recentWinRate: recentPerformance.recentWinRate,
            currentDrawdown: agent.performance.maxDrawdown,
          },
        };
      }

      if (openPositions >= agent.maxOpenPositions) {
        return {
          isValid: false,
          confidence: 0,
          reasoning: `Cannot execute: Agent has reached maximum open positions (${openPositions}/${agent.maxOpenPositions})`,
          positionSize: 0,
          positionSizePercent: 0,
          riskLevel: 'RISKY' as const,
          stopLossPrice: null,
          takeProfitPrice: null,
          keyRisks: ['Max positions reached'],
          keyOpportunities: [],
          marketConditions,
          availableBalance,
          openPositions,
          agentHealth: {
            consecutiveLosses: recentPerformance.consecutiveLosses,
            recentWinRate: recentPerformance.recentWinRate,
            currentDrawdown: agent.performance.maxDrawdown,
          },
        };
      }

      // Step 4: Let LLM make the unified execution decision
      const llmDecision = await this.getLLMExecutionDecision(
        signal,
        agent,
        availableBalance,
        openPositions,
        recentPerformance,
        marketConditions
      );

      // Step 5: Calculate actual position size from LLM's risk classification
      const riskLevel = llmDecision.riskLevel || 'MODERATE';
      const positionSizePercent = RISK_POSITION_SIZE[riskLevel] || 70;
      const positionSize = availableBalance * (positionSizePercent / 100);

      console.log(`📊 Risk Level: ${riskLevel} → Position Size: ${positionSizePercent}% ($${positionSize.toFixed(2)})`);

      return {
        isValid: llmDecision.shouldExecute,
        confidence: llmDecision.confidence,
        reasoning: llmDecision.reasoning,
        positionSize: Math.min(positionSize, availableBalance), // Never exceed available balance
        positionSizePercent,
        riskLevel,
        stopLossPrice: llmDecision.stopLossPrice,
        takeProfitPrice: llmDecision.takeProfitPrice,
        keyRisks: llmDecision.keyRisks,
        keyOpportunities: llmDecision.keyOpportunities,
        marketConditions,
        availableBalance,
        openPositions,
        agentHealth: {
          consecutiveLosses: recentPerformance.consecutiveLosses,
          recentWinRate: recentPerformance.recentWinRate,
          currentDrawdown: agent.performance.maxDrawdown,
        },
      };
    } catch (error) {
      console.error('Error validating signal:', error);
      throw error;
    }
  }

  /**
   * Get LLM execution decision with full context
   * LLM decides: should execute, position size %, stop loss, take profit
   */
  private async getLLMExecutionDecision(
    signal: ValidationSignal,
    agent: any,
    availableBalance: number,
    openPositions: number,
    recentPerformance: any,
    marketConditions: any
  ): Promise<LLMExecutionDecision> {
    try {
      const prompt = `You are an expert crypto trading AI making execution decisions. Analyze this signal and decide if the agent should execute it.

SIGNAL:
- Symbol: ${signal.symbol}
- Recommendation: ${signal.recommendation}
- Category: ${signal.category || 'UNKNOWN'}
- Entry Price: ${signal.targetPrice || 'Market Price'}
- Stop Loss: ${signal.stopLoss || 'Not specified'}
- Initial Confidence: ${(signal.confidence * 100).toFixed(1)}%
- Reasoning: ${signal.reasoning}

AGENT PROFILE:
- Category: ${agent.category} (trading style)
- Risk Level: ${agent.riskLevel}/5 (1=Very Conservative, 5=Very Aggressive)
- Total Budget: $${agent.budget} USDT
- Available Balance: $${availableBalance.toFixed(2)} USDT
- Open Positions: ${openPositions}/${agent.maxOpenPositions}

AGENT HEALTH:
- Consecutive Losses: ${recentPerformance.consecutiveLosses}
- Recent Win Rate: ${(recentPerformance.recentWinRate * 100).toFixed(0)}%
- Recent P&L: $${recentPerformance.recentPnL.toFixed(2)}
- Current Drawdown: ${agent.performance.maxDrawdown.toFixed(2)}%
- Total Trades: ${agent.performance.totalTrades}

MARKET CONDITIONS:
- Liquidity: ${marketConditions.liquidity}
- Spread: ${marketConditions.spread.toFixed(4)}%
- Volatility: ${marketConditions.volatility.toFixed(2)}%

DECISION REQUIRED:
As an experienced trader, should this agent execute this signal?

Consider:
1. Is this trade appropriate for agent's ${agent.category} category and risk level ${agent.riskLevel}?
2. Is agent's health good enough to trade? (${recentPerformance.consecutiveLosses} consecutive losses, ${agent.performance.maxDrawdown.toFixed(1)}% drawdown)
3. Are market conditions favorable? (liquidity: ${marketConditions.liquidity}, spread: ${marketConditions.spread.toFixed(3)}%)
4. What is the overall RISK LEVEL of this trade?
5. What stop-loss and take-profit levels protect capital?

RISK CLASSIFICATION GUIDE:
- SAFE: Strong signal, good market conditions, low volatility, aligned with HTF trend, agent health is good
- MODERATE: Normal conditions, acceptable signal strength, minor concerns
- RISKY: Weak signal, high volatility, poor liquidity, counter-trend, agent health issues (consecutive losses/drawdown)

POSITION SIZING (based on risk level):
- SAFE: 100% of available margin (maximum position size)
- MODERATE: 70% of available margin
- RISKY: 40% of available margin

Respond in JSON format ONLY:
{
  "shouldExecute": <true or false>,
  "riskLevel": "SAFE" | "MODERATE" | "RISKY",
  "reasoning": "<2-3 sentences explaining your decision and risk classification>",
  "recommendedEntry": <price number or null>,
  "stopLossPrice": <price number or null>,
  "takeProfitPrice": <price number or null>,
  "confidence": <your confidence in this decision, 0-1>,
  "keyRisks": ["risk1", "risk2"],
  "keyOpportunities": ["opportunity1", "opportunity2"]
}`;

      const analysis = await aiAnalysisService.analyzeWithLLM(prompt, signal.symbol);

      // Parse the LLM response
      try {
        const result = JSON.parse(analysis);

        // Validate and normalize riskLevel
        const validRiskLevels = ['SAFE', 'MODERATE', 'RISKY'];
        let riskLevel: 'SAFE' | 'MODERATE' | 'RISKY' = 'MODERATE'; // Default to MODERATE

        if (result.riskLevel && validRiskLevels.includes(result.riskLevel.toUpperCase())) {
          riskLevel = result.riskLevel.toUpperCase() as 'SAFE' | 'MODERATE' | 'RISKY';
        }

        console.log(`🎯 LLM Risk Classification: ${riskLevel}`);

        return {
          shouldExecute: result.shouldExecute || false,
          riskLevel,
          reasoning: result.reasoning || 'No reasoning provided',
          recommendedEntry: result.recommendedEntry || signal.targetPrice || null,
          stopLossPrice: result.stopLossPrice || signal.stopLoss || null,
          takeProfitPrice: result.takeProfitPrice || null,
          confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
          keyRisks: Array.isArray(result.keyRisks) ? result.keyRisks : [],
          keyOpportunities: Array.isArray(result.keyOpportunities) ? result.keyOpportunities : [],
        };
      } catch (parseError) {
        // Fallback if JSON parsing fails - be conservative
        console.warn('Failed to parse LLM response, using conservative fallback');
        return {
          shouldExecute: false,
          riskLevel: 'RISKY' as const,
          reasoning: 'LLM response parsing failed - rejecting for safety',
          recommendedEntry: signal.targetPrice || null,
          stopLossPrice: signal.stopLoss || null,
          takeProfitPrice: null,
          confidence: 0,
          keyRisks: ['LLM parsing error'],
          keyOpportunities: [],
        };
      }
    } catch (error) {
      console.error('LLM execution decision error:', error);
      // Return conservative decision on error
      return {
        shouldExecute: false,
        riskLevel: 'RISKY' as const,
        reasoning: 'LLM unavailable - rejecting for safety',
        recommendedEntry: null,
        stopLossPrice: null,
        takeProfitPrice: null,
        confidence: 0,
        keyRisks: ['LLM error'],
        keyOpportunities: [],
      };
    }
  }

  /**
   * Get market conditions from OKX
   */
  private async getMarketConditions(
    symbol: string,
    userId: string
  ): Promise<{
    liquidity: 'HIGH' | 'MEDIUM' | 'LOW';
    spread: number;
    volatility: number;
  }> {
    try {
      // Try to get order book data from OKX
      const ticker = await okxService.getTicker(symbol);

      // Calculate spread
      const bid = parseFloat(ticker.bidPrice || '0');
      const ask = parseFloat(ticker.askPrice || '0');
      const spread = bid > 0 ? ((ask - bid) / bid) * 100 : 0;

      // Estimate liquidity based on volume
      const volume24h = parseFloat(ticker.volume24h || '0');
      let liquidity: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
      if (volume24h > 100000000) liquidity = 'HIGH'; // >$100M
      else if (volume24h < 10000000) liquidity = 'LOW'; // <$10M

      // Estimate volatility (simplified - should use historical data)
      const volatility = parseFloat(ticker.priceChangePercent || '0');

      return {
        liquidity,
        spread,
        volatility: Math.abs(volatility),
      };
    } catch (error) {
      console.error('Error getting market conditions:', error);
      return {
        liquidity: 'MEDIUM',
        spread: 0.1,
        volatility: 1.0,
      };
    }
  }

  /**
   * Get number of open positions for an agent
   */
  private async getAgentOpenPositions(agentId: string): Promise<number> {
    try {
      const openTrades = await Trade.countDocuments({
        agentId,
        status: 'pending',
      });
      return openTrades;
    } catch (error) {
      console.error('Error getting open positions:', error);
      return 0;
    }
  }

  /**
   * Get recent performance metrics
   */
  private async getRecentPerformance(
    agentId: string
  ): Promise<{
    consecutiveLosses: number;
    recentWinRate: number;
    recentPnL: number;
  }> {
    try {
      const recentTrades = await Trade.find({ agentId, status: 'filled' })
        .sort({ createdAt: -1 })
        .limit(20);

      let consecutiveLosses = 0;
      for (const trade of recentTrades) {
        if ((trade.pnl || 0) < 0) {
          consecutiveLosses++;
        } else {
          break;
        }
      }

      const winningTrades = recentTrades.filter(t => (t.pnl || 0) > 0).length;
      const recentWinRate = recentTrades.length > 0 ? winningTrades / recentTrades.length : 0;
      const recentPnL = recentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

      return {
        consecutiveLosses,
        recentWinRate,
        recentPnL,
      };
    } catch (error) {
      console.error('Error getting recent performance:', error);
      return {
        consecutiveLosses: 0,
        recentWinRate: 0,
        recentPnL: 0,
      };
    }
  }

  /**
   * Get agent's available balance (budget - allocated to open positions)
   */
  private async getAgentBalance(agent: any): Promise<{
    availableBalance: number;
    totalAllocated: number;
  }> {
    try {
      // Get all pending/open trades for this agent
      const openTrades = await Trade.find({
        agentId: agent._id,
        status: { $in: ['pending', 'filled'] },
      });

      // Calculate total allocated (position size of all open trades)
      const totalAllocated = openTrades.reduce((sum, trade) => {
        return sum + (trade.quantity * trade.price);
      }, 0);

      // Available balance = budget - allocated
      const availableBalance = Math.max(0, agent.budget - totalAllocated);

      return {
        availableBalance,
        totalAllocated,
      };
    } catch (error) {
      console.error('Error calculating agent balance:', error);
      return {
        availableBalance: agent.budget || 0,
        totalAllocated: 0,
      };
    }
  }

  /**
   * Cache validation result
   */
  async cacheValidationResult(
    signalId: string,
    agentId: string,
    result: ValidationResult
  ): Promise<void> {
    const key = `validation:${signalId}:${agentId}`;
    await redisService.set(key, result, { ttl: 3600 }); // 1 hour cache
  }

  /**
   * Get cached validation result
   */
  async getCachedValidationResult(
    signalId: string,
    agentId: string
  ): Promise<ValidationResult | null> {
    const key = `validation:${signalId}:${agentId}`;
    return await redisService.get(key);
  }

  /**
   * Check if position should be considered for early exit
   */
  async shouldMonitorForExit(agentId: string, position: any): Promise<boolean> {
    try {
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent || !agent.isActive) {
        return false;
      }

      // Always monitor if LLM validation is enabled
      if (agent.enableLLMValidation) {
        return true;
      }

      // Check if position has significant unrealized PnL
      const unrealizedPnLPercent = position.unrealizedPnLPercent || 0;

      // Monitor if in profit > 1% or loss > 2%
      if (unrealizedPnLPercent >= 1 || unrealizedPnLPercent <= -2) {
        return true;
      }

      // Check if position has been open for a while (based on agent category)
      const holdingTimeMinutes = position.holdingTime || 0;
      const categoryTimeThresholds = {
        'SCALPING': 30, // 30 minutes for scalping
        'DAY_TRADING': 240, // 4 hours for day trading
        'SWING': 1440, // 24 hours for swing
        'LONG_TERM': 10080, // 7 days for long term
        'ARBITRAGE': 5, // 5 minutes for arbitrage
        'ALL': 60 // 1 hour default
      };

      const threshold = categoryTimeThresholds[agent.category as keyof typeof categoryTimeThresholds] || 60;

      if (holdingTimeMinutes >= threshold) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking if should monitor for exit:', error);
      return false;
    }
  }
}

export const signalValidationService = new SignalValidationService();
