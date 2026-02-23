import { Router, Request, Response } from 'express';
import { IntentService } from '../services/intentService';
import { PolymarketService } from '../services/polymarketService';
import { RelayService } from '../services/relayService';
import { RelayWebhookPayload } from '../types';
import { IntentState } from '../types';
import { AppError } from '../middleware/errorHandler';
import { websocketService } from '../services/websocketService';
import { config } from '../config';
import logger from '../utils/logger';

const router = Router();
const intentService = new IntentService();
const polymarketService = new PolymarketService();
const relayService = new RelayService();

/**
 * @swagger
 * /webhooks/relay:
 *   post:
 *     summary: Relay webhook handler
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 */
router.post('/relay', async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-relay-signature'] as string;
    const payload = JSON.stringify(req.body);

    if (!relayService.verifyWebhookSignature(payload, signature)) {
      throw new AppError(401, 'Invalid webhook signature', 'INVALID_SIGNATURE');
    }

    const data = req.body as RelayWebhookPayload;

    // Find intent by quote ID or request ID
    const { data: intents } = await require('../db/supabase').supabase
      .from('trade_intents')
      .select('*')
      .or(`relay_quote_id.eq.${data.quoteId},relay_request_id.eq.${data.requestId}`)
      .limit(1);

    if (!intents || intents.length === 0) {
      logger.warn('No intent found for relay webhook', { quoteId: data.quoteId, requestId: data.requestId });
      res.status(404).json({ error: 'Intent not found' });
      return;
    }

    const intent = intents[0];

    // Update intent based on relay status
    if (data.status === 'executed' && data.destTxHash) {
      const updatedIntent = await intentService.handleRelayExecution(intent.intent_id, data.destTxHash);
      // Emit WebSocket update
      if (config.features.websocket) {
        websocketService.emitIntentUpdate(updatedIntent);
      }
      // Trigger order placement
      await handleOrderPlacement(intent.intent_id);
    } else if (data.status === 'failed') {
      const updatedIntent = await intentService.updateIntentState(
        intent.intent_id,
        IntentState.FAILED,
        {
          error_code: 'RELAY_FAILED',
          error_detail: data.error || 'Relay execution failed',
          relay_status: 'failed',
        }
      );
      // Emit WebSocket update
      if (config.features.websocket) {
        websocketService.emitIntentUpdate(updatedIntent);
        websocketService.emitError(intent.intent_id, {
          code: 'RELAY_FAILED',
          detail: data.error || 'Relay execution failed',
        });
      }
    } else if (data.status === 'executing') {
      const updatedIntent = await intentService.updateIntentState(intent.intent_id, IntentState.RELAY_EXECUTING, {
        relay_status: 'executing',
        relay_origin_tx_hash: data.originTxHash,
      });
      // Emit WebSocket update
      if (config.features.websocket) {
        websocketService.emitIntentUpdate(updatedIntent);
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Error handling relay webhook', error);
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleOrderPlacement(intentId: string): Promise<void> {
  const intent = await intentService.getIntent(intentId);
  if (!intent) {
    return;
  }

  // Check for existing order
  const existingOrder = await polymarketService.checkExistingOrder(intentId);
  if (existingOrder) {
    const updatedIntent = await intentService.updateIntentState(intentId, IntentState.ORDER_PLACED, {
      polymarket_order_id: existingOrder.orderId,
      polymarket_tx_hash: existingOrder.txHash,
    });
    // Emit WebSocket update
    if (config.features.websocket) {
      websocketService.emitIntentUpdate(updatedIntent);
    }
    return;
  }

  // Place new order
  const submittingIntent = await intentService.updateIntentState(intentId, IntentState.ORDER_SUBMITTING);
  // Emit WebSocket update
  if (config.features.websocket) {
    websocketService.emitIntentUpdate(submittingIntent);
  }

  try {
    const orderResult = await polymarketService.placeOrder(intent);
    const updatedIntent = await intentService.updateIntentState(intentId, IntentState.ORDER_PLACED, {
      polymarket_order_id: orderResult.orderId,
      polymarket_tx_hash: orderResult.txHash,
    });
    // Emit WebSocket update
    if (config.features.websocket) {
      websocketService.emitIntentUpdate(updatedIntent);
    }

    // Schedule order status polling via background job
    if (process.env.ENABLE_BACKGROUND_JOBS !== 'false') {
      try {
        const { scheduleOrderStatusPoll } = await import('../jobs/orderStatusPoller');
        await scheduleOrderStatusPoll(intentId, orderResult.orderId, 0);
      } catch (error) {
        logger.warn('Background jobs not available, falling back to setTimeout', error);
        // Fallback to setTimeout if jobs not available
        setTimeout(async () => {
          try {
            const fillInfo = await polymarketService.getOrderStatus(orderResult.orderId);
            if (fillInfo.status === 'filled') {
              await intentService.updateIntentState(intentId, IntentState.FILLED);
            } else if (fillInfo.status === 'partial') {
              await intentService.updateIntentState(intentId, IntentState.PARTIAL_FILL);
            }
          } catch (error) {
            logger.error('Error polling order status', error);
          }
        }, 5000);
      }
    }
  } catch (error) {
    logger.error('Error placing order', error);
    const updatedIntent = await intentService.updateIntentState(intentId, IntentState.NEEDS_RETRY, {
      error_code: 'ORDER_FAILED',
      error_detail: error instanceof Error ? error.message : 'Unknown error',
    });
    // Emit WebSocket update
    if (config.features.websocket) {
      websocketService.emitIntentUpdate(updatedIntent);
      websocketService.emitError(intentId, {
        code: 'ORDER_FAILED',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default router;

