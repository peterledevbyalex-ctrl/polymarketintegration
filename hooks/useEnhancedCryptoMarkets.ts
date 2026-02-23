import { useState, useEffect, useCallback } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { Market } from '@/types/polymarket.types';
import { getErrorMessage, isRetryableError } from '@/lib/polymarket/errors';

interface UseEnhancedCryptoMarketsParams {
  bucket?: 'bitcoin' | 'ethereum' | 'defi' | 'altcoins' | 'all';
  timeframe?: '5M' | '10M' | '1H' | '4H' | '1D' | '1W';
  eventType?: 'price' | 'launch' | 'upgrade';
  asset?: string; // Specific crypto asset (BTC, ETH, etc.)
  priceRange?: { min: number; max: number };
  limit?: number;
  offset?: number;
  autoFetch?: boolean;
}

interface UseEnhancedCryptoMarketsReturn {
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
  // Additional crypto-specific data
  fastMarkets: Market[]; // 5M and 10M markets
  priceMarkets: Market[]; // Price movement markets
  eventMarkets: Market[]; // Launch/upgrade markets
}

export const useEnhancedCryptoMarkets = ({
  bucket = 'all',
  timeframe,
  eventType,
  asset,
  priceRange,
  limit = 20,
  offset = 0,
  autoFetch = true,
}: UseEnhancedCryptoMarketsParams = {}): UseEnhancedCryptoMarketsReturn => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState<{
    total?: number;
    hasMore?: boolean;
    offset: number;
    limit: number;
  }>({ offset: 0, limit: 20 });

  const fetchCryptoMarkets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use enhanced crypto markets API
      const response = await polymarketAPI.getEnhancedCryptoMarkets({
        bucket: bucket !== 'all' ? bucket : undefined,
        timeframe,
        eventType,
        priceRange,
        limit,
        offset,
      });
      
      let filteredMarkets = response.markets || [];
      
      // Additional client-side filtering for specific asset
      if (asset && asset !== 'all') {
        filteredMarkets = filteredMarkets.filter(market => 
          market.question.toLowerCase().includes(asset.toLowerCase()) ||
          market.cryptoAsset?.toLowerCase() === asset.toLowerCase()
        );
      }
      
      setMarkets(filteredMarkets);
      setPagination({
        total: response.pagination?.total,
        hasMore: response.pagination?.hasMore,
        offset: offset,
        limit: limit,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch crypto markets');
      setError(error);
      console.error('Failed to fetch crypto markets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [bucket, timeframe, eventType, asset, priceRange, limit, offset]);

  useEffect(() => {
    if (autoFetch) {
      fetchCryptoMarkets();
    }
  }, [fetchCryptoMarkets, autoFetch]);

  // Computed derived data
  const fastMarkets = markets.filter(market => 
    market.timeframe === '5M' || market.timeframe === '10M'
  );

  const priceMarkets = markets.filter(market =>
    market.question.toLowerCase().includes('price') ||
    market.question.toLowerCase().includes('up') ||
    market.question.toLowerCase().includes('down') ||
    market.eventType === 'price'
  );

  const eventMarkets = markets.filter(market =>
    market.eventType === 'launch' || 
    market.eventType === 'upgrade' ||
    market.question.toLowerCase().includes('launch') ||
    market.question.toLowerCase().includes('upgrade')
  );

  return {
    markets,
    isLoading,
    error,
    userFriendlyError: error ? getErrorMessage(error) : null,
    canRetry: error ? isRetryableError(error) : false,
    refetch: fetchCryptoMarkets,
    pagination,
    fastMarkets,
    priceMarkets,
    eventMarkets,
  };
};

// Helper hook for crypto asset price tracking
export const useCryptoAssetMarkets = (asset: string) => {
  return useEnhancedCryptoMarkets({
    asset,
    eventType: 'price',
    limit: 10,
  });
};

// Helper hook for fast crypto markets (5M/10M)
export const useFastCryptoMarkets = () => {
  return useEnhancedCryptoMarkets({
    timeframe: '5M', // Start with 5M, can be expanded
    eventType: 'price',
    limit: 15,
  });
};

// Helper hook for crypto launch markets
export const useCryptoLaunchMarkets = () => {
  return useEnhancedCryptoMarkets({
    eventType: 'launch',
    limit: 8,
  });
};