
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import * as apiBackend from '@/lib/api_backend';

import { PoolHourData } from "@/types";



export interface PoolHourDataHook {
    poolHourData: PoolHourData[],
    poolHourDataInitialized: boolean,
    poolHourDataLoading: boolean,
    poolHourDataError: string,
    fetchPoolHourData: () => void,
    setPoolHourData: Dispatch<SetStateAction<PoolHourData[]>>,
    setPoolHourDataLoading: Dispatch<SetStateAction<boolean>>,
    setPoolHourDataError: Dispatch<SetStateAction<string>>,
}


export function usePoolHourData(poolAddress: `0x${string}`, autoload=true): PoolHourDataHook {
    const [poolHourData, setPoolHourData] = useState<PoolHourData[]>([])
    const [poolHourDataInitialized, setPoolHourDataInitialized] = useState(false)
    const [poolHourDataLoading, setPoolHourDataLoading] = useState(false)
    const [poolHourDataError, setPoolHourDataError] = useState<string | null>(null)


    useEffect(() => {
        if (autoload) {
            fetchPoolHourData();
        }
    }, [autoload, poolAddress]);


    const fetchPoolHourData = async () => {
        try {
            setPoolHourData([]);
            setPoolHourDataError(null);
            setPoolHourDataLoading(true);

            if (poolAddress) {
                const poolHourData = await apiBackend.fetchPoolHourData(poolAddress);
                setPoolHourData(poolHourData);

                setPoolHourDataInitialized(true);
            }

        } catch (err: any) {
            setPoolHourDataError(err.message);
            //console.warn(`usePoolHourData.fetchPoolHourData ERROR. ${err.message}`)

        } finally {
            setPoolHourDataLoading(false);
        }
    }


    const poolHourDataHook: PoolHourDataHook = {
        poolHourData: poolHourData,
        poolHourDataInitialized: poolHourDataInitialized,
        poolHourDataLoading: poolHourDataLoading,
        poolHourDataError: poolHourDataError,
        fetchPoolHourData,
        setPoolHourData,
        setPoolHourDataLoading,
        setPoolHourDataError,
    }

    return poolHourDataHook
}



