#!/bin/bash

###############################################################################
# MT4 Installation Script for Wine Container
# This script downloads and installs MetaTrader 4 inside the Docker container
###############################################################################

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          MetaTrader 4 Installation Script                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# MT4 download URLs (multiple broker options)
declare -A MT4_URLS=(
    ["XM"]="https://download.mql5.com/cdn/web/metaquotes.software.corp/mt4/xmtrading4setup.exe"
    ["IC Markets"]="https://download.mql5.com/cdn/web/ic.markets.sc/mt4/icmarkets4setup.exe"
    ["Admiral Markets"]="https://download.mql5.com/cdn/web/admiral.markets.as/mt4/admiralmarkets4setup.exe"
    ["FBS"]="https://download.mql5.com/cdn/web/fbs.ltd/mt4/fbs4setup.exe"
)

echo "Available MT4 Brokers:"
echo "  1) XM"
echo "  2) IC Markets"
echo "  3) Admiral Markets"
echo "  4) FBS"
echo "  5) Custom URL"
echo ""

# Default to XM if no input
read -p "Select broker (1-5) [1]: " BROKER_CHOICE
BROKER_CHOICE=${BROKER_CHOICE:-1}

case $BROKER_CHOICE in
    1)
        BROKER="XM"
        MT4_URL="${MT4_URLS[$BROKER]}"
        ;;
    2)
        BROKER="IC Markets"
        MT4_URL="${MT4_URLS[$BROKER]}"
        ;;
    3)
        BROKER="Admiral Markets"
        MT4_URL="${MT4_URLS[$BROKER]}"
        ;;
    4)
        BROKER="FBS"
        MT4_URL="${MT4_URLS[$BROKER]}"
        ;;
    5)
        read -p "Enter custom MT4 installer URL: " MT4_URL
        BROKER="Custom"
        ;;
    *)
        echo -e "${RED}Invalid choice. Using XM as default.${NC}"
        BROKER="XM"
        MT4_URL="${MT4_URLS[$BROKER]}"
        ;;
esac

echo ""
echo -e "${GREEN}Selected Broker: $BROKER${NC}"
echo -e "${GREEN}Download URL: $MT4_URL${NC}"
echo ""

# Download MT4 installer
echo "[1/4] Downloading MT4 installer..."
wget -O /tmp/mt4setup.exe "$MT4_URL" || {
    echo -e "${RED}Failed to download MT4 installer${NC}"
    exit 1
}

echo -e "${GREEN}✓ Download complete${NC}"
echo ""

# Install MT4 using Wine
echo "[2/4] Installing MT4 with Wine..."
echo "This may take 2-3 minutes..."

DISPLAY=:0 wine /tmp/mt4setup.exe /S /D="C:\\Program Files\\MetaTrader 4" || {
    echo -e "${YELLOW}⚠ Installation completed with warnings (this is normal)${NC}"
}

sleep 5

# Wait for installation to complete
echo "Waiting for installation to complete..."
sleep 10

echo -e "${GREEN}✓ Installation complete${NC}"
echo ""

# Verify installation
echo "[3/4] Verifying installation..."

MT4_PATH="/root/.wine/drive_c/Program Files/MetaTrader 4"
if [ -d "$MT4_PATH" ]; then
    echo -e "${GREEN}✓ MT4 directory found: $MT4_PATH${NC}"

    if [ -f "$MT4_PATH/terminal.exe" ]; then
        echo -e "${GREEN}✓ terminal.exe found${NC}"
    else
        echo -e "${YELLOW}⚠ terminal.exe not found, checking alternative paths...${NC}"
        find /root/.wine/drive_c/ -name "terminal.exe" -o -name "mt4terminal.exe" 2>/dev/null | head -5
    fi
else
    echo -e "${YELLOW}⚠ Standard MT4 directory not found, checking installed files...${NC}"
    find /root/.wine/drive_c/ -type d -name "*MetaTrader*" 2>/dev/null | head -5
fi

echo ""

# Copy Expert Advisor and libraries
echo "[4/4] Setting up MT4Bridge Expert Advisor..."

# Find actual MT4 installation path
ACTUAL_MT4_PATH=$(find /root/.wine/drive_c/ -name "terminal.exe" -type f 2>/dev/null | head -1 | xargs dirname)

if [ -z "$ACTUAL_MT4_PATH" ]; then
    echo -e "${RED}✗ Could not find MT4 installation${NC}"
    echo "Please install MT4 manually via VNC"
    exit 1
fi

echo -e "${GREEN}Found MT4 at: $ACTUAL_MT4_PATH${NC}"

# Create MQL4 directories if they don't exist
mkdir -p "$ACTUAL_MT4_PATH/MQL4/Experts"
mkdir -p "$ACTUAL_MT4_PATH/MQL4/Include"
mkdir -p "$ACTUAL_MT4_PATH/MQL4/Libraries"

# Copy EA files (they're already mounted via Docker volumes)
echo "EA files are already mounted via Docker volumes:"
echo "  - /opt/mariposa-scalping/mt4-bridge/experts → MQL4/Experts"
echo "  - /opt/mariposa-scalping/mt4-bridge/include → MQL4/Include"
echo "  - /opt/mariposa-scalping/mt4-bridge/libraries → MQL4/Libraries"

echo ""
echo -e "${GREEN}✓ Setup complete${NC}"
echo ""

# Cleanup
rm -f /tmp/mt4setup.exe

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Installation Complete!                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "1. Connect via VNC to the container"
echo "2. Launch MT4: wine \"$ACTUAL_MT4_PATH/terminal.exe\""
echo "3. Login with your broker credentials"
echo "4. Enable Expert Advisors (Tools → Options → Expert Advisors)"
echo "5. Attach MT4Bridge EA to any chart"
echo ""
echo "VNC Connection:"
echo "  Address: YOUR_VPS_IP:5900"
echo "  Password: mt4bridge2024"
echo ""
