import { useEffect, useMemo, useRef, useState } from 'react';
import { PricePoint } from '@/types/polymarket.types';
import { POLYMARKET_API_URL } from '@/lib/polymarket/constants';

type TimeRange = '5M' | '10M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

interface UseCryptoPriceHistoryParams {
  symbol?: 'btc/usd' | 'eth/usd' | 'sol/usd' | 'xrp/usd';
  timeRange?: TimeRange;
  autoFetch?: boolean;
}

interface UseCryptoPriceHistoryReturn {
  priceHistory: PricePoint[];
  isLoading: boolean;
  error: Error | null;
}

const getDurationSeconds = (range: TimeRange): number => {
  switch (range) {
    case '5M':
      return 5 * 60;
    case '10M':
      return 10 * 60;
    case '1H':
      return 60 * 60;
    case '6H':
      return 6 * 60 * 60;
    case '1D':
      return 24 * 60 * 60;
    case '1W':
      return 7 * 24 * 60 * 60;
    case '1M':
      return 30 * 24 * 60 * 60;
    case 'ALL':
    default:
      return 365 * 24 * 60 * 60;
  }
};

export const useCryptoPriceHistory = ({
  symbol,
  timeRange = '1D',
  autoFetch = true,
}: UseCryptoPriceHistoryParams): UseCryptoPriceHistoryReturn => {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const targetPriceRef = useRef<number | null>(null);

  const durationSeconds = useMemo(() => getDurationSeconds(timeRange), [timeRange]);

  useEffect(() => {
    if (!autoFetch || !symbol) {
      setPriceHistory([]);
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    let cancelled = false;
    const fetchHistory = async () => {
      try {
        const res = await fetch(
          `${POLYMARKET_API_URL}/api/crypto-prices/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(timeRange)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error('Failed to load crypto price history');
        const data = (await res.json()) as { history?: PricePoint[] };
        if (cancelled) return;
        const history = data.history || [];
        setPriceHistory(history);
        targetPriceRef.current = history.length > 0 ? history[history.length - 1].p : null;
      } catch (err) {
        if (cancelled) return;
        const nextError = err instanceof Error ? err : new Error('Failed to load crypto history');
        setError(nextError);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [symbol, timeRange, autoFetch]);

  useEffect(() => {
    if (!autoFetch || !symbol) return;

    const source = new EventSource(
      `${POLYMARKET_API_URL}/api/crypto-prices/stream?symbol=${encodeURIComponent(symbol)}`
    );

    const onPrice = (event: MessageEvent) => {
      let point: PricePoint;
      try {
        point = JSON.parse(event.data) as PricePoint;
      } catch {
        return;
      }
      if (!Number.isFinite(point?.p) || !Number.isFinite(point?.t) || point.p <= 0) return;
      targetPriceRef.current = point.p;

      const nowTs = Date.now() / 1000;
      const windowStart = nowTs - durationSeconds;
      setPriceHistory((prev) => {
        const filtered = prev.filter((entry) => entry.t >= windowStart);
        if (filtered.length === 0) return [{ t: nowTs, p: point.p }];

        const last = filtered[filtered.length - 1];
        const blendedPrice = last.p + (point.p - last.p) * 0.35;
        const renderPoint: PricePoint = { t: nowTs, p: blendedPrice };

        if (renderPoint.t <= last.t) {
          return [...filtered.slice(0, -1), { t: last.t, p: renderPoint.p }];
        }
        return [...filtered, renderPoint];
      });
    };

    const onError = () => {
      setError(new Error('Crypto stream disconnected'));
    };

    source.addEventListener('price', onPrice as EventListener);
    source.addEventListener('error', onError as EventListener);

    return () => {
      source.removeEventListener('price', onPrice as EventListener);
      source.removeEventListener('error', onError as EventListener);
      source.close();
    };
  }, [symbol, durationSeconds, autoFetch]);

  useEffect(() => {
    if (!autoFetch || !symbol) return;

    const ticker = setInterval(() => {
      setPriceHistory((prev) => {
        if (prev.length === 0) return prev;

        const nowTs = Date.now() / 1000;
        const windowStart = nowTs - durationSeconds;
        const filtered = prev.filter((entry) => entry.t >= windowStart);
        if (filtered.length === 0) return filtered;

        const last = filtered[filtered.length - 1];
        if (nowTs - last.t < 0.12) return filtered;

        const target = targetPriceRef.current ?? last.p;
        const nextPrice =
          Math.abs(target - last.p) < 0.0001
            ? target
            : last.p + (target - last.p) * 0.18;

        return [...filtered, { t: nowTs, p: nextPrice }];
      });
    }, 120);

    return () => clearInterval(ticker);
  }, [symbol, durationSeconds, autoFetch]);

  return {
    priceHistory,
    isLoading,
    error,
  };
};

