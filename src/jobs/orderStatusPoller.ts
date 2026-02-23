import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PolymarketService } from '../services/polymarketService';
import { IntentService } from '../services/intentService';
import { IntentState } from '../types';
import logger from '../utils/logger';
import { orderStatusQueue } from './queue';
import { websocketService } from '../services/websocketService';
import { config } from '../config';

const polymarketService = new PolymarketService();
const intentService = new IntentService();

// Create Redis connection for worker
function createWorkerConnection() {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Worker for polling Polymarket order status
 */
export const orderStatusWorker = new Worker(
  'order-status',
  async (job: Job) => {
    const { intentId, orderId } = job.data;

    try {
      const fillInfo = await polymarketService.getOrderStatus(orderId);

      if (fillInfo.status === 'filled') {
        const updatedIntent = await intentService.updateIntentState(intentId, IntentState.FILLED);
        // Emit WebSocket update
        if (config.features.websocket) {
          websocketService.emitIntentUpdate(updatedIntent);
        }
        logger.info(`Order ${orderId} filled for intent ${intentId}`);
        return { status: 'filled' };
      } else if (fillInfo.status === 'partial') {
        const updatedIntent = await intentService.updateIntentState(intentId, IntentState.PARTIAL_FILL);
        // Emit WebSocket update
        if (config.features.websocket) {
          websocketService.emitIntentUpdate(updatedIntent);
        }
        // Continue polling for remainder
        await scheduleOrderStatusPoll(intentId, orderId, job.attemptsMade + 1);
        return { status: 'partial' };
      } else if (fillInfo.status === 'failed') {
        const updatedIntent = await intentService.updateIntentState(intentId, IntentState.NEEDS_RETRY, {
          error_code: 'ORDER_FAILED',
          error_detail: 'Order execution failed',
        });
        // Emit WebSocket update
        if (config.features.websocket) {
          websocketService.emitIntentUpdate(updatedIntent);
          websocketService.emitError(intentId, {
            code: 'ORDER_FAILED',
            detail: 'Order execution failed',
          });
        }
        return { status: 'failed' };
      } else {
        // Still open, schedule next poll
        await scheduleOrderStatusPoll(intentId, orderId, job.attemptsMade + 1);
        return { status: 'open' };
      }
    } catch (error) {
      logger.error(`Error polling order status for intent ${intentId}`, error);
      // Retry if not at max attempts
      if (job.attemptsMade < 30) {
        await scheduleOrderStatusPoll(intentId, orderId, job.attemptsMade + 1);
      }
      throw error;
    }
  },
  {
    connection: createWorkerConnection() as any,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

/**
 * Schedule an order status poll job
 */
export async function scheduleOrderStatusPoll(
  intentId: string,
  orderId: string,
  attempt: number = 0
): Promise<void> {
  const delay = Math.min(2000 * (attempt + 1), 10000); // 2s, 4s, 6s... max 10s

  await orderStatusQueue.add(
    `order-status-${intentId}`,
    { intentId, orderId },
    {
      jobId: `order-status-${intentId}-${attempt}`,
      delay,
      attempts: 30,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600,
        count: 100,
      },
    }
  );
}
