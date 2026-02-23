import { Router, Request, Response as ExpressResponse } from 'express';
import logger from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { Cache } from '../utils/cache';

const router = Router();
const GAMMA_API = 'https://gamma-api.polymarket.com';

async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Prism-Backend/1.0' },
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
    tradeable: market.active && !market.closed,
    tokens: tokenIds.length >= 2
      ? [
          { outcome: 'YES', token_id: tokenIds[0] },
          { outcome: 'NO', token_id: tokenIds[1] },
        ]
      : [],
    eventTitle: event?.title || market.groupItemTitle,
    eventSlug: event?.slug,
    tags: market.tags || event?.tags || [],
  };
}

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get events with markets from Gamma API
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: tag_id
 *         schema:
 *           type: number
 *       - in: query
 *         name: related_tags
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: exclude_tag_id
 *         schema:
 *           type: number
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *       - in: query
 *         name: ascending
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: closed
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Events with markets
 */
router.get('/', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const {
    tag_id,
    related_tags,
    exclude_tag_id,
    order = 'id',
    ascending = 'false',
    closed = 'false',
    limit = 50,
    offset = 0,
  } = req.query;

  const params = new URLSearchParams({
    order: String(order),
    ascending: String(ascending),
    closed: String(closed),
    limit: String(limit),
    offset: String(offset),
  });

  if (tag_id) params.append('tag_id', String(tag_id));
  if (related_tags !== undefined) params.append('related_tags', String(related_tags));
  if (exclude_tag_id) params.append('exclude_tag_id', String(exclude_tag_id));

  const cacheKey = `events:${params.toString()}`;
  if (Number(offset) === 0) {
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
  }

  const url = `${GAMMA_API}/events/pagination?${params}`;
  const response = await fetchWithTimeout(url, 10000);
  if (!response.ok) {
    logger.error('Failed to fetch events from Gamma API', { status: response.status });
    throw new AppError(502, 'Failed to fetch events', 'UPSTREAM_ERROR');
  }

  const rawData = await response.json() as { data?: any[]; pagination?: any };
  const events = rawData.data || [];
  const pagination = rawData.pagination;

  const markets: any[] = [];
  for (const event of events) {
    for (const market of event.markets || []) {
      if (market.active && !market.closed) {
        markets.push(transformMarket(market, event));
      }
    }
  }

  const result = { events, markets, pagination };
  if (Number(offset) === 0) {
    await Cache.set(cacheKey, result, 120);
  }

  res.json(result);
}));

export default router;
