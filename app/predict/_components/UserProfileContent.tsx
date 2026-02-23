"use client"

import React from 'react';
import Link from 'next/link';
import { usePositions } from '@/hooks/usePositions';
import { useTradeHistory } from '@/hooks/useTradeHistory';
import { useUserActivity } from '@/hooks/useUserActivity';

interface UserProfileContentProps {
  address: string;
}

export const UserProfileContent: React.FC<UserProfileContentProps> = ({ address }) => {
  const { positions, isLoading: positionsLoading } = usePositions({ 
    eoaAddress: address, 
    autoFetch: true 
  });
  const { trades, isLoading: tradesLoading } = useTradeHistory({ 
    eoaAddress: address, 
    autoFetch: true 
  });
  const { activity, isLoading: activityLoading } = useUserActivity({
    eoaAddress: address,
    limit: 10,
    autoFetch: true,
  });

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  
  const formatCurrency = (value?: number | null) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '$0.00';
    if (numeric >= 1000000) return `$${(numeric / 1000000).toFixed(2)}M`;
    if (numeric >= 1000) return `$${(numeric / 1000).toFixed(2)}K`;
    return `$${numeric.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isLoading = positionsLoading || tradesLoading;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <Link 
          href="/predict"
          className="inline-flex items-center gap-2 text-[#71717b] hover:text-white mb-6 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to markets
        </Link>

        {/* Profile Header */}
        <div className="bg-[#18181b] rounded-[16px] p-6 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div 
              className="w-16 h-16 rounded-full"
              style={{ 
                background: `linear-gradient(135deg, hsl(${parseInt(address.slice(2, 8), 16) % 360}, 70%, 50%), hsl(${(parseInt(address.slice(2, 8), 16) + 60) % 360}, 70%, 50%))` 
              }}
            />
            <div>
              <h1 className="text-xl font-bold text-white">{shortenAddress(address)}</h1>
              <p className="text-sm text-[#71717b]">Trader Profile</p>
              <a 
                href={`https://megaexplorer.xyz/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#cdb7ff] hover:underline"
              >
                View on Explorer →
              </a>
            </div>
          </div>

          {/* Stats Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-[#cdb7ff] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : positions ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#27272a] rounded-[12px] p-4">
                <p className="text-xs text-[#71717b] mb-1">Total Invested</p>
                <p className="text-lg font-bold text-white">{formatCurrency(positions.totalInvested)}</p>
              </div>
              <div className="bg-[#27272a] rounded-[12px] p-4">
                <p className="text-xs text-[#71717b] mb-1">Portfolio Value</p>
                <p className="text-lg font-bold text-white">{formatCurrency(positions.totalCurrentValue)}</p>
              </div>
              <div className="bg-[#27272a] rounded-[12px] p-4">
                <p className="text-xs text-[#71717b] mb-1">Unrealized P&L</p>
                <p className={`text-lg font-bold ${positions.totalUnrealizedPnl >= 0 ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
                  {positions.totalUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(positions.totalUnrealizedPnl)}
                </p>
              </div>
              <div className="bg-[#27272a] rounded-[12px] p-4">
                <p className="text-xs text-[#71717b] mb-1">Open Positions</p>
                <p className="text-lg font-bold text-white">{positions.openOrders?.length || 0}</p>
              </div>
            </div>
          ) : (
            <p className="text-center text-[#71717b] py-4">No trading data available</p>
          )}
        </div>

        {/* Open Positions */}
        {positions && positions.openOrders && positions.openOrders.length > 0 && (
          <div className="bg-[#18181b] rounded-[16px] p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Open Positions</h2>
            <div className="space-y-3">
              {positions.openOrders.map((position) => (
                <div 
                  key={position.orderId}
                  className="bg-[#27272a] rounded-[12px] p-4 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{position.market.question}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${position.outcome === 'YES' ? 'bg-[#00ffa3]/20 text-[#00ffa3]' : 'bg-[#ff6b6b]/20 text-[#ff6b6b]'}`}>
                        {position.outcome}
                      </span>
                      <span className="text-xs text-[#71717b]">{Number(position.size || 0).toFixed(2)} shares</span>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-medium text-white">{formatCurrency(position.currentValue)}</p>
                    <p className={`text-xs ${position.unrealizedPnl >= 0 ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
                      {position.unrealizedPnl >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnl)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trade History */}
        {trades && trades.length > 0 && (
          <div className="bg-[#18181b] rounded-[16px] p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
            <div className="space-y-3">
              {trades.slice(0, 10).map((trade) => (
                <div 
                  key={trade.intentId}
                  className="bg-[#27272a] rounded-[12px] p-4 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      Market {trade.marketId?.slice(0, 8)}...
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${trade.action === 'BUY' ? 'bg-[#00ffa3]/20 text-[#00ffa3]' : 'bg-[#ff6b6b]/20 text-[#ff6b6b]'}`}>
                        {trade.action}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${trade.outcome === 'YES' ? 'bg-[#00ffa3]/10 text-[#00ffa3]' : 'bg-[#ff6b6b]/10 text-[#ff6b6b]'}`}>
                        {trade.outcome}
                      </span>
                      <span className="text-xs text-[#71717b]">
                        {trade.createdAt ? formatDate(trade.createdAt) : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-medium text-white">
                      {formatCurrency((parseFloat(trade.inputAmount || '0') || 0) / 1e6)}
                    </p>
                    <p className={`text-xs ${trade.state === 'FILLED' ? 'text-[#00ffa3]' : trade.state === 'FAILED' ? 'text-[#ff6b6b]' : 'text-[#71717b]'}`}>
                      {trade.state}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* On-chain Activity Feed */}
        <div className="bg-[#18181b] rounded-[16px] p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4">On-chain Activity</h2>
          {activityLoading ? (
            <p className="text-[#71717b]">Loading activity...</p>
          ) : activity.length === 0 ? (
            <p className="text-[#71717b]">No activity found</p>
          ) : (
            <div className="space-y-3">
              {activity.slice(0, 8).map((item, idx) => (
                <div key={`${item.transactionHash || item.timestamp || idx}`} className="bg-[#27272a] rounded-[12px] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white truncate pr-4">{item.title || item.slug || 'Market activity'}</div>
                    <div className="text-xs text-[#71717b]">{item.type || 'TRADE'}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-[#9f9fa9]">
                    <span>
                      {item.side ? `${item.side} ${item.outcome || ''}` : (item.outcome || 'Event')}
                    </span>
                    <span>{item.price !== undefined ? `${(item.price * 100).toFixed(1)}¢` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
