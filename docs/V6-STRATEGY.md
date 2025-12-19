# MARIPOSA V6 PRO - INTELLIGENT SNIPER SCALPING SYSTEM

## Overview

V6 is a **hybrid intelligent-mathematical trading system** that combines LLM-powered strategic analysis with pure math-based pattern confirmation to identify and execute high-probability, quick-turnaround trades.

### Core Philosophy

```
INTELLIGENCE (LLM) for STRATEGY  +  MATH for SPEED
       ↓                              ↓
  "Where to trade"            "When to execute"
  (30-min analysis)           (30-sec monitoring)
```

**Key Principle**: LLM performs strategic analysis ONCE every 30 minutes. Math-only zone monitor checks EVERY 30 seconds and uses pattern confirmation to trigger execution. This separates intelligence from execution speed.

**Target**: Quick scalps (15-35 pips) with high win rates through confluence-based entry points.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        V6 PRO SNIPER SYSTEM                             │
├─────────────────┬─────────────────────┬─────────────────────────────────┤
│  30-min Cycle   │    30-sec Cycle     │        Continuous               │
│  (LLM Analysis) │  (Zone Monitoring)  │    (Position Management)        │
├─────────────────┼─────────────────────┼─────────────────────────────────┤
│                 │                     │                                 │
│  ┌───────────┐  │   ┌─────────────┐   │      ┌──────────────────┐       │
│  │  Market   │  │   │   Check     │   │      │   MT4 Trade      │       │
│  │   Bias    │  │   │   Price vs  │   │      │    Manager       │       │
│  │ Detection │  │   │   Zones     │   │      │                  │       │
│  └─────┬─────┘  │   └──────┬──────┘   │      │  - Trailing SL   │       │
│        │        │          │          │      │  - Breakeven     │       │
│  ┌─────▼─────┐  │   ┌──────▼──────┐   │      │  - Time Exit     │       │
│  │  Expert   │  │   │   Pattern   │   │      │  - Target Exit   │       │
│  │ Detection │  │   │ Confirmation│   │      └────────┬─────────┘       │
│  │           │  │   │ (Math Only) │   │               │                 │
│  │ - Fib     │  │   └──────┬──────┘   │               │                 │
│  │ - S/R     │  │          │          │               │                 │
│  │ - Liq     │  │   ┌──────▼──────┐   │               │                 │
│  │ - OB      │  │   │   Execute   │───┼───────────────┘                 │
│  └─────┬─────┘  │   │    Trade    │   │                                 │
│        │        │   └─────────────┘   │                                 │
│  ┌─────▼─────┐  │                     │                                 │
│  │   Setup   │  │                     │                                 │
│  │ Architect │  │                     │                                 │
│  │   (LLM)   │──┼────► Setup Queue    │                                 │
│  └───────────┘  │      (Redis)        │                                 │
│                 │                     │                                 │
└─────────────────┴─────────────────────┴─────────────────────────────────┘
```

---

## Operating Modes

V6 operates in **two distinct modes** with different parameters:

### SCALPING MODE (Default)

| Parameter | Value | Description |
|-----------|-------|-------------|
| Analysis Cycle | 15 min | LLM creates setups |
| Zone Check | 30 sec | Math-only price monitoring |
| Entry Distance | 0.2% | Max distance from zone midpoint |
| Setup Expiry | 2 hours | Time before setup invalidates |
| Max Trades/Day | 8 | Daily trade limit |
| Pattern Confirm | SKIP | Instant execution on zone entry |
| Stop Loss | 0.15% | ~15 pips |
| Take Profit 1 | 0.20% | ~20 pips |
| Take Profit 2 | 0.35% | ~35 pips |
| Min Risk/Reward | 1.3:1 | Required R:R ratio |
| Zone Width | 0.08-0.20% | Tight entry zones |
| Base Position | $800 | Before grade multiplier |

### SWING MODE

| Parameter | Value | Description |
|-----------|-------|-------------|
| Analysis Cycle | 30 min | LLM creates setups |
| Zone Check | 60 sec | Math-only price monitoring |
| Entry Distance | 0.5% | Max distance from zone midpoint |
| Setup Expiry | 6 hours | Time before setup invalidates |
| Max Trades/Day | 4 | Daily trade limit |
| Pattern Confirm | REQUIRE | Must see confirmation pattern |
| Stop Loss | 0.30% | ~30 pips |
| Take Profit 1 | 0.50% | ~50 pips |
| Take Profit 2 | 1.00% | ~100 pips |
| Min Risk/Reward | 1.4:1 | Required R:R ratio |
| Zone Width | 0.10-0.50% | Wider entry zones |

---

## The 3-Phase System

### PHASE 1: Strategic Analysis (LLM Cycle)

Every 15-30 minutes (based on mode), the LLM cycle runs:

#### Step 1: Market Bias Detection

Analyzes higher timeframe (HTF) trend to determine market direction:

```
Inputs:
├── 50 x 4H candles (200 hours of data)
├── 50 x 1H candles (50 hours of data)
└── Current price context

Output:
├── Market Direction: BULLISH | BEARISH | NEUTRAL
├── Strength: 0-100%
├── Preferred Direction: BUY | SELL | BOTH
└── Avoid Direction: BUY | SELL | NONE
```

#### Step 2: Expert Pattern Detection (Parallel)

Three experts analyze the market simultaneously:

**Fibonacci Expert**
- Identifies swing highs and swing lows
- Calculates retracement levels: 0.382, 0.5, 0.618, 0.786
- Calculates extension levels: 1.272, 1.618
- Marks "Golden Pocket" zone (0.618-0.786)

**Support/Resistance Expert**
- Detects key price levels from price action
- Identifies Order Blocks (OB):
  - Bullish OB = Demand zone (for BUY entries)
  - Bearish OB = Supply zone (for SELL entries)
- Returns strength rating: WEAK | MODERATE | STRONG

**Liquidity Expert**
- Identifies liquidity pools (clusters of stops)
- Marks sweep targets (equal highs/lows)
- Finds untested liquidity zones

#### Step 3: Setup Architect (LLM)

The LLM (Meta-Llama-3.1-8B-Instruct-Turbo) synthesizes all data:

```
Inputs:
├── All detected levels from experts
├── Market bias from HTF analysis
├── Current BTC price and 24h range
├── 100 x 15m candles (25 hours)
├── ATR for volatility context
└── Existing setups in queue (avoid duplicates)

Output: 2-5 Trade Setups
├── Direction: BUY | SELL
├── Entry Zone: [low, high] (tight band)
├── Stop Loss: Price level
├── Take Profit 1: First target
├── Take Profit 2: Extended target
├── Risk/Reward: Calculated ratio (min 1.3:1)
├── Grade: A | B | C
├── Rationale: Why this setup
└── Confirmation Required: Boolean
```

#### Step 4: Queue Management

- Maximum 5 active setups at any time
- Duplicate prevention (0.5% proximity threshold)
- Expired setups automatically removed
- Daily trade limit enforced

---

### PHASE 2: Zone Monitoring (Math-Only Cycle)

Every 30-60 seconds, pure math checks execute:

#### Zone Status State Machine

```
                    price approaching
   WAITING ────────────────────────────► APPROACHING
      ▲                                       │
      │                                       │ price enters zone
      │ price moves away                      ▼
      └──────────────────────────────── IN_ZONE
                                              │
                              ┌───────────────┼───────────────┐
                              │               │               │
                              ▼               ▼               ▼
                        CONFIRMING      EXECUTED      PASSED_THROUGH
                              │               │               │
                              │ pattern found │               │
                              └───────► ◄─────┘               │
                                    TRADE                     │
                                  EXECUTED                    ▼
                                                          MISSED
                                                        (invalidated)
```

#### Price Distance Calculation

```typescript
distancePercent = |currentPrice - zoneMidpoint| / zoneMidpoint * 100

Zone Status:
├── FAR: distancePercent > 0.3%
├── APPROACHING: 0.15% < distancePercent <= 0.3% (correct direction)
├── IN_ZONE: Price within zone bounds ± buffer
└── PASSED_THROUGH: Price crossed zone without entry
```

#### Pattern Confirmation (When IN_ZONE)

Analyzes last 2 candles on 5m timeframe for entry confirmation:

| Pattern | Description | Direction |
|---------|-------------|-----------|
| REJECTION_WICK | 30%+ wick in reversal direction | Both |
| PIN_BAR | Small body (45%) + long wick (40%+) | Both |
| BULLISH_ENGULFING | Green candle engulfs previous red | BUY |
| BEARISH_ENGULFING | Red candle engulfs previous green | SELL |
| HAMMER | Small body + 40%+ lower wick | BUY |
| SHOOTING_STAR | Small body + 40%+ upper wick | SELL |
| DOJI_REVERSAL | Near-equal open/close at key level | Both |

**Pattern Scoring**:
- WEAK: < 50 confidence
- MODERATE: 50-70 confidence
- STRONG: 70+ confidence

**Mode Behavior**:
- Scalping Mode: SKIP confirmation, execute immediately on IN_ZONE
- Swing Mode: REQUIRE confirmation pattern before execution

---

### PHASE 3: Position Management

Once trade executes, continuous monitoring begins:

#### Exit Strategies

| Strategy | Trigger | Action |
|----------|---------|--------|
| Trailing Stop | Profit exceeds threshold | Move SL to lock in gains |
| Breakeven | 50% of target reached | Move SL to entry price |
| Time-based Exit | Max hold time exceeded | Close position |
| Target Exit | Price hits TP1 | Close partial, trail rest to TP2 |

#### MT4 Integration

- Position creation via validatedSignalExecutor
- SL/TP set at calculated levels
- Real-time P&L monitoring
- Automatic partial close at TP1

---

## Setup Grades & Position Sizing

Each setup receives a grade based on confluence scoring:

### Grade A - High Confluence
- Multiple technical confluences (Fib + OB + S/R)
- High strength levels (STRONG rated)
- Strong market bias alignment
- **Position Size: 100% ($800)**

### Grade B - Moderate Confluence
- 2 confluences (Fib + S/R, or OB + Liquidity)
- Moderate strength levels
- Decent bias alignment
- **Position Size: 75% ($600)**

### Grade C - Lower Confidence
- Single confluence or weaker signals
- Lower confidence scoring (<70%)
- Marginal bias alignment
- **Position Size: 50% ($400)**

---

## Technical Indicators

### ATR (Average True Range)
- 14-period, calculated from 15m candles
- Used for dynamic stop loss distance
- Volatility classification: LOW | NORMAL | HIGH

### Fibonacci Levels
| Level | Type | Description |
|-------|------|-------------|
| 0.382 | Retracement | Shallow pullback |
| 0.500 | Retracement | 50% pullback |
| 0.618 | Retracement | Golden ratio |
| 0.786 | Retracement | Deep pullback |
| 0.618-0.786 | Golden Pocket | High probability reversal zone |
| 1.272 | Extension | First extension target |
| 1.618 | Extension | Second extension target |

### EMA (Exponential Moving Average)
- 9-period and 21-period on 4H/1H timeframes
- Used in market bias calculation
- Crossovers indicate potential trend changes

### Order Blocks
- Bullish OB: Last bearish candle before strong bullish move (demand)
- Bearish OB: Last bullish candle before strong bearish move (supply)
- High probability reversal zones

### Volume Analysis
- Volume spike detection (120%+ of 20-period average)
- Confirms significance of price levels
- Optional confirmation requirement

### Price Structure
- Higher Highs + Higher Lows = Bullish structure
- Lower Highs + Lower Lows = Bearish structure
- Structure breaks signal potential reversals

---

## Pattern Detection Thresholds

Optimized for 5-minute candles (tighter than hourly):

| Threshold | Value | Description |
|-----------|-------|-------------|
| Rejection Wick Min | 30% | Minimum wick size for rejection |
| Rejection Wick Strong | 45% | Strong rejection signal |
| Pin Bar Max Body | 45% | Maximum body size for pin bar |
| Pin Bar Min Wick | 40% | Minimum wick for pin bar |
| Hammer Lower Wick | 40% | Minimum lower wick for hammer |
| Shooting Star Upper | 40% | Minimum upper wick for shooting star |
| Volume Spike | 1.2x | 120% of average volume |

**Performance Target**: < 100ms decision time (all math, no API calls)

---

## V3 vs V6 Comparison

| Aspect | V3 | V6 |
|--------|----|----|
| Strategy | Multi-pattern scalp | LLM-powered sniper |
| Setup Creation | Real-time each check | Batched every 30 min |
| Analysis Speed | Fast but rigid rules | Slower analysis, instant execution |
| Confirmation | Optional patterns | Mode-dependent |
| Entry Timing | Immediate on signal | Zone-based waiting |
| Timeframes | Multiple (1m-1h) | Focused (5m confirm, HTF bias) |
| LLM Usage | Limited | Heavy (strategic analysis) |
| Risk Management | Fixed percentages | Dynamic (ATR-based) |
| Position Sizing | Flat amount | Grade-based multipliers |
| Queue System | Simple list | Redis-backed, max 5 |
| Mode Support | Scalping only | Scalping + Swing |
| State Persistence | Memory only | Redis persistence |

---

## Redis Persistence

V6 uses Redis for state management across restarts:

| Key | Purpose |
|-----|---------|
| `v6:setup_queue` | Full queue state (all setups) |
| `v6:setup:{id}` | Individual setup details |
| `v6:daily_trades` | Trade count for today |
| `v6:daily_date` | Date of last counter reset |
| `v6:queue_state` | Health metrics |

---

## Error Handling & Fallbacks

| Scenario | Fallback Behavior |
|----------|-------------------|
| LLM Failure | Falls back to simple rule-based setup creation |
| Pattern Detection Fail | Returns unconfirmed status |
| API Failure | Retries with exponential backoff |
| Stale Price Data | Validates against recent candle range |
| Queue Full | Skips analysis cycle until space available |
| Redis Down | Falls back to in-memory queue |

---

## Execution Flow

```
v6SniperService.runAnalysisCycle()
    │
    ├──► marketBiasService.detectBias()
    │
    ├──► [PARALLEL]
    │    ├── expertFibonacciService.detectLevels()
    │    ├── expertSupportResistanceService.detectLevels()
    │    └── expertLiquidityService.detectLevels()
    │
    ├──► setupArchitectService.createSetups()
    │
    └──► setupQueueService.addSetups()


zoneMonitorService.checkAllSetups() [every 30s]
    │
    ├──► For each setup in queue:
    │    │
    │    ├── Calculate price distance
    │    │
    │    ├── Update zone status
    │    │
    │    └── If IN_ZONE:
    │         │
    │         ├── [Scalping] → Execute immediately
    │         │
    │         └── [Swing] → candleConfirmationService.check()
    │                        │
    │                        └── If confirmed → Execute
    │
    └──► validatedSignalExecutor.executeV6Setup()
              │
              └──► mt4TradeManager.createPosition()
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/services/v6/v6SniperService.ts` | Main orchestration |
| `src/services/v6/setupArchitectService.ts` | LLM setup creation |
| `src/services/v6/zoneMonitorService.ts` | Math-based zone monitoring |
| `src/services/v6/candleConfirmationService.ts` | Pattern detection |
| `src/services/v6/expertFibonacciService.ts` | Fibonacci analysis |
| `src/services/v6/expertSupportResistanceService.ts` | S/R & Order Blocks |
| `src/services/v6/expertLiquidityService.ts` | Liquidity detection |
| `src/services/v6/setupQueueService.ts` | Redis queue management |
| `src/services/v6/marketBiasService.ts` | HTF trend analysis |
| `src/types/v6/v6Types.ts` | Type definitions |
| `src/v6-sniper-worker.ts` | Worker entry point |

---

## Summary

MARIPOSA V6 Pro is a sophisticated trading system that:

1. **Uses LLM strategically** (30-min analysis) to understand market context and identify high-quality entry zones

2. **Uses pure math operationally** (30-sec checks) for speed and reliability in execution

3. **Separates concerns**: Strategy (LLM) vs. Execution (Math) - each optimized for its purpose

4. **Offers flexibility**: Scalping (aggressive, instant) or Swing (patient, confirmation-based) modes

5. **Maintains quality**: Grade system for position sizing, duplicate prevention, daily limits

6. **Recovers gracefully**: Redis persistence, fallback setups, comprehensive error handling

The system targets **quick scalps (15-35 pips)** with **high win rates** through confluence-based entry points and **intelligent position sizing** based on setup quality.
