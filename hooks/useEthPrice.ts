"use client"

import React, { useCallback, useEffect, useState } from "react";

import * as apiBlockchainPools from '@/lib/api_blockchain_pools'
import { USDC_WETH_POOL_ADDRESS } from "@/config.app";
import { useSessionStorageCache } from "./useBrowserCache";

export function useEthPrice(): EthPriceHook {
    const [lastEthPrice, setLastEthPrice] = useState("0")
    const [updatedTs, setUpdatedTs] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const cacheTtlMs = 1000 * 300; // 5 minutes - matches API cache

    useEffect(() => {
        updateEthPrice();
    }, [])

    const updateEthPrice = useCallback(async () => {
        if (isLoading) return;
        if (updatedTs && Date.now() - updatedTs < 30_000) return;

        setIsLoading(true);

        try {
            const ethPrice = await useSessionStorageCache('eth_price', async () => {
                return await getEthPrice()
            }, [], cacheTtlMs);

            setLastEthPrice(ethPrice);
            setUpdatedTs(Date.now())

        } catch (error) {
            console.error('Failed to update ETH price:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        lastEthPrice,
        isLoading,
        updatedTs,
        refreshEthPrice: updateEthPrice
    }
}

export interface EthPriceHook {
    lastEthPrice: string;
    isLoading: boolean;
    updatedTs: number | null;
    refreshEthPrice: () => void;
}



export async function getEthPrice(): Promise<string> {
    try {
        // Use client-side API route instead of direct env access
        const response = await fetch('/api/eth-price', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data.ethPriceUSD || "0";
    } catch (error) {
        console.error('Failed to fetch ETH price from API:', error);
        return "0";
    }
}


