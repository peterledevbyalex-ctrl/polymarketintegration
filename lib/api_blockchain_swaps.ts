
import { WalletClient, parseEther, TransactionReceipt, createPublicClient, http, encodeFunctionData, encodePacked } from "viem";

import * as apiBlockchain from '@/lib/api_blockchain';
import { CURRENT_CHAIN, RPC_URL, SWAP_ROUTER_ADDRESS, WETH_ADDRESS } from "@/config.app";

import { SwapMultipleParams, SwapSingleParams } from "@/types";

import SwapRouter from '@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json' with { type: 'json' }

const SwapRouterAbi = SwapRouter.abi;


const publicClient = createPublicClient({
    chain: CURRENT_CHAIN,
    transport: http(RPC_URL),
})



/* ############### */
/* WRITE FUNCTIONS */
/* ############### */


// Déposer de l'ETH natif pour recevoir du WETH
export async function depositETHtoWETH(walletClient: WalletClient, amountETH: string): Promise<TransactionReceipt> {
    //console.log('[depositETHtoWETH] Executing ETH → WETH');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const amount = parseEther(amountETH);

    const hash = await walletClient.writeContract({
        address: WETH_ADDRESS,
        abi: [
            {
                inputs: [],
                name: 'deposit',
                outputs: [],
                stateMutability: 'payable',
                type: 'function',
            },
        ],
        functionName: 'deposit',
        value: amount,
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });

    return receipt;
}


// Retirer du WETH pour recevoir de l'ETH natif
export async function withdrawWETHtoETH(walletClient: WalletClient, userAmountWETH: string): Promise<TransactionReceipt> {
    //console.log('[withdrawWETHtoETH] Executing WETH → ETH');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const amount = parseEther(userAmountWETH);

    const hash = await walletClient.writeContract({
        address: WETH_ADDRESS,
        abi: [
            {
                inputs: [{ name: 'wad', type: 'uint256' }],
                name: 'withdraw',
                outputs: [],
                stateMutability: 'nonpayable',
                type: 'function',
            },
        ],
        functionName: 'withdraw',
        args: [amount],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });

    return receipt;
}


// Swap ETH vers Token en une seule transaction
export async function swapTokensFromETH_Multicall(walletClient: WalletClient, swapParams: SwapSingleParams): Promise<TransactionReceipt> {
    //console.log('[swapTokensFromETH_Multicall] Executing ETH → Token swap with multicall');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const amountIn = swapParams.amountIn;


    // 1. Wrap ETH → WETH dans le router
    const wrapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'wrapETH',
        args: [amountIn],
    });


    // 2. Swap
    const swapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'exactInputSingle',
        args: [{ ...swapParams, amountIn: 0n }],
    });


    const txParams = {
        address: SWAP_ROUTER_ADDRESS,
        abi: SwapRouterAbi,
        functionName: 'multicall',
        args: [
            [
                wrapCalldata,
                swapCalldata,
            ],
        ],
        account: userAddress,
        chain: CURRENT_CHAIN,
        value: amountIn, // Envoyer l'ETH
    };

    //console.log('[swapTokensFromETH_Multicall] txParams:', txParams);

    const { request } = await publicClient.simulateContract(txParams);
    //const request = txParams;

    //console.log('[swapTokensFromETH_Multicall] Simulation successful:', request);

    const hash = await walletClient.writeContract(request);
    //console.log('[swapTokensFromETH_Multicall] Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('[swapTokensFromETH_Multicall] Swap completed:', receipt);

    return receipt;
}



// Swap ETH vers Token multi-hop avec multicall
export async function swapTokensFromETH_Multicall_Multiple(walletClient: WalletClient, swapMultipleParams: SwapMultipleParams): Promise<TransactionReceipt> {
    //console.log('[swapTokensFromETH_Multicall_Multiple] Executing ETH → Token multi-hop swap with multicall');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const amountIn = swapMultipleParams.amountIn;

    // Encoder le path V3 multi-hop
    const pathTypes: string[] = [];
    const pathValues: any[] = [];

    for (let i = 0; i < swapMultipleParams.path.length; i++) {
        const segment = swapMultipleParams.path[i];

        // Ajouter tokenIn (seulement pour le premier segment)
        if (i === 0) {
            pathTypes.push('address');
            pathValues.push(segment.tokenIn);
        }

        // Ajouter fee
        pathTypes.push('uint24');
        pathValues.push(BigInt(segment.feeTier));

        // Ajouter tokenOut
        pathTypes.push('address');
        pathValues.push(segment.tokenOut);
    }

    const path = encodePacked(pathTypes, pathValues);

    // 1. Wrap ETH → WETH dans le router
    const wrapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'wrapETH',
        args: [amountIn],
    });

    // 2. Swap multi-hop avec exactInput
    const exactInputParams = {
        path: path,
        recipient: swapMultipleParams.recipient,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20), // 20 min
        amountIn: 0n, // 0 car le WETH est déjà dans le router
        amountOutMinimum: swapMultipleParams.amountOutMinimum,
    };

    const swapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'exactInput',
        args: [exactInputParams],
    });

    const txParams = {
        address: SWAP_ROUTER_ADDRESS,
        abi: SwapRouterAbi,
        functionName: 'multicall',
        args: [
            [
                wrapCalldata,
                swapCalldata,
            ],
        ],
        account: userAddress,
        chain: CURRENT_CHAIN,
        value: amountIn, // Envoyer l'ETH
    };

    //console.log('[swapTokensFromETH_Multicall_Multiple] Multi-hop path:', path);
    //console.log('[swapTokensFromETH_Multicall_Multiple] Path length:', path.length, 'bytes:', (path.length - 2) / 2);
    //console.log('[swapTokensFromETH_Multicall_Multiple] Path segments:', swapMultipleParams.path.length);
    //console.log('[swapTokensFromETH_Multicall_Multiple] txParams:', txParams);

    const { request } = await publicClient.simulateContract(txParams);

    //console.log('[swapTokensFromETH_Multicall_Multiple] Simulation successful:', request);

    const hash = await walletClient.writeContract(request);
    //console.log('[swapTokensFromETH_Multicall_Multiple] Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('[swapTokensFromETH_Multicall_Multiple] Swap completed:', receipt);

    return receipt;
}



// Swap Token vers ETH en une seule transaction
export async function swapTokensToETH_Multicall(walletClient: WalletClient, swapParams: SwapSingleParams): Promise<TransactionReceipt> {
    //console.log('[swapTokensToETH_Multicall] Executing Token → ETH swap with multicall');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);


    const modifiedSwapParams = {
        ...swapParams,
        recipient: SWAP_ROUTER_ADDRESS, // Le router reçoit le WETH, pas l'utilisateur
    };


    // 1. Encoder le swap
    const swapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'exactInputSingle',
        args: [modifiedSwapParams],
    });


    // 3. Encoder l'unwrap WETH → ETH
    const unwrapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'unwrapWETH9',
        args: [
            0n,
            swapParams.recipient,
        ],
    });


    const txParams = {
        address: SWAP_ROUTER_ADDRESS,
        abi: SwapRouterAbi,
        functionName: 'multicall',
        args: [
            [
                swapCalldata,
                unwrapCalldata,
            ]
        ],
        account: userAddress,
        chain: CURRENT_CHAIN,
    };

    const { request } = await publicClient.simulateContract(txParams);
    //console.log('[swapTokensToETH_Multicall] Simulation successful:', request);


    const hash = await walletClient.writeContract(request);
    //console.log('[swapTokensToETH_Multicall] Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('[swapTokensToETH_Multicall] Swap completed:', receipt);

    return receipt;
}


// Swap Token vers ETH multi-hop avec multicall
export async function swapTokensToETH_Multicall_Multiple(walletClient: WalletClient, swapMultipleParams: SwapMultipleParams): Promise<TransactionReceipt> {
    //console.log('[swapTokensToETH_Multicall_Multiple] Executing Token → ETH multi-hop swap with multicall');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    // Encoder le path V3 multi-hop
    const pathTypes: string[] = [];
    const pathValues: any[] = [];

    for (let i = 0; i < swapMultipleParams.path.length; i++) {
        const segment = swapMultipleParams.path[i];

        // Ajouter tokenIn (seulement pour le premier segment)
        if (i === 0) {
            pathTypes.push('address');
            pathValues.push(segment.tokenIn);
        }

        // Ajouter fee
        pathTypes.push('uint24');
        pathValues.push(BigInt(segment.feeTier));

        // Ajouter tokenOut
        pathTypes.push('address');
        pathValues.push(segment.tokenOut);
    }

    const path = encodePacked(pathTypes, pathValues);

    // 1. Swap multi-hop avec exactInput - le router reçoit le WETH
    const exactInputParams = {
        path: path,
        recipient: SWAP_ROUTER_ADDRESS, // Le router reçoit le WETH, pas l'utilisateur
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20), // 20 min
        amountIn: swapMultipleParams.amountIn,
        amountOutMinimum: swapMultipleParams.amountOutMinimum,
    };

    const swapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'exactInput',
        args: [exactInputParams],
    });

    // 2. Unwrap WETH → ETH et envoyer au recipient
    const unwrapCalldata = encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'unwrapWETH9',
        args: [
            0n, // 0 = unwrap tout le WETH disponible dans le router
            swapMultipleParams.recipient,
        ],
    });

    const txParams = {
        address: SWAP_ROUTER_ADDRESS,
        abi: SwapRouterAbi,
        functionName: 'multicall',
        args: [
            [
                swapCalldata,
                unwrapCalldata,
            ]
        ],
        account: userAddress,
        chain: CURRENT_CHAIN,
    };

    //console.log('[swapTokensToETH_Multicall_Multiple] Multi-hop path:', path);
    //console.log('[swapTokensToETH_Multicall_Multiple] Path length:', path.length, 'bytes:', (path.length - 2) / 2);
    //console.log('[swapTokensToETH_Multicall_Multiple] Path segments:', swapMultipleParams.path.length);

    const { request } = await publicClient.simulateContract(txParams);
    //console.log('[swapTokensToETH_Multicall_Multiple] Simulation successful:', request);

    const hash = await walletClient.writeContract(request);
    //console.log('[swapTokensToETH_Multicall_Multiple] Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('[swapTokensToETH_Multicall_Multiple] Swap completed:', receipt);

    return receipt;
}


// Swap Token vers Token en une seule transaction
export async function swapTokensToTokens(walletClient: WalletClient, swapParams: SwapSingleParams): Promise<TransactionReceipt> {
    //console.log('[swapTokensToTokens] Executing Token → Token swap');
    //console.log('swapParams:', swapParams);

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const { request } = await publicClient.simulateContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: SwapRouterAbi,
        functionName: 'exactInputSingle',
        args: [swapParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    //console.log('[swapTokensToTokens] Simulation successful:', request);

    const hash = await walletClient.writeContract(request);
    //console.log('[swapTokensToTokens] Swap transaction hash:', hash);

    // Attendre la confirmation
    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('[swapTokensToTokens] Swap completed:', receipt);

    return receipt;
}



// Swap Token vers Token multi-hop avec exactInput
export async function swapTokensToTokens_Multiple(walletClient: WalletClient, swapMultipleParams: SwapMultipleParams): Promise<TransactionReceipt> {
    //console.log('[swapTokensToTokens_Multiple] Executing Token → Token multi-hop swap with exactInput');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    // Encoder le path V3 multi-hop
    const pathTypes: string[] = [];
    const pathValues: any[] = [];

    for (let i = 0; i < swapMultipleParams.path.length; i++) {
        const segment = swapMultipleParams.path[i];

        // Ajouter tokenIn (seulement pour le premier segment)
        if (i === 0) {
            pathTypes.push('address');
            pathValues.push(segment.tokenIn);
        }

        // Ajouter fee
        pathTypes.push('uint24');
        pathValues.push(BigInt(segment.feeTier));

        // Ajouter tokenOut
        pathTypes.push('address');
        pathValues.push(segment.tokenOut);
    }

    const path = encodePacked(pathTypes, pathValues);

    // Paramètres pour exactInput
    const exactInputParams = {
        path: path,
        recipient: swapMultipleParams.recipient,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 20), // 20 min
        amountIn: swapMultipleParams.amountIn,
        amountOutMinimum: swapMultipleParams.amountOutMinimum,
    };

    //console.log('[swapTokensToTokens_Multiple] Multi-hop path:', path);
    //console.log('[swapTokensToTokens_Multiple] Path length:', path.length, 'bytes:', (path.length - 2) / 2);
    //console.log('[swapTokensToTokens_Multiple] Path segments:', swapMultipleParams.path.length);

    const { request } = await publicClient.simulateContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: SwapRouterAbi,
        functionName: 'exactInput',
        args: [exactInputParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    //console.log('[swapTokensToTokens_Multiple] Simulation successful:', request);

    const hash = await walletClient.writeContract(request);
    //console.log('[swapTokensToTokens_Multiple] Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('[swapTokensToTokens_Multiple] Swap completed:', receipt);

    return receipt;
}

