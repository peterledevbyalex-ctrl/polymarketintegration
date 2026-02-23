"use client"

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, Lock, Play, Pause } from 'lucide-react';
import { Market } from '@/types/polymarket.types';

interface RoundInfo {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: 'completed' | 'active' | 'upcoming';
  volume?: number;
  outcome?: 'UP' | 'DOWN' | null;
  priceStart?: number;
  priceEnd?: number;
}

interface RoundsNavigationProps {
  currentMarket: Market;
  onRoundSelect?: (roundId: string) => void;
  className?: string;
}

const formatRoundTime = (timeString: string) => {
  const date = new Date(timeString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York' // ET timezone
  });
};

const formatTimeRemaining = (endTime: string) => {
  const now = new Date();
  const end = new Date(endTime);
  const diff = end.getTime() - now.getTime();
  
  if (diff <= 0) return "00:00";
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const generateMockRounds = (currentMarket: Market): RoundInfo[] => {
  const rounds: RoundInfo[] = [];
  const baseTime = new Date();
  
  // Parse current market time from title if available
  if (currentMarket.question.includes('February 23')) {
    const timeMatch = currentMarket.question.match(/(\d+:\d+AM)-(\d+:\d+AM)/);
    if (timeMatch) {
      const [, startStr, endStr] = timeMatch;
      const today = new Date().toDateString();
      const startTime = new Date(`${today} ${startStr} EST`);
      const endTime = new Date(`${today} ${endStr} EST`);
      
      // Generate previous round
      const prevStart = new Date(startTime.getTime() - 5 * 60000);
      const prevEnd = new Date(startTime);
      rounds.push({
        id: 'prev-round',
        title: `Bitcoin Up or Down - ${formatRoundTime(prevStart.toISOString())}-${formatRoundTime(prevEnd.toISOString())} ET`,
        startTime: prevStart.toISOString(),
        endTime: prevEnd.toISOString(),
        status: 'completed',
        volume: 1200,
        outcome: 'UP',
        priceStart: 66278.52,
        priceEnd: 66356.38,
      });
      
      // Current round
      rounds.push({
        id: 'current-round',
        title: currentMarket.question,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        status: 'active',
        volume: 1800,
        priceStart: 66278.52,
      });
      
      // Next round
      const nextStart = new Date(endTime);
      const nextEnd = new Date(endTime.getTime() + 5 * 60000);
      rounds.push({
        id: 'next-round',
        title: `Bitcoin Up or Down - ${formatRoundTime(nextStart.toISOString())}-${formatRoundTime(nextEnd.toISOString())} ET`,
        startTime: nextStart.toISOString(),
        endTime: nextEnd.toISOString(),
        status: 'upcoming',
      });
    }
  }
  
  return rounds.length > 0 ? rounds : [
    {
      id: 'current-round',
      title: currentMarket.question,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 5 * 60000).toISOString(),
      status: 'active',
    }
  ];
};

export const RoundsNavigation: React.FC<RoundsNavigationProps> = ({
  currentMarket,
  onRoundSelect,
  className = ''
}) => {
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(1); // Start with current round
  const [timeRemaining, setTimeRemaining] = useState<string>('00:00');

  useEffect(() => {
    const mockRounds = generateMockRounds(currentMarket);
    setRounds(mockRounds);
    
    // Find active round
    const activeIndex = mockRounds.findIndex(r => r.status === 'active');
    if (activeIndex !== -1) {
      setCurrentRoundIndex(activeIndex);
    }
  }, [currentMarket]);

  useEffect(() => {
    if (rounds.length === 0) return;
    
    const activeRound = rounds.find(r => r.status === 'active');
    if (!activeRound) return;
    
    const updateTimer = () => {
      setTimeRemaining(formatTimeRemaining(activeRound.endTime));
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [rounds]);

  const handleRoundSelect = (index: number) => {
    if (index >= 0 && index < rounds.length) {
      setCurrentRoundIndex(index);
      onRoundSelect?.(rounds[index].id);
    }
  };

  const getStatusColor = (status: RoundInfo['status']) => {
    switch (status) {
      case 'completed': return 'text-gray-400';
      case 'active': return 'text-green-400';
      case 'upcoming': return 'text-blue-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: RoundInfo['status']) => {
    switch (status) {
      case 'completed': return Lock;
      case 'active': return Play;
      case 'upcoming': return Clock;
      default: return Clock;
    }
  };

  const getOutcomeDisplay = (round: RoundInfo) => {
    if (round.status === 'completed' && round.outcome && round.priceStart && round.priceEnd) {
      const change = round.priceEnd - round.priceStart;
      const changePercent = ((change / round.priceStart) * 100).toFixed(2);
      const isUp = change > 0;
      
      return (
        <div className={`text-sm font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
          {isUp ? '↗' : '↘'} {round.outcome} ({isUp ? '+' : ''}{changePercent}%)
        </div>
      );
    }
    
    if (round.status === 'active') {
      return (
        <div className="text-sm text-green-400 font-medium">
          Live • {timeRemaining}
        </div>
      );
    }
    
    return (
      <div className="text-sm text-gray-500">
        Waiting...
      </div>
    );
  };

  if (rounds.length === 0) return null;

  return (
    <div className={`bg-[#1a1a1a] rounded-xl border border-[#27272a] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#27272a] bg-[#0f0f0f]">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-400" />
            Trading Rounds
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleRoundSelect(currentRoundIndex - 1)}
              disabled={currentRoundIndex <= 0}
              className="p-1 rounded hover:bg-[#27272a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <button
              onClick={() => handleRoundSelect(currentRoundIndex + 1)}
              disabled={currentRoundIndex >= rounds.length - 1}
              className="p-1 rounded hover:bg-[#27272a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Rounds Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rounds.map((round, index) => {
            const StatusIcon = getStatusIcon(round.status);
            const isSelected = index === currentRoundIndex;
            
            return (
              <button
                key={round.id}
                onClick={() => handleRoundSelect(index)}
                className={`p-4 rounded-lg border transition-all text-left relative overflow-hidden ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-[#27272a] bg-[#27272a] hover:bg-[#3f3f46]'
                }`}
              >
                {/* Status indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className={`flex items-center gap-1 text-xs font-medium ${getStatusColor(round.status)}`}>
                    <StatusIcon className="w-3 h-3" />
                    {round.status === 'completed' ? 'LAST ROUND' : 
                     round.status === 'active' ? 'CURRENT ROUND' : 
                     'UPCOMING ROUND'}
                  </div>
                  {round.volume && (
                    <div className="text-xs text-gray-500">
                      ${(round.volume / 1000).toFixed(1)}k vol
                    </div>
                  )}
                </div>

                {/* Time display */}
                <div className="text-white text-sm font-medium mb-1">
                  {formatRoundTime(round.startTime)} - {formatRoundTime(round.endTime)} ET
                </div>
                
                {/* Date */}
                <div className="text-xs text-gray-500 mb-2">
                  {new Date(round.startTime).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>

                {/* Outcome/Status */}
                {getOutcomeDisplay(round)}

                {/* Active round pulse animation */}
                {round.status === 'active' && (
                  <div className="absolute top-0 right-0 w-2 h-2 bg-green-400 rounded-full animate-pulse m-2" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick stats for active round */}
      {rounds[currentRoundIndex]?.status === 'active' && (
        <div className="px-4 pb-4">
          <div className="bg-[#0f0f0f] rounded-lg p-3 border border-[#27272a]">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-gray-400 text-xs">PRICE TO BEAT</div>
                <div className="text-white text-sm font-mono">
                  ${rounds[currentRoundIndex].priceStart?.toLocaleString() || '66,278.52'}
                </div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">CURRENT PRICE</div>
                <div className="text-orange-400 text-sm font-mono">
                  $66,356.38
                </div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">TIME LEFT</div>
                <div className="text-green-400 text-sm font-mono">
                  {timeRemaining}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};