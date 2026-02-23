"use client"

import Link from 'next/link';
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast';
import { useRouter, useSearchParams } from 'next/navigation';

//import * as apiFrontendPools from '@/lib/api_frontend_pools';

import { formatNumber } from '@/lib/ui_utils';
import { calculateFeesEarnedUSD, calculatePoolAPR, calculatePositionAPR, isPositionInRange, tickToPrice } from '@/lib/uniswap_utils';
import { useTokens } from '@/hooks/useTokens';
import { useUserPositions } from '@/hooks/useUserPositions';
import { usePoolLiquidity } from '@/hooks/usePoolLiquidity';
import { useApp } from '@/providers/AppProvider';
import { getPoolTicks } from '@/lib/api_blockchain_pools';

import { TokenLogo } from '@/components/TokenLogo';
import { PoolModalAddLiquidity } from './PoolModalAddLiquidity';
import { PoolModalRemoveLiquidity } from './PoolModalRemoveLiquidity';
import { PoolModalCollectFees } from './PoolModalCollectFees';
import { BarChart } from './BarChart';

import type { SubgraphPool, SimpleResult, Token, TransactionResult, TicksResult } from '@/types'



type PoolViewComponentProps = {
    pool: SubgraphPool,
    tokens?: Token[],
}


export const PoolViewComponent: React.FC<PoolViewComponentProps> = ({ pool, tokens: preLoadedTokens }) => {
    const router = useRouter();
    const searchParams = useSearchParams();

    const { walletClient, isConnected, userAddress, lastEthPrice } = useApp();

    const { tokens, tokensInitialized, tokensLoading, tokensError } = useTokens(preLoadedTokens);

    //const { pool, poolInitialized, poolLoading, poolError } = usePool(poolAddress);
    const poolAddress = pool.id;
    const poolLoading = false;

    const { userPositions: userPoolPositions, userPositionsInitialized, userPositionsLoading, userPositionsError, fetchUserPositions } = useUserPositions(userAddress, poolAddress);

    const {
        addPoolLiquidityError, addPoolLiquidityInfo, removePoolLiquidityError, removePoolLiquidityInfo, collectPoolFeesError, collectPoolFeesInfo, isAddingLiquidity, isRemovingLiquidity, isCollectingFees,
        setAddPoolLiquidityError, setAddPoolLiquidityInfo, setRemovePoolLiquidityError, setCollectPoolFeesError, setRemovePoolLiquidityInfo, setCollectPoolFeesInfo, executeAddPoolLiquidity, executeRemovePoolLiquidity, executeCollectPoolFees,
    } = usePoolLiquidity(pool);

    const [isPoolModalAddLiquidityOpen, setIsPoolModalAddLiquidityOpen] = useState(false)
    const [isPoolModalRemoveLiquidityOpen, setIsPoolModalRemoveLiquidityOpen] = useState(false)
    const [isPoolModalCollectFeesOpen, setIsPoolModalCollectFeesOpen] = useState(false)

    const [isTransactionsInfoModalOpen, setIsTransactionsInfoModalOpen] = useState(false);
    const [transactionsInfoSteps, setTransactionsInfoSteps] = useState<string[]>([]);
    const [transactionsInfoCurrentStep, setTransactionsInfoCurrentStep] = useState<number | null>(1)

    const [ticksData, setTicksData] = useState<Map<string, { tickLowerData: TicksResult, tickUpperData: TicksResult }>>(new Map());

    // États pour la pagination des positions
    const [positionsCurrentPage, setPositionsCurrentPage] = useState(1)
    const [positionsPerPage] = useState(10) // 10 positions par page

    // Calcul des éléments paginés pour les positions
    const totalPositions = userPoolPositions.length
    const totalPositionsPages = Math.ceil(totalPositions / positionsPerPage)
    const positionsStartIndex = (positionsCurrentPage - 1) * positionsPerPage
    const positionsEndIndex = positionsStartIndex + positionsPerPage
    const paginatedPositions = userPoolPositions.slice(positionsStartIndex, positionsEndIndex)

    const [positionsOpenMenuId, setPositionsOpenMenuId] = useState<`0x${string}` | null>(null)
    const [editPositionId, setEditPositionId] = useState<string | null>(null)

    useEffect(() => {
        const modal = searchParams?.get('modal');
        const positionId = searchParams?.get('positionId');

        if (!positionId) return;

        if (modal !== 'add' && modal !== 'remove' && modal !== 'collect') return;

        setEditPositionId(positionId);

        if (modal === 'add') {
            setIsPoolModalAddLiquidityOpen(true);
        }

        if (modal === 'remove') {
            setIsPoolModalRemoveLiquidityOpen(true);
        }

        if (modal === 'collect') {
            setIsPoolModalCollectFeesOpen(true);
        }

        const nextUrl = `/pools/${poolAddress}`;
        router.replace(nextUrl);
    }, [searchParams, poolAddress, router]);

    const nowSec = Math.floor(Date.now() / 1000);
    const lastSwapSec = pool.lastSwapTimestamp ? Number(pool.lastSwapTimestamp) : NaN;
    const is24hStale = isFinite(lastSwapSec) && lastSwapSec > 0 ? nowSec - lastSwapSec > 60 * 60 * 24 : false;
    const effectiveFeesUSD24h = is24hStale ? 0 : Number(pool.feesUSD24h ?? 0);
    const effectiveVolumeUSD24h = is24hStale ? 0 : Number(pool.volumeUSD24h ?? 0);
    const apy = Number(pool.totalValueLockedUSD) ? calculatePoolAPR(pool.totalValueLockedUSD, effectiveFeesUSD24h.toString()) : 0;


    const addPoolLiquidity = async (pool: SubgraphPool, positionId: string, userAmount0Desired: string, userAmount1Desired: string, slippage = 10): Promise<TransactionResult> => {
        const steps = [
            `Approve ${token0.symbol} spending`,
            `Approve ${token1.symbol} spending`,
            `Confirm in wallet`,
        ];

        setTransactionsInfoSteps(steps);
        setTransactionsInfoCurrentStep(1);
        setIsTransactionsInfoModalOpen(true);

        const result = await executeAddPoolLiquidity(walletClient, userAmount0Desired, userAmount1Desired, slippage, positionId, undefined, undefined, setTransactionsInfoCurrentStep);

        setIsTransactionsInfoModalOpen(false);

        if (result?.success) {
            toast.success("Liquidity added!", { removeDelay: 5000 });

            setTimeout(() => fetchUserPositions(tokens), 3000);

        } else {
            toast.error("Liquidity Addition Failed!", { removeDelay: 5000 });
        }

        return result
    }

    const removePoolLiquidity = async (tokenId: string, userAmount: string, userAmount0Desired: string, userAmount1Desired: string, positionPercent: number, slippage: number): Promise<SimpleResult> => {
        const steps = [
            `Remove Liquidity`,
            `Collect fees`,
        ];

        if (positionPercent >= 100) {
            steps.push(`Burn position`);
        }

        setTransactionsInfoSteps(steps);
        setTransactionsInfoCurrentStep(1);
        setIsTransactionsInfoModalOpen(true);

        const result = await executeRemovePoolLiquidity(walletClient, tokenId, userAmount, userAmount0Desired, userAmount1Desired, slippage, setTransactionsInfoCurrentStep);

        setIsTransactionsInfoModalOpen(false);

        if (result?.success) {
            toast.success("Liquidity removed!", { removeDelay: 5000 });

            setTimeout(() => fetchUserPositions(tokens), 3000);

        } else {
            toast.error("Liquidity removal Failed!", { removeDelay: 5000 });
        }

        return result;
    }


    const collectPoolFees = async (tokenId: string) => {
        const steps = [
            `Collect fees`,
        ];

        setTransactionsInfoSteps(steps);
        setTransactionsInfoCurrentStep(1);
        setIsTransactionsInfoModalOpen(true);

        const result = await executeCollectPoolFees(walletClient, tokenId, setTransactionsInfoCurrentStep);

        setIsTransactionsInfoModalOpen(false);

        if (result?.success) {
            toast.success("Fees collected!", { removeDelay: 5000 });

            setTimeout(() => fetchUserPositions(tokens), 3000);

        } else {
            toast.error("Liquidity removal Failed!", { removeDelay: 5000 });
        }

        return result;
    }


    const showAddLiquidityModal = (positionId: string) => {
        setEditPositionId(positionId)
        setIsPoolModalAddLiquidityOpen(true)
        setPositionsOpenMenuId(null)
    }

    const showRemoveLiquidityModal = (positionId: string) => {
        setEditPositionId(positionId)
        setIsPoolModalRemoveLiquidityOpen(true)
        setPositionsOpenMenuId(null)
    }

    const showCollectFeesModal = (positionId: string) => {
        setEditPositionId(positionId)
        setIsPoolModalCollectFeesOpen(true)
        setPositionsOpenMenuId(null)
    }


    useEffect(() => {
        const fetchAllTicksData = async () => {
            const data = new Map();

            for (const position of userPoolPositions) {
                const [tickLowerData, tickUpperData] = await Promise.all([
                    getPoolTicks(position.pool.id, Number(position.tickLower)),
                    getPoolTicks(position.pool.id, Number(position.tickUpper)),
                ]);

                data.set(position.id, { tickLowerData, tickUpperData });
            }

            setTicksData(data);
        };

        if (userPoolPositions.length > 0) {
            fetchAllTicksData();
        }
    }, [userPoolPositions]);


    if (!pool) return <>Loading...</>;

    const token0 = tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0;
    const token1 = tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1;

    const feeTierPercent = (Number(pool.feeTier) / 10000).toFixed(2)

    return (
        <>
            <div className="z-10 w-full mb-20">
                <div className="container m-auto mb-10">

                    <div className="mb-6">
                        <Link
                            href={`/pools`}
                            className="text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light"
                        >
                            ❮ Back
                        </Link>
                    </div>

                    <div className="md:flex md:justify-between mb-6">
                        <div className="flex gap-2 mb-8 items-center">
                            <div className="flex -space-x-4">
                                <div style={{ zIndex: 21 }}><TokenLogo token={token0} /></div>
                                <div style={{ zIndex: 20 }}><TokenLogo token={token1} /></div>
                            </div>

                            <div className="font-medium">
                                {pool.token0.symbol}/{pool.token1.symbol}
                            </div>
                            <div className="px-2 text-xs text-foreground-light">
                                {feeTierPercent}% Fee
                            </div>
                        </div>
                        <div className="mb-8">
                            <Link
                                href={`/pools/${poolAddress}/create-position`}
                                className="bg-background-btn text-background rounded-md px-4 py-2 w-full block text-center"
                            >
                                Add Liquidity
                            </Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 px-4 py-2 text-sm mb-8">
                        <div className="border rounded-md p-3 bg-background-light">
                            <div className="text-foreground-light">APY</div>
                            <div className="text-xl">
                                <span>{apy.toFixed(2)}</span>
                                <span className="text-foreground-light">%</span>
                            </div>
                        </div>
                        <div className="border rounded-md p-3">
                            <div className="text-foreground-light">TVL</div>
                            <div className="text-xl">
                                <span>${formatNumber(pool.totalValueLockedUSD)}</span>
                                <span className="text-foreground-light"></span>
                            </div>
                        </div>
                        <div className="border rounded-md p-3">
                            <div className="text-foreground-light">Reserves</div>
                            <div className="text-xl">
                                <span>
                                    {formatNumber(pool.totalValueLockedToken0)} {token0.symbol}
                                    <span className="text-foreground-light"> / </span>
                                    {formatNumber(pool.totalValueLockedToken1)} {token1.symbol}
                                </span>
                                <span className="text-foreground-light"></span>
                            </div>
                        </div>
                        <div className="border rounded-md p-3">
                            <div className="text-foreground-light">Fees 24H</div>
                            <div className="text-xl">
                                <span>${formatNumber(effectiveFeesUSD24h)}</span>
                                <span className="text-foreground-light"></span>
                            </div>
                        </div>
                        <div className="border rounded-md p-3">
                            <div className="text-foreground-light">Volume 24H</div>
                            <div className="text-xl">
                                <span>${formatNumber(effectiveVolumeUSD24h)}</span>
                                <span className="text-foreground-light"></span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <BarChart
                            poolAddress={poolAddress}
                            token0Id={token0.id}
                            token1Id={token1.id}
                            token0Symbol={token0.symbol}
                            token1Symbol={token1.symbol}
                            ethUsd={lastEthPrice}
                            initialTvlUsd={pool.totalValueLockedUSD}
                            initialVolumeUsd={pool.volumeUSD24h}
                            initialFeesUsd={pool.feesUSD24h}
                            initialApr24h={pool.apr24h}
                            initialToken0Price={pool.token0Price}
                            initialToken1Price={pool.token1Price}
                        />
                    </div>

                </div>

                <div className="w-full my-4">
                    <hr />
                </div>

                <div className="container m-auto">
                    <h3 className="text-md mb-4">Your positions</h3>

                    {userPositionsLoading ? (
                        <div className="text-center py-12">
                            <div className="">Loading your positions...</div>
                        </div>
                    ) : userPositionsError ? (
                        <div className="text-center py-12">
                            <div className="mb-2">Error loading positions</div>
                            <div className="text-foreground-light text-sm">{userPositionsError}</div>
                        </div>
                    ) : userPoolPositions.length === 0 ? (
                        <div className="text-center py-12">
                            <h3 className="text-xl font-semibold mb-2">No liquidity positions</h3>
                            <p className="text-foreground-light">
                                You have no  positions in this pool at the moment.
                                Create a new one and start earning {apy.toFixed(2)}% APY
                            </p>
                        </div>
                    ) : (
                        <>
                            {paginatedPositions.map((position, index) => {
                                const token0 = tokens.find(t => t.id.toLowerCase() === position.pool.token0.id.toLowerCase()) ?? position.pool.token0;
                                const token1 = tokens.find(t => t.id.toLowerCase() === position.pool.token1.id.toLowerCase()) ?? position.pool.token1;

                                if (token0.symbol === 'WETH') token0.derivedUSD = lastEthPrice;
                                if (token1.symbol === 'WETH') token1.derivedUSD = lastEthPrice;

                                const positionTickData = ticksData.get(position.id);
                                const feesEarnedUSD = positionTickData 
                                    ? calculateFeesEarnedUSD(position, token0, token1, positionTickData.tickLowerData, positionTickData.tickUpperData)
                                    : 0;

                                const isInRange = isPositionInRange(position);
                                const positionApr = calculatePositionAPR(position, token0, token1);
                                const positionTvl = Number(position.amountDepositedUSD || '0');
                                const isLowLiquidity = positionTvl < 50; // TVL below $50

                                const priceLower = tickToPrice(Number(position.tickLower)) * (10 ** (token0.decimals - token1.decimals));
                                const priceUpper = tickToPrice(Number(position.tickUpper)) * (10 ** (token0.decimals - token1.decimals));
                                const minPrice = priceLower;
                                const maxPrice = priceUpper;

                                return (
                                    <Link key={position.id} href={`/positions/${position.id}`}>
                                        <div className="gap-4 px-4 py-2 my-3 bg-background-light hover:bg-background-light-xl border rounded-lg transition-all cursor-pointer">

                                            {/* Mobile Layout */}
                                            <div className="md:hidden">
                                                {/* Header with Pool info and Actions */}
                                                <div className="flex justify-between items-center mb-3">
                                                    <div className="flex items-center space-x-2">
                                                        <div className="flex -space-x-4" title={`Position #${position.id}`}>
                                                            <div style={{ zIndex: 21 }}><TokenLogo token={token0} /></div>
                                                            <div style={{ zIndex: 20 }}><TokenLogo token={token1} /></div>
                                                        </div>
                                                        <div className="font-medium">
                                                            {token0.symbol}/{token1.symbol}
                                                        </div>
                                                    </div>

                                                {/* Actions */}
                                                <div className="relative">
                                                    <button
                                                        className="px-3 py-1 text-sm border rounded cursor-pointer hover:bg-background-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onClick={(event) => { event.preventDefault(); setPositionsOpenMenuId(old => (old === position.id) ? null : position.id as `0x${string}`) }}
                                                    >
                                                        ⋮
                                                    </button>

                                                    {positionsOpenMenuId === position.id && (
                                                        <div className='absolute right-0 top-full mt-1 bg-background px-4 py-2 rounded-md flex flex-col gap-2 border transition-all z-10'>
                                                            <button
                                                                onClick={(event) => { event.preventDefault(); showAddLiquidityModal(position.id) }}
                                                                className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light text-left"
                                                            >
                                                                Add
                                                            </button>

                                                            <button
                                                                onClick={(event) => { event.preventDefault(); showRemoveLiquidityModal(position.id) }}
                                                                className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light text-left"
                                                            >
                                                                Remove
                                                            </button>

                                                            <button
                                                                onClick={(event) => { event.preventDefault(); showCollectFeesModal(position.id) }}
                                                                className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light text-left"
                                                            >
                                                                Collect
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-4 gap-4 text-sm mb-3">
                                                <div>
                                                    <div className="text-foreground-light">Size</div>
                                                    <div className="font-medium">
                                                        ${formatNumber(position.amountDepositedUSD)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-foreground-light">Fees</div>
                                                    <div className="font-medium">${formatNumber(feesEarnedUSD)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-foreground-light">APR</div>
                                                    <div className="font-medium">
                                                        {isLowLiquidity ? (
                                                            <span className="text-yellow-500" title="Low liquidity detected. High APR is caused by minimal TVL and does not reflect long-term yield.">⚠️ {positionApr.toFixed(2)}%</span>
                                                        ) : (
                                                            <>{positionApr.toFixed(2)}%</>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-foreground-light">Status</div>
                                                    {isInRange && (
                                                        <div className="font-medium text-green-500">In Range</div>
                                                    )}
                                                    {!isInRange && (
                                                        <div className="font-medium text-red-500">Out of Range</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Range Display */}
                                            <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t">
                                                <div>
                                                    <div className="font-medium text-xs">
                                                        <span className="text-foreground-light">Min: </span>
                                                        {formatNumber(minPrice, 6)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="font-medium text-xs">
                                                        <span className="text-foreground-light">Max: </span>
                                                        {formatNumber(maxPrice, 6)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Desktop Layout */}
                                        <div className="hidden md:flex justify-between items-center gap-4 text-sm">
                                            {/* Pool */}
                                            <div className="flex items-center space-x-2">
                                                <div className="flex -space-x-4" title={`Position #${position.id}`}>
                                                    <div style={{ zIndex: 21 }}><TokenLogo token={token0} /></div>
                                                    <div style={{ zIndex: 20 }}><TokenLogo token={token1} /></div>
                                                </div>
                                                <div className="font-medium">
                                                    {token0.symbol}/{token1.symbol}
                                                </div>
                                            </div>

                                            {/* Size (Liquidity) */}
                                            <div className="text-center">
                                                <div className="text-foreground-light">Size</div>
                                                <div>
                                                    ${formatNumber(position.amountDepositedUSD)}
                                                </div>
                                            </div>

                                            {/* Fees Earned */}
                                            <div className="text-center">
                                                <div className="text-foreground-light">Fees</div>
                                                <div>${formatNumber(feesEarnedUSD)}</div>
                                            </div>

                                            {/* APR */}
                                            <div className="text-center">
                                                <div className="text-foreground-light">APR</div>
                                                <div>
                                                    {isLowLiquidity ? (
                                                        <span className="text-yellow-500" title="Low liquidity detected. High APR is caused by minimal TVL and does not reflect long-term yield.">⚠️ {positionApr.toFixed(2)}%</span>
                                                    ) : (
                                                        <>{positionApr.toFixed(2)}%</>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Status */}
                                            <div className="text-center">
                                                <div className="text-foreground-light">Status</div>
                                                {isInRange && (
                                                    <div className="font-medium text-green-500">In Range</div>
                                                )}
                                                {!isInRange && (
                                                    <div className="font-medium text-red-500">Out of Range</div>
                                                )}
                                            </div>

                                            {/* Range */}
                                            <div className="text-center">
                                                <div className="text-xs">
                                                    <span className="text-foreground-light">Min: </span>
                                                    {formatNumber(minPrice, 6)}
                                                </div>
                                                <div className="text-xs mt-1">
                                                    <span className="text-foreground-light">Max: </span>
                                                    {formatNumber(maxPrice, 6)}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="relative w-16">
                                                <button
                                                    className="px-3 py-1 text-sm border rounded cursor-pointer hover:bg-background-light transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    onClick={(event) => { event.preventDefault(); setPositionsOpenMenuId(old => (old === position.id) ? null : position.id as `0x${string}`) }}
                                                >
                                                    ⋮
                                                </button>

                                                {positionsOpenMenuId === position.id && (
                                                    <div className='absolute right-0 top-full mt-1 bg-background px-4 py-2 rounded-md flex gap-2 border transition-all z-10'>
                                                        <button
                                                            onClick={(event) => { event.preventDefault(); showAddLiquidityModal(position.id) }}
                                                            className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light"
                                                        >
                                                            Add Liquidity
                                                        </button>

                                                        <button
                                                            onClick={(event) => { event.preventDefault(); showRemoveLiquidityModal(position.id) }}
                                                            className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light"
                                                        >
                                                            Remove Liquidity
                                                        </button>

                                                        <button
                                                            onClick={(event) => { event.preventDefault(); showCollectFeesModal(position.id) }}
                                                            className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light"
                                                        >
                                                            Collect Fees
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        </div>
                                    </Link>
                                )
                            })}

                            {/* Contrôles de pagination pour les positions */}
                            {totalPositionsPages > 1 && (
                                <div className="flex justify-between items-center mt-4 pt-4 border-t">
                                    <div className="text-sm text-foreground-light">
                                        Showing {positionsStartIndex + 1}-{Math.min(positionsEndIndex, totalPositions)} of {totalPositions} positions
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={() => setPositionsCurrentPage(prev => Math.max(prev - 1, 1))}
                                            disabled={positionsCurrentPage === 1}
                                            className="px-3 py-1 text-sm border rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-foreground-light">
                                            Page {positionsCurrentPage} of {totalPositionsPages}
                                        </span>
                                        <button
                                            onClick={() => setPositionsCurrentPage(prev => Math.min(prev + 1, totalPositionsPages))}
                                            disabled={positionsCurrentPage === totalPositionsPages}
                                            className="px-3 py-1 text-sm border rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                </div>
            </div>


            <PoolModalAddLiquidity
                isOpen={isPoolModalAddLiquidityOpen}
                tokens={tokens}
                pool={pool}
                userPoolPositions={userPoolPositions}
                positionId={editPositionId}
                loading={tokensLoading || poolLoading}
                isAddingLiquidity={isAddingLiquidity}
                addPoolLiquidityError={addPoolLiquidityError}
                addPoolLiquidityInfo={addPoolLiquidityInfo}
                transactionsInfoSteps={transactionsInfoSteps}
                transactionsInfoCurrentStep={transactionsInfoCurrentStep}
                isTransactionsInfoModalOpen={isTransactionsInfoModalOpen}
                closeModal={() => { setIsPoolModalAddLiquidityOpen(false); setEditPositionId(null) }}
                addPoolLiquidity={addPoolLiquidity}
                setAddPoolLiquidityError={setAddPoolLiquidityError}
                setAddPoolLiquidityInfo={setAddPoolLiquidityInfo}
                setIsTransactionsInfoModalOpen={setIsTransactionsInfoModalOpen}
                setTransactionsInfoSteps={setTransactionsInfoSteps}
                setTransactionsInfoCurrentStep={setTransactionsInfoCurrentStep}
            />

            <PoolModalRemoveLiquidity
                isOpen={isPoolModalRemoveLiquidityOpen}
                tokens={tokens}
                pool={pool}
                userPoolPositions={userPoolPositions}
                positionId={editPositionId}
                loading={tokensLoading || poolLoading}
                isRemovingLiquidity={isRemovingLiquidity}
                removePoolLiquidityError={removePoolLiquidityError}
                removePoolLiquidityInfo={removePoolLiquidityInfo}
                transactionsInfoSteps={transactionsInfoSteps}
                transactionsInfoCurrentStep={transactionsInfoCurrentStep}
                isTransactionsInfoModalOpen={isTransactionsInfoModalOpen}
                closeModal={() => { setIsPoolModalRemoveLiquidityOpen(false); setEditPositionId(null) }}
                removePoolLiquidity={removePoolLiquidity}
                setRemovePoolLiquidityError={setRemovePoolLiquidityError}
                setRemovePoolLiquidityInfo={setRemovePoolLiquidityInfo}
                setIsTransactionsInfoModalOpen={setIsTransactionsInfoModalOpen}
                setTransactionsInfoSteps={setTransactionsInfoSteps}
                setTransactionsInfoCurrentStep={setTransactionsInfoCurrentStep}
            />

            <PoolModalCollectFees
                isOpen={isPoolModalCollectFeesOpen}
                tokens={tokens}
                pool={pool}
                userPoolPositions={userPoolPositions}
                positionId={editPositionId}
                loading={tokensLoading || poolLoading}
                isCollectingFees={isCollectingFees}
                collectPoolFeesError={collectPoolFeesError}
                collectPoolFeesInfo={collectPoolFeesInfo}
                transactionsInfoSteps={transactionsInfoSteps}
                transactionsInfoCurrentStep={transactionsInfoCurrentStep}
                isTransactionsInfoModalOpen={isTransactionsInfoModalOpen}
                closeModal={() => { setIsPoolModalCollectFeesOpen(false); setEditPositionId(null) }}
                collectPoolFees={collectPoolFees}
                setCollectPoolFeesError={setCollectPoolFeesError}
                setCollectPoolFeesInfo={setCollectPoolFeesInfo}
                setIsTransactionsInfoModalOpen={setIsTransactionsInfoModalOpen}
                setTransactionsInfoSteps={setTransactionsInfoSteps}
                setTransactionsInfoCurrentStep={setTransactionsInfoCurrentStep}
            />
        </>
    );
}

