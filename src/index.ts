import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { config } from './config/environment';
import { connectDatabase } from './config/database';
import { redis } from './config/redis';
import { rateLimitMiddleware } from './middleware/rateLimiter';
import { agendaService } from './services/agendaService';
import { initializeWebSocketService } from './services/websocketService';
import routes from './routes';

const app = express();
const server = createServer(app);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Handle preflight OPTIONS requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '3600');
  res.sendStatus(200);
});

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

    initializeWebSocketService(server);
    console.log('✅ WebSocket service initialized');

    // Set server timeout for long-running AI operations
    server.timeout = config.SERVER_TIMEOUT;
    console.log(`⏱️  Server timeout set to ${config.SERVER_TIMEOUT / 1000} seconds`);

    server.listen(config.PORT, () => {
      console.log(`🚀 Server running on port ${config.PORT} in ${config.NODE_ENV} mode`);
      console.log(`📊 API available at http://localhost:${config.PORT}/api`);
      console.log(`🔌 WebSocket available at ws://localhost:${config.PORT}`);
      console.log(`🗄️  Redis cache: ${redis.connected ? 'Connected' : 'Disconnected'}`);
    });

    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully');
      await agendaService.stop();
      await redis.disconnect();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully');
      await agendaService.stop();
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