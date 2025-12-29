/**
 * MARIPOSA WEEX AI Log Service
 *
 * Fire-and-forget async logging service for WEEX AI Log API.
 * All methods are non-blocking to ensure trading is never delayed.
 *
 * Endpoint: POST /capi/v2/order/uploadAiLog
 */

import { weexService } from '../weexService';
import {
  AiLogStage,
  AiLogRequest,
  AI_MODELS,
  OrderExecutionLogData,
  OrderCloseLogData,
  PatternAnalysisLogData,
  HTFAnalysisLogData,
  ExhaustionCheckLogData,
} from '../../types/weex';

// ============================================================================
// WEEX AI LOG SERVICE
// ============================================================================

class WeexAiLogService {
  private uploadCount = 0;
  private failureCount = 0;
  private enabled = true;

  /**
   * Enable/disable AI logging (useful for testing)
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[WEEX-AI-LOG] Logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get logging statistics
   */
  getStats(): { uploads: number; failures: number; enabled: boolean } {
    return {
      uploads: this.uploadCount,
      failures: this.failureCount,
      enabled: this.enabled,
    };
  }

  // ==========================================================================
  // CORE UPLOAD METHOD (Fire-and-Forget)
  // ==========================================================================

  /**
   * Fire-and-forget upload to WEEX AI Log API.
   * Returns immediately, upload happens in background.
   * Errors are caught and logged, never thrown.
   */
  upload(params: AiLogRequest): void {
    if (!this.enabled) return;

    // Fire-and-forget: don't await, just log errors
    this.doUpload(params).catch((error) => {
      console.warn(`[WEEX-AI-LOG] Background upload failed: ${error.message}`);
    });
  }

  /**
   * Internal async upload implementation
   */
  private async doUpload(params: AiLogRequest): Promise<void> {
    try {
      const success = await weexService.uploadAiLog({
        orderId: params.orderId,
        stage: params.stage,
        model: params.model,
        input: params.input,
        output: params.output,
        explanation: params.explanation,
      });

      if (success) {
        this.uploadCount++;
      } else {
        this.failureCount++;
      }
    } catch (error: any) {
      this.failureCount++;
      console.warn(`[WEEX-AI-LOG] Upload error: ${error.message}`);
    }
  }

  // ==========================================================================
  // CONVENIENCE METHODS FOR DIFFERENT LOG SCENARIOS
  // ==========================================================================

  /**
   * Log order execution (when position is opened)
   */
  logOrderExecution(data: OrderExecutionLogData): void {
    const explanation = `${data.setup.grade} grade ${data.setup.direction} setup executed. ` +
      `Entry: $${data.execution.positionSizeUSD.toFixed(0)} at ${data.setup.entryPrice.toFixed(2)} ` +
      `with ${data.execution.leverage}x leverage. ` +
      `SL: $${data.setup.stopLoss.toFixed(2)}, TP: $${data.setup.takeProfit.toFixed(2)}. ` +
      `HTF trend: ${data.marketData.htfTrend || 'N/A'}. ` +
      (data.marketData.fibonacciLevel ? `Fib level: ${(data.marketData.fibonacciLevel * 100).toFixed(1)}%. ` : '') +
      (data.setup.riskRewardRatio ? `R:R ratio: ${data.setup.riskRewardRatio.toFixed(2)}:1.` : '');

    this.upload({
      orderId: data.orderId,
      stage: 'Order Execution',
      model: AI_MODELS.V6_ARCHITECT,
      input: {
        setup: data.setup,
        marketData: data.marketData,
      },
      output: {
        action: data.execution.action,
        positionSizeBTC: data.execution.positionSizeBTC,
        positionSizeUSD: data.execution.positionSizeUSD,
        leverage: data.execution.leverage,
      },
      explanation,
    });
  }

  /**
   * Log order close (when position is closed)
   */
  logOrderClose(data: OrderCloseLogData): void {
    const pnlText = data.pnlUSD >= 0 ? `Profit: +$${data.pnlUSD.toFixed(2)}` : `Loss: -$${Math.abs(data.pnlUSD).toFixed(2)}`;

    const explanation = `${data.direction} position closed via ${data.closeReason}. ` +
      `Entry: $${data.entryPrice.toFixed(2)}, Exit: $${data.exitPrice.toFixed(2)}. ` +
      `${pnlText} (${data.pnlPercent >= 0 ? '+' : ''}${data.pnlPercent.toFixed(2)}%). ` +
      `Duration: ${data.durationMinutes.toFixed(1)} minutes.`;

    this.upload({
      orderId: data.orderId,
      stage: 'Order Close',
      model: AI_MODELS.EXIT_ANALYSIS,
      input: {
        direction: data.direction,
        entryPrice: data.entryPrice,
        closeReason: data.closeReason,
      },
      output: {
        exitPrice: data.exitPrice,
        pnlUSD: data.pnlUSD,
        pnlPercent: data.pnlPercent,
        durationMinutes: data.durationMinutes,
      },
      explanation,
    });
  }

  /**
   * Log LLM pattern analysis (Fibonacci, Trend, Volume, S/R)
   */
  logPatternAnalysis(data: PatternAnalysisLogData): void {
    const modelMap: Record<string, string> = {
      'FIBONACCI': AI_MODELS.FIBONACCI,
      'TREND_MOMENTUM': AI_MODELS.TREND_MOMENTUM,
      'VOLUME_PRICE': AI_MODELS.VOLUME_PRICE,
      'SUPPORT_RESISTANCE': AI_MODELS.SUPPORT_RESISTANCE,
    };

    const model = modelMap[data.patternType] || 'Unknown Model';
    const patterns = data.result.patterns?.join(', ') || 'None detected';

    const explanation = `${data.patternType} analysis on ${data.symbol} ${data.timeframe}. ` +
      `Recommendation: ${data.result.recommendation} (${(data.result.confidence * 100).toFixed(0)}% confidence). ` +
      `Patterns: ${patterns}.`;

    this.upload({
      stage: 'Strategy Generation',
      model,
      input: {
        symbol: data.symbol,
        timeframe: data.timeframe,
        prompt: data.prompt,
        marketData: data.marketData,
      },
      output: data.result,
      explanation,
    });
  }

  /**
   * Log HTF (Higher Timeframe) direction analysis
   */
  logHTFAnalysis(data: HTFAnalysisLogData): void {
    const explanation = `HTF analysis at $${data.currentPrice.toFixed(2)}. ` +
      `4H trend: ${data.trend4H}, 1H trend: ${data.trend1H}. ` +
      `Decision: ${data.decision} (${data.confidence} confidence). ` +
      (data.priceChange4H ? `4H price change: ${data.priceChange4H.toFixed(2)}%. ` : '') +
      (data.priceChange1H ? `1H price change: ${data.priceChange1H.toFixed(2)}%.` : '');

    this.upload({
      stage: 'Decision Making',
      model: AI_MODELS.HTF_ANALYSIS,
      input: {
        currentPrice: data.currentPrice,
        priceChange4H: data.priceChange4H,
        priceChange1H: data.priceChange1H,
      },
      output: {
        trend4H: data.trend4H,
        trend1H: data.trend1H,
        decision: data.decision,
        confidence: data.confidence,
      },
      explanation,
    });
  }

  /**
   * Log move exhaustion check
   */
  logExhaustionCheck(data: ExhaustionCheckLogData): void {
    const direction = data.direction === 'BUY' ? 'rise from low' : 'drop from high';

    const explanation = `${data.direction} exhaustion check at $${data.currentPrice.toFixed(2)}. ` +
      `4H range: $${data.lowestLow4H.toFixed(2)} - $${data.highestHigh4H.toFixed(2)}. ` +
      `Position in range: ${data.positionInRange.toFixed(0)}%. Move ${direction}: ${data.movePercent.toFixed(2)}%. ` +
      `Result: ${data.isExhausted ? 'EXHAUSTED' : 'NOT EXHAUSTED'}. ` +
      `Recommendation: ${data.recommendation}.`;

    this.upload({
      stage: 'Decision Making',
      model: AI_MODELS.EXHAUSTION_CHECK,
      input: {
        direction: data.direction,
        currentPrice: data.currentPrice,
        highestHigh4H: data.highestHigh4H,
        lowestLow4H: data.lowestLow4H,
      },
      output: {
        positionInRange: data.positionInRange,
        movePercent: data.movePercent,
        isExhausted: data.isExhausted,
        recommendation: data.recommendation,
      },
      explanation,
    });
  }

  /**
   * Log V6 strategic analysis (setup architect)
   */
  logStrategicAnalysis(input: {
    symbol: string;
    timeframe: string;
    marketBias: string;
    fibLevels: number[];
    srLevels: number[];
  }, output: {
    setupsCreated: number;
    buySetups: number;
    sellSetups: number;
    gradeDistribution: { A: number; B: number; C: number };
  }): void {
    const explanation = `V6 strategic analysis on ${input.symbol} ${input.timeframe}. ` +
      `Market bias: ${input.marketBias}. ` +
      `Created ${output.setupsCreated} setups (${output.buySetups} BUY, ${output.sellSetups} SELL). ` +
      `Grade distribution: A=${output.gradeDistribution.A}, B=${output.gradeDistribution.B}, C=${output.gradeDistribution.C}.`;

    this.upload({
      stage: 'Strategy Generation',
      model: AI_MODELS.V6_ARCHITECT,
      input,
      output,
      explanation,
    });
  }

  /**
   * Log exit decision analysis
   */
  logExitDecision(orderId: string, input: {
    currentPrice: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    unrealizedPnl: number;
    durationMinutes: number;
  }, output: {
    shouldExit: boolean;
    reason: string;
    newStopLoss?: number;
    trailingActivated?: boolean;
    breakevenActivated?: boolean;
  }): void {
    const explanation = `Exit analysis for order ${orderId}. ` +
      `Current price: $${input.currentPrice.toFixed(2)}, Unrealized P&L: $${input.unrealizedPnl.toFixed(2)}. ` +
      `Duration: ${input.durationMinutes.toFixed(1)} min. ` +
      `Decision: ${output.shouldExit ? 'EXIT' : 'HOLD'}. ` +
      `Reason: ${output.reason}.`;

    this.upload({
      orderId,
      stage: 'Exit Analysis',
      model: AI_MODELS.EXIT_ANALYSIS,
      input,
      output,
      explanation,
    });
  }

  /**
   * Log general decision making
   */
  logDecisionMaking(input: Record<string, any>, output: Record<string, any>, explanation: string, model: string = AI_MODELS.HTF_ANALYSIS): void {
    this.upload({
      stage: 'Decision Making',
      model,
      input,
      output,
      explanation,
    });
  }

  /**
   * Log risk analysis decisions
   */
  logRiskAnalysis(input: Record<string, any>, output: Record<string, any>, explanation: string): void {
    this.upload({
      stage: 'Risk Analysis',
      model: 'Internal Risk Manager',
      input,
      output,
      explanation,
    });
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const weexAiLogService = new WeexAiLogService();
export { WeexAiLogService };
