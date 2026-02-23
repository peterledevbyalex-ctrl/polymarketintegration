"use client"

import { AvatarComponent, darkTheme, getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { http, WagmiProvider, createConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ReactNode, useEffect, createContext, useContext, useState } from 'react'
import { 
    mainnet, 
    arbitrum, 
    optimism, 
    polygon, 
    base, 
    bsc,
    avalanche,
} from 'viem/chains'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'

import * as appConfig from '@/config.app'

// Context to disable ChainGuard during cross-chain operations
const ChainGuardContext = createContext<{
    isDisabled: boolean;
    setDisabled: (disabled: boolean) => void;
}>({
    isDisabled: false,
    setDisabled: () => {},
});

export const useChainGuard = () => useContext(ChainGuardContext);


interface WalletProviderProps {
    children: ReactNode
}

// Chains supported for cross-chain swaps via LI.FI
const CROSS_CHAIN_SUPPORTED = [
    mainnet,
    arbitrum,
    optimism,
    polygon,
    base,
    bsc,
    avalanche,
] as const;

// Configuration RainbowKit (exported for LI.FI SDK)
export const wagmiConfig = createConfig({
    chains: [appConfig.CURRENT_CHAIN, ...CROSS_CHAIN_SUPPORTED],
    transports: {
        [appConfig.CURRENT_CHAIN.id]: http('/api/rpc'), // Use RPC proxy for MegaETH
        [mainnet.id]: http(),
        [arbitrum.id]: http(),
        [optimism.id]: http(),
        [polygon.id]: http(),
        [base.id]: http(),
        [bsc.id]: http(),
        [avalanche.id]: http(),
    },
    ssr: true,
})


const queryClient = new QueryClient()


export const WalletProvider = ({ children }: WalletProviderProps) => {
    const [isChainGuardDisabled, setChainGuardDisabled] = useState(false);

    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    showRecentTransactions={false}
                    coolMode={true}
                    avatar={CustomAvatar}
                    theme={darkTheme({
                        ...darkTheme.accentColors.purple,
                    })}
                //locale="en-US"
                >
                    <ChainGuardContext.Provider value={{ isDisabled: isChainGuardDisabled, setDisabled: setChainGuardDisabled }}>
                        <ChainGuard />
                        {children}
                    </ChainGuardContext.Provider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    )
}


const ChainGuard = () => {
    const { isConnected } = useAccount()
    const chainId = useChainId()
    const { switchChain } = useSwitchChain()

    const { isDisabled } = useChainGuard();
    useEffect(() => {
        if (!isConnected) return
        if (isDisabled) return // Don't auto-switch during cross-chain operations
        if (chainId === appConfig.CURRENT_CHAIN.id) return
        if (!switchChain) return

        switchChain({ chainId: appConfig.CURRENT_CHAIN.id })
    }, [chainId, isConnected, switchChain, isDisabled])

    return null
}




const CustomAvatar: AvatarComponent = ({ address, ensImage, size }) => {

    if (ensImage) {
        return (
            <img
                src={ensImage}
                width={size}
                height={size}
                style={{ borderRadius: 999 }}
            />
        );
    }


    if (true) {
        const defaultImage = `/prism_logo_white.svg`;

        return (
            <img
                src={defaultImage}
                width={size}
                height={size}
                style={{ borderRadius: 999 }}
            />
        );
    }


    const color = generateColorFromAddress(address);

    return (
        <div
            style={{
                backgroundColor: color,
                borderRadius: 999,
                height: size,
                width: size,
            }}
        >
            :^)
        </div>
    );
};


const generateColorFromAddress = (address: string) => '#557799';
