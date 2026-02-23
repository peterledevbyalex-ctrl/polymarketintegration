

import { POOL_FACTORY_CONTRACT_ADDRESS } from '@/config.app'
import { Address, getCreate2Address, Hex } from 'viem'
import { keccak256, encodePacked } from 'viem/utils'

//import * as apiBlockchain from '@/lib/api_blockchain';
//import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';

import { QuotePathParams, QuotePathParamsSegment, SubgraphPosition, TicksResult, Token, TokenSwapQuotationResult } from '@/types';
import { getPoolTicks } from './api_blockchain_pools';


export const DEFAULT_SWAP_SLIPPAGE_AUTO_FALLBACK = 0.5;
export const DEFAULT_LP_SLIPPAGE = 0.5;

export function clampSlippagePercent(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

export function slippagePercentToBps(slippagePercent: number): number {
    const bps = Math.round(slippagePercent * 100);
    if (!Number.isFinite(bps)) return 0;
    return Math.min(10_000, Math.max(0, bps));
}

export function applySlippageToAmount(amount: bigint, slippagePercent: number): bigint {
    const bps = slippagePercentToBps(slippagePercent);
    const multiplierBps = 10_000 - bps;
    return (amount * BigInt(multiplierBps)) / 10_000n;
}



// Prix → Tick
export function priceToTick(price: number): number {
    return Math.floor(Math.log(price) / Math.log(1.0001));
}


// Tick → Prix
export function tickToPrice(tick: number): number {
    return 1.0001 ** tick;
}


// Fonction pour calculer les montants de tokens basés sur la liquidité et les ticks
export const calculateTokenAmountsFromLiquidity = (
    liquidity: bigint,
    tickLower: number,
    tickUpper: number,
    currentTick: number,
    sqrtPriceX96Current: bigint
): { amount0: bigint, amount1: bigint } => {

    // Convertir les ticks en sqrtPrice
    const sqrtPriceLower = BigInt(Math.floor(Math.sqrt(1.0001 ** tickLower) * 2 ** 96));
    const sqrtPriceUpper = BigInt(Math.floor(Math.sqrt(1.0001 ** tickUpper) * 2 ** 96));

    const Q96 = 2n ** 96n;

    if (currentTick < tickLower) {
        // Position entièrement en token0
        const amount0 = (liquidity * Q96 * (sqrtPriceUpper - sqrtPriceLower)) /
            (sqrtPriceUpper * sqrtPriceLower);
        return {
            amount0,
            amount1: 0n,
        };

    } else if (currentTick >= tickUpper) {
        // Position entièrement en token1
        const amount1 = (liquidity * (sqrtPriceUpper - sqrtPriceLower)) / Q96;
        return {
            amount0: 0n,
            amount1,
        };

    } else {
        // Position active - calcul avec le prix actuel
        const amount0 = (liquidity * Q96 * (sqrtPriceUpper - sqrtPriceX96Current)) /
            (sqrtPriceUpper * sqrtPriceX96Current);

        const amount1 = (liquidity * (sqrtPriceX96Current - sqrtPriceLower)) / Q96;

        return {
            amount0,
            amount1,
        };
    }
};


export function getTicksFromPriceRange(currentTick: number, minPercentChange: number | null, maxPercentChange: number | null, tickSpacing: number): { tickLower: number; tickUpper: number } {
    const MIN_TICK = -887_272;
    const MAX_TICK = 887_272;

    // Convertir le pourcentage de prix en tick
    // Formule : tick_change = log(1 + percent/100) / log(1.0001)


    // LOWER
    let tickLower = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing

    if (minPercentChange !== null) {
        const tickChangeLower = Math.log(1 + minPercentChange / 100) / Math.log(1.0001);
        const desiredTickLower = currentTick + tickChangeLower;

        // Alignement sur tickSpacing
        tickLower = Math.floor(desiredTickLower / tickSpacing) * tickSpacing;
    }


    // UPPER
    let tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing

    if (maxPercentChange !== null) {
        const tickChangeUpper = Math.log(1 + maxPercentChange / 100) / Math.log(1.0001);
        const desiredTickUpper = currentTick + tickChangeUpper;

        // Alignement sur tickSpacing
        tickUpper = Math.ceil(desiredTickUpper / tickSpacing) * tickSpacing;
    }


    return { tickLower, tickUpper };
}




export function getTickSpacingForFeeTier(feeTier: string): number {
    // https://support.uniswap.org/hc/en-us/articles/21069524840589-What-is-a-tick-when-providing-liquidity
    // https://rareskills.io/post/uniswap-v3-tick-spacing

    //console.log('feeTier:', feeTier)
    const feeTierDecimal = Number(feeTier) / 10_000; // 3000 → 0.003
    //console.log('feeTierDecimal:', feeTierDecimal)

    if (feeTierDecimal === 0.01) {
        return 1
    }

    if (feeTierDecimal === 0.02) {
        return 4
    }

    if (feeTierDecimal === 0.03) {
        return 6
    }

    if (feeTierDecimal === 0.04) {
        return 8
    }

    if (feeTierDecimal === 0.05) {
        return 10
    }

    if (feeTierDecimal === 0.3) {
        return 60
    }

    if (feeTierDecimal === 1) {
        return 200
    }

    return 0
}


export function getFullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
    // https://docs.uniswap.org/contracts/v4/reference/core/libraries/TickMath
    // https://rareskills.io/post/uniswap-v3-min-max-tick

    // Arrondir au tickSpacing le plus proche
    const MIN_TICK = -887_272;
    const MAX_TICK = 887_272;

    const tickLower = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

    return { tickLower, tickUpper };
}



export function calculatePoolAPR(tvl: string, dailyFees: string): number {
    // Calculer l'APR
    const currentTVL = Number(tvl);
    const annualFees = Number(dailyFees) * 365;
    const apr = (annualFees / currentTVL) * 100;

    return apr;
}


export function calculateSlippageAuto(tokenFrom: Token, tokenTo: Token, quotation: TokenSwapQuotationResult) {
    if (!quotation || !quotation.path || quotation.path.length === 0) return 0.5; // Valeur par défaut

    let autoSlippage = 0;
    let totalPriceImpact = 0;

    // Analyser chaque segment du path
    for (const segment of quotation.path) {
        if (BigInt(segment.sqrtPriceX96) > 0n && BigInt(segment.sqrtPriceX96After) > 0n) {
            // Convertir sqrtPriceX96 en prix réel
            // Price = (sqrtPriceX96 / 2^96)^2
            const currentPrice = ((Number(segment.sqrtPriceX96) / 2 ** 96) ** 2) * 10 ** (tokenTo.decimals - tokenFrom.decimals);
            const newPrice = ((Number(segment.sqrtPriceX96After) / 2 ** 96) ** 2) * 10 ** (tokenTo.decimals - tokenFrom.decimals);

            // Calculer le changement de prix pour ce segment
            const priceChange = Math.abs((newPrice - currentPrice) / currentPrice);
            totalPriceImpact += priceChange;
        }
    }

    // Si on a calculé des impacts de prix
    if (totalPriceImpact > 0) {
        // Pour un path multi-segments, on cumule les impacts
        // Formule: slippage = totalPriceImpact * 1.3 + 0.1% (buffer minimum plus élevé pour les multi-hops)
        autoSlippage = (totalPriceImpact * 100 * 1.3) + 0.1;

        // Limites de sécurité
        autoSlippage = Math.max(0.1, autoSlippage); // Minimum 0.1% pour les multi-paths
        autoSlippage = Math.min(5.0, autoSlippage);  // Maximum 5%
        autoSlippage = Number(autoSlippage.toFixed(2));

    } else {
        // Si on ne peut pas calculer, retourner une valeur par défaut
        autoSlippage = quotation.path.length > 1 ? 0.75 : 0.5;
    }

    return autoSlippage;
}




export function calculateSlippageAutoSingle(tokenFrom: Token, tokenTo: Token, quotation: TokenSwapQuotationResult) {
    if (!quotation) return 0;

    let autoSlippage = 0;

    const sqrtPriceX96 = quotation.path[0].sqrtPriceX96;
    const sqrtPriceX96After = quotation.path[0].sqrtPriceX96After;

    if (BigInt(sqrtPriceX96) > 0n && BigInt(sqrtPriceX96After) > 0n) {
        // Convertir sqrtPriceX96 en prix réel
        // Price = (sqrtPriceX96 / 2^96)^2
        const currentPrice = ((Number(sqrtPriceX96) / 2 ** 96) ** 2) * 10 ** (tokenTo.decimals - tokenFrom.decimals);
        const newPrice = ((Number(sqrtPriceX96After) / 2 ** 96) ** 2) * 10 ** (tokenTo.decimals - tokenFrom.decimals);

        // Calculer le changement de prix exact
        const priceChange = Math.abs((newPrice - currentPrice) / currentPrice);

        // Le slippage optimal est légèrement supérieur au changement de prix
        // pour tenir compte des variations de prix entre la quotation et l'exécution
        // Formule: slippage = priceChange * 1.2 + 0.05% (buffer minimum)
        autoSlippage = (priceChange * 100 * 1.2) + 0.05;

        // Limites de sécurité
        autoSlippage = Math.max(0.05, autoSlippage); // Minimum 0.05%
        autoSlippage = Math.min(5.0, autoSlippage);  // Maximum 5%
        autoSlippage = Number(autoSlippage.toFixed(2));
    }

    return autoSlippage;
}


export function encodeUniswapPath(path: QuotePathParams): Hex {
    if (!path || path.length === 0) {
        throw new Error("Path cannot be empty");
    }

    // For a path with N segments, we have: token0 + fee0 + token1 + fee1 + ... + tokenN
    const types: string[] = [];
    const values: any[] = [];

    // Add the first token
    types.push('address');
    values.push(path[0].tokenIn);

    // Add each segment (fee + tokenOut)
    for (const segment of path) {
        types.push('uint24');  // fee (3 bytes)
        values.push(BigInt(segment.fee));

        types.push('address'); // tokenOut (20 bytes)
        values.push(segment.tokenOut);
    }

    const encodedPath = encodePacked(types, values);

    return encodedPath;
}


export function encodeUniswapReversePath(path: QuotePathParams): Hex {
    if (!path || path.length === 0) {
        throw new Error("Path cannot be empty");
    }

    path = path.slice().reverse();

    // For a path with N segments, we have: token0 + fee0 + token1 + fee1 + ... + tokenN
    const types: string[] = [];
    const values: any[] = [];

    // Add the first token
    types.push('address');
    values.push(path[0].tokenOut);

    // Add each segment (fee + tokenOut)
    for (const segment of path) {
        types.push('uint24');  // fee (3 bytes)
        values.push(BigInt(segment.fee));

        types.push('address'); // tokenOut (20 bytes)
        values.push(segment.tokenIn);
    }

    const encodedPath = encodePacked(types, values);

    return encodedPath;
}


export function encodeUniswapPath_Alternative(path: QuotePathParams): string {
    if (!path || path.length === 0) {
        throw new Error("Path cannot be empty");
    }


    let encodedPath = '0x'

    for (const segment of path) {
        // Format: tokenAddress(20) + fee(3)
        encodedPath += segment.tokenIn.slice(2).padStart(40, '0'); // 20 bytes
        encodedPath += BigInt(segment.fee).toString(16).padStart(6, '0'); // 3 bytes
    }

    // encode the final token
    encodedPath += path[path.length - 1].tokenOut.slice(2).padStart(40, '0');

    return encodedPath.toLowerCase()
}


// Calcul EXACT des fees
export const calculateUnclaimedFees = (position: SubgraphPosition, tickLowerData: TicksResult, tickUpperData: TicksResult): { fees0: bigint, fees1: bigint } => {
    if (!position || !tickLowerData || !tickUpperData) return { fees0: 0n, fees1: 0n };

    const pool = position.pool;

    const liquidity = BigInt(position.liquidity);
    const currentTick = Number(pool.tick);
    const tickLower = Number(position.tickLower);
    const tickUpper = Number(position.tickUpper);

    const feeGrowthGlobal0X128 = BigInt(pool.feeGrowthGlobal0X128);
    const feeGrowthGlobal1X128 = BigInt(pool.feeGrowthGlobal1X128);

    // Calcul de feeGrowthBelow (en dessous de tickLower)
    let feeGrowthBelow0X128: bigint;
    let feeGrowthBelow1X128: bigint;

    if (currentTick >= tickLower) {
        feeGrowthBelow0X128 = tickLowerData.feeGrowthOutside0X128;
        feeGrowthBelow1X128 = tickLowerData.feeGrowthOutside1X128;
    } else {
        feeGrowthBelow0X128 = feeGrowthGlobal0X128 - tickLowerData.feeGrowthOutside0X128;
        feeGrowthBelow1X128 = feeGrowthGlobal1X128 - tickLowerData.feeGrowthOutside1X128;
    }

    // Calcul de feeGrowthAbove (au dessus de tickUpper)
    let feeGrowthAbove0X128: bigint;
    let feeGrowthAbove1X128: bigint;

    if (currentTick < tickUpper) {
        feeGrowthAbove0X128 = tickUpperData.feeGrowthOutside0X128;
        feeGrowthAbove1X128 = tickUpperData.feeGrowthOutside1X128;

    } else {
        feeGrowthAbove0X128 = feeGrowthGlobal0X128 - tickUpperData.feeGrowthOutside0X128;
        feeGrowthAbove1X128 = feeGrowthGlobal1X128 - tickUpperData.feeGrowthOutside1X128;
    }

    // Calcul de feeGrowthInside (entre tickLower et tickUpper)
    const feeGrowthInside0X128 = feeGrowthGlobal0X128 - feeGrowthBelow0X128 - feeGrowthAbove0X128;
    const feeGrowthInside1X128 = feeGrowthGlobal1X128 - feeGrowthBelow1X128 - feeGrowthAbove1X128;

    // Delta depuis la dernière collecte
    const feeGrowthInside0LastX128 = BigInt(position.feeGrowthInside0LastX128);
    const feeGrowthInside1LastX128 = BigInt(position.feeGrowthInside1LastX128);

    const feeGrowth0Delta = feeGrowthInside0X128 - feeGrowthInside0LastX128;
    const feeGrowth1Delta = feeGrowthInside1X128 - feeGrowthInside1LastX128;

    // Calcul final des fees
    const Q128 = BigInt(2) ** BigInt(128);
    const fees0 = (liquidity * feeGrowth0Delta) / Q128;
    const fees1 = (liquidity * feeGrowth1Delta) / Q128;

    return { fees0, fees1 };
};


// Fonction pour calculer les fees non collectés d'une position
const calculateUnclaimedFees_OLD = (position: SubgraphPosition): { fees0: bigint, fees1: bigint } => {
    const pool = position.pool;

    // Convertir en BigInt pour les calculs précis
    const liquidity = BigInt(position.liquidity);
    const feeGrowthInside0LastX128 = BigInt(position.feeGrowthInside0LastX128);
    const feeGrowthInside1LastX128 = BigInt(position.feeGrowthInside1LastX128);

    // Calculer le feeGrowthInside actuel
    const feeGrowthGlobal0X128 = BigInt(pool.feeGrowthGlobal0X128);
    const feeGrowthGlobal1X128 = BigInt(pool.feeGrowthGlobal1X128);

    const currentTick = Number(pool.tick);
    const tickLower = Number(position.tickLower);
    const tickUpper = Number(position.tickUpper);

    // Simplification : on approxime feeGrowthInside avec feeGrowthGlobal si in range
    // Pour un calcul exact, il faudrait les feeGrowth des ticks lower/upper
    let feeGrowthInside0Current = feeGrowthGlobal0X128;
    let feeGrowthInside1Current = feeGrowthGlobal1X128;

    // Calculer la différence de croissance des fees
    const feeGrowth0Delta = feeGrowthInside0Current - feeGrowthInside0LastX128;
    const feeGrowth1Delta = feeGrowthInside1Current - feeGrowthInside1LastX128;

    // Calculer les fees = (liquidity * feeGrowthDelta) / 2^128
    const Q128 = BigInt(2) ** BigInt(128);
    const fees0 = (liquidity * feeGrowth0Delta) / Q128;
    const fees1 = (liquidity * feeGrowth1Delta) / Q128;

    return { fees0, fees1 };
}


export const calculateFeesEarnedUSD = (position: SubgraphPosition, token0: Token, token1: Token, tickLowerData: TicksResult, tickUpperData: TicksResult): number => {
    if (!position || !tickLowerData || !tickUpperData) return 0;

    try {
        // Fees non collectés (calcul exact)
        const { fees0, fees1 } = calculateUnclaimedFees(position, tickLowerData, tickUpperData);

        // Convertir en unités lisibles
        const unclaimedFees0 = Number(fees0) / (10 ** token0.decimals);
        const unclaimedFees1 = Number(fees1) / (10 ** token1.decimals);

        // Fees déjà collectés
        const collectedFees0 = Number(position.collectedFeesToken0);
        const collectedFees1 = Number(position.collectedFeesToken1);

        // Total des fees gagnés
        const totalFees0 = unclaimedFees0 + collectedFees0;
        const totalFees1 = unclaimedFees1 + collectedFees1;

        // Convertir en USD
        const feesUSD0 = totalFees0 * Number(token0.derivedUSD || '0');
        const feesUSD1 = totalFees1 * Number(token1.derivedUSD || '0');

        return feesUSD0 + feesUSD1;

    } catch (error) {
        //console.error('Error calculating fees:', error);
        return 0;
    }
}


export const calculatePositionValueUSD = (position: SubgraphPosition, token0: Token, token1: Token): number => {
    try {
        const liquidity = BigInt(position.liquidity);
        if (liquidity === 0n) return 0;

        const currentTick = Number(position.pool.tick);
        const tickLower = Number(position.tickLower);
        const tickUpper = Number(position.tickUpper);
        const sqrtPriceX96 = BigInt(position.pool.sqrtPrice);

        const { amount0, amount1 } = calculateTokenAmountsFromLiquidity(
            liquidity,
            tickLower,
            tickUpper,
            currentTick,
            sqrtPriceX96
        );

        const amount0Decimal = Number(amount0) / (10 ** token0.decimals);
        const amount1Decimal = Number(amount1) / (10 ** token1.decimals);

        const token0USD = Number(token0.derivedUSD || '0');
        const token1USD = Number(token1.derivedUSD || '0');

        return (amount0Decimal * token0USD) + (amount1Decimal * token1USD);
    } catch (error) {
        return 0;
    }
};


export const isPositionInRange = (position: SubgraphPosition): boolean => {
    const currentTick = Number(position.pool.tick);
    const tickLower = Number(position.tickLower);
    const tickUpper = Number(position.tickUpper);

    return currentTick >= tickLower && currentTick <= tickUpper;
}

export const calculatePositionAPR = (position: SubgraphPosition, token0: Token, token1: Token): number => {
    // Calculer la valeur totale de la position
    const depositedUSD = Number(position.amountDepositedUSD || '0');

    if (depositedUSD === 0) return 0;

    // Calculer les fees gagnés
    //const feesEarnedUSD = calculateFeesEarnedUSD(position, token0, token1);

    // Estimer le temps écoulé (depuis la création de la pool ou de la position)
    // Pour une estimation simple, on peut utiliser les fees 24h de la pool
    const poolFeesUSD24h = Number(position.pool.feesUSD24h || '0');
    //const poolTVL = Number(position.pool.totalValueLockedUSD || '1');

    // Proportion de la liquidité de cette position dans la pool
    const positionLiquidity = Number(position.liquidity);
    const poolLiquidity = Number(position.pool.liquidity);
    const liquidityShare = poolLiquidity > 0 ? positionLiquidity / poolLiquidity : 0;

    // Fees estimés par jour pour cette position
    const estimatedDailyFeesUSD = poolFeesUSD24h * liquidityShare;

    // APR = (fees journaliers * 365) / capital investi
    const apr = depositedUSD > 0 ? (estimatedDailyFeesUSD * 365) / depositedUSD * 100 : 0;

    return apr;
}

