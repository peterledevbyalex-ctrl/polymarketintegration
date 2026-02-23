"use client"

import { Dispatch, MouseEvent, SetStateAction, useEffect, useState } from 'react'

import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens'
import * as apiBlockchainPools from '@/lib/api_blockchain_pools'

import { TokenLogo } from '@/components/TokenLogo';
import { Button } from '@/components/ui/button';
import { DepositField } from '@/app/pools/_components/DepositField';
import { TransactionsInfoModal } from '@/components/TransactionsInfoModal'
import { useApp } from '@/providers/AppProvider'

import { DEFAULT_LP_SLIPPAGE } from '@/lib/uniswap_utils'
import { formatNumber } from '@/lib/ui_utils'

import type { SubgraphPool, SubgraphPosition, Token, TransactionResult } from '@/types'


interface PoolModalAddLiquidityProps {
    isOpen: boolean
    tokens: Token[]
    pool: SubgraphPool
    positionId: string
    loading: boolean
    isAddingLiquidity: boolean
    userPoolPositions: SubgraphPosition[]
    addPoolLiquidityError: string
    addPoolLiquidityInfo: string
    isTransactionsInfoModalOpen: boolean
    transactionsInfoSteps: string[]
    transactionsInfoCurrentStep: number
    closeModal: () => void
    addPoolLiquidity: (pool: SubgraphPool, positionId: string, userAmount0Desired: string, userAmount1Desired: string, slippage?: number) => Promise<TransactionResult>
    setAddPoolLiquidityError: Dispatch<SetStateAction<string>>
    setAddPoolLiquidityInfo: Dispatch<SetStateAction<string>>
    setIsTransactionsInfoModalOpen: Dispatch<SetStateAction<boolean>>
    setTransactionsInfoSteps: Dispatch<SetStateAction<string[]>>
    setTransactionsInfoCurrentStep: Dispatch<SetStateAction<number>>
}


export const PoolModalAddLiquidity: React.FC<PoolModalAddLiquidityProps> = ({
    isOpen, tokens, pool, positionId, userPoolPositions, loading, isAddingLiquidity, addPoolLiquidityError, addPoolLiquidityInfo, isTransactionsInfoModalOpen, transactionsInfoSteps, transactionsInfoCurrentStep,
    closeModal, addPoolLiquidity, setAddPoolLiquidityError, setAddPoolLiquidityInfo, setIsTransactionsInfoModalOpen, setTransactionsInfoSteps, setTransactionsInfoCurrentStep,
}) => {

    const { isConnected, userAddress, walletClient } = useApp()

    const [amount0, setAmount0] = useState("");
    const [amount1, setAmount1] = useState("");
    const [lastModified, setLastModified] = useState<0 | 1 | null>(null);

    const [position, setPosition] = useState<SubgraphPosition | null>(null)

    const [balance0, setBalance0] = useState("0.0");
    const [balance1, setBalance1] = useState("0.0");

    const slippage = DEFAULT_LP_SLIPPAGE;


    const balanceOk0 = Number(balance0) > 0 && Number(balance0) >= Number(amount0);
    const balanceOk1 = Number(balance1) > 0 && Number(balance1) >= Number(amount1);

    const addLiquidityAllowed = !loading && balanceOk0 && balanceOk1 && Number(amount0) > 0 && Number(amount1) > 0 && ! isAddingLiquidity && true;

    let addPoolLiquidityText = 'Add Liquidity';
    if (loading) addPoolLiquidityText = "Loading...";


    const token0 = tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0;
    const token1 = tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1;

    const currentAmountUsd = position ? Number(position.amountDepositedUSD ?? 0) : 0;

    const token0Usd = Number(token0.derivedUSD ?? 0);
    const token1Usd = Number(token1.derivedUSD ?? 0);
    const addedAmountUsd = (Number(amount0 || 0) * token0Usd) + (Number(amount1 || 0) * token1Usd);
    const newTotalAmountUsd = currentAmountUsd + addedAmountUsd;

    const poolTvlUsd = Number(pool.totalValueLockedUSD ?? 0);
    const userPoolSharePercent = poolTvlUsd > 0 ? (newTotalAmountUsd / poolTvlUsd) * 100 : 0;


    const clicModal = (event: MouseEvent) => {
        // @ts-ignore
        if (event.target.classList.contains('modal-container')) {
            closeModal()
        }
    }


    const handleAddPoolLiquidity = async () => {
        const result = await addPoolLiquidity(pool, positionId, amount0, amount1, slippage)

        if (result.success) {
            setAmount0('');
            setAmount1('');
        }
    }


    useEffect(() => {
        if (!isOpen || !pool) {
            // reset values on modal open/close
            setAmount0('')
            setAmount1('')
            setAddPoolLiquidityError('')
            setAddPoolLiquidityInfo('')
            return;
        }

        // reload balances
        apiBlockchainTokens.getUserTokenBalance(pool.token0, userAddress)
            .then((value) => {
                setBalance0(value);
            });

        apiBlockchainTokens.getUserTokenBalance(pool.token1, userAddress)
            .then((value) => {
                setBalance1(value);
            });
    }, [isOpen, pool])


    useEffect(() => {
        // set position
        if (isOpen && pool && positionId) {
            const position = userPoolPositions.find(p => p.id === positionId) ?? null;
            setPosition(position);
        }
    }, [isOpen, pool, userPoolPositions, positionId])


    useEffect(() => {
        // Update amount1 from amount0
        if (!pool) return;
        if (!position) return;

        if (lastModified !== 0) {
            //setLastModified(null);
            return;
        }

        if (amount0) {
            if (Number(amount0) < 0) {
                setAmount0("0")
                return
            }

            if (lastModified === 0) {
                //apiBlockchainPools.getPoolLiquidityAddAmount1(pool.id, amount0, pool.token0.decimals, pool.token1.decimals, BigInt(pool.sqrtPrice))
                apiBlockchainPools.getPoolLiquidityAddAmount1_Beta(
                    pool.id as `0x${string}`,
                    amount0,
                    Number(position.tickLower),
                    Number(position.tickUpper),
                    pool.token0.decimals,
                    pool.token1.decimals
                )
                    .then((amount1) => {
                        setAmount1(amount1.toString());
                    })
            }

        } else {
            setAmount1('');
        }
    }, [pool, amount0])


    useEffect(() => {
        // Update amount0 from amount1
        if (!pool) return;
        if (!position) return;

        if (lastModified !== 1) {
            //setLastModified(null);
            return;
        }

        if (amount1) {
            if (Number(amount1) < 0) {
                setAmount1("0")
                return
            }

            //apiBlockchainPools.getPoolLiquidityAddAmount0(pool.id, amount1, pool.token0.decimals, pool.token1.decimals, BigInt(pool.sqrtPrice))
            apiBlockchainPools.getPoolLiquidityAddAmount0_Beta(
                pool.id as `0x${string}`,
                amount1,
                Number(position.tickLower),
                Number(position.tickUpper),
                pool.token0.decimals,
                pool.token1.decimals
            )
                .then((amount0) => {
                    setAmount0(amount0.toString());
                });

        } else {
            setAmount0('');
        }
    }, [pool, amount1])


    if (!pool || !isOpen) return null


    return (
        <>
            <div className="fixed inset-0 bg-background/90 flex items-center justify-center z-50 modal-container" onClick={(e) => clicModal(e)}>
                <div className="bg-background-light-sm border border-background-light rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto p-4">

                    {/* Header */}
                    <div className="flex justify-between mb-4 pb-2 border-b border-background-light">
                        <h2 className="flex items-center gap-3 text-xl font-bold">
                            <span className="">
                                Add Liquidity
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
                    <div className="p-2">
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

                            {/* Token A */}
                            <div className="mb-2">
                                <DepositField
                                    fieldType='token0'
                                    amount={amount0}
                                    setAmount={(amount) => { setLastModified(0); setAmount0(amount); }}
                                    token={token0}
                                    tokenBalance={balance0}
                                    />
                            </div>

                            {/* Token B */}
                            <div className="mb-4">
                                <DepositField
                                    fieldType='token1'
                                    amount={amount1}
                                    setAmount={(amount) => { setLastModified(1); setAmount1(amount); }}
                                    token={token1}
                                    tokenBalance={balance1}
                                    />
                            </div>

                            {/* Pool Info Summary */}
                            <div className="mb-4 pt-2">
                                <div className="text-sm space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-foreground-light">Slippage</span>
                                        <span className="font-medium">{slippage}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-foreground-light">Pool Share</span>
                                        <span className="font-medium">{formatNumber(userPoolSharePercent, 4)}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-foreground-light">Current Amount</span>
                                        <span className="font-medium">${formatNumber(currentAmountUsd, 2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-foreground-light">New Total Amount</span>
                                        <span className="font-medium">${formatNumber(newTotalAmountUsd, 2)}</span>
                                    </div>
                                </div>
                            </div>


                            <>
                                {addPoolLiquidityInfo && (
                                    <div className="border rounded-lg bg-background-light p-1 mb-4 text-center">
                                        {addPoolLiquidityInfo}
                                    </div>
                                )}

                                {addPoolLiquidityError && (
                                    <div className="border rounded-lg bg-background-light p-1 mb-4 text-center text-red-500">
                                        ❌ Error: {addPoolLiquidityError}
                                    </div>
                                )}
                            </>

                            <Button
                                variant='default'
                                disabled={!addLiquidityAllowed}
                                className="w-full py-6 cursor-pointer"
                                onClick={() => handleAddPoolLiquidity()}
                            >
                                {addPoolLiquidityText}
                            </Button>

                        </div>
                    </div>
                </div>
            </div>


            <TransactionsInfoModal
                isOpen={isTransactionsInfoModalOpen}
                modalTitle="Deposit Tokens"
                steps={transactionsInfoSteps}
                currentStep={transactionsInfoCurrentStep}
                closeModal={() => { setIsTransactionsInfoModalOpen(false); }}
                setCurrentStep={setTransactionsInfoCurrentStep}
                />
        </>
    )
}

