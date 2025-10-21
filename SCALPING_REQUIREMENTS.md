# OKX Scalping Capital Requirements

## Minimum Capital Requirements

### Exchange Requirements (OKX)
- **Minimum order value**: $20 USDT per trade
- **Minimum order size**: Varies by symbol (e.g., 0.1 LINK, 0.01 ETH, 0.01 SOL)
- **Order value** = quantity × price must be ≥ $20

### System Requirements
- **Minimum agent budget**: $50 USDT
  - Allows for 2 trades at $20 each with buffer
  - Prevents single-trade agents (poor risk management)
  - Covers potential fees and slippage

## Recommended Budget Tiers

### 🟢 Conservative ($100 - $300)
```
Budget: $100 - $300
Position Size: 2-3% per trade
Trade Size: $20 - $30 per trade
Max Concurrent Trades: 5-10
Risk Level: 1-2
Best For: Learning, low-risk scalping
```

**Formula:**
```
positionSize = max($20, budget × 0.02)
maxTrades = floor(budget / positionSize)
```

**Example with $100:**
- Position size: $20 (2% would be $2, but $20 minimum applies)
- Max trades: 5 concurrent positions
- Risk: Limited by small position sizes

### 🟡 Moderate ($300 - $1,000)
```
Budget: $300 - $1,000
Position Size: 3-5% per trade
Trade Size: $30 - $50 per trade
Max Concurrent Trades: 10-20
Risk Level: 3
Best For: Active scalping, balanced approach
```

**Formula:**
```
positionSize = max($20, budget × 0.04)
maxTrades = floor(budget / positionSize)
```

**Example with $500:**
- Position size: $30 (6% of budget)
- Max trades: 16 concurrent positions
- Better diversification across symbols

### 🔴 Aggressive ($1,000+)
```
Budget: $1,000+
Position Size: 5-10% per trade
Trade Size: $50 - $200 per trade
Max Concurrent Trades: 20+
Risk Level: 4-5
Best For: Experienced traders, high-frequency scalping
```

**Formula:**
```
positionSize = max($20, budget × 0.07)
maxTrades = floor(budget / positionSize)
```

**Example with $2,000:**
- Position size: $140 (7% of budget)
- Max trades: 14 concurrent positions
- Higher profit potential, higher risk

## Position Sizing Formula

### Base Calculation
```typescript
// Step 1: Calculate percentage-based position size
const baseSizePercent = calculateBasedOnRisk(riskLevel); // 2-10%
const basePositionSize = budget × (baseSizePercent / 100);

// Step 2: Apply exchange minimum
const MIN_ORDER_VALUE = 20;
const positionSize = Math.max(MIN_ORDER_VALUE, basePositionSize);

// Step 3: Convert to quantity
const quantity = positionSize / currentPrice;

// Step 4: Validate against instrument minimums
const minQuantity = instrumentInfo.minSz; // e.g., 0.1 LINK
const finalQuantity = Math.max(quantity, minQuantity);

// Step 5: Ensure final order value still >= $20
const finalOrderValue = finalQuantity × currentPrice;
if (finalOrderValue < MIN_ORDER_VALUE) {
  finalQuantity = MIN_ORDER_VALUE / currentPrice;
}

// Step 6: Round to lot size
finalQuantity = Math.ceil(finalQuantity / lotSize) × lotSize;
```

### Risk-Based Position Size Adjustments

**Risk Level 1 (Ultra Conservative):**
- Position: 2-3% of budget
- Min: $20, Max: $50
- Focus: Capital preservation

**Risk Level 2 (Conservative):**
- Position: 3-4% of budget
- Min: $20, Max: $100
- Focus: Steady growth

**Risk Level 3 (Moderate):**
- Position: 4-6% of budget
- Min: $20, Max: $200
- Focus: Balanced risk/reward

**Risk Level 4 (Aggressive):**
- Position: 6-8% of budget
- Min: $20, Max: $500
- Focus: Growth optimization

**Risk Level 5 (Very Aggressive):**
- Position: 8-10% of budget
- Min: $20, Max: $1,000
- Focus: Maximum returns

## Example Scenarios

### Scenario 1: Small Account ($100)
```
Agent Budget: $100
Risk Level: 2
Base Position %: 3%

Calculation:
- Base position: $100 × 0.03 = $3
- Exchange minimum: $20
- Final position: $20 (minimum applies)
- Max positions: $100 / $20 = 5

Result: Can only open 5 positions max
```

### Scenario 2: Medium Account ($500)
```
Agent Budget: $500
Risk Level: 3
Base Position %: 5%

Calculation:
- Base position: $500 × 0.05 = $25
- Exchange minimum: $20 ✓
- Final position: $25
- Max positions: $500 / $25 = 20

Result: Can open 20 positions with good diversification
```

### Scenario 3: Large Account ($2,000)
```
Agent Budget: $2,000
Risk Level: 4
Base Position %: 7%

Calculation:
- Base position: $2,000 × 0.07 = $140
- Exchange minimum: $20 ✓
- Final position: $140
- Max positions: $2,000 / $140 = 14

Result: Larger positions allow for better profit capture
```

## Symbol-Specific Examples

### ETH-USDT @ $4,000
```
Minimum Size: 0.01 ETH
Position Size: $30

Calculation:
- Required quantity: $30 / $4,000 = 0.0075 ETH
- Below minimum 0.01 ETH
- Adjusted: 0.01 ETH
- Final value: 0.01 × $4,000 = $40 ✓

Result: $40 order (above $20 minimum)
```

### SOL-USDT @ $150
```
Minimum Size: 0.01 SOL
Position Size: $20

Calculation:
- Required quantity: $20 / $150 = 0.133 SOL
- Above minimum 0.01 SOL ✓
- Lot size: 0.000001
- Rounded: 0.133 SOL
- Final value: 0.133 × $150 = $19.95

Issue: Below $20!
- Adjust: $20 / $150 = 0.134 SOL
- Final value: 0.134 × $150 = $20.10 ✓

Result: $20.10 order (meets minimum)
```

### LINK-USDT @ $25
```
Minimum Size: 0.1 LINK
Position Size: $15

Calculation:
- Required quantity: $15 / $25 = 0.6 LINK
- Above minimum 0.1 LINK ✓
- Final value: 0.6 × $25 = $15

Issue: Below $20!
- Required for $20: $20 / $25 = 0.8 LINK
- Final value: 0.8 × $25 = $20 ✓

Result: $20 order (adjusted up)
```

## Validation Checklist

Before creating an agent, ensure:

- [ ] Budget ≥ $50 (system minimum)
- [ ] Budget ≥ $100 recommended for effective scalping
- [ ] Understand position sizes will be ≥ $20 per trade
- [ ] Account has sufficient USDT balance in OKX
- [ ] Risk level appropriate for budget size
- [ ] Max positions = budget / $20 (minimum calculation)

## Common Errors & Solutions

### Error: "Budget must be at least $50"
**Cause:** Agent budget below system minimum
**Solution:** Increase budget to $50 or more

### Error: "Order value $14.06 is below OKX minimum $20"
**Cause:** Calculated order too small
**Solution:** System auto-adjusts to $20 minimum

### Error: "Your order should meet or exceed the minimum order amount" (51020)
**Cause:** Order value < $20 after all calculations
**Solution:** System now prevents this, but if it occurs:
1. Check current price hasn't spiked
2. Verify instrument minimums are current
3. Review position size calculation

### Warning: "Trade value $XX below minimum $20"
**Cause:** LLM suggested position smaller than $20
**Solution:** System auto-adjusts, but consider:
1. Increasing agent risk level (1→2 or 2→3)
2. Increasing agent budget
3. Using fewer concurrent positions

## Best Practices

1. **Start with $100-300** for learning
2. **Use risk level 2-3** until profitable
3. **Monitor actual position sizes** in logs
4. **Allow 2-3× minimum** budget for flexibility ($100+ recommended)
5. **Consider fees** (OKX: ~0.1% per trade)
6. **Factor slippage** on volatile coins
7. **Review performance** before scaling up

## Fee Calculations

### OKX Fee Structure
- Maker fee: 0.08%
- Taker fee: 0.10%
- Market orders: Always taker (0.10%)

### Impact on Minimum Order
```
Order: $20
Fee: $20 × 0.001 = $0.02
Net: $19.98 executed

For profit after fees:
Minimum gain needed: >0.2% price movement
```

### Monthly Fee Estimate
```
Budget: $500
Trades/day: 10
Fee per trade: $0.20 (on $20 orders)
Daily fees: $2
Monthly fees: $60

Recommendation: Budget × 0.12 for monthly fees
$500 budget → expect ~$60/month in fees
```

## Summary

- **Absolute Minimum**: $50 (system requirement)
- **Recommended Start**: $100-300 (effective scalping)
- **Optimal Range**: $500-2,000 (best performance)
- **Per-Trade Minimum**: $20 (OKX requirement)
- **Position Formula**: `max($20, budget × riskPercent)`

The system automatically adjusts all orders to meet these requirements, but understanding them helps set realistic expectations and appropriate budgets.
