/**
 * Cross-Chain Swap Hook
 * Handles cross-chain swaps via LI.FI
 */

import { useState, useCallback, useEffect } from 'react';
import type { WalletClient, Address } from 'viem';
import { parseUnits, formatUnits } from 'viem';

import * as apiLifi from '@/lib/api_lifi';
import type { LifiQuoteResult, LifiStep } from '@/lib/api_lifi';

import { CURRENT_CHAIN } from '@/config.app';
import { getChainById, getDestinationChains, type SupportedChain, CURRENT_CHAIN_CONFIG } from '@/config/supported_chains';
import type { Token, TransactionResult } from '@/types';


export interface CrossChainToken {
    address: Address;
    symbol: string;
    name: string;
    decimals: number;
    chainId: number;
    logoUri?: string;
    priceUSD?: string;
}

export interface UseCrossChainSwapReturn {
    // State
    sourceChain: SupportedChain;
    destinationChain: SupportedChain;
    receiverAddress: Address | null;
    quote: LifiQuoteResult | null;
    isLoading: boolean;
    isSwapping: boolean;
    error: string | null;
    swapInfo: string;
    executionSteps: LifiStep[];
    currentStep: number;

    // Actions
    setSourceChain: (chain: SupportedChain) => void;
    setDestinationChain: (chain: SupportedChain) => void;
    setReceiverAddress: (address: Address | null) => void;
    getQuote: (
        tokenIn: CrossChainToken,
        tokenOut: CrossChainToken,
        amountIn: string,
        receiverAddress?: Address
    ) => Promise<void>;
    executeSwap: () => Promise<TransactionResult | null>;
    clearQuote: () => void;
    clearError: () => void;
    swapChains: () => void;
}


export function useCrossChainSwap(
    walletClient: WalletClient | undefined,
    userAddress: Address | undefined
): UseCrossChainSwapReturn {
    // Chain state - default destination to first available chain (e.g., Ethereum)
    const [sourceChain, setSourceChain] = useState<SupportedChain>(CURRENT_CHAIN_CONFIG);
    const [destinationChain, setDestinationChain] = useState<SupportedChain>(
        getDestinationChains().filter(c => c.id !== CURRENT_CHAIN.id)[0] || CURRENT_CHAIN_CONFIG
    );

    // Quote state
    const [quote, setQuote] = useState<LifiQuoteResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [receiverAddress, setReceiverAddress] = useState<Address | null>(null);

    // Execution state
    const [isSwapping, setIsSwapping] = useState(false);
    const [swapInfo, setSwapInfo] = useState('');
    const [executionSteps, setExecutionSteps] = useState<LifiStep[]>([]);
    const [currentStep, setCurrentStep] = useState(0);

    // Token state for quote request
    const [lastTokenIn, setLastTokenIn] = useState<CrossChainToken | null>(null);
    const [lastTokenOut, setLastTokenOut] = useState<CrossChainToken | null>(null);
    const [lastAmountIn, setLastAmountIn] = useState<string>('');


    /**
     * Get quote for cross-chain swap
     */
    const getQuote = useCallback(async (
        tokenIn: CrossChainToken,
        tokenOut: CrossChainToken,
        amountIn: string,
        receiverAddressOverride?: Address
    ) => {
        if (!userAddress) {
            setError('Missing required parameters');
            return;
        }

        if (Number(amountIn) <= 0) {
            setQuote(null);
            return;
        }

        // Store for potential re-quote
        setLastTokenIn(tokenIn);
        setLastTokenOut(tokenOut);
        setLastAmountIn(amountIn);

        setIsLoading(true);
        setError(null);
        setSwapInfo('Finding best cross-chain route...');

        try {
            const amountInRaw = parseUnits(amountIn, tokenIn.decimals).toString();

            const effectiveReceiver = receiverAddressOverride ?? receiverAddress ?? userAddress;

            const lifiQuote = await apiLifi.getBestLifiRoute(
                sourceChain.id,
                destinationChain.id,
                { id: tokenIn.address, symbol: tokenIn.symbol, name: tokenIn.name, decimals: tokenIn.decimals },
                { id: tokenOut.address, symbol: tokenOut.symbol, name: tokenOut.name, decimals: tokenOut.decimals },
                amountInRaw,
                userAddress,
                effectiveReceiver
            );

            if (lifiQuote) {
                setQuote(lifiQuote);
                setExecutionSteps(lifiQuote.steps);
                setSwapInfo('');
            } else {
                setError('No route available for this cross-chain swap');
                setSwapInfo('');
            }

        } catch (err: unknown) {
            //console.error('[useCrossChainSwap] Quote error:', err);
            setError(err instanceof Error ? err.message : 'Failed to get quote');
            setSwapInfo('');

        } finally {
            setIsLoading(false);
        }
    }, [destinationChain, receiverAddress, sourceChain, userAddress]);


    /**
     * Execute cross-chain swap
     */
    const executeSwap = useCallback(async (): Promise<TransactionResult | null> => {
        if (!quote || !walletClient) {
            setError('No quote available');
            return null;
        }

        setIsSwapping(true);
        setError(null);
        setCurrentStep(0);

        try {
            setSwapInfo('Initiating cross-chain swap...');

            const result = await apiLifi.executeLifiRoute(
                quote.route,
                (updatedRoute) => {
                    // Track progress through steps
                    const completedSteps = updatedRoute.steps.filter(
                        step => step.execution?.status === 'DONE'
                    ).length;
                    setCurrentStep(completedSteps);

                    // Update swap info based on current step
                    const currentStepData = updatedRoute.steps[completedSteps];
                    if (currentStepData) {
                        setSwapInfo(`${currentStepData.type}: ${currentStepData.tool}...`);
                    }
                }
            );

            if (result.success) {
                setSwapInfo('Cross-chain swap completed!');
                setQuote(null);
                return {
                    success: true,
                    transactionHash: result.transactionHash as `0x${string}`,
                };
            } else {
                setError(result.error || 'Swap failed');
                setSwapInfo('');
                return { success: false, error: result.error };
            }

        } catch (err: unknown) {
            //console.error('[useCrossChainSwap] Execution error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Swap execution failed';
            setError(errorMessage);
            setSwapInfo('');
            return { success: false, error: errorMessage };

        } finally {
            setIsSwapping(false);
        }
    }, [quote, walletClient]);


    /**
     * Swap source and destination chains
     */
    const swapChains = useCallback(() => {
        const temp = sourceChain;
        setSourceChain(destinationChain);
        setDestinationChain(temp);
        setQuote(null);
    }, [sourceChain, destinationChain]);


    /**
     * Clear quote
     */
    const clearQuote = useCallback(() => {
        setQuote(null);
        setExecutionSteps([]);
        setCurrentStep(0);
        setSwapInfo('');
    }, []);


    /**
     * Clear error
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);


    // Clear quote when chains change
    useEffect(() => {
        clearQuote();
    }, [sourceChain.id, destinationChain.id, clearQuote]);


    return {
        sourceChain,
        destinationChain,
        receiverAddress,
        quote,
        isLoading,
        isSwapping,
        error,
        swapInfo,
        executionSteps,
        currentStep,
        setSourceChain,
        setDestinationChain,
        setReceiverAddress,
        getQuote,
        executeSwap,
        clearQuote,
        clearError,
        swapChains,
    };
}


export default useCrossChainSwap;
