"use client"

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarketCard } from './MarketCard';
import { EventMarketCard } from './EventMarketCard';
import { MarketCardSkeleton } from './MarketCardSkeleton';
import { MarketDetail } from './MarketDetail';
import { FilterBar } from './FilterBar';
import { BackgroundMask } from '@/components/BackgroundMask';
import { useFeaturedMarkets } from '@/hooks/useFeaturedMarkets';
import { useFavorites } from '@/hooks/useFavorites';
import { useTags } from '@/hooks/useTags';
import { useApp } from '@/providers/AppProvider';
import { Market } from '@/types/polymarket.types';
import { polymarketAPI } from '@/lib/polymarket/api';
import { Flame } from 'lucide-react';

export const PolymarketPageContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userAddress } = useApp();
  const { trending, markets, isLoading: featuredLoading, isLoadingTrending, error: featuredError } = useFeaturedMarkets({
    trendingLimit: 40,
    perCategory: 6,
  });
  const { favorites, favoriteIds, isFavorite, toggleFavorite } = useFavorites(userAddress);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedMarketOutcome, setSelectedMarketOutcome] = useState<'YES' | 'NO' | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('volume_24h');
  const [frequency, setFrequency] = useState<string>('all');
  const [status, setStatus] = useState<string>('active');
  const [expandedMarketId, setExpandedMarketId] = useState<string | null>(null);
  const [expandedOutcome, setExpandedOutcome] = useState<'YES' | 'NO' | null>(null);
  const { tags } = useTags();
  const [cryptoFrequency, setCryptoFrequency] = useState<string>('all');
  const [cryptoAsset, setCryptoAsset] = useState<string>('all');
  
  // Full category/search data when filtering
  const [categoryMarkets, setCategoryMarkets] = useState<Market[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [categorySections, setCategorySections] = useState<Record<string, Market[]>>({});
  const MARKETS_PER_PAGE = 20;
  const MARKETS_PER_SECTION = 6;
  const LANDING_PAGE_SIZE = 40;
  const hasHydratedFromUrl = useRef(false);
  
  // Favorites data
  const [favoriteMarkets, setFavoriteMarkets] = useState<Market[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [landingExtraMarkets, setLandingExtraMarkets] = useState<Market[]>([]);
  const [landingOffset, setLandingOffset] = useState(0);
  const [landingHasMore, setLandingHasMore] = useState(true);
  const [landingLoadingMore, setLandingLoadingMore] = useState(false);
  const [landingVisibleCount, setLandingVisibleCount] = useState(40);
  const ignoreMarketHydrationRef = useRef<string | null>(null);
  
  // Debounce search - wait 500ms and require at least 2 chars
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only search with 2+ characters
      setDebouncedSearch(searchQuery.length >= 2 ? searchQuery : '');
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (hasHydratedFromUrl.current) return;

    const categoryParam = searchParams.get('category') || 'all';
    const searchParam = searchParams.get('search') || '';
    const sortParam = searchParams.get('sort') || 'volume_24h';
    const frequencyParam = searchParams.get('frequency') || 'all';
    const statusParam = searchParams.get('status') || 'active';
    const cryptoFrequencyParam = searchParams.get('cryptoFrequency') || 'all';
    const cryptoAssetParam = searchParams.get('cryptoAsset') || 'all';

    setSelectedCategory(categoryParam);
    setSearchQuery(searchParam);
    setSortBy(sortParam);
    setFrequency(frequencyParam);
    setStatus(statusParam);
    setCryptoFrequency(cryptoFrequencyParam);
    setCryptoAsset(cryptoAssetParam);

    hasHydratedFromUrl.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!hasHydratedFromUrl.current) return;

    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (searchQuery) params.set('search', searchQuery);
    if (sortBy !== 'volume_24h') params.set('sort', sortBy);
    if (frequency !== 'all') params.set('frequency', frequency);
    if (status !== 'active') params.set('status', status);
    if (cryptoFrequency !== 'all') params.set('cryptoFrequency', cryptoFrequency);
    if (cryptoAsset !== 'all') params.set('cryptoAsset', cryptoAsset);
    const selectedMarketId =
      selectedMarket?.conditionId ||
      selectedMarket?.condition_id ||
      selectedMarket?.market_id ||
      selectedMarket?.id;
    if (selectedMarketId) params.set('market', selectedMarketId);

    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      const nextUrl = `/predict${nextQuery ? `?${nextQuery}` : ''}`;
      router.replace(nextUrl);
    }
  }, [selectedCategory, searchQuery, sortBy, frequency, status, cryptoFrequency, cryptoAsset, selectedMarket, router, searchParams]);
  
  // Fetch favorites markets when favorites selected
  useEffect(() => {
    if (selectedCategory !== 'favorites' || favorites.length === 0) {
      setFavoriteMarkets([]);
      return;
    }
    
    setFavoritesLoading(true);
    const marketIds = favorites.map(f => f.market_id);
    
    // Fetch all favorite markets
    Promise.all(
      marketIds.map(id => polymarketAPI.getMarket(id).catch(() => null))
    )
      .then(results => {
        const validMarkets = results.filter((m): m is Market => m !== null);
        setFavoriteMarkets(validMarkets);
      })
      .catch(err => console.error('Failed to fetch favorite markets:', err))
      .finally(() => setFavoritesLoading(false));
  }, [selectedCategory, favorites]);
  
  const normalizeLabel = (label: string) =>
    label.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const findTag = (category: string) => {
    const normalizedCategory = normalizeLabel(category);
    if (!normalizedCategory) return undefined;

    const categoryCandidates: Record<string, string[]> = {
      all: ['all'],
      trending: ['trending'],
      politics: ['politics', 'politic', 'election', 'government'],
      sports: ['sports', 'sport'],
      crypto: ['crypto', 'cryptocurrency', 'bitcoin', 'ethereum'],
      business: ['business', 'finance', 'economy', 'economics', 'markets'],
      entertainment: ['entertainment', 'culture', 'popculture', 'celebrity', 'media'],
      science: ['science', 'tech', 'technology', 'climate'],
    };
    const candidates = categoryCandidates[normalizedCategory] || [normalizedCategory];

    const exact = tags.find((tag) => {
      const normalizedSlug = normalizeLabel(tag.slug || '');
      const normalizedTagLabel = normalizeLabel(tag.label || '');
      return (
        candidates.includes(normalizedSlug) ||
        candidates.includes(normalizedTagLabel) ||
        candidates.some((candidate) => normalizedSlug === candidate || normalizedTagLabel === candidate)
      );
    });
    if (exact) return exact;
    return tags.find((tag) => {
      const normalizedSlug = normalizeLabel(tag.slug || '');
      const normalizedTagLabel = normalizeLabel(tag.label || '');
      return candidates.some(
        (candidate) =>
          normalizedSlug.includes(candidate) ||
          normalizedTagLabel.includes(candidate) ||
          candidate.includes(normalizedSlug) ||
          candidate.includes(normalizedTagLabel)
      );
    });
  };

  const getTagSlug = (category: string) => findTag(category)?.slug;
  const getTagId = (category: string) => findTag(category)?.id;

  const cryptoFrequencyTag =
    cryptoFrequency === 'all' ? undefined : getTagSlug(cryptoFrequency);
  const cryptoAssetTag =
    cryptoAsset === 'all' ? undefined : getTagSlug(cryptoAsset);
  const cryptoTag = cryptoFrequencyTag || cryptoAssetTag || getTagSlug('Crypto') || 'crypto';
  const cryptoBucketMap: Record<string, string> = {
    '5 min': '5M',
    '15 min': '15M',
    hourly: '1H',
    '4 hour': '4H',
    daily: '1D',
    weekly: '1W',
    monthly: '1M',
  };
  const cryptoBucket = cryptoFrequency === 'all' ? undefined : cryptoBucketMap[cryptoFrequency];
  const categoryTagId = selectedCategory !== 'all' && selectedCategory !== 'trending'
    ? getTagId(selectedCategory)
    : undefined;
  const topLevelCategoryFilters = new Set([
    'politics',
    'sports',
    'crypto',
    'business',
    'entertainment',
    'science',
  ]);
  const useCategoryOnlyQuery = topLevelCategoryFilters.has(selectedCategory);
  const sortMapping: Record<string, { order: string; ascending: boolean }> = {
    volume: { order: 'volume', ascending: false },
    liquidity: { order: 'liquidity', ascending: false },
    newest: { order: 'startDate', ascending: false },
    ending_soon: { order: 'endDate', ascending: true },
    volume_24h: { order: 'volume24hr', ascending: false },
  };
  const sortConfig = sortMapping[sortBy] || sortMapping.volume;

  // Fetch category OR search results
  useEffect(() => {
    // Reset pagination when filters change
    setOffset(0);
    setCategoryMarkets([]);
    setHasMore(true);
    
    // Homepage view - use featured data, or favorites view
    if ((selectedCategory === 'all' || selectedCategory === 'trending' || selectedCategory === 'favorites') && !debouncedSearch) {
      return;
    }

    // Never fall back to broad market feed when a specific non-standard category tag is unresolved.
    if (
      !debouncedSearch &&
      selectedCategory !== 'all' &&
      selectedCategory !== 'trending' &&
      selectedCategory !== 'favorites' &&
      selectedCategory !== 'crypto' &&
      !useCategoryOnlyQuery &&
      !categoryTagId
    ) {
      setCategoryMarkets([]);
      setHasMore(false);
      setCategoryLoading(false);
      return;
    }
    
    setCategoryLoading(true);
    
    const params: any = {
      limit: MARKETS_PER_PAGE,
      offset: 0,
      sort: sortBy as any,
    };
    
    // Search takes priority - searches ALL of Polymarket
    if (debouncedSearch) {
      params.search = debouncedSearch;
    } else if (selectedCategory !== 'all' && selectedCategory !== 'trending' && selectedCategory !== 'favorites') {
      params.tag = selectedCategory === 'crypto' ? cryptoTag : selectedCategory;
    }
    
    const request = selectedCategory === 'crypto' && !debouncedSearch
      ? polymarketAPI.getCryptoMarkets({
          limit: MARKETS_PER_PAGE,
          offset: 0,
          sort: sortBy as any,
          status: status as 'active' | 'closed',
          bucket: cryptoBucket,
        })
      : selectedCategory !== 'all' && selectedCategory !== 'trending' && selectedCategory !== 'favorites' && !debouncedSearch
        ? polymarketAPI.getEvents({
            tagId: useCategoryOnlyQuery ? undefined : categoryTagId,
            relatedTags: false,
            category: selectedCategory,
            order: sortConfig.order,
            ascending: sortConfig.ascending,
            closed: status !== 'active',
            limit: MARKETS_PER_PAGE,
            offset: 0,
          })
        : polymarketAPI.getMarkets(params);

    request
      .then(res => {
        const marketsList = res.markets || [];
        const filteredMarkets = cryptoAssetTag
          ? marketsList.filter((market) => market.tags?.includes(cryptoAssetTag))
          : marketsList;
        setCategoryMarkets(filteredMarkets);
        setHasMore(marketsList.length === MARKETS_PER_PAGE);
      })
      .catch(err => console.error('Failed to fetch markets:', err))
      .finally(() => setCategoryLoading(false));
  }, [selectedCategory, sortBy, status, debouncedSearch, cryptoTag, cryptoBucket, cryptoAssetTag, categoryTagId, useCategoryOnlyQuery, sortConfig.order, sortConfig.ascending]);

  useEffect(() => {
    const isSectionedCategory =
      selectedCategory !== 'all' &&
      selectedCategory !== 'trending' &&
      selectedCategory !== 'favorites' &&
      selectedCategory !== 'crypto' &&
      !useCategoryOnlyQuery &&
      !debouncedSearch;

    if (!isSectionedCategory || !categoryTagId) {
      setCategorySections({});
      return;
    }

    let isMounted = true;
    const sectionConfigs = [
      { key: 'Top Volume', order: 'volume', ascending: false },
      { key: 'Newest', order: 'startDate', ascending: false },
      { key: 'Ending Soon', order: 'endDate', ascending: true },
    ];

    Promise.all(
      sectionConfigs.map(({ key, order, ascending }) =>
        polymarketAPI.getEvents({
          tagId: categoryTagId,
          relatedTags: true,
          order,
          ascending,
          closed: status !== 'active',
          limit: MARKETS_PER_SECTION,
          offset: 0,
        })
          .then((res) => ({ key, markets: res.markets || [] }))
          .catch(() => ({ key, markets: [] }))
      )
    ).then((sections) => {
      if (!isMounted) return;
      const nextSections: Record<string, Market[]> = {};
      sections.forEach(({ key, markets }) => {
        nextSections[key] = markets;
      });
      setCategorySections(nextSections);
    });

    return () => {
      isMounted = false;
    };
  }, [selectedCategory, debouncedSearch, categoryTagId, status, useCategoryOnlyQuery]);
  
  // Load more function for pagination
  const loadMore = async () => {
    if (categoryLoading || !hasMore) return;
    
    setCategoryLoading(true);
    const newOffset = offset + MARKETS_PER_PAGE;
    
    const params: any = {
      limit: MARKETS_PER_PAGE,
      offset: newOffset,
      sort: sortBy as any,
    };

    if (
      !debouncedSearch &&
      selectedCategory !== 'all' &&
      selectedCategory !== 'trending' &&
      selectedCategory !== 'favorites' &&
      selectedCategory !== 'crypto' &&
      !useCategoryOnlyQuery &&
      !categoryTagId
    ) {
      setHasMore(false);
      setCategoryLoading(false);
      return;
    }
    
    if (debouncedSearch) {
      params.search = debouncedSearch;
    } else if (selectedCategory !== 'all' && selectedCategory !== 'trending') {
      params.tag = selectedCategory === 'crypto' ? cryptoTag : selectedCategory;
    }

    try {
      const res = selectedCategory === 'crypto' && !debouncedSearch
        ? await polymarketAPI.getCryptoMarkets({
            limit: MARKETS_PER_PAGE,
            offset: newOffset,
            sort: sortBy as any,
            status: status as 'active' | 'closed',
            bucket: cryptoBucket,
          })
        : selectedCategory !== 'all' && selectedCategory !== 'trending' && selectedCategory !== 'favorites' && !debouncedSearch
          ? await polymarketAPI.getEvents({
              tagId: useCategoryOnlyQuery ? undefined : categoryTagId,
              relatedTags: false,
              category: selectedCategory,
              order: sortConfig.order,
              ascending: sortConfig.ascending,
              closed: status !== 'active',
              limit: MARKETS_PER_PAGE,
              offset: newOffset,
            })
          : await polymarketAPI.getMarkets(params);
      const marketsList = res.markets || [];
      const filteredMarkets = cryptoAssetTag
        ? marketsList.filter((market) => market.tags?.includes(cryptoAssetTag))
        : marketsList;
      setCategoryMarkets(prev => [...prev, ...filteredMarkets]);
      setOffset(newOffset);
      setHasMore(marketsList.length === MARKETS_PER_PAGE);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setCategoryLoading(false);
    }
  };

  const loadMoreLandingMarkets = async () => {
    if (landingLoadingMore || !landingHasMore) return;

    setLandingLoadingMore(true);
    try {
      const res = await polymarketAPI.getMarkets({
        limit: LANDING_PAGE_SIZE,
        offset: landingOffset,
        sort: 'volume_24h',
        active: status === 'active',
      });

      const nextBatch = res.markets || [];
      const seen = new Set(
        [...trending, ...markets, ...landingExtraMarkets].map(
          (market) => market.conditionId || market.condition_id || market.market_id || market.id || market.slug
        )
      );

      const deduped = nextBatch.filter((market) => {
        const id = market.conditionId || market.condition_id || market.market_id || market.id || market.slug;
        return !!id && !seen.has(id);
      });

      setLandingExtraMarkets((prev) => [...prev, ...deduped]);
      setLandingOffset((prev) => prev + LANDING_PAGE_SIZE);
      setLandingHasMore(nextBatch.length === LANDING_PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more landing markets:', err);
    } finally {
      setLandingLoadingMore(false);
    }
  };
  
  const isLoading = (selectedCategory === 'all' || selectedCategory === 'trending') && !debouncedSearch
    ? featuredLoading 
    : categoryLoading;
  const error = featuredError;

  useEffect(() => {
    const marketId = searchParams.get('market');
    if (!marketId) {
      ignoreMarketHydrationRef.current = null;
      return;
    }

    if (ignoreMarketHydrationRef.current === marketId) {
      return;
    }

    if (marketId && !selectedMarket) {
      // Search in all loaded markets including search results
      const allMarkets = [...trending, ...markets, ...categoryMarkets];
      const market = allMarkets.find(m => 
        m.id === marketId || 
        m.market_id === marketId || 
        m.conditionId === marketId || 
        m.condition_id === marketId ||
        m.slug === marketId // Also check slug for search results
      );
      
      if (market) {
        setSelectedMarket(market);
      } else {
        // Fetch from API if not in local data (e.g., direct link)
        polymarketAPI.getMarket(marketId)
          .then(fetchedMarket => {
            if (fetchedMarket) {
              setSelectedMarket(fetchedMarket as Market);
            }
          })
          .catch(err => console.error('Failed to fetch market:', err));
      }
    }
  }, [searchParams, trending, markets, categoryMarkets, selectedMarket]);

  const displayMarkets = useMemo(() => {
    // If searching, use search results from API
    if (debouncedSearch) return categoryMarkets;
    // If filtering by category, use full category data
    if (selectedCategory !== 'all' && selectedCategory !== 'trending') {
      return categoryMarkets;
    }
    // Homepage views
    if (selectedCategory === 'all') return [...trending, ...markets];
    if (selectedCategory === 'trending') return [...trending, ...markets, ...landingExtraMarkets];
    return [];
  }, [trending, markets, selectedCategory, categoryMarkets, debouncedSearch, landingExtraMarkets]);

  // No more client-side filtering needed - search is server-side now
  const filteredMarkets = displayMarkets;

  const handleOutcomeSelect = (marketId: string, outcome: 'YES' | 'NO') => {
    setExpandedMarketId(marketId);
    setExpandedOutcome(outcome);
  };

  const findMarketById = (marketId: string, allMarkets: Market[]) =>
    allMarkets.find(m =>
      m.id === marketId ||
      m.market_id === marketId ||
      m.conditionId === marketId ||
      m.condition_id === marketId ||
      m.slug === marketId
    );

  const handleCollapse = (marketId: string) => {
    if (expandedMarketId === marketId) {
      setExpandedMarketId(null);
      setExpandedOutcome(null);
    }
  };

  const buildEventGroups = (marketsList: Market[]) => {
    const grouped = new Map<
      string,
      { title: string; image?: string; markets: Market[]; category?: string; volume?: string | number }
    >();
    marketsList.forEach((market) => {
      const key = market.eventSlug || market.eventTitle || market.id;
      if (!key) return;
      const existing = grouped.get(key);
      if (existing) {
        existing.markets.push(market);
        existing.volume = existing.volume || market.volume24hr || market.volume;
      } else {
        grouped.set(key, {
          title: market.eventTitle || market.question,
          image: market.image,
          markets: [market],
          category: market.eventTitle || 'Markets',
          volume: market.volume24hr || market.volume,
        });
      }
    });
    return Array.from(grouped.values());
  };

  const getOutcomeLabels = (market: Market): { yesLabel: string; noLabel: string } => {
    let parsedOutcomes: string[] = [];
    if (Array.isArray(market.outcomes)) {
      parsedOutcomes = market.outcomes.map((value) => String(value).trim()).filter(Boolean);
    } else if (typeof market.outcomes === 'string') {
      try {
        const fromJson = JSON.parse(market.outcomes);
        if (Array.isArray(fromJson)) {
          parsedOutcomes = fromJson.map((value) => String(value).trim()).filter(Boolean);
        }
      } catch {
        parsedOutcomes = market.outcomes
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
      }
    }

    return {
      yesLabel: parsedOutcomes[0] || 'Yes',
      noLabel: parsedOutcomes[1] || 'No',
    };
  };

  const renderMarketGrid = (
    marketsList: Market[],
    columns: string,
    maxItems?: number,
    groupByEvent: boolean = true
  ) => {
    const groups = groupByEvent
      ? buildEventGroups(marketsList)
      : marketsList.map((market) => ({
          title: market.question,
          image: market.image,
          markets: [market],
          category: market.eventTitle || 'Markets',
          volume: market.volume24hr || market.volume,
        }));
    const visibleGroups = maxItems ? groups.slice(0, maxItems) : groups;
    return (
      <div className={`grid grid-cols-1 ${columns} gap-4`}>
        {visibleGroups.map((group) => {
          const uniqueMarkets = group.markets.filter((market, index, arr) => {
            const id = market.conditionId || market.condition_id || market.market_id || market.id || market.slug;
            if (!id) return false;
            return arr.findIndex((m) => (m.conditionId || m.condition_id || m.market_id || m.id || m.slug) === id) === index;
          });

          const uniqueGroupOptionLabels = new Set(
            uniqueMarkets
              .map((market) => (market.groupItemTitle || '').trim())
              .filter(Boolean)
          );

          // Only render grouped event cards when backend provides explicit grouped option labels.
          const shouldRenderGroupedCard = uniqueMarkets.length > 1 && uniqueGroupOptionLabels.size > 1;

          if (shouldRenderGroupedCard) {
            return (
              <EventMarketCard
                key={group.title}
                title={group.title}
                image={group.image}
                category={group.category}
                categoryColor="#85a9ff"
                volume={group.volume}
                recurrence={group.markets[0]?.recurrence}
                eventStartTime={group.markets[0]?.eventStartTime || group.markets[0]?.startTime}
                endDate={group.markets[0]?.endDateIso || group.markets[0]?.endDate}
                isLive={group.markets[0]?.isLive}
                isFavorite={group.markets.some((market) => {
                  const conditionId = market.conditionId || market.condition_id || market.market_id || '';
                  return conditionId ? isFavorite(conditionId) : false;
                })}
                onToggleFavorite={() => {
                  const firstConditionId =
                    group.markets[0]?.conditionId ||
                    group.markets[0]?.condition_id ||
                    group.markets[0]?.market_id ||
                    '';
                  if (firstConditionId) toggleFavorite(firstConditionId);
                }}
                markets={uniqueMarkets.slice(0, 3).map((market) => ({
                  id: market.conditionId || market.condition_id || market.market_id || '',
                  question: market.groupItemTitle || market.question,
                  yesPrice: Number(market.outcomePrices?.[0]) || 0.5,
                  noPrice: Number(market.outcomePrices?.[1]) || 0.5,
                  ...getOutcomeLabels(market),
                }))}
                onOutcomeSelect={handleOutcomeSelect}
                onMarketClick={(marketId) => router.push(`/predict?market=${marketId}`)}
              />
            );
          }

          const market = uniqueMarkets[0] || group.markets[0];
          const marketConditionId = market.conditionId || market.condition_id || market.market_id || '';
          const { yesLabel, noLabel } = getOutcomeLabels(market);
          return (
            <MarketCard
              key={marketConditionId}
              marketId={marketConditionId}
              question={market.question}
              yesPrice={Number(market.outcomePrices?.[0]) || 0.5}
              noPrice={Number(market.outcomePrices?.[1]) || 0.5}
              yesLabel={yesLabel}
              noLabel={noLabel}
              volume={market.volume24hr || market.volume}
              category={market.eventTitle || 'Markets'}
              categoryColor="#85a9ff"
              recurrence={market.recurrence}
              eventStartTime={market.eventStartTime || market.startTime}
              endDate={market.endDateIso || market.endDate}
              isLive={market.isLive}
              image={market.image}
              onClick={() => router.push(`/predict?market=${marketConditionId}`)}
              isExpanded={expandedMarketId === marketConditionId}
              selectedOutcome={expandedMarketId === marketConditionId ? expandedOutcome : null}
              onOutcomeSelect={handleOutcomeSelect}
              onCollapse={handleCollapse}
              isFavorite={isFavorite(marketConditionId)}
              onToggleFavorite={() => toggleFavorite(marketConditionId)}
            />
          );
        })}
      </div>
    );
  };

  const trendingMarkets = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...trending, ...markets, ...landingExtraMarkets].filter((market) => {
      const id = market.conditionId || market.condition_id || market.market_id || market.id || market.slug;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return merged;
  }, [trending, markets, landingExtraMarkets]);

  const trendingGroups = useMemo(() => buildEventGroups(trendingMarkets), [trendingMarkets]);
  const totalTrendingGroups = trendingGroups.length;

  useEffect(() => {
    if ((selectedCategory === 'all' || selectedCategory === 'trending') && !debouncedSearch) {
      setLandingVisibleCount(40);
      setLandingExtraMarkets([]);
      setLandingOffset(0);
      setLandingHasMore(true);
    }
  }, [selectedCategory, debouncedSearch, status]);

  if (selectedMarket) {
    const allMarkets = [...trending, ...markets, ...categoryMarkets];
    const selectedMarketId =
      selectedMarket.conditionId ||
      selectedMarket.condition_id ||
      selectedMarket.market_id ||
      selectedMarket.id ||
      '';
    const relatedMarkets = allMarkets.filter((market) => {
      const sameEvent =
        (selectedMarket.eventSlug && market.eventSlug === selectedMarket.eventSlug) ||
        (selectedMarket.eventTitle && market.eventTitle === selectedMarket.eventTitle);
      if (sameEvent) return true;
      const marketId = market.conditionId || market.condition_id || market.market_id || market.id;
      return marketId === selectedMarketId;
    });
    return (
      <>
        <div className="fixed inset-0 bg-[#18181b]" />
        <MarketDetail
          market={selectedMarket}
          relatedMarkets={relatedMarkets}
          preferredOutcome={selectedMarketOutcome}
          onSelectMarket={(marketId, outcome) => {
            ignoreMarketHydrationRef.current = null;
            const nextMarket = findMarketById(marketId, allMarkets);
            if (nextMarket) {
              setSelectedMarket(nextMarket);
              setSelectedMarketOutcome(outcome || null);
            }
            const params = new URLSearchParams(searchParams.toString());
            params.set('market', marketId);
            router.replace(`/predict${params.toString() ? `?${params.toString()}` : ''}`);
          }}
          onBack={() => {
            const currentMarketId =
              selectedMarket.conditionId ||
              selectedMarket.condition_id ||
              selectedMarket.market_id ||
              selectedMarket.id ||
              null;
            ignoreMarketHydrationRef.current = currentMarketId;
            setSelectedMarket(null);
            setSelectedMarketOutcome(null);
            const params = new URLSearchParams(searchParams.toString());
            params.delete('market');
            router.replace(`/predict${params.toString() ? `?${params.toString()}` : ''}`);
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-[#09090b]" />
      <BackgroundMask />

      <div className="relative flex-1 flex flex-col items-center py-8 px-8 min-h-screen">
        <div className="z-10 w-full max-w-[1740px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-[#fafafa] text-[32px] font-bold mb-2">
                Prediction Markets
              </h1>
              <p className="text-[#71717b] text-base">
                Bet on the last news of the ecosystem. now.
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3">
                <div className="text-[#71717b] text-xs mb-1">24H Volume</div>
                <div className="text-white text-xl font-bold">$11.5M</div>
              </div>
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3">
                <div className="text-[#71717b] text-xs mb-1">24H Predictions</div>
                <div className="text-white text-xl font-bold">2,937</div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="mb-8">
            <FilterBar
              onCategoryChange={setSelectedCategory}
              onSearchChange={setSearchQuery}
              onSortChange={setSortBy}
              onFrequencyChange={setFrequency}
              onStatusChange={setStatus}
              initialCategory={selectedCategory}
              initialSearch={searchQuery}
              initialSort={sortBy}
              initialFrequency={frequency}
              initialStatus={status}
              showFavorites={!!userAddress}
              hasFavorites={favorites.length > 0}
            />
          </div>

          {/* Markets Display */}
          {selectedCategory === 'crypto' && !debouncedSearch ? (
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 mb-12">
              <div className="rounded-xl border border-[#27272a] bg-[#151518] p-4 space-y-6">
                <div>
                  <div className="text-xs uppercase text-[#71717b] mb-3">Time</div>
                  <div className="space-y-2">
                    {['All', '5 Min', '15 Min', 'Hourly', '4 Hour', 'Daily', 'Weekly', 'Monthly'].map((label) => {
                      const value = label.toLowerCase();
                      const isActive = cryptoFrequency === value;
                      return (
                        <button
                          key={label}
                          onClick={() => setCryptoFrequency(value)}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                            isActive
                              ? 'bg-[#27272a] text-white'
                              : 'text-[#9f9fa9] hover:text-white hover:bg-[#1f1f24]'
                          }`}
                        >
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase text-[#71717b] mb-3">Assets</div>
                  <div className="space-y-2">
                    {['All', 'Bitcoin', 'Ethereum', 'Solana', 'XRP', 'Dogecoin'].map((label) => {
                      const value = label.toLowerCase();
                      const isActive = cryptoAsset === value;
                      return (
                        <button
                          key={label}
                          onClick={() => setCryptoAsset(value)}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                            isActive
                              ? 'bg-[#27272a] text-white'
                              : 'text-[#9f9fa9] hover:text-white hover:bg-[#1f1f24]'
                          }`}
                        >
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-white text-xl font-semibold">Crypto Markets</h2>
                  <div className="text-sm text-[#9f9fa9]">{cryptoFrequency !== 'all' ? cryptoFrequency : 'All timeframes'}</div>
                </div>
                {isLoading && filteredMarkets.length === 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <MarketCardSkeleton key={i} />
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-center py-12 text-red-400">Failed to load markets</div>
                ) : filteredMarkets.length === 0 ? (
                  <div className="text-center py-12 text-[#71717b]">No crypto markets found</div>
                ) : (
                  renderMarketGrid(filteredMarkets, 'md:grid-cols-2 lg:grid-cols-3')
                )}
              </div>
            </div>
          ) : selectedCategory !== 'all' && selectedCategory !== 'trending' && selectedCategory !== 'favorites' && selectedCategory !== 'crypto' && !useCategoryOnlyQuery && !debouncedSearch && !!categoryTagId ? (
            <div className="mb-12 space-y-10">
              {Object.entries(categorySections).map(([sectionTitle, sectionMarkets]) => (
                <div key={sectionTitle}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white text-xl font-semibold">{sectionTitle}</h2>
                  </div>
                  {isLoading && sectionMarkets.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <MarketCardSkeleton key={i} />
                      ))}
                    </div>
                  ) : sectionMarkets.length === 0 ? (
                    <div className="text-center py-10 text-[#71717b]">No markets found</div>
                  ) : (
                    renderMarketGrid(sectionMarkets, 'md:grid-cols-2 lg:grid-cols-4')
                  )}
                </div>
              ))}
            </div>
          ) : selectedCategory === 'favorites' && !debouncedSearch ? (
            // Favorites View
            <div className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <svg className="w-5 h-5 text-[#fbbf24]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <h2 className="text-white text-xl font-semibold">Your Favorites</h2>
                <span className="text-[#71717b] text-sm">({favorites.length})</span>
              </div>
              
              {!userAddress ? (
                <div className="text-center py-12 text-[#71717b]">Connect your wallet to view favorites</div>
              ) : favoritesLoading ? (
                <div className="text-center py-12 text-[#71717b]">Loading favorites...</div>
              ) : favoriteMarkets.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 text-[#71717b] mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <p className="text-[#71717b] mb-2">No favorites yet</p>
                  <p className="text-[#9f9fa9] text-sm">Click the star icon on any market to add it to your favorites</p>
                </div>
              ) : (
                renderMarketGrid(favoriteMarkets, 'md:grid-cols-2 lg:grid-cols-4')
              )}
            </div>
          ) : selectedCategory === 'all' && !debouncedSearch ? (
            <>
              {/* Trending Section */}
              <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-[#ff4d6d]" />
                    <h2 className="text-white text-xl font-semibold">Trending</h2>
                  </div>
                  <button 
                    onClick={() => setSelectedCategory('trending')}
                    className="text-[#9f9fa9] hover:text-white text-sm font-medium transition-colors"
                  >
                    View all →
                  </button>
                </div>
                
                {isLoadingTrending ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <MarketCardSkeleton key={i} />
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-center py-12 text-red-400">Failed to load markets</div>
                ) : (
                  renderMarketGrid(
                    trendingMarkets,
                    'md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5',
                    landingVisibleCount,
                    true
                  )
                )}

                {!isLoadingTrending && !error && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={async () => {
                        if (landingVisibleCount < totalTrendingGroups) {
                          setLandingVisibleCount((prev) => prev + 20);
                          return;
                        }
                        await loadMoreLandingMarkets();
                        setLandingVisibleCount((prev) => prev + 20);
                      }}
                      disabled={landingLoadingMore || (!landingHasMore && landingVisibleCount >= totalTrendingGroups)}
                      className="bg-[#27272a] hover:bg-[#3f3f46] text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {landingLoadingMore
                        ? 'Loading...'
                        : landingVisibleCount < totalTrendingGroups
                          ? 'Show More Markets'
                          : landingHasMore
                            ? 'Load More Markets'
                            : 'No More Markets'}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Filtered/Search Markets */
            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-white text-xl font-semibold capitalize">
                  {debouncedSearch 
                    ? `Search: "${debouncedSearch}"` 
                    : selectedCategory === 'trending' 
                      ? 'Trending Markets' 
                      : `${selectedCategory} Markets`}
                </h2>
                <button 
                  onClick={() => {
                    setSelectedCategory('all');
                    setSearchQuery('');
                  }}
                  className="text-[#9f9fa9] hover:text-white text-sm font-medium transition-colors"
                >
                  ← Back to All
                </button>
              </div>
              
              {isLoading && filteredMarkets.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <MarketCardSkeleton key={i} />
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-12 text-red-400">Failed to load markets</div>
              ) : filteredMarkets.length === 0 ? (
                <div className="text-center py-12 text-[#71717b]">No markets found</div>
              ) : (
                <>
                  {renderMarketGrid(filteredMarkets, 'md:grid-cols-2 lg:grid-cols-4')}
                  
                  {/* Load More Button */}
                  {(selectedCategory === 'trending' ? landingHasMore : hasMore) && (
                    <div className="flex justify-center mt-8">
                      <button
                        onClick={selectedCategory === 'trending' ? loadMoreLandingMarkets : loadMore}
                        disabled={selectedCategory === 'trending' ? landingLoadingMore : categoryLoading}
                        className="bg-[#27272a] hover:bg-[#3f3f46] text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
                      >
                        {selectedCategory === 'trending'
                          ? (landingLoadingMore ? 'Loading...' : 'Load More Markets')
                          : (categoryLoading ? 'Loading...' : 'Load More Markets')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-8 border-t border-[#27272a]">
            <p className="text-[#71717b] text-sm">Version: 5.116.0</p>
            <button className="bg-[#27272a] rounded-lg p-3 hover:bg-[#3f3f46] transition-colors">
              <svg className="w-5 h-5 text-[#d4d4d8]" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
