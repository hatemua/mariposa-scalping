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

app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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