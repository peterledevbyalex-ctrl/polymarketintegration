"use client"

import React, { useState, useEffect } from 'react';
import { Search, Star, TrendingUp, DollarSign, Gamepad2, Briefcase, Sparkles, Microscope } from 'lucide-react';

interface SimpleFilterBarProps {
  onCategoryChange?: (category: string) => void;
  onSearchChange?: (search: string) => void;
  onSortChange?: (sort: string) => void;
  onStatusChange?: (status: string) => void;
  initialCategory?: string;
  initialSearch?: string;
  initialSort?: string;
  initialStatus?: string;
  showFavorites?: boolean;
  hasFavorites?: boolean;
}

// Simplified categories that directly map to API calls
const categories = [
  { label: 'All', value: 'all', icon: null, description: 'All markets' },
  { label: 'Trending', value: 'trending', icon: TrendingUp, description: 'Hot markets' },
  { label: 'Politics', value: 'politics', icon: null, description: 'Political events' },
  { label: 'Crypto', value: 'crypto', icon: DollarSign, description: 'Cryptocurrency' },
  { label: 'Sports', value: 'sports', icon: Gamepad2, description: 'Sports betting' },
  { label: 'Business', value: 'business', icon: Briefcase, description: 'Business & Finance' },
  { label: 'Entertainment', value: 'entertainment', icon: Sparkles, description: 'Entertainment' },
  { label: 'Science', value: 'science', icon: Microscope, description: 'Science & Tech' },
];

const sortOptions = [
  { label: '24h Volume', value: 'volume_24h' },
  { label: 'Total Volume', value: 'volume' },
  { label: 'Liquidity', value: 'liquidity' },
  { label: 'Newest', value: 'newest' },
  { label: 'Ending Soon', value: 'ending_soon' },
];

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Closed', value: 'closed' },
  { label: 'All', value: 'all' },
];

export const SimpleFilterBar: React.FC<SimpleFilterBarProps> = ({
  onCategoryChange,
  onSearchChange,
  onSortChange,
  onStatusChange,
  initialCategory = 'all',
  initialSearch = '',
  initialSort = 'volume_24h',
  initialStatus = 'active',
  showFavorites = true,
  hasFavorites = false,
}) => {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [sortBy, setSortBy] = useState(initialSort);
  const [status, setStatus] = useState(initialStatus);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sync with props
  useEffect(() => setActiveCategory(initialCategory), [initialCategory]);
  useEffect(() => setSearchValue(initialSearch), [initialSearch]);
  useEffect(() => setSortBy(initialSort), [initialSort]);
  useEffect(() => setStatus(initialStatus), [initialStatus]);

  const handleCategoryClick = (value: string) => {
    setActiveCategory(value);
    onCategoryChange?.(value);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    onSearchChange?.(value);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSortBy(value);
    onSortChange?.(value);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setStatus(value);
    onStatusChange?.(value);
  };

  // Add favorites to categories if user has favorites
  const displayCategories = showFavorites && hasFavorites 
    ? [
        { label: 'Favorites', value: 'favorites', icon: Star, description: 'Your favorites' },
        ...categories
      ]
    : categories;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="bg-[#27272a] border border-[#27272a] rounded-xl px-4 py-3 flex items-center gap-3 max-w-lg">
        <Search className="w-5 h-5 text-[#9f9fa9] flex-shrink-0" />
        <input
          type="text"
          placeholder="Search markets..."
          value={searchValue}
          onChange={handleSearchChange}
          className="flex-1 bg-transparent text-white placeholder:text-[#9f9fa9] outline-none"
        />
        <div className="bg-[rgba(255,255,255,0.1)] rounded px-2 py-1">
          <span className="text-[rgba(255,255,255,0.6)] text-xs font-medium">/</span>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {displayCategories.map((category) => {
          const Icon = category.icon;
          const isActive = activeCategory === category.value;
          
          return (
            <button
              key={category.value}
              onClick={() => handleCategoryClick(category.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#27272a] text-[#9f9fa9] hover:bg-[#3f3f46] hover:text-white'
              }`}
              title={category.description}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {category.label}
            </button>
          );
        })}
      </div>

      {/* Advanced Filters Toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-[#9f9fa9] hover:text-white transition-colors flex items-center gap-2"
        >
          <span>Advanced Filters</span>
          <svg 
            className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Sort */}
          <div>
            <label className="text-sm text-white font-medium mb-2 block">Sort By</label>
            <select
              value={sortBy}
              onChange={handleSortChange}
              className="w-full bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-sm text-white font-medium mb-2 block">Status</label>
            <select
              value={status}
              onChange={handleStatusChange}
              className="w-full bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 text-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};