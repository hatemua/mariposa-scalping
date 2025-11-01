# Mariposa Trading API Documentation

**Version:** 1.0.0
**Base URL:** `https://api.mariposa.com/api/v1` (or `http://localhost:3001/api/v1` for development)

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Rate Limits](#rate-limits)
4. [Pricing Tiers](#pricing-tiers)
5. [Endpoints](#endpoints)
   - [Opportunities API](#opportunities-api)
   - [Whale Activities API](#whale-activities-api)
   - [Market Reports API](#market-reports-api)
6. [Error Handling](#error-handling)
7. [Code Examples](#code-examples)

---

## Getting Started

### 1. Sign Up & Generate API Key

1. Create an account at `https://mariposa.com/signup`
2. Verify your email via OTP
3. Navigate to **API Keys** section in your dashboard
4. Click **Generate New API Key**
5. Select your desired tier (free, starter, pro, enterprise)
6. Copy and store your API key securely (it's shown only once!)

### 2. Make Your First API Call

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.mariposa.com/api/v1/opportunities/top
```

---

## Authentication

All API requests require authentication via **API Key**.

### How to Authenticate

Include your API key in the request headers using one of these methods:

**Method 1: Bearer Token (Recommended)**
```http
Authorization: Bearer mk_live_1234567890abcdef...
```

**Method 2: X-API-Key Header**
```http
X-API-Key: mk_live_1234567890abcdef...
```

### API Key Format

- **Live keys:** `mk_live_...` (for production)
- **Test keys:** `mk_test_...` (for testing/development)

### Security Best Practices

- ✅ Store API keys in environment variables
- ✅ Never commit API keys to version control
- ✅ Rotate keys periodically
- ✅ Use IP whitelisting when possible
- ❌ Never expose keys in client-side code

---

## Rate Limits

Rate limits are enforced **per API key** and reset daily at midnight UTC.

### Rate Limit Headers

Every API response includes rate limit information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1735689600
```

- **X-RateLimit-Limit:** Maximum requests per day
- **X-RateLimit-Remaining:** Requests remaining today
- **X-RateLimit-Reset:** Unix timestamp when limit resets

### When Limit Exceeded

**HTTP 429 - Too Many Requests**

```json
{
  "success": false,
  "error": "Rate limit exceeded: daily quota exhausted",
  "resetAt": "2025-01-28T00:00:00.000Z"
}
```

---

## Pricing Tiers

| Tier | Requests/Day | Requests/Minute | Price | Features |
|------|--------------|-----------------|-------|----------|
| **Free** | 100 | 10 | $0 | Basic opportunities, top rankings, market prices |
| **Starter** | 1,000 | 50 | TBD | All Free + Full opportunity details, whale tracking, PDFs |
| **Pro** | 10,000 | 200 | TBD | All Starter + AI analysis, signals, real-time feed, webhooks |
| **Enterprise** | Unlimited | 500 | TBD | All Pro + Deep analysis, batch API, WebSocket, SLA, custom integrations |

### Tier-Specific Endpoints

| Endpoint | Free | Starter | Pro | Enterprise |
|----------|------|---------|-----|------------|
| `GET /opportunities` | ✅ (limited) | ✅ | ✅ | ✅ |
| `GET /opportunities/top` | ✅ | ✅ | ✅ | ✅ |
| `GET /opportunities/:id` | ❌ | ✅ | ✅ | ✅ |
| `GET /whale-activities` | ❌ | ✅ | ✅ | ✅ |
| `GET /market-reports/daily` | ❌ | ✅ | ✅ | ✅ |
| `POST /market-reports/send-telegram` | ❌ | ❌ | ✅ | ✅ |

---

## Endpoints

### Opportunities API

#### GET /opportunities

Get trading opportunities with filtering and sorting.

**Access:** Free+ (limited fields), Starter+ (full details)

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max results (1-100) |
| `category` | string | - | Filter by category: `BREAKOUT`, `REVERSAL`, `MOMENTUM`, `WHALE_ACTIVITY` |
| `minConfidence` | number | - | Minimum confidence (0-1) |
| `minScore` | number | - | Minimum score (0-100) |
| `riskLevel` | string | - | Filter by risk: `LOW`, `MEDIUM`, `HIGH` |
| `status` | string | ACTIVE | Filter by status: `ACTIVE`, `EXPIRED`, `COMPLETED`, `ALL` |
| `sortBy` | string | score | Sort field: `score`, `confidence`, `riskReward`, `detectedAt` |
| `order` | string | desc | Sort order: `asc`, `desc` |

**Example Request:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.mariposa.com/api/v1/opportunities?category=BREAKOUT&minConfidence=0.7&limit=10"
```

**Response (Starter+ tier):**

```json
{
  "success": true,
  "data": [
    {
      "id": "67890abcdef",
      "symbol": "BTCUSDT",
      "score": 85,
      "confidence": 0.82,
      "category": "BREAKOUT",
      "entry": 42500,
      "target": 44000,
      "stopLoss": 41800,
      "riskReward": 2.14,
      "expectedReturn": 3.5,
      "riskLevel": "MEDIUM",
      "timeframe": "4h",
      "volume24h": 5400000000,
      "priceChange": 2.3,
      "reasoning": "Strong breakout above resistance with high volume confirmation",
      "indicators": {
        "rsi": 62.5,
        "volume_ratio": 1.8,
        "volatility": 0.035,
        "momentum": 0.42
      },
      "llmInsights": {
        "traderThoughts": "Strong bullish momentum with breakout above $42,000 resistance. Volume surge confirms buyer interest. RSI shows room for upside before overbought. Risk/reward ratio attractive at 2.1:1.",
        "recommendation": "BUY",
        "confidence": 0.85,
        "keyFactors": [
          "Volume surge (+80% above average)",
          "Clean breakout above key resistance",
          "RSI showing bullish momentum without overbought",
          "Strong risk/reward ratio"
        ]
      },
      "status": "ACTIVE",
      "detectedAt": "2025-01-27T10:30:00.000Z",
      "expiresAt": "2025-01-27T16:00:00.000Z",
      "createdAt": "2025-01-27T10:30:15.000Z"
    }
  ],
  "pagination": {
    "total": 45,
    "returned": 10,
    "limit": 10
  },
  "meta": {
    "tier": "starter",
    "timestamp": "2025-01-27T12:00:00.000Z"
  }
}
```

**Response (Free tier - limited fields):**

```json
{
  "success": true,
  "data": [
    {
      "id": "67890abcdef",
      "symbol": "BTCUSDT",
      "score": 85,
      "confidence": 0.82,
      "category": "BREAKOUT",
      "riskLevel": "MEDIUM",
      "riskReward": 2.14,
      "detectedAt": "2025-01-27T10:30:00.000Z",
      "expiresAt": "2025-01-27T16:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 45,
    "returned": 10,
    "limit": 10
  },
  "meta": {
    "tier": "free",
    "timestamp": "2025-01-27T12:00:00.000Z"
  }
}
```

---

#### GET /opportunities/top

Get top-ranked trading opportunities.

**Access:** Free+

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Max results (1-50) |
| `sortBy` | string | score | Sort by: `score`, `confidence`, `riskReward` |

**Example Request:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.mariposa.com/api/v1/opportunities/top?limit=5&sortBy=riskReward"
```

---

#### GET /opportunities/:id

Get full details for a single opportunity.

**Access:** Starter+

**Example Request:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.mariposa.com/api/v1/opportunities/67890abcdef
```

---

### Whale Activities API

#### GET /whale-activities

Get detected whale trading activities.

**Access:** Starter+

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max results (1-100) |
| `type` | string | - | Filter: `BUY_WALL`, `SELL_WALL`, `ACCUMULATION`, `LARGE_TRADE` |
| `side` | string | - | Filter: `BUY`, `SELL` |
| `minValue` | number | - | Minimum trade value (USD) |
| `impact` | string | - | Filter: `LOW`, `MEDIUM`, `HIGH` |
| `status` | string | ACTIVE | Filter: `ACTIVE`, `EXPIRED`, `EXECUTED`, `ALL` |

**Example Request:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.mariposa.com/api/v1/whale-activities?impact=HIGH&minValue=1000000"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "abc123def456",
      "symbol": "ETHUSDT",
      "type": "ACCUMULATION",
      "side": "BUY",
      "size": 15000,
      "value": 35500000,
      "impact": "HIGH",
      "confidence": 0.89,
      "volumeSpike": 3.2,
      "description": "Large accumulation detected with 3.2x volume spike",
      "llmInsights": {
        "traderAnalysis": "Significant whale accumulation in ETH. Large buying pressure with 15,000 ETH accumulated over 2 hours. This suggests institutional positioning ahead of potential bullish move.",
        "marketImpact": "High impact expected. Price likely to increase in short-term as supply absorbed. Watch for continuation or distribution signals.",
        "tradingStrategy": "Consider long positions with targets at $2,450-$2,500. Place stop loss below $2,350. Monitor order book for follow-through.",
        "riskAssessment": "High confidence signal (89%). Manage position size accordingly. Watch for sudden reversals if distribution begins."
      },
      "status": "ACTIVE",
      "detectedAt": "2025-01-27T11:15:00.000Z",
      "expiresAt": "2025-01-27T17:15:00.000Z",
      "createdAt": "2025-01-27T11:15:20.000Z"
    }
  ],
  "pagination": {
    "total": 8,
    "returned": 1,
    "limit": 20
  },
  "meta": {
    "tier": "starter",
    "timestamp": "2025-01-27T12:00:00.000Z"
  }
}
```

---

#### GET /whale-activities/:symbol

Get whale activities for a specific symbol.

**Access:** Starter+

**Example Request:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://api.mariposa.com/api/v1/whale-activities/BTCUSDT?limit=10
```

---

### Market Reports API

#### GET /market-reports/daily

Download daily market analysis report (PDF).

**Access:** Starter+

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `date` | string | yesterday | Date in YYYY-MM-DD format |

**Example Request:**

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  -o market-report.pdf \
  "https://api.mariposa.com/api/v1/market-reports/daily?date=2025-01-27"
```

**Response:** Binary PDF file

---

#### POST /market-reports/send-telegram

Send daily report to your Telegram group.

**Access:** Pro+

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `date` | string | yesterday | Date in YYYY-MM-DD format |

**Example Request:**

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  "https://api.mariposa.com/api/v1/market-reports/send-telegram?date=2025-01-27"
```

**Response:**

```json
{
  "success": true,
  "message": "Market report for Mon Jan 27 2025 sent to Telegram successfully",
  "meta": {
    "date": "2025-01-27",
    "tier": "pro",
    "timestamp": "2025-01-27T12:00:00.000Z"
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (invalid parameters) |
| 401 | Unauthorized (invalid/missing API key) |
| 403 | Forbidden (tier restriction) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "success": false,
  "error": "Error description here",
  "resetAt": "2025-01-28T00:00:00.000Z"  // For 429 errors
}
```

---

## Code Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const API_KEY = 'mk_live_your_api_key_here';
const BASE_URL = 'https://api.mariposa.com/api/v1';

async function getTopOpportunities() {
  try {
    const response = await axios.get(`${BASE_URL}/opportunities/top`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      },
      params: {
        limit: 10,
        sortBy: 'riskReward'
      }
    });

    console.log('Top Opportunities:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

getTopOpportunities();
```

### Python

```python
import requests

API_KEY = 'mk_live_your_api_key_here'
BASE_URL = 'https://api.mariposa.com/api/v1'

headers = {
    'Authorization': f'Bearer {API_KEY}'
}

def get_top_opportunities():
    response = requests.get(
        f'{BASE_URL}/opportunities/top',
        headers=headers,
        params={'limit': 10, 'sortBy': 'riskReward'}
    )

    if response.status_code == 200:
        data = response.json()
        print('Top Opportunities:', data)
        return data
    else:
        print('Error:', response.json())

get_top_opportunities()
```

### cURL

```bash
#!/bin/bash

API_KEY="mk_live_your_api_key_here"
BASE_URL="https://api.mariposa.com/api/v1"

# Get top opportunities
curl -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/opportunities/top?limit=10&sortBy=riskReward"

# Get whale activities
curl -H "Authorization: Bearer $API_KEY" \
  "$BASE_URL/whale-activities?impact=HIGH&limit=5"

# Download market report
curl -H "Authorization: Bearer $API_KEY" \
  -o report.pdf \
  "$BASE_URL/market-reports/daily?date=2025-01-27"
```

---

## Support

- **Documentation:** https://docs.mariposa.com
- **Email:** support@mariposa.com
- **Discord:** https://discord.gg/mariposa

---

**© 2025 Mariposa Trading. All rights reserved.**
