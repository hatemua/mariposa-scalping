/**
 * MARIPOSA V6 PRO - Setup Architect Expert
 *
 * LLM-powered expert that creates trade setups from detected levels.
 * Uses the same model as the Fibonacci expert for consistency.
 *
 * Input: Market bias + detected levels (Fib, S/R, Order Blocks, Liquidity)
 * Output: 2-5 TradeSetup objects with entry zones, SL/TP, confirmation rules
 */

import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config, V6_ENV_CONFIG } from '../../config/environment';
import {
  TradeSetup,
  SetupDirection,
  SetupBias,
  SetupGrade,
  SetupReason,
  PriceZone,
  RequiredConfirmation,
  ConfirmationPattern,
  V6_SETUP_CONFIG,
  createExpiryDate,
} from '../../types/v6';
import {
  StrategicAnalysisInput,
  SetupArchitectOutput,
  SetupArchitectSetup,
} from '../../types/v6/analysis.types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SETUP_ARCHITECT_CONFIG = {
  MODEL: V6_SETUP_CONFIG.SETUP_ARCHITECT_MODEL,
  TEMPERATURE: 0.2,      // Low temperature for consistent outputs
  MAX_TOKENS: 2500,
  TIMEOUT_MS: 60000,     // 60 second timeout

  // Validation thresholds - use env config for mode-specific values
  MIN_RR_RATIO: V6_ENV_CONFIG.MIN_RISK_REWARD,
  MAX_SETUPS_PER_ANALYSIS: 5,
  MIN_SETUPS_PER_ANALYSIS: 1,
  MIN_CONFIDENCE: V6_ENV_CONFIG.MODE === 'SCALPING' ? 60 : 50,
  MAX_CONFIDENCE: 95,
  MIN_ZONE_WIDTH_PERCENT: V6_ENV_CONFIG.MIN_ZONE_WIDTH_PCT,
  MAX_ZONE_WIDTH_PERCENT: V6_ENV_CONFIG.MAX_ZONE_WIDTH_PCT,
  MAX_ENTRY_DISTANCE_PCT: V6_ENV_CONFIG.MAX_ENTRY_DISTANCE_PCT,

  // Scalping-specific risk parameters
  STOP_LOSS_PCT: V6_ENV_CONFIG.STOP_LOSS_PCT,
  MAX_STOP_LOSS_PCT: V6_ENV_CONFIG.MAX_STOP_LOSS_PCT,
  TAKE_PROFIT_1_PCT: V6_ENV_CONFIG.TAKE_PROFIT_1_PCT,
  TAKE_PROFIT_2_PCT: V6_ENV_CONFIG.TAKE_PROFIT_2_PCT,
};

// ============================================================================
// SETUP ARCHITECT EXPERT
// ============================================================================

class SetupArchitectExpert {
  private httpClient: AxiosInstance;
  private apiKey: string;

  constructor() {
    this.apiKey = config.TOGETHER_AI_API_KEY;
    this.httpClient = axios.create({
      baseURL: 'https://api.together.xyz',
      timeout: SETUP_ARCHITECT_CONFIG.TIMEOUT_MS,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // ============================================================================
  // MAIN METHOD
  // ============================================================================

  /**
   * Create trade setups from strategic analysis input
   */
  async createSetups(input: StrategicAnalysisInput): Promise<TradeSetup[]> {
    console.log('[V6-ARCHITECT] Creating trade setups...');
    const startTime = Date.now();

    // DEBUG: Log input summary
    console.log('[V6-ARCHITECT-DEBUG] Input Summary:');
    console.log(`[V6-ARCHITECT-DEBUG]   Current Price: $${input.currentPrice.toFixed(2)}`);
    console.log(`[V6-ARCHITECT-DEBUG]   Market Bias: ${input.marketBias.direction} (${input.marketBias.strength}%)`);
    console.log(`[V6-ARCHITECT-DEBUG]   Fib Levels: ${input.fibonacciAnalysis.levels.length}`);
    console.log(`[V6-ARCHITECT-DEBUG]   Order Blocks: ${input.supportResistance.orderBlocks.length}`);
    console.log(`[V6-ARCHITECT-DEBUG]   S/R Levels: ${input.supportResistance.levels.length}`);
    console.log(`[V6-ARCHITECT-DEBUG]   Liquidity Zones: ${input.liquidityZones.length}`);
    console.log(`[V6-ARCHITECT-DEBUG]   ATR: $${input.atr.toFixed(2)} (${input.atrPercent.toFixed(2)}%)`);
    console.log(`[V6-ARCHITECT-DEBUG]   API Key Present: ${this.apiKey ? 'YES (len=' + this.apiKey.length + ')' : 'NO!'}`);
    console.log(`[V6-ARCHITECT-DEBUG]   Model: ${SETUP_ARCHITECT_CONFIG.MODEL}`);

    try {
      // Build the prompt
      const prompt = this.buildPrompt(input);
      console.log(`[V6-ARCHITECT-DEBUG] Prompt length: ${prompt.length} chars`);

      // Call LLM
      console.log('[V6-ARCHITECT-DEBUG] Calling LLM API...');
      const response = await this.callLLM(prompt);
      console.log(`[V6-ARCHITECT-DEBUG] LLM Response received (${response.length} chars)`);
      console.log(`[V6-ARCHITECT-DEBUG] Response preview: ${response.substring(0, 500)}...`);

      // Parse response
      const architectOutput = this.parseResponse(response);
      console.log(`[V6-ARCHITECT-DEBUG] Parsed ${architectOutput.setups.length} raw setups`);
      if (architectOutput.warnings && architectOutput.warnings.length > 0) {
        console.log(`[V6-ARCHITECT-DEBUG] Warnings: ${architectOutput.warnings.join(', ')}`);
      }

      // Validate and convert to TradeSetup objects
      const setups = this.convertToTradeSetups(architectOutput, input);

      const elapsed = Date.now() - startTime;
      console.log(`[V6-ARCHITECT] Created ${setups.length} valid setups in ${elapsed}ms`);

      if (setups.length === 0 && architectOutput.setups.length > 0) {
        console.log('[V6-ARCHITECT-DEBUG] All raw setups were rejected during validation!');
      }

      // FALLBACK: If LLM returned no setups but we have good levels, create simple setups
      if (setups.length === 0) {
        console.log('[V6-ARCHITECT-DEBUG] No setups from LLM, attempting fallback creation...');
        const fallbackSetups = this.createFallbackSetups(input);
        if (fallbackSetups.length > 0) {
          console.log(`[V6-ARCHITECT] Created ${fallbackSetups.length} FALLBACK setups`);
          return fallbackSetups;
        }
      }

      return setups;
    } catch (error: any) {
      console.error('[V6-ARCHITECT] Error creating setups:', error.message);
      console.error('[V6-ARCHITECT-DEBUG] Full error:', error.stack || error);

      // FALLBACK on error: Try to create simple setups
      console.log('[V6-ARCHITECT-DEBUG] LLM failed, attempting fallback creation...');
      const fallbackSetups = this.createFallbackSetups(input);
      if (fallbackSetups.length > 0) {
        console.log(`[V6-ARCHITECT] Created ${fallbackSetups.length} FALLBACK setups after LLM error`);
        return fallbackSetups;
      }

      return [];
    }
  }

  // ============================================================================
  // PROMPT BUILDING
  // ============================================================================

  /**
   * Build the LLM prompt from analysis input
   */
  private buildPrompt(input: StrategicAnalysisInput): string {
    // Helper to safely format price
    const safePrice = (price: unknown): string => {
      if (typeof price === 'number' && !isNaN(price)) return price.toFixed(2);
      if (typeof price === 'string') return parseFloat(price).toFixed(2) || 'N/A';
      return 'N/A';
    };

    // Format Fibonacci levels (with defensive checks) - include SUPPORT/RESISTANCE context
    const fibLevelsStr = input.fibonacciAnalysis.levels
      .filter(l => l && l.price != null && l.zone)
      .map(l => {
        const positionLabel = l.price < input.currentPrice
          ? 'SUPPORT - valid for BUY entry'
          : 'RESISTANCE - valid for SELL entry';
        return `  - ${l.levelName}: $${safePrice(l.price)} [${positionLabel}] (Zone: $${safePrice(l.zone.low)} - $${safePrice(l.zone.high)}) [${l.strength}${l.tested ? ', TESTED' : ', FRESH'}]`;
      })
      .join('\n') || '  None detected';

    // Format order blocks - BULLISH OB = SUPPORT (BUY entry), BEARISH OB = RESISTANCE (SELL entry)
    const orderBlocksStr = input.supportResistance.orderBlocks
      .filter(ob => ob && ob.zone)
      .map(ob => {
        const zoneMid = (ob.zone.low + ob.zone.high) / 2;
        const directionHint = ob.type === 'BULLISH'
          ? 'SUPPORT - valid for BUY entry'
          : 'RESISTANCE - valid for SELL entry';
        return `  - ${ob.type} OB: $${safePrice(ob.zone.low)} - $${safePrice(ob.zone.high)} [${directionHint}] (${ob.strength}, ${ob.timeframe})`;
      })
      .join('\n') || '  None detected';

    // Format supply/demand zones - DEMAND = SUPPORT (BUY entry), SUPPLY = RESISTANCE (SELL entry)
    const sdZonesStr = input.supportResistance.supplyDemandZones
      .filter(z => z && z.zone)
      .map(z => {
        const directionHint = z.type === 'DEMAND'
          ? 'SUPPORT - valid for BUY entry'
          : 'RESISTANCE - valid for SELL entry';
        return `  - ${z.type}: $${safePrice(z.zone.low)} - $${safePrice(z.zone.high)} [${directionHint}] (${z.strength})`;
      })
      .join('\n') || '  None detected';

    // Format liquidity zones - classify by position relative to current price
    const liquidityStr = input.liquidityZones
      .filter(lz => lz && lz.price != null)
      .map(lz => {
        const directionHint = lz.price < input.currentPrice
          ? 'below price - BUY target/entry zone'
          : 'above price - SELL target/entry zone';
        return `  - ${lz.type}: $${safePrice(lz.price)} [${directionHint}] (${lz.estimatedVolume} volume)`;
      })
      .join('\n') || '  None detected';

    // Format S/R levels - add explicit direction hint based on type and price position
    const srLevelsStr = input.supportResistance.levels
      .filter(l => l && l.price != null)
      .slice(0, 6) // Top 6 levels
      .map(l => {
        const directionHint = l.type === 'SUPPORT'
          ? 'valid for BUY entry'
          : 'valid for SELL entry';
        return `  - ${l.type}: $${safePrice(l.price)} [${directionHint}] (${l.strength}, ${l.timeframe})`;
      })
      .join('\n') || '  None detected';

    // Calculate scalping boundaries
    const maxEntryDistancePct = SETUP_ARCHITECT_CONFIG.MAX_ENTRY_DISTANCE_PCT;
    const maxEntryDistance = input.currentPrice * (maxEntryDistancePct / 100);
    const upperBound = input.currentPrice + maxEntryDistance;
    const lowerBound = input.currentPrice - maxEntryDistance;

    // Calculate typical scalping values at current price
    const typicalStop = input.currentPrice * (SETUP_ARCHITECT_CONFIG.STOP_LOSS_PCT / 100);
    const typicalTP1 = input.currentPrice * (SETUP_ARCHITECT_CONFIG.TAKE_PROFIT_1_PCT / 100);
    const typicalTP2 = input.currentPrice * (SETUP_ARCHITECT_CONFIG.TAKE_PROFIT_2_PCT / 100);
    const minZoneWidth = input.currentPrice * (SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT / 100);
    const maxZoneWidth = input.currentPrice * (SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT / 100);

    // Calculate minimum SL/TP distance in dollars for LLM reference
    const minSlPercent = 0.35;
    const minTpPercent = 0.40;
    const minSlUsd = Math.round(input.currentPrice * minSlPercent / 100);  // 0.35% minimum
    const minTpUsd = Math.round(input.currentPrice * minTpPercent / 100);  // 0.40% minimum (for fees)
    const recommendedSlAtr = Math.round(input.atr * 1.5);     // 1.5x ATR recommended
    const atr15xPercent = ((input.atr * 1.5) / input.currentPrice * 100).toFixed(2);

    // Mode-specific header
    const modeHeader = V6_ENV_CONFIG.MODE === 'SCALPING'
      ? `You are an EXPERT SCALPING ANALYST for BTC/USDT. Your job is to create IMMEDIATE execution setups for quick profits.

═══════════════════════════════════════════════════════════════
SCALPING RULES - READ CAREFULLY
═══════════════════════════════════════════════════════════════

1. ENTRY MUST BE WITHIN ${maxEntryDistancePct}% OF CURRENT PRICE
   - Current Price: ${input.currentPrice.toFixed(2)}
   - Valid Entry Range: ${lowerBound.toFixed(2)} to ${upperBound.toFixed(2)}
   - ANY entry outside this range will be REJECTED

2. SMALL, QUICK PROFITS
   - Target: ${SETUP_ARCHITECT_CONFIG.TAKE_PROFIT_1_PCT}% to ${SETUP_ARCHITECT_CONFIG.TAKE_PROFIT_2_PCT}% profit ($${typicalTP1.toFixed(0)} to $${typicalTP2.toFixed(0)})
   - NOT swing trading - we want trades that close in MINUTES

3. STOP LOSS (CRITICAL - see rules below)
   - MINIMUM: ${minSlPercent}% from entry ($${minSlUsd}+) - tighter SLs will be REJECTED
   - Recommended: 1.5x ATR ($${recommendedSlAtr}, ~${atr15xPercent}%)
   - Place SL BEYOND structure + $20-50 buffer
   - Risk:Reward minimum ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO}:1 (prefer 1.5:1+)

4. TAKE PROFIT (FEE-AWARE - CRITICAL)
   - MINIMUM: ${minTpPercent}% from entry ($${minTpUsd}+) - closer TPs will be REJECTED
   - Exchange fees: ~0.08% round trip (0.04% maker + 0.04% taker)
   - At ${minTpPercent}% TP, net profit = ${minTpPercent}% - 0.08% = ${(minTpPercent - 0.08).toFixed(2)}% ✓
   - TPs below ${minTpPercent}% would result in fees eating most of the profit!

5. ENTRY ZONE WIDTH
   - Zone should be ${SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT}% to ${SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT}% wide ($${minZoneWidth.toFixed(0)} to $${maxZoneWidth.toFixed(0)})
   - Example: ${(input.currentPrice - 100).toFixed(0)} to ${(input.currentPrice - 50).toFixed(0)} for a BUY`
      : `You are the SETUP ARCHITECT for a BTC swing trading system. Your job is to create 2-5 high-quality trade setups.`;

    // Mark levels that are IN RANGE for scalping
    const markInRange = (price: number): string => {
      if (V6_ENV_CONFIG.MODE !== 'SCALPING') return '';
      return Math.abs(price - input.currentPrice) < maxEntryDistance ? ' [IN RANGE]' : ' [TOO FAR]';
    };

    // Re-format with IN RANGE markers for scalping mode
    const fibLevelsStrScalp = input.fibonacciAnalysis.levels
      .filter(l => l && l.price != null && l.zone)
      .map(l => {
        const positionLabel = l.price < input.currentPrice
          ? 'SUPPORT - valid for BUY entry'
          : 'RESISTANCE - valid for SELL entry';
        const inRange = markInRange(l.price);
        return `  - ${l.levelName}: $${safePrice(l.price)} [${positionLabel}]${inRange} (Zone: $${safePrice(l.zone.low)} - $${safePrice(l.zone.high)}) [${l.strength}${l.tested ? ', TESTED' : ', FRESH'}]`;
      })
      .join('\n') || '  None detected';

    const srLevelsStrScalp = input.supportResistance.levels
      .filter(l => l && l.price != null)
      .slice(0, 6)
      .map(l => {
        const directionHint = l.type === 'SUPPORT'
          ? 'valid for BUY entry'
          : 'valid for SELL entry';
        const inRange = markInRange(l.price);
        return `  - ${l.type}: $${safePrice(l.price)} [${directionHint}]${inRange} (${l.strength}, ${l.timeframe})`;
      })
      .join('\n') || '  None detected';

    // Use scalping-formatted levels if in scalping mode
    const finalFibLevels = V6_ENV_CONFIG.MODE === 'SCALPING' ? fibLevelsStrScalp : fibLevelsStr;
    const finalSRLevels = V6_ENV_CONFIG.MODE === 'SCALPING' ? srLevelsStrScalp : srLevelsStr;

    // Mode-specific rules
    const modeRules = V6_ENV_CONFIG.MODE === 'SCALPING'
      ? `
YOUR TASK:
Create 2-3 SCALPING setups. REQUIREMENTS:

DO:
- Entry within ${lowerBound.toFixed(2)} - ${upperBound.toFixed(2)} (${maxEntryDistancePct}% of price)
- At least 1 BUY and 1 SELL setup for flexibility
- Stop loss: MINIMUM ${minSlPercent}% ($${minSlUsd}) - SLs below this will be AUTO-REJECTED
- Take profit: MINIMUM ${minTpPercent}% ($${minTpUsd}) - TPs below this will be AUTO-REJECTED (fees ~0.08%)
- Risk:Reward >= ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO}
- Zone width: ${SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT}% - ${SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT}%

DO NOT:
- Create entries more than ${maxEntryDistancePct}% from current price
- Use wide swing-trade style targets (1%+)
- Duplicate existing setup levels (within ${V6_ENV_CONFIG.DUPLICATE_THRESHOLD_PCT}%)
- All same direction - need diversity

HOW SETUPS WORK:
- BUY setup: Entry at SUPPORT (below current price). Price drops to entry, profits as it rises.
- SELL setup: Entry at RESISTANCE (above current price). Price rises to entry, profits as it falls.

GRADING FOR SCALPING:
- Grade A: 2+ confluences + with-trend + R:R >= 1.5 + confidence >= 75
- Grade B: 1-2 confluences + R:R >= ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO} + confidence >= 65
- Grade C: Counter-trend scalp with strong level + R:R >= ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO}

VALIDATION (auto-reject if violated):
- BUY entry midpoint <= $${upperBound.toFixed(0)}
- SELL entry midpoint >= $${lowerBound.toFixed(0)}
- Stop loss ${SETUP_ARCHITECT_CONFIG.STOP_LOSS_PCT}% - ${SETUP_ARCHITECT_CONFIG.MAX_STOP_LOSS_PCT}% from entry
- Zone width ${SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT}% - ${SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT}%`
      : `
YOUR TASK:
Create 2-5 trade setups based on the detected levels.

HOW SETUPS WORK (CRITICAL - understand this before creating setups):
- BUY setup: We place a limit order at SUPPORT (below current price). Price drops DOWN to our entry, then we profit as it rises back up.
- SELL setup: We place a limit order at RESISTANCE (above current price). Price rises UP to our entry, then we profit as it falls back down.
- NEVER create a BUY setup at a resistance level (above price) or a SELL setup at a support level (below price)!

RULES:
1. CONFLUENCE IS KEY - Best setups combine 2+ levels from different sources (Fib + Order Block, Fib + S/R, etc.)
2. WITH-TREND PREFERRED - Grade A setups should align with market bias
3. FRESH LEVELS ONLY - Prioritize untested levels
4. MINIMUM R:R ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO}:1 - Calculate realistic SL and TP
5. DIRECTION-LEVEL MATCHING (CRITICAL - setups violating this will be REJECTED):
   - BUY setups: Entry zone MUST be at a level marked "SUPPORT" (BELOW current price)
   - SELL setups: Entry zone MUST be at a level marked "RESISTANCE" (ABOVE current price)
6. ENTRY ZONES - Must be $${minZoneWidth.toFixed(0)}-$${maxZoneWidth.toFixed(0)} wide
7. STOP LOSS - Place beyond the invalidation level
8. TAKE PROFIT - Target next significant level
9. NEAR-PRICE REQUIRED - At least ONE setup MUST have entry within 0.5% of current price
10. ALWAYS include BOTH directions

VALIDATION RULES (setups violating these will be AUTOMATICALLY REJECTED):
- BUY entry zone midpoint must be AT or BELOW current price (max 0.05% above allowed)
- SELL entry zone midpoint must be AT or ABOVE current price (max 0.05% below allowed)
- Entry zones must be ${SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT}%-${SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT}% wide
- R:R ratio must be >= ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO}

GRADING SYSTEM:
- Grade A: 3+ confluences AND with-trend AND R:R >= 2.0 AND confidence >= 80
- Grade B: 2+ confluences AND (with-trend OR R:R >= 1.75) AND confidence >= 65
- Grade C: 1 confluence with strong level AND R:R >= 1.5`;

    // CRITICAL: Stop Loss and Take Profit rules section with examples
    const slRulesSection = `
═══════════════════════════════════════════════════════════════════
                    CRITICAL STOP LOSS RULES
═══════════════════════════════════════════════════════════════════

MANDATORY MINIMUM STOP LOSS DISTANCE:
- Minimum: ${minSlPercent}% from entry (approximately $${minSlUsd} at current price)
- Recommended: 1.5x ATR = $${recommendedSlAtr} (~${atr15xPercent}%)
- NEVER place SL tighter than $${minSlUsd} from entry price

STOP LOSS CALCULATION METHOD:
1. Calculate 1.5x ATR: $${input.atr.toFixed(0)} x 1.5 = $${recommendedSlAtr}
2. Verify it's >= ${minSlPercent}% of entry price
3. Place SL BEYOND the nearest structure (support for BUY, resistance for SELL)
4. Add buffer of $20-50 beyond the structure level

═══════════════════════════════════════════════════════════════════
                TAKE PROFIT REQUIREMENTS (FEE-AWARE)
═══════════════════════════════════════════════════════════════════

Exchange fees: ~0.08% round trip (0.04% open + 0.04% close)
MINIMUM TP distance: ${minTpPercent}% from entry ($${minTpUsd})
At current price, this ensures net profit after fees.

FEE MATH EXAMPLE:
  Position: $2,500 at ${minTpPercent}% TP
  Gross profit: $${(2500 * minTpPercent / 100).toFixed(2)}
  Fees: $2.00 (0.08%)
  Net profit: $${((2500 * minTpPercent / 100) - 2).toFixed(2)} ✓

EXAMPLE FOR BUY SETUP:
- Entry: $${input.currentPrice.toFixed(0)}
- Nearest support: $${(input.currentPrice - 200).toFixed(0)}
- WRONG SL: $${(input.currentPrice - 200).toFixed(0)} (only 0.22% - TOO TIGHT!)
- CORRECT SL: $${(input.currentPrice - minSlUsd - 30).toFixed(0)} (${minSlPercent}%+ - with buffer below support)

EXAMPLE FOR SELL SETUP:
- Entry: $${input.currentPrice.toFixed(0)}
- Nearest resistance: $${(input.currentPrice + 200).toFixed(0)}
- WRONG SL: $${(input.currentPrice + 200).toFixed(0)} (only 0.22% - TOO TIGHT!)
- CORRECT SL: $${(input.currentPrice + minSlUsd + 30).toFixed(0)} (${minSlPercent}%+ - with buffer above resistance)

IF YOU CANNOT PLACE SL AT ${minSlPercent}%+ OR TP AT ${minTpPercent}%+ WITH VALID STRUCTURE:
-> DO NOT CREATE THE SETUP
-> Return empty setups array
`;

    return `${modeHeader}

${slRulesSection}

═══════════════════════════════════════════════════════════════
CURRENT MARKET DATA
═══════════════════════════════════════════════════════════════

PRICE & VOLATILITY:
- Current Price: ${input.currentPrice.toFixed(2)}
- ATR (14): ${input.atr.toFixed(2)} (${input.atrPercent.toFixed(2)}%)
- Market Bias: ${input.marketBias.direction} (${input.marketBias.strength}% confidence)
- 4H Trend: ${input.marketBias.htf4H} | 1H Trend: ${input.marketBias.htf1H}
- Preferred Direction: ${input.marketBias.preferredDirection}

FIBONACCI LEVELS:
${finalFibLevels}
- Golden Pocket: ${input.fibonacciAnalysis.goldenPocket
  ? `$${input.fibonacciAnalysis.goldenPocket.low.toFixed(2)} - $${input.fibonacciAnalysis.goldenPocket.high.toFixed(2)}`
  : 'Not in range'}

ORDER BLOCKS:
${orderBlocksStr}

SUPPLY/DEMAND ZONES:
${sdZonesStr}

LIQUIDITY ZONES:
${liquidityStr}

SUPPORT/RESISTANCE:
${finalSRLevels}

═══════════════════════════════════════════════════════════════
V6 PRO: ENHANCED MARKET CONTEXT
═══════════════════════════════════════════════════════════════

MULTI-TIMEFRAME (MTF) CONFLUENCE:
${(input as any).mtfAnalysis ? `- H4: ${(input as any).mtfAnalysis.h4Trend} | H1: ${(input as any).mtfAnalysis.h1Trend} | M15: ${(input as any).mtfAnalysis.m15Trend} | M5: ${(input as any).mtfAnalysis.m5Trend}
- Confluence Score: ${(input as any).mtfAnalysis.confluenceScore}% (${(input as any).mtfAnalysis.alignmentCount}/4 timeframes aligned)
- Dominant Trend: ${(input as any).mtfAnalysis.dominantTrend}
- Trading Bias: ${(input as any).mtfAnalysis.tradingBias}
- Strength: ${(input as any).mtfAnalysis.strength}
${(input as any).mtfAnalysis.confluenceScore >= 70 ? `*** MTF FILTER: Strongly prefer ${(input as any).mtfAnalysis.tradingBias} setups ***` : ''}
${(input as any).mtfAnalysis.confluenceScore >= 85 ? `*** HIGH CONFLUENCE: Only ${(input as any).mtfAnalysis.tradingBias} setups recommended ***` : ''}` : '- MTF analysis not available'}

MOMENTUM ANALYSIS:
${(input as any).momentumAnalysis ? `- RSI: ${(input as any).momentumAnalysis.rsi.toFixed(1)} (${(input as any).momentumAnalysis.rsiZone})${(input as any).momentumAnalysis.rsiDivergence !== 'NONE' ? ` - ${(input as any).momentumAnalysis.rsiDivergence} divergence detected` : ''}
- MACD: ${(input as any).momentumAnalysis.macdTrend}${(input as any).momentumAnalysis.macdCrossover !== 'NONE' ? ` - ${(input as any).momentumAnalysis.macdCrossover}` : ''}
- Volume: ${(input as any).momentumAnalysis.volumeRatio.toFixed(2)}x average (${(input as any).momentumAnalysis.volumeTrend})
- Overall Momentum: ${(input as any).momentumAnalysis.overallMomentum}
- Entry Quality: BUY=${(input as any).momentumAnalysis.entryQuality.forBuy}, SELL=${(input as any).momentumAnalysis.entryQuality.forSell}
${(input as any).momentumAnalysis.exhaustionWarning.isExhausted ? `*** EXHAUSTION WARNING: ${(input as any).momentumAnalysis.exhaustionWarning.reason} - AVOID ${(input as any).momentumAnalysis.exhaustionWarning.direction} ***` : ''}` : '- Momentum analysis not available'}

SESSION CONTEXT:
${(input as any).sessionAnalysis ? `- Current Session: ${(input as any).sessionAnalysis.session} (${(input as any).sessionAnalysis.quality})
- Volatility Expected: ${(input as any).sessionAnalysis.volatility}
- Is Killzone: ${(input as any).sessionAnalysis.isKillzone ? 'YES - optimal trading' : 'No'}
- Should Trade: ${(input as any).sessionAnalysis.shouldTrade ? 'YES' : 'CAUTION - ' + (input as any).sessionAnalysis.reason}
- Position Size: ${(input as any).sessionAnalysis.positionMultiplier}x
${(input as any).sessionAnalysis.quality === 'EXCELLENT' ? '*** KILLZONE: Higher confidence for all setups ***' : ''}
${(input as any).sessionAnalysis.quality === 'POOR' ? '*** LOW LIQUIDITY: Only Grade A setups recommended ***' : ''}` : '- Session analysis not available'}

COMBINED CONFIDENCE ADJUSTMENTS:
- MTF Boost: ${(input as any).mtfAnalysis?.confidenceBoost || 0} points
- Momentum Modifier: ${(input as any).momentumAnalysis?.confidenceModifier || 0} points
- Session Modifier: ${(input as any).sessionAnalysis?.confidenceModifier || 0} points
- Apply these to base confidence when grading setups

${input.existingSetups && input.existingSetups.length > 0 ? `EXISTING SETUPS (avoid duplicates within ${V6_ENV_CONFIG.DUPLICATE_THRESHOLD_PCT}%):
${input.existingSetups.map(s => `  - ${s.direction} @ $${s.entryPrice.toFixed(0)}`).join('\n')}
` : ''}
${modeRules}

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT (JSON ONLY)
═══════════════════════════════════════════════════════════════

{
  "setups": [
    {
      "direction": "BUY" | "SELL",
      "bias": "WITH_TREND" | "COUNTER_TREND" | "SCALP",
      "entryZone": { "low": <ABSOLUTE PRICE>, "high": <ABSOLUTE PRICE> },
      "stopLoss": <ABSOLUTE PRICE like ${(input.currentPrice * 0.998).toFixed(2)}>,
      "takeProfit1": <ABSOLUTE PRICE like ${(input.currentPrice * 1.002).toFixed(2)}>,
      "takeProfit2": <ABSOLUTE PRICE or null>,
      "riskRewardRatio": <number >= ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO}>,
      "grade": "A" | "B" | "C",
      "confidence": <${SETUP_ARCHITECT_CONFIG.MIN_CONFIDENCE}-${SETUP_ARCHITECT_CONFIG.MAX_CONFIDENCE}>,
      "reasons": [
        { "source": "<FIB_XX | ORDER_BLOCK | SR | LIQUIDITY>", "level": <price>, "description": "<why>", "strength": "STRONG" | "MODERATE" | "WEAK" }
      ],
      "requiredConfirmation": {
        "patterns": ["REJECTION_WICK"],
        "minStrength": "ANY",
        "volumeRequired": false
      },
      "marketContext": "<1 sentence>"
    }
  ],
  "marketSummary": "<brief>",
  "warnings": "<any concerns>" | null
}

CRITICAL: All prices (stopLoss, takeProfit1, takeProfit2, entryZone) MUST be ABSOLUTE BTC PRICES!
- Current price: ${input.currentPrice.toFixed(2)}
- For a BUY at $${input.currentPrice.toFixed(0)}: stopLoss should be ~$${(input.currentPrice * 0.998).toFixed(0)}, takeProfit1 should be ~$${(input.currentPrice * 1.002).toFixed(0)}
- For a SELL at $${input.currentPrice.toFixed(0)}: stopLoss should be ~$${(input.currentPrice * 1.002).toFixed(0)}, takeProfit1 should be ~$${(input.currentPrice * 0.998).toFixed(0)}
- NEVER return just the dollar distance (e.g., 133 or 178). Always return full price (e.g., ${(input.currentPrice - 133).toFixed(0)} or ${(input.currentPrice + 178).toFixed(0)})

═══════════════════════════════════════════════════════════════
VALIDATION CHECKLIST - Verify before outputting each setup:
═══════════════════════════════════════════════════════════════
☐ SL distance >= ${minSlPercent}% from entry ($${minSlUsd}+)
☐ TP distance >= ${minTpPercent}% from entry ($${minTpUsd}+)
☐ R:R ratio >= ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO} (TP_dist / SL_dist)
☐ Entry zone within ${maxEntryDistancePct}% of current price ($${(input.currentPrice - maxEntryDistance).toFixed(0)} - $${(input.currentPrice + maxEntryDistance).toFixed(0)})
☐ Zone width between ${SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT}% and ${SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT}%
☐ At least 1 valid technical reason
☐ SL placed BEYOND structure, not AT structure

IF ANY CHECK FAILS → DO NOT OUTPUT THAT SETUP

If no valid setups exist with proper SL/TP distances, return: {"setups": []}

RESPOND WITH VALID JSON ONLY. NO EXPLANATIONS OUTSIDE JSON.`;
  }

  // ============================================================================
  // LLM CALL
  // ============================================================================

  /**
   * Call the LLM API
   */
  private async callLLM(prompt: string): Promise<string> {
    try {
      const response = await this.httpClient.post('/v1/chat/completions', {
        model: SETUP_ARCHITECT_CONFIG.MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a professional trading setup architect. You ONLY respond with valid JSON. No markdown, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: SETUP_ARCHITECT_CONFIG.TEMPERATURE,
        max_tokens: SETUP_ARCHITECT_CONFIG.MAX_TOKENS,
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      return content;
    } catch (error: any) {
      console.error('[V6-ARCHITECT] LLM call failed:', error.message);
      throw error;
    }
  }

  // ============================================================================
  // RESPONSE PARSING
  // ============================================================================

  /**
   * Parse the LLM response into SetupArchitectOutput
   */
  private parseResponse(response: string): SetupArchitectOutput {
    try {
      // Clean up the response (remove markdown if present)
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
      }
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      cleanResponse = cleanResponse.trim();

      const parsed = JSON.parse(cleanResponse);

      // Validate structure
      if (!parsed.setups || !Array.isArray(parsed.setups)) {
        throw new Error('Invalid response structure: missing setups array');
      }

      return {
        setups: parsed.setups,
        marketSummary: parsed.marketSummary || '',
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings
          : (parsed.warnings ? [String(parsed.warnings)] : []),
      };
    } catch (error: any) {
      console.error('[V6-ARCHITECT] Failed to parse response:', error.message);
      console.error('[V6-ARCHITECT] Raw response:', response.slice(0, 500));
      return {
        setups: [],
        marketSummary: 'Parse error',
        warnings: ['Failed to parse LLM response'],
      };
    }
  }

  // ============================================================================
  // SETUP CONVERSION
  // ============================================================================

  /**
   * Convert architect output to validated TradeSetup objects
   */
  private convertToTradeSetups(
    output: SetupArchitectOutput,
    input: StrategicAnalysisInput
  ): TradeSetup[] {
    const validSetups: TradeSetup[] = [];

    for (const rawSetup of output.setups) {
      try {
        // Validate the raw setup (pass current price for direction validation)
        if (!this.validateRawSetup(rawSetup, input.currentPrice)) {
          console.warn('[V6-ARCHITECT] Skipping invalid setup:', rawSetup);
          continue;
        }

        // Convert to TradeSetup
        const setup = this.createTradeSetup(rawSetup, input);

        if (setup) {
          validSetups.push(setup);
        }

        // Stop if we have enough setups
        if (validSetups.length >= SETUP_ARCHITECT_CONFIG.MAX_SETUPS_PER_ANALYSIS) {
          break;
        }
      } catch (error: any) {
        console.warn('[V6-ARCHITECT] Error converting setup:', error.message);
      }
    }

    return validSetups;
  }

  /**
   * Validate a raw setup from LLM
   */
  private validateRawSetup(setup: SetupArchitectSetup, currentPrice: number): boolean {
    console.log(`[V6-ARCHITECT-DEBUG] Validating setup: ${setup.direction} @ ${setup.entryZone?.low?.toFixed(0) || 'N/A'}-${setup.entryZone?.high?.toFixed(0) || 'N/A'}`);

    // Check required fields
    if (!setup.direction || !['BUY', 'SELL'].includes(setup.direction)) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: Invalid direction: ${setup.direction}`);
      return false;
    }
    if (!setup.entryZone || !setup.entryZone.low || !setup.entryZone.high) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: Missing entry zone`);
      return false;
    }
    if (!setup.stopLoss || !setup.takeProfit1) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: Missing SL or TP1 (SL=${setup.stopLoss}, TP1=${setup.takeProfit1})`);
      return false;
    }

    // ========================================================================
    // CRITICAL: Sanity check SL/TP are absolute prices, not deltas
    // If values are tiny (less than 1% of current price), they're deltas
    // ========================================================================
    if (setup.stopLoss < currentPrice * 0.5 || setup.takeProfit1 < currentPrice * 0.5) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: SL/TP appear to be deltas, not absolute prices!`);
      console.log(`[V6-ARCHITECT-DEBUG]   SL=${setup.stopLoss.toFixed(2)}, TP1=${setup.takeProfit1.toFixed(2)} (expected ~$${currentPrice.toFixed(0)})`);
      console.log(`[V6-ARCHITECT-DEBUG]   LLM may have returned dollar distance instead of price`);
      return false;
    }

    // ========================================================================
    // Direction-based SL/TP validation
    // BUY: stopLoss < currentPrice < takeProfit1
    // SELL: takeProfit1 < currentPrice < stopLoss
    // ========================================================================
    if (setup.direction === 'BUY') {
      if (setup.stopLoss >= currentPrice) {
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: BUY stopLoss $${setup.stopLoss.toFixed(0)} must be BELOW current $${currentPrice.toFixed(0)}`);
        return false;
      }
      if (setup.takeProfit1 <= currentPrice) {
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: BUY takeProfit $${setup.takeProfit1.toFixed(0)} must be ABOVE current $${currentPrice.toFixed(0)}`);
        return false;
      }
    } else if (setup.direction === 'SELL') {
      if (setup.stopLoss <= currentPrice) {
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: SELL stopLoss $${setup.stopLoss.toFixed(0)} must be ABOVE current $${currentPrice.toFixed(0)}`);
        return false;
      }
      if (setup.takeProfit1 >= currentPrice) {
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: SELL takeProfit $${setup.takeProfit1.toFixed(0)} must be BELOW current $${currentPrice.toFixed(0)}`);
        return false;
      }
    }

    // Validate SL/TP are within reasonable range (5% of price)
    const slDistance = Math.abs(setup.stopLoss - currentPrice) / currentPrice;
    const tpDistance = Math.abs(setup.takeProfit1 - currentPrice) / currentPrice;

    // CRITICAL: Minimum SL distance to avoid getting stopped out by wicks/noise
    // 0.35% minimum for scalping mode - widened to avoid wick stops
    const MIN_SL_DISTANCE = 0.0035; // 0.35%

    // CRITICAL: Minimum TP distance to ensure profit after fees
    // WEEX fees: ~0.08% round trip (0.04% maker + 0.04% taker)
    // At 0.40% TP, gross = 0.40%, net = 0.40% - 0.08% = 0.32% profit
    const MIN_TP_DISTANCE = 0.0040; // 0.40%

    if (slDistance < MIN_SL_DISTANCE) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: SL too CLOSE to price: ${(slDistance * 100).toFixed(2)}% < ${(MIN_SL_DISTANCE * 100).toFixed(2)}% minimum`);
      console.log(`[V6-ARCHITECT-DEBUG]   SL must be at least ${(MIN_SL_DISTANCE * 100).toFixed(2)}% from entry to avoid wick stops`);
      return false;
    }

    // NEW: Minimum TP distance to ensure profit after fees
    if (tpDistance < MIN_TP_DISTANCE) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: TP too CLOSE to price: ${(tpDistance * 100).toFixed(2)}% < ${(MIN_TP_DISTANCE * 100).toFixed(2)}% minimum`);
      console.log(`[V6-ARCHITECT-DEBUG]   TP must be at least ${(MIN_TP_DISTANCE * 100).toFixed(2)}% from entry (fees ~0.08% would eat profit)`);
      return false;
    }

    if (slDistance > 0.05) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: SL too far from price: ${(slDistance * 100).toFixed(2)}% > 5%`);
      return false;
    }
    if (tpDistance > 0.05) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: TP too far from price: ${(tpDistance * 100).toFixed(2)}% > 5%`);
      return false;
    }

    if (!setup.grade || !['A', 'B', 'C'].includes(setup.grade)) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: Invalid grade: ${setup.grade}`);
      return false;
    }

    // ========================================================================
    // CRITICAL: Validate direction vs price position (SYMMETRIC BOUNDS)
    // BUY = support level = entry should be BELOW or AT current price
    // SELL = resistance level = entry should be ABOVE or AT current price
    // BOTH directions need upper AND lower bounds to prevent entries too far away
    // ========================================================================
    const entryMidpoint = (setup.entryZone.high + setup.entryZone.low) / 2;
    // Tight tolerance to prevent inverted setups (0.05% = ~$46 at $93k)
    const priceBuffer = V6_ENV_CONFIG.MODE === 'SCALPING' ? 0.0005 : 0.002; // 0.05% for scalping, 0.2% for swing
    // Max distance for entry (from config)
    const maxEntryDistancePct = SETUP_ARCHITECT_CONFIG.MAX_ENTRY_DISTANCE_PCT / 100;

    // BUY validation: Entry must be within range of current price (SYMMETRIC)
    if (setup.direction === 'BUY') {
      const upperBound = currentPrice * (1 + priceBuffer);
      const lowerBound = currentPrice * (1 - maxEntryDistancePct);

      // Check upper bound - BUY should not be above current price
      if (entryMidpoint > upperBound) {
        const distanceAbove = ((entryMidpoint - currentPrice) / currentPrice) * 100;
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: BUY entry $${entryMidpoint.toFixed(0)} is ${distanceAbove.toFixed(2)}% ABOVE current price $${currentPrice.toFixed(0)} (max allowed: ${(priceBuffer * 100).toFixed(1)}%)`);
        console.log(`[V6-ARCHITECT-DEBUG]   BUY setups must be at support (below price), not resistance (above price)`);
        return false;
      }

      // Check lower bound - BUY should not be too far below current price
      if (entryMidpoint < lowerBound) {
        const distanceBelow = ((currentPrice - entryMidpoint) / currentPrice) * 100;
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: BUY entry $${entryMidpoint.toFixed(0)} is ${distanceBelow.toFixed(2)}% BELOW current price $${currentPrice.toFixed(0)} (too far below, max: ${(maxEntryDistancePct * 100).toFixed(1)}%)`);
        console.log(`[V6-ARCHITECT-DEBUG]   BUY entry zone is too far away - price may never reach it`);
        return false;
      }
    }

    // SELL validation: Entry must be within range of current price (SYMMETRIC)
    if (setup.direction === 'SELL') {
      const lowerBound = currentPrice * (1 - priceBuffer);
      const upperBound = currentPrice * (1 + maxEntryDistancePct);

      // Check lower bound - SELL should not be below current price
      if (entryMidpoint < lowerBound) {
        const distanceBelow = ((currentPrice - entryMidpoint) / currentPrice) * 100;
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: SELL entry $${entryMidpoint.toFixed(0)} is ${distanceBelow.toFixed(2)}% BELOW current price $${currentPrice.toFixed(0)} (max allowed: ${(priceBuffer * 100).toFixed(1)}%)`);
        console.log(`[V6-ARCHITECT-DEBUG]   SELL setups must be at resistance (above price), not support (below price)`);
        return false;
      }

      // Check upper bound - SELL should not be too far above current price
      if (entryMidpoint > upperBound) {
        const distanceAbove = ((entryMidpoint - currentPrice) / currentPrice) * 100;
        console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: SELL entry $${entryMidpoint.toFixed(0)} is ${distanceAbove.toFixed(2)}% ABOVE current price $${currentPrice.toFixed(0)} (too far above, max: ${(maxEntryDistancePct * 100).toFixed(1)}%)`);
        console.log(`[V6-ARCHITECT-DEBUG]   SELL entry zone is too far away - price may never reach it`);
        return false;
      }
    }

    // ========================================================================
    // SCALPING MODE: Entry must be VERY close to current price
    // This ensures we're not waiting for price to move far to hit entry zone
    // ========================================================================
    const entryDistancePercent = Math.abs(entryMidpoint - currentPrice) / currentPrice * 100;
    if (entryDistancePercent > SETUP_ARCHITECT_CONFIG.MAX_ENTRY_DISTANCE_PCT) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: Entry too far from price: ${entryDistancePercent.toFixed(3)}% > ${SETUP_ARCHITECT_CONFIG.MAX_ENTRY_DISTANCE_PCT}% max`);
      console.log(`[V6-ARCHITECT-DEBUG]   Entry midpoint: $${entryMidpoint.toFixed(0)} | Current: $${currentPrice.toFixed(0)} | Max allowed: ${(currentPrice * SETUP_ARCHITECT_CONFIG.MAX_ENTRY_DISTANCE_PCT / 100).toFixed(0)}`);
      return false;
    }

    // Validate R:R
    if (setup.riskRewardRatio < SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: R:R too low: ${setup.riskRewardRatio} < ${SETUP_ARCHITECT_CONFIG.MIN_RR_RATIO}`);
      return false;
    }

    // Validate zone width
    const zoneWidth = Math.abs(setup.entryZone.high - setup.entryZone.low);
    const midpoint = (setup.entryZone.high + setup.entryZone.low) / 2;
    const zoneWidthPercent = zoneWidth / midpoint;

    if (zoneWidthPercent < SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT / 100) {
      // Auto-expand zone to minimum width - SYMMETRIC expansion to preserve midpoint
      const minWidth = midpoint * (SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT / 100);
      const expansion = minWidth - zoneWidth;
      const halfExpansion = expansion / 2;

      // FIXED: Expand SYMMETRICALLY to preserve midpoint at intended level
      // This ensures entry price stays at the original target, not shifted away
      setup.entryZone.low -= halfExpansion;
      setup.entryZone.high += halfExpansion;
      console.log(`[V6-ARCHITECT-DEBUG]   AUTO-EXPANDED ${setup.direction}: Zone widened SYMMETRICALLY from ${(zoneWidthPercent * 100).toFixed(3)}% to ${SETUP_ARCHITECT_CONFIG.MIN_ZONE_WIDTH_PERCENT}% (midpoint preserved at $${midpoint.toFixed(0)})`);
    }
    if (zoneWidthPercent > SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT / 100) {
      console.log(`[V6-ARCHITECT-DEBUG]   REJECTED: Zone too wide: ${(zoneWidthPercent * 100).toFixed(3)}% > ${SETUP_ARCHITECT_CONFIG.MAX_ZONE_WIDTH_PERCENT}%`);
      return false;
    }

    // Validate confidence
    if (setup.confidence < SETUP_ARCHITECT_CONFIG.MIN_CONFIDENCE ||
        setup.confidence > SETUP_ARCHITECT_CONFIG.MAX_CONFIDENCE) {
      setup.confidence = Math.min(Math.max(setup.confidence, SETUP_ARCHITECT_CONFIG.MIN_CONFIDENCE), SETUP_ARCHITECT_CONFIG.MAX_CONFIDENCE);
    }

    console.log(`[V6-ARCHITECT-DEBUG]   VALID: ${setup.direction} @ $${midpoint.toFixed(0)} (Grade ${setup.grade}, R:R ${setup.riskRewardRatio})`);
    return true;
  }

  /**
   * Create a TradeSetup from validated raw setup
   */
  private createTradeSetup(
    raw: SetupArchitectSetup,
    input: StrategicAnalysisInput
  ): TradeSetup | null {
    try {
      const midpoint = (raw.entryZone.high + raw.entryZone.low) / 2;

      // Convert reasons
      const reasons: SetupReason[] = (raw.reasons || []).map(r => ({
        source: this.mapReasonSource(r.source),
        level: r.level,
        description: r.description,
        strength: this.mapStrength(r.strength),
        weight: this.calculateReasonWeight(r.source, r.strength),
      }));

      // Convert confirmation patterns
      const patterns: ConfirmationPattern[] = (raw.requiredConfirmation?.patterns || ['REJECTION_WICK']).map(p => ({
        type: this.mapPatternType(p),
      }));

      const requiredConfirmation: RequiredConfirmation = {
        patterns,
        minStrength: this.mapMinStrength(raw.requiredConfirmation?.minStrength),
        volumeRequired: raw.requiredConfirmation?.volumeRequired || false,
        volumeMultiplier: 1.2,
      };

      const setup: TradeSetup = {
        id: uuidv4(),
        symbol: 'BTCUSDT', // V6 focuses on BTC only
        createdAt: new Date(),
        expiresAt: createExpiryDate(V6_SETUP_CONFIG.DEFAULT_SETUP_EXPIRY_HOURS),

        direction: raw.direction as SetupDirection,
        bias: (raw.bias || 'WITH_TREND') as SetupBias,
        entryZone: {
          low: raw.entryZone.low,
          high: raw.entryZone.high,
          midpoint,
        },
        stopLoss: raw.stopLoss,
        takeProfit1: raw.takeProfit1,
        takeProfit2: raw.takeProfit2 || undefined,
        riskRewardRatio: raw.riskRewardRatio,

        grade: raw.grade as SetupGrade,
        confidence: raw.confidence,
        reasons,

        requiredConfirmation,

        status: 'WAITING',
        confirmationAttempts: 0,
        maxConfirmationAttempts: V6_SETUP_CONFIG.MAX_CONFIRMATION_ATTEMPTS,

        htfTrend: input.marketBias.direction,
        marketContext: raw.marketContext || '',
        analysisTimestamp: input.timestamp,
      };

      return setup;
    } catch (error: any) {
      console.error('[V6-ARCHITECT] Error creating setup:', error.message);
      return null;
    }
  }

  // ============================================================================
  // MAPPING HELPERS
  // ============================================================================

  private mapReasonSource(source: string): SetupReason['source'] {
    const mapping: Record<string, SetupReason['source']> = {
      'FIB_382': 'FIB_382',
      'FIB_500': 'FIB_500',
      'FIB_618': 'FIB_618',
      'FIB_786': 'FIB_786',
      'FIB_EXTENSION': 'FIB_EXTENSION',
      'ORDER_BLOCK': 'ORDER_BLOCK',
      'DEMAND_ZONE': 'DEMAND_ZONE',
      'SUPPLY_ZONE': 'SUPPLY_ZONE',
      'SUPPORT': 'SUPPORT',
      'RESISTANCE': 'RESISTANCE',
      'LIQUIDITY_POOL': 'LIQUIDITY_POOL',
      'EMA_CONFLUENCE': 'EMA_CONFLUENCE',
      'TREND_LINE': 'TREND_LINE',
    };
    return mapping[source] || 'SUPPORT';
  }

  private mapStrength(strength: string): 'WEAK' | 'MODERATE' | 'STRONG' {
    const s = strength?.toUpperCase();
    if (s === 'STRONG') return 'STRONG';
    if (s === 'MODERATE') return 'MODERATE';
    return 'WEAK';
  }

  private mapMinStrength(strength: string | undefined): 'ANY' | 'MODERATE' | 'STRONG' {
    const s = strength?.toUpperCase();
    if (s === 'STRONG') return 'STRONG';
    if (s === 'MODERATE') return 'MODERATE';
    return 'ANY';
  }

  private mapPatternType(pattern: string): ConfirmationPattern['type'] {
    const mapping: Record<string, ConfirmationPattern['type']> = {
      'REJECTION_WICK': 'REJECTION_WICK',
      'PIN_BAR': 'PIN_BAR',
      'BULLISH_ENGULFING': 'BULLISH_ENGULFING',
      'BEARISH_ENGULFING': 'BEARISH_ENGULFING',
      'HAMMER': 'HAMMER',
      'SHOOTING_STAR': 'SHOOTING_STAR',
      'DOJI_REVERSAL': 'DOJI_REVERSAL',
    };
    return mapping[pattern] || 'REJECTION_WICK';
  }

  private calculateReasonWeight(source: string, strength: string): number {
    let baseWeight = 5;

    // Source-based weight
    if (source.includes('FIB_618') || source.includes('FIB_786')) {
      baseWeight = 9; // Golden pocket
    } else if (source.includes('ORDER_BLOCK')) {
      baseWeight = 8;
    } else if (source.includes('DEMAND') || source.includes('SUPPLY')) {
      baseWeight = 7;
    } else if (source.includes('FIB')) {
      baseWeight = 6;
    }

    // Strength modifier
    if (strength === 'STRONG') {
      baseWeight = Math.min(10, baseWeight + 1);
    } else if (strength === 'WEAK') {
      baseWeight = Math.max(1, baseWeight - 2);
    }

    return baseWeight;
  }

  // ============================================================================
  // FALLBACK SETUP CREATION
  // ============================================================================

  /**
   * Create simple setups when LLM fails or returns empty
   * PRIORITY: Near-price setups (within 0.5%) and both BUY + SELL directions
   */
  private createFallbackSetups(input: StrategicAnalysisInput): TradeSetup[] {
    const fallbackSetups: TradeSetup[] = [];
    const { currentPrice, marketBias, fibonacciAnalysis, supportResistance, atr } = input;

    // NEAR-PRICE THRESHOLD: 0.5% = ~$450 at $90,000
    const NEAR_PRICE_THRESHOLD = 0.005;
    const nearPriceBuffer = currentPrice * NEAR_PRICE_THRESHOLD;

    console.log('[V6-FALLBACK] Creating near-price fallback setups...');
    console.log(`[V6-FALLBACK] Current price: $${currentPrice.toFixed(0)}`);
    console.log(`[V6-FALLBACK] Near-price range: $${(currentPrice - nearPriceBuffer).toFixed(0)} - $${(currentPrice + nearPriceBuffer).toFixed(0)}`);
    console.log(`[V6-FALLBACK] Market bias: ${marketBias.direction}`);

    // Calculate zone width based on ATR (0.2% of price)
    const zoneWidthPercent = 0.002;
    const zoneHalf = currentPrice * zoneWidthPercent;

    // ==========================================================================
    // COLLECT ALL SUPPORT LEVELS BELOW PRICE (for BUY setups)
    // ==========================================================================
    const buyLevels: { price: number; source: string; strength: string; distance: number }[] = [];

    // Check Golden Pocket
    if (fibonacciAnalysis.goldenPocket && fibonacciAnalysis.goldenPocket.midpoint < currentPrice) {
      const distance = currentPrice - fibonacciAnalysis.goldenPocket.midpoint;
      const distancePercent = (distance / currentPrice) * 100;
      if (distancePercent <= 3) {
        buyLevels.push({
          price: fibonacciAnalysis.goldenPocket.midpoint,
          source: 'GOLDEN_POCKET',
          strength: 'STRONG',
          distance,
        });
        console.log(`[V6-FALLBACK] BUY level: Golden Pocket @ $${fibonacciAnalysis.goldenPocket.midpoint.toFixed(0)} (${distancePercent.toFixed(2)}% away)`);
      }
    }

    // Check all Fib levels below current price
    for (const fib of fibonacciAnalysis.levels) {
      // Defensive check for valid price
      if (fib.price == null || typeof fib.price !== 'number') continue;
      if (fib.price < currentPrice && fib.price > currentPrice * 0.97) { // Within 3%
        const distance = currentPrice - fib.price;
        const distancePercent = (distance / currentPrice) * 100;
        buyLevels.push({
          price: fib.price,
          source: `FIB_${fib.levelName}`,
          strength: fib.strength,
          distance,
        });
        console.log(`[V6-FALLBACK] BUY level: Fib ${fib.levelName} @ $${fib.price.toFixed(0)} (${distancePercent.toFixed(2)}% away)`);
      }
    }

    // Check Order Blocks (Bullish OB = support)
    for (const ob of supportResistance.orderBlocks) {
      if (ob.type === 'BULLISH' && ob.zone.midpoint < currentPrice) {
        const distance = currentPrice - ob.zone.midpoint;
        const distancePercent = (distance / currentPrice) * 100;
        if (distancePercent <= 3 && ob.strength !== 'MITIGATED') {
          buyLevels.push({
            price: ob.zone.midpoint,
            source: 'ORDER_BLOCK',
            strength: ob.strength === 'FRESH' ? 'STRONG' : 'MODERATE',
            distance,
          });
          console.log(`[V6-FALLBACK] BUY level: Bullish OB @ $${ob.zone.midpoint.toFixed(0)} (${distancePercent.toFixed(2)}% away)`);
        }
      }
    }

    // Check S/R levels
    for (const sr of supportResistance.levels) {
      // Defensive check for valid price
      if (sr.price == null || typeof sr.price !== 'number') continue;
      if (sr.type === 'SUPPORT' && sr.price < currentPrice) {
        const distance = currentPrice - sr.price;
        const distancePercent = (distance / currentPrice) * 100;
        if (distancePercent <= 3) {
          buyLevels.push({
            price: sr.price,
            source: 'SUPPORT',
            strength: sr.strength,
            distance,
          });
          console.log(`[V6-FALLBACK] BUY level: Support @ $${sr.price.toFixed(0)} (${distancePercent.toFixed(2)}% away)`);
        }
      }
    }

    // Sort by distance (nearest first) - PRIORITIZE NEAR-PRICE SETUPS
    buyLevels.sort((a, b) => a.distance - b.distance);

    // ==========================================================================
    // COLLECT ALL RESISTANCE LEVELS ABOVE PRICE (for SELL setups)
    // ==========================================================================
    const sellLevels: { price: number; source: string; strength: string; distance: number }[] = [];

    // Check all Fib levels above current price
    for (const fib of fibonacciAnalysis.levels) {
      // Defensive check for valid price
      if (fib.price == null || typeof fib.price !== 'number') continue;
      if (fib.price > currentPrice && fib.price < currentPrice * 1.03) { // Within 3%
        const distance = fib.price - currentPrice;
        const distancePercent = (distance / currentPrice) * 100;
        sellLevels.push({
          price: fib.price,
          source: `FIB_${fib.levelName}`,
          strength: fib.strength,
          distance,
        });
        console.log(`[V6-FALLBACK] SELL level: Fib ${fib.levelName} @ $${fib.price.toFixed(0)} (${distancePercent.toFixed(2)}% away)`);
      }
    }

    // Check Order Blocks (Bearish OB = resistance)
    for (const ob of supportResistance.orderBlocks) {
      if (ob.type === 'BEARISH' && ob.zone.midpoint > currentPrice) {
        const distance = ob.zone.midpoint - currentPrice;
        const distancePercent = (distance / currentPrice) * 100;
        if (distancePercent <= 3 && ob.strength !== 'MITIGATED') {
          sellLevels.push({
            price: ob.zone.midpoint,
            source: 'ORDER_BLOCK',
            strength: ob.strength === 'FRESH' ? 'STRONG' : 'MODERATE',
            distance,
          });
          console.log(`[V6-FALLBACK] SELL level: Bearish OB @ $${ob.zone.midpoint.toFixed(0)} (${distancePercent.toFixed(2)}% away)`);
        }
      }
    }

    // Check S/R levels
    for (const sr of supportResistance.levels) {
      // Defensive check for valid price
      if (sr.price == null || typeof sr.price !== 'number') continue;
      if (sr.type === 'RESISTANCE' && sr.price > currentPrice) {
        const distance = sr.price - currentPrice;
        const distancePercent = (distance / currentPrice) * 100;
        if (distancePercent <= 3) {
          sellLevels.push({
            price: sr.price,
            source: 'RESISTANCE',
            strength: sr.strength,
            distance,
          });
          console.log(`[V6-FALLBACK] SELL level: Resistance @ $${sr.price.toFixed(0)} (${distancePercent.toFixed(2)}% away)`);
        }
      }
    }

    // Sort by distance (nearest first)
    sellLevels.sort((a, b) => a.distance - b.distance);

    // ==========================================================================
    // CREATE BUY SETUP - ALWAYS (even in downtrend for scalp bounce)
    // Ignore avoidDirection for fallback - we NEED diversity
    // ==========================================================================
    if (buyLevels.length > 0) {
      const bestBuyLevel = buyLevels[0]; // Nearest support
      const entryMidpoint = bestBuyLevel.price;
      const stopLoss = entryMidpoint - atr * 2.0; // FIXED: Wider SL (2.0x ATR) to avoid wick stops
      const takeProfit1 = entryMidpoint + atr * 2.5; // Adjusted TP for better R:R with wider SL
      const takeProfit2 = entryMidpoint + atr * 3;
      const rr = (takeProfit1 - entryMidpoint) / (entryMidpoint - stopLoss);

      // Ensure minimum R:R 1.5 by adjusting TP if needed
      let adjustedTP1 = takeProfit1;
      let adjustedTP2 = takeProfit2;
      let adjustedRR = rr;
      if (rr < 1.5) {
        const slDistance = entryMidpoint - stopLoss;
        adjustedTP1 = entryMidpoint + slDistance * 1.5;
        adjustedTP2 = entryMidpoint + slDistance * 2.5;
        adjustedRR = 1.5;
        console.log(`[V6-FALLBACK] Adjusted BUY TP1 from $${takeProfit1.toFixed(0)} to $${adjustedTP1.toFixed(0)} for R:R 1.5`);
      }

      const isNearPrice = bestBuyLevel.distance < nearPriceBuffer;

      // Lower R:R threshold to 1.4
      if (adjustedRR >= 1.4) {
        const setup: TradeSetup = {
          id: uuidv4(),
          symbol: 'BTCUSDT',
          createdAt: new Date(),
          expiresAt: createExpiryDate(V6_SETUP_CONFIG.DEFAULT_SETUP_EXPIRY_HOURS),
          direction: 'BUY',
          bias: marketBias.direction === 'BULLISH' ? 'WITH_TREND' : 'COUNTER_TREND',
          entryZone: {
            low: entryMidpoint - zoneHalf,
            high: entryMidpoint + zoneHalf,
            midpoint: entryMidpoint,
          },
          stopLoss,
          takeProfit1: adjustedTP1,
          takeProfit2: adjustedTP2,
          riskRewardRatio: parseFloat(adjustedRR.toFixed(2)),
          grade: isNearPrice ? 'B' : (bestBuyLevel.strength === 'STRONG' ? 'B' : 'C'),
          confidence: isNearPrice ? 70 : 60,
          reasons: [{
            source: bestBuyLevel.source as any,
            level: entryMidpoint,
            description: `Fallback BUY at ${bestBuyLevel.source}${isNearPrice ? ' (NEAR-PRICE)' : ''}`,
            strength: bestBuyLevel.strength as any,
            weight: 7,
          }],
          requiredConfirmation: {
            patterns: [{ type: 'REJECTION_WICK' }, { type: 'BULLISH_ENGULFING' }],
            minStrength: 'ANY', // Lower requirement for faster entry
            volumeRequired: false,
            volumeMultiplier: 1.2,
          },
          status: 'WAITING',
          confirmationAttempts: 0,
          maxConfirmationAttempts: V6_SETUP_CONFIG.MAX_CONFIRMATION_ATTEMPTS,
          htfTrend: marketBias.direction,
          marketContext: `Fallback BUY at ${bestBuyLevel.source}${isNearPrice ? ' - NEAR PRICE for quick trigger' : ''}`,
          analysisTimestamp: input.timestamp,
        };
        fallbackSetups.push(setup);
        console.log(`[V6-FALLBACK] Created BUY @ $${entryMidpoint.toFixed(0)} (R:R ${adjustedRR.toFixed(2)}, ${isNearPrice ? 'NEAR-PRICE' : 'standard'})`);
      } else {
        console.log(`[V6-FALLBACK] BUY rejected: R:R ${adjustedRR.toFixed(2)} < 1.4`);
      }
    } else {
      console.log('[V6-FALLBACK] No support levels found for BUY setup');
    }

    // ==========================================================================
    // CREATE SELL SETUP - ALWAYS (even in uptrend for scalp rejection)
    // ==========================================================================
    if (sellLevels.length > 0) {
      const bestSellLevel = sellLevels[0]; // Nearest resistance
      const entryMidpoint = bestSellLevel.price;
      const stopLoss = entryMidpoint + atr * 2.0; // FIXED: Wider SL (2.0x ATR) to avoid wick stops
      const takeProfit1 = entryMidpoint - atr * 2.5; // Adjusted TP for better R:R with wider SL
      const takeProfit2 = entryMidpoint - atr * 3;
      const rr = (entryMidpoint - takeProfit1) / (stopLoss - entryMidpoint);

      // Ensure minimum R:R 1.5 by adjusting TP if needed
      let adjustedTP1 = takeProfit1;
      let adjustedTP2 = takeProfit2;
      let adjustedRR = rr;
      if (rr < 1.5) {
        const slDistance = stopLoss - entryMidpoint;
        adjustedTP1 = entryMidpoint - slDistance * 1.5;
        adjustedTP2 = entryMidpoint - slDistance * 2.5;
        adjustedRR = 1.5;
        console.log(`[V6-FALLBACK] Adjusted SELL TP1 from $${takeProfit1.toFixed(0)} to $${adjustedTP1.toFixed(0)} for R:R 1.5`);
      }

      // DEBUG: Log SELL setup TP/SL calculation
      console.log(`[V6-ARCHITECT-DEBUG] SELL Setup calculated:`);
      console.log(`   ATR: $${atr.toFixed(2)}`);
      console.log(`   Entry midpoint: $${entryMidpoint.toFixed(2)}`);
      console.log(`   SL: $${stopLoss.toFixed(2)} = ${entryMidpoint.toFixed(2)} + ${(atr * 2.0).toFixed(2)} (2.0x ATR)`);
      console.log(`   TP1: $${adjustedTP1.toFixed(2)} (adjusted from ${takeProfit1.toFixed(2)})`);
      console.log(`   Risk: $${(stopLoss - entryMidpoint).toFixed(2)} | Reward: $${(entryMidpoint - adjustedTP1).toFixed(2)}`);
      console.log(`   R:R: 1:${adjustedRR.toFixed(2)}`);

      const isNearPrice = bestSellLevel.distance < nearPriceBuffer;

      if (adjustedRR >= 1.4) {
        const setup: TradeSetup = {
          id: uuidv4(),
          symbol: 'BTCUSDT',
          createdAt: new Date(),
          expiresAt: createExpiryDate(V6_SETUP_CONFIG.DEFAULT_SETUP_EXPIRY_HOURS),
          direction: 'SELL',
          bias: marketBias.direction === 'BEARISH' ? 'WITH_TREND' : 'COUNTER_TREND',
          entryZone: {
            low: entryMidpoint - zoneHalf,
            high: entryMidpoint + zoneHalf,
            midpoint: entryMidpoint,
          },
          stopLoss,
          takeProfit1: adjustedTP1,
          takeProfit2: adjustedTP2,
          riskRewardRatio: parseFloat(adjustedRR.toFixed(2)),
          grade: isNearPrice ? 'B' : (bestSellLevel.strength === 'STRONG' ? 'B' : 'C'),
          confidence: isNearPrice ? 70 : 60,
          reasons: [{
            source: bestSellLevel.source as any,
            level: entryMidpoint,
            description: `Fallback SELL at ${bestSellLevel.source}${isNearPrice ? ' (NEAR-PRICE)' : ''}`,
            strength: bestSellLevel.strength as any,
            weight: 7,
          }],
          requiredConfirmation: {
            patterns: [{ type: 'REJECTION_WICK' }, { type: 'BEARISH_ENGULFING' }],
            minStrength: 'ANY',
            volumeRequired: false,
            volumeMultiplier: 1.2,
          },
          status: 'WAITING',
          confirmationAttempts: 0,
          maxConfirmationAttempts: V6_SETUP_CONFIG.MAX_CONFIRMATION_ATTEMPTS,
          htfTrend: marketBias.direction,
          marketContext: `Fallback SELL at ${bestSellLevel.source}${isNearPrice ? ' - NEAR PRICE for quick trigger' : ''}`,
          analysisTimestamp: input.timestamp,
        };
        fallbackSetups.push(setup);
        console.log(`[V6-FALLBACK] Created SELL @ $${entryMidpoint.toFixed(0)} (R:R ${adjustedRR.toFixed(2)}, ${isNearPrice ? 'NEAR-PRICE' : 'standard'})`);
      } else {
        console.log(`[V6-FALLBACK] SELL rejected: R:R ${adjustedRR.toFixed(2)} < 1.4`);
      }
    } else {
      console.log('[V6-FALLBACK] No resistance levels found for SELL setup');
    }

    // ========================================================================
    // DEDUPLICATE against existing setups and internal duplicates
    // ========================================================================
    const dedupedSetups: TradeSetup[] = [];
    const DEDUP_THRESHOLD = 0.005; // 0.5%

    for (const setup of fallbackSetups) {
      let isDuplicate = false;

      // Check against existing setups from queue
      if (input.existingSetups) {
        for (const existing of input.existingSetups) {
          if (existing.direction !== setup.direction) continue;
          const priceDiff = Math.abs(existing.entryPrice - setup.entryZone.midpoint);
          const priceRatio = priceDiff / existing.entryPrice;
          if (priceRatio < DEDUP_THRESHOLD) {
            console.log(`[V6-FALLBACK] Skipping duplicate: ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(0)} too close to existing @ $${existing.entryPrice.toFixed(0)}`);
            isDuplicate = true;
            break;
          }
        }
      }

      if (isDuplicate) continue;

      // Check against other setups we're about to return
      for (const added of dedupedSetups) {
        if (added.direction !== setup.direction) continue;
        const priceDiff = Math.abs(added.entryZone.midpoint - setup.entryZone.midpoint);
        const priceRatio = priceDiff / added.entryZone.midpoint;
        if (priceRatio < DEDUP_THRESHOLD) {
          console.log(`[V6-FALLBACK] Skipping internal duplicate: ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(0)}`);
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        dedupedSetups.push(setup);
      }
    }

    console.log(`[V6-FALLBACK] Total fallback setups after dedup: ${dedupedSetups.length} (from ${fallbackSetups.length})`);
    return dedupedSetups;
  }

  // ============================================================================
  // DIVERSITY SETUPS (when LLM misses BUY, SELL, or near-price)
  // ============================================================================

  /**
   * Create specific setups to fill diversity gaps
   */
  async createDiversitySetups(input: StrategicAnalysisInput & {
    needBuy?: boolean;
    needSell?: boolean;
    needNearPrice?: boolean;
  }): Promise<TradeSetup[]> {
    console.log(`[V6-DIVERSITY] Creating diversity setups: needBuy=${input.needBuy}, needSell=${input.needSell}, needNearPrice=${input.needNearPrice}`);

    // Use fallback logic but filter to only what's needed
    // Note: createFallbackSetups now includes deduplication against existingSetups
    const allSetups = this.createFallbackSetups(input);

    const diversitySetups: TradeSetup[] = [];
    const nearPriceThreshold = input.currentPrice * 0.005;
    const DEDUP_THRESHOLD = 0.005; // 0.5%

    for (const setup of allSetups) {
      const isNearPrice = Math.abs(setup.entryZone.midpoint - input.currentPrice) < nearPriceThreshold;

      // Check if we should add this setup
      let shouldAdd = false;
      if (input.needBuy && setup.direction === 'BUY') {
        shouldAdd = true;
      } else if (input.needSell && setup.direction === 'SELL') {
        shouldAdd = true;
      } else if (input.needNearPrice && isNearPrice) {
        shouldAdd = true;
      }

      if (!shouldAdd) continue;

      // Check for internal duplicates within diversitySetups
      let isDuplicate = false;
      for (const added of diversitySetups) {
        if (added.direction !== setup.direction) continue;
        const priceDiff = Math.abs(added.entryZone.midpoint - setup.entryZone.midpoint);
        const priceRatio = priceDiff / added.entryZone.midpoint;
        if (priceRatio < DEDUP_THRESHOLD) {
          console.log(`[V6-DIVERSITY] Skipping internal duplicate: ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(0)}`);
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        diversitySetups.push(setup);
        console.log(`[V6-DIVERSITY] Adding ${setup.direction} setup @ $${setup.entryZone.midpoint.toFixed(0)}${isNearPrice ? ' (NEAR-PRICE)' : ''}`);
      }
    }

    return diversitySetups;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const setupArchitectExpert = new SetupArchitectExpert();
export { SetupArchitectExpert };
