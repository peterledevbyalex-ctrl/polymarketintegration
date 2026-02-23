import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { IntentService } from '../services/intentService';
import { PolymarketService } from '../services/polymarketService';
import { RelayService } from '../services/relayService';
import { IntentState } from '../types';
import { AppError } from '../middleware/errorHandler';
import { validate } from '../middleware/validation';
import { userRateLimiter, checkAmountLimit } from '../middleware/userRateLimit';
import { supabase } from '../db/supabase';
import { websocketService } from '../services/websocketService';
import { config } from '../config';
import logger from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyWalletSignature } from '../utils/signatureKeyDerivation';
import { WalletService } from '../services/walletService';
import { scheduleRelayPoll } from '../jobs/relayPoller';

const router = Router();
const intentService = new IntentService();
const polymarketService = new PolymarketService();
const relayService = new RelayService();

/**
 * @swagger
 * /api/intents/wallet-message:
 *   get:
 *     summary: Get the message users must sign to derive their Polygon wallet
 *     tags: [Intents]
 *     responses:
 *       200:
 *         description: Wallet derivation message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: The message to sign with personal_sign
 */
router.get('/wallet-message', (_req: Request, res: Response) => {
  res.json({
    message: WalletService.getDerivationMessage(),
    instructions: 'Sign this message with personal_sign (EIP-191) on MegaETH, then include the signature as walletSignature in your intent request.',
  });
});

const createIntentSchema = z.object({
  megaethAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  marketId: z.string().min(1),
  outcome: z.enum(['YES', 'NO']),
  // Action: BUY (default) or SELL
  action: z.enum(['BUY', 'SELL']).optional().default('BUY'),
  inputCurrency: z.string().optional().default('native'),
  // For BUY: use amountUsdc or inputAmountWei
  amountUsdc: z.union([z.string(), z.number()]).transform(v => Number(v)).optional(),
  inputAmountWei: z.string().regex(/^\d+$/, 'Must be a numeric string').optional(),
  // For SELL: use amountShares (number of shares to sell)
  amountShares: z.union([z.string(), z.number()]).transform(v => Number(v)).optional(),
  maxSlippageBps: z.number().int().min(0).max(1000).optional(),
  clientRequestId: z.string().uuid().optional(),
  // Signature only required for first trade (wallet creation). After that, uses stored signature.
  walletSignature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature').nullish(),
  // Order type: MARKET (instant fill at best price) or LIMIT (sits in orderbook)
  orderType: z.enum(['MARKET', 'LIMIT']).optional().default('MARKET'),
  // Limit price (0.01 - 0.99) - required for LIMIT orders, accepts number or string
  limitPrice: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
}).refine(
  (data) => {
    // BUY requires amountUsdc or inputAmountWei
    if (data.action === 'BUY' || !data.action) {
      return data.amountUsdc !== undefined || data.inputAmountWei !== undefined;
    }
    // SELL requires amountShares
    return data.amountShares !== undefined && data.amountShares > 0;
  },
  { message: 'BUY requires amountUsdc/inputAmountWei, SELL requires amountShares' }
).refine(
  (data) => data.orderType !== 'LIMIT' || data.limitPrice !== undefined,
  { message: 'limitPrice is required for LIMIT orders', path: ['limitPrice'] }
).refine(
  (data) => {
    if (data.limitPrice) {
      const price = parseFloat(data.limitPrice);
      return price >= 0.01 && price <= 0.99;
    }
    return true;
  },
  { message: 'limitPrice must be between 0.01 and 0.99', path: ['limitPrice'] }
);

const cancelOrderSchema = z.object({
  megaethAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  walletSignature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature').nullish(), // Uses stored if not provided
  orderId: z.string().min(1),
});

const updateOriginTxSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash'),
  // Optional - uses stored signature if not provided (accepts null, undefined, or valid string)
  walletSignature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format').nullish(),
});

/**
 * @swagger
 * /api/intents:
 *   post:
 *     summary: Create a new trade intent
 *     description: |
 *       Creates a trade intent and returns the bridge transaction to sign.
 *       walletSignature is only required for the FIRST trade (wallet creation).
 *       After that, the stored signature is used automatically.
 *     tags: [Intents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - megaethAddress
 *               - marketId
 *               - outcome
 *               - inputCurrency
 *               - inputAmountWei
 *             properties:
 *               megaethAddress:
 *                 type: string
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *               marketId:
 *                 type: string
 *                 example: "0x123..."
 *               outcome:
 *                 type: string
 *                 enum: [YES, NO]
 *               inputCurrency:
 *                 type: string
 *                 example: "native"
 *               inputAmountWei:
 *                 type: string
 *                 example: "100000000000000000"
 *               maxSlippageBps:
 *                 type: number
 *                 example: 50
 *               walletSignature:
 *                 type: string
 *                 description: Only required for first trade. After that, uses stored signature.
 *               clientRequestId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Intent created successfully
 *       400:
 *         description: Wallet signature required for first-time setup
 */
router.post('/', userRateLimiter, checkAmountLimit, validate(createIntentSchema), asyncHandler(async (req: Request, res: Response) => {
  try {
    const requestBody = { ...req.body };
    const isSell = requestBody.action === 'SELL';
    
    // For BUY: convert amountUsdc to inputAmountWei
    if (!isSell && requestBody.amountUsdc !== undefined && !requestBody.inputAmountWei) {
      requestBody.inputAmountWei = String(Math.floor(requestBody.amountUsdc * 1e6));
    }
    delete requestBody.amountUsdc;
    
    const intent = await intentService.createIntent(requestBody);

    // Get wallet address
    const { data: wallet } = await supabase
      .from('polymarket_wallets')
      .select('polygon_wallet_address, wallet_signature')
      .eq('user_id', intent.user_id)
      .single();

    if (!wallet) {
      throw new AppError(500, 'Wallet not found', 'WALLET_NOT_FOUND');
    }

    // SELL orders: execute immediately (no bridging needed)
    if (isSell) {
      // Trigger order placement directly
      try {
        const result = await polymarketService.placeOrder(intent as any);
        
        res.json({
          intentId: intent.intent_id,
          state: result.status === 'filled' ? 'FILLED' : 'ORDER_PLACED',
          action: 'SELL',
          polymarketWalletAddress: wallet.polygon_wallet_address,
          order: {
            orderId: result.orderId,
            status: result.status,
            outcome: intent.outcome,
            shares: requestBody.amountShares,
          },
          message: 'Sell order placed - no bridging required',
        });
      } catch (orderError: any) {
        logger.error('Error placing sell order', { error: orderError.message });
        // Return 400 for user errors (insufficient balance/shares)
        if (orderError.message?.includes('Insufficient')) {
          throw new AppError(400, orderError.message, 'INSUFFICIENT_BALANCE');
        }
        throw new AppError(500, `Failed to place sell order: ${orderError.message}`);
      }
      return;
    }

    // BUY orders: return relay tx for user to sign
    if (!intent.relay_origin_tx_data) {
      throw new AppError(500, 'Origin transaction data not found', 'MISSING_TX_DATA');
    }

    res.json({
      intentId: intent.intent_id,
      state: intent.state,
      action: 'BUY',
      polymarketWalletAddress: wallet.polygon_wallet_address,
      relay: {
        quoteId: intent.relay_quote_id || '',
        originTx: intent.relay_origin_tx_data,
      },
      estimates: {
        destToken: 'USDC.e',
        destAmountExpected: intent.dest_amount_expected,
        destAmountMin: intent.dest_amount_min,
      },
    });
  } catch (error) {
    logger.error('Error creating intent', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to create intent');
  }
}));

/**
 * @swagger
 * /api/intents/{intentId}:
 *   get:
 *     summary: Get intent status
 *     tags: [Intents]
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Intent status
 */
router.get('/:intentId', asyncHandler(async (req: Request, res: Response) => {
  const { intentId } = req.params;

  const intent = await intentService.getIntent(intentId);
  if (!intent) {
    throw new AppError(404, 'Intent not found', 'NOT_FOUND');
  }

  let fill = undefined;
  if (intent.polymarket_order_id) {
    try {
      fill = await polymarketService.getOrderStatus(intent.polymarket_order_id);
    } catch (error) {
      logger.warn('Failed to get order status', error);
    }
  }

  res.json({
    intentId: intent.intent_id,
    state: intent.state,
    relayStatus: intent.relay_status,
    originTxHash: intent.relay_origin_tx_hash,
    polygonFundingTxHash: intent.polygon_funding_tx_hash,
    polymarketOrderId: intent.polymarket_order_id,
    fill,
    error: intent.error_code
      ? {
          code: intent.error_code,
          detail: intent.error_detail,
        }
      : null,
  });
}));

/**
 * @swagger
 * /api/intents/{intentId}/origin-tx:
 *   post:
 *     summary: Submit origin transaction hash and wallet signature
 *     description: |
 *       Called after user signs the bridge transaction. Requires the wallet
 *       derivation signature to derive the Polygon private key for trading.
 *     tags: [Intents]
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txHash
 *             properties:
 *               txHash:
 *                 type: string
 *                 description: The bridge transaction hash on MegaETH
 *               walletSignature:
 *                 type: string
 *                 description: Optional - uses stored signature if not provided
 */
router.post('/:intentId/origin-tx', validate(updateOriginTxSchema), asyncHandler(async (req: Request, res: Response) => {
  const { intentId } = req.params;
  const { txHash, walletSignature: providedSignature } = req.body;

  // Get intent first (need user_id for parallel queries)
  const currentIntent = await intentService.getIntent(intentId);
  if (!currentIntent) {
    throw new AppError(404, 'Intent not found', 'NOT_FOUND');
  }

  // PARALLEL: Get user + wallet at the same time
  const [{ data: user }, { data: wallet }] = await Promise.all([
    supabase.from('users').select('id, megaeth_address').eq('id', currentIntent.user_id).single(),
    supabase.from('polymarket_wallets').select('wallet_signature').eq('user_id', currentIntent.user_id).single(),
  ]);

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const walletSignature = providedSignature || wallet?.wallet_signature;
  if (!walletSignature) {
    throw new AppError(400, 'No wallet signature available', 'MISSING_SIGNATURE');
  }

  // Verify the signature if one was provided (skip if using stored)
  if (providedSignature) {
    const isValid = await verifyWalletSignature(providedSignature, user.megaeth_address);
    if (!isValid) {
      throw new AppError(400, 'Invalid wallet signature', 'INVALID_SIGNATURE');
    }
  }

  // Update intent with tx hash
  const intent = await intentService.updateOriginTxHash(intentId, txHash, walletSignature);

    // Emit WebSocket update
    if (config.features.websocket) {
      websocketService.emitIntentUpdate(intent);
    }

  // Respond immediately - don't block on poll scheduling
  res.json({ intentId: intent.intent_id, state: intent.state });

  // Start monitoring relay execution (fire and forget)
  if (intent.relay_quote_id) {
    const useBackgroundJobs = process.env.ENABLE_BACKGROUND_JOBS !== 'false';

    if (useBackgroundJobs) {
      scheduleRelayPoll(intentId, intent.relay_quote_id, 0)
        .then(() => logger.info('Scheduled background relay poll', { intentId }))
        .catch((error) => {
          logger.warn('Background jobs failed, falling back to inline polling', error);
          startInlinePolling(intentId, intent.relay_quote_id!);
        });
    } else {
      startInlinePolling(intentId, intent.relay_quote_id);
    }
  }
}));

// Helper for inline polling fallback
function startInlinePolling(intentId: string, quoteId: string): void {
  logger.info('Using inline polling for relay status', { intentId, quoteId });
  relayService.pollExecutionStatus(
    quoteId,
    async (status) => {
      logger.info('Relay status update', { intentId, status: status.status, destTxHash: status.destTxHash });
      if (status.status === 'executed') {
        logger.info('Relay executed, triggering order placement', { intentId });
        await intentService.handleRelayExecution(intentId, status.destTxHash || 'unknown');
        await handleOrderPlacement(intentId);
      } else if (status.status === 'failed') {
        await intentService.updateIntentState(intentId, IntentState.FAILED, {
          error_code: 'RELAY_FAILED',
          error_detail: 'Relay execution failed',
          relay_status: 'failed',
        });
      }
    }
  ).catch((error) => {
    logger.error('Error in polling execution status', error);
  });
}

/**
 * @swagger
 * /api/intents/{intentId}/retry:
 *   post:
 *     summary: Retry trade execution
 *     tags: [Intents]
 *     parameters:
 *       - in: path
 *         name: intentId
 *         required: true
 *         schema:
 *           type: string
 */
router.post('/:intentId/retry', asyncHandler(async (req: Request, res: Response) => {
  const { intentId } = req.params;

  const intent = await intentService.getIntent(intentId);
  if (!intent) {
    throw new AppError(404, 'Intent not found', 'NOT_FOUND');
  }

  if (intent.state !== IntentState.NEEDS_RETRY && intent.state !== IntentState.DEST_FUNDED) {
    throw new AppError(400, 'Intent cannot be retried in current state', 'INVALID_STATE');
  }

  await handleOrderPlacement(intentId);

  const updated = await intentService.getIntent(intentId);
  
  // Emit WebSocket update
  if (updated && config.features.websocket) {
    websocketService.emitIntentUpdate(updated);
  }
  
  res.json({ intentId: updated?.intent_id, state: updated?.state });
}));

async function handleOrderPlacement(intentId: string): Promise<void> {
  const intent = await intentService.getIntent(intentId);
  if (!intent) {
    throw new AppError(404, 'Intent not found', 'NOT_FOUND');
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
              const updatedIntent = await intentService.updateIntentState(intentId, IntentState.FILLED);
              if (config.features.websocket) {
                websocketService.emitIntentUpdate(updatedIntent);
              }
            } else if (fillInfo.status === 'partial') {
              const updatedIntent = await intentService.updateIntentState(intentId, IntentState.PARTIAL_FILL);
              if (config.features.websocket) {
                websocketService.emitIntentUpdate(updatedIntent);
              }
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

/**
 * TEST ENDPOINT - Direct Polymarket order test (skip bridge)
 * Use this to debug CLOB order placement without waiting for Relay
 */
router.post('/test-order', asyncHandler(async (req: Request, res: Response) => {
  const { marketId, outcome, amountUsdc } = req.body;
  
  if (!marketId || !outcome || !amountUsdc) {
    throw new AppError(400, 'Missing marketId, outcome, or amountUsdc', 'VALIDATION_ERROR');
  }
  
  logger.info('TEST: Direct order placement', { marketId, outcome, amountUsdc });
  
  // Create a mock intent for testing
  const mockIntent = {
    intent_id: 'test-' + Date.now(),
    user_id: 'test-user',
    market_id: marketId,
    outcome: outcome,
    dest_amount_expected: String(parseFloat(amountUsdc) * 1e6), // Convert to 6 decimals
    max_slippage_bps: 100,
  };
  
  try {
    const result = await polymarketService.placeOrder(mockIntent as any);
    logger.info('TEST: Order result', { result });
    res.json({ success: true, result });
  } catch (error: any) {
    logger.error('TEST: Order failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
}));

/**
 * ADMIN: Withdraw USDC from Safe wallet
 * POST /api/intents/admin/withdraw
 */
router.post('/admin/withdraw', asyncHandler(async (req: Request, res: Response) => {
  const { toAddress, amountUsdc } = req.body;
  
  if (!toAddress || !amountUsdc) {
    throw new AppError(400, 'Missing toAddress or amountUsdc');
  }
  
  // Import relayer client
  const { PolymarketRelayerClient } = await import('../services/polymarketRelayerClient');
  const relayerClient = new PolymarketRelayerClient();
  
  logger.info('ADMIN: Withdrawing USDC', { toAddress, amountUsdc });
  
  try {
    const result = await relayerClient.withdrawUSDC(toAddress, parseFloat(amountUsdc));
    logger.info('ADMIN: Withdrawal successful', { result });
    res.json({ 
      success: true, 
      result,
      message: `Withdrew ${amountUsdc} USDC to ${toAddress}`
    });
  } catch (error: any) {
    logger.error('ADMIN: Withdrawal failed', { error: error.message });
    res.status(400).json({ success: false, error: error.message });
  }
}));

/**
 * @swagger
 * /api/intents/cancel:
 *   post:
 *     summary: Cancel an open limit order
 *     description: Cancels an unfilled or partially filled limit order
 *     tags: [Intents]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - megaethAddress
 *               - orderId
 *             properties:
 *               megaethAddress:
 *                 type: string
 *               walletSignature:
 *                 type: string
 *                 description: Optional - uses stored signature if not provided
 *               orderId:
 *                 type: string
 *                 description: The Polymarket order ID to cancel
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Order cannot be cancelled
 */
router.post('/cancel', validate(cancelOrderSchema), asyncHandler(async (req: Request, res: Response) => {
  const { megaethAddress, walletSignature: providedSignature, orderId } = req.body;

  // Get user and stored signature
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('megaeth_address', megaethAddress.toLowerCase())
    .single();

  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const { data: wallet } = await supabase
    .from('polymarket_wallets')
    .select('wallet_signature')
    .eq('user_id', user.id)
    .single();

  // Use provided signature or stored signature
  const walletSignature = providedSignature || wallet?.wallet_signature;
  
  if (!walletSignature) {
    throw new AppError(400, 'No wallet signature available', 'MISSING_SIGNATURE');
  }

  // Verify the signature only if provided (skip verification for stored)
  if (providedSignature) {
    const { verifyWalletSignature } = await import('../utils/signatureKeyDerivation');
    const isValid = await verifyWalletSignature(providedSignature, megaethAddress);
    if (!isValid) {
      throw new AppError(400, 'Invalid wallet signature', 'INVALID_SIGNATURE');
    }
  }

  try {
    const result = await polymarketService.cancelOrder(orderId, walletSignature, megaethAddress);
    
    // If we have an intent for this order, update its state
    const { data: intent } = await supabase
      .from('trade_intents')
      .select('intent_id')
      .eq('polymarket_order_id', orderId)
      .single();
    
    if (intent) {
      await intentService.updateIntentState(intent.intent_id, IntentState.CANCELLED);
    }
    
    res.json({
      orderId,
      status: result.success ? 'cancelled' : 'failed',
      message: result.message,
    });
  } catch (error: any) {
    logger.error('Error cancelling order', { orderId, error: error.message });
    throw new AppError(400, error.message || 'Failed to cancel order', 'CANCEL_FAILED');
  }
}));

/**
 * @swagger
 * /api/intents/orders:
 *   get:
 *     summary: Get user's open orders
 *     tags: [Intents]
 *     parameters:
 *       - in: query
 *         name: megaethAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of open orders
 */
router.get('/orders', asyncHandler(async (req: Request, res: Response) => {
  const { megaethAddress } = req.query;
  
  if (!megaethAddress || typeof megaethAddress !== 'string') {
    throw new AppError(400, 'megaethAddress is required', 'VALIDATION_ERROR');
  }

  try {
    const orders = await polymarketService.getOpenOrders(megaethAddress);
    res.json({ orders });
  } catch (error: any) {
    logger.error('Error fetching open orders', { error: error.message });
    throw new AppError(500, 'Failed to fetch orders');
  }
}));

export default router;

