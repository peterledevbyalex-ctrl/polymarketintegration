import { Router, Request, Response } from 'express';
import { PolymarketService } from '../services/polymarketService';
import { WalletService } from '../services/walletService';
import { supabase } from '../db/supabase';
import logger from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const polymarketService = new PolymarketService();

/**
 * @swagger
 * /api/positions/{userId}:
 *   get:
 *     summary: Get all active positions for a user
 *     description: Uses stored wallet signature (sign once, query always)
 *     tags: [Positions]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User positions retrieved successfully
 */
router.get('/:userId', asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  logger.info('Fetching positions for user', { userId });
  
  const positions = await polymarketService.getUserPositions(userId);
  
  res.json(positions);
}));

/**
 * @swagger
 * /api/positions/eoa/{eoaAddress}:
 *   get:
 *     summary: Get all active positions by user's MegaETH EOA address
 *     description: Recommended endpoint for frontends. Uses stored signature.
 *     tags: [Positions]
 *     parameters:
 *       - in: path
 *         name: eoaAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: The user's MegaETH EOA address (0x...)
 *     responses:
 *       200:
 *         description: User positions retrieved successfully
 */
router.get('/eoa/:eoaAddress', asyncHandler(async (req: Request, res: Response) => {
  const { eoaAddress } = req.params;
  
  logger.info('Fetching positions by EOA address', { eoaAddress });
  
  // Look up user by their MegaETH address
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('megaeth_address', eoaAddress.toLowerCase())
    .single();
  
  if (!user) {
    res.json({
      wallet: '',
      eoa: eoaAddress,
      usdcBalance: 0,
      openOrders: [],
      totalInvested: 0,
      totalPotentialPayout: 0,
    });
    return;
  }
  
  const positions = await polymarketService.getUserPositions(user.id);
  
  res.json({
    ...positions,
    eoa: eoaAddress,
  });
}));

/**
 * @swagger
 * /api/positions/wallet/{walletAddress}:
 *   get:
 *     summary: Get all active positions by Polymarket Safe wallet address
 *     tags: [Positions]
 *     parameters:
 *       - in: path
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wallet positions retrieved successfully
 *       404:
 *         description: Wallet not found
 */
router.get('/wallet/:walletAddress', asyncHandler(async (req: Request, res: Response) => {
  const { walletAddress } = req.params;
  
  logger.info('Fetching positions for wallet', { walletAddress });
  
  // Look up user by wallet address
  const { data: wallet } = await supabase
    .from('polymarket_wallets')
    .select('user_id')
    .eq('polygon_wallet_address', walletAddress.toLowerCase())
    .single();
  
  if (!wallet) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }
  
  const positions = await polymarketService.getUserPositions(wallet.user_id);
  
  res.json(positions);
}));

/**
 * @swagger
 * /api/positions/add-eoa-owner:
 *   post:
 *     summary: Add user's EOA as a Safe owner
 *     description: |
 *       Adds the user's MegaETH EOA address as a second owner of their Safe wallet.
 *       After this, user can import the Safe into Safe{Wallet} app and use it on Polymarket.com.
 *       
 *       This is a one-time operation per wallet. Costs ~$0.01-0.02 in gas on Polygon.
 *     tags: [Wallet]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - megaethAddress
 *             properties:
 *               megaethAddress:
 *                 type: string
 *                 description: User's MegaETH EOA address (will be added as Safe owner)
 *                 example: "0x68915D1eA12Eb987956e4e647289611e31a982F7"
 *               walletSignature:
 *                 type: string
 *                 description: Optional - uses stored signature if not provided
 *     responses:
 *       200:
 *         description: EOA successfully added as owner
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 txHash:
 *                   type: string
 *                 safeAddress:
 *                   type: string
 *                 newOwner:
 *                   type: string
 *                 message:
 *                   type: string
 *                 links:
 *                   type: object
 *                   properties:
 *                     safeApp:
 *                       type: string
 *                     polygonscan:
 *                       type: string
 *       400:
 *         description: Missing signature or wallet not found
 */
router.post('/add-eoa-owner', asyncHandler(async (req: Request, res: Response) => {
  const { megaethAddress, walletSignature } = req.body;
  
  if (!megaethAddress) {
    throw new AppError(400, 'megaethAddress is required');
  }

  logger.info('Adding EOA as Safe owner', { megaethAddress });

  // Get user and wallet
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('megaeth_address', megaethAddress.toLowerCase())
    .single();
  
  if (!user) {
    throw new AppError(404, 'User not found. Please create a wallet first.');
  }

  const { data: wallet } = await supabase
    .from('polymarket_wallets')
    .select('*, derivation_version, signature_encrypted')
    .eq('user_id', user.id)
    .single();
  
  if (!wallet) {
    throw new AppError(404, 'Wallet not found. Please create a wallet first.');
  }

  // Check if already done
  if (wallet.eoa_owner_added) {
    res.json({
      success: true,
      txHash: '0x0',
      safeAddress: wallet.polygon_wallet_address,
      newOwner: megaethAddress,
      message: 'EOA is already an owner of this Safe',
      links: {
        safeApp: `https://app.safe.global/home?safe=matic:${wallet.polygon_wallet_address}`,
        polygonscan: `https://polygonscan.com/address/${wallet.polygon_wallet_address}`,
      }
    });
    return;
  }

  // Get the signature (from request or stored, decrypt if needed)
  const derivationVersion = (wallet.derivation_version || 1) as 1 | 2;
  let signature = walletSignature;
  
  if (!signature && wallet.wallet_signature) {
    if (wallet.signature_encrypted) {
      const { decryptSignature } = await import('../utils/encryption');
      signature = decryptSignature(wallet.wallet_signature);
    } else {
      signature = wallet.wallet_signature;
    }
  }
  
  if (!signature) {
    throw new AppError(400, 'Wallet signature required. Please sign the wallet message.');
  }

  // Derive the current owner's private key using correct version
  const walletService = new WalletService();
  const ownerPrivateKey = walletService.deriveUserPrivateKey(
    signature,
    derivationVersion === 2 ? user.id : undefined,
    derivationVersion
  );

  // Add the EOA as owner
  const result = await walletService.addEOAOwner(
    wallet.polygon_wallet_address,
    megaethAddress, // Add user's EOA as owner
    ownerPrivateKey
  );

  res.json({
    success: true,
    txHash: result.txHash,
    safeAddress: wallet.polygon_wallet_address,
    newOwner: result.newOwner,
    message: 'Your EOA is now an owner of your Safe. You can import it into Safe{Wallet} app.',
    links: {
      safeApp: `https://app.safe.global/home?safe=matic:${wallet.polygon_wallet_address}`,
      polygonscan: `https://polygonscan.com/address/${wallet.polygon_wallet_address}`,
      polymarket: `https://polymarket.com/profile/${wallet.polygon_wallet_address}`,
    }
  });
}));

/**
 * @swagger
 * /api/positions/links/{megaethAddress}:
 *   get:
 *     summary: Get links to view Safe on external platforms
 *     tags: [Wallet]
 *     parameters:
 *       - in: path
 *         name: megaethAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Links to external platforms
 */
router.get('/links/:megaethAddress', asyncHandler(async (req: Request, res: Response) => {
  const { megaethAddress } = req.params;

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('megaeth_address', megaethAddress.toLowerCase())
    .single();
  
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const { data: wallet } = await supabase
    .from('polymarket_wallets')
    .select('polygon_wallet_address, eoa_owner_added')
    .eq('user_id', user.id)
    .single();
  
  if (!wallet) {
    throw new AppError(404, 'Wallet not found');
  }

  const safe = wallet.polygon_wallet_address;

  res.json({
    safeAddress: safe,
    eoaOwnerAdded: wallet.eoa_owner_added || false,
    links: {
      polygonscan: `https://polygonscan.com/address/${safe}`,
      safeApp: `https://app.safe.global/home?safe=matic:${safe}`,
      polymarketProfile: `https://polymarket.com/profile/${safe}`,
    },
    instructions: wallet.eoa_owner_added 
      ? 'You can import this Safe into Safe{Wallet} app using your EOA.'
      : 'Call POST /api/positions/add-eoa-owner first to enable Safe{Wallet} import.',
  });
}));

/**
 * @swagger
 * /api/positions/history/{eoaAddress}:
 *   get:
 *     summary: Get trade history for a user
 *     tags: [Positions]
 *     parameters:
 *       - in: path
 *         name: eoaAddress
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Trade history
 */
router.get('/history/:eoaAddress', asyncHandler(async (req: Request, res: Response) => {
  const { eoaAddress } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  logger.info('Fetching trade history', { eoaAddress, limit, offset });

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('megaeth_address', eoaAddress.toLowerCase())
    .single();

  if (!user) {
    res.json({ trades: [], total: 0 });
    return;
  }

  // Get trade intents with count
  const { data: trades, error, count } = await supabase
    .from('trade_intents')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error('Error fetching trade history', error);
    throw new AppError(500, 'Failed to fetch trade history');
  }

  // Format trades for response
  const formattedTrades = (trades || []).map((trade: any) => ({
    intentId: trade.intent_id,
    marketId: trade.market_id,
    conditionId: trade.condition_id,
    outcome: trade.outcome,
    action: trade.input_amount ? 'BUY' : 'SELL',
    orderType: trade.order_type || 'MARKET',
    inputAmount: trade.input_amount,
    inputCurrency: trade.input_currency,
    destAmountExpected: trade.dest_amount_expected,
    limitPrice: trade.limit_price,
    state: trade.state,
    polymarketOrderId: trade.polymarket_order_id,
    originTxHash: trade.relay_origin_tx_hash,
    polygonTxHash: trade.polygon_funding_tx_hash,
    errorCode: trade.error_code,
    errorDetail: trade.error_detail,
    createdAt: trade.created_at,
    updatedAt: trade.updated_at,
  }));

  res.json({
    trades: formattedTrades,
    total: count || 0,
    limit,
    offset,
  });
}));

export default router;
