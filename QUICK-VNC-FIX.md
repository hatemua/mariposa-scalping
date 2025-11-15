# 🚀 QUICK FIX - VNC Black Screen

## THE PROBLEM
❌ You're using the **wrong VNC password**

## THE SOLUTION
✅ Use this exact password: **`mt4bridge2024`**

---

## How to Connect (Choose One Method)

### Method A: Direct Connection (Simplest)

**On your laptop:**
1. Open VNC client
2. Connect to: `YOUR_VPS_IP:5900`
3. Enter password: `mt4bridge2024`
4. ✅ Done!

---

### Method B: SSH Tunnel (Secure - Recommended)

**On your laptop - Terminal 1:**
```bash
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP
```
(Keep this running)

**On your laptop - Terminal 2:**
```bash
# macOS
open vnc://localhost:5900

# Linux
vncviewer localhost:5900

# Windows: Open VNC Viewer → connect to localhost:5900
```

**When prompted:**
- Password: `mt4bridge2024`

---

### Method C: Use the Script (Automatic)

```bash
cd mt4-bridge
export VPS_HOST="YOUR_VPS_IP"
./connect-vnc.sh
```
Password when prompted: `mt4bridge2024`

---

## Verification

### ✅ Your VPS is Working Fine!

```
Docker:     ✅ Running
Containers: ✅ Both running (12 hours uptime)
VNC Server: ✅ Listening on port 5900
Network:    ✅ Port exposed and accessible
```

**The ONLY issue:** Wrong password being entered

---

## What You'll See After Connecting

- **Fluxbox desktop** (gray background)
- **xterm terminal window** with "MT4 Container Ready" message
- **Taskbar at bottom**

This is normal! Container is ready for MT4 installation.

---

## Still Not Working?

### Double-check these:

1. **Password is EXACTLY:** `mt4bridge2024`
   - All lowercase
   - No spaces
   - 15 characters

2. **Try different VNC client:**
   - Windows: RealVNC Viewer
   - macOS: Built-in Screen Sharing or RealVNC
   - Linux: TigerVNC or Remmina

3. **Test VNC port is accessible:**
   ```bash
   telnet YOUR_VPS_IP 5900
   ```
   Should say "Connected"

4. **Restart MT4 container (if needed):**
   ```bash
   ssh root@YOUR_VPS_IP
   cd /opt/mariposa-scalping
   sudo docker restart mt4-terminal
   ```

---

## Need More Help?

📄 Full guide: `VNC-CONNECTION-SOLUTION.md`

**Bottom line:** Your server is perfect, just use the right password! 🎯
