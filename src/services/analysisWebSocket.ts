import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { aiAnalysisWorker, AnalysisJob } from './aiAnalysisWorker';
// Simple token verification (replace with actual implementation)
const verifyToken = async (token: string): Promise<{ id: string }> => {
  // Simplified token verification for now
  return { id: 'user_' + Math.random().toString(36).substr(2, 9) };
};

interface AuthenticatedSocket extends Socket {
  userId?: string;
  subscribedJobs?: Set<string>;
}

class AnalysisWebSocketService {
  private io: SocketIOServer | null = null;
  private connectedClients: Map<string, AuthenticatedSocket> = new Map();

  public initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: ["http://localhost:3000", "http://localhost:3001", "https://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
      },
      path: '/analysis/',
      transports: ['websocket', 'polling']
    });

    this.setupEventListeners();
    this.setupSocketHandlers();

    console.log('🔗 Analysis WebSocket service initialized on path /analysis/');
  }

  private setupEventListeners(): void {
    // Listen to job updates from the AI worker
    aiAnalysisWorker.on('jobCreated', (job: AnalysisJob) => {
      this.broadcastJobUpdate(job, 'jobCreated');
    });

    aiAnalysisWorker.on('jobUpdated', (job: AnalysisJob) => {
      this.broadcastJobUpdate(job, 'jobUpdated');
    });
  }

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', async (socket: AuthenticatedSocket) => {
      console.log(`🔌 Client connected: ${socket.id}`);

      // Authenticate the socket connection
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (token) {
        try {
          const decoded = await verifyToken(token);
          socket.userId = decoded.id || 'anonymous';
          console.log(`✅ Socket authenticated for user: ${socket.userId}`);
        } catch (error) {
          console.log(`❌ Socket authentication failed: ${error}`);
          socket.userId = 'anonymous';
        }
      } else {
        socket.userId = 'anonymous';
      }

      socket.subscribedJobs = new Set();
      this.connectedClients.set(socket.id, socket);

      // Handle job subscription
      socket.on('subscribeToJob', (data: { jobId: string }) => {
        this.handleJobSubscription(socket, data.jobId);
      });

      // Handle job unsubscription
      socket.on('unsubscribeFromJob', (data: { jobId: string }) => {
        this.handleJobUnsubscription(socket, data.jobId);
      });

      // Handle getting current job status
      socket.on('getJobStatus', (data: { jobId: string }) => {
        this.handleGetJobStatus(socket, data.jobId);
      });

      // Handle user jobs request
      socket.on('getUserJobs', () => {
        this.handleGetUserJobs(socket);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });

      // Send initial connection confirmation
      socket.emit('connected', {
        socketId: socket.id,
        userId: socket.userId,
        timestamp: new Date().toISOString()
      });
    });
  }

  private handleJobSubscription(socket: AuthenticatedSocket, jobId: string): void {
    if (!socket.userId) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }

    const job = aiAnalysisWorker.getJob(jobId);
    if (!job) {
      socket.emit('error', { message: 'Job not found' });
      return;
    }

    if (job.userId !== socket.userId) {
      socket.emit('error', { message: 'Access denied to this job' });
      return;
    }

    socket.subscribedJobs?.add(jobId);
    socket.join(`job_${jobId}`);

    console.log(`📊 User ${socket.userId} subscribed to job ${jobId}`);

    // Send current job status immediately
    socket.emit('jobStatus', {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentSymbol: job.currentSymbol,
      processedSymbols: job.processedSymbols,
      totalSymbols: job.totalSymbols,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error,
      resultsCount: job.results?.length || 0
    });
  }

  private handleJobUnsubscription(socket: AuthenticatedSocket, jobId: string): void {
    socket.subscribedJobs?.delete(jobId);
    socket.leave(`job_${jobId}`);
    console.log(`📊 User ${socket.userId} unsubscribed from job ${jobId}`);
  }

  private handleGetJobStatus(socket: AuthenticatedSocket, jobId: string): void {
    if (!socket.userId) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }

    const job = aiAnalysisWorker.getJob(jobId);
    if (!job) {
      socket.emit('jobStatus', { jobId, status: 'not_found' });
      return;
    }

    if (job.userId !== socket.userId) {
      socket.emit('error', { message: 'Access denied to this job' });
      return;
    }

    const elapsedTime = Date.now() - job.startTime.getTime();
    const estimatedTotal = 120000; // 2 minutes
    const remainingTime = Math.max(0, estimatedTotal - elapsedTime);

    socket.emit('jobStatus', {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentSymbol: job.currentSymbol,
      processedSymbols: job.processedSymbols,
      totalSymbols: job.totalSymbols,
      startTime: job.startTime,
      endTime: job.endTime,
      elapsedTime: Math.round(elapsedTime / 1000),
      estimatedRemainingTime: Math.round(remainingTime / 1000),
      error: job.error,
      resultsCount: job.results?.length || 0
    });
  }

  private handleGetUserJobs(socket: AuthenticatedSocket): void {
    if (!socket.userId) {
      socket.emit('error', { message: 'Authentication required' });
      return;
    }

    const userJobs = aiAnalysisWorker.getUserJobs(socket.userId);
    const sanitizedJobs = userJobs
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, 10)
      .map(job => ({
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        symbols: job.symbols,
        totalSymbols: job.totalSymbols,
        processedSymbols: job.processedSymbols,
        startTime: job.startTime,
        endTime: job.endTime,
        error: job.error,
        resultsCount: job.results?.length || 0,
        currentSymbol: job.currentSymbol
      }));

    socket.emit('userJobs', sanitizedJobs);
  }

  private broadcastJobUpdate(job: AnalysisJob, eventType: 'jobCreated' | 'jobUpdated'): void {
    if (!this.io) return;

    const elapsedTime = Date.now() - job.startTime.getTime();
    const estimatedTotal = 120000; // 2 minutes
    const remainingTime = Math.max(0, estimatedTotal - elapsedTime);

    const jobUpdate = {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      currentSymbol: job.currentSymbol,
      processedSymbols: job.processedSymbols,
      totalSymbols: job.totalSymbols,
      startTime: job.startTime,
      endTime: job.endTime,
      elapsedTime: Math.round(elapsedTime / 1000),
      estimatedRemainingTime: Math.round(remainingTime / 1000),
      error: job.error,
      resultsCount: job.results?.length || 0,
      eventType
    };

    // Broadcast to job-specific room
    this.io.to(`job_${job.id}`).emit('jobUpdate', jobUpdate);

    // Also broadcast to user's personal room if they're connected
    this.broadcastToUser(job.userId, 'jobUpdate', jobUpdate);

    console.log(`📡 Broadcasted ${eventType} for job ${job.id} (${job.status}, ${job.progress}%)`);
  }

  private broadcastToUser(userId: string, event: string, data: any): void {
    if (!this.io) return;

    // Find all sockets for this user
    for (const [socketId, socket] of this.connectedClients) {
      if (socket.userId === userId) {
        socket.emit(event, data);
      }
    }
  }

  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  public getJobSubscribersCount(jobId: string): number {
    if (!this.io) return 0;

    const room = this.io.sockets.adapter.rooms.get(`job_${jobId}`);
    return room ? room.size : 0;
  }
}

export const analysisWebSocketService = new AnalysisWebSocketService();