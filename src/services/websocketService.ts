import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { TradeIntent, IntentState } from '../types';
import logger from '../utils/logger';

/**
 * WebSocket service for real-time intent updates
 * Allows frontend to subscribe to intent state changes
 */
export class WebSocketService {
  private io: SocketIOServer | null = null;

  /**
   * Initialize WebSocket server
   */
  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      // Subscribe to intent updates
      socket.on('subscribe:intent', (intentId: string) => {
        socket.join(`intent:${intentId}`);
        logger.info(`Client ${socket.id} subscribed to intent ${intentId}`);
        socket.emit('subscribed', { intentId });
      });

      // Unsubscribe from intent updates
      socket.on('unsubscribe:intent', (intentId: string) => {
        socket.leave(`intent:${intentId}`);
        logger.info(`Client ${socket.id} unsubscribed from intent ${intentId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`WebSocket client disconnected: ${socket.id}`);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`WebSocket error for client ${socket.id}`, error);
      });
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Emit intent state update to all clients subscribed to this intent
   */
  emitIntentUpdate(intent: TradeIntent): void {
    if (!this.io) {
      return;
    }

    this.io.to(`intent:${intent.intent_id}`).emit('intent:update', {
      intentId: intent.intent_id,
      state: intent.state,
      relayStatus: intent.relay_status,
      originTxHash: intent.relay_origin_tx_hash,
      polygonFundingTxHash: intent.polygon_funding_tx_hash,
      polymarketOrderId: intent.polymarket_order_id,
      error: intent.error_code
        ? {
            code: intent.error_code,
            detail: intent.error_detail,
          }
        : null,
      updatedAt: intent.updated_at,
    });

    logger.debug(`Emitted intent update for ${intent.intent_id}`, { state: intent.state });
  }

  /**
   * Emit state transition event
   */
  emitStateTransition(
    intentId: string,
    fromState: IntentState,
    toState: IntentState,
    data?: Record<string, unknown>
  ): void {
    if (!this.io) {
      return;
    }

    this.io.to(`intent:${intentId}`).emit('intent:state-transition', {
      intentId,
      fromState,
      toState,
      timestamp: new Date().toISOString(),
      ...data,
    });

    logger.debug(`Emitted state transition for ${intentId}`, { fromState, toState });
  }

  /**
   * Emit error event
   */
  emitError(intentId: string, error: { code: string; detail: string }): void {
    if (!this.io) {
      return;
    }

    this.io.to(`intent:${intentId}`).emit('intent:error', {
      intentId,
      error,
      timestamp: new Date().toISOString(),
    });

    logger.debug(`Emitted error for ${intentId}`, error);
  }

  /**
   * Get connected clients count (for monitoring)
   */
  getConnectedClients(): number {
    if (!this.io) {
      return 0;
    }
    return this.io.sockets.sockets.size;
  }

  /**
   * Close WebSocket server
   */
  close(): void {
    if (this.io) {
      this.io.close();
      logger.info('WebSocket server closed');
    }
  }
}

// Singleton instance
export const websocketService = new WebSocketService();
