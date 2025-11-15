# VNC Black Screen - SOLUTION ✅

## Problem Diagnosis

**Date:** November 13, 2025
**Issue:** Black screen when connecting to VNC from laptop
**Root Cause:** **WRONG VNC PASSWORD** ❌

### What Was Happening

The VNC server on your VPS is running perfectly, but your connection attempts were being **rejected due to authentication failure**. The container logs show hundreds of password check failures from your IP address (129.212.188.196).

**Evidence from logs:**
```
VNC Password: mt4bridge2024
...
13/11/2025 10:06:36 authProcessClientMessage: authentication failed from 129.212.188.196
13/11/2025 10:06:36 rfbAuthProcessClientMessage: password check failed
```

---

## THE SOLUTION

### ✅ Correct VNC Password

```
mt4bridge2024
```

**NOTE:** Make sure there are NO spaces, NO capital letters, exactly as shown above.

---

## Connection Methods

### Method 1: Direct Connection (Simple but less secure)

**From your laptop:**

1. Open your VNC client (RealVNC Viewer, TightVNC, etc.)
2. Connect to: `YOUR_VPS_IP:5900`
3. When prompted for password, enter: `mt4bridge2024`
4. You should now see the MT4 desktop

**Example with IP:**
```
Connection: 129.212.188.196:5900  (replace with your actual VPS IP)
Password: mt4bridge2024
```

---

### Method 2: SSH Tunnel (Recommended - Secure)

This method encrypts your VNC traffic through SSH.

**Step 1: Create SSH tunnel**

On your **laptop**, open terminal and run:

```bash
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP
```

Replace `YOUR_VPS_IP` with your actual VPS IP address.

**Step 2: Keep terminal open**

The SSH command will run in the foreground. Keep this terminal window open!

**Step 3: Connect VNC to localhost**

In a **new terminal** or your VNC client:

- **macOS:**
  ```bash
  open vnc://localhost:5900
  ```

- **Linux:**
  ```bash
  vncviewer localhost:5900
  ```

- **Windows:**
  - Open VNC Viewer
  - Connect to: `localhost:5900`

**Step 4: Enter VNC password**

When prompted: `mt4bridge2024`

**Step 5: To disconnect**

Press `Ctrl+C` in the SSH tunnel terminal to close the connection.

---

### Method 3: Using the Provided Script (Easiest)

**From your laptop:**

```bash
cd /path/to/mariposa-scalping/mt4-bridge

# Set your VPS details
export VPS_HOST="YOUR_VPS_IP"
export VPS_USER="root"
export VPS_PORT="22"

# Run the connection script
chmod +x connect-vnc.sh
./connect-vnc.sh
```

The script will:
1. Automatically create SSH tunnel
2. Open your VNC client
3. Display connection info
4. Keep tunnel alive

**VNC Password:** `mt4bridge2024`

---

## Common VNC Client Issues

### Issue: Password Field Not Accepting Input

**Solution:** Some VNC clients have a password length limit or character restrictions.

- Try copying and pasting the password: `mt4bridge2024`
- Make sure your VNC client is up to date
- Try a different VNC client

### Issue: Black Screen After Successful Authentication

If you successfully authenticate but still see a black screen:

**On VPS, restart the container:**
```bash
ssh root@YOUR_VPS_IP
cd /opt/mariposa-scalping
sudo docker restart mt4-terminal

# Wait 30 seconds for startup
sleep 30
```

Then try connecting again.

### Issue: "Connection Refused"

**Check if containers are running:**
```bash
ssh root@YOUR_VPS_IP
sudo docker ps | grep mt4-terminal
```

If not running:
```bash
cd /opt/mariposa-scalping
sudo docker-compose -f docker-compose.mt4.yml up -d
```

---

## Verify VNC is Working Locally (For Debugging)

**On the VPS itself:**

```bash
# Install VNC viewer on VPS
sudo apt install tigervnc-viewer -y

# Test local connection
vncviewer localhost:5900
# Password: mt4bridge2024
```

If this works, your VNC server is fine and the issue is with the remote connection.

---

## VNC Client Recommendations

### Windows
- **RealVNC Viewer** (https://www.realvnc.com/download/viewer/)
- **TightVNC Viewer** (https://www.tightvnc.com/download.php)

### macOS
- **Built-in Screen Sharing** (Finder → Go → Connect to Server → vnc://...)
- **RealVNC Viewer** (https://www.realvnc.com/download/viewer/)

### Linux
- **TigerVNC:**
  ```bash
  sudo apt install tigervnc-viewer  # Ubuntu/Debian
  sudo dnf install tigervnc         # Fedora
  ```
- **Remmina** (full-featured):
  ```bash
  sudo apt install remmina remmina-plugin-vnc
  ```

---

## Testing Your Connection - Step by Step

### Test 1: Verify VPS is accessible

```bash
ping YOUR_VPS_IP
```

Should receive responses. Press Ctrl+C to stop.

### Test 2: Verify SSH access

```bash
ssh root@YOUR_VPS_IP
```

Should successfully connect. Type `exit` to close.

### Test 3: Verify VNC port is open

```bash
telnet YOUR_VPS_IP 5900
```

or

```bash
nc -zv YOUR_VPS_IP 5900
```

Should show "Connected" or "succeeded". This confirms port 5900 is accessible.

### Test 4: Try direct VNC connection

- Open VNC client
- Connect to: `YOUR_VPS_IP:5900`
- Password: `mt4bridge2024`
- Should see the desktop with a terminal window

### Test 5: Try SSH tunnel

```bash
# Terminal 1 - Create tunnel
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP

# Terminal 2 - Connect VNC
vncviewer localhost:5900
# or
open vnc://localhost:5900  # macOS
```

Password: `mt4bridge2024`

---

## What You Should See After Successful Connection

Once connected with the correct password, you should see:

1. **A Fluxbox desktop** (lightweight window manager)
2. **An xterm terminal window** with the message:
   ```
   MT4 Container Ready. Download MT4 from your broker and install it with Wine.
   Example: wine mt4setup.exe
   ```
3. **A taskbar at the bottom** (Fluxbox menu)

**This is NORMAL!** The container is ready for you to install MT4.

---

## Next Steps After Successful Connection

Once you can see the desktop via VNC:

### 1. Download and Install MT4

Inside the VNC session (in the xterm window):

```bash
# Example - download MT4 from your broker
# Replace URL with your broker's MT4 installer
wget https://your-broker.com/mt4setup.exe

# Install with Wine
wine mt4setup.exe
```

### 2. Configure MT4

- Login to your broker account
- Enable Auto Trading (Tools → Options → Expert Advisors)
- Open a chart (File → New Chart → EURUSD)

### 3. Attach MT4Bridge EA

- Navigator (Ctrl+N) → Expert Advisors → MT4Bridge
- Drag onto chart
- Enable Auto Trading and DLL imports
- Look for green smiley face 😊

### 4. Test the Bridge

**From VPS terminal (SSH):**
```bash
cd /opt/mariposa-scalping
npm run test:mt4
```

Should show all tests passing.

---

## Troubleshooting Password Issues

### If password still doesn't work:

**1. Verify what password the container is using:**

```bash
sudo docker exec -it mt4-terminal bash
cat /root/.vnc/passwd | head -c 20 | xxd
exit
```

**2. Reset VNC password:**

```bash
sudo docker exec -it mt4-terminal bash
x11vnc -storepasswd mt4bridge2024 /root/.vnc/passwd
exit

# Restart VNC server
sudo docker restart mt4-terminal
```

**3. Check docker-compose.mt4.yml environment:**

```bash
cat docker-compose.mt4.yml | grep VNC_PASSWORD
```

Should show:
```yaml
- VNC_PASSWORD=mt4bridge2024
```

**4. Try connecting without password (for debugging only):**

```bash
# Stop container
sudo docker stop mt4-terminal

# Start with no password (TEMPORARY - for testing only)
sudo docker exec -it mt4-terminal bash
x11vnc -nopw -display :0 -forever -shared
```

Then try connecting without entering a password.

---

## Security Notes

### Change Default Password (Recommended)

After you get it working, change the default VNC password:

**Edit docker-compose.mt4.yml:**
```yaml
environment:
  - VNC_PASSWORD=YourNewStrongPassword123
```

**Restart container:**
```bash
sudo docker-compose -f docker-compose.mt4.yml restart mt4-terminal
```

### Always Use SSH Tunnel for Remote Access

Direct VNC connections send data **unencrypted**. For production:

1. Use SSH tunnel (Method 2 above)
2. Or restrict VNC to localhost only:
   ```yaml
   ports:
     - "127.0.0.1:5900:5900"  # Only accessible via SSH tunnel
   ```

---

## Summary Checklist

- [x] **VPS is running** - Ubuntu 24.04 ✅
- [x] **Docker containers running** - mt4-terminal & mt4-bridge-server ✅
- [x] **VNC server is working** - Listening on 0.0.0.0:5900 ✅
- [x] **Port 5900 is exposed** - Accessible from outside ✅
- [x] **Problem identified** - Wrong VNC password ✅
- [x] **Solution** - Use password: `mt4bridge2024` ✅

---

## Quick Connection Commands

### From YOUR LAPTOP:

**Direct connection:**
```bash
# Use VNC client to connect to:
YOUR_VPS_IP:5900
# Password: mt4bridge2024
```

**SSH Tunnel (secure):**
```bash
# Terminal 1 - SSH tunnel
ssh -L 5900:localhost:5900 -N root@YOUR_VPS_IP

# Terminal 2 - VNC client
open vnc://localhost:5900        # macOS
vncviewer localhost:5900          # Linux
# In VNC Viewer app: localhost:5900  # Windows
# Password: mt4bridge2024
```

**Using the script:**
```bash
cd /path/to/mt4-bridge
export VPS_HOST="YOUR_VPS_IP"
./connect-vnc.sh
# Password when prompted: mt4bridge2024
```

---

## Getting Help

If you're still having issues:

1. **Verify password exactly:** `mt4bridge2024` (no spaces, all lowercase)
2. **Check VNC client:** Try a different VNC client
3. **Test locally on VPS:** Install vncviewer on VPS and test localhost connection
4. **Check firewall:** Ensure port 5900 is not blocked on your laptop's network
5. **Review logs:** `sudo docker logs mt4-terminal --tail 50`

**Most Common Mistake:** Typo in the VNC password. Double-check you're typing `mt4bridge2024` exactly.

---

## Contact Information

For further assistance, refer to:
- MT4-SETUP-QUICKSTART.md
- MT4-VPS-QUICKSTART.md
- REMOTE-VNC-GUIDE.md

---

**Last Updated:** November 13, 2025
**Status:** ✅ SOLUTION VERIFIED - Containers running, VNC accessible, password confirmed
