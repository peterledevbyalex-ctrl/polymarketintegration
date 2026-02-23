"use client"

import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import { useConnectModal } from '@rainbow-me/rainbowkit'

import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens'
import { ETH_ADDRESS } from '@/config.app'
import { formatNumber } from '@/lib/ui_utils'
import { dedupTokens, excludeTokens } from '@/lib/tokens_utils'
import { useApp } from '@/providers/AppProvider'

import { Button } from '@/components/ui/button'
import { TokenSelectorButtonLarge } from '@/components/TokenSelectorButton'
import { TokenSelectModal } from '@/components/TokenSelectModal'
import { WalletIcon } from '@/components/icons/WalletIcon';

import type { Token } from '@/types'


const ETH_TOKEN: Token = {
    id: ETH_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png',
};

interface PoolCreatePoolStep1Props {
    tokens: Token[]
    userTokens: Token[]
    tokenA: Token | null
    tokenB: Token | null
    selectedFeeTier: string | null
    setTokenA: Dispatch<SetStateAction<Token | null>>
    setTokenB: Dispatch<SetStateAction<Token | null>>
    setSelectedFeeTier: Dispatch<SetStateAction<string | null>>
    createPoolInfo: string
    createPoolError: string
    loading: boolean
    submitStep: (tokenA: Token, tokenB: Token, feeTier: string) => Promise<void>
    setCreatePoolError: Dispatch<SetStateAction<string>>
}


export const PoolCreatePoolStep1 = ({
    tokens,
    userTokens,
    tokenA,
    tokenB,
    selectedFeeTier,
    setTokenA,
    setTokenB,
    setSelectedFeeTier,
    createPoolInfo,
    createPoolError,
    loading: tokensLoading,
    submitStep,
    setCreatePoolError,
}: PoolCreatePoolStep1Props) => {
    const { isConnected, userAddress } = useApp()
    const { openConnectModal } = useConnectModal()

    const feeTiers = ["100", "500", "3000", "10000"];

    const [balanceA, setBalanceA] = useState("0.0");
    const [balanceB, setBalanceB] = useState("0.0");

    const [isTokenAModalOpen, setIsTokenAModalOpen] = useState(false)
    const [isTokenBModalOpen, setIsTokenBModalOpen] = useState(false)

    //tokens = excludeTokens(tokens, [ETH_ADDRESS]);

    const hasEthInTokenList = tokens.some(t => t.id.toLowerCase() === ETH_ADDRESS.toLowerCase());
    const baseTokens = hasEthInTokenList ? tokens : [ETH_TOKEN, ...tokens];

    const tokensList0 = dedupTokens([...baseTokens, ...userTokens]);
    const tokensList1 = dedupTokens([...baseTokens, ...userTokens]);

    const createPoolAllowed = !tokensLoading && tokenA && tokenB && selectedFeeTier && Number(balanceA) && Number(balanceB) && true;


    let createPoolText = 'Continue';
    if (tokensLoading) createPoolText = 'Loading...'
    //else if (createPoolInfo) createPoolText = createPoolInfo;
    //else createPoolText = 'Continue';


    useEffect(() => {
        // load tokenA balances when tokenA changed

        if (tokenA) {
            apiBlockchainTokens.getUserTokenBalance(tokenA, userAddress)
                .then((value) => {
                    setBalanceA(value);
                })

        } else {
            setBalanceA('');
        }
    }, [tokenA])

    useEffect(() => {
        // load tokenB balance when tokenB changed

        if (tokenB) {
            apiBlockchainTokens.getUserTokenBalance(tokenB, userAddress)
                .then((value) => {
                    setBalanceB(value);
                })

            } else {
                setBalanceB('');
            }
    }, [tokenB])


    return (
        <>
            <div className="w-full flex items-center justify-center p-2">
                <div className="w-full md:mx-10">

                    {/* Content */}
                    <div className="md:px-6">
                        <div>

                            {/* Select pair */}
                            <div className="mb-10">
                                <div className="mb-4">
                                    <h3 className="text-md mb-1 font-semibold">Select pair</h3>

                                    <p className="text-sm text-foreground-light">
                                        Choose the tokens you want to provide liquidity for.
                                    </p>
                                </div>

                                <div className="md:grid md:grid-cols-2 md:gap-4">
                                    {/* Token A */}
                                    <div className="px-4 py-2">
                                        <div className="flex items-center justify-between mb-2">
                                            {/*
                                            <input
                                                type="text"
                                                placeholder="0.0"
                                                value={amountA}
                                                onChange={(e) => setAmountA(e.target.value)}
                                                className="bg-transparent text-lg font-semibold w-full outline-none text-foreground placeholder-gray-400"
                                            />
                                            */}

                                            <TokenSelectorButtonLarge
                                                loading={tokensLoading}
                                                selectToken={tokenA}
                                                setIsModalOpen={setIsTokenAModalOpen}
                                                />
                                        </div>

                                        <div className="flex justify-between items-center text-sm text-foreground-light">
                                            <span className="hidden md:block">Token A</span>
                                            <span className="">
                                                <WalletIcon />

                                                <span className="ms-2">
                                                    {formatNumber(balanceA)}
                                                </span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* Token B */}
                                    <div className="px-4 py-2">
                                        <div className="flex items-center justify-between mb-2">
                                            {/*
                                            <input
                                                type="text"
                                                placeholder="0.0"
                                                value={amountB}
                                                onChange={(e) => setAmountB(e.target.value)}
                                                className="bg-transparent text-lg font-semibold w-full outline-none text-foreground placeholder-gray-400"
                                            />
                                            */}

                                            <TokenSelectorButtonLarge
                                                loading={tokensLoading}
                                                selectToken={tokenB}
                                                setIsModalOpen={setIsTokenBModalOpen}
                                                />
                                        </div>

                                        <div className="flex justify-between items-center text-sm text-foreground-light">
                                            <span className="hidden md:block">Token B</span>
                                            <span className="">
                                                <WalletIcon />

                                                <span className="ms-2">
                                                    {formatNumber(balanceB)}
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>


                            {/* Fee Tier */}
                            <div className="mb-10">

                                <div className="mb-4">
                                    <h3 className="text-md mb-1 font-semibold">Fee Tier</h3>

                                    <p className="text-sm text-foreground-light leading-6">
                                        The amount earned providing liquidity.
                                        <br />
                                        Choose an amount that suits your risk tolerance and strategy.
                                    </p>
                                </div>

                                <div className={`grid grid-cols-${feeTiers.length} gap-2`}>
                                    {feeTiers.map(feeTier => (
                                        <button
                                            key={feeTier}
                                            className={`p-2 text-sm ${feeTier === selectedFeeTier ? "bg-background-light border rounded-lg" : "border rounded-lg transition-colors text-foreground-light cursor-pointer hover:bg-background-light"}`}
                                            onClick={() => setSelectedFeeTier(feeTier)}
                                        >
                                            {Number(feeTier) / 10_000}%
                                        </button>
                                    ))}
                                </div>
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
                                    onClick={() => submitStep(tokenA, tokenB, selectedFeeTier)}
                                >
                                    {createPoolText}
                                </Button>
                            )}

                            {createPoolError && (
                                <div className="mb-6 p-3 border rounded-lg text-center text-red-500">
                                    ❌ Error: {createPoolError}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Token Select Modals */}
            <TokenSelectModal
                isOpen={isTokenAModalOpen}
                closeModal={() => setIsTokenAModalOpen(false)}
                selectToken={setTokenA}
                selectedToken={tokenA || undefined}
                tokens={tokenB ? excludeTokens(tokensList0, [tokenB.id]) : tokensList0}
                userTokens={userTokens}
                loading={tokensLoading}
            />

            <TokenSelectModal
                isOpen={isTokenBModalOpen}
                closeModal={() => setIsTokenBModalOpen(false)}
                selectToken={setTokenB}
                selectedToken={tokenB || undefined}
                tokens={tokenA ? excludeTokens(tokensList1, [tokenA.id]) : tokensList1}
                userTokens={userTokens}
                loading={tokensLoading}
            />
        </>
    )
}

