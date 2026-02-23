import { useState, useEffect } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { Market } from '@/types/polymarket.types';
import { getErrorMessage, isRetryableError } from '@/lib/polymarket/errors';

interface UseMarketsParams {
  limit?: number;
  offset?: number;
  active?: boolean;
  tagId?: number;
  search?: string;
  sort?: 'volume' | 'liquidity' | 'newest' | 'ending_soon' | 'volume_24h';
  autoFetch?: boolean;
}

interface UseMarketsReturn {
  markets: Market[];
  isLoading: boolean;
  error: Error | null;
  userFriendlyError: string | null;
  canRetry: boolean;
  refetch: () => Promise<void>;
  pagination?: {
    total?: number;
    hasMore?: boolean;
    offset: number;
    limit: number;
  };
}

export const useMarkets = ({
  limit = 20,
  offset = 0,
  active = true,
  tagId,
  search,
  sort = 'volume_24h',
  autoFetch = true,
}: UseMarketsParams = {}): UseMarketsReturn => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState<{
    total?: number;
    hasMore?: boolean;
    offset: number;
    limit: number;
  }>({ offset: 0, limit: 20 });

  const fetchMarkets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await polymarketAPI.getMarkets({ 
        limit, 
        offset, 
        active, 
        tagId, 
        search, 
        sort 
      });
      
      setMarkets(response.markets || []);
      setPagination({
        total: response.pagination?.total,
        hasMore: response.pagination?.hasMore,
        offset: offset,
        limit: limit,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch markets');
      setError(error);
      console.error('Failed to fetch markets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch) {
      fetchMarkets();
    }
  }, [limit, offset, active, tagId, search, sort, autoFetch]);

  return {
    markets,
    isLoading,
    error,
    userFriendlyError: error ? getErrorMessage(error) : null,
    canRetry: error ? isRetryableError(error) : false,
    refetch: fetchMarkets,
    pagination,
  };
};
