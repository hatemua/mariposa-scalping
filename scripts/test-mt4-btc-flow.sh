#!/bin/bash

# MT4 BTC Complete Trading Flow Test
# Tests: Agent creation → Order open → Monitor → Order close

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
API_URL="${API_URL:-http://localhost:5004/api}"
BRIDGE_URL="${BRIDGE_URL:-http://localhost:8080}"
BRIDGE_USER="${BRIDGE_USER:-admin}"
BRIDGE_PASS="${BRIDGE_PASS:-changeme123}"

# JWT Token (pass as environment variable or it will prompt)
if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠️  No JWT token provided${NC}"
    echo -e "${CYAN}Set TOKEN environment variable or the script will use bridge API directly${NC}"
    echo ""
    USE_BRIDGE_DIRECT=true
else
    USE_BRIDGE_DIRECT=false
fi

# Test parameters
VOLUME="${VOLUME:-0.01}"  # Default 0.01 lots
MONITOR_TIME="${MONITOR_TIME:-10}"  # Monitor for 10 seconds

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}    MT4 BTC Trading Flow Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Configuration:${NC}"
echo "  API URL: $API_URL"
echo "  Bridge URL: $BRIDGE_URL"
echo "  Volume: $VOLUME lots"
echo "  Monitor Time: $MONITOR_TIME seconds"
echo "  Mode: $([ "$USE_BRIDGE_DIRECT" = true ] && echo 'Direct Bridge' || echo 'Backend API')"
echo ""

# Error handling
trap 'echo -e "${RED}❌ Test failed at line $LINENO${NC}"; exit 1' ERR

# Step 1: Health Check
echo -e "${YELLOW}[Step 1] Running Health Check...${NC}"
if ! curl -s "$BRIDGE_URL/api/v1/ping" > /dev/null 2>&1; then
    echo -e "${RED}❌ MT4 Bridge not responding!${NC}"
    echo -e "${CYAN}Run: ./scripts/check-mt4-health.sh${NC}"
    exit 1
fi

PING_RESPONSE=$(curl -s "$BRIDGE_URL/api/v1/ping")
echo "$PING_RESPONSE" | jq '.'

ZMQ_CONNECTED=$(echo "$PING_RESPONSE" | jq -r '.zmq_connected')
if [ "$ZMQ_CONNECTED" != "true" ]; then
    echo -e "${RED}❌ ZeroMQ not connected to MT4!${NC}"
    echo -e "${CYAN}Check MT4 Expert Advisor via VNC: vnc://localhost:5900${NC}"
    exit 1
fi

echo -e "${GREEN}✅ MT4 Bridge is healthy${NC}"
echo ""

# Step 2: Create Agent (if using backend API)
AGENT_ID=""
if [ "$USE_BRIDGE_DIRECT" = false ]; then
    echo -e "${YELLOW}[Step 2] Creating MT4 Scalping Agent...${NC}"

    AGENT_RESPONSE=$(curl -s -X POST "$API_URL/agents" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Test BTC Scalper '"$(date +%s)"'",
            "broker": "MT4",
            "category": "SCALPING",
            "riskLevel": 3,
            "budget": 100,
            "description": "Automated test agent for BTC scalping"
        }')

    if echo "$AGENT_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
        AGENT_ID=$(echo "$AGENT_RESPONSE" | jq -r '.data._id')
        echo -e "${GREEN}✅ Agent created: $AGENT_ID${NC}"
        echo "$AGENT_RESPONSE" | jq '.data | {name, broker, category, minLLMConfidence, maxOpenPositions}'
    else
        echo -e "${RED}❌ Failed to create agent${NC}"
        echo "$AGENT_RESPONSE" | jq '.'
        exit 1
    fi
else
    echo -e "${CYAN}[Step 2] Skipping agent creation (using bridge directly)${NC}"
fi
echo ""

# Step 3: Get Current BTC Price
echo -e "${YELLOW}[Step 3] Fetching Current BTC Price...${NC}"

PRICE_RESPONSE=$(curl -s -u "$BRIDGE_USER:$BRIDGE_PASS" \
    "$BRIDGE_URL/api/v1/price/BTCUSDm")

if echo "$PRICE_RESPONSE" | jq -e '.bid' > /dev/null 2>&1; then
    BID=$(echo "$PRICE_RESPONSE" | jq -r '.bid')
    ASK=$(echo "$PRICE_RESPONSE" | jq -r '.ask')
    SPREAD=$(echo "$PRICE_RESPONSE" | jq -r '.spread')

    echo -e "${GREEN}✅ BTC Price Retrieved${NC}"
    echo "  Bid: \$$BID"
    echo "  Ask: \$$ASK"
    echo "  Spread: \$$SPREAD"
else
    echo -e "${RED}❌ Failed to get price${NC}"
    echo "$PRICE_RESPONSE" | jq '.'
    exit 1
fi
echo ""

# Calculate SL/TP (100 points range for test)
SL=$(echo "$ASK - 100" | bc)
TP=$(echo "$ASK + 100" | bc)

echo -e "${CYAN}Calculated Stop Loss: \$$SL${NC}"
echo -e "${CYAN}Calculated Take Profit: \$$TP${NC}"
echo ""

# Step 4: Open BTC Buy Order
echo -e "${YELLOW}[Step 4] Opening BTC Buy Order...${NC}"
echo "  Symbol: BTCUSDm"
echo "  Side: BUY"
echo "  Volume: $VOLUME lots"
echo "  SL: \$$SL"
echo "  TP: \$$TP"
echo ""

if [ "$USE_BRIDGE_DIRECT" = true ]; then
    # Use bridge API directly
    ORDER_RESPONSE=$(curl -s -X POST "$BRIDGE_URL/api/v1/orders" \
        -u "$BRIDGE_USER:$BRIDGE_PASS" \
        -H "Content-Type: application/json" \
        -d "{
            \"symbol\": \"BTCUSDm\",
            \"side\": \"BUY\",
            \"volume\": $VOLUME,
            \"stopLoss\": $SL,
            \"takeProfit\": $TP,
            \"comment\": \"Test Order - Flow Test $(date +%s)\"
        }")
else
    # Use backend API
    ORDER_RESPONSE=$(curl -s -X POST "$API_URL/mt4/orders" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"symbol\": \"BTCUSD\",
            \"side\": \"buy\",
            \"volume\": $VOLUME,
            \"stopLoss\": $SL,
            \"takeProfit\": $TP
        }")
fi

# Extract ticket number
if echo "$ORDER_RESPONSE" | jq -e '.order.ticket' > /dev/null 2>&1; then
    TICKET=$(echo "$ORDER_RESPONSE" | jq -r '.order.ticket')
elif echo "$ORDER_RESPONSE" | jq -e '.data.ticket' > /dev/null 2>&1; then
    TICKET=$(echo "$ORDER_RESPONSE" | jq -r '.data.ticket')
else
    echo -e "${RED}❌ Failed to open order${NC}"
    echo "$ORDER_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}✅ Order Opened Successfully${NC}"
echo "  Ticket: #$TICKET"
echo "$ORDER_RESPONSE" | jq '.order // .data | {ticket, symbol, type, volume, openPrice, profit}'
echo ""

# Step 5: Monitor Position
echo -e "${YELLOW}[Step 5] Monitoring Position for $MONITOR_TIME seconds...${NC}"
echo ""

for i in $(seq 1 $MONITOR_TIME); do
    POSITION_RESPONSE=$(curl -s -u "$BRIDGE_USER:$BRIDGE_PASS" \
        "$BRIDGE_URL/api/v1/orders/$TICKET")

    if echo "$POSITION_RESPONSE" | jq -e '.order' > /dev/null 2>&1; then
        CURRENT_PRICE=$(echo "$POSITION_RESPONSE" | jq -r '.order.currentPrice')
        PROFIT=$(echo "$POSITION_RESPONSE" | jq -r '.order.profit')
        STATUS=$(echo "$POSITION_RESPONSE" | jq -r '.order.status')

        if [ "$STATUS" != "open" ]; then
            echo -e "${YELLOW}⚠️  Position closed automatically (SL/TP hit)${NC}"
            echo "$POSITION_RESPONSE" | jq '.order'
            break
        fi

        echo -e "${CYAN}[$i/$MONITOR_TIME] Price: \$$CURRENT_PRICE | P&L: \$$PROFIT${NC}"
    else
        echo -e "${RED}[$i/$MONITOR_TIME] Failed to get position data${NC}"
    fi

    sleep 1
done

echo ""

# Step 6: Close Position
echo -e "${YELLOW}[Step 6] Closing Position...${NC}"

# Check if still open
FINAL_CHECK=$(curl -s -u "$BRIDGE_USER:$BRIDGE_PASS" \
    "$BRIDGE_URL/api/v1/orders/$TICKET")

FINAL_STATUS=$(echo "$FINAL_CHECK" | jq -r '.order.status')

if [ "$FINAL_STATUS" = "open" ]; then
    if [ "$USE_BRIDGE_DIRECT" = true ]; then
        CLOSE_RESPONSE=$(curl -s -X POST "$BRIDGE_URL/api/v1/orders/close" \
            -u "$BRIDGE_USER:$BRIDGE_PASS" \
            -H "Content-Type: application/json" \
            -d "{\"ticket\": $TICKET}")
    else
        CLOSE_RESPONSE=$(curl -s -X POST "$API_URL/mt4/orders/close" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"ticket\": $TICKET}")
    fi

    if echo "$CLOSE_RESPONSE" | jq -e '.order // .data' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Position Closed Successfully${NC}"
        echo "$CLOSE_RESPONSE" | jq '.order // .data | {ticket, openPrice, closePrice, profit, status}'
    else
        echo -e "${RED}❌ Failed to close position${NC}"
        echo "$CLOSE_RESPONSE" | jq '.'
        exit 1
    fi
else
    echo -e "${CYAN}Position already closed (SL/TP or auto-close)${NC}"
    echo "$FINAL_CHECK" | jq '.order | {ticket, openPrice, closePrice, profit, status}'
fi

echo ""

# Step 7: Verify Position is Closed
echo -e "${YELLOW}[Step 7] Verifying Position Closure...${NC}"

sleep 2

VERIFY_RESPONSE=$(curl -s -u "$BRIDGE_USER:$BRIDGE_PASS" \
    "$BRIDGE_URL/api/v1/orders/open?symbol=BTCUSDm")

OPEN_COUNT=$(echo "$VERIFY_RESPONSE" | jq '.orders | length')

echo "  Open BTC positions: $OPEN_COUNT"

if [ "$OPEN_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ No open positions remaining${NC}"
else
    echo -e "${YELLOW}⚠️  Still has $OPEN_COUNT open position(s)${NC}"
    echo "$VERIFY_RESPONSE" | jq '.orders'
fi

echo ""

# Final Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}          Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get final P&L
FINAL_PNL=$(echo "$CLOSE_RESPONSE" | jq -r '.order.profit // .data.profit // "0"')

echo -e "${GREEN}✅ Test Completed Successfully!${NC}"
echo ""
echo "  Ticket Number: #$TICKET"
if [ -n "$AGENT_ID" ]; then
    echo "  Agent ID: $AGENT_ID"
fi
echo "  Entry Price: \$$ASK"
echo "  Volume: $VOLUME lots"
echo "  Final P&L: \$$FINAL_PNL"
echo ""

if (( $(echo "$FINAL_PNL > 0" | bc -l) )); then
    echo -e "${GREEN}💰 Trade was profitable!${NC}"
elif (( $(echo "$FINAL_PNL < 0" | bc -l) )); then
    echo -e "${RED}📉 Trade had a loss${NC}"
else
    echo -e "${CYAN}➖ Trade broke even${NC}"
fi

echo ""
echo -e "${CYAN}📊 View detailed logs:${NC}"
echo "  pm2 logs 0 --lines 50"
echo ""
echo -e "${CYAN}🔍 Check PM2 logs for debug output:${NC}"
echo "  grep '[MT4]' ~/.pm2/logs/npm-out.log"
echo ""

exit 0
