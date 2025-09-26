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
    symbol: string;
    config: any;
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
      timeout: 60000 // 60 seconds timeout for multi-timeframe analysis
    });
    return response.data;
  },

  getRealTimeAnalysis: async (symbol: string, models?: string[]): Promise<ApiResponse> => {
    const response = await api.get(`/market/${symbol}/real-time`, {
      params: { models: models?.join(',') },
      timeout: 45000 // 45 seconds timeout for real-time analysis
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
      timeout: 90000 // 90 seconds timeout for bulk analysis
    });
    return response.data;
  },

  getMultiTokenAnalysis: async (data: {
    symbols: string[];
    timeframes: string[];
  }): Promise<ApiResponse> => {
    const response = await api.post('/market/analysis/multi-token', data, {
      timeout: 120000 // 2 minutes timeout for multi-token analysis
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
};

export default api;