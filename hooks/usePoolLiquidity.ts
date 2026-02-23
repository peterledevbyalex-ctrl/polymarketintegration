
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { formatUnits, maxUint128, parseUnits, TransactionReceipt, WalletClient } from "viem";

import * as apiBlockchain from '@/lib/api_blockchain';
import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';
import * as apiBlockchainPools from '@/lib/api_blockchain_pools';
import { getErrorMessage } from "@/lib/ui_utils";

import { CollectParams, LiquidityMintParams, SubgraphPool, SubgraphPosition, SimpleResult, TransactionResult } from "@/types";
import { POSITION_MANAGER_ADDRESS } from "@/config.app";
import { applySlippageToAmount, clampSlippagePercent, DEFAULT_LP_SLIPPAGE, getTicksFromPriceRange, getTickSpacingForFeeTier } from "@/lib/uniswap_utils";



export interface PoolLiquidityHook {
    addPoolLiquidityError: string | null,
    addPoolLiquidityInfo: string | null,
    addPoolLiquidityCount: number,
    isAddingLiquidity: boolean,
    removePoolLiquidityError: string | null,
    removePoolLiquidityInfo: string | null,
    removePoolLiquidityCount: number,
    isRemovingLiquidity: boolean,
    collectPoolFeesError: string | null,
    collectPoolFeesInfo: string | null,
    isCollectingFees: boolean,
    setAddPoolLiquidityError: Dispatch<SetStateAction<string | null>>,
    setAddPoolLiquidityInfo: Dispatch<SetStateAction<string | null>>,
    setAddPoolLiquidityCount: Dispatch<SetStateAction<number>>,
    setIsAddingLiquidity: Dispatch<SetStateAction<boolean>>,
    setRemovePoolLiquidityError: Dispatch<SetStateAction<string | null>>,
    setRemovePoolLiquidityInfo: Dispatch<SetStateAction<string | null>>,
    setRemovePoolLiquidityCount: Dispatch<SetStateAction<number>>,
    setIsRemovingLiquidity: Dispatch<SetStateAction<boolean>>,
    setCollectPoolFeesError: Dispatch<SetStateAction<string | null>>,
    setCollectPoolFeesInfo: Dispatch<SetStateAction<string | null>>,
    //setCollectPoolFeesCount: Dispatch<SetStateAction<number>>,
    setIsCollectingFees: Dispatch<SetStateAction<boolean>>,
    executeAddPoolLiquidity: (walletClient: WalletClient, userAmount0Desired: string, userAmount1Desired: string, slippage?: number, positionId?: string, minPercent?: number, maxPercent?: number, setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>) => Promise<TransactionResult>,
    executeRemovePoolLiquidity: (walletClient: WalletClient, tokenId: string, userAmount: string, userAmount0Desired: string, userAmount1Desired: string, slippage?: number, setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>) => Promise<SimpleResult>
    executeCollectPoolFees: (walletClient: WalletClient, tokenId: string, setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>) => Promise<TransactionResult>
}


export function usePoolLiquidity(pool: SubgraphPool | null): PoolLiquidityHook {
    const [addPoolLiquidityError, setAddPoolLiquidityError] = useState<string | null>(null)
    const [addPoolLiquidityInfo, setAddPoolLiquidityInfo] = useState<string | null>(null)
    const [addPoolLiquidityCount, setAddPoolLiquidityCount] = useState(0);
    const [isAddingLiquidity, setIsAddingLiquidity] = useState(false)

    const [removePoolLiquidityError, setRemovePoolLiquidityError] = useState<string | null>(null)
    const [removePoolLiquidityInfo, setRemovePoolLiquidityInfo] = useState<string | null>(null)
    const [removePoolLiquidityCount, setRemovePoolLiquidityCount] = useState(0);
    const [isRemovingLiquidity, setIsRemovingLiquidity] = useState(false)

    const [collectPoolFeesError, setCollectPoolFeesError] = useState<string | null>(null)
    const [collectPoolFeesInfo, setCollectPoolFeesInfo] = useState<string | null>(null)
    //const [collectPoolFeesCount, setCollectPoolFeesCount] = useState(0);
    const [isCollectingFees, setIsCollectingFees] = useState(false)


    const executeAddPoolLiquidity = async (walletClient: WalletClient, userAmount0Desired: string, userAmount1Desired: string, slippage = DEFAULT_LP_SLIPPAGE, positionId?: string, minPercent: number | null=null, maxPercent: number | null=null, setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>): Promise<TransactionResult> => {
        if (!pool) return { success: false, error: "Missing pool" };

        try {
            //console.log('🏊 Adding liquidity to pool...');

            setIsAddingLiquidity(true);
            setAddPoolLiquidityError('')
            setAddPoolLiquidityInfo(`Add Liquidity...`)

            const amount0Desired: bigint = parseUnits(userAmount0Desired, pool.token0.decimals);
            const amount1Desired: bigint = parseUnits(userAmount1Desired, pool.token1.decimals);

            const slippageSafe = clampSlippagePercent(slippage, 0.05, 5);

            // Paramètres pour ajouter de la liquidité
            const amount0Min = applySlippageToAmount(amount0Desired, slippageSafe);
            const amount1Min = applySlippageToAmount(amount1Desired, slippageSafe);

            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 heure

            //console.log('Liquidity parameters:');
            //console.log('- Token0:', pool.token0);
            //console.log('- Token1:', pool.token1);
            //console.log('- Fee:', pool.feeTier);
            //console.log('- Amount0Desired:', amount0Desired.toString());
            //console.log('- Amount1Desired:', amount1Desired.toString());
            //console.log('- Position Manager:', POSITION_MANAGER_ADDRESS);

            // Vérifier d'abord si la pool existe
            const poolAddress = await apiBlockchainPools.getPoolAddress(pool.token0.id, pool.token1.id, pool.feeTier)

            if (!poolAddress) {
                //console.log('❌ Pool does not exist. Create the pool first.');
                //return { success: false, error: 'Pool does not exist. Create the pool first' };
                throw new Error('Pool does not exist. Create the pool first')
            }

            //console.log('✅ Pool exists at:', poolAddress);

            // Lire le prix actuel de la pool pour calculer des ticks appropriés
            const slot0 = await apiBlockchainPools.getPoolSlot0(poolAddress);

            //console.log('📊 Pool current state:');
            //console.log('slot0:', slot0);

            if (slot0[0] === 0n) {
                //console.log('❌ Pool is not initialized.');
                //return { success: false, error: 'Pool is not initialized' };
                throw new Error('Pool is not initialized')
            }


            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0]
            if (!userAddress) throw new Error('missing userAddress');

            //console.log('💰 Checking token balances...');

            // Vérifier les balances
            const balance0 = await apiBlockchainTokens.getTokenBalance(pool.token0.id, userAddress)
            //console.log('- Token0 balance:', balance0.toString());

            const balance1 = await apiBlockchainTokens.getTokenBalance(pool.token1.id, userAddress)
            //console.log('- Token1 balance:', balance1.toString());

            if (balance0 < amount0Desired || balance1 < amount1Desired) {
                //console.log('❌ Insufficient token balance for liquidity provision');
                //return { success: false, error: 'Insufficient token balance for liquidity provision' };
                throw new Error('Insufficient token balance for liquidity provision')
            }


            // Approver les tokens pour le Position Manager
            //console.log('📝 Approving tokens...');

            // Vérifier les allowances actuelles
            const allowance0 = await apiBlockchainTokens.getTokenAllowance(pool.token0.id, userAddress, POSITION_MANAGER_ADDRESS)
            const allowance1 = await apiBlockchainTokens.getTokenAllowance(pool.token1.id, userAddress, POSITION_MANAGER_ADDRESS)


            // Approver si nécessaire
            if (allowance0 < amount0Desired) {
                //console.log('Approving token0...');

                setAddPoolLiquidityInfo(`Approve ${pool.token0.symbol}...`)

                const approveReceipt0 = await apiBlockchainTokens.approveToken(walletClient, pool.token0.id, POSITION_MANAGER_ADDRESS, amount0Desired);

                setAddPoolLiquidityInfo(null)

                //console.log('✅ Token0 approved');
            }

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);

            if (allowance1 < amount1Desired) {
                //console.log('Approving token1...');

                setAddPoolLiquidityInfo(`Approve ${pool.token1.symbol}...`)

                const approveReceipt1 = await apiBlockchainTokens.approveToken(walletClient, pool.token1.id, POSITION_MANAGER_ADDRESS, amount1Desired);

                setAddPoolLiquidityInfo(null)

                //console.log('✅ Token1 approved');
            }

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);

            // Ajouter la liquidité
            //console.log('🏊 Minting liquidity position...');

            const token0 = pool.token0.id;
            const token1 = pool.token1.id;


            let addLiquidityReceipt: TransactionReceipt | null = null;

            if (positionId) {
                // Add Liquidity to existing position

                // Paramètres pour decreaseLiquidity
                let amount0MinIncrease = amount0Min;
                let amount1MinIncrease = amount1Min;

                const baseIncreaseParams = {
                    tokenId: BigInt(positionId),
                    amount0Desired,
                    amount1Desired,
                    amount0Min: 0n,
                    amount1Min: 0n,
                    deadline,
                };

                try {
                    const simulated = await apiBlockchainPools.simulateIncreasePoolLiquidity(walletClient, baseIncreaseParams);
                    amount0MinIncrease = applySlippageToAmount(simulated.amount0, slippageSafe);
                    amount1MinIncrease = applySlippageToAmount(simulated.amount1, slippageSafe);
                } catch {
                }

                const increaseParams = {
                    ...baseIncreaseParams,
                    amount0Min: amount0MinIncrease,
                    amount1Min: amount1MinIncrease,
                };

                setAddPoolLiquidityInfo("Add Liquidity...")

                addLiquidityReceipt = await apiBlockchainPools.increasePoolLiquidity(walletClient, increaseParams);

            } else {
                // Create Position

                //const tickSpacingRaw = await apiBlockchainPools.getPoolTickSpacing(pool.id as `0x${string}`)
                //const tickSpacing = Number(tickSpacingRaw);
                const tickSpacing = getTickSpacingForFeeTier(pool.feeTier)

                // Calculer des ticks appropriés autour du tick actuel
                const currentTick = Number(slot0[1]);

                const { tickLower, tickUpper } = getTicksFromPriceRange(currentTick, minPercent, maxPercent, tickSpacing);

                //console.log('🎯 Calculated ticks based on current price:');
                //console.log('- Current tick:', currentTick);
                //console.log('- tickLower:', tickLower);
                //console.log('- tickUpper:', tickUpper);
                //console.log('- tickLower % tickSpacing:', tickLower % tickSpacing);
                //console.log('- tickUpper % tickSpacing:', tickUpper % tickSpacing);

                // Paramètres pour mint
                let amount0MinMint = 0n;
                let amount1MinMint = 0n;

                const baseMintParams: LiquidityMintParams = {
                    token0,
                    token1,
                    fee: pool.feeTier,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    amount0Desired,
                    amount1Desired,
                    amount0Min: 0n,
                    amount1Min: 0n,
                    recipient: userAddress,
                    deadline: deadline,
                };

                try {
                    const simulated = await apiBlockchainPools.simulateMintPoolLiquidity(walletClient, baseMintParams);
                    amount0MinMint = applySlippageToAmount(simulated.amount0, slippageSafe);
                    amount1MinMint = applySlippageToAmount(simulated.amount1, slippageSafe);
                } catch {
                }

                const mintParams: LiquidityMintParams = {
                    ...baseMintParams,
                    amount0Min: amount0MinMint,
                    amount1Min: amount1MinMint,
                };

                setAddPoolLiquidityInfo("Minting Liquidity...")

                addLiquidityReceipt = await apiBlockchainPools.mintPoolLiquidity(walletClient, mintParams);
            }

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);

            setAddPoolLiquidityInfo(null)

            return {
                success: addLiquidityReceipt.status === 'success',
                transactionHash: addLiquidityReceipt.transactionHash,
            };

        } catch (error) {
            //console.error('❌ Error in addPoolLiquidity:', error);
            //console.error('❌ Error in addPoolLiquidity:', getErrorMessage(error));

            setAddPoolLiquidityInfo(null)
            setAddPoolLiquidityError(getErrorMessage(error))

            return {
                success: false,
                error: getErrorMessage(error),
            };

        } finally {
            setIsAddingLiquidity(false);
        }
    }


    const executeRemovePoolLiquidity = async (walletClient: WalletClient, tokenId: string, userAmount: string, userAmount0Desired: string, userAmount1Desired: string, slippage = DEFAULT_LP_SLIPPAGE, setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>): Promise<SimpleResult> => {
        try {
            //console.log('🏊 Removing liquidity from position...');

            setIsRemovingLiquidity(true);
            setRemovePoolLiquidityError('')

            const userAddress = await apiBlockchain.getWalletAddress(walletClient);


            // 1. Récupérer les détails de la position
            const position = await apiBlockchainPools.fetchPosition(tokenId);
            const currentLiquidity = position.liquidity;

            if (currentLiquidity === 0n) {
                //throw new Error('Position has no liquidity to remove');
            }


            // 2. Calculer la quantité de liquidité à retirer
            //const liquidityToRemove = (currentLiquidity * BigInt(liquidityPercentage)) / 100n;

            let liquidityToRemove = parseUnits(userAmount, 18);
            if (liquidityToRemove > currentLiquidity) liquidityToRemove = currentLiquidity;

            //const liquidityPercentage = 100n * BigInt(liquidityToRemove) / currentLiquidity;
            //console.log('Position details:');
            //console.log('- Token ID:', tokenId);
            //console.log('- Current liquidity:', currentLiquidity.toString());
            //console.log('- Liquidity to remove:', liquidityToRemove.toString());
            //console.log('- Percentage:', liquidityPercentage + '%');


            let decreaseReceipt: TransactionReceipt | null = null;

            if (liquidityToRemove > 0n) {
                // Calculer les montants minimums avec slippage protection
                let amount0Min = BigInt(0);
                let amount1Min = BigInt(0);

                if (true) {
                    let amount0Desired = parseUnits(userAmount0Desired, pool.token0.decimals);
                    let amount1Desired = parseUnits(userAmount1Desired, pool.token1.decimals);

                    const slippageSafe = clampSlippagePercent(slippage, 0.05, 5);
                    amount0Min = applySlippageToAmount(amount0Desired, slippageSafe);
                    amount1Min = applySlippageToAmount(amount1Desired, slippageSafe);
                }

                const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 heure

                // Paramètres pour decreaseLiquidity
                const decreaseParams = {
                    tokenId: BigInt(tokenId),
                    liquidity: liquidityToRemove,
                    amount0Min,
                    amount1Min,
                    deadline,
                };

                setRemovePoolLiquidityInfo("Remove Liquidity...")

                decreaseReceipt = await apiBlockchainPools.decreasePoolLiquidity(walletClient, decreaseParams);

                setRemovePoolLiquidityInfo(null)
            }

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);


            // Collecter les tokens (collect)
            // Après avoir retiré la liquidité, nous devons collecter les tokens

            setRemovePoolLiquidityInfo("Collect fees...")


            // Collecter tous les fees disponibles

            const collectParams: CollectParams = {
                tokenId: BigInt(tokenId),
                recipient: userAddress,
                amount0Max: maxUint128, // Collecter tous les tokens disponibles
                amount1Max: maxUint128, // Collecter tous les tokens disponibles
            };

            const collectReceipt = await apiBlockchainPools.collectPositionFees(walletClient, tokenId, collectParams)

            setRemovePoolLiquidityInfo(null)

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);



            // Si on retire 100% de la liquidité, brûler le NFT
            let burnReceipt: TransactionReceipt | null = null;

            if (liquidityToRemove >= currentLiquidity) {
                setRemovePoolLiquidityInfo("Burn position...")

                burnReceipt = await apiBlockchainPools.burnPosition(walletClient, tokenId);

                setRemovePoolLiquidityInfo(null)

                if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);
            }

            //console.log('🎉 Liquidity removal completed successfully!');


            setRemovePoolLiquidityCount(val => val + 1);

            return {
                success: true,
                decreaseHash: decreaseReceipt?.transactionHash ?? undefined,
                collectHash: collectReceipt.transactionHash,
                burnHash: burnReceipt?.transactionHash ?? undefined,
            };

        } catch (err) {
            //console.error('❌ Error in removePoolLiquidityReact:', error);
            //console.error('❌ Error in removePoolLiquidityReact:', getErrorMessage(err));

            setRemovePoolLiquidityInfo(null)
            setRemovePoolLiquidityError(getErrorMessage(err))

            return {
                success: false,
                error: getErrorMessage(err),
            };

        } finally {
            setIsRemovingLiquidity(false);
        }
    }


    const executeCollectPoolFees = async (walletClient: WalletClient, tokenId: string, setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>): Promise<TransactionResult> => {
        try {
            //console.log('🏊 Collect fees from position...');

            setIsRemovingLiquidity(true);
            setRemovePoolLiquidityError('')

            const userAddress = await apiBlockchain.getWalletAddress(walletClient);


            // 1. Récupérer les détails de la position
            const position = await apiBlockchainPools.fetchPosition(tokenId);
            const currentLiquidity = position.liquidity;

            if (currentLiquidity === 0n) {
                //throw new Error('Position has no liquidity to remove');
            }


            // Collecter les tokens (collect)

            setRemovePoolLiquidityInfo("Collect fees...")


            // Collecter tous les fees disponibles

            const collectParams: CollectParams = {
                tokenId: BigInt(tokenId),
                recipient: userAddress,
                amount0Max: maxUint128, // Collecter tous les tokens disponibles
                amount1Max: maxUint128, // Collecter tous les tokens disponibles
            };

            const collectReceipt = await apiBlockchainPools.collectPositionFees(walletClient, tokenId, collectParams)

            setRemovePoolLiquidityInfo(null)

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1);


            //console.log('🎉 Fees collect completed successfully!');


            setRemovePoolLiquidityCount(val => val + 1);

            return {
                success: true,
                transactionHash: collectReceipt.transactionHash,
            };

        } catch (err) {
            //console.error('❌ Error in removePoolLiquidityReact:', error);
            //console.error('❌ Error in removePoolLiquidityReact:', getErrorMessage(err));

            setRemovePoolLiquidityInfo(null)
            setRemovePoolLiquidityError(getErrorMessage(err))

            return {
                success: false,
                error: getErrorMessage(err),
            };

        } finally {
            setIsCollectingFees(false);
        }
    }


    useEffect(() => {
        if (!pool) return;

    }, [pool]);



    const poolLiquidity: PoolLiquidityHook = {
        addPoolLiquidityError,
        addPoolLiquidityInfo,
        addPoolLiquidityCount,
        isAddingLiquidity,
        removePoolLiquidityError,
        removePoolLiquidityInfo,
        removePoolLiquidityCount,
        isRemovingLiquidity,
        collectPoolFeesError,
        collectPoolFeesInfo,
        isCollectingFees,
        //collectPoolFeesCount,
        setAddPoolLiquidityError,
        setAddPoolLiquidityInfo,
        setAddPoolLiquidityCount,
        setIsAddingLiquidity,
        setRemovePoolLiquidityError,
        setRemovePoolLiquidityInfo,
        setRemovePoolLiquidityCount,
        setIsRemovingLiquidity,
        setCollectPoolFeesError,
        setCollectPoolFeesInfo,
        setIsCollectingFees,
        executeAddPoolLiquidity,
        executeRemovePoolLiquidity,
        executeCollectPoolFees,
    }

    return poolLiquidity
}

