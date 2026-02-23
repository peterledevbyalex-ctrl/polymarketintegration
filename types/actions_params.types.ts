
import { Address } from "viem";
import { QuotePath } from "./swaps.types";


export type SwapSingleParams = {
    tokenIn: Address;
    tokenOut: Address;
    fee: bigint;
    recipient: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    sqrtPriceLimitX96: bigint;
};


export type SwapMultipleParams = {
    tokenIn: Address;
    tokenOut: Address;
    recipient: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    path: QuotePath;
};


export type LiquidityMintParams = {
    token0: Address;
    token1: Address;
    fee: string;
    tickLower: number;
    tickUpper: number;
    amount0Desired: bigint;
    amount1Desired: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
    recipient: Address;
    deadline: bigint;
}


export type LiquidityIncreaseParams = {
    tokenId: bigint;
    amount0Desired: bigint;
    amount1Desired: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
    deadline: bigint;
}


export type LiquidityDecreaseParams = {
    tokenId: bigint;
    liquidity: bigint;
    amount0Min: bigint;
    amount1Min: bigint;
    deadline: bigint;
}


export type CollectParams = {
    tokenId: bigint;
    recipient: Address;
    amount0Max: bigint;
    amount1Max: bigint;
}

