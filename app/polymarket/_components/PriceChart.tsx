"use client"

import React, { useMemo } from 'react';
import { PricePoint } from '@/types/polymarket.types';

type TimeRange = '5M' | '10M' | '1H' | '6H' | '1D' | '1W' | '1M' | 'ALL';

interface PriceChartProps {
  data: PricePoint[];
  isLoading: boolean;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  outcome: 'YES' | 'NO';
}

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  isLoading,
  timeRange,
  onTimeRangeChange,
  outcome,
}) => {
  const timeRanges: TimeRange[] = ['5M', '10M', '1H', '6H', '1D', '1W', '1M', 'ALL'];

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
    const height = 240;
    const padding = { top: 20, right: 20, bottom: 30, left: 20 };
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
    const height = 240;
    const padding = { top: 20, right: 20, bottom: 30, left: 20 };
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

  const formatPrice = (price: number) => `${(price * 100).toFixed(0)}¢`;

  const yAxisLabels = useMemo(() => {
    if (data.length === 0) return [];
    
    const range = maxPrice - minPrice || 0.1;
    const numLabels = 5;
    const labels = [];
    
    for (let i = 0; i <= numLabels; i++) {
      const value = minPrice + (range * i / numLabels);
      labels.push(value);
    }
    
    return labels;
  }, [data, minPrice, maxPrice]);

  const color = outcome === 'YES' ? '#10b981' : '#ef4444';

  if (isLoading) {
    return (
      <div className="rounded-xl bg-[#1a1f2e] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {timeRanges.map((range) => (
              <button
                key={range}
                className="px-3 py-1.5 text-xs rounded bg-[#2a2f3e] text-gray-400"
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center h-60">
          <div className="text-gray-500">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-[#1a1f2e] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {timeRanges.map((range) => (
              <button
                key={range}
                onClick={() => onTimeRangeChange(range)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  timeRange === range
                    ? 'bg-[#3a3f4e] text-white'
                    : 'bg-[#2a2f3e] text-gray-400 hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center h-60">
          <div className="text-gray-500">No price history available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#1a1f2e] p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {timeRanges.map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                timeRange === range
                  ? 'bg-[#3a3f4e] text-white'
                  : 'bg-[#2a2f3e] text-gray-400 hover:text-white'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">
            {formatPrice(data[data.length - 1].p)}
          </div>
          <div className={`text-sm ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          width="100%"
          height="240"
          viewBox="0 0 680 240"
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          <defs>
            <linearGradient id={`gradient-${outcome}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {yAxisLabels.map((label) => {
            const y = 20 + 200 - ((label - minPrice) / (maxPrice - minPrice || 0.1)) * 200;
            return (
              <g key={label}>
                <line
                  x1="20"
                  y1={y}
                  x2="660"
                  y2={y}
                  stroke="#2a2f3e"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x="665"
                  y={y + 4}
                  fill="#6b7280"
                  fontSize="11"
                  textAnchor="start"
                >
                  {(label * 100).toFixed(0)}%
                </text>
              </g>
            );
          })}

          <path
            d={areaPath}
            fill={`url(#gradient-${outcome})`}
          />

          <path
            d={svgPath}
            fill="none"
            stroke={color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="text-xs text-gray-500 mt-2">
          Chart data loaded: {data.length} points
        </div>
      </div>
    </div>
  );
};
