"use client"

import React, { useState } from 'react';
import { ChevronDown, Bitcoin, Zap, TrendingUp, Clock, Target } from 'lucide-react';

interface CryptoFilterBarProps {
  onBucketChange?: (bucket: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
  onEventTypeChange?: (eventType: string) => void;
  onAssetChange?: (asset: string) => void;
  initialBucket?: string;
  initialTimeframe?: string;
  initialEventType?: string;
  initialAsset?: string;
}

const cryptoBuckets = [
  { 
    label: 'All Crypto', 
    value: 'all',
    icon: Bitcoin,
    description: 'All cryptocurrency markets'
  },
  { 
    label: 'Bitcoin', 
    value: 'bitcoin',
    icon: Bitcoin,
    description: 'BTC price predictions'
  },
  { 
    label: 'Ethereum', 
    value: 'ethereum',
    icon: Target,
    description: 'ETH and ecosystem'
  },
  { 
    label: 'DeFi', 
    value: 'defi',
    icon: TrendingUp,
    description: 'DeFi protocols & tokens'
  },
  { 
    label: 'Altcoins', 
    value: 'altcoins',
    icon: Zap,
    description: 'Alternative cryptocurrencies'
  },
];

const timeframes = [
  { 
    label: 'All Time', 
    value: 'all',
    description: 'No time restriction'
  },
  { 
    label: '5 Minutes', 
    value: '5M',
    description: 'Ultra-fast resolution',
    highlight: true
  },
  { 
    label: '10 Minutes', 
    value: '10M',
    description: 'Quick resolution',
    highlight: true
  },
  { 
    label: '1 Hour', 
    value: '1H',
    description: 'Hourly resolution'
  },
  { 
    label: '4 Hours', 
    value: '4H',
    description: '4-hour resolution'
  },
  { 
    label: '1 Day', 
    value: '1D',
    description: 'Daily resolution'
  },
  { 
    label: '1 Week', 
    value: '1W',
    description: 'Weekly resolution'
  },
];

const eventTypes = [
  { 
    label: 'All Events', 
    value: 'all',
    description: 'All types of crypto events'
  },
  { 
    label: 'Price Movements', 
    value: 'price',
    description: 'Price up/down predictions'
  },
  { 
    label: 'Token Launches', 
    value: 'launch',
    description: 'New token launches & listings'
  },
  { 
    label: 'Protocol Upgrades', 
    value: 'upgrade',
    description: 'Network upgrades & forks'
  },
];

const cryptoAssets = [
  { label: 'All Assets', value: 'all', symbol: '🪙' },
  { label: 'Bitcoin', value: 'BTC', symbol: '₿' },
  { label: 'Ethereum', value: 'ETH', symbol: 'Ξ' },
  { label: 'Solana', value: 'SOL', symbol: '◎' },
  { label: 'Cardano', value: 'ADA', symbol: '₳' },
  { label: 'Polygon', value: 'MATIC', symbol: '🟣' },
  { label: 'Chainlink', value: 'LINK', symbol: '🔗' },
  { label: 'Uniswap', value: 'UNI', symbol: '🦄' },
];

export const CryptoFilterBar: React.FC<CryptoFilterBarProps> = ({
  onBucketChange,
  onTimeframeChange,
  onEventTypeChange,
  onAssetChange,
  initialBucket = 'all',
  initialTimeframe = 'all',
  initialEventType = 'all',
  initialAsset = 'all',
}) => {
  const [selectedBucket, setSelectedBucket] = useState(initialBucket);
  const [selectedTimeframe, setSelectedTimeframe] = useState(initialTimeframe);
  const [selectedEventType, setSelectedEventType] = useState(initialEventType);
  const [selectedAsset, setSelectedAsset] = useState(initialAsset);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleBucketChange = (bucket: string) => {
    setSelectedBucket(bucket);
    onBucketChange?.(bucket);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
    onTimeframeChange?.(timeframe);
  };

  const handleEventTypeChange = (eventType: string) => {
    setSelectedEventType(eventType);
    onEventTypeChange?.(eventType);
  };

  const handleAssetChange = (asset: string) => {
    setSelectedAsset(asset);
    onAssetChange?.(asset);
  };

  const clearFilters = () => {
    handleBucketChange('all');
    handleTimeframeChange('all');
    handleEventTypeChange('all');
    handleAssetChange('all');
  };

  const hasActiveFilters = selectedBucket !== 'all' || selectedTimeframe !== 'all' || 
                          selectedEventType !== 'all' || selectedAsset !== 'all';

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Primary Bucket Selection */}
      <div className="flex flex-wrap gap-2">
        {cryptoBuckets.map((bucket) => {
          const Icon = bucket.icon;
          return (
            <button
              key={bucket.value}
              onClick={() => handleBucketChange(bucket.value)}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 group relative ${
                selectedBucket === bucket.value
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                  : 'bg-[#27272a] text-[#9f9fa9] hover:bg-[#3f3f46] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{bucket.label}</span>
              
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {bucket.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Timeframe Selection - Prominent for fast markets */}
      <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#27272a]">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-white">Resolution Time</span>
          <div className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs">
            Fast markets available!
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {timeframes.map((timeframe) => (
            <button
              key={timeframe.value}
              onClick={() => handleTimeframeChange(timeframe.value)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative group ${
                selectedTimeframe === timeframe.value
                  ? 'bg-blue-500 text-white'
                  : timeframe.highlight
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30'
                    : 'bg-[#27272a] text-[#9f9fa9] hover:bg-[#3f3f46] hover:text-white'
              }`}
            >
              {timeframe.label}
              {timeframe.highlight && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
              )}
              
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {timeframe.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filters Toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-[#9f9fa9] hover:text-white transition-colors"
        >
          <span>Advanced Filters</span>
          <ChevronDown 
            className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} 
          />
        </button>
        
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-red-400 hover:text-red-300 underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Event Type Filter */}
          <div>
            <label className="text-sm font-medium text-white mb-2 block">Event Type</label>
            <div className="relative">
              <select
                value={selectedEventType}
                onChange={(e) => handleEventTypeChange(e.target.value)}
                className="w-full bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white appearance-none pr-8"
              >
                {eventTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
            </div>
          </div>

          {/* Crypto Asset Filter */}
          <div>
            <label className="text-sm font-medium text-white mb-2 block">Specific Asset</label>
            <div className="relative">
              <select
                value={selectedAsset}
                onChange={(e) => handleAssetChange(e.target.value)}
                className="w-full bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white appearance-none pr-8"
              >
                {cryptoAssets.map((asset) => (
                  <option key={asset.value} value={asset.value}>
                    {asset.symbol} {asset.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[#9f9fa9]">Active filters:</span>
          
          {selectedBucket !== 'all' && (
            <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs border border-orange-500/30">
              Bucket: {cryptoBuckets.find(b => b.value === selectedBucket)?.label}
            </span>
          )}
          
          {selectedTimeframe !== 'all' && (
            <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs border border-blue-500/30">
              Time: {timeframes.find(t => t.value === selectedTimeframe)?.label}
            </span>
          )}
          
          {selectedEventType !== 'all' && (
            <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs border border-green-500/30">
              Type: {eventTypes.find(t => t.value === selectedEventType)?.label}
            </span>
          )}
          
          {selectedAsset !== 'all' && (
            <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs border border-purple-500/30">
              Asset: {cryptoAssets.find(a => a.value === selectedAsset)?.label}
            </span>
          )}
        </div>
      )}

      {/* 5-minute markets highlight */}
      {(selectedTimeframe === '5M' || selectedTimeframe === '10M') && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-center gap-3">
          <Zap className="w-5 h-5 text-orange-400 flex-shrink-0" />
          <div>
            <div className="text-orange-400 font-medium text-sm">⚡ Ultra-fast markets selected</div>
            <div className="text-orange-300/80 text-xs">
              These markets resolve in {selectedTimeframe === '5M' ? '5 minutes' : '10 minutes'} - perfect for quick trading!
            </div>
          </div>
        </div>
      )}
    </div>
  );
};