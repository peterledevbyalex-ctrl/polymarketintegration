import { useState, useEffect, useCallback } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { UserPositionsResponse } from '@/types/polymarket.types';

interface UsePositionsParams {
  eoaAddress?: string;
  autoFetch?: boolean;
}

interface UsePositionsReturn {
  positions: UserPositionsResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const usePositions = ({
  eoaAddress,
  autoFetch = true,
}: UsePositionsParams = {}): UsePositionsReturn => {
  const [positions, setPositions] = useState<UserPositionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!eoaAddress) {
      setPositions(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await polymarketAPI.getUserPositions(eoaAddress);
      setPositions(response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch positions');
      setError(error);
      console.error('Failed to fetch positions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [eoaAddress]);

  useEffect(() => {
    if (autoFetch && eoaAddress) {
      fetchPositions();
    }
  }, [eoaAddress, autoFetch, fetchPositions]);

  return {
    positions,
    isLoading,
    error,
    refetch: fetchPositions,
  };
};
