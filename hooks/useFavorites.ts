import { useState, useEffect, useCallback } from 'react';
import { POLYMARKET_API_URL } from '@/lib/polymarket/constants';

interface Favorite {
  market_id: string;
  created_at: string;
}

export function useFavorites(userAddress: string | undefined) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all favorites for the user
  const fetchFavorites = useCallback(async () => {
    if (!userAddress) {
      setFavorites([]);
      setFavoriteIds(new Set());
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${POLYMARKET_API_URL}/api/favorites/${userAddress}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) throw new Error('Failed to fetch favorites');

      const data = await res.json();
      setFavorites(data.favorites || []);
      setFavoriteIds(new Set((data.favorites || []).map((f: Favorite) => f.market_id)));
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Failed to fetch favorites:', err);
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  // Initial fetch
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Check if a market is favorited
  const isFavorite = useCallback((marketId: string) => {
    return favoriteIds.has(marketId);
  }, [favoriteIds]);

  // Add a favorite
  const addFavorite = useCallback(async (marketId: string) => {
    if (!userAddress) return false;

    // Optimistic update
    setFavoriteIds(prev => new Set([...prev, marketId]));
    setFavorites(prev => [{ market_id: marketId, created_at: new Date().toISOString() }, ...prev]);

    try {
      const res = await fetch(`${POLYMARKET_API_URL}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_address: userAddress, market_id: marketId }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok && res.status !== 409) {
        throw new Error('Failed to add favorite');
      }

      return true;
    } catch (err) {
      // Revert optimistic update
      setFavoriteIds(prev => {
        const next = new Set(prev);
        next.delete(marketId);
        return next;
      });
      setFavorites(prev => prev.filter(f => f.market_id !== marketId));
      console.error('Failed to add favorite:', err);
      return false;
    }
  }, [userAddress]);

  // Remove a favorite
  const removeFavorite = useCallback(async (marketId: string) => {
    if (!userAddress) return false;

    // Optimistic update
    const prevFavorites = favorites;
    const prevIds = favoriteIds;
    setFavoriteIds(prev => {
      const next = new Set(prev);
      next.delete(marketId);
      return next;
    });
    setFavorites(prev => prev.filter(f => f.market_id !== marketId));

    try {
      const res = await fetch(`${POLYMARKET_API_URL}/api/favorites/${userAddress}/${marketId}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok && res.status !== 404) {
        throw new Error('Failed to remove favorite');
      }

      return true;
    } catch (err) {
      // Revert optimistic update
      setFavorites(prevFavorites);
      setFavoriteIds(prevIds);
      console.error('Failed to remove favorite:', err);
      return false;
    }
  }, [userAddress, favorites, favoriteIds]);

  // Toggle favorite
  const toggleFavorite = useCallback(async (marketId: string) => {
    if (isFavorite(marketId)) {
      return removeFavorite(marketId);
    } else {
      return addFavorite(marketId);
    }
  }, [isFavorite, addFavorite, removeFavorite]);

  return {
    favorites,
    favoriteIds,
    isLoading,
    error,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    refetch: fetchFavorites,
  };
}
