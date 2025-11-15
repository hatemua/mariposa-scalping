# VPS Security Checklist for MT4 Bridge

Complete security hardening guide for production MT4 bridge deployment on VPS.

---

## Critical Security Steps (Do These First!)

### 1. Change Default Passwords

**VNC Password:**
```bash
# Edit docker-compose.mt4.yml
nano docker-compose.mt4.yml

# Change line:
- VNC_PASSWORD=mt4bridge2024
# To:
- VNC_PASSWORD=YourStrongPassword123!

# Restart
docker-compose -f docker-compose.mt4.yml restart mt4-terminal
```

**Bridge API Password:**
```bash
# Edit .env
nano .env

# Change:
MT4_BRIDGE_PASSWORD=changeme123
# To:
MT4_BRIDGE_PASSWORD=$(openssl rand -base64 24)

# Also update mt4-bridge/.env
nano mt4-bridge/.env
BRIDGE_AUTH_PASSWORD=<same password>

# Restart
docker-compose -f docker-compose.mt4.yml restart mt4-bridge-server
```

**System Passwords:**
```bash
# Change root password
sudo passwd root

# Create non-root user
sudo adduser trading
sudo usermod -aG sudo,docker trading

# Use this user instead of root
```

---

### 2. SSH Key Authentication

**On your laptop:**
```bash
# Generate SSH key (if you don't have one)
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy to VPS
ssh-copy-id root@YOUR_VPS_IP

# Or manually:
cat ~/.ssh/id_ed25519.pub | ssh root@YOUR_VPS_IP \
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

**On VPS:**
```bash
# Disable password authentication
sudo nano /etc/ssh/sshd_config

# Set these values:
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
ChallengeResponseAuthentication no

# Restart SSH
sudo systemctl restart sshd
```

---

### 3. Firewall Configuration

**Install and configure UFW:**
```bash
# Install
sudo apt update
sudo apt install ufw

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (IMPORTANT: Do this BEFORE enabling!)
sudo ufw allow 22/tcp
# Or if using custom SSH port:
# sudo ufw allow 2222/tcp

# Allow your application port (if needed externally)
sudo ufw allow 3001/tcp

# DO NOT allow VNC port directly (use SSH tunnel)
# DO NOT: sudo ufw allow 5900

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status verbose
```

**Restrict SSH to specific IP (optional but recommended):**
```bash
# Only allow SSH from your IP
sudo ufw delete allow 22/tcp
sudo ufw allow from YOUR_LAPTOP_IP to any port 22 proto tcp

# Or allow IP range
sudo ufw allow from 203.0.113.0/24 to any port 22 proto tcp
```

---

### 4. Install Fail2Ban

**Protects against brute force attacks:**
```bash
# Install
sudo apt install fail2ban

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local

# Enable SSH jail:
[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600

# Start service
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Check status
sudo fail2ban-client status sshd
```

---

### 5. Use Non-Standard SSH Port

**Change SSH port from 22 to something else:**
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Change line:
Port 22
# To:
Port 2222  # Or any port between 1024-65535

# Update firewall
sudo ufw allow 2222/tcp
sudo ufw delete allow 22/tcp

# Restart SSH
sudo systemctl restart sshd

# Test new port BEFORE closing current session
ssh -p 2222 root@YOUR_VPS_IP
```

**Update connection script:**
```bash
export VPS_PORT="2222"
./mt4-bridge/connect-vnc.sh
```

---

## Network Security

### 1. Bind Services to Localhost Only

**Already configured in docker-compose.mt4.yml:**
```yaml
ports:
  - "127.0.0.1:8080:8080"  # Bridge only accessible locally ✅
  - "0.0.0.0:5900:5900"    # VNC accessible for SSH tunnel ✅
```

### 2. Docker Network Isolation

**Verify internal network:**
```bash
# Check network configuration
docker network inspect mariposa-scalping_mt4-network

# Ensure ZMQ port is NOT exposed externally
docker ps | grep mt4
# Should NOT show 0.0.0.0:5555
```

### 3. Disable Unnecessary Services

```bash
# List all services
systemctl list-units --type=service --state=running

# Disable unused services
sudo systemctl disable apache2  # If not needed
sudo systemctl disable mysql    # If using MongoDB
sudo systemctl stop apache2
```

---

## Application Security

### 1. Environment Variables

**Never commit .env files:**
```bash
# Verify .env is in .gitignore
cat .gitignore | grep .env

# Should show:
# .env
# mt4-bridge/.env
```

**Use strong random secrets:**
```bash
# Generate strong passwords
openssl rand -base64 32

# Generate JWT secret
openssl rand -hex 64

# Update .env files with generated values
```

### 2. MongoDB Security

**If MongoDB is exposed:**
```bash
# Edit mongod.conf
sudo nano /etc/mongod.conf

# Bind to localhost only
net:
  bindIp: 127.0.0.1
  port: 27017

# Enable authentication
security:
  authorization: enabled

# Restart MongoDB
sudo systemctl restart mongod

# Create admin user
mongo
use admin
db.createUser({
  user: "admin",
  pwd: "strong_password_here",
  roles: [ { role: "root", db: "admin" } ]
})
```

### 3. Redis Security

**Secure Redis:**
```bash
# Edit redis.conf
sudo nano /etc/redis/redis.conf

# Bind to localhost
bind 127.0.0.1

# Set password
requirepass your_strong_redis_password

# Disable dangerous commands
rename-command CONFIG ""
rename-command FLUSHALL ""
rename-command FLUSHDB ""

# Restart Redis
sudo systemctl restart redis
```

### 4. Rate Limiting

**Already implemented in your app, but verify settings:**
```bash
# Check .env
cat .env | grep RATE_LIMIT

# For production, use conservative limits:
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100  # Lower for production
AI_ANALYSIS_RATE_LIMIT=10
```

---

## Docker Security

### 1. Run Containers as Non-Root

**Update Dockerfile:**
```dockerfile
# Add to mt4-bridge/Dockerfile
FROM node:18-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs
# ... rest of Dockerfile
```

### 2. Limit Container Resources

**Update docker-compose.mt4.yml:**
```yaml
services:
  mt4-terminal:
    # ... existing config
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          memory: 1G

  mt4-bridge-server:
    # ... existing config
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

### 3. Docker Socket Protection

```bash
# Don't expose Docker socket
# Remove any -v /var/run/docker.sock mounts

# Use read-only file system where possible
# In docker-compose:
read_only: true
```

---

## MT4 Broker Security

### 1. Use Demo Account First

**Never start with live money:**
```
1. Create demo account at broker
2. Test for minimum 1 week
3. Verify all functionality
4. Only then switch to live with small capital
```

### 2. Broker Account Security

**Enable 2FA:**
- Most brokers offer 2FA via email or authenticator app
- Enable it on your MT4 account

**Use Strong Password:**
```bash
# MT4 account password should be:
# - At least 12 characters
# - Mix of upper, lower, numbers, symbols
# - Different from VPS password
```

**Limit Account Permissions:**
- If broker allows, use sub-accounts with limited funds
- Set maximum daily loss limits
- Enable broker's security notifications

### 3. Monitor Account Activity

**Set up alerts:**
```javascript
// In your app, add monitoring
// Alert on:
// - Large unexpected trades
// - Account balance drops > X%
// - Failed login attempts
// - IP address changes
```

---

## Monitoring & Logging

### 1. Enable Logging

**System logs:**
```bash
# Ensure syslog is running
sudo systemctl status rsyslog

# Check logs regularly
sudo tail -f /var/log/auth.log     # SSH attempts
sudo tail -f /var/log/syslog       # System events
```

**Application logs:**
```bash
# Bridge server logs
tail -f mt4-bridge/logs/combined.log
tail -f mt4-bridge/logs/error.log

# Docker logs
docker logs -f mt4-terminal
docker logs -f mt4-bridge-server
```

### 2. Log Rotation

**Configure logrotate:**
```bash
sudo nano /etc/logrotate.d/mt4-bridge

# Add:
/opt/mariposa-scalping/mt4-bridge/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
}
```

### 3. Monitoring Tools

**Install monitoring:**
```bash
# Install htop for process monitoring
sudo apt install htop

# Install netdata for comprehensive monitoring
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# Access dashboard: http://YOUR_VPS_IP:19999
```

---

## Backup Strategy

### 1. Automated Backups

**Create backup script:**
```bash
#!/bin/bash
# /opt/mariposa-scalping/backup.sh

BACKUP_DIR="/backup/mt4-$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup configurations
cp .env $BACKUP_DIR/
cp mt4-bridge/.env $BACKUP_DIR/
cp docker-compose.mt4.yml $BACKUP_DIR/

# Backup MT4 data
tar -czf $BACKUP_DIR/mt4-data.tar.gz mt4-data/

# Backup EA and scripts
cp -r mt4-bridge/experts $BACKUP_DIR/

# Backup logs (last 7 days)
find mt4-bridge/logs -name "*.log" -mtime -7 -exec cp {} $BACKUP_DIR/ \;

# Keep only last 30 days of backups
find /backup -type d -name "mt4-*" -mtime +30 -exec rm -rf {} \;

echo "Backup completed: $BACKUP_DIR"
```

**Schedule with cron:**
```bash
# Make executable
chmod +x /opt/mariposa-scalping/backup.sh

# Add to crontab
crontab -e

# Add line (daily at 2 AM):
0 2 * * * /opt/mariposa-scalping/backup.sh >> /var/log/mt4-backup.log 2>&1
```

### 2. Off-site Backups

**Sync to remote storage:**
```bash
# Using rsync
rsync -avz /backup/ user@remote-server:/backups/mt4/

# Or use cloud storage (AWS S3, Google Cloud, etc.)
aws s3 sync /backup/ s3://your-bucket/mt4-backups/
```

---

## Incident Response Plan

### 1. Suspected Breach

**Immediate actions:**
```bash
# 1. Disconnect from network
sudo ufw deny incoming
sudo ufw deny outgoing

# 2. Stop all services
docker-compose down

# 3. Close all MT4 positions via broker's web portal

# 4. Change all passwords

# 5. Review logs
sudo grep -i "failed\|error\|unauthorized" /var/log/auth.log
docker logs mt4-bridge-server | grep -i error

# 6. Check for unauthorized SSH keys
cat ~/.ssh/authorized_keys
```

### 2. Unusual Trading Activity

**If you see unexpected trades:**
```bash
# 1. Disable auto-trading immediately
# Via VNC: Click "Auto Trading" button (make it red)

# 2. Close all positions
# API: POST /api/mt4/close-all

# 3. Stop bridge server
docker stop mt4-bridge-server

# 4. Review agent logs
# Check which agent executed the trade
# Review signal that triggered it

# 5. Review EA logs in MT4 Experts tab
```

---

## Regular Maintenance

### Daily

```bash
# Quick health check (5 min)
ssh YOUR_VPS_IP

# Check services running
docker ps

# Check for errors
docker logs --tail 50 mt4-bridge-server | grep -i error

# Check disk space
df -h

# Check failed login attempts
sudo tail -50 /var/log/auth.log | grep Failed
```

### Weekly

```bash
# Update system (15 min)
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y

# Check firewall rules
sudo ufw status verbose

# Review logs
sudo grep -i "failed\|error" /var/log/syslog | tail -100

# Test backups
ls -lh /backup/
```

### Monthly

```bash
# Full security audit (30 min)

# 1. Check for unauthorized users
cat /etc/passwd

# 2. Check for unauthorized SSH keys
find /home -name "authorized_keys" -exec cat {} \;

# 3. Check listening ports
sudo netstat -tulpn

# 4. Check cron jobs
crontab -l
sudo cat /etc/crontab

# 5. Review Docker images for updates
docker images
docker-compose pull

# 6. Test restore from backup
# Verify backup integrity

# 7. Review and rotate passwords
```

---

## Security Checklist

### Initial Setup

- [ ] Changed default VNC password
- [ ] Changed default bridge API password
- [ ] Changed root password
- [ ] Created non-root user
- [ ] Configured SSH key authentication
- [ ] Disabled SSH password authentication
- [ ] Changed SSH to non-standard port
- [ ] Configured UFW firewall
- [ ] Installed and configured Fail2Ban
- [ ] Restricted SSH access to known IPs
- [ ] Verified services bound to localhost
- [ ] Configured MongoDB authentication
- [ ] Secured Redis with password
- [ ] Set up log rotation
- [ ] Created backup script
- [ ] Scheduled automated backups

### Before Going Live

- [ ] Tested on demo account for minimum 1 week
- [ ] Verified all security settings
- [ ] Set up monitoring and alerts
- [ ] Documented incident response plan
- [ ] Tested backup and restore
- [ ] Reviewed all .env files (no secrets in git)
- [ ] Enabled broker 2FA
- [ ] Set trading limits in application
- [ ] Tested kill switch (stop all trading quickly)
- [ ] Prepared emergency contacts

### Monthly Review

- [ ] Reviewed logs for anomalies
- [ ] Checked for system updates
- [ ] Verified backups are working
- [ ] Tested incident response procedures
- [ ] Reviewed trading performance
- [ ] Checked for new security patches
- [ ] Rotated passwords (quarterly)
- [ ] Reviewed firewall rules
- [ ] Checked for unauthorized access
- [ ] Verified monitoring is working

---

## Security Tools

### Recommended Tools

```bash
# Security scanning
sudo apt install lynis
sudo lynis audit system

# Intrusion detection
sudo apt install rkhunter
sudo rkhunter --check

# Port scanning (test from outside)
nmap -sS -sV YOUR_VPS_IP

# SSL/TLS testing (if using HTTPS)
sudo apt install testssl.sh
testssl.sh YOUR_VPS_IP:443
```

---

## Compliance & Best Practices

### Password Policy

- **Length:** Minimum 16 characters
- **Complexity:** Mix of upper, lower, numbers, symbols
- **Rotation:** Every 90 days
- **Unique:** Different for each service
- **Storage:** Use password manager (1Password, LastPass)

### Access Control

- **Principle of Least Privilege:** Only grant necessary permissions
- **Multi-Factor Authentication:** Use where available
- **Session Timeouts:** Implement in application
- **Audit Logging:** Log all access attempts

### Data Protection

- **Encryption at Rest:** Use encrypted volumes
- **Encryption in Transit:** Use SSH tunnels, HTTPS
- **Sensitive Data:** Never log passwords, API keys
- **Data Retention:** Delete old logs/backups per policy

---

## Emergency Contacts

**Document these:**

```
VPS Provider Support:
- Phone: _______________
- Email: _______________
- Portal: _______________

MT4 Broker Support:
- Phone: _______________
- Email: _______________
- Account Manager: _______________

Development Team:
- On-Call: _______________
- Email: _______________

Incident Response:
- Security Team: _______________
- Management: _______________
```

---

## Additional Resources

**Security Guides:**
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [SSH Hardening Guide](https://www.ssh.com/academy/ssh/server)
- [UFW Firewall Tutorial](https://help.ubuntu.com/community/UFW)

**Monitoring:**
- [Netdata Documentation](https://learn.netdata.cloud/)
- [Fail2Ban Guide](https://www.fail2ban.org/)

**Trading Security:**
- Your broker's security guidelines
- Financial regulator requirements
- PCI DSS if handling payment data

---

**Security is an ongoing process, not a one-time setup!**

Review this checklist regularly and stay updated on security best practices.
