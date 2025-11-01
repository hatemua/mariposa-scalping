# Mariposa API - Setup & Usage Guide

## Quick Start (For You - The Owner)

### 1. Generate Your First API Key

You have two options:

#### Option A: Via API (After OTP Login)

```bash
# 1. Request OTP
curl -X POST http://localhost:3001/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com"}'

# 2. Verify OTP (check your email)
curl -X POST http://localhost:3001/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"userId":"USER_ID_FROM_STEP1","otpCode":"123456"}'

# Copy the JWT token from response

# 3. Generate API Key
curl -X POST http://localhost:3001/api/api-keys/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Key",
    "tier": "pro",
    "allowedIPs": []
  }'

# Response will include:
# {
#   "success": true,
#   "data": {
#     "apiKey": "mk_live_1234567890abcdef...",  ← COPY THIS
#     "keyPrefix": "mk_live_12345678",
#     "tier": "pro",
#     "warning": "Store this key securely. It will not be shown again."
#   }
# }
```

#### Option B: Direct MongoDB Insert (Quick Method)

```javascript
// In MongoDB shell or Compass
use mariposa-scalping;

db.apikeys.insertOne({
  userId: ObjectId("YOUR_USER_ID"),
  keyPrefix: "mk_live_admin01",
  keyHash: "$2a$10$...",  // Hash of "mk_live_admin01YourSecretKeyHere"
  name: "Admin Production Key",
  tier: "enterprise",
  requestsPerDay: -1,
  requestsPerMinute: 500,
  requestsUsedToday: 0,
  requestsUsedThisMinute: 0,
  lastResetDate: new Date(),
  lastMinuteResetDate: new Date(),
  allowedEndpoints: [],
  allowedIPs: [],
  isActive: true,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

### 2. Test Your API Key

```bash
export API_KEY="mk_live_1234567890abcdef..."

# Test basic endpoint
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:3001/api/v1/opportunities/top

# Expected response:
# {
#   "success": true,
#   "data": [...],
#   "meta": { "tier": "pro", "timestamp": "..." }
# }
```

### 3. Send Market Reports with API Key

```bash
export API_KEY="mk_live_your_key_here"

# Single report
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  "http://localhost:3001/api/v1/market-reports/send-telegram?date=2025-01-27"

# Batch historical reports
node scripts/sendHistoricalReports.js 2025-01-01 2025-01-27
```

---

## For Your Customers

### Step 1: Sign Up

1. Go to `https://mariposa.com/signup`
2. Enter email
3. Verify via OTP code sent to email
4. Login successful!

### Step 2: Generate API Key

1. Navigate to **API Keys** page in dashboard
2. Click **Generate New API Key**
3. Fill in:
   - **Name:** "My Trading Bot"
   - **Tier:** free / starter / pro / enterprise
   - **(Optional) IP Whitelist:** Leave empty for any IP
4. Click **Generate**
5. **IMPORTANT:** Copy the API key immediately! It's shown only once.

### Step 3: Use Your API Key

#### JavaScript Example

```javascript
const axios = require('axios');

const API_KEY = 'mk_live_your_key_here';

async function getOpportunities() {
  const response = await axios.get(
    'https://api.mariposa.com/api/v1/opportunities',
    {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      params: { limit: 10, minConfidence: 0.7 }
    }
  );
  console.log(response.data);
}

getOpportunities();
```

#### Python Example

```python
import requests

API_KEY = 'mk_live_your_key_here'

response = requests.get(
    'https://api.mariposa.com/api/v1/opportunities',
    headers={'Authorization': f'Bearer {API_KEY}'},
    params={'limit': 10, 'minConfidence': 0.7}
)

print(response.json())
```

---

## API Key Management

### View All Your Keys

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3001/api/api-keys
```

### Revoke a Key

```bash
curl -X DELETE \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3001/api/api-keys/KEY_ID
```

### Rotate a Key (Generate New, Revoke Old)

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3001/api/api-keys/KEY_ID/rotate
```

### View Usage Analytics

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3001/api/api-keys/KEY_ID/usage?from=2025-01-01&to=2025-01-31"
```

---

## Tier Comparison

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| **Requests/Day** | 100 | 1,000 | 10,000 | Unlimited |
| **Requests/Min** | 10 | 50 | 200 | 500 |
| **Opportunities API** | ✅ Basic | ✅ Full | ✅ Full | ✅ Full |
| **Whale Activities** | ❌ | ✅ | ✅ | ✅ |
| **Market Reports PDF** | ❌ | ✅ | ✅ | ✅ |
| **Telegram Delivery** | ❌ | ❌ | ✅ | ✅ |
| **AI Analysis** | ❌ | ❌ | ✅ | ✅ |
| **WebSocket Stream** | ❌ | ❌ | ❌ | ✅ |
| **Priority Support** | ❌ | ❌ | ✅ | ✅ |
| **SLA Guarantee** | ❌ | ❌ | ❌ | ✅ |

---

## Troubleshooting

### Error: "API key required"

Make sure you're including the Authorization header:
```bash
-H "Authorization: Bearer YOUR_API_KEY"
```

### Error: "Rate limit exceeded"

Wait until the reset time (see `X-RateLimit-Reset` header) or upgrade your tier.

### Error: "This endpoint is not available for your tier"

Upgrade to a higher tier to access this endpoint.

### Error: "Invalid or expired API key"

- Check that you copied the full key correctly
- Verify the key is still active in your dashboard
- Generate a new key if needed

---

## Best Practices

1. **Store keys securely:** Use environment variables, never hardcode
2. **Use different keys:** Production vs Development
3. **Monitor usage:** Check analytics to optimize requests
4. **Implement caching:** Cache responses to reduce API calls
5. **Handle errors:** Implement retry logic with exponential backoff
6. **Respect rate limits:** Track headers and throttle requests

---

## Support

Questions? Contact us:
- **Email:** support@mariposa.com
- **Discord:** https://discord.gg/mariposa
- **Docs:** https://docs.mariposa.com

---

**© 2025 Mariposa Trading**
