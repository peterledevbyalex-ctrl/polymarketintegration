/**
 * Swap Router Service
 * 
 * Orchestrates swap routing with the following priority:
 * 1. SelectiveTaxRouter - For taxable tokens (enforces tax collection)
 * 2. UniversalRouter - For non-taxable tokens with sufficient pool liquidity
 * 3. LI.FI - Fallback for no pool/insufficient liquidity + cross-chain swaps
 */

import { Address, formatUnits, parseUnits, TransactionReceipt, WalletClient } from 'viem';

import * as apiBlockchainSwapsTax from './api_blockchain_swaps_tax';
import * as apiBlockchainSwapsUniversal from './api_blockchain_swaps_universal';
import * as apiBlockchainSwaps from './api_blockchain_swaps';
import * as apiLifi from './api_lifi';
import * as apiBackend from './api_backend';

import { CURRENT_CHAIN, ETH_ADDRESS, WETH_ADDRESS } from '@/config.app';
import { getErrorMessage } from '@/lib/ui_utils';
import { applySlippageToAmount, clampSlippagePercent } from '@/lib/uniswap_utils';

import type {
    Token,
    TokenSwapQuotationResult,
    SwapSingleParams,
    TransactionResult,
    QuotePath,
} from '@/types';
import { isTokenETH } from './tokens_utils';


// ==================== TYPES ====================

export type SwapRouterType = 'tax_router' | 'universal_router' | 'lifi' | 'direct';

export interface SwapRouteDecision {
    router: SwapRouterType;
    reason: string;
    isTaxable: boolean;
    taxRate?: number;
    hasPool: boolean;
    isCrossChain: boolean;
}

export interface SmartQuotationResult extends TokenSwapQuotationResult {
    routeDecision: SwapRouteDecision;
    lifiRoute?: apiLifi.LifiQuoteResult;
}

export interface SwapExecutionParams {
    walletClient: WalletClient;
    tokenIn: Token;
    tokenOut: Token;
    quotation: SmartQuotationResult;
    slippage: number;
    onStepChange?: (step: number) => void;
}


// ==================== ROUTING DECISION ====================

/**
 * Determine which router to use for a swap
 */
export async function getSwapRouteDecision(
    tokenIn: Token,
    tokenOut: Token,
    userAddress: Address,
    targetChainId?: number
): Promise<SwapRouteDecision> {
    const isCrossChain = targetChainId !== undefined && targetChainId !== CURRENT_CHAIN.id;

    // Cross-chain swaps always use LI.FI
    if (isCrossChain) {
        return {
            router: 'lifi',
            reason: 'Cross-chain swap',
            isTaxable: false,
            hasPool: false,
            isCrossChain: true,
        };
    }

    // Check if tax router is enabled and either token is taxable (V2 supports both directions)
    const taxRouterEnabled = apiBlockchainSwapsTax.isTaxRouterEnabled();

    if (taxRouterEnabled) {
        // Get actual token addresses (convert ETH to WETH for tax check)
        const tokenInAddress = isTokenETH(tokenIn.id)
            ? WETH_ADDRESS
            : tokenIn.id;

        const tokenOutAddress = isTokenETH(tokenOut.id)
            ? WETH_ADDRESS
            : tokenOut.id;

        try {
            // V2: Check both input and output tokens for taxability
            const [taxConfigIn, taxConfigOut] = await Promise.all([
                apiBlockchainSwapsTax.getTokenTaxConfig(tokenInAddress),
                apiBlockchainSwapsTax.getTokenTaxConfig(tokenOutAddress),
            ]);

            //console.log('[SwapRouter] Tax config - In:', tokenIn.symbol, taxConfigIn);
            //console.log('[SwapRouter] Tax config - Out:', tokenOut.symbol, taxConfigOut);

            const isInputTaxable = taxConfigIn.isTaxable;
            const isOutputTaxable = taxConfigOut.isTaxable;

            if (isInputTaxable || isOutputTaxable) {
                // Check if user is tax exempt
                const isExempt = await apiBlockchainSwapsTax.isTaxExempt(userAddress);
                //console.log('[SwapRouter] User exempt:', isExempt);

                if (!isExempt) {
                    const taxRate = isInputTaxable
                        ? Number(taxConfigIn.taxRate) / 100
                        : Number(taxConfigOut.taxRate) / 100;
                    const taxableToken = isInputTaxable ? tokenIn.symbol : tokenOut.symbol;
                    const direction = isInputTaxable ? 'sell' : 'buy';

                    return {
                        router: 'tax_router',
                        reason: `${taxableToken} is taxable (${taxRate}% tax on ${direction})`,
                        isTaxable: true,
                        taxRate,
                        hasPool: true, // Tax router uses our pools
                        isCrossChain: false,
                    };
                }
            }
        } catch (error) {
            //console.warn('[SwapRouter] Error checking tax config:', error);
        }
    }

    // Check if we have a pool for this pair
    const hasPool = await checkPoolExists(tokenIn, tokenOut);

    if (hasPool) {
        return {
            router: 'universal_router',
            reason: 'Pool available, using UniversalRouter',
            isTaxable: false,
            hasPool: true,
            isCrossChain: false,
        };
    }

    // No pool - check if LI.FI supports current chain
    if (apiLifi.isCurrentChainSupportedByLifi()) {
        return {
            router: 'lifi',
            reason: 'No pool available, using LI.FI aggregator',
            isTaxable: false,
            hasPool: false,
            isCrossChain: false,
        };
    }

    // Fallback - try to find multi-hop route
    const hasMultiHopRoute = await checkMultiHopRouteExists(tokenIn, tokenOut);

    if (hasMultiHopRoute) {
        return {
            router: 'universal_router',
            reason: 'Multi-hop route available',
            isTaxable: false,
            hasPool: true,
            isCrossChain: false,
        };
    }

    // No route available
    return {
        router: 'lifi',
        reason: 'No local route, attempting LI.FI',
        isTaxable: false,
        hasPool: false,
        isCrossChain: false,
    };
}


// ==================== QUOTATION ====================

/**
 * Get smart quotation using the appropriate router
 */
export async function getSmartQuotation(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    userAddress: Address,
    targetChainId?: number
): Promise<SmartQuotationResult | null> {
    const routeDecision = await getSwapRouteDecision(
        tokenIn,
        tokenOut,
        userAddress,
        targetChainId
    );

    //console.log('[SwapRouter] Route decision:', routeDecision);

    switch (routeDecision.router) {
        case 'tax_router':
            return await getTaxRouterQuotation(tokenIn, tokenOut, amountIn, userAddress, routeDecision);

        case 'universal_router':
            return await getUniversalRouterQuotation(tokenIn, tokenOut, amountIn, routeDecision);

        case 'lifi':
            return await getLifiQuotation(
                tokenIn,
                tokenOut,
                amountIn,
                userAddress,
                routeDecision,
                targetChainId
            );

        default:
            return null;
    }
}


async function getTaxRouterQuotation(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    userAddress: Address,
    routeDecision: SwapRouteDecision
): Promise<SmartQuotationResult | null> {
    // For tax router, we need to calculate the effective amount after tax
    const amountInBN = parseUnits(amountIn, tokenIn.decimals);

    const tokenInAddress = isTokenETH(tokenIn.id)
        ? WETH_ADDRESS
        : tokenIn.id;

    const tokenOutAddress = isTokenETH(tokenOut.id)
        ? WETH_ADDRESS
        : tokenOut.id;

    // V2: calculateTax now takes both tokenIn and tokenOut
    const taxInfo = await apiBlockchainSwapsTax.calculateTax(
        tokenInAddress,
        tokenOutAddress,
        userAddress,
        amountInBN
    );

    // Get quote for the swap amount (after tax deduction)
    // We still use our quoter but adjust for tax
    const pools = await apiBackend.getSwapPoolsSingle(
        isTokenETH(tokenIn.id) ? WETH_ADDRESS : tokenIn.id,
        isTokenETH(tokenOut.id) ? WETH_ADDRESS : tokenOut.id
    );

    if (pools.length === 0) {
        //console.warn('[SwapRouter] No pool found for tax router swap');
        return null;
    }

    // Import quotation functions
    const { fetchPriceExactInputSingle } = await import('@/hooks/useQuotation');

    const swapAmountFormatted = formatUnits(taxInfo.swapAmount, tokenIn.decimals);
    const baseQuote = await fetchPriceExactInputSingle(tokenIn, tokenOut, pools, swapAmountFormatted);

    if (!baseQuote) return null;

    return {
        ...baseQuote,
        // Adjust amounts to reflect tax
        amountIn,
        amountInRaw: amountInBN.toString(),
        routeDecision,
    };
}


async function getUniversalRouterQuotation(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    routeDecision: SwapRouteDecision
): Promise<SmartQuotationResult | null> {
    // Use existing quotation logic
    const pools = await apiBackend.getSwapPoolsSingle(
        isTokenETH(tokenIn.id) ? WETH_ADDRESS : tokenIn.id,
        isTokenETH(tokenOut.id) ? WETH_ADDRESS : tokenOut.id
    );

    if (pools.length === 0) {
        // Try multi-hop
        const multiHopPaths = await apiBackend.getSwapPoolsMultiple(
            isTokenETH(tokenIn.id) ? WETH_ADDRESS : tokenIn.id,
            isTokenETH(tokenOut.id) ? WETH_ADDRESS : tokenOut.id
        );

        if (multiHopPaths.length === 0) {
            return null;
        }

        const { fetchPriceExactInputMultiple } = await import('@/hooks/useQuotation');
        const quote = await fetchPriceExactInputMultiple(tokenIn, tokenOut, multiHopPaths, amountIn);

        if (!quote) return null;

        return {
            ...quote,
            routeDecision,
        };
    }

    const { fetchPriceExactInputSingle } = await import('@/hooks/useQuotation');
    const quote = await fetchPriceExactInputSingle(tokenIn, tokenOut, pools, amountIn);

    if (!quote) return null;

    return {
        ...quote,
        routeDecision,
    };
}


async function getLifiQuotation(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    userAddress: Address,
    routeDecision: SwapRouteDecision,
    targetChainId?: number
): Promise<SmartQuotationResult | null> {
    const amountInRaw = parseUnits(amountIn, tokenIn.decimals).toString();

    const lifiQuote = routeDecision.isCrossChain
        ? await apiLifi.getBestLifiRoute(
            CURRENT_CHAIN.id,
            targetChainId!,
            tokenIn,
            tokenOut,
            amountInRaw,
            userAddress
        )
        : await apiLifi.getLifiQuote(tokenIn, tokenOut, amountInRaw, userAddress);

    //console.log('[getLifiQuotation] lifiQuote:', lifiQuote)

    if (!lifiQuote) return null;

    const amountOut = formatUnits(BigInt(lifiQuote.toAmount), tokenOut.decimals);
    const amountOutMin = formatUnits(BigInt(lifiQuote.toAmountMin), tokenOut.decimals);

    return {
        type: 'ExactInput',
        tokenIn: tokenIn.id,
        tokenOut: tokenOut.id,
        amountIn,
        amountInRaw,
        amountOut,
        amountOutRaw: lifiQuote.toAmount,
        pricePerToken: (Number(amountIn) / Number(amountOut)).toString(),
        priceImpact: 0, // LI.FI doesn't provide this directly
        gasEstimate: lifiQuote.estimatedGas,
        path: [], // LI.FI uses its own path format
        routeDecision,
        lifiRoute: lifiQuote,
    };
}


// ==================== EXECUTION ====================

/**
 * Execute swap using the appropriate router
 */
export async function executeSmartSwap(params: SwapExecutionParams): Promise<TransactionResult> {
    const { walletClient, tokenIn, tokenOut, quotation, slippage, onStepChange } = params;

    const router = quotation.routeDecision.router;

    //console.log(`[SwapRouter] Executing swap via ${router}`);

    switch (router) {
        case 'tax_router':
            return await executeTaxRouterSwap(walletClient, tokenIn, tokenOut, quotation, slippage, onStepChange);

        case 'universal_router':
            return await executeUniversalRouterSwap(walletClient, tokenIn, tokenOut, quotation, slippage, onStepChange);

        case 'lifi':
            return await executeLifiSwap(quotation, onStepChange);

        default:
            return { success: false, error: 'Unknown router type' };
    }
}


async function executeTaxRouterSwap(
    walletClient: WalletClient,
    tokenIn: Token,
    tokenOut: Token,
    quotation: SmartQuotationResult,
    slippage: number,
    onStepChange?: (step: number) => void
): Promise<TransactionResult> {
    try {
        const userAddresses = await walletClient.getAddresses();
        const userAddress = userAddresses[0];

        const amountIn = parseUnits(quotation.amountIn, tokenIn.decimals);
        const amountOut = parseUnits(quotation.amountOut, tokenOut.decimals);
        const slippageSafe = clampSlippagePercent(slippage, 0.05, 50);
        const amountOutMinimum = applySlippageToAmount(amountOut, slippageSafe);

        // Step 1: Approve token for TaxRouter
        onStepChange?.(1);

        const tokenInAddress = isTokenETH(tokenIn.id)
            ? WETH_ADDRESS
            : tokenIn.id;

        await apiBlockchainSwapsTax.approveTokenForTaxRouter(walletClient, tokenInAddress, amountIn);

        // Step 2: Execute swap
        onStepChange?.(2);

        const swapParams: SwapSingleParams = {
            tokenIn: tokenInAddress,
            tokenOut: isTokenETH(tokenOut.id) ? WETH_ADDRESS : tokenOut.id,
            fee: BigInt(quotation.path[0]?.feeTier || '3000'),
            recipient: userAddress,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96: 0n,
        };

        const receipt = await apiBlockchainSwapsTax.swapExactInputSingle(walletClient, swapParams);

        return {
            success: receipt.status === 'success',
            transactionHash: receipt.transactionHash,
        };

    } catch (error: unknown) {
        //console.error('[SwapRouter] Tax router swap error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}


async function executeUniversalRouterSwap(
    walletClient: WalletClient,
    tokenIn: Token,
    tokenOut: Token,
    quotation: SmartQuotationResult,
    slippage: number,
    onStepChange?: (step: number) => void
): Promise<TransactionResult> {
    // Delegate to existing universal router implementation
    // This is a simplified version - the full implementation is in useSwap.ts

    try {
        const userAddresses = await walletClient.getAddresses();
        const userAddress = userAddresses[0];

        const amountIn = parseUnits(quotation.amountIn, tokenIn.decimals);
        const amountOut = parseUnits(quotation.amountOut, tokenOut.decimals);
        const slippageSafe = clampSlippagePercent(slippage, 0.05, 50);
        const amountOutMinimum = applySlippageToAmount(amountOut, slippageSafe);

        const swapParams: SwapSingleParams = {
            tokenIn: isTokenETH(tokenIn.id) ? WETH_ADDRESS : tokenIn.id,
            tokenOut: isTokenETH(tokenOut.id) ? WETH_ADDRESS : tokenOut.id,
            fee: BigInt(quotation.path[0]?.feeTier || '3000'),
            recipient: userAddress,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96: 0n,
        };

        let receipt: TransactionReceipt;

        if (isTokenETH(tokenIn.id)) {
            // ETH -> Token
            onStepChange?.(1);
            receipt = await apiBlockchainSwapsUniversal.swapTokensFromETH_UniversalRouter(walletClient, swapParams);

        } else if (isTokenETH(tokenOut.id)) {
            // Token -> ETH
            onStepChange?.(1);
            receipt = await apiBlockchainSwapsUniversal.swapTokensToETH_UniversalRouter(walletClient, swapParams);

        } else {
            // Token -> Token
            onStepChange?.(1);
            receipt = await apiBlockchainSwapsUniversal.swapTokensToTokens_UniversalRouter(walletClient, swapParams);
        }

        return {
            success: receipt.status === 'success',
            transactionHash: receipt.transactionHash,
        };

    } catch (error: unknown) {
        //console.error('[SwapRouter] Universal router swap error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}


async function executeLifiSwap(
    quotation: SmartQuotationResult,
    onStepChange?: (step: number) => void
): Promise<TransactionResult> {
    if (!quotation.lifiRoute) {
        return { success: false, error: 'No LI.FI route available' };
    }

    onStepChange?.(1);

    const result = await apiLifi.executeLifiRoute(
        quotation.lifiRoute.route,
        (updatedRoute) => {
            //console.log('[LI.FI] Route updated:', updatedRoute);
        }
    );

    return {
        success: result.success,
        transactionHash: result.transactionHash as `0x${string}` | undefined,
        error: result.error,
    };
}


// ==================== HELPER FUNCTIONS ====================

async function checkPoolExists(tokenIn: Token, tokenOut: Token): Promise<boolean> {
    try {
        const pools = await apiBackend.getSwapPoolsSingle(
            isTokenETH(tokenIn.id) ? WETH_ADDRESS : tokenIn.id,
            isTokenETH(tokenOut.id) ? WETH_ADDRESS : tokenOut.id
        );
        return pools.length > 0;
    } catch {
        return false;
    }
}


async function checkMultiHopRouteExists(tokenIn: Token, tokenOut: Token): Promise<boolean> {
    try {
        const paths = await apiBackend.getSwapPoolsMultiple(
            isTokenETH(tokenIn.id) ? WETH_ADDRESS : tokenIn.id,
            isTokenETH(tokenOut.id) ? WETH_ADDRESS : tokenOut.id
        );
        return paths.length > 0;
    } catch {
        return false;
    }
}


/**
 * Check if a token is taxable
 */
export async function isTokenTaxable(tokenAddress: Address): Promise<boolean> {
    if (!apiBlockchainSwapsTax.isTaxRouterEnabled()) {
        return false;
    }

    try {
        const config = await apiBlockchainSwapsTax.getTokenTaxConfig(tokenAddress);
        return config.isTaxable;
    } catch {
        return false;
    }
}


/**
 * Get tax info for a token
 */
export async function getTokenTaxInfo(tokenAddress: Address): Promise<{
    isTaxable: boolean;
    taxRate: number;
    vault: Address;
} | null> {
    if (!apiBlockchainSwapsTax.isTaxRouterEnabled()) {
        return null;
    }

    try {
        const config = await apiBlockchainSwapsTax.getTokenTaxConfig(tokenAddress);
        return {
            isTaxable: config.isTaxable,
            taxRate: Number(config.taxRate) / 100,
            vault: config.vault,
        };
    } catch {
        return null;
    }
}
