"use client"

import React, { useState } from 'react';
import { Search, SlidersHorizontal, ChevronDown, Star } from 'lucide-react';

interface FilterBarProps {
  onCategoryChange?: (category: string) => void;
  onSearchChange?: (search: string) => void;
  onSortChange?: (sort: string) => void;
  onFrequencyChange?: (frequency: string) => void;
  onStatusChange?: (status: string) => void;
  initialCategory?: string;
  initialSearch?: string;
  initialSort?: string;
  initialFrequency?: string;
  initialStatus?: string;
  showFavorites?: boolean;
  hasFavorites?: boolean;
}

const categories = [
  { label: 'All', value: 'all' },
  { label: 'Favorites', value: 'favorites', icon: Star },
  { label: 'Trending', value: 'trending' },
  { label: 'Politics', value: 'politics' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Business', value: 'business' },
  { label: 'Sports', value: 'sports' },
  { label: 'Entertainment', value: 'entertainment' },
  { label: 'Science', value: 'science' },
];

const sortOptions = [
  { label: '24h volume', value: 'volume_24h' },
  { label: 'Total volume', value: 'volume' },
  { label: 'Liquidity', value: 'liquidity' },
  { label: 'Newest', value: 'newest' },
  { label: 'Ending soon', value: 'ending_soon' },
];

const frequencyOptions = [
  { label: 'All', value: 'all' },
  { label: '24 hours', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
];

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Closed', value: 'closed' },
  { label: 'All', value: 'all' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  onCategoryChange,
  onSearchChange,
  onSortChange,
  onFrequencyChange,
  onStatusChange,
  initialCategory = 'all',
  initialSearch = '',
  initialSort = 'volume_24h',
  initialFrequency = 'all',
  initialStatus = 'active',
  showFavorites = true,
  hasFavorites = false,
}) => {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState(initialSort);
  const [frequency, setFrequency] = useState(initialFrequency);
  const [status, setStatus] = useState(initialStatus);

  React.useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory]);

  React.useEffect(() => {
    setSearchValue(initialSearch);
  }, [initialSearch]);

  React.useEffect(() => {
    setSortBy(initialSort);
  }, [initialSort]);

  React.useEffect(() => {
    setFrequency(initialFrequency);
  }, [initialFrequency]);

  React.useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const handleCategoryClick = (value: string) => {
    setActiveCategory(value);
    onCategoryChange?.(value);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
    onSearchChange?.(e.target.value);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    onSortChange?.(value);
  };

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    onFrequencyChange?.(value);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    onStatusChange?.(value);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Row: Search + Filter Button + Category Tabs */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <div className="bg-[#27272a] border border-[#27272a] rounded-xl px-3 py-2.5 flex items-center gap-3 w-[380px]">
            <Search className="w-[18px] h-[18px] text-[#9f9fa9]" />
            <input
              type="text"
              placeholder="Search markets..."
              value={searchValue}
              onChange={handleSearchChange}
              className="flex-1 bg-transparent text-[#9f9fa9] text-base font-medium outline-none placeholder:text-[#9f9fa9]"
            />
            <div className="bg-[rgba(255,255,255,0.1)] rounded px-1.5 py-0.5">
              <span className="text-[rgba(255,255,255,0.6)] text-xs font-medium">/</span>
            </div>
          </div>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`border rounded-xl p-2.5 h-10 w-10 flex items-center justify-center hover:bg-[#3f3f46] transition-colors ${
              showFilters ? 'bg-[#27272a] border-[rgba(205,183,255,0.5)]' : 'bg-[#27272a] border-[#27272a]'
            }`}
          >
            <SlidersHorizontal className="w-[18px] h-[18px] text-white" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2">
          {categories
            .filter(cat => cat.value !== 'favorites' || showFavorites)
            .map((category, index, arr) => (
            <React.Fragment key={category.value}>
              {index === arr.length - 1 && (
                <div className="bg-[#27272a] h-3 w-px" />
              )}
              {category.value === 'favorites' && index > 0 && (
                <div className="bg-[#27272a] h-3 w-px" />
              )}
              <button
                onClick={() => handleCategoryClick(category.value)}
                className={`px-3 py-2 rounded-lg h-8 flex items-center justify-center gap-1 transition-colors ${
                  activeCategory === category.value
                    ? category.value === 'favorites' 
                      ? 'bg-[#fbbf24]/20 text-[#fbbf24]' 
                      : 'bg-[#27272a] text-white'
                    : category.value === 'favorites' && hasFavorites
                      ? 'text-[#fbbf24]/70 hover:text-[#fbbf24]'
                      : 'text-[#9f9fa9] hover:text-white'
                }`}
              >
                {category.icon && <category.icon className="w-4 h-4" fill={activeCategory === category.value ? 'currentColor' : 'none'} />}
                <span className="text-base font-medium">{category.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Filter Dropdowns Row */}
      {showFilters && (
        <div className="flex items-center gap-2">
          {/* Sort By */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 pr-8 text-sm text-white appearance-none cursor-pointer hover:bg-[#3f3f46] transition-colors"
            >
              <option value="" disabled>Sort by:</option>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
          </div>

          {/* Frequency */}
          <div className="relative">
            <select
              value={frequency}
              onChange={(e) => handleFrequencyChange(e.target.value)}
              className="bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 pr-8 text-sm text-white appearance-none cursor-pointer hover:bg-[#3f3f46] transition-colors"
            >
              <option value="" disabled>Frequency:</option>
              {frequencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 pr-8 text-sm text-white appearance-none cursor-pointer hover:bg-[#3f3f46] transition-colors"
            >
              <option value="" disabled>Status:</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
};
