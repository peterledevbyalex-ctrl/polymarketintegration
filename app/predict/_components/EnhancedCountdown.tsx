"use client"

import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle } from 'lucide-react';

interface EnhancedCountdownProps {
  endTime: string | Date;
  className?: string;
  showIcon?: boolean;
  showProgress?: boolean;
  totalDuration?: number; // in seconds, for progress bar
  size?: 'sm' | 'md' | 'lg';
  theme?: 'default' | 'crypto' | 'urgent';
}

interface TimeRemaining {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const calculateTimeRemaining = (endTime: string | Date): TimeRemaining => {
  const end = new Date(endTime).getTime();
  const now = Date.now();
  const total = Math.max(0, end - now);
  
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((total % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((total % (1000 * 60)) / 1000)
  };
};

const getUrgencyLevel = (timeRemaining: TimeRemaining) => {
  const totalMinutes = timeRemaining.total / (1000 * 60);
  
  if (totalMinutes <= 0) return 'expired';
  if (totalMinutes <= 1) return 'critical';
  if (totalMinutes <= 5) return 'urgent';
  if (totalMinutes <= 30) return 'warning';
  return 'normal';
};

const getThemeColors = (theme: string, urgency: string) => {
  if (urgency === 'expired') {
    return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
  }
  
  switch (theme) {
    case 'crypto':
      switch (urgency) {
        case 'critical': return 'text-red-400 bg-red-400/20 border-red-400/30 animate-pulse';
        case 'urgent': return 'text-orange-400 bg-orange-400/20 border-orange-400/30';
        case 'warning': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
        default: return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      }
    case 'urgent':
      switch (urgency) {
        case 'critical': return 'text-red-400 bg-red-400/20 border-red-400/30 animate-pulse';
        case 'urgent': return 'text-red-400 bg-red-400/15 border-red-400/25';
        case 'warning': return 'text-yellow-400 bg-yellow-400/15 border-yellow-400/25';
        default: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      }
    default:
      switch (urgency) {
        case 'critical': return 'text-red-400 bg-red-400/20 border-red-400/30 animate-pulse';
        case 'urgent': return 'text-orange-400 bg-orange-400/15 border-orange-400/25';
        case 'warning': return 'text-yellow-400 bg-yellow-400/15 border-yellow-400/25';
        default: return 'text-green-400 bg-green-400/10 border-green-400/20';
      }
  }
};

const getSizeClasses = (size: string) => {
  switch (size) {
    case 'sm': return 'text-sm px-2 py-1';
    case 'lg': return 'text-xl px-4 py-3';
    default: return 'text-base px-3 py-2';
  }
};

const formatTimeDisplay = (timeRemaining: TimeRemaining, size: string) => {
  const { days, hours, minutes, seconds, total } = timeRemaining;
  
  if (total <= 0) return 'ENDED';
  
  // For very short timeframes (under 1 hour), show MM:SS
  if (days === 0 && hours === 0) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${mm}:${ss}`;
  }
  
  // For under 24 hours, show H:MM:SS
  if (days === 0) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hours}:${mm}:${ss}`;
  }
  
  // For longer periods, show days and hours
  return `${days}d ${hours}h ${minutes}m`;
};

export const EnhancedCountdown: React.FC<EnhancedCountdownProps> = ({
  endTime,
  className = '',
  showIcon = true,
  showProgress = false,
  totalDuration,
  size = 'md',
  theme = 'default'
}) => {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(
    calculateTimeRemaining(endTime)
  );
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(endTime));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [endTime]);
  
  const urgency = getUrgencyLevel(timeRemaining);
  const themeColors = getThemeColors(theme, urgency);
  const sizeClasses = getSizeClasses(size);
  
  const getStatusIcon = () => {
    switch (urgency) {
      case 'expired': return CheckCircle;
      case 'critical':
      case 'urgent': return AlertCircle;
      default: return Clock;
    }
  };
  
  const StatusIcon = getStatusIcon();
  const timeDisplay = formatTimeDisplay(timeRemaining, size);
  
  // Calculate progress percentage
  const progressPercent = totalDuration && timeRemaining.total > 0 
    ? Math.max(0, Math.min(100, (timeRemaining.total / 1000 / totalDuration) * 100))
    : 0;
  
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border font-mono ${themeColors} ${sizeClasses} ${className}`}>
      {showIcon && (
        <StatusIcon 
          className={`flex-shrink-0 ${
            size === 'sm' ? 'w-3 h-3' : 
            size === 'lg' ? 'w-5 h-5' : 
            'w-4 h-4'
          }`} 
        />
      )}
      
      <div className="flex flex-col">
        <div className={`font-bold ${size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          {timeDisplay}
        </div>
        
        {showProgress && totalDuration && urgency !== 'expired' && (
          <div className="w-full bg-gray-700 rounded-full h-1 mt-1">
            <div 
              className={`h-1 rounded-full transition-all duration-1000 ${
                urgency === 'critical' ? 'bg-red-400' :
                urgency === 'urgent' ? 'bg-orange-400' :
                urgency === 'warning' ? 'bg-yellow-400' :
                'bg-green-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
      
      {urgency === 'critical' && (
        <div className="flex-shrink-0 w-2 h-2 bg-red-400 rounded-full animate-ping" />
      )}
    </div>
  );
};