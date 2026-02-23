"use client"

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Star, ExternalLink } from 'lucide-react';
import { TradeButton } from './TradeButton';
import { useApp } from '@/providers/AppProvider';

type MarketOutcome = 'YES' | 'NO';

interface MarketCardProps {
  marketId: string;
  question: string;
  yesPrice?: number;
  noPrice?: number;
  yesLabel?: string;
  noLabel?: string;
  volume?: string | number;
  category?: string;
  categoryColor?: string;
  recurrence?: string;
  eventStartTime?: string;
  endDate?: string;
  isLive?: boolean;
  image?: string;
  onClick?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  isExpanded?: boolean;
  selectedOutcome?: MarketOutcome | null;
  onOutcomeSelect?: (marketId: string, outcome: MarketOutcome) => void;
  onCollapse?: (marketId: string) => void;
}

const formatVolume = (volume?: string | number): string => {
  if (!volume) return '';
  
  const num = typeof volume === 'number' ? volume : parseFloat(volume.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return String(volume);
  
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M Vol.`;
  } else if (num >= 1000) {
    return `$${(num / 1000).toFixed(0)}k Vol.`;
  }
  return `$${num.toFixed(0)} Vol.`;
};

const toEpochSeconds = (value?: string): number | null => {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.floor(ts / 1000);
};

const formatRecurrence = (recurrence?: string) => {
  if (!recurrence) return null;
  return recurrence.trim().toUpperCase();
};

const formatCountdown = (totalSeconds: number) => {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatRoundWindow = (startSec: number | null, endSec: number | null) => {
  if (!startSec || !endSec) return null;
  const start = new Date(startSec * 1000);
  const end = new Date(endSec * 1000);
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${formatter.format(start)}-${formatter.format(end)} ET`;
};

export const MarketCard: React.FC<MarketCardProps> = ({
  marketId,
  question,
  yesPrice = 0.5,
  noPrice = 0.5,
  yesLabel = 'Yes',
  noLabel = 'No',
  volume,
  category = 'Politics',
  categoryColor = '#85a9ff',
  recurrence,
  eventStartTime,
  endDate,
  isLive = false,
  image,
  onClick,
  isFavorite = false,
  onToggleFavorite,
  isExpanded = false,
  selectedOutcome = null,
  onOutcomeSelect,
  onCollapse,
}) => {
  const yesPercentage = Math.round(yesPrice * 100);
  const noPercentage = Math.round(noPrice * 100);
  const [amount, setAmount] = useState('10');
  const [remainingSec, setRemainingSec] = useState(0);
  const sliderValue = Number(amount) || 0;
  const { lastEthPrice } = useApp();
  const roundStartSec = useMemo(() => toEpochSeconds(eventStartTime), [eventStartTime]);
  const roundEndSec = useMemo(() => toEpochSeconds(endDate), [endDate]);
  const recurrenceLabel = useMemo(() => formatRecurrence(recurrence), [recurrence]);
  const isRoundMarket = Boolean(recurrenceLabel || (roundStartSec && roundEndSec));
  const roundWindowLabel = useMemo(
    () => formatRoundWindow(roundStartSec, roundEndSec),
    [roundStartSec, roundEndSec]
  );

  useEffect(() => {
    if (!isExpanded) {
      setAmount('10');
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isRoundMarket || !roundEndSec) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemainingSec(Math.max(0, roundEndSec - now));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isRoundMarket, roundEndSec]);

  const outcomePrice = selectedOutcome === 'YES' ? yesPrice : noPrice;
  const payout = useMemo(() => {
    const amountNumber = Number(amount);
    if (!amountNumber || !outcomePrice) return 0;
    const totalReturn = amountNumber / outcomePrice;
    return Math.max(0, totalReturn - amountNumber);
  }, [amount, outcomePrice]);

  const amountEth = useMemo(() => {
    const amountNumber = Number(amount);
    const ethPriceParsed = Number(lastEthPrice);
    const ethPrice = ethPriceParsed > 0 ? ethPriceParsed : 3000; // Fallback to 3000
    if (!amountNumber || !ethPrice) return '';
    return (amountNumber / ethPrice).toFixed(6);
  }, [amount, lastEthPrice]);

  const handleOutcomeClick = (outcome: MarketOutcome) => {
    onOutcomeSelect?.(marketId, outcome);
  };

  return (
    <div
      onClick={() => {
        if (!isExpanded) onClick?.();
      }}
      className="relative bg-[#18181b] border border-[#27272a] rounded-xl p-3.5 flex flex-col cursor-pointer hover:border-[#3f3f46] transition-colors group h-[280px]"
    >
      {isExpanded && selectedOutcome ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between text-sm">
            <div className="text-sm text-[#a1a1aa]">
              {selectedOutcome === 'YES' ? `Buy ${yesLabel}` : `Buy ${noLabel}`}
            </div>
            <button
              className="text-xs text-[#71717b] hover:text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onCollapse?.(marketId);
              }}
            >
              Close
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-[#27272a] bg-[#151518] p-3 space-y-3 flex-1">
            <div className="text-base text-white line-clamp-2 leading-snug">
              {question}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-[#2a2a2f] bg-[#0f0f12] px-3 py-2.5 flex-1">
                <span className="text-sm text-[#a1a1aa]">$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  inputMode="decimal"
                  className="w-full bg-transparent text-base text-white focus:outline-none"
                />
              </div>
              <div className="flex gap-1">
                {[5, 10].map((increment) => (
                  <button
                    key={increment}
                    className="rounded-lg border border-[#2a2a2f] bg-[#1c1c22] px-3 py-2 text-xs text-[#e4e4e7] hover:bg-[#26262c]"
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextValue = Math.min(100, Number(amount || 0) + increment);
                      setAmount(String(nextValue));
                    }}
                  >
                    +{increment}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={100}
                value={Math.max(1, sliderValue)}
                onChange={(e) => setAmount(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 accent-[#8b5cf6] h-2"
                style={{
                  background: `linear-gradient(90deg, #60a5fa ${sliderValue}%, #374151 ${sliderValue}%)`,
                }}
              />
              <div className="text-sm text-[#a1a1aa] w-12 text-right">
                ${sliderValue.toFixed(0)}
              </div>
            </div>
          </div>

          <TradeButton
            marketId={marketId}
            outcome={selectedOutcome}
            amountEth={amountEth}
            disabled={!amountEth || Number(amountEth) <= 0}
            buttonLabel={selectedOutcome === 'YES' ? `Buy ${yesLabel}` : `Buy ${noLabel}`}
            buttonSubLabel={`To win $${payout.toFixed(2)}`}
            className="mt-3"
            textClassName="text-[#0b0b0b]"
          />
        </div>
      ) : (
        <>
          {/* Top chips */}
          <div className="absolute left-2 top-2 flex items-center gap-1.5 px-2 py-2 rounded">
            {isRoundMarket ? (
              <>
                <div className="inline-flex items-center gap-1 rounded-full border border-[#3f3f46] bg-[#1f1f24] px-2 py-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-[#ef4444] animate-pulse' : 'bg-[#71717b]'}`} />
                  <span className="text-[10px] font-semibold text-[#d4d4d8]">{isLive ? 'LIVE' : 'SOON'}</span>
                </div>
                {recurrenceLabel && (
                  <div className="inline-flex items-center rounded-full border border-[#3f3f46] bg-[#1f1f24] px-2 py-0.5 text-[10px] font-semibold text-[#f59e0b]">
                    {recurrenceLabel}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="w-3 h-3" style={{ color: categoryColor }}>
                  <svg viewBox="0 0 12 12" fill="currentColor">
                    <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" />
                  </svg>
                </div>
                <p className="text-xs font-medium" style={{ color: categoryColor }}>
                  {category}
                </p>
              </>
            )}
          </div>

          {isRoundMarket && roundWindowLabel && (
            <div className="absolute left-2 top-10 rounded-md bg-[#141418] border border-[#27272a] px-2 py-1">
              <p className="text-[11px] font-medium text-[#9f9fa9]">{roundWindowLabel}</p>
            </div>
          )}

          {/* Volume */}
          <div className="absolute right-2 top-2 px-2 py-2 rounded">
            {isRoundMarket ? (
              <p className="text-xs font-semibold text-white tabular-nums">{formatCountdown(remainingSec)}</p>
            ) : (
              <p className="text-xs font-medium text-[#9f9fa9]">
                {formatVolume(volume)}
              </p>
            )}
          </div>

          {/* Top Part - flex-1 to take remaining space */}
          <div className={`flex flex-col gap-3.5 items-center justify-center ${isRoundMarket ? 'mt-14' : 'mt-8'} flex-1`}>
            {/* Photo */}
            {image && (
              <div className="relative w-[50px] h-[50px] rounded-lg border-2 border-[#18181b] overflow-hidden flex-shrink-0">
                <Image
                  src={image}
                  alt={question}
                  fill
                  sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
                  className="object-cover"
                />
              </div>
            )}
            
            {/* Question */}
            <p className="text-[#fafafa] text-xl font-medium text-center leading-[1.2] line-clamp-3">
              {question}
            </p>
          </div>

          {/* Buttons - always at bottom */}
          <div className="flex gap-1.5 w-full mt-4">
            <button
              className={`flex-1 h-10 px-4 py-2.5 rounded-xl border-[0.75px] transition-all duration-150 flex items-center justify-center hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(0,255,163,0.6)] ${
                selectedOutcome === 'YES'
                  ? 'border-[#00ffa3] bg-[#00ffa3] text-[#18181b]'
                  : 'border-[rgba(255,255,255,0.8)] bg-[#00ffa3] text-[#18181b] hover:bg-[#00e693]'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handleOutcomeClick('YES');
              }}
            >
              <p className="text-base font-medium">
                {yesLabel} · {yesPercentage}%
              </p>
            </button>
            <button
              className={`flex-1 h-10 px-4 py-2.5 rounded-xl border-[0.75px] transition-all duration-150 flex items-center justify-center hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(255,77,109,0.6)] ${
                selectedOutcome === 'NO'
                  ? 'border-[#ff4d6d] bg-[#ff4d6d] text-[#18181b]'
                  : 'border-[rgba(255,255,255,0.35)] bg-[#ff4d6d] text-black hover:bg-[#e6445f]'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handleOutcomeClick('NO');
              }}
            >
              <p className="text-base font-medium">
                {noLabel} · {noPercentage}%
              </p>
            </button>
          </div>

          {/* Bottom Bar - Actions only */}
          <div className="flex items-center justify-end w-full mt-3">
            <div className="flex items-center gap-2.5">
              <button 
                className={`w-5 h-5 transition-colors ${isFavorite ? 'text-[#fbbf24]' : 'text-[#9f9fa9] hover:text-[#fbbf24]'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite?.();
                }}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star className="w-5 h-5" fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
              <button 
                className="w-5 h-5 text-[#9f9fa9] hover:text-white transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
