#!/bin/bash

# VNC Connection Script for Remote VPS Access
# Connects to MT4 via SSH tunnel for secure access

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   MT4 VNC Connection (SSH Tunnel)         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Configuration
VPS_HOST="${VPS_HOST:-your-vps-ip}"
VPS_USER="${VPS_USER:-root}"
VPS_PORT="${VPS_PORT:-22}"
VNC_PORT="5900"
LOCAL_VNC_PORT="5900"

# Check if VPS_HOST is set
if [ "$VPS_HOST" = "your-vps-ip" ]; then
    echo -e "${YELLOW}Please configure your VPS details:${NC}"
    read -p "VPS IP address or hostname: " VPS_HOST
    read -p "VPS SSH username [root]: " input_user
    VPS_USER=${input_user:-root}
    read -p "VPS SSH port [22]: " input_port
    VPS_PORT=${input_port:-22}
    echo ""
fi

echo -e "${BLUE}Connection Details:${NC}"
echo "VPS Host: $VPS_HOST"
echo "VPS User: $VPS_USER"
echo "VPS Port: $VPS_PORT"
echo "VNC Port: $VNC_PORT"
echo ""

# Check if SSH tunnel is already running
if pgrep -f "ssh.*$VPS_HOST.*$VNC_PORT:localhost:$VNC_PORT" > /dev/null; then
    echo -e "${YELLOW}⚠️  SSH tunnel already running${NC}"
    echo ""
    read -p "Kill existing tunnel and reconnect? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pkill -f "ssh.*$VPS_HOST.*$VNC_PORT:localhost:$VNC_PORT"
        echo -e "${GREEN}✅ Existing tunnel killed${NC}"
        sleep 1
    else
        echo "Keeping existing tunnel"
        LOCAL_VNC_PORT="5901"
        echo -e "${YELLOW}Using alternative port: $LOCAL_VNC_PORT${NC}"
    fi
fi

# Create SSH tunnel
echo -e "${YELLOW}[1/2] Creating SSH tunnel...${NC}"
echo "Running: ssh -L $LOCAL_VNC_PORT:localhost:$VNC_PORT -N -f $VPS_USER@$VPS_HOST -p $VPS_PORT"
echo ""

ssh -L $LOCAL_VNC_PORT:localhost:$VNC_PORT -N -f $VPS_USER@$VPS_HOST -p $VPS_PORT

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ SSH tunnel established${NC}"
    echo ""
else
    echo -e "${RED}❌ Failed to create SSH tunnel${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check SSH access: ssh $VPS_USER@$VPS_HOST -p $VPS_PORT"
    echo "2. Verify VPS firewall allows SSH"
    echo "3. Check if MT4 containers are running on VPS"
    echo "4. Ensure VNC port 5900 is accessible on VPS"
    exit 1
fi

# Open VNC client
echo -e "${YELLOW}[2/2] Opening VNC client...${NC}"

# Detect OS and open appropriate VNC client
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "Opening macOS Screen Sharing..."
    open "vnc://localhost:$LOCAL_VNC_PORT"
    echo -e "${GREEN}✅ VNC client launched${NC}"

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v vncviewer &> /dev/null; then
        echo "Launching vncviewer..."
        vncviewer localhost:$LOCAL_VNC_PORT &
        echo -e "${GREEN}✅ VNC client launched${NC}"
    elif command -v remmina &> /dev/null; then
        echo "Launching Remmina..."
        remmina -c "vnc://localhost:$LOCAL_VNC_PORT" &
        echo -e "${GREEN}✅ VNC client launched${NC}"
    else
        echo -e "${YELLOW}⚠️  No VNC client found${NC}"
        echo ""
        echo "Install a VNC client:"
        echo "  Ubuntu/Debian: sudo apt install tigervnc-viewer"
        echo "  Fedora: sudo dnf install tigervnc"
        echo ""
        echo "Or manually connect to: localhost:$LOCAL_VNC_PORT"
    fi
else
    echo -e "${YELLOW}⚠️  Unknown OS, please manually connect to VNC${NC}"
    echo "VNC Address: localhost:$LOCAL_VNC_PORT"
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Connection Information           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}VNC Address:${NC} localhost:$LOCAL_VNC_PORT"
echo -e "${GREEN}VNC Password:${NC} mt4bridge2024"
echo ""
echo -e "${YELLOW}Keep this terminal open to maintain the SSH tunnel${NC}"
echo -e "${YELLOW}Press Ctrl+C to close tunnel and disconnect${NC}"
echo ""
echo "To kill tunnel later:"
echo "  pkill -f 'ssh.*$VPS_HOST.*$VNC_PORT'"
echo ""

# Keep script running to maintain tunnel
echo "Tunnel active. Waiting for connection..."
echo ""

# Wait for user to press Ctrl+C
trap "echo ''; echo 'Closing tunnel...'; pkill -f 'ssh.*$VPS_HOST.*$VNC_PORT'; echo 'Tunnel closed'; exit 0" INT

# Keep alive loop
while true; do
    if ! pgrep -f "ssh.*$VPS_HOST.*$VNC_PORT:localhost:$VNC_PORT" > /dev/null; then
        echo -e "${RED}❌ SSH tunnel died unexpectedly${NC}"
        echo "Attempting to reconnect..."
        ssh -L $LOCAL_VNC_PORT:localhost:$VNC_PORT -N -f $VPS_USER@$VPS_HOST -p $VPS_PORT
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Reconnected${NC}"
        else
            echo -e "${RED}❌ Reconnection failed${NC}"
            exit 1
        fi
    fi
    sleep 5
done
