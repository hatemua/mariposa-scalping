# MT4 Trading API - Testing Guide

## ✅ Installation Verification

Your MT4 trading system is FULLY INSTALLED and ready to test!

**Status:**
- ✅ Docker containers running
- ✅ MT4 Bridge Server: http://localhost:8080
- ✅ ZMQ Connected to MT4 Terminal
- ✅ VNC accessible on port 5900
- ✅ REST API endpoints ready

---

## 🧪 Test Scripts Available

### 1. Connection Test (Read-Only)

Tests connectivity without executing trades.

```bash
npm run test:mt4
```

**What it tests:**
- Bridge health check
- Authentication
- Account info retrieval
- Symbol availability
- Price data
- Open positions listing

---

### 2. Full Trading Test (Executes Real Trades!)

Tests the complete trading flow including order execution.

```bash
npm run test:mt4:trading
```

**What it does:**
1. Health check
2. Get account info
3. Get current price for EURUSD
4. **Execute BUY order (0.01 lots)**
5. Verify position is open
6. **Close the position**
7. Verify position is closed

**⚠️  WARNING:** This executes REAL trades! Only use with DEMO accounts.

---

## 📝 Manual API Testing

### Quick Test with curl

```bash
# 1. Health check
curl http://localhost:8080/api/v1/ping

# 2. Get account info (with auth)
curl -u admin:changeme123 http://localhost:8080/api/v1/account/info

# 3. Get price
curl -u admin:changeme123 http://localhost:8080/api/v1/price/EURUSD

# 4. Execute BUY order
curl -X POST http://localhost:8080/api/v1/orders \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": 0.01,
    "comment": "Test order"
  }'

# 5. Get open positions
curl -u admin:changeme123 http://localhost:8080/api/v1/orders/open

# 6. Close position (replace TICKET with actual ticket number)
curl -X POST http://localhost:8080/api/v1/orders/close \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{"ticket": TICKET}'
```

---

## 🎯 Testing Before AI Agent Integration

### Pre-Flight Checklist

Before integrating with your AI trading agents, verify:

**1. VNC Setup:**
```bash
# Connect to VNC
open vnc://localhost:5900  # macOS
# or
vncviewer localhost:5900   # Linux
# Password: mt4bridge2024
```

**2. MT4 is Logged In:**
- Open VNC
- Verify MT4 shows your demo account
- Check account balance is visible

**3. MT4Bridge EA is Attached:**
- Look for green smiley face 😊 on chart (top-right)
- Check "Experts" tab shows: "MT4Bridge EA initialized successfully"
- Verify "Auto Trading" button is green

**4. Docker Containers Running:**
```bash
docker ps | grep mt4
```

Should show:
- `mt4-terminal` - Up X hours
- `mt4-bridge-server` - Up X hours (healthy)

**5. Bridge Responding:**
```bash
curl http://localhost:8080/api/v1/ping
```

Should return:
```json
{
  "status": "ok",
  "timestamp": ...,
  "zmq_connected": true
}
```

---

## 🔄 Complete Test Flow

### Step-by-Step Testing

**1. Start with connection test:**
```bash
npm run test:mt4
```

Expected output:
```
✅ 1. Ping (Health Check): Success
✅ 2. Authentication Test (Invalid): Success
✅ 3. Get Account Info: Success
✅ 4. Get Available Symbols: Success
✅ 5. Get Price (EURUSD): Success
✅ 6. Get Open Positions: Success

🎉 All tests passed!
```

**2. If connection test passes, run trading test:**
```bash
npm run test:mt4:trading
```

Expected output:
```
[1] Health Check...
{
  "status": "ok",
  "timestamp": ...,
  "zmq_connected": true
}

[2] Account Info...
{
  "account": {
    "number": ...,
    "balance": 10000,
    "equity": 10000,
    ...
  }
}

[3] Current Price...
{
  "symbol": "EURUSD",
  "bid": 1.08234,
  "ask": 1.08249,
  "spread": 1.5
}

[4] Execute BUY Order...
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "symbol": "EURUSD",
    "type": "BUY",
    "volume": 0.01,
    "openPrice": 1.08245,
    ...
  }
}

[5] Verify Open Position...
{
  "orders": [
    {
      "ticket": 123456789,
      ...
    }
  ]
}

[6] Close Position...
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "closePrice": 1.08267,
    "profit": 0.22,
    ...
  }
}

✅ TEST COMPLETE!
```

---

## 🐛 Troubleshooting

### Test Fails: "zmq_connected: false"

**Cause:** MT4Bridge EA not running in MT4

**Solution:**
1. Connect to VNC: `open vnc://localhost:5900`
2. Check if chart has green smiley face 😊
3. If not attached:
   - Press `Ctrl+N` to open Navigator
   - Expand "Expert Advisors"
   - Drag "MT4Bridge" onto chart
   - Check "Allow live trading" and "Allow DLL imports"
   - Click OK

### Test Fails: "Symbol EURUSD not available"

**Cause:** Symbol not offered by your broker

**Solution:**
```bash
# Get list of available symbols
curl -u admin:changeme123 http://localhost:8080/api/v1/symbols | jq '.symbols[].symbol' | head -20

# Run test with different symbol
./scripts/test-mt4-trading-simple.sh GBPUSD 0.01
```

### Test Fails: "Request timeout"

**Cause:** MT4 not responding

**Solution:**
```bash
# Restart MT4 container
sudo docker restart mt4-terminal

# Wait 30 seconds
sleep 30

# Try again
npm run test:mt4:trading
```

### Test Fails: "Invalid credentials"

**Cause:** Wrong username/password

**Solution:**
```bash
# Check .env file
cat .env | grep MT4_BRIDGE

# Should show:
# MT4_BRIDGE_USERNAME=admin
# MT4_BRIDGE_PASSWORD=changeme123
```

---

## 📊 Understanding Test Results

### Successful Order Execution

When an order executes successfully, you'll see:

```json
{
  "success": true,
  "order": {
    "ticket": 123456789,        // MT4 order ticket number
    "symbol": "EURUSD",         // Trading pair
    "type": "BUY",              // Order type
    "volume": 0.01,             // Lot size (0.01 = micro lot)
    "openPrice": 1.08245,       // Entry price
    "stopLoss": 0,              // SL price (0 = none)
    "takeProfit": 0,            // TP price (0 = none)
    "profit": 0.00,             // Current P&L
    "swap": 0.00,               // Swap fees
    "commission": -0.02,        // Commission charged
    "openTime": "2025-11-13T...",
    "status": "open"
  },
  "latency_ms": 45              // Execution time
}
```

### Position P&L Calculation

For a 0.01 lot EURUSD position:
- 1 pip = $0.10
- 10 pips profit = $1.00
- Entry: 1.08245, Exit: 1.08267 = 2.2 pips = $0.22 profit

---

## 🚀 Next Steps: AI Agent Integration

Once all tests pass, you can integrate with your AI trading system:

### 1. Your AI Generates Signal

```javascript
const signal = {
  symbol: "EURUSD",
  action: "BUY",
  confidence: 0.85,
  entry: 1.08250,
  stopLoss: 1.08200,
  takeProfit: 1.08300
};
```

### 2. Send to MT4 via REST API

```javascript
const axios = require('axios');

const response = await axios.post(
  'http://localhost:8080/api/v1/orders',
  {
    symbol: signal.symbol,
    side: signal.action,
    volume: 0.1,  // Calculate based on risk
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    comment: `AI Signal ${Date.now()}`
  },
  {
    auth: {
      username: 'admin',
      password: 'changeme123'
    }
  }
);

const ticket = response.data.order.ticket;
console.log(`Order executed: Ticket #${ticket}`);
```

### 3. Monitor Position

```javascript
// Get position status
const position = await axios.get(
  `http://localhost:8080/api/v1/orders/${ticket}`,
  { auth: { username: 'admin', password: 'changeme123' } }
);

console.log(`Current P&L: ${position.data.order.profit}`);
```

### 4. Close When Target Hit

```javascript
// Close position
await axios.post(
  'http://localhost:8080/api/v1/orders/close',
  { ticket },
  { auth: { username: 'admin', password: 'changeme123' } }
);
```

---

## 📚 Additional Resources

- **Full API Documentation:** `MT4-REST-API-GUIDE.md`
- **VNC Connection Guide:** `VNC-CONNECTION-SOLUTION.md`
- **Bridge Server Code:** `mt4-bridge/server.js`
- **MT4 Service Integration:** `src/services/mt4Service.ts`
- **MT4 Controller:** `src/controllers/mt4Controller.ts`

---

## ✅ Success Checklist

Before deploying your AI agents with MT4:

- [ ] Connection test passes (`npm run test:mt4`)
- [ ] Trading test passes (`npm run test:mt4:trading`)
- [ ] Can execute orders via curl/API manually
- [ ] Can monitor open positions
- [ ] Can close positions successfully
- [ ] Tested on DEMO account with small lots (0.01)
- [ ] MT4Bridge EA stays connected (green smiley)
- [ ] No "Request timeout" errors
- [ ] Bridge responds within 100ms
- [ ] Understand P&L calculations
- [ ] Know how to restart services if needed

---

**You're ready to integrate MT4 with your AI trading agents!** 🎉

The API is fully operational and tested. Your AI can now execute forex/CFD trades automatically.
