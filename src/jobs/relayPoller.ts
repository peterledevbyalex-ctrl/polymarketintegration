import { ConnectionOptions, Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { RelayService } from '../services/relayService';
import { IntentService } from '../services/intentService';
import { IntentState } from '../types';
import logger from '../utils/logger';
import { relayPollQueue } from './queue';
import { websocketService } from '../services/websocketService';
import { config } from '../config';
import { markPollAttempt, markBridgeCompleted } from '../utils/relayTiming';

const relayService = new RelayService();
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
 * Worker for polling Relay execution status
 */
export const relayPollWorker = new Worker(
  'relay-poll',
  async (job: Job) => {
    const { intentId, quoteId, attempt = 0 } = job.data;

    // Track this poll attempt for timing
    markPollAttempt(intentId);

    try {
      const status = await relayService.getExecutionStatus(quoteId);

      if (status.status === 'executed' && status.destTxHash) {
        // Mark bridge completed for timing report
        markBridgeCompleted(intentId);
        const updatedIntent = await intentService.handleRelayExecution(intentId, status.destTxHash);
        // Emit WebSocket update
        if (config.features.websocket) {
          websocketService.emitIntentUpdate(updatedIntent);
        }
        logger.info(`Relay executed for intent ${intentId}, triggering order placement`);
        
        // Trigger order placement
        try {
          const { PolymarketService } = await import('../services/polymarketService');
          const polymarketService = new PolymarketService();
          
          // Get the full intent for order placement
          const intent = await intentService.getIntent(intentId);
          if (intent) {
            // Update to ORDER_SUBMITTING
            const submittingIntent = await intentService.updateIntentState(intentId, IntentState.ORDER_SUBMITTING);
            if (config.features.websocket) {
              websocketService.emitIntentUpdate(submittingIntent);
            }
            
            // Place the order
            const orderResult = await polymarketService.placeOrder(intent);
            
            // If order is already filled/matched, go straight to FILLED
            if (orderResult.status === 'filled') {
              const filledIntent = await intentService.updateIntentState(intentId, IntentState.FILLED, {
                polymarket_order_id: orderResult.orderId,
                polymarket_tx_hash: orderResult.txHash,
              });
              if (config.features.websocket) {
                websocketService.emitIntentUpdate(filledIntent);
              }
              logger.info(`Order filled immediately for intent ${intentId}`, { orderId: orderResult.orderId });
            } else {
              // Order is open/partial, need to poll for status
              const placedIntent = await intentService.updateIntentState(intentId, IntentState.ORDER_PLACED, {
                polymarket_order_id: orderResult.orderId,
                polymarket_tx_hash: orderResult.txHash,
              });
              if (config.features.websocket) {
                websocketService.emitIntentUpdate(placedIntent);
              }
              
              logger.info(`Order placed for intent ${intentId}`, { orderId: orderResult.orderId, status: orderResult.status });
              
              // Schedule order status polling only if not filled
              const { scheduleOrderStatusPoll } = await import('./orderStatusPoller');
              await scheduleOrderStatusPoll(intentId, orderResult.orderId, 0);
            }
          }
        } catch (orderError: any) {
          logger.error(`Failed to place order for intent ${intentId}`, { error: orderError.message });
          const failedIntent = await intentService.updateIntentState(intentId, IntentState.NEEDS_RETRY, {
            error_code: 'ORDER_FAILED',
            error_detail: orderError.message,
          });
          if (config.features.websocket) {
            websocketService.emitIntentUpdate(failedIntent);
            websocketService.emitError(intentId, {
              code: 'ORDER_FAILED',
              detail: orderError.message,
            });
          }
        }
        
        return { status: 'executed', destTxHash: status.destTxHash };
      } else if (status.status === 'failed') {
        const updatedIntent = await intentService.updateIntentState(intentId, IntentState.FAILED, {
          error_code: 'RELAY_FAILED',
          error_detail: 'Relay execution failed',
          relay_status: 'failed',
        });
        // Emit WebSocket update
        if (config.features.websocket) {
          websocketService.emitIntentUpdate(updatedIntent);
          websocketService.emitError(intentId, {
            code: 'RELAY_FAILED',
            detail: 'Relay execution failed',
          });
        }
        return { status: 'failed' };
      } else if (status.status === 'executing') {
        // Get current intent state to avoid invalid same-state transition
        const currentIntent = await intentService.getIntent(intentId);
        if (currentIntent && currentIntent.state !== IntentState.RELAY_EXECUTING) {
          const updatedIntent = await intentService.updateIntentState(intentId, IntentState.RELAY_EXECUTING, {
            relay_status: 'executing',
            relay_origin_tx_hash: status.originTxHash,
          });
          if (config.features.websocket) {
            websocketService.emitIntentUpdate(updatedIntent);
          }
        }
        // Schedule next poll with incremented attempt
        await scheduleRelayPoll(intentId, quoteId, attempt + 1);
        return { status: 'executing' };
      } else {
        // Still pending/submitted/waiting, schedule next poll
        logger.info(`Relay still processing, scheduling poll ${attempt + 1}`, { intentId, status: status.status });
        await scheduleRelayPoll(intentId, quoteId, attempt + 1);
        return { status: 'pending' };
      }
    } catch (error) {
      logger.error(`Error polling relay for intent ${intentId}`, error);
      // Retry if not at max attempts
      if (attempt < 60) {
        await scheduleRelayPoll(intentId, quoteId, attempt + 1);
      }
      throw error;
    }
  },
  {
    connection: createWorkerConnection() as unknown as ConnectionOptions,
    limiter: {
      max: 10,
      duration: 1000,
    },
  }
);

/**
 * Schedule a relay poll job - bridge takes ~10s
 * First poll at 3s, then every 1s
 */
export async function scheduleRelayPoll(
  intentId: string,
  quoteId: string,
  attempt: number = 0
): Promise<void> {
  // First poll at 3s, then every 1s after
  const delay = attempt === 0 ? 2000 : 1000;

  // Use timestamp to ensure unique jobId (BullMQ ignores duplicate jobIds)
  const jobId = `relay-poll-${intentId}-${attempt}-${Date.now()}`;
  
  await relayPollQueue.add(
    `relay-poll-${intentId}`,
    { intentId, quoteId, attempt },
    {
      jobId,
      delay,
      removeOnComplete: {
        age: 3600,
        count: 100,
      },
    }
  );
  
  logger.debug(`Scheduled relay poll`, { intentId, attempt, delay });
}
