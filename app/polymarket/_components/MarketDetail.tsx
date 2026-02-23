"use client"

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Market, Outcome } from '@/types/polymarket.types';
import { TradeButton } from './TradeButton';
import { PriceChart } from './PriceChart';
import { usePriceHistory } from '@/hooks/usePriceHistory';
import { useOrderbook } from '@/hooks/useOrderbook';
import { useUserBalance } from '@/hooks/useUserBalance';
import { useApp } from '@/providers/AppProvider';
import { OrderTypeDropdown, OrderType } from './OrderTypeDropdown';
import { usePositions } from '@/hooks/usePositions';

type TimeRange = '5M' | '10M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

interface MarketDetailProps {
  market: Market;
  onBack: () => void;
  onTradeSuccess?: () => void;
}

export const MarketDetail: React.FC<MarketDetailProps> = ({ market, onBack, onTradeSuccess }) => {
  const { userAddress, lastEthPrice } = useApp();
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('YES');
  const [amount, setAmount] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [shares, setShares] = useState('');
  const [showOrderBook, setShowOrderBook] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
  
  const { positions } = usePositions({ eoaAddress: userAddress, autoFetch: !!userAddress });

  const conditionId = market.market_id || market.conditionId || market.condition_id || '';
  
  const tokenId = useMemo(() => {
    if (!market.tokens || !Array.isArray(market.tokens)) {
      console.log('No tokens array found on market');
      return undefined;
    }
    const token = market.tokens.find(t => t.outcome === outcome);
    console.log('Token lookup:', { outcome, token, tokenId: token?.token_id });
    return token?.token_id;
  }, [market.tokens, outcome]);

  const { priceHistory, isLoading: chartLoading } = usePriceHistory({
    marketId: conditionId,
    tokenId,
    timeRange,
    autoFetch: !!conditionId,
  });
  const { orderbook, isLoading: orderbookLoading } = useOrderbook({
    marketId: conditionId,
    outcome,
    autoFetch: !!conditionId && showOrderBook,
  });
  // Fix: parseFloat("0") returns 0, not falsy, so || doesn't work
  const ethPriceParsed = parseFloat(lastEthPrice);
  const ethPrice = ethPriceParsed > 0 ? ethPriceParsed : 3000; // From Redstone via useApp
  const { userBalance } = useUserBalance(userAddress as `0x${string}`);

  const userPositionForMarket = useMemo(() => {
    if (!positions || !conditionId) return null;
    return positions.openOrders.find(p => 
      (p.market.conditionId === conditionId || p.market.id === conditionId) &&
      p.outcome === outcome &&
      p.status === 'FILLED'
    );
  }, [positions, conditionId, outcome]);

  const amountInEth = useMemo(() => {
    if (orderType === 'LIMIT') {
      if (!shares || !limitPrice) return '0';
      const sharesNum = parseFloat(shares);
      const priceNum = parseFloat(limitPrice);
      if (isNaN(sharesNum) || isNaN(priceNum) || sharesNum === 0 || priceNum === 0) return '0';
      const usdAmount = sharesNum * priceNum;
      return (usdAmount / ethPrice).toString();
    } else {
      if (!amount) return '0';
      const usdAmount = parseFloat(amount);
      if (isNaN(usdAmount) || usdAmount === 0) return '0';
      return (usdAmount / ethPrice).toString();
    }
  }, [orderType, amount, shares, limitPrice, ethPrice]);

  const balanceUSD = useMemo(() => {
    if (!userAddress || !userBalance) return '0.00';
    const ethBalance = parseFloat(userBalance);
    if (isNaN(ethBalance) || ethBalance === 0) return '0.00';
    return (ethBalance * ethPrice).toFixed(2);
  }, [userAddress, userBalance]);

  const prices = Array.isArray(market.outcomePrices) 
    ? market.outcomePrices 
    : (typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : ['0.5', '0.5']);
  const yesPrice = parseFloat(prices[0] || '0.5');
  const noPrice = parseFloat(prices[1] || '0.5');
  const selectedPrice = outcome === 'YES' ? yesPrice : noPrice;

  const estimatedShares = useMemo(() => {
    if (orderType === 'MARKET' && amount) {
      const usdAmount = parseFloat(amount);
      if (!isNaN(usdAmount) && usdAmount > 0) {
        return (usdAmount / selectedPrice).toFixed(2);
      }
    } else if (orderType === 'LIMIT' && shares) {
      return parseFloat(shares).toFixed(2);
    }
    return '0';
  }, [orderType, amount, shares, selectedPrice]);

  const youllReceive = useMemo(() => {
    if (orderType === 'LIMIT' && limitPrice && shares) {
      const price = parseFloat(limitPrice);
      const qty = parseFloat(shares);
      if (!isNaN(price) && !isNaN(qty)) {
        return (price * qty).toFixed(2);
      }
    }
    return '0';
  }, [orderType, limitPrice, shares]);

  const toWin = useMemo(() => {
    if (orderType === 'LIMIT' && shares) {
      const qty = parseFloat(shares);
      if (!isNaN(qty)) {
        return qty.toFixed(2);
      }
    }
    return '0';
  }, [orderType, shares]);

  const adjustShares = (delta: number) => {
    const current = parseFloat(shares) || 0;
    const newValue = Math.max(0, current + delta);
    setShares(newValue.toString());
  };

  const formatVolume = (vol?: string) => {
    if (!vol) return 'N/A';
    const num = parseFloat(vol);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'TBD';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const quickAmounts = [1, 20, 100];

  return (
    <div className="max-w-7xl mx-auto">
      <button
        onClick={onBack}
        className="mb-6 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <span>←</span> Back to markets
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl bg-[#1a1f2e] border border-[#2a2f3e] p-6">
            <div className="flex items-start gap-4 mb-4">
              {market.image && (
                <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-[#2a2f3e]">
                  <Image
                    src={market.image}
                    alt={market.question}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl font-semibold text-white mb-2">{market.question}</h1>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{formatVolume(typeof market.volume === 'number' ? market.volume.toString() : market.volume)} Vol.</span>
                  <span>•</span>
                  <span>{formatDate(market.endDateIso || market.endDate)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl font-bold text-blue-400">{Math.round(yesPrice * 100)}% chance</span>
              <span className="text-sm text-gray-400">
                {yesPrice > noPrice ? '↑' : '↓'} {Math.abs(Math.round((yesPrice - 0.5) * 100))}%
              </span>
            </div>
          </div>

          <PriceChart
            data={priceHistory}
            isLoading={chartLoading}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            outcome={outcome}
          />

          <div className="rounded-xl bg-[#1a1f2e] border border-[#2a2f3e]">
            <button
              onClick={() => setShowOrderBook(!showOrderBook)}
              className="w-full px-6 py-4 flex items-center justify-between text-white hover:bg-[#1f2535] transition-colors"
            >
              <span className="font-medium">Order Book</span>
              <span>{showOrderBook ? '−' : '+'}</span>
            </button>
            {showOrderBook && (
              <div className="px-6 pb-6">
                {orderbookLoading ? (
                  <div className="text-sm text-gray-400 text-center py-4">Loading orderbook...</div>
                ) : orderbook ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-2 font-medium">BIDS (Buy {outcome})</div>
                      <div className="space-y-1">
                        {(() => {
                          const maxBidSize = Math.max(...orderbook.bids.slice(0, 10).map(b => parseFloat(b.size)));
                          return orderbook.bids.slice(0, 10).map((bid, i) => {
                            const sizePercent = (parseFloat(bid.size) / maxBidSize) * 100;
                            return (
                              <div key={i} className="relative">
                                <div 
                                  className="absolute inset-0 bg-green-500/10 rounded"
                                  style={{ width: `${sizePercent}%` }}
                                />
                                <div className="relative flex justify-between text-xs px-2 py-1">
                                  <span className="text-green-400">{(parseFloat(bid.price) * 100).toFixed(1)}¢</span>
                                  <span className="text-gray-400">{parseFloat(bid.size).toFixed(0)}</span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-2 font-medium">ASKS (Sell {outcome})</div>
                      <div className="space-y-1">
                        {(() => {
                          const maxAskSize = Math.max(...orderbook.asks.slice(0, 10).map(a => parseFloat(a.size)));
                          return orderbook.asks.slice(0, 10).map((ask, i) => {
                            const sizePercent = (parseFloat(ask.size) / maxAskSize) * 100;
                            return (
                              <div key={i} className="relative">
                                <div 
                                  className="absolute inset-0 bg-red-500/10 rounded"
                                  style={{ width: `${sizePercent}%` }}
                                />
                                <div className="relative flex justify-between text-xs px-2 py-1">
                                  <span className="text-red-400">{(parseFloat(ask.price) * 100).toFixed(1)}¢</span>
                                  <span className="text-gray-400">{parseFloat(ask.size).toFixed(0)}</span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 text-center py-4">No orderbook data available</div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-[#1a1f2e] border border-[#2a2f3e]">
            <button
              onClick={() => setShowRules(!showRules)}
              className="w-full px-6 py-4 flex items-center justify-between text-white hover:bg-[#1f2535] transition-colors"
            >
              <span className="font-medium">Rules</span>
              <span>{showRules ? '−' : '+'}</span>
            </button>
            {showRules && (
              <div className="px-6 pb-6 text-sm text-gray-400">
                {market.description || 'This market will resolve to "Yes" if the specified condition is met by the end date.'}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-xl bg-[#1a1f2e] border border-[#2a2f3e] p-6 space-y-4 sticky top-24">
            <div className="flex items-center justify-between border-b border-[#2a2f3e] pb-4">
              <div className="flex gap-2">
                <button 
                  onClick={() => setTradeAction('BUY')}
                  className={`py-2 px-4 text-sm font-medium transition-colors ${
                    tradeAction === 'BUY' 
                      ? 'text-white border-b-2 border-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Buy
                </button>
                <button 
                  onClick={() => setTradeAction('SELL')}
                  className={`py-2 px-4 text-sm font-medium transition-colors ${
                    tradeAction === 'SELL' 
                      ? 'text-white border-b-2 border-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Sell
                </button>
              </div>
              <OrderTypeDropdown value={orderType} onChange={setOrderType} />
            </div>

            {userPositionForMarket && tradeAction === 'SELL' && (
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs text-blue-400 mb-1">Your Position</div>
                    <div className="text-lg font-bold text-white">
                      {userPositionForMarket.size.toFixed(2)} shares
                    </div>
                    <div className="text-xs text-gray-400">
                      Avg. price: {(userPositionForMarket.price * 100).toFixed(1)}¢
                    </div>
                  </div>
                  <button
                    onClick={() => setShares(userPositionForMarket.size.toString())}
                    className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                  >
                    Sell All
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-blue-500/20">
                  <div>
                    <div className="text-xs text-gray-400">Cost Basis</div>
                    <div className="text-sm font-semibold text-white">
                      ${(userPositionForMarket.size * userPositionForMarket.price).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Current Value</div>
                    <div className="text-sm font-semibold text-white">
                      ${(userPositionForMarket.size * selectedPrice).toFixed(2)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-400">Profit/Loss</div>
                    <div className={`text-base font-bold ${
                      (userPositionForMarket.size * selectedPrice) - (userPositionForMarket.size * userPositionForMarket.price) >= 0
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}>
                      {((userPositionForMarket.size * selectedPrice) - (userPositionForMarket.size * userPositionForMarket.price) >= 0 ? '+' : '')}
                      ${((userPositionForMarket.size * selectedPrice) - (userPositionForMarket.size * userPositionForMarket.price)).toFixed(2)}
                      <span className="text-xs ml-1">
                        ({(((userPositionForMarket.size * selectedPrice) - (userPositionForMarket.size * userPositionForMarket.price)) / (userPositionForMarket.size * userPositionForMarket.price) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOutcome('YES')}
                className={`rounded-lg px-4 py-3 transition-all ${
                  outcome === 'YES'
                    ? 'bg-green-600 text-white'
                    : 'bg-[#2a2f3e] text-gray-400 hover:bg-[#3a3f4e]'
                }`}
              >
                <div className="text-xs mb-1">Yes</div>
                <div className="text-lg font-semibold">{Math.round(yesPrice * 100)}¢</div>
              </button>

              <button
                onClick={() => setOutcome('NO')}
                className={`rounded-lg px-4 py-3 transition-all ${
                  outcome === 'NO'
                    ? 'bg-red-600 text-white'
                    : 'bg-[#2a2f3e] text-gray-400 hover:bg-[#3a3f4e]'
                }`}
              >
                <div className="text-xs mb-1">No</div>
                <div className="text-lg font-semibold">{Math.round(noPrice * 100)}¢</div>
              </button>
            </div>

            {tradeAction === 'SELL' ? (
              <>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Shares to Sell</label>
                  <input
                    type="number"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    max={userPositionForMarket?.size}
                    className="w-full px-4 py-3 rounded-lg bg-[#0f1419] border border-[#2a2f3e] text-white text-2xl focus:outline-none focus:border-[#3a3f4e]"
                    placeholder="0"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Available: {userPositionForMarket?.size.toFixed(2) || '0'} shares
                  </div>
                </div>

                {userPositionForMarket && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShares((userPositionForMarket.size * 0.25).toFixed(2))}
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                    >
                      25%
                    </button>
                    <button
                      onClick={() => setShares((userPositionForMarket.size * 0.5).toFixed(2))}
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                    >
                      50%
                    </button>
                    <button
                      onClick={() => setShares((userPositionForMarket.size * 0.75).toFixed(2))}
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                    >
                      75%
                    </button>
                    <button
                      onClick={() => setShares(userPositionForMarket.size.toString())}
                      className="flex-1 px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-blue-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                    >
                      Max
                    </button>
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">You'll Receive</span>
                    <span className="text-white font-medium">
                      ${shares ? (parseFloat(shares) * selectedPrice).toFixed(2) : '0.00'}
                    </span>
                  </div>
                  {userPositionForMarket && shares && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Realized P&L</span>
                      <span className={`font-medium ${
                        (parseFloat(shares) * selectedPrice) - (parseFloat(shares) * userPositionForMarket.price) >= 0
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}>
                        {((parseFloat(shares) * selectedPrice) - (parseFloat(shares) * userPositionForMarket.price) >= 0 ? '+' : '')}
                        ${((parseFloat(shares) * selectedPrice) - (parseFloat(shares) * userPositionForMarket.price)).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : orderType === 'MARKET' ? (
              <>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 rounded-lg bg-[#0f1419] border border-[#2a2f3e] text-white text-2xl focus:outline-none focus:border-[#3a3f4e]"
                      placeholder="0"
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Current: ${selectedPrice.toFixed(2)}</div>
                </div>

                <div className="flex gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAmount(amt.toString())}
                      className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                    >
                      +${amt}
                    </button>
                  ))}
                  <button
                    onClick={() => setAmount('100')}
                    className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                  >
                    Max
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Est. Shares</span>
                    <span className="text-white font-medium">{estimatedShares}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">You'll Pay</span>
                    <span className="text-white font-medium">${amount || '0'}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Limit Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
                    <input
                      type="number"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      step="0.01"
                      min="0.01"
                      max="0.99"
                      className="w-full pl-8 pr-4 py-3 rounded-lg bg-[#0f1419] border border-[#2a2f3e] text-white text-2xl focus:outline-none focus:border-[#3a3f4e]"
                      placeholder="0.35"
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Current: ${selectedPrice.toFixed(2)}</div>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-2 block">Shares</label>
                  <input
                    type="number"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[#0f1419] border border-[#2a2f3e] text-white text-2xl focus:outline-none focus:border-[#3a3f4e]"
                    placeholder="0"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => adjustShares(-100)}
                    className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                  >
                    -100
                  </button>
                  <button
                    onClick={() => adjustShares(-10)}
                    className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                  >
                    -10
                  </button>
                  <button
                    onClick={() => adjustShares(10)}
                    className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                  >
                    +10
                  </button>
                  <button
                    onClick={() => adjustShares(100)}
                    className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                  >
                    +100
                  </button>
                  <button
                    onClick={() => adjustShares(200)}
                    className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-blue-400 hover:text-white hover:bg-[#3a3f4e] transition-colors"
                  >
                    +200
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">You'll receive</span>
                    <span className="text-white font-medium">${youllReceive}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">To Win</span>
                    <span className="text-green-400 font-medium">${toWin}</span>
                  </div>
                </div>
              </>
            )}

            <div className="text-xs text-gray-500">Balance ${balanceUSD}</div>

            <TradeButton
              marketId={market.market_id || market.id || market.conditionId || market.condition_id || ''}
              outcome={outcome}
              amountEth={tradeAction === 'BUY' ? amountInEth : undefined}
              action={tradeAction}
              amountShares={tradeAction === 'SELL' ? (shares ? parseFloat(shares) : undefined) : undefined}
              orderType={orderType}
              limitPrice={orderType === 'LIMIT' ? limitPrice : undefined}
              shares={orderType === 'LIMIT' ? shares : undefined}
              disabled={
                tradeAction === 'BUY'
                  ? (orderType === 'MARKET'
                      ? !amount || parseFloat(amount) <= 0
                      : !limitPrice || !shares || parseFloat(limitPrice) <= 0 || parseFloat(shares) <= 0)
                  : !shares || parseFloat(shares) <= 0
              }
              onTradeComplete={onTradeSuccess}
            />

            <div className="text-xs text-gray-500 text-center">
              By trading, you agree to the Terms of Use
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
