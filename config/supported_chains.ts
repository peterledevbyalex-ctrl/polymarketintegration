/**
 * Supported chains for cross-chain swaps via LI.FI
 */

import { CURRENT_CHAIN, RPC_URL } from '@/config.app';

export interface SupportedChain {
    id: number;
    name: string;
    shortName: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    logoUri: string;
    explorerUrl: string;
    rpcUrl?: string;
    isTestnet: boolean;
}

// Popular EVM chains supported by LI.FI
export const SUPPORTED_CHAINS: SupportedChain[] = [
    {
        id: 1,
        name: 'Ethereum',
        shortName: 'ETH',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/ethereum.svg',
        explorerUrl: 'https://etherscan.io',
        rpcUrl: 'https://eth-pokt.nodies.app',
        isTestnet: false,
    },
    {
        id: 42161,
        name: 'Arbitrum',
        shortName: 'ARB',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/arbitrum.svg',
        explorerUrl: 'https://arbiscan.io',
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        isTestnet: false,
    },
    {
        id: 10,
        name: 'Optimism',
        shortName: 'OP',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/optimism.svg',
        explorerUrl: 'https://optimistic.etherscan.io',
        rpcUrl: 'https://mainnet.optimism.io',
        isTestnet: false,
    },
    {
        id: 8453,
        name: 'Base',
        shortName: 'BASE',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/base.svg',
        explorerUrl: 'https://basescan.org',
        rpcUrl: 'https://mainnet.base.org',
        isTestnet: false,
    },
    {
        id: 137,
        name: 'Polygon',
        shortName: 'MATIC',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/polygon.svg',
        explorerUrl: 'https://polygonscan.com',
        rpcUrl: 'https://polygon-rpc.com',
        isTestnet: false,
    },
    {
        id: 56,
        name: 'BNB Chain',
        shortName: 'BSC',
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/bsc.svg',
        explorerUrl: 'https://bscscan.com',
        rpcUrl: 'https://bsc.drpc.org',
        isTestnet: false,
    },
    {
        id: 43114,
        name: 'Avalanche',
        shortName: 'AVAX',
        nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/avalanche.svg',
        explorerUrl: 'https://snowtrace.io',
        rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
        isTestnet: false,
    },
    {
        id: 324,
        name: 'zkSync Era',
        shortName: 'zkSync',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/zksync.svg',
        explorerUrl: 'https://explorer.zksync.io',
        rpcUrl: 'https://mainnet.era.zksync.io',
        isTestnet: false,
    },
    {
        id: 59144,
        name: 'Linea',
        shortName: 'LINEA',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/linea.svg',
        explorerUrl: 'https://lineascan.build',
        rpcUrl: 'https://linea.drpc.org',
        isTestnet: false,
    },
    {
        id: 534352,
        name: 'Scroll',
        shortName: 'SCROLL',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        logoUri: 'https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains/scroll.svg',
        explorerUrl: 'https://scrollscan.com',
        rpcUrl: 'https://rpc.scroll.io',
        isTestnet: false,
    },
];


// Current chain config (MegaETH)
export const CURRENT_CHAIN_CONFIG: SupportedChain = {
    id: CURRENT_CHAIN.id,
    name: CURRENT_CHAIN.name,
    shortName: 'MEGA',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    logoUri: '/mega-logo.png', // Local logo
    explorerUrl: CURRENT_CHAIN.blockExplorers?.default?.url || '',
    rpcUrl: CURRENT_CHAIN.rpcUrls.default.http[0],
    isTestnet: true,
};


/**
 * Get chain by ID
 */
export function getChainById(chainId: number): SupportedChain | undefined {
    if (chainId === CURRENT_CHAIN.id) {
        return CURRENT_CHAIN_CONFIG;
    }
    return SUPPORTED_CHAINS.find(chain => chain.id === chainId);
}


/**
 * Get all destination chains (includes MegaETH for bridging TO MegaETH)
 */
export function getDestinationChains(): SupportedChain[] {
    // Include MegaETH as a destination so users can bridge TO MegaETH
    return [CURRENT_CHAIN_CONFIG, ...SUPPORTED_CHAINS.filter(chain => chain.id !== CURRENT_CHAIN.id)];
}


/**
 * Get all source chains (includes current chain)
 */
export function getSourceChains(): SupportedChain[] {
    return [CURRENT_CHAIN_CONFIG, ...SUPPORTED_CHAINS.filter(c => c.id !== CURRENT_CHAIN.id)];
}

