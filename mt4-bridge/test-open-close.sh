#!/bin/bash
#==============================================================================
# MT4 Bridge - Open and Close BTC Position Test Script
#==============================================================================
# This script tests the MT4 Bridge API by:
# 1. Opening a BTC position (buy order)
# 2. Waiting a few seconds
# 3. Closing the position using the returned ticket number
#==============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:8080"
USERNAME="admin"
PASSWORD="changeme123"
SYMBOL="BTCUSDm"
LOTS="0.01"
WAIT_TIME=5

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  MT4 Bridge - Open/Close BTC Test${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

#==============================================================================
# Step 1: Open BTC Position
#==============================================================================
echo -e "${YELLOW}[1/4] Opening BTC position...${NC}"
echo -e "  Symbol: ${SYMBOL}"
echo -e "  Lots: ${LOTS}"
echo -e "  Type: BUY"
echo ""

OPEN_RESPONSE=$(curl -s -u ${USERNAME}:${PASSWORD} \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"${SYMBOL}\",\"side\":\"BUY\",\"volume\":${LOTS}}" \
  ${API_URL}/api/v1/orders)

echo -e "  Response: ${OPEN_RESPONSE}"

# Extract ticket number
TICKET=$(echo $OPEN_RESPONSE | jq -r '.ticket // empty')

if [ -z "$TICKET" ] || [ "$TICKET" == "null" ]; then
  echo -e "${RED}✗ Failed to open position!${NC}"
  echo -e "  Error: $(echo $OPEN_RESPONSE | jq -r '.error // "Unknown error"')"
  exit 1
fi

echo -e "${GREEN}✓ Position opened successfully!${NC}"
echo -e "  Ticket: ${TICKET}"
echo ""

#==============================================================================
# Step 2: Verify Position is Open
#==============================================================================
echo -e "${YELLOW}[2/4] Verifying position...${NC}"

OPEN_ORDERS=$(curl -s -u ${USERNAME}:${PASSWORD} \
  ${API_URL}/api/v1/orders/open)

ORDER_EXISTS=$(echo $OPEN_ORDERS | jq ".orders[] | select(.ticket == ${TICKET})")

if [ -z "$ORDER_EXISTS" ]; then
  echo -e "${RED}✗ Position not found in open orders!${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Position confirmed in open orders${NC}"
echo -e "  Open Price: $(echo $ORDER_EXISTS | jq -r '.openPrice')"
echo -e "  Current P/L: $(echo $ORDER_EXISTS | jq -r '.profit')"
echo ""

#==============================================================================
# Step 3: Wait
#==============================================================================
echo -e "${YELLOW}[3/4] Waiting ${WAIT_TIME} seconds before closing...${NC}"
for i in $(seq $WAIT_TIME -1 1); do
  echo -ne "  ${i}... \r"
  sleep 1
done
echo -e "  ${GREEN}Ready to close!${NC}                    "
echo ""

#==============================================================================
# Step 4: Close Position
#==============================================================================
echo -e "${YELLOW}[4/4] Closing position...${NC}"
echo -e "  Ticket: ${TICKET}"
echo ""

CLOSE_RESPONSE=$(curl -s -u ${USERNAME}:${PASSWORD} \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"ticket\":${TICKET}}" \
  ${API_URL}/api/v1/orders/close)

echo -e "  Response: ${CLOSE_RESPONSE}"

# Check if close was successful
SUCCESS=$(echo $CLOSE_RESPONSE | jq -r '.success // empty')

if [ "$SUCCESS" == "true" ]; then
  echo -e "${GREEN}✓ Position closed successfully!${NC}"
else
  echo -e "${RED}✗ Failed to close position!${NC}"
  echo -e "  Error: $(echo $CLOSE_RESPONSE | jq -r '.error // "Unknown error"')"
  exit 1
fi

echo ""

#==============================================================================
# Final Verification
#==============================================================================
echo -e "${YELLOW}Verifying position is closed...${NC}"

OPEN_ORDERS_AFTER=$(curl -s -u ${USERNAME}:${PASSWORD} \
  ${API_URL}/api/v1/orders/open)

ORDER_STILL_EXISTS=$(echo $OPEN_ORDERS_AFTER | jq ".orders[] | select(.ticket == ${TICKET})")

if [ -z "$ORDER_STILL_EXISTS" ]; then
  echo -e "${GREEN}✓ Position no longer in open orders${NC}"
else
  echo -e "${RED}✗ Position still appears in open orders!${NC}"
  exit 1
fi

echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${GREEN}  ✓ TEST COMPLETED SUCCESSFULLY!${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo "Summary:"
echo "  • Opened BTC ${LOTS} lots at ticket ${TICKET}"
echo "  • Position was visible in open orders"
echo "  • Successfully closed the position"
echo "  • Position removed from open orders"
echo ""
