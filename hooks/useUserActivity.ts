"use client";

import { useCallback, useEffect, useState } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { PolymarketActivityItem } from '@/types/polymarket.types';

interface UseUserActivityOptions {
  eoaAddress?: string;
  limit?: number;
  autoFetch?: boolean;
}

export function useUserActivity({
  eoaAddress,
  limit = 25,
  autoFetch = true,
}: UseUserActivityOptions = {}) {
  const [activity, setActivity] = useState<PolymarketActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!eoaAddress) {
      setActivity([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await polymarketAPI.getUserActivity({
        user: eoaAddress,
        limit,
        sortBy: 'TIMESTAMP',
        sortDirection: 'DESC',
      });
      setActivity(data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load user activity');
    } finally {
      setIsLoading(false);
    }
  }, [eoaAddress, limit]);

  useEffect(() => {
    if (autoFetch && eoaAddress) {
      refetch();
    }
  }, [autoFetch, eoaAddress, refetch]);

  return { activity, isLoading, error, refetch };
}
