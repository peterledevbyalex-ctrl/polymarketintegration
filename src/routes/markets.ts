import { Router, Request, Response as ExpressResponse } from 'express';
import { config } from '../config';
import logger from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { Cache } from '../utils/cache';

const router = Router();
const CLOB_API = config.polymarket.clobApiUrl;
const GAMMA_API = 'https://gamma-api.polymarket.com';

// Request deduplication - prevent multiple simultaneous requests for same data
const pendingRequests = new Map<string, Promise<any>>();

// Helper to fetch with timeout
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

// Helper to transform market data to our format
function transformMarket(market: any, event?: any) {
  // Parse clobTokenIds if it's a JSON string
  let tokenIds: string[] = [];
  try {
    tokenIds = typeof market.clobTokenIds === 'string' 
      ? JSON.parse(market.clobTokenIds) 
      : market.clobTokenIds || [];
  } catch {}
  
  // Use slug as fallback ID (public-search doesn't return id/conditionId)
  const marketId = market.id || market.conditionId || market.slug;
  
  return {
    id: marketId,
    market_id: market.conditionId || market.slug, // For CLOB operations
    question: market.question,
    slug: market.slug,
    description: market.description,
    image: market.image || event?.image, // Fallback to event image
    icon: market.icon,
    outcomes: typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes,
    outcomePrices: typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices,
    volume: market.volume,
    volume24hr: market.volume24hr,
    liquidity: market.liquidity,
    endDate: market.endDate || event?.endDate,
    active: market.active,
    closed: market.closed,
    tradeable: market.active && !market.closed,
    tokens: tokenIds.length >= 2 ? [
      { outcome: 'YES', token_id: tokenIds[0] },
      { outcome: 'NO', token_id: tokenIds[1] },
    ] : [],
    // Event/category info
    eventTitle: event?.title || market.groupItemTitle,
    eventSlug: event?.slug,
    tags: market.tags || event?.tags || [],
  };
}

/**
 * @swagger
 * /api/markets:
 *   get:
 *     summary: Get tradeable markets with flexible filtering
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *           default: 0
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter by tag (politics, sports, crypto, entertainment, science, business, culture)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [volume, liquidity, newest, ending_soon, volume_24h]
 *           default: volume
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search markets by keyword
 *     responses:
 *       200:
 *         description: List of tradeable markets
 */
router.get('/', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { 
    limit = 50, 
    offset = 0,
    tag, 
    sort = 'volume',
    search,
  } = req.query;

  // Map sort options to Gamma API params
  const sortMapping: Record<string, { order: string; ascending: string }> = {
    volume: { order: 'volume', ascending: 'false' },
    liquidity: { order: 'liquidity', ascending: 'false' },
    newest: { order: 'startDate', ascending: 'false' },
    ending_soon: { order: 'endDate', ascending: 'true' },
    volume_24h: { order: 'volume24hr', ascending: 'false' },
  };

  const sortConfig = sortMapping[String(sort)] || sortMapping.volume;
  
  // Cache key (only cache non-search, first page results for common queries)
  const cacheKey = search 
    ? null // Don't cache search results
    : `markets:${tag || 'all'}:${sort}:${limit}:${offset}`;
  
  // Check cache for non-search queries (2 minute TTL for first page, 1 minute for others)
  if (cacheKey && Number(offset) === 0) {
    const cached = await Cache.get(cacheKey);
    if (cached) {
      logger.debug('Serving markets from cache', { cacheKey });
      res.json(cached);
      return;
    }
  }
  
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    active: 'true',
    archived: 'false',
    closed: 'false',
    order: sortConfig.order,
    ascending: sortConfig.ascending,
  });
  
  if (tag) {
    params.append('tag_id', String(tag));
  }

  // Use search endpoint if search query provided
  let markets: any[] = [];
  let pagination: any = null;

  if (search && String(search).length >= 2) {
    // Use Polymarket's optimized public-search endpoint (exact params they use)
    const searchParams = new URLSearchParams({
      q: String(search),
      optimized: 'true',
      limit_per_type: '20', // Match Polymarket's approach
      type: 'events',
      search_tags: 'true',
      search_profiles: 'true',
      cache: 'true',
    });
    searchParams.append('presets', 'EventsTitle');
    searchParams.append('presets', 'Events');
    
    const searchUrl = `${GAMMA_API}/public-search?${searchParams}`;
    logger.info('Search request', { url: searchUrl, query: search });
    
    const searchRes = await fetchWithTimeout(searchUrl, 10000);
    if (searchRes.ok) {
      const searchData = await searchRes.json() as { events?: any[]; hasMore?: boolean };
      
      logger.info('Search response', { 
        eventsCount: searchData.events?.length || 0,
        hasMore: searchData.hasMore,
      });
      
      // Extract markets from events
      let allMarkets: any[] = [];
      for (const event of searchData.events || []) {
        const eventMarkets = event.markets || [];
        logger.debug('Processing event', { 
          title: event.title, 
          marketsInEvent: eventMarkets.length,
        });
        
        for (const market of eventMarkets) {
          // Include markets that are active OR have prices (tradeable)
          const hasPrices = market.outcomePrices && market.outcomePrices.length > 0;
          if ((market.active || hasPrices) && !market.closed) {
            allMarkets.push(transformMarket(market, event));
          }
        }
      }
      
      logger.info('Markets extracted', { totalMarkets: allMarkets.length });
      
      // Dedupe by slug (unique identifier from public-search)
      const seen = new Set<string>();
      allMarkets = allMarkets.filter(m => {
        const id = m.slug || m.id || m.market_id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      
      logger.info('Markets after dedupe', { count: allMarkets.length });
      
      // Sort search results
      const sortKey = sort === 'volume_24h' ? 'volume24hr' : String(sort);
      allMarkets.sort((a: any, b: any) => {
        const aVal = a[sortKey] || 0;
        const bVal = b[sortKey] || 0;
        return sortConfig.ascending === 'true' ? aVal - bVal : bVal - aVal;
      });
      
      // Apply pagination
      const startIdx = Number(offset);
      const endIdx = startIdx + Number(limit);
      markets = allMarkets.slice(startIdx, endIdx);
      
      pagination = {
        total: allMarkets.length,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: endIdx < allMarkets.length || searchData.hasMore,
      };
    }
  } else if (search) {
    // Search query too short - return empty
    markets = [];
    pagination = { total: 0, limit: Number(limit), offset: 0, hasMore: false };
  } else {
    // Standard events pagination
    const response = await fetchWithTimeout(`${GAMMA_API}/events/pagination?${params}`, 10000);
    
    if (!response.ok) {
      logger.error('Failed to fetch from Gamma API', { status: response.status });
      throw new AppError(502, 'Failed to fetch markets', 'UPSTREAM_ERROR');
    }

    const rawData = await response.json() as { data?: any[]; pagination?: any };
    const events = rawData.data || [];
    pagination = rawData.pagination;
    
    for (const event of events) {
      if (event.markets) {
        for (const market of event.markets) {
          if (market.active && !market.closed) {
            markets.push(transformMarket(market, event));
          }
        }
      }
    }
  }
  
  logger.info('Returning markets', { 
    count: markets.length,
    sort,
    tag: tag || 'all',
    search: search || null,
  });
  
  const response = {
    markets,
    pagination,
  };
  
  // Cache non-search, first-page results (2 minutes for first page, 1 minute for others)
  if (cacheKey && Number(offset) === 0) {
    await Cache.set(cacheKey, response, 120); // 2 minutes
  } else if (cacheKey) {
    await Cache.set(cacheKey, response, 60); // 1 minute for paginated results
  }
  
  res.json(response);
}));

/**
 * @swagger
 * /api/markets/tags:
 *   get:
 *     summary: Get available market tags/categories from Polymarket
 *     tags: [Markets]
 *     responses:
 *       200:
 *         description: List of available tags
 */
router.get('/tags', asyncHandler(async (_req: Request, res: ExpressResponse) => {
  // Cache tags for 10 minutes (they don't change often)
  const cacheKey = 'markets:tags';
  const cached = await Cache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }
  
  const response = await fetchWithTimeout(`${GAMMA_API}/tags`, 8000);
  
  if (!response.ok) {
    throw new AppError(502, 'Failed to fetch tags', 'UPSTREAM_ERROR');
  }

  if (!response.ok) {
    logger.error('Failed to fetch tags from Gamma API', { status: response.status });
    throw new AppError(502, 'Failed to fetch tags', 'UPSTREAM_ERROR');
  }
  
  const tags = await response.json() as any[];
  
  // Cache tags for 10 minutes
  await Cache.set(cacheKey, { tags }, 600);
  
  // Return Polymarket's tags directly
  // Each tag has: { id, slug, label, ... }
  res.json({ tags });
}));

/**
 * @swagger
 * /api/markets/featured:
 *   get:
 *     summary: Get a diverse mix of featured markets across categories
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: perCategory
 *         schema:
 *           type: number
 *           default: 5
 *         description: Markets per category
 *       - in: query
 *         name: trendingLimit
 *         schema:
 *           type: number
 *           default: 20
 *         description: Number of trending markets to return
 *     responses:
 *       200:
 *         description: Featured markets grouped by category
 */
router.get('/featured', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { perCategory = 5, trendingLimit = 20 } = req.query;
  const trendingCount = Math.min(Number(trendingLimit) || 20, 100); // Cap at 100
  const cacheKey = `featured:${perCategory}:${trendingLimit}`;
  
  // Check cache first (5 minute TTL)
  const cached = await Cache.get(cacheKey);
  if (cached) {
    logger.debug('Serving featured markets from cache', { cacheKey });
    res.json(cached);
    return;
  }
  
  // Check for pending request (deduplication)
  if (pendingRequests.has(cacheKey)) {
    logger.debug('Deduplicating request, waiting for pending', { cacheKey });
    const result = await pendingRequests.get(cacheKey);
    res.json(result);
    return;
  }
  
  // Create the fetch promise
  const fetchPromise = (async () => {
    try {
      const categories = ['politics', 'sports', 'crypto', 'entertainment', 'science', 'business'];
      
      // Fetch from multiple categories in parallel with timeout
      const fetchPromises = categories.map(async (tag) => {
        const params = new URLSearchParams({
          limit: String(Number(perCategory) * 2),
          active: 'true',
          closed: 'false',
          tag_slug: tag,
          order: 'volume',
          ascending: 'false',
        });
        
        try {
          const res = await fetchWithTimeout(`${GAMMA_API}/events/pagination?${params}`, 8000);
          if (!res.ok) return { tag, markets: [] };
          
          const data = await res.json() as { data?: any[] };
          const markets: any[] = [];
          const seenEvents = new Set<string>();
          
          for (const event of data.data || []) {
            const eventSlug = event.slug || event.title;
            if (seenEvents.has(eventSlug)) continue;
            
            const activeMarkets = (event.markets || [])
              .filter((m: any) => m.active && !m.closed)
              .sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0));
            
            if (activeMarkets.length > 0) {
              markets.push(transformMarket(activeMarkets[0], event));
              seenEvents.add(eventSlug);
            }
            
            if (markets.length >= Number(perCategory)) break;
          }
          
          return { tag, markets };
        } catch (error) {
          logger.warn('Failed to fetch category markets', { tag, error: (error as Error).message });
          return { tag, markets: [] };
        }
      });

      const results = await Promise.allSettled(fetchPromises);
      
      // Process results (handle failures gracefully)
      const categoryResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }
        logger.warn('Category fetch failed', { category: categories[index], error: result.reason });
        return { tag: categories[index], markets: [] };
      });
      
      // Fetch trending with timeout
      let trending: any[] = [];
      const seenEventSlugs = new Set<string>();
      
      try {
        const trendingParams = new URLSearchParams({
          limit: String(trendingCount * 2),
          active: 'true',
          closed: 'false',
          order: 'volume24hr',
          ascending: 'false',
        });
        
        const trendingRes = await fetchWithTimeout(`${GAMMA_API}/events/pagination?${trendingParams}`, 8000);
        if (trendingRes.ok) {
          const trendingData = await trendingRes.json() as { data?: any[] };
          for (const event of trendingData.data || []) {
            const eventSlug = event.slug || event.title;
            if (seenEventSlugs.has(eventSlug)) continue;
            
            const activeMarkets = (event.markets || [])
              .filter((m: any) => m.active && !m.closed)
              .sort((a: any, b: any) => (b.volume24hr || 0) - (a.volume24hr || 0));
            
            if (activeMarkets.length > 0) {
              trending.push(transformMarket(activeMarkets[0], event));
              seenEventSlugs.add(eventSlug);
            }
            
            if (trending.length >= trendingCount) break;
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch trending markets', { error: (error as Error).message });
      }

      // Build response
      const byCategory: Record<string, any[]> = {};
      for (const { tag, markets } of categoryResults) {
        byCategory[tag] = markets;
      }
      
      const allMarkets: any[] = [];
      const maxLen = Math.max(...categoryResults.map(r => r.markets.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const { markets } of categoryResults) {
          if (markets[i]) {
            allMarkets.push(markets[i]);
          }
        }
      }

      const response = {
        trending,
        byCategory,
        markets: allMarkets,
      };
      
      // Cache the response (5 minutes)
      await Cache.set(cacheKey, response, 300);
      
      return response;
    } finally {
      // Remove from pending requests
      pendingRequests.delete(cacheKey);
    }
  })();
  
  // Store pending request
  pendingRequests.set(cacheKey, fetchPromise);
  
  const result = await fetchPromise;
  res.json(result);
}));

/**
 * @swagger
 * /api/markets/{marketId}:
 *   get:
 *     summary: Get market by ID (accepts condition_id or slug)
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Market condition_id (hex) or slug
 *     responses:
 *       200:
 *         description: Market details with CLOB-compatible market_id
 *       404:
 *         description: Market not found
 */
router.get('/:marketId', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { marketId } = req.params;

  // Check cache first (5 minute TTL for individual markets)
  const cacheKey = `market:${marketId}`;
  const cached = await Cache.get(cacheKey);
  if (cached) {
    logger.debug('Serving market from cache', { marketId });
    res.json(cached);
    return;
  }
  
  // Try CLOB first for condition_id, then Gamma for slug/id
  let market: any = null;
  
  // If it looks like a condition_id (starts with 0x), try CLOB
  if (marketId.startsWith('0x')) {
    try {
      const clobRes = await fetchWithTimeout(`${CLOB_API}/markets/${marketId}`, 8000);
      if (clobRes.ok) {
        market = await clobRes.json();
      }
    } catch (error) {
      logger.warn('CLOB fetch failed, trying Gamma', { marketId, error: (error as Error).message });
    }
  }
  
  // Fallback to Gamma API
  if (!market) {
    try {
      const gammaRes = await fetchWithTimeout(`${GAMMA_API}/markets/${marketId}`, 8000);
      if (gammaRes.ok) {
        market = await gammaRes.json();
      }
    } catch (error) {
      logger.warn('Gamma fetch failed', { marketId, error: (error as Error).message });
    }
  }
  
  if (!market) {
    throw new AppError(404, 'Market not found', 'NOT_FOUND');
  }

  // Ensure market_id is the condition_id for CLOB operations
  const response = {
    ...market,
    market_id: (market as any).condition_id || (market as any).conditionId || marketId,
    tradeable: (market as any).active === true && (market as any).closed === false,
  };
  
  // Cache the response (5 minutes)
  await Cache.set(cacheKey, response, 300);
  
  res.json(response);
}));

/**
 * @swagger
 * /api/markets/{marketId}/orderbook:
 *   get:
 *     summary: Get orderbook for a market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: outcome
 *         schema:
 *           type: string
 *           enum: [YES, NO]
 *     responses:
 *       200:
 *         description: Market orderbook with prices
 */
router.get('/:marketId/orderbook', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { marketId } = req.params;
  const { outcome } = req.query;

  // Cache orderbook for 30 seconds (prices change frequently)
  const cacheKey = `orderbook:${marketId}:${outcome || 'YES'}`;
  const cached = await Cache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  // First get market to find token IDs
  const marketRes = await fetchWithTimeout(`${CLOB_API}/markets/${marketId}`, 8000);
  if (!marketRes.ok) {
    throw new AppError(404, 'Market not found', 'NOT_FOUND');
  }
  const market: any = await marketRes.json();

  // Get orderbook for the token
  const tokenId = outcome === 'NO' ? market.tokens?.[1]?.token_id : market.tokens?.[0]?.token_id;
  
  if (!tokenId) {
    throw new AppError(400, 'Token ID not found for market', 'INVALID_MARKET');
  }

  const bookRes = await fetchWithTimeout(`${CLOB_API}/book?token_id=${tokenId}`, 8000);
  if (!bookRes.ok) {
    logger.error('Failed to fetch orderbook', { marketId, tokenId });
    throw new AppError(502, 'Failed to fetch orderbook', 'UPSTREAM_ERROR');
  }

  const orderbook: any = await bookRes.json();
  const response = {
    marketId,
    outcome: outcome || 'YES',
    tokenId,
    ...orderbook,
  };
  
  // Cache for 30 seconds
  await Cache.set(cacheKey, response, 30);
  
  res.json(response);
}));

/**
 * @swagger
 * /api/markets/{marketId}/price:
 *   get:
 *     summary: Get current price for a market outcome
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Current prices for YES and NO
 */
router.get('/:marketId/price', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { marketId } = req.params;

  const marketRes = await fetch(`${CLOB_API}/markets/${marketId}`);
  if (!marketRes.ok) {
    throw new AppError(404, 'Market not found', 'NOT_FOUND');
  }
  const market: any = await marketRes.json();

  // Extract prices from market data
  const yesToken = market.tokens?.[0];
  const noToken = market.tokens?.[1];

  res.json({
    marketId,
    question: market.question,
    yes: {
      tokenId: yesToken?.token_id,
      price: yesToken?.price || null,
    },
    no: {
      tokenId: noToken?.token_id,
      price: noToken?.price || null,
    },
    volume: market.volume,
    liquidity: market.liquidity,
  });
}));

/**
 * @swagger
 * /api/markets/{marketId}/history:
 *   get:
 *     summary: Get price history for charting
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Market condition_id (the long numeric token ID)
 *       - in: query
 *         name: fidelity
 *         schema:
 *           type: number
 *           default: 15
 *         description: Time resolution in minutes (1, 5, 15, 60, 1440)
 *       - in: query
 *         name: startTs
 *         schema:
 *           type: number
 *         description: Unix timestamp for start time (defaults to 24h ago)
 *       - in: query
 *         name: endTs
 *         schema:
 *           type: number
 *         description: Unix timestamp for end time (defaults to now)
 *     responses:
 *       200:
 *         description: Price history with timestamps
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 marketId:
 *                   type: string
 *                 fidelity:
 *                   type: number
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       t:
 *                         type: number
 *                         description: Unix timestamp
 *                       p:
 *                         type: number
 *                         description: Price (0-1)
 */
router.get('/:marketId/history', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { marketId } = req.params;
  const { 
    fidelity = 15, 
    startTs,
    endTs,
  } = req.query;

  // Default to last 24 hours if no startTs provided
  const now = Math.floor(Date.now() / 1000);
  const defaultStartTs = now - (24 * 60 * 60); // 24h ago
  
  const params = new URLSearchParams({
    market: marketId,
    fidelity: String(fidelity),
    startTs: String(startTs || defaultStartTs),
  });
  
  if (endTs) {
    params.append('endTs', String(endTs));
  }

  const response = await fetch(`${CLOB_API}/prices-history?${params}`);
  
  if (!response.ok) {
    logger.error('Failed to fetch price history', { 
      marketId, 
      status: response.status,
      statusText: response.statusText,
    });
    throw new AppError(502, 'Failed to fetch price history', 'UPSTREAM_ERROR');
  }

  const data = await response.json() as { history?: Array<{ t: number; p: number }> };
  
  res.json({
    marketId,
    fidelity: Number(fidelity),
    startTs: Number(startTs || defaultStartTs),
    endTs: endTs ? Number(endTs) : now,
    pointCount: data.history?.length || 0,
    history: data.history || [],
  });
}));

export default router;
