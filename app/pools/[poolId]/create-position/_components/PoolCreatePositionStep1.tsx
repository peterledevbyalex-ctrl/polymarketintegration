"use client"

import React, { useEffect, useState } from 'react'
import { useConnectModal } from '@rainbow-me/rainbowkit'

import * as apiBlockchainPools from '@/lib/api_blockchain_pools'

import { formatValue } from '@/lib/ui_utils'
import { useApp } from '@/providers/AppProvider'
//import { getTicksFromPriceRange, getTickSpacingForFeeTier } from '@/lib/uniswap_utils'

import { Button } from '@/components/ui/button'
import { TokenLogo } from '@/components/TokenLogo';

import type { SubgraphPool, Token } from '@/types'


interface PoolCreatePositionStep1Props {
    tokens: Token[],
    pool: SubgraphPool,
    submitStep: (minPercent: number | null, maxPercent: number | null) => Promise<void>,
}


export const PoolCreatePositionStep1 = ({ tokens, pool, submitStep }: PoolCreatePositionStep1Props) => {
    const { isConnected, userAddress } = useApp()
    const { openConnectModal } = useConnectModal()

    const [price, setPrice] = useState(pool.token1Price);

    const [rangeMode, setRangeMode] = useState<'full' | 'custom'>('custom');
    const [minPercent, setMinPercent] = useState<number | null>(-5);
    const [maxPercent, setMaxPercent] = useState<number | null>(5);

    // TODO: replace minPercent & maxPercent with tickLower & tickUpper
    //const tickSpacing = getTickSpacingForFeeTier(pool.feeTier);
    //const { tickLower, tickUpper } = getTicksFromPriceRange(Number(pool.tick), minPercent, maxPercent, tickSpacing);


    const priceRev = (1 / Number(price)).toString();
    const priceMin = minPercent === null ? '' : ((100 + minPercent) * Number(price) / 100).toString();
    const priceMax = maxPercent === null ? '' : ((100 + maxPercent) * Number(price) / 100).toString();

    const token0 = pool ? (tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0) : null;
    const token1 = pool ? (tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1) : null;

    const createPositionAllowed = pool && Number(price) > 0 && true;

    let createPositionText = 'Create Position';
    if (true) createPositionText = 'Continue'


    const handleFullRange = () => {
        setMinPercent(null);
        setMaxPercent(null);
        setRangeMode('full')
    }


    const handleCustomRange = () => {
        setMinPercent(-5);
        setMaxPercent(5);
        setRangeMode('custom')
    }


    useEffect(() => {
        if (!pool) return;

        if (Number(pool.sqrtPrice)) {
            // Fetch current pool price
            apiBlockchainPools.getPoolLiquidityAddAmount1(pool.id, "1", pool.token0.decimals, pool.token1.decimals, BigInt(pool.sqrtPrice))
                .then((amount1) => {
                    const price = amount1; // price = amount1 / amount0 = amount1 / 1
                    setPrice(price);
                })
        }
    }, [pool])


//    useEffect(() => {
//        if (!pool) return;
//
//        const tickSpacing = getTickSpacingForFeeTier(pool.feeTier);
//        const { tickLower, tickUpper } = getTicksFromPriceRange(Number(pool.tick), minPercent, maxPercent, tickSpacing);
//
//        console.log('tickSpacing:', tickSpacing)
//        console.log('tickLower:', tickLower)
//        console.log('tickUpper:', tickUpper)
//
//    }, [pool, minPercent, maxPercent])


    if (! pool) return <div className="text-center text-xl">Loading</div>;
    if (! Number(pool.sqrtPrice)) return <>Error. Pool not initialized</>;


    return (
        <>
            <div className="w-full flex items-center justify-center p-2">
                <div className="w-full md:mx-10">

                    {/* Content */}
                    <div className="px-6">

                        {/* Pool Price */}
                        <div className="">
                            <div>
                                <div className="text-foreground-light mb-2">
                                    Current Price
                                </div>
                                <div className="md:flex justify-between">
                                    <div className="mb-4">
                                        <div className="text-xl font-semibold">
                                            1 {pool.token0.symbol} = {formatValue(price)} {pool.token1.symbol}
                                        </div>
                                        <div className="text-foreground-light">
                                            1 {pool.token1.symbol} = {formatValue(priceRev)} {pool.token0.symbol}
                                        </div>
                                    </div>
                                    <div className="mb-4 flex">
                                        <div className="flex bg-background-light-2xs rounded-3xl px-2 py-1 gap-2 font-medium text-sm">
                                            <div className="flex gap-2 bg-background-light-sm rounded-4xl p-1">
                                                <TokenLogo token={token0} />
                                                <div className="py-2">{token0.symbol}</div>
                                            </div>
                                            <div className="flex gap-2 p-1">
                                                <TokenLogo token={token1} />
                                                <div className="py-2 text-foreground-light">{pool.token1.symbol}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="my-8">
                            <hr />
                        </div>

                        {/* Price Range */}
                        <div className="mb-10 pt-2">
                            <div className="mb-4">
                                <div className="font-semibold mb-1">
                                    Select a range
                                </div>
                                <div className="text-sm text-foreground-light">
                                    Providing full range liquidity ensures continuous market participation across all possible prices, offering simplicity but with potential for higher impermanent loss.
                                </div>
                            </div>

                            <div className="mb-6">
                                <div className="flex justify-between bg-background-light-2xs text-center p-1 rounded-md">
                                    <button
                                        onClick={() => handleFullRange()}
                                        className={`w-full py-3 ${rangeMode === 'full' ? "bg-background-light font-semibold" : "text-foreground-light hover:bg-background-light-sm cursor-pointer"}`}
                                    >
                                        Full Range
                                    </button>

                                    <button
                                        onClick={() => handleCustomRange()}
                                        className={`w-full py-3  ${rangeMode === 'custom' ? "bg-background-light font-semibold" : "text-foreground-light hover:bg-background-light-sm cursor-pointer"}`}
                                    >
                                        Custom
                                    </button>
                                </div>
                            </div>

                            {rangeMode === 'custom' && (
                                <>
                                    <div className="md:flex md:justify-between gap-4">
                                        <div className="w-full">
                                            <div className="text-sm text-foreground-light">Min Price</div>

                                            <div className="border rounded-md flex justify-between" title={`Min: ${minPercent}%`}>
                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMinPercent(oldPercent => Math.min(0, (oldPercent ?? 0) - 1))}
                                                >-</button>

                                                <div className="text-center m-2">
                                                    <div>{formatValue(priceMin)}</div>
                                                    <div className="text-xs text-foreground-light">{pool.token1.symbol} per {pool.token0.symbol}</div>
                                                </div>

                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMinPercent(oldPercent => Math.min(0, (oldPercent ?? 0) + 1))}
                                                >+</button>

                                            </div>
                                        </div>
                                        <div className="w-full">
                                            <div className="text-sm text-foreground-light">Max Price</div>

                                            <div className="border rounded-md flex justify-between" title={`Max: ${maxPercent}%`}>
                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMaxPercent(oldPercent => Math.max(0, (oldPercent ?? 0) - 1))}
                                                >-</button>

                                                <div className="text-center m-2">
                                                    <div>{formatValue(priceMax)}</div>
                                                    <div className="text-xs text-foreground-light">{pool.token1.symbol} per {pool.token0.symbol}</div>
                                                </div>

                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMaxPercent(oldPercent => Math.max(0, (oldPercent ?? 0) + 1))}
                                                >+</button>

                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>


                        {/* Submit Button */}
                        <div>
                            {/* Connect wallet */}
                            {!isConnected && (
                                <Button
                                    variant='secondary'
                                    className="w-full py-6 cursor-pointer"
                                    onClick={() => openConnectModal()}
                                >
                                    Connect Wallet
                                </Button>
                            )}

                            {/* Create Position Button */}
                            {isConnected && (
                                <Button
                                    variant='default'
                                    className="w-full py-6 cursor-pointer"
                                    disabled={!createPositionAllowed}
                                    onClick={() => submitStep(minPercent, maxPercent)}
                                >
                                    {createPositionText}
                                </Button>
                            )}
                        </div>

                    </div>

                </div>
            </div>
        </>
    );
}

