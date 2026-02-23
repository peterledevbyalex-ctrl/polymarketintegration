"use client"

import React, { useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
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
  buttonLabel?: string;
  buttonSubLabel?: string;
  className?: string;
  textClassName?: string;
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
  buttonLabel,
  buttonSubLabel,
  className,
  textClassName,
}) => {
  const { isConnected, userAddress } = useApp();
  const { openConnectModal } = useConnectModal();
  const [showProgress, setShowProgress] = useState(false);

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

  if (showProgress && intentStatus.status) {
    const isSuccess = intentStatus.status.state === 'FILLED';
    if (isSuccess && onTradeComplete) {
      setTimeout(() => onTradeComplete(), 1500);
    }
    return (
      <TradeProgress
        status={intentStatus.status}
        connected={intentStatus.connected}
        onRetry={
          intentStatus.status.state === 'NEEDS_RETRY' ? handleRetry : undefined
        }
      />
    );
  }

  const getButtonText = () => {
    if (buttonLabel) return buttonLabel;
    if (!isConnected) return 'Connect Wallet';
    if (step === 'signing_wallet') return 'Sign wallet message...';
    if (step === 'creating') return 'Preparing...';
    if (step === 'signing_tx') return 'Sign transaction...';
    if (step === 'submitting') return 'Submitting...';
    if (orderType === 'LIMIT') return 'Place Limit Order';
    if (action === 'SELL') return 'Trade';
    return `Buy ${outcome === 'YES' ? 'Yes' : 'No'}`;
  };

  const getButtonStyles = () => {
    if (action === 'SELL') {
      return 'text-[#cdb7ff]';
    }
    // Buy action uses white text
    return 'text-white';
  };

  const getButtonInlineStyle = () => {
    if (action === 'BUY' && outcome === 'YES') {
      return {
        borderRadius: '12px',
        border: '0.75px solid rgba(255, 255, 255, 0.50)',
        background: 'radial-gradient(114.1% 95.26% at 48.62% 0%, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.00) 100%), #00FFA3',
        backgroundBlendMode: 'plus-lighter, normal' as const,
        boxShadow: '0 2px 15px 0 rgba(0, 255, 163, 0.20), 0 1px 6px 0 rgba(0, 255, 163, 0.20), 0 0 2px 0 rgba(0, 255, 163, 0.55)'
      };
    }
    if (action === 'BUY' && outcome === 'NO') {
      return {
        borderRadius: '12px',
        border: '0.75px solid rgba(255, 255, 255, 0.50)',
        background: 'radial-gradient(114.1% 95.26% at 48.62% 0%, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.00) 100%), #ff4d6d',
        backgroundBlendMode: 'plus-lighter, normal' as const,
        boxShadow: '0 2px 15px 0 rgba(255, 77, 109, 0.20), 0 1px 6px 0 rgba(255, 77, 109, 0.20), 0 0 2px 0 rgba(255, 77, 109, 0.55)'
      };
    }
    if (action === 'SELL') {
      return {
        borderRadius: '12px',
        background: 'rgba(205, 183, 255, 0.20)'
      };
    }
    return undefined;
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleTrade}
        disabled={disabled || isLoading}
        className={`w-full h-[48px] rounded-[12px] text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getButtonStyles()} ${className || ''}`}
        style={getButtonInlineStyle()}
      >
        <span className={`flex flex-col items-center leading-tight ${textClassName || ''}`}>
          <span>{getButtonText()}</span>
          {buttonSubLabel && <span className="text-xs opacity-80">{buttonSubLabel}</span>}
        </span>
      </button>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-sm text-red-500">{error.message}</p>
        </div>
      )}
    </div>
  );
};
