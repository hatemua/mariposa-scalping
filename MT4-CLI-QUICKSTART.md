# MT4 Trading - Pure CLI Workflow

This guide shows how to use MT4 trading via **command line only** (no manual GUI interaction after initial setup).

## Prerequisites

- Docker containers running: `docker ps | grep mt4`
- MT4 logged in to demo account
- **One-time setup**: MT4Bridge EA attached (see Quick Setup below)

---

## Quick Setup (One-Time, 30 Seconds)

The MT4Bridge EA needs to be attached to a chart **once**. After that, it auto-starts on container restart.

### Option 1: Automated Check + Quick VNC Attach

```bash
# 1. Run automated setup check
npm run mt4:setup

# 2. If EA not running, attach via VNC (one-time):
#    a. Connect: open vnc://localhost:5900
#       Password: mt4bridge2024
#    b. In MT4: Press Ctrl+N (Navigator)
#    c. Drag "MT4Bridge" from Expert Advisors onto any chart
#    d. Enable: ✓ Allow live trading, ✓ Allow DLL imports
#    e. Click OK
#    f. Look for green smiley face 😊 on chart

# 3. Verify EA is running
npm run mt4:status
```

Expected output after successful setup:
```
tcp        0      0 0.0.0.0:5555            0.0.0.0:*               LISTEN
EA is running
```

---

## CLI Commands Reference

### Check EA Status

```bash
npm run mt4:status
```

**Good output:**
```
tcp        0      0 0.0.0.0:5555            0.0.0.0:*               LISTEN
EA is running
```

**Bad output (EA not attached):**
```
EA not running - attach via VNC
```

### Test MT4 Connection (Read-Only)

```bash
npm run test:mt4
```

Tests:
- Bridge health check
- Authentication
- Account info
- Symbols list
- Price data
- Open positions

### Test Full Trading Flow (Executes Real Trade!)

```bash
npm run test:mt4:trading
```

**WARNING:** This executes a REAL trade on your account (0.01 lots). Only use with DEMO accounts.

Flow:
1. Health check
2. Get account info
3. Get price for EURUSD
4. **Execute BUY order (0.01 lots)**
5. Verify position opened
6. **Close position**
7. Verify position closed

Custom symbol/volume:
```bash
./scripts/test-mt4-trading-simple.sh GBPUSD 0.02
```

---

## REST API Usage (Pure CLI)

Once EA is running, all trading is via REST API at `http://localhost:8080`

### Authentication

All endpoints (except `/ping`) require Basic Auth:
- Username: `admin` (or value in `.env`: `MT4_BRIDGE_USERNAME`)
- Password: `changeme123` (or value in `.env`: `MT4_BRIDGE_PASSWORD`)

```bash
# Set credentials
export MT4_USER="admin"
export MT4_PASS="changeme123"
```

### Health Check

```bash
curl http://localhost:8080/api/v1/ping | jq
```

Response:
```json
{
  "status": "ok",
  "timestamp": 1731502800000,
  "zmq_connected": true
}
```

### Get Account Info

```bash
curl -u $MT4_USER:$MT4_PASS http://localhost:8080/api/v1/account/info | jq
```

Response:
```json
{
  "account": {
    "number": 12345678,
    "name": "Demo Account",
    "balance": 10000.00,
    "equity": 10000.00,
    "margin": 0.00,
    "freeMargin": 10000.00,
    "marginLevel": 0.00,
    "profit": 0.00,
    "currency": "USD",
    "leverage": 100
  }
}
```

### Get Available Symbols

```bash
curl -u $MT4_USER:$MT4_PASS http://localhost:8080/api/v1/symbols | jq
```

Response:
```json
{
  "symbols": [
    {"symbol": "EURUSD", "description": "Euro vs US Dollar"},
    {"symbol": "GBPUSD", "description": "British Pound vs US Dollar"},
    ...
  ]
}
```

### Get Current Price

```bash
curl -u $MT4_USER:$MT4_PASS http://localhost:8080/api/v1/price/EURUSD | jq
```

Response:
```json
{
  "symbol": "EURUSD",
  "bid": 1.08234,
  "ask": 1.08249,
  "spread": 1.5,
  "timestamp": 1731502800000
}
```

### Execute BUY Order

```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -u $MT4_USER:$MT4_PASS \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": 0.01,
    "stopLoss": 1.08000,
    "takeProfit": 1.08500,
    "comment": "AI Signal 1731502800"
  }' | jq
```

Response:
```json
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "symbol": "EURUSD",
    "type": "BUY",
    "volume": 0.01,
    "openPrice": 1.08245,
    "stopLoss": 1.08000,
    "takeProfit": 1.08500,
    "profit": 0.00,
    "swap": 0.00,
    "commission": -0.02,
    "openTime": "2025-11-13T10:00:00Z",
    "status": "open"
  },
  "latency_ms": 45
}
```

### Execute SELL Order

```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -u $MT4_USER:$MT4_PASS \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "SELL",
    "volume": 0.01,
    "comment": "AI Signal Short"
  }' | jq
```

### Get Open Positions

```bash
curl -u $MT4_USER:$MT4_PASS http://localhost:8080/api/v1/orders/open | jq
```

Response:
```json
{
  "orders": [
    {
      "ticket": 123456789,
      "symbol": "EURUSD",
      "type": "BUY",
      "volume": 0.01,
      "openPrice": 1.08245,
      "currentPrice": 1.08267,
      "stopLoss": 1.08000,
      "takeProfit": 1.08500,
      "profit": 0.22,
      "swap": 0.00,
      "commission": -0.02,
      "openTime": "2025-11-13T10:00:00Z"
    }
  ]
}
```

### Get Specific Order

```bash
curl -u $MT4_USER:$MT4_PASS http://localhost:8080/api/v1/orders/123456789 | jq
```

### Close Position

```bash
curl -X POST http://localhost:8080/api/v1/orders/close \
  -u $MT4_USER:$MT4_PASS \
  -H "Content-Type: application/json" \
  -d '{"ticket": 123456789}' | jq
```

Response:
```json
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "closePrice": 1.08267,
    "profit": 0.22,
    "closeTime": "2025-11-13T10:05:00Z"
  }
}
```

### Close All Positions

```bash
# Close all positions
curl -X POST http://localhost:8080/api/v1/orders/close-all \
  -u $MT4_USER:$MT4_PASS \
  -H "Content-Type: application/json" \
  -d '{}' | jq

# Close all EURUSD positions only
curl -X POST http://localhost:8080/api/v1/orders/close-all \
  -u $MT4_USER:$MT4_PASS \
  -H "Content-Type: application/json" \
  -d '{"symbol": "EURUSD"}' | jq
```

### Modify Position (Update SL/TP)

```bash
curl -X PUT http://localhost:8080/api/v1/orders/123456789 \
  -u $MT4_USER:$MT4_PASS \
  -H "Content-Type: application/json" \
  -d '{
    "stopLoss": 1.08100,
    "takeProfit": 1.08600
  }' | jq
```

---

## AI Agent Integration Example

### Node.js/TypeScript

```typescript
import axios from 'axios';

const MT4_API = 'http://localhost:8080';
const auth = {
  username: process.env.MT4_BRIDGE_USERNAME || 'admin',
  password: process.env.MT4_BRIDGE_PASSWORD || 'changeme123'
};

// AI generates signal
const signal = {
  symbol: 'EURUSD',
  action: 'BUY',
  confidence: 0.85,
  entry: 1.08250,
  stopLoss: 1.08200,
  takeProfit: 1.08300
};

// Execute via MT4 API
const response = await axios.post(
  `${MT4_API}/api/v1/orders`,
  {
    symbol: signal.symbol,
    side: signal.action,
    volume: 0.1, // Calculate based on risk
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    comment: `AI Signal ${Date.now()}`
  },
  { auth }
);

console.log(`Order executed: Ticket #${response.data.order.ticket}`);
```

### Python

```python
import requests
from requests.auth import HTTPBasicAuth

MT4_API = 'http://localhost:8080'
auth = HTTPBasicAuth('admin', 'changeme123')

# AI generates signal
signal = {
    'symbol': 'EURUSD',
    'action': 'BUY',
    'entry': 1.08250,
    'stop_loss': 1.08200,
    'take_profit': 1.08300
}

# Execute via MT4 API
response = requests.post(
    f'{MT4_API}/api/v1/orders',
    json={
        'symbol': signal['symbol'],
        'side': signal['action'],
        'volume': 0.1,
        'stopLoss': signal['stop_loss'],
        'takeProfit': signal['take_profit'],
        'comment': f"AI Signal {int(time.time())}"
    },
    auth=auth
)

order = response.json()
print(f"Order executed: Ticket #{order['order']['ticket']}")
```

---

## Troubleshooting

### EA not running (`npm run mt4:status` fails)

**Solution:** Attach EA via VNC (one-time setup):

```bash
# 1. Connect to VNC
open vnc://localhost:5900  # Password: mt4bridge2024

# 2. In MT4:
#    - Press Ctrl+N (Navigator)
#    - Drag "MT4Bridge" onto chart
#    - Enable "Allow live trading" + "Allow DLL imports"
#    - Click OK

# 3. Verify
npm run mt4:status
```

### "Request timeout" errors

**Cause:** MT4 not responding or EA crashed

**Solution:**
```bash
# Restart MT4 container
docker restart mt4-terminal

# Wait 30 seconds for startup
sleep 30

# Check EA status
npm run mt4:status

# If EA not running, re-attach via VNC
```

### "Invalid credentials"

**Cause:** Wrong username/password

**Solution:**
```bash
# Check credentials in .env
cat .env | grep MT4_BRIDGE

# Should show:
# MT4_BRIDGE_USERNAME=admin
# MT4_BRIDGE_PASSWORD=changeme123
```

### "Symbol not available"

**Cause:** Symbol not offered by your broker

**Solution:**
```bash
# Get list of available symbols
curl -u admin:changeme123 http://localhost:8080/api/v1/symbols | \
  jq '.symbols[].symbol' | head -20

# Use available symbol instead
```

---

## Daily Workflow

Once EA is attached (one-time), your daily workflow is 100% CLI:

```bash
# 1. Check containers running
docker ps | grep mt4

# 2. Check EA status
npm run mt4:status

# 3. Test connection (optional)
npm run test:mt4

# 4. Your AI agent sends trading signals via REST API
# No manual interaction needed!
```

---

## Restart After Reboot

If server reboots or containers restart:

```bash
# 1. Start containers
docker-compose -f docker-compose.mt4.yml up -d

# 2. Wait for startup
sleep 30

# 3. Check EA status
npm run mt4:status
```

**Good news:** EA should auto-start after attachment. If `mt4:status` shows "EA is running", you're ready!

If EA not running, re-attach via VNC (30 seconds).

---

## Security Notes

- Bridge API listens on `127.0.0.1:8080` (localhost only)
- Use strong password for production
- VNC exposed on `0.0.0.0:5900` for remote access
- Change VNC password in production: Edit `docker-compose.mt4.yml`

---

## Complete API Reference

See `MT4-REST-API-GUIDE.md` for:
- All endpoints
- Request/response schemas
- Error codes
- Rate limits
- Best practices

---

## Testing Guide

See `MT4-TESTING-GUIDE.md` for:
- Pre-flight checklist
- Test procedures
- Common issues
- P&L calculations
- Integration examples

---

**You're ready to trade via CLI!**

After one-time EA attachment, everything works via REST API. Your AI agents can send trading signals in JSON format and execute trades automatically.
