/**
 * MARIPOSA V6 PRO - Candle Confirmation Service
 *
 * PURE MATH pattern detection - NO LLM calls!
 * Target: < 100ms decision time
 *
 * Detects:
 * - REJECTION_WICK: Long wick showing rejection (>50% of range)
 * - PIN_BAR: Small body with long directional wick
 * - BULLISH_ENGULFING: Current green engulfs previous red
 * - BEARISH_ENGULFING: Current red engulfs previous green
 * - HAMMER: Bullish reversal candle at support
 * - SHOOTING_STAR: Bearish reversal candle at resistance
 */

import {
  TradeSetup,
  ConfirmationResult,
  ConfirmationPatternType,
  RequiredConfirmation,
} from '../../types/v6';
import { CandleData } from '../../types/v6/analysis.types';

// ============================================================================
// PATTERN THRESHOLDS
// ============================================================================

const PATTERN_CONFIG = {
  // Rejection wick - LOWERED for 5m timeframe (was 50%/65%)
  REJECTION_WICK_MIN_PERCENT: 0.30,      // Was 50%, now 30% for 5m candles
  REJECTION_WICK_STRONG_PERCENT: 0.45,   // Was 65%, now 45%

  // Pin bar - RELAXED for 5m timeframe
  PIN_BAR_MAX_BODY_PERCENT: 0.45,        // Was 30%, now 45%
  PIN_BAR_MIN_WICK_PERCENT: 0.40,        // Was 60%, now 40%

  // Engulfing - RELAXED
  ENGULFING_MIN_BODY_RATIO: 0.8,         // Was 1.1, now 0.8 (80% is enough)

  // Hammer/Shooting star - LOWERED for 5m timeframe
  HAMMER_MAX_UPPER_WICK_PERCENT: 0.25,   // Was 15%, now 25%
  HAMMER_MIN_LOWER_WICK_PERCENT: 0.40,   // Was 60%, now 40%
  SHOOTING_STAR_MAX_LOWER_WICK: 0.25,    // Was 15%, now 25%
  SHOOTING_STAR_MIN_UPPER_WICK: 0.40,    // Was 60%, now 40%

  // Volume confirmation
  VOLUME_SPIKE_MULTIPLIER: 1.2,          // 120% of average = spike

  // Strength scoring
  WEAK_CONFIDENCE_THRESHOLD: 50,
  MODERATE_CONFIDENCE_THRESHOLD: 70,
};

// ============================================================================
// CANDLE CONFIRMATION SERVICE
// ============================================================================

class CandleConfirmationService {

  // ============================================================================
  // MAIN CONFIRMATION CHECK
  // ============================================================================

  /**
   * Check if candle patterns confirm the setup entry
   * This is the main method called by zoneMonitorService
   */
  checkConfirmation(
    setup: TradeSetup,
    candles: CandleData[],
    avgVolume?: number
  ): ConfirmationResult {
    const startTime = Date.now();

    if (candles.length < 2) {
      return this.createNoConfirmationResult('Insufficient candle data', startTime);
    }

    const currentCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    const direction = setup.direction;
    const requiredConf = setup.requiredConfirmation;

    // DEBUG: Log candle data for analysis
    const range = currentCandle.high - currentCandle.low;
    const body = Math.abs(currentCandle.close - currentCandle.open);
    const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;

    console.log(`[V6-CONFIRM-DEBUG] Candle Analysis:`);
    console.log(`  Price: O:$${currentCandle.open.toFixed(0)} H:$${currentCandle.high.toFixed(0)} L:$${currentCandle.low.toFixed(0)} C:$${currentCandle.close.toFixed(0)}`);
    console.log(`  Range: $${range.toFixed(0)} | Body: ${range > 0 ? ((body/range)*100).toFixed(0) : 0}% | Upper: ${range > 0 ? ((upperWick/range)*100).toFixed(0) : 0}% | Lower: ${range > 0 ? ((lowerWick/range)*100).toFixed(0) : 0}%`);
    console.log(`  Looking for: ${requiredConf.patterns.map(p => p.type).join(', ')} (${direction})`);

    // Collect all found patterns
    const patternsFound: {
      type: ConfirmationPatternType;
      strength: 'WEAK' | 'MODERATE' | 'STRONG';
      metrics: Record<string, number>;
    }[] = [];

    // Check each required pattern
    for (const pattern of requiredConf.patterns) {
      const result = this.checkPattern(
        pattern.type,
        currentCandle,
        previousCandle,
        direction
      );

      if (result.found) {
        console.log(`[V6-CONFIRM-DEBUG]   ${pattern.type}: FOUND (${result.strength}) - ${JSON.stringify(result.metrics)}`);
        patternsFound.push({
          type: pattern.type,
          strength: result.strength,
          metrics: result.metrics,
        });
      } else {
        // Log why pattern didn't match
        console.log(`[V6-CONFIRM-DEBUG]   ${pattern.type}: NOT FOUND - ${JSON.stringify(result.metrics)}`);
      }
    }

    // Check volume if required
    let volumeConfirmed = !requiredConf.volumeRequired;
    let volumeRatio: number | undefined;

    if (requiredConf.volumeRequired && avgVolume && avgVolume > 0) {
      volumeRatio = currentCandle.volume / avgVolume;
      const requiredMultiplier = requiredConf.volumeMultiplier || PATTERN_CONFIG.VOLUME_SPIKE_MULTIPLIER;
      volumeConfirmed = volumeRatio >= requiredMultiplier;
    }

    // Determine overall result
    const hasPattern = patternsFound.length > 0;
    const meetsStrengthRequirement = this.meetsStrengthRequirement(
      patternsFound,
      requiredConf.minStrength
    );

    const confirmed = hasPattern && meetsStrengthRequirement && volumeConfirmed;
    const overallStrength = this.calculateOverallStrength(patternsFound);

    const checkTimeMs = Date.now() - startTime;

    // Build reason string
    let reason: string;
    if (confirmed) {
      const patternNames = patternsFound.map(p => p.type).join(', ');
      reason = `Confirmed: ${patternNames} (${overallStrength})`;
      if (volumeConfirmed && volumeRatio) {
        reason += ` | Volume: ${(volumeRatio * 100).toFixed(0)}%`;
      }
    } else if (!hasPattern) {
      reason = 'No confirmation pattern detected';
    } else if (!meetsStrengthRequirement) {
      reason = `Pattern found but strength insufficient (need ${requiredConf.minStrength})`;
    } else {
      reason = `Volume not confirmed (${volumeRatio ? (volumeRatio * 100).toFixed(0) + '%' : 'N/A'})`;
    }

    return {
      confirmed,
      patternsFound: patternsFound.map(p => p.type),
      patternDetails: patternsFound,
      volumeConfirmed,
      volumeRatio,
      strength: overallStrength,
      reason,
      checkTimeMs,
    };
  }

  // ============================================================================
  // INDIVIDUAL PATTERN CHECKS
  // ============================================================================

  /**
   * Check a specific pattern type
   */
  private checkPattern(
    type: ConfirmationPatternType,
    current: CandleData,
    previous: CandleData,
    direction: 'BUY' | 'SELL'
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    switch (type) {
      case 'REJECTION_WICK':
        return this.checkRejectionWick(current, direction);
      case 'PIN_BAR':
        return this.checkPinBar(current, direction);
      case 'BULLISH_ENGULFING':
        return direction === 'BUY'
          ? this.checkBullishEngulfing(current, previous)
          : { found: false, strength: 'WEAK', metrics: {} };
      case 'BEARISH_ENGULFING':
        return direction === 'SELL'
          ? this.checkBearishEngulfing(current, previous)
          : { found: false, strength: 'WEAK', metrics: {} };
      case 'HAMMER':
        return direction === 'BUY'
          ? this.checkHammer(current)
          : { found: false, strength: 'WEAK', metrics: {} };
      case 'SHOOTING_STAR':
        return direction === 'SELL'
          ? this.checkShootingStar(current)
          : { found: false, strength: 'WEAK', metrics: {} };
      case 'DOJI_REVERSAL':
        return this.checkDojiReversal(current, direction);
      default:
        return { found: false, strength: 'WEAK', metrics: {} };
    }
  }

  /**
   * REJECTION_WICK: Long wick showing rejection in the direction we want
   * For BUY: Long lower wick (buyers stepping in)
   * For SELL: Long upper wick (sellers stepping in)
   */
  private checkRejectionWick(
    candle: CandleData,
    direction: 'BUY' | 'SELL'
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    const range = candle.high - candle.low;
    if (range === 0) {
      return { found: false, strength: 'WEAK', metrics: { range: 0 } };
    }

    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    const upperWickPercent = upperWick / range;
    const lowerWickPercent = lowerWick / range;
    const bodyPercent = body / range;

    let targetWickPercent: number;

    if (direction === 'BUY') {
      // For BUY: We want a long LOWER wick (buying pressure)
      targetWickPercent = lowerWickPercent;
    } else {
      // For SELL: We want a long UPPER wick (selling pressure)
      targetWickPercent = upperWickPercent;
    }

    const found = targetWickPercent >= PATTERN_CONFIG.REJECTION_WICK_MIN_PERCENT;
    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';

    if (found) {
      if (targetWickPercent >= PATTERN_CONFIG.REJECTION_WICK_STRONG_PERCENT) {
        strength = 'STRONG';
      } else if (targetWickPercent >= 0.55) {
        strength = 'MODERATE';
      }
    }

    return {
      found,
      strength,
      metrics: {
        wickPercent: Math.round(targetWickPercent * 100),
        bodyPercent: Math.round(bodyPercent * 100),
        upperWickPercent: Math.round(upperWickPercent * 100),
        lowerWickPercent: Math.round(lowerWickPercent * 100),
      },
    };
  }

  /**
   * PIN_BAR: Small body with long directional wick
   * For BUY: Long lower wick, small body
   * For SELL: Long upper wick, small body
   */
  private checkPinBar(
    candle: CandleData,
    direction: 'BUY' | 'SELL'
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    const range = candle.high - candle.low;
    if (range === 0) {
      return { found: false, strength: 'WEAK', metrics: { range: 0 } };
    }

    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    const bodyPercent = body / range;
    const upperWickPercent = upperWick / range;
    const lowerWickPercent = lowerWick / range;

    // Body must be small
    if (bodyPercent > PATTERN_CONFIG.PIN_BAR_MAX_BODY_PERCENT) {
      return {
        found: false,
        strength: 'WEAK',
        metrics: { bodyPercent: Math.round(bodyPercent * 100) },
      };
    }

    let targetWickPercent: number;
    let oppositeWickPercent: number;

    if (direction === 'BUY') {
      targetWickPercent = lowerWickPercent;
      oppositeWickPercent = upperWickPercent;
    } else {
      targetWickPercent = upperWickPercent;
      oppositeWickPercent = lowerWickPercent;
    }

    // Directional wick must be long, opposite wick should be small
    const found =
      targetWickPercent >= PATTERN_CONFIG.PIN_BAR_MIN_WICK_PERCENT &&
      oppositeWickPercent < 0.25;

    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    if (found) {
      if (targetWickPercent >= 0.70 && oppositeWickPercent < 0.15) {
        strength = 'STRONG';
      } else if (targetWickPercent >= 0.65) {
        strength = 'MODERATE';
      }
    }

    return {
      found,
      strength,
      metrics: {
        bodyPercent: Math.round(bodyPercent * 100),
        targetWickPercent: Math.round(targetWickPercent * 100),
        oppositeWickPercent: Math.round(oppositeWickPercent * 100),
      },
    };
  }

  /**
   * BULLISH_ENGULFING: Current green candle engulfs previous red candle
   */
  private checkBullishEngulfing(
    current: CandleData,
    previous: CandleData
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    const isCurrentGreen = current.close > current.open;
    const isPreviousRed = previous.close < previous.open;

    if (!isCurrentGreen || !isPreviousRed) {
      return { found: false, strength: 'WEAK', metrics: {} };
    }

    const currentBody = current.close - current.open;
    const previousBody = previous.open - previous.close;

    // Current body must engulf previous body
    const engulfs =
      current.close > previous.open &&
      current.open < previous.close;

    const bodyRatio = previousBody > 0 ? currentBody / previousBody : 0;

    const found = engulfs && bodyRatio >= PATTERN_CONFIG.ENGULFING_MIN_BODY_RATIO;

    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    if (found) {
      if (bodyRatio >= 1.5) {
        strength = 'STRONG';
      } else if (bodyRatio >= 1.25) {
        strength = 'MODERATE';
      }
    }

    return {
      found,
      strength,
      metrics: {
        bodyRatio: Math.round(bodyRatio * 100) / 100,
        currentBody: Math.round(currentBody * 100) / 100,
        previousBody: Math.round(previousBody * 100) / 100,
      },
    };
  }

  /**
   * BEARISH_ENGULFING: Current red candle engulfs previous green candle
   */
  private checkBearishEngulfing(
    current: CandleData,
    previous: CandleData
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    const isCurrentRed = current.close < current.open;
    const isPreviousGreen = previous.close > previous.open;

    if (!isCurrentRed || !isPreviousGreen) {
      return { found: false, strength: 'WEAK', metrics: {} };
    }

    const currentBody = current.open - current.close;
    const previousBody = previous.close - previous.open;

    // Current body must engulf previous body
    const engulfs =
      current.open > previous.close &&
      current.close < previous.open;

    const bodyRatio = previousBody > 0 ? currentBody / previousBody : 0;

    const found = engulfs && bodyRatio >= PATTERN_CONFIG.ENGULFING_MIN_BODY_RATIO;

    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    if (found) {
      if (bodyRatio >= 1.5) {
        strength = 'STRONG';
      } else if (bodyRatio >= 1.25) {
        strength = 'MODERATE';
      }
    }

    return {
      found,
      strength,
      metrics: {
        bodyRatio: Math.round(bodyRatio * 100) / 100,
        currentBody: Math.round(currentBody * 100) / 100,
        previousBody: Math.round(previousBody * 100) / 100,
      },
    };
  }

  /**
   * HAMMER: Bullish reversal - small body at top, long lower wick
   */
  private checkHammer(
    candle: CandleData
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    const range = candle.high - candle.low;
    if (range === 0) {
      return { found: false, strength: 'WEAK', metrics: { range: 0 } };
    }

    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    const bodyPercent = body / range;
    const upperWickPercent = upperWick / range;
    const lowerWickPercent = lowerWick / range;

    // Hammer: Long lower wick, small upper wick, small body
    const found =
      lowerWickPercent >= PATTERN_CONFIG.HAMMER_MIN_LOWER_WICK_PERCENT &&
      upperWickPercent <= PATTERN_CONFIG.HAMMER_MAX_UPPER_WICK_PERCENT &&
      bodyPercent <= 0.35;

    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    if (found) {
      if (lowerWickPercent >= 0.70 && upperWickPercent < 0.10) {
        strength = 'STRONG';
      } else if (lowerWickPercent >= 0.65) {
        strength = 'MODERATE';
      }
    }

    return {
      found,
      strength,
      metrics: {
        bodyPercent: Math.round(bodyPercent * 100),
        upperWickPercent: Math.round(upperWickPercent * 100),
        lowerWickPercent: Math.round(lowerWickPercent * 100),
      },
    };
  }

  /**
   * SHOOTING_STAR: Bearish reversal - small body at bottom, long upper wick
   */
  private checkShootingStar(
    candle: CandleData
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    const range = candle.high - candle.low;
    if (range === 0) {
      return { found: false, strength: 'WEAK', metrics: { range: 0 } };
    }

    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    const bodyPercent = body / range;
    const upperWickPercent = upperWick / range;
    const lowerWickPercent = lowerWick / range;

    // Shooting star: Long upper wick, small lower wick, small body
    const found =
      upperWickPercent >= PATTERN_CONFIG.SHOOTING_STAR_MIN_UPPER_WICK &&
      lowerWickPercent <= PATTERN_CONFIG.SHOOTING_STAR_MAX_LOWER_WICK &&
      bodyPercent <= 0.35;

    let strength: 'WEAK' | 'MODERATE' | 'STRONG' = 'WEAK';
    if (found) {
      if (upperWickPercent >= 0.70 && lowerWickPercent < 0.10) {
        strength = 'STRONG';
      } else if (upperWickPercent >= 0.65) {
        strength = 'MODERATE';
      }
    }

    return {
      found,
      strength,
      metrics: {
        bodyPercent: Math.round(bodyPercent * 100),
        upperWickPercent: Math.round(upperWickPercent * 100),
        lowerWickPercent: Math.round(lowerWickPercent * 100),
      },
    };
  }

  /**
   * DOJI_REVERSAL: Doji candle at key level
   */
  private checkDojiReversal(
    candle: CandleData,
    direction: 'BUY' | 'SELL'
  ): { found: boolean; strength: 'WEAK' | 'MODERATE' | 'STRONG'; metrics: Record<string, number> } {
    const range = candle.high - candle.low;
    if (range === 0) {
      return { found: false, strength: 'WEAK', metrics: { range: 0 } };
    }

    const body = Math.abs(candle.close - candle.open);
    const bodyPercent = body / range;

    // Doji: Very small body (<10% of range)
    const isDoji = bodyPercent < 0.10;

    if (!isDoji) {
      return {
        found: false,
        strength: 'WEAK',
        metrics: { bodyPercent: Math.round(bodyPercent * 100) },
      };
    }

    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWickPercent = upperWick / range;
    const lowerWickPercent = lowerWick / range;

    // For reversal, we want the wick to be in the right direction
    let found = false;
    if (direction === 'BUY' && lowerWickPercent > upperWickPercent) {
      found = true; // Lower wick longer = bullish doji
    } else if (direction === 'SELL' && upperWickPercent > lowerWickPercent) {
      found = true; // Upper wick longer = bearish doji
    }

    return {
      found,
      strength: found ? 'MODERATE' : 'WEAK', // Doji is always moderate strength
      metrics: {
        bodyPercent: Math.round(bodyPercent * 100),
        upperWickPercent: Math.round(upperWickPercent * 100),
        lowerWickPercent: Math.round(lowerWickPercent * 100),
      },
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if found patterns meet the strength requirement
   */
  private meetsStrengthRequirement(
    patterns: { strength: 'WEAK' | 'MODERATE' | 'STRONG' }[],
    required: 'ANY' | 'MODERATE' | 'STRONG'
  ): boolean {
    if (patterns.length === 0) return false;
    if (required === 'ANY') return true;

    const strengthOrder = { WEAK: 1, MODERATE: 2, STRONG: 3 };
    const requiredLevel = required === 'STRONG' ? 3 : 2;

    return patterns.some(p => strengthOrder[p.strength] >= requiredLevel);
  }

  /**
   * Calculate overall strength from multiple patterns
   */
  private calculateOverallStrength(
    patterns: { strength: 'WEAK' | 'MODERATE' | 'STRONG' }[]
  ): 'WEAK' | 'MODERATE' | 'STRONG' {
    if (patterns.length === 0) return 'WEAK';

    const hasStrong = patterns.some(p => p.strength === 'STRONG');
    const hasModerate = patterns.some(p => p.strength === 'MODERATE');

    if (hasStrong) return 'STRONG';
    if (hasModerate || patterns.length >= 2) return 'MODERATE';
    return 'WEAK';
  }

  /**
   * Create a no-confirmation result
   */
  private createNoConfirmationResult(reason: string, startTime: number): ConfirmationResult {
    return {
      confirmed: false,
      patternsFound: [],
      patternDetails: [],
      volumeConfirmed: false,
      strength: 'WEAK',
      reason,
      checkTimeMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Quick check for any rejection pattern (useful for testing)
   */
  hasAnyRejectionPattern(candle: CandleData, direction: 'BUY' | 'SELL'): boolean {
    const rejection = this.checkRejectionWick(candle, direction);
    const pinBar = this.checkPinBar(candle, direction);

    return rejection.found || pinBar.found;
  }

  /**
   * Get candle analysis (for debugging)
   */
  analyzeCandleStructure(candle: CandleData): {
    range: number;
    body: number;
    upperWick: number;
    lowerWick: number;
    bodyPercent: number;
    upperWickPercent: number;
    lowerWickPercent: number;
    direction: 'BULLISH' | 'BEARISH' | 'DOJI';
  } {
    const range = candle.high - candle.low;
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;

    const bodyPercent = range > 0 ? body / range : 0;
    const upperWickPercent = range > 0 ? upperWick / range : 0;
    const lowerWickPercent = range > 0 ? lowerWick / range : 0;

    let direction: 'BULLISH' | 'BEARISH' | 'DOJI';
    if (bodyPercent < 0.10) {
      direction = 'DOJI';
    } else if (candle.close > candle.open) {
      direction = 'BULLISH';
    } else {
      direction = 'BEARISH';
    }

    return {
      range,
      body,
      upperWick,
      lowerWick,
      bodyPercent: Math.round(bodyPercent * 100) / 100,
      upperWickPercent: Math.round(upperWickPercent * 100) / 100,
      lowerWickPercent: Math.round(lowerWickPercent * 100) / 100,
      direction,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const candleConfirmationService = new CandleConfirmationService();
export { CandleConfirmationService };
