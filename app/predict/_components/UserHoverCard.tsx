"use client"

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserPositionsResponse } from '@/types/polymarket.types';
import Link from 'next/link';

interface UserHoverCardProps {
  userAddress: string;
  children: React.ReactNode;
  prefetchedData?: UserPositionsResponse | null;
}

export const UserHoverCard: React.FC<UserHoverCardProps> = ({ userAddress, children, prefetchedData }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, rect.left),
      });
    }
  };

  const clearAllTimeouts = () => {
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  };

  const handleMouseEnter = () => {
    clearAllTimeouts();
    showTimeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsHovered(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    clearAllTimeouts();
    // Delay hiding to allow moving to the popover
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  const handlePopoverEnter = () => {
    clearAllTimeouts();
    setIsHovered(true);
  };

  const handlePopoverLeave = () => {
    clearAllTimeouts();
    setIsHovered(false);
  };

  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatPnl = (value: number, percent: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${formatCurrency(value)} (${sign}${percent.toFixed(1)}%)`;
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const popoverContent = (
    <div 
      className="fixed z-[9999] w-[280px] bg-[#1c1c1f] border border-[rgba(255,255,255,0.1)] rounded-[12px] p-4 shadow-xl"
      style={{ top: position.top, left: position.left }}
      onMouseEnter={handlePopoverEnter}
      onMouseLeave={handlePopoverLeave}
    >
      {/* Arrow */}
      <div className="absolute -top-2 left-4 w-4 h-4 bg-[#1c1c1f] border-l border-t border-[rgba(255,255,255,0.1)] rotate-45" />
          
          {/* Header */}
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-[rgba(255,255,255,0.1)]">
            <div 
              className="w-10 h-10 rounded-full flex-shrink-0"
              style={{ 
                background: `linear-gradient(135deg, hsl(${parseInt(userAddress.slice(2, 8), 16) % 360}, 70%, 50%), hsl(${(parseInt(userAddress.slice(2, 8), 16) + 60) % 360}, 70%, 50%))` 
              }}
            />
            <div>
              <p className="text-sm font-semibold text-white">{shortenAddress(userAddress)}</p>
              <p className="text-xs text-[#71717b]">Trader</p>
            </div>
          </div>

          {/* Stats */}
          {prefetchedData ? (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#71717b]">Invested</span>
                <span className="text-sm font-medium text-white">
                  {formatCurrency(prefetchedData.totalInvested)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#71717b]">Portfolio Value</span>
                <span className="text-sm font-medium text-white">
                  {formatCurrency(prefetchedData.totalCurrentValue)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#71717b]">P&L</span>
                <span className={`text-sm font-medium ${prefetchedData.totalUnrealizedPnl >= 0 ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
                  {formatPnl(prefetchedData.totalUnrealizedPnl, prefetchedData.totalUnrealizedPnlPercent)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#71717b]">Open Positions</span>
                <span className="text-sm font-medium text-white">
                  {prefetchedData.openOrders?.length || 0}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#71717b] text-center py-2">No trading history</p>
          )}

      {/* View Profile Link */}
      <Link 
        href={`/predict/profile/${userAddress}`}
        className="block mt-3 pt-3 border-t border-[rgba(255,255,255,0.1)] text-center text-xs text-[#cdb7ff] hover:text-white transition-colors"
      >
        View full profile →
      </Link>
    </div>
  );

  return (
    <div 
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isHovered && typeof document !== 'undefined' && createPortal(popoverContent, document.body)}
    </div>
  );
};
