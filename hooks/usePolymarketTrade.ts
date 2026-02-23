import { useState, useCallback } from 'react';
import { useSendTransaction, useSignMessage } from 'wagmi';
import { parseEther, Hex } from 'viem';
import { waitForTransactionReceipt } from 'wagmi/actions';
import { wagmiConfig } from '@/providers/WalletProvider';
import { polymarketAPI, PolymarketAPIError } from '@/lib/polymarket/api';
import { DEFAULT_SLIPPAGE_BPS } from '@/lib/polymarket/constants';
import { Outcome, CreateIntentResponse } from '@/types/polymarket.types';
import { useIntent } from './useIntent';

const WALLET_DERIVATION_MESSAGE = 
  'Authorize Prism to manage your Polygon trading wallet.\n\n' +
  'This signature derives your wallet keys. Only sign this on trusted sites.\n\n' +
  'Chain: MegaETH → Polygon\nVersion: 1';

type TradeStep = 'idle' | 'signing_wallet' | 'creating' | 'signing_tx' | 'submitting' | 'tracking';

interface UsePolymarketTradeParams {
  userAddress: string | undefined;
  onSuccess?: (intentId: string) => void;
  onError?: (error: Error) => void;
}

interface UsePolymarketTradeReturn {
  executeTrade: (params: {
    marketId: string;
    outcome: Outcome;
    amountEth?: string;
    action?: 'BUY' | 'SELL';
    amountShares?: number;
    maxSlippageBps?: number;
    orderType?: 'MARKET' | 'LIMIT';
    limitPrice?: number;
  }) => Promise<void>;
  retryTrade: () => Promise<void>;
  step: TradeStep;
  intentId: string | null;
  intentStatus: ReturnType<typeof useIntent>;
  isLoading: boolean;
  error: Error | null;
}

export const usePolymarketTrade = ({
  userAddress,
  onSuccess,
  onError,
}: UsePolymarketTradeParams): UsePolymarketTradeReturn => {
  const [step, setStep] = useState<TradeStep>('idle');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [intentResponse, setIntentResponse] = useState<CreateIntentResponse | null>(null);
  const [walletSignature, setWalletSignature] = useState<string | null>(null);

  const { sendTransactionAsync } = useSendTransaction();
  const { signMessageAsync } = useSignMessage();
  const intentStatus = useIntent(intentId);

  const executeTrade = useCallback(
    async ({
      marketId,
      outcome,
      amountEth,
      action = 'BUY',
      amountShares,
      maxSlippageBps = DEFAULT_SLIPPAGE_BPS,
      orderType = 'MARKET',
      limitPrice,
    }: {
      marketId: string;
      outcome: Outcome;
      amountEth?: string;
      action?: 'BUY' | 'SELL';
      amountShares?: number;
      maxSlippageBps?: number;
      orderType?: 'MARKET' | 'LIMIT';
      limitPrice?: number;
    }) => {
      if (!userAddress) {
        const err = new Error('Wallet not connected');
        setError(err);
        onError?.(err);
        return;
      }

      try {
        setError(null);

        let signature = walletSignature;
        
        // if (!signature) {
        //   setStep('signing_wallet');
        //   signature = await signMessageAsync({
        //     message: WALLET_DERIVATION_MESSAGE,
        //   } as any);
        //   setWalletSignature(signature);
        // }

        setStep('creating');

        const intentRequest: any = {
          megaethAddress: userAddress,
          marketId,
          outcome,
          action,
          maxSlippageBps,
          orderType,
          limitPrice,
          walletSignature: signature || undefined,
        };

        if (action === 'SELL') {
          intentRequest.amountShares = amountShares;
        } else {
          intentRequest.inputCurrency = 'native';
          intentRequest.inputAmountWei = parseEther(amountEth!).toString();
        }

        const response = await polymarketAPI.createIntent(intentRequest);

        setIntentResponse(response);
        setIntentId(response.intentId);

        // SELL orders don't need bridging transaction
        if (action === 'SELL') {
          setStep('tracking');
          onSuccess?.(response.intentId);
          return;
        }

        // BUY orders need bridging transaction
        if (!response.relay) {
          throw new Error('No relay data in response');
        }

        setStep('signing_tx');

        // Send via wallet (broadcasts through wallet's RPC)
        const txHash = await sendTransactionAsync({
          to: response.relay.originTx.to as `0x${string}`,
          data: response.relay.originTx.data as `0x${string}`,
          value: BigInt(response.relay.originTx.value),
        });

        // Move to tracking immediately - backend notification happens after receipt
        // to avoid starting bridge/order orchestration before tx is confirmed.
        setStep('tracking');
        onSuccess?.(response.intentId);

        waitForTransactionReceipt(wagmiConfig, { 
          hash: txHash, 
          pollingInterval: 100,
        }).then(() => {
          console.log('⚡ [Polymarket] Receipt confirmed via realtime API');
          return polymarketAPI.submitOriginTx(response.intentId, txHash, signature);
        }).catch((err) => {
          console.error('submitOriginTx after receipt error:', err);
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        setStep('idle');
        onError?.(error);
      }
    },
    [userAddress, walletSignature, signMessageAsync, sendTransactionAsync, onSuccess, onError]
  );

  const retryTrade = useCallback(async () => {
    if (!intentId) return;

    try {
      setError(null);
      await polymarketAPI.retryIntent(intentId);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Retry failed');
      setError(error);
      onError?.(error);
    }
  }, [intentId, onError]);

  const isLoading = step !== 'idle' && step !== 'tracking';

  return {
    executeTrade,
    retryTrade,
    step,
    intentId,
    intentStatus,
    isLoading,
    error,
  };
};
