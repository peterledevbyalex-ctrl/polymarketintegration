import { Router, Request, Response } from 'express';
import { createWcmSwapRecord, WcmSwapRecordInput } from '../services/wcmSwapRecordService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/** POST /api/wcm/swap-record - record a WCM swap for fee-share tracking (called by frontend proxy) */
router.post(
  '/swap-record',
  asyncHandler(async (req: Request, res: Response) => {
    const b = req.body as Record<string, unknown>;
    const userAddress = typeof b?.userAddress === 'string' ? b.userAddress : null;
    const tokenIn = typeof b?.tokenIn === 'string' ? b.tokenIn : null;
    const tokenOut = typeof b?.tokenOut === 'string' ? b.tokenOut : null;
    const amountIn = typeof b?.amountIn === 'string' ? b.amountIn : null;
    const amountOut = typeof b?.amountOut === 'string' ? b.amountOut : null;
    const amountInRaw = typeof b?.amountInRaw === 'string' ? b.amountInRaw : null;
    const amountOutRaw = typeof b?.amountOutRaw === 'string' ? b.amountOutRaw : null;
    const txHash = typeof b?.txHash === 'string' ? b.txHash : null;
    const chainId = typeof b?.chainId === 'number' ? b.chainId : null;

    if (!userAddress || !tokenIn || !tokenOut || !amountIn || !amountOut || !amountInRaw || !amountOutRaw || !txHash || chainId == null) {
      return res.status(400).json({
        success: false,
        error: 'missing required field: userAddress, tokenIn, tokenOut, amountIn, amountOut, amountInRaw, amountOutRaw, txHash, chainId',
      });
    }

    const input: WcmSwapRecordInput = {
      userAddress,
      smartWalletAddress: typeof b?.smartWalletAddress === 'string' ? b.smartWalletAddress : undefined,
      tokenIn,
      tokenOut,
      tokenInSymbol: typeof b?.tokenInSymbol === 'string' ? b.tokenInSymbol : undefined,
      tokenOutSymbol: typeof b?.tokenOutSymbol === 'string' ? b.tokenOutSymbol : undefined,
      amountIn,
      amountOut,
      amountInRaw,
      amountOutRaw,
      txHash,
      chainId,
    };

    const result = await createWcmSwapRecord(input);

    if ('error' in result) {
      return res.status(500).json({ success: false, error: result.error });
    }

    return res.status(200).json({ success: true, id: result.id });
  })
);

export default router;
