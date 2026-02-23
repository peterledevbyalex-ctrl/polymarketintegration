/**
 * Hook to fetch and manage LI.FI aggregator tokens
 */

import { useState, useEffect, useCallback } from 'react';

import * as apiLifi from '@/lib/api_lifi';
import type { LifiTokenInfo } from '@/lib/api_lifi';
import { CURRENT_CHAIN } from '@/config.app';
import type { Token } from '@/types';


export interface UseLifiTokensReturn {
    lifiTokens: Token[];
    isLoading: boolean;
    error: string | null;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filteredTokens: Token[];
    refreshTokens: () => Promise<void>;
}


export function useLifiTokens(chainId?: number, enabled: boolean = true): UseLifiTokensReturn {
    const targetChainId = chainId ?? CURRENT_CHAIN.id;

    const [lifiTokens, setLifiTokens] = useState<Token[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');


    /**
     * Fetch tokens from LI.FI
     */
    const fetchTokens = useCallback(async () => {
        if (!enabled) {
            setLifiTokens([]);
            return;
        }

        // Check if chain is supported
        if (!apiLifi.isCurrentChainSupportedByLifi() && targetChainId === CURRENT_CHAIN.id) {
            // For unsupported chains, return empty
            setLifiTokens([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const tokens = await apiLifi.getLifiTokens(targetChainId);

            // Convert to app Token format
            const appTokens: Token[] = tokens.map(t => ({
                id: t.address,
                symbol: t.symbol,
                name: t.name,
                decimals: t.decimals,
                logoURI: t.logoURI,
                priceUSD: t.priceUSD,
                isLifiToken: true,
            } as Token & { isLifiToken: boolean }));

            setLifiTokens(appTokens);

        } catch (err: unknown) {
            //console.error('[useLifiTokens] Error:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch tokens');

        } finally {
            setIsLoading(false);
        }
    }, [enabled, targetChainId]);


    /**
     * Refresh tokens (clear cache and refetch)
     */
    const refreshTokens = useCallback(async () => {
        apiLifi.clearLifiTokenCache();
        await fetchTokens();
    }, [fetchTokens]);


    /**
     * Filter tokens by search query
     */
    const filteredTokens = searchQuery
        ? lifiTokens.filter(token =>
            token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            token.id.toLowerCase() === searchQuery.toLowerCase()
        )
        : lifiTokens;


    // Fetch tokens on mount
    useEffect(() => {
        if (!enabled) {
            setLifiTokens([]);
            setIsLoading(false);
            setError(null);
            return;
        }

        fetchTokens();
    }, [enabled, fetchTokens]);


    return {
        lifiTokens,
        isLoading,
        error,
        searchQuery,
        setSearchQuery,
        filteredTokens,
        refreshTokens,
    };
}


export default useLifiTokens;
