# MT4 Bridge Setup Guide

Complete installation guide for MetaTrader 4 bridge integration on Linux/Mac.

## Overview

The MT4 Bridge consists of three components:

1. **MT4 Terminal** - Running in Docker with Wine
2. **MQL4 Expert Advisor** - ZeroMQ server running inside MT4
3. **Node.js Bridge Server** - REST API that communicates with MT4 via ZeroMQ

```
[Your App] --HTTP--> [Node.js Bridge] --ZeroMQ--> [MT4 EA] --> [MT4 Terminal]
```

---

## Prerequisites

- Docker and Docker Compose installed
- Linux or macOS operating system
- At least 4GB RAM available
- Active MT4 broker account (demo or live)

---

## Installation Steps

### Step 1: Set Up Environment Variables

Create `.env` file in the `mt4-bridge` directory:

```bash
cd mt4-bridge
cp .env.example .env
```

Edit `.env` and update credentials:

```bash
BRIDGE_AUTH_USERNAME=your_username
BRIDGE_AUTH_PASSWORD=your_secure_password
```

Also update the main application `.env`:

```bash
MT4_BRIDGE_URL=http://localhost:8080
MT4_BRIDGE_USERNAME=your_username
MT4_BRIDGE_PASSWORD=your_secure_password
```

### Step 2: Install ZeroMQ Library for MT4

Download the MQL4-ZMQ library:

```bash
# Option 1: Using git
cd mt4-bridge/libraries
git clone https://github.com/dingmaotu/mql-zmq.git
cp mql-zmq/Include/Zmq/* ../include/

# Option 2: Manual download
# Download from: https://github.com/dingmaotu/mql-zmq/releases
# Extract and copy Include/Zmq/* to mt4-bridge/include/
```

### Step 3: Build Bridge Components

Install Node.js dependencies:

```bash
cd mt4-bridge
npm install
```

### Step 4: Start MT4 Container

Using Docker Compose:

```bash
# From project root
docker-compose -f docker-compose.mt4.yml up -d
```

This will:
- Start MT4 terminal in Wine container
- Expose VNC on port 5900 for GUI access
- Start Node.js bridge server on port 8080
- Set up ZeroMQ communication on port 5555

### Step 5: Access MT4 Terminal via VNC

Connect to MT4 GUI using VNC client:

**VNC Connection Details:**
- Host: `localhost:5900`
- Password: `mt4bridge2024`

**Recommended VNC Clients:**
- macOS: Built-in Screen Sharing or RealVNC
- Linux: Remmina, TigerVNC
- Windows: RealVNC, TightVNC

### Step 6: Configure MT4 Terminal

Once connected via VNC:

1. **Login to Broker Account:**
   - Click "File" → "Login to Trade Account"
   - Enter your MT4 account number, password, and select broker server
   - For demo accounts, create one from your broker's website first

2. **Enable Expert Advisors:**
   - Go to "Tools" → "Options" → "Expert Advisors"
   - Check "Allow automated trading"
   - Check "Allow DLL imports"
   - Check "Allow imports of external experts"
   - Click "OK"

3. **Attach Expert Advisor:**
   - Open any chart (e.g., EURUSD M1)
   - In Navigator panel, expand "Expert Advisors"
   - Drag "MT4Bridge" EA onto the chart
   - In the dialog:
     - Check "Allow live trading"
     - Check "Allow DLL imports"
     - Click "OK"

4. **Verify EA is Running:**
   - You should see a smiley face icon in the top-right corner
   - Check the "Experts" tab in Terminal window
   - Look for: "MT4Bridge EA initialized successfully"
   - Should show: "ZMQ socket bound to tcp://*:5555"

### Step 7: Test Connection

Run the test script from your main application:

```bash
# From project root
npm run test:mt4
# or
npx ts-node scripts/test-mt4-connection.ts
```

Expected output:

```
============================================================
MT4 BRIDGE CONNECTION TEST
============================================================

🧪 Running: 1. Ping (Health Check)
✅ PASSED

🧪 Running: 2. Authentication Test (Invalid)
✅ PASSED

🧪 Running: 3. Get Account Info
Account Balance: 10000.00
Account Equity: 10000.00
Account Currency: USD
✅ PASSED

... (more tests)

============================================================
Total: 6 | Passed: 6 | Failed: 0
============================================================

🎉 All tests passed! MT4 bridge is working correctly.
```

---

## Architecture Details

### ZeroMQ Communication Flow

```
1. Node.js receives HTTP request
   ↓
2. Creates JSON command: {"id": 1, "command": "GET_ACCOUNT_INFO", "params": {}}
   ↓
3. Sends to MT4 via ZeroMQ (REQ-REP pattern)
   ↓
4. MT4 EA processes command in OnTick()
   ↓
5. MT4 EA returns JSON: {"error": null, "data": {...}}
   ↓
6. Node.js parses response and returns HTTP response
```

### Supported Commands

| Command | Description | Params |
|---------|-------------|--------|
| `GET_ACCOUNT_INFO` | Get account balance, equity, margin | None |
| `GET_SYMBOLS` | List all available trading symbols | None |
| `GET_PRICE` | Get bid/ask price for symbol | `symbol` |
| `GET_OPEN_ORDERS` | Get all open positions | None |
| `GET_ORDER` | Get specific order by ticket | `ticket` |
| `CREATE_ORDER` | Create market order | `symbol`, `side`, `volume`, `stopLoss`, `takeProfit`, `comment` |
| `CLOSE_ORDER` | Close position by ticket | `ticket` |
| `CLOSE_ALL_ORDERS` | Close all positions | `symbol` (optional) |
| `MODIFY_ORDER` | Modify SL/TP | `ticket`, `stopLoss`, `takeProfit` |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/ping` | Health check (no auth) |
| GET | `/api/v1/account/info` | Get account info |
| GET | `/api/v1/symbols` | Get available symbols |
| GET | `/api/v1/price/:symbol` | Get price |
| GET | `/api/v1/orders/open` | Get open positions |
| GET | `/api/v1/orders/:ticket` | Get specific order |
| POST | `/api/v1/orders` | Create order |
| POST | `/api/v1/orders/close` | Close position |
| POST | `/api/v1/orders/close-all` | Close all positions |
| PUT | `/api/v1/orders/:ticket` | Modify order |

---

## Troubleshooting

### Bridge Not Connecting

**Problem:** Test script fails with connection refused

**Solutions:**
1. Check Docker containers are running:
   ```bash
   docker ps | grep mt4
   ```

2. Check bridge server logs:
   ```bash
   docker logs mt4-bridge-server
   ```

3. Verify bridge is listening:
   ```bash
   curl http://localhost:8080/api/v1/ping
   ```

### MT4 EA Not Responding

**Problem:** Bridge connects but commands timeout

**Solutions:**
1. Connect via VNC and check MT4 terminal
2. Verify EA is attached to chart (smiley face icon visible)
3. Check "Experts" tab for errors
4. Restart EA: Remove from chart and re-attach

### Authentication Errors

**Problem:** Getting 401 Unauthorized

**Solutions:**
1. Verify credentials in `.env` files match
2. Check base64 encoding is correct:
   ```bash
   echo -n "username:password" | base64
   ```

### Symbol Not Found

**Problem:** Cannot get price for certain symbols

**Solutions:**
1. Check symbol is available at your broker:
   ```bash
   curl -u username:password http://localhost:8080/api/v1/symbols
   ```

2. Use broker-specific symbol names (e.g., some brokers use `EURUSDm` or `EURUSD.raw`)

### Orders Not Executing

**Problem:** Order creation returns errors

**Solutions:**
1. Check account has sufficient margin
2. Verify lot size is within broker limits (usually 0.01 - 100)
3. Ensure "Auto Trading" is enabled (check smiley face is green)
4. Check SL/TP prices are valid (must be above/below current price by minimum distance)

---

## Performance Optimization

### Reduce Latency

1. **Run bridge on same machine as main app:**
   ```bash
   MT4_BRIDGE_URL=http://localhost:8080  # Not http://remote-server
   ```

2. **Use Redis caching** (already implemented in mt4Service.ts)

3. **Minimize VNC usage** - Only use for initial setup, not for monitoring

### Scaling

For multiple users with different MT4 accounts:

1. **Option 1: Single Bridge, Multiple Accounts**
   - Each user configures their own MT4 credentials
   - Bridge routes requests based on authentication
   - Requires EA modification to support multi-account

2. **Option 2: Multiple Bridge Instances**
   - Deploy separate bridge per user
   - Use dynamic port allocation
   - More resource-intensive but better isolation

---

## Security Best Practices

1. **Change Default Passwords:**
   ```bash
   BRIDGE_AUTH_PASSWORD=<strong-random-password>
   ```

2. **Use Environment Variables:**
   - Never commit `.env` files to git
   - Use secrets management in production

3. **Enable HTTPS:**
   - Put bridge behind nginx with SSL
   - Update `MT4_BRIDGE_URL` to use `https://`

4. **Network Isolation:**
   - Run bridge in private network
   - Use firewall rules to restrict access
   - Only expose necessary ports

5. **MT4 Account Security:**
   - Use demo accounts for testing
   - For live trading, use sub-accounts with limited funds
   - Enable two-factor authentication if broker supports it

---

## Monitoring

### Check Bridge Health

```bash
# Health check
curl http://localhost:8080/api/v1/ping

# Check logs
docker logs -f mt4-bridge-server

# Monitor ZeroMQ traffic
docker exec -it mt4-terminal tail -f /root/.wine/drive_c/Program\ Files/MetaTrader/MQL4/Logs/*.log
```

### Set Up Alerts

Add health checks to your monitoring system:

```bash
# Cron job example
*/5 * * * * curl -f http://localhost:8080/api/v1/ping || echo "MT4 Bridge DOWN" | mail -s "Alert" admin@example.com
```

---

## Maintenance

### Updating MT4 Terminal

MT4 updates automatically when connected to broker. To force update:

1. Connect via VNC
2. MT4 will prompt for update
3. Click "Update" and restart

### Backup Configuration

Important files to backup:

```bash
# MT4 data
mt4-data/

# Bridge configuration
mt4-bridge/.env

# EA source
mt4-bridge/experts/MT4Bridge.mq4
```

### Logs Location

```bash
# Bridge server logs
mt4-bridge/logs/combined.log
mt4-bridge/logs/error.log

# MT4 logs (inside container)
docker exec mt4-terminal find /root/.wine/drive_c/Program\ Files/MetaTrader/MQL4/Logs -name "*.log"
```

---

## Production Deployment

### Docker Compose Production Setup

```yaml
version: '3.8'

services:
  mt4-bridge-server:
    build: ./mt4-bridge
    restart: always
    environment:
      - NODE_ENV=production
    networks:
      - internal
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

networks:
  internal:
    driver: bridge
    internal: true
```

### Process Management

Use systemd or supervisor to ensure bridge stays running:

```bash
# systemd service example
sudo nano /etc/systemd/system/mt4-bridge.service
```

```ini
[Unit]
Description=MT4 Bridge Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/mariposa-scalping
ExecStart=/usr/local/bin/docker-compose -f docker-compose.mt4.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.mt4.yml down
StandardOutput=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable mt4-bridge
sudo systemctl start mt4-bridge
```

---

## FAQ

**Q: Can I run multiple MT4 instances?**
A: Yes, use different ports for each instance and create separate docker-compose files.

**Q: Does this work with MT5?**
A: Not currently. MT5 uses a different API. You would need to modify the EA for MT5 compatibility.

**Q: Can I use this on Windows directly (no Docker)?**
A: Yes, run MT4 natively, attach the EA, and run the Node.js bridge server locally.

**Q: What's the latency?**
A: Typical latency is 5-50ms depending on system load and order complexity.

**Q: Is this suitable for high-frequency trading?**
A: Not recommended. MT4 is designed for retail trading, not HFT. Expect execution times of 100-500ms.

**Q: Can I backtest strategies?**
A: The bridge is for live trading only. For backtesting, use MT4's Strategy Tester.

---

## Support

- **Issues:** Report bugs in the main repository
- **Documentation:** See [MT4 Service Documentation](../src/services/mt4Service.ts)
- **Community:** Join our Discord/Slack for help

---

## License

MIT License - See LICENSE file for details
