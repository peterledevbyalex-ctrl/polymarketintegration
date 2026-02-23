"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarketCard } from './MarketCard';
import { MarketDetail } from './MarketDetail';
import { SimpleFilterBar } from './SimpleFilterBar';
import { SportsFilterBar } from './SportsFilterBar';
import { CryptoFilterBar } from './CryptoFilterBar';
import { BackgroundMask } from '@/components/BackgroundMask';
import { useFeaturedMarkets } from '@/hooks/useFeaturedMarkets';
import { useFavorites } from '@/hooks/useFavorites';
import { useMarkets } from '@/hooks/useMarkets';
import { useEnhancedCryptoMarkets } from '@/hooks/useEnhancedCryptoMarkets';
import { useSportsMarkets } from '@/hooks/useSports';
import { useApp } from '@/providers/AppProvider';
import { Market } from '@/types/polymarket.types';
import { Flame, Star } from 'lucide-react';

export const SimplifiedPageContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userAddress } = useApp();
  
  // State
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedMarketOutcome, setSelectedMarketOutcome] = useState<'YES' | 'NO' | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('volume_24h');
  const [status, setStatus] = useState<string>('active');

  // Sports filters
  const [sportsSport, setSportsSport] = useState<string>('all');
  const [sportsLeague, setSportsLeague] = useState<string>('all');
  const [sportsTeam, setSportsTeam] = useState<string>('all');
  const [sportsMarketType, setSportsMarketType] = useState<string>('all');

  // Crypto filters
  const [cryptoBucket, setCryptoBucket] = useState<string>('all');
  const [cryptoTimeframe, setCryptoTimeframe] = useState<string>('all');
  const [cryptoEventType, setCryptoEventType] = useState<string>('all');
  const [cryptoAsset, setCryptoAsset] = useState<string>('all');

  // Hooks for data
  const { favorites } = useFavorites(userAddress);
  const { trending, markets: featuredMarkets, isLoading: featuredLoading } = useFeaturedMarkets({
    trendingLimit: 20,
    perCategory: 6,
  });

  // Regular markets API
  const { 
    markets, 
    isLoading: marketsLoading, 
    error: marketsError,
    refetch: refetchMarkets 
  } = useMarkets({
    limit: 50,
    offset: 0,
    active: status === 'active',
    search: searchQuery.length >= 2 ? searchQuery : undefined,
    sort: sortBy as any,
    autoFetch: selectedCategory === 'politics' || selectedCategory === 'business' || 
              selectedCategory === 'entertainment' || selectedCategory === 'science' ||
              searchQuery.length >= 2
  });

  // Crypto markets
  const {
    markets: cryptoMarkets,
    isLoading: cryptoLoading,
    fastMarkets,
    refetch: refetchCrypto
  } = useEnhancedCryptoMarkets({
    bucket: cryptoBucket !== 'all' ? cryptoBucket as any : undefined,
    timeframe: cryptoTimeframe !== 'all' ? cryptoTimeframe as any : undefined,
    eventType: cryptoEventType !== 'all' ? cryptoEventType as any : undefined,
    asset: cryptoAsset !== 'all' ? cryptoAsset : undefined,
    limit: 50,
    autoFetch: selectedCategory === 'crypto'
  });

  // Sports markets
  const {
    markets: sportsMarkets,
    isLoading: sportsLoading,
    refetch: refetchSports
  } = useSportsMarkets({
    sport: sportsSport !== 'all' ? sportsSport : undefined,
    league: sportsLeague !== 'all' ? sportsLeague : undefined,
    team: sportsTeam !== 'all' ? sportsTeam : undefined,
    market_type: sportsMarketType !== 'all' ? sportsMarketType as any : undefined,
    limit: 50,
    autoFetch: selectedCategory === 'sports'
  });

  // Initialize from URL params
  useEffect(() => {
    const categoryParam = searchParams.get('category') || 'all';
    const searchParam = searchParams.get('search') || '';
    const sortParam = searchParams.get('sort') || 'volume_24h';
    const statusParam = searchParams.get('status') || 'active';

    setSelectedCategory(categoryParam);
    setSearchQuery(searchParam);
    setSortBy(sortParam);
    setStatus(statusParam);
  }, [searchParams]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (searchQuery) params.set('search', searchQuery);
    if (sortBy !== 'volume_24h') params.set('sort', sortBy);
    if (status !== 'active') params.set('status', status);
    
    const currentQuery = searchParams.toString();
    const newQuery = params.toString();
    
    if (newQuery !== currentQuery) {
      router.replace(`/predict${newQuery ? `?${newQuery}` : ''}`, { scroll: false });
    }
  }, [selectedCategory, searchQuery, sortBy, status, router, searchParams]);

  // Get display markets based on category
  const displayMarkets = useMemo(() => {
    if (searchQuery.length >= 2) {
      return markets; // Search results
    }

    switch (selectedCategory) {
      case 'all':
        return [...trending, ...featuredMarkets];
      case 'trending':
        return trending;
      case 'favorites':
        return favorites.map(f => f.market).filter(Boolean) as Market[];
      case 'crypto':
        return cryptoMarkets;
      case 'sports':
        return sportsMarkets;
      case 'politics':
      case 'business':
      case 'entertainment':
      case 'science':
        return markets.filter(m => 
          m.category?.toLowerCase() === selectedCategory ||
          m.tags?.some(tag => tag.toLowerCase().includes(selectedCategory)) ||
          m.question.toLowerCase().includes(selectedCategory)
        );
      default:
        return [];
    }
  }, [
    selectedCategory, 
    searchQuery, 
    trending, 
    featuredMarkets, 
    favorites, 
    cryptoMarkets, 
    sportsMarkets, 
    markets
  ]);

  // Loading state
  const isLoading = useMemo(() => {
    if (searchQuery.length >= 2) return marketsLoading;
    
    switch (selectedCategory) {
      case 'all':
      case 'trending':
        return featuredLoading;
      case 'crypto':
        return cryptoLoading;
      case 'sports':
        return sportsLoading;
      default:
        return marketsLoading;
    }
  }, [selectedCategory, searchQuery, featuredLoading, cryptoLoading, sportsLoading, marketsLoading]);

  // Market selection
  const handleMarketSelect = (market: Market, outcome?: 'YES' | 'NO') => {
    setSelectedMarket(market);
    setSelectedMarketOutcome(outcome || null);
  };

  const handleBackToMarkets = () => {
    setSelectedMarket(null);
    setSelectedMarketOutcome(null);
  };

  // Render filter bar based on category
  const renderFilterBar = () => {
    if (selectedCategory === 'sports') {
      return (
        <SportsFilterBar
          onSportChange={setSportsSport}
          onLeagueChange={setSportsLeague}
          onTeamChange={setSportsTeam}
          onMarketTypeChange={setSportsMarketType}
          initialSport={sportsSport}
          initialLeague={sportsLeague}
          initialTeam={sportsTeam}
          initialMarketType={sportsMarketType}
        />
      );
    }

    if (selectedCategory === 'crypto') {
      return (
        <CryptoFilterBar
          onBucketChange={setCryptoBucket}
          onTimeframeChange={setCryptoTimeframe}
          onEventTypeChange={setCryptoEventType}
          onAssetChange={setCryptoAsset}
          initialBucket={cryptoBucket}
          initialTimeframe={cryptoTimeframe}
          initialEventType={cryptoEventType}
          initialAsset={cryptoAsset}
        />
      );
    }

    return (
      <SimpleFilterBar
        onCategoryChange={setSelectedCategory}
        onSearchChange={setSearchQuery}
        onSortChange={setSortBy}
        onStatusChange={setStatus}
        initialCategory={selectedCategory}
        initialSearch={searchQuery}
        initialSort={sortBy}
        initialStatus={status}
        showFavorites={!!userAddress}
        hasFavorites={favorites.length > 0}
      />
    );
  };

  // Render market grid
  const renderMarketGrid = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-[#27272a] rounded-xl h-48" />
          ))}
        </div>
      );
    }

    if (displayMarkets.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="text-[#9f9fa9] text-lg mb-2">
            {searchQuery.length >= 2 
              ? `No results found for "${searchQuery}"` 
              : `No ${selectedCategory} markets available`}
          </div>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSearchQuery('');
            }}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Back to all markets
          </button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayMarkets.map((market) => {
          const marketId = market.conditionId || market.condition_id || market.market_id || market.id || '';
          return (
            <MarketCard
              key={marketId}
              marketId={marketId}
              question={market.question}
              yesPrice={Array.isArray(market.outcomePrices) ? parseFloat(market.outcomePrices[0] || '0.5') : 0.5}
              noPrice={Array.isArray(market.outcomePrices) ? parseFloat(market.outcomePrices[1] || '0.5') : 0.5}
              volume={market.volume}
              category={market.category}
              endDate={market.endDate || market.endDateIso}
              image={market.image}
              onClick={() => handleMarketSelect(market)}
            />
          );
        })}
      </div>
    );
  };

  if (selectedMarket) {
    return (
      <>
        <BackgroundMask />
        <MarketDetail
          market={selectedMarket}
          onBack={handleBackToMarkets}
          preferredOutcome={selectedMarketOutcome}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            Prediction Markets
          </h1>
          <p className="text-[#9f9fa9] text-lg">
            Bet on the future of the ecosystem. Now.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8">
          {renderFilterBar()}
        </div>

        {/* Fast Markets Highlight for Crypto */}
        {selectedCategory === 'crypto' && fastMarkets.length > 0 && (
          <div className="mb-8 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full flex items-center justify-center">
                <Flame className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-white text-xl font-bold">⚡ Ultra-Fast Markets</h3>
              <div className="bg-orange-400/20 text-orange-400 px-2 py-1 rounded text-sm">
                {fastMarkets.length} active
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fastMarkets.slice(0, 3).map((market) => {
                const marketId = market.conditionId || market.condition_id || market.market_id || market.id || '';
                return (
                  <MarketCard
                    key={marketId}
                    marketId={marketId}
                    question={market.question}
                    yesPrice={Array.isArray(market.outcomePrices) ? parseFloat(market.outcomePrices[0] || '0.5') : 0.5}
                    noPrice={Array.isArray(market.outcomePrices) ? parseFloat(market.outcomePrices[1] || '0.5') : 0.5}
                    volume={market.volume}
                    category="crypto"
                    endDate={market.endDate || market.endDateIso}
                    image={market.image}
                    onClick={() => handleMarketSelect(market)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Markets Grid */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white text-2xl font-bold">
              {searchQuery.length >= 2 
                ? `Search: "${searchQuery}"` 
                : selectedCategory === 'all' 
                  ? 'All Markets'
                  : selectedCategory === 'favorites'
                    ? 'Your Favorites'
                    : `${selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Markets`}
            </h2>
            
            {selectedCategory !== 'all' && (
              <button
                onClick={() => setSelectedCategory('all')}
                className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
              >
                ← Back to All
              </button>
            )}
          </div>

          {renderMarketGrid()}
        </div>
      </div>
    </div>
  );
};