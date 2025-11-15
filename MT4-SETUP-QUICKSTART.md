# MT4 Bridge Quick Start Guide

Fast setup guide for MetaTrader 4 integration on Linux/Mac.

## What You're Installing

A complete MT4 trading bridge that allows your scalping agents to execute forex/CFD trades automatically.

**Components:**
- MT4 Terminal (in Docker)
- ZeroMQ Bridge (MQL4 Expert Advisor)
- REST API Server (Node.js)

**Time Required:** 30-45 minutes

---

## Prerequisites Checklist

- [ ] Docker and Docker Compose installed
- [ ] Linux or macOS (Windows requires different setup)
- [ ] MT4 broker account (demo or live)
- [ ] 4GB+ RAM available
- [ ] Ports 5900, 8080, 5555 available

---

## Installation (5 Steps)

### Step 1: Configure Environment (2 min)

```bash
# Update main .env file
nano .env
```

Add these lines (if not present):

```bash
MT4_BRIDGE_URL=http://localhost:8080
MT4_BRIDGE_USERNAME=admin
MT4_BRIDGE_PASSWORD=changeme123  # CHANGE THIS!
```

```bash
# Create bridge .env
cd mt4-bridge
cp .env.example .env
nano .env
```

Update credentials:

```bash
BRIDGE_AUTH_USERNAME=admin
BRIDGE_AUTH_PASSWORD=changeme123  # Must match main .env
```

### Step 2: Install Dependencies (3 min)

```bash
# Install bridge dependencies
cd mt4-bridge
npm install

# Download ZMQ library for MT4
mkdir -p include libraries
cd libraries
git clone https://github.com/dingmaotu/mql-zmq.git
cp -r mql-zmq/Include/Zmq ../include/
cd ../..
```

### Step 3: Start Services (2 min)

```bash
# From project root
docker-compose -f docker-compose.mt4.yml up -d

# Check status
docker ps | grep mt4
```

You should see:
- `mt4-terminal` - Running MT4 in Wine
- `mt4-bridge-server` - REST API server

### Step 4: Configure MT4 (10-15 min)

**Connect to MT4 via VNC:**

```bash
# macOS
open vnc://localhost:5900

# Linux (install vncviewer first)
vncviewer localhost:5900
```

**Password:** `mt4bridge2024`

**Inside MT4:**

1. **Login to Broker:**
   - File → Login to Trade Account
   - Enter account number, password, broker server
   - Click "Login"

2. **Enable Auto Trading:**
   - Tools → Options → Expert Advisors
   - ✅ Allow automated trading
   - ✅ Allow DLL imports
   - ✅ Allow imports of external experts
   - Click OK

3. **Attach Expert Advisor:**
   - Open any chart (EURUSD recommended)
   - Navigator → Expert Advisors → MT4Bridge
   - Drag onto chart
   - ✅ Allow live trading
   - ✅ Allow DLL imports
   - Click OK

4. **Verify:**
   - Look for smiley face icon (top-right)
   - Check Experts tab for: "MT4Bridge EA initialized successfully"

### Step 5: Test Connection (2 min)

```bash
# From project root
npm run test:mt4

# or
npx ts-node scripts/test-mt4-connection.ts
```

**Expected Result:**

```
============================================================
MT4 BRIDGE CONNECTION TEST
============================================================

✅ 1. Ping (Health Check): Success
✅ 2. Authentication Test (Invalid): Success
✅ 3. Get Account Info: Success
✅ 4. Get Available Symbols: Success
✅ 5. Get Price (EURUSD): Success
✅ 6. Get Open Positions: Success

Total: 6 | Passed: 6 | Failed: 0

🎉 All tests passed! MT4 bridge is working correctly.
```

---

## Verify Integration

### Check Your App Can Connect

```bash
# Test via your application's MT4 service
npm run dev

# In another terminal, test an endpoint
curl -X POST http://localhost:3001/api/mt4/test-connection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Create a Test Agent

1. Login to your application
2. Create new Scalping Agent
3. Select **MT4** as broker
4. Configure MT4 credentials via `/api/mt4/configure`
5. Activate agent
6. Agent will now execute signals on MT4 automatically

---

## Troubleshooting

### Problem: "Connection refused" error

**Solution:**
```bash
# Check if services are running
docker ps

# Restart services
docker-compose -f docker-compose.mt4.yml restart

# Check logs
docker logs mt4-bridge-server
```

### Problem: "Cannot connect to VNC"

**Solution:**
```bash
# Check VNC port is exposed
docker port mt4-terminal 5900

# If not using Docker, try direct connection
vncviewer localhost:5900
```

### Problem: "EA not responding"

**Solution:**
1. Connect via VNC
2. Check if smiley face is visible (top-right)
3. If red face with X, click "Auto Trading" button
4. Check Experts tab for errors
5. Remove EA and re-attach if needed

### Problem: "Order execution failed"

**Solution:**
1. Check account has sufficient balance
2. Verify lot size (usually min 0.01)
3. Check symbol is available at your broker
4. Ensure market is open (Forex: Mon-Fri)

---

## Common Commands

```bash
# Start bridge
docker-compose -f docker-compose.mt4.yml up -d

# Stop bridge
docker-compose -f docker-compose.mt4.yml down

# View logs
docker logs -f mt4-bridge-server

# Restart services
docker-compose -f docker-compose.mt4.yml restart

# Test connection
npm run test:mt4

# Connect to VNC
open vnc://localhost:5900  # macOS
vncviewer localhost:5900    # Linux
```

---

## Next Steps

1. **Configure User MT4 Credentials**
   ```bash
   POST /api/mt4/configure
   {
     "mt4AccountNumber": "12345678",
     "mt4Password": "your_password",
     "mt4ServerUrl": "http://localhost:8080",
     "mt4BrokerName": "YourBroker-Demo"
   }
   ```

2. **Create MT4 Scalping Agent**
   - Set broker = "MT4"
   - Set budget in USDT
   - Enable auto-trading

3. **Monitor Performance**
   - Check WebSocket for real-time updates
   - View agent logs in database
   - Monitor open positions

---

## Production Checklist

Before going live with real money:

- [ ] Change default passwords
- [ ] Test on demo account first (minimum 1 week)
- [ ] Set up monitoring and alerts
- [ ] Configure proper risk management
- [ ] Back up MT4 configuration
- [ ] Document broker-specific settings
- [ ] Test failover scenarios
- [ ] Review agent performance metrics

---

## Need Help?

- **Full Documentation:** See `mt4-bridge/README.md`
- **Code Reference:** See `src/services/mt4Service.ts`
- **API Docs:** Check controller at `src/controllers/mt4Controller.ts`
- **Issues:** Report bugs in repository

---

## Architecture Overview

```
┌─────────────────┐
│  Your App       │
│  (REST API)     │
└────────┬────────┘
         │ HTTP
         ↓
┌─────────────────┐
│  Node.js Bridge │
│  (port 8080)    │
└────────┬────────┘
         │ ZeroMQ
         ↓
┌─────────────────┐
│  MT4 EA         │
│  (ZMQ Server)   │
└────────┬────────┘
         │ MQL4
         ↓
┌─────────────────┐
│  MT4 Terminal   │
│  (Wine+Docker)  │
└─────────────────┘
```

**Latency:** 5-50ms typical, 100-500ms order execution

**Supported:** Market orders, Stop Loss, Take Profit, Position management

**Not Supported:** Pending orders (limit/stop), Partial closes, Custom indicators

---

Happy Trading! 🚀
