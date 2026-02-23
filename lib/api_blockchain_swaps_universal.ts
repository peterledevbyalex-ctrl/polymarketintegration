
import { WalletClient, createPublicClient, http, TransactionReceipt, encodeAbiParameters, parseAbiParameters, encodePacked, Hex, Address } from "viem";

import * as apiBlockchain from '@/lib/api_blockchain';
import { CURRENT_CHAIN, UNIVERSAL_ROUTER_ADDRESS, RPC_URL, PERMIT2_ADDRESS } from "@/config.app";

import { SwapMultipleParams, SwapSingleParams } from "@/types";

import UniversalRouterArtifact from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json';
import Permit2Artifact from '../assets/artifacts/Permit2.json';


const UniversalRouterAbi = UniversalRouterArtifact.abi;


// Commands Universal Router (voir: https://github.com/Uniswap/universal-router/blob/main/contracts/libraries/Commands.sol)
const COMMANDS = {
    V3_SWAP_EXACT_IN: '0x00',
    V3_SWAP_EXACT_OUT: '0x01',
    PERMIT2_TRANSFER_FROM: '0x02',
    PERMIT2_PERMIT_BATCH: '0x03',
    SWEEP: '0x04',
    TRANSFER: '0x05',
    PAY_PORTION: '0x06',
    PERMIT2_PERMIT: '0x0a',
    WRAP_ETH: '0x0b',
    UNWRAP_WETH: '0x0c',
};


const publicClient = createPublicClient({
    chain: CURRENT_CHAIN,
    transport: http(RPC_URL),
})


// Swap ETH vers Token avec Universal Router
export async function swapTokensFromETH_UniversalRouter(walletClient: WalletClient, swapSingleParams: SwapSingleParams): Promise<TransactionReceipt> {
    //console.log('Executing ETH → Token swap with Universal Router');
    //console.log('swapParams:', swapParams)

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 min

    // Encode le path V3
    const path = encodePacked(
        ['address', 'uint24', 'address'],
        [swapSingleParams.tokenIn, Number(swapSingleParams.fee), swapSingleParams.tokenOut]
    );

    // Commands: WRAP_ETH (0x0b) + V3_SWAP_EXACT_IN (0x00)
    const commands = '0x0b00';

    const inputs = [
        // WRAP_ETH (0x0b) - wrap ETH en WETH dans le router
        encodeAbiParameters(
            parseAbiParameters('address, uint256'),
            [UNIVERSAL_ROUTER_ADDRESS as `0x${string}`, swapSingleParams.amountIn]
        ),
        // V3_SWAP_EXACT_IN (0x00)
        encodeAbiParameters(
            parseAbiParameters('address, uint256, uint256, bytes, bool'),
            [
                swapSingleParams.recipient,
                swapSingleParams.amountIn,
                swapSingleParams.amountOutMinimum,
                path,
                false, // payerIsUser = false (le router a déjà le WETH)
            ]
        ),
    ];

    const { request } = await publicClient.simulateContract({
        address: UNIVERSAL_ROUTER_ADDRESS,
        abi: UniversalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs, deadline],
        account: userAddress,
        chain: CURRENT_CHAIN,
        value: swapSingleParams.amountIn, // Envoyer l'ETH
    });

    const hash = await walletClient.writeContract(request);
    //console.log('Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('Swap completed:', receipt);

    return receipt;
}


// Swap ETH vers Token avec Universal Router (Multi-hop)
export async function swapTokensFromETH_UniversalRouter_Multiple(walletClient: WalletClient, swapMultipleParams: SwapMultipleParams): Promise<TransactionReceipt> {
    //console.log('Executing ETH → Token multi-hop swap with Universal Router');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 min

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

    // Commands: WRAP_ETH (0x0b) + V3_SWAP_EXACT_IN (0x00)
    const commands = '0x0b00';

    const inputs = [
        // WRAP_ETH (0x0b) - wrap ETH en WETH dans le router
        encodeAbiParameters(
            parseAbiParameters('address, uint256'),
            [UNIVERSAL_ROUTER_ADDRESS as `0x${string}`, swapMultipleParams.amountIn]
        ),
        // V3_SWAP_EXACT_IN (0x00)
        encodeAbiParameters(
            parseAbiParameters('address, uint256, uint256, bytes, bool'),
            [
                swapMultipleParams.recipient,
                swapMultipleParams.amountIn,
                swapMultipleParams.amountOutMinimum,
                path,
                false, // payerIsUser = false (le router a déjà le WETH)
            ]
        ),
    ];

    //console.log('Multi-hop path:', path);
    //console.log('Path length:', path.length, 'bytes:', (path.length - 2) / 2);
    //console.log('Path segments:', swapMultipleParams.path.length);

    const { request } = await publicClient.simulateContract({
        address: UNIVERSAL_ROUTER_ADDRESS,
        abi: UniversalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs, deadline],
        account: userAddress,
        chain: CURRENT_CHAIN,
        value: swapMultipleParams.amountIn, // Envoyer l'ETH
    });

    const hash = await walletClient.writeContract(request);
    //console.log('Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('Swap completed:', receipt);

    return receipt;
}



// Swap Token vers ETH avec Universal Router
export async function swapTokensToETH_UniversalRouter(walletClient: WalletClient, swapParams: SwapSingleParams): Promise<TransactionReceipt> {
    //console.log('Executing Token → ETH swap with Universal Router');
    //console.log('swapParams:', swapParams)

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);


    // Encode le path
    const path: Hex = encodePacked(
        ['address', 'uint24', 'address'],
        [swapParams.tokenIn, Number(swapParams.fee), swapParams.tokenOut]
    );


    // Commands: PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_IN (0x00) + UNWRAP_WETH (0x0c)
    const commands = '0x02000c';

    const inputs = [
        // PERMIT2_TRANSFER_FROM (0x02) - transfere les tokens du user vers le router
        encodeAbiParameters(
            parseAbiParameters('address, address, uint160'),
            [
                swapParams.tokenIn,
                UNIVERSAL_ROUTER_ADDRESS as `0x${string}`, // Le router reçoit les tokens
                swapParams.amountIn, // uint160
            ]
        ),
        // V3_SWAP_EXACT_IN (0x00) - swap vers WETH
        encodeAbiParameters(
            parseAbiParameters('address, uint256, uint256, bytes, bool'),
            [
                UNIVERSAL_ROUTER_ADDRESS as `0x${string}`, // Le router reçoit le WETH
                swapParams.amountIn,
                swapParams.amountOutMinimum,
                path,
                false,
            ]
        ),
        // UNWRAP_WETH (0x0c) - unwrap WETH vers ETH et envoie au recipient
        encodeAbiParameters(
            parseAbiParameters('address, uint256'),
            [swapParams.recipient, 0n]
        ),
    ];


    const { request } = await publicClient.simulateContract({
        address: UNIVERSAL_ROUTER_ADDRESS,
        abi: UniversalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs, deadline],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const hash = await walletClient.writeContract(request);
    //console.log('Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('Swap completed:', receipt);

    return receipt;
}


// Swap Token vers ETH avec Universal Router (Multi-hop)
export async function swapTokensToETH_UniversalRouter_Multiple(walletClient: WalletClient, swapMultipleParams: SwapMultipleParams): Promise<TransactionReceipt> {
    //console.log('Executing Token → ETH multi-hop swap with Universal Router');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 min

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

    // Commands: PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_IN (0x00) + UNWRAP_WETH (0x0c)
    const commands = '0x02000c';

    const inputs = [
        // PERMIT2_TRANSFER_FROM (0x02) - transfere les tokens du user vers le router
        encodeAbiParameters(
            parseAbiParameters('address, address, uint160'),
            [
                swapMultipleParams.tokenIn,
                UNIVERSAL_ROUTER_ADDRESS as `0x${string}`,
                swapMultipleParams.amountIn, // uint160
            ]
        ),
        // V3_SWAP_EXACT_IN (0x00) - swap multi-hop vers WETH
        encodeAbiParameters(
            parseAbiParameters('address, uint256, uint256, bytes, bool'),
            [
                UNIVERSAL_ROUTER_ADDRESS as `0x${string}`, // Le router reçoit le WETH final
                swapMultipleParams.amountIn,
                swapMultipleParams.amountOutMinimum,
                path,
                false,
            ]
        ),
        // UNWRAP_WETH (0x0c) - unwrap WETH vers ETH et envoie au recipient
        encodeAbiParameters(
            parseAbiParameters('address, uint256'),
            [swapMultipleParams.recipient, 0n]
        ),
    ];

    //console.log('Multi-hop path:', path);
    //console.log('Path length:', path.length, 'bytes:', (path.length - 2) / 2);
    //console.log('Path segments:', swapMultipleParams.path.length);

    const { request } = await publicClient.simulateContract({
        address: UNIVERSAL_ROUTER_ADDRESS,
        abi: UniversalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs, deadline],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const hash = await walletClient.writeContract(request);
    //console.log('Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('Swap completed:', receipt);

    return receipt;
}


// Swap Token vers Token avec Universal Router
export async function swapTokensToTokens_UniversalRouter(walletClient: WalletClient, swapParams: SwapSingleParams): Promise<TransactionReceipt> {
    //console.log('Executing Token → Token swap with Universal Router');
    //console.log('swapParams:', swapParams);

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);


    // Encode le path
    const path = encodePacked(
        ['address', 'uint24', 'address'],
        [swapParams.tokenIn, Number(swapParams.fee), swapParams.tokenOut]
    );

    // Commands: PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_IN (0x00)
    const commands = '0x0200';

    const inputs = [
        // PERMIT2_TRANSFER_FROM (0x02)
        encodeAbiParameters(
            parseAbiParameters('address, address, uint160'),
            [
                swapParams.tokenIn,
                UNIVERSAL_ROUTER_ADDRESS as `0x${string}`, // Le router reçoit les tokens
                swapParams.amountIn, // uint160
            ]
        ),
        // V3_SWAP_EXACT_IN (0x00)
        encodeAbiParameters(
            parseAbiParameters('address, uint256, uint256, bytes, bool'),
            [
                //UNIVERSAL_ROUTER_ADDRESS,
                swapParams.recipient,
                swapParams.amountIn,
                swapParams.amountOutMinimum,
                path,
                false, // payerIsUser = false (tokens viennent de Permit2)
            ]
        ),
    ];


    const { request } = await publicClient.simulateContract({
        address: UNIVERSAL_ROUTER_ADDRESS,
        abi: UniversalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs, deadline],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const hash = await walletClient.writeContract(request);
    //console.log('Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('Swap completed:', receipt);

    return receipt;
}


// Swap Token vers Token avec Universal Router (Multi-hop)
export async function swapTokensToTokens_UniversalRouter_Multiple(walletClient: WalletClient, swapMultipleParams: SwapMultipleParams): Promise<TransactionReceipt> {
    //console.log('Executing Token → Token multi-hop swap with Universal Router');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 min

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

    // Commands: PERMIT2_TRANSFER_FROM (0x02) + V3_SWAP_EXACT_IN (0x00)
    const commands = '0x0200';

    const inputs = [
        // PERMIT2_TRANSFER_FROM (0x02) - transfere les tokens du user vers le router
        encodeAbiParameters(
            parseAbiParameters('address, address, uint160'),
            [
                swapMultipleParams.tokenIn,
                UNIVERSAL_ROUTER_ADDRESS as `0x${string}`,
                swapMultipleParams.amountIn, // uint160
            ]
        ),
        // V3_SWAP_EXACT_IN (0x00) - swap multi-hop
        encodeAbiParameters(
            parseAbiParameters('address, uint256, uint256, bytes, bool'),
            [
                swapMultipleParams.recipient, // Le recipient reçoit directement les tokens finaux
                swapMultipleParams.amountIn,
                swapMultipleParams.amountOutMinimum,
                path,
                false, // payerIsUser = false (tokens viennent de Permit2)
            ]
        ),
    ];

    //console.log('Multi-hop path:', path);
    //console.log('Path length:', path.length, 'bytes:', (path.length - 2) / 2);
    //console.log('Path segments:', swapMultipleParams.path.length);

    const { request } = await publicClient.simulateContract({
        address: UNIVERSAL_ROUTER_ADDRESS,
        abi: UniversalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs, deadline],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const hash = await walletClient.writeContract(request);
    //console.log('Swap transaction hash:', hash);

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('Swap completed:', receipt);

    return receipt;
}



// Lire l'allowance Permit2 → Universal Router
export async function getPermit2Allowance(owner: `0x${string}`, token: `0x${string}`, spender: `0x${string}`): Promise<{ amount: bigint; expiration: bigint; nonce: bigint }> {
    const allowance = await publicClient.readContract({
        address: PERMIT2_ADDRESS,
        abi: Permit2Artifact.abi,
        functionName: 'allowance',
        args: [owner, token, spender],
        authorizationList: undefined,
    }) as [bigint, bigint, bigint];

    return {
        amount: allowance[0],
        expiration: allowance[1],
        nonce: allowance[2]
    };
}


// Approuver Permit2 à laisser un spender dépenser les tokens
export async function approvePermit2Allowance(walletClient: WalletClient, token: `0x${string}`, spender: `0x${string}`, amount: bigint, expiration: bigint): Promise<TransactionReceipt> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    //console.log('approvePermit2Allowance:', approvePermit2Allowance)

    const hash: Hex = await walletClient.writeContract({
        address: PERMIT2_ADDRESS,
        abi: Permit2Artifact.abi,
        functionName: 'approve',
        args: [token, spender, amount, Number(expiration)],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt;
}


// Can replace approve transaction. Not used
export async function getPermit2PermitSignature(walletClient: WalletClient, tokenAddress: Address, approvalAmount: bigint): Promise<Hex> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

    const nonce = 0;
    const allowanceExpiration = deadline;


    // Domain
    const domain = {
        name: 'Permit2',
        chainId: CURRENT_CHAIN.id,
        verifyingContract: PERMIT2_ADDRESS,
    } as const;


    // Types
    const types = {
        PermitSingle: [
            { name: 'details', type: 'PermitDetails' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' },
        ],
    } as const;


    // Valeurs du message
    const value = {
        details: {
            token: tokenAddress,
            amount: approvalAmount,
            expiration: Number(allowanceExpiration),
            nonce: nonce,
        },
        spender: UNIVERSAL_ROUTER_ADDRESS,
        sigDeadline: deadline,
    } as const;


    // Signature du message
    const signature = await walletClient.signTypedData({
        account: userAddress,
        domain,
        types,
        primaryType: 'PermitSingle',
        message: value,
    });

    return signature;
}


