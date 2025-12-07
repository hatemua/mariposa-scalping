# MARIPOSA V3 - 3-PHASE ENTRY SYSTEM DOCUMENTATION

## Table of Contents

1. [Overview](#overview)
2. [Problem Solved](#problem-solved)
3. [Architecture Diagram](#architecture-diagram)
4. [Phase 0: HTF Direction Filter](#phase-0-htf-direction-filter)
5. [Phase 1+2: LLM Confirmation](#phase-1--2-llm-confirmation)
6. [Phase 3: Size Calculation](#phase-3-size-calculation)
7. [Configuration Reference](#configuration-reference)
8. [Code Structure](#code-structure)
9. [Console Output Example](#console-output-example)
10. [Comparison: Old vs New System](#comparison-old-vs-new-system)
11. [Rollback Instructions](#rollback-instructions)

---

## Overview

The V3 3-Phase Entry System transforms the BTC scalping entry logic from a 4-way direction voting system to a structured 3-phase architecture:

| Phase | Purpose | Method | Speed |
|-------|---------|--------|-------|
| **Phase 0** | Determine allowed DIRECTION | Math (HH/HL structure + EMA) | ~1ms |
| **Phase 1** | Confirm TIMING | LLM (TREND + VOLUME) YES/NO | ~3-4s |
| **Phase 2** | Confirm LEVEL | LLM (FIB + S/R) YES/NO | ~3-4s |
| **Phase 3** | Calculate SIZE + SL/TP | Math (scores + ATR) | ~1ms |

**Note:** Phases 1 and 2 run in parallel (total ~3-4s for all 4 LLM calls).

---

## Problem Solved

### The Old Problem

```
BEARISH MARKET (Price dropping $240)

Old System:
FIB:    "Should we BUY, SELL, HOLD?" → BUY (sees support level)
TREND:  "Should we BUY, SELL, HOLD?" → SELL (sees downtrend)
VOLUME: "Should we BUY, SELL, HOLD?" → SELL (sees selling pressure)
S/R:    "Should we BUY, SELL, HOLD?" → BUY (sees support level)

Result: 2-2 TIE → System generated BUY signal → LOSS

Problem: FIB and S/R experts find LEVELS but vote on DIRECTION.
They say "buy at support" even when support is about to BREAK.
```

### The V3 Solution

```
BEARISH MARKET (Price dropping $240)

V3 System:
PHASE 0: 4H=BEARISH, 1H=BEARISH → DIRECTION = SELL ONLY

PHASE 1+2 (all ask about SELL):
TREND:  "Is NOW good timing for SELL?" → YES ✓
VOLUME: "Is NOW good timing for SELL?" → YES ✓
FIB:    "Is price at good level for SELL?" → YES ✓
S/R:    "Is price at good level for SELL?" → YES ✓

Result: 4/4 confirmations → SELL signal with 100% size → PROFIT

Solution: Direction is determined by market structure (HTF), not voted on.
LLMs only confirm if timing and levels are good FOR that direction.
```

---

## Architecture Diagram

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                           ║
║  ┌─────────────────────────────────────────────────────────────────────┐  ║
║  │                                                                     │  ║
║  │   PHASE 0: HTF DIRECTION FILTER                                    │  ║
║  │   ═══════════════════════════════                                  │  ║
║  │   (MATH ONLY - NO LLM - ~1ms)                                      │  ║
║  │                                                                     │  ║
║  │   4H Trend Analysis + 1H Trend Analysis                            │  ║
║  │   - HH/HL vs LH/LL structure counting                              │  ║
║  │   - EMA 9 vs EMA 21 alignment                                      │  ║
║  │   - Price position vs EMA 21                                       │  ║
║  │                                                                     │  ║
║  │   Output: DIRECTION + MAX_SIZE + CONFIDENCE                        │  ║
║  │                                                                     │  ║
║  └─────────────────────────────────────────────────────────────────────┘  ║
║                              │                                            ║
║                              ▼                                            ║
║                    ┌─────────────────────┐                                ║
║                    │  Direction = SELL   │                                ║
║                    │  Max Size = 100%    │                                ║
║                    │  Confidence = HIGH  │                                ║
║                    └──────────┬──────────┘                                ║
║                               │                                           ║
║              ┌────────────────┴────────────────┐                          ║
║              │                                 │                          ║
║              ▼                                 ▼                          ║
║  ┌───────────────────────┐       ┌───────────────────────┐               ║
║  │                       │       │                       │               ║
║  │   PHASE 1: TIMING     │       │   PHASE 2: LEVEL      │               ║
║  │   ════════════════    │       │   ═══════════════     │               ║
║  │                       │       │                       │               ║
║  │   TREND Expert        │       │   FIB Expert          │               ║
║  │   + VOLUME Expert     │       │   + S/R Expert        │               ║
║  │                       │       │                       │               ║
║  │   "Is NOW good to     │       │   "Is PRICE at good   │               ║
║  │    enter SELL?"       │       │    level for SELL?"   │               ║
║  │                       │       │                       │               ║
║  │   Response: YES/NO    │       │   Response: YES/NO    │               ║
║  │                       │       │                       │               ║
║  └───────────┬───────────┘       └───────────┬───────────┘               ║
║              │                               │                            ║
║              │      ALL 4 LLMs RUN IN        │                            ║
║              │      PARALLEL (~3-4 sec)      │                            ║
║              │                               │                            ║
║              └───────────────┬───────────────┘                            ║
║                              │                                            ║
║                              ▼                                            ║
║  ┌─────────────────────────────────────────────────────────────────────┐  ║
║  │                                                                     │  ║
║  │   PHASE 3: SIZE CALCULATION                                        │  ║
║  │   ═════════════════════════                                        │  ║
║  │   (MATH ONLY - NO LLM - ~1ms)                                      │  ║
║  │                                                                     │  ║
║  │   Gate Checks:                                                     │  ║
║  │   - HTF says WAIT? → BLOCK                                         │  ║
║  │   - Timing 0/2? → BLOCK                                            │  ║
║  │   - Level 0/2? → BLOCK                                             │  ║
║  │                                                                     │  ║
║  │   Size Formula:                                                    │  ║
║  │   HTF_base × timing_adj × level_adj × volatility_adj               │  ║
║  │                                                                     │  ║
║  │   Output: SIZE% + SL + TP + GRADE                                  │  ║
║  │                                                                     │  ║
║  └─────────────────────────────────────────────────────────────────────┘  ║
║                              │                                            ║
║                              ▼                                            ║
║                    ┌─────────────────────┐                                ║
║                    │   EXECUTE TRADE     │                                ║
║                    │   (MT4 - unchanged) │                                ║
║                    └─────────────────────┘                                ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## Phase 0: HTF Direction Filter

### Purpose

Determine the ALLOWED trading direction based on 4H and 1H trend alignment.
This is calculated with **MATH ONLY**, no LLM calls. It's the foundation of all decisions.

### Algorithm: `analyzeHTFTrendStructure()`

**Location:** `btcMultiPatternScalpingService.ts` lines 2208-2251

```typescript
Inputs:
- Last 10 candles from 4H or 1H timeframe

Scoring System:
┌─────────────────────────────────────┬─────────────┐
│ Condition                           │ Points      │
├─────────────────────────────────────┼─────────────┤
│ Higher High than previous candle    │ +1 BULL     │
│ Higher Low than previous candle     │ +1 BULL     │
│ Lower High than previous candle     │ +1 BEAR     │
│ Lower Low than previous candle      │ +1 BEAR     │
│ EMA 9 > EMA 21                      │ +3 BULL     │
│ EMA 9 < EMA 21                      │ +3 BEAR     │
│ Price > EMA 21                      │ +2 BULL     │
│ Price < EMA 21                      │ +2 BEAR     │
└─────────────────────────────────────┴─────────────┘

Decision Logic:
- BULLISH: bullScore >= 5 AND (bullScore - bearScore) >= 5
- BEARISH: bearScore >= 5 AND (bearScore - bullScore) >= 5
- NEUTRAL: Neither condition met
```

### HTF Decision Matrix

**Location:** `getHTFDirectionDecision()` lines 2254-2381

| 4H Trend | 1H Trend | Allowed Direction | Max Size | Confidence |
|----------|----------|-------------------|----------|------------|
| BEARISH | BEARISH | **SELL only** | 100% | HIGH |
| BULLISH | BULLISH | **BUY only** | 100% | HIGH |
| BEARISH | NEUTRAL | SELL only | 75% | MEDIUM |
| BULLISH | NEUTRAL | BUY only | 75% | MEDIUM |
| BEARISH | BULLISH | **WAIT** | 0% | LOW |
| BULLISH | BEARISH | **WAIT** | 0% | LOW |
| NEUTRAL | ANY | BOTH | 50% | LOW |

### Caching

- **4H trend:** Cached for 30 minutes
- **1H trend:** Cached for 10 minutes

This prevents excessive API calls while allowing trend updates during the session.

---

## Phase 1 + 2: LLM Confirmation

### Purpose

Once HTF determines direction, ask the 4 LLM experts to confirm:
- **Phase 1 (TIMING):** Is NOW a good time to enter?
- **Phase 2 (LEVEL):** Is the current PRICE at a good level?

### Key Change: YES/NO Instead of BUY/SELL/HOLD

**Old System Prompt:**
```
"Should we BUY, SELL, or HOLD?"
→ LLM could vote against the trend
```

**New V3 Prompt:**
```
"HTF has determined direction = SELL.
Does momentum support entering a SELL trade RIGHT NOW?
Answer: YES or NO"
→ LLM only confirms/denies the predetermined direction
```

### The 4 Confirmation Methods

**Location:** `llmPatternDetectionService.ts` lines 901-1394

#### 1. Trend Timing Confirmation

```typescript
analyzeTrendTimingConfirmation(input, direction)
```

**Model:** `Qwen/Qwen2.5-7B-Instruct-Turbo`

**Checks for BUY:**
- ✓ Higher lows forming
- ✓ RSI > 45 and trending up
- ✓ Price above EMA 21
- ✓ Green candle dominance
- ✗ NO if: RSI > 80, EMA 9 crossing below EMA 21

**Checks for SELL:**
- ✓ Lower highs forming
- ✓ RSI < 55 and trending down
- ✓ Price below EMA 21
- ✓ Red candle dominance
- ✗ NO if: RSI < 20, EMA 9 crossing above EMA 21

#### 2. Volume Timing Confirmation

```typescript
analyzeVolumeTimingConfirmation(input, direction)
```

**Model:** `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`

**Checks for BUY:**
- ✓ Green candle volume > Red candle volume
- ✓ Current volume above 20-period average
- ✓ Volume increasing on up moves
- ✗ NO if: Volume decreasing, distribution pattern

**Checks for SELL:**
- ✓ Red candle volume > Green candle volume
- ✓ Current volume above average
- ✓ Volume increasing on down moves
- ✗ NO if: Volume decreasing, accumulation pattern

#### 3. Fibonacci Level Confirmation

```typescript
analyzeFibLevelConfirmation(input, direction)
```

**Model:** `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`

**Checks for BUY:**
- ✓ Price near 0.618/0.5/0.382 retracement (support)
- ✓ Price bouncing from Fib level
- ✓ Within 0.5% of key level
- ✗ NO if: Price between levels, >1% from nearest level

**Checks for SELL:**
- ✓ Price near 0.618/0.5/0.382 retracement (resistance)
- ✓ Price rejecting from Fib level
- ✓ Within 0.5% of key level
- ✗ NO if: Price breaking through level

#### 4. S/R Level Confirmation

```typescript
analyzeSRLevelConfirmation(input, direction)
```

**Model:** `Qwen/Qwen2.5-7B-Instruct-Turbo`

**Checks for BUY:**
- ✓ Price at/near proven support zone
- ✓ Level tested 2+ times and held
- ✓ Price showing bounce
- ✗ NO if: Support breaking, no clear level for SL

**Checks for SELL:**
- ✓ Price at/near proven resistance zone
- ✓ Level tested 2+ times and held
- ✓ Price showing rejection
- ✗ NO if: Resistance breaking, no clear level for SL

### Response Format

All 4 methods return:
```typescript
{
  confirm: 'YES' | 'NO',
  confidence: 50-85,
  reasoning: string
}
```

### Scoring

```
Timing Score = (TREND_YES ? 1 : 0) + (VOLUME_YES ? 1 : 0)  // 0, 1, or 2
Level Score  = (FIB_YES ? 1 : 0) + (SR_YES ? 1 : 0)        // 0, 1, or 2
```

---

## Phase 3: Size Calculation

### Purpose

Calculate final position size, SL/TP, and trade grade based on all phase scores.

### Gate Checks

**Location:** `calculateV3TradeSignal()` lines 2465-2589

```
Gate 1: HTF says WAIT? → BLOCK (no trade)
Gate 2: Timing Score = 0? → BLOCK (bad timing)
Gate 3: Level Score = 0? → BLOCK (bad level)
```

All 3 gates must pass to generate a signal.

### Size Calculation Formula

```
Base Size = HTF maxSizeMultiplier (from decision matrix)

Adjustments:
├── Timing Score 2/2: ×1.0 (perfect)
├── Timing Score 1/2: ×0.75
├── Level Score 2/2: ×1.10 (bonus)
├── Level Score 1/2: ×1.0
├── ATR > 0.6%: ×0.7 (high volatility reduction)
├── ATR 0.4-0.6%: ×0.85 (medium volatility)
└── ATR < 0.4%: ×1.0 (normal)

Final Size = clamp(Base × adjustments, 0.10, 1.0)
```

### Size Reference Table

| HTF Conf | Timing | Level | Base | Final Size |
|----------|--------|-------|------|------------|
| HIGH (100%) | 2/2 | 2/2 | 100% | **100%** |
| HIGH (100%) | 2/2 | 1/2 | 100% | **100%** |
| HIGH (100%) | 1/2 | 2/2 | 75% | **82%** |
| HIGH (100%) | 1/2 | 1/2 | 75% | **75%** |
| MEDIUM (75%) | 2/2 | 2/2 | 75% | **82%** |
| MEDIUM (75%) | 2/2 | 1/2 | 75% | **75%** |
| MEDIUM (75%) | 1/2 | 2/2 | 56% | **62%** |
| MEDIUM (75%) | 1/2 | 1/2 | 56% | **56%** |
| LOW (50%) | 2/2 | 2/2 | 50% | **55%** |
| LOW (50%) | ANY | ANY | 50% | **37-50%** |

### SL/TP Calculation

```typescript
SL Distance = ATR × 1.5
TP Distance = ATR × 2.5
Risk:Reward = 1:1.67

For BUY:
  Stop Loss = Entry - SL_Distance
  Take Profit = Entry + TP_Distance

For SELL:
  Stop Loss = Entry + SL_Distance
  Take Profit = Entry - TP_Distance
```

### Trade Grade

| HTF Confidence | Total Score (Timing + Level) | Grade |
|----------------|------------------------------|-------|
| HIGH | 4/4 | **A** |
| HIGH | 3/4 | **B** |
| MEDIUM | 3/4 | **B** |
| Any other | Any | **C** |

---

## Configuration Reference

### HTF Direction Config

**Location:** `btcMultiPatternScalpingService.ts` lines 282-289

```typescript
const HTF_DIRECTION_CONFIG = {
  CACHE_4H_MINUTES: 30,      // Recalculate 4H trend every 30 min
  CACHE_1H_MINUTES: 10,      // Recalculate 1H trend every 10 min
  CANDLES_TO_ANALYZE: 10,    // Last 10 candles for structure
  MIN_STRUCTURE_SCORE: 5,    // Minimum score to confirm trend
  EMA_FAST: 9,               // Fast EMA period
  EMA_SLOW: 21               // Slow EMA period
};
```

### Interfaces

```typescript
// HTF Direction Cache
interface HTFDirectionCache {
  trend4H: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend1H: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  lastUpdate4H: number;
  lastUpdate1H: number;
}

// HTF Decision Result
interface HTFDirectionDecision {
  allowedDirection: 'BUY' | 'SELL' | 'BOTH' | 'WAIT';
  maxSizeMultiplier: number;      // 0, 0.5, 0.75, or 1.0
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  trend4H: string;
  trend1H: string;
}

// V3 Trade Signal Result
interface V3TradeSignalResult {
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  sizeMultiplier: number;
  sizePercent: number;
  grade: 'A' | 'B' | 'C';
  riskReward: string;
  metadata: {
    htfConfidence: string;
    htf4H: string;
    htf1H: string;
    timingScore: number;
    levelScore: number;
    atrPercent: number;
    trendConfirm: boolean;
    volumeConfirm: boolean;
    fibConfirm: boolean;
    srConfirm: boolean;
  };
}

// LLM Confirmation Result
interface V3ConfirmationResult {
  timingScore: number;          // 0, 1, or 2
  levelScore: number;           // 0, 1, or 2
  avgConfidence: number;        // Average of 4 LLM confidences
  details: {
    trendConfirm: boolean;
    trendConfidence: number;
    volumeConfirm: boolean;
    volumeConfidence: number;
    fibConfirm: boolean;
    fibConfidence: number;
    srConfirm: boolean;
    srConfidence: number;
  };
}
```

---

## Code Structure

### Files Modified

| File | Lines Added | Purpose |
|------|-------------|---------|
| `src/services/btcMultiPatternScalpingService.ts` | ~580 | Main V3 logic |
| `src/services/llmPatternDetectionService.ts` | ~500 | YES/NO prompts |

### Method Reference

#### btcMultiPatternScalpingService.ts

| Method | Lines | Purpose |
|--------|-------|---------|
| `calculateSimpleEMA()` | 2197-2205 | EMA calculation helper |
| `analyzeHTFTrendStructure()` | 2208-2251 | Analyze HH/HL vs LH/LL structure |
| `getHTFDirectionDecision()` | 2254-2381 | Get HTF decision with caching |
| `determineTrendDirection()` | 2384-2394 | 15m EMA tiebreaker for BOTH case |
| `analyzeTimeframeWithDirection()` | 2396-2459 | Call 4 LLMs in parallel |
| `calculateV3TradeSignal()` | 2462-2589 | Gate checks + size calculation |
| `generateEntrySignalV3()` | 2592-2782 | Main V3 entry point |

#### llmPatternDetectionService.ts

| Method | Lines | Model Used |
|--------|-------|------------|
| `analyzeTrendTimingConfirmation()` | 903-1004 | Qwen2.5-7B |
| `analyzeVolumeTimingConfirmation()` | 1007-1123 | Llama-3.1-8B |
| `analyzeFibLevelConfirmation()` | 1126-1251 | Llama-3.1-8B |
| `analyzeSRLevelConfirmation()` | 1254-1393 | Qwen2.5-7B |

---

## Console Output Example

```
═══════════════════════════════════════════════════════════════
V3 SIGNAL GENERATION - 3-PHASE SYSTEM
═══════════════════════════════════════════════════════════════

PHASE 0: HTF Direction Filter
────────────────────────────────────────────────────────────────
   4H Trend: BEARISH
   1H Trend: BEARISH
   Decision: SELL (HIGH)
   Max Size: 100%
   Reason: 4H + 1H both BEARISH - SELL only with full size

PHASE 1 + 2: LLM Confirmation (Parallel)
────────────────────────────────────────────────────────────────
   Direction to confirm: SELL

   PHASE 1 - TIMING:
     TREND:  YES (78%)
     VOLUME: YES (72%)
     Score:  2/2

   PHASE 2 - LEVEL:
     FIB:    YES (75%)
     S/R:    YES (70%)
     Score:  2/2

PHASE 3: Size Calculation
────────────────────────────────────────────────────────────────
V3 Base size from HTF: 100%
   Timing: 2/2 -> x1.0 (perfect)
   Level: 2/2 -> x1.10 (bonus)
V3 SIGNAL: SELL @ 89544
   Size: 100% | Grade: A
   SL: 89750 | TP: 89100 | R:R: 1:1.67

═══════════════════════════════════════════════════════════════
V3 SIGNAL GENERATED: SELL
═══════════════════════════════════════════════════════════════
   Entry:    $89544
   Stop:     $89750
   Target:   $89100
   Size:     100%
   Grade:    A
   R:R:      1:1.67
═══════════════════════════════════════════════════════════════

V3 Signal abc-123 broadcasted to agents (Grade A, Size 100%)
```

---

## Comparison: Old vs New System

| Aspect | Old System (V2) | New System (V3) |
|--------|-----------------|-----------------|
| **Direction Decision** | LLMs vote BUY/SELL/HOLD | HTF math determines direction |
| **LLM Prompts** | "Should we BUY, SELL, HOLD?" | "Does this support {DIR}? YES/NO" |
| **FIB Expert Role** | Votes on trade direction | Confirms price level quality |
| **S/R Expert Role** | Votes on trade direction | Confirms price level quality |
| **Conflict Handling** | Vote tie = unclear signal | HTF conflict = WAIT |
| **Size Calculation** | Grade-based only | HTF x timing x level x volatility |
| **Counter-trend Trades** | Possible with high confidence | **Impossible** (HTF blocks them) |
| **Minimum to Trade** | 3/4 consensus | 1/2 timing + 1/2 level |

---

## Rollback Instructions

If issues occur with V3:

### Quick Rollback (1 line change)

**File:** `btcMultiPatternScalpingService.ts` line 519

```typescript
// Current (V3):
const signal = await this.generateEntrySignalV3();

// Rollback to V2:
const signal = await this.generateEntrySignal();
```

### Why Rollback is Safe

1. Original `generateEntrySignal()` method is intact and unchanged
2. All original LLM methods (BUY/SELL/HOLD prompts) are preserved
3. Exit system and position monitoring are unchanged
4. No database or configuration changes required
5. V3 methods are additive (new methods, not replacements)

---

## What Was NOT Changed

The following components remain exactly as they were:

- LLM models used by each expert (Llama-3.1-8B, Qwen2.5-7B)
- Data/indicators provided to each expert
- Exit system (`positionMonitorService.ts`)
- Position monitoring logic
- LLM exit voting system
- Trailing stop logic
- Break-even logic
- Stagnant loser detection
- Time-based exits
- MT4 execution (`mt4Service.ts`, `mt4TradeManager.ts`)
- SL/TP management execution
- Candle data fetching mechanisms
- Indicator calculations (EMA, RSI, ATR, etc.)

---

## Testing Checklist

After implementation:
- [ ] HTF correctly identifies BEARISH when price making lower lows
- [ ] HTF correctly identifies BULLISH when price making higher highs
- [ ] HTF returns WAIT when 4H and 1H conflict
- [ ] All 4 LLMs run in parallel (~3-4 sec total)
- [ ] LLMs respond with YES or NO (not BUY/SELL/HOLD)
- [ ] Size calculation produces correct values per reference table
- [ ] Grade A/B/C correctly assigned
- [ ] Signal blocked when timing = 0/2
- [ ] Signal blocked when level = 0/2
- [ ] SL/TP correctly calculated for BUY and SELL
- [ ] Exit system still works unchanged
