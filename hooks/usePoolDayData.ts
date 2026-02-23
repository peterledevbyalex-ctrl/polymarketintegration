
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import * as apiBackend from '@/lib/api_backend';

import { PoolDayData } from "@/types";



export interface PoolDayDataHook {
    poolDayData: PoolDayData[],
    poolDayDataInitialized: boolean,
    poolDayDataLoading: boolean,
    poolDayDataError: string,
    fetchPoolDayData: () => void,
    setPoolDayData: Dispatch<SetStateAction<PoolDayData[]>>,
    setPoolDayDataLoading: Dispatch<SetStateAction<boolean>>,
    setPoolDayDataError: Dispatch<SetStateAction<string>>,
}


export function usePoolDayData(poolAddress: `0x${string}`, autoload=true): PoolDayDataHook {
    const [poolDayData, setPoolDayData] = useState<PoolDayData[]>([])
    const [poolDayDataInitialized, setPoolDayDataInitialized] = useState(false)
    const [poolDayDataLoading, setPoolDayDataLoading] = useState(false)
    const [poolDayDataError, setPoolDayDataError] = useState<string | null>(null)


    useEffect(() => {
        if (autoload) {
            fetchPoolDayData();
        }
    }, [autoload, poolAddress]);


    const fetchPoolDayData = async () => {
        try {
            setPoolDayData([]);
            setPoolDayDataError(null);
            setPoolDayDataLoading(true);

            if (poolAddress) {
                const poolDayData = await apiBackend.fetchPoolDayData(poolAddress);
                setPoolDayData(poolDayData);

                setPoolDayDataInitialized(true);
            }

        } catch (err: any) {
            setPoolDayDataError(err.message);
            //console.warn(`usePoolDayData.fetchPoolDayData ERROR. ${err.message}`)

        } finally {
            setPoolDayDataLoading(false);
        }
    }


    const poolDayDataHook: PoolDayDataHook = {
        poolDayData,
        poolDayDataInitialized,
        poolDayDataLoading,
        poolDayDataError,
        fetchPoolDayData,
        setPoolDayData,
        setPoolDayDataLoading,
        setPoolDayDataError,
    }

    return poolDayDataHook
}



