import { io, Socket } from 'socket.io-client';
import { WebSocketMessage } from '@/types';

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners = new Map<string, Function[]>();

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(process.env.WS_URL || 'http://localhost:3001', {
      auth: { token },
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    this.socket.on('market-update', (data: WebSocketMessage) => {
      this.emit('market-update', data);
    });

    this.socket.on('analysis-update', (data: WebSocketMessage) => {
      this.emit('analysis-update', data);
    });

    this.socket.on('trade-update', (data: WebSocketMessage) => {
      this.emit('trade-update', data);
    });

    this.socket.on('performance-update', (data: WebSocketMessage) => {
      this.emit('performance-update', data);
    });

    this.socket.on('binance-status', (data: WebSocketMessage) => {
      this.emit('binance-status', data);
    });

    this.socket.on('live-data', (data: WebSocketMessage) => {
      this.emit('live-data', data);
    });

    this.socket.on('error', (error: any) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  subscribeToMarket(symbols: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe-market', { symbols });
    }
  }

  unsubscribeFromMarket(symbols: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe-market', { symbols });
    }
  }

  subscribeToAgent(agentId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe-agent', { agentId });
    }
  }

  unsubscribeFromAgent(agentId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe-agent', { agentId });
    }
  }

  getLiveData(symbol: string): void {
    if (this.socket?.connected) {
      this.socket.emit('get-live-data', { symbol });
    }
  }

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  off(event: string, callback?: Function): void {
    if (!callback) {
      this.listeners.delete(event);
      return;
    }

    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const wsClient = new WebSocketClient();