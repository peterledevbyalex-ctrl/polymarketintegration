import { useState, useEffect, useRef } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { Market } from '@/types/polymarket.types';

interface UseFeaturedMarketsParams {
  trendingLimit?: number;
  perCategory?: number;
}

interface UseFeaturedMarketsReturn {
  trending: Market[];
  byCategory: Record<string, Market[]>;
  markets: Market[];
  isLoading: boolean;
  isLoadingTrending: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// Simple in-memory cache with 5 minute TTL
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useFeaturedMarkets = ({ 
  trendingLimit = 8, // Reduced from 30 for faster initial load
  perCategory = 4, // Reduced from 10 for faster initial load
}: UseFeaturedMarketsParams = {}): UseFeaturedMarketsReturn => {
  const [trending, setTrending] = useState<Market[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, Market[]>>({});
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetchFeaturedMarkets = async () => {
    const cacheKey = `featured-${trendingLimit}-${perCategory}`;
    const cached = cache.get(cacheKey);
    
    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      if (!mountedRef.current) return;
      setTrending(cached.data.trending || []);
      setByCategory(cached.data.byCategory || {});
      setMarkets(cached.data.markets || []);
      return;
    }

    try {
      setIsLoading(true);
      setIsLoadingTrending(true);
      setError(null);
      
      // Fetch with AbortSignal for cancellation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await polymarketAPI.getFeaturedMarkets({ trendingLimit, perCategory });
      
      clearTimeout(timeoutId);
      
      if (!mountedRef.current) return;
      
      // Update trending first for progressive loading
      if (response.trending) {
        setTrending(response.trending);
        setIsLoadingTrending(false);
      }
      
      // Then update categories
      if (response.byCategory) {
        setByCategory(response.byCategory);
      }
      
      if (response.markets) {
        setMarkets(response.markets);
      }
      
      // Cache the response
      cache.set(cacheKey, { data: response, timestamp: Date.now() });
    } catch (err) {
      if (!mountedRef.current) return;
      const error = err instanceof Error ? err : new Error('Failed to fetch featured markets');
      setError(error);
      console.error('Failed to fetch featured markets:', error);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsLoadingTrending(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchFeaturedMarkets();
    
    return () => {
      mountedRef.current = false;
    };
  }, [trendingLimit, perCategory]);

  return {
    trending,
    byCategory,
    markets,
    isLoading,
    isLoadingTrending,
    error,
    refetch: fetchFeaturedMarkets,
  };
};
