/**
 * TEMPORARY SOLUTION - Token logos from Fasterz launchpad API
 * 
 * This hook fetches token data from the launchpad API and provides
 * a lookup function for token logos by address.
 */

"use client"

import { useState, useEffect, useCallback } from 'react';
import { Address } from 'viem';

const LAUNCHPAD_API_URL = 'https://www.fasterz.fun/api/tokens';

interface LaunchpadToken {
    wrapperAddress: string;
    name: string;
    symbol: string;
    logoUrl: string;
}

interface LaunchpadTokensResponse {
    success: boolean;
    tokens: LaunchpadToken[];
}

interface UseLaunchpadTokensResult {
    logoMap: Map<string, string>;
    getTokenLogo: (address: string) => string | undefined;
    isLoading: boolean;
    error: string | null;
}

export function useLaunchpadTokens(): UseLaunchpadTokensResult {
    const [logoMap, setLogoMap] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        async function fetchTokens() {
            try {
                const response = await fetch(LAUNCHPAD_API_URL);
                if (!response.ok) {
                    throw new Error(`Failed to fetch tokens: ${response.status}`);
                }

                const data: LaunchpadTokensResponse = await response.json();

                if (!data.success || !data.tokens) {
                    throw new Error('Invalid API response');
                }

                const map = new Map<string, string>();
                for (const token of data.tokens) {
                    if (token.wrapperAddress && token.logoUrl) {
                        map.set(token.wrapperAddress.toLowerCase(), token.logoUrl);
                    }
                }

                if (isMounted) {
                    setLogoMap(map);
                    setIsLoading(false);
                }

            } catch (err) {
                //console.error('[useLaunchpadTokens] Error fetching tokens:', err);
                if (isMounted) {
                    setError(err instanceof Error ? err.message : 'Unknown error');
                    setIsLoading(false);
                }
            }
        }

        fetchTokens();

        return () => {
            isMounted = false;
        };
    }, []);

    const getTokenLogo = useCallback((address: string): string | undefined => {
        return logoMap.get(address.toLowerCase());
    }, [logoMap]);

    return {
        logoMap,
        getTokenLogo,
        isLoading,
        error,
    };
}
