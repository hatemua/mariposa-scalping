#!/bin/bash
# Simple MT4 Trading API Test
set -e

BRIDGE_URL="${MT4_BRIDGE_URL:-http://localhost:8080}"
USERNAME="${MT4_BRIDGE_USERNAME:-admin}"
PASSWORD="${MT4_BRIDGE_PASSWORD:-changeme123}"
AUTH="$USERNAME:$PASSWORD"
SYMBOL="${1:-EURUSD}"
VOLUME="${2:-0.01}"

echo "MT4 TRADING API TEST"
echo "Bridge: $BRIDGE_URL"
echo "Symbol: $SYMBOL | Volume: $VOLUME lots"
echo ""

echo "[1] Health Check..."
curl -s "$BRIDGE_URL/api/v1/ping" | jq '.'

echo -e "\n[2] Account Info..."
curl -s -u "$AUTH" "$BRIDGE_URL/api/v1/account/info" | jq '.'

echo -e "\n[3] Current Price..."
curl -s -u "$AUTH" "$BRIDGE_URL/api/v1/price/$SYMBOL" | jq '.'

echo -e "\n[4] Execute BUY Order..."
ORDER=$(curl -s -u "$AUTH" -X POST "$BRIDGE_URL/api/v1/orders" \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"$SYMBOL\",\"side\":\"BUY\",\"volume\":$VOLUME}")
echo "$ORDER" | jq '.'

TICKET=$(echo "$ORDER" | jq -r '.order.ticket // empty')
echo "Ticket: $TICKET"

echo -e "\n[5] Verify Open Position..."
sleep 1
curl -s -u "$AUTH" "$BRIDGE_URL/api/v1/orders/open" | jq '.'

echo -e "\n[6] Close Position..."
curl -s -u "$AUTH" -X POST "$BRIDGE_URL/api/v1/orders/close" \
  -H "Content-Type: application/json" \
  -d "{\"ticket\":$TICKET}" | jq '.'

echo -e "\n✅ TEST COMPLETE!"
