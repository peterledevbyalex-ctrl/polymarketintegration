"use client"

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { PricePoint } from '@/types/polymarket.types';

type TimeRange = '5M' | '10M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

interface PriceChartProps {
  data: PricePoint[];
  isLoading: boolean;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  outcome: 'YES' | 'NO';
  valueMode?: 'probability' | 'price';
  priceLabel?: string;
  targetPrice?: number;
  height?: number;
  fillHeight?: boolean;
}

interface TooltipData {
  x: number;
  y: number;
  price: number;
  timestamp: number;
  index: number;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  isLoading,
  timeRange,
  onTimeRangeChange,
  outcome,
  valueMode = 'probability',
  priceLabel = 'Price',
  targetPrice,
  height = 360,
  fillHeight = false,
}) => {
  const timeRanges: TimeRange[] = ['5M', '10M', '1H', '6H', '1D', '1W', '1M', 'ALL'];
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const prevPriceRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [priceFlashDirection, setPriceFlashDirection] = useState<'up' | 'down' | null>(null);

  const { minPrice, maxPrice, priceChange, priceChangePercent } = useMemo(() => {
    if (data.length === 0) return { minPrice: 0, maxPrice: 1, priceChange: 0, priceChangePercent: 0 };
    
    const prices = data.map(d => d.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const firstPrice = data[0].p;
    const lastPrice = data[data.length - 1].p;
    const change = lastPrice - firstPrice;
    const changePercent = firstPrice > 0 ? (change / firstPrice) * 100 : 0;
    
    return {
      minPrice: min,
      maxPrice: max,
      priceChange: change,
      priceChangePercent: changePercent,
    };
  }, [data]);

  const svgPath = useMemo(() => {
    if (data.length === 0) return '';

    const width = 680;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 20, left: 20 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const yScale = (price: number) => {
      const range = maxPrice - minPrice || 0.1;
      return padding.top + chartHeight - ((price - minPrice) / range) * chartHeight;
    };

    const pathData = data.map((point, i) => {
      const x = xScale(i);
      const y = yScale(point.p);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');

    return pathData;
  }, [data, minPrice, maxPrice]);

  const areaPath = useMemo(() => {
    if (data.length === 0) return '';

    const width = 680;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 20, left: 20 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const yScale = (price: number) => {
      const range = maxPrice - minPrice || 0.1;
      return padding.top + chartHeight - ((price - minPrice) / range) * chartHeight;
    };

    const pathData = data.map((point, i) => {
      const x = xScale(i);
      const y = yScale(point.p);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');

    const lastX = xScale(data.length - 1);
    const firstX = xScale(0);
    const bottomY = padding.top + chartHeight;

    return `${pathData} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [data, minPrice, maxPrice]);

  const isPriceMode = valueMode === 'price';
  const isShortTimeRange = timeRange === '5M' || timeRange === '10M';
  const formatPrice = (price: number) =>
    isPriceMode
      ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `${(price * 100).toFixed(0)}¢`;

  const displayBounds = useMemo(() => {
    if (data.length === 0) {
      return { displayMin: 0, displayMax: isPriceMode ? 1 : 1 };
    }

    const pointsForBounds =
      isPriceMode && isShortTimeRange ? data.slice(-Math.min(60, data.length)) : data;
    const localMin = Math.min(...pointsForBounds.map((point) => point.p));
    const localMax = Math.max(...pointsForBounds.map((point) => point.p));
    const baseRange = localMax - localMin;
    const minVisibleRange = isPriceMode ? (isShortTimeRange ? 3 : 1) : 0.05;
    const padding = isPriceMode
      ? Math.max(
          baseRange * (isShortTimeRange ? 0.4 : 0.15),
          Math.abs(localMax) * (isShortTimeRange ? 0.0001 : 0.00002),
          isShortTimeRange ? 1.5 : 0.5
        )
      : (baseRange * 0.1 || 0.05);

    let displayMin = localMin - padding;
    let displayMax = localMax + padding;

    if (!isPriceMode) {
      displayMin = Math.max(0, displayMin);
      displayMax = Math.min(1, displayMax);
    }

    if (displayMax - displayMin < minVisibleRange) {
      const mid = (localMin + localMax) / 2;
      const half = minVisibleRange / 2;
      displayMin = mid - half;
      displayMax = mid + half;
      if (!isPriceMode) {
        displayMin = Math.max(0, displayMin);
        displayMax = Math.min(1, displayMax);
      }
    }

    return { displayMin, displayMax };
  }, [data, isPriceMode, isShortTimeRange]);

  const yAxisLabels = useMemo(() => {
    if (data.length === 0) return [];
    
    const range = displayBounds.displayMax - displayBounds.displayMin || 0.1;
    const numLabels = 5;
    const labels = [];
    
    for (let i = 0; i <= numLabels; i++) {
      const value = isPriceMode
        ? displayBounds.displayMax - (range * i / numLabels)
        : displayBounds.displayMin + (range * i / numLabels);
      labels.push(value);
    }
    
    return labels;
  }, [data, displayBounds.displayMin, displayBounds.displayMax, isPriceMode]);

  const color = isPriceMode ? '#f59e0b' : '#a855f7';
  const timeBounds = useMemo(() => {
    if (data.length === 0) return { firstTs: 0, lastTs: 1, range: 1 };
    const firstTs = data[0].t;
    const lastTs = data[data.length - 1].t;
    return { firstTs, lastTs, range: Math.max(0.0001, lastTs - firstTs) };
  }, [data]);

  // ALL useMemo hooks MUST be before any early returns (React Rules of Hooks)
  
  // Chart path with proper scaling
  const chartPath = useMemo(() => {
    if (data.length === 0) return '';
    if (data.length === 1) return `M 100 50 L 100 50`;
    
    const range = displayBounds.displayMax - displayBounds.displayMin || 0.1;
    
    const chartWidth = 100;
    const verticalPadding = 5; // 5% padding top/bottom
    
    return data.map((point, i) => {
      const x = ((point.t - timeBounds.firstTs) / timeBounds.range) * chartWidth;
      // Scale Y to fit within padded area (inverted - higher values at top)
      const normalizedY = (point.p - displayBounds.displayMin) / range;
      const y = (100 - verticalPadding) - (normalizedY * (100 - 2 * verticalPadding));
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
  }, [data, displayBounds.displayMin, displayBounds.displayMax, timeBounds.firstTs, timeBounds.range]);

  // Last point position for the dot
  const lastPointPos = useMemo(() => {
    if (data.length === 0) return { x: 0, y: 50 };
    
    const range = displayBounds.displayMax - displayBounds.displayMin || 0.1;
    
    const lastPoint = data[data.length - 1];
    const x = ((lastPoint.t - timeBounds.firstTs) / timeBounds.range) * 100;
    const normalizedY = (lastPoint.p - displayBounds.displayMin) / range;
    const y = 95 - (normalizedY * 90);
    
    return {
      x: Number.isFinite(x) ? x : 100,
      y: Number.isFinite(y) ? y : 50,
    };
  }, [data, displayBounds.displayMin, displayBounds.displayMax, timeBounds.firstTs, timeBounds.range]);

  // Generate X-axis date labels from data timestamps
  const xAxisLabels = useMemo(() => {
    if (data.length === 0) return [];
    
    const firstTs = data[0].t;
    const lastTs = data[data.length - 1].t;
    const numLabels = 5;
    const labels: string[] = [];
    
    for (let i = 0; i < numLabels; i++) {
      const ts = firstTs + ((lastTs - firstTs) * i / (numLabels - 1));
      const date = new Date(ts * 1000);
      
      // Format based on time range
      if (timeRange === '5M' || timeRange === '10M' || timeRange === '1H' || timeRange === '6H') {
        labels.push(date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      } else if (timeRange === '1D') {
        labels.push(date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      } else if (timeRange === '1W') {
        labels.push(date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
      } else {
        // 1M or ALL - show month
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
    }
    
    return labels;
  }, [data, timeRange]);

  // Computed values that depend on data
  const currentPrice = data.length > 0 ? data[data.length - 1].p : (isPriceMode ? 0 : 0.5);
  const targetYPercent = useMemo(() => {
    if (!isPriceMode || !Number.isFinite(targetPrice)) return null;
    const range = displayBounds.displayMax - displayBounds.displayMin || 0.1;
    const normalizedY = ((targetPrice as number) - displayBounds.displayMin) / range;
    const y = 95 - (normalizedY * 90);
    return Math.max(0, Math.min(100, y));
  }, [isPriceMode, targetPrice, displayBounds.displayMin, displayBounds.displayMax]);

  useEffect(() => {
    if (!isPriceMode || data.length === 0) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = currentPrice;
    if (prev === null || !Number.isFinite(prev) || prev === currentPrice) return;

    const direction: 'up' | 'down' = currentPrice > prev ? 'up' : 'down';
    setPriceFlashDirection(direction);

    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      setPriceFlashDirection(null);
    }, 420);
  }, [currentPrice, isPriceMode, data.length]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // Calculate point position for tooltip
  const getPointPosition = useCallback((index: number) => {
    if (data.length === 0) return { x: 0, y: 0 };
    
    const range = displayBounds.displayMax - displayBounds.displayMin || 0.1;
    
    const point = data[index];
    const x = ((point.t - timeBounds.firstTs) / timeBounds.range) * 100;
    const normalizedY = (point.p - displayBounds.displayMin) / range;
    const y = 95 - (normalizedY * 90);
    
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 50,
    };
  }, [data, displayBounds.displayMin, displayBounds.displayMax, timeBounds.firstTs, timeBounds.range]);

  // Handle mouse move on chart
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current || data.length === 0) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    if (!rect.width || !Number.isFinite(rect.width)) return;
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const targetTs = timeBounds.firstTs + timeBounds.range * percentage;

    let clampedIndex = 0;
    if (data.length > 1) {
      let left = 0;
      let right = data.length - 1;
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (data[mid].t < targetTs) left = mid + 1;
        else right = mid;
      }
      const rightIdx = left;
      const leftIdx = Math.max(0, rightIdx - 1);
      clampedIndex =
        Math.abs(data[rightIdx].t - targetTs) < Math.abs(data[leftIdx].t - targetTs)
          ? rightIdx
          : leftIdx;
    }
    
    const point = data[clampedIndex];
    const pos = getPointPosition(clampedIndex);

    const tooltipX = (pos.x / 100) * rect.width;
    const tooltipY = (pos.y / 100) * rect.height;
    if (!Number.isFinite(tooltipX) || !Number.isFinite(tooltipY)) return;
    
    setTooltip({
      x: tooltipX,
      y: tooltipY,
      price: point.p,
      timestamp: point.t,
      index: clampedIndex,
    });
  }, [data, getPointPosition, timeBounds.firstTs, timeBounds.range]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Format tooltip timestamp
  const formatTooltipTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    if (timeRange === '5M' || timeRange === '10M' || timeRange === '1H' || timeRange === '6H' || timeRange === '1D') {
      return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Early returns AFTER all hooks
  if (isLoading) {
    return (
      <div className={`rounded-[12px] border border-[#27272a] p-4 ${fillHeight ? 'h-full flex flex-col' : ''}`}
        style={{ background: 'radial-gradient(73.84% 84.68% at 50% 0%, rgba(205, 183, 255, 0.07) 0%, rgba(205, 183, 255, 0.00) 80.37%), #18181B' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-[#71717b]">Loading...</div>
          <div className="flex gap-1">
            {timeRanges.map((range) => (
              <button
                key={range}
                className={`px-2.5 py-1 text-xs rounded-md ${
                  timeRange === range ? 'bg-[#27272a] text-white' : 'text-[#71717b]'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className={`flex items-center justify-center ${fillHeight ? 'flex-1' : ''}`} style={!fillHeight ? { height: `${height - 50}px` } : undefined}>
          <div className="text-[#71717b]">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`rounded-[12px] border border-[#27272a] p-4 ${fillHeight ? 'h-full flex flex-col' : ''}`}
        style={{ background: 'radial-gradient(73.84% 84.68% at 50% 0%, rgba(205, 183, 255, 0.07) 0%, rgba(205, 183, 255, 0.00) 80.37%), #18181B' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            {timeRanges.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  timeRange === range
                    ? 'bg-[#27272a] text-white'
                    : 'text-[#71717b] hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className={`flex items-center justify-center ${fillHeight ? 'flex-1' : ''}`} style={!fillHeight ? { height: `${height - 50}px` } : undefined}>
          <div className="text-[#71717b]">No price history available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${fillHeight ? 'h-full flex flex-col' : ''}`}>
      <div className={`relative ${fillHeight ? 'flex-1' : ''}`}>
        {/* Main chart box */}
        <div 
          ref={chartRef}
          className={`rounded-[12px] border border-[#27272a] overflow-hidden relative cursor-crosshair ${fillHeight ? 'h-full' : ''}`}
          style={{ 
            ...(!fillHeight && { height: `${height}px` }),
            background: 'radial-gradient(73.84% 84.68% at 50% 0%, rgba(205, 183, 255, 0.07) 0%, rgba(205, 183, 255, 0.00) 80.37%), #18181B' 
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header overlay */}
          <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start">
            <div>
              <div className="text-base font-medium text-white mb-0.5">{isPriceMode ? priceLabel : outcome}</div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs transition-colors duration-150 ${
                    priceFlashDirection === 'up'
                      ? 'text-emerald-400'
                      : priceFlashDirection === 'down'
                      ? 'text-red-400'
                      : 'text-[#9F9FA9]'
                  }`}
                >
                  {isPriceMode ? formatPrice(currentPrice) : `${Math.round(currentPrice * 100)}% of predictions`}
                </span>
              </div>
              {!isPriceMode && (
                <div className="flex items-center gap-0 mt-2 w-[100px]">
                  <div className="h-1 bg-[#00ffa3] rounded-l-full" style={{ width: `${Math.round(currentPrice * 100)}%` }} />
                  <div className="w-2 h-2 rounded-full bg-white -mx-1 z-10 border-2 border-[#18181b]" />
                  <div className="h-1 bg-[#ff6b6b] rounded-r-full" style={{ width: `${100 - Math.round(currentPrice * 100)}%` }} />
                </div>
              )}
            </div>
            {/* Time range filters - moved left to avoid % scale */}
            <div className="flex gap-1 mr-12">
              {timeRanges.map((range) => (
                <button
                  key={range}
                  onClick={() => onTimeRangeChange(range)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    timeRange === range
                      ? 'bg-[#27272a] text-white'
                      : 'text-[#71717b] hover:text-white hover:bg-[#27272a]/50'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Y-axis labels - inside chart on right */}
          <div className="absolute right-3 top-0 bottom-0 flex flex-col justify-between text-xs text-[#71717b] py-4 z-10">
            {isPriceMode
              ? yAxisLabels.map((label) => (
                  <span key={label}>{formatPrice(label)}</span>
                ))
              : [80, 70, 60, 50, 40, 30, 20, 10, 0].map((percent) => (
                  <span key={percent}>{percent}%</span>
                ))}
          </div>

            {/* Prism logo watermark - centered */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="290" height="145" viewBox="0 0 267 66" fill="none" opacity="0.03">
                <path d="M126.393 11.1257C133.538 11.1257 139.237 15.312 139.237 22.8077C139.237 30.3034 133.538 34.5463 126.393 34.5463H113.747V51.8571H108.586V11.1257H126.393ZM113.747 30.162H125.599C130.702 30.162 134.105 27.5031 134.105 22.836C134.105 18.1406 130.702 15.51 125.599 15.51H113.747V30.162Z" fill="white"/>
                <path d="M143.769 23.034H148.589V26.4849H149.043C150.035 24.4483 151.85 22.9209 156.188 22.9209H160.214V27.2203H156.301C150.886 27.2203 148.759 30.1903 148.759 36.0454V51.8571H143.769V23.034Z" fill="white"/>
                <path d="M164.62 23.034H169.61V51.8571H164.62V23.034ZM164.251 18.1123V12.6531H170.036V18.1123H164.251Z" fill="white"/>
                <path d="M175.304 30.6711C175.304 25.5231 179.727 22.3834 187.127 22.3834C194.556 22.3834 199.149 25.5231 199.603 30.954V31.8026H195.01C194.811 27.8426 191.664 26.3151 187.156 26.3151C182.647 26.3151 180.095 27.8426 180.095 30.558C180.095 33.3017 182.279 34.2634 185.313 34.716L190.36 35.4797C196.059 36.3283 200 38.5629 200 43.7391C200 48.9154 195.86 52.5077 187.95 52.5077C180.067 52.5077 175.134 48.9154 174.708 43.7391V42.8906H179.33C179.67 46.7657 183.158 48.576 187.95 48.576C192.77 48.576 195.18 46.7374 195.18 43.9937C195.18 41.25 192.94 40.1469 189.254 39.6094L184.207 38.8457C178.905 38.0537 175.304 35.7626 175.304 30.6711Z" fill="white"/>
                <path d="M204.938 23.034H209.701V26.202H210.155C211.374 24.4766 213.643 22.3834 218.917 22.3834C223.935 22.3834 226.317 24.5331 227.338 27.0506H227.791C229.181 24.618 231.818 22.3834 237.403 22.3834C243.301 22.3834 247.157 25.5797 247.157 31.8309V51.8571H242.224V32.2834C242.224 28.4649 240.182 26.5414 236.184 26.5414C231.704 26.5414 228.529 29.0871 228.529 34.716V51.8571H223.595V32.2834C223.595 28.4649 221.61 26.5414 217.556 26.5414C213.076 26.5414 209.872 29.0871 209.872 34.716V51.8571H204.938V23.034Z" fill="white"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M73.2478 65.616V0L49.23 39.2903L73.2478 65.616Z" fill="white"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M68.1691 66L34.6926 62.7832L46.9448 42.7401L68.1691 66Z" fill="white"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M30.858 61.0691L44.0222 39.5334L35.9648 30.7036L0 27.2477L30.858 61.0691Z" fill="white"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M36.2535 26.5857L4.1488 23.5024L63.5707 1.95401L36.2535 26.5857Z" fill="white"/>
              </svg>
            </div>

            {/* Chart SVG */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* Horizontal grid lines */}
              {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((percent) => (
                <line
                  key={percent}
                  x1="0"
                  y1={percent}
                  x2="100"
                  y2={percent}
                  stroke="#27272a"
                  strokeWidth="0.65"
                  strokeDasharray="1 1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {/* Price line */}
              <path
                d={chartPath}
                fill="none"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
                vectorEffect="non-scaling-stroke"
                style={{ transition: 'd 220ms linear' }}
              />
              
              {/* Last point dot */}
              {data.length > 0 && (
                <circle
                  cx={lastPointPos.x}
                  cy={lastPointPos.y}
                  r="1"
                  fill={color}
                  filter="url(#glow)"
                  style={{ transition: 'cx 220ms linear, cy 220ms linear' }}
                />
              )}

              {/* Hover indicator line and dot */}
              {tooltip && (
                <>
                  {/* Vertical line */}
                  <line
                    x1={tooltip.x / (chartRef.current?.getBoundingClientRect().width || 1) * 100}
                    y1="0"
                    x2={tooltip.x / (chartRef.current?.getBoundingClientRect().width || 1) * 100}
                    y2="100"
                    stroke={color}
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    opacity="0.5"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}

              {isPriceMode && targetYPercent !== null && (
                <line
                  x1="0"
                  y1={targetYPercent}
                  x2="100"
                  y2={targetYPercent}
                  stroke="#6b7280"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                  opacity="0.8"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {isPriceMode && targetYPercent !== null && (
              <div
                className="absolute right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-[#4b5563]/90"
                style={{
                  top: `${targetYPercent}%`,
                  transform: 'translateY(-50%)',
                }}
              >
                Target
              </div>
            )}

            {/* Hover dot (outside SVG to avoid distortion) */}
            {tooltip && (
              <div 
                className="absolute z-20 pointer-events-none w-3 h-3 rounded-full border-2 border-[#18181b] shadow-lg"
                style={{
                  left: tooltip.x,
                  top: tooltip.y,
                  backgroundColor: color,
                  transform: 'translate(-50%, -50%)',
                  transition: 'left 140ms linear, top 140ms linear',
                }}
              />
            )}

            {/* Tooltip */}
            {tooltip && (
              <div 
                className="absolute z-20 pointer-events-none"
                style={{
                  left: tooltip.x,
                  top: tooltip.y,
                  transform: `translate(${tooltip.x > (chartRef.current?.getBoundingClientRect().width || 0) / 2 ? '-100%' : '0'}, -100%)`,
                }}
              >
                <div className="bg-[#27272a] border border-[#3f3f46] rounded-lg px-3 py-2 shadow-lg mb-2 whitespace-nowrap">
                  <div className="text-white font-semibold text-sm">
                    {isPriceMode ? formatPrice(tooltip.price) : `${(tooltip.price * 100).toFixed(1)}%`}
                  </div>
                  <div className="text-[#9f9fa9] text-xs">
                    {formatTooltipTime(tooltip.timestamp)}
                  </div>
                </div>
              </div>
            )}
          </div>

        {/* X-axis labels - below chart */}
        <div className="flex justify-between text-xs text-[#71717b] mt-2 px-1">
          {xAxisLabels.length > 0 ? (
            xAxisLabels.map((label, i) => (
              <span key={i}>{label}</span>
            ))
          ) : (
            <>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
