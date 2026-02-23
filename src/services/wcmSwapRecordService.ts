import { supabase } from '../db/supabase';
import logger from '../utils/logger';

export interface WcmSwapRecordInput {
  userAddress: string;
  smartWalletAddress?: string;
  tokenIn: string;
  tokenOut: string;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
  amountIn: string;
  amountOut: string;
  amountInRaw: string;
  amountOutRaw: string;
  txHash: string;
  chainId: number;
}

export async function createWcmSwapRecord(input: WcmSwapRecordInput): Promise<{ id: string } | { error: string }> {
  const row = {
    eoa_address: input.userAddress.toLowerCase(),
    smart_wallet_address: input.smartWalletAddress?.trim() ? input.smartWalletAddress.toLowerCase() : null,
    token_in: input.tokenIn.toLowerCase(),
    token_out: input.tokenOut.toLowerCase(),
    token_in_symbol: input.tokenInSymbol?.trim() || null,
    token_out_symbol: input.tokenOutSymbol?.trim() || null,
    amount_in: input.amountIn,
    amount_out: input.amountOut,
    amount_in_raw: input.amountInRaw,
    amount_out_raw: input.amountOutRaw,
    tx_hash: input.txHash,
    chain_id: input.chainId,
  };

  const { data, error } = await supabase.from('wcm_swap_records').insert(row).select('id').single();

  if (error) {
    logger.error('WCM swap record insert failed', { error: error.message, txHash: input.txHash });
    return { error: error.message };
  }

  return { id: data.id };
}
