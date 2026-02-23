"use client"

import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast';

import { CURRENT_CHAIN } from '@/config.app';
import { isValidAddress } from '@/lib/ui_utils';

import { useTokens } from '@/hooks/useTokens';
//import { usePool } from '@/hooks/usePool';
import { usePoolLiquidity } from '@/hooks/usePoolLiquidity';

import { PoolCreatePositionStep1 } from './PoolCreatePositionStep1';
import { PoolCreatePositionStep2 } from './PoolCreatePositionStep2';
import { PoolCreatePositionStep3 } from './PoolCreatePositionStep3';

import type { SubgraphPool, Token } from '@/types';
import { useApp } from '@/providers/AppProvider';


export const PoolCreatePositionComponent: React.FC<{ pool: SubgraphPool, tokens?: Token[] }> = ({ pool, tokens: preLoadedTokens }) => {
    const params = useParams();
    const router = useRouter();

    const poolAddress = params.poolId as `0x${string}` | undefined;
    if (!poolAddress || !isValidAddress(poolAddress)) return <div className="text-center text-xl">Pool not found</div>;

    const { walletClient } = useApp()

    const [currentStep, setCurrentStep] = useState<number | null>(1)
    const [placeholderMessage, setPlaceholderMessage] = useState("Loading...")

    const { tokens, tokensInitialized, tokensLoading, tokensError, fetchTokens, setTokens, setTokensLoading, setTokensError } = useTokens(preLoadedTokens);
    //const { pool, poolInitialized, poolLoading, poolError, fetchPool, setPool, setPoolLoading, setPoolError } = usePool(poolAddress);
    const { addPoolLiquidityError, addPoolLiquidityInfo, isAddingLiquidity, setAddPoolLiquidityError, setAddPoolLiquidityInfo, executeAddPoolLiquidity } = usePoolLiquidity(pool);


    // Step 1
    const [minPercent, setMinPercent] = useState<number | null>(null);
    const [maxPercent, setMaxPercent] = useState<number | null>(null);


    // Step 2
    const [slippage, setSlippage] = useState<number | null>(null);
    const [amount0, setAmount0] = useState("0");
    const [amount1, setAmount1] = useState("0");
    const [isTransactionsInfoModalOpen, setIsTransactionsInfoModalOpen] = useState(false);
    const [transactionsInfoSteps, setTransactionsInfoSteps] = useState<string[]>([]);
    const [transactionsInfoCurrentStep, setTransactionsInfoCurrentStep] = useState<number | null>(1)


    const submitStep1 = async (minPercent: number | null, maxPercent: number | null) => {
        if (!pool) return;
        if (minPercent === undefined || maxPercent === undefined) return;

        setMinPercent(minPercent);
        setMaxPercent(maxPercent);
        setCurrentStep(2);
    }


    const submitStep2 = async (amount0: string, amount1: string, slippage: number) => {
        if (!pool) return;
        if (minPercent === undefined || maxPercent === undefined) return;
        if (!Number(amount0) || !Number(amount1)) return;


        const steps = [
            `Approve ${pool.token0.symbol} spending`,
            `Approve ${pool.token1.symbol} spending`,
            `Confirm in wallet`,
        ];
        setTransactionsInfoSteps(steps);
        setTransactionsInfoCurrentStep(1);
        setIsTransactionsInfoModalOpen(true);

        setAmount0(amount0);
        setAmount1(amount1);
        setSlippage(slippage);

        //const result = await apiFrontendPools.addPoolLiquidityReact(walletClient, pool as Pool, amount0, amount1, minPercent, maxPercent, slippage, undefined, {  })
        const result = await executeAddPoolLiquidity(walletClient, amount0, amount1, slippage, undefined, minPercent, maxPercent, setTransactionsInfoCurrentStep);

        setIsTransactionsInfoModalOpen(false);

        if (result?.success) {
            const transactionHash = result.transactionHash;
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
                            <div className="font-medium">Position created!</div>
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
                toast.success("Position created successfully!", { removeDelay: 5000 });
            }

            router.push('/portfolio');
            return;

        } else {
            toast.error("Position creation Failed!", { removeDelay: 5000 });
            return
        }
    }


    useEffect(() => {
        if (poolAddress) {
            setPlaceholderMessage("");
            return;
        }

        const timer = setTimeout(() => {
            setPlaceholderMessage("Pool not found");
        }, 1000);

        return () => {
            clearTimeout(timer);
        }
    }, [poolAddress])


    if (!poolAddress || !isValidAddress(poolAddress)) {
        return <div className="text-center text-xl">{placeholderMessage}</div>;
    }


    return (
        <>
            <div className="z-10 w-full mb-20">
                <div className="container m-auto mb-10">

                    <div className="mb-8">
                        <Link
                            href={`/pools/${poolAddress}`}
                            className="text-sm text-foreground-light border rounded px-2 py-1 hover:bg-background-light"
                        >
                            ❮ Back
                        </Link>
                    </div>


                    <div className="md:grid md:grid-cols-3">
                        <div className="col-span-1 flex flex-col space-y-3 text-foreground-light mb-4">

                            {/* Step 1 */}
                            <div
                                className={`flex rounded-md p-4 gap-4 ${currentStep === 1 ? "bg-background-light cursor-default" : ((currentStep > 1 && currentStep < 3) ? "cursor-pointer" : "cursor-default")}`}
                                onClick={() => { if (currentStep > 1 && currentStep < 3) { setCurrentStep(1) } }}
                                >
                                <div>
                                    <div className={`${currentStep === 1 ? "bg-foreground text-background" : "border"} ${currentStep > 1 ? "bg-background-light" : ""} text-xl rounded-full px-3 py-1`}>
                                        {currentStep > 1 ? "✓" : "1"}
                                    </div>
                                </div>
                                <div className="">
                                    <div className="">Step 1</div>
                                    <div className={`${currentStep === 1 ? "text-foreground" : ""} font-semibold`}>Set price range</div>
                                </div>
                            </div>

                            {/* Step 2 */}
                            <div
                                className={`flex rounded-md p-4 gap-4 ${currentStep === 2 ? "bg-background-light cursor-default" : ((currentStep > 2 && currentStep < 3) ? "cursor-pointer" : "cursor-default")}`}
                                onClick={() => { if (currentStep > 2 && currentStep < 3) { setCurrentStep(2) } }}
                                >
                                <div>
                                    <div className={`${currentStep === 2 ? "bg-foreground text-background" : "border"} ${currentStep > 2 ? "bg-background-light" : ""} text-xl rounded-full px-3 py-1`}>
                                        {currentStep > 2 ? "✓" : "2"}
                                    </div>
                                </div>
                                <div>
                                    <div className="">Step 2</div>
                                    <div className={`${currentStep === 2 ? "text-foreground" : ""} font-semibold`}>Enter deposit amount</div>
                                </div>
                            </div>
                        </div>

                        <div className="col-span-2">

                            {/* Step 1 */}
                            {currentStep === 1 && (
                                <PoolCreatePositionStep1
                                    tokens={tokens}
                                    pool={pool}
                                    submitStep={submitStep1}
                                />
                            )}

                            {/* Step 2 */}
                            {currentStep === 2 && (
                                <PoolCreatePositionStep2
                                    tokens={tokens}
                                    pool={pool}
                                    isAddingLiquidity={isAddingLiquidity}
                                    addPoolLiquidityError={addPoolLiquidityError}
                                    addPoolLiquidityInfo={addPoolLiquidityInfo}
                                    isTransactionsInfoModalOpen={isTransactionsInfoModalOpen}
                                    transactionsInfoSteps={transactionsInfoSteps}
                                    transactionsInfoCurrentStep={transactionsInfoCurrentStep}
                                    setAddPoolLiquidityError={setAddPoolLiquidityError}
                                    setAddPoolLiquidityInfo={setAddPoolLiquidityInfo}
                                    setIsTransactionsInfoModalOpen={setIsTransactionsInfoModalOpen}
                                    setTransactionsInfoSteps={setTransactionsInfoSteps}
                                    setTransactionsInfoCurrentStep={setTransactionsInfoCurrentStep}
                                    submitStep={submitStep2}
                                />
                            )}


                            {/* Step 3 */}
                            {currentStep === 3 && (
                                <PoolCreatePositionStep3
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

