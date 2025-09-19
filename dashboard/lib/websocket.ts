import { io, Socket } from 'socket.io-client';
import { WebSocketMessage } from '@/types';
import config from './config';

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners = new Map<string, Function[]>();

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    try {
      const wsUrl = config.getWebSocketUrl();
      console.log('Connecting to WebSocket:', wsUrl);

      this.socket = io(wsUrl, {
        auth: { token },
        autoConnect: true,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        forceNew: true
      });
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      return;
    }

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        setTimeout(() => {
          if (this.socket && !this.socket.connected) {
            this.socket.connect();
          }
        }, 1000 * this.reconnectAttempts);
      } else {
        console.error('Max reconnection attempts reached');
        this.emit('connection-failed', error);
      }
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
      this.clearAllSubscriptions();
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
    this.activeSubscriptions.clear();
  }

  subscribeToMarket(symbols: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe-market', { symbols });
      symbols.forEach(symbol => this.activeSubscriptions.add(`market:${symbol}`));
    }
  }

  unsubscribeFromMarket(symbols: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe-market', { symbols });
      symbols.forEach(symbol => this.activeSubscriptions.delete(`market:${symbol}`));
    }
  }

  subscribeToAgent(agentId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe-agent', { agentId });
      this.activeSubscriptions.add(`agent:${agentId}`);
    }
  }

  unsubscribeFromAgent(agentId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe-agent', { agentId });
      this.activeSubscriptions.delete(`agent:${agentId}`);
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

  ping(): void {
    if (this.socket?.connected) {
      this.socket.emit('ping', (response: string) => {
        console.log('Ping response:', response);
      });
    }
  }

  getSessionInfo(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        this.socket.emit('get-session-info', (data: any) => {
          resolve(data);
        });
      } else {
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  // Enhanced subscription management
  private activeSubscriptions = new Set<string>();

  subscribeToSymbols(symbols: string[]): void {
    if (this.socket?.connected) {
      // Remove old market subscriptions
      const oldMarketSubs = Array.from(this.activeSubscriptions).filter(sub => sub.startsWith('market:'));
      if (oldMarketSubs.length > 0) {
        const oldSymbols = oldMarketSubs.map(sub => sub.replace('market:', ''));
        this.unsubscribeFromMarket(oldSymbols);
      }

      // Add new subscriptions
      this.subscribeToMarket(symbols);
      symbols.forEach(symbol => this.activeSubscriptions.add(`market:${symbol}`));
    }
  }

  getActiveSubscriptions(): string[] {
    return Array.from(this.activeSubscriptions);
  }

  clearAllSubscriptions(): void {
    const marketSymbols = Array.from(this.activeSubscriptions)
      .filter(sub => sub.startsWith('market:'))
      .map(sub => sub.replace('market:', ''));

    const agentIds = Array.from(this.activeSubscriptions)
      .filter(sub => sub.startsWith('agent:'))
      .map(sub => sub.replace('agent:', ''));

    if (marketSymbols.length > 0) {
      this.unsubscribeFromMarket(marketSymbols);
    }

    if (agentIds.length > 0) {
      agentIds.forEach(agentId => this.unsubscribeFromAgent(agentId));
    }

    this.activeSubscriptions.clear();
  }
}

export const wsClient = new WebSocketClient();