
import { SubgraphPool } from "@/types";
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import * as apiBackend from '@/lib/api_backend';


export interface PoolsHook {
    pools: SubgraphPool[],
    poolsInitialized: boolean,
    poolsLoading: boolean,
    poolsError: string,
    fetchPools: () => void,
    setPools: Dispatch<SetStateAction<SubgraphPool[]>>,
    setPoolsLoading: Dispatch<SetStateAction<boolean>>,
    setPoolsError: Dispatch<SetStateAction<string>>,
}


export function usePools(): PoolsHook {
    const [pools, setPools] = useState<SubgraphPool[]>([])
    const [poolsInitialized, setPoolsInitialized] = useState(false)
    const [poolsLoading, setPoolsLoading] = useState(false)
    const [poolsError, setPoolsError] = useState<string | null>(null)


    useEffect(() => {
        const timer = setTimeout(fetchPools, 50);

        return () => {
            clearTimeout(timer);
        }
    }, []);


    const fetchPools = async () => {
        try {
            setPools([]);
            setPoolsError(null);
            setPoolsLoading(true);

            const pools = await apiBackend.fetchPools();
            setPools(pools);

            setPoolsInitialized(true);

        } catch (err: any) {
            setPoolsError(err.message);
            //console.warn(`usePools.fetchPools ERROR. ${err.message}`)

        } finally {
            setPoolsLoading(false);
        }
    }


    const poolsHook: PoolsHook = {
        pools,
        poolsInitialized,
        poolsLoading,
        poolsError,
        fetchPools,
        setPools,
        setPoolsLoading,
        setPoolsError,
    }

    return poolsHook
}



