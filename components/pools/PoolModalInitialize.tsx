"use client"

import { Dispatch, SetStateAction, useEffect, useState } from 'react'

import { useApp } from '@/providers/AppProvider'

import type { SubgraphPool } from '@/types'


interface PoolModalInitializeProps {
    selectedPool?: SubgraphPool
    initializePoolCurrentAction: string
    initializePoolError: string
    loading: boolean
    initializePool: (poolAddress: `0x${string}`, price0in1: string, decimals0: number, decimals1: number) => Promise<void>
    setInitializePoolError: Dispatch<SetStateAction<string>>
}


// DEPRECATED


const PoolModalInitialize = ({ selectedPool, initializePoolCurrentAction, initializePoolError, loading: tokensLoading, initializePool, setInitializePoolError }: PoolModalInitializeProps) => {
    const { isConnected } = useApp()
    const [price, setPrice] = useState("");

    const initializeAllowed = !tokensLoading && Number(price) > 0 && true;

    useEffect(() => {
        // reset values on modal open/close
        if (!selectedPool) {
            setPrice('')
            setInitializePoolError('')
        }
    }, [selectedPool])

    if (!selectedPool) return null


    let initializeText = 'Initialize';
    if (tokensLoading) initializeText = 'Loading...'
    else if (!isConnected) initializeText = "Connect Wallet to Initialize";
    else if (initializePoolCurrentAction) initializeText = initializePoolCurrentAction;
    else initializeText = 'Initialize';


    return (
        <>
            <div className="bg-background flex items-center justify-center z-50">
                <div className="bg-cyber-navy-95 backdrop-blur-sm border border-neon-cyan-30 rounded-md w-full max-w-md mx-4">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-neon-cyan-20">
                        <h2 className="text-xl font-semibold text-neon-red">Pool Management</h2>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-neon-cyan-20">
                        <span className={`flex-1 px-4 py-3 text-center text-sm font-medium transition-all text-neon-cyan border-b-2 border-neon-cyan shadow-neon-cyan`}>
                            Initialize Pool
                        </span>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        <div className="space-y-4">
                            <p className="text-sm text-foreground-light mb-4">
                                Initialize an existing pool. Choose your price
                            </p>

                            <div className="bg-zinc-800 backdrop-blur-sm hover:shadow-neon-cyan rounded-md border border-neon-cyan-20 p-6">
                                <input
                                    type="string"
                                    placeholder="0.0"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="bg-transparent text-2xl font-semibold w-full outline-none text-foreground placeholder-gray-400"
                                />
                            </div>

                            <div className="mb-6 p-3 bg-neon-cyan-10 border border-neon-cyan-20 rounded-lg">
                                <div className="flex justify-between text-sm">
                                    <span className="text-foreground-light">Price</span>
                                    <span className="font-medium text-neon-cyan">
                                        1 {selectedPool?.token0 ? selectedPool.token0.symbol : '???'} = {price || '0'} {selectedPool?.token1 ? selectedPool.token1.symbol : '???'}
                                    </span>
                                </div>
                            </div>

                            <button
                                disabled={!initializeAllowed}
                                onClick={() => initializePool(selectedPool.id as `0x${string}`, price, selectedPool.token0.decimals, selectedPool.token1.decimals)}
                                className={`w-full text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light`}
                            >
                                {initializeText}
                            </button>

                            {initializePoolError && (
                                <div className="mb-6 p-3 bg-neon-cyan-10 border border-neon-cyan-20 rounded-lg text-center text-red-500">
                                    ❌ Error: {initializePoolError}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>

        </>
    )
}


export default PoolModalInitialize

