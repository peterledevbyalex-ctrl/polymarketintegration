/**
 * LI.FI SDK Integration
 * Handles cross-chain swaps and fallback routing when no local pool exists
 */

import {
    createConfig,
    getRoutes,
    getQuote,
    getTokens,
    getChains,
    executeRoute,
    convertQuoteToRoute,
    ChainId,
    EVM,
    type Route,
    type RoutesRequest,
    type QuoteRequest,
    type RouteExtended,
    type ExtendedChain,
    type Token as LifiToken,
} from '@lifi/sdk';
import type { WalletClient, Address } from 'viem';
import { getWalletClient, switchChain } from '@wagmi/core';
import { wagmiConfig } from '@/providers/WalletProvider';

import { CURRENT_CHAIN, LIFI_INTEGRATOR, RPC_URL } from '@/config.app';
import type { Token } from '@/types';
import { SupportedChain } from '@/config/supported_chains';


// ==================== CONFIGURATION ====================

let isConfigured = false;

/**
 * Initialize LI.FI SDK configuration
 * Should be called once at app startup
 */
export function initLifiConfig(): void {
    if (isConfigured) return;

    createConfig({
        integrator: LIFI_INTEGRATOR,
        rpcUrls: {
            [CURRENT_CHAIN.id]: [RPC_URL],
        },
        providers: [
            EVM({
                getWalletClient: () => getWalletClient(wagmiConfig) as any,
                switchChain: (async (chainId: number) => {
                    const chain = await switchChain(wagmiConfig, { chainId });
                    return getWalletClient(wagmiConfig, { chainId: chain.id });
                }) as any,
            }),
        ],
    });

    isConfigured = true;
}


// ==================== TYPES ====================

export interface LifiQuoteResult {
    route: Route;
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    estimatedGas: string;
    executionDuration: number;
    isCrossChain: boolean;
    steps: LifiStep[];
}

export interface LifiStep {
    type: 'swap' | 'bridge' | 'cross';
    tool: string;
    fromToken: { symbol: string; address: Address };
    toToken: { symbol: string; address: Address };
    fromAmount: string;
    toAmount: string;
}

export interface LifiExecutionResult {
    success: boolean;
    transactionHash?: string;
    error?: string;
    route?: RouteExtended;
}


// ==================== QUOTE FUNCTIONS ====================

/**
 * Get a quote for a same-chain swap via LI.FI
 */
export async function getLifiQuote(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    userAddress: Address
): Promise<LifiQuoteResult | null> {
    initLifiConfig();

    try {
        const quoteRequest: QuoteRequest = {
            fromChain: CURRENT_CHAIN.id,
            toChain: CURRENT_CHAIN.id,
            fromToken: tokenIn.id,
            toToken: tokenOut.id,
            fromAmount: amountIn,
            fromAddress: userAddress,
        };

        const quote = await getQuote(quoteRequest);

        if (!quote) return null;

        const route = convertQuoteToRoute(quote);

        return formatLifiQuoteResult(route, false);

    } catch (error: unknown) {
        //console.error('[LI.FI] Quote error:', error);
        return null;
    }
}


/**
 * Get routes for a cross-chain swap via LI.FI
 */
export async function getLifiCrossChainRoutes(
    fromChainId: number,
    toChainId: number,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    userAddress: Address,
    toAddress?: Address
): Promise<LifiQuoteResult[]> {
    initLifiConfig();

    try {
        const routesRequest: RoutesRequest = {
            fromChainId,
            toChainId,
            fromTokenAddress: tokenIn.id,
            toTokenAddress: tokenOut.id,
            fromAmount: amountIn,
            fromAddress: userAddress,
            ...(toAddress ? { toAddress } : {}),
        };

        const result = await getRoutes(routesRequest);

        if (!result.routes || result.routes.length === 0) {
            return [];
        }

        return result.routes.map(route => formatLifiQuoteResult(route, true));

    } catch (error: unknown) {
        //console.error('[LI.FI] Cross-chain routes error:', error);
        return [];
    }
}


/**
 * Get the best route for a swap (same-chain or cross-chain)
 */
export async function getBestLifiRoute(
    fromChainId: number,
    toChainId: number,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    userAddress: Address,
    toAddress?: Address
): Promise<LifiQuoteResult | null> {
    initLifiConfig();

    try {
        const isCrossChain = fromChainId !== toChainId;

        const routesRequest: RoutesRequest = {
            fromChainId,
            toChainId,
            fromTokenAddress: tokenIn.id,
            toTokenAddress: tokenOut.id,
            fromAmount: amountIn,
            fromAddress: userAddress,
            ...(toAddress ? { toAddress } : {}),
        };

        const result = await getRoutes(routesRequest);

        if (!result.routes || result.routes.length === 0) {
            return null;
        }

        // Return the best route (first one is usually the best)
        return formatLifiQuoteResult(result.routes[0], isCrossChain);

    } catch (error: unknown) {
        //console.error('[LI.FI] Best route error:', error);
        return null;
    }
}


// ==================== EXECUTION FUNCTIONS ====================

/**
 * Execute a LI.FI route
 */
export async function executeLifiRoute(
    route: Route,
    onUpdateRoute?: (updatedRoute: RouteExtended) => void
): Promise<LifiExecutionResult> {
    initLifiConfig();

    try {
        const executedRoute = await executeRoute(route, {
            updateRouteHook: onUpdateRoute,
        });

        // Extract transaction hash from the executed route
        const txHash = extractTransactionHash(executedRoute);

        return {
            success: true,
            transactionHash: txHash,
            route: executedRoute,
        };

    } catch (error: unknown) {
        //console.error('[LI.FI] Execution error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}


// ==================== HELPER FUNCTIONS ====================

function formatLifiQuoteResult(route: Route, isCrossChain: boolean): LifiQuoteResult {
    const steps: LifiStep[] = route.steps.map(step => ({
        type: step.type as 'swap' | 'bridge' | 'cross',
        tool: step.tool,
        fromToken: {
            symbol: step.action.fromToken.symbol,
            address: step.action.fromToken.address as Address,
        },
        toToken: {
            symbol: step.action.toToken.symbol,
            address: step.action.toToken.address as Address,
        },
        fromAmount: step.action.fromAmount,
        toAmount: step.estimate.toAmount,
    }));

    // Calculate total gas estimate
    const totalGas = route.steps.reduce((acc, step) => {
        const gasCost = step.estimate.gasCosts?.[0]?.amount || '0';
        return acc + BigInt(gasCost);
    }, 0n);

    // Calculate total execution duration
    const totalDuration = route.steps.reduce((acc, step) => {
        return acc + (step.estimate.executionDuration || 0);
    }, 0);

    return {
        route,
        fromAmount: route.fromAmount,
        toAmount: route.toAmount,
        toAmountMin: route.toAmountMin,
        estimatedGas: totalGas.toString(),
        executionDuration: totalDuration,
        isCrossChain,
        steps,
    };
}


function extractTransactionHash(route: RouteExtended): string | undefined {
    // Look through steps to find transaction hashes
    for (const step of route.steps) {
        if (step.execution?.process) {
            for (const process of step.execution.process) {
                if (process.txHash) {
                    return process.txHash;
                }
            }
        }
    }
    return undefined;
}


/**
 * Check if LI.FI supports a specific chain
 */
export async function isChainSupported(chainId: number): Promise<boolean> {
    initLifiConfig();

    try {
        // LI.FI SDK provides chain info through config
        // For now, we assume common EVM chains are supported
        const supportedChains = [
            1,      // Ethereum
            10,     // Optimism
            56,     // BSC
            137,    // Polygon
            250,    // Fantom
            42161,  // Arbitrum
            43114,  // Avalanche
            8453,   // Base
            // Add more as needed
        ];

        return supportedChains.includes(chainId);

    } catch {
        return false;
    }
}


/**
 * Check if current chain (MegaETH) is supported by LI.FI
 * MegaETH is a new chain, so it may not be supported yet
 */
export function isCurrentChainSupportedByLifi(): boolean {
    // MegaETH testnet (6343) is likely not supported by LI.FI yet
    // This function should be updated when LI.FI adds support
    const lifiSupportedChains = [1, 10, 56, 137, 250, 42161, 43114, 8453];
    return lifiSupportedChains.includes(CURRENT_CHAIN.id);
}


// ==================== TOKEN FETCHING ====================

export interface LifiTokenInfo {
    address: Address;
    symbol: string;
    name: string;
    decimals: number;
    chainId: number;
    logoURI?: string;
    priceUSD?: string;
}

let cachedTokens: Record<number, LifiTokenInfo[]> = {};
let cachedChains: SupportedChain[] | null = null;

/**
 * Fetch all available tokens on a chain from LI.FI
 */
export async function getLifiTokens(chainId: number): Promise<LifiTokenInfo[]> {
    initLifiConfig();

    // Return cached if available
    if (cachedTokens[chainId]) {
        return cachedTokens[chainId];
    }

    try {
        const result = await getTokens({ chains: [chainId] });

        if (!result.tokens || !result.tokens[chainId]) {
            return [];
        }

        const tokens: LifiTokenInfo[] = result.tokens[chainId].map((token: LifiToken) => ({
            address: token.address as Address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            chainId: token.chainId,
            logoURI: token.logoURI,
            priceUSD: token.priceUSD,
        }));

        // Cache the result
        cachedTokens[chainId] = tokens;

        return tokens;

    } catch (error: unknown) {
        //console.error('[LI.FI] Token fetch error:', error);
        return [];
    }
}

export async function getLifiChains(): Promise<SupportedChain[]> {
    initLifiConfig();

    // Return cached if available
    if (cachedChains) {
        return cachedChains;
    }

    try {
        const result = await getChains({  });

        if (!result) {
            return [];
        }

        const chains: SupportedChain[] = result.map((chain: ExtendedChain) => ({
            id: chain.id,
            name: chain.name,
            shortName: chain.name,
            nativeCurrency: {
                name: chain.nativeToken.name,
                symbol: chain.nativeToken.symbol,
                decimals: chain.nativeToken.decimals,
            },
            logoUri: chain.logoURI,
            explorerUrl: '', //chain.explorerUrl,
            rpcUrl: '', //chain.rpcUrl,
            isTestnet: false, //chain.isTestnet,
        }));

        // Cache the result
        cachedChains = chains;

        return chains;

    } catch (error: unknown) {
        //console.error('[LI.FI] Chains fetch error:', error);
        return [];
    }
}


/**
 * Search tokens by symbol or name
 */
export function searchLifiTokens(
    tokens: LifiTokenInfo[],
    query: string
): LifiTokenInfo[] {
    if (!query) return tokens;

    const lowerQuery = query.toLowerCase();
    return tokens.filter(token =>
        token.symbol.toLowerCase().includes(lowerQuery) ||
        token.name.toLowerCase().includes(lowerQuery) ||
        token.address.toLowerCase() === lowerQuery
    );
}


/**
 * Convert LI.FI token to app Token format
 */
export function lifiTokenToAppToken(lifiToken: LifiTokenInfo): Token {
    return {
        id: lifiToken.address,
        symbol: lifiToken.symbol,
        name: lifiToken.name,
        decimals: lifiToken.decimals,
        logoURI: lifiToken.logoURI,
        // Mark as LI.FI sourced for routing decisions
        isLifiToken: true,
    } as Token & { isLifiToken: boolean };
}


/**
 * Clear token cache (useful for refreshing)
 */
export function clearLifiTokenCache(): void {
    cachedTokens = {};
}
