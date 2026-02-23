"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { ExternalLink, Star } from 'lucide-react';

type Outcome = 'YES' | 'NO';

type EventMarketCardItem = {
  id: string;
  question: string;
  yesPrice?: number;
  noPrice?: number;
  yesLabel?: string;
  noLabel?: string;
};

interface EventMarketCardProps {
  title: string;
  image?: string;
  markets: EventMarketCardItem[];
  category?: string;
  categoryColor?: string;
  volume?: string | number;
  recurrence?: string;
  eventStartTime?: string;
  endDate?: string;
  isLive?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onOutcomeSelect?: (marketId: string, outcome: Outcome) => void;
  onMarketClick?: (marketId: string) => void;
}

const formatPercent = (price?: number) => `${Math.round((price || 0.5) * 100)}%`;

const formatVolume = (volume?: string | number): string => {
  if (!volume) return '';
  const num = typeof volume === 'number' ? volume : parseFloat(volume.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(num)) return String(volume);
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M Vol.`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}k Vol.`;
  return `$${num.toFixed(0)} Vol.`;
};

export const EventMarketCard: React.FC<EventMarketCardProps> = ({
  title,
  image,
  markets,
  category,
  categoryColor = '#85a9ff',
  volume,
  recurrence,
  endDate,
  isLive = false,
  isFavorite = false,
  onToggleFavorite,
  onOutcomeSelect,
  onMarketClick,
}) => {
  const primaryMarketId = markets[0]?.id;
  const recurrenceLabel = recurrence?.trim().toUpperCase();
  const [remainingSec, setRemainingSec] = useState(0);
  const endTs = endDate ? Date.parse(endDate) : NaN;
  useEffect(() => {
    if (!Number.isFinite(endTs)) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      setRemainingSec(Math.max(0, Math.floor((endTs - Date.now()) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endTs]);
  const countdown = (() => {
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  })();
  const isRound = Boolean(recurrenceLabel);
  return (
    <div
      className="relative bg-[#18181b] border border-[#27272a] rounded-xl p-3.5 flex flex-col gap-5 h-[280px] cursor-pointer hover:border-[#3f3f46] transition-colors"
      onClick={() => {
        if (primaryMarketId) onMarketClick?.(primaryMarketId);
      }}
    >
      {isRound ? (
        <div className="absolute left-2 top-2 flex items-center gap-1.5 px-2 py-2 rounded">
          <div className="inline-flex items-center gap-1 rounded-full border border-[#3f3f46] bg-[#1f1f24] px-2 py-0.5">
            <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-[#ef4444] animate-pulse' : 'bg-[#71717b]'}`} />
            <span className="text-[10px] font-semibold text-[#d4d4d8]">{isLive ? 'LIVE' : 'SOON'}</span>
          </div>
          <div className="inline-flex items-center rounded-full border border-[#3f3f46] bg-[#1f1f24] px-2 py-0.5 text-[10px] font-semibold text-[#f59e0b]">
            {recurrenceLabel}
          </div>
        </div>
      ) : category && (
        <div className="absolute left-2 top-2 flex items-center gap-1 px-2 py-2 rounded">
          <div className="w-3 h-3" style={{ color: categoryColor }}>
            <svg viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" />
            </svg>
          </div>
          <p className="text-xs font-medium" style={{ color: categoryColor }}>
            {category}
          </p>
        </div>
      )}

      {(isRound || volume) && (
        <div className="absolute right-2 top-2 px-2 py-2 rounded">
          <p className="text-xs font-medium text-[#9f9fa9]">{isRound && countdown ? countdown : formatVolume(volume)}</p>
        </div>
      )}

      <div className="flex flex-col gap-3.5 items-center justify-center mt-7">
        {image && (
          <div className="relative w-[50px] h-[50px] rounded-lg border-2 border-[#18181b] overflow-hidden flex-shrink-0">
            <Image src={image} alt={title} fill sizes="50px" className="object-cover" />
          </div>
        )}
        <p className="text-[#fafafa] text-xl font-medium text-center leading-[1.2] line-clamp-3">
          {title}
        </p>
      </div>

      <div className="relative flex flex-col gap-3 max-h-[108px] overflow-hidden">
        {markets.map((market) => (
          <div
            key={market.id}
            className="flex items-center gap-2"
            onClick={() => onMarketClick?.(market.id)}
          >
            <p className="flex-1 text-sm text-[rgba(244,243,246,0.6)] font-medium truncate">
              {market.question}
            </p>
            <p className="text-sm text-[#f4f3f6] font-semibold min-w-[34px] text-right">
              {formatPercent(market.yesPrice)}
            </p>
            <button
              className="h-8 px-3 rounded-lg text-xs font-semibold text-[#0b0b0b] bg-[#00ffa3] hover:bg-[#00e693] border border-[rgba(255,255,255,0.35)]"
              onClick={(e) => {
                e.stopPropagation();
                onOutcomeSelect?.(market.id, 'YES');
              }}
            >
              {market.yesLabel || 'Yes'}
            </button>
            <button
              className="h-8 px-3 rounded-lg text-xs font-semibold text-[#0b0b0b] bg-[#ff4d6d] hover:bg-[#e6445f] border border-[rgba(255,255,255,0.35)]"
              onClick={(e) => {
                e.stopPropagation();
                onOutcomeSelect?.(market.id, 'NO');
              }}
            >
              {market.noLabel || 'No'}
            </button>
          </div>
        ))}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-b from-[rgba(24,24,27,0)] to-[#18181b]" />
      </div>

      <div className="mt-auto flex items-center justify-between">
        <div className="flex items-center">
          {image && (
            <div className="-mr-2 h-7 w-7 rounded-full border border-[#18181b] overflow-hidden">
              <Image src={image} alt={title} width={28} height={28} className="object-cover" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-[#9f9fa9] hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.();
            }}
          >
            <Star className={`w-5 h-5 ${isFavorite ? 'fill-[#fbbf24] text-[#fbbf24]' : ''}`} />
          </button>
          <ExternalLink className="w-5 h-5 text-[#9f9fa9]" />
        </div>
      </div>
    </div>
  );
};
