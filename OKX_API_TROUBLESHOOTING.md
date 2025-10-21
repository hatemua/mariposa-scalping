# OKX API Troubleshooting Guide

## Current Status

✅ **Signal Pipeline Working**: Position sizes calculated, prices fetched, trades scheduled
❌ **OKX API Failing**: "All operations failed" error

## Error Analysis

Your logs show:
```
💰 Trade calculation: 8 USDT / 111993.13 = 0.0000714 BTCUSDT  ✅ CORRECT
Error creating market order: Error: OKX API Error: All operations failed  ❌ OKX ISSUE
```

This means:
- ✅ Signal detection working
- ✅ LLM validation working
- ✅ Position size calculation working
- ✅ Price fetching working
- ❌ **OKX API rejecting the order**

## Common Causes

### 1. **Missing OKX API Credentials** (MOST LIKELY)

**Check**: Does the user have OKX credentials configured?

```javascript
// MongoDB query
db.users.findOne({}, {
  okxApiKey: 1,
  okxSecretKey: 1,
  okxPassphrase: 1
})
```

**If missing**, you'll now see:
```
❌ OKX credentials missing for user 68e42da6ecf6d882fa0a993f
   Has API Key: false, Has Secret: false, Has Passphrase: false
Error: OKX API credentials not configured for user. Please add your OKX API credentials in settings.
```

**Solution**: Add OKX API credentials via your API or dashboard

---

### 2. **Insufficient Balance in OKX Account**

**Check**: Does the OKX account have enough USDT?

With enhanced logging, you'll now see the order request:
```
📤 OKX Order Request:
{
  "instId": "BTC-USDT",
  "tdMode": "cash",
  "side": "buy",
  "ordType": "market",
  "sz": "0.0000714"
}

📥 OKX Response: code=51008, msg=Insufficient balance
❌ OKX API Error Details: { code: '51008', msg: 'Insufficient balance', ... }
```

**Solution**:
- Fund your OKX account with USDT
- Or lower agent budgets to match available balance

---

### 3. **Order Size Too Small**

OKX has minimum order sizes:
- **BTC**: Minimum ~0.00001 BTC (varies by market)
- **ETH**: Minimum ~0.0001 ETH

Your order: `0.0000714 BTC` (from 8 USDT ÷ $111,993)

**If too small**, OKX response might be:
```
📥 OKX Response: code=51020, msg=Order size too small
```

**Solution**:
- Increase agent budget (currently agents using 8 USDT positions)
- Increase `positionSizePercent` in LLM validation

---

### 4. **Invalid Symbol Format**

**Check symbol conversion**:
```
Input: BTCUSDT (Binance format)
Converted: BTC-USDT (OKX format)
```

With logging, you'll see:
```
📤 OKX Order Request:
{
  "instId": "BTC-USDT",  ← Should be hyphenated
  ...
}
```

**If wrong format**:
```
📥 OKX Response: code=51001, msg=Instrument ID does not exist
```

---

### 5. **API Permissions Issue**

OKX API keys need **Trade** permission enabled.

**Check in OKX**:
1. Log into OKX account
2. API Management
3. Verify your API key has:
   - ✅ Read permission
   - ✅ **Trade permission** (REQUIRED)
   - IP whitelist (if enabled)

**If permission issue**:
```
📥 OKX Response: code=50113, msg=Invalid sign
```

---

## Diagnostic Steps

### Step 1: Check Credentials
```bash
# After restart, look for this log
❌ OKX credentials missing for user ...
```

If you see this, credentials are not configured.

### Step 2: Check Order Details
After rebuild, next order attempt will show:
```
📤 OKX Order Request: { ... }
📥 OKX Response: code=..., msg=...
❌ OKX API Error Details: { ... }
```

**Common error codes**:
- `51001` - Invalid symbol
- `51008` - Insufficient balance
- `51020` - Order size too small
- `50113` - Invalid signature (wrong credentials)
- `50111` - Invalid API key

### Step 3: Manual OKX API Test

Test your credentials directly:

```bash
curl -X GET "https://www.okx.com/api/v5/account/balance" \
  -H "OK-ACCESS-KEY: your_api_key" \
  -H "OK-ACCESS-SIGN: ..." \
  -H "OK-ACCESS-TIMESTAMP: ..." \
  -H "OK-ACCESS-PASSPHRASE: your_passphrase"
```

---

## Quick Fixes

### Fix #1: Configure OKX Credentials

**If using demo/test mode**, you can either:

1. **Option A: Add real OKX credentials**
   - Create OKX account
   - Generate API key with Trade permission
   - Add to user document in MongoDB

2. **Option B: Disable actual trading (testing mode)**
   - Signals will be detected and validated
   - But no actual trades will be placed
   - Modify `agendaService.ts` to skip OKX execution

### Fix #2: Increase Minimum Position Size

**Current**: LLM calculating position sizes like 8 USDT (too small for BTC)

**Solution**: Edit `signalValidationService.ts`:

```typescript
// Line ~79: Set minimum position size
const positionSize = Math.max(20, availableBalance * 0.1); // Min $20
```

This ensures orders are always ≥$20, avoiding "too small" errors.

### Fix #3: Skip OKX Execution for Testing

If you just want to test the signal pipeline without real trades:

**Edit** `src/services/agendaService.ts`:

```typescript
// Trade Execution Job (line ~89)
this.agenda.define('execute-trade', async (job: any) => {
  const { userId, agentId, symbol, side, type, amount, price } = job.attrs.data;

  console.log(`🎯 SIMULATED TRADE: ${side} ${amount} ${symbol} @ ${price}`);
  console.log(`   (Skipping actual OKX execution for testing)`);

  // Save simulated trade to database
  const trade = new Trade({
    userId,
    agentId,
    symbol,
    side,
    type,
    quantity: amount,
    price: price,
    status: 'filled', // Mark as filled immediately
    filledPrice: price,
    filledQuantity: amount
  });

  await trade.save();
  console.log(`✅ Simulated trade saved to database`);

  // Skip actual OKX execution
  // await okxService.executeScalpingOrder(...)
});
```

This lets you test the entire pipeline without needing OKX credentials or balance.

---

## Next Steps

1. **Restart server** - Enhanced logging is now active
2. **Wait for next signal** (30-60 seconds)
3. **Check logs** for:
   ```
   📤 OKX Order Request: { ... }
   📥 OKX Response: code=..., msg=...
   ```
4. **Identify specific error code** from OKX response
5. **Apply appropriate fix** based on error code

The enhanced logging will tell you exactly why OKX is rejecting orders!

---

## Summary

✅ **Your signal pipeline is working perfectly**:
- Real Binance data
- LLM analysis
- Signal broadcasting
- Validation
- Position sizing
- Queue execution

❌ **Only issue is OKX API configuration/balance**

Most likely causes:
1. No OKX credentials configured (check user document)
2. No USDT balance in OKX account
3. Order sizes too small for OKX minimums

The enhanced error logging will show you exactly which one it is on the next trade attempt!
