"use client"

import React from 'react';
import Image from 'next/image';

interface MarketCardProps {
  marketId: string;
  question: string;
  yesPrice?: number;
  noPrice?: number;
  volume?: string;
  endDate?: string;
  image?: string;
  onClick?: () => void;
}

const formatVolume = (volume?: string): string => {
  if (!volume) return '';
  
  const num = parseFloat(volume.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return volume;
  
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `$${(num / 1000).toFixed(1)}K`;
  }
  return `$${num.toFixed(0)}`;
};

export const MarketCard: React.FC<MarketCardProps> = ({
  question,
  yesPrice = 0.5,
  noPrice = 0.5,
  volume,
  image,
  onClick,
}) => {
  const yesPercentage = Math.round(yesPrice * 100);
  const noPercentage = Math.round(noPrice * 100);
  const leadingPercentage = Math.max(yesPercentage, noPercentage);
  
  return (
    <div
      onClick={onClick}
      className="relative rounded-xl bg-[#1a1f2e] hover:bg-[#1f2535] transition-all cursor-pointer border border-[#2a2f3e] hover:border-[#3a3f4e] overflow-hidden group"
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {image && (
            <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[#2a2f3e]">
              <Image
                src={image}
                alt={question}
                fill
                className="object-cover"
                sizes="48px"
              />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-medium text-white line-clamp-2 leading-snug">
              {question}
            </h3>
          </div>

          <div className="flex-shrink-0 px-2 py-1 rounded bg-[#2a2f3e] border border-[#3a3f4e]">
            <span className="text-xs font-semibold text-white">
              {leadingPercentage}%
            </span>
            <div className="text-[10px] text-gray-400 leading-none mt-0.5">
              chance
            </div>
          </div>
        </div>

        <div className="relative h-1.5 bg-[#2a2f3e] rounded-full overflow-hidden">
          <div 
            className="absolute left-0 top-0 h-full bg-green-500/60 transition-all"
            style={{ width: `${yesPercentage}%` }}
          />
          <div 
            className="absolute right-0 top-0 h-full bg-red-500/60 transition-all"
            style={{ width: `${noPercentage}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="rounded-lg bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 px-3 py-2.5 transition-colors text-left">
            <div className="text-[11px] text-gray-400 mb-0.5">Yes</div>
            <div className="text-base font-semibold text-green-400">
              {yesPercentage}%
            </div>
          </button>

          <button className="rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 px-3 py-2.5 transition-colors text-left">
            <div className="text-[11px] text-gray-400 mb-0.5">No</div>
            <div className="text-base font-semibold text-red-400">
              {noPercentage}%
            </div>
          </button>
        </div>

        {volume && (
          <div className="flex items-center text-xs text-gray-400 pt-1">
            <span>{formatVolume(volume)} Vol.</span>
          </div>
        )}
      </div>
    </div>
  );
};
