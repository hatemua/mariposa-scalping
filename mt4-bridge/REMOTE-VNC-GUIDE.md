# Remote VNC Access Guide (VPS Setup)

Complete guide for accessing MT4 via VNC on a remote VPS from your laptop.

---

## Overview

Since your MT4 bridge is running on a VPS (not your local machine), you need to connect remotely. This guide covers secure SSH tunneling for VNC access.

**Architecture:**
```
Your Laptop → SSH Tunnel → VPS → Docker → MT4 Terminal
           (encrypted)         (5900)   (VNC)
```

---

## Prerequisites

- VPS with MT4 bridge installed and running
- SSH access to VPS (username, password/key)
- VPS IP address or hostname
- VNC client on your laptop (varies by OS)

---

## Method 1: Automated SSH Tunnel (Recommended)

### Step 1: Configure Connection Script

On your **laptop**, edit the connection script:

```bash
# On your laptop (not VPS)
cd /path/to/mariposa-scalping/mt4-bridge

# Option 1: Set environment variables
export VPS_HOST="your.vps.ip.address"
export VPS_USER="root"
export VPS_PORT="22"

# Option 2: Script will prompt you interactively
./connect-vnc.sh
```

### Step 2: Run Connection Script

```bash
./connect-vnc.sh
```

**What it does:**
1. Creates SSH tunnel from your laptop to VPS
2. Forwards VPS port 5900 to laptop localhost:5900
3. Automatically opens VNC client
4. Keeps tunnel alive

**Expected output:**
```
╔════════════════════════════════════════════╗
║   MT4 VNC Connection (SSH Tunnel)         ║
╚════════════════════════════════════════════╝

Connection Details:
VPS Host: 123.456.789.0
VPS User: root
VPS Port: 22
VNC Port: 5900

[1/2] Creating SSH tunnel...
✅ SSH tunnel established

[2/2] Opening VNC client...
✅ VNC client launched

╔════════════════════════════════════════════╗
║           Connection Information           ║
╚════════════════════════════════════════════╝

VNC Address: localhost:5900
VNC Password: mt4bridge2024

Keep this terminal open to maintain the SSH tunnel
```

### Step 3: Connect VNC Client

VNC client should open automatically. If not:

**macOS:**
```bash
open vnc://localhost:5900
```

**Linux:**
```bash
vncviewer localhost:5900
```

**Windows:**
- Open VNC Viewer
- Connect to: `localhost:5900`

**VNC Password:** `mt4bridge2024`

### Step 4: Keep Terminal Open

**Important:** Don't close the terminal window!
- Terminal must stay open to keep SSH tunnel alive
- Close terminal = tunnel dies = VNC disconnects

To disconnect:
- Press `Ctrl+C` in terminal
- Or close terminal window

---

## Method 2: Manual SSH Tunnel

If you prefer manual control:

### Create SSH Tunnel

**From your laptop:**

```bash
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP
```

**Explanation:**
- `-L 5900:localhost:5900` - Forward local port 5900 to VPS port 5900
- `-N` - Don't execute remote commands (tunnel only)
- `root@YOUR_VPS_IP` - Your VPS credentials

**Custom SSH port:**
```bash
ssh -L 5900:localhost:5900 -N -p 2222 root@YOUR_VPS_IP
```

### Connect VNC Client

While SSH tunnel is running, in **another terminal**:

**macOS:**
```bash
open vnc://localhost:5900
```

**Linux:**
```bash
vncviewer localhost:5900
```

**Windows:**
- Open VNC Viewer app
- Enter: `localhost:5900`
- Click Connect

**Password:** `mt4bridge2024`

### Close Tunnel

Press `Ctrl+C` in the SSH terminal

---

## Method 3: Direct VNC (Not Recommended)

**Security Warning:** This exposes VNC directly to the internet. Only use on private networks or with strong firewall rules.

### Configure VPS Firewall

```bash
# On VPS
sudo ufw allow 5900/tcp
# or
sudo iptables -A INPUT -p tcp --dport 5900 -j ACCEPT
```

### Connect Directly

**From laptop:**

**macOS:**
```bash
open vnc://YOUR_VPS_IP:5900
```

**Linux:**
```bash
vncviewer YOUR_VPS_IP:5900
```

**Windows:**
- VNC Viewer → `YOUR_VPS_IP:5900`

**Password:** `mt4bridge2024`

**⚠️ WARNING:** This is insecure! VNC traffic is unencrypted. Use SSH tunnel instead.

---

## VNC Client Installation

### macOS

**Built-in:** Screen Sharing (Finder → Go → Connect to Server)

**Alternative:**
```bash
brew install --cask vnc-viewer
```

### Linux

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install tigervnc-viewer
```

**Fedora/RHEL:**
```bash
sudo dnf install tigervnc
```

**Arch:**
```bash
sudo pacman -S tigervnc
```

**Remmina (Full-featured):**
```bash
sudo apt install remmina remmina-plugin-vnc
```

### Windows

**Download:**
- [RealVNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) (Free)
- [TightVNC](https://www.tightvnc.com/download.php) (Free)
- [UltraVNC](https://www.uvnc.com/downloads/ultravnc.html) (Free)

---

## Verifying VPS Setup

Before connecting, ensure MT4 containers are running on VPS.

### SSH into VPS

```bash
ssh root@YOUR_VPS_IP
```

### Check Containers

```bash
cd /path/to/mariposa-scalping

# Check if containers are running
docker ps | grep mt4

# Should show:
# mt4-terminal
# mt4-bridge-server
```

### Check VNC Port

```bash
# Verify VNC is listening
netstat -tln | grep 5900
# or
ss -tln | grep 5900

# Should show:
# tcp   0   0 0.0.0.0:5900   0.0.0.0:*   LISTEN
```

### Test VNC Locally on VPS

```bash
# Install VNC viewer on VPS
apt install tigervnc-viewer

# Test connection
vncviewer localhost:5900
# Password: mt4bridge2024
```

If this works, remote connection should work too.

---

## Firewall Configuration

### Allow SSH (if not already)

```bash
# UFW (Ubuntu/Debian)
sudo ufw allow 22/tcp
sudo ufw enable

# iptables
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

### VNC Port (Only if using direct connection)

```bash
# For SSH tunnel: No firewall changes needed
# VNC goes through SSH (port 22)

# For direct VNC (not recommended):
sudo ufw allow from YOUR_LAPTOP_IP to any port 5900
```

### Application Port (if needed externally)

```bash
# Bridge server is localhost-only by default (secure)
# To expose externally (not recommended):
sudo ufw allow 3001/tcp  # Your main app
```

---

## Troubleshooting

### Issue 1: SSH Connection Refused

**Error:** `ssh: connect to host X.X.X.X port 22: Connection refused`

**Solutions:**
```bash
# Check if SSH is running on VPS
systemctl status sshd

# Start SSH if stopped
sudo systemctl start sshd
sudo systemctl enable sshd

# Check SSH port (might not be 22)
sudo netstat -tln | grep ssh
```

### Issue 2: SSH Tunnel Dies Immediately

**Error:** Tunnel closes right after connecting

**Solutions:**
```bash
# Remove -f flag to see error messages
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP

# Check for port conflicts on laptop
lsof -i :5900
# Kill conflicting process if needed

# Try different local port
ssh -L 5901:localhost:5900 -N root@YOUR_VPS_IP
# Then connect to localhost:5901
```

### Issue 3: VNC Black Screen or No Response

**Cause:** MT4 container not running or VNC server crashed

**Solutions:**
```bash
# On VPS, check containers
docker ps | grep mt4-terminal

# Restart MT4 container
docker restart mt4-terminal

# Check VNC logs
docker logs mt4-terminal

# Restart all services
docker-compose -f docker-compose.mt4.yml restart
```

### Issue 4: "Authentication Failed" in VNC

**Cause:** Wrong VNC password

**Solutions:**
```bash
# Default password is: mt4bridge2024

# To change password, update docker-compose.mt4.yml:
environment:
  - VNC_PASSWORD=your_new_password

# Restart container
docker-compose -f docker-compose.mt4.yml restart mt4-terminal
```

### Issue 5: Slow VNC Connection

**Cause:** Network latency or VPS bandwidth

**Solutions:**
```bash
# Reduce VNC quality in client settings
# - Lower color depth (256 colors instead of full)
# - Disable desktop effects
# - Use compression

# Or use NoVNC (web-based VNC) for better compression
# Install on VPS:
docker run -d --name novnc -p 6080:6080 \
  --link mt4-terminal:vnc \
  -e VNC_SERVER=vnc:5900 \
  geek1011/novnc

# Access via browser: http://YOUR_VPS_IP:6080
```

### Issue 6: SSH Key Authentication Issues

**Error:** Permission denied (publickey)

**Solutions:**
```bash
# Generate SSH key on laptop (if not exists)
ssh-keygen -t rsa -b 4096

# Copy public key to VPS
ssh-copy-id root@YOUR_VPS_IP

# Or manually:
cat ~/.ssh/id_rsa.pub | ssh root@YOUR_VPS_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"

# Test connection
ssh root@YOUR_VPS_IP
```

---

## Security Best Practices

### 1. Use SSH Key Authentication

```bash
# Disable password authentication on VPS
# Edit /etc/ssh/sshd_config:
PasswordAuthentication no
PubkeyAuthentication yes

# Restart SSH
sudo systemctl restart sshd
```

### 2. Change Default VNC Password

```bash
# Edit docker-compose.mt4.yml
environment:
  - VNC_PASSWORD=YourStrongPassword123!

# Restart container
docker-compose -f docker-compose.mt4.yml restart mt4-terminal
```

### 3. Use Non-Standard SSH Port

```bash
# Edit /etc/ssh/sshd_config
Port 2222

# Restart SSH
sudo systemctl restart sshd

# Connect with custom port
ssh -p 2222 -L 5900:localhost:5900 -N root@YOUR_VPS_IP
```

### 4. Restrict VNC to Localhost

Already configured in `docker-compose.mt4.yml`:
```yaml
ports:
  - "0.0.0.0:5900:5900"  # Allows external access (for SSH tunnel)
```

**For maximum security (SSH tunnel required):**
```yaml
ports:
  - "127.0.0.1:5900:5900"  # Only localhost (SSH tunnel mandatory)
```

### 5. Use Fail2Ban

```bash
# Install fail2ban on VPS
sudo apt install fail2ban

# Enable SSH jail
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 6. Regular Updates

```bash
# Keep VPS updated
sudo apt update && sudo apt upgrade -y

# Update Docker images
docker-compose -f docker-compose.mt4.yml pull
docker-compose -f docker-compose.mt4.yml up -d
```

---

## Quick Reference Commands

### Connect to VNC (SSH Tunnel)

```bash
# Automated
./mt4-bridge/connect-vnc.sh

# Manual
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP
open vnc://localhost:5900  # macOS
vncviewer localhost:5900    # Linux
```

### Manage SSH Tunnel

```bash
# Check if tunnel is running
pgrep -f "ssh.*5900"

# Kill tunnel
pkill -f "ssh.*5900"

# Check tunnel ports
lsof -i :5900
```

### VPS Management

```bash
# SSH into VPS
ssh root@YOUR_VPS_IP

# Check containers
docker ps

# Restart services
docker-compose -f docker-compose.mt4.yml restart

# View logs
docker logs mt4-terminal
docker logs mt4-bridge-server

# Check VNC port
netstat -tln | grep 5900
```

---

## Configuration Files

### Save Connection Details

Create `~/.mt4-vnc-config` on your laptop:

```bash
# MT4 VNC Configuration
export VPS_HOST="123.456.789.0"
export VPS_USER="root"
export VPS_PORT="22"
```

Load before connecting:
```bash
source ~/.mt4-vnc-config
./mt4-bridge/connect-vnc.sh
```

### SSH Config for Easy Connection

Edit `~/.ssh/config` on laptop:

```
Host mt4-vps
    HostName 123.456.789.0
    User root
    Port 22
    LocalForward 5900 localhost:5900
```

Connect with:
```bash
ssh -N mt4-vps
```

---

## Performance Optimization

### Reduce VNC Bandwidth Usage

**In VNC Client:**
- Set encoding to "Tight" or "ZRLE"
- Reduce color depth to 256 colors
- Disable "Show remote cursor"
- Enable compression

### Use Screen Compression

**Alternative: noVNC (Browser-based)**
```bash
# On VPS
docker run -d -p 6080:6080 --link mt4-terminal:vnc \
  -e VNC_SERVER=vnc:5900 \
  geek1011/novnc

# Access from laptop browser
http://YOUR_VPS_IP:6080
```

---

## After Successful Connection

Once VNC is connected, follow the normal configuration guide:

1. **Login to MT4 broker account**
2. **Enable Expert Advisors** (Tools → Options)
3. **Attach MT4Bridge EA to chart**
4. **Verify EA is running** (green smiley)
5. **Test connection** from your main app

See `VNC-CONFIGURATION-GUIDE.md` for detailed MT4 setup steps.

---

## Support Checklist

Before asking for help, verify:

- [ ] VPS is accessible via SSH
- [ ] MT4 containers are running on VPS
- [ ] VNC port 5900 is listening on VPS
- [ ] SSH tunnel is established (check with `pgrep`)
- [ ] VNC client is connecting to localhost:5900
- [ ] VNC password is correct (mt4bridge2024)
- [ ] No firewall blocking SSH or VNC ports

---

## Common Workflows

### Daily Use

```bash
# 1. Connect to VNC
./mt4-bridge/connect-vnc.sh

# 2. VNC opens automatically
# 3. Check MT4 is running
# 4. Keep terminal open
# 5. When done, press Ctrl+C
```

### Quick Check

```bash
# SSH into VPS
ssh root@YOUR_VPS_IP

# Check everything is running
docker ps && docker logs --tail 20 mt4-terminal
```

### Full Restart

```bash
# SSH into VPS
ssh root@YOUR_VPS_IP

# Restart MT4 services
cd /path/to/mariposa-scalping
docker-compose -f docker-compose.mt4.yml restart

# Reconnect VNC
exit
./mt4-bridge/connect-vnc.sh
```

---

**Remote VNC Access Configured! 🚀**

You can now securely access MT4 on your VPS from your laptop.
