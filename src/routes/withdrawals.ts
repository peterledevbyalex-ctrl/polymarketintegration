import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validation';
import { WithdrawalService } from '../services/withdrawalService';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { supabase } from '../db/supabase';

const router = Router();
const withdrawalService = new WithdrawalService();

const withdrawSchema = z.object({
  megaethAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  walletSignature: z.string().min(1).nullish(), // Optional - uses stored signature
  amountUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/), // Up to 6 decimals
  destCurrency: z.string().optional(), // Default: native ETH
});

/**
 * @swagger
 * /api/withdraw:
 *   post:
 *     summary: Withdraw USDC from Polymarket Safe to MegaETH
 *     tags: [Withdrawals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - megaethAddress
 *               - amountUsdc
 *             properties:
 *               megaethAddress:
 *                 type: string
 *                 description: User's MegaETH address (recipient)
 *               walletSignature:
 *                 type: string
 *                 description: Optional - uses stored signature if not provided
 *               amountUsdc:
 *                 type: string
 *                 description: Amount to withdraw (e.g., "19.53")
 *               destCurrency:
 *                 type: string
 *                 description: Destination currency (default "native")
 *     responses:
 *       200:
 *         description: Withdrawal initiated
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/', validate(withdrawSchema), asyncHandler(async (req: Request, res: Response) => {
  const { megaethAddress, walletSignature: providedSignature, amountUsdc, destCurrency } = req.body;

  logger.info('Withdrawal requested', { megaethAddress, amountUsdc });

  // Get stored signature if not provided
  let walletSignature = providedSignature;
  
  if (!walletSignature) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('megaeth_address', megaethAddress.toLowerCase())
      .single();

    if (user) {
      const { data: wallet } = await supabase
        .from('polymarket_wallets')
        .select('wallet_signature')
        .eq('user_id', user.id)
        .single();
      
      walletSignature = wallet?.wallet_signature;
    }
  }

  if (!walletSignature) {
    throw new AppError(400, 'No wallet signature available', 'MISSING_SIGNATURE');
  }

  try {
    const result = await withdrawalService.initiateWithdrawal({
      megaethAddress,
      walletSignature,
      amountUsdc,
      destCurrency,
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Withdrawal failed', { error: error.message });
    
    if (error.message.includes('Insufficient')) {
      throw new AppError(400, error.message, 'INSUFFICIENT_BALANCE');
    }
    throw new AppError(500, 'Failed to initiate withdrawal');
  }
}));

/**
 * @swagger
 * /api/withdraw/{withdrawalId}:
 *   get:
 *     summary: Get withdrawal status
 *     tags: [Withdrawals]
 *     parameters:
 *       - in: path
 *         name: withdrawalId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Withdrawal status
 *       404:
 *         description: Withdrawal not found
 */
router.get('/:withdrawalId', asyncHandler(async (req: Request, res: Response) => {
  const { withdrawalId } = req.params;

  const withdrawal = await withdrawalService.getWithdrawalStatus(withdrawalId);
  
  if (!withdrawal) {
    throw new AppError(404, 'Withdrawal not found', 'WITHDRAWAL_NOT_FOUND');
  }

  res.json(withdrawal);
}));

/**
 * @swagger
 * /api/withdraw/balance/{megaethAddress}:
 *   get:
 *     summary: Get Safe wallet USDC balance (no signature needed)
 *     tags: [Withdrawals]
 *     parameters:
 *       - in: path
 *         name: megaethAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Balance info
 *       404:
 *         description: Wallet not found
 */
router.get('/balance/:megaethAddress', asyncHandler(async (req: Request, res: Response) => {
  const { megaethAddress } = req.params;

  // Look up user's wallet - no signature needed, just read from DB
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('megaeth_address', megaethAddress.toLowerCase())
    .single();

  if (!user) {
    throw new AppError(404, 'User not found - no wallet exists yet', 'USER_NOT_FOUND');
  }

  const { data: wallet } = await supabase
    .from('polymarket_wallets')
    .select('polygon_wallet_address')
    .eq('user_id', user.id)
    .single();

  if (!wallet) {
    throw new AppError(404, 'Wallet not found - no wallet exists yet', 'WALLET_NOT_FOUND');
  }

  const balance = await withdrawalService.getSafeUsdcBalance(wallet.polygon_wallet_address);

  res.json({
    safeAddress: wallet.polygon_wallet_address,
    balanceUsdc: (Number(balance) / 1_000_000).toFixed(6),
    balanceRaw: balance.toString(),
  });
}));

export default router;
