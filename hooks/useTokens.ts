
import { Token } from "@/types";
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import * as apiBackend from '@/lib/api_backend';
import { useSessionStorageCache } from "./useBrowserCache";


export interface TokensHook {
    tokens: Token[],
    tokensInitialized: boolean,
    tokensLoading: boolean,
    tokensError: string,
    fetchTokens: () => void,
    setTokens: Dispatch<SetStateAction<Token[]>>,
    setTokensLoading: Dispatch<SetStateAction<boolean>>,
    setTokensError: Dispatch<SetStateAction<string>>,
}


export function useTokens(preLoadedTokens?: Token[]): TokensHook {
    const [tokens, setTokens] = useState<Token[]>(preLoadedTokens ?? [])
    const [tokensInitialized, setTokensInitialized] = useState(false)
    const [tokensLoading, setTokensLoading] = useState(false)
    const [tokensError, setTokensError] = useState<string | null>(null)



    useEffect(() => {
        if (!preLoadedTokens) {
            const timer = setTimeout(fetchTokens, 50);

            return () => {
                clearTimeout(timer);
            }
        }
    }, []);


    const fetchTokens = async () => {
        const cacheTtlMs = 1000 * 60 * 5; // 5 minutes

        try {
            setTokensLoading(true);
            setTokens([]);
            setTokensError(null);

            const tokens = await useSessionStorageCache('tokens', async () => {
                return await apiBackend.fetchTokens();
            }, [], cacheTtlMs)

            setTokens(tokens);
            setTokensInitialized(true);

        } catch (err: any) {
            setTokensError(err.message);
            //console.warn(`useTokens.fetchTokens ERROR. ${err.message}`)

        } finally {
            setTokensLoading(false);
        }
    }


    const tokensHook: TokensHook = {
        tokens,
        tokensInitialized,
        tokensLoading,
        tokensError,
        fetchTokens,
        setTokens,
        setTokensLoading,
        setTokensError,
    }

    return tokensHook
}



