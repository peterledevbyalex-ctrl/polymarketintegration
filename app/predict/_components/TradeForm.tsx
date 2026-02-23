"use client"

import React, { useState } from 'react';
import { Outcome } from '@/types/polymarket.types';
import { TradeButton } from './TradeButton';

interface TradeFormProps {
  marketId: string;
  question: string;
  yesPrice?: number;
  noPrice?: number;
}

export const TradeForm: React.FC<TradeFormProps> = ({
  marketId,
  question,
  yesPrice = 0.5,
  noPrice = 0.5,
}) => {
  const [outcome, setOutcome] = useState<Outcome>('YES');
  const [amount, setAmount] = useState('0.1');

  const selectedPrice = outcome === 'YES' ? yesPrice : noPrice;
  const estimatedShares = amount ? (parseFloat(amount) / selectedPrice).toFixed(2) : '0';

  return (
    <div className="rounded-2xl bg-background-light p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-2">{question}</h2>
        <p className="text-sm text-foreground-light">
          Place your bet on the outcome
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Select Outcome
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setOutcome('YES')}
              className={`rounded-lg p-4 border-2 transition-all ${
                outcome === 'YES'
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-background-light-sm bg-background hover:bg-background-light-sm'
              }`}
            >
              <div className="text-xs text-foreground-light mb-1">YES</div>
              <div
                className={`text-2xl font-bold ${
                  outcome === 'YES' ? 'text-green-500' : 'text-foreground'
                }`}
              >
                {(yesPrice * 100).toFixed(1)}¢
              </div>
            </button>

            <button
              onClick={() => setOutcome('NO')}
              className={`rounded-lg p-4 border-2 transition-all ${
                outcome === 'NO'
                  ? 'border-red-500 bg-red-500/10'
                  : 'border-background-light-sm bg-background hover:bg-background-light-sm'
              }`}
            >
              <div className="text-xs text-foreground-light mb-1">NO</div>
              <div
                className={`text-2xl font-bold ${
                  outcome === 'NO' ? 'text-red-500' : 'text-foreground'
                }`}
              >
                {(noPrice * 100).toFixed(1)}¢
              </div>
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            Amount (ETH)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0"
            className="w-full rounded-lg bg-background border border-background-light-sm px-4 py-3 text-foreground focus:outline-none focus:border-primary transition-colors"
            placeholder="0.1"
          />
        </div>

        <div className="rounded-lg bg-background p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-foreground-light">Price per share</span>
            <span className="font-medium text-foreground">
              ${selectedPrice.toFixed(4)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-foreground-light">Est. shares</span>
            <span className="font-medium text-foreground">{estimatedShares}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-background-light-sm">
            <span className="text-foreground-light">Max slippage</span>
            <span className="font-medium text-foreground">0.5%</span>
          </div>
        </div>
      </div>

      <TradeButton
        marketId={marketId}
        outcome={outcome}
        amountEth={amount}
        disabled={!amount || parseFloat(amount) <= 0}
      />
    </div>
  );
};
