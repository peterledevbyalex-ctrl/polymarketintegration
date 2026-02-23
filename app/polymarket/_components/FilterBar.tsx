"use client"

import React from 'react';
import { Search } from 'lucide-react';

interface FilterBarProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  categories,
  selectedCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onCategoryChange(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              selectedCategory === category
                ? 'bg-[#2a2f3e] text-white border border-[#3a3f4e]'
                : 'bg-transparent text-gray-400 hover:text-white hover:bg-[#1a1f2e] border border-transparent'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search markets..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#1a1f2e] border border-[#2a2f3e] text-white placeholder-gray-400 focus:outline-none focus:border-[#3a3f4e] transition-colors text-sm"
        />
      </div>
    </div>
  );
};
