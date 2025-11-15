import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { binanceService } from './binanceService';
import { redisService } from './redisService';
import { User } from '../models';

interface UserSession {
  userId: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Set<string>;
}

export class WebSocketService {
  private io: SocketIOServer;
  private userSockets = new Map<string, string>();
  private sessions = new Map<string, UserSession>();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        credentials: false
      }
    });

    this.setupAuthentication();
    this.setupEventHandlers();
    this.setupBinanceIntegration();
    this.setupRedisSubscriptions();
    this.startSessionCleanup();
  }

  private setupAuthentication(): void {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(token, config.JWT_SECRET) as any;
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.data.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', async (socket) => {
      const userId = socket.data.user._id.toString();

      // Create user session
      const session: UserSession = {
        userId,
        socketId: socket.id,
        connectedAt: new Date(),
        lastActivity: new Date(),
        subscriptions: new Set()
      };

      this.userSockets.set(userId, socket.id);
      this.sessions.set(socket.id, session);

      // Store session in Redis for persistence across server instances
      await redisService.cacheUserSession(userId, {
        socketId: socket.id,
        connectedAt: session.connectedAt,
        lastActivity: session.lastActivity,
        server: process.env.SERVER_ID || 'server-1'
      });

      console.log(`User ${userId} connected via WebSocket (${socket.id})`);

      // Subscribe to user-specific Redis channels
      await this.subscribeToUserChannels(userId);

      socket.on('subscribe-market', async (data) => {
        const { symbols } = data;
        if (symbols && Array.isArray(symbols)) {
          session.lastActivity = new Date();

          // Join socket rooms
          socket.join(symbols.map((s: string) => `market-${s}`));

          // Track subscriptions in session
          symbols.forEach((symbol: string) => {
            session.subscriptions.add(`market:${symbol}`);
          });

          // Store subscription in Redis
          for (const symbol of symbols) {
            await redisService.addWebSocketSubscription(userId, `market:${symbol}`);
          }

          console.log(`User ${userId} subscribed to market data for: ${symbols.join(', ')}`);
        }
      });

      socket.on('unsubscribe-market', async (data) => {
        const { symbols } = data;
        if (symbols && Array.isArray(symbols)) {
          session.lastActivity = new Date();

          symbols.forEach((symbol: string) => {
            socket.leave(`market-${symbol}`);
            session.subscriptions.delete(`market:${symbol}`);
          });

          // Remove from Redis
          for (const symbol of symbols) {
            await redisService.removeWebSocketSubscription(userId, `market:${symbol}`);
          }

          console.log(`User ${userId} unsubscribed from market data for: ${symbols.join(', ')}`);
        }
      });

      socket.on('subscribe-agent', async (data) => {
        const { agentId } = data;
        if (agentId) {
          session.lastActivity = new Date();

          socket.join(`agent-${agentId}`);
          session.subscriptions.add(`agent:${agentId}`);

          await redisService.addWebSocketSubscription(userId, `agent:${agentId}`);

          console.log(`User ${userId} subscribed to agent ${agentId}`);
        }
      });

      socket.on('unsubscribe-agent', async (data) => {
        const { agentId } = data;
        if (agentId) {
          session.lastActivity = new Date();

          socket.leave(`agent-${agentId}`);
          session.subscriptions.delete(`agent:${agentId}`);

          await redisService.removeWebSocketSubscription(userId, `agent:${agentId}`);

          console.log(`User ${userId} unsubscribed from agent ${agentId}`);
        }
      });

      socket.on('get-live-data', async (data) => {
        const { symbol } = data;
        session.lastActivity = new Date();

        try {
          const marketData = await binanceService.getSymbolInfo(symbol);
          socket.emit('live-data', {
            symbol,
            data: marketData,
            timestamp: new Date()
          });
        } catch (error) {
          socket.emit('error', {
            message: 'Failed to fetch live data',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      socket.on('ping', (callback) => {
        session.lastActivity = new Date();
        if (callback) callback('pong');
      });

      socket.on('get-session-info', (callback) => {
        session.lastActivity = new Date();
        if (callback) {
          callback({
            userId,
            connectedAt: session.connectedAt,
            subscriptions: Array.from(session.subscriptions),
            lastActivity: session.lastActivity
          });
        }
      });

      socket.on('disconnect', async () => {
        await this.handleDisconnection(userId, socket.id);
      });
    });
  }

  private setupBinanceIntegration(): void {
    binanceService.on('ticker', (marketData) => {
      this.io.to(`market-${marketData.symbol}`).emit('market-update', {
        type: 'ticker',
        data: marketData
      });
    });

    binanceService.on('kline', (klineData) => {
      this.io.to(`market-${klineData.symbol}`).emit('market-update', {
        type: 'kline',
        data: klineData
      });
    });

    binanceService.on('connected', () => {
      this.io.emit('binance-status', {
        status: 'connected',
        timestamp: new Date()
      });
    });

    binanceService.on('disconnected', () => {
      this.io.emit('binance-status', {
        status: 'disconnected',
        timestamp: new Date()
      });
    });

    binanceService.on('error', (error) => {
      this.io.emit('binance-status', {
        status: 'error',
        error: error.message,
        timestamp: new Date()
      });
    });
  }

  public emitToUser(userId: string, event: string, data: any): void {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  public emitToAgent(agentId: string, event: string, data: any): void {
    this.io.to(`agent-${agentId}`).emit(event, data);
  }

  public emitAnalysisUpdate(symbol: string, analysis: any): void {
    this.io.to(`market-${symbol}`).emit('analysis-update', {
      symbol,
      analysis,
      timestamp: new Date()
    });
  }

  public emitTradeUpdate(agentId: string, trade: any): void {
    this.io.to(`agent-${agentId}`).emit('trade-update', {
      agentId,
      trade,
      timestamp: new Date()
    });
  }

  public emitPerformanceUpdate(agentId: string, performance: any): void {
    this.io.to(`agent-${agentId}`).emit('performance-update', {
      agentId,
      performance,
      timestamp: new Date()
    });
  }

  public getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  public isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  // ===============================
  // REDIS INTEGRATION METHODS
  // ===============================

  private async subscribeToUserChannels(userId: string): Promise<void> {
    try {
      // Subscribe to user-specific channels for direct messages
      await redisService.subscribe(`user:${userId}`, (message) => {
        this.emitToUser(userId, message.type || 'message', message.data);
      });

      // Subscribe to analysis updates for user's symbols
      const userSubscriptions = await redisService.getUserWebSocketSubscriptions(userId);
      for (const subscription of userSubscriptions) {
        if (subscription.startsWith('market:')) {
          const symbol = subscription.replace('market:', '');
          await redisService.subscribe(`analysis:${symbol}`, (message) => {
            this.emitToUser(userId, 'analysis-update', message);
          });
        }
      }
    } catch (error) {
      console.error(`Error subscribing to user channels for ${userId}:`, error);
    }
  }

  private setupRedisSubscriptions(): void {
    // Subscribe to global Redis channels for system-wide messages
    redisService.subscribe('system:broadcast', (message) => {
      this.io.emit('system-message', message);
    });

    redisService.subscribe('market:updates', (message) => {
      if (message.symbol) {
        this.io.to(`market-${message.symbol}`).emit('market-update', message);
      }
    });

    redisService.subscribe('trading:signals', (message) => {
      if (message.agentId) {
        this.io.to(`agent-${message.agentId}`).emit('trading-signal', message);
      }
    });
  }

  private async handleDisconnection(userId: string, socketId: string): Promise<void> {
    try {
      // Clean up local state
      this.userSockets.delete(userId);
      this.sessions.delete(socketId);

      // Clean up Redis session
      await redisService.deleteUserSession(userId);

      console.log(`User ${userId} disconnected from WebSocket (${socketId})`);
    } catch (error) {
      console.error(`Error handling disconnection for user ${userId}:`, error);
    }
  }

  private startSessionCleanup(): void {
    // Clean up inactive sessions every 5 minutes
    setInterval(async () => {
      await this.cleanupInactiveSessions();
    }, 5 * 60 * 1000);
  }

  private async cleanupInactiveSessions(): Promise<void> {
    try {
      const now = Date.now();
      const sessionsToRemove: string[] = [];

      for (const [socketId, session] of this.sessions.entries()) {
        const inactiveTime = now - session.lastActivity.getTime();

        if (inactiveTime > this.SESSION_TIMEOUT) {
          sessionsToRemove.push(socketId);
        }
      }

      for (const socketId of sessionsToRemove) {
        const session = this.sessions.get(socketId);
        if (session) {
          // Disconnect the socket
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }

          await this.handleDisconnection(session.userId, socketId);
        }
      }

      if (sessionsToRemove.length > 0) {
        console.log(`Cleaned up ${sessionsToRemove.length} inactive WebSocket sessions`);
      }
    } catch (error) {
      console.error('Error cleaning up inactive sessions:', error);
    }
  }

  // ===============================
  // SESSION MANAGEMENT METHODS
  // ===============================

  public async getActiveSessionsCount(): Promise<number> {
    return this.sessions.size;
  }

  public async getSessionInfo(userId: string): Promise<any> {
    const socketId = this.userSockets.get(userId);
    if (!socketId) return null;

    const session = this.sessions.get(socketId);
    if (!session) return null;

    return {
      userId: session.userId,
      socketId: session.socketId,
      connectedAt: session.connectedAt,
      lastActivity: session.lastActivity,
      subscriptions: Array.from(session.subscriptions),
      isActive: true
    };
  }

  public async getAllSessionsInfo(): Promise<any[]> {
    const sessions: any[] = [];

    for (const [socketId, session] of this.sessions.entries()) {
      sessions.push({
        userId: session.userId,
        socketId: socketId,
        connectedAt: session.connectedAt,
        lastActivity: session.lastActivity,
        subscriptions: Array.from(session.subscriptions),
        inactiveTime: Date.now() - session.lastActivity.getTime()
      });
    }

    return sessions;
  }

  public async broadcastToAllUsers(event: string, data: any): Promise<void> {
    // Broadcast via Socket.IO
    this.io.emit(event, data);

    // Also publish to Redis for other server instances
    await redisService.publish('system:broadcast', {
      type: event,
      data,
      timestamp: new Date()
    });
  }

  public async broadcastToSubscribedUsers(subscription: string, event: string, data: any): Promise<void> {
    // Find users subscribed to this channel
    const subscribedUsers: string[] = [];

    for (const [socketId, session] of this.sessions.entries()) {
      if (session.subscriptions.has(subscription)) {
        subscribedUsers.push(session.userId);
      }
    }

    // Send to each subscribed user
    for (const userId of subscribedUsers) {
      this.emitToUser(userId, event, data);
    }
  }

  // ===============================
  // MONITORING AND STATS
  // ===============================

  public async getWebSocketStats(): Promise<any> {
    try {
      const activeSessions = this.sessions.size;
      const connectedUsers = this.userSockets.size;

      // Get subscription stats
      const subscriptionStats = new Map<string, number>();
      for (const session of this.sessions.values()) {
        for (const sub of session.subscriptions) {
          subscriptionStats.set(sub, (subscriptionStats.get(sub) || 0) + 1);
        }
      }

      // Convert to object for JSON serialization
      const subscriptions: Record<string, number> = {};
      for (const [key, value] of subscriptionStats) {
        subscriptions[key] = value;
      }

      return {
        activeSessions,
        connectedUsers,
        subscriptions,
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting WebSocket stats:', error);
      return null;
    }
  }

  public async disconnectUser(userId: string, reason: string = 'Admin disconnect'): Promise<boolean> {
    try {
      const socketId = this.userSockets.get(userId);
      if (!socketId) return false;

      const socket = this.io.sockets.sockets.get(socketId);
      if (!socket) return false;

      socket.emit('disconnect-notice', {
        reason,
        timestamp: new Date()
      });

      socket.disconnect(true);
      return true;
    } catch (error) {
      console.error(`Error disconnecting user ${userId}:`, error);
      return false;
    }
  }
}

let websocketService: WebSocketService;

export const initializeWebSocketService = (server: HTTPServer): WebSocketService => {
  websocketService = new WebSocketService(server);
  return websocketService;
};

export const getWebSocketService = (): WebSocketService => {
  if (!websocketService) {
    throw new Error('WebSocket service not initialized');
  }
  return websocketService;
};