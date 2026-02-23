import { Router, Request, Response as ExpressResponse } from 'express';
import logger from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middleware/errorHandler';
import { Cache } from '../utils/cache';

const router = Router();
const CLOB_API = 'https://clob.polymarket.com';
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

/**
 * @swagger
 * /api/sports/metadata:
 *   get:
 *     summary: Get sports metadata (types, leagues, seasons)
 *     tags: [Sports]
 *     responses:
 *       200:
 *         description: Sports metadata
 */
router.get('/metadata', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const cacheKey = 'sports:metadata';
  const cached = await Cache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const response = await fetchWithTimeout(`${CLOB_API}/sports/metadata`);
    const data = await response.json();
    
    // Add our own sport categorization
    const enhancedData = {
      ...data,
      categories: {
        american: {
          label: 'American Sports',
          sports: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAA Football', 'NCAA Basketball']
        },
        international: {
          label: 'International',
          sports: ['Soccer', 'Tennis', 'Formula 1', 'Cricket', 'Rugby']
        },
        combat: {
          label: 'Combat Sports',
          sports: ['UFC', 'Boxing', 'MMA']
        },
        other: {
          label: 'Other Sports',
          sports: ['Golf', 'Olympics', 'Esports']
        }
      }
    };
    
    await Cache.set(cacheKey, enhancedData, 3600); // 1 hour cache
    res.json(enhancedData);
  } catch (error) {
    logger.error('Failed to fetch sports metadata:', error);
    
    // Fallback static data if API fails
    const fallbackData = {
      sports: ['NFL', 'NBA', 'MLB', 'Soccer', 'Tennis', 'UFC', 'Boxing'],
      categories: {
        american: {
          label: 'American Sports',
          sports: ['NFL', 'NBA', 'MLB', 'NHL']
        },
        international: {
          label: 'International',
          sports: ['Soccer', 'Tennis', 'Formula 1']
        },
        combat: {
          label: 'Combat Sports',
          sports: ['UFC', 'Boxing', 'MMA']
        }
      },
      leagues: {
        'NFL': { name: 'National Football League', season: '2024-25' },
        'NBA': { name: 'National Basketball Association', season: '2024-25' },
        'Premier League': { name: 'English Premier League', season: '2024-25' }
      }
    };
    
    await Cache.set(cacheKey, fallbackData, 300); // 5 min cache for fallback
    res.json(fallbackData);
  }
}));

/**
 * @swagger
 * /api/sports/teams:
 *   get:
 *     summary: Get teams for a specific sport/league
 *     tags: [Sports]
 *     parameters:
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *         description: Sport type (NFL, NBA, etc.)
 *       - in: query
 *         name: league
 *         schema:
 *           type: string
 *         description: League name
 *     responses:
 *       200:
 *         description: List of teams
 */
router.get('/teams', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { sport, league } = req.query;
  const cacheKey = `sports:teams:${sport}:${league}`;
  
  const cached = await Cache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const params = new URLSearchParams();
    if (sport) params.append('sport', String(sport));
    if (league) params.append('league', String(league));
    
    const response = await fetchWithTimeout(`${CLOB_API}/sports/teams?${params}`);
    const data = await response.json();
    
    await Cache.set(cacheKey, data, 3600); // 1 hour cache
    res.json(data);
  } catch (error) {
    logger.error('Failed to fetch sports teams:', error);
    
    // Fallback team data
    const fallbackTeams = {
      NFL: [
        { id: 'chiefs', name: 'Kansas City Chiefs', city: 'Kansas City', conference: 'AFC' },
        { id: 'eagles', name: 'Philadelphia Eagles', city: 'Philadelphia', conference: 'NFC' },
        { id: 'bills', name: 'Buffalo Bills', city: 'Buffalo', conference: 'AFC' },
        { id: 'cowboys', name: 'Dallas Cowboys', city: 'Dallas', conference: 'NFC' }
      ],
      NBA: [
        { id: 'lakers', name: 'Los Angeles Lakers', city: 'Los Angeles', conference: 'Western' },
        { id: 'celtics', name: 'Boston Celtics', city: 'Boston', conference: 'Eastern' },
        { id: 'warriors', name: 'Golden State Warriors', city: 'San Francisco', conference: 'Western' },
        { id: 'heat', name: 'Miami Heat', city: 'Miami', conference: 'Eastern' }
      ]
    };
    
    const teams = fallbackTeams[String(sport) as keyof typeof fallbackTeams] || [];
    await Cache.set(cacheKey, { teams }, 300);
    res.json({ teams });
  }
}));

/**
 * @swagger
 * /api/sports/markets:
 *   get:
 *     summary: Get sports-specific prediction markets
 *     tags: [Sports]
 *     parameters:
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *         description: Sport type
 *       - in: query
 *         name: league
 *         schema:
 *           type: string  
 *         description: League name
 *       - in: query
 *         name: team
 *         schema:
 *           type: string
 *         description: Team ID or name
 *       - in: query
 *         name: market_type
 *         schema:
 *           type: string
 *           enum: [winner, spread, total, player_props]
 *         description: Type of sports bet
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *           default: 0
 *     responses:
 *       200:
 *         description: Sports prediction markets
 */
router.get('/markets', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { sport, league, team, market_type, limit = 20, offset = 0 } = req.query;
  
  // Build cache key
  const cacheKey = `sports:markets:${sport}:${league}:${team}:${market_type}:${limit}:${offset}`;
  
  if (Number(offset) === 0) {
    const cached = await Cache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
  }

  try {
    // Query regular markets API with sports tag + additional filters
    const params = new URLSearchParams({
      tag: 'sports',
      limit: String(limit),
      offset: String(offset),
      active: 'true',
      sort: 'volume_24h'
    });
    
    // Add sport-specific filters to search
    let searchTerms: string[] = [];
    if (sport) searchTerms.push(String(sport));
    if (league) searchTerms.push(String(league));  
    if (team) searchTerms.push(String(team));
    
    if (searchTerms.length > 0) {
      params.append('search', searchTerms.join(' '));
    }
    
    const response = await fetchWithTimeout(`${GAMMA_API}/events/pagination?${params}`);
    const data = await response.json();
    
    // Transform and filter sports markets
    const events = data.data || [];
    const sportsMarkets: any[] = [];
    
    for (const event of events) {
      for (const market of event.markets || []) {
        if (market.active && !market.closed) {
          // Add sports-specific metadata
          const enhancedMarket = {
            ...market,
            id: market.conditionId || market.id,
            conditionId: market.conditionId,
            sport: sport || 'Unknown',
            league: league || null,
            team: team || null,
            market_type: market_type || 'winner',
            eventTitle: event.title,
            eventSlug: event.slug,
            eventStartTime: event.startTime,
            isLive: event.isLive || false,
            // Sports-specific fields
            homeTeam: null, // TODO: Parse from event title
            awayTeam: null, // TODO: Parse from event title  
            spread: null,   // TODO: Parse spread from question
            total: null,    // TODO: Parse total from question
          };
          
          sportsMarkets.push(enhancedMarket);
        }
      }
    }
    
    const result = {
      markets: sportsMarkets,
      pagination: data.pagination,
      filters: {
        sport,
        league, 
        team,
        market_type
      }
    };
    
    if (Number(offset) === 0) {
      await Cache.set(cacheKey, result, 120); // 2 min cache
    }
    
    res.json(result);
  } catch (error) {
    logger.error('Failed to fetch sports markets:', error);
    throw new AppError(502, 'Failed to fetch sports markets', 'UPSTREAM_ERROR');
  }
}));

/**
 * @swagger
 * /api/sports/live-scores:
 *   get:
 *     summary: Get live sports scores (if available)
 *     tags: [Sports]
 *     parameters:
 *       - in: query
 *         name: sport
 *         schema:
 *           type: string
 *         description: Sport type
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *         description: Date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Live scores
 */
router.get('/live-scores', asyncHandler(async (req: Request, res: ExpressResponse) => {
  const { sport, date } = req.query;
  const cacheKey = `sports:live-scores:${sport}:${date}`;
  
  const cached = await Cache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    // Try to get live scores from Polymarket's sports WebSocket data
    // This is a placeholder - would need actual sports data provider
    const mockScores = {
      games: [
        {
          id: 'game1',
          sport: sport || 'NFL',
          homeTeam: 'Chiefs',
          awayTeam: 'Bills', 
          homeScore: 21,
          awayScore: 14,
          quarter: '3rd',
          timeRemaining: '8:45',
          isLive: true
        }
      ],
      lastUpdated: new Date().toISOString()
    };
    
    await Cache.set(cacheKey, mockScores, 30); // 30 second cache for live data
    res.json(mockScores);
  } catch (error) {
    logger.error('Failed to fetch live scores:', error);
    res.json({ games: [], lastUpdated: new Date().toISOString() });
  }
}));

export default router;