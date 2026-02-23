"use client"

import { useEffect, useState, useMemo, useRef } from 'react';
import { Address } from 'viem';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

import { ETH_ADDRESS, STABLE_COINS, USDC_ADDRESS, WETH_ADDRESS } from '@/config.app';
import { formatNumber, formatUsd } from '@/lib/ui_utils';
import { usePoolDayData } from '@/hooks/usePoolDayData';
import { usePoolHourData } from '@/hooks/usePoolHourData';
import { PoolDayData, PoolHourData } from '@/types';

type PoolChartProps = {
    poolAddress: Address,
    token0Id: Address,
    token1Id: Address,
    token0Symbol: string,
    token1Symbol: string,
    ethUsd: string,
    initialTvlUsd: string,
    initialVolumeUsd: string,
    initialFeesUsd: string,
    initialApr24h: string,
    initialToken0Price: string,
    initialToken1Price: string,
}

type MetricKey = 'tvlUSD' | 'volumeUSD' | 'price' | 'feesUSD' | 'apr24h';

const METRICS: { key: MetricKey; label: string; showTotal?: boolean }[] = [
    { key: 'tvlUSD', label: 'TVL' },
    { key: 'volumeUSD', label: 'Volume', showTotal: true },
    { key: 'price', label: 'Price' },
    { key: 'feesUSD', label: 'Fees', showTotal: true },
    { key: 'apr24h', label: 'APR' },
];

type PriceMode =
    | { kind: 'usd' }
    | { kind: 'token'; symbol: string };

const isEthLike = (tokenId: Address, symbol: string): boolean => {
    const id = tokenId.toLowerCase();
    if (id === ETH_ADDRESS.toLowerCase() || id === WETH_ADDRESS.toLowerCase()) return true;
    return symbol === 'ETH' || symbol === 'WETH';
};

const isStableLike = (tokenId: Address, symbol: string): boolean => {
    const id = tokenId.toLowerCase();
    if (id === USDC_ADDRESS.toLowerCase()) return true;
    if (STABLE_COINS.includes(id)) return true;
    return symbol === 'USDC' || symbol === 'USDT' || symbol === 'DAI';
};

export const BarChart: React.FC<PoolChartProps> = ({
    poolAddress,
    token0Id,
    token1Id,
    token0Symbol,
    token1Symbol,
    ethUsd,
    initialTvlUsd,
    initialVolumeUsd,
    initialFeesUsd,
    initialApr24h,
    initialToken0Price,
    initialToken1Price,
}) => {
    const [metric, setMetric] = useState<MetricKey>('tvlUSD');
    const [period, setPeriod] = useState('30d');
    const [chartData, setChartData] = useState<Record<string, unknown>[]>([]);
    const [hoveredValue, setHoveredValue] = useState<number | null>(null);
    const [hoveredDate, setHoveredDate] = useState<string | null>(null);

    const { poolDayData, poolDayDataInitialized, fetchPoolDayData } = usePoolDayData(poolAddress, false);
    const { poolHourData, poolHourDataInitialized, fetchPoolHourData } = usePoolHourData(poolAddress, false);

    const fetchDayDataRef = useRef(fetchPoolDayData);
    const fetchHourDataRef = useRef(fetchPoolHourData);
    fetchDayDataRef.current = fetchPoolDayData;
    fetchHourDataRef.current = fetchPoolHourData;

    const poolDayDataRef = useRef(poolDayData);
    const poolHourDataRef = useRef(poolHourData);
    poolDayDataRef.current = poolDayData;
    poolHourDataRef.current = poolHourData;

    const gradientId = `gradient-${metric}`;
    const limit = period === '30d' ? 30 : 7 * 24;

    const ethUsdNumber = useMemo(() => {
        const n = Number(ethUsd);
        return Number.isFinite(n) ? n : 0;
    }, [ethUsd]);


    const priceMode: PriceMode = useMemo(() => {
        const hasStableQuote = isStableLike(token0Id, token0Symbol) || isStableLike(token1Id, token1Symbol);
        if (hasStableQuote) return { kind: 'usd' };

        const hasEthQuote = isEthLike(token0Id, token0Symbol) || isEthLike(token1Id, token1Symbol);
        if (hasEthQuote && ethUsdNumber > 0) return { kind: 'usd' };
        if (isEthLike(token0Id, token0Symbol) || isEthLike(token1Id, token1Symbol)) return { kind: 'token', symbol: 'ETH' };
        return { kind: 'token', symbol: token1Symbol };
    }, [ethUsdNumber, token0Id, token0Symbol, token1Id, token1Symbol]);

    const priceUnitSymbol = priceMode.kind === 'token' ? priceMode.symbol : null;

    const isPercent = metric === 'apr24h';
    const isUsd = metric !== 'apr24h' && metric !== 'price' ? true : metric === 'price' ? priceMode.kind === 'usd' : false;
    const unitPrefix = isPercent ? '' : isUsd ? '$' : '';
    const unitSuffix = isPercent ? '%' : metric === 'price' && !isUsd && priceUnitSymbol ? ` ${priceUnitSymbol}` : '';


    const normalizeTokenInEth = (tokenInEthRaw: number): number => {
        if (!Number.isFinite(tokenInEthRaw) || tokenInEthRaw <= 0) return 0;

        if (priceMode.kind !== 'usd') return tokenInEthRaw;

        const usd = tokenInEthRaw * ethUsdNumber;
        if (!Number.isFinite(usd)) return 0;

        const absurdUsdThreshold = 100_000;
        if (usd <= absurdUsdThreshold) return tokenInEthRaw;

        const reciprocal = 1 / tokenInEthRaw;
        const reciprocalUsd = reciprocal * ethUsdNumber;
        if (Number.isFinite(reciprocalUsd) && reciprocalUsd > 0 && reciprocalUsd < absurdUsdThreshold) {
            return reciprocal;
        }

        return tokenInEthRaw;
    };


    const normalizeTokenInUsd = (tokenInUsdRaw: number): number => {
        if (!Number.isFinite(tokenInUsdRaw) || tokenInUsdRaw <= 0) return 0;

        const absurdUsdThreshold = 100_000;
        if (tokenInUsdRaw <= absurdUsdThreshold) return tokenInUsdRaw;

        const reciprocal = 1 / tokenInUsdRaw;
        if (Number.isFinite(reciprocal) && reciprocal > 0 && reciprocal < absurdUsdThreshold) {
            return reciprocal;
        }

        return tokenInUsdRaw;
    };


    const toChartPoint = (point: Record<string, unknown>): Record<string, unknown> => {
        const token0Price = Number(point.token0Price);
        const token1Price = Number(point.token1Price);

        if (priceMode.kind === 'usd' && (isStableLike(token0Id, token0Symbol) || isStableLike(token1Id, token1Symbol))) {
            if (isStableLike(token0Id, token0Symbol)) { // ex: USDC/PBTC | USDC/Test03
                const token0InUsdRaw = Number.isFinite(token0Price) ? token0Price : 0;
                return { ...point, price: normalizeTokenInUsd(token0InUsdRaw) };
            }

            if (isStableLike(token1Id, token1Symbol)) { // ex: WETH/USDC | TEST04/USDC
                const token1InUsdRaw = Number.isFinite(token1Price) ? token1Price : 0;
                return { ...point, price: normalizeTokenInUsd(token1InUsdRaw) };
            }
        }

        if (isEthLike(token0Id, token0Symbol)) { // ex: WETH/Faster
            const token1InEthRaw = Number.isFinite(token1Price) ? token1Price : 0;
            const token1InEth = normalizeTokenInEth(token1InEthRaw);
            const price = priceMode.kind === 'usd' ? token1InEth * ethUsdNumber : token1InEth;
            return { ...point, price };
        }

        if (isEthLike(token1Id, token1Symbol)) { // ex: DTEST/WETH
            const token0InEthRaw = Number.isFinite(token0Price) ? token0Price : 0;
            const token0InEth = normalizeTokenInEth(token0InEthRaw);
            const price = priceMode.kind === 'usd' ? token0InEth * ethUsdNumber : token0InEth;
            return { ...point, price };
        }

        // ex: PHD/Bunnzy
        const token1InToken0 = Number.isFinite(token1Price) ? token1Price : 0;
        return { ...point, price: token1InToken0 };
    };


    const initialChartPoint = useMemo<Record<string, unknown> | null>(() => {
        const nowSec = Math.floor(Date.now() / 1000);

        const point: Record<string, unknown> = {
            timestamp: nowSec,
            tvlUSD: initialTvlUsd,
            volumeUSD: initialVolumeUsd,
            feesUSD: initialFeesUsd,
            apr24h: initialApr24h,
            token0Price: initialToken0Price,
            token1Price: initialToken1Price,
        };

        const hasAnyMetric =
            Number(point.tvlUSD) > 0 ||
            Number(point.volumeUSD) > 0 ||
            Number(point.feesUSD) > 0 ||
            Number(point.token0Price) > 0 ||
            Number(point.token1Price) > 0;

        if (!hasAnyMetric) return null;

        return toChartPoint(point);
    }, [initialApr24h, initialFeesUsd, initialToken0Price, initialToken1Price, initialTvlUsd, initialVolumeUsd, token0Id, token0Symbol, token1Id, token1Symbol, ethUsdNumber, priceMode.kind]);


    // Update Chart Data when period changes
    useEffect(() => {
        if (period === '7d') {
            // 7d period => display Hour Data
            if (poolHourDataInitialized) {
                const data: PoolHourData[] = poolHourDataRef.current
                    .slice(-limit)
                    .sort((a, b) => a.timestamp - b.timestamp);

                const mapped = data.map(toChartPoint);
                setChartData(mapped.length > 0 ? mapped : (initialChartPoint ? [initialChartPoint] : []));

            } else {
                fetchHourDataRef.current();
            }

        } else if (period === '30d') {
            // 30d period => display Day Data

            if (poolDayDataInitialized) {
                const data: PoolDayData[] = poolDayDataRef.current
                    .slice(-limit)
                    .sort((a, b) => a.timestamp - b.timestamp);

                const mapped = data.map(toChartPoint);
                setChartData(mapped.length > 0 ? mapped : (initialChartPoint ? [initialChartPoint] : []));

            } else {
                fetchDayDataRef.current();
            }

        } else {
            setChartData([]);
        }
    }, [period, poolHourDataInitialized, poolDayDataInitialized, limit, token0Id, token1Id, ethUsdNumber, priceMode.kind, initialChartPoint]);


    const { total, latestValue } = useMemo(() => {
        if (chartData.length === 0) return { total: 0, latestValue: 0 };
        const total = chartData.reduce((sum, d) => sum + parseFloat(String(d[metric] ?? 0)), 0);
        const latestValue = parseFloat(String(chartData[chartData.length - 1]?.[metric] ?? 0));
        return { total, latestValue };
    }, [chartData, metric]);

    const currentMetricConfig = METRICS.find(m => m.key === metric);
    const displayValue = hoveredValue ?? (currentMetricConfig?.showTotal ? total : latestValue);


    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatDateHour = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
    };

    const formatYAxis = (value: number) => {
        if (isPercent) return `${value.toFixed(1)}%`;
        if (isUsd) return `$${formatUsd(value)}`;
        return `${formatNumber(value)}${metric === 'price' && priceUnitSymbol ? ` ${priceUnitSymbol}` : ''}`;
    };

    const formatTooltipValue = (value: number) => {
        if (isPercent) return `${value.toFixed(2)}%`;
        if (isUsd) return `$${formatUsd(value)}`;
        return `${formatNumber(value)}${metric === 'price' && priceUnitSymbol ? ` ${priceUnitSymbol}` : ''}`;
    };


    return (
        <div className="p-6 rounded-xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                <div>
                    <div className="text-sm text-foreground-light mb-1">
                        {currentMetricConfig?.label}
                        {hoveredDate && <span className="ml-2 text-foreground-light/60">• {hoveredDate}</span>}
                    </div>
                    <div className="text-3xl font-semibold tracking-tight">
                        {unitPrefix}{isPercent ? displayValue.toFixed(2) : formatNumber(displayValue)}{unitSuffix}
                    </div>
                </div>

                <div className="flex flex-wrap gap-1 text-sm">
                    {METRICS.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setMetric(key)}
                            className={`px-3 py-1.5 rounded-lg transition-all duration-200 ${
                                metric === key
                                    ? 'bg-white/10 text-foreground'
                                    : 'text-foreground-light hover:bg-white/5 hover:text-foreground'
                            } ${key === 'feesUSD' || key === 'apr24h' ? 'hidden md:block' : ''}`}
                        >
                            {label}
                        </button>
                    ))}

                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 text-foreground-light border-0 cursor-pointer hover:bg-white/10 transition-colors"
                    >
                        <option value="7d">7D</option>
                        <option value="30d">30D</option>
                    </select>
                </div>
            </div>

            {/* Chart */}
            <div className="h-72">
                {chartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-foreground-light">
                        Loading...
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            onMouseMove={(state) => {
                                const activePayload = (state as unknown as { activePayload?: Array<{ payload: Record<string, unknown> }> })?.activePayload;
                                if (activePayload?.[0]) {
                                    const payload = activePayload[0].payload;
                                    setHoveredValue(parseFloat(String(payload[metric])));
                                    setHoveredDate(
                                        period === '30d'
                                            ? formatDate(payload.timestamp as number)
                                            : formatDateHour(payload.timestamp as number)
                                    );
                                }
                            }}
                            onMouseLeave={() => {
                                setHoveredValue(null);
                                setHoveredDate(null);
                            }}
                        >
                            <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            <XAxis
                                dataKey="timestamp"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 12 }}
                                tickFormatter={(value) => formatDate(value)}
                                interval="preserveStartEnd"
                                minTickGap={50}
                            />

                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#6b7280', fontSize: 12 }}
                                tickFormatter={formatYAxis}
                                width={70}
                                domain={['auto', 'auto']}
                            />

                            <Tooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload?.[0]) return null;
                                    const data = payload[0].payload;
                                    const value = parseFloat(String(data[metric]));

                                    return (
                                        <div className="bg-background border border-white/10 rounded-lg px-3 py-2 shadow-xl">
                                            <div className="text-xs text-foreground-light mb-1">
                                                {period === '30d' ? formatDate(data.timestamp) : formatDateHour(data.timestamp)}
                                            </div>
                                            <div className="text-sm font-medium">
                                                {formatTooltipValue(value)}
                                            </div>
                                        </div>
                                    );
                                }}
                            />

                            <Area
                                type="monotone"
                                dataKey={metric}
                                stroke="#f87171"
                                strokeWidth={2}
                                fill={`url(#${gradientId})`}
                                animationDuration={500}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};

