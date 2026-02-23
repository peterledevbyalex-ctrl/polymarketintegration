
import { Address } from "viem";

import { Token } from "./tokens.types";


export interface SubgraphPool {
    id: Address;            // Adresse de la pool
    token0: Token;
    token1: Token;
    feeTier: string;              // Fee en string (ex: "3000" = 0.3%)
    liquidity: string;            // Liquidité totale
    sqrtPrice: string;            // Prix actuel (format sqrt)
    tick: string;                 // Tick courant
    token0Price: string;          // Prix du token0 en token1
    token1Price: string;          // Prix du token1 en token0
    volumeUSD: string;            // Volume en USD
    txCount: string;              // Nombre de transactions
    swapCount: string;            // Nombre de swaps
    apr24h: string;
    volumeUSD24h: string;
    feesUSD24h: string;
    totalValueLockedUSD: string;  // TVL en USD
    createdAtTimestamp: string;
    lastSwapTimestamp?: string;
    volumeToken0: string;
    volumeToken1: string;
    totalValueLockedToken0: string;
    totalValueLockedToken1: string;
    feeGrowthGlobal0X128: string;
    feeGrowthGlobal1X128: string;
}


export interface SubgraphPosition {
    id: Address;                   // NFT token ID
    owner: string;                // Adresse du propriétaire
    liquidity: string;
    tickLower: string;
    tickUpper: string;
    amountDepositedUSD: string;
    depositedToken0: string;
    depositedToken1: string;
    withdrawnToken0: string;
    withdrawnToken1: string;
    collectedFeesToken0: string;
    collectedFeesToken1: string;
    feeGrowthInside0LastX128: string;
    feeGrowthInside1LastX128: string;
    pool: SubgraphPool;
}


export type PositionRawResult = [
    nonce: bigint,
    operator: Address,
    token0: Address,
    token1: Address,
    fee: bigint,
    tickLower: bigint,
    tickUpper: bigint,
    liquidity: bigint,
    feeGrowth0: bigint,
    feeGrowth1: bigint,
    tokensOwed0: bigint,
    tokensOwed1: bigint,
]



export interface PositionResult {
    tokenId: bigint;
    nonce: bigint;
    operator: Address;
    token0: Address;
    token1: Address;
    fee: bigint;
    tickLower: bigint;
    tickUpper: bigint;
    liquidity: bigint;
    feeGrowth0: bigint;
    feeGrowth1: bigint;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
}


export type TicksRawResult = [
    liquidityGross: bigint,
    liquidityNet: bigint,
    feeGrowthOutside0X128: bigint,
    feeGrowthOutside1X128: bigint,
    tickCumulativeOutside: bigint,
    secondsPerLiquidityOutsideX128: bigint,
    secondsOutside: bigint,
    initialized: bigint,
]


export type TicksResult = {
    liquidityGross: bigint,
    liquidityNet: bigint,
    feeGrowthOutside0X128: bigint,
    feeGrowthOutside1X128: bigint,
    tickCumulativeOutside: bigint,
    secondsPerLiquidityOutsideX128: bigint,
    secondsOutside: bigint,
    initialized: bigint,
}
