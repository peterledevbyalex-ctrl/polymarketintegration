"use client"

import React, { useState } from 'react';
import { useApp } from '@/providers/AppProvider';
import { usePositions } from '@/hooks/usePositions';
import { useTradeHistory } from '@/hooks/useTradeHistory';
import { useOpenOrders } from '@/hooks/useOpenOrders';
import { useRouter } from 'next/navigation';
import { IntentState } from '@/types/polymarket.types';
import { polymarketAPI } from '@/lib/polymarket/api';

type Tab = 'positions' | 'orders' | 'history';

export const PolymarketProfileContent: React.FC = () => {
  const { userAddress } = useApp();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('positions');
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [withdrawingIdle, setWithdrawingIdle] = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const { positions, isLoading, refetch } = usePositions({ 
    eoaAddress: userAddress, 
    autoFetch: !!userAddress 
  });
  const { 
    trades, 
    total: totalTrades, 
    isLoading: historyLoading, 
    loadMore, 
    hasMore,
    refetch: refetchHistory 
  } = useTradeHistory({
    eoaAddress: userAddress,
    autoFetch: !!userAddress,
  });
  const {
    orders,
    isLoading: ordersLoading,
    cancelOrder,
    refetch: refetchOrders,
  } = useOpenOrders({
    eoaAddress: userAddress,
    autoFetch: !!userAddress,
  });

  const positionsList = positions?.openOrders || [];
  const idleUsdcBalance = positions?.usdcBalance || 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getStateColor = (state: IntentState) => {
    switch (state) {
      case 'FILLED':
        return 'bg-[#00ffa3]/20 text-[#00ffa3]';
      case 'FAILED':
      case 'CANCELLED':
        return 'bg-[#ff6b6b]/20 text-[#ff6b6b]';
      case 'ORDER_PLACED':
      case 'RELAY_EXECUTING':
      case 'DEST_FUNDED':
        return 'bg-blue-500/20 text-blue-500';
      default:
        return 'bg-[#71717b]/20 text-[#71717b]';
    }
  };

  const getStateLabel = (state: IntentState) => {
    switch (state) {
      case 'FILLED': return 'Filled';
      case 'FAILED': return 'Failed';
      case 'CANCELLED': return 'Cancelled';
      case 'ORDER_PLACED': return 'Order Placed';
      case 'RELAY_EXECUTING': return 'Bridging';
      case 'DEST_FUNDED': return 'Funded';
      case 'PARTIAL_FILL': return 'Partial';
      default: return state.replace(/_/g, ' ');
    }
  };

  const handleWithdrawIdleBalance = async () => {
    if (!userAddress || idleUsdcBalance <= 0.01) return;
    setWithdrawingIdle(true);
    setWithdrawNotice(null);
    setWithdrawError(null);

    try {
      const amountUsdc = idleUsdcBalance.toFixed(6).replace(/\.?0+$/, '');
      const result = await polymarketAPI.initiateWithdrawal({
        megaethAddress: userAddress,
        amountUsdc,
        destCurrency: 'native',
        requireBridge: true,
      });
      setWithdrawNotice(`Withdrawal started (${result.withdrawalId}). Funds are moving to MegaETH.`);
      await refetch();
    } catch (err: any) {
      setWithdrawError(err?.message || 'Failed to start withdrawal');
    } finally {
      setWithdrawingIdle(false);
    }
  };

  if (!userAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Connect Wallet</h2>
          <p className="text-[#71717b]">Please connect your wallet to view your positions</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#71717b]">Loading your positions...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">My Portfolio</h1>
            <p className="text-[#71717b]">Track your Polymarket positions and performance</p>
          </div>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-white text-sm transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-5">
            <div className="text-xs text-[#71717b] mb-2">USDC Balance</div>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(positions?.usdcBalance || 0)}
            </div>
            {idleUsdcBalance > 0.01 && (
              <button
                onClick={handleWithdrawIdleBalance}
                disabled={withdrawingIdle}
                className="mt-3 w-full px-3 py-2 rounded-lg bg-[#00ffa3] hover:bg-[#00e693] text-black text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {withdrawingIdle ? 'Withdrawing...' : 'Withdraw to MegaETH'}
              </button>
            )}
          </div>
          
          <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-5">
            <div className="text-xs text-[#71717b] mb-2">Total Invested</div>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(positions?.totalInvested || 0)}
            </div>
          </div>
          
          <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-5">
            <div className="text-xs text-[#71717b] mb-2">Current Value</div>
            <div className="text-2xl font-bold text-white">
              {formatCurrency(positions?.totalCurrentValue || 0)}
            </div>
          </div>
          
          <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-5">
            <div className="text-xs text-[#71717b] mb-2">Unrealized P&L</div>
            <div className={`text-2xl font-bold ${(positions?.totalUnrealizedPnl || 0) >= 0 ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
              {(positions?.totalUnrealizedPnl || 0) >= 0 ? '+' : ''}{formatCurrency(positions?.totalUnrealizedPnl || 0)}
            </div>
            <div className={`text-xs ${(positions?.totalUnrealizedPnlPercent || 0) >= 0 ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
              {(positions?.totalUnrealizedPnlPercent || 0) >= 0 ? '+' : ''}{(positions?.totalUnrealizedPnlPercent || 0).toFixed(1)}%
            </div>
          </div>
          
          <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-5">
            <div className="text-xs text-[#71717b] mb-2">If All Resolve Yes</div>
            <div className="text-2xl font-bold text-[#00ffa3]">
              {formatCurrency(positions?.totalPotentialPayout || 0)}
            </div>
            <div className="text-xs text-[#71717b]">
              {positionsList.length} position{positionsList.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {(withdrawNotice || withdrawError) && (
          <div className={`rounded-[12px] border p-4 mb-6 ${withdrawError ? 'bg-[#2a1414] border-[#5c2424] text-[#ff6b6b]' : 'bg-[#11251b] border-[#1f4d35] text-[#00ffa3]'}`}>
            {withdrawError || withdrawNotice}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[#27272a]">
          <button
            onClick={() => setActiveTab('positions')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'positions'
                ? 'text-white border-[#00ffa3]'
                : 'text-[#71717b] border-transparent hover:text-white'
            }`}
          >
            Open Positions ({positionsList.length})
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'orders'
                ? 'text-white border-[#00ffa3]'
                : 'text-[#71717b] border-transparent hover:text-white'
            }`}
          >
            Open Orders ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === 'history'
                ? 'text-white border-[#00ffa3]'
                : 'text-[#71717b] border-transparent hover:text-white'
            }`}
          >
            Trade History {totalTrades > 0 && `(${totalTrades})`}
          </button>
        </div>

        {/* Content */}
        {activeTab === 'positions' && (
          <>
            {positionsList.length === 0 ? (
              <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-12 text-center">
                <div className="text-[#71717b] mb-4">No open positions</div>
                <p className="text-sm text-[#71717b] mb-6">Start trading to see your positions here</p>
                <button
                  onClick={() => router.push('/predict')}
                  className="px-6 py-3 rounded-lg bg-[#00ffa3] hover:bg-[#00e693] text-black font-medium transition-colors"
                >
                  Browse Markets
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Table Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs text-[#71717b] uppercase tracking-wider">
                  <div className="col-span-4">Market</div>
                  <div className="col-span-1 text-center">Outcome</div>
                  <div className="col-span-1 text-center">Shares</div>
                  <div className="col-span-2 text-center">Avg → Current</div>
                  <div className="col-span-2 text-center">Cost → Value</div>
                  <div className="col-span-2 text-right">P&L</div>
                </div>

                {positionsList.map((position, index) => (
                  <div 
                    key={index}
                    onClick={() => router.push(`/predict?market=${position.market?.conditionId || position.market?.id}`)}
                    className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-6 hover:border-[#3f3f46] transition-colors cursor-pointer"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Market */}
                      <div className="col-span-4">
                        <h3 className="text-sm font-medium text-white mb-1 line-clamp-2">
                          {position.market?.question || 'Unknown Market'}
                        </h3>
                      </div>

                      {/* Outcome */}
                      <div className="col-span-1 flex justify-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          position.outcome === 'YES' 
                            ? 'bg-[#00ffa3]/20 text-[#00ffa3]' 
                            : 'bg-[#ff6b6b]/20 text-[#ff6b6b]'
                        }`}>
                          {position.outcome}
                        </span>
                      </div>

                      {/* Shares */}
                      <div className="col-span-1 text-center">
                        <div className="text-sm font-semibold text-white">{position.size.toFixed(2)}</div>
                        <div className="text-xs text-[#71717b]">shares</div>
                      </div>

                      {/* Avg → Current Price */}
                      <div className="col-span-2 text-center">
                        <div className="text-sm text-[#71717b]">{(position.price * 100).toFixed(1)}¢</div>
                        <div className={`text-sm font-semibold ${(position.currentPrice || 0) >= position.price ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
                          → {((position.currentPrice || 0) * 100).toFixed(1)}¢
                        </div>
                      </div>

                      {/* Cost → Value */}
                      <div className="col-span-2 text-center">
                        <div className="text-sm text-[#71717b]">{formatCurrency(position.totalCost)}</div>
                        <div className="text-sm font-semibold text-white">{formatCurrency(position.currentValue || 0)}</div>
                      </div>

                      {/* P&L */}
                      <div className="col-span-2 text-right">
                        <div className={`text-lg font-bold ${(position.unrealizedPnl || 0) >= 0 ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
                          {(position.unrealizedPnl || 0) >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnl || 0)}
                        </div>
                        <div className={`text-xs ${(position.unrealizedPnlPercent || 0) >= 0 ? 'text-[#00ffa3]' : 'text-[#ff6b6b]'}`}>
                          {(position.unrealizedPnlPercent || 0) >= 0 ? '+' : ''}{(position.unrealizedPnlPercent || 0).toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Potential Payout Row */}
                    <div className="mt-4 pt-4 border-t border-[#27272a] flex justify-between items-center">
                      <span className="text-xs text-[#71717b]">If market resolves {position.outcome}</span>
                      <span className="text-sm font-semibold text-[#00ffa3]">
                        Payout: {formatCurrency(position.potentialPayout)} 
                        <span className="text-[#71717b] ml-2">
                          (+{formatCurrency(position.potentialProfit)} profit)
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'orders' && (
          <>
            {ordersLoading ? (
              <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-12 text-center">
                <div className="text-[#71717b]">Loading open orders...</div>
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-12 text-center">
                <div className="text-[#71717b] mb-4">No open orders</div>
                <p className="text-sm text-[#71717b] mb-6">Your open limit orders will appear here</p>
                <button
                  onClick={() => router.push('/predict')}
                  className="px-6 py-3 rounded-lg bg-[#00ffa3] hover:bg-[#00e693] text-black font-medium transition-colors"
                >
                  Browse Markets
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div key={order.orderId} className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-white font-semibold">{order.side || 'ORDER'} {order.orderType || 'LIMIT'}</div>
                        <div className="text-xs text-[#71717b] mt-1">
                          Price: {order.price ? `${(parseFloat(order.price) * 100).toFixed(1)}¢` : 'N/A'} · Remaining: {order.sizeRemaining || order.size || '0'}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            setCancellingOrderId(order.orderId);
                            await cancelOrder(order.orderId);
                          } catch (e) {
                            console.error('Failed to cancel order', e);
                          } finally {
                            setCancellingOrderId(null);
                          }
                        }}
                        disabled={cancellingOrderId === order.orderId}
                        className="px-3 py-2 rounded-lg bg-[#ff6b6b]/20 hover:bg-[#ff6b6b]/30 text-[#ff6b6b] text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cancellingOrderId === order.orderId ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                    {order.createdAt && (
                      <div className="text-xs text-[#71717b] mt-3">
                        Created: {new Date(order.createdAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
                <div className="pt-2">
                  <button
                    onClick={refetchOrders}
                    className="px-4 py-2 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-white text-sm transition-colors"
                  >
                    Refresh Orders
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            {historyLoading && trades.length === 0 ? (
              <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-12 text-center">
                <div className="text-[#71717b]">Loading trade history...</div>
              </div>
            ) : trades.length === 0 ? (
              <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-12 text-center">
                <div className="text-[#71717b] mb-4">No trade history</div>
                <p className="text-sm text-[#71717b] mb-6">Your completed trades will appear here</p>
                <button
                  onClick={() => router.push('/predict')}
                  className="px-6 py-3 rounded-lg bg-[#00ffa3] hover:bg-[#00e693] text-black font-medium transition-colors"
                >
                  Start Trading
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Table Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs text-[#71717b] uppercase tracking-wider">
                  <div className="col-span-3">Date</div>
                  <div className="col-span-3">Market</div>
                  <div className="col-span-2 text-center">Type</div>
                  <div className="col-span-2 text-center">Amount</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>

                {trades.map((trade) => (
                  <div 
                    key={trade.intentId}
                    className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-4 hover:border-[#3f3f46] transition-colors"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                      {/* Date */}
                      <div className="col-span-3">
                        <div className="text-sm text-white">
                          {new Date(trade.createdAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-[#71717b]">
                          {new Date(trade.createdAt).toLocaleTimeString()}
                        </div>
                      </div>

                      {/* Market */}
                      <div className="col-span-3">
                        <div className="text-sm text-white truncate">
                          {trade.marketId?.slice(0, 12)}...
                        </div>
                        <div className="text-xs text-[#71717b]">
                          {trade.conditionId?.slice(0, 8)}...
                        </div>
                      </div>

                      {/* Type */}
                      <div className="col-span-2 flex justify-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          trade.action === 'BUY' ? 'bg-[#00ffa3]/20 text-[#00ffa3]' : 'bg-[#ff6b6b]/20 text-[#ff6b6b]'
                        }`}>
                          {trade.action}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          trade.outcome === 'YES' ? 'bg-[#00ffa3]/10 text-[#00ffa3]' : 'bg-[#ff6b6b]/10 text-[#ff6b6b]'
                        }`}>
                          {trade.outcome}
                        </span>
                        {trade.source && (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-[#27272a] text-[#9f9fa9]">
                            {trade.source}
                          </span>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="col-span-2 text-center">
                        <div className="text-sm font-semibold text-white">
                          {trade.inputCurrency === 'native' 
                            ? `${(parseFloat(trade.inputAmount) / 1e18).toFixed(4)} ETH`
                            : trade.inputAmount
                          }
                        </div>
                        <div className="text-xs text-[#71717b]">
                          → ${(parseFloat(trade.destAmountExpected) / 1e6).toFixed(2)} USDC
                        </div>
                      </div>

                      {/* Status */}
                      <div className="col-span-2 flex justify-end">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStateColor(trade.state)}`}>
                          {getStateLabel(trade.state)}
                        </span>
                      </div>
                    </div>

                    {/* Error message if failed */}
                    {trade.errorCode && (
                      <div className="mt-3 pt-3 border-t border-[#27272a]">
                        <div className="text-xs text-[#ff6b6b]">
                          {trade.errorCode}: {trade.errorDetail}
                        </div>
                      </div>
                    )}

                    {/* Tx links */}
                    {(trade.originTxHash || trade.polygonTxHash) && (
                      <div className="mt-3 pt-3 border-t border-[#27272a] flex gap-4">
                        {trade.originTxHash && (
                          <a 
                            href={`https://explorer.megaeth.com/tx/${trade.originTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300"
                            onClick={(e) => e.stopPropagation()}
                          >
                            MegaETH Tx ↗
                          </a>
                        )}
                        {trade.polygonTxHash && (
                          <a 
                            href={`https://polygonscan.com/tx/${trade.polygonTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Polygon Tx ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Load More */}
                {hasMore && (
                  <div className="text-center pt-4">
                    <button
                      onClick={loadMore}
                      disabled={historyLoading}
                      className="px-6 py-2 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-white text-sm transition-colors disabled:opacity-50"
                    >
                      {historyLoading ? 'Loading...' : `Load More (${trades.length}/${totalTrades})`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
