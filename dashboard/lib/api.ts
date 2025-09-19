import axios from 'axios';
import { ApiResponse } from '@/types';
import config from './config';

const api = axios.create({
  baseURL: config.getBackendUrl(),
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
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
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('userEmail');
        window.location.href = '/login';
      } catch (e) {
        console.error('Error clearing localStorage:', e);
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

  triggerAnalysis: async (symbol: string): Promise<ApiResponse> => {
    const response = await api.post('/market/analysis', { symbol });
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