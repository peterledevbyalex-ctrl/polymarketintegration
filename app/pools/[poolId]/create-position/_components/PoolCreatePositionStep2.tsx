"use client"

import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { useConnectModal } from '@rainbow-me/rainbowkit'

import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens'
import * as apiBlockchainPools from '@/lib/api_blockchain_pools'
import { formatValue } from '@/lib/ui_utils'
import { useApp } from '@/providers/AppProvider'

import { DEFAULT_LP_SLIPPAGE } from '@/lib/uniswap_utils'

import { Button } from '@/components/ui/button'
import { DepositField } from '@/app/pools/_components/DepositField';
import { TransactionsInfoModal } from '@/components/TransactionsInfoModal'

import type { SubgraphPool, Token } from '@/types'


interface PoolCreatePositionStep2Props {
    tokens: Token[],
    pool: SubgraphPool,
    isAddingLiquidity: boolean,
    addPoolLiquidityError: string
    addPoolLiquidityInfo: string
    isTransactionsInfoModalOpen: boolean
    transactionsInfoSteps: string[]
    transactionsInfoCurrentStep: number
    setAddPoolLiquidityError: Dispatch<SetStateAction<string>>
    setAddPoolLiquidityInfo: Dispatch<SetStateAction<string>>
    submitStep: (amount0: string, amount1: string, slippage: number) => void
    setIsTransactionsInfoModalOpen: Dispatch<SetStateAction<boolean>>
    setTransactionsInfoSteps: Dispatch<SetStateAction<string[]>>
    setTransactionsInfoCurrentStep: Dispatch<SetStateAction<number>>
}


export const PoolCreatePositionStep2 = ({
    tokens, pool, addPoolLiquidityError, addPoolLiquidityInfo, isAddingLiquidity, isTransactionsInfoModalOpen, transactionsInfoSteps, transactionsInfoCurrentStep,
    setAddPoolLiquidityError, setAddPoolLiquidityInfo, submitStep, setIsTransactionsInfoModalOpen, setTransactionsInfoSteps, setTransactionsInfoCurrentStep,
}: PoolCreatePositionStep2Props) => {

    const { isConnected, userAddress } = useApp()
    const { openConnectModal } = useConnectModal()

    const [amount0, setAmount0] = useState("0");
    const [amount1, setAmount1] = useState("0");
    const [lastModified, setLastModified] = useState<0 | 1 | null>(null);

    const [balance0, setBalance0] = useState(pool.token0.userBalance || "0.0");
    const [balance1, setBalance1] = useState(pool.token1.userBalance || "0.0");

    //const price = (Number(amount1) / Number(amount0)).toString();

    const balanceOk0 = Number(balance0) > 0 && Number(balance0) >= Number(amount0);
    const balanceOk1 = Number(balance1) > 0 && Number(balance1) >= Number(amount1);

    const slippage = DEFAULT_LP_SLIPPAGE;

    const token0 = pool ? (tokens.find(t => t.id.toLowerCase() === pool.token0.id.toLowerCase()) ?? pool.token0) : null;
    const token1 = pool ? (tokens.find(t => t.id.toLowerCase() === pool.token1.id.toLowerCase()) ?? pool.token1) : null;

    const createPoolAllowed = pool && Number(amount0) > 0 && Number(amount1) > 0 && balanceOk0 && balanceOk1 && ! isAddingLiquidity && true;


    let createPoolText = 'Deposit Tokens';
    //if (false) createPoolText = 'Deposit Tokens'
    //else createPoolText = 'Deposit Tokens';


    useEffect(() => {
        // load tokens balance
        if (!pool) return;

        if (userAddress) {
            apiBlockchainTokens.getUserTokenBalance(pool.token0, userAddress)
                .then((value) => {
                    setBalance0(value);
                });
        }

        if (userAddress) {
            apiBlockchainTokens.getUserTokenBalance(pool.token1, userAddress)
                .then((value) => {
                    setBalance1(value);
                });
        }
    }, [pool, userAddress])


    useEffect(() => {
        // Update amount1 from amount0
        if (!pool) return;

        if (lastModified !== 0) {
            //setLastModified(null);
            return;
        }

        if (amount0) {
            if (Number(amount0) < 0) {
                setAmount0("0")
                return
            }

            apiBlockchainPools.getPoolLiquidityAddAmount1(pool.id, amount0, pool.token0.decimals, pool.token1.decimals, BigInt(pool.sqrtPrice))
                .then((amount1) => {
                    setAmount1(formatValue(amount1));
                });
        }
    }, [amount0])


    useEffect(() => {
        // Update amount0 from amount1
        if (!pool) return;

        if (lastModified !== 1) {
            //setLastModified(null);
            return;
        }

        if (amount1) {
            if (Number(amount1) < 0) {
                setAmount1("0")
                return
            }

            apiBlockchainPools.getPoolLiquidityAddAmount0(pool.id, amount1, pool.token0.decimals, pool.token1.decimals, BigInt(pool.sqrtPrice))
                .then((amount0) => {
                    setAmount0(formatValue(amount0));
                });
        }
    }, [amount1])


    return (
        <>
            <div className="w-full flex items-center justify-center p-2">
                <div className="w-full md:mx-10">

                    {/* Content */}
                    <div className="md:px-6">
                        <div className="mb-6">
                            <div className="font-semibold mb-1">
                                Deposit Tokens
                            </div>

                            <div className="text-sm text-foreground-light">
                                Specify the token amounts for your liquidity contribution.
                            </div>
                        </div>

                        <div className="mb-2">
                            <DepositField
                                fieldType='token0'
                                amount={amount0}
                                setAmount={(amount) => { setLastModified(0); setAmount0(amount); }}
                                token={token0}
                                tokenBalance={balance0}
                                />
                        </div>

                        <div className="mb-4">
                            <DepositField
                                fieldType='token1'
                                amount={amount1}
                                setAmount={(amount) => { setLastModified(1); setAmount1(amount); }}
                                token={token1}
                                tokenBalance={balance1}
                                />
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
                                    onClick={() => submitStep(amount0, amount1, slippage)}
                                >
                                    {createPoolText}
                                </Button>
                            )}
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
    );
}

