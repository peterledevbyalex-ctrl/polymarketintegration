import { useState, useEffect, useCallback, useMemo } from 'react';
import { polymarketAPI } from '@/lib/polymarket/api';
import { PricePoint } from '@/types/polymarket.types';

type TimeRange = '5M' | '10M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

interface UsePriceHistoryParams {
  marketId: string;
  tokenId?: string;
  timeRange?: TimeRange;
  autoFetch?: boolean;
}

interface UsePriceHistoryReturn {
  priceHistory: PricePoint[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const getTimeRangeConfig = (
  range: TimeRange
): { durationSeconds: number; fidelity: number } => {
  switch (range) {
    case '5M':
      return { durationSeconds: 5 * 60, fidelity: 1 };
    case '10M':
      return { durationSeconds: 10 * 60, fidelity: 1 };
    case '1H':
      return { durationSeconds: 60 * 60, fidelity: 1 };
    case '6H':
      return { durationSeconds: 6 * 60 * 60, fidelity: 5 };
    case '1D':
      return { durationSeconds: 24 * 60 * 60, fidelity: 15 };
    case '1W':
      return { durationSeconds: 7 * 24 * 60 * 60, fidelity: 60 };
    case '1M':
      return { durationSeconds: 30 * 24 * 60 * 60, fidelity: 240 };
    case 'ALL':
    default:
      return { durationSeconds: 365 * 24 * 60 * 60, fidelity: 60 };
  }
};

const normalizeLivePoint = (
  point: PricePoint,
  startTs: number,
  fidelity: number
): PricePoint => {
  const bucketSizeSeconds = Math.max(1, fidelity) * 60;
  const ts = Math.max(startTs, point.t);
  const bucketTs = Math.floor(ts / bucketSizeSeconds) * bucketSizeSeconds;
  return { t: bucketTs, p: point.p };
};

export const usePriceHistory = ({
  marketId,
  tokenId,
  timeRange = '1D',
  autoFetch = true,
}: UsePriceHistoryParams): UsePriceHistoryReturn => {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { durationSeconds, fidelity } = useMemo(
    () => getTimeRangeConfig(timeRange),
    [timeRange]
  );
  const [startTs, setStartTs] = useState<number>(() =>
    Math.floor(Date.now() / 1000) - durationSeconds
  );

  useEffect(() => {
    setStartTs(Math.floor(Date.now() / 1000) - durationSeconds);
  }, [durationSeconds, tokenId, marketId]);

  const fetchPriceHistory = useCallback(async () => {
    if (!marketId) return;

    try {
      setIsLoading(true);
      setError(null);
      if (!tokenId) {
        setPriceHistory([]);
        return;
      }
      const response = await polymarketAPI.getPriceHistory({
        tokenId,
        startTs,
        fidelity,
      });
      setPriceHistory(response.history || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch price history');
      setError(error);
      console.error('Failed to fetch price history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [marketId, tokenId, startTs, fidelity]);

  useEffect(() => {
    if (autoFetch && marketId) {
      fetchPriceHistory();
    }
  }, [marketId, autoFetch, fetchPriceHistory]);

  useEffect(() => {
    if (!autoFetch || !tokenId) return;

    const ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'market',
          assets_ids: [tokenId],
          custom_feature_enabled: true,
        })
      );
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('PING');
        }
      }, 10000);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data === 'PONG') return;

      let parsed: any;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      const messages = Array.isArray(parsed) ? parsed : [parsed];
      let livePrice: PricePoint | null = null;

      for (const message of messages) {
        if (!message || typeof message !== 'object') continue;

        if (
          message.event_type === 'last_trade_price' &&
          message.asset_id === tokenId &&
          message.price !== undefined
        ) {
          const p = Number(message.price);
          const t = Math.floor(Number(message.timestamp) / 1000);
          if (Number.isFinite(p) && Number.isFinite(t) && p >= 0 && p <= 1) {
            livePrice = { t, p };
          }
        }
      }

      if (!livePrice) return;

      const liveWindowStart = Math.floor(Date.now() / 1000) - durationSeconds;
      const normalized = normalizeLivePoint(livePrice, liveWindowStart, fidelity);
      setPriceHistory((prev) => {
        const filtered = prev.filter((point) => point.t >= liveWindowStart);
        if (filtered.length === 0) return [normalized];

        const last = filtered[filtered.length - 1];
        if (last.t === normalized.t) {
          return [...filtered.slice(0, -1), normalized];
        }
        if (last.t > normalized.t) {
          return filtered;
        }
        return [...filtered, normalized];
      });
    };

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      ws.close();
    };
  }, [tokenId, autoFetch, fidelity, durationSeconds]);

  useEffect(() => {
    if (!autoFetch || !tokenId) return;

    let intervalRef: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let inFlight = false;

    const pollIntervalMs = durationSeconds <= 10 * 60 ? 1000 : 3000;

    const pollMidpoint = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const response = await fetch(
          `https://clob.polymarket.com/midpoint?token_id=${encodeURIComponent(tokenId)}`,
          { cache: 'no-store' }
        );
        if (!response.ok) return;
        const data = (await response.json()) as { mid?: string };
        const rawMid = typeof data?.mid === 'string' ? data.mid.trim() : '';
        if (!rawMid) return;
        const mid = Number(rawMid);
        // Ignore unusable midpoint values that can appear transiently.
        if (!Number.isFinite(mid) || mid <= 0 || mid >= 1) return;

        const nowTs = Math.floor(Date.now() / 1000);
        const liveWindowStart = nowTs - durationSeconds;
        const normalized = normalizeLivePoint({ t: nowTs, p: mid }, liveWindowStart, fidelity);

        setPriceHistory((prev) => {
          const filtered = prev.filter((point) => point.t >= liveWindowStart);
          if (filtered.length === 0) return [normalized];

          const last = filtered[filtered.length - 1];
          // Drop obvious midpoint outliers that would create fake vertical spikes.
          if (Math.abs(last.p - normalized.p) > 0.35) return filtered;

          if (last.t === normalized.t) {
            return [...filtered.slice(0, -1), normalized];
          }
          if (last.t > normalized.t) {
            return filtered;
          }
          return [...filtered, normalized];
        });
      } catch {
        // ignore transient midpoint polling errors
      } finally {
        inFlight = false;
      }
    };

    pollMidpoint();
    intervalRef = setInterval(pollMidpoint, pollIntervalMs);

    return () => {
      cancelled = true;
      if (intervalRef) clearInterval(intervalRef);
    };
  }, [tokenId, autoFetch, fidelity, durationSeconds]);

  return {
    priceHistory,
    isLoading,
    error,
    refetch: fetchPriceHistory,
  };
};
