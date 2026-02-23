"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import * as apiBlockchainSwaps from '@/lib/api_blockchain_swaps';
import * as apiBlockchainPools from '@/lib/api_blockchain_pools';

import { CURRENT_CHAIN, ETH_ADDRESS, WETH_ADDRESS } from '@/config.app';
import { useTokens } from '@/hooks/useTokens';
import { useUserTokens } from '@/hooks/useUserTokens';
import { usePoolCreatePool } from '@/hooks/usePoolCreatePool';
import { useApp } from '@/providers/AppProvider';

import { PoolCreatePoolStep1 } from './PoolCreatePoolStep1';
import { PoolCreatePoolStep2 } from './PoolCreatePoolStep2';
import { PoolCreatePoolStep3 } from './PoolCreatePoolStep3';
import { PoolCreatePoolStep4 } from './PoolCreatePoolStep4';

import type { Token } from '@/types'


const createPoolAtStep2 = false;


const isNativeEthToken = (token: Token): boolean => token.id.toLowerCase() === ETH_ADDRESS.toLowerCase();

const getWethToken = (allTokens: Token[]): Token => {
    const existingWeth = allTokens.find(t => t.id.toLowerCase() === WETH_ADDRESS.toLowerCase());
    if (existingWeth) return existingWeth;

    return {
        id: WETH_ADDRESS,
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
    };
};

const mapDisplayTokenToPoolToken = (displayToken: Token, wethToken: Token): Token => {
    return isNativeEthToken(displayToken) ? wethToken : displayToken;
};


export const PoolCreateComponent: React.FC<{ tokens?: Token[] }> = ({ tokens: preLoadedTokens }) => {
    const router = useRouter();

    const { userAddress, lastEthPrice, walletClient } = useApp();

    const [currentStep, setCurrentStep] = useState<number | null>(1)

    const { tokens, tokensLoading, tokensError } = useTokens(preLoadedTokens);
    const { userTokens, userTokensInitialized, userTokensLoading, userTokensError } = useUserTokens(userAddress);

    const { createPoolError, createPoolInfo, isCreatingPool, setCreatePoolError, executeCreatePool } = usePoolCreatePool();


    // Step 1
    const [token0, setToken0] = useState<Token | null>(null)
    const [token1, setToken1] = useState<Token | null>(null)
    const [feeTier, setFeeTier] = useState<string>(null)


    // Step 2
    const [poolAddress, setPoolAddress] = useState<`0x${string}` | null>(null);
    const [poolSqrtPrice, setPoolSqrtPrice] = useState<bigint | null>(null);
    const [price, setPrice] = useState<string | null>(null);
    const [rangeMode, setRangeMode] = useState<'full' | 'custom'>('custom');
    const [minPercent, setMinPercent] = useState<number | null>(null);
    const [maxPercent, setMaxPercent] = useState<number | null>(null);

    // Step 3
    const [slippage, setSlippage] = useState<number | null>(null);
    const [amount0, setAmount0] = useState("0");
    const [amount1, setAmount1] = useState("0");
    const [lastModified, setLastModified] = useState<0 | 1 | null>(null);
    const [isTransactionsInfoModalOpen, setIsTransactionsInfoModalOpen] = useState(false);
    const [transactionsInfoSteps, setTransactionsInfoSteps] = useState<string[]>([]);
    const [transactionsInfoCurrentStep, setTransactionsInfoCurrentStep] = useState<number | null>(1)


    const getTokenWithUsd = (token: Token | null): Token | null => {
        if (!token) return null;
        
        // Native ETH
        if (isNativeEthToken(token)) {
            return { ...token, derivedUSD: lastEthPrice };
        }
        
        // WETH
        if (token.symbol === 'WETH') {
            return { ...token, derivedUSD: lastEthPrice };
        }
        
        // Stablecoins - set to $1
        if (token.symbol === 'USDC' || token.symbol === 'USDT' || token.symbol === 'DAI' || token.symbol === 'USDC.e') {
            return { ...token, derivedUSD: '1' };
        }
        
        return token;
    };

    const token0WithUsd = getTokenWithUsd(token0);
    const token1WithUsd = getTokenWithUsd(token1);


    const submitStep1 = async (tokenA: Token, tokenB: Token, feeTier: string) => {
        if (!tokenA || !tokenB || !feeTier) return;

        const allTokens = [...tokens, ...userTokens];
        const wethToken = getWethToken(allTokens);
        const poolTokenA = mapDisplayTokenToPoolToken(tokenA, wethToken);
        const poolTokenB = mapDisplayTokenToPoolToken(tokenB, wethToken);

        // Search Existing Pool
        const existingPoolAddress = await apiBlockchainPools.getPoolAddress(poolTokenA.id, poolTokenB.id, feeTier);

        if (existingPoolAddress) {
            // Check if Pool is Initialized
            const slot0 = await apiBlockchainPools.getPoolSlot0(existingPoolAddress);
            setPoolSqrtPrice(slot0[0]);

        } else {
            setPoolSqrtPrice(null);
        }

        const poolToken0 = poolTokenA.id < poolTokenB.id ? poolTokenA : poolTokenB;
        const displayToken0 = poolToken0.id.toLowerCase() === poolTokenA.id.toLowerCase() ? tokenA : tokenB;
        const displayToken1 = displayToken0.id.toLowerCase() === tokenA.id.toLowerCase() ? tokenB : tokenA;

        setPoolAddress(existingPoolAddress);
        setToken0(displayToken0);
        setToken1(displayToken1);
        setFeeTier(feeTier);

        setCurrentStep(2);
    }


    const submitStep2 = async (price: string, minPercent: number | null=null, maxPercent: number | null=null) => {
        if (!walletClient) return;
        if (!token0 || !token1 || !feeTier) return;
        if (!price || minPercent === undefined || maxPercent === undefined) return;

        setPrice(price);
        setMinPercent(minPercent);
        setMaxPercent(maxPercent);

        if (!poolSqrtPrice && createPoolAtStep2) {
            const allTokens = [...tokens, ...userTokens];
            const wethToken = getWethToken(allTokens);
            const poolToken0 = mapDisplayTokenToPoolToken(token0, wethToken);
            const poolToken1 = mapDisplayTokenToPoolToken(token1, wethToken);

            // Pool not initialized (and maybe not created)
            const result = await executeCreatePool({
                walletClient,
                tokenA: poolToken0,
                tokenB: poolToken1,
                feeTier,
                priceAinB: price,
                setTransactionsInfoCurrentStep,
            })

            if (result.success) {
                let createdPoolAddress = poolAddress;

                if (!createdPoolAddress) {
                    createdPoolAddress = await apiBlockchainPools.getPoolAddress(poolToken0.id, poolToken1.id, feeTier);
                    setPoolAddress(createdPoolAddress);
                }

                const slot0 = await apiBlockchainPools.getPoolSlot0(createdPoolAddress);
                setPoolSqrtPrice(slot0[0]);

            } else {
                return
            }
        }

        setCurrentStep(3);
    }


    const submitStep3 = async (amount0: string, amount1: string, slippage: number) => {
        if (!walletClient) return;
        if (!token0 || !token1 || !feeTier) return;
        if (!price || minPercent === undefined || maxPercent === undefined) return;
        if (!Number(amount0) || !Number(amount1)) return;

        const allTokens = [...tokens, ...userTokens];
        const wethToken = getWethToken(allTokens);

        const poolToken0 = mapDisplayTokenToPoolToken(token0, wethToken);
        const poolToken1 = mapDisplayTokenToPoolToken(token1, wethToken);

        const steps: string[] = [
            `Create Pool`,
            `Initialize Pool`,
        ];

        if (isNativeEthToken(token0)) {
            steps.push(`Wrap ETH`);
        }

        if (isNativeEthToken(token1)) {
            steps.push(`Wrap ETH`);
        }

        steps.push(
            `Approve ${poolToken0.symbol} spending`,
            `Approve ${poolToken1.symbol} spending`,
            `Confirm in wallet`,
        );

        setTransactionsInfoSteps(steps);
        setTransactionsInfoCurrentStep(1);
        setIsTransactionsInfoModalOpen(true);

        setAmount0(amount0);
        setAmount1(amount1);
        setSlippage(slippage);

        try {
            if (isNativeEthToken(token0)) {
                await apiBlockchainSwaps.depositETHtoWETH(walletClient, amount0);
                if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);
            }

            if (isNativeEthToken(token1)) {
                await apiBlockchainSwaps.depositETHtoWETH(walletClient, amount1);
                if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);
            }

            const result = await executeCreatePool({
                walletClient,
                tokenA: poolToken0,
                tokenB: poolToken1,
                feeTier,
                priceAinB: price,
                amountA: amount0,
                amountB: amount1,
                minPercent,
                maxPercent,
                slippage,
                setTransactionsInfoCurrentStep,
            })

            if (!result.success) {
                toast.error("Pool creation Failed!", { removeDelay: 5000 });
                return;
            }

            let newPoolAddress = poolAddress;

            if (!newPoolAddress) {
                newPoolAddress = await apiBlockchainPools.getPoolAddress(poolToken0.id, poolToken1.id, feeTier);
                setPoolAddress(newPoolAddress);
            }

            if (!poolSqrtPrice) {
                const slot0 = await apiBlockchainPools.getPoolSlot0(newPoolAddress);
                setPoolSqrtPrice(slot0[0]);
            }

            const transactionHash = result.addLiquidityHash ?? result.initializePoolHash ?? result.createPoolHash;
            const explorerBaseUrl = CURRENT_CHAIN.blockExplorers?.default?.url;
            const explorerTxUrl = transactionHash && explorerBaseUrl
                ? `${explorerBaseUrl.replace(/\/$/, '')}/tx/${transactionHash}`
                : null;

            if (transactionHash && explorerTxUrl) {
                const shortHash = `${transactionHash.slice(0, 10)}…${transactionHash.slice(-8)}`;

                toast.custom(
                    (t) => (
                        <div
                            className={`${
                                t.visible ? 'animate-enter' : 'animate-leave'
                            } bg-background border border-white/10 rounded-lg px-4 py-3 shadow-xl flex items-center gap-3`}
                        >
                            <div className="font-medium">Pool created!</div>
                            <a
                                href={explorerTxUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline"
                            >
                                {shortHash}
                            </a>
                        </div>
                    ),
                    { duration: 5000 }
                );

            } else {
                toast.success("Pool created successfully!", { removeDelay: 5000 });
            }

            router.push('/portfolio');
            return;
        } catch {
            toast.error("Pool creation Failed!", { removeDelay: 5000 });
        } finally {
            setIsTransactionsInfoModalOpen(false);
        }
    }


    return (
        <>
            <div className="z-10 w-full mb-20">
                <div className="container m-auto mb-10">

                    <div className="mb-8">
                        <Link
                            href={`/pools`}
                            className="text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light"
                        >
                            ❮ Back
                        </Link>
                    </div>

                    <div className="md:grid md:grid-cols-3">
                        <div className="col-span-1 flex flex-col space-y-3 text-foreground-light mb-4">

                            {/* Step 1 */}
                            <div
                                className={`flex rounded-md p-4 gap-4 ${currentStep === 1 ? "bg-background-light cursor-default" : ((currentStep > 1 && currentStep < 4) ? "cursor-pointer" : "cursor-default")}`}
                                onClick={() => { if (currentStep > 1 && currentStep < 4) { setCurrentStep(1) } }}
                                >
                                <div>
                                    <div className={`${currentStep === 1 ? "bg-foreground text-background" : "border"} ${currentStep > 1 ? "bg-background-light" : ""} text-xl rounded-full px-3 py-1`}>
                                        {currentStep > 1 ? "✓" : "1"}
                                    </div>
                                </div>
                                <div className="">
                                    <div className="">Step 1</div>
                                    <div className={`${currentStep === 1 ? "text-foreground" : ""} font-semibold`}>Select token & fee tier</div>
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div
                                className={`flex rounded-md p-4 gap-4 ${currentStep === 2 ? "bg-background-light cursor-default" : ((currentStep > 2 && currentStep < 4) ? "cursor-pointer" : "cursor-default")}`}
                                onClick={() => { if (currentStep > 2 && currentStep < 4) { setCurrentStep(2) } }}
                                >
                                <div>
                                    <div className={`${currentStep === 2 ? "bg-foreground text-background" : "border"} ${currentStep > 2 ? "bg-background-light" : ""} text-xl rounded-full px-3 py-1`}>
                                        {currentStep > 2 ? "✓" : "2"}
                                    </div>
                                </div>
                                <div className="">
                                    <div className="">Step 2</div>
                                    <div className={`${currentStep === 2 ? "text-foreground" : ""} font-semibold`}>Set price range</div>
                                </div>
                            </div>

                            {/* Step 3 */}
                            <div
                                className={`flex rounded-md p-4 gap-4 ${currentStep === 3 ? "bg-background-light cursor-default" : ((currentStep > 3 && currentStep < 4) ? "cursor-pointer" : "cursor-default")}`}
                                onClick={() => { if (currentStep > 3 && currentStep < 4) { setCurrentStep(3) } }}
                                >
                                <div>
                                    <div className={`${currentStep === 3 ? "bg-foreground text-background" : "border"} ${currentStep > 3 ? "bg-background-light" : ""} text-xl rounded-full px-3 py-1`}>
                                        {currentStep > 3 ? "✓" : "3"}
                                    </div>
                                </div>
                                <div>
                                    <div className="">Step 3</div>
                                    <div className={`${currentStep === 3 ? "text-foreground" : ""} font-semibold`}>Enter deposit amount</div>
                                </div>
                            </div>
                        </div>

                        <div className="col-span-2">

                            {/* Step 1 */}
                            {currentStep === 1 && (
                                <PoolCreatePoolStep1
                                    tokens={tokens}
                                    userTokens={userTokens}
                                    tokenA={token0}
                                    tokenB={token1}
                                    selectedFeeTier={feeTier}
                                    setTokenA={setToken0}
                                    setTokenB={setToken1}
                                    setSelectedFeeTier={setFeeTier}
                                    createPoolInfo={createPoolInfo}
                                    createPoolError={createPoolError}
                                    loading={tokensLoading}
                                    submitStep={submitStep1}
                                    setCreatePoolError={setCreatePoolError}
                                />
                            )}

                            {/* Step 2 */}
                            {currentStep === 2 && (
                                <PoolCreatePoolStep2
                                    poolAddress={poolAddress}
                                    poolSqrtPrice={poolSqrtPrice}
                                    token0={token0}
                                    token1={token1}
                                    feeTier={feeTier}
                                    price={price}
                                    setPrice={setPrice}
                                    rangeMode={rangeMode}
                                    setRangeMode={setRangeMode}
                                    minPercent={minPercent}
                                    setMinPercent={setMinPercent}
                                    maxPercent={maxPercent}
                                    setMaxPercent={setMaxPercent}
                                    createPoolInfo={createPoolInfo}
                                    createPoolError={createPoolError}
                                    loading={tokensLoading}
                                    submitStep={submitStep2}
                                />
                            )}

                            {/* Step 3 */}
                            {currentStep === 3 && (
                                <PoolCreatePoolStep3
                                    poolAddress={poolAddress}
                                    poolSqrtPrice={poolSqrtPrice}
                                    token0={token0WithUsd}
                                    token1={token1WithUsd}
                                    feeTier={feeTier}
                                    price={price}
                                    amount0={amount0}
                                    setAmount0={setAmount0}
                                    amount1={amount1}
                                    setAmount1={setAmount1}
                                    lastModified={lastModified}
                                    setLastModified={setLastModified}
                                    createPoolInfo={createPoolInfo}
                                    createPoolError={createPoolError}
                                    isCreatingPool={isCreatingPool}
                                    loading={tokensLoading}
                                    transactionsInfoSteps={transactionsInfoSteps}
                                    transactionsInfoCurrentStep={transactionsInfoCurrentStep}
                                    isTransactionsInfoModalOpen={isTransactionsInfoModalOpen}
                                    setIsTransactionsInfoModalOpen={setIsTransactionsInfoModalOpen}
                                    setTransactionsInfoSteps={setTransactionsInfoSteps}
                                    setTransactionsInfoCurrentStep={setTransactionsInfoCurrentStep}
                                    submitStep={submitStep3}
                                />
                            )}


                            {/* Step 4 */}
                            {currentStep === 4 && (
                                <PoolCreatePoolStep4
                                    poolAddress={poolAddress}
                                    />
                            )}

                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

