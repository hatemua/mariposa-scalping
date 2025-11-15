#!/bin/bash

###############################################################################
# MT4 Auto-Start Script
# This script automatically starts MT4 if it's installed
###############################################################################

echo "=== Checking for MT4 installation ==="

# Find MT4 terminal.exe
MT4_TERMINAL=$(find /root/.wine/drive_c/ -name "terminal.exe" -type f 2>/dev/null | head -1)

if [ -z "$MT4_TERMINAL" ]; then
    echo "⚠ MT4 not installed yet"
    echo "To install MT4, connect via VNC and run:"
    echo "  docker exec -it mt4-terminal bash"
    echo "  /opt/mt4-bridge/install-mt4.sh"
    exit 0
fi

echo "✓ Found MT4 at: $MT4_TERMINAL"

# Check if MT4 is already running
if pgrep -f terminal.exe > /dev/null; then
    echo "✓ MT4 is already running"
    exit 0
fi

echo "=== Starting MT4 terminal ==="
DISPLAY=:0 wine "$MT4_TERMINAL" &

sleep 5

if pgrep -f terminal.exe > /dev/null; then
    echo "✓ MT4 started successfully"
else
    echo "⚠ MT4 may not have started properly"
fi

echo "=== MT4 startup complete ==="
