
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { Address } from "viem";

import * as apiBackend from '@/lib/api_backend';
import * as apiBlockchainTokens from "@/lib/api_blockchain_tokens";

import { ETH_ADDRESS } from "@/config.app";
import { useSessionStorageCache } from "./useBrowserCache";

import { Token } from "@/types";


export interface UserTokensHook {
    userTokens: Token[],
    userTokensInitialized: boolean,
    userTokensLoading: boolean,
    userTokensError: string,
    fetchUserTokens: () => void,
    setUserTokens: Dispatch<SetStateAction<Token[]>>,
    setUserTokensLoading: Dispatch<SetStateAction<boolean>>,
    setUserTokensError: Dispatch<SetStateAction<string>>,
    updateUserTokenBalance: (tokenAddress: `0x${string}`, balance: string) => void,
}


export function useUserTokens(userAddress: `0x${string}`): UserTokensHook {
    const [userTokens, setUserTokens] = useState<Token[]>([])
    const [userTokensInitialized, setUserTokensInitialized] = useState(false)
    const [userTokensLoading, setUserTokensLoading] = useState(false)
    const [userTokensError, setUserTokensError] = useState<string | null>(null)


    useEffect(() => {
        if (!userAddress) return;

        const _run = () => {
            fetchUserTokens();
        }

        const timer = setTimeout(_run, 100);

        return () => clearTimeout(timer);
    }, [userAddress]);


    const fetchUserTokens = useCallback(async () => {
        try {
            setUserTokensError(null);
            setUserTokensLoading(true);

            if (!userAddress) {
                setUserTokens([]);
                setUserTokensInitialized(true);
                return;
            }

            const cacheTtlMs = 1000 * 30; // 30 seconds

            /*
            const cacheKey = `prism_user_tokens_v1_${userAddress.toLowerCase()}`;

            const cachedTokens = (() => {
                try {
                    const raw = sessionStorage.getItem(cacheKey);
                    if (!raw) return null;
                    const parsed = JSON.parse(raw) as { ts: number; tokens: Token[] };
                    if (!parsed?.ts || !Array.isArray(parsed.tokens)) return null;
                    if (Date.now() - parsed.ts > cacheTtlMs) return null;
                    return parsed.tokens;
                } catch {
                    return null;
                }
            })();

            if (cachedTokens) {
                const sanitized = cachedTokens.filter(isValidToken);
                setUserTokens(sanitized);
                setUserTokensInitialized(true);
            }
            */

            const ethBalancePromise = apiBlockchainTokens.getUserTokenBalance(null, userAddress)
                .catch(() => null);

            //const tokens = await apiBackend.fetchUserTokens(userAddress)
            //const sanitizedTokens = tokens.filter(isValidToken);

            const tokens = await useSessionStorageCache('user_tokens', async (userAddress: Address) => {
                const tokens = await apiBackend.fetchUserTokens(userAddress)
                const sanitizedTokens = tokens.filter(isValidToken);
                return sanitizedTokens;
            }, [userAddress], cacheTtlMs, true)

            setUserTokens(tokens);
            setUserTokensInitialized(true);

            /*
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), tokens: sanitizedTokens }));
            } catch {
            }
            */

            ethBalancePromise.then(balance => {
                if (!balance) return;
                updateUserTokenBalance(ETH_ADDRESS, balance);
            });

        } catch (err: any) {
            setUserTokensError(err.message);
            //console.warn(`useUserTokens.fetchUserTokens ERROR. ${err.message}`)

        } finally {
            setUserTokensLoading(false);
        }
    }, [userAddress])


    const updateUserTokenBalance = (tokenAddress: `0x${string}`, balance: string) => {
        setUserTokens(tokens => {
            return (tokens as Array<Token | null | undefined>).filter(Boolean).map(token => {
                if (token.id === tokenAddress) {
                    return {
                        ...token,
                        userBalance: balance,
                    }

                } else {
                    return token;
                }
            });
        });
    }


    const userTokensHook: UserTokensHook = {
        userTokens,
        userTokensInitialized,
        userTokensLoading,
        userTokensError,
        fetchUserTokens,
        setUserTokens,
        setUserTokensLoading,
        setUserTokensError,
        updateUserTokenBalance,
    }

    return userTokensHook
}


function isValidToken(token: Token): token is Token {
    if (!token || typeof token !== 'object') return false;
    const maybe = token as Partial<Token>;
    return typeof maybe.id === 'string' && maybe.id.length > 0;
};

