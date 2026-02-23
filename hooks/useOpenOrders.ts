"use client";

import { useCallback, useEffect, useState } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { OpenOrder } from '@/types/polymarket.types';

interface UseOpenOrdersOptions {
  eoaAddress?: string;
  autoFetch?: boolean;
}

export function useOpenOrders({ eoaAddress, autoFetch = true }: UseOpenOrdersOptions = {}) {
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!eoaAddress) {
      setOrders([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await polymarketAPI.getOpenOrders(eoaAddress);
      setOrders(response.orders || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load open orders');
    } finally {
      setIsLoading(false);
    }
  }, [eoaAddress]);

  const cancelOrder = useCallback(async (orderId: string) => {
    if (!eoaAddress) throw new Error('Wallet not connected');
    await polymarketAPI.cancelOrder({ megaethAddress: eoaAddress, orderId });
    await refetch();
  }, [eoaAddress, refetch]);

  useEffect(() => {
    if (autoFetch && eoaAddress) {
      refetch();
    }
  }, [autoFetch, eoaAddress, refetch]);

  return { orders, isLoading, error, refetch, cancelOrder };
}
