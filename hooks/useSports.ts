import { useState, useEffect, useCallback } from 'react';

interface SportsMetadata {
  categories: {
    [key: string]: {
      label: string;
      sports: string[];
    };
  };
  leagues: {
    [key: string]: {
      name: string;
      season: string;
    };
  };
  sports: string[];
}

interface Team {
  id: string;
  name: string;
  city: string;
  conference?: string;
}

interface SportsMarket {
  id: string;
  conditionId: string;
  question: string;
  sport: string;
  league?: string;
  team?: string;
  market_type: 'winner' | 'spread' | 'total' | 'player_props';
  homeTeam?: string;
  awayTeam?: string;
  spread?: number;
  total?: number;
  eventTitle: string;
  eventStartTime?: string;
  isLive: boolean;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  active: boolean;
}

interface LiveScore {
  id: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  quarter?: string;
  timeRemaining?: string;
  isLive: boolean;
}

// Sports metadata hook
export const useSportsMetadata = () => {
  const [metadata, setMetadata] = useState<SportsMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchMetadata = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/sports/metadata');
      if (!response.ok) {
        throw new Error(`Failed to fetch sports metadata: ${response.statusText}`);
      }
      
      const data = await response.json();
      setMetadata(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch sports metadata');
      setError(error);
      console.error('Failed to fetch sports metadata:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  return {
    metadata,
    isLoading,
    error,
    refetch: fetchMetadata,
  };
};

// Sports teams hook
export const useSportsTeams = (sport?: string, league?: string) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTeams = useCallback(async () => {
    if (!sport) {
      setTeams([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('sport', sport);
      if (league) params.append('league', league);
      
      const response = await fetch(`/api/sports/teams?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch teams: ${response.statusText}`);
      }
      
      const data = await response.json();
      setTeams(data.teams || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch teams');
      setError(error);
      console.error('Failed to fetch sports teams:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sport, league]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return {
    teams,
    isLoading,
    error,
    refetch: fetchTeams,
  };
};

// Sports markets hook  
export const useSportsMarkets = (params?: {
  sport?: string;
  league?: string;
  team?: string;
  market_type?: 'winner' | 'spread' | 'total' | 'player_props';
  limit?: number;
  offset?: number;
  autoFetch?: boolean;
}) => {
  const [markets, setMarkets] = useState<SportsMarket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPagination] = useState<{
    total?: number;
    hasMore?: boolean;
    offset: number;
    limit: number;
  }>({ offset: 0, limit: 20 });

  const fetchMarkets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const queryParams = new URLSearchParams();
      if (params?.sport) queryParams.append('sport', params.sport);
      if (params?.league) queryParams.append('league', params.league);
      if (params?.team) queryParams.append('team', params.team);
      if (params?.market_type) queryParams.append('market_type', params.market_type);
      queryParams.append('limit', String(params?.limit || 20));
      queryParams.append('offset', String(params?.offset || 0));
      
      const response = await fetch(`/api/sports/markets?${queryParams}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch sports markets: ${response.statusText}`);
      }
      
      const data = await response.json();
      setMarkets(data.markets || []);
      setPagination(data.pagination || { offset: 0, limit: 20 });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch sports markets');
      setError(error);
      console.error('Failed to fetch sports markets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [params?.sport, params?.league, params?.team, params?.market_type, params?.limit, params?.offset]);

  useEffect(() => {
    if (params?.autoFetch !== false) {
      fetchMarkets();
    }
  }, [fetchMarkets, params?.autoFetch]);

  return {
    markets,
    isLoading,
    error,
    pagination,
    refetch: fetchMarkets,
  };
};

// Live scores hook
export const useLiveScores = (sport?: string, autoFetch: boolean = true) => {
  const [scores, setScores] = useState<LiveScore[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchScores = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (sport) params.append('sport', sport);
      params.append('date', new Date().toISOString().split('T')[0]);
      
      const response = await fetch(`/api/sports/live-scores?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch live scores: ${response.statusText}`);
      }
      
      const data = await response.json();
      setScores(data.games || []);
      setLastUpdated(data.lastUpdated);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch live scores');
      setError(error);
      console.error('Failed to fetch live scores:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    if (!autoFetch) return;

    fetchScores();
    
    // Refresh scores every 30 seconds for live games
    const interval = setInterval(fetchScores, 30000);
    
    return () => clearInterval(interval);
  }, [fetchScores, autoFetch]);

  return {
    scores,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchScores,
  };
};

// Sports categories helper
export const SPORTS_CATEGORIES = {
  american: {
    label: 'American Sports',
    sports: ['NFL', 'NBA', 'MLB', 'NHL', 'NCAA Football', 'NCAA Basketball'],
    icon: '🏈'
  },
  international: {
    label: 'International',
    sports: ['Soccer', 'Tennis', 'Formula 1', 'Cricket', 'Rugby'],
    icon: '⚽'
  },
  combat: {
    label: 'Combat Sports', 
    sports: ['UFC', 'Boxing', 'MMA'],
    icon: '🥊'
  },
  other: {
    label: 'Other Sports',
    sports: ['Golf', 'Olympics', 'Esports'],
    icon: '🏅'
  }
} as const;

export type SportsCategory = keyof typeof SPORTS_CATEGORIES;