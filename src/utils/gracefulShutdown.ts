import logger from './logger';

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(server?: any): void {
  // Import websocket service to close it
  let websocketService: any;
  try {
    websocketService = require('../services/websocketService').websocketService;
  } catch (error) {
    // WebSocket service not available
  }
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Close job queues if available
      try {
        const { closeQueues } = require('../jobs/queue');
        await closeQueues();
        logger.info('Job queues closed');
      } catch (error) {
        logger.warn('Could not close job queues', error);
      }

      // Close WebSocket server if available
      if (websocketService) {
        websocketService.close();
      }

      // Close HTTP server if provided
      if (server) {
        server.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Give time for ongoing requests to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    // In development, just log and continue - don't crash
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Continuing despite unhandled rejection (development mode)');
      return;
    }
    shutdown('unhandledRejection');
  });
}
