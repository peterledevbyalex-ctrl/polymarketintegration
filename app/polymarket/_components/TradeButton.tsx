"use client"

import React, { useEffect, useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Button } from '@/components/ui/button';
import { usePolymarketTrade } from '@/hooks/usePolymarketTrade';
import { useApp } from '@/providers/AppProvider';
import { Outcome } from '@/types/polymarket.types';
import { TradeProgress } from './TradeProgress';
import { OrderType } from './OrderTypeDropdown';

interface TradeButtonProps {
  marketId: string;
  outcome: Outcome;
  amountEth?: string;
  action?: 'BUY' | 'SELL';
  amountShares?: number;
  orderType?: OrderType;
  limitPrice?: string;
  shares?: string;
  disabled?: boolean;
  onTradeStart?: (intentId: string) => void;
  onTradeComplete?: () => void;
}

export const TradeButton: React.FC<TradeButtonProps> = ({
  marketId,
  outcome,
  amountEth,
  action = 'BUY',
  amountShares,
  orderType = 'MARKET',
  limitPrice,
  shares,
  disabled = false,
  onTradeStart,
  onTradeComplete,
}) => {
  const { isConnected, userAddress } = useApp();
  const { openConnectModal } = useConnectModal();
  const [showProgress, setShowProgress] = useState(false);
  const [hasHandledSuccess, setHasHandledSuccess] = useState(false);

  const { executeTrade, retryTrade, step, intentStatus, isLoading, error } =
    usePolymarketTrade({
      userAddress,
      onSuccess: (intentId) => {
        setShowProgress(true);
        onTradeStart?.(intentId);
      },
      onError: (err) => {
        console.error('Trade error:', err);
      },
    });

  const handleTrade = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    setHasHandledSuccess(false);
    await executeTrade({
      marketId,
      outcome,
      amountEth,
      action,
      amountShares,
      orderType,
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
    });
  };

  const handleRetry = async () => {
    await retryTrade();
  };

  const handleBuyAgain = () => {
    setShowProgress(false);
    setHasHandledSuccess(false);
  };

  const currentState = intentStatus.status?.state;
  const isTradeSuccess = currentState === 'FILLED' || currentState === 'PARTIAL_FILL';

  useEffect(() => {
    if (!showProgress || !isTradeSuccess || hasHandledSuccess) return;
    setHasHandledSuccess(true);
    const timeoutId = window.setTimeout(() => {
      onTradeComplete?.();
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [showProgress, isTradeSuccess, hasHandledSuccess, onTradeComplete]);

  if (showProgress && intentStatus.status) {
    return (
      <TradeProgress
        status={intentStatus.status}
        connected={intentStatus.connected}
        onRetry={
          intentStatus.status.state === 'NEEDS_RETRY' ? handleRetry : undefined
        }
        onViewPositions={isTradeSuccess ? onTradeComplete : undefined}
        onBuyAgain={isTradeSuccess ? handleBuyAgain : undefined}
      />
    );
  }

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet';
    if (step === 'signing_wallet') return 'Sign wallet message...';
    if (step === 'creating') return 'Preparing...';
    if (step === 'signing_tx') return 'Sign transaction...';
    if (step === 'submitting') return 'Submitting...';
    return orderType === 'LIMIT' ? 'Place Limit Order' : 'Trade';
  };

  const getButtonVariant = () => {
    if (outcome === 'YES') return 'default';
    return 'secondary';
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={handleTrade}
        disabled={disabled || isLoading}
        variant={getButtonVariant()}
        className="w-full"
        size="lg"
      >
        {getButtonText()}
      </Button>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-sm text-red-500">{error.message}</p>
        </div>
      )}
    </div>
  );
};
