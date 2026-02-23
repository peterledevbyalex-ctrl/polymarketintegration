import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'

import * as apiBlockchainPools from '@/lib/api_blockchain_pools'
import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens'
import { POSITION_MANAGER_ADDRESS } from '@/config.app'
import { getErrorMessage } from '@/lib/ui_utils'
import { DEFAULT_LP_SLIPPAGE, applySlippageToAmount, clampSlippagePercent, getTickSpacingForFeeTier, getTicksFromPriceRange } from '@/lib/uniswap_utils'

import type { Token } from '@/types'
import type { LiquidityMintParams } from '@/types'
import type { WalletClient } from 'viem'
import { parseUnits } from 'viem'

export type CreatePoolResult = {
    success: boolean
    error?: string
    createPoolHash?: `0x${string}`
    initializePoolHash?: `0x${string}`
    addLiquidityHash?: `0x${string}`
}

export interface PoolCreatePoolHook {
    createPoolError: string | null
    createPoolInfo: string | null
    isCreatingPool: boolean
    setCreatePoolError: (value: string | null) => void
    setCreatePoolInfo: (value: string | null) => void
    setIsCreatingPool: (value: boolean) => void
    executeCreatePool: (params: {
        walletClient: WalletClient
        tokenA: Token
        tokenB: Token
        feeTier: string
        priceAinB?: string
        amountA?: string
        amountB?: string
        minPercent?: number | null
        maxPercent?: number | null
        slippage?: number
        setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>
    }) => Promise<CreatePoolResult>
}

export function usePoolCreatePool(): PoolCreatePoolHook {
    const [createPoolError, setCreatePoolError] = useState<string | null>(null)
    const [createPoolInfo, setCreatePoolInfo] = useState<string | null>(null)
    const [isCreatingPool, setIsCreatingPool] = useState(false)

    const executeCreatePool: PoolCreatePoolHook['executeCreatePool'] = async ({
        walletClient,
        tokenA,
        tokenB,
        feeTier,
        priceAinB,
        amountA,
        amountB,
        minPercent = null,
        maxPercent = null,
        slippage,
        setTransactionsInfoCurrentStep,
    }) => {
        try {
            setIsCreatingPool(true)
            setCreatePoolError(null)

            let poolAddress = await apiBlockchainPools.getPoolAddress(tokenA.id, tokenB.id, feeTier)
            let createPoolHash: `0x${string}` | undefined
            let initializePoolHash: `0x${string}` | undefined
            let addLiquidityHash: `0x${string}` | undefined

            if (!poolAddress) {
                setCreatePoolInfo('Create Pool...')
                const receipt = await apiBlockchainPools.createPool(walletClient, tokenA.id, tokenB.id, feeTier)
                setCreatePoolInfo(null)

                if (receipt.status !== 'success') {
                    return { success: false, error: 'Pool creation reverted' }
                }

                createPoolHash = receipt.transactionHash
                poolAddress = await apiBlockchainPools.getPoolAddress(tokenA.id, tokenB.id, feeTier)
                if (!poolAddress) {
                    return { success: false, error: 'Pool not fully created' }
                }
            }

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1)

            const slot0 = await apiBlockchainPools.getPoolSlot0(poolAddress)
            const isInitialized = slot0[0] !== 0n

            if (priceAinB && !isInitialized) {
                setCreatePoolInfo('Initialize...')

                const poolToken0Address = await apiBlockchainPools.getPoolToken0(poolAddress)
                const isTokenAToken0 = tokenA.id.toLowerCase() === poolToken0Address.toLowerCase()

                const price0in1 = isTokenAToken0 ? priceAinB : (1 / Number(priceAinB)).toString()
                const decimals0 = isTokenAToken0 ? tokenA.decimals : tokenB.decimals
                const decimals1 = isTokenAToken0 ? tokenB.decimals : tokenA.decimals

                const priceAdjusted = Number(price0in1) * (10 ** (decimals1 - decimals0))
                const sqrtPriceX96 = BigInt(Math.sqrt(priceAdjusted) * 2 ** 96)

                const receipt = await apiBlockchainPools.initializePool(walletClient, poolAddress, sqrtPriceX96)
                setCreatePoolInfo(null)

                if (receipt.status !== 'success') {
                    return { success: false, error: 'Pool initialization reverted' }
                }

                initializePoolHash = receipt.transactionHash
            }

            if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1)

            const shouldMint = Boolean(amountA && amountB && Number(amountA) > 0 && Number(amountB) > 0)
            if (shouldMint) {
                setCreatePoolInfo('Add Liquidity...')

                const poolToken0Address = await apiBlockchainPools.getPoolToken0(poolAddress)
                const poolToken0IsTokenA = tokenA.id.toLowerCase() === poolToken0Address.toLowerCase()
                const poolToken0 = poolToken0IsTokenA ? tokenA : tokenB
                const poolToken1 = poolToken0IsTokenA ? tokenB : tokenA
                const amount0 = poolToken0IsTokenA ? amountA! : amountB!
                const amount1 = poolToken0IsTokenA ? amountB! : amountA!

                const amount0Desired = parseUnits(amount0, poolToken0.decimals)
                const amount1Desired = parseUnits(amount1, poolToken1.decimals)

                const userAddresses = await walletClient.getAddresses()
                const userAddress = userAddresses[0]
                if (!userAddress) throw new Error('missing userAddress')

                const [allowance0, allowance1] = await Promise.all([
                    apiBlockchainTokens.getTokenAllowance(poolToken0.id, userAddress, POSITION_MANAGER_ADDRESS),
                    apiBlockchainTokens.getTokenAllowance(poolToken1.id, userAddress, POSITION_MANAGER_ADDRESS),
                ])

                if (allowance0 < amount0Desired) {
                    await apiBlockchainTokens.approveToken(walletClient, poolToken0.id, POSITION_MANAGER_ADDRESS, amount0Desired)
                }
                if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1)

                if (allowance1 < amount1Desired) {
                    await apiBlockchainTokens.approveToken(walletClient, poolToken1.id, POSITION_MANAGER_ADDRESS, amount1Desired)
                }
                if (setTransactionsInfoCurrentStep) setTransactionsInfoCurrentStep(n => n + 1)

                const slot0After = await apiBlockchainPools.getPoolSlot0(poolAddress)
                const currentTick = Number(slot0After[1])
                const tickSpacing = getTickSpacingForFeeTier(feeTier)
                const { tickLower, tickUpper } = getTicksFromPriceRange(currentTick, minPercent, maxPercent, tickSpacing)

                const slippageSafe = clampSlippagePercent(slippage ?? DEFAULT_LP_SLIPPAGE, 0.05, 5)

                let amount0Min = 0n
                let amount1Min = 0n

                const baseMintParams: LiquidityMintParams = {
                    token0: poolToken0.id,
                    token1: poolToken1.id,
                    fee: feeTier,
                    tickLower,
                    tickUpper,
                    amount0Desired,
                    amount1Desired,
                    amount0Min: 0n,
                    amount1Min: 0n,
                    recipient: userAddress,
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
                }

                try {
                    const simulated = await apiBlockchainPools.simulateMintPoolLiquidity(walletClient, baseMintParams)
                    amount0Min = applySlippageToAmount(simulated.amount0, slippageSafe)
                    amount1Min = applySlippageToAmount(simulated.amount1, slippageSafe)
                } catch {
                }

                const mintParams: LiquidityMintParams = {
                    ...baseMintParams,
                    amount0Min,
                    amount1Min,
                }

                const receipt = await apiBlockchainPools.mintPoolLiquidity(walletClient, mintParams)
                setCreatePoolInfo(null)

                if (receipt.status !== 'success') {
                    return { success: false, error: 'Add liquidity reverted' }
                }

                addLiquidityHash = receipt.transactionHash
            }

            setCreatePoolInfo(null)
            return {
                success: true,
                createPoolHash,
                initializePoolHash,
                addLiquidityHash,
            }
        } catch (err) {
            const message = getErrorMessage(err)
            setCreatePoolInfo(null)
            setCreatePoolError(message)
            return { success: false, error: message }
        } finally {
            setIsCreatingPool(false)
        }
    }

    return {
        createPoolError,
        createPoolInfo,
        isCreatingPool,
        setCreatePoolError,
        setCreatePoolInfo,
        setIsCreatingPool,
        executeCreatePool,
    }
}
