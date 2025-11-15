# MT4 Bridge on VPS - Quick Start Guide

Fast setup guide for MT4 bridge on a remote VPS with laptop access.

---

## What You Need

- ✅ VPS with Ubuntu/Debian (2+ GB RAM, 2+ CPU cores)
- ✅ VPS IP address
- ✅ SSH access (root or sudo user)
- ✅ MT4 broker account (demo for testing)
- ✅ Your laptop (macOS/Linux/Windows)

**Time Required:** 45-60 minutes

---

## Part 1: VPS Setup (30 min)

### Step 1: Connect to VPS

**From your laptop:**
```bash
ssh root@YOUR_VPS_IP
```

### Step 2: Install Prerequisites

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose -y

# Install Git
apt install git -y

# Verify installations
docker --version
docker-compose --version
```

### Step 3: Clone Repository

```bash
# Navigate to working directory
cd /opt

# Clone your repository (or upload files)
git clone https://github.com/your-repo/mariposa-scalping.git
# Or use scp/rsync to upload from laptop

cd mariposa-scalping
```

### Step 4: Configure Environment

```bash
# Copy environment files
cp .env.example .env
cd mt4-bridge
cp .env.example .env
cd ..

# Generate strong passwords
BRIDGE_PASS=$(openssl rand -base64 16)
VNC_PASS=$(openssl rand -base64 12)

echo "Bridge Password: $BRIDGE_PASS"
echo "VNC Password: $VNC_PASS"
# SAVE THESE PASSWORDS!

# Update main .env
nano .env
# Set:
# MT4_BRIDGE_URL=http://localhost:8080
# MT4_BRIDGE_USERNAME=admin
# MT4_BRIDGE_PASSWORD=<paste BRIDGE_PASS>

# Update bridge .env
nano mt4-bridge/.env
# Set:
# BRIDGE_AUTH_USERNAME=admin
# BRIDGE_AUTH_PASSWORD=<paste BRIDGE_PASS>
# VNC_PASSWORD=<paste VNC_PASS>

# Or edit docker-compose.mt4.yml directly:
nano docker-compose.mt4.yml
# Change VNC_PASSWORD line
```

### Step 5: Install MT4 Bridge

```bash
# Run automated setup
cd mt4-bridge
chmod +x setup.sh
./setup.sh

# Start services
cd ..
docker-compose -f docker-compose.mt4.yml up -d

# Verify containers are running
docker ps
# Should show: mt4-terminal, mt4-bridge-server
```

### Step 6: Configure Firewall

```bash
# Install UFW
apt install ufw -y

# Allow SSH (CRITICAL - do this first!)
ufw allow 22/tcp

# Allow your application port (if needed externally)
ufw allow 3001/tcp

# DO NOT open VNC port (use SSH tunnel)
# DO NOT: ufw allow 5900

# Enable firewall
ufw enable

# Check status
ufw status
```

---

## Part 2: Laptop Setup (10 min)

### Step 1: Install VNC Client

**macOS:**
```bash
# Built-in Screen Sharing works
# Or install VNC Viewer
brew install --cask vnc-viewer
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt install tigervnc-viewer

# Fedora
sudo dnf install tigervnc
```

**Windows:**
- Download [RealVNC Viewer](https://www.realvnc.com/en/connect/download/viewer/)

### Step 2: Copy Connection Script

**If you have the repo on laptop:**
```bash
# Script is already there
cd /path/to/mariposa-scalping/mt4-bridge
chmod +x connect-vnc.sh
```

**If not, create it:**
```bash
# Create connection script on laptop
mkdir -p ~/mt4-vnc
nano ~/mt4-vnc/connect.sh
```

Paste this:
```bash
#!/bin/bash
VPS_HOST="YOUR_VPS_IP"
VPS_USER="root"
ssh -L 5900:localhost:5900 -N $VPS_USER@$VPS_HOST
```

```bash
chmod +x ~/mt4-vnc/connect.sh
```

### Step 3: Test Connection

**Start SSH tunnel:**
```bash
# Using script
./connect-vnc.sh
# Or
~/mt4-vnc/connect.sh

# Or manually
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP
```

**Keep terminal open!**

**In new terminal, connect VNC:**
```bash
# macOS
open vnc://localhost:5900

# Linux
vncviewer localhost:5900

# Windows: Open VNC Viewer → localhost:5900
```

**VNC Password:** (the VNC_PASS you saved)

---

## Part 3: MT4 Configuration (15 min)

### Via VNC, configure MT4:

**1. Login to Broker**
- File → Login to Trade Account
- Enter: Account number, Password, Server
- Click Login

**2. Enable Auto Trading**
- Tools → Options → Expert Advisors
- ✅ Allow automated trading
- ✅ Allow DLL imports
- ✅ Allow imports of external experts
- Click OK
- Click "Auto Trading" button in toolbar (make it green)

**3. Open Chart**
- File → New Chart → EURUSD
- Set to M1 timeframe

**4. Attach EA**
- Navigator (Ctrl+N) → Expert Advisors → MT4Bridge
- Drag onto EURUSD chart
- ✅ Allow live trading
- ✅ Allow DLL imports
- Click OK

**5. Verify**
- Green smiley 😊 in top-right corner
- Experts tab shows: "MT4Bridge EA initialized successfully"
- Experts tab shows: "ZMQ socket bound to tcp://*:5555"

---

## Part 4: Test Connection (5 min)

### On VPS

```bash
# Test bridge health
curl http://localhost:8080/api/v1/ping

# Should return:
# {"status":"ok","timestamp":...,"zmq_connected":true}
```

### From Laptop

**SSH into VPS and run test:**
```bash
ssh root@YOUR_VPS_IP
cd /opt/mariposa-scalping
npm run test:mt4
```

**Expected result:**
```
✅ 1. Ping (Health Check): Success
✅ 2. Authentication Test (Invalid): Success
✅ 3. Get Account Info: Success
✅ 4. Get Available Symbols: Success
✅ 5. Get Price (EURUSD): Success
✅ 6. Get Open Positions: Success

Total: 6 | Passed: 6 | Failed: 0
🎉 All tests passed!
```

---

## Quick Reference

### Connect to VNC

**From laptop:**
```bash
# Start tunnel (keep running)
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP

# In new terminal/tab, connect VNC
open vnc://localhost:5900  # macOS
vncviewer localhost:5900    # Linux
```

### Manage Services on VPS

```bash
# SSH to VPS
ssh root@YOUR_VPS_IP

# Check status
docker ps

# Restart services
cd /opt/mariposa-scalping
docker-compose -f docker-compose.mt4.yml restart

# View logs
docker logs -f mt4-bridge-server
docker logs -f mt4-terminal

# Stop services
docker-compose -f docker-compose.mt4.yml down

# Start services
docker-compose -f docker-compose.mt4.yml up -d
```

### Test Bridge

```bash
# From VPS
curl http://localhost:8080/api/v1/ping

# Full test suite
cd /opt/mariposa-scalping
npm run test:mt4
```

---

## Troubleshooting

### Can't Connect via SSH

```bash
# Check SSH is running on VPS (from VPS console/panel)
systemctl status sshd

# Check firewall
ufw status

# Ensure SSH port is open
ufw allow 22/tcp
```

### VNC Connection Refused

```bash
# On VPS, check container is running
docker ps | grep mt4-terminal

# Check VNC port
netstat -tln | grep 5900

# Restart container
docker restart mt4-terminal
```

### EA Not Showing in Navigator

```bash
# Check file exists on VPS
docker exec mt4-terminal ls /root/.wine/drive_c/Program\ Files/MetaTrader/MQL4/Experts/

# Copy if missing
docker cp mt4-bridge/experts/MT4Bridge.mq4 mt4-terminal:/root/.wine/drive_c/Program\ Files/MetaTrader/MQL4/Experts/

# Refresh Navigator in VNC (right-click → Refresh)
```

### Test Script Fails

```bash
# Check bridge is running
docker ps | grep mt4-bridge-server

# Check logs
docker logs mt4-bridge-server

# Verify EA is attached (via VNC)
# Should see green smiley on chart

# Restart everything
docker-compose -f docker-compose.mt4.yml restart
```

---

## Security Checklist

**Before using with real money:**

- [ ] Changed default VNC password
- [ ] Changed default bridge password
- [ ] Configured UFW firewall
- [ ] SSH key authentication enabled
- [ ] Tested on demo account for 1+ week
- [ ] Set up automated backups
- [ ] Configured monitoring/alerts
- [ ] Documented emergency procedures

**See `VPS-SECURITY-CHECKLIST.md` for complete guide**

---

## Daily Workflow

### Morning Check (2 minutes)

**From laptop:**
```bash
# 1. SSH to VPS
ssh root@YOUR_VPS_IP

# 2. Quick status check
docker ps && docker logs --tail 20 mt4-terminal

# 3. Exit
exit
```

### Accessing MT4 GUI (when needed)

**From laptop:**
```bash
# 1. Start SSH tunnel (Terminal 1)
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP

# 2. Connect VNC (Terminal 2)
open vnc://localhost:5900

# 3. Check MT4, make changes if needed

# 4. Close VNC, press Ctrl+C in Terminal 1
```

### Weekly Maintenance

**On VPS:**
```bash
# Update system
apt update && apt upgrade -y

# Check disk space
df -h

# Review logs
docker logs --tail 100 mt4-bridge-server | grep -i error
```

---

## File Locations

### On VPS

```
/opt/mariposa-scalping/
├── docker-compose.mt4.yml
├── .env
├── mt4-bridge/
│   ├── .env
│   ├── server.js
│   ├── experts/MT4Bridge.mq4
│   └── logs/
└── mt4-data/  (MT4 terminal data)
```

### On Laptop

```
~/mt4-vnc/
└── connect.sh  (SSH tunnel script)
```

---

## Next Steps

1. **Configure in your app:**
   ```bash
   POST /api/mt4/configure
   {
     "mt4AccountNumber": "12345678",
     "mt4Password": "broker_password",
     "mt4ServerUrl": "http://localhost:8080"
   }
   ```

2. **Create MT4 agent:**
   - Select broker: MT4
   - Set budget
   - Activate agent

3. **Monitor performance:**
   - Check WebSocket updates
   - Review agent logs
   - Monitor open positions

---

## Important URLs

**On VPS (localhost only):**
- Bridge API: `http://localhost:8080`
- Main App: `http://localhost:3001`

**From Laptop (via SSH tunnel):**
- VNC: `vnc://localhost:5900`
- Main App: `http://YOUR_VPS_IP:3001` (if port opened)

---

## Documentation

- **Full MT4 Bridge Guide:** `mt4-bridge/README.md`
- **VNC Remote Access:** `mt4-bridge/REMOTE-VNC-GUIDE.md`
- **VNC Configuration:** `mt4-bridge/VNC-CONFIGURATION-GUIDE.md`
- **Security Checklist:** `mt4-bridge/VPS-SECURITY-CHECKLIST.md`
- **Installation Summary:** `mt4-bridge/INSTALLATION-SUMMARY.md`

---

## Support

**Issues?**
1. Check logs: `docker logs mt4-bridge-server`
2. Verify MT4 in VNC (EA attached, green smiley)
3. Test connection: `npm run test:mt4`
4. Review documentation above
5. Restart services if needed

**Common Solutions:**
```bash
# Nuclear option - restart everything
docker-compose -f docker-compose.mt4.yml down
docker-compose -f docker-compose.mt4.yml up -d

# Wait 30 seconds, then test
sleep 30 && npm run test:mt4
```

---

## Success Checklist

**VPS:**
- [ ] Docker installed and running
- [ ] MT4 containers running (`docker ps`)
- [ ] Bridge API responding (`curl localhost:8080/api/v1/ping`)
- [ ] Firewall configured (SSH allowed, VNC blocked externally)

**Laptop:**
- [ ] VNC client installed
- [ ] SSH tunnel working
- [ ] Can connect to VNC (see MT4 desktop)

**MT4:**
- [ ] Logged in to broker
- [ ] Auto trading enabled (green button)
- [ ] EA attached to chart (green smiley)
- [ ] Experts tab shows "initialized successfully"

**Integration:**
- [ ] Test script passes all 6 tests
- [ ] Can configure MT4 credentials in app
- [ ] Can create MT4 agent
- [ ] Agent can execute test trade

---

**Setup Complete! 🎉**

You can now trade automatically on MT4 from your scalping agents!

**Remember:**
- Keep SSH tunnel open when using VNC
- Test on demo account first
- Review security checklist before live trading
- Set up monitoring and backups
