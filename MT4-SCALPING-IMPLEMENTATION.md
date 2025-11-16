# MT4 Scalping Implementation - Complete Guide

## Overview

This implementation adds a complete MT4 BTC scalping system with pattern detection, auto-close functionality, and market drop protection.

## ✅ Components Implemented

### 1. Core Models
- **[MT4Position.ts](src/models/MT4Position.ts)** - Tracks MT4 positions with ticket numbers
- **Updated [Trade.ts](src/models/Trade.ts)** - Added `mt4Ticket` and `closeReason` fields

### 2. Scalping Services

#### **[scalpingPatternService.ts](src/services/scalpingPatternService.ts)**
- Detects short-term BTC patterns (1m, 3m, 5m timeframes)
- Indicators: RSI(7), EMA(9,21), Bollinger Bands, Volume analysis
- Pattern types: Breakouts, Reversals, Volume spikes, Support/Resistance breaks
- Returns signals with confidence scores (0-100)

#### **[marketDropDetector.ts](src/services/marketDropDetector.ts)**
- Monitors BTCUSD price changes in real-time
- Detects moderate drops (>2% in 3min) and severe drops (>5% in 5min)
- Calculates price velocity ($/second)
- Emits alerts for emergency position closing
- Stores drop history in Redis

#### **[mt4TradeManager.ts](src/services/mt4TradeManager.ts)**
- Tracks all open MT4 positions (every 10 seconds)
- Auto-closes LONG positions when SELL signal detected (confidence >60%)
- Emergency close ALL positions on severe market drops
- Syncs positions to Trade model with profit tracking
- Handles manual closes and MT4 SL/TP closes

#### **[scalpingSignalIntegrator.ts](src/services/scalpingSignalIntegrator.ts)**
- Combines pattern detection + market drop analysis
- Generates enhanced signals for MT4 scalping agents
- Provides quick signal checks for high-frequency trading
- Market safety checks before trade execution

### 3. Updated Services

#### **[brokerFilterService.ts](src/services/brokerFilterService.ts)**
- Added BTC-only filtering for MT4 scalping agents
- `filterBTCOnlyForMT4()` - Filters signals to BTC variants only
- `isBTCSymbol()` - Validates BTC symbol variants (BTCUSD, BTCUSDT, BTCUSDm, etc.)

#### **[validatedSignalExecutor.ts](src/services/validatedSignalExecutor.ts)**
- Integrated MT4 position tracking
- After order execution → Registers position with `mt4TradeManager`
- Tracks ticket number for auto-close monitoring

#### **[agentController.ts](src/controllers/agentController.ts)**
- Accepts `broker` parameter in create agent endpoint
- Validates MT4 + SCALPING combination
- Returns message: "MT4 scalping agent will trade BTC only (BTCUSDm format)"

### 4. Server Initialization

#### **[index.ts](src/index.ts)**
```typescript
// NEW services initialized on startup:
await scalpingPatternService.initialize(); // BTC pattern detection
await marketDropDetector.start(); // Price drop monitoring
await mt4TradeManager.start(); // Position auto-close monitoring
```

## 🚀 How It Works

### Signal Flow

```
1. User creates MT4 SCALPING agent → BTC-only filter applied
                                     ↓
2. scalpingPatternService → Analyzes BTC (1m, 3m, 5m) → Generates pattern signal
                                     ↓
3. marketDropDetector → Checks market conditions → Blocks trading if dropping
                                     ↓
4. Signal validated & queued → validatedSignalExecutor processes
                                     ↓
5. MT4 order executed → Position saved to MT4Position collection
                                     ↓
6. mt4TradeManager monitors → Checks for SELL signals every 10s
                                     ↓
7. SELL signal detected → Auto-close position via mt4Service.closePosition()
                                     ↓
8. Position updated → Profit/loss saved to Trade model
```

### Auto-Close Conditions

**Position will auto-close when:**
1. ✅ **SELL Signal** - Scalping pattern confidence ≥60% with SELL direction
2. ✅ **Severe Market Drop** - >5% drop detected in 5 minutes
3. ✅ **Stop Loss Hit** - MT4 automatically closes (detected via polling)
4. ✅ **Take Profit Hit** - MT4 automatically closes (detected via polling)

### Pattern Detection

**Analyzed indicators:**
- RSI(7) - Oversold <30 (BUY), Overbought >70 (SELL)
- EMA Crossover - 9/21 periods
- Bollinger Bands - 20-period, 2 std dev
- Volume Spike - >150% of 20-period average
- Price Momentum - 1m, 3m, 5m changes

**Pattern Types:**
- `BREAKOUT` - Price breaks Bollinger Bands or resistance/support
- `REVERSAL` - RSI extreme + opposite momentum
- `VOLUME_SPIKE` - Unusual volume with price movement
- `MOMENTUM` - Strong directional movement
- `SUPPORT_BREAK` / `RESISTANCE_BREAK` - Key level violations

## 📊 Database Schema

### MT4Position Collection
```javascript
{
  userId: ObjectId,
  agentId: ObjectId,
  ticket: 12345, // MT4 ticket number (unique)
  symbol: "BTCUSDm",
  side: "buy",
  lotSize: 0.01,
  entryPrice: 43500.50,
  currentPrice: 43650.75,
  stopLoss: 43300.00,
  takeProfit: 44000.00,
  status: "open", // open | closed | auto-closed
  profit: 150.25,
  openedAt: ISODate("2025-01-16T10:00:00Z"),
  closedAt: ISODate("2025-01-16T10:15:00Z"),
  closeReason: "sell-signal" // manual | sell-signal | market-drop | stop-loss | take-profit
}
```

### Trade Model Updates
```javascript
{
  // ... existing fields ...
  mt4Ticket: 12345,
  closeReason: "sell-signal",
  // ... other fields ...
}
```

## 🔧 API Usage

### Create MT4 Scalping Agent
```bash
POST /api/agents
{
  "name": "BTC Scalper 1",
  "broker": "MT4",
  "category": "SCALPING",
  "riskLevel": 3,
  "budget": 100,
  "description": "Aggressive BTC scalping"
}

Response:
{
  "success": true,
  "message": "Intelligent agent created with 3 max positions and 65% min confidence. MT4 scalping agent will trade BTC only (BTCUSDm format)."
}
```

### Get MT4 Position Stats
```javascript
import { mt4TradeManager } from './services/mt4TradeManager';

const stats = await mt4TradeManager.getPositionStats(userId);
// Returns: { totalPositions, openPositions, closedPositions,
//            autoClosedPositions, totalProfit, winRate, ... }
```

### Get Market Condition
```javascript
import { marketDropDetector } from './services/marketDropDetector';

const condition = await marketDropDetector.getMarketCondition('BTCUSDT');
// Returns: { currentPrice, priceChange1m, priceChange3m,
//            velocity, dropLevel: 'none'|'moderate'|'severe', ... }
```

### Get Scalping Pattern
```javascript
import { scalpingPatternService } from './services/scalpingPatternService';

const pattern = await scalpingPatternService.detectPatterns('BTCUSDT');
// Returns: { type, confidence, direction, reasoning, indicators, ... }
```

## 🧪 Testing

### Test MT4 Connection & Trading
```bash
# Test full MT4 trading flow (uses BTCUSDm symbol)
npm run test:mt4:trading

# Or manually test MT4 bridge
cd scripts
./test-mt4-trading-simple.sh
```

### Manual Testing Steps

1. **Start Server**
   ```bash
   npm run dev
   ```

2. **Create MT4 Scalping Agent** (via dashboard or API)

3. **Activate Agent** → System will:
   - Start monitoring BTC patterns
   - Detect signals from real-time Binance data
   - Execute trades on MT4 (BTCUSDm)
   - Track positions automatically

4. **Monitor Position**
   - Check `MT4Position` collection in MongoDB
   - Watch console logs for auto-close events
   - View drop alerts in real-time

5. **Verify Auto-Close**
   - Wait for SELL signal or trigger market drop
   - Position should auto-close within 10 seconds
   - Check Trade model for profit/loss

## 📈 Performance Tuning

### Adjust Detection Sensitivity

**Pattern Confidence Threshold** (in mt4TradeManager.ts:100)
```typescript
if (pattern && pattern.direction === 'SELL' && pattern.confidence >= 60)
```
- Lower value (e.g., 50) = More signals, more trades
- Higher value (e.g., 70) = Fewer signals, higher quality

**Drop Detection Thresholds** (in marketDropDetector.ts:8-9)
```typescript
private readonly MODERATE_DROP_THRESHOLD = -2; // 2% drop
private readonly SEVERE_DROP_THRESHOLD = -5; // 5% drop
```
- Adjust based on BTC volatility

**Monitoring Frequency** (in mt4TradeManager.ts:7)
```typescript
private readonly MONITORING_INTERVAL = 10000; // 10 seconds
```
- Lower = Faster response, more CPU
- Higher = Slower response, less CPU

## ⚠️ Important Notes

1. **BTC Only** - MT4 scalping agents ONLY trade BTC (BTCUSDm format)
2. **LONG Positions Only** - Auto-close currently only handles LONG (buy) positions
3. **Binance Data** - Uses BTCUSDT from Binance for pattern detection (mapped to BTCUSDm for MT4)
4. **Position Tracking** - Positions tracked in both MT4Position and Trade collections
5. **Real-time Monitoring** - Checks positions every 10 seconds
6. **Market Drop Protection** - Severe drops (>5%) trigger emergency close ALL

## 🐛 Troubleshooting

### Pattern Service Not Detecting
- Check Binance WebSocket connection
- Verify BTCUSDT ticker data is streaming
- Check Redis connection (patterns cached)

### Positions Not Auto-Closing
- Verify mt4TradeManager is running (check startup logs)
- Check if SELL signals are being generated
- Ensure confidence threshold is appropriate
- Verify MT4 bridge connection

### Market Drop Detector Not Working
- Check Binance ticker data availability
- Verify Redis connection for price history
- Check detector is started in index.ts

## 📚 Related Files

- MT4 Bridge: [mt4-bridge/server.js](mt4-bridge/server.js)
- MT4 Service: [src/services/mt4Service.ts](src/services/mt4Service.ts)
- Symbol Mapping: [src/services/symbolMappingService.ts](src/services/symbolMappingService.ts)
- Binance Service: [src/services/binanceService.ts](src/services/binanceService.ts)

## 🎯 Next Steps

1. Add SHORT position auto-close (sell positions closed on BUY signals)
2. Implement trailing stop-loss based on pattern changes
3. Add multi-coin support for MT4 (currently BTC only)
4. Dashboard UI for viewing open MT4 positions
5. Real-time WebSocket updates for position changes
6. Historical pattern analysis and backtesting

---

**Implementation Date:** January 16, 2025
**Status:** ✅ Complete and Operational
**Version:** 1.0.0
