import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { config } from './config/environment';
import { connectDatabase } from './config/database';
import { redis } from './config/redis';
import { rateLimitMiddleware } from './middleware/rateLimiter';
import { agendaService } from './services/agendaService';
import { binanceService } from './services/binanceService';
import { validatedSignalExecutor } from './services/validatedSignalExecutor';
import { initializeWebSocketService } from './services/websocketService';
import { analysisWebSocketService } from './services/analysisWebSocket';
import routes from './routes';

const app = express();
const server = createServer(app);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: "*",  // Allow all origins
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers"
  ],
  credentials: false,  // Must be false when origin is "*"
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure request timeout middleware
app.use((req, res, next) => {
  // Set different timeouts based on endpoint
  if (req.path.includes('/real-time') || req.path.includes('/professional-signals')) {
    // Long timeout for AI analysis endpoints
    req.setTimeout(config.AI_ANALYSIS_TIMEOUT);
    res.setTimeout(config.AI_ANALYSIS_TIMEOUT);
  } else if (req.path.includes('/bulk') || req.path.includes('/multi-token')) {
    // Extra long timeout for bulk operations
    req.setTimeout(config.BULK_ANALYSIS_TIMEOUT);
    res.setTimeout(config.BULK_ANALYSIS_TIMEOUT);
  } else {
    // Standard timeout for other endpoints
    req.setTimeout(config.MARKET_DATA_TIMEOUT);
    res.setTimeout(config.MARKET_DATA_TIMEOUT);
  }
  next();
});

// Apply rate limiting after CORS
app.use(rateLimitMiddleware);

app.use('/api', routes);

// Health check endpoint for WebSocket services
app.get('/health/websockets', (req, res) => {
  try {
    const { getWebSocketService } = require('./services/websocketService');
    const wsService = getWebSocketService();
    const analysisService = analysisWebSocketService;

    const health = {
      timestamp: new Date().toISOString(),
      services: {
        websocket: {
          status: wsService ? 'running' : 'not_initialized',
          path: '/socket.io/',
          connectedClients: wsService ? 'available' : 'unknown'
        },
        analysisWebsocket: {
          status: analysisService ? 'running' : 'not_initialized',
          path: '/analysis/',
          connectedClients: analysisService ? analysisService.getConnectedClientsCount() : 0
        }
      }
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get WebSocket service health',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    console.log('✅ Database connected successfully');

    await redis.connect();
    console.log('✅ Redis connected successfully');

    await agendaService.start();
    console.log('✅ Agenda service started');

    // Schedule recurring jobs
    await agendaService.scheduleRecurringJobs();
    console.log('✅ Recurring jobs scheduled');

    // Start validated signal executor (processes queue and executes trades)
    await validatedSignalExecutor.start();
    console.log('✅ Validated signal executor started');

    await binanceService.start();
    console.log('✅ Binance service started with Redis integration');

    try {
      initializeWebSocketService(server);
      console.log('✅ WebSocket service initialized on default path');
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket service:', error);
      throw error;
    }

    try {
      analysisWebSocketService.initialize(server);
      console.log('✅ Analysis WebSocket service initialized on /analysis/ path');
    } catch (error) {
      console.error('❌ Failed to initialize Analysis WebSocket service:', error);
      throw error;
    }

    // Set server timeout for long-running AI operations
    server.timeout = config.SERVER_TIMEOUT;
    console.log(`⏱️  Server timeout set to ${config.SERVER_TIMEOUT / 1000} seconds`);

    server.listen(config.PORT, async () => {
      console.log(`🚀 Server running on port ${config.PORT} in ${config.NODE_ENV} mode`);
      console.log(`📊 API available at http://localhost:${config.PORT}/api`);
      console.log(`🔌 WebSocket (General) available at ws://localhost:${config.PORT}/socket.io/`);
      console.log(`🧠 WebSocket (Analysis) available at ws://localhost:${config.PORT}/analysis/`);
      console.log(`🩺 WebSocket Health Check at http://localhost:${config.PORT}/health/websockets`);
      console.log(`🗄️  Redis cache: ${redis.connected ? 'Connected' : 'Disconnected'}`);

      // Send Telegram startup notification
      try {
        const { telegramService } = await import('./services/telegramService');
        console.log('📱 Sending Telegram startup notification...');
        await telegramService.sendStartupNotification();
      } catch (error) {
        console.error('Failed to send Telegram startup notification:', error);
        // Don't crash the server if Telegram fails
      }
    });

    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      await agendaService.stop();
      if (binanceService.disconnect) {
        binanceService.disconnect();
      }
      await redis.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully');
      await agendaService.stop();
      if (binanceService.disconnect) {
        binanceService.disconnect();
      }
      await redis.disconnect();
      process.exit(0);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();