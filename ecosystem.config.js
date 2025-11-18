/**
 * PM2 Ecosystem Configuration
 *
 * This configuration runs two separate processes:
 * 1. Main Server - All services EXCEPT Fibonacci scalping
 * 2. Fibonacci Worker - ONLY BTC Fibonacci scalping (isolated)
 *
 * Benefits of this architecture:
 * - Resource isolation (no LLM API competition)
 * - Independent scaling and restart
 * - Cleaner logs and easier debugging
 * - Fault isolation (if one crashes, other continues)
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
      name: 'fibonacci-worker',
      script: './dist/fibonacci-worker.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PROCESS_TYPE: 'FIBONACCI_WORKER'
      },
      max_memory_restart: '1G',
      error_file: './logs/fibonacci-error.log',
      out_file: './logs/fibonacci-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000
    }
  ]
};
