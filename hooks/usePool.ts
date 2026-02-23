"use client"

import React, { Dispatch, SetStateAction, useEffect, useState } from "react";

import * as apiBackend from '@/lib/api_backend';

import { SubgraphPool } from "@/types";



export interface PoolHook {
    pool: SubgraphPool | null,
    poolInitialized: boolean,
    poolLoading: boolean,
    poolError: string,
    fetchPool: () => void,
    setPool: Dispatch<SetStateAction<SubgraphPool | null>>,
    setPoolLoading: Dispatch<SetStateAction<boolean>>,
    setPoolError: Dispatch<SetStateAction<string>>,
}


export function usePool(poolAddress: `0x${string}`): PoolHook {
    const [pool, setPool] = useState<SubgraphPool | null>(null)
    const [poolInitialized, setPoolInitialized] = useState(false)
    const [poolLoading, setPoolLoading] = useState(false)
    const [poolError, setPoolError] = useState<string | null>(null)


    useEffect(() => {
        const timer = setTimeout(() => {
            fetchPool();
        }, 50);

        setPoolInitialized(true);

        return () => {
            clearTimeout(timer);
        }
    }, []);


    useEffect(() => {
        if (!poolInitialized) return;
        fetchPool();
    }, [poolAddress]);


    const fetchPool = async () => {
        try {
            setPool(null);
            setPoolError(null);
            setPoolLoading(true);

            if (poolAddress) {
                const pool = await apiBackend.fetchPool(poolAddress)
                setPool(pool);
            }

        } catch (err: any) {
            setPoolError(err.message);
            //console.warn(`usePool.fetchPool ERROR. ${err.message}`)

        } finally {
            setPoolLoading(false);
        }
    }


    const poolHook: PoolHook = {
        pool,
        poolInitialized,
        poolLoading,
        poolError,
        fetchPool,
        setPool,
        setPoolLoading,
        setPoolError,
    }

    return poolHook
}



