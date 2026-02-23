/**
 * TEMPORARY SOLUTION - Token logos from Fasterz launchpad API
 * 
 */

"use client"

import { useSessionStorageCache } from '@/hooks/useBrowserCache';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

const LAUNCHPAD_API_URL = '/api/launchpad-tokens';

interface LaunchpadToken {
    id: string;
    name: string;
    symbol: string;
    image_url: string;
}

interface LaunchpadTokensContextValue {
    getTokenLogo: (address: string) => string | undefined;
    isLoading: boolean;
}

const LaunchpadTokensContext = createContext<LaunchpadTokensContextValue>({
    getTokenLogo: () => undefined,
    isLoading: true,
});

export function LaunchpadTokensProvider({ children }: { children: ReactNode }) {
    const [logoMap, setLogoMap] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const cacheKey = 'prism_launchpad_tokens_v1';
        const cacheTtlMs = 1000 * 60 * 30;

        /*
        const readCachedTokens = (): LaunchpadToken[] | null => {
            try {
                const raw = sessionStorage.getItem(cacheKey);
                if (!raw) return null;

                const parsed = JSON.parse(raw) as { ts: number; tokens: LaunchpadToken[] };
                if (!parsed?.ts || !Array.isArray(parsed.tokens)) return null;
                if (Date.now() - parsed.ts > cacheTtlMs) return null;

                return parsed.tokens;
            } catch {
                return null;
            }
        };

        const writeCachedTokens = (tokens: LaunchpadToken[]) => {
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), tokens }));
            } catch {
            }
        };
        */

        const setLogosFromTokens = (tokens: LaunchpadToken[]) => {
            const map = new Map<string, string>();
            for (const token of tokens) {
                if (token.id && token.image_url) {
                    map.set(token.id.toLowerCase(), token.image_url);
                }
            }

            if (isMounted) {
                setLogoMap(map);
                setIsLoading(false);
            }
        };

        async function fetchTokens() {
            try {
                /*
                const cachedTokens = readCachedTokens();
                if (cachedTokens) {
                    setLogosFromTokens(cachedTokens);
                    return;
                }
                */

                const tokens: LaunchpadToken[] | null = await useSessionStorageCache(cacheKey, async () => {
                    const response = await fetch(LAUNCHPAD_API_URL, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                    });

                    if (!response.ok) {
                        //console.error('[LaunchpadTokensProvider] Response not ok:', response.status);
                        return null;
                    }

                    const data = await response.json();
                    if (!data.success || !data.tokens) {
                        //console.error('[LaunchpadTokensProvider] Invalid data:', data);
                        return null;
                    }

                    return data.tokens as LaunchpadToken[];
                }, [], cacheTtlMs);

                if (!tokens) return;

                //writeCachedTokens(tokens as LaunchpadToken[]);
                setLogosFromTokens(tokens as LaunchpadToken[]);

            } catch (err) {
                //console.error('[LaunchpadTokensProvider] Error:', err);
                if (isMounted) setIsLoading(false);
            }
        }

        fetchTokens();
        return () => { isMounted = false; };
    }, []);

    const getTokenLogo = useCallback((address: string): string | undefined => {
        return logoMap.get(address.toLowerCase());
    }, [logoMap]);

    const contextValue = useMemo(() => ({
        getTokenLogo,
        isLoading
    }), [getTokenLogo, isLoading]);

    return (
        <LaunchpadTokensContext.Provider value={contextValue}>
            {children}
        </LaunchpadTokensContext.Provider>
    );
}

export function useLaunchpadLogos() {
    return useContext(LaunchpadTokensContext);
}
