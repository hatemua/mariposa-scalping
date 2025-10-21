# Complete Trade Lifecycle & Signal Management

## Overview

Your system **ALREADY HANDLES** the complete buy→sell cycle automatically using intelligent LLM-based exit strategies. Trades are saved, monitored, and closed automatically.

---

## ✅ Question 1: Are Trades Saved?

**YES** - Every trade is saved to MongoDB with full details.

### Trade Schema
**File**: `models/Trade.ts`

```typescript
{
  userId: ObjectId,
  agentId: ObjectId,
  symbol: "SOLUSDT",
  side: "buy" | "sell",
  type: "market" | "limit",
  quantity: 0.1,
  price: 200.00,
  filledPrice: 200.05,
  filledQuantity: 0.1,
  status: "pending" | "filled" | "cancelled" | "rejected",
  pnl: 5.50,  // Calculated on exit
  fees: 0.20,
  okxOrderId: "12345",
  signalId: "whale_abc123",
  llmValidationScore: 85,
  expectedWinProbability: 0.75,
  actualOutcome: "WIN" | "LOSS" | "BREAKEVEN",
  createdAt: Date,
  updatedAt: Date
}
```

### Where Trades Are Saved

**1. On Execution** (`agendaService.ts:112-127`)
```typescript
const trade = new Trade({
  userId, agentId, symbol, side, type,
  quantity, price, filledPrice, status, okxOrderId
});
await trade.save();
```

**2. On Failure** (`agendaService.ts:137-148`)
```typescript
const failedTrade = new Trade({
  userId, agentId, symbol, side, type,
  quantity, price, status: 'rejected'
});
await failedTrade.save();
```

**3. On Status Update** (`agendaService.ts:171-178`)
```typescript
trade.status = 'filled';
trade.filledPrice = orderStatus.average;
trade.filledQuantity = orderStatus.filled;
trade.fees = orderStatus.fee?.cost;
await trade.save();
```

---

## ✅ Question 2: How Are Positions Closed (Buy → Sell)?

**AUTOMATIC** - The system uses intelligent LLM monitoring to decide when to exit.

### Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: ENTRY SIGNAL DETECTED                                   │
├─────────────────────────────────────────────────────────────────┤
│ Auto-scan finds: WHALE_ACTIVITY - BUY SOL                       │
│ Signal: { recommendation: 'BUY', symbol: 'SOLUSDT' }            │
│ Broadcast to all agents                                         │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: AGENT VALIDATES                                         │
├─────────────────────────────────────────────────────────────────┤
│ LLM analyzes: "Good signal, execute"                            │
│ Position size: $10 (45% of $22 balance)                         │
│ Approved for execution                                          │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: TRADE EXECUTED & SAVED                                  │
├─────────────────────────────────────────────────────────────────┤
│ Execute: BUY 0.05 SOL @ $200                                    │
│ Trade saved: {                                                  │
│   side: 'buy',                                                  │
│   symbol: 'SOLUSDT',                                            │
│   entryPrice: 200.00,                                           │
│   quantity: 0.05,                                               │
│   status: 'filled'                                              │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: AUTOMATIC MONITORING STARTS (Every 10 seconds)          │
├─────────────────────────────────────────────────────────────────┤
│ Job: monitor-agent-pnl                                          │
│ File: agendaService.ts:246-268                                  │
│                                                                 │
│ Every 10 seconds:                                               │
│   1. Find all open trades (status: 'filled')                    │
│   2. Get current market price                                   │
│   3. Calculate unrealized PnL                                   │
│   4. If significant change → LLM analysis                       │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: LLM EXIT ANALYSIS                                       │
├─────────────────────────────────────────────────────────────────┤
│ File: llmExitStrategyService.ts:49-86                           │
│                                                                 │
│ LLM receives:                                                   │
│   - Position: BUY 0.05 SOL @ $200                               │
│   - Current price: $210                                         │
│   - Unrealized PnL: +$0.50 (+5%)                                │
│   - Market conditions: Bullish, high liquidity                  │
│   - Agent profile: Risk level 3/5, scalping strategy            │
│                                                                 │
│ LLM decides:                                                    │
│   "EXIT_NOW - Price up 5%, good profit for scalping,           │
│    resistance level reached, secure gains"                      │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: EXIT EXECUTED (Opposite Side)                           │
├─────────────────────────────────────────────────────────────────┤
│ File: llmExitStrategyService.ts:288-326                         │
│                                                                 │
│ Code: const exitSide = position.side === 'buy' ? 'sell' : 'buy'│
│                                                                 │
│ Execute: SELL 0.05 SOL @ $210 (market order)                    │
│                                                                 │
│ Trade updated: {                                                │
│   status: 'closed',                                             │
│   exitPrice: 210.00,                                            │
│   pnl: +0.50,  // ($210 - $200) * 0.05                          │
│   actualOutcome: 'WIN'                                          │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Code Locations

### Entry Signal Detection
**File**: `agendaService.ts:989-1065`
```typescript
// Auto-scan jobs (every 30-45s)
await this.agenda.every('30 seconds', 'auto-scan-opportunities');
await this.agenda.every('45 seconds', 'auto-detect-whales');
```

### Position Monitoring Setup
**File**: `agendaService.ts:434-436`
```typescript
// Started when agent is activated
await this.agenda.every('10 seconds', 'monitor-agent-pnl', {
  agentId
}, { timezone: 'UTC' });
```

### Position Monitoring Logic
**File**: `positionMonitoringService.ts:40-88`
```typescript
async monitorAgentPositions(agentId: string) {
  // Get all open trades
  const openTrades = await Trade.find({
    agentId,
    status: { $in: ['pending', 'filled'] }
  });

  // Check each position's PnL
  for (const trade of openTrades) {
    const position = await this.buildPosition(trade, agent);
    const event = await this.checkPnLChange(position);
    if (event) {
      // Trigger LLM exit analysis if significant change
    }
  }
}
```

### PnL Calculation
**File**: `positionMonitoringService.ts:106-111`
```typescript
let unrealizedPnL: number;
if (trade.side === 'buy') {
  unrealizedPnL = (currentPrice - entryPrice) * quantity;
} else {
  unrealizedPnL = (entryPrice - currentPrice) * quantity;
}
```

### LLM Exit Decision
**File**: `llmExitStrategyService.ts:91-227`
```typescript
const prompt = `Analyze this position and decide if/when to exit:
- Position: ${side} ${quantity} ${symbol} @ $${entryPrice}
- Current: $${currentPrice}
- Unrealized P&L: ${pnlSign}$${unrealizedPnL} (${pnlPercent}%)
- Holding time: ${holdingTimeHours} hours
...

Respond: {
  "action": "HOLD" | "EXIT_NOW" | "PARTIAL_EXIT",
  "reasoning": "...",
  "urgency": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
}`;
```

### Exit Execution
**File**: `llmExitStrategyService.ts:312-325`
```typescript
// Determine opposite side
const exitSide: 'buy' | 'sell' = position.side === 'buy' ? 'sell' : 'buy';

// Execute exit order
await okxService.executeScalpingOrder(
  agent.userId.toString(),
  position.symbol,
  exitSide,  // ← OPPOSITE of entry
  exitQuantity,
  'market'  // Use market orders for immediate exit
);
```

---

## 📊 Example Scenarios

### Scenario 1: Profitable Exit

**Entry**:
```
Signal: BUY SOL detected
Entry: BUY 0.05 SOL @ $200 ($10 position)
Trade saved to database
```

**Monitoring** (happens automatically every 10s):
```
10s later: SOL = $201 → PnL: +$0.05 → LLM: "HOLD"
30s later: SOL = $203 → PnL: +$0.15 → LLM: "HOLD"
2min later: SOL = $210 → PnL: +$0.50 → LLM: "EXIT_NOW - 5% gain"
```

**Exit**:
```
Execute: SELL 0.05 SOL @ $210
Trade updated: { pnl: +$0.50, status: 'closed', actualOutcome: 'WIN' }
Agent performance updated: +$0.50 to total PnL
```

### Scenario 2: Stop Loss Exit

**Entry**:
```
Signal: BUY SOL detected
Entry: BUY 0.05 SOL @ $200
```

**Monitoring**:
```
10s later: SOL = $199 → PnL: -$0.05 → LLM: "HOLD (small loss)"
1min later: SOL = $195 → PnL: -$0.25 → LLM: "EXIT_NOW - 2.5% loss, cut losses"
```

**Exit**:
```
Execute: SELL 0.05 SOL @ $195
Trade updated: { pnl: -$0.25, status: 'closed', actualOutcome: 'LOSS' }
```

### Scenario 3: Partial Profit Taking

**Entry**:
```
BUY 0.1 SOL @ $200
```

**Monitoring**:
```
SOL = $215 → PnL: +$1.50 (+7.5%)
LLM: "PARTIAL_EXIT - take 50% profit, let rest run"
```

**Exit**:
```
Execute: SELL 0.05 SOL @ $215 (50% of position)
Remaining: 0.05 SOL still open, continues monitoring
```

---

## 🎯 Signal Types That Create Trades

### 1. Opportunity Signals
**Source**: `auto-scan-opportunities` job
**Types**: BREAKOUT, REVERSAL, MOMENTUM, ARBITRAGE, VOLUME_SURGE
**Recommendation**: BUY or SELL based on technical analysis

### 2. Whale Activity Signals
**Source**: `auto-detect-whales` job
**Types**: LARGE_TRADE, BUY_WALL, SELL_WALL, ACCUMULATION
**Recommendation**: Follows whale direction (BUY if whale buys, SELL if whale sells)

### 3. Both Create Entry Trades
```typescript
// From signalBroadcastService
if (signal.recommendation === 'BUY') {
  // Agent executes BUY trade
  // Monitoring starts immediately
  // LLM will decide when to SELL
}

if (signal.recommendation === 'SELL') {
  // Agent executes SELL trade (short position)
  // Monitoring starts immediately
  // LLM will decide when to BUY (cover short)
}
```

---

## 🔍 How to Verify It's Working

### 1. Check Trades Are Being Saved

**MongoDB Query**:
```javascript
db.trades.find().sort({ createdAt: -1 }).limit(10)
```

**Expected**:
```json
[
  {
    "_id": "...",
    "agentId": "68e42da6ecf6d882fa0a993f",
    "symbol": "SOLUSDT",
    "side": "buy",
    "quantity": 0.05,
    "price": 200.00,
    "status": "filled",
    "createdAt": "2025-10-21T19:00:00Z"
  }
]
```

### 2. Check Monitoring Jobs Are Running

**Logs to look for**:
```
✅ Started monitoring workers for agent abc123 (ScalpingBot1)
monitor-agent-pnl running for agent abc123
Position monitoring: BUY 0.05 SOL, unrealized PnL: +$0.50
```

### 3. Check Exit Decisions

**Logs to look for**:
```
Exit decision for ScalpingBot1 (SOLUSDT): EXIT_NOW - Price up 5%, good profit
Executing EXIT_NOW for ScalpingBot1: sell 0.05 SOLUSDT @ market price
✅ Trade executed successfully
```

### 4. Verify PnL Updates

**MongoDB Query**:
```javascript
db.trades.find({ pnl: { $exists: true } }).sort({ createdAt: -1 })
```

**Expected**:
```json
{
  "side": "buy",
  "entryPrice": 200,
  "exitPrice": 210,
  "pnl": 0.50,
  "actualOutcome": "WIN",
  "status": "closed"
}
```

---

## ⚡ Monitoring Frequency

| Component | Frequency | Purpose |
|-----------|-----------|---------|
| `auto-scan-opportunities` | Every 30s | Detect new entry signals |
| `auto-detect-whales` | Every 45s | Detect whale activity |
| `monitor-positions` | Every 30s | Check order status (legacy) |
| **`monitor-agent-pnl`** | **Every 10s** | **Monitor open positions for exits** |
| `analyze-exit-strategy` | On demand | LLM exit analysis when PnL changes |

**This means**: Your positions are checked **every 10 seconds** for exit opportunities!

---

## 💡 Summary

### Your System ALREADY Does:

✅ **Detects BUY signals** → Executes BUY trade → Saves to database
✅ **Detects SELL signals** → Executes SELL trade → Saves to database
✅ **Monitors positions** every 10 seconds
✅ **Calculates PnL** automatically (real-time)
✅ **LLM analyzes** when to exit
✅ **Executes exits** automatically (opposite side)
✅ **Updates trades** with PnL and outcome
✅ **Tracks performance** per agent

### You Don't Need To:

❌ Manually detect when to sell
❌ Write custom exit logic
❌ Track positions yourself
❌ Calculate PnL manually

### The System Handles:

1. **Entry**: Detects opportunities, validates with LLM, executes
2. **Monitoring**: Tracks every position automatically
3. **Exit**: LLM decides when, system executes opposite side
4. **Recording**: All trades saved with full lifecycle data

---

## 🚀 Your Only Job

1. **Fund OKX account** with USDT
2. **Start agents** (they auto-trade)
3. **Monitor results** in database/dashboard

Everything else is **fully automated**!
