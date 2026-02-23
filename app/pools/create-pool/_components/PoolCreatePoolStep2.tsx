"use client"

import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { useConnectModal } from '@rainbow-me/rainbowkit'

import * as apiBlockchainPools from '@/lib/api_blockchain_pools'

import { formatValue } from '@/lib/ui_utils'
import { useApp } from '@/providers/AppProvider'

import { Button } from '@/components/ui/button'
import { TokenLogo } from '@/components/TokenLogo';

import type { Token } from '@/types'


interface PoolCreatePoolStep2Props {
    poolAddress: `0x${string}`,
    poolSqrtPrice: bigint,
    token0: Token,
    token1: Token,
    feeTier: string,
    price: string | null,
    setPrice: Dispatch<SetStateAction<string | null>>,
    rangeMode: 'full' | 'custom',
    setRangeMode: Dispatch<SetStateAction<'full' | 'custom'>>,
    minPercent: number | null,
    setMinPercent: Dispatch<SetStateAction<number | null>>,
    maxPercent: number | null,
    setMaxPercent: Dispatch<SetStateAction<number | null>>,
    createPoolInfo: string
    createPoolError: string
    loading: boolean
    submitStep: (priceAinB: string, minPercent: number | null, maxPercent: number | null) => Promise<void>,
}


const createPoolAtStep2 = false;


export const PoolCreatePoolStep2 = ({
    poolAddress,
    poolSqrtPrice,
    token0,
    token1,
    feeTier,
    price,
    setPrice,
    rangeMode,
    setRangeMode,
    minPercent,
    setMinPercent,
    maxPercent,
    setMaxPercent,
    createPoolInfo,
    createPoolError,
    loading: tokensLoading,
    submitStep,
}: PoolCreatePoolStep2Props) => {
    const { isConnected } = useApp()
    const { openConnectModal } = useConnectModal()

    const { isDesktop } = useApp();

    const effectivePrice = price ?? '0';
    const effectiveMinPercent = minPercent ?? -5;
    const effectiveMaxPercent = maxPercent ?? 5;

    // TODO: replace minPercent & maxPercent with tickLower & tickUpper
    //const tickSpacing = getTickSpacingForFeeTier(pool.feeTier);
    //const { tickLower, tickUpper } = getTicksFromPriceRange(Number(pool.tick), minPercent, maxPercent, tickSpacing);


    const priceRev = (1 / Number(effectivePrice)).toString();
    const priceMin = ((100 + effectiveMinPercent) * Number(effectivePrice) / 100).toString();
    const priceMax = ((100 + effectiveMaxPercent) * Number(effectivePrice) / 100).toString();

    const createPoolAllowed = token0 && token1 && feeTier && Number(effectivePrice) > 0 && true;

    let createPoolText = 'Continue';
    if (createPoolAtStep2) createPoolText = 'Create Pool'


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
        if (!poolSqrtPrice) return;
        if (Number(effectivePrice) > 0) return;

        // Fetch current pool price (only when no draft price exists)
        apiBlockchainPools.getPoolLiquidityAddAmount1(poolAddress, "1", token0.decimals, token1.decimals, poolSqrtPrice)
            .then((amount1) => {
                const nextPrice = amount1; // price = amount1 / amount0 = amount1 / 1
                setPrice(nextPrice);
            })
    }, [effectivePrice, poolAddress, poolSqrtPrice, setPrice, token0.decimals, token1.decimals])

    return (
        <>
            <div className="w-full flex items-center justify-center p-2">
                <div className="w-full md:mx-10">

                    {/* Content */}
                    <div className="md:px-6">

                        {/* Pool Price */}
                        <div className="">
                            {/* New Pool (or Not Initialized Pool) */}
                            {!poolSqrtPrice && (
                                <div>
                                    <div className="mb-2">
                                        <div className="font-semibold mb-1">
                                            Pool Initialization
                                        </div>

                                        <p className="text-sm text-foreground-light">
                                            Input the initial Price
                                        </p>
                                    </div>

                                    <div className="md:flex md:justify-between">
                                        {/* Price */}
                                        <div className="px-3 py-2 rounded-md md:flex md:justify-center mb-2">
                                            <div className="md:flex md:gap-10">
                                                <div className="relative w-xs mb-4">
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        value={effectivePrice}
                                                        min={0}
                                                        placeholder="0.00"
                                                        autoFocus={isDesktop}
                                                        onChange={(e) => setPrice(e.target.value)}
                                                        //onFocus={(e) => e.target.select()}
                                                        onWheel={(e) => { (e.target as HTMLInputElement).blur(); /*e.preventDefault()*/}}
                                                        className="bg-background-light-sm hover:bg-background-light focus:bg-background-light-xl rounded-md px-4 py-2 text-xl font-semibold w-full outline-none text-foreground-light placeholder-gray-400"
                                                    />

                                                    <div className="absolute inset-y-0 end-0 flex items-center pointer-events-none z-20 pe-4">
                                                        <span className="text-foreground-light">{token1.symbol}</span>
                                                        <span className="text-foreground-light-xl">/{token0.symbol}</span>
                                                    </div>
                                                </div>

                                                <span className="font-medium mb-4">
                                                    <div>1 {token0.symbol} = {formatValue(effectivePrice)} {token1.symbol}</div>
                                                    <div className="text-sm text-foreground-light">1 {token1.symbol} = {formatValue(priceRev)} {token0.symbol}</div>
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center">
                                            {/* Tokens Logos */}
                                            <div className="flex bg-background-light-2xs rounded-3xl px-2 py-1 gap-2 font-medium text-sm">
                                                <div className="flex gap-2 bg-background-light-sm rounded-4xl p-1">
                                                    <TokenLogo token={token0} />
                                                    <div className="py-2">{token0.symbol}</div>
                                                </div>
                                                <div className="flex gap-2 p-1">
                                                    <TokenLogo token={token1} />
                                                    <div className="py-2 text-foreground-light">{token1.symbol}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            )}


                            {/* Initialized Pool */}
                            {poolSqrtPrice && (
                                <>
                                    <div>
                                        <div className="text-foreground-light mb-2">
                                            Current Price
                                        </div>
                                        <div className="md:flex md:justify-between">
                                            <div className="mb-4">
                                                <div className="text-xl font-semibold">
                                                    1 {token0.symbol} = {formatValue(effectivePrice)} {token1.symbol}
                                                </div>
                                                <div className="text-foreground-light">
                                                    1 {token1.symbol} = {formatValue(priceRev)} {token0.symbol}
                                                </div>
                                            </div>
                                            <div className="mb-4">
                                                <div className="flex bg-background-light-2xs rounded-3xl px-2 py-1 gap-2 font-medium text-sm">
                                                    <div className="flex gap-2 bg-background-light-sm rounded-4xl p-1">
                                                        <TokenLogo token={token0} />
                                                        <div className="py-2">{token0.symbol}</div>
                                                    </div>
                                                    <div className="flex gap-2 p-1">
                                                        <TokenLogo token={token1} />
                                                        <div className="py-2 text-foreground-light">{token1.symbol}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
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
                                    <div className="md:flex justify-between gap-4">
                                        <div className="w-full mb-2">
                                            <div className="text-sm text-foreground-light">Min Price</div>

                                            <div className="border rounded-md flex justify-between" title={`Min: ${minPercent}%`}>
                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMinPercent(oldPercent => Math.min(0, oldPercent - 1))}
                                                >-</button>

                                                <div className="text-center m-2">
                                                    <div>{formatValue(priceMin)}</div>
                                                    <div className="text-xs text-foreground-light">{token1.symbol} per {token0.symbol}</div>
                                                </div>

                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMinPercent(oldPercent => Math.min(0, oldPercent + 1))}
                                                >+</button>

                                            </div>
                                        </div>
                                        <div className="w-full mb-2">
                                            <div className="text-sm text-foreground-light">Max Price</div>

                                            <div className="border rounded-md flex justify-between" title={`Max: ${maxPercent}%`}>
                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMaxPercent(oldPercent => Math.max(0, oldPercent - 1))}
                                                >-</button>

                                                <div className="text-center m-2">
                                                    <div>{formatValue(priceMax)}</div>
                                                    <div className="text-xs text-foreground-light">{token1.symbol} per {token0.symbol}</div>
                                                </div>

                                                <button
                                                    className="bg-background-light rounded px-4 py-2 m-2 cursor-pointer hover:bg-background-light-xl"
                                                    onClick={() => setMaxPercent(oldPercent => Math.max(0, oldPercent + 1))}
                                                >+</button>

                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>


                        <>
                            {createPoolInfo && (
                                <div className="border rounded-lg bg-background-light p-1 mb-4 text-center">
                                    {createPoolInfo}
                                </div>
                            )}

                            {createPoolError && (
                                <div className="border rounded-lg bg-background-light p-1 mb-4 text-center text-red-500">
                                    ❌ Error: {createPoolError}
                                </div>
                            )}
                        </>


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

                            {/* Create Pool Button */}
                            {isConnected && (
                                <Button
                                    variant='default'
                                    className="w-full py-6 cursor-pointer"
                                    disabled={!createPoolAllowed}
                                    onClick={() => submitStep(effectivePrice, rangeMode === 'full' ? null : effectiveMinPercent, rangeMode === 'full' ? null : effectiveMaxPercent)}
                                >
                                    {createPoolText}
                                </Button>
                            )}
                        </div>

                    </div>

                </div>
            </div>
        </>
    );
}

