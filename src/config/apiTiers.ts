export interface TierConfig {
  name: string;
  requestsPerDay: number;
  requestsPerMinute: number;
  allowedEndpoints: string[];
  features: string[];
}

export const API_TIERS: Record<'free' | 'starter' | 'pro' | 'enterprise', TierConfig> = {
  free: {
    name: 'Free',
    requestsPerDay: 100,
    requestsPerMinute: 10,
    allowedEndpoints: [
      '/api/v1/opportunities',
      '/api/v1/opportunities/top',
      '/api/v1/market-reports/available-dates',
      '/api/v1/market/*/price',
      '/api/v1/market/trending'
    ],
    features: [
      'Basic trading opportunities',
      'Top opportunities ranking',
      'Current market prices',
      'Trending symbols'
    ]
  },

  starter: {
    name: 'Starter',
    requestsPerDay: 1000,
    requestsPerMinute: 50,
    allowedEndpoints: ['*'], // All endpoints
    features: [
      'All Free tier features',
      'Full opportunity details',
      'Whale activity tracking',
      'Daily market reports (PDF)',
      'Order book analysis',
      'Historical data access'
    ]
  },

  pro: {
    name: 'Pro',
    requestsPerDay: 10000,
    requestsPerMinute: 200,
    allowedEndpoints: ['*'], // All endpoints
    features: [
      'All Starter tier features',
      'AI-powered market analysis',
      'Trading signals API',
      'Real-time signal feed',
      'Advanced analytics',
      'Priority support',
      'Webhook notifications'
    ]
  },

  enterprise: {
    name: 'Enterprise',
    requestsPerDay: -1, // Unlimited
    requestsPerMinute: 500,
    allowedEndpoints: ['*'], // All endpoints
    features: [
      'All Pro tier features',
      'Unlimited requests',
      'Deep multi-timeframe analysis',
      'Batch analysis endpoints',
      'WebSocket streaming',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
      'White-label options'
    ]
  }
};

/**
 * Check if an endpoint is allowed for a tier
 */
export function isEndpointAllowed(tier: 'free' | 'starter' | 'pro' | 'enterprise', endpoint: string): boolean {
  const tierConfig = API_TIERS[tier];
  const allowedEndpoints = tierConfig.allowedEndpoints;

  // If '*' is in allowed endpoints, all endpoints are allowed
  if (allowedEndpoints.includes('*')) {
    return true;
  }

  // Check for exact match
  if (allowedEndpoints.includes(endpoint)) {
    return true;
  }

  // Check for wildcard match (e.g., '/api/v1/market/*')
  return allowedEndpoints.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(endpoint);
    }
    return false;
  });
}

/**
 * Get tier configuration
 */
export function getTierConfig(tier: 'free' | 'starter' | 'pro' | 'enterprise'): TierConfig {
  return API_TIERS[tier];
}

/**
 * Get tier limits for rate limiting
 */
export function getTierLimits(tier: 'free' | 'starter' | 'pro' | 'enterprise'): {
  requestsPerDay: number;
  requestsPerMinute: number;
} {
  const config = API_TIERS[tier];
  return {
    requestsPerDay: config.requestsPerDay,
    requestsPerMinute: config.requestsPerMinute
  };
}
