"use client"

import React from 'react';

export const MarketCardSkeleton: React.FC = () => {
  return (
    <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl p-3.5 flex flex-col h-[280px] animate-pulse">
      {/* Category Tag */}
      <div className="absolute left-2 top-2 flex items-center gap-1 px-2 py-2 rounded">
        <div className="w-3 h-3 bg-[#27272a] rounded" />
        <div className="w-16 h-3 bg-[#27272a] rounded" />
      </div>

      {/* Volume */}
      <div className="absolute right-2 top-2 px-2 py-2 rounded">
        <div className="w-20 h-3 bg-[#27272a] rounded" />
      </div>

      {/* Top Part */}
      <div className="flex flex-col gap-3.5 items-center justify-center mt-8 flex-1">
        {/* Photo */}
        <div className="relative w-[50px] h-[50px] rounded-lg bg-[#27272a]" />
        
        {/* Question */}
        <div className="w-full px-4 space-y-2">
          <div className="h-4 bg-[#27272a] rounded w-3/4 mx-auto" />
          <div className="h-4 bg-[#27272a] rounded w-2/3 mx-auto" />
          <div className="h-4 bg-[#27272a] rounded w-1/2 mx-auto" />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-1.5 w-full mt-4">
        <div className="flex-1 h-10 rounded-xl bg-[#27272a]" />
        <div className="flex-1 h-10 rounded-xl bg-[#27272a]" />
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-end w-full mt-3">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 bg-[#27272a] rounded" />
          <div className="w-5 h-5 bg-[#27272a] rounded" />
        </div>
      </div>
    </div>
  );
};
