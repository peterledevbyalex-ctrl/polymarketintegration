"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link';

import { STABLE_COINS } from '@/config.app';
import { formatNumber } from '@/lib/ui_utils';
//import { usePools } from '@/hooks/usePools';

import { TokenLogo } from '@/components/TokenLogo';
import { useTokens } from '@/hooks/useTokens';
import { useApp } from '@/providers/AppProvider';
import { MagnifyIcon } from '@/components/icons/MagnifyIcon';

import { Token, SubgraphPool, SubgraphFactory } from '@/types';
import type { DexDayDatas } from '@/types';


type SortType = 'pool' | 'liquidity' | 'volume' | 'fees' | 'apr'
type SortOrder = 'asc' | 'desc'

type PoolsComponentProps = {
    pools: SubgraphPool[]
    tokens?: Token[]
    queryFilter?: string
    factory: SubgraphFactory
    factoryDayDatas: DexDayDatas[]
}

type MetricKey = 'tvl' | 'volume24h' | 'activePools';


export const PoolsComponent: React.FC<PoolsComponentProps> = ({ pools, tokens: preLoadedTokens, queryFilter, factory, factoryDayDatas }) => {
    const { tokens, tokensLoading, tokensError } = useTokens(preLoadedTokens);
    const { lastEthPrice } = useApp();
    //const { pools, poolsLoading, poolsError } = usePools();

    const poolsLoading = false;
    const poolsError = '';

    // Pools pagination
    const [poolsCurrentPage, setPoolsCurrentPage] = useState(1)
    const [poolsPerPage] = useState(20) // 20 pools par page

    const [searchQuery, setSearchQuery] = useState(queryFilter)
    const [typeFilter, setTypeFilter] = useState<'' | 'highest_apr' | 'stable'>('')
    const [sortType, setSortType] = useState<SortType>('pool')
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

    const nowSec = Math.floor(Date.now() / 1000);


    const factoryDayDatasAsc = [...factoryDayDatas].reverse();
    const tvlSeries = factoryDayDatasAsc
        .map(d => Number(d.tvlUSD))
        .filter(v => isFinite(v) && v > 0);
    const volumeSeries = factoryDayDatasAsc
        .map(d => Number(d.volumeUSD))
        .filter(v => isFinite(v) && v >= 0);
    const activePoolsSeries = factoryDayDatasAsc.length > 0
        ? factoryDayDatasAsc.map(() => Number(factory.poolCount)).filter(v => isFinite(v))
        : [];

    const filteredPools = pools.filter(pool => {
        // "Stable" Filter
        if (typeFilter === 'stable' && !STABLE_COINS.includes(pool.token0.id.toLowerCase()) && !STABLE_COINS.includes(pool.token1.id.toLowerCase())) {
            return false;
        }

        // Search Filter
        if (!searchQuery) return true;

        const words = searchQuery.trim().replace(/[^a-zA-Z0-9]/g, ' ').split(' ');

        for (const word of words) {
            if (pool.token0.name.toLowerCase().includes(word.toLowerCase())) {
                // OK
            } else if (pool.token0.symbol.toLowerCase().includes(word.toLowerCase())) {
                // OK
            } else if (pool.token0.id.toLowerCase().includes(word.toLowerCase())) {
                // OK
            } else if (pool.token1.name.toLowerCase().includes(word.toLowerCase())) {
                // OK
            } else if (pool.token1.symbol.toLowerCase().includes(word.toLowerCase())) {
                // OK
            } else if (pool.token1.id.toLowerCase().includes(word.toLowerCase())) {
                // OK
            } else {
                return false;
            }
        }

        return true;
    });

    const getPoolLiquidityUsdDisplay = (pool: SubgraphPool): number => {
        const token0 = tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0;
        const token1 = tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1;

        const isEthLike0 = token0.symbol === 'ETH' || token0.symbol === 'WETH';
        const isEthLike1 = token1.symbol === 'ETH' || token1.symbol === 'WETH';

        const token0Usd = (token0.derivedUSD && Number(token0.derivedUSD) > 0)
            ? Number(token0.derivedUSD)
            : (isEthLike0 && lastEthPrice ? Number(lastEthPrice) : 0);
        const token1Usd = (token1.derivedUSD && Number(token1.derivedUSD) > 0)
            ? Number(token1.derivedUSD)
            : (isEthLike1 && lastEthPrice ? Number(lastEthPrice) : 0);

        const tvlUsdFromTokens =
            Number(pool.totalValueLockedToken0) * token0Usd +
            Number(pool.totalValueLockedToken1) * token1Usd;

        const tvlUsdDisplay = (isFinite(tvlUsdFromTokens) && tvlUsdFromTokens > 0)
            ? tvlUsdFromTokens
            : Number(pool.totalValueLockedUSD);

        return isFinite(tvlUsdDisplay) ? tvlUsdDisplay : 0;
    };

    const sortedPools = [...filteredPools].sort((a, b) => {
        if (sortType === "pool") return sortPoolsByName(a, b, sortOrder)
        if (sortType === "liquidity") {
            const comparison = getPoolLiquidityUsdDisplay(a) - getPoolLiquidityUsdDisplay(b);
            return sortOrder === 'asc' ? comparison : -comparison;
        }
        if (sortType === "volume") return sortPoolsByVolume(a, b, sortOrder, nowSec)
        if (sortType === "fees") return sortPoolsByFees(a, b, sortOrder, nowSec)
        if (sortType === "apr") return sortPoolsByApr(a, b, sortOrder, nowSec)
        return 0
    });

    const totalPools = sortedPools.length
    const totalPoolsPages = Math.ceil(totalPools / poolsPerPage)
    const poolsStartIndex = (poolsCurrentPage - 1) * poolsPerPage
    const poolsEndIndex = poolsStartIndex + poolsPerPage

    const paginatedPools = sortedPools.slice(poolsStartIndex, poolsEndIndex)


    const handleSort = (newSortType: SortType) => {
        if (newSortType === sortType) {
            setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');

        } else {
            setSortType(newSortType);
            setSortOrder(newSortType === 'pool' ? 'asc' : 'desc')
        }
    }


    return (
        <>
            <div className="z-10 w-full mb-20">
                <div className="container m-auto">

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 mb-8 w-full">
                        <MetricCard
                            title="TVL"
                            value={formatMetricValue('tvl', factory)}
                            seriesValues={tvlSeries}
                            color="#a855f7"
                        />

                        <MetricCard
                            title="24h Volume"
                            value={formatMetricValue('volume24h', factory)}
                            seriesValues={volumeSeries}
                            color="#34d399"
                        />

                        <MetricCard
                            title="Active Pools"
                            value={formatMetricValue('activePools', factory)}
                            seriesValues={activePoolsSeries}
                            color="#38bdf8"
                        />
                    </div>
                </div>


                <div className="container m-auto">

                    {/* Filter + Search */}
                    <div className="md:flex md:justify-start mt-6">
                        <div className='flex gap-3 items-center w-full'>

                            <div className="flex border rounded-md flex-1 min-w-0">
                                <div className="px-2 inline-flex bg-background-light items-center min-w-fit pointer-events-none">
                                    <span className="text-foreground-light-xl">
                                        <MagnifyIcon />
                                    </span>
                                </div>

                                <div className="border-0 flex-1 min-w-0 bg-background-light">
                                    <input
                                        type="search"
                                        placeholder='Search pools'
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        disabled={poolsLoading}
                                        className="px-2 py-2 block w-full focus:outline-none"
                                    />
                                </div>
                            </div>

                            <Link
                                href={`/pools/create-pool`}
                                className="bg-background-btn text-background rounded-md px-4 py-2"
                            >
                                Create Pool
                            </Link>
                        </div>
                    </div>

                    {/* Pools main Card */}
                    <div className="bg-background-light rounded-md my-6">
                        {/* Table Header */}
                        <div className="grid grid-cols-[2fr_1fr_60px] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_60px] gap-4 px-4 py-0 text-foreground-xl text-md font-bold border border-b-0 rounded-t">
                            <button className="cursor-pointer rounded p-2 hover:bg-background-light text-left" onClick={() => handleSort('pool')}>
                                Pool
                            </button>
                            <button className="cursor-pointer rounded p-2 hover:bg-background-light text-left" onClick={() => handleSort('liquidity')}>
                                <span className="">Liquidity</span>
                                <span className="text-xs mx-2">↕</span>
                            </button>
                            <button className="hidden md:block cursor-pointer rounded p-2 hover:bg-background-light text-left" onClick={() => handleSort('volume')}>
                                <span className="">Volume 24H</span>
                                <span className="text-xs mx-2">↕</span>
                            </button>
                            <button className="hidden md:block cursor-pointer rounded p-2 hover:bg-background-light text-left" onClick={() => handleSort('fees')}>
                                <span className="">Fees 24H</span>
                                <span className="text-xs mx-2">↕</span>
                            </button>
                            <button className="hidden md:block cursor-pointer rounded p-2 hover:bg-background-light text-left" onClick={() => handleSort('apr')}>
                                <span className="">APR</span>
                                <span className="text-xs mx-2">↕</span>
                            </button>
                            <div className=""></div>
                        </div>

                        {/* Pools List */}
                        {poolsLoading && (
                            <div className="max-w-4xl mx-auto">
                                <div className="flex justify-center items-center py-12">
                                    <div className="text-xl">Loading pools...</div>
                                </div>
                            </div>
                        )}

                        {poolsError && (
                            <div className="max-w-4xl mx-auto">
                                <div className="flex justify-center items-center py-12">
                                    <div className="text-xl mb-4">Error loading pools</div>
                                </div>
                            </div>
                        )}

                        {!poolsLoading && !poolsError && (
                            <>
                                {pools.length === 0 ? (
                                    <div className="text-center py-12">
                                        <h3 className="text-xl font-semibold mb-2">No pools yet</h3>
                                        <p className="text-foreground-light mb-4">Create a pool to start earning fees</p>

                                        <Link
                                            href={`/pools/create-pool`}
                                            className="bg-background-btn text-background rounded-md px-4 py-2"
                                        >
                                            Create Your First Pool
                                        </Link>
                                    </div>
                                ) : (
                                    <>
                                        <div className="border-b rounded-b">
                                            {paginatedPools.map((pool) => {
                                                const notInitialized = Number(pool.sqrtPrice) === 0;
                                                const noLiquidity = Number(pool.sqrtPrice) > 0 && Number(pool.totalValueLockedToken0) === 0

                                                const token0 = tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0;
                                                const token1 = tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1;

                                                const tvlUsdDisplay = getPoolLiquidityUsdDisplay(pool);

                                                return (
                                                    <Link key={pool.id} href={`/pools/${pool.id}`}>
                                                        <div key={pool.id} className="grid grid-cols-[2fr_1fr_60px] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_60px] gap-4 px-4 py-3 transition-all border border-b-0 hover:bg-background-light">

                                                            {/* Column 1 - Tokens */}
                                                            <div className="flex items-center space-x-3">
                                                                <div className="flex -space-x-4">
                                                                    <div style={{ zIndex: 21 }}><TokenLogo token={token0} /></div>
                                                                    <div style={{ zIndex: 20 }}><TokenLogo token={token1} /></div>
                                                                </div>
                                                                <div>
                                                                    <div className="font-semibold text-base">
                                                                        {pool.token0.symbol}/{pool.token1.symbol}
                                                                    </div>
                                                                    <div className="text-sm text-foreground-light">{Number(pool.feeTier) / 10_000}% fee</div>
                                                                </div>
                                                            </div>

                                                            {/* Column 2 - Liquidity */}
                                                            {notInitialized ? (
                                                                <div>
                                                                    <button className='text-red-500/50 border rounded-md p-1 bg-background-light' onClick={() => { }}>
                                                                        &nbsp;
                                                                        Not initialized
                                                                    </button>
                                                                </div>
                                                            ) : noLiquidity ? (
                                                                <div>
                                                                    <span className='text-red-500/50 border rounded-md p-1 bg-background-light'>
                                                                        &nbsp;
                                                                        No liquidity
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <div className="px-2">
                                                                    <div className="font-semibold ">${formatNumber(tvlUsdDisplay)}</div>
                                                                    {/* Note: Display token0 & token1 TVLs (usefull for debug)
                                                                    <div className="text-xs text-foreground-light hidden md:block">
                                                                        {formatNumber(pool.totalValueLockedToken0)} {pool.token0.symbol} + {formatNumber(pool.totalValueLockedToken1)} {pool.token1.symbol}
                                                                    </div>
                                                                    */}
                                                                </div>
                                                            )}

                                                            {/* Column 3 - Volume */}
                                                            <div className="hidden md:block px-2">
                                                                {!notInitialized && !noLiquidity ? (
                                                                    <div className="font-semibold ">${formatNumber(getPoolEffectiveVolumeUSD24h(pool, nowSec))}</div>
                                                                ) : null}
                                                            </div>

                                                            {/* Column 4 - Fees */}
                                                            <div className="hidden md:block px-2">
                                                                {!notInitialized && !noLiquidity ? (
                                                                    <div className="font-semibold ">${formatNumber(getPoolEffectiveFeesUSD24h(pool, nowSec))}</div>
                                                                ) : null}
                                                            </div>

                                                            {/* Column 5 - APR */}
                                                            <div className="hidden md:block">
                                                                {!notInitialized && !noLiquidity ? (
                                                                    <div className="font-semibold ">{getPoolEffectiveApr24h(pool, nowSec).toFixed(0)}%</div>
                                                                ) : null}
                                                            </div>


                                                            {/* Column 6 - Actions */}
                                                            <div className="ms-auto">
                                                                <button className="h-full rounded p-3 cursor-pointer hover:bg-background-light-xl">
                                                                    ›
                                                                </button>
                                                            </div>

                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>

                                        {/* Contrôles de pagination pour les pools */}
                                        {totalPoolsPages > 1 && (
                                            <div className="flex justify-between items-center mt-4 pt-4">
                                                <div className="text-sm text-foreground-light">
                                                    Showing {poolsStartIndex + 1}-{Math.min(poolsEndIndex, totalPools)} of {totalPools} pools
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <button
                                                        onClick={() => setPoolsCurrentPage(prev => Math.max(prev - 1, 1))}
                                                        disabled={poolsCurrentPage === 1}
                                                        className="px-3 py-1 text-sm border rounded transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                                    >
                                                        Previous
                                                    </button>
                                                    <span className="text-sm text-foreground-light">
                                                        Page {poolsCurrentPage} of {totalPoolsPages}
                                                    </span>
                                                    <button
                                                        onClick={() => setPoolsCurrentPage(prev => Math.min(prev + 1, totalPoolsPages))}
                                                        disabled={poolsCurrentPage === totalPoolsPages}
                                                        className="px-3 py-1 text-sm border rounded transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

            </div>
        </>
    )
}



const MetricCard: React.FC<{
    title: string;
    value: string;
    seriesValues: number[];
    color: string;
}> = ({ title, value, seriesValues, color }) => {
    const width = 240;
    const height = 64;
    const { line, area } = toSeries(seriesValues, width, height);
    const gradientId = `metric-gradient-${title.replace(/\s+/g, '-').toLowerCase()}`;

    return (
        <div className="bg-background-light rounded-md px-5 py-4 overflow-hidden">
            <div className="text-foreground-light text-sm">{title}</div>
            <div className="text-2xl font-semibold text-foreground mt-1 mb-3">{value}</div>

            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-16">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor="transparent" stopOpacity={0} />
                    </linearGradient>
                </defs>

                {area && <path d={area} fill={`url(#${gradientId})`} />}
                {line && <path d={line} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
        </div>
    );
};



function sortPoolsByName(a: SubgraphPool, b: SubgraphPool, sortOrder: SortOrder = 'asc'): number {
    const nameA = `${a.token0.symbol}/${a.token1.symbol}`.toLowerCase();
    const nameB = `${b.token0.symbol}/${b.token1.symbol}`.toLowerCase();

    const comparison = nameA.localeCompare(nameB);
    return sortOrder === 'asc' ? comparison : -comparison;
}

function sortPoolsByLiquidity(a: SubgraphPool, b: SubgraphPool, sortOrder: SortOrder = 'asc'): number {
    const liquidityA = Number(a.totalValueLockedUSD);
    const liquidityB = Number(b.totalValueLockedUSD);

    const comparison = liquidityA - liquidityB;
    return sortOrder === 'asc' ? comparison : -comparison;
}

function sortPoolsByVolume(a: SubgraphPool, b: SubgraphPool, sortOrder: SortOrder = 'asc', nowSec: number): number {
    const comparison = getPoolEffectiveVolumeUSD24h(a, nowSec) - getPoolEffectiveVolumeUSD24h(b, nowSec);
    return sortOrder === 'asc' ? comparison : -comparison;
}

function sortPoolsByFees(a: SubgraphPool, b: SubgraphPool, sortOrder: SortOrder = 'asc', nowSec: number): number {
    const comparison = getPoolEffectiveFeesUSD24h(a, nowSec) - getPoolEffectiveFeesUSD24h(b, nowSec);
    return sortOrder === 'asc' ? comparison : -comparison;
}

function sortPoolsByApr(a: SubgraphPool, b: SubgraphPool, sortOrder: SortOrder = 'asc', nowSec: number): number {
    const comparison = getPoolEffectiveApr24h(a, nowSec) - getPoolEffectiveApr24h(b, nowSec)
    return sortOrder === 'asc' ? comparison : -comparison;
}


function formatMetricValue(metricKey: MetricKey, factory: SubgraphFactory): string {
    if (metricKey === 'tvl') return `$${formatNumber(factory.totalValueLockedUSD)}`;
    if (metricKey === 'volume24h') return `$${formatNumber(factory.volumeUSD24h)}`;
    return formatNumber(factory.poolCount);
}


function isPool24hStale(pool: SubgraphPool, nowSec: number): boolean {
    const lastSwapSec = pool.lastSwapTimestamp ? Number(pool.lastSwapTimestamp) : NaN;
    if (!isFinite(lastSwapSec) || lastSwapSec <= 0) return false;
    return nowSec - lastSwapSec > 60 * 60 * 24;
}

function getPoolEffectiveVolumeUSD24h(pool: SubgraphPool, nowSec: number): number {
    if (isPool24hStale(pool, nowSec)) return 0;
    const value = Number(pool.volumeUSD24h);
    return isFinite(value) ? value : 0;
}

function getPoolEffectiveFeesUSD24h(pool: SubgraphPool, nowSec: number): number {
    if (isPool24hStale(pool, nowSec)) return 0;
    const value = Number(pool.feesUSD24h);
    return isFinite(value) ? value : 0;
}

function getPoolEffectiveApr24h(pool: SubgraphPool, nowSec: number): number {
    if (isPool24hStale(pool, nowSec)) return 0;
    const value = Number(pool.apr24h);
    return isFinite(value) ? value : 0;
}


function toSeries(values: number[], width: number, height: number): { line: string; area: string } {
    if (values.length === 0) return { line: '', area: '' };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const normalized = values.map((v) => (range <= 0 ? 0.5 : (v - min) / range));

    const topPadding = height * 0.08;
    const bottomPadding = height * 0.28;
    const usableHeight = Math.max(1, height - topPadding - bottomPadding);

    const step = values.length > 1 ? width / (values.length - 1) : 0;
    const points = normalized.map((v, i) => {
        const x = i * step;
        const y = topPadding + (1 - v) * usableHeight;
        return { x, y };
    });

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const area = `${line} L ${width.toFixed(2)} ${height.toFixed(2)} L 0 ${height.toFixed(2)} Z`;

    return { line, area };
}
