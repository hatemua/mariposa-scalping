/**
 * PM2 Ecosystem Configuration - V6 + WEEX
 *
 * This configuration runs the following processes:
 * 1. Main Server - Shared services (Binance, MT4, position monitoring, WebSockets, API)
 * 2. V6 Sniper Worker - Intelligent setup-based trading on MT4 (LLM analysis + math confirmation)
 * 3. WEEX V6 Worker - Intelligent setup-based trading on WEEX exchange
 *
 * V3 Fibonacci worker has been DISABLED - V6 is the sole signal source.
 */

module.exports = {
  apps: [
    {
      name: 'mariposa-main',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5004,
        PROCESS_TYPE: 'MAIN_SERVER'
      },
      max_memory_restart: '2G',
      error_file: './logs/main-error.log',
      out_file: './logs/main-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'v6-sniper-worker',
      script: './dist/v6-sniper-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'V6_SNIPER_WORKER'
      },
      max_memory_restart: '1G',
      error_file: './logs/v6-sniper-error.log',
      out_file: './logs/v6-sniper-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000
    },
    {
      name: 'weex-v6-worker',
      script: './dist/weex-v6-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'WEEX_V6_WORKER',
        WEEX_V6_ENABLED: 'true'
      },
      max_memory_restart: '1G',
      error_file: './logs/weex-v6-error.log',
      out_file: './logs/weex-v6-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000
    }
  ]
};
