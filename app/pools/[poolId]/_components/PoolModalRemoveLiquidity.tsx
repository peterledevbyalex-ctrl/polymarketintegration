"use client"

import { Dispatch, MouseEvent, SetStateAction, useEffect, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'

import { formatNumber } from '@/lib/ui_utils'
import { calculateTokenAmountsFromLiquidity } from '@/lib/uniswap_utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'

import { DEFAULT_LP_SLIPPAGE } from '@/lib/uniswap_utils'

import { Button } from '@/components/ui/button'
import { TokenLogo } from '@/components/TokenLogo'
import { TransactionsInfoModal } from '@/components/TransactionsInfoModal'

import type { SubgraphPool, SubgraphPosition, SimpleResult, Token } from '@/types'
import { useApp } from '@/providers/AppProvider'


interface PoolModalRemoveLiquidityProps {
    isOpen: boolean
    tokens: Token[]
    pool?: SubgraphPool
    positionId: string
    loading: boolean
    userPoolPositions: SubgraphPosition[]
    removePoolLiquidityError: string
    removePoolLiquidityInfo: string
    isRemovingLiquidity: boolean
    isTransactionsInfoModalOpen: boolean
    transactionsInfoSteps: string[]
    transactionsInfoCurrentStep: number
    closeModal: () => void
    removePoolLiquidity: (tokenId: string, amount: string, userAmount0Desired: string, userAmount1Desired: string, positionPercent: number, slippage?: number) => Promise<SimpleResult>
    setRemovePoolLiquidityError: Dispatch<SetStateAction<string>>
    setRemovePoolLiquidityInfo: Dispatch<SetStateAction<string>>
    setIsTransactionsInfoModalOpen: Dispatch<SetStateAction<boolean>>
    setTransactionsInfoSteps: Dispatch<SetStateAction<string[]>>
    setTransactionsInfoCurrentStep: Dispatch<SetStateAction<number>>
}


export const PoolModalRemoveLiquidity: React.FC<PoolModalRemoveLiquidityProps> = ({
    isOpen, tokens, pool, positionId, loading, isRemovingLiquidity, userPoolPositions, removePoolLiquidityError, removePoolLiquidityInfo, isTransactionsInfoModalOpen, transactionsInfoSteps, transactionsInfoCurrentStep,
    closeModal, removePoolLiquidity, setRemovePoolLiquidityError, setIsTransactionsInfoModalOpen, setTransactionsInfoCurrentStep,
}) => {
    const { isConnected, userAddress, isDesktop } = useApp()

    const [position, setPosition] = useState<SubgraphPosition | null>(null)
    const [liquidityAmount, setLiquidityAmount] = useState("")

    const token0 = tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0;
    const token1 = tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1;

    const slippage = DEFAULT_LP_SLIPPAGE;


    // Calculer la liquidité totale disponible
    const totalLiquidity = position ? Number(formatUnits(BigInt(position.liquidity), 18)) : 0

    const liquidityAmountNum = Number(liquidityAmount) || 0
    const liquidityAmountBN = liquidityAmountNum ? parseUnits(liquidityAmount, 18) : 0n
    const liquidityPercentage = totalLiquidity > 0 ? (liquidityAmountNum / totalLiquidity) * 100 : 0


    // Calculer les montants estimés de tokens basés sur la liquidité et les ticks
    const tokenAmounts = position && liquidityAmountNum > 0
        ? calculateTokenAmountsFromLiquidity(
            liquidityAmountBN,
            Number(position.tickLower),
            Number(position.tickUpper),
            Number(pool.tick),
            BigInt(pool.sqrtPrice)
        )
        : { amount0: 0n, amount1: 0n }

    const estimatedToken0 = formatUnits(tokenAmounts.amount0, token0.decimals)
    const estimatedToken1 = formatUnits(tokenAmounts.amount1, token1.decimals)

    const removeLiquidityAllowed = !loading && position && liquidityAmountNum > 0 && liquidityAmountNum <= totalLiquidity && !isRemovingLiquidity


    let removeLiquidityText = 'Remove Liquidity';
    if (loading) removeLiquidityText = 'Loading...'


    const handlePercentageClick = (percentage: number) => {
        if (position) {
            const targetLiquidity = (totalLiquidity * percentage) / 100

            if (percentage >= 100) {
                setLiquidityAmount(targetLiquidity.toFixed(18))

            } else {
                setLiquidityAmount(targetLiquidity.toFixed(18))
            }
        }
    }


    const handleRemoveLiquidity = async () => {
        if (!position || !removeLiquidityAllowed) return

        const result = await removePoolLiquidity(position.id, liquidityAmount, estimatedToken0, estimatedToken1, liquidityPercentage, slippage)

        if (result.success) {
            setLiquidityAmount('');

            if (liquidityPercentage >= 100) {
                closeModal();
            }
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
            setLiquidityAmount('')
            setPosition(null)
            setRemovePoolLiquidityError('')
            return;
        }
    }, [isOpen, pool])


    useEffect(() => {
        // set position
        if (isOpen && pool && positionId) {
            const position = userPoolPositions.find(p => p.id === positionId) ?? null;
            setPosition(position);
        }
    }, [isOpen, pool, userPoolPositions, positionId])


    if (!pool || !isOpen) return null


    return (
        <>
            <div className="fixed inset-0 bg-background/90 flex items-center justify-center z-50 modal-container" onClick={(e) => clicModal(e)}>
                <div className="bg-background-light-sm border border-background-light rounded-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden p-4">

                    {/* Header */}
                    <div className="flex justify-between mb-4 pb-2 border-b border-background-light">
                        <h2 className="flex items-center gap-3 text-xl font-bold">
                            <span className="">
                                Remove Liquidity
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
                                        <div className="">0</div>
                                        <div className="text-foreground-light">%</div>
                                    </div>
                                </div>
                            </div>

                            {position && (
                                <>
                                    {/* Amount to Remove */}
                                    <div className="border border-background-light rounded-md p-4 mb-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm">Liquidity to Remove</span>
                                            <span className="text-sm text-foreground-light cursor-pointer hover:bg-background-light" onClick={() => handlePercentageClick(100)}>
                                                Max: {formatNumber(totalLiquidity)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <input
                                                type="text"
                                                placeholder="0"
                                                autoFocus={isDesktop}
                                                value={liquidityAmount}
                                                onChange={(e) => setLiquidityAmount(e.target.value)}
                                                className="bg-transparent text-lg font-semibold w-full outline-none text-foreground placeholder-gray-400"
                                            />
                                            <span className="text-sm">Liquidity</span>
                                        </div>
                                        {liquidityAmountNum > 0 && (
                                            <div className="text-xs text-gray-400 mt-1">
                                                {liquidityPercentage.toFixed(2)}% of position
                                            </div>
                                        )}
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => handlePercentageClick(25)}
                                                className="border rounded-lg px-3 py-1 text-sm transition-colors cursor-pointer text-foreground-light hover:bg-background-light"
                                            >
                                                25%
                                            </button>
                                            <button
                                                onClick={() => handlePercentageClick(50)}
                                                className="border rounded-lg px-3 py-1 text-sm transition-colors cursor-pointer text-foreground-light hover:bg-background-light"
                                            >
                                                50%
                                            </button>
                                            <button
                                                onClick={() => handlePercentageClick(75)}
                                                className="border rounded-lg px-3 py-1 text-sm transition-colors cursor-pointer text-foreground-light hover:bg-background-light"
                                            >
                                                75%
                                            </button>
                                            <button
                                                onClick={() => handlePercentageClick(100)}
                                                className="border rounded-lg px-3 py-1 text-sm transition-colors cursor-pointer text-foreground-light hover:bg-background-light"
                                            >
                                                Max
                                            </button>
                                        </div>
                                    </div>

                                    {/* You will receive */}
                                    <div className="p-2 mb-4">
                                        <h4 className="text-sm font-medium text-foreground-light mb-2">You will receive (estimated)</h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <div className="flex justify-between gap-2">
                                                    <TokenLogo token={token0} />
                                                    <span className="text-sm text-foreground-light p-1">{position.pool.token0.symbol}</span>
                                                </div>
                                                <span className="font-medium text-foreground">
                                                    {formatNumber(estimatedToken0)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex justify-between gap-2">
                                                    <TokenLogo token={token1} />
                                                    <span className="text-sm text-foreground-light p-1">{position.pool.token1.symbol}</span>
                                                </div>
                                                <span className="font-medium text-foreground">
                                                    {formatNumber(estimatedToken1)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>


                                    <>
                                        {removePoolLiquidityInfo && (
                                            <div className="border rounded-lg bg-background-light p-1 mb-4 text-center">
                                                {removePoolLiquidityInfo}
                                            </div>
                                        )}

                                        {removePoolLiquidityError && (
                                            <div className="border rounded-lg bg-background-light p-1 mb-4 text-center text-red-500">
                                                ❌ Error: {removePoolLiquidityError}
                                            </div>
                                        )}
                                    </>

                                    <Button
                                        variant='default'
                                        disabled={!removeLiquidityAllowed}
                                        onClick={handleRemoveLiquidity}
                                        className="w-full py-6 cursor-pointer"
                                    >
                                        {removeLiquidityText}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            <TransactionsInfoModal
                isOpen={isTransactionsInfoModalOpen}
                modalTitle="Withdraw Tokens"
                steps={transactionsInfoSteps}
                currentStep={transactionsInfoCurrentStep}
                closeModal={() => { setIsTransactionsInfoModalOpen(false); }}
                setCurrentStep={setTransactionsInfoCurrentStep}
                />
        </>
    )
}

