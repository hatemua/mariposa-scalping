// Configuration with fallbacks for production
export const config = {
  // API Configuration
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'https://scalping.backend.mariposa.plus/api',
  WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'https://scalping.backend.mariposa.plus',

  // Development fallbacks
  DEV_BACKEND_URL: 'http://localhost:3001/api',
  DEV_WS_URL: 'http://localhost:3001',

  // Environment detection
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',

  // Get the appropriate URL based on environment
  getBackendUrl: () => {
    if (typeof window !== 'undefined') {
      // Client-side detection
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        return config.DEV_BACKEND_URL;
      }
    }
    return config.BACKEND_URL;
  },

  getWebSocketUrl: () => {
    if (typeof window !== 'undefined') {
      // Client-side detection
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        return config.DEV_WS_URL;
      }
    }
    return config.WS_URL;
  }
};

export default config;