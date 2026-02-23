"use client"

import { formatUnits } from 'viem'
import { Dispatch, MouseEvent, SetStateAction, useEffect, useState } from 'react'

//import * as apiBlockchainPools from '@/lib/api_blockchain_pools'
import { calculateFeesEarnedUSD, calculatePositionAPR, calculateUnclaimedFees, isPositionInRange } from '@/lib/uniswap_utils'

import { TransactionsInfoModal } from '@/components/TransactionsInfoModal'
import { Button } from '@/components/ui/button'
import { TokenLogo } from '@/components/TokenLogo'

import type { SubgraphPool, SubgraphPosition, SimpleResult, Token, PositionRawResult, TicksResult } from '@/types'
import { formatNumber } from '@/lib/ui_utils'
import { getPoolTicks } from '@/lib/api_blockchain_pools'


interface PoolModalCollectFeesProps {
    isOpen: boolean
    tokens: Token[]
    pool?: SubgraphPool
    positionId: string
    loading: boolean
    userPoolPositions: SubgraphPosition[]
    collectPoolFeesError: string
    collectPoolFeesInfo: string
    isCollectingFees: boolean
    isTransactionsInfoModalOpen: boolean
    transactionsInfoSteps: string[]
    transactionsInfoCurrentStep: number
    closeModal: () => void
    collectPoolFees: (tokenId: string) => Promise<SimpleResult>
    setCollectPoolFeesError: Dispatch<SetStateAction<string>>
    setCollectPoolFeesInfo: Dispatch<SetStateAction<string>>
    setIsTransactionsInfoModalOpen: Dispatch<SetStateAction<boolean>>
    setTransactionsInfoSteps: Dispatch<SetStateAction<string[]>>
    setTransactionsInfoCurrentStep: Dispatch<SetStateAction<number>>
}


export const PoolModalCollectFees: React.FC<PoolModalCollectFeesProps> = ({
    isOpen, tokens, pool, positionId, loading, isCollectingFees, userPoolPositions, collectPoolFeesError, collectPoolFeesInfo, isTransactionsInfoModalOpen, transactionsInfoSteps, transactionsInfoCurrentStep,
    closeModal, collectPoolFees, setCollectPoolFeesError, setCollectPoolFeesInfo, setIsTransactionsInfoModalOpen, setTransactionsInfoSteps, setTransactionsInfoCurrentStep,
}) => {
    const [position, setPosition] = useState<SubgraphPosition | null>(null)
    //const [liquidityAmount, setLiquidityAmount] = useState("")
    //const [positionRaw, setPositionRaw] = useState<PositionRawResult | null>(null)

    const [tickLowerData, setTickLowerData] = useState<TicksResult | null>(null);
    const [tickUpperData, setTickUpperData] = useState<TicksResult | null>(null);

    const token0 = tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0;
    const token1 = tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1;

//    const totalLiquidity = position ? Number(formatUnits(BigInt(position.liquidity), 18)) : 0
//    const liquidityAmountNum = totalLiquidity; //Number(liquidityAmount);

    // Calculer les montants estimés de tokens
//    const estimatedFeeToken0 = positionRaw && position && liquidityAmountNum > 0
//        ? (liquidityAmountNum / totalLiquidity) * Number(formatUnits(positionRaw.tokensOwed0 || BigInt(0), position.pool.token0.decimals))
//        : 0

//    const estimatedFeeToken1 = positionRaw && position && liquidityAmountNum > 0
//        ? (liquidityAmountNum / totalLiquidity) * Number(formatUnits(positionRaw.tokensOwed1 || BigInt(0), position.pool.token1.decimals))
//        : 0

    //const feesEarned0 = position ? (Number(position.depositedToken0) - Number(position.withdrawnToken0) - Number(position.collectedFeesToken0)) : 0;
    //const feesEarned1 = position ? (Number(position.depositedToken1) - Number(position.withdrawnToken1) - Number(position.collectedFeesToken1)) : 0;

    const { fees0: feesEarned0, fees1: feesEarned1 } = (position && tickLowerData && tickUpperData) ? calculateUnclaimedFees(position, tickLowerData, tickUpperData) : { fees0: 0n, fees1: 0n };
    const unclaimedFees0 = Number(formatUnits(feesEarned0, token0.decimals));
    const unclaimedFees1 = Number(formatUnits(feesEarned1, token1.decimals));
    const feesEarnedUSD =
        (Number.isFinite(unclaimedFees0) ? unclaimedFees0 : 0) * Number(token0.derivedUSD || '0') +
        (Number.isFinite(unclaimedFees1) ? unclaimedFees1 : 0) * Number(token1.derivedUSD || '0');

    const claimedFees0 = position ? Number(position.collectedFeesToken0) : 0;
    const claimedFees1 = position ? Number(position.collectedFeesToken1) : 0;
    const claimedFeesUsd =
        (Number.isFinite(claimedFees0) ? claimedFees0 : 0) * Number(token0.derivedUSD || '0') +
        (Number.isFinite(claimedFees1) ? claimedFees1 : 0) * Number(token1.derivedUSD || '0');

    //const isInRange = isPositionInRange(position);
    const positionApr = position ? calculatePositionAPR(position, token0, token1) : 0;
    const positionTvl = position ? Number(position.amountDepositedUSD || '0') : 0;
    const isLowLiquidity = positionTvl < 50; // TVL below $50


    const hasTicksData = Boolean(tickLowerData && tickUpperData);
    const hasUnclaimedFees = feesEarned0 > 0n || feesEarned1 > 0n;

    const collectFeesAllowed = !loading && position && !isCollectingFees && hasTicksData && hasUnclaimedFees


    let collectFeesText = 'Collect Fees';
    if (loading) collectFeesText = 'Loading...'


    const fetchTicksData = async () => {
        const [tickLowerData, tickUpperData] = await Promise.all([
            getPoolTicks(pool.id, Number(position.tickLower)),
            getPoolTicks(pool.id, Number(position.tickUpper)),
        ]);

        setTickLowerData(tickLowerData)
        setTickUpperData(tickUpperData)
    }


    const handleCollectFees = async () => {
        if (!position || !collectFeesAllowed) return

        const result = await collectPoolFees(position.id)

        if (result.success) {

        }
    }


    const clicModal = (event: MouseEvent) => {
        // @ts-ignore
        if (event.target.classList.contains('modal-container')) {
            closeModal()
        }
    }


    useEffect(() => {
        if (!isOpen || !pool) {
            // reset values on modal open/close
            setPosition(null)
            setCollectPoolFeesError('')
            return;
        }
    }, [isOpen, pool])


    useEffect(() => {
        // set position
        if (isOpen && pool && positionId) {
            const position = userPoolPositions.find(p => p.id === positionId) ?? null;
            setPosition(position);

            //if (position) {
            //    apiBlockchainPools.fetchPosition(position.id)
            //        .then(positionRaw => {
            //            console.log('positionRaw:', positionRaw)
            //            setPositionRaw(positionRaw)
            //        })
            //}
        }
    }, [isOpen, pool, userPoolPositions, positionId])


    useEffect(() => {
        if (position) {
            fetchTicksData()
        }
    }, [position])


    if (!pool || !isOpen) return null


    return (
        <>
            <div className="fixed inset-0 bg-background/90 flex items-center justify-center z-50 modal-container" onClick={(e) => clicModal(e)}>
                <div className="bg-background-light-sm border border-background-light rounded-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden p-4">

                    {/* Header */}
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-background-light">
                        <h2 className="flex items-center gap-3 text-xl font-bold">
                            <span className="">
                                Collect Fees
                            </span>

                            <span className="text-sm text-foreground-light">
                                Position #{positionId}
                            </span>
                        </h2>

                        <button
                            onClick={closeModal}
                            className="text-2xl p-2 rounded-lg hover:bg-background-light transition-colors duration-200 cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-1">
                        <div className="">

                            <div className="mb-5 flex justify-between">
                                <div className="flex gap-2">
                                    <div className="flex -space-x-4">
                                        <div style={{ zIndex: 21 }}><TokenLogo token={token0} /></div>
                                        <div style={{ zIndex: 20 }}><TokenLogo token={token1} /></div>
                                    </div>

                                    <div className="font-medium">
                                        {pool.token0.symbol}/{pool.token1.symbol}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-foreground-light">APY</div>
                                    <div className="flex text-right">
                                        {isLowLiquidity ? (
                                            <span className="text-yellow-500" title="Low liquidity detected. High APR is caused by minimal TVL and does not reflect long-term yield.">⚠️ {positionApr.toFixed(2)}%</span>
                                        ) : (
                                            <>
                                                <div className="">{positionApr.toFixed(2)}</div>
                                                <div className="text-foreground-light">%</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {position && (
                                <>
                                    {/* Collect Fees */}
                                    <div className="border border-background-light rounded-md p-4 mb-4">

                                        <div className="flex justify-between">
                                            <div>Unclaimed fees</div>
                                            <div>${formatNumber(feesEarnedUSD)}</div>
                                        </div>
                                        <div className="flex justify-end">
                                            <div className="text-foreground-light text-end">
                                                {formatNumber(formatUnits(feesEarned0, token0.decimals))} {token0.symbol} + {formatNumber(formatUnits(feesEarned1, token1.decimals))} {token1.symbol}
                                            </div>
                                        </div>

                                        <div className="flex justify-between mt-2 pt-2 border-t border-background-light">
                                            <div className="text-foreground-light">Lifetime claimed</div>
                                            <div className="text-foreground-light">${formatNumber(claimedFeesUsd)}</div>
                                        </div>
                                        <div className="flex justify-end">
                                            <div className="text-foreground-light text-end">
                                                {formatNumber(claimedFees0)} {token0.symbol} + {formatNumber(claimedFees1)} {token1.symbol}
                                            </div>
                                        </div>

                                        {hasTicksData && !hasUnclaimedFees && (
                                            <div className="text-xs text-foreground-light mt-2">
                                                No fees to collect
                                            </div>
                                        )}

                                    </div>


                                    <>
                                        {collectPoolFeesInfo && (
                                            <div className="border rounded-lg bg-background-light p-1 mb-4 text-center">
                                                {collectPoolFeesInfo}
                                            </div>
                                        )}

                                        {collectPoolFeesError && (
                                            <div className="border rounded-lg bg-background-light p-1 mb-4 text-center text-red-500">
                                                ❌ Error: {collectPoolFeesError}
                                            </div>
                                        )}
                                    </>

                                    <Button
                                        variant='default'
                                        disabled={!collectFeesAllowed}
                                        onClick={handleCollectFees}
                                        className="w-full py-6 cursor-pointer"
                                    >
                                        {collectFeesText}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            <TransactionsInfoModal
                isOpen={isTransactionsInfoModalOpen}
                modalTitle="Collect Fee"
                steps={transactionsInfoSteps}
                currentStep={transactionsInfoCurrentStep}
                closeModal={() => { setIsTransactionsInfoModalOpen(false); }}
                setCurrentStep={setTransactionsInfoCurrentStep}
                />
        </>
    )
}

