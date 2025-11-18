#!/bin/bash

# MT4 Health Check Script
# Verifies all MT4 trading system components are operational

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Status indicators
SUCCESS="✅"
FAIL="❌"
WARN="⚠️"
INFO="ℹ️"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   MT4 Trading System Health Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

HEALTH_STATUS=0

# 1. Check Docker Containers
echo -e "${YELLOW}[1] Checking Docker Containers...${NC}"
if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "mt4-terminal|mt4-bridge-server" > /dev/null 2>&1; then
    echo -e "${SUCCESS} Docker containers running:"
    docker ps --filter "name=mt4" --format "  - {{.Names}}: {{.Status}}"
else
    echo -e "${FAIL} MT4 Docker containers not found!"
    echo -e "${INFO} Expected: mt4-terminal, mt4-bridge-server"
    HEALTH_STATUS=1
fi
echo ""

# 2. Check MT4 Bridge API
echo -e "${YELLOW}[2] Testing MT4 Bridge API...${NC}"
BRIDGE_RESPONSE=$(curl -s http://localhost:8080/api/v1/ping 2>&1 || echo "FAILED")

if echo "$BRIDGE_RESPONSE" | grep -q "status"; then
    echo -e "${SUCCESS} Bridge API is responding"
    echo "$BRIDGE_RESPONSE" | jq '.' 2>/dev/null || echo "$BRIDGE_RESPONSE"

    # Check ZMQ connection
    if echo "$BRIDGE_RESPONSE" | jq -e '.zmq_connected == true' > /dev/null 2>&1; then
        echo -e "${SUCCESS} ZeroMQ connection: ACTIVE"
    else
        echo -e "${WARN} ZeroMQ connection: NOT CONNECTED"
        echo -e "${INFO} Check MT4 Expert Advisor is running"
        HEALTH_STATUS=1
    fi
else
    echo -e "${FAIL} Bridge API not responding"
    echo -e "${INFO} Response: $BRIDGE_RESPONSE"
    echo -e "${INFO} Check: docker logs mt4-bridge-server"
    HEALTH_STATUS=1
fi
echo ""

# 3. Check Backend Server
echo -e "${YELLOW}[3] Checking Backend Server...${NC}"
BACKEND_RESPONSE=$(curl -s http://localhost:5004/health 2>&1 || echo "FAILED")

if echo "$BACKEND_RESPONSE" | grep -q "status"; then
    echo -e "${SUCCESS} Backend server is running (port 5004)"
else
    echo -e "${WARN} Backend health check failed"
    echo -e "${INFO} Checking PM2 process..."
    if pm2 list | grep -q "online"; then
        echo -e "${SUCCESS} PM2 process is online"
    else
        echo -e "${FAIL} PM2 process not running"
        HEALTH_STATUS=1
    fi
fi
echo ""

# 4. Check Port Availability
echo -e "${YELLOW}[4] Checking Required Ports...${NC}"

check_port() {
    local PORT=$1
    local DESC=$2

    if netstat -an 2>/dev/null | grep -q ":$PORT " || ss -an 2>/dev/null | grep -q ":$PORT "; then
        echo -e "${SUCCESS} Port $PORT ($DESC): LISTENING"
    else
        echo -e "${FAIL} Port $PORT ($DESC): NOT LISTENING"
        HEALTH_STATUS=1
    fi
}

check_port 8080 "MT4 Bridge API"
check_port 5555 "ZeroMQ Socket"
check_port 5900 "VNC Server"
check_port 5004 "Backend API"
echo ""

# 5. Check MongoDB Connection
echo -e "${YELLOW}[5] Testing MongoDB Connection...${NC}"
if command -v mongosh > /dev/null 2>&1; then
    MONGO_URI=$(grep MONGODB_URI .env | cut -d '=' -f2 | tr -d '"')
    if [ -n "$MONGO_URI" ]; then
        if mongosh "$MONGO_URI" --eval "db.adminCommand('ping')" --quiet > /dev/null 2>&1; then
            echo -e "${SUCCESS} MongoDB connection: OK"
        else
            echo -e "${FAIL} MongoDB connection: FAILED"
            HEALTH_STATUS=1
        fi
    else
        echo -e "${WARN} MONGODB_URI not found in .env"
    fi
else
    echo -e "${WARN} mongosh not installed, skipping MongoDB check"
fi
echo ""

# 6. Check Redis Connection
echo -e "${YELLOW}[6] Testing Redis Connection...${NC}"
if command -v redis-cli > /dev/null 2>&1; then
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${SUCCESS} Redis connection: OK"
    else
        echo -e "${FAIL} Redis connection: FAILED"
        HEALTH_STATUS=1
    fi
else
    echo -e "${WARN} redis-cli not installed, skipping Redis check"
fi
echo ""

# 7. Check Bridge Authentication
echo -e "${YELLOW}[7] Testing Bridge Authentication...${NC}"
AUTH_TEST=$(curl -s -u admin:changeme123 http://localhost:8080/api/v1/ping 2>&1 || echo "FAILED")

if echo "$AUTH_TEST" | grep -q "status"; then
    echo -e "${SUCCESS} Bridge authentication: OK"
else
    echo -e "${FAIL} Bridge authentication: FAILED"
    echo -e "${INFO} Check MT4_BRIDGE_USERNAME and MT4_BRIDGE_PASSWORD in .env"
    HEALTH_STATUS=1
fi
echo ""

# 8. Check Available Symbols
echo -e "${YELLOW}[8] Checking Available Trading Symbols...${NC}"
SYMBOLS=$(curl -s -u admin:changeme123 http://localhost:8080/api/v1/symbols 2>&1 || echo "FAILED")

if echo "$SYMBOLS" | grep -q "symbols"; then
    SYMBOL_COUNT=$(echo "$SYMBOLS" | jq '.symbols | length' 2>/dev/null || echo "0")
    echo -e "${SUCCESS} Available symbols: $SYMBOL_COUNT"

    # Check for BTC symbols
    if echo "$SYMBOLS" | jq -e '.symbols[] | select(.symbol | contains("BTC"))' > /dev/null 2>&1; then
        echo -e "${SUCCESS} BTC symbols available:"
        echo "$SYMBOLS" | jq -r '.symbols[] | select(.symbol | contains("BTC")) | "  - \(.symbol)"' 2>/dev/null | head -5
    else
        echo -e "${WARN} No BTC symbols found"
    fi
else
    echo -e "${FAIL} Could not retrieve symbols"
    HEALTH_STATUS=1
fi
echo ""

# 9. Check Recent Bridge Logs
echo -e "${YELLOW}[9] Recent MT4 Bridge Logs...${NC}"
if docker logs mt4-bridge-server --tail 5 2>&1 | grep -q ""; then
    echo -e "${INFO} Last 5 log entries:"
    docker logs mt4-bridge-server --tail 5 2>&1 | sed 's/^/  /'
else
    echo -e "${WARN} Could not retrieve bridge logs"
fi
echo ""

# 10. Check VNC Accessibility
echo -e "${YELLOW}[10] Checking VNC Server...${NC}"
if nc -z localhost 5900 2>/dev/null; then
    echo -e "${SUCCESS} VNC server accessible on localhost:5900"
    echo -e "${INFO} Connect with: open vnc://localhost:5900"
    echo -e "${INFO} Password: mt4bridge2024"
else
    echo -e "${WARN} VNC server not accessible"
    echo -e "${INFO} May not be critical if running headless"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}          Health Check Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ $HEALTH_STATUS -eq 0 ]; then
    echo -e "${GREEN}${SUCCESS} All systems operational!${NC}"
    echo -e "${GREEN}MT4 trading system is ready for testing.${NC}"
    echo ""
    echo -e "${INFO} Next steps:"
    echo "  1. Configure MT4 credentials: POST /api/mt4/configure"
    echo "  2. Create MT4 agent: POST /api/agents"
    echo "  3. Run test: ./scripts/test-mt4-btc-flow.sh"
else
    echo -e "${RED}${FAIL} Some components are not operational.${NC}"
    echo -e "${YELLOW}Please fix the issues above before running tests.${NC}"
    echo ""
    echo -e "${INFO} Common fixes:"
    echo "  - Start Docker containers: docker-compose up -d"
    echo "  - Restart MT4 bridge: docker restart mt4-bridge-server"
    echo "  - Check MT4 EA: Connect to VNC and verify green smiley"
    echo "  - Restart backend: pm2 restart 0"
fi

echo ""
exit $HEALTH_STATUS
