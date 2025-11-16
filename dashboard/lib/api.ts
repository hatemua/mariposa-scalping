import axios from 'axios';
import { ApiResponse } from '@/types';
import config from './config';
import { storage } from './storage';

const api = axios.create({
  baseURL: config.getBackendUrl(),
  timeout: 30000, // Increased from 15 seconds to 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = storage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      storage.removeItem('token');
      storage.removeItem('userEmail');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  // Passwordless OTP authentication
  requestOTP: async (email: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/request-otp', { email });
    return response.data;
  },

  verifyOTP: async (userId: string, otpCode: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/verify-otp', { userId, otpCode });
    return response.data;
  },

  resendOTP: async (userId: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/resend-otp', { userId });
    return response.data;
  },

  getOTPStatus: async (userId: string): Promise<ApiResponse> => {
    const response = await api.get(`/auth/otp-status/${userId}`);
    return response.data;
  },

  testEmail: async (email: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/test-email', { email });
    return response.data;
  },

  updateOkxKeys: async (keys: {
    okxApiKey: string;
    okxSecretKey: string;
    okxPassphrase: string;
  }): Promise<ApiResponse> => {
    const response = await api.put('/auth/okx-keys', keys);
    return response.data;
  },
};

export const agentApi = {
  getAgents: async (): Promise<ApiResponse> => {
    const response = await api.get('/agents');
    return response.data;
  },

  getAgent: async (agentId: string): Promise<ApiResponse> => {
    const response = await api.get(`/agents/${agentId}`);
    return response.data;
  },

  createAgent: async (data: {
    name: string;
    // Broker selection
    broker?: 'OKX' | 'MT4' | 'BINANCE';
    // Intelligent agent fields (new)
    category?: 'SCALPING' | 'SWING' | 'DAY_TRADING' | 'LONG_TERM' | 'ARBITRAGE' | 'ALL';
    riskLevel?: 1 | 2 | 3 | 4 | 5;
    budget?: number;
    description?: string;
    // Legacy fields (backward compatibility)
    symbol?: string;
    config?: any;
  }): Promise<ApiResponse> => {
    const response = await api.post('/agents', data);
    return response.data;
  },

  updateAgent: async (agentId: string, data: {
    name?: string;
    config?: any;
  }): Promise<ApiResponse> => {
    const response = await api.put(`/agents/${agentId}`, data);
    return response.data;
  },

  deleteAgent: async (agentId: string): Promise<ApiResponse> => {
    const response = await api.delete(`/agents/${agentId}`);
    return response.data;
  },

  startAgent: async (agentId: string): Promise<ApiResponse> => {
    const response = await api.post(`/agents/${agentId}/start`);
    return response.data;
  },

  stopAgent: async (agentId: string): Promise<ApiResponse> => {
    const response = await api.post(`/agents/${agentId}/stop`);
    return response.data;
  },

  pauseAgent: async (agentId: string): Promise<ApiResponse> => {
    const response = await api.post(`/agents/${agentId}/pause`);
    return response.data;
  },

  getAgentTrades: async (agentId: string, page = 1, limit = 50): Promise<ApiResponse> => {
    const response = await api.get(`/agents/${agentId}/trades`, {
      params: { page, limit }
    });
    return response.data;
  },
};

export const marketApi = {
  getMarketData: async (symbol: string): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}`);
    return response.data;
  },

  getAnalysis: async (symbol: string, limit = 10): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/analysis`, {
      params: { limit }
    });
    return response.data;
  },

  getDeepAnalysis: async (symbol: string): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/deep-analysis`);
    return response.data;
  },

  // New enhanced endpoints
  getMultiTimeframeAnalysis: async (symbol: string, timeframes?: string[]): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/multi-timeframe`, {
      params: { timeframes: timeframes?.join(',') },
      timeout: 180000 // 3 minutes timeout for multi-timeframe AI analysis
    });
    return response.data;
  },

  getRealTimeAnalysis: async (symbol: string, models?: string[]): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/real-time`, {
      params: { models: models?.join(',') },
      timeout: 120000 // 2 minutes timeout for AI model processing
    });
    return response.data;
  },

  getChartData: async (symbol: string, timeframe: string, limit = 200, indicators?: string[]): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/chart/${timeframe}`, {
      params: {
        limit,
        indicators: indicators?.join(',')
      }
    });
    return response.data;
  },

  getBulkTokenAnalysis: async (data: {
    symbols?: string[];
    sortBy?: string;
    limit?: number;
  }): Promise<ApiResponse> => {
    const response = await api.post('/market/analysis/bulk', data, {
      timeout: 300000 // 5 minutes timeout for bulk AI analysis
    });
    return response.data;
  },

  getMultiTokenAnalysis: async (data: {
    symbols: string[];
    timeframes: string[];
  }): Promise<ApiResponse> => {
    const response = await api.post('/market/analysis/multi-token', data, {
      timeout: 360000 // 6 minutes timeout for multi-token AI analysis
    });
    return response.data;
  },

  getImmediateTradingSignals: async (symbol: string): Promise<ApiResponse> => {
    // This would call the real-time analysis and extract signals
    const response = await api.get(`/market/${symbol}/real-time`);

    if (response.data?.success) {
      // Extract trading signals from real-time analysis
      const rtData = response.data.data;
      const signals = [];

      // Extract immediate signals based on consensus
      if (rtData.consensus?.recommendation === 'BUY' && rtData.consensus?.confidence > 0.7) {
        signals.push({
          type: 'IMMEDIATE_BUY',
          confidence: rtData.consensus.confidence,
          targetPrice: rtData.consensus.targetPrice,
          stopLoss: rtData.consensus.stopLoss,
          timeWindow: rtData.consensus.timeToAction,
          reasoning: rtData.consensus.reasoning
        });
      }

      if (rtData.consensus?.recommendation === 'SELL' && rtData.consensus?.confidence > 0.7) {
        signals.push({
          type: 'IMMEDIATE_SELL',
          confidence: rtData.consensus.confidence,
          targetPrice: rtData.consensus.targetPrice,
          stopLoss: rtData.consensus.stopLoss,
          timeWindow: rtData.consensus.timeToAction,
          reasoning: rtData.consensus.reasoning
        });
      }

      // Add risk warnings
      if (rtData.riskWarnings?.length > 0) {
        signals.push({
          type: 'RISK_WARNING',
          level: 'HIGH',
          warnings: rtData.riskWarnings,
          action: 'REDUCE_POSITION_OR_WAIT'
        });
      }

      return {
        success: true,
        data: {
          symbol,
          signals,
          signalCount: signals.length,
          hasImmediateAction: signals.some((s: any) => s.type.includes('IMMEDIATE')),
          timestamp: new Date().toISOString()
        }
      };
    }

    return response.data;
  },

  // Legacy endpoints
  triggerAnalysis: async (symbol: string): Promise<ApiResponse> => {
    const response = await api.post('/market/analysis', { symbol });
    return response.data;
  },

  triggerBatchAnalysis: async (symbols?: string[]): Promise<ApiResponse> => {
    const response = await api.post('/market/analysis/batch', { symbols });
    return response.data;
  },

  getBalance: async (): Promise<ApiResponse> => {
    const response = await api.get('/market/balance');
    return response.data;
  },

  getSymbols: async (): Promise<ApiResponse> => {
    const response = await api.get('/market/symbols');
    return response.data;
  },

  // New methods for trading intelligence
  getConfluenceScore: async (symbol: string): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/confluence`);
    return response.data;
  },

  getEntrySignals: async (symbol: string): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/entry-signals`);
    return response.data;
  },

  getProfessionalSignals: async (symbols: string[], minStrength = 60): Promise<ApiResponse> => {
    const response = await api.post('/market/professional-signals', {
      symbols,
      minStrength
    });
    return response.data;
  },

  getWhaleActivity: async (symbols: string[], minSize = 50000): Promise<ApiResponse> => {
    const response = await api.post('/market/whale-activity', {
      symbols,
      minSize
    });
    return response.data;
  },

  getOpportunityScanner: async (symbols: string[], minScore = 70): Promise<ApiResponse> => {
    const response = await api.post('/market/opportunity-scanner', {
      symbols,
      minScore
    });
    return response.data;
  },

};

export const orderBookApi = {
  getAnalysis: async (symbol: string, levels = 20): Promise<ApiResponse> => {
    const response = await api.get('/orderbook/analyze', {
      params: { symbol, levels }
    });
    return response.data;
  },

  subscribe: async (symbol: string, levels = 20): Promise<ApiResponse> => {
    const response = await api.post('/orderbook/subscribe', { symbol, levels });
    return response.data;
  },

  getRawOrderBook: async (symbol: string, limit = 100): Promise<ApiResponse> => {
    const response = await api.get('/orderbook/raw', {
      params: { symbol, limit }
    });
    return response.data;
  },
};

export const apiKeysApi = {
  // Generate new API key
  generateApiKey: async (data: {
    name: string;
    tier: 'free' | 'starter' | 'pro' | 'enterprise';
    expiresInDays?: number;
    allowedIPs?: string[];
  }): Promise<ApiResponse> => {
    const response = await api.post('/api-keys/generate', data);
    return response.data;
  },

  // Get all user's API keys
  listApiKeys: async (): Promise<ApiResponse> => {
    const response = await api.get('/api-keys');
    return response.data;
  },

  // Revoke an API key
  revokeApiKey: async (keyId: string): Promise<ApiResponse> => {
    const response = await api.delete(`/api-keys/${keyId}`);
    return response.data;
  },

  // Rotate an API key
  rotateApiKey: async (keyId: string): Promise<ApiResponse> => {
    const response = await api.post(`/api-keys/${keyId}/rotate`);
    return response.data;
  },

  // Get usage analytics
  getApiKeyUsage: async (keyId: string, from?: string, to?: string): Promise<ApiResponse> => {
    const response = await api.get(`/api-keys/${keyId}/usage`, {
      params: { from, to }
    });
    return response.data;
  }
};

// Public API tester (uses API key instead of JWT)
export const publicApi = {
  // Test public API endpoint with API key
  testEndpoint: async (
    apiKey: string,
    method: 'GET' | 'POST',
    endpoint: string,
    params?: any,
    body?: any
  ) => {
    const requestConfig: any = {
      method,
      url: `${config.getBackendUrl()}/v1${endpoint}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000 // 3 minutes for report generation
    };

    if (params) {
      requestConfig.params = params;
    }

    if (body) {
      requestConfig.data = body;
    }

    const response = await axios(requestConfig);
    return response;
  }
};

// MT4 API endpoints
export const mt4Api = {
  // Get MT4 Bridge connection status
  getStatus: async (): Promise<ApiResponse> => {
    const response = await api.get('/mt4/status');
    return response.data;
  },

  // Get MT4 account information
  getAccount: async (): Promise<ApiResponse> => {
    const response = await api.get('/mt4/account');
    return response.data;
  },

  // Get MT4 open positions
  getOpenOrders: async (): Promise<ApiResponse> => {
    const response = await api.get('/mt4/orders/open');
    return response.data;
  },

  // Get MT4 price for symbol
  getPrice: async (symbol: string): Promise<ApiResponse> => {
    const response = await api.get(`/mt4/price/${symbol}`);
    return response.data;
  },

  // Get MT4 order history
  getOrderHistory: async (): Promise<ApiResponse> => {
    const response = await api.get('/mt4/orders/history');
    return response.data;
  },

  // Get MT4 open positions (alias for getOpenOrders)
  getPositions: async (): Promise<ApiResponse> => {
    const response = await api.get('/mt4/positions');
    return response.data;
  }
};

export default api;