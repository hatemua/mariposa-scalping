import { Trade, OrderPerformance } from '../models';
import { redisService } from './redisService';

interface TradeEvaluation {
  tradeId: string;
  actualPnL: number;
  actualOutcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  predictionAccuracy: number;
  confidenceCalibration: number;
}

export class OrderEvaluationService {
  /**
   * Evaluate a completed trade and calculate LLM prediction accuracy
   */
  async evaluateTrade(tradeId: string): Promise<TradeEvaluation | null> {
    try {
      const trade = await Trade.findById(tradeId).populate('agentId');

      if (!trade || trade.status !== 'filled') {
        console.log(`Trade ${tradeId} not found or not filled yet`);
        return null;
      }

      const actualPnL = trade.pnl || 0;
      const actualOutcome = this.determineOutcome(actualPnL);
      const actualWinProbability = actualOutcome === 'WIN' ? 1 : actualOutcome === 'LOSS' ? 0 : 0.5;

      // Calculate prediction accuracy
      const expectedWinProb = trade.expectedWinProbability || 0.5;
      const predictionError = Math.abs(expectedWinProb - actualWinProbability);
      const predictionAccuracy = (1 - predictionError) * 100;

      // Calculate confidence calibration (how well-calibrated was the confidence)
      const confidenceCalibration = this.calculateCalibration(
        expectedWinProb,
        actualWinProbability
      );

      // Update trade with actual outcome
      trade.actualOutcome = actualOutcome;
      await trade.save();

      // Create performance record
      if (trade.signalId && trade.llmValidationScore !== undefined) {
        await this.createPerformanceRecord(trade, predictionAccuracy, confidenceCalibration);
      }

      // Publish evaluation event
      await redisService.publish(`trade:evaluated:${trade.agentId}`, {
        type: 'trade_evaluated',
        tradeId: trade._id,
        actualOutcome,
        predictionAccuracy,
        confidenceCalibration,
      });

      console.log(
        `Trade ${tradeId} evaluated: ${actualOutcome}, PnL: $${actualPnL.toFixed(2)}, Accuracy: ${predictionAccuracy.toFixed(1)}%`
      );

      return {
        tradeId: tradeId,
        actualPnL,
        actualOutcome,
        predictionAccuracy,
        confidenceCalibration,
      };
    } catch (error) {
      console.error(`Error evaluating trade ${tradeId}:`, error);
      return null;
    }
  }

  /**
   * Determine trade outcome based on PnL
   */
  private determineOutcome(pnl: number): 'WIN' | 'LOSS' | 'BREAKEVEN' {
    if (pnl > 0.5) return 'WIN';
    if (pnl < -0.5) return 'LOSS';
    return 'BREAKEVEN';
  }

  /**
   * Calculate confidence calibration score
   */
  private calculateCalibration(expected: number, actual: number): number {
    // Perfect calibration = 100, completely wrong = 0
    const error = Math.abs(expected - actual);
    return Math.max(0, (1 - error) * 100);
  }

  /**
   * Create an OrderPerformance record
   */
  private async createPerformanceRecord(
    trade: any,
    predictionAccuracy: number,
    confidenceCalibration: number
  ): Promise<void> {
    try {
      const actualOutcome = trade.actualOutcome;
      const actualWinProbability = actualOutcome === 'WIN' ? 1 : actualOutcome === 'LOSS' ? 0 : 0.5;

      const performanceRecord = new OrderPerformance({
        tradeId: trade._id,
        userId: trade.userId,
        agentId: trade.agentId,
        signalId: trade.signalId,

        llmValidationScore: trade.llmValidationScore || 0,
        expectedWinProbability: trade.expectedWinProbability || 0.5,
        llmReasoning: trade.performanceNotes || 'No reasoning provided',

        actualPnL: trade.pnl || 0,
        actualOutcome,
        actualWinProbability,

        predictionAccuracy,
        confidenceCalibration,

        symbol: trade.symbol,
        entryPrice: trade.price,
        exitPrice: trade.filledPrice,
        marketVolatility: 0, // TODO: Calculate from market data
        marketTrend: 'NEUTRAL', // TODO: Determine from market data

        evaluationNotes: `Trade ${actualOutcome} with ${predictionAccuracy.toFixed(1)}% prediction accuracy`,
        llmModelUsed: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',

        signalGeneratedAt: trade.createdAt,
        tradeExecutedAt: trade.createdAt,
        tradeClosedAt: trade.updatedAt,
        evaluatedAt: new Date(),
      });

      await performanceRecord.save();
      console.log(`Created performance record for trade ${trade._id}`);
    } catch (error) {
      console.error('Error creating performance record:', error);
    }
  }

  /**
   * Get LLM accuracy statistics for an agent
   */
  async getAgentLLMAccuracy(agentId: string): Promise<{
    totalEvaluations: number;
    avgPredictionAccuracy: number;
    avgConfidenceCalibration: number;
    winRateWhenHighConfidence: number;
    winRateWhenLowConfidence: number;
  }> {
    try {
      const performances = await OrderPerformance.find({ agentId });

      if (performances.length === 0) {
        return {
          totalEvaluations: 0,
          avgPredictionAccuracy: 0,
          avgConfidenceCalibration: 0,
          winRateWhenHighConfidence: 0,
          winRateWhenLowConfidence: 0,
        };
      }

      const avgPredictionAccuracy =
        performances.reduce((sum, p) => sum + (p.predictionAccuracy || 0), 0) / performances.length;
      const avgConfidenceCalibration =
        performances.reduce((sum, p) => sum + (p.confidenceCalibration || 0), 0) / performances.length;

      // High confidence = expectedWinProbability > 0.7
      const highConfidenceTrades = performances.filter(p => p.expectedWinProbability > 0.7);
      const highConfidenceWins = highConfidenceTrades.filter(p => p.actualOutcome === 'WIN').length;
      const winRateWhenHighConfidence =
        highConfidenceTrades.length > 0 ? (highConfidenceWins / highConfidenceTrades.length) * 100 : 0;

      // Low confidence = expectedWinProbability < 0.6
      const lowConfidenceTrades = performances.filter(p => p.expectedWinProbability < 0.6);
      const lowConfidenceWins = lowConfidenceTrades.filter(p => p.actualOutcome === 'WIN').length;
      const winRateWhenLowConfidence =
        lowConfidenceTrades.length > 0 ? (lowConfidenceWins / lowConfidenceTrades.length) * 100 : 0;

      return {
        totalEvaluations: performances.length,
        avgPredictionAccuracy,
        avgConfidenceCalibration,
        winRateWhenHighConfidence,
        winRateWhenLowConfidence,
      };
    } catch (error) {
      console.error('Error getting LLM accuracy:', error);
      return {
        totalEvaluations: 0,
        avgPredictionAccuracy: 0,
        avgConfidenceCalibration: 0,
        winRateWhenHighConfidence: 0,
        winRateWhenLowConfidence: 0,
      };
    }
  }

  /**
   * Get overall LLM performance across all agents for a user
   */
  async getUserLLMPerformance(userId: string): Promise<{
    totalEvaluations: number;
    avgPredictionAccuracy: number;
    avgConfidenceCalibration: number;
    profitableWhenHighConfidence: number;
    profitableWhenLowConfidence: number;
    recommendationToFollow: string;
  }> {
    try {
      const performances = await OrderPerformance.find({ userId });

      if (performances.length === 0) {
        return {
          totalEvaluations: 0,
          avgPredictionAccuracy: 0,
          avgConfidenceCalibration: 0,
          profitableWhenHighConfidence: 0,
          profitableWhenLowConfidence: 0,
          recommendationToFollow: 'Not enough data to make recommendations',
        };
      }

      const avgPredictionAccuracy =
        performances.reduce((sum, p) => sum + (p.predictionAccuracy || 0), 0) / performances.length;
      const avgConfidenceCalibration =
        performances.reduce((sum, p) => sum + (p.confidenceCalibration || 0), 0) / performances.length;

      const highConfidenceTrades = performances.filter(p => p.expectedWinProbability > 0.7);
      const highConfidenceProfitable = highConfidenceTrades.filter(p => p.actualPnL > 0).length;
      const profitableWhenHighConfidence =
        highConfidenceTrades.length > 0 ? (highConfidenceProfitable / highConfidenceTrades.length) * 100 : 0;

      const lowConfidenceTrades = performances.filter(p => p.expectedWinProbability < 0.6);
      const lowConfidenceProfitable = lowConfidenceTrades.filter(p => p.actualPnL > 0).length;
      const profitableWhenLowConfidence =
        lowConfidenceTrades.length > 0 ? (lowConfidenceProfitable / lowConfidenceTrades.length) * 100 : 0;

      // Generate recommendation
      let recommendation = '';
      if (profitableWhenHighConfidence > 70) {
        recommendation = 'Trust high-confidence LLM signals - they have a strong track record';
      } else if (profitableWhenHighConfidence > 50) {
        recommendation = 'LLM signals are moderately reliable - use with caution';
      } else {
        recommendation = 'LLM predictions need improvement - consider adjusting agent settings';
      }

      return {
        totalEvaluations: performances.length,
        avgPredictionAccuracy,
        avgConfidenceCalibration,
        profitableWhenHighConfidence,
        profitableWhenLowConfidence,
        recommendationToFollow: recommendation,
      };
    } catch (error) {
      console.error('Error getting user LLM performance:', error);
      return {
        totalEvaluations: 0,
        avgPredictionAccuracy: 0,
        avgConfidenceCalibration: 0,
        profitableWhenHighConfidence: 0,
        profitableWhenLowConfidence: 0,
        recommendationToFollow: 'Error calculating recommendations',
      };
    }
  }

  /**
   * Batch evaluate multiple trades
   */
  async batchEvaluateTrades(tradeIds: string[]): Promise<TradeEvaluation[]> {
    const evaluations = await Promise.all(
      tradeIds.map(id => this.evaluateTrade(id))
    );
    return evaluations.filter(e => e !== null) as TradeEvaluation[];
  }

  /**
   * Scheduled job: Evaluate all unevaluated filled trades
   */
  async evaluateAllPendingTrades(): Promise<number> {
    try {
      const unevaluatedTrades = await Trade.find({
        status: 'filled',
        actualOutcome: { $exists: false },
      }).limit(100);

      console.log(`Found ${unevaluatedTrades.length} unevaluated trades`);

      let evaluatedCount = 0;
      for (const trade of unevaluatedTrades) {
        const evaluation = await this.evaluateTrade((trade._id as any).toString());
        if (evaluation) {
          evaluatedCount++;
        }
      }

      console.log(`Evaluated ${evaluatedCount} trades`);
      return evaluatedCount;
    } catch (error) {
      console.error('Error in batch evaluation:', error);
      return 0;
    }
  }
}

export const orderEvaluationService = new OrderEvaluationService();
