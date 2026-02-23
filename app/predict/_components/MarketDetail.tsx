"use client"

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Market, Outcome, PolymarketHolder, PricePoint } from '@/types/polymarket.types';
import { TradeButton } from './TradeButton';
import { PriceChart } from './PriceChart';
import { EnhancedPriceChart } from './EnhancedPriceChart';
import { RoundsNavigation } from './RoundsNavigation';
import { EnhancedCountdown } from './EnhancedCountdown';
import { useOrderbook } from '@/hooks/useOrderbook';
import { usePriceHistory } from '@/hooks/usePriceHistory';
import { useCryptoPriceHistory } from '@/hooks/useCryptoPriceHistory';
import { useUserBalance } from '@/hooks/useUserBalance';
import { useApp } from '@/providers/AppProvider';
import { OrderTypeDropdown, OrderType } from './OrderTypeDropdown';
import { usePositions } from '@/hooks/usePositions';
import { useMarketComments } from '@/hooks/useMarketComments';
import { useFavorites } from '@/hooks/useFavorites';
import { UserHoverCard } from './UserHoverCard';
import { polymarketAPI } from '@/lib/polymarket/api';

interface MarketDetailProps {
  market: Market;
  onBack: () => void;
  relatedMarkets?: Market[];
  preferredOutcome?: Outcome | null;
  onSelectMarket?: (marketId: string, outcome?: Outcome) => void;
  onTradeSuccess?: () => void;
}

type ChartTimeRange = '5M' | '10M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';
type CombinedTooltipEntry = {
  id: string;
  label: string;
  color: string;
  price: number;
  timestamp: number;
  yPct: number;
};

export const MarketDetail: React.FC<MarketDetailProps> = ({
  market,
  onBack,
  relatedMarkets,
  preferredOutcome,
  onSelectMarket,
  onTradeSuccess,
}) => {
  const { userAddress, lastEthPrice } = useApp();
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('YES');
  const [amount, setAmount] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [shares, setShares] = useState('');
  const [showOrderBook, setShowOrderBook] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [detailPanel, setDetailPanel] = useState<'chart' | 'markets'>('chart');
  const [chartTimeRange, setChartTimeRange] = useState<ChartTimeRange>('ALL');
  const [chatInput, setChatInput] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [openInterest, setOpenInterest] = useState<number | null>(null);
  const [liveVolume, setLiveVolume] = useState<number | null>(null);
  const [topHoldersCount, setTopHoldersCount] = useState<number | null>(null);
  const [topHolders, setTopHolders] = useState<PolymarketHolder[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [eventPriceSeries, setEventPriceSeries] = useState<Record<string, PricePoint[]>>({});
  const [eventPriceLoading, setEventPriceLoading] = useState(false);
  const [roundRemainingSec, setRoundRemainingSec] = useState<number>(0);
  const [roundNeighbors, setRoundNeighbors] = useState<{
    previous: Market | null;
    current: Market | null;
    upcoming: Market | null;
  }>({ previous: null, current: null, upcoming: null });
  const [combinedTooltip, setCombinedTooltip] = useState<{
    xPx: number;
    xPct: number;
    timestamp: number;
    entries: CombinedTooltipEntry[];
  } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const combinedChartRef = useRef<HTMLDivElement>(null);
  const conditionId = market.conditionId || market.condition_id || market.market_id || '';
  const detailMarkets = useMemo(
    () => (relatedMarkets && relatedMarkets.length > 0 ? relatedMarkets : [market]),
    [relatedMarkets, market]
  );
  const getMarketId = (marketItem: Market) =>
    marketItem.conditionId || marketItem.condition_id || marketItem.market_id || marketItem.id || '';

  useEffect(() => {
    if (preferredOutcome) {
      setOutcome(preferredOutcome);
      setTradeAction('BUY');
    }
  }, [preferredOutcome]);

  useEffect(() => {
    if (!conditionId) return;
    let cancelled = false;

    const loadInsights = async () => {
      setInsightsLoading(true);
      try {
        const [oi, holders] = await Promise.all([
          polymarketAPI.getOpenInterest(conditionId),
          polymarketAPI.getTopHolders({ market: conditionId, limit: 10 }).catch(() => []),
        ]);
        const raw = oi.openInterest ?? oi.interest ?? oi.value;
        const parsed = raw !== undefined ? Number(raw) : NaN;
        const flatHolders = Array.isArray(holders)
          ? holders.flatMap((entry: any) => entry.holders || [])
          : [];
        const uniqueHolders = Array.from(
          new Map(
            flatHolders
              .filter((holder: any) => holder?.proxyWallet)
              .map((holder: any) => [holder.proxyWallet.toLowerCase(), holder])
          ).values()
        )
          .sort((a: any, b: any) => Number(b?.amount || 0) - Number(a?.amount || 0))
          .slice(0, 6);
        const holderCount = Array.isArray(holders)
          ? holders.reduce((acc, entry) => acc + (entry.holders?.length || 0), 0)
          : 0;
        if (!cancelled) {
          setOpenInterest(Number.isFinite(parsed) ? parsed : null);
          setTopHoldersCount(holderCount || null);
          setTopHolders(uniqueHolders);
        }
      } catch {
        if (!cancelled) {
          setOpenInterest(null);
          setTopHoldersCount(null);
          setTopHolders([]);
        }
      }

      // Live volume is optional and depends on event id availability
      const eventId = market.eventId;
      if (eventId !== undefined && eventId !== null && String(eventId) !== '') {
        try {
          const volumeData: any = await polymarketAPI.getLiveVolume(eventId);
          const rawTotal = Array.isArray(volumeData) ? volumeData[0]?.total : volumeData?.total || volumeData?.liveVolume || volumeData?.volume;
          const parsedTotal = rawTotal !== undefined ? Number(rawTotal) : NaN;
          if (!cancelled) setLiveVolume(Number.isFinite(parsedTotal) ? parsedTotal : null);
        } catch {
          if (!cancelled) setLiveVolume(null);
        }
      } else if (!cancelled) {
        setLiveVolume(null);
      }

      if (!cancelled) setInsightsLoading(false);
    };

    loadInsights();
    return () => {
      cancelled = true;
    };
  }, [conditionId]);

  const handleTradeSuccess = () => {
    setAmount('');
    setLimitPrice('');
    setShares('');
    refetchPositions();
    onTradeSuccess?.();
  };
  
  const { positions, refetch: refetchPositions } = usePositions({ eoaAddress: userAddress, autoFetch: !!userAddress });
  const { isFavorite, toggleFavorite } = useFavorites(userAddress);

  const isMarketFavorite = isFavorite(conditionId);
  
  // Chat/comments
  const { comments, isLoading: isLoadingComments, postComment } = useMarketComments({ 
    marketId: conditionId,
    autoFetch: !!conditionId,
  });

  // Prefetch user data for all commenters
  const [commenterDataCache, setCommenterDataCache] = useState<Record<string, any>>({});
  
  useEffect(() => {
    if (!comments || comments.length === 0) return;
    
    // Get unique addresses not yet cached
    const uniqueAddresses = [...new Set(comments.map(c => c.user_address.toLowerCase()))]
      .filter(addr => !commenterDataCache[addr]);
    
    if (uniqueAddresses.length === 0) return;
    
    // Fetch all in parallel
    const fetchAll = async () => {
      const results = await Promise.allSettled(
        uniqueAddresses.map(addr => 
          polymarketAPI.getUserPositions(addr).then(data => ({ addr, data }))
        )
      );
      
      const newCache: Record<string, any> = {};
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          newCache[result.value.addr] = result.value.data;
        }
      });
      
      if (Object.keys(newCache).length > 0) {
        setCommenterDataCache(prev => ({ ...prev, ...newCache }));
      }
    };
    
    fetchAll();
  }, [comments]);

  const handlePostComment = async () => {
    if (!chatInput.trim() || !userAddress || !conditionId || isPostingComment) return;
    
    setIsPostingComment(true);
    try {
      await postComment({
        market_id: conditionId,
        user_address: userAddress,
        body: chatInput.trim(),
      });
      setChatInput('');
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsPostingComment(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  
  const tokenId = useMemo(() => {
    // Try to get tokenId from tokens array first
    if (market.tokens && Array.isArray(market.tokens)) {
      // Try exact match first
      let token = market.tokens.find(t => t.outcome === outcome);
      // Try case-insensitive match
      if (!token) {
        token = market.tokens.find(t => t.outcome?.toUpperCase() === outcome);
      }
      // If still not found and only 2 tokens, use index (0 for YES, 1 for NO)
      if (!token && market.tokens.length === 2) {
        token = market.tokens[outcome === 'YES' ? 0 : 1];
      }
      if (token?.token_id) {
        return token.token_id;
      }
    }
    
    // Fallback: try clobTokenIds (can be JSON array string or comma-separated)
    if (market.clobTokenIds) {
      let tokenIds: string[] = [];
      try {
        // Try parsing as JSON array first (e.g., '["id1","id2"]')
        const parsed = JSON.parse(market.clobTokenIds);
        if (Array.isArray(parsed)) {
          tokenIds = parsed;
        }
      } catch {
        // Not JSON, try comma-separated
        tokenIds = market.clobTokenIds.split(',').map(id => id.trim());
      }
      
      if (tokenIds.length >= 2) {
        return tokenIds[outcome === 'YES' ? 0 : 1];
      } else if (tokenIds.length === 1) {
        return tokenIds[0];
      }
    }
    
    console.log('No tokenId found for market:', { marketId: market.id, outcome, tokens: market.tokens, clobTokenIds: market.clobTokenIds });
    return undefined;
  }, [market.tokens, market.clobTokenIds, market.id, outcome]);

  const getTokenIdForOutcome = (marketItem: Market, selectedOutcome: Outcome = 'YES'): string | undefined => {
    if (marketItem.tokens && Array.isArray(marketItem.tokens)) {
      let token = marketItem.tokens.find((t) => t.outcome === selectedOutcome);
      if (!token) token = marketItem.tokens.find((t) => t.outcome?.toUpperCase() === selectedOutcome);
      if (!token && marketItem.tokens.length >= 2) {
        token = marketItem.tokens[selectedOutcome === 'YES' ? 0 : 1];
      }
      if (token?.token_id) return token.token_id;
    }

    if (marketItem.clobTokenIds) {
      let tokenIds: string[] = [];
      try {
        const parsed = JSON.parse(marketItem.clobTokenIds);
        if (Array.isArray(parsed)) tokenIds = parsed;
      } catch {
        tokenIds = marketItem.clobTokenIds.split(',').map((id) => id.trim());
      }
      if (tokenIds.length >= 2) return tokenIds[selectedOutcome === 'YES' ? 0 : 1];
      if (tokenIds.length === 1) return tokenIds[0];
    }
    return undefined;
  };

  const shouldFetchOrderbook = useMemo(() => {
    if (market.acceptingOrders !== undefined) return !!market.acceptingOrders;
    if (market.tradeable !== undefined) return !!market.tradeable;
    return !!market.active && !market.closed;
  }, [market.acceptingOrders, market.tradeable, market.active, market.closed]);

  const { orderbook, isLoading: orderbookLoading } = useOrderbook({
    marketId: conditionId,
    outcome,
    autoFetch: !!conditionId && showOrderBook && shouldFetchOrderbook,
  });
  const chainlinkSymbol = useMemo(() => {
    const marketText = `${market.question} ${(market.tags || []).join(' ')}`.toLowerCase();
    if (/\b(bitcoin|btc)\b/.test(marketText)) return 'btc/usd' as const;
    if (/\b(ethereum|eth)\b/.test(marketText)) return 'eth/usd' as const;
    if (/\b(solana|sol)\b/.test(marketText)) return 'sol/usd' as const;
    if (/\bxrp\b/.test(marketText)) return 'xrp/usd' as const;
    return undefined;
  }, [market.question, market.tags]);
  const isCryptoRoundSeries = useMemo(() => {
    if (!chainlinkSymbol) return false;
    if (market.recurrence) return true;
    if (market.seriesSlug && /up-or-down/i.test(market.seriesSlug)) return true;
    if (market.slug && /updown-\d+[mh]-/i.test(market.slug)) return true;
    return false;
  }, [chainlinkSymbol, market.recurrence, market.seriesSlug, market.slug]);
  const shouldUseUnderlyingPriceChart = !!chainlinkSymbol;
  const { priceHistory, isLoading: priceHistoryLoading } = usePriceHistory({
    marketId: conditionId,
    tokenId,
    timeRange: chartTimeRange,
    autoFetch: !!tokenId && detailPanel === 'chart',
  });
  const { priceHistory: cryptoPriceHistory, isLoading: cryptoPriceHistoryLoading } = useCryptoPriceHistory({
    symbol: chainlinkSymbol,
    timeRange: chartTimeRange,
    autoFetch: shouldUseUnderlyingPriceChart && detailPanel === 'chart',
  });
  const chartData = shouldUseUnderlyingPriceChart ? cryptoPriceHistory : priceHistory;
  const chartLoading = shouldUseUnderlyingPriceChart ? cryptoPriceHistoryLoading : priceHistoryLoading;
  const roundStartSec = useMemo(() => {
    if (!shouldUseUnderlyingPriceChart) return null;
    const raw = market.eventStartTime || market.startTime;
    if (!raw) return null;
    const ts = Date.parse(raw);
    return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
  }, [market.eventStartTime, market.startTime, shouldUseUnderlyingPriceChart]);
  const roundEndSec = useMemo(() => {
    if (!shouldUseUnderlyingPriceChart) return null;
    const raw = market.endDateIso || market.endDate;
    if (!raw) return null;
    const ts = Date.parse(raw);
    return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
  }, [market.endDateIso, market.endDate, shouldUseUnderlyingPriceChart]);
  const lockPrice = useMemo(() => {
    if (!shouldUseUnderlyingPriceChart || chartData.length === 0) return null;
    if (!roundStartSec) return chartData[0].p;
    const match = chartData.find((point) => point.t >= roundStartSec);
    return (match || chartData[0])?.p ?? null;
  }, [shouldUseUnderlyingPriceChart, chartData, roundStartSec]);
  const liveUnderlyingPrice = useMemo(
    () => (chartData.length > 0 ? chartData[chartData.length - 1].p : null),
    [chartData]
  );
  const marketProvidedDelta = useMemo(() => {
    const value = market.oneHourPriceChange;
    return Number.isFinite(value) ? (value as number) : null;
  }, [market.oneHourPriceChange]);
  const isLockedMarket = useMemo(() => {
    if (isCryptoRoundSeries) {
      if (market.acceptingOrders !== undefined) return !market.acceptingOrders;
      return !!market.closed || !market.active;
    }
    if (market.acceptingOrders !== undefined) return !market.acceptingOrders;
    if (market.tradeable !== undefined) return !market.tradeable;
    return !!market.closed || !market.active;
  }, [isCryptoRoundSeries, market.acceptingOrders, market.closed, market.active, market.tradeable]);
  // Fix: parseFloat("0") returns 0, not falsy, so || doesn't work
  const ethPriceParsed = parseFloat(lastEthPrice);
  const ethPrice = ethPriceParsed > 0 ? ethPriceParsed : 3000; // From Redstone via useApp
  const { userBalance } = useUserBalance(userAddress as `0x${string}`);

  useEffect(() => {
    if (!roundEndSec) {
      setRoundRemainingSec(0);
      return;
    }
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setRoundRemainingSec(Math.max(0, roundEndSec - now));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [roundEndSec]);

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

  const parseOutcomeLabels = (marketItem: Market): [string, string] => {
    const fallback: [string, string] = ['Yes', 'No'];

    const fromOutcomes = (() => {
      if (Array.isArray(marketItem.outcomes)) return marketItem.outcomes;
      if (typeof marketItem.outcomes === 'string') {
        try {
          const parsed = JSON.parse(marketItem.outcomes);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return marketItem.outcomes.split(',').map((value) => value.trim());
        }
      }
      return [];
    })();

    const candidate = fromOutcomes.length >= 2
      ? fromOutcomes
      : (Array.isArray(marketItem.tokens) ? marketItem.tokens.map((token) => token.outcome) : []);

    if (!Array.isArray(candidate) || candidate.length < 2) return fallback;

    const yesLabel = String(candidate[0] || '').trim() || fallback[0];
    const noLabel = String(candidate[1] || '').trim() || fallback[1];
    return [yesLabel, noLabel];
  };
  const [yesOutcomeLabel, noOutcomeLabel] = useMemo(() => parseOutcomeLabels(market), [market]);
  const selectedOutcomeLabel = outcome === 'YES' ? yesOutcomeLabel : noOutcomeLabel;

  const parseOutcomePrices = (marketItem: Market) => {
    const rawPrices = Array.isArray(marketItem.outcomePrices)
      ? marketItem.outcomePrices
      : typeof marketItem.outcomePrices === 'string'
        ? JSON.parse(marketItem.outcomePrices)
        : ['0.5', '0.5'];
    const yes = parseFloat(rawPrices[0] || '0.5');
    const no = parseFloat(rawPrices[1] || '0.5');
    return { yes, no };
  };

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

  // Set default limit price when switching to LIMIT mode
  useEffect(() => {
    if (orderType === 'LIMIT' && !limitPrice) {
      setLimitPrice(selectedPrice.toFixed(2));
    }
  }, [orderType, selectedPrice, limitPrice]);

  const formatVolume = (vol?: string | number) => {
    if (vol === undefined || vol === null) return 'N/A';
    const num = typeof vol === 'string' ? parseFloat(vol) : vol;
    if (isNaN(num)) return 'N/A';
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatUsd = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return 'N/A';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatRoundTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatMarketDelta = (delta: number | null) => {
    if (delta === null || !Number.isFinite(delta)) return '--';
    return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}¢`;
  };

  const getBucketFromRecurrence = (recurrence?: string) => {
    if (!recurrence) return undefined;
    const normalized = recurrence.trim().toUpperCase();
    if (normalized === '5M') return '5M';
    if (normalized === '15M') return '15M';
    if (normalized === '1H') return '1H';
    if (normalized === '4H') return '4H';
    if (normalized === '1D') return '1D';
    if (normalized === '1W') return '1W';
    if (normalized === '1M') return '1M';
    return undefined;
  };

  const getSymbolFromMarket = (marketItem: Market) => {
    const text = `${marketItem.question} ${(marketItem.tags || []).join(' ')}`.toLowerCase();
    if (/\b(bitcoin|btc)\b/.test(text)) return 'btc/usd';
    if (/\b(ethereum|eth)\b/.test(text)) return 'eth/usd';
    if (/\b(solana|sol)\b/.test(text)) return 'sol/usd';
    if (/\bxrp\b/.test(text)) return 'xrp/usd';
    return undefined;
  };

  useEffect(() => {
    if (!isCryptoRoundSeries || !chainlinkSymbol) {
      setRoundNeighbors({ previous: null, current: null, upcoming: null });
      return;
    }

    let cancelled = false;
    const loadRounds = async () => {
      try {
        const bucket = getBucketFromRecurrence(market.recurrence);
        const [activeResponse, closedResponse] = await Promise.all([
          polymarketAPI.getCryptoMarkets({
            bucket,
            limit: 120,
            sort: 'newest',
            status: 'active',
          }),
          polymarketAPI.getCryptoMarkets({
            bucket,
            limit: 120,
            sort: 'newest',
            status: 'closed',
          }),
        ]);

        if (cancelled) return;
        const mergedMarkets = [...(activeResponse.markets || []), ...(closedResponse.markets || [])];
        const dedupedMarkets = Array.from(
          new Map(
            mergedMarkets.map((entry) => {
              const id = entry.conditionId || entry.condition_id || entry.market_id || entry.id || entry.slug;
              return [id, entry] as const;
            })
          ).values()
        );
        const rounds = dedupedMarkets
          .filter((entry) => {
            if (market.seriesSlug && entry.seriesSlug) return entry.seriesSlug === market.seriesSlug;
            return true;
          })
          .filter((entry) => getSymbolFromMarket(entry) === chainlinkSymbol)
          .filter((entry) => {
            if (!bucket) return true;
            const recurrence = entry.recurrence?.trim().toUpperCase();
            return recurrence === bucket;
          })
          .sort((a, b) => {
            const aTs = Date.parse(a.eventStartTime || a.startTime || a.endDate || '') || 0;
            const bTs = Date.parse(b.eventStartTime || b.startTime || b.endDate || '') || 0;
            return aTs - bTs;
          });

        const currentId = market.conditionId || market.condition_id || market.market_id || market.id;
        const selectedEndTs = Date.parse(market.endDateIso || market.endDate || '') || 0;
        let currentIndex = rounds.findIndex((entry) => {
          const id = entry.conditionId || entry.condition_id || entry.market_id || entry.id;
          return id === currentId;
        });

        if (currentIndex === -1 && selectedEndTs > 0 && rounds.length > 0) {
          let bestIdx = -1;
          let smallestDiff = Number.POSITIVE_INFINITY;
          rounds.forEach((entry, idx) => {
            const endTs = Date.parse(entry.endDateIso || entry.endDate || '') || 0;
            if (!endTs) return;
            const diff = Math.abs(endTs - selectedEndTs);
            if (diff < smallestDiff) {
              smallestDiff = diff;
              bestIdx = idx;
            }
          });
          if (bestIdx !== -1) currentIndex = bestIdx;
        }

        if (currentIndex === -1 && rounds.length > 0) {
          const now = Date.now();
          currentIndex = rounds.findIndex((entry) => {
            const start = Date.parse(entry.eventStartTime || entry.startTime || '') || 0;
            const end = Date.parse(entry.endDateIso || entry.endDate || '') || 0;
            return start <= now && now <= end;
          });
          if (currentIndex === -1) {
            const upcomingIndex = rounds.findIndex(
              (entry) => (Date.parse(entry.endDateIso || entry.endDate || '') || 0) > now
            );
            currentIndex = upcomingIndex >= 0 ? upcomingIndex : rounds.length - 1;
          }
        }

        if (currentIndex < 0 || rounds.length === 0) {
          setRoundNeighbors({ previous: null, current: null, upcoming: null });
          return;
        }

        setRoundNeighbors({
          previous: rounds[currentIndex - 1] || null,
          current: rounds[currentIndex] || null,
          upcoming: rounds[currentIndex + 1] || null,
        });
      } catch {
        if (!cancelled) {
          setRoundNeighbors({ previous: null, current: null, upcoming: null });
        }
      }
    };

    loadRounds();
    return () => {
      cancelled = true;
    };
  }, [
    isCryptoRoundSeries,
    chainlinkSymbol,
    market.recurrence,
    market.seriesSlug,
    market.conditionId,
    market.condition_id,
    market.market_id,
    market.id,
  ]);

  useEffect(() => {
    if (!isCryptoRoundSeries) return;
    if (chartTimeRange === 'ALL') setChartTimeRange('5M');
  }, [isCryptoRoundSeries, chartTimeRange]);

  const autoSwitchedRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isCryptoRoundSeries || roundRemainingSec > 0) return;
    const upcoming = roundNeighbors.upcoming;
    if (!upcoming) return;
    const upcomingId = upcoming.conditionId || upcoming.condition_id || upcoming.market_id || upcoming.id || '';
    if (!upcomingId) return;
    if (autoSwitchedRoundRef.current === upcomingId) return;
    if (upcoming.acceptingOrders === false) return;
    autoSwitchedRoundRef.current = upcomingId;
    onSelectMarket?.(upcomingId);
  }, [isCryptoRoundSeries, roundRemainingSec, roundNeighbors.upcoming, onSelectMarket]);

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

  const handleOrderbookLevelClick = (price: string, side: 'ask' | 'bid', size?: string) => {
    if (isLockedMarket) return;
    setOrderType('LIMIT');
    setLimitPrice(parseFloat(price).toFixed(2));
    setTradeAction(side === 'ask' ? 'BUY' : 'SELL');
    const numericSize = Number(size || 0);
    if (Number.isFinite(numericSize) && numericSize > 0) {
      // Prefill a practical fraction of available depth to reduce accidental oversized orders.
      const suggested = Math.max(1, Math.min(500, Math.floor(numericSize * 0.1)));
      setShares(String(suggested));
    }
  };

  const orderbookMetrics = useMemo(() => {
    if (!orderbook) return { bestBid: null as number | null, bestAsk: null as number | null, midpoint: null as number | null, spread: null as number | null };
    const bestBid = orderbook.bids?.length ? Math.max(...orderbook.bids.map((b) => Number(b.price || 0))) : null;
    const bestAsk = orderbook.asks?.length ? Math.min(...orderbook.asks.map((a) => Number(a.price || 0))) : null;
    const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
    const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
    return { bestBid, bestAsk, midpoint, spread };
  }, [orderbook]);

  const handleXPost = () => {
    const marketUrl = typeof window !== 'undefined' 
      ? `${window.location.origin}/predict?market=${conditionId}`
      : '';
    const tweetText = `Check out this prediction market: "${market.question}"\n\n${marketUrl}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
  };

  const handleCapture = async () => {
    if (!chartContainerRef.current) return;
    
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(chartContainerRef.current, {
        backgroundColor: '#18181b',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      
      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `prism-market-${market.question.slice(0, 30).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      alert('Failed to capture screenshot. Please try again.');
    }
  };

  const quickAmounts = [1, 20, 100];
  const formatPercent = (price?: number) => `${Math.round((price || 0.5) * 100)}%`;
  const eventOptions = useMemo(() => {
    const selectedEventSlug = market.eventSlug;
    const selectedEventTitle = market.eventTitle;
    const dedup = new Map<string, Market>();
    detailMarkets.forEach((entry) => {
      const marketId = getMarketId(entry);
      if (!marketId) return;
      const sameEvent =
        (selectedEventSlug && entry.eventSlug === selectedEventSlug) ||
        (selectedEventTitle && entry.eventTitle === selectedEventTitle);
      if (sameEvent || marketId === conditionId) {
        dedup.set(marketId, entry);
      }
    });
    return Array.from(dedup.values());
  }, [detailMarkets, market.eventSlug, market.eventTitle, conditionId]);

  const getTimeRangeParams = (range: ChartTimeRange): { startTs: number; fidelity: number } => {
    const now = Math.floor(Date.now() / 1000);
    switch (range) {
      case '5M':
        return { startTs: now - 5 * 60, fidelity: 1 };
      case '10M':
        return { startTs: now - 10 * 60, fidelity: 1 };
      case '1H':
        return { startTs: now - 3600, fidelity: 1 };
      case '6H':
        return { startTs: now - 6 * 3600, fidelity: 5 };
      case '1D':
        return { startTs: now - 24 * 3600, fidelity: 15 };
      case '1W':
        return { startTs: now - 7 * 24 * 3600, fidelity: 60 };
      case '1M':
        return { startTs: now - 30 * 24 * 3600, fidelity: 240 };
      case 'ALL':
      default:
        return { startTs: now - 365 * 24 * 3600, fidelity: 60 };
    }
  };

  useEffect(() => {
    if (detailPanel !== 'chart' || eventOptions.length <= 1) {
      setEventPriceSeries((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setEventPriceLoading(false);
      return;
    }

    let cancelled = false;
    const loadCombinedSeries = async () => {
      setEventPriceLoading(true);
      const { startTs, fidelity } = getTimeRangeParams(chartTimeRange);

      try {
        const results = await Promise.all(
          eventOptions.map(async (optionMarket) => {
            const optionMarketId = getMarketId(optionMarket);
            const optionTokenId = getTokenIdForOutcome(optionMarket, 'YES');
            if (!optionMarketId || !optionTokenId) return null;
            try {
              const response = await polymarketAPI.getPriceHistory({
                tokenId: optionTokenId,
                startTs,
                fidelity,
              });
              return { id: optionMarketId, history: response.history || [] };
            } catch {
              return { id: optionMarketId, history: [] as PricePoint[] };
            }
          })
        );

        if (cancelled) return;
        const nextSeries: Record<string, PricePoint[]> = {};
        results.forEach((entry) => {
          if (!entry || entry.history.length === 0) return;
          nextSeries[entry.id] = entry.history;
        });
        setEventPriceSeries(nextSeries);
      } finally {
        if (!cancelled) setEventPriceLoading(false);
      }
    };

    loadCombinedSeries();
    return () => {
      cancelled = true;
    };
  }, [detailPanel, eventOptions, chartTimeRange]);

  const combinedSeries = useMemo(() => {
    const palette = ['#60a5fa', '#22d3ee', '#f59e0b', '#f97316', '#a78bfa', '#34d399', '#ef4444', '#eab308'];
    return eventOptions
      .map((optionMarket, index) => {
        const id = getMarketId(optionMarket);
        return {
          id,
          label: optionMarket.groupItemTitle || optionMarket.question,
          color: palette[index % palette.length],
          history: eventPriceSeries[id] || [],
        };
      })
      .filter((entry) => entry.history.length > 1);
  }, [eventOptions, eventPriceSeries]);
  const combinedPriceBounds = useMemo(() => {
    const prices = combinedSeries.flatMap((series) => series.history.map((point) => point.p));
    if (prices.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [combinedSeries]);

  const formatCombinedTooltipTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    if (
      chartTimeRange === '5M' ||
      chartTimeRange === '10M' ||
      chartTimeRange === '1H' ||
      chartTimeRange === '6H' ||
      chartTimeRange === '1D'
    ) {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="relative min-h-screen p-6 z-10">
      <div className="max-w-[1600px] mx-auto">
        <button
          onClick={onBack}
          className="mb-6 text-sm text-[#9f9fa9] hover:text-white transition-colors flex items-center gap-2"
        >
          <span>←</span> Back
        </button>

        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-3">
            <div className="relative w-16 h-16 flex-shrink-0 rounded-full overflow-hidden bg-[#27272a]">
              {market.image ? (
                <Image
                  src={market.image}
                  alt={market.question}
                  fill
                  className="object-cover"
                  sizes="40px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#71717b] text-lg">₿</div>
              )}
            </div>
            <div>
              <h1 className="text-xl font-medium text-white mb-1">{market.question}</h1>
              <div className="text-md text-[#71717b]">
                Ending {formatDate(market.endDateIso || market.endDate)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => toggleFavorite(conditionId)}
              className={`w-8 h-8 flex items-center justify-center transition-colors ${isMarketFavorite ? 'text-[#fbbf24]' : 'text-[#71717b] hover:text-[#fbbf24]'}`}
              title={isMarketFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isMarketFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
            <button className="w-8 h-8 flex items-center justify-center text-[#71717b] hover:text-white transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>
                <path d="m21 3-9 9"/>
                <path d="M15 3h6v6"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          {/* Market metric badges */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-[#00ffa3]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <span>{formatVolume(market.volume)} volume</span>
            </div>
            <div className="text-[#9f9fa9]">•</div>
            <div className="text-[#cdb7ff]">
              {insightsLoading
                ? 'Open interest ...'
                : openInterest !== null
                  ? `${formatVolume(openInterest)} open interest`
                  : 'Open interest N/A'}
            </div>
            <div className="text-[#9f9fa9]">•</div>
            <div className="text-[#9f9fa9]">
              {insightsLoading
                ? 'Live volume ...'
                : liveVolume !== null
                  ? `${formatVolume(liveVolume)} live volume`
                  : 'Live volume N/A'}
            </div>
            <div className="text-[#9f9fa9]">•</div>
            <div className="text-[#9f9fa9]">
              {insightsLoading
                ? 'Top holders ...'
                : topHoldersCount !== null
                  ? `${topHoldersCount} top holders`
                  : 'Top holders N/A'}
            </div>
          </div>
          {/* X Post & Capture buttons */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleXPost}
              className="text-xs text-[#71717b] hover:text-white transition-colors flex items-center gap-1 bg-[#27272a] px-3 py-1.5 rounded-md border border-[#3f3f46] hover:border-[#71717b]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              X Post
            </button>
            <button 
              onClick={handleCapture}
              className="text-xs text-[#71717b] hover:text-white transition-colors flex items-center gap-1 bg-[#27272a] px-3 py-1.5 rounded-md border border-[#3f3f46] hover:border-[#71717b]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Capture
            </button>
          </div>
        </div>

        <div className="flex gap-6 items-start mb-6">
          <div className="w-[63%] flex flex-col gap-4">
          {isCryptoRoundSeries && (
            <div className="rounded-[12px] border border-[#27272a] bg-[#151518] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#71717b]">Price To Beat</div>
                    <div className="text-2xl font-bold text-[#9ca3af]">{formatUsd(lockPrice)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#71717b]">Current Price</div>
                    <div className="text-2xl font-bold text-[#f59e0b]">{formatUsd(liveUnderlyingPrice)}</div>
                    <div
                      className={`text-xs font-semibold mt-1 ${
                        (marketProvidedDelta || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {formatMarketDelta(marketProvidedDelta)} (1h)
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-[#71717b] mb-2">Round Ends In</div>
                    <EnhancedCountdown
                      endTime={new Date(Date.now() + roundRemainingSec * 1000)}
                      theme="crypto"
                      size="lg"
                      showProgress={true}
                      totalDuration={300} // 5 minutes in seconds
                      className="!bg-transparent !border-none !p-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          {isCryptoRoundSeries && (
            <div className="rounded-[12px] border border-[#27272a] bg-[#151518] p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {([
                  { key: 'previous', label: 'Last Round', market: roundNeighbors.previous },
                  { key: 'current', label: 'Current Round', market: roundNeighbors.current || market },
                  { key: 'upcoming', label: 'Upcoming Round', market: roundNeighbors.upcoming },
                ] as const).map((entry) => {
                  const round = entry.market;
                  const roundId = round ? (round.conditionId || round.condition_id || round.market_id || round.id || '') : '';
                  const roundLocked =
                    !round ||
                    (round.acceptingOrders !== undefined ? !round.acceptingOrders : (!!round.closed || !round.active));
                  return (
                    <button
                      key={entry.key}
                      disabled={!round || entry.key === 'current'}
                      onClick={() => roundId && onSelectMarket?.(roundId)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        entry.key === 'current'
                          ? 'border-[#3f3f46] bg-[#1b1b20]'
                          : 'border-[#27272a] bg-[#18181b] hover:border-[#3f3f46]'
                      } disabled:opacity-100`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] uppercase tracking-wide text-[#71717b]">{entry.label}</div>
                        <div className={`text-[10px] font-semibold ${roundLocked ? 'text-red-400' : 'text-emerald-400'}`}>
                          {entry.key === 'current' ? (roundLocked ? 'Locked' : 'Open') : roundLocked ? 'Locked' : 'Open'}
                        </div>
                      </div>
                      <div className="text-sm text-white mt-1 truncate">
                        {round?.question || 'No round'}
                      </div>
                      <div className="text-xs text-[#9f9fa9] mt-1">
                        {(round?.eventStartTime || round?.startTime || round?.endDate)
                          ? formatDate(round?.eventStartTime || round?.startTime || round?.endDate)
                          : '--'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div ref={chartContainerRef} className="rounded-[12px] border border-[#27272a] bg-[#151518] p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="inline-flex rounded-lg bg-[#18181b] p-1 border border-[#27272a]">
                <button
                  onClick={() => setDetailPanel('chart')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${detailPanel === 'chart' ? 'bg-[#27272a] text-white' : 'text-[#9f9fa9] hover:text-white'}`}
                >
                  Price Chart
                </button>
                <button
                  onClick={() => setDetailPanel('markets')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${detailPanel === 'markets' ? 'bg-[#27272a] text-white' : 'text-[#9f9fa9] hover:text-white'}`}
                >
                  Related Markets
                </button>
              </div>
              {tokenId && detailPanel === 'chart' && (
                <div className="text-xs text-[#71717b]">Token: {tokenId.slice(0, 8)}...{tokenId.slice(-6)}</div>
              )}
            </div>
            {detailPanel === 'chart' ? (
              eventOptions.length > 1 ? (
                <div className="rounded-[12px] border border-[#27272a] p-4 bg-[#18181b]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-white font-medium">Combined Outcome Chart</div>
                    <div className="flex gap-1">
                      {(['5M', '10M', '1H', '6H', '1D', '1W', '1M', 'ALL'] as ChartTimeRange[]).map((range) => (
                        <button
                          key={range}
                          onClick={() => setChartTimeRange(range)}
                          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                            chartTimeRange === range
                              ? 'bg-[#27272a] text-white'
                              : 'text-[#71717b] hover:text-white'
                          }`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    {combinedSeries.slice(0, 8).map((series) => (
                      <div key={series.id} className="flex items-center gap-1.5 text-xs text-[#9f9fa9]">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: series.color }} />
                        <span className="max-w-[180px] truncate">{series.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="h-[300px] rounded-lg border border-[#27272a] bg-[#151518] overflow-hidden">
                    {eventPriceLoading ? (
                      <div className="h-full flex items-center justify-center text-[#71717b] text-sm">Loading combined chart...</div>
                    ) : combinedSeries.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[#71717b] text-sm">No combined price history available</div>
                    ) : (
                      <div
                        ref={combinedChartRef}
                        className="relative w-full h-full"
                        onMouseMove={(event) => {
                          if (!combinedChartRef.current || combinedSeries.length === 0) return;
                          const rect = combinedChartRef.current.getBoundingClientRect();
                          const xPx = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                          const xPct = rect.width > 0 ? (xPx / rect.width) * 100 : 0;
                          const range = Math.max(0.01, combinedPriceBounds.max - combinedPriceBounds.min);

                          const entries = combinedSeries
                            .map((series) => {
                              const length = series.history.length;
                              if (length === 0) return null;
                              const index = Math.max(0, Math.min(length - 1, Math.round((xPct / 100) * (length - 1))));
                              const point = series.history[index];
                              if (!point) return null;
                              const normalizedY = (point.p - combinedPriceBounds.min) / range;
                              const yPct = 95 - normalizedY * 90;
                              return {
                                id: series.id,
                                label: series.label,
                                color: series.color,
                                price: point.p,
                                timestamp: point.t,
                                yPct,
                              } as CombinedTooltipEntry;
                            })
                            .filter((entry): entry is CombinedTooltipEntry => !!entry);

                          if (entries.length === 0) {
                            setCombinedTooltip(null);
                            return;
                          }

                          setCombinedTooltip({
                            xPx,
                            xPct,
                            timestamp: entries[0].timestamp,
                            entries,
                          });
                        }}
                        onMouseLeave={() => setCombinedTooltip(null)}
                      >
                        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((percent) => (
                            <line
                              key={percent}
                              x1="0"
                              y1={percent}
                              x2="100"
                              y2={percent}
                              stroke="#27272a"
                              strokeWidth="0.5"
                              strokeDasharray="1 1"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                          {combinedSeries.map((series) => {
                            const range = Math.max(0.01, combinedPriceBounds.max - combinedPriceBounds.min);
                            const path = series.history
                              .map((point, i) => {
                                const x = (i / Math.max(1, series.history.length - 1)) * 100;
                                const normalizedY = (point.p - combinedPriceBounds.min) / range;
                                const y = 95 - normalizedY * 90;
                                return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                              })
                              .join(' ');
                            return (
                              <path
                                key={series.id}
                                d={path}
                                fill="none"
                                stroke={series.color}
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                              />
                            );
                          })}
                          {combinedTooltip && (
                            <line
                              x1={combinedTooltip.xPct}
                              y1="0"
                              x2={combinedTooltip.xPct}
                              y2="100"
                              stroke="#a78bfa"
                              strokeWidth="0.8"
                              strokeDasharray="2 2"
                              opacity="0.65"
                              vectorEffect="non-scaling-stroke"
                            />
                          )}
                        </svg>

                        {combinedTooltip?.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="absolute w-2.5 h-2.5 rounded-full border border-[#18181b] pointer-events-none"
                            style={{
                              left: combinedTooltip.xPx,
                              top: `${entry.yPct}%`,
                              transform: 'translate(-50%, -50%)',
                              backgroundColor: entry.color,
                            }}
                          />
                        ))}

                        {combinedTooltip && (
                          <div
                            className="absolute z-20 pointer-events-none"
                            style={{
                              left: combinedTooltip.xPx,
                              top: 10,
                              transform:
                                combinedTooltip.xPct > 55
                                  ? 'translateX(calc(-100% - 12px))'
                                  : 'translateX(12px)',
                            }}
                          >
                            <div className="bg-[#27272a] border border-[#3f3f46] rounded-lg px-3 py-2 shadow-lg min-w-[180px]">
                              <div className="text-[11px] text-[#9f9fa9] mb-1">
                                {formatCombinedTooltipTime(combinedTooltip.timestamp)}
                              </div>
                              <div className="space-y-1">
                                {combinedTooltip.entries.slice(0, 6).map((entry) => (
                                  <div key={`${entry.id}-tooltip`} className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                      <span className="text-[#d4d4d8] truncate max-w-[120px]">{entry.label}</span>
                                    </div>
                                    <span className="text-white font-medium">{(entry.price * 100).toFixed(1)}%</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (shouldUseUnderlyingPriceChart || tokenId) ? (
                <div className="space-y-6">
                  {/* Rounds Navigation for crypto 5-minute markets */}
                  {shouldUseUnderlyingPriceChart && 
                   (market.question.includes('5:') || market.recurrence?.toLowerCase().includes('minute')) && (
                    <RoundsNavigation
                      currentMarket={market}
                      onRoundSelect={(roundId) => {
                        console.log('Round selected:', roundId);
                        // TODO: Handle round selection logic
                      }}
                    />
                  )}
                  
                  {/* Enhanced Price Chart */}
                  <EnhancedPriceChart
                    data={chartData}
                    isLoading={chartLoading}
                    timeRange={chartTimeRange}
                    onTimeRangeChange={(range) => setChartTimeRange(range)}
                    outcome={outcome}
                    valueMode={shouldUseUnderlyingPriceChart ? 'price' : 'probability'}
                    priceLabel={chainlinkSymbol ? chainlinkSymbol.toUpperCase() : undefined}
                    targetPrice={shouldUseUnderlyingPriceChart ? lockPrice ?? undefined : undefined}
                    height={shouldUseUnderlyingPriceChart ? 400 : 320}
                    isCryptoMarket={shouldUseUnderlyingPriceChart}
                    marketTitle={market.question}
                  />
                </div>
              ) : (
                <div className="h-[320px] rounded-lg border border-[#27272a] bg-[#18181b] flex items-center justify-center text-[#71717b]">
                  Price chart unavailable for this market
                </div>
              )
            ) : (
              <div className="flex flex-col gap-3">
                {detailMarkets.map((marketItem) => {
                  const { yes, no } = parseOutcomePrices(marketItem);
                  const marketId =
                    marketItem.conditionId ||
                    marketItem.condition_id ||
                    marketItem.market_id ||
                    marketItem.id ||
                    '';
                  return (
                    <div
                      key={marketId}
                      className="flex items-center gap-3 rounded-lg border border-transparent hover:border-[#2f2f36] px-2 py-2"
                      onClick={() => onSelectMarket?.(marketId)}
                    >
                      <div className="flex-1">
                        <div className="text-sm text-white font-medium truncate">{marketItem.question}</div>
                        {marketItem.volume && (
                          <div className="text-xs text-[#71717b]">{formatVolume(marketItem.volume)} Vol.</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="h-9 px-3 rounded-lg text-sm font-semibold text-[#0b0b0b] bg-[#00ffa3] shadow-[0px_6px_18px_-12px_rgba(0,255,163,0.6)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectMarket?.(marketId, 'YES');
                          }}
                        >
                          Buy Yes {formatPercent(yes)}
                        </button>
                        <button
                          className="h-9 px-3 rounded-lg text-sm font-semibold text-[#0b0b0b] bg-[#ff4d6d] shadow-[0px_6px_18px_-12px_rgba(255,77,109,0.6)]"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectMarket?.(marketId, 'NO');
                          }}
                        >
                          Buy No {formatPercent(no)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {eventOptions.length > 1 && (
            <div className="rounded-[12px] border border-[#27272a] bg-[#151518] p-3">
              <div className="text-xs uppercase tracking-wide text-[#71717b] mb-2">All outcomes</div>
              <div className="space-y-2">
                {eventOptions.map((optionMarket) => {
                  const optionMarketId =
                    optionMarket.conditionId ||
                    optionMarket.condition_id ||
                    optionMarket.market_id ||
                    optionMarket.id ||
                    '';
                  const { yes, no } = parseOutcomePrices(optionMarket);
                  const optionLabel = optionMarket.groupItemTitle || optionMarket.question;
                  const isActiveOption = optionMarketId === conditionId;
                  return (
                    <div
                      key={optionMarketId}
                      className={`rounded-lg border px-3 py-2 transition-colors ${
                        isActiveOption ? 'border-[#3f3f46] bg-[#1b1b20]' : 'border-[#27272a] bg-[#18181b]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          className="text-sm text-white truncate text-left hover:text-[#cdb7ff]"
                          onClick={() => onSelectMarket?.(optionMarketId)}
                        >
                          {optionLabel}
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            className="h-8 px-3 rounded-lg text-xs font-semibold text-[#0b0b0b] bg-[#00ffa3] hover:bg-[#00e693]"
                            onClick={() => onSelectMarket?.(optionMarketId, 'YES')}
                          >
                            Buy Yes {formatPercent(yes)}
                          </button>
                          <button
                            className="h-8 px-3 rounded-lg text-xs font-semibold text-[#0b0b0b] bg-[#ff4d6d] hover:bg-[#e6445f]"
                            onClick={() => onSelectMarket?.(optionMarketId, 'NO')}
                          >
                            Buy No {formatPercent(no)}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>

          <div className="w-[37%]">
            <div className="rounded-[12px] bg-[#18181b] border border-[#27272a] p-5 flex flex-col h-full">
            {/* Buy/Sell tabs with Market dropdown */}
            <div className="flex items-center justify-between mb-5 border-b border-[#27272a] pb-4">
              <div className="flex gap-1">
                <button 
                  onClick={() => setTradeAction('BUY')}
                  className={`py-1.5 px-3 text-sm font-medium transition-colors rounded-md ${
                    tradeAction === 'BUY' 
                      ? 'bg-[#27272a] text-white border border-white/20' 
                      : 'text-[#71717b] hover:text-white'
                  }`}
                >
                  Buy
                </button>
                <button 
                  onClick={() => setTradeAction('SELL')}
                  className={`py-1.5 px-3 text-sm font-medium transition-colors rounded-md ${
                    tradeAction === 'SELL' 
                      ? 'bg-[#27272a] text-white border border-white/20' 
                      : 'text-[#71717b] hover:text-white'
                  }`}
                >
                  Sell
                </button>
              </div>
              <OrderTypeDropdown value={orderType} onChange={setOrderType} />
            </div>

            {isLockedMarket && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                <div className="text-xs font-semibold text-red-300">Market locked</div>
                <div className="text-xs text-red-200/90">This round is not accepting orders right now.</div>
              </div>
            )}

            {userPositionForMarket && (
              <div className={`rounded-lg p-3 mb-3 ${
                tradeAction === 'SELL' 
                  ? 'bg-blue-500/10 border border-blue-500/20' 
                  : 'bg-[#27272a] border border-[#3f3f46]'
              }`}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className={`text-xs mb-1 ${tradeAction === 'SELL' ? 'text-blue-400' : 'text-[#71717b]'}`}>
                      Your {selectedOutcomeLabel} Position
                    </div>
                    <div className="text-base font-bold text-white">
                      {userPositionForMarket.size.toFixed(2)} shares
                    </div>
                    <div className="text-xs text-[#71717b]">
                      Avg. {(userPositionForMarket.price * 100).toFixed(1)}¢ · Cost ${userPositionForMarket.totalCost.toFixed(2)}
                    </div>
                  </div>
                  {tradeAction === 'SELL' && (
                    <button
                      onClick={() => setShares(userPositionForMarket.size.toString())}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                    >
                      Sell All
                    </button>
                  )}
                </div>
              </div>
            )}

            {userPositionForMarket && tradeAction === 'SELL' && (
              <div className="rounded-lg bg-[#27272a] border border-[#3f3f46] p-3 mb-3">
                <div className="grid grid-cols-2 gap-3">
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

            <div className="space-y-4 flex-1">
              {tradeAction === 'BUY' && orderType === 'MARKET' ? (
                <div className="flex flex-col gap-4">
                  {/* Main container matching Figma */}
                  <div className="bg-[#27272a] rounded-[12px] p-1 flex flex-col gap-1">
                    {/* Yes/No outcome buttons */}
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => setOutcome('YES')}
                        className={`py-3 transition-all text-center rounded-[8px] ${
                          outcome === 'YES'
                            ? 'text-white'
                            : 'text-[#00ffa3] hover:bg-[#3f3f46]'
                        }`}
                        style={outcome === 'YES' ? {
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.60)',
                          background: 'radial-gradient(114.1% 95.26% at 48.62% 0%, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.00) 100%), #00FFA3',
                          backgroundBlendMode: 'plus-lighter, normal' as const,
                          boxShadow: '0 2px 15px 0 rgba(0, 255, 163, 0.20), 0 1px 6px 0 rgba(0, 255, 163, 0.20), 0 0 2px 0 rgba(0, 255, 163, 0.55)'
                        } : {
                          border: '1px solid rgba(255, 255, 255, 0.07)'
                        }}
                      >
                        <div className="text-xl font-medium">{yesOutcomeLabel}</div>
                        <div className={`text-sm ${outcome === 'YES' ? 'text-[rgba(24,24,27,0.7)]' : 'text-[#00ffa3]/70'}`}>{(yesPrice * 100).toFixed(0)}¢</div>
                      </button>

                      <button
                        onClick={() => setOutcome('NO')}
                        className={`py-3 transition-all text-center rounded-[8px] ${
                          outcome === 'NO'
                            ? 'text-white'
                            : 'text-[#ff4d6d]'
                        }`}
                        style={outcome === 'NO' ? {
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.60)',
                          background: 'radial-gradient(114.1% 95.26% at 48.62% 0%, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.00) 100%), #ff4d6d',
                          backgroundBlendMode: 'plus-lighter, normal' as const,
                          boxShadow: '0 2px 15px 0 rgba(255, 77, 109, 0.20), 0 1px 6px 0 rgba(255, 77, 109, 0.20), 0 0 2px 0 rgba(255, 77, 109, 0.55)'
                        } : {
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          background: 'radial-gradient(280.26% 82.22% at 50% 50%, rgba(24, 24, 27, 0.45) 0%, rgba(24, 24, 27, 0.00) 100%), rgba(255, 77, 109, 0.15)'
                        }}
                      >
                        <div className="text-xl font-medium">{noOutcomeLabel}</div>
                        <div className={`text-sm ${outcome === 'NO' ? 'text-[rgba(24,24,27,0.7)]' : 'text-[rgba(255,77,109,0.7)]'}`}>{(noPrice * 100).toFixed(0)}¢</div>
                      </button>
                    </div>

                    {/* Amount section */}
                    <div className="bg-[#18181b] rounded-[8px] p-4 flex flex-col gap-6 items-center">
                      <label className="text-base text-[rgba(255,255,255,0.5)] font-medium">Amount</label>
                      <div className="relative w-full flex items-center justify-center">
                        <span className="text-[#fafafa] text-4xl font-normal tracking-tight">$</span>
                        <input
                          type="text"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="bg-transparent text-[#fafafa] text-4xl font-normal text-center focus:outline-none placeholder:text-[#3f3f46] tracking-tight w-[150px]"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => setAmount((prev) => (parseFloat(prev || '0') + 1).toString())} className="h-8 px-2.5 text-sm rounded-[8px] border border-[#27272a] text-[#a2a1a4] hover:text-white hover:border-[#71717b] transition-colors font-medium">+$1</button>
                        <button onClick={() => setAmount((prev) => (parseFloat(prev || '0') + 20).toString())} className="h-8 px-2.5 text-sm rounded-[8px] border border-[#27272a] text-[#a2a1a4] hover:text-white hover:border-[#71717b] transition-colors font-medium">+$20</button>
                        <button onClick={() => setAmount((prev) => (parseFloat(prev || '0') + 100).toString())} className="h-8 px-2.5 text-sm rounded-[8px] border border-[#27272a] text-[#a2a1a4] hover:text-white hover:border-[#71717b] transition-colors font-medium">+$100</button>
                        <button onClick={() => setAmount(balanceUSD)} className="h-8 px-2.5 text-sm rounded-[8px] border border-[#27272a] text-[#a2a1a4] hover:text-white hover:border-[#71717b] transition-colors font-medium">Max · ${Number(balanceUSD).toLocaleString()}</button>
                      </div>
                    </div>

                    {/* To win section */}
                    <div className="bg-[#18181b] rounded-[8px] p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                          <div className="text-base text-white font-medium">Total payout if win</div>
                          <div className="text-xs text-[#9f9fa9] tracking-tight">
                            {amount ? (parseFloat(amount) / selectedPrice).toFixed(2) : '0.00'} shares @ {(selectedPrice * 100).toFixed(0)}¢
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="text-[28px] font-normal text-[#00ffa3] tracking-tight">${amount ? (parseFloat(amount) / selectedPrice).toFixed(2) : '0.00'}</div>
                          <div className="text-xs text-[#9f9fa9]">
                            Profit: ${amount ? ((parseFloat(amount) / selectedPrice) - parseFloat(amount)).toFixed(2) : '0.00'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fee notice */}
                  <div className="flex items-start gap-2 px-1 py-2 text-xs text-[#9f9fa9]">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#f59e0b]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <span>Cross-chain bridging fees apply (~0.5-1%). Your actual position may be slightly less than the amount entered.</span>
                  </div>

                  {/* Buy button outside container */}
                  <TradeButton marketId={market.market_id || market.id || market.conditionId || market.condition_id || ''} outcome={outcome} amountEth={amountInEth} action="BUY" orderType={orderType} disabled={isLockedMarket || !amount || parseFloat(amount) <= 0} onTradeComplete={handleTradeSuccess} buttonLabel={isLockedMarket ? 'Market Locked' : `Buy ${selectedOutcomeLabel}`} />
                  <div className="text-xs text-[#71717b] text-center">By trading, you agree to the Terms of Use</div>
                </div>
                ) : tradeAction === 'SELL' ? (
                <div className="flex flex-col gap-4">
                  {/* Main container matching Figma - same structure as Buy */}
                  <div className="bg-[#27272a] rounded-[12px] p-1 flex flex-col gap-1">
                    {/* Yes/No outcome buttons */}
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        onClick={() => setOutcome('YES')}
                        className={`py-3 transition-all text-center rounded-[8px] ${
                          outcome === 'YES'
                            ? 'text-white'
                            : 'text-[#00ffa3] hover:bg-[#3f3f46]'
                        }`}
                        style={outcome === 'YES' ? {
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.60)',
                          background: 'radial-gradient(114.1% 95.26% at 48.62% 0%, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.00) 100%), #00FFA3',
                          backgroundBlendMode: 'plus-lighter, normal' as const,
                          boxShadow: '0 2px 15px 0 rgba(0, 255, 163, 0.20), 0 1px 6px 0 rgba(0, 255, 163, 0.20), 0 0 2px 0 rgba(0, 255, 163, 0.55)'
                        } : {
                          border: '1px solid rgba(255, 255, 255, 0.07)'
                        }}
                      >
                        <div className="text-xl font-medium">{yesOutcomeLabel}</div>
                        <div className={`text-sm ${outcome === 'YES' ? 'text-[rgba(24,24,27,0.7)]' : 'text-[#00ffa3]/70'}`}>{(yesPrice * 100).toFixed(0)}¢</div>
                      </button>

                      <button
                        onClick={() => setOutcome('NO')}
                        className={`py-3 transition-all text-center rounded-[8px] ${
                          outcome === 'NO'
                            ? 'text-white'
                            : 'text-[#ff4d6d]'
                        }`}
                        style={outcome === 'NO' ? {
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.60)',
                          background: 'radial-gradient(114.1% 95.26% at 48.62% 0%, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.00) 100%), #ff4d6d',
                          backgroundBlendMode: 'plus-lighter, normal' as const,
                          boxShadow: '0 2px 15px 0 rgba(255, 77, 109, 0.20), 0 1px 6px 0 rgba(255, 77, 109, 0.20), 0 0 2px 0 rgba(255, 77, 109, 0.55)'
                        } : {
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          background: 'radial-gradient(280.26% 82.22% at 50% 50%, rgba(24, 24, 27, 0.45) 0%, rgba(24, 24, 27, 0.00) 100%), rgba(255, 77, 109, 0.15)'
                        }}
                      >
                        <div className="text-xl font-medium">{noOutcomeLabel}</div>
                        <div className={`text-sm ${outcome === 'NO' ? 'text-[rgba(24,24,27,0.7)]' : 'text-[rgba(255,77,109,0.7)]'}`}>{(noPrice * 100).toFixed(0)}¢</div>
                      </button>
                    </div>

                    {/* Shares section */}
                    <div className="bg-[#18181b] rounded-[8px] p-4 flex flex-col gap-6 items-center">
                      <label className="text-base text-[rgba(255,255,255,0.5)] font-medium">Shares</label>
                      <input
                        type="text"
                        value={shares}
                        onChange={(e) => setShares(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full bg-transparent text-[#fafafa] text-4xl font-normal text-center focus:outline-none placeholder:text-[#3f3f46] tracking-tight"
                        placeholder="0.00"
                      />
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => setShares(((userPositionForMarket?.size || 0) * 0.25).toFixed(2))} className="h-8 px-2.5 text-sm rounded-[8px] border border-[#27272a] text-[#a2a1a4] hover:text-white hover:border-[#71717b] transition-colors font-medium">25%</button>
                        <button onClick={() => setShares(((userPositionForMarket?.size || 0) * 0.5).toFixed(2))} className="h-8 px-2.5 text-sm rounded-[8px] border border-[#27272a] text-[#a2a1a4] hover:text-white hover:border-[#71717b] transition-colors font-medium">50%</button>
                        <button onClick={() => setShares((userPositionForMarket?.size || 0).toString())} className="h-8 px-2.5 text-sm rounded-[8px] border border-[#27272a] text-[#a2a1a4] hover:text-white hover:border-[#71717b] transition-colors font-medium">Max · {(userPositionForMarket?.size || 0).toLocaleString()}</button>
                      </div>
                    </div>
                  </div>

                  {/* Trade button outside container */}
                  <TradeButton marketId={market.market_id || market.id || market.conditionId || market.condition_id || ''} outcome={outcome} action="SELL" amountShares={shares ? parseFloat(shares) : undefined} orderType={orderType} disabled={isLockedMarket || !shares || parseFloat(shares) <= 0} onTradeComplete={handleTradeSuccess} buttonLabel={isLockedMarket ? 'Market Locked' : `Sell ${selectedOutcomeLabel}`} />
                </div>
                ) : orderType === 'LIMIT' && tradeAction === 'BUY' ? (
                  <div className="flex flex-col gap-3">
                    {/* Limit Price Row */}
                    <div className="bg-[#18181b] rounded-[8px] p-3 flex items-center justify-between">
                      <button 
                        onClick={() => setLimitPrice(prev => Math.max(0.01, (parseFloat(prev || '0') - 0.01)).toFixed(2))}
                        className="w-10 h-10 rounded-[8px] border border-[#27272a] flex items-center justify-center text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors"
                      >
                        <span className="text-xl">−</span>
                      </button>
                      <div className="flex flex-col items-center">
                        <span className="text-white text-xl font-medium">{limitPrice ? `${(parseFloat(limitPrice) * 100).toFixed(0)}¢` : '0¢'}</span>
                        <span className="text-xs text-[#71717b]">Limit price</span>
                      </div>
                      <button 
                        onClick={() => setLimitPrice(prev => Math.min(0.99, (parseFloat(prev || '0') + 0.01)).toFixed(2))}
                        className="w-10 h-10 rounded-[8px] border border-[#27272a] flex items-center justify-center text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors"
                      >
                        <span className="text-xl">+</span>
                      </button>
                    </div>

                    {/* Shares Row */}
                    <div className="bg-[#18181b] rounded-[8px] p-3 flex items-center justify-between">
                      <button 
                        onClick={() => adjustShares(-10)}
                        className="w-10 h-10 rounded-[8px] border border-[#27272a] flex items-center justify-center text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors"
                      >
                        <span className="text-xl">−</span>
                      </button>
                      <div className="flex flex-col items-center">
                        <input
                          type="text"
                          value={shares}
                          onChange={(e) => setShares(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="bg-transparent text-white text-xl font-medium text-center focus:outline-none w-20"
                          placeholder="0.00"
                        />
                        <span className="text-xs text-[#71717b]">Shares</span>
                      </div>
                      <button 
                        onClick={() => adjustShares(10)}
                        className="w-10 h-10 rounded-[8px] border border-[#27272a] flex items-center justify-center text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors"
                      >
                        <span className="text-xl">+</span>
                      </button>
                    </div>

                    {/* Quick adjust buttons */}
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => adjustShares(-100)} className="h-8 px-3 text-sm rounded-[8px] border border-[#27272a] text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors font-medium">-100</button>
                      <button onClick={() => adjustShares(-10)} className="h-8 px-3 text-sm rounded-[8px] border border-[#27272a] text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors font-medium">-10</button>
                      <button onClick={() => adjustShares(10)} className="h-8 px-3 text-sm rounded-[8px] border border-[#27272a] text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors font-medium">+10</button>
                      <button onClick={() => adjustShares(100)} className="h-8 px-3 text-sm rounded-[8px] border border-[#27272a] text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors font-medium">+100</button>
                      <button onClick={() => setShares(String(Math.floor((balanceUSD ? parseFloat(balanceUSD) : 0) / (parseFloat(limitPrice) || 0.01))))} className="h-8 px-3 text-sm rounded-[8px] border border-[#27272a] text-[#9f9fa9] hover:text-white hover:border-[#71717b] transition-colors font-medium">Max · {Math.floor((balanceUSD ? parseFloat(balanceUSD) : 0) / (parseFloat(limitPrice) || 0.01)).toLocaleString()}</button>
                    </div>

                    {/* Info message when shares entered */}
                    {shares && parseFloat(shares) > 0 && (
                      <div className="text-center text-xs text-[#00ffa3]">
                        {shares} shares will be executed directly
                      </div>
                    )}

                    {/* Total and To Win side by side */}
                    {shares && parseFloat(shares) > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#18181b] rounded-[8px] p-3">
                          <div className="text-xs text-[#71717b] mb-1">Total</div>
                          <div className="text-white text-lg font-medium">${youllReceive}</div>
                        </div>
                        <div className="bg-[#18181b] rounded-[8px] p-3">
                          <div className="text-xs text-[#71717b] mb-1">To win</div>
                          <div className="text-[#00ffa3] text-lg font-medium">${toWin}</div>
                        </div>
                      </div>
                    )}

                    {/* Trade Button */}
                    <button
                      disabled={isLockedMarket || !limitPrice || !shares || parseFloat(limitPrice) <= 0 || parseFloat(shares) <= 0}
                      className={`w-full py-4 rounded-[12px] font-medium text-base transition-colors ${
                        shares && parseFloat(shares) > 0
                          ? 'text-[#09090b]'
                          : 'bg-[rgba(205,183,255,0.2)] text-[#cdb7ff]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      style={shares && parseFloat(shares) > 0 ? {
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.60)',
                        background: 'radial-gradient(114.1% 95.26% at 48.62% 0%, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.00) 100%), #00FFA3',
                        backgroundBlendMode: 'plus-lighter, normal',
                        boxShadow: '0 2px 15px 0 rgba(0, 255, 163, 0.20), 0 1px 6px 0 rgba(0, 255, 163, 0.20), 0 0 2px 0 rgba(0, 255, 163, 0.55)'
                      } : undefined}
                    >
                      {isLockedMarket ? 'Market Locked' : shares && parseFloat(shares) > 0 ? `Set limit buy ${outcome}` : 'Trade'}
                    </button>
                  </div>
                ) : null}
            </div>
            </div>
          </div>
        </div>

        {/* Context Section */}
        <div className="mb-6">
          <button 
            onClick={() => setShowContext(!showContext)}
            className="flex items-center gap-2 text-white font-semibold text-base hover:text-[#a78bfa] transition-colors"
          >
            Context
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${showContext ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <p className="text-sm text-[#9f9fa9] leading-relaxed mt-3">
            {showContext 
              ? (market.description || 'No additional context available for this market.')
              : ((market.description || '').slice(0, 150) + ((market.description || '').length > 150 ? '...' : '') || 'No additional context available.')
            }
          </p>
        </div>

        <div className="mb-6 rounded-[12px] border border-[#27272a] bg-[#151518] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Top Holders</h3>
            <span className="text-xs text-[#71717b]">
              {insightsLoading ? 'Loading...' : topHoldersCount !== null ? `${topHoldersCount} tracked` : 'N/A'}
            </span>
          </div>
          {topHolders.length === 0 ? (
            <div className="text-xs text-[#71717b] py-2">No holder data available for this market yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {topHolders.map((holder, idx) => (
                <Link
                  key={`${holder.proxyWallet || 'holder'}-${idx}`}
                  href={holder.proxyWallet ? `/predict/profile/${holder.proxyWallet}` : '#'}
                  className="rounded-lg bg-[#18181b] border border-[#27272a] px-3 py-2 hover:border-[#3f3f46] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white truncate">
                      {holder.pseudonym || holder.name || (holder.proxyWallet ? `${holder.proxyWallet.slice(0, 6)}...${holder.proxyWallet.slice(-4)}` : 'Unknown')}
                    </span>
                    <span className="text-xs text-[#00ffa3] font-medium">
                      {Number(holder.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Order Book and Live Chat side by side */}
        <div className="flex gap-6 items-stretch">
          {/* Order Book */}
          <div className="flex-[2] rounded-[12px] border border-[#27272a] overflow-hidden flex flex-col">
              <button
                onClick={() => setShowOrderBook(!showOrderBook)}
                className="w-full px-4 py-4 flex items-center justify-between text-white bg-transparent hover:bg-[#18181b] transition-colors"
              >
                <span className="font-medium text-base">Order Book</span>
                <svg 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  className={`transition-transform ${showOrderBook ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {showOrderBook && (
                <div className="px-4 pb-4">
                  <div className="flex gap-2 mb-4">
                    <button className={`px-3 py-1.5 rounded-[6px] text-sm font-medium ${outcome === 'YES' ? 'bg-[#27272a] text-white' : 'text-[#71717b]'}`}>
                      {yesOutcomeLabel}
                    </button>
                    <button className={`px-3 py-1.5 rounded-[6px] text-sm font-medium ${outcome === 'NO' ? 'bg-[#27272a] text-white' : 'text-[#71717b]'}`}>
                      {noOutcomeLabel}
                    </button>
                  </div>
                  <div className="text-xs text-[#71717b] mb-3">Click any level to prefill a limit order</div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <button
                      onClick={() => !isLockedMarket && orderbookMetrics.bestAsk !== null && handleOrderbookLevelClick(String(orderbookMetrics.bestAsk), 'ask')}
                      disabled={isLockedMarket || orderbookMetrics.bestAsk === null}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-[#1f1f24] border border-[#30303a] text-[#d4d4d8] hover:text-white disabled:opacity-50"
                    >
                      Best Ask {orderbookMetrics.bestAsk !== null ? `${(orderbookMetrics.bestAsk * 100).toFixed(1)}¢` : ''}
                    </button>
                    <button
                      onClick={() => !isLockedMarket && orderbookMetrics.bestBid !== null && handleOrderbookLevelClick(String(orderbookMetrics.bestBid), 'bid')}
                      disabled={isLockedMarket || orderbookMetrics.bestBid === null}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-[#1f1f24] border border-[#30303a] text-[#d4d4d8] hover:text-white disabled:opacity-50"
                    >
                      Best Bid {orderbookMetrics.bestBid !== null ? `${(orderbookMetrics.bestBid * 100).toFixed(1)}¢` : ''}
                    </button>
                    <div className="text-xs text-[#71717b]">
                      Mid {orderbookMetrics.midpoint !== null ? `${(orderbookMetrics.midpoint * 100).toFixed(1)}¢` : 'N/A'}
                    </div>
                    <div className="text-xs text-[#71717b]">
                      Spread {orderbookMetrics.spread !== null ? `${(orderbookMetrics.spread * 100).toFixed(1)}¢` : 'N/A'}
                    </div>
                  </div>
                  
                  {orderbookLoading ? (
                    <div className="text-sm text-[#71717b] text-center py-4">Loading orderbook...</div>
                  ) : orderbook ? (
                    <div className="space-y-0">
                      <div className="flex gap-3 text-xs text-[#71717b] mb-2 px-1">
                        <span className="flex-1">Trade {outcome}</span>
                        <span className="w-[80px]">Price</span>
                        <span className="w-[80px]">Shares</span>
                        <span className="w-[100px]">Total</span>
                      </div>
                      
                      <div className="text-xs text-[#71717b] mb-2 px-1">
                        <span className="inline-block px-2 py-0.5 rounded bg-[#ff6b6b]/20 text-[#ff6b6b] text-[10px] font-medium">Asks</span>
                      </div>
                      
                      {(() => {
                        const sortedAsks = [...orderbook.asks]
                          .sort((a, b) => parseFloat(b.size) - parseFloat(a.size))
                          .slice(0, 10);
                        const maxAskSize = Math.max(...sortedAsks.map(a => parseFloat(a.size)), 1);
                        let cumulative = 0;
                        return sortedAsks.map((ask, i) => {
                          const askSize = parseFloat(ask.size);
                          cumulative += askSize;
                          const sizePercent = (askSize / maxAskSize) * 100;
                          const total = parseFloat(ask.price) * askSize;
                          return (
                            <button
                              key={i}
                              className="relative h-[28px] border-b border-[#27272a] flex items-center w-full text-left hover:bg-[#202026] transition-colors"
                              onClick={() => !isLockedMarket && handleOrderbookLevelClick(ask.price, 'ask', ask.size)}
                            >
                              <div 
                                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[rgba(255,107,107,0.5)] to-[rgba(255,107,107,0.1)] border-l-[3px] border-[#ff6b6b]"
                                style={{ width: `${sizePercent}%` }}
                              />
                              <div className="relative flex gap-3 w-full px-1">
                                <span className="flex-1"></span>
                                <span className="w-[80px] text-white text-sm font-medium">{(parseFloat(ask.price) * 100).toFixed(0)}¢</span>
                                <span className="w-[80px] text-white text-sm font-medium">{askSize.toLocaleString()}</span>
                                <span className="w-[100px] text-white text-sm font-medium">${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                <span className="w-[90px] text-[#9f9fa9] text-xs">Cum {cumulative.toLocaleString()}</span>
                              </div>
                            </button>
                          );
                        });
                      })()}
                      
                      <div className="py-2 text-center text-sm text-[#71717b]">
                        Last: {(parseFloat(orderbook.asks[0]?.price || '0') * 100).toFixed(0)}¢ · Mid: {orderbookMetrics.midpoint !== null ? `${(orderbookMetrics.midpoint * 100).toFixed(1)}¢` : 'N/A'} · Spread: {orderbookMetrics.spread !== null ? `${(orderbookMetrics.spread * 100).toFixed(1)}¢` : 'N/A'}
                      </div>
                      
                      <div className="text-xs text-[#71717b] mb-2 px-1">
                        <span className="inline-block px-2 py-0.5 rounded bg-[#00ffa3]/20 text-[#00ffa3] text-[10px] font-medium">Bids</span>
                      </div>
                      
                      {(() => {
                        const sortedBids = [...orderbook.bids]
                          .sort((a, b) => parseFloat(a.size) - parseFloat(b.size))
                          .slice(0, 10);
                        const maxBidSize = Math.max(...sortedBids.map(b => parseFloat(b.size)), 1);
                        let cumulative = 0;
                        return sortedBids.map((bid, i) => {
                          const bidSize = parseFloat(bid.size);
                          cumulative += bidSize;
                          const sizePercent = (bidSize / maxBidSize) * 100;
                          const total = parseFloat(bid.price) * bidSize;
                          return (
                            <button
                              key={i}
                              className="relative h-[28px] border-b border-[#27272a] flex items-center w-full text-left hover:bg-[#202026] transition-colors"
                              onClick={() => !isLockedMarket && handleOrderbookLevelClick(bid.price, 'bid', bid.size)}
                            >
                              <div 
                                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[rgba(0,255,163,0.5)] to-[rgba(0,255,163,0.1)] border-l-[3px] border-[#00ffa3]"
                                style={{ width: `${sizePercent}%` }}
                              />
                              <div className="relative flex gap-3 w-full px-1">
                                <span className="flex-1"></span>
                                <span className="w-[80px] text-white text-sm font-medium">{(parseFloat(bid.price) * 100).toFixed(0)}¢</span>
                                <span className="w-[80px] text-white text-sm font-medium">{bidSize.toLocaleString()}</span>
                                <span className="w-[100px] text-white text-sm font-medium">${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                <span className="w-[90px] text-[#9f9fa9] text-xs">Cum {cumulative.toLocaleString()}</span>
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  ) : (
                    <div className="text-sm text-[#71717b] text-center py-4">No orderbook data available</div>
                  )}
                </div>
              )}
            </div>

            {/* Live Chat */}
            <div className="flex-1 rounded-[12px] bg-[#27272a] p-4 pb-5 flex flex-col max-h-[400px]">
              <div className="border border-[rgba(255,255,255,0.1)] rounded-[12px] px-3 py-1.5 inline-flex items-center gap-1 mb-4 self-start">
                <div className="w-3 h-3 rounded-full bg-[#00ffa3] animate-pulse"></div>
                <span className="text-xs text-[#f4f3f6] font-medium">Live chat</span>
              </div>
              
              <div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#3f3f46] scrollbar-track-transparent">
                {isLoadingComments && comments.length === 0 ? (
                  <div className="text-sm text-[#71717b] text-center py-4">Loading comments...</div>
                ) : comments.length === 0 ? (
                  <div className="text-sm text-[#71717b] text-center py-4">No comments yet. Be the first!</div>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-2.5">
                      <UserHoverCard 
                        userAddress={comment.user_address}
                        prefetchedData={commenterDataCache[comment.user_address.toLowerCase()]}
                      >
                        <div 
                          className="w-[25px] h-[25px] rounded-full flex-shrink-0 cursor-pointer"
                          style={{ 
                            background: `linear-gradient(135deg, hsl(${parseInt(comment.user_address.slice(2, 8), 16) % 360}, 70%, 50%), hsl(${(parseInt(comment.user_address.slice(2, 8), 16) + 60) % 360}, 70%, 50%))` 
                          }}
                        />
                      </UserHoverCard>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-end justify-between mb-1">
                          <UserHoverCard 
                            userAddress={comment.user_address}
                            prefetchedData={commenterDataCache[comment.user_address.toLowerCase()]}
                          >
                            <span className="text-sm text-[#f4f3f6] font-semibold cursor-pointer hover:text-[#cdb7ff] transition-colors">
                              {shortenAddress(comment.user_address)}
                            </span>
                          </UserHoverCard>
                          <span className="text-xs text-[#71717b]">{formatTimeAgo(comment.created_at)}</span>
                        </div>
                        <p className="text-sm text-[#9f9fa9] leading-[1.3] break-words">{comment.body}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="mt-auto pt-4 border-t border-[rgba(255,255,255,0.1)]">
                {userAddress ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
                      placeholder="Type a message..."
                      className="flex-1 bg-[#18181b] rounded-[8px] px-3 py-2 text-sm text-white placeholder:text-[#71717b] outline-none focus:ring-1 focus:ring-[#cdb7ff]"
                      maxLength={1000}
                      disabled={isPostingComment}
                    />
                    <button 
                      onClick={handlePostComment}
                      disabled={!chatInput.trim() || isPostingComment}
                      className="px-4 py-2 rounded-[8px] bg-[rgba(205,183,255,0.2)] hover:bg-[rgba(205,183,255,0.3)] text-[#cdb7ff] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPostingComment ? '...' : 'Send'}
                    </button>
                  </div>
                ) : (
                  <button className="w-full py-3 rounded-[12px] bg-[rgba(205,183,255,0.2)] hover:bg-[rgba(205,183,255,0.3)] text-[#cdb7ff] text-sm font-medium transition-colors">
                    Connect wallet to chat
                  </button>
                )}
                <div className="flex items-center justify-center gap-1 mt-3">
                  <span className="text-xs text-[#9f9fa9]">Beware of external links</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
  );
};
