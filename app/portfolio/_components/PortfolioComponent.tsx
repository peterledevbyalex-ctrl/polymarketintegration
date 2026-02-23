"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, parseUnits, Address } from 'viem';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { formatAddress, formatNumber } from '@/lib/ui_utils';
import { getPoolTicks } from '@/lib/api_blockchain_pools';
import { calculateFeesEarnedUSD, calculatePositionAPR, calculatePositionValueUSD, isPositionInRange } from '@/lib/uniswap_utils';

import * as apiBackend from '@/lib/api_backend'
import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens'

import { useTokens } from '@/hooks/useTokens';
import { useUserTokens } from '@/hooks/useUserTokens';
import { useUserBalance } from '@/hooks/useUserBalance';
import { useUserPositions } from '@/hooks/useUserPositions';
import { useApp } from '@/providers/AppProvider';

import { Button } from '@/components/ui/button';
import { TokenLogo } from '@/components/TokenLogo';
import { PortfolioModalTransferToken } from './PortfolioModalTransferToken';

import { TicksResult, Token, TransactionResult } from '@/types';


export const PortfolioComponent: React.FC<{ tokens?: Token[] }> = ({ tokens: preLoadedTokens }) => {
    const router = useRouter();

    const { isConnected, userAddress, walletClient, lastEthPrice } = useApp()

    const { tokens, tokensLoading, tokensError } = useTokens(preLoadedTokens);
    const { userTokens, userTokensLoading, userTokensError } = useUserTokens(userAddress);
    const { userPositions, userPositionsLoading, userPositionsError } = useUserPositions(userAddress);

    const [ticksData, setTicksData] = useState<Map<string, { tickLowerData: TicksResult, tickUpperData: TicksResult }>>(new Map());

    // États pour la pagination des positions
    const [positionsCurrentPage, setPositionsCurrentPage] = useState(1)
    const [positionsPerPage] = useState(10) // 10 positions par page

    // États pour la pagination des tokens
    const [tokensCurrentPage, setTokensCurrentPage] = useState(1)
    const [tokensPerPage] = useState(15) // 15 tokens par page

    const [tokensOpenMenuId, setTokensOpenMenuId] = useState<Address | null>(null)
    const [positionsOpenMenuId, setPositionsOpenMenuId] = useState<Address | null>(null)
    const [isModalTransferTokenOpen, setIsModalTransferTokenOpen] = useState(false)
    const [selectedToken, setSelectedToken] = useState<Token | null>(null)

    const [transferTokenError, setTransferTokenError] = useState<string | null>(null)
    const [transferTokenInfo, setTransferTokenInfo] = useState<string | null>(null)
    const [isTransferingToken, setIsTransferingToken] = useState(false)

    const tokensMenuRef = useRef<HTMLDivElement>(null)
    const positionsMenuRef = useRef<HTMLDivElement>(null)


    // Calcul des éléments paginés pour les positions
    const totalPositions = userPositions.length
    const totalPositionsPages = Math.ceil(totalPositions / positionsPerPage)
    const positionsStartIndex = (positionsCurrentPage - 1) * positionsPerPage
    const positionsEndIndex = positionsStartIndex + positionsPerPage
    const paginatedPositions = userPositions.slice(positionsStartIndex, positionsEndIndex)

    const { userBalance, setUserBalance } = useUserBalance(userAddress)
    //const [userTokensBalances, setUserTokensBalances] = useState<Record<Address, string>>({}) // TODO: recuperer les valeurs en USD de chaque token


    const userBalanceUSD = Number(userBalance) * Number(lastEthPrice);

    const getTokenDerivedUSD = (token: Token): number => {
        if (token.symbol === 'ETH' || token.symbol === 'WETH') return Number(lastEthPrice);
        return Number(token.derivedUSD ?? 0);
    }

    const sortedUserTokens = useMemo(() => {
        const tokenById = new Map(tokens.map(t => [t.id.toLowerCase(), t] as const));

        return [...userTokens]
            .map(t => {
                const meta = tokenById.get(t.id.toLowerCase());

                const derivedETH = t.derivedETH ?? meta?.derivedETH;
                const derivedUSD = (t.symbol === 'ETH' || t.symbol === 'WETH')
                    ? lastEthPrice
                    : (t.derivedUSD ?? meta?.derivedUSD);

                const logoUri = t.logoUri ?? meta?.logoUri;
                const userBalanceNum = Number(t.userBalance ?? 0);
                const valueUSD = userBalanceNum * Number(derivedUSD ?? 0);

                return {
                    token: {
                        ...t,
                        derivedETH,
                        derivedUSD,
                        logoUri,
                    },
                    valueUSD,
                };
            })
            .sort((a, b) => b.valueUSD - a.valueUSD)
            .map(x => x.token);
    }, [lastEthPrice, tokens, userTokens]);

    // Calcul des éléments paginés pour les tokens
    const totalTokens = sortedUserTokens.length
    const totalTokensPages = Math.ceil(totalTokens / tokensPerPage)
    const tokensStartIndex = (tokensCurrentPage - 1) * tokensPerPage
    const tokensEndIndex = tokensStartIndex + tokensPerPage
    const paginatedTokens = sortedUserTokens.slice(tokensStartIndex, tokensEndIndex)

    const userTokensBalancesUsdList = sortedUserTokens
        .filter(t => t.symbol !== 'ETH')
        .map(t => Number(t.userBalance ?? 0) * getTokenDerivedUSD(t))
    const userTotalTokensBalancesUSD = userTokensBalancesUsdList.reduce((p, c) => p + c, 0)
    const userTotalBalanceUSD = userBalanceUSD + userTotalTokensBalancesUSD;

    const userTotalBalanceUsdFormatted = formatNumber(userTotalBalanceUSD, 2)


    const showTransferTokenModal = (token: Token) => {
        //console.log('token:', token)
        setSelectedToken(token)
        setIsModalTransferTokenOpen(true)
        setTokensOpenMenuId(null)
    }

    const showAddLiquidityModal = (poolId: string, positionId: string) => {
        setPositionsOpenMenuId(null)
        router.push(`/pools/${poolId}?modal=add&positionId=${positionId}`)
    }

    const showRemoveLiquidityModal = (poolId: string, positionId: string) => {
        setPositionsOpenMenuId(null)
        router.push(`/pools/${poolId}?modal=remove&positionId=${positionId}`)
    }


    const transferToken = async (tokenId: string, recipient: Address, userAmount: string): Promise<TransactionResult> => {
        //console.log('userTokens:', userTokens)

        if (!walletClient) {
            return { success: false, error: 'Wallet not connected' };
        }

        try {
            setIsTransferingToken(true);
            setTransferTokenError(null);
            setTransferTokenInfo(null);

            const token = userTokens.find(t => t.id.toLowerCase() === tokenId.toLowerCase());
            if (!token) {
                throw new Error('Token not found');
            }

            const amount = parseUnits(userAmount, token.decimals);

            const receipt = await apiBlockchainTokens.transferToken(
                walletClient,
                tokenId as `0x${string}`,
                recipient,
                amount
            );

            if (receipt.status === 'success') {
                setTransferTokenInfo('Transfer completed successfully!');
                return { success: true, transactionHash: receipt.transactionHash };

            } else {
                throw new Error('Transaction failed');
            }

        } catch (error: any) {
            const errorMessage = error.shortMessage || error.message || 'Transfer failed';
            setTransferTokenError(errorMessage);
            return { success: false, error: errorMessage };

        } finally {
            setIsTransferingToken(false);
        }
    }


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tokensMenuRef.current && !tokensMenuRef.current.contains(event.target as Node)) {
                setTokensOpenMenuId(null)
            }
            if (positionsMenuRef.current && !positionsMenuRef.current.contains(event.target as Node)) {
                setPositionsOpenMenuId(null)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        const fetchAllTicksData = async () => {
            const data = new Map();

            for (const position of userPositions) {
                const [tickLowerData, tickUpperData] = await Promise.all([
                    getPoolTicks(position.pool.id, Number(position.tickLower)),
                    getPoolTicks(position.pool.id, Number(position.tickUpper)),
                ]);

                data.set(position.id, { tickLowerData, tickUpperData });
            }

            setTicksData(data);
        };

        if (userPositions.length > 0) {
            fetchAllTicksData();
        }
    }, [userPositions]);


    const { pooledAmountUSD, avgAprWeighted, totalFeesEarnedUSD, totalClaimableFeesUSD } = useMemo(() => {
        const tokenById = new Map(tokens.map(t => [t.id.toLowerCase(), t] as const));

        let pooled = 0;
        let weightedAprSum = 0;
        let weightSum = 0;
        let totalFees = 0;
        let totalClaimable = 0;

        for (const position of userPositions) {
            const token0 = tokenById.get(position.pool.token0.id.toLowerCase()) ?? position.pool.token0;
            const token1 = tokenById.get(position.pool.token1.id.toLowerCase()) ?? position.pool.token1;

            const token0Usd = token0.symbol === 'WETH' ? lastEthPrice : token0.derivedUSD;
            const token1Usd = token1.symbol === 'WETH' ? lastEthPrice : token1.derivedUSD;

            const positionValueUSD = calculatePositionValueUSD(
                position,
                { ...token0, derivedUSD: token0Usd },
                { ...token1, derivedUSD: token1Usd }
            );

            if (!isFinite(positionValueUSD) || positionValueUSD <= 0) continue;

            pooled += positionValueUSD;

            const apr = calculatePositionAPR(
                position,
                { ...token0, derivedUSD: token0Usd },
                { ...token1, derivedUSD: token1Usd },
            );

            if (!isFinite(apr)) continue;
            weightedAprSum += apr * positionValueUSD;
            weightSum += positionValueUSD;

            const positionTickData = ticksData.get(position.id);
            if (positionTickData) {
                const feesEarnedUSD = calculateFeesEarnedUSD(
                    position,
                    { ...token0, derivedUSD: token0Usd },
                    { ...token1, derivedUSD: token1Usd },
                    positionTickData.tickLowerData,
                    positionTickData.tickUpperData
                );
                if (isFinite(feesEarnedUSD)) {
                    totalFees += feesEarnedUSD;
                }

                const collectedFees0USD = Number(position.collectedFeesToken0) * Number(token0Usd ?? 0);
                const collectedFees1USD = Number(position.collectedFeesToken1) * Number(token1Usd ?? 0);
                const collectedFeesUSD = collectedFees0USD + collectedFees1USD;
                
                const claimableFeesUSD = feesEarnedUSD - collectedFeesUSD;
                if (isFinite(claimableFeesUSD) && claimableFeesUSD > 0) {
                    totalClaimable += claimableFeesUSD;
                }
            }
        }

        return {
            pooledAmountUSD: pooled,
            avgAprWeighted: weightSum > 0 ? weightedAprSum / weightSum : 0,
            totalFeesEarnedUSD: totalFees,
            totalClaimableFeesUSD: totalClaimable,
        };
    }, [lastEthPrice, tokens, userPositions, ticksData]);



    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="z-10 w-full mb-20">

                {/* Summary Cards */}
                <div className="container m-auto mt-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {/* Total Value */}
                        <div className="col-span-2 px-4 py-2">
                            <div className="text-sm text-foreground-light mb-1">
                                {userAddress ? formatAddress(userAddress) : "Not connected"}
                            </div>
                            <div className="font-bold">
                                <span className='text-3xl md:text-4xl'>${userTotalBalanceUsdFormatted}</span>
                            </div>
                        </div>

                        {/* TVL / Pooled Amount */}
                        <div className="backdrop-blur-sm rounded-md border px-4 py-2">
                            <div className="text-sm text-foreground-light mb-1">TVL</div>
                            <div className="text-2xl font-bold">${formatNumber(pooledAmountUSD, 2)}</div>
                        </div>

                        {/* Avg APR */}
                        <div className="backdrop-blur-sm rounded-md border px-4 py-2">
                            <div className="text-sm text-foreground-light mb-1">Avg APR</div>
                            <div className="text-2xl font-bold">
                                <span>{avgAprWeighted.toFixed(0)}</span>
                                <span className="text-sm text-foreground-light">%</span>
                            </div>
                        </div>

                        {/* Total Fees Earned */}
                        <div className="backdrop-blur-sm rounded-md border px-4 py-2">
                            <div className="text-sm text-foreground-light mb-1">Total Fees</div>
                            <div className="text-2xl font-bold">${formatNumber(totalFeesEarnedUSD, 2)}</div>
                        </div>

                        {/* Claimable Fees */}
                        <div className="backdrop-blur-sm rounded-md border px-4 py-2">
                            <div className="text-sm text-foreground-light mb-1">Claimable</div>
                            <div className="text-2xl font-bold">${formatNumber(totalClaimableFeesUSD, 2)}</div>
                        </div>
                    </div>
                </div>

                <hr className="-m-4 my-6" />

                {/* Tokens + Pools */}
                <div className="container m-auto">
                    <div className="md:flex justify-between gap-10 pt-4">

                        {/* Tokens Section */}
                        <div className="w-full mb-8">
                            <h3 className="text-md mb-4">Your Tokens</h3>

                            {(userTokensLoading) ? (
                                <div className="text-center py-12">
                                    <div className="">Loading your tokens...</div>
                                </div>
                            ) : userTokensError ? (
                                <div className="text-center py-12">
                                    <div className="mb-2">Error loading tokens</div>
                                    <div className="text-foreground-light text-sm">{userTokensError}</div>
                                </div>
                            ) : !isConnected ? (
                                <div className="text-center py-12">
                                    <h3 className="text-xl font-semibold mb-2">Connect your wallet</h3>
                                    <p className="text-foreground-light">Connect your wallet to see your token balances</p>
                                </div>
                            ) : sortedUserTokens.length === 0 ? (
                                <div className="text-center py-12">
                                    <h3 className="text-xl font-semibold mb-2">No tokens yet</h3>
                                    <p className="text-foreground-light">Your tokens will appear here</p>
                                </div>
                            ) : (
                                <>
                                    {paginatedTokens.map((token, index) => {
                                        const balance = Number(token.userBalance) ? Number(token.userBalance) : 0;

                                        const price = getTokenDerivedUSD(token)
                                        const value = balance * price;

                                        return (
                                            <div key={`${token.id}-${index}`} className="grid grid-cols-2 gap-4 bg-background-light hover:bg-background-light-xl px-4 py-1 my-3 border rounded-lg transition-all" style={{ gridTemplateColumns: '1fr 1fr 60px' }}>
                                                {/* Token */}
                                                <div className="flex items-center space-x-3">
                                                    <div className="">
                                                        <TokenLogo token={token} />
                                                    </div>
                                                    <div>
                                                        <div className="">{token.name}</div>
                                                        <div className="text-sm text-foreground-light">{token.symbol}</div>
                                                    </div>
                                                </div>

                                                <div>
                                                    {/* Value */}
                                                    <div className="text-right">
                                                        ${formatNumber(value, 2)}
                                                    </div>

                                                    {/* Balance */}
                                                    <div className="text-right text-sm text-foreground-light">
                                                        {formatNumber(balance, 5)} {token.symbol}
                                                    </div>
                                                </div>

                                                <div className="ms-auto" ref={tokensOpenMenuId === token.id ? tokensMenuRef : null}>
                                                    {/* Actions */}
                                                    <button
                                                        className="px-3 py-1 text-sm border rounded transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-background-light"
                                                        onClick={(event) => { event.preventDefault(); setTokensOpenMenuId(old => (old === token.id) ? null : token.id as Address) }}
                                                    >
                                                        ⋮
                                                    </button>

                                                    {tokensOpenMenuId === token.id && (
                                                        <div className='absolute bg-background px-4 py-2 rounded-md flex gap-2 border transition-all z-50'>
                                                            <button
                                                                onClick={(event) => { event.preventDefault(); showTransferTokenModal(token) }}
                                                                className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light"
                                                            >
                                                                Transfer
                                                            </button>

                                                            <Link
                                                                href={`/pools?q=${token.id}`}
                                                                //onClick={(event) => { event.preventDefault(); showTransferTokenModal(token) }}
                                                                className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light"
                                                            >
                                                                Show Pools
                                                            </Link>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Contrôles de pagination pour les tokens */}
                                    {totalTokensPages > 1 && (
                                        <div className="flex justify-between items-center mt-4 pt-4 border-t">
                                            <div className="text-sm text-foreground-light">
                                                Showing {tokensStartIndex + 1}-{Math.min(tokensEndIndex, totalTokens)} of {totalTokens} tokens
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <button
                                                    onClick={() => setTokensCurrentPage(prev => Math.max(prev - 1, 1))}
                                                    disabled={tokensCurrentPage === 1}
                                                    className="px-3 py-1 text-sm border rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Previous
                                                </button>
                                                <span className="text-sm text-foreground-light">
                                                    Page {tokensCurrentPage} of {totalTokensPages}
                                                </span>
                                                <button
                                                    onClick={() => setTokensCurrentPage(prev => Math.min(prev + 1, totalTokensPages))}
                                                    disabled={tokensCurrentPage === totalTokensPages}
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


                        {/* Pools Section */}
                        <div className="w-full mb-8">
                            <h3 className="text-md mb-4">Pools</h3>

                            {userPositionsLoading ? (
                                <div className="text-center py-12">
                                    <div className="">Loading your positions...</div>
                                </div>
                            ) : userPositionsError ? (
                                <div className="text-center py-12">
                                    <div className="mb-2">Error loading positions</div>
                                    <div className="text-foreground-light text-sm">{userPositionsError}</div>
                                </div>
                            ) : userPositions.length === 0 ? (
                                <div className="text-center py-12">
                                    <h3 className="text-xl font-semibold mb-2">No liquidity positions</h3>
                                    <p className="text-foreground-light">Add liquidity to pools to appear here</p>
                                </div>
                            ) : (
                                <>
                                    {paginatedPositions.map((position, index) => {
                                        const feeTierPercent = (Number(position.pool.feeTier) / 10000).toString()

                                        const token0 = tokens.find(t => t.id.toLowerCase() === position.pool.token0.id.toLowerCase()) ?? position.pool.token0;
                                        const token1 = tokens.find(t => t.id.toLowerCase() === position.pool.token1.id.toLowerCase()) ?? position.pool.token1;

                                        // Assurer que les prix USD sont disponibles
                                        if (token0.symbol === 'WETH') token0.derivedUSD = lastEthPrice;
                                        if (token1.symbol === 'WETH') token1.derivedUSD = lastEthPrice;

                                        const positionTickData = ticksData.get(position.id);

                                        const feesEarnedUSD = positionTickData
                                            ? calculateFeesEarnedUSD(position, token0, token1, positionTickData.tickLowerData, positionTickData.tickUpperData)
                                            : 0;

                                        const collectedFees0USD = Number(position.collectedFeesToken0) * Number(token0.derivedUSD ?? 0);
                                        const collectedFees1USD = Number(position.collectedFeesToken1) * Number(token1.derivedUSD ?? 0);
                                        const collectedFeesUSD = collectedFees0USD + collectedFees1USD;
                                        const claimableFeesUSD = Math.max(0, feesEarnedUSD - collectedFeesUSD);

                                        const isInRange = isPositionInRange(position);
                                        const positionApr = calculatePositionAPR(position, token0, token1);

                                        return (
                                            <Link key={position.id} href={`/pools/${position.pool.id}`}>
                                                <div key={position.id} className="gap-4 px-4 py-2 my-3 bg-background-light hover:bg-background-light-xl border rounded-lg transition-all">
                                                    {/* Pool */}
                                                    <div className="flex items-center space-x-2 mb-2">
                                                        <div className="flex -space-x-4" title={`Position #${position.id}`}>
                                                            <div style={{ zIndex: 21 }}><TokenLogo token={token0} /></div>
                                                            <div style={{ zIndex: 20 }}><TokenLogo token={token1} /></div>
                                                        </div>
                                                        <div className="font-medium">
                                                            {token0.symbol}/{token1.symbol}
                                                        </div>
                                                        <div className="px-2 text-xs text-foreground-light">{feeTierPercent}% Fee</div>
                                                        <div className="ms-auto" ref={positionsOpenMenuId === position.id ? positionsMenuRef : null}>
                                                            {/* Actions */}
                                                            <button
                                                                className="px-3 py-1 text-sm border rounded cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-background-light"
                                                                onClick={(event) => { event.preventDefault(); setPositionsOpenMenuId(old => (old === position.id) ? null : position.id as Address) }}
                                                            >
                                                                ⋮
                                                            </button>

                                                            {positionsOpenMenuId === position.id && (
                                                                <div className='absolute right-0 bg-background px-4 py-2 rounded-md flex gap-2 border transition-all z-50'>
                                                                    <button
                                                                        onClick={(event) => { event.preventDefault(); showAddLiquidityModal(position.pool.id, position.id) }}
                                                                        className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light"
                                                                    >
                                                                        Add
                                                                    </button>

                                                                    <button
                                                                        onClick={(event) => { event.preventDefault(); showRemoveLiquidityModal(position.pool.id, position.id) }}
                                                                        className="px-2 py-1 text-sm rounded cursor-pointer transition-all hover:bg-background-light"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div key={`${position.id}-${index}`} className="grid grid-cols-4 text-sm">
                                                        {/* Size (Liquidity) */}
                                                        <div className="">
                                                            <div className="text-foreground-light">Size</div>
                                                            <div>
                                                                {formatNumber(position.amountDepositedUSD)}
                                                            </div>
                                                        </div>

                                                        {/* Claimable Fees */}
                                                        <div className="">
                                                            <div className="text-foreground-light">Fees</div>
                                                            <div>${formatNumber(claimableFeesUSD, 2)}</div>
                                                        </div>

                                                        {/* APR */}
                                                        <div className="">
                                                            <div className="text-foreground-light">APR</div>
                                                            <div>{positionApr.toFixed(2)}%</div>
                                                        </div>

                                                        {/* Status */}
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

                            {/* Create Pool Button */}
                            <div className="mt-6">
                                <Link
                                    href={"/pools/create-pool"}
                                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 cursor-pointer"
                                >
                                    Create Pool
                                </Link>
                            </div>
                        </div>

                    </div>
                </div>


                <PortfolioModalTransferToken
                    isOpen={isModalTransferTokenOpen}
                    tokens={tokens}
                    selectedToken={selectedToken}
                    loading={tokensLoading}
                    isTransferingToken={isTransferingToken}
                    transferTokenError={transferTokenError}
                    transferTokenInfo={transferTokenInfo}
                    closeModal={() => { setIsModalTransferTokenOpen(false); setSelectedToken(null) }}
                    transferToken={transferToken}
                    setTransferTokenError={setTransferTokenError}
                    setTransferTokenInfo={setTransferTokenInfo}
                />

            </div>
        </div>
    );
}


