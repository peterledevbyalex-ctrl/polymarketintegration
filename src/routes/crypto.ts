import { Router, Request, Response as ExpressResponse } from 'express';
import logger from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const POLYMARKET_CRYPTO_API = 'https://polymarket.com/api/crypto/markets';

async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Prism-Backend/1.0',
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

function transformMarket(market: any, event?: any) {
  let tokenIds: string[] = [];
  try {
    tokenIds = typeof market.clobTokenIds === 'string'
      ? JSON.parse(market.clobTokenIds)
      : market.clobTokenIds || [];
  } catch {}

  const marketId = market.id || market.conditionId || market.slug;

  return {
    id: marketId,
    market_id: market.conditionId || market.slug,
    question: market.question,
    slug: market.slug,
    description: market.description,
    image: market.image || event?.image,
    icon: market.icon,
    outcomes: typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes,
    outcomePrices: typeof market.outcomePrices === 'string'
      ? JSON.parse(market.outcomePrices)
      : market.outcomePrices,
    volume: market.volume,
    volume24hr: market.volume24hr,
    liquidity: market.liquidity,
    endDate: market.endDate || event?.endDate,
    active: market.active,
    closed: market.closed,
    acceptingOrders: market.acceptingOrders,
    lastTradePrice: market.lastTradePrice,
    oneHourPriceChange: market.oneHourPriceChange,
    oneDayPriceChange: market.oneDayPriceChange,
    bestBid: market.bestBid,
    bestAsk: market.bestAsk,
    tradeable: market.active && !market.closed,
    tokens: tokenIds.length >= 2
      ? [
          { outcome: 'YES', token_id: tokenIds[0] },
          { outcome: 'NO', token_id: tokenIds[1] },
        ]
      : [],
    eventTitle: event?.title || market.groupItemTitle,
    eventSlug: event?.slug,
    seriesSlug: event?.seriesSlug || event?.series?.[0]?.slug || event?.series?.[0]?.ticker,
    eventStartTime: market.eventStartTime || event?.startTime || market.startTime,
    startTime: event?.startTime || market.startTime || market.eventStartTime,
    resolutionSource: market.resolutionSource || event?.resolutionSource,
    recurrence: event?.series?.[0]?.recurrence,
    isLive: Boolean(event?.isLive ?? market?.isLive ?? (market.active && !market.closed)),
    tags: market.tags || event?.tags || [],
  };
}

/**
 * @swagger
 * /api/crypto/markets:
 *   get:
 *     summary: Proxy crypto markets from Polymarket
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: _c
 *         schema:
 *           type: string
 *         description: Time bucket (15M, 1H, 4H, 1D, 1W, 1M)
 *       - in: query
 *         name: _s
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: _sts
 *         schema:
 *           type: string
 *         description: Status (active/closed)
 *       - in: query
 *         name: _l
 *         schema:
 *           type: number
 *         description: Limit
 *       - in: query
 *         name: _offset
 *         schema:
 *           type: number
 *         description: Offset
 *     responses:
 *       200:
 *         description: Crypto markets list
 */
router.get('/markets', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const queryParams = new URLSearchParams();
  const { _c, _s, _sts, _l, _offset } = req.query;

  if (_c) queryParams.append('_c', String(_c));
  if (_s) queryParams.append('_s', String(_s));
  if (_sts) queryParams.append('_sts', String(_sts));
  if (_l) queryParams.append('_l', String(_l));
  if (_offset) queryParams.append('_offset', String(_offset));

  const url = `${POLYMARKET_CRYPTO_API}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  logger.debug('Proxy crypto markets', { url });

  const response = await fetchWithTimeout(url, 10000);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
    return;
  }

  const data = await response.json();
  const events = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.events)
      ? (data as any).events
      : Array.isArray((data as any)?.data)
        ? (data as any).data
        : [];

  const hasEventMarkets = events.some((event: any) => Array.isArray(event?.markets));
  if (hasEventMarkets) {
    const markets: any[] = [];
    for (const event of events) {
      for (const market of event.markets || []) {
        markets.push(transformMarket(market, event));
      }
    }
    res.json({ markets });
    return;
  }

  res.json(Array.isArray(data) ? { markets: data } : data);
}));

export default router;
