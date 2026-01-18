# MARIPOSA WEEX V6 Multi-Coin Bot - Complete Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MARIPOSA WEEX V6 MULTI-COIN BOT                      │
│                         (15-minute cycles)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        v                           v                           v
   ┌─────────┐               ┌─────────┐               ┌─────────┐
   │   BTC   │               │   ETH   │               │   SOL   │  + DOGE
   │ 0.05BTC │               │ 1.5 ETH │               │ 25 SOL  │
   └────┬────┘               └────┬────┘               └────┬────┘
        │                         │                         │
        └─────────────────────────┼─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │   QUALITY FILTER CHAIN    │
                    │  (4 Sequential Filters)   │
                    └─────────────┬─────────────┘
                                  │
        ┌─────────┬───────────────┼───────────────┬─────────┐
        v         v               v               v         v
    ┌──────┐  ┌──────┐       ┌──────┐       ┌──────┐  ┌──────┐
    │ QF#0 │→ │ QF#1 │   →   │ QF#2 │   →   │ QF#3 │→ │TRADE │
    │WinRate│  │Profit│       │ MTF  │       │Moment│  │EXEC  │
    └──────┘  └──────┘       └──────┘       └──────┘  └──────┘
```

---

## Trading Pairs Configuration

| Coin | WEEX Symbol | Position Size | Min TP% | Min SL% | Tick Size |
|------|-------------|---------------|---------|---------|-----------|
| BTC  | cmt_btcusdt | 0.05 BTC      | 0.35%   | 0.25%   | 0.1       |
| ETH  | cmt_ethusdt | 1.5 ETH       | 0.40%   | 0.30%   | 0.01      |
| SOL  | cmt_solusdt | 25 SOL        | 0.50%   | 0.35%   | 0.001     |
| DOGE | cmt_dogeusdt| 15000 DOGE    | 0.50%   | 0.40%   | 0.00001   |

**Position Limits:**
- Max positions per coin: 1
- Max total positions: 3
- Analysis cycle: 15 minutes

---

## PHASE 1: ANALYSIS CYCLE

**File:** `src/services/weex/multiCoinOrchestrator.ts`

### Cycle Flow
```
Every 15 minutes:
1. Load existing positions from DB
2. Sync with WEEX exchange
3. Count open positions
4. If < 3 positions: Analyze available coins IN PARALLEL
5. Apply 4 quality filters to each coin
6. Execute trade if ALL filters pass
```

### Trend Analysis (EMA-Based)
```typescript
// Analyzes 1H and 4H timeframes
Score System:
├─ 1H EMA9 > EMA21: +1 bull / +1 bear
├─ 4H EMA9 > EMA21: +2 bull / +2 bear (higher weight)
├─ Price > 1H EMA21: +1 bull / +1 bear
├─ Price > 4H EMA21: +2 bull / +2 bear

Decision:
├─ bullScore > bearScore + 2 → BULLISH
├─ bearScore > bullScore + 2 → BEARISH
└─ Otherwise → NEUTRAL (no trade)

Strength = max(bull, bear) / (bull + bear) × 100
Minimum required: 60%
```

### Entry Opportunity (Pullback Detection)
```
For BUY: Price must be in LOWER 70% of last 5-candle range
For SELL: Price must be in UPPER 30% of last 5-candle range

This ensures we're entering on pullbacks, not chasing moves.
```

---

## PHASE 2: QUALITY FILTERS

### FILTER #0: Win Rate Tracking
**Purpose:** Pause trading during losing streaks

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Window Size | 20 trades | Recent performance window |
| Min Win Rate | 70% | Threshold to continue trading |
| Pause Duration | 30 minutes | Recovery time if triggered |
| Min History | 5 trades | Start tracking after 5 trades |

```
Logic:
IF pausedUntil exists AND now < pausedUntil → BLOCK
IF trades < 5 → PASS (not enough data)
IF winRate < 70% → SET pause 30min, BLOCK
ELSE → PASS
```

### FILTER #1: Profit Prediction
**Purpose:** Ensure trade covers fees + generates profit

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Min Profit | $20 USD | Minimum expected profit |
| Leverage | 20x | User's WEEX leverage |

```
Calculation:
expectedProfit = positionSizeUSD × (tpPercent / 100) × leverage

Example (BTC at $95,000):
├─ Position: 0.05 BTC = $4,750
├─ TP: 0.35%
├─ Profit: $4,750 × 0.0035 × 20 = $33.25
└─ $33.25 >= $20 → PASS
```

### FILTER #2: MTF Confluence
**Purpose:** Align trade with multi-timeframe trend

**File:** `src/services/v6/mtfExpertService.ts`

| Timeframe | Weight | Purpose |
|-----------|--------|---------|
| H4 | 40% | Dominant trend |
| H1 | 30% | Intermediate confirmation |
| M15 | 20% | Entry timing |
| M5 | 10% | Micro structure |

```
Confluence Calculation:
├─ Each TF matching dominant trend: Add full weight
├─ NEUTRAL TF: Add 50% of weight
├─ Opposing TF: Add 0%

Minimum: 50% confluence required
Bias: If 70%+ confluence → Strong BUY/SELL bias

Example: H4=BULL, H1=BULL, M15=NEUTRAL, M5=BEAR
Score = 40 + 30 + (20×0.5) + 0 = 80% → PASS

Additional Check: If bias conflicts with entry direction → BLOCK
```

**Cache:** 5 minutes TTL, invalidated on 0.3% price move

### FILTER #3: Momentum & Exhaustion
**Purpose:** Prevent entering exhausted moves

**File:** `src/services/v6/momentumExpertService.ts`

#### Indicators Analyzed:
| Indicator | Parameters | Purpose |
|-----------|------------|---------|
| RSI | 14-period | Overbought/Oversold |
| MACD | 12/26/9 | Trend momentum |
| Volume | 20-period avg | Confirmation |

#### Exhaustion Detection:
```
BLOCK conditions:
├─ RSI < 30 + Entry = SELL → BLOCK (don't sell oversold)
├─ RSI > 70 + Entry = BUY → BLOCK (don't buy overbought)
├─ Move > 2.5% up + Entry = BUY → BLOCK (extended)
├─ Move > 2.5% down + Entry = SELL → BLOCK (extended)
```

#### Entry Quality Scoring:
```
Points System (for BUY):
├─ RSI < 30 (oversold): +3
├─ RSI < 45: +1
├─ RSI Bullish Divergence: +2
├─ MACD Bullish Cross: +2
├─ High Volume (>1.2x): +1
├─ Exhaustion in BUY direction: -3

Grades:
├─ Score >= 5: EXCELLENT
├─ Score >= 3: GOOD ← Minimum required
├─ Score >= 1: FAIR
└─ Score < 1: POOR → BLOCK
```

**No Cache:** Always fetches fresh data

---

## PHASE 3: TRADE EXECUTION

**File:** `src/services/weex/weexV6Executor.ts`

### Pre-Execution Validation:
1. Execution lock (5-second cooldown)
2. Block Grade C counter-trend trades
3. Check for existing position
4. Validate R:R ratio >= 1.5:1
5. Profit prediction >= $30

### Position Sizing:
```
Formula: Base × GradeMultiplier × SessionMultiplier

Base: $2,500 USD
Grade Multipliers:
├─ Grade A: 1.0x ($2,500)
├─ Grade B: 0.75x ($1,875)
└─ Grade C: 0.5x ($1,250)

Session Multipliers:
├─ OVERLAP (London/NY): 1.25x
├─ LONDON: 1.0x
├─ NEW_YORK: 0.8x
└─ ASIA: 0.6x
```

### Order Placement:
```
Single API call with preset TP/SL:
├─ symbol: "cmt_btcusdt"
├─ size: Position size in coin
├─ type: 1 (Long) or 2 (Short)
├─ match_price: 1 (Market order)
├─ presetTakeProfitPrice: TP level
└─ presetStopLossPrice: SL level

Result: Only 2 fees (entry + exit)
```

---

## PHASE 4: POSITION MONITORING

**File:** `src/services/weex/weexPositionMonitor.ts`

### Monitor Loop (every 15 seconds):
```
1. Get current price from Binance
2. Get position status from WEEX
3. Calculate P&L:
   pnlUSD = positionSizeBTC × (currentPrice - entryPrice) × direction
4. Check exit conditions (priority order):
   a. Ghost Detection → TP/SL hit on exchange
   b. Time Exit → Position age > 60 minutes
5. Record trade result (WIN/LOSS) for win rate
```

### Exit Conditions:
| Exit Type | Trigger | Handler |
|-----------|---------|---------|
| TAKE_PROFIT | Price hits TP | Exchange (auto) |
| STOP_LOSS | Price hits SL | Exchange (auto) |
| TIME_EXIT | Age > 60 min | Monitor (manual close) |

### Disabled Features (to reduce fees):
- Breakeven adjustment ($4 per modification)
- Trailing stop ($4-8 per modification)
- Profit pullback detection (too aggressive)

---

## KEY THRESHOLDS FOR BIG MOVES

### Current Constraints (Limiting Big Moves):

| Parameter | Current | Issue for Big Moves |
|-----------|---------|---------------------|
| TP Distance | 0.35-0.50% | Very tight, exits early |
| Max Duration | 60 minutes | Time-limited |
| MTF Confluence | 50% min | May block strong moves |
| Entry Quality | GOOD min | Filters out momentum entries |
| Exhaustion Block | 2.5% move | Blocks extended trends |

### Potential Adjustments for Bigger Moves:

1. **Increase TP Distance:**
   - Current: 0.35-0.50%
   - For big moves: 1.0-2.0%
   - File: `src/config/environment.ts` → TRADING_PAIRS[].minTpPercent

2. **Extend Time Limit:**
   - Current: 60 minutes
   - For big moves: 240+ minutes
   - File: `src/config/environment.ts` → MAX_POSITION_DURATION_MINUTES

3. **Relax Exhaustion Threshold:**
   - Current: 2.5% blocks
   - For big moves: 4-5% threshold
   - File: `src/services/v6/momentumExpertService.ts`

4. **Add Trailing Stop (re-enable):**
   - Lock profits while riding trend
   - Trade-off: +$4-8 fees per trade
   - File: `src/services/weex/weexPositionMonitor.ts`

5. **Lower Entry Quality:**
   - Current: GOOD minimum
   - For momentum plays: FAIR acceptable
   - File: `src/services/weex/multiCoinOrchestrator.ts` → QUALITY_FILTER_CONFIG

6. **Adjust MTF Weights:**
   - Increase H4 weight for trend-following
   - File: `src/services/v6/mtfExpertService.ts`

---

## FILE STRUCTURE

```
src/
├── services/
│   ├── weex/
│   │   ├── multiCoinOrchestrator.ts    # Main orchestrator
│   │   ├── weexPositionMonitor.ts      # Position tracking
│   │   ├── weexV6Executor.ts           # Order execution
│   │   └── weexService.ts              # WEEX API client
│   └── v6/
│       ├── mtfExpertService.ts         # MTF analysis
│       ├── momentumExpertService.ts    # Momentum/exhaustion
│       ├── setupArchitectExpert.ts     # Setup creation
│       ├── strategicAnalysisService.ts # 30-min analysis cycle
│       └── zoneMonitorService.ts       # Zone entry detection
├── config/
│   └── environment.ts                  # All configuration
├── models/
│   └── WeexPosition.ts                 # DB persistence
└── types/
    └── weex/
        └── weex.types.ts               # Type definitions
```

---

## DATA FLOW DIAGRAM

```
┌──────────────────┐
│  BINANCE API     │ ◄─── Price Data (Klines)
│  (Data Source)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  ANALYSIS CYCLE  │ ◄─── Every 15 minutes
│  (Orchestrator)  │
└────────┬─────────┘
         │
         ├──► Trend Analysis (EMA 9/21)
         ├──► Entry Detection (Pullback)
         ├──► Quality Filters (4 sequential)
         │
         ▼
┌──────────────────┐
│  TRADE DECISION  │
│  (Pass/Block)    │
└────────┬─────────┘
         │
         ▼ (If PASS)
┌──────────────────┐
│  WEEX EXECUTOR   │ ◄─── Order Placement
│  (Single Order)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  POSITION DB     │ ◄─── MongoDB Storage
│  (WeexPosition)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  MONITOR LOOP    │ ◄─── Every 15 seconds
│  (Exit Logic)    │
└──────────────────┘
```

---

## SESSION TIMING

Trading sessions are used to adjust position sizing and activity levels.

| Session | UTC Hours | Multiplier | Characteristics |
|---------|-----------|------------|-----------------|
| ASIA | 00:00-07:00 | 0.6x | Lower volatility |
| LONDON | 07:00-12:00 | 1.0x | Medium volatility |
| OVERLAP | 12:00-16:00 | 1.25x | Highest volatility |
| NEW_YORK | 16:00-21:00 | 0.8x | Moderate volatility |
| OFF_HOURS | 21:00-00:00 | 0.5x | Low volatility |

**File:** `src/services/v6/sessionFilterService.ts`

---

## QUALITY FILTER CHAIN FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUALITY FILTER CHAIN                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Entry Signal ──► [QF#0: Win Rate] ──┬──► BLOCK (pause active)  │
│                                      │                          │
│                                      ▼                          │
│                   [QF#1: Profit Prediction] ─┬─► BLOCK (<$20)   │
│                                              │                  │
│                                              ▼                  │
│                   [QF#2: MTF Confluence] ────┬─► BLOCK (<50%)   │
│                                              │                  │
│                                              ▼                  │
│                   [QF#3: Momentum] ──────────┬─► BLOCK (POOR)   │
│                                              │                  │
│                                              ▼                  │
│                                         EXECUTE TRADE           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API ENDPOINTS USED

### Binance (Data Only)
| Endpoint | Purpose |
|----------|---------|
| GET /api/v3/klines | Historical candles for analysis |
| GET /api/v3/ticker/price | Current price for monitoring |

### WEEX (Execution)
| Endpoint | Purpose |
|----------|---------|
| POST /v1/contract/order/submit | Place order with TP/SL |
| GET /v1/contract/position/info | Get position status |
| POST /v1/contract/order/cancel | Cancel/close position |
| POST /v1/contract/position/close | Market close position |

---

## ERROR HANDLING

### Retry Logic
| Operation | Max Retries | Backoff |
|-----------|-------------|---------|
| Binance Data | 3 | Exponential (1s, 2s, 4s) |
| WEEX Order | 2 | Fixed (1s) |
| Position Sync | 5 | Fixed (2s) |

### Failure Modes
| Failure | Response |
|---------|----------|
| Binance timeout | Skip analysis cycle |
| WEEX order fail | Log error, no retry |
| Position sync fail | Use cached data |
| DB connection fail | Continue with in-memory |

---

## LOGGING

### Log Levels
| Level | Usage |
|-------|-------|
| INFO | Trade executions, filter passes |
| WARN | Filter blocks, sync issues |
| ERROR | API failures, execution errors |
| DEBUG | Detailed analysis data |

### Key Log Patterns
```
[ORCHESTRATOR] Starting analysis cycle...
[QF#0] Win rate: 75% (15/20 trades) - PASS
[QF#1] Expected profit: $33.25 - PASS
[QF#2] MTF confluence: 80% BULLISH - PASS
[QF#3] Momentum: GOOD (score: 4) - PASS
[EXECUTOR] Opening LONG BTC @ $95,000 | TP: $95,332.50 | SL: $94,762.50
[MONITOR] Position BTC updated: P&L +$25.50 (+0.27%)
```

---

## PERFORMANCE METRICS

### Tracking
| Metric | Storage | Purpose |
|--------|---------|---------|
| Win Rate | Rolling 20 trades | QF#0 input |
| Avg Profit | Per coin | Performance analysis |
| Filter Block % | Per filter | Tune thresholds |
| Execution Time | Per trade | Latency monitoring |

### Dashboard Integration
Position data and trade history available via:
- MongoDB: `weex_positions` collection
- API: Dashboard endpoints (see API_DOCUMENTATION.md)

---

## MAINTENANCE

### Daily Tasks
- Check log files for errors
- Verify position sync accuracy
- Monitor win rate trends

### Weekly Tasks
- Review filter block rates
- Adjust thresholds if needed
- Analyze missed opportunities

### Configuration Files
| File | Purpose | Hot Reload |
|------|---------|------------|
| environment.ts | Trading pairs, limits | No (restart) |
| ecosystem.config.js | PM2 process config | No (restart) |
| .env | API keys, secrets | No (restart) |

---

## QUICK REFERENCE

### Start/Stop Commands
```bash
# Start multi-coin bot
pm2 start ecosystem.config.js --only weex-v6-multi

# Stop
pm2 stop weex-v6-multi

# View logs
pm2 logs weex-v6-multi --lines 100

# Restart
pm2 restart weex-v6-multi
```

### Key Configuration Values
```typescript
// src/config/environment.ts
MAX_TOTAL_POSITIONS: 3
ANALYSIS_INTERVAL_MS: 15 * 60 * 1000  // 15 minutes
MONITOR_INTERVAL_MS: 15 * 1000        // 15 seconds
MAX_POSITION_DURATION_MINUTES: 60
```

---

*Last Updated: January 2026*
*Version: WEEX V6 Pro*
