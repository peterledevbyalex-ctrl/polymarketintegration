/**
 * Tax Router Permit2 Wrapper Integration
 * 
 * Enables single-signature taxable swaps using Permit2
 */

import { Address, Hex, TransactionReceipt, WalletClient, createPublicClient, http } from "viem";

import { CURRENT_CHAIN, RPC_URL, PERMIT2_ADDRESS, WETH_ADDRESS, SELECTIVE_TAX_ROUTER_PERMIT2_ADDRESS } from "@/config.app";
import * as apiBlockchain from '@/lib/api_blockchain';
import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';

import type { SwapSingleParams } from "@/types";
import { isTokenWETH } from "./tokens_utils";

// Re-export for convenience
export const TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS = SELECTIVE_TAX_ROUTER_PERMIT2_ADDRESS;

const publicClient = createPublicClient({
    chain: CURRENT_CHAIN,
    transport: http(RPC_URL),
});

// Permit2 SignatureTransfer types for EIP-712
const PERMIT2_DOMAIN = {
    name: "Permit2",
    chainId: CURRENT_CHAIN.id,
    verifyingContract: PERMIT2_ADDRESS,
} as const;


const PERMIT_SINGLE_TYPES = {
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


const PERMIT2_ABI = [
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'token', type: 'address' },
            { name: 'spender', type: 'address' },
        ],
        outputs: [
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' },
        ],
    },
    {
        name: 'permit',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'owner', type: 'address' },
            {
                name: 'permitSingle',
                type: 'tuple',
                components: [
                    {
                        name: 'details',
                        type: 'tuple',
                        components: [
                            { name: 'token', type: 'address' },
                            { name: 'amount', type: 'uint160' },
                            { name: 'expiration', type: 'uint48' },
                            { name: 'nonce', type: 'uint48' },
                        ],
                    },
                    { name: 'spender', type: 'address' },
                    { name: 'sigDeadline', type: 'uint256' },
                ],
            },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
    },
] as const;


const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;

const PERMIT_TRANSFER_FROM_TYPES = {
    PermitTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
    TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
    ],
} as const;

// Wrapper ABI (matching deployed SelectiveTaxRouterPermit2)
const WRAPPER_ABI = [
    {
        inputs: [
            {
                components: [
                    { name: "tokenIn", type: "address" },
                    { name: "tokenOut", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "recipient", type: "address" },
                    { name: "deadline", type: "uint256" },
                    { name: "amountIn", type: "uint256" },
                    { name: "amountOutMinimum", type: "uint256" },
                    { name: "sqrtPriceLimitX96", type: "uint160" },
                ],
                name: "params",
                type: "tuple",
            },
            {
                components: [
                    {
                        components: [
                            { name: "token", type: "address" },
                            { name: "amount", type: "uint256" },
                        ],
                        name: "permitted",
                        type: "tuple",
                    },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
                name: "permit",
                type: "tuple",
            },
            { name: "signature", type: "bytes" },
        ],
        name: "exactInputSinglePermit2",
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                components: [
                    { name: "tokenIn", type: "address" },
                    { name: "tokenOut", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "recipient", type: "address" },
                    { name: "deadline", type: "uint256" },
                    { name: "amountIn", type: "uint256" },
                    { name: "amountOutMinimum", type: "uint256" },
                    { name: "sqrtPriceLimitX96", type: "uint160" },
                ],
                name: "params",
                type: "tuple",
            },
            {
                components: [
                    {
                        components: [
                            { name: "token", type: "address" },
                            { name: "amount", type: "uint256" },
                        ],
                        name: "permitted",
                        type: "tuple",
                    },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
                name: "permit",
                type: "tuple",
            },
            { name: "signature", type: "bytes" },
        ],
        name: "exactInputSingleToEthPermit2",
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                components: [
                    { name: "tokenIn", type: "address" },
                    { name: "tokenOut", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "recipient", type: "address" },
                    { name: "deadline", type: "uint256" },
                    { name: "amountIn", type: "uint256" },
                    { name: "amountOutMinimum", type: "uint256" },
                    { name: "sqrtPriceLimitX96", type: "uint160" },
                ],
                name: "params",
                type: "tuple",
            },
        ],
        name: "exactInputSingleWithPermit2Allowance",
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        inputs: [
            {
                components: [
                    { name: "tokenIn", type: "address" },
                    { name: "tokenOut", type: "address" },
                    { name: "fee", type: "uint24" },
                    { name: "recipient", type: "address" },
                    { name: "deadline", type: "uint256" },
                    { name: "amountIn", type: "uint256" },
                    { name: "amountOutMinimum", type: "uint256" },
                    { name: "sqrtPriceLimitX96", type: "uint160" },
                ],
                name: "params",
                type: "tuple",
            },
        ],
        name: "exactInputSingleToEthWithPermit2Allowance",
        outputs: [{ name: "amountOut", type: "uint256" }],
        stateMutability: "nonpayable",
        type: "function",
    },
] as const;

/**
 * Check if the Permit2 wrapper is deployed and configured
 */
export function isPermit2WrapperEnabled(): boolean {
    return TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS !== "0x0000000000000000000000000000000000000000";
}


export async function hasPermit2AllowanceForWrapper(
    tokenAddress: Address,
    userAddress: Address
): Promise<boolean> {
    const result = await publicClient.readContract({
        address: PERMIT2_ADDRESS,
        abi: PERMIT2_ABI,
        functionName: 'allowance',
        args: [userAddress, tokenAddress, TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS],
    } as any) as [bigint, bigint, bigint];

    const amount = BigInt(result[0]);
    const expiration = BigInt(result[1]);

    if (amount === 0n) return false;
    if (expiration === 0n) return false;

    const now = Math.floor(Date.now() / 1000);
    return expiration > BigInt(now);
}


export async function enablePermit2AllowanceForWrapper(
    walletClient: WalletClient,
    tokenAddress: Address,
    amount: bigint = MAX_UINT160,
    expirationSecondsFromNow: number = 60 * 60 * 24 * 365
): Promise<TransactionReceipt> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const allowance = await publicClient.readContract({
        address: PERMIT2_ADDRESS,
        abi: PERMIT2_ABI,
        functionName: 'allowance',
        args: [userAddress, tokenAddress, TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS],
    } as any) as [bigint, bigint, bigint];

    const now = Math.floor(Date.now() / 1000);
    const nonce = BigInt(allowance[2]);
    const expiration = BigInt(now + expirationSecondsFromNow);
    const sigDeadline = BigInt(now + 60 * 20);

    const expiration48 = expiration > MAX_UINT48 ? MAX_UINT48 : expiration;
    const nonce48 = nonce > MAX_UINT48 ? (nonce & MAX_UINT48) : nonce;
    const amount160 = BigInt(amount) > MAX_UINT160 ? MAX_UINT160 : BigInt(amount);

    const permitSingle = {
        details: {
            token: tokenAddress,
            amount: amount160,
            expiration: expiration48,
            nonce: nonce48,
        },
        spender: TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS,
        sigDeadline,
    };

    const signature = await walletClient.signTypedData({
        account: userAddress,
        domain: PERMIT2_DOMAIN,
        types: PERMIT_SINGLE_TYPES,
        primaryType: 'PermitSingle',
        message: permitSingle,
    } as any);

    const hash = await walletClient.writeContract({
        address: PERMIT2_ADDRESS,
        abi: PERMIT2_ABI,
        functionName: 'permit',
        args: [userAddress, permitSingle, signature],
        account: userAddress,
        chain: CURRENT_CHAIN,
    } as any);

    return publicClient.waitForTransactionReceipt({ hash });
}


export async function swapWithPermit2Allowance(
    walletClient: WalletClient,
    params: TaxSwapWithPermitParams
): Promise<TransactionReceipt> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

    const swapParams = {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        fee: params.fee,
        recipient: params.recipient,
        deadline,
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
    };

    const isEthOutput = isTokenWETH(params.tokenOut);
    const functionName = isEthOutput ? 'exactInputSingleToEthWithPermit2Allowance' : 'exactInputSingleWithPermit2Allowance';

    const hash = await walletClient.writeContract({
        address: TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS,
        abi: WRAPPER_ABI,
        functionName: functionName as any,
        args: [swapParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    } as any);

    return publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Get a random nonce for Permit2 signature
 * Uses random to avoid nonce tracking complexity
 */
function getRandomNonce(): bigint {
    return BigInt(Math.floor(Math.random() * 2 ** 48));
}

/**
 * Sign a Permit2 transfer message
 */
async function signPermit2Transfer(
    walletClient: WalletClient,
    token: Address,
    amount: bigint,
    spender: Address,
    nonce: bigint,
    deadline: bigint
): Promise<Hex> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const signature = await walletClient.signTypedData({
        account: userAddress,
        domain: PERMIT2_DOMAIN,
        types: PERMIT_TRANSFER_FROM_TYPES,
        primaryType: "PermitTransferFrom",
        message: {
            permitted: {
                token,
                amount,
            },
            spender,
            nonce,
            deadline,
        },
    });

    return signature;
}

export interface TaxSwapWithPermitParams {
    tokenIn: Address;
    tokenOut: Address;
    fee: number;
    recipient: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
}

/**
 * Execute a taxable swap using Permit2 (single signature after initial Permit2 approval)
 * 
 * Flow:
 * 1. User signs Permit2 message (off-chain, free)
 * 2. Single on-chain tx executes the swap
 */
export async function swapWithPermit2(
    walletClient: WalletClient,
    params: TaxSwapWithPermitParams
): Promise<TransactionReceipt> {
    //console.log('[TaxPermit2] Executing swap with Permit2...');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const nonce = getRandomNonce();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

    // 1. Sign Permit2 message (off-chain, no gas)
    //console.log('[TaxPermit2] Signing Permit2 message...');
    const signature = await signPermit2Transfer(
        walletClient,
        params.tokenIn,
        params.amountIn,
        TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS,
        nonce,
        deadline
    );
    //console.log('[TaxPermit2] Permit2 signature obtained');

    // 2. Build swap params
    const swapParams = {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        fee: params.fee,
        recipient: params.recipient,
        deadline,
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMinimum,
        sqrtPriceLimitX96: 0n,
    };

    // 3. Build permit struct matching contract's PermitTransferFrom
    const permit = {
        permitted: {
            token: params.tokenIn,
            amount: params.amountIn,
        },
        nonce,
        deadline,
    };

    // 4. Determine which function to call
    const isEthOutput = params.tokenOut.toLowerCase() === WETH_ADDRESS.toLowerCase();
    const functionName = isEthOutput ? "exactInputSingleToEthPermit2" : "exactInputSinglePermit2"; // note: If the user chose ETH or WETH as tokenOut, we cannot differentiate between the cases here.

    //console.log(`[TaxPermit2] Calling ${functionName}...`);

    // 5. Execute swap (single on-chain tx)
    const hash = await walletClient.writeContract({
        address: TAX_ROUTER_PERMIT2_WRAPPER_ADDRESS,
        abi: WRAPPER_ABI,
        functionName,
        args: [swapParams, permit, signature],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    //console.log('[TaxPermit2] Swap tx hash:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('[TaxPermit2] Swap completed:', receipt.status);

    return receipt;
}

/**
 * Check if user has approved Permit2 for a token
 */
export async function hasPermit2Approval(
    tokenAddress: Address,
    userAddress: Address
): Promise<boolean> {
    const allowance = await apiBlockchainTokens.getTokenAllowance(
        tokenAddress,
        userAddress,
        PERMIT2_ADDRESS
    );

    // Consider approved if allowance is greater than 0
    return allowance > 0n;
}

/**
 * Approve Permit2 to spend a token (one-time per token)
 * After this, user can do gasless Permit2 signatures for swaps
 */
export async function approvePermit2(
    walletClient: WalletClient,
    tokenAddress: Address,
    amount: bigint = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") // Max uint256
): Promise<TransactionReceipt> {
    //console.log('[TaxPermit2] Approving Permit2 for token:', tokenAddress);

    const receipt = await apiBlockchainTokens.approveToken(
        walletClient,
        tokenAddress,
        PERMIT2_ADDRESS,
        amount
    );

    //console.log('[TaxPermit2] Permit2 approved');
    return receipt;
}
