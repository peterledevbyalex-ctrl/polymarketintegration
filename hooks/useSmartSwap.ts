/**
 * Smart Swap Hook
 * 
 * Uses the swap router service to intelligently route swaps:
 * 1. SelectiveTaxRouter - For taxable tokens
 * 2. UniversalRouter - For non-taxable tokens with pool liquidity
 * 3. LI.FI - Fallback for no pool/insufficient liquidity + cross-chain
 */

import { useState, useCallback, useEffect } from 'react';
import type { WalletClient, Address } from 'viem';

import * as swapRouterService from '@/lib/swap_router_service';
import type { SmartQuotationResult, SwapRouteDecision } from '@/lib/swap_router_service';

import type { Token, TransactionResult } from '@/types';


export interface UseSmartSwapReturn {
    // State
    quotation: SmartQuotationResult | null;
    routeDecision: SwapRouteDecision | null;
    isLoading: boolean;
    isSwapping: boolean;
    error: string | null;
    swapInfo: string;
    swapsCount: number;

    // Actions
    getQuotation: (amountIn: string, targetChainId?: number) => Promise<void>;
    executeSwap: (slippage: number, onStepChange?: (step: number) => void) => Promise<TransactionResult | null>;
    clearQuotation: () => void;
    clearError: () => void;
}


export function useSmartSwap(
    walletClient: WalletClient | undefined,
    tokenIn: Token | null,
    tokenOut: Token | null,
    userAddress: Address | undefined
): UseSmartSwapReturn {
    const [quotation, setQuotation] = useState<SmartQuotationResult | null>(null);
    const [routeDecision, setRouteDecision] = useState<SwapRouteDecision | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSwapping, setIsSwapping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [swapInfo, setSwapInfo] = useState('');
    const [swapsCount, setSwapsCount] = useState(0);


    /**
     * Get quotation using smart routing
     */
    const getQuotation = useCallback(async (amountIn: string, targetChainId?: number) => {
        if (!tokenIn || !tokenOut || !userAddress) {
            setError('Missing required parameters');
            return;
        }

        if (Number(amountIn) <= 0) {
            setQuotation(null);
            setRouteDecision(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        setSwapInfo('Finding best route...');

        try {
            // First, get the route decision
            const decision = await swapRouterService.getSwapRouteDecision(
                tokenIn,
                tokenOut,
                userAddress,
                targetChainId
            );

            setRouteDecision(decision);
            setSwapInfo(`Using ${formatRouterName(decision.router)}...`);

            // Then get the quotation
            const quote = await swapRouterService.getSmartQuotation(
                tokenIn,
                tokenOut,
                amountIn,
                userAddress,
                targetChainId
            );

            if (quote) {
                setQuotation(quote);
                setSwapInfo('');
            } else {
                setError('No route available for this swap');
                setSwapInfo('');
            }

        } catch (err: unknown) {
            //console.error('[useSmartSwap] Quotation error:', err);
            setError(err instanceof Error ? err.message : 'Failed to get quotation');
            setSwapInfo('');

        } finally {
            setIsLoading(false);
        }
    }, [tokenIn, tokenOut, userAddress]);


    /**
     * Execute swap using the determined route
     */
    const executeSwap = useCallback(async (
        slippage: number,
        onStepChange?: (step: number) => void
    ): Promise<TransactionResult | null> => {
        if (!walletClient || !tokenIn || !tokenOut || !quotation) {
            setError('Missing required parameters for swap');
            return null;
        }

        setIsSwapping(true);
        setError(null);
        setSwapInfo('Executing swap...');

        try {
            const result = await swapRouterService.executeSmartSwap({
                walletClient,
                tokenIn,
                tokenOut,
                quotation,
                slippage,
                onStepChange,
            });

            if (result.success) {
                setSwapsCount(prev => prev + 1);
                setSwapInfo('Swap successful!');
                setQuotation(null);
            } else {
                setError(result.error || 'Swap failed');
                setSwapInfo('');
            }

            return result;

        } catch (err: unknown) {
            //console.error('[useSmartSwap] Execution error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Swap execution failed';
            setError(errorMessage);
            setSwapInfo('');
            return { success: false, error: errorMessage };

        } finally {
            setIsSwapping(false);
        }
    }, [walletClient, tokenIn, tokenOut, quotation]);


    /**
     * Clear quotation state
     */
    const clearQuotation = useCallback(() => {
        setQuotation(null);
        setRouteDecision(null);
        setSwapInfo('');
    }, []);


    /**
     * Clear error state
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);


    // Clear quotation when tokens change
    useEffect(() => {
        clearQuotation();
    }, [tokenIn?.id, tokenOut?.id, clearQuotation]);


    return {
        quotation,
        routeDecision,
        isLoading,
        isSwapping,
        error,
        swapInfo,
        swapsCount,
        getQuotation,
        executeSwap,
        clearQuotation,
        clearError,
    };
}


// ==================== HELPER FUNCTIONS ====================

function formatRouterName(router: swapRouterService.SwapRouterType): string {
    switch (router) {
        case 'tax_router':
            return 'Tax Router';
        case 'universal_router':
            return 'Universal Router';
        case 'lifi':
            return 'LI.FI Aggregator';
        case 'direct':
            return 'Direct Swap';
        default:
            return 'Unknown Router';
    }
}


/**
 * Hook to check if a token is taxable
 */
export function useTokenTaxInfo(tokenAddress: Address | undefined) {
    const [taxInfo, setTaxInfo] = useState<{
        isTaxable: boolean;
        taxRate: number;
        vault: Address;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!tokenAddress) {
            setTaxInfo(null);
            return;
        }

        const fetchTaxInfo = async () => {
            setIsLoading(true);
            try {
                const info = await swapRouterService.getTokenTaxInfo(tokenAddress);
                setTaxInfo(info);
            } catch {
                setTaxInfo(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTaxInfo();
    }, [tokenAddress]);

    return { taxInfo, isLoading };
}
