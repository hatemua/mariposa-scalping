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

interface ValidationResult {
  isValid: boolean;
  llmValidationScore: number;
  winProbability: number;
  reasoning: string;
  rejectionReasons: string[];
  riskRewardRatio: number;
  marketConditions: {
    liquidity: 'HIGH' | 'MEDIUM' | 'LOW';
    spread: number;
    volatility: number;
  };
  positionSize?: number; // Calculated position size in USDT
  availableBalance?: number; // Agent's current available balance
}

export class SignalValidationService {
  /**
   * Validate a signal using LLM analysis and agent configuration
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

      const rejectionReasons: string[] = [];

      // Step 1: Check if agent's LLM validation is enabled
      if (!agent.enableLLMValidation) {
        return {
          isValid: true,
          llmValidationScore: 100,
          winProbability: signal.confidence,
          reasoning: 'LLM validation disabled for this agent',
          rejectionReasons: [],
          riskRewardRatio: 0,
          marketConditions: {
            liquidity: 'MEDIUM',
            spread: 0,
            volatility: 0,
          },
        };
      }

      // Step 2: Check signal category compatibility (intelligent agents)
      if (agent.allowedSignalCategories && agent.allowedSignalCategories.length > 0 && signal.category) {
        if (!agent.allowedSignalCategories.includes(signal.category)) {
          rejectionReasons.push(
            `Signal category '${signal.category}' not compatible with agent category '${agent.category}'`
          );
        }
      }

      // Step 3: Check current open positions
      const openPositions = await this.getAgentOpenPositions(agentId);
      if (openPositions >= agent.maxOpenPositions) {
        rejectionReasons.push(
          `Agent has reached max open positions (${agent.maxOpenPositions})`
        );
      }

      // Step 4: Calculate available balance
      const { availableBalance, totalAllocated } = await this.getAgentBalance(agent);
      if (availableBalance < 10) {
        // Minimum $10 per trade
        rejectionReasons.push(
          `Insufficient available balance: $${availableBalance.toFixed(2)} (min $10 required)`
        );
      }

      // Step 5: Calculate position size based on available balance and risk level
      const positionSize = this.calculatePositionSize(agent, availableBalance);

      // Step 6: Check agent performance (stop if too many losses)
      const recentPerformance = await this.getRecentPerformance(agentId);
      if (recentPerformance.consecutiveLosses >= 5) {
        rejectionReasons.push(
          `Agent has ${recentPerformance.consecutiveLosses} consecutive losses - pausing trading`
        );
      }

      // Step 7: Check drawdown limits based on risk level
      const maxDrawdownThreshold = this.getMaxDrawdownThreshold(agent.riskLevel);
      if (agent.performance.maxDrawdown < maxDrawdownThreshold) {
        rejectionReasons.push(
          `Agent exceeded max drawdown limit: $${agent.performance.maxDrawdown} (threshold: $${maxDrawdownThreshold})`
        );
      }

      // Step 8: Get market conditions from OKX
      const marketConditions = await this.getMarketConditions(
        signal.symbol,
        agent.userId.toString()
      );

      // Step 9: LLM-based signal validation (intelligent agents)
      const llmValidation = await this.llmValidateSignal(signal, agent, marketConditions, positionSize);

      // Step 10: Check if LLM confidence meets minimum threshold
      if (llmValidation.winProbability < agent.minLLMConfidence) {
        rejectionReasons.push(
          `LLM win probability (${(llmValidation.winProbability * 100).toFixed(1)}%) below minimum confidence (${(agent.minLLMConfidence * 100).toFixed(1)}%)`
        );
      }

      // Step 11: Calculate risk/reward ratio
      const riskRewardRatio = this.calculateRiskReward(signal, agent);

      // Risk/reward threshold varies by risk level (1=conservative, 5=aggressive)
      const minRiskReward = [3.0, 2.5, 2.0, 1.5, 1.2][agent.riskLevel - 1];
      if (riskRewardRatio < minRiskReward) {
        rejectionReasons.push(
          `Risk/reward ratio (${riskRewardRatio.toFixed(2)}) too low for risk level ${agent.riskLevel} (min ${minRiskReward})`
        );
      }

      // Step 12: Check liquidity based on agent category
      if (marketConditions.liquidity === 'LOW') {
        if (agent.category === 'SCALPING') {
          rejectionReasons.push('Low liquidity detected - not suitable for scalping');
        } else if (agent.riskLevel <= 2) {
          rejectionReasons.push('Low liquidity detected - not suitable for conservative trading');
        }
      }

      const isValid = rejectionReasons.length === 0;

      return {
        isValid,
        llmValidationScore: llmValidation.score,
        winProbability: llmValidation.winProbability,
        reasoning: llmValidation.reasoning,
        rejectionReasons,
        riskRewardRatio,
        marketConditions,
        positionSize,
        availableBalance,
      };
    } catch (error) {
      console.error('Error validating signal:', error);
      throw error;
    }
  }

  /**
   * Use LLM to analyze the signal and predict win probability (intelligent agents)
   */
  private async llmValidateSignal(
    signal: ValidationSignal,
    agent: any,
    marketConditions: any,
    positionSize: number
  ): Promise<{
    score: number;
    winProbability: number;
    reasoning: string;
  }> {
    try {
      const prompt = `You are an expert crypto trading analyst. Analyze this trading signal for an intelligent AI trading agent and provide a win probability assessment.

Signal Details:
- Symbol: ${signal.symbol}
- Recommendation: ${signal.recommendation}
- Category: ${signal.category || 'UNKNOWN'}
- Entry Price: ${signal.targetPrice || 'Market Price'}
- Stop Loss: ${signal.stopLoss || 'Dynamic'}
- Initial Confidence: ${(signal.confidence * 100).toFixed(1)}%
- Reasoning: ${signal.reasoning}

Intelligent Agent Profile:
- Category: ${agent.category} (trading style)
- Risk Level: ${agent.riskLevel}/5 (1=Very Conservative, 5=Very Aggressive)
- Budget: $${agent.budget} USDT
- Position Size: $${positionSize.toFixed(2)} USDT for this trade
- Min Confidence Required: ${(agent.minLLMConfidence * 100).toFixed(0)}%
- Max Open Positions: ${agent.maxOpenPositions}
- Allowed Signal Types: ${agent.allowedSignalCategories?.join(', ') || 'ALL'}

Market Conditions:
- Liquidity: ${marketConditions.liquidity}
- Spread: ${marketConditions.spread.toFixed(4)}%
- Volatility: ${marketConditions.volatility.toFixed(2)}%

Analyze the following as an experienced trader:
1. Does this signal align with the agent's ${agent.category} trading category?
2. Is the signal category compatible with the agent's allowed types?
3. Given the agent's risk level (${agent.riskLevel}/5), is this trade appropriate?
4. Are market conditions favorable for this position size ($${positionSize.toFixed(2)})?
5. What is the realistic probability of profit on this trade?
6. What entry, exit, stop-loss, and take-profit levels would you recommend?

Respond in JSON format:
{
  "winProbability": <number between 0 and 1>,
  "score": <validation score 0-100>,
  "reasoning": "<detailed analysis in 2-3 sentences explaining why this trade matches or doesn't match the agent's profile>",
  "recommendedEntry": <number or null>,
  "recommendedStopLoss": <number or null>,
  "recommendedTakeProfit": <number or null>,
  "keyRisks": ["<risk1>", "<risk2>"],
  "keyOpportunities": ["<opportunity1>", "<opportunity2>"]
}`;

      const analysis = await aiAnalysisService.analyzeWithLLM(prompt, signal.symbol);

      // Parse the LLM response
      try {
        const result = JSON.parse(analysis);
        return {
          score: Math.min(100, Math.max(0, result.score || 50)),
          winProbability: Math.min(1, Math.max(0, result.winProbability || 0.5)),
          reasoning: result.reasoning || analysis,
        };
      } catch (parseError) {
        // Fallback if JSON parsing fails
        console.warn('Failed to parse LLM response, using fallback');
        return {
          score: signal.confidence * 100,
          winProbability: signal.confidence,
          reasoning: analysis.substring(0, 500),
        };
      }
    } catch (error) {
      console.error('LLM validation error:', error);
      // Return conservative estimate on error
      return {
        score: 50,
        winProbability: 0.5,
        reasoning: 'LLM validation unavailable - using default confidence',
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
   * Calculate risk/reward ratio (intelligent agents)
   */
  private calculateRiskReward(signal: ValidationSignal, agent: any): number {
    if (!signal.targetPrice || !signal.stopLoss) {
      // If no specific targets, estimate based on agent's risk level
      // Higher risk = willing to accept lower R/R ratios
      return agent.riskLevel <= 2 ? 2.5 : agent.riskLevel <= 3 ? 2.0 : 1.5;
    }

    const entry = signal.targetPrice;
    const stop = signal.stopLoss;

    // Estimate target based on agent config or use default multiplier
    let target: number;
    if (agent.config?.takeProfitPercentage) {
      target = entry * (1 + agent.config.takeProfitPercentage / 100);
    } else {
      // Default: risk level determines profit target (conservative = higher targets)
      const profitMultiplier = [1.03, 1.025, 1.02, 1.015, 1.01][agent.riskLevel - 1];
      target = entry * profitMultiplier;
    }

    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);

    return risk > 0 ? reward / risk : 0;
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
   * Calculate position size based on agent's risk level and available balance
   */
  private calculatePositionSize(agent: any, availableBalance: number): number {
    // Position size as percentage of available balance based on risk level
    // Risk 1 (Very Conservative): 10% per trade
    // Risk 2 (Conservative): 15% per trade
    // Risk 3 (Moderate): 20% per trade
    // Risk 4 (Aggressive): 30% per trade
    // Risk 5 (Very Aggressive): 40% per trade
    const positionPercentages = [0.10, 0.15, 0.20, 0.30, 0.40];
    const percentage = positionPercentages[agent.riskLevel - 1] || 0.20;

    const positionSize = availableBalance * percentage;

    // Ensure minimum position size of $10 and maximum of available balance
    return Math.max(10, Math.min(positionSize, availableBalance));
  }

  /**
   * Get max drawdown threshold based on risk level
   */
  private getMaxDrawdownThreshold(riskLevel: number): number {
    // Risk 1 (Very Conservative): -5% max drawdown
    // Risk 2 (Conservative): -10% max drawdown
    // Risk 3 (Moderate): -15% max drawdown
    // Risk 4 (Aggressive): -25% max drawdown
    // Risk 5 (Very Aggressive): -40% max drawdown
    const drawdownPercentages = [-0.05, -0.10, -0.15, -0.25, -0.40];
    return drawdownPercentages[riskLevel - 1] || -0.15;
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
