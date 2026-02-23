"use client"

import React from 'react';
import { IntentUpdate } from '@/types/polymarket.types';
import { getStateUI, formatShares, formatPrice, formatUSDC } from '@/lib/polymarket';
import { Button } from '@/components/ui/button';

interface TradeProgressProps {
  status: IntentUpdate | null;
  connected: boolean;
  onRetry?: () => void;
  onViewPositions?: () => void;
  onBuyAgain?: () => void;
}

export const TradeProgress: React.FC<TradeProgressProps> = ({
  status,
  connected,
  onRetry,
  onViewPositions,
  onBuyAgain,
}) => {
  if (!status) {
    return (
      <div className="rounded-2xl bg-background-light p-6">
        <div className="text-center text-foreground-light">
          Loading trade status...
        </div>
      </div>
    );
  }

  const ui = getStateUI(status.state);
  const isSuccessState = status.state === 'FILLED' || status.state === 'PARTIAL_FILL';

  return (
    <div className="rounded-2xl bg-background-light p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Trade Status</h3>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-foreground-light">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div
              className={`text-sm font-medium ${
                ui.success
                  ? 'text-green-500'
                  : ui.error
                  ? 'text-red-500'
                  : 'text-foreground'
              }`}
            >
              {ui.label}
            </div>
            {ui.description && (
              <div className="text-xs text-foreground-light mt-1">
                {ui.description}
              </div>
            )}
          </div>
          <span className="text-sm text-foreground-light ml-4">{ui.progress}%</span>
        </div>

        <div className="w-full bg-background-light-sm rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              ui.success
                ? 'bg-green-500'
                : ui.error
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${ui.progress}%` }}
          />
        </div>
      </div>

      {status.fill && (
        <div className="rounded-lg bg-background p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-foreground-light">Shares</span>
            <span className="font-medium text-foreground">
              {formatShares(status.fill.shares)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-light">Avg Price</span>
            <span className="font-medium text-foreground">
              {formatPrice(status.fill.avgPrice)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-light">Total</span>
            <span className="font-medium text-foreground">
              {formatUSDC(status.fill.filledUSDC)}
            </span>
          </div>
        </div>
      )}

      {status.originTxHash && (
        <div className="text-xs text-foreground-light">
          <span>Origin Tx: </span>
          <span className="font-mono">{status.originTxHash.slice(0, 10)}...</span>
        </div>
      )}

      {status.error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-sm text-red-500">{status.error.detail}</p>
        </div>
      )}

      {ui.canRetry && onRetry && (
        <Button onClick={onRetry} variant="secondary" className="w-full">
          Retry Trade
        </Button>
      )}

      {isSuccessState && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {onViewPositions && (
            <Button onClick={onViewPositions} className="w-full">
              View Positions
            </Button>
          )}
          {onBuyAgain && (
            <Button onClick={onBuyAgain} variant="secondary" className="w-full">
              Buy Again
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
