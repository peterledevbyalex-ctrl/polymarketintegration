"use client"

import React, { useState } from 'react';
import { ChevronDown, Star, Trophy, Target, TrendingUp, Calendar } from 'lucide-react';
import { useSportsMetadata, useSportsTeams, SPORTS_CATEGORIES, SportsCategory } from '@/hooks/useSports';

interface SportsFilterBarProps {
  onSportChange?: (sport: string) => void;
  onLeagueChange?: (league: string) => void;
  onTeamChange?: (team: string) => void;
  onMarketTypeChange?: (marketType: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
  initialSport?: string;
  initialLeague?: string;
  initialTeam?: string;
  initialMarketType?: string;
  initialTimeframe?: string;
}

const marketTypes = [
  { label: 'All Markets', value: 'all', icon: Trophy },
  { label: 'Game Winner', value: 'winner', icon: Trophy },
  { label: 'Point Spread', value: 'spread', icon: Target },
  { label: 'Over/Under', value: 'total', icon: TrendingUp },
  { label: 'Player Props', value: 'player_props', icon: Star },
];

const timeframes = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Live Games', value: 'live' },
  { label: 'Upcoming', value: 'upcoming' },
];

export const SportsFilterBar: React.FC<SportsFilterBarProps> = ({
  onSportChange,
  onLeagueChange,
  onTeamChange,
  onMarketTypeChange,
  onTimeframeChange,
  initialSport = 'all',
  initialLeague = 'all',
  initialTeam = 'all',
  initialMarketType = 'all',
  initialTimeframe = 'all',
}) => {
  const [selectedSport, setSelectedSport] = useState(initialSport);
  const [selectedLeague, setSelectedLeague] = useState(initialLeague);
  const [selectedTeam, setSelectedTeam] = useState(initialTeam);
  const [selectedMarketType, setSelectedMarketType] = useState(initialMarketType);
  const [selectedTimeframe, setSelectedTimeframe] = useState(initialTimeframe);
  
  const { metadata } = useSportsMetadata();
  const { teams } = useSportsTeams(
    selectedSport !== 'all' ? selectedSport : undefined,
    selectedLeague !== 'all' ? selectedLeague : undefined
  );

  const handleSportChange = (sport: string) => {
    setSelectedSport(sport);
    setSelectedLeague('all'); // Reset league when sport changes
    setSelectedTeam('all'); // Reset team when sport changes
    onSportChange?.(sport);
    onLeagueChange?.('all');
    onTeamChange?.('all');
  };

  const handleLeagueChange = (league: string) => {
    setSelectedLeague(league);
    setSelectedTeam('all'); // Reset team when league changes
    onLeagueChange?.(league);
    onTeamChange?.('all');
  };

  const handleTeamChange = (team: string) => {
    setSelectedTeam(team);
    onTeamChange?.(team);
  };

  const handleMarketTypeChange = (marketType: string) => {
    setSelectedMarketType(marketType);
    onMarketTypeChange?.(marketType);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
    onTimeframeChange?.(timeframe);
  };

  // Get available leagues for selected sport
  const availableLeagues = metadata?.leagues ? 
    Object.entries(metadata.leagues)
      .filter(([leagueKey]) => {
        if (selectedSport === 'all') return true;
        // Map sports to their leagues (this would be enhanced with real data)
        const sportLeagues: Record<string, string[]> = {
          'NFL': ['NFL'],
          'NBA': ['NBA'],
          'MLB': ['MLB'],
          'NHL': ['NHL'],
          'Soccer': ['Premier League', 'Champions League', 'MLS'],
          'Tennis': ['ATP', 'WTA'],
        };
        return sportLeagues[selectedSport]?.includes(leagueKey);
      }) : [];

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Sport Categories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleSportChange('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedSport === 'all'
              ? 'bg-blue-500 text-white'
              : 'bg-[#27272a] text-[#9f9fa9] hover:bg-[#3f3f46] hover:text-white'
          }`}
        >
          All Sports
        </button>
        
        {Object.entries(SPORTS_CATEGORIES).map(([key, category]) => (
          <div key={key} className="relative">
            <button
              onClick={() => handleSportChange(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedSport === key
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#27272a] text-[#9f9fa9] hover:bg-[#3f3f46] hover:text-white'
              }`}
            >
              <span>{category.icon}</span>
              {category.label}
            </button>
          </div>
        ))}
      </div>

      {/* Specific Sports (when category selected) */}
      {selectedSport !== 'all' && SPORTS_CATEGORIES[selectedSport as SportsCategory] && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-[#9f9fa9] self-center">Sports:</span>
          {SPORTS_CATEGORIES[selectedSport as SportsCategory].sports.map((sport) => (
            <button
              key={sport}
              onClick={() => handleSportChange(sport)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                selectedSport === sport
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-[#27272a] text-[#9f9fa9] hover:bg-[#3f3f46] hover:text-white'
              }`}
            >
              {sport}
            </button>
          ))}
        </div>
      )}

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* League Filter */}
        {availableLeagues.length > 0 && (
          <div className="relative">
            <select
              value={selectedLeague}
              onChange={(e) => handleLeagueChange(e.target.value)}
              className="bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white appearance-none pr-8 min-w-[120px]"
            >
              <option value="all">All Leagues</option>
              {availableLeagues.map(([leagueKey, league]) => (
                <option key={leagueKey} value={leagueKey}>
                  {league.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
          </div>
        )}

        {/* Team Filter */}
        {teams.length > 0 && (
          <div className="relative">
            <select
              value={selectedTeam}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white appearance-none pr-8 min-w-[140px]"
            >
              <option value="all">All Teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
          </div>
        )}

        {/* Market Type Filter */}
        <div className="flex gap-2">
          {marketTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                onClick={() => handleMarketTypeChange(type.value)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  selectedMarketType === type.value
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-[#27272a] text-[#9f9fa9] hover:bg-[#3f3f46] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{type.label}</span>
              </button>
            );
          })}
        </div>

        {/* Timeframe Filter */}
        <div className="relative ml-auto">
          <select
            value={selectedTimeframe}
            onChange={(e) => handleTimeframeChange(e.target.value)}
            className="bg-[#27272a] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white appearance-none pr-8 min-w-[120px]"
          >
            {timeframes.map((timeframe) => (
              <option key={timeframe.value} value={timeframe.value}>
                {timeframe.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9f9fa9] pointer-events-none" />
        </div>
      </div>

      {/* Active Filters Display */}
      {(selectedSport !== 'all' || selectedLeague !== 'all' || selectedTeam !== 'all' || selectedMarketType !== 'all' || selectedTimeframe !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-[#9f9fa9]">Active filters:</span>
          {selectedSport !== 'all' && (
            <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs border border-blue-500/30">
              Sport: {selectedSport}
            </span>
          )}
          {selectedLeague !== 'all' && (
            <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded text-xs border border-purple-500/30">
              League: {availableLeagues.find(([key]) => key === selectedLeague)?.[1]?.name || selectedLeague}
            </span>
          )}
          {selectedTeam !== 'all' && (
            <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs border border-orange-500/30">
              Team: {teams.find(t => t.id === selectedTeam)?.name || selectedTeam}
            </span>
          )}
          {selectedMarketType !== 'all' && (
            <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs border border-green-500/30">
              Type: {marketTypes.find(t => t.value === selectedMarketType)?.label}
            </span>
          )}
          {selectedTimeframe !== 'all' && (
            <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded text-xs border border-yellow-500/30">
              Time: {timeframes.find(t => t.value === selectedTimeframe)?.label}
            </span>
          )}
          
          <button
            onClick={() => {
              handleSportChange('all');
              handleLeagueChange('all');
              handleTeamChange('all');
              handleMarketTypeChange('all');
              handleTimeframeChange('all');
            }}
            className="text-xs text-red-400 hover:text-red-300 underline ml-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};