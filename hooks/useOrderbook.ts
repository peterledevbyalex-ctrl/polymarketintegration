import { useState, useEffect } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { OrderbookResponse } from '@/types/polymarket.types';

interface UseOrderbookParams {
  marketId: string;
  outcome: 'YES' | 'NO';
  autoFetch?: boolean;
}

interface UseOrderbookReturn {
  orderbook: OrderbookResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useOrderbook = ({
  marketId,
  outcome,
  autoFetch = true,
}: UseOrderbookParams): UseOrderbookReturn => {
  const [orderbook, setOrderbook] = useState<OrderbookResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrderbook = async () => {
    if (!marketId) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await polymarketAPI.getOrderbook({
        marketId,
        outcome,
      });
      setOrderbook(response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch orderbook');
      setError(error);
      console.error('Failed to fetch orderbook:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch && marketId) {
      fetchOrderbook();
    }
  }, [marketId, outcome, autoFetch]);

  return {
    orderbook,
    isLoading,
    error,
    refetch: fetchOrderbook,
  };
};
