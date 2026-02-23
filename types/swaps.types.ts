
import { Address, Hex } from "viem";

import { SubgraphPool } from "./pools.types";



// QuotePath

export type QuotePathParamsSegment = {
    tokenIn: Address,
    tokenOut: Address,
    fee: string
};

export type QuotePathParams = QuotePathParamsSegment[];


export type QuotePathPool = {
    pool: Address;
    tokenIn: Address,
    tokenOut: Address,
    feeTier: string;
    sqrtPriceX96: string;
    sqrtPriceX96After: string,
};

export type QuotePath = QuotePathPool[];



// QuoteExactInput (Single)

export type QuoteExactInputSingleArgs = [
    params: {
        tokenIn: Address,
        tokenOut: Address,
        amountIn: bigint,
        fee: bigint,
        sqrtPriceLimitX96: bigint,
    }
]


export type QuoteExactInputSingleRawResult = [
    amountOut: bigint,
    sqrtPriceX96After: bigint,
    initializedTicksCrossed: number,
    gasEstimate: bigint,
]


export type QuoteExactInputSingleResult = {
    amountOut: bigint,
    sqrtPriceX96After: bigint,
    initializedTicksCrossed: number,
    gasEstimate: bigint,
}


export type QuoteExactInputSingle = {
    amountOut: bigint;
    gasEstimate: bigint;
} & QuotePathPool;


// QuoteExactInput (MultiHop)

export type QuoteExactInputArgs = [
    path: Hex,
    amountIn: bigint,
]

export type QuoteExactInputRawResult = [
    amountOut: bigint,
    sqrtPriceX96AfterList: bigint[],
    initializedTicksCrossedList: number[],
    gasEstimate: bigint,
];

export type QuoteExactInputResult = {
    amountOut: bigint;
    sqrtPriceX96AfterList: bigint[];
    initializedTicksCrossedList: number[];
    gasEstimate: bigint;
}


export type QuoteExactInput = {
    amountOut: bigint;
    gasEstimate: bigint;
    path: QuotePath;
};


// QuoteExactOutput (Single)

export type QuoteExactOutputSingleArgs = [
    params: {
        tokenIn: Address,
        tokenOut: Address,
        amount: bigint,
        fee: bigint,
        sqrtPriceLimitX96: bigint,
    },
]

export type QuoteExactOutputSingleRawResult = [
    amountIn: bigint,
    sqrtPriceX96After: bigint,
    initializedTicksCrossed: number,
    gasEstimate: bigint,
]

export type QuoteExactOutputSingleResult = {
    amountIn: bigint,
    sqrtPriceX96After: bigint,
    initializedTicksCrossed: number,
    gasEstimate: bigint,
}


export type QuoteExactOutputSingle = {
    amountIn: bigint;
    gasEstimate: bigint;
} & QuotePathPool;


// QuoteExactOutput (MultiHop)

export type QuoteExactOutputArgs = [
    path: Hex,
    amountOut: bigint,
]

export type QuoteExactOutputRawResult = [
    amountIn: bigint,
    sqrtPriceX96AfterList: bigint[],
    initializedTicksCrossedList: number[],
    gasEstimate: bigint,
];

export type QuoteExactOutputResult = {
    amountIn: bigint;
    sqrtPriceX96AfterList: bigint[];
    initializedTicksCrossedList: number[];
    gasEstimate: bigint;
}


export type QuoteExactOutput = {
    amountIn: bigint;
    gasEstimate: bigint;
    path: QuotePath;
};



// SWAP


export interface SubgraphSwap {
    id: string;
    transaction: {
        id: string;
        timestamp: string;
    };
    sender: string;
    recipient: string;
    amount0: string;
    amount1: string;
    amountUSD: string;
    sqrtPriceX96: string;
    tick: string;
    pool: SubgraphPool;
}


export type TokenSwapQuotationPool = {
    tokenIn: Address,
    tokenOut: Address,
    feeTier: string,
    poolAddress: Address,
    sqrtPrice: string,
    token0: Address,
    token1: Address,
};

export type TokenSwapQuotationPath = TokenSwapQuotationPool[]
//export type TokenSwapQuotationSinglePools = TokenSwapQuotationPool[]




export interface TokenSwapQuotationResult { // à renommer en Quotation ?
    type: 'ExactInput' | 'ExactOutput'
    tokenIn: Address
    tokenOut: Address
    amountIn: string
    amountInRaw: string;         // Montant brut
    amountOut: string;           // Montant que l'on reçoit (formaté)
    amountOutRaw: string;        // Montant brut
    pricePerToken: string;       // Prix unitaire
    priceImpact: number;         // Impact sur le prix (en %)
    gasEstimate: string;         // Estimation du gas
    path: QuotePath,
}


// ==================== SMART ROUTING TYPES ====================

export type SwapRouterType = 'tax_router' | 'universal_router' | 'lifi' | 'direct';

export interface SwapRouteDecision {
    router: SwapRouterType;
    reason: string;
    isTaxable: boolean;
    taxRate?: number;
    hasPool: boolean;
    isCrossChain: boolean;
}

export interface TokenTaxConfig {
    isTaxable: boolean;
    vault: Address;
    taxRate: bigint;
}

