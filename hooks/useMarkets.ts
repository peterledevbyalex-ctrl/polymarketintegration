import { useState, useEffect } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { Market } from '@/types/polymarket.types';

interface UseMarketsParams {
  limit?: number;
  offset?: number;
  active?: boolean;
  autoFetch?: boolean;
}

interface UseMarketsReturn {
  markets: Market[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useMarkets = ({
  limit = 20,
  offset = 0,
  active = true,
  autoFetch = true,
}: UseMarketsParams = {}): UseMarketsReturn => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchMarkets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await polymarketAPI.getMarkets({ limit, offset, active });
      setMarkets(response.markets || []);
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
  }, [limit, offset, active, autoFetch]);

  return {
    markets,
    isLoading,
    error,
    refetch: fetchMarkets,
  };
};
