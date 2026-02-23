
import { formatUnits, parseUnits, TransactionReceipt, WalletClient } from 'viem';
import { Dispatch, SetStateAction } from 'react'

import * as apiBlockchain from '@/lib/api_blockchain';
import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';
import * as apiBlockchainPools from '@/lib/api_blockchain_pools';

import { POSITION_MANAGER_ADDRESS } from '@/config.app';
import { applySlippageToAmount, clampSlippagePercent, DEFAULT_LP_SLIPPAGE, getTicksFromPriceRange } from './uniswap_utils';
import { getErrorMessage } from './ui_utils';

import type { SubgraphPool, Token, LiquidityMintParams, CollectParams, SubgraphPosition, SimpleResult } from '@/types'
import { isSameAddress } from './tokens_utils';



// DEPRECATED //



export type FetchPoolsDependencies = {
    setPoolsLoading?: Dispatch<SetStateAction<boolean>>,
    setPoolsError?: Dispatch<SetStateAction<string>>,
    setPools?: Dispatch<SetStateAction<SubgraphPool[]>>,
}

export type FetchPoolDependencies = {
    setPoolLoading?: Dispatch<SetStateAction<boolean>>,
    setPoolError?: Dispatch<SetStateAction<string>>,
    setPool?: Dispatch<SetStateAction<SubgraphPool | null>>,
}

export type FetchUserPositionsDependencies = {
    setUserPositionsLoading?: Dispatch<SetStateAction<boolean>>,
    setUserPositionsError?: Dispatch<SetStateAction<string>>,
    setUserPositions?: Dispatch<SetStateAction<SubgraphPosition[]>>,
    setPools?: Dispatch<SetStateAction<SubgraphPool[]>>,
}

export type CreatePoolDependencies = {
    setCreatePoolInfo?: Dispatch<SetStateAction<string>>,
    setCreatePoolError?: Dispatch<SetStateAction<string>>,
    setIsCreatingPool?: Dispatch<SetStateAction<boolean>>,
    setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>,
}

export type InitializePoolReactDependencies = {
    setInitializePoolInfo?: Dispatch<SetStateAction<string>>,
    setInitializePoolError?: Dispatch<SetStateAction<string>>,
}

type AddPoolLiquidityDependencies = {
    setAddPoolLiquidityInfo?: Dispatch<SetStateAction<string>>,
    setAddPoolLiquidityError?: Dispatch<SetStateAction<string>>
    setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>,
}

export type RemovePoolLiquidityDependencies = {
    setRemovePoolLiquidityInfo?: Dispatch<SetStateAction<string>>,
    setRemovePoolLiquidityError?: Dispatch<SetStateAction<string>>
}

export type CollectPoolFeesDependencies = {
    setCollectPoolFeesAction?: Dispatch<SetStateAction<string>>,
    setCollectPoolFeesError?: Dispatch<SetStateAction<string>>
}


const maxUint128 = 2n ** 128n - 1n;


/* ############## */
/* READ FUNCTIONS */
/* ############## */




/* ############### */
/* WRITE FUNCTIONS */
/* ############### */


// TODO: deplacer ces fonctions dans des usePoolCreatePool & usePoolLiquidity


const createPoolReact = async (walletClient: WalletClient, tokenA: Token, tokenB: Token, feeTier: string, priceAinB?: string, amountA?: string, amountB?: string, minPercent: number | null=null, maxPercent: number | null=null, slippage=5, deps?: CreatePoolDependencies) => {
    //const feeTier = '500'; // WETH/GTE 0.05%
    //const feeTier = '3000'; // WETH/GTE 0.3%
    //const feeTier = '10000'; // WETH/GTE 1%

    try {
        if (deps.setIsCreatingPool) {
            deps.setIsCreatingPool(true)
        }

        if (deps.setCreatePoolError) {
            deps.setCreatePoolError('')
        }

        let poolIsInitialized = false;
        let poolAddress: `0x${string}` | null = null;

        const existingPool = await apiBlockchainPools.getPoolAddress(tokenA.id, tokenB.id, feeTier);

        if (existingPool) {
            //console.log('Pool already exists at address:', existingPool);
            //return existingPool;

            poolAddress = existingPool;


            const slot0 = await apiBlockchainPools.getPoolSlot0(existingPool);

            //console.log('Pool slot0:', slot0);

            if (slot0[0] !== 0n) {
                poolIsInitialized = true;
            }
        }


        let createPoolReceipt: TransactionReceipt | null = null;
        let initializeResult: { success: boolean, error?: any, transactionHash?: `0x${string}` } | null = null;
        let addLiquidityResult: { success: boolean, error?: any, transactionHash?: `0x${string}` } | null = null;


        if (! poolAddress) {
            if (deps.setCreatePoolInfo) {
                deps.setCreatePoolInfo("Create Pool...")
            }

            // Create Pool
            createPoolReceipt = await apiBlockchainPools.createPool(walletClient, tokenA.id, tokenB.id, feeTier)

            if (deps.setCreatePoolInfo) {
                deps.setCreatePoolInfo(null)
            }

            if (createPoolReceipt.status !== 'success') {
                //console.error(`Pool creation reverted`);

                return {
                    success: false,
                    error: `Pool creation reverted`,
                };
            }

            poolAddress = await apiBlockchainPools.getPoolAddress(tokenA.id, tokenB.id, feeTier);

            if (!poolAddress) {
                //console.error(`Pool not fully created ?!`);

                return {
                    success: false,
                    error: `Pool not fully created ?!`,
                }
            }
        }



        const poolToken0Address = await apiBlockchainPools.getPoolToken0(poolAddress)

        const isTokenAToken0 = isSameAddress(tokenA.id, poolToken0Address);


        // le price (et les tokens) doit etre inversé ou non selon que tokenA correspond à token0 ou token1
        let price0in1 = priceAinB;
        let token0 = tokenA;
        let token1 = tokenB;
        let amount0 = amountA;
        let amount1 = amountB;

        if (!isTokenAToken0) {
            price0in1 = (1 / Number(priceAinB)).toString();
            amount0 = amountB;
            amount1 = amountA;
            token0 = tokenB;
            token1 = tokenA;
        }


        if (deps.setTransactionsInfoCurrentStep) deps.setTransactionsInfoCurrentStep(n => n + 1);

        if (price0in1) {
            // Initialize pool

            if (!poolIsInitialized) {
                if (deps.setCreatePoolInfo) {
                    deps.setCreatePoolInfo("Initialize...")
                }

                initializeResult = await initializePoolReact(walletClient, poolAddress, price0in1, token0.decimals, token1.decimals, {  })

                if (deps.setCreatePoolInfo) {
                    deps.setCreatePoolInfo(null)
                }

                if (! initializeResult.success) {
                    // TODO: show error
                    return initializeResult;
                }
            }


            if (deps.setTransactionsInfoCurrentStep) deps.setTransactionsInfoCurrentStep(n => n + 1);


            // Add liquidity
            if (Number(amount0) > 0 && Number(amount1) > 0) {
                const pool: Partial<SubgraphPool> = {
                    id: poolAddress,
                    token0,
                    token1,
                    feeTier,
                }

                if (deps.setCreatePoolInfo) {
                    deps.setCreatePoolInfo("Add Liquidity...")
                }

                addLiquidityResult = await addPoolLiquidityReact(walletClient, pool as SubgraphPool, amount0, amount1, minPercent, maxPercent, slippage, undefined, { setAddPoolLiquidityInfo: deps.setCreatePoolInfo, setAddPoolLiquidityError: deps.setCreatePoolError, setTransactionsInfoCurrentStep: deps.setTransactionsInfoCurrentStep })

                if (deps.setCreatePoolInfo) {
                    deps.setCreatePoolInfo(null)
                }

                if (! addLiquidityResult.success) {
                    // TODO: show error
                    return addLiquidityResult;
                }
            }
        }


        return {
            success: true,
            createPoolHash: createPoolReceipt?.transactionHash,
            initializePoolHash: initializeResult?.transactionHash,
            addLiquidityHash: addLiquidityResult?.transactionHash,
        };

    } catch (err) {
        //console.error('❌ Error in createPoolReact:', error);
        //console.error('❌ Error in createPoolReact:', getErrorMessage(err));

        if (deps.setCreatePoolInfo) {
            deps.setCreatePoolInfo(null)
        }

        if (deps.setCreatePoolError) {
            deps.setCreatePoolError(getErrorMessage(err))
        }

        if (deps.setIsCreatingPool) {
            deps.setIsCreatingPool(false)
        }

        return {
            success: false,
            error: getErrorMessage(err),
        };
    }
}



async function initializePoolReact(walletClient: WalletClient, poolAddress: `0x${string}`, price0in1: string, decimals0: number, decimals1: number, deps?: InitializePoolReactDependencies): Promise<{ success: boolean, error?: any, transactionHash?: `0x${string}` }> {
    try {
        //console.log('🔄 Initializing pool with initial price...');

        if (deps.setInitializePoolError) {
            deps.setInitializePoolError('')
        }

        const slot0 = await apiBlockchainPools.getPoolSlot0(poolAddress);

        //console.log('Pool slot0:', slot0);

        if (slot0[0] !== 0n) {
            //console.log('✅ Pool is already initialized with sqrtPriceX96:', slot0[0].toString());
            //console.log('✅ Current tick:', slot0[1]);

            return {
                success: true,
            };
        }

        const priceAdjusted = Number(price0in1) * (10 ** (decimals1 - decimals0));

        const sqrtPriceX96 = BigInt(Math.sqrt(priceAdjusted) * 2 ** 96)

        //console.log('🎯 Pool needs initialization. Setting initial price...');
        //console.log('Setting sqrtPriceX96:', sqrtPriceX96.toString());
        //console.log('This represents a price of ~1000 GTE per WETH');

        if (deps.setInitializePoolInfo) {
            deps.setInitializePoolInfo("Initialize...")
        }

        const receipt = await apiBlockchainPools.initializePool(walletClient, poolAddress, sqrtPriceX96);

        // Vérifier l'état après initialisation
        //const newSlot0 = await apiBlockchain.getPoolSlot0(poolAddress);
        //console.log('🎉 Pool initialized with:');
        //console.log('newSlot0:', newSlot0);
        //console.log('💡 You can now add liquidity to this pool!');

        if (deps.setInitializePoolInfo) {
            deps.setInitializePoolInfo(null)
        }

        return {
            success: receipt.status === 'success',
            transactionHash: receipt.transactionHash,
        };

    } catch (err) {
        //console.error('❌ Error in initializePoolReact:', error);
        //console.error('❌ Error in initializePoolReact:', getErrorMessage(err));

        if (deps.setInitializePoolInfo) {
            deps.setInitializePoolInfo(null)
        }

        if (deps.setInitializePoolError) {
            deps.setInitializePoolError(getErrorMessage(err))
        }

        return {
            success: false,
            error: getErrorMessage(err),
        };
    }
}



// TODO: a supprimer
const addPoolLiquidityReact = async (walletClient: WalletClient, pool: SubgraphPool, userAmount0Desired: string, userAmount1Desired: string, minPercent: number | null=null, maxPercent: number | null=null, slippage = DEFAULT_LP_SLIPPAGE, positionId?: string, deps?: AddPoolLiquidityDependencies): Promise<{ success: boolean, error?: any, transactionHash?: `0x${string}` }> => {
    try {
        //console.log('🏊 Adding liquidity to pool...');

        if (deps.setAddPoolLiquidityError) {
            deps.setAddPoolLiquidityError('')
        }

        if (deps.setAddPoolLiquidityInfo) {
            deps.setAddPoolLiquidityInfo(`Add Liquidity...`)
        }

        const amount0Desired: bigint = parseUnits(userAmount0Desired, pool.token0.decimals);
        const amount1Desired: bigint = parseUnits(userAmount1Desired, pool.token1.decimals);

        const slippageSafe = clampSlippagePercent(slippage, 0.05, 5);

        // Paramètres pour ajouter de la liquidité
        const amount0Min = applySlippageToAmount(amount0Desired, slippageSafe);
        const amount1Min = applySlippageToAmount(amount1Desired, slippageSafe);

        // Calcul des ticks pour la range de liquidité (fee 3000 = tick spacing 60)
        //const tickSpacing = 60; // Pour fee 3000

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 heure

        //console.log('Liquidity parameters:');
        //console.log('- Token0:', pool.token0);
        //console.log('- Token1:', pool.token1);
        //console.log('- Fee:', pool.feeTier);
        //console.log('- Amount0Desired:', amount0Desired.toString());
        //console.log('- Amount1Desired:', amount1Desired.toString());
        //console.log('- Tick spacing:', tickSpacing);
        //console.log('- Position Manager:', POSITION_MANAGER_ADDRESS);

        // Vérifier d'abord si la pool existe
        const poolAddress = await apiBlockchainPools.getPoolAddress(pool.token0.id, pool.token1.id, pool.feeTier)

        if (!poolAddress) {
            //console.log('❌ Pool does not exist. Create the pool first.');
            return { success: false, error: 'Pool does not exist. Create the pool first' };
        }

        //console.log('✅ Pool exists at:', poolAddress);

        // Lire le prix actuel de la pool pour calculer des ticks appropriés
        const slot0 = await apiBlockchainPools.getPoolSlot0(poolAddress);

        //console.log('📊 Pool current state:');
        //console.log('slot0:', slot0);

        if (slot0[0] === 0n) {
            //console.log('❌ Pool is not initialized.');
            return { success: false, error: 'Pool is not initialized' };
        }

        const tickSpacingRaw = await apiBlockchainPools.getPoolTickSpacing(pool.id as `0x${string}`)
        const tickSpacing = Number(tickSpacingRaw);


        // Calculer des ticks appropriés autour du tick actuel
        const currentTick = Number(slot0[1]);

        //const tickRange = 1200; // Range de ±1200 ticks (environ ±12% de variation de prix)
        //const tickLower = Math.floor((currentTick - tickRange) / tickSpacing) * tickSpacing;
        //const tickUpper = Math.ceil((currentTick + tickRange) / tickSpacing) * tickSpacing;

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
            return { success: false, error: 'Insufficient token balance for liquidity provision' };
        }


        // Approver les tokens pour le Position Manager
        //console.log('📝 Approving tokens...');

        // Vérifier les allowances actuelles
        const allowance0 = await apiBlockchainTokens.getTokenAllowance(pool.token0.id, userAddress, POSITION_MANAGER_ADDRESS)
        const allowance1 = await apiBlockchainTokens.getTokenAllowance(pool.token1.id, userAddress, POSITION_MANAGER_ADDRESS)


        // Approver si nécessaire
        if (allowance0 < amount0Desired) {
            //console.log('Approving token0...');

            if (deps.setAddPoolLiquidityInfo) {
                deps.setAddPoolLiquidityInfo(`Approve ${pool.token0.symbol}...`)
            }

            const approveReceipt0 = await apiBlockchainTokens.approveToken(walletClient, pool.token0.id, POSITION_MANAGER_ADDRESS, amount0Desired);

            if (deps.setAddPoolLiquidityInfo) {
                deps.setAddPoolLiquidityInfo(null)
            }

            //console.log('✅ Token0 approved');
        }

        if (deps.setTransactionsInfoCurrentStep) deps.setTransactionsInfoCurrentStep(n => n + 1);


        if (allowance1 < amount1Desired) {
            //console.log('Approving token1...');

            if (deps.setAddPoolLiquidityInfo) {
                deps.setAddPoolLiquidityInfo(`Approve ${pool.token1.symbol}...`)
            }

            const approveReceipt1 = await apiBlockchainTokens.approveToken(walletClient, pool.token1.id, POSITION_MANAGER_ADDRESS, amount1Desired);

            if (deps.setAddPoolLiquidityInfo) {
                deps.setAddPoolLiquidityInfo(null)
            }

            //console.log('✅ Token1 approved');
        }


        if (deps.setTransactionsInfoCurrentStep) deps.setTransactionsInfoCurrentStep(n => n + 1);


        // Ajouter la liquidité
        //console.log('🏊 Minting liquidity position...');

        // S'assurer que token0 < token1 (ordre canonique)
        const token0 = pool.token0.id < pool.token1.id ? pool.token0.id : pool.token1.id;
        const token1 = pool.token0.id < pool.token1.id ? pool.token1.id : pool.token0.id;
        const amount0Des = pool.token0.id < pool.token1.id ? amount0Desired : amount1Desired;
        const amount1Des = pool.token0.id < pool.token1.id ? amount1Desired : amount0Desired;
        const amount0Min_ = pool.token0.id < pool.token1.id ? amount0Min : amount1Min;
        const amount1Min_ = pool.token0.id < pool.token1.id ? amount1Min : amount0Min;


        let addLiquidityReceipt: TransactionReceipt | null = null;

        if (positionId) {
            // Add Liquidity to existing position

            // Paramètres pour decreaseLiquidity
            const increaseParams = {
                tokenId: BigInt(positionId),
                amount0Desired: amount0Des,
                amount1Desired: amount1Des,
                amount0Min: amount0Min_,
                amount1Min: amount1Min_,
                deadline,
            };

            if (deps.setAddPoolLiquidityInfo) {
                deps.setAddPoolLiquidityInfo("Add Liquidity...")
            }

            addLiquidityReceipt = await apiBlockchainPools.increasePoolLiquidity(walletClient, increaseParams);

        } else {
            // Create Position

            const { tickLower, tickUpper } = getTicksFromPriceRange(currentTick, minPercent, maxPercent, tickSpacing);

            //console.log('🎯 Calculated ticks based on current price:');
            //console.log('- Current tick:', currentTick);
            //console.log('- Suggested tickLower:', tickLower);
            //console.log('- Suggested tickUpper:', tickUpper);
            //console.log('- tickLower % tickSpacing:', tickLower % tickSpacing);
            //console.log('- tickUpper % tickSpacing:', tickUpper % tickSpacing);

            // Paramètres pour mint
            const amount0MinMint = 0n;
            const amount1MinMint = 0n;

            const mintParams: LiquidityMintParams = {
                token0: token0 as `0x${string}`,
                token1: token1 as `0x${string}`,
                fee: pool.feeTier,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0Des,
                amount1Desired: amount1Des,
                amount0Min: amount0MinMint,
                amount1Min: amount1MinMint,
                recipient: userAddress,
                deadline: deadline,
            };

            if (deps.setAddPoolLiquidityInfo) {
                deps.setAddPoolLiquidityInfo("Minting Liquidity...")
            }

            addLiquidityReceipt = await apiBlockchainPools.mintPoolLiquidity(walletClient, mintParams);

            if (deps.setAddPoolLiquidityInfo) {
                deps.setAddPoolLiquidityInfo(null)
            }
        }

        return {
            success: addLiquidityReceipt.status === 'success',
            transactionHash: addLiquidityReceipt.transactionHash,
        };

    } catch (error) {
        //console.error('❌ Error in addPoolLiquidityReact:', error);
        //console.error('❌ Error in addPoolLiquidityReact:', getErrorMessage(error));

        if (deps.setAddPoolLiquidityInfo) {
            deps.setAddPoolLiquidityInfo(null)
        }

        if (deps.setAddPoolLiquidityError) {
            deps.setAddPoolLiquidityError(getErrorMessage(error))
        }

        return {
            success: false,
            error: getErrorMessage(error),
        };
    }
}





