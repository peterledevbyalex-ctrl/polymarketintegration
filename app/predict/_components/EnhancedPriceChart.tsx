"use client"

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { PricePoint } from '@/types/polymarket.types';

type TimeRange = '5M' | '10M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

interface EnhancedPriceChartProps {
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
  isCryptoMarket?: boolean;
  marketTitle?: string;
}

interface TooltipData {
  x: number;
  y: number;
  price: number;
  timestamp: number;
  index: number;
}

export const EnhancedPriceChart: React.FC<EnhancedPriceChartProps> = ({
  data,
  isLoading,
  timeRange,
  onTimeRangeChange,
  outcome,
  valueMode = 'probability',
  priceLabel = 'Price',
  targetPrice,
  height = 400,
  fillHeight = false,
  isCryptoMarket = false,
  marketTitle = '',
}) => {
  const timeRanges: TimeRange[] = ['5M', '10M', '1H', '6H', '1D', '1W', '1M', 'ALL'];
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
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

  // Generate smooth curve path
  const svgPath = useMemo(() => {
    if (data.length === 0) return '';

    const width = 680;
    const height = 300; // Taller chart
    const padding = { top: 40, right: 60, bottom: 50, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const yScale = (price: number) => {
      const range = maxPrice - minPrice || 0.1;
      return padding.top + chartHeight - ((price - minPrice) / range) * chartHeight;
    };

    if (data.length < 2) return '';
    
    let pathData = '';
    
    for (let i = 0; i < data.length; i++) {
      const x = xScale(i);
      const y = yScale(data[i].p);
      
      if (i === 0) {
        pathData += `M ${x} ${y}`;
      } else {
        const prevX = xScale(i - 1);
        const prevY = yScale(data[i - 1].p);
        
        // Smooth curve with control points
        const cpX1 = prevX + (x - prevX) * 0.4;
        const cpY1 = prevY;
        const cpX2 = prevX + (x - prevX) * 0.6;
        const cpY2 = y;
        
        pathData += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
      }
    }

    return pathData;
  }, [data, minPrice, maxPrice]);

  // Generate area path
  const areaPath = useMemo(() => {
    if (data.length === 0) return '';

    const width = 680;
    const height = 300;
    const padding = { top: 40, right: 60, bottom: 50, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const xScale = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const yScale = (price: number) => {
      const range = maxPrice - minPrice || 0.1;
      return padding.top + chartHeight - ((price - minPrice) / range) * chartHeight;
    };

    const bottomY = padding.top + chartHeight;
    
    let pathData = svgPath;
    
    if (pathData && data.length > 0) {
      pathData += ` L ${xScale(data.length - 1)} ${bottomY}`;
      pathData += ` L ${xScale(0)} ${bottomY}`;
      pathData += ' Z';
    }

    return pathData;
  }, [svgPath, data, minPrice, maxPrice]);

  // Grid lines and labels
  const gridData = useMemo(() => {
    if (data.length === 0) return null;
    
    const width = 680;
    const height = 300;
    const padding = { top: 40, right: 60, bottom: 50, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Price levels (horizontal lines)
    const priceRange = maxPrice - minPrice || 0.1;
    const priceStep = priceRange / 5;
    const priceLines = [];
    
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + (priceStep * i);
      const y = padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
      priceLines.push({ y, price });
    }
    
    // Time levels (vertical lines)
    const timeStep = Math.max(1, Math.floor(data.length / 6));
    const timeLines = [];
    
    for (let i = 0; i < data.length; i += timeStep) {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      timeLines.push({
        x,
        time: data[i]?.t || 0,
      });
    }
    
    return {
      width,
      height,
      padding,
      priceLines,
      timeLines,
    };
  }, [data, minPrice, maxPrice]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!chartRef.current || !gridData) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const chartX = x - gridData.padding.left;
    const progress = Math.max(0, Math.min(1, chartX / (gridData.width - gridData.padding.left - gridData.padding.right)));
    const dataIndex = Math.round(progress * (data.length - 1));
    
    if (dataIndex >= 0 && dataIndex < data.length) {
      setTooltip({
        x,
        y,
        price: data[dataIndex].p,
        timestamp: data[dataIndex].t,
        index: dataIndex,
      });
    }
  }, [data, gridData]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Flash effect on price change
  useEffect(() => {
    if (data.length < 2) return;
    
    const currentPrice = data[data.length - 1].p;
    const prevPrice = data[data.length - 2].p;
    
    if (currentPrice > prevPrice) {
      setPriceFlashDirection('up');
    } else if (currentPrice < prevPrice) {
      setPriceFlashDirection('down');
    }
    
    const timer = setTimeout(() => setPriceFlashDirection(null), 500);
    return () => clearTimeout(timer);
  }, [data]);

  return (
    <div className="w-full">
      {/* Enhanced header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            {isCryptoMarket && (
              <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                ₿
              </div>
            )}
            
            <div>
              <div className="text-3xl font-bold text-white font-mono tracking-tight">
                {data.length > 0 ? `$${data[data.length - 1].p.toLocaleString()}` : priceLabel}
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Range: ${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}
              </div>
            </div>
            
            {priceChange !== 0 && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                priceChangePercent >= 0 
                  ? 'text-green-400 bg-green-400/10 border-green-400/20' 
                  : 'text-red-400 bg-red-400/10 border-red-400/20'
              }`}>
                <span className="text-xl">{priceChangePercent >= 0 ? '↗' : '↘'}</span>
                <div className="font-mono font-medium">
                  {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                </div>
              </div>
            )}
          </div>
          
          {targetPrice && (
            <div className="flex items-center gap-2 text-sm text-orange-400 bg-orange-400/10 px-4 py-2 rounded-lg border border-orange-400/20">
              <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
              Target: ${targetPrice.toLocaleString()}
            </div>
          )}
        </div>
        
        {/* Enhanced time range selector */}
        <div className="flex gap-1 bg-[#1a1a1a] p-2 rounded-xl border border-[#27272a]">
          {timeRanges.map((range) => {
            const isActive = timeRange === range;
            const isFastRange = range === '5M' || range === '10M';
            
            return (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive
                    ? isFastRange 
                      ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg shadow-orange-500/25' 
                      : 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                    : 'text-[#9f9fa9] hover:text-white hover:bg-[#3f3f46]'
                }`}
              >
                {range}
                {isFastRange && !isActive && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full animate-pulse border-2 border-[#1a1a1a]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Enhanced chart container */}
      <div 
        className={`relative bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] rounded-xl border border-[#27272a] overflow-hidden shadow-2xl ${
          fillHeight ? 'flex-1 min-h-0' : ''
        }`}
        style={{ height: fillHeight ? undefined : `${height}px` }}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[#9f9fa9] flex items-center gap-3">
              <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-lg">Loading chart data...</span>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[#9f9fa9] text-lg">No data available</div>
          </div>
        ) : gridData ? (
          <>
            <div 
              ref={chartRef} 
              className="absolute inset-0 cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <svg width="100%" height="100%" className="overflow-visible">
                <defs>
                  {/* Enhanced gradient */}
                  <linearGradient id={`gradient-${outcome}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={outcome === 'YES' ? '#10b981' : '#ef4444'} stopOpacity="0.6" />
                    <stop offset="30%" stopColor={outcome === 'YES' ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
                    <stop offset="70%" stopColor={outcome === 'YES' ? '#10b981' : '#ef4444'} stopOpacity="0.1" />
                    <stop offset="100%" stopColor={outcome === 'YES' ? '#10b981' : '#ef4444'} stopOpacity="0.02" />
                  </linearGradient>
                  
                  {/* Glow effect */}
                  <filter id={`glow-${outcome}`}>
                    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                    <feMerge> 
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                
                {/* Grid */}
                <g className="opacity-30">
                  {/* Horizontal grid lines */}
                  {gridData.priceLines.map((line, i) => (
                    <g key={`h-${i}`}>
                      <line
                        x1={gridData.padding.left}
                        y1={line.y}
                        x2={gridData.width - gridData.padding.right}
                        y2={line.y}
                        stroke="#374151"
                        strokeWidth="1"
                        strokeDasharray="3,6"
                      />
                      <text
                        x={gridData.padding.left - 10}
                        y={line.y + 5}
                        textAnchor="end"
                        className="text-xs fill-gray-400 font-mono"
                      >
                        ${Math.round(line.price).toLocaleString()}
                      </text>
                    </g>
                  ))}
                  
                  {/* Vertical grid lines */}
                  {gridData.timeLines.map((line, i) => (
                    <g key={`v-${i}`}>
                      <line
                        x1={line.x}
                        y1={gridData.padding.top}
                        x2={line.x}
                        y2={gridData.height - gridData.padding.bottom}
                        stroke="#374151"
                        strokeWidth="1"
                        strokeDasharray="3,6"
                      />
                      <text
                        x={line.x}
                        y={gridData.height - gridData.padding.bottom + 20}
                        textAnchor="middle"
                        className="text-xs fill-gray-400"
                      >
                        {new Date(line.time * 1000).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </text>
                    </g>
                  ))}
                </g>
                
                {/* Target price line */}
                {targetPrice && targetPrice >= minPrice && targetPrice <= maxPrice && (
                  <g>
                    <line
                      x1={gridData.padding.left}
                      y1={gridData.padding.top + (gridData.height - gridData.padding.top - gridData.padding.bottom) * (1 - (targetPrice - minPrice) / (maxPrice - minPrice))}
                      x2={gridData.width - gridData.padding.right}
                      y2={gridData.padding.top + (gridData.height - gridData.padding.top - gridData.padding.bottom) * (1 - (targetPrice - minPrice) / (maxPrice - minPrice))}
                      stroke="#f59e0b"
                      strokeWidth="3"
                      strokeDasharray="10,5"
                      className="opacity-80"
                    />
                    <text
                      x={gridData.width - gridData.padding.right + 10}
                      y={gridData.padding.top + (gridData.height - gridData.padding.top - gridData.padding.bottom) * (1 - (targetPrice - minPrice) / (maxPrice - minPrice)) + 5}
                      className="text-xs fill-orange-400 font-medium"
                    >
                      Target
                    </text>
                  </g>
                )}
                
                {/* Area fill */}
                {areaPath && (
                  <path
                    d={areaPath}
                    fill={`url(#gradient-${outcome})`}
                    className="transition-all duration-300"
                  />
                )}
                
                {/* Main line */}
                <path
                  d={svgPath}
                  fill="none"
                  stroke={outcome === 'YES' ? '#10b981' : '#ef4444'}
                  strokeWidth="4"
                  filter={`url(#glow-${outcome})`}
                  className={`transition-all duration-300 ${
                    priceFlashDirection === 'up' ? 'brightness-150 drop-shadow-lg' : 
                    priceFlashDirection === 'down' ? 'brightness-75' : ''
                  }`}
                />
                
                {/* Current price indicator */}
                {data.length > 0 && (
                  <circle
                    cx={gridData.padding.left + ((data.length - 1) / (data.length - 1)) * (gridData.width - gridData.padding.left - gridData.padding.right)}
                    cy={gridData.padding.top + (gridData.height - gridData.padding.top - gridData.padding.bottom) * (1 - (data[data.length - 1].p - minPrice) / (maxPrice - minPrice))}
                    r="6"
                    fill={outcome === 'YES' ? '#10b981' : '#ef4444'}
                    stroke="white"
                    strokeWidth="2"
                    className="animate-pulse drop-shadow-lg"
                  />
                )}
              </svg>
            </div>
            
            {/* Enhanced tooltip */}
            {tooltip && (
              <div
                className="absolute pointer-events-none z-20 bg-black/95 backdrop-blur-lg text-white rounded-xl px-5 py-4 border border-[#27272a] shadow-2xl"
                style={{
                  left: tooltip.x,
                  top: tooltip.y - 100,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="font-mono text-xl font-bold text-white mb-2">
                  ${tooltip.price.toLocaleString()}
                </div>
                <div className="text-sm text-[#9f9fa9]">
                  {new Date(tooltip.timestamp * 1000).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                  })}
                </div>
                {targetPrice && (
                  <div className={`text-sm mt-2 font-medium ${
                    tooltip.price > targetPrice ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {tooltip.price > targetPrice ? '↗ Above' : '↘ Below'} target
                    <div className="font-mono">
                      ${Math.abs(tooltip.price - targetPrice).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};