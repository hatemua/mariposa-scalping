# MT4 REST API - Complete Guide 🚀

## ✅ Installation Status

**Everything is installed and ready!**

```
✅ Docker containers running
✅ MT4 Bridge Server: http://localhost:8080
✅ ZMQ connected to MT4 Terminal
✅ VNC accessible on port 5900
✅ Bridge authentication configured
```

---

## 🔧 Configuration

**Bridge URL:** `http://localhost:8080`
**Authentication:** Basic Auth
- Username: `admin` (from env: `MT4_BRIDGE_USERNAME`)
- Password: `changeme123` (from env: `MT4_BRIDGE_PASSWORD`)

---

## 📡 REST API Endpoints

### 1. Health Check (No Auth Required)

**Endpoint:** `GET /api/v1/ping`

**Request:**
```bash
curl http://localhost:8080/api/v1/ping
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1763074060215,
  "zmq_connected": true
}
```

---

### 2. Get Account Information

**Endpoint:** `GET /api/v1/account/info`

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/account/info \
  -H "Authorization: Basic YWRtaW46Y2hhbmdlbWUxMjM=" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "account": {
    "number": 12345678,
    "broker": "Demo Broker",
    "currency": "USD",
    "balance": 10000.00,
    "equity": 10000.00,
    "margin": 0.00,
    "freeMargin": 10000.00,
    "marginLevel": 0.00,
    "profit": 0.00
  }
}
```

---

### 3. Get Available Symbols

**Endpoint:** `GET /api/v1/symbols`

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/symbols \
  -u admin:changeme123
```

**Response:**
```json
{
  "success": true,
  "symbols": [
    {
      "symbol": "EURUSD",
      "description": "Euro vs US Dollar",
      "digits": 5,
      "point": 0.00001,
      "spread": 1.5,
      "bid": 1.08234,
      "ask": 1.08249
    },
    {
      "symbol": "GBPUSD",
      "description": "British Pound vs US Dollar",
      "digits": 5,
      "point": 0.00001,
      "spread": 2.0,
      "bid": 1.26543,
      "ask": 1.26563
    }
  ]
}
```

---

### 4. Get Symbol Price

**Endpoint:** `GET /api/v1/price/:symbol`

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/price/EURUSD \
  -u admin:changeme123
```

**Response:**
```json
{
  "success": true,
  "symbol": "EURUSD",
  "bid": 1.08234,
  "ask": 1.08249,
  "spread": 1.5,
  "timestamp": 1763074060215
}
```

---

### 5. **🎯 EXECUTE MARKET ORDER (MAIN SIGNAL ENDPOINT)**

**Endpoint:** `POST /api/v1/orders`

This is what you'll use to send trading signals!

#### **BUY Signal Example:**

```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": 0.1,
    "stopLoss": 1.0800,
    "takeProfit": 1.0850,
    "comment": "AI Signal #123"
  }'
```

#### **SELL Signal Example:**

```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "SELL",
    "volume": 0.05,
    "stopLoss": 1.0850,
    "takeProfit": 1.0800,
    "comment": "AI Signal #124"
  }'
```

#### **Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symbol` | string | ✅ Yes | Trading symbol (e.g., "EURUSD", "GBPUSD") |
| `side` | string | ✅ Yes | "BUY" or "SELL" |
| `volume` | number | ✅ Yes | Lot size (min 0.01, typically 0.01-10.0) |
| `stopLoss` | number | ❌ No | Stop loss price level |
| `takeProfit` | number | ❌ No | Take profit price level |
| `comment` | string | ❌ No | Order comment/identifier |

#### **Response:**

```json
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "symbol": "EURUSD",
    "type": "BUY",
    "volume": 0.1,
    "openPrice": 1.08245,
    "stopLoss": 1.0800,
    "takeProfit": 1.0850,
    "profit": 0.00,
    "swap": 0.00,
    "commission": -0.50,
    "openTime": "2025-11-13T12:00:00Z",
    "status": "open"
  },
  "latency_ms": 45
}
```

---

### 6. Get Open Positions

**Endpoint:** `GET /api/v1/orders/open`

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/orders/open \
  -u admin:changeme123
```

**Optional:** Filter by symbol:
```bash
curl -X GET "http://localhost:8080/api/v1/orders/open?symbol=EURUSD" \
  -u admin:changeme123
```

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "ticket": 123456789,
      "symbol": "EURUSD",
      "type": "BUY",
      "volume": 0.1,
      "openPrice": 1.08245,
      "currentPrice": 1.08267,
      "stopLoss": 1.0800,
      "takeProfit": 1.0850,
      "profit": 2.20,
      "swap": 0.00,
      "commission": -0.50,
      "openTime": "2025-11-13T12:00:00Z"
    }
  ]
}
```

---

### 7. Get Order by Ticket

**Endpoint:** `GET /api/v1/orders/:ticket`

**Request:**
```bash
curl -X GET http://localhost:8080/api/v1/orders/123456789 \
  -u admin:changeme123
```

**Response:**
```json
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "symbol": "EURUSD",
    "type": "BUY",
    "volume": 0.1,
    "openPrice": 1.08245,
    "currentPrice": 1.08267,
    "profit": 2.20,
    "status": "open"
  }
}
```

---

### 8. Close Position by Ticket

**Endpoint:** `POST /api/v1/orders/close`

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/orders/close \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "ticket": 123456789
  }'
```

**Response:**
```json
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "symbol": "EURUSD",
    "type": "BUY",
    "volume": 0.1,
    "openPrice": 1.08245,
    "closePrice": 1.08267,
    "profit": 2.20,
    "closeTime": "2025-11-13T12:15:00Z",
    "status": "closed"
  }
}
```

---

### 9. Close All Positions

**Endpoint:** `POST /api/v1/orders/close-all`

**Close All:**
```bash
curl -X POST http://localhost:8080/api/v1/orders/close-all \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Close All for Specific Symbol:**
```bash
curl -X POST http://localhost:8080/api/v1/orders/close-all \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD"
  }'
```

**Response:**
```json
{
  "success": true,
  "closed": 3,
  "failed": 0,
  "totalProfit": 12.50
}
```

---

### 10. Modify Order (Update SL/TP)

**Endpoint:** `PUT /api/v1/orders/:ticket`

**Request:**
```bash
curl -X PUT http://localhost:8080/api/v1/orders/123456789 \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "stopLoss": 1.0805,
    "takeProfit": 1.0855
  }'
```

**Response:**
```json
{
  "success": true,
  "order": {
    "ticket": 123456789,
    "stopLoss": 1.0805,
    "takeProfit": 1.0855,
    "modified": true
  }
}
```

---

## 🤖 Integration with Your AI Trading System

### Example: Python Script

```python
import requests
import json

# Configuration
BRIDGE_URL = "http://localhost:8080"
AUTH = ("admin", "changeme123")

def send_trading_signal(symbol, side, volume, sl=None, tp=None):
    """
    Send trading signal to MT4

    Args:
        symbol: Trading pair (e.g., "EURUSD")
        side: "BUY" or "SELL"
        volume: Lot size (e.g., 0.01, 0.1, 1.0)
        sl: Stop loss price (optional)
        tp: Take profit price (optional)
    """
    url = f"{BRIDGE_URL}/api/v1/orders"

    payload = {
        "symbol": symbol,
        "side": side.upper(),
        "volume": volume
    }

    if sl:
        payload["stopLoss"] = sl
    if tp:
        payload["takeProfit"] = tp

    response = requests.post(
        url,
        auth=AUTH,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=30
    )

    if response.status_code == 200:
        result = response.json()
        if result.get("success"):
            print(f"✅ Order executed: Ticket #{result['order']['ticket']}")
            return result["order"]
        else:
            print(f"❌ Order failed: {result.get('error')}")
    else:
        print(f"❌ HTTP Error: {response.status_code}")

    return None

# Example usage
if __name__ == "__main__":
    # AI generates signal
    signal = {
        "symbol": "EURUSD",
        "action": "BUY",
        "entry": 1.0825,
        "stop_loss": 1.0800,
        "take_profit": 1.0850
    }

    # Calculate lot size (e.g., based on risk)
    lot_size = 0.1

    # Execute on MT4
    order = send_trading_signal(
        symbol=signal["symbol"],
        side=signal["action"],
        volume=lot_size,
        sl=signal["stop_loss"],
        tp=signal["take_profit"]
    )

    if order:
        print(f"Order opened at {order['openPrice']}")
```

---

### Example: Node.js/JavaScript

```javascript
const axios = require('axios');

const BRIDGE_URL = 'http://localhost:8080';
const AUTH = {
  username: 'admin',
  password: 'changeme123'
};

async function sendTradingSignal(symbol, side, volume, stopLoss, takeProfit) {
  try {
    const response = await axios.post(
      `${BRIDGE_URL}/api/v1/orders`,
      {
        symbol,
        side: side.toUpperCase(),
        volume,
        stopLoss,
        takeProfit,
        comment: `AI Signal ${Date.now()}`
      },
      {
        auth: AUTH,
        timeout: 30000
      }
    );

    if (response.data.success) {
      console.log(`✅ Order executed: Ticket #${response.data.order.ticket}`);
      return response.data.order;
    } else {
      console.log(`❌ Order failed: ${response.data.error}`);
      return null;
    }
  } catch (error) {
    console.error('❌ API Error:', error.message);
    return null;
  }
}

// Example: AI generates signal
const signal = {
  symbol: 'EURUSD',
  action: 'BUY',
  entry: 1.0825,
  stopLoss: 1.0800,
  takeProfit: 1.0850
};

// Execute
sendTradingSignal(
  signal.symbol,
  signal.action,
  0.1, // lot size
  signal.stopLoss,
  signal.takeProfit
);
```

---

## 📋 Complete Trading Flow

### 1. **Check Connection**
```bash
curl http://localhost:8080/api/v1/ping
```

### 2. **Get Account Balance**
```bash
curl -u admin:changeme123 http://localhost:8080/api/v1/account/info
```

### 3. **Get Current Price**
```bash
curl -u admin:changeme123 http://localhost:8080/api/v1/price/EURUSD
```

### 4. **Execute BUY Signal**
```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": 0.1,
    "stopLoss": 1.0800,
    "takeProfit": 1.0850
  }'
```

### 5. **Monitor Open Positions**
```bash
curl -u admin:changeme123 http://localhost:8080/api/v1/orders/open
```

### 6. **Close Position When Target Hit**
```bash
curl -X POST http://localhost:8080/api/v1/orders/close \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{"ticket": 123456789}'
```

---

## ⚙️ Volume/Lot Size Calculation

MT4 uses **lots**, not dollar amounts:

| Volume | Forex (Standard) | Description |
|--------|------------------|-------------|
| 0.01 | 1,000 units | Micro lot (minimum for most brokers) |
| 0.1 | 10,000 units | Mini lot |
| 1.0 | 100,000 units | Standard lot |

**Example calculation:**
- Account: $10,000
- Risk: 2% = $200
- Entry: EURUSD @ 1.0825
- Stop Loss: 1.0800 (25 pips)
- Pip value (0.1 lot): $1 per pip
- Volume: $200 / (25 pips × $1) = 0.08 lots → **Use 0.08**

---

## 🔐 Authentication

The bridge uses **HTTP Basic Authentication**.

**Create Auth Header:**

```bash
# Username: admin
# Password: changeme123
# Base64: YWRtaW46Y2hhbmdlbWUxMjM=

echo -n "admin:changeme123" | base64
# Output: YWRtaW46Y2hhbmdlbWUxMjM=
```

**Use in requests:**
```bash
# Method 1: -u flag
curl -u admin:changeme123 http://localhost:8080/api/v1/account/info

# Method 2: Authorization header
curl -H "Authorization: Basic YWRtaW46Y2hhbmdlbWUxMjM=" \
  http://localhost:8080/api/v1/account/info
```

---

## 🚨 Error Handling

**Common Errors:**

| Status | Error | Cause | Solution |
|--------|-------|-------|----------|
| 401 | Unauthorized | Wrong credentials | Check username/password |
| 400 | Missing required fields | Invalid request body | Verify JSON payload |
| 500 | MT4 request failed | EA not responding | Check EA is attached and running |
| 500 | Request timeout | MT4 not responding | Restart MT4 or check network |

**Error Response Format:**
```json
{
  "error": "Symbol INVALID not found",
  "success": false
}
```

---

## ✅ Pre-Flight Checklist

Before sending trading signals, verify:

- [ ] Docker containers running: `docker ps | grep mt4`
- [ ] Bridge responding: `curl http://localhost:8080/api/v1/ping`
- [ ] ZMQ connected: Check ping response `zmq_connected: true`
- [ ] MT4 logged in (via VNC)
- [ ] MT4Bridge EA attached to a chart
- [ ] Green smiley face visible on chart
- [ ] Auto trading enabled (green button in MT4 toolbar)

---

## 🎯 Quick Test

**Test complete flow:**

```bash
# 1. Health check
curl http://localhost:8080/api/v1/ping

# 2. Get account
curl -u admin:changeme123 http://localhost:8080/api/v1/account/info

# 3. Execute test order (0.01 lot = $10 risk)
curl -X POST http://localhost:8080/api/v1/orders \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "side": "BUY",
    "volume": 0.01,
    "comment": "Test order"
  }'

# 4. Check if order opened
curl -u admin:changeme123 http://localhost:8080/api/v1/orders/open

# 5. Close the test order (replace TICKET with actual ticket number)
curl -X POST http://localhost:8080/api/v1/orders/close \
  -u admin:changeme123 \
  -H "Content-Type: application/json" \
  -d '{"ticket": TICKET}'
```

---

## 📝 Notes

1. **Volume must be ≥ 0.01** (most brokers)
2. **Symbols are case-sensitive** (use "EURUSD", not "eurusd")
3. **Side must be uppercase** ("BUY" or "SELL")
4. **Stop Loss / Take Profit are price levels**, not pip distances
5. **Bridge runs on localhost only** (port 8080 not exposed externally for security)
6. **ZMQ port 5555** is for internal Docker communication only

---

## 🆘 Troubleshooting

**Issue: "zmq_connected: false"**
- Solution: Check MT4Bridge EA is attached and running

**Issue: "Request timeout"**
- Solution: Restart MT4 terminal or MT4Bridge EA

**Issue: "Invalid credentials"**
- Solution: Check `.env` file for `MT4_BRIDGE_USERNAME` and `MT4_BRIDGE_PASSWORD`

**Issue: "Symbol not found"**
- Solution: Get available symbols with `/api/v1/symbols` endpoint

---

## 🔗 Resources

- Bridge Server: `http://localhost:8080`
- VNC Access: `vnc://localhost:5900` (password: `mt4bridge2024`)
- Logs: `docker logs mt4-bridge-server`
- Test Script: `npm run test:mt4`

---

**Ready to trade! 🚀**

Your AI can now send trading signals directly to MT4 via JSON REST API.
