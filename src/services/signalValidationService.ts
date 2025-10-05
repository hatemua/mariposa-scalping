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

      // Step 2: Check signal category compatibility
      if (agent.allowedSignalCategories.length > 0 && signal.category) {
        if (!agent.allowedSignalCategories.includes(signal.category)) {
          rejectionReasons.push(
            `Signal category '${signal.category}' not allowed for this agent`
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

      // Step 4: Check agent performance (stop if too many losses)
      const recentPerformance = await this.getRecentPerformance(agentId);
      if (recentPerformance.consecutiveLosses >= 5) {
        rejectionReasons.push(
          `Agent has ${recentPerformance.consecutiveLosses} consecutive losses - pausing trading`
        );
      }

      // Step 5: Check drawdown limits
      if (agent.performance.maxDrawdown < -1000) {
        // Example: -$1000 max drawdown
        rejectionReasons.push(
          `Agent exceeded max drawdown limit: $${agent.performance.maxDrawdown}`
        );
      }

      // Step 6: Get market conditions from OKX
      const marketConditions = await this.getMarketConditions(
        signal.symbol,
        agent.userId.toString()
      );

      // Step 7: LLM-based signal validation
      const llmValidation = await this.llmValidateSignal(signal, agent, marketConditions);

      // Step 8: Check if LLM confidence meets minimum threshold
      if (llmValidation.winProbability < agent.minLLMConfidence) {
        rejectionReasons.push(
          `LLM win probability (${(llmValidation.winProbability * 100).toFixed(1)}%) below minimum confidence (${(agent.minLLMConfidence * 100).toFixed(1)}%)`
        );
      }

      // Step 9: Calculate risk/reward ratio
      const riskRewardRatio = this.calculateRiskReward(signal, agent);
      if (riskRewardRatio < 1.5 && agent.riskTolerance === 'LOW') {
        rejectionReasons.push(
          `Risk/reward ratio (${riskRewardRatio.toFixed(2)}) too low for LOW risk tolerance`
        );
      }

      // Step 10: Check liquidity
      if (marketConditions.liquidity === 'LOW' && agent.tradingCategory === 'CONSERVATIVE') {
        rejectionReasons.push('Low liquidity detected - not suitable for conservative trading');
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
      };
    } catch (error) {
      console.error('Error validating signal:', error);
      throw error;
    }
  }

  /**
   * Use LLM to analyze the signal and predict win probability
   */
  private async llmValidateSignal(
    signal: ValidationSignal,
    agent: any,
    marketConditions: any
  ): Promise<{
    score: number;
    winProbability: number;
    reasoning: string;
  }> {
    try {
      const prompt = `You are an expert crypto trading analyst. Analyze this trading signal and provide a win probability assessment.

Signal Details:
- Symbol: ${signal.symbol}
- Recommendation: ${signal.recommendation}
- Entry Price: ${signal.targetPrice}
- Stop Loss: ${signal.stopLoss}
- Initial Confidence: ${(signal.confidence * 100).toFixed(1)}%
- Reasoning: ${signal.reasoning}

Agent Configuration:
- Strategy: ${agent.strategyType}
- Risk Tolerance: ${agent.riskTolerance}
- Trading Category: ${agent.tradingCategory}
- Stop Loss %: ${agent.config.stopLossPercentage}%
- Take Profit %: ${agent.config.takeProfitPercentage}%

Market Conditions:
- Liquidity: ${marketConditions.liquidity}
- Spread: ${marketConditions.spread.toFixed(4)}%
- Volatility: ${marketConditions.volatility.toFixed(2)}%

Analyze the following:
1. Does the signal align with the agent's strategy type?
2. Is the risk/reward favorable given the agent's configuration?
3. Are market conditions suitable for this trade?
4. What is the probability of this trade being profitable?
5. What are the main risks and opportunities?

Respond in JSON format:
{
  "winProbability": <number between 0 and 1>,
  "score": <validation score 0-100>,
  "reasoning": "<detailed analysis in 2-3 sentences>",
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
      const ticker = await okxService.getTicker(userId, symbol);

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
   * Calculate risk/reward ratio
   */
  private calculateRiskReward(signal: ValidationSignal, agent: any): number {
    if (!signal.targetPrice || !signal.stopLoss) {
      return 0;
    }

    const entry = signal.targetPrice;
    const stop = signal.stopLoss;
    const target = entry * (1 + agent.config.takeProfitPercentage / 100);

    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);

    return risk > 0 ? reward / risk : 0;
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
}

export const signalValidationService = new SignalValidationService();
