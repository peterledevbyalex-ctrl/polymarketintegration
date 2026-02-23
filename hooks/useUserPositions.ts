
import { SubgraphPosition, Token } from "@/types";
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { Address } from "viem";

import * as apiBackend from '@/lib/api_backend';
import { useSessionStorageCache } from "./useBrowserCache";



export interface UserPositionsHook {
    userPositions: SubgraphPosition[],
    userPositionsInitialized: boolean,
    userPositionsLoading: boolean,
    userPositionsError: string,
    fetchUserPositions: (tokens: Token[]) => void,
    setUserPositions: Dispatch<SetStateAction<SubgraphPosition[]>>,
    setUserPositionsLoading: Dispatch<SetStateAction<boolean>>,
    setUserPositionsError: Dispatch<SetStateAction<string>>,
}


export function useUserPositions(userAddress: `0x${string}`, poolAddress?: `0x${string}`): UserPositionsHook {
    const [userPositions, setUserPositions] = useState<SubgraphPosition[]>([])
    const [userPositionsInitialized, setUserPositionsInitialized] = useState(false)
    const [userPositionsLoading, setUserPositionsLoading] = useState(false)
    const [userPositionsError, setUserPositionsError] = useState<string | null>(null)


    useEffect(() => {
        if (!userAddress) return;

        const _run = () => {
            fetchUserPositions();
        }

        const timer = setTimeout(_run, 100);

        return () => clearTimeout(timer);
    }, [userAddress]);


    const fetchUserPositions = useCallback(async () => {
        const cacheTtlMs = 1000 * 30; // 30 seconds

        try {
            setUserPositions([]);
            setUserPositionsError(null);
            setUserPositionsLoading(true);

            if (userAddress) {
                const positions = await useSessionStorageCache('positions', async (userAddress: Address, poolAddress: Address) => {
                    return await apiBackend.fetchUserPositions(userAddress, poolAddress);
                }, [userAddress, poolAddress], cacheTtlMs)

                setUserPositions(positions);
                setUserPositionsInitialized(true);
            }

        } catch (err: any) {
            setUserPositionsError(err.message);
            //console.warn(`useUserPositions.fetchUserPositions ERROR. ${err.message}`)

        } finally {
            setUserPositionsLoading(false);
        }
    }, [userAddress])


    const userPositionsHook: UserPositionsHook = {
        userPositions,
        userPositionsInitialized,
        userPositionsLoading,
        userPositionsError,
        fetchUserPositions,
        setUserPositions,
        setUserPositionsLoading,
        setUserPositionsError,
    }

    return userPositionsHook
}



