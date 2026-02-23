"use client"

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarketCard } from './MarketCard';
import { MarketDetail } from './MarketDetail';
import { PositionsView } from './PositionsView';
import { FilterBar } from './FilterBar';
import { BackgroundMask } from '@/components/BackgroundMask';
import { useFeaturedMarkets } from '@/hooks/useFeaturedMarkets';
import { useTags } from '@/hooks/useTags';
import { usePositions } from '@/hooks/usePositions';
import { useApp } from '@/providers/AppProvider';
import { Market } from '@/types/polymarket.types';

type TabType = 'trending' | 'markets' | 'positions';

export const PolymarketPageContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userAddress } = useApp();
  const { trending, markets, byCategory, isLoading: featuredLoading, error: featuredError, refetch: refetchFeatured } = useFeaturedMarkets();
  const { tags } = useTags();
  const { positions, isLoading: positionsLoading, error: positionsError, refetch: refetchPositions } = usePositions({ 
    eoaAddress: userAddress || undefined,
    autoFetch: !!userAddress 
  });
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('trending');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'positions') {
      setActiveTab('positions');
      setSelectedMarket(null);
      return;
    }
    if (tab === 'markets') {
      setActiveTab('markets');
      return;
    }
    if (!tab) {
      setActiveTab('trending');
    }
  }, [searchParams]);

  useEffect(() => {
    const marketId = searchParams.get('market');
    if (marketId && !selectedMarket) {
      const allMarkets = [...trending, ...markets];
      const market = allMarkets.find(m => 
        m.id === marketId || 
        m.market_id === marketId || 
        m.conditionId === marketId || 
        m.condition_id === marketId
      );
      if (market) {
        setSelectedMarket(market);
      }
    }
  }, [searchParams, trending, markets, selectedMarket]);

  const categories = useMemo(() => {
    const availableCategories = Object.keys(byCategory);
    return ['All', ...availableCategories];
  }, [byCategory]);

  const displayMarkets = useMemo(() => {
    if (activeTab === 'trending') {
      if (selectedCategory === 'All') return trending;
      return byCategory[selectedCategory] || [];
    }
    if (activeTab === 'markets') {
      if (selectedCategory === 'All') return markets;
      return byCategory[selectedCategory] || [];
    }
    return [];
  }, [activeTab, trending, markets, byCategory, selectedCategory]);

  const filteredMarkets = useMemo(() => {
    if (searchQuery === '') return displayMarkets;
    return displayMarkets.filter(market => 
      market.question.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [displayMarkets, searchQuery]);

  return (
    <>
      <div className="fixed inset-0 gradient-bg" />
      <BackgroundMask />

      <div className="flex-1 flex items-center justify-center py-20">
        <div className="z-10 w-full max-w-6xl px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground font-sans mb-4">
              Prediction Markets
            </h1>
            <p className="text-md text-foreground-light font-body">
              Trade on real-world events with cross-chain swaps from MegaETH
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            <button
              onClick={() => {
                setActiveTab('trending');
                setSelectedMarket(null);
                setSelectedCategory('All');
                setSearchQuery('');
                router.push('/polymarket');
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === 'trending'
                  ? 'bg-primary text-white'
                  : 'bg-background-light text-foreground-light hover:bg-background-light-sm'
              }`}
            >
              🔥 Trending
            </button>
            <button
              onClick={() => {
                setActiveTab('markets');
                setSelectedMarket(null);
                setSelectedCategory('All');
                setSearchQuery('');
                router.push('/polymarket');
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === 'markets'
                  ? 'bg-primary text-white'
                  : 'bg-background-light text-foreground-light hover:bg-background-light-sm'
              }`}
            >
              All Markets
            </button>
            <button
              onClick={() => {
                setActiveTab('positions');
                setSelectedMarket(null);
                router.push('/polymarket?tab=positions');
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === 'positions'
                  ? 'bg-primary text-white'
                  : 'bg-background-light text-foreground-light hover:bg-background-light-sm'
              }`}
            >
              My Positions
              {positions && positions.openOrders.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                  {positions.openOrders.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'positions' ? (
            <PositionsView
              positions={positions}
              isLoading={positionsLoading}
              error={positionsError}
              onRefetch={refetchPositions}
            />
          ) : (activeTab === 'trending' || activeTab === 'markets') && featuredLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-foreground-light">Loading markets...</p>
            </div>
          ) : (activeTab === 'trending' || activeTab === 'markets') && featuredError ? (
            <div className="text-center py-12">
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-6 max-w-md mx-auto">
                <p className="text-red-500 mb-4">{featuredError?.message}</p>
                <button
                  onClick={refetchFeatured}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-500 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (activeTab === 'trending' || activeTab === 'markets') && selectedMarket ? (
            <MarketDetail
              market={selectedMarket}
              onBack={() => {
                setSelectedMarket(null);
                router.push('/polymarket');
              }}
              onTradeSuccess={() => {
                refetchPositions();
                setActiveTab('positions');
                router.push('/polymarket?tab=positions');
              }}
            />
          ) : displayMarkets.length > 0 ? (
            <>
              <FilterBar
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={(cat) => {
                  setSelectedCategory(cat);
                  setSearchQuery('');
                }}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
              {filteredMarkets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredMarkets.map((market) => {
                const prices = Array.isArray(market.outcomePrices) 
                  ? market.outcomePrices 
                  : (typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : ['0.5', '0.5']);
                return (
                  <MarketCard
                    key={market.id || market.market_id || market.conditionId || market.condition_id}
                    marketId={market.id || market.market_id || market.conditionId || market.condition_id || ''}
                    question={market.question}
                    yesPrice={parseFloat(prices[0] || '0.5')}
                    noPrice={parseFloat(prices[1] || '0.5')}
                    volume={typeof market.volume === 'number' ? market.volume.toString() : market.volume}
                    endDate={market.endDateIso || market.endDate}
                    image={market.image || market.icon}
                    onClick={() => {
                      setSelectedMarket(market);
                      const marketId = market.id || market.market_id || market.conditionId || market.condition_id;
                      router.push(`/polymarket?market=${marketId}`);
                    }}
                  />
                );
              })}
            </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-foreground-light">No markets match your filters</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-foreground-light">No active markets found</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
