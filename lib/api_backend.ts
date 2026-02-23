
import { Address } from "viem";

import { ETH_ADDRESS, WETH_ADDRESS } from "@/config.app";

import type { SubgraphPool, SubgraphPosition, TokenSwapQuotationPool, Token, PoolDayData, PoolHourData, TokenSwapQuotationPath } from "@/types";




/* ################ */
/* TOKENS FUNCTIONS */
/* ################ */


// Fetch top tokens from backend API (using subgraph)
export const fetchTokens = async (): Promise<Token[]> => {
    const response = await fetch('/api/tokens/list')

    if (!response.ok) {
        throw new Error('Failed to fetch tokens')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: Token[] }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tokens')
    }

    return result.data;
}


/* ############### */
/* SWAPS FUNCTIONS */
/* ############### */


// Fetch available pools for a pair of tokens from backend API (using subgraph)
export const getSwapPoolsSingle = async (tokenIn: string, tokenOut: string): Promise<TokenSwapQuotationPool[]> => {
    if (tokenIn === ETH_ADDRESS) {
        tokenIn = WETH_ADDRESS;
    }

    if (tokenOut === ETH_ADDRESS) {
        tokenOut = WETH_ADDRESS;
    }

    const params = {
        tokenIn,
        tokenOut,
    }

    const querystring = (new URLSearchParams(params)).toString();

    const response = await fetch('/api/swaps/swap-pools-single?' + querystring)

    if (!response.ok) {
        throw new Error('Failed to fetch pools')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: TokenSwapQuotationPool[] }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch pools')
    }


    const poolsBlacklist: string[] = [
        //'0x3a11868e469cd9f4bd2627528bd1d9b805d9996b', // WETH/USDC - 0.05% fee
        //'0x026331ccb2383689b805139fd9bbc321e2bf5d00', // WETH/USDC -  0.3% fee
    ];

    if (result.data) {
        result.data = result.data.filter(d => !poolsBlacklist.includes(d.poolAddress.toLowerCase()))
    }

    return result.data;
}


// Fetch available pools for a pair of tokens from backend API (using subgraph)
export const getSwapPoolsMultiple = async (tokenIn: string, tokenOut: string): Promise<TokenSwapQuotationPath[]> => {
    if (tokenIn === ETH_ADDRESS) {
        tokenIn = WETH_ADDRESS;
    }

    if (tokenOut === ETH_ADDRESS) {
        tokenOut = WETH_ADDRESS;
    }

    const params = {
        tokenIn,
        tokenOut,
    }

    const querystring = (new URLSearchParams(params)).toString();

    const response = await fetch('/api/swaps/swap-pools?' + querystring)

    if (!response.ok) {
        throw new Error('Failed to fetch pools')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: TokenSwapQuotationPath[] }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch pools')
    }


    if (result.data) {
        // Apply pools blacklist

        const poolsBlacklist: string[] = [
            //'0x3a11868e469cd9f4bd2627528bd1d9b805d9996b', // WETH/USDC - 0.05% fee
            //'0x026331ccb2383689b805139fd9bbc321e2bf5d00', // WETH/USDC -  0.3% fee
        ];

        //result.data = result.data.filter(d => !poolsBlacklist.includes(d.poolAddress.toLowerCase()))
    }

    return result.data;
}



/* ############### */
/* POOLS FUNCTIONS */
/* ############### */


// Fetch pools from backend API (using subgraph)
export const fetchPools = async (): Promise<SubgraphPool[]> => {
    const response = await fetch('/api/pools/list')

    if (!response.ok) {
        throw new Error('Failed to fetch pools')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: SubgraphPool[] }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch pools')
    }

    return result.data;
}


export const fetchPool = async (poolAddress: `0x${string}`): Promise<SubgraphPool> => {
    const response = await fetch(`/api/pools/pool/${poolAddress}`)

    if (!response.ok) {
        throw new Error('Failed to fetch pool')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: SubgraphPool | null }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch pool')
    }

    return result.data;
}



// Fetch user positions from backend API (using subgraph)
export const fetchUserPositions = async (userAddress: `0x${string}`, poolAddress?: `0x${string}`): Promise<SubgraphPosition[]> => {
    const params = {
        userAddress,
        poolAddress: poolAddress ?? '',
    }

    const querystring = (new URLSearchParams(params)).toString();

    const response = await fetch('/api/pools/user-positions?' + querystring)

    if (!response.ok) {
        throw new Error('Failed to fetch positions')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: SubgraphPosition[] }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch positions')
    }

    return result.data;
}


export const fetchPoolDayData = async (poolAddress: `0x${string}`): Promise<PoolDayData[]> => {
    const response = await fetch(`/api/pools/pool/${poolAddress}/historical/day`)

    if (!response.ok) {
        throw new Error('Failed to fetch tokens')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: PoolDayData[] | null }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tokens')
    }

    return result.data;
}


export const fetchPoolHourData = async (poolAddress: `0x${string}`): Promise<PoolHourData[]> => {
    const response = await fetch(`/api/pools/pool/${poolAddress}/historical/hour`)

    if (!response.ok) {
        throw new Error('Failed to fetch tokens')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: PoolHourData[] | null }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tokens')
    }

    return result.data;
}




/* ############## */
/* USER FUNCTIONS */
/* ############## */


// Fetch user tokens from backend API (using Block Explorer API)
export const fetchUserTokens = async (userAddress: `0x${string}`): Promise<Token[]> => {
    const params = {
        userAddress,
    }

    const querystring = (new URLSearchParams(params)).toString();

    const response = await fetch('/api/user/tokens?' + querystring)

    if (!response.ok) {
        throw new Error('Failed to fetch tokens')
    }

    const result = await response.json() as { success: boolean, error?: any, data?: Token[] }

    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch tokens')
    }

    return result.data;
}

