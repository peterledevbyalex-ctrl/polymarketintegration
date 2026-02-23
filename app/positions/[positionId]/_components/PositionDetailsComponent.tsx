"use client"

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Address, formatUnits } from 'viem'

import { formatNumber } from '@/lib/ui_utils'
import { calculateFeesEarnedUSD, calculatePositionAPR, calculateTokenAmountsFromLiquidity, isPositionInRange, tickToPrice } from '@/lib/uniswap_utils'
import { getPoolTicks } from '@/lib/api_blockchain_pools'
import { useTokens } from '@/hooks/useTokens'
import { useUserPositions } from '@/hooks/useUserPositions'
import { useApp } from '@/providers/AppProvider'

import { TokenLogo } from '@/components/TokenLogo'
import { Button } from '@/components/ui/button'
import { BarChart } from '@/app/pools/[poolId]/_components/BarChart'

import type { SubgraphPosition, Token, TicksResult } from '@/types'


type PositionDetailsComponentProps = {
    positionId: string
}


export const PositionDetailsComponent: React.FC<PositionDetailsComponentProps> = ({ positionId }) => {
    const router = useRouter()
    const { userAddress, lastEthPrice } = useApp()
    const { tokens } = useTokens()
    const { userPositions, userPositionsLoading } = useUserPositions(userAddress)

    const [ticksData, setTicksData] = useState<{ tickLowerData: TicksResult, tickUpperData: TicksResult } | null>(null)

    const position = userPositions.find(p => p.id.toLowerCase() === positionId.toLowerCase())

    const token0 = position ? (tokens.find(t => t.id.toLowerCase() === position.pool.token0.id.toLowerCase()) ?? position.pool.token0) : null
    const token1 = position ? (tokens.find(t => t.id.toLowerCase() === position.pool.token1.id.toLowerCase()) ?? position.pool.token1) : null

    if (token0 && token0.symbol === 'WETH') token0.derivedUSD = lastEthPrice
    if (token1 && token1.symbol === 'WETH') token1.derivedUSD = lastEthPrice

    useEffect(() => {
        if (!position) return

        const fetchTicksData = async () => {
            const [tickLowerData, tickUpperData] = await Promise.all([
                getPoolTicks(position.pool.id, Number(position.tickLower)),
                getPoolTicks(position.pool.id, Number(position.tickUpper)),
            ])
            setTicksData({ tickLowerData, tickUpperData })
        }

        fetchTicksData()
    }, [position])

    if (userPositionsLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center py-12">
                    <div>Loading position...</div>
                </div>
            </div>
        )
    }

    if (!position || !token0 || !token1) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center py-12">
                    <div className="text-xl font-semibold mb-2">Position not found</div>
                    <p className="text-foreground-light mb-4">This position does not exist or you don't have access to it.</p>
                    <Link href="/portfolio" className="text-primary hover:underline">
                        Go to Portfolio
                    </Link>
                </div>
            </div>
        )
    }

    const feeTierPercent = (Number(position.pool.feeTier) / 10000).toString()

    const feesEarnedUSD = ticksData
        ? calculateFeesEarnedUSD(position, token0, token1, ticksData.tickLowerData, ticksData.tickUpperData)
        : 0

    const collectedFees0USD = Number(position.collectedFeesToken0) * Number(token0.derivedUSD ?? 0)
    const collectedFees1USD = Number(position.collectedFeesToken1) * Number(token1.derivedUSD ?? 0)
    const collectedFeesUSD = collectedFees0USD + collectedFees1USD
    const claimableFeesUSD = Math.max(0, feesEarnedUSD - collectedFeesUSD)

    const isInRange = isPositionInRange(position)
    const positionApr = calculatePositionAPR(position, token0, token1)

    const priceLower = tickToPrice(Number(position.tickLower)) * (10 ** (token0.decimals - token1.decimals))
    const priceUpper = tickToPrice(Number(position.tickUpper)) * (10 ** (token0.decimals - token1.decimals))
    const token0PriceInToken1 = tickToPrice(Number(position.pool.tick)) * (10 ** (token0.decimals - token1.decimals))
    const token1PriceInToken0 = 1 / token0PriceInToken1;

    const tokenAmounts = position && Number(position.liquidity) > 0
            ? calculateTokenAmountsFromLiquidity(
                BigInt(position.liquidity),
                Number(position.tickLower),
                Number(position.tickUpper),
                Number(position.pool.tick),
                BigInt(position.pool.sqrtPrice)
            )
            : { amount0: 0n, amount1: 0n }

    const estimatedToken0 = formatUnits(tokenAmounts.amount0, token0.decimals)
    const estimatedToken1 = formatUnits(tokenAmounts.amount1, token1.decimals)

    const depositedToken0 = Number(estimatedToken0)
    const depositedToken1 = Number(estimatedToken1)
    //const depositedToken0 = Number(position.depositedToken0)
    //const depositedToken1 = Number(position.depositedToken1)
    const depositedToken0USD = depositedToken0 * Number(token0.derivedUSD ?? 0)
    const depositedToken1USD = depositedToken1 * Number(token1.derivedUSD ?? 0)

    const token0Percentage = depositedToken0USD / (depositedToken0USD + depositedToken1USD) * 100
    const token1Percentage = depositedToken1USD / (depositedToken0USD + depositedToken1USD) * 100

    const handleAddLiquidity = () => {
        router.push(`/pools/${position.pool.id}?modal=add&positionId=${position.id}`)
    }

    const handleRemoveLiquidity = () => {
        router.push(`/pools/${position.pool.id}?modal=remove&positionId=${position.id}`)
    }

    const handleCollectFees = () => {
        router.push(`/pools/${position.pool.id}?modal=collect&positionId=${position.id}`)
    }

    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="z-10 w-full max-w-6xl mb-20">

                {/* Header */}
                <div className="container m-auto mt-6">
                    {/* Back Button */}
                    <Link
                        href={`/pools/${position.pool.id}`}
                        className="inline-flex items-center gap-2 text-foreground-light hover:text-foreground transition-colors mb-4"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to pool
                    </Link>

                    <div className="block sm:flex items-center justify-between mb-6">
                        <div className="flex items-center space-x-4">
                            <div className="flex -space-x-4">
                                <div style={{ zIndex: 21 }}><TokenLogo token={token0} size="lg" /></div>
                                <div style={{ zIndex: 20 }}><TokenLogo token={token1} size="lg" /></div>
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold">{token0.symbol} / {token1.symbol}</h1>
                                <div className="flex items-center gap-2 text-sm text-foreground-light">
                                    <span>v3</span>
                                    <span>•</span>
                                    <span>{feeTierPercent}%</span>
                                    <span>•</span>
                                    {isInRange ? (
                                        <span className="text-green-500">In range</span>
                                    ) : (
                                        <span className="text-red-500">Out of range</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 mt-4">
                            <Button onClick={handleAddLiquidity} variant="outline" className="cursor-pointer">
                                Add liquidity
                            </Button>
                            <Button onClick={handleRemoveLiquidity} variant="outline" className="cursor-pointer">
                                Remove liquidity
                            </Button>
                            <Button onClick={handleCollectFees} className="cursor-pointer">
                                Collect fees
                            </Button>
                        </div>
                    </div>
                </div>

                <hr className="my-6" />

                {/* Main Content */}
                <div className="container m-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                        {/* Left Column - Chart & Range */}
                        <div>
                            {/* Current Price */}
                            <div className="mb-6">
                                <div className="text-2xl font-bold mb-2">
                                    1 {token0.symbol} = {formatNumber(token0PriceInToken1, 6)} {token1.symbol} (${formatNumber(token0PriceInToken1 * Number(token1.derivedUSD ?? 0), 2)})
                                </div>
                                <div className="text-foreground-light font-bold mb-2">
                                    1 {token1.symbol} = {formatNumber(token1PriceInToken0, 6)} {token0.symbol} (${formatNumber(token1PriceInToken0 * Number(token0.derivedUSD ?? 0), 2)})
                                </div>
                            </div>

                            {/* Price Chart */}
                            <div className="mb-6">
                                <BarChart
                                    poolAddress={position.pool.id as `0x${string}`}
                                    token0Id={token0.id as `0x${string}`}
                                    token1Id={token1.id as `0x${string}`}
                                    token0Symbol={token0.symbol}
                                    token1Symbol={token1.symbol}
                                    ethUsd={lastEthPrice}
                                    initialTvlUsd={position.pool.totalValueLockedUSD}
                                    initialVolumeUsd={position.pool.volumeUSD}
                                    initialFeesUsd={position.pool.feesUSD24h}
                                    initialApr24h={position.pool.apr24h}
                                    initialToken0Price={position.pool.token0Price}
                                    initialToken1Price={position.pool.token1Price}
                                />
                            </div>

                            {/* Price Range */}
                            <div className="backdrop-blur-sm rounded-md border p-6">
                                <h3 className="text-lg font-semibold mb-4">Price Range</h3>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <div className="text-foreground-light mb-1">Min price {token0.symbol}</div>
                                        <div className="font-bold">{formatNumber(priceLower, 6)}</div>
                                        <div className="text-xs text-foreground-light">{token1.symbol}</div>
                                    </div>
                                    <div>
                                        <div className="text-foreground-light mb-1">Max price {token0.symbol}</div>
                                        <div className="font-bold">{formatNumber(priceUpper, 6)}</div>
                                        <div className="text-xs text-foreground-light">{token1.symbol}</div>
                                    </div>
                                    <div>
                                        <div className="text-foreground-light mb-1">Market price {token0.symbol}</div>
                                        <div className="font-bold">{formatNumber(token0PriceInToken1, 6)}</div>
                                        <div className="text-xs text-foreground-light">{token1.symbol}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column - Position Details */}
                        <div>
                            {/* Position Value */}
                            <div className="backdrop-blur-sm rounded-md border p-6 mb-6 mt-3">
                                <div className="text-foreground-light mb-2">Position</div>
                                <div className="text-3xl font-bold mb-4">${formatNumber(Number(position.amountDepositedUSD), 2)}</div>

                                {/* Token Composition */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <TokenLogo token={token0} size="sm" />
                                            <span className="font-medium">${formatNumber(depositedToken0USD, 2)}</span>
                                        </div>
                                        <span className="text-foreground-light">{formatNumber(depositedToken0, 6)} {token0.symbol}</span>
                                    </div>
                                    <div className="w-full rounded-full h-2 mb-4 flex overflow-hidden">
                                        <div
                                            className="bg-blue-500 h-2"
                                            style={{ width: `${token0Percentage}%` }}
                                        />
                                        <div
                                            className="bg-pink-500 h-2"
                                            style={{ width: `${token1Percentage}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TokenLogo token={token1} size="sm" />
                                            <span className="font-medium">${formatNumber(depositedToken1USD, 2)}</span>
                                        </div>
                                        <span className="text-foreground-light">{formatNumber(depositedToken1, 6)} {token1.symbol}</span>
                                    </div>
                                </div>

                                <div className="flex justify-between text-sm pt-4 border-t">
                                    <div className="flex gap-2">
                                        <span className="text-blue-500">●</span> {token0Percentage.toFixed(2)}%
                                        <div className="text-foreground-light">{token0.symbol}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="text-foreground-light">{token1.symbol}</div>
                                        <span className="text-pink-500">●</span> {token1Percentage.toFixed(2)}%
                                    </div>
                                </div>
                            </div>

                            {/* Fees Earned */}
                            <div className="backdrop-blur-sm rounded-md border p-6 mb-6">
                                <div className="text-foreground-light mb-2">Fees earned</div>
                                <div className="text-3xl font-bold mb-4">${formatNumber(feesEarnedUSD, 2)}</div>

                                {/* Fee Breakdown */}
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TokenLogo token={token0} size="sm" />
                                            <span className="font-medium">${formatNumber(collectedFees0USD, 2)}</span>
                                        </div>
                                        <span className="text-foreground-light">{formatNumber(Number(position.collectedFeesToken0), 6)} {token0.symbol}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TokenLogo token={token1} size="sm" />
                                            <span className="font-medium">${formatNumber(collectedFees1USD, 2)}</span>
                                        </div>
                                        <span className="text-foreground-light">{formatNumber(Number(position.collectedFeesToken1), 6)} {token1.symbol}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Claimable Fees */}
                            <div className="backdrop-blur-sm rounded-md border p-6">
                                <div className="text-foreground-light mb-2">Fees</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <TokenLogo token={token0} size="sm" />
                                            <span className="font-medium">${formatNumber((claimableFeesUSD * token0Percentage / 100), 2)}</span>
                                        </div>
                                        <div className="text-xs text-foreground-light">Claimable</div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <TokenLogo token={token1} size="sm" />
                                            <span className="font-medium">${formatNumber((claimableFeesUSD * token1Percentage / 100), 2)}</span>
                                        </div>
                                        <div className="text-xs text-foreground-light">Claimable</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
