import {
  CreateIntentRequest,
  CreateIntentResponse,
  IntentStatusResponse,
  Market,
  MarketsResponse,
  PriceHistoryResponse,
  FeaturedMarketsResponse,
  TagsResponse,
  OrderbookResponse,
  UserPositionsResponse,
  TradeHistoryResponse,
  EventsResponse,
  PolymarketOpenInterestResponse,
  PolymarketLiveVolumeResponse,
  PolymarketActivityItem,
  PolymarketHoldersItem,
  OpenOrder,
} from '@/types/polymarket.types';
import { POLYMARKET_API_URL } from './constants';

class PolymarketAPIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'PolymarketAPIError';
  }
}

const USER_POSITIONS_CACHE_TTL_MS = 5000;
const userPositionsCache = new Map<string, { ts: number; data: UserPositionsResponse }>();
const userPositionsInFlight = new Map<string, Promise<UserPositionsResponse>>();

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new PolymarketAPIError(
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'An unknown error occurred',
      response.status
    );
  }
  return response.json();
};

export const polymarketAPI = {
  createIntent: async (request: CreateIntentRequest): Promise<CreateIntentResponse> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<CreateIntentResponse>(response);
  },

  submitOriginTx: async (
    intentId: string,
    txHash: string,
    walletSignature: string
  ): Promise<{ intentId: string; state: string }> => {
    const response = await fetch(
      `${POLYMARKET_API_URL}/api/intents/${intentId}/origin-tx`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash, walletSignature }),
      }
    );
    return handleResponse(response);
  },

  getIntentStatus: async (intentId: string): Promise<IntentStatusResponse> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/intents/${intentId}`);
    return handleResponse<IntentStatusResponse>(response);
  },

  retryIntent: async (intentId: string): Promise<void> => {
    const response = await fetch(
      `${POLYMARKET_API_URL}/api/intents/${intentId}/retry`,
      { method: 'POST' }
    );
    await handleResponse(response);
  },

  getMarkets: async (params?: {
    limit?: number;
    offset?: number;
    active?: boolean;
    tagId?: number;
    search?: string;
    sort?: 'volume' | 'liquidity' | 'newest' | 'ending_soon' | 'volume_24h';
  }): Promise<MarketsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.active !== undefined) queryParams.append('active', params.active.toString());
    if (params?.tagId !== undefined) queryParams.append('tag', params.tagId.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.sort) queryParams.append('sort', params.sort);

    const url = `${POLYMARKET_API_URL}/api/markets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetch(url);
    return handleResponse<MarketsResponse>(response);
  },

  getCryptoMarkets: async (params?: {
    limit?: number;
    offset?: number;
    bucket?: string;
    status?: 'active' | 'closed';
    sort?: 'volume' | 'liquidity' | 'newest' | 'ending_soon' | 'volume_24h';
  }): Promise<MarketsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.bucket) queryParams.append('_c', params.bucket);
    if (params?.sort) queryParams.append('_s', params.sort);
    if (params?.status) queryParams.append('_sts', params.status);
    if (params?.limit) queryParams.append('_l', params.limit.toString());
    if (params?.offset) queryParams.append('_offset', params.offset.toString());

    const url = `${POLYMARKET_API_URL}/api/crypto/markets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetch(url);
    const data = await handleResponse<MarketsResponse | Market[]>(response);
    return Array.isArray(data) ? { markets: data } : data;
  },

  getEvents: async (params?: {
    tagId?: number;
    relatedTags?: boolean;
    excludeTagId?: number;
    category?: string;
    order?: string;
    ascending?: boolean;
    closed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<EventsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.tagId !== undefined) queryParams.append('tag_id', params.tagId.toString());
    if (params?.relatedTags !== undefined) queryParams.append('related_tags', params.relatedTags.toString());
    if (params?.excludeTagId !== undefined) queryParams.append('exclude_tag_id', params.excludeTagId.toString());
    if (params?.category) queryParams.append('category', params.category);
    if (params?.order) queryParams.append('order', params.order);
    if (params?.ascending !== undefined) queryParams.append('ascending', params.ascending.toString());
    if (params?.closed !== undefined) queryParams.append('closed', params.closed.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const url = `${POLYMARKET_API_URL}/api/events${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetch(url);
    return handleResponse<EventsResponse>(response);
  },

  getMarket: async (marketId: string): Promise<Market> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/markets/${marketId}`);
    return handleResponse<Market>(response);
  },
  

  getUserPositions: async (eoaAddress: string): Promise<UserPositionsResponse> => {
    const cacheKey = eoaAddress.toLowerCase();
    const now = Date.now();

    const cached = userPositionsCache.get(cacheKey);
    if (cached && now - cached.ts < USER_POSITIONS_CACHE_TTL_MS) {
      return cached.data;
    }

    const inFlight = userPositionsInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      const response = await fetch(`${POLYMARKET_API_URL}/api/positions/eoa/${eoaAddress}`);
      const data = await handleResponse<UserPositionsResponse>(response);
      userPositionsCache.set(cacheKey, { ts: Date.now(), data });
      return data;
    })();

    userPositionsInFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      userPositionsInFlight.delete(cacheKey);
    }
  },

  getSafeBalance: async (
    megaethAddress: string,
    walletSignature: string
  ): Promise<{ safeAddress: string; balanceUsdc: string; balanceRaw: string }> => {
    const response = await fetch(
      `${POLYMARKET_API_URL}/api/withdraw/balance/${megaethAddress}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletSignature }),
      }
    );
    return handleResponse(response);
  },

  initiateWithdrawal: async (params: {
    megaethAddress: string;
    walletSignature?: string;
    amountUsdc: string;
    destCurrency?: string;
    requireBridge?: boolean;
  }): Promise<{ withdrawalId: string; status: string }> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse(response);
  },

  getWithdrawalStatus: async (withdrawalId: string): Promise<any> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/withdraw/${withdrawalId}`);
    return handleResponse(response);
  },

  getPriceHistory: async (params: {
    tokenId: string;
    startTs?: number;
    endTs?: number;
    fidelity?: number;
  }): Promise<PriceHistoryResponse> => {
    const queryParams = new URLSearchParams();
    if (params.startTs) queryParams.append('startTs', params.startTs.toString());
    if (params.endTs) queryParams.append('endTs', params.endTs.toString());
    if (params.fidelity) queryParams.append('fidelity', params.fidelity.toString());

    const url = `${POLYMARKET_API_URL}/api/markets/${params.tokenId}/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetch(url);
    return handleResponse<PriceHistoryResponse>(response);
  },

  getFeaturedMarkets: async (params?: { 
    trendingLimit?: number;
    perCategory?: number;
  }): Promise<FeaturedMarketsResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.trendingLimit) queryParams.append('trendingLimit', params.trendingLimit.toString());
    if (params?.perCategory) queryParams.append('perCategory', params.perCategory.toString());
    
    const url = `${POLYMARKET_API_URL}/api/markets/featured${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return handleResponse<FeaturedMarketsResponse>(response);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - please try again');
      }
      throw error;
    }
  },

  getTags: async (): Promise<TagsResponse> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/markets/tags`);
    return handleResponse<TagsResponse>(response);
  },

  getEthPrice: async (): Promise<{ price: number }> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/eth-price`);
    return handleResponse<{ price: number }>(response);
  },

  getOrderbook: async (params: {
    marketId: string;
    outcome: 'YES' | 'NO';
  }): Promise<OrderbookResponse> => {
    const url = `${POLYMARKET_API_URL}/api/markets/${params.marketId}/orderbook?outcome=${params.outcome}`;
    const response = await fetch(url);
    return handleResponse<OrderbookResponse>(response);
  },

  getTradeHistory: async (params: {
    eoaAddress: string;
    limit?: number;
    offset?: number;
  }): Promise<TradeHistoryResponse> => {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    const url = `${POLYMARKET_API_URL}/api/positions/history/${params.eoaAddress}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await fetch(url);
    return handleResponse<TradeHistoryResponse>(response);
  },

  getOpenInterest: async (marketId: string): Promise<PolymarketOpenInterestResponse> => {
    const response = await fetch(
      `${POLYMARKET_API_URL}/api/polymarket-data/open-interest?market=${encodeURIComponent(marketId)}`
    );
    return handleResponse<PolymarketOpenInterestResponse>(response);
  },

  getLiveVolume: async (eventId: string | number): Promise<PolymarketLiveVolumeResponse> => {
    const response = await fetch(
      `${POLYMARKET_API_URL}/api/polymarket-data/live-volume?eventId=${encodeURIComponent(String(eventId))}`
    );
    return handleResponse<PolymarketLiveVolumeResponse>(response);
  },

  getUserActivity: async (params: {
    user: string;
    limit?: number;
    offset?: number;
    market?: string;
    eventId?: string;
    type?: string;
    start?: number;
    end?: number;
    sortBy?: 'TIMESTAMP' | 'TOKENS' | 'CASH';
    sortDirection?: 'ASC' | 'DESC';
    side?: 'BUY' | 'SELL';
  }): Promise<PolymarketActivityItem[]> => {
    const queryParams = new URLSearchParams();
    queryParams.append('user', params.user);
    if (params.limit !== undefined) queryParams.append('limit', String(params.limit));
    if (params.offset !== undefined) queryParams.append('offset', String(params.offset));
    if (params.market) queryParams.append('market', params.market);
    if (params.eventId) queryParams.append('eventId', params.eventId);
    if (params.type) queryParams.append('type', params.type);
    if (params.start !== undefined) queryParams.append('start', String(params.start));
    if (params.end !== undefined) queryParams.append('end', String(params.end));
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortDirection) queryParams.append('sortDirection', params.sortDirection);
    if (params.side) queryParams.append('side', params.side);

    const response = await fetch(
      `${POLYMARKET_API_URL}/api/polymarket-data/activity?${queryParams.toString()}`
    );
    return handleResponse<PolymarketActivityItem[]>(response);
  },

  getTopHolders: async (params: {
    market: string;
    limit?: number;
    minBalance?: number;
  }): Promise<PolymarketHoldersItem[]> => {
    const queryParams = new URLSearchParams();
    queryParams.set('market', params.market);
    if (params.limit !== undefined) queryParams.set('limit', String(params.limit));
    if (params.minBalance !== undefined) queryParams.set('minBalance', String(params.minBalance));
    const response = await fetch(
      `${POLYMARKET_API_URL}/api/polymarket-data/holders?${queryParams.toString()}`
    );
    return handleResponse<PolymarketHoldersItem[]>(response);
  },

  getOpenOrders: async (megaethAddress: string): Promise<{ orders: OpenOrder[] }> => {
    const response = await fetch(
      `${POLYMARKET_API_URL}/api/intents/orders?megaethAddress=${encodeURIComponent(megaethAddress)}`
    );
    return handleResponse<{ orders: OpenOrder[] }>(response);
  },

  cancelOrder: async (params: {
    megaethAddress: string;
    orderId: string;
    walletSignature?: string;
  }): Promise<{ orderId: string; status: string; message: string }> => {
    const response = await fetch(`${POLYMARKET_API_URL}/api/intents/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<{ orderId: string; status: string; message: string }>(response);
  },
};

export { PolymarketAPIError };
