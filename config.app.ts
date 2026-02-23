
import { Address, type Chain } from 'viem';

import { CURRENT_CONFIG } from '@/../config/dex_config'


export const FRONTEND_DIR = __dirname;


// Configuration for RainbowKit
export const reownProjectId = CURRENT_CONFIG.reownProjectId;

// Feature flags
export const USE_SMART_WALLET = true; // Set to true to enable AA (ZeroDev/Pimlico), false for regular Permit2 flow
export const AA_PROVIDER: 'zerodev' | 'pimlico' = 'zerodev'; // Which AA provider to use (when USE_SMART_WALLET is true)


// NETWORK (client-safe)
export const RPC_URL = '/api/rpc';
export const EXPLORER_URL = CURRENT_CONFIG.explorerUrl;

export const CURRENT_CHAIN: Chain = {
    ...CURRENT_CONFIG.chain,
    rpcUrls: {
        default: {
            http: [RPC_URL],
            webSocket: [],
        },
        public: {
            http: [RPC_URL],
            webSocket: [],
        },
    },
} as unknown as Chain;

// Account Abstraction (client-safe proxy endpoints)
export const AA_BUNDLER_URL = '/api/aa/bundler';
export const AA_PAYMASTER_URL = '/api/aa/paymaster';


// TOKENS
export const ETH_ADDRESS = CURRENT_CONFIG.systemTokensIds.ETH;
export const WETH_ADDRESS = CURRENT_CONFIG.systemTokensIds.WETH;
export const USDC_ADDRESS = CURRENT_CONFIG.systemTokensIds.USDC;

export const STABLE_COINS = [
    USDC_ADDRESS.toLowerCase(),
];

export const USDC_WETH_POOL_ADDRESS = CURRENT_CONFIG.usdcWethPool.id as Address;


// UNISWAP CONTRACTS
export const SWAP_ROUTER_ADDRESS = CURRENT_CONFIG.contracts.SwapRouter02;
export const QUOTER_V2_ADDRESS = CURRENT_CONFIG.contracts.QuoterV2;
export const POOL_FACTORY_CONTRACT_ADDRESS = CURRENT_CONFIG.contracts.UniswapV3Factory;
export const POSITION_MANAGER_ADDRESS = CURRENT_CONFIG.contracts.NonfungiblePositionManager;
export const PERMIT2_ADDRESS = CURRENT_CONFIG.contracts.Permit2;
export const UNIVERSAL_ROUTER_ADDRESS = CURRENT_CONFIG.contracts.UniversalRouter;
export const SMART_ACCOUNT_CONTRACT_ADDRESS = CURRENT_CONFIG.contracts.SmartWalletExecutor;
export const SELECTIVE_TAX_ROUTER_ADDRESS = CURRENT_CONFIG.contracts.SelectiveTaxRouter;
export const SELECTIVE_TAX_ROUTER_PERMIT2_ADDRESS = CURRENT_CONFIG.contracts.SelectiveTaxRouterPermit2;

// LI.FI CONFIG
export const LIFI_INTEGRATOR = 'prism_dex';


// UNISWAP SwapRouter02 ROUTER
export const USE_MULTICALL_SWAP = true; // SwapRouter02 only

// UNISWAP UNIVERSAL ROUTER
export const USE_UNIVERSAL_ROUTER = true; // priority over SwapRouter02 and multicall

// EIP-7702 BATCHED SWAPS
// When enabled, swaps will attempt to batch approve + swap into a single transaction
// Requires wallet support (MetaMask, Rabby). Falls back to sequential if not supported.
export const USE_BATCHED_SWAPS = false;

