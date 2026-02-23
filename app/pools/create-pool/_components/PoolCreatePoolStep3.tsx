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

import type { Token } from '@/types'


interface PoolCreatePoolStep3Props {
    poolAddress: `0x${string}`,
    poolSqrtPrice: bigint,
    token0: Token,
    token1: Token,
    feeTier: string,
    price: string,
    amount0: string,
    setAmount0: Dispatch<SetStateAction<string>>,
    amount1: string,
    setAmount1: Dispatch<SetStateAction<string>>,
    lastModified: 0 | 1 | null,
    setLastModified: Dispatch<SetStateAction<0 | 1 | null>>,
    createPoolInfo: string
    createPoolError: string
    isCreatingPool: boolean
    loading: boolean
    isTransactionsInfoModalOpen: boolean
    transactionsInfoSteps: string[]
    transactionsInfoCurrentStep: number
    submitStep: (amount0: string, amount1: string, slippage: number) => void
    setIsTransactionsInfoModalOpen: Dispatch<SetStateAction<boolean>>
    setTransactionsInfoSteps: Dispatch<SetStateAction<string[]>>
    setTransactionsInfoCurrentStep: Dispatch<SetStateAction<number>>
}


export const PoolCreatePoolStep3 = ({
    poolAddress, poolSqrtPrice, token0, token1, feeTier, price, createPoolInfo, createPoolError, isCreatingPool, loading: tokensLoading, isTransactionsInfoModalOpen, transactionsInfoSteps, transactionsInfoCurrentStep,
    amount0, setAmount0, amount1, setAmount1, lastModified, setLastModified,
    submitStep, setIsTransactionsInfoModalOpen, setTransactionsInfoSteps, setTransactionsInfoCurrentStep,
}: PoolCreatePoolStep3Props) => {
    const { isConnected, userAddress } = useApp()
    const { openConnectModal } = useConnectModal()

    const [balance0, setBalance0] = useState(token0.userBalance || "0.0");
    const [balance1, setBalance1] = useState(token1.userBalance || "0.0");


    //const price = (Number(amount1) / Number(amount0)).toString();

    const balanceOk0 = Number(balance0) > 0 && Number(balance0) >= Number(amount0);
    const balanceOk1 = Number(balance1) > 0 && Number(balance1) >= Number(amount1);

    const slippage = DEFAULT_LP_SLIPPAGE;

    const createPoolAllowed = token0 && token1 && feeTier && Number(price) > 0 && Number(amount0) > 0 && Number(amount1) > 0 && balanceOk0 && balanceOk1 && !isCreatingPool && true;


    let createPoolText = 'Deposit Tokens';
    if (tokensLoading) createPoolText = 'Loading...'
    //else createPoolText = 'Deposit Tokens';


    useEffect(() => {
        // load token0 balance

        if (token0 && userAddress) {
            apiBlockchainTokens.getUserTokenBalance(token0, userAddress)
                .then((value) => {
                    setBalance0(value);
                });
        }
    }, [token0, userAddress])


    useEffect(() => {
        // load token1 balance

        if (token1 && userAddress) {
            apiBlockchainTokens.getUserTokenBalance(token1, userAddress)
                .then((value) => {
                    setBalance1(value);
                });
        }
    }, [token1, userAddress])


    useEffect(() => {
        // Update amount1 from amount0

        //if (!poolAddress) return

        if (lastModified !== 0) {
            //setLastModified(null);
            return;
        }

        if (amount0) {
            if (Number(amount0) < 0) {
                setAmount0("0")
                return
            }

            if (poolSqrtPrice) {
                // existing pool
                apiBlockchainPools.getPoolLiquidityAddAmount1(poolAddress, amount0, token0.decimals, token1.decimals, poolSqrtPrice)
                    .then((amount1) => {
                        setAmount1(formatValue(amount1));
                    });

            } else {
                // not existing pool (or not initialized)
                setAmount1(formatValue(Number(amount0) * Number(price)));
            }
        }
    }, [poolAddress, poolSqrtPrice, amount0])


    useEffect(() => {
        // Update amount0 from amount1

        //if (!poolAddress) return

        if (lastModified !== 1) {
            //setLastModified(null);
            return;
        }

        if (amount1) {
            if (Number(amount1) < 0) {
                setAmount1("0")
                return
            }

            if (poolSqrtPrice) {
                // existing pool
                apiBlockchainPools.getPoolLiquidityAddAmount0(poolAddress, amount1, token0.decimals, token1.decimals, poolSqrtPrice)
                    .then((amount0) => {
                        setAmount0(formatValue(amount0));
                    });

            } else {
                // not existing pool (or not initialized)
                setAmount0(formatValue(Number(amount1) / Number(price)));
            }
        }
    }, [poolAddress, poolSqrtPrice, amount1])


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

