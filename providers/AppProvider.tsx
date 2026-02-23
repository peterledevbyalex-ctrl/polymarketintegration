"use client"

import React, { createContext, useContext, useMemo } from 'react';
import { useAccount, useWalletClient } from 'wagmi';

import { ThemeHook, useTheme } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useEthPrice } from '@/hooks/useEthPrice';
import { Address, WalletClient } from 'viem';


const AppContext = createContext<AppContextType | undefined>(undefined);


export function AppProvider({ children }: { children: React.ReactNode }) {
    const { isConnected, address: userAddress } = useAccount()
    const { data: walletClient } = useWalletClient();

    const { lastEthPrice } = useEthPrice();
    const isDesktop = useMediaQuery('(min-width: 768px)');
    const themeHook = useTheme();

    const appState: AppContextType = useMemo(() => ({
        themeHook,
        isDesktop,
        lastEthPrice,
        isConnected: isConnected || Boolean(userAddress),
        userAddress,
        walletClient,
    }), [themeHook, isDesktop, lastEthPrice, isConnected, userAddress, walletClient])

    return (
        <AppContext.Provider value={appState}>
            {children}
        </AppContext.Provider>
    );
}


interface AppContextType {
    themeHook: ThemeHook
    isDesktop: boolean
    lastEthPrice: string
    isConnected: boolean,
    userAddress: Address,
    walletClient: WalletClient,
}


export function useApp() {
    const context = useContext(AppContext);

    if (context === undefined) {
        throw new Error('useApp must be used within a AppProvider');
    }

    return context;
}

