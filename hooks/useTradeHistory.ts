import { useState, useEffect, useCallback } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { TradeHistory } from '@/types/polymarket.types';

interface UseTradeHistoryParams {
  eoaAddress?: string;
  limit?: number;
  autoFetch?: boolean;
}

interface UseTradeHistoryReturn {
  trades: TradeHistory[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  hasMore: boolean;
}

export const useTradeHistory = ({
  eoaAddress,
  limit = 20,
  autoFetch = true,
}: UseTradeHistoryParams = {}): UseTradeHistoryReturn => {
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrades = useCallback(async (reset: boolean = false) => {
    if (!eoaAddress) {
      setTrades([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const currentOffset = reset ? 0 : offset;
      const response = await polymarketAPI.getTradeHistory({
        eoaAddress,
        limit,
        offset: currentOffset,
      });

      const activity = reset
        ? await polymarketAPI.getUserActivity({
            user: eoaAddress,
            limit: Math.min(100, limit * 3),
            sortBy: 'TIMESTAMP',
            sortDirection: 'DESC',
          }).catch(() => [])
        : [];

      const activityTrades: TradeHistory[] = activity
        .filter((item) => item.type === 'TRADE')
        .map((item, idx) => {
          const usdc = Number(item.usdcSize || 0);
          const ts = Number(item.timestamp || 0) * (Number(item.timestamp || 0) > 1e12 ? 1 : 1000);
          return {
            intentId: item.transactionHash || `activity-${item.conditionId || 'm'}-${idx}`,
            marketId: item.conditionId || '',
            conditionId: item.conditionId,
            outcome: (item.outcome?.toUpperCase() === 'NO' ? 'NO' : 'YES') as 'YES' | 'NO',
            action: (item.side === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
            orderType: 'MARKET',
            inputAmount: usdc > 0 ? String(Math.round(usdc * 1_000_000)) : '0',
            inputCurrency: 'USDC',
            destAmountExpected: usdc > 0 ? String(Math.round(usdc * 1_000_000)) : '0',
            state: 'FILLED',
            polymarketOrderId: undefined,
            originTxHash: undefined,
            polygonTxHash: item.transactionHash,
            createdAt: ts ? new Date(ts).toISOString() : new Date().toISOString(),
            updatedAt: ts ? new Date(ts).toISOString() : new Date().toISOString(),
          };
        });

      const intentTrades = response.trades.map((trade) => ({ ...trade, source: 'INTENT' as const }));
      const enrichedActivityTrades = activityTrades.map((trade) => ({ ...trade, source: 'POLYMARKET' as const }));
      const merged = [...intentTrades, ...enrichedActivityTrades];
      const seen = new Set<string>();
      const deduped = merged.filter((trade) => {
        const key = trade.polygonTxHash || trade.originTxHash || trade.intentId;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      
      if (reset) {
        setTrades(deduped);
        setOffset(limit);
      } else {
        setTrades(prev => [...prev, ...response.trades]);
        setOffset(prev => prev + limit);
      }
      setTotal(reset ? Math.max(response.total, deduped.length) : response.total);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch trade history');
      setError(error);
      console.error('Failed to fetch trade history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [eoaAddress, limit, offset]);

  const refetch = useCallback(() => fetchTrades(true), [fetchTrades]);
  const loadMore = useCallback(() => fetchTrades(false), [fetchTrades]);

  useEffect(() => {
    if (autoFetch && eoaAddress) {
      fetchTrades(true);
    }
  }, [eoaAddress, autoFetch]);

  return {
    trades,
    total,
    isLoading,
    error,
    loadMore,
    refetch,
    hasMore: trades.length < total,
  };
};
