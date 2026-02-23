import logger from '../utils/logger';

type Symbol = 'btc/usd' | 'eth/usd' | 'sol/usd' | 'xrp/usd';

export interface CryptoPricePoint {
  t: number;
  p: number;
}

const SUPPORTED_SYMBOLS: Symbol[] = ['btc/usd', 'eth/usd', 'sol/usd', 'xrp/usd'];
const MAX_HISTORY_SECONDS = 7 * 24 * 60 * 60; // 7 days

class CryptoPriceStreamService {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private readonly listeners = new Map<Symbol, Set<(point: CryptoPricePoint) => void>>();
  private readonly history = new Map<Symbol, CryptoPricePoint[]>();

  constructor() {
    for (const symbol of SUPPORTED_SYMBOLS) {
      this.listeners.set(symbol, new Set());
      this.history.set(symbol, []);
    }
  }

  start(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.connect();
  }

  stop(): void {
    this.connected = false;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(symbol: Symbol, callback: (point: CryptoPricePoint) => void): () => void {
    this.start();
    const set = this.listeners.get(symbol);
    if (!set) return () => {};
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  }

  getHistory(symbol: Symbol, durationSeconds: number): CryptoPricePoint[] {
    const points = this.history.get(symbol) || [];
    if (points.length === 0) return [];

    const nowSec = Date.now() / 1000;
    const startSec = nowSec - durationSeconds;
    const filtered = points.filter((point) => point.t >= startSec);
    return filtered;
  }

  private connect(): void {
    this.connected = false;
    this.ws = new WebSocket('wss://ws-live-data.polymarket.com');

    this.ws.onopen = () => {
      this.connected = true;
      logger.info('Crypto stream connected');
      this.ws?.send(
        JSON.stringify({
          action: 'subscribe',
          subscriptions: SUPPORTED_SYMBOLS.map((symbol) => ({
            topic: 'crypto_prices_chainlink',
            type: '*',
            filters: JSON.stringify({ symbol }),
          })),
        })
      );

      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send('PING');
        }
      }, 5000);
    };

    this.ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string' || event.data === 'PONG') return;
      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload?.topic !== 'crypto_prices_chainlink' || payload?.type !== 'update') return;

      const symbol = String(payload?.payload?.symbol || '').toLowerCase() as Symbol;
      if (!SUPPORTED_SYMBOLS.includes(symbol)) return;

      const price = Number(payload?.payload?.value);
      const timestampMs = Number(payload?.payload?.timestamp ?? payload?.timestamp);
      if (!Number.isFinite(price) || !Number.isFinite(timestampMs) || price <= 0) return;

      const point: CryptoPricePoint = {
        t: timestampMs / 1000,
        p: price,
      };
      this.pushPoint(symbol, point);
    };

    this.ws.onerror = (error: Event) => {
      logger.warn('Crypto stream socket error', { error });
    };

    this.ws.onclose = () => {
      this.connected = false;
      logger.warn('Crypto stream disconnected, scheduling reconnect');
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };
  }

  private pushPoint(symbol: Symbol, point: CryptoPricePoint): void {
    const existing = this.history.get(symbol) || [];
    const last = existing[existing.length - 1];

    if (!last || point.t > last.t) {
      existing.push(point);
    } else if (point.t === last.t) {
      existing[existing.length - 1] = point;
    } else {
      return;
    }

    const cutoff = point.t - MAX_HISTORY_SECONDS;
    const trimmed = existing.filter((entry) => entry.t >= cutoff);
    this.history.set(symbol, trimmed);

    const callbacks = this.listeners.get(symbol);
    if (!callbacks || callbacks.size === 0) return;
    callbacks.forEach((callback) => callback(point));
  }
}

export const cryptoPriceStreamService = new CryptoPriceStreamService();
export type { Symbol as CryptoPriceSymbol };

