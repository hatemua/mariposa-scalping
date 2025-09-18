import axios from 'axios';
import { ApiResponse } from '@/types';

const api = axios.create({
  baseURL: process.env.BACKEND_URL || 'http://localhost:3001/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async (email: string, password: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (email: string, password: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/register', { email, password });
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