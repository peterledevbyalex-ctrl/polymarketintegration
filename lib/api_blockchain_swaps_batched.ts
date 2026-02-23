/**
 * Batched Swap Utilities using EIP-7702
 * 
 * Combines approve + swap into a single transaction for better UX
 * Falls back to sequential transactions if 7702 is not supported
 */

import { Address, encodeFunctionData, erc20Abi, Hex, parseUnits, TransactionReceipt, WalletClient } from "viem";

import { SWAP_ROUTER_ADDRESS, WETH_ADDRESS, SELECTIVE_TAX_ROUTER_ADDRESS } from "@/config.app";
import SelectiveTaxRouterArtifact from '@/../SelectiveTaxRouterAudited/SelectiveTaxRouter.json';
import { SwapSingleParams, Token, QuotePath } from "@/types";
import { BatchCall, isWallet7702Supported } from "./api_frontend_smart_wallet_7702";

import SwapRouter from '@uniswap/swap-router-contracts/artifacts/contracts/SwapRouter02.sol/SwapRouter02.json' with { type: 'json' }

const SwapRouterAbi = SwapRouter.abi;


/**
 * Build ERC20 approve calldata
 */
export function buildApproveCalldata(spender: Address, amount: bigint): Hex {
    return encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount],
    });
}

/**
 * Build WETH deposit calldata
 */
export function buildWethDepositCalldata(): Hex {
    return encodeFunctionData({
        abi: [{
            inputs: [],
            name: 'deposit',
            outputs: [],
            stateMutability: 'payable',
            type: 'function',
        }],
        functionName: 'deposit',
    });
}

/**
 * Build WETH withdraw calldata
 */
export function buildWethWithdrawCalldata(amount: bigint): Hex {
    return encodeFunctionData({
        abi: [{
            inputs: [{ name: 'wad', type: 'uint256' }],
            name: 'withdraw',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
        }],
        functionName: 'withdraw',
        args: [amount],
    });
}

/**
 * Build exactInputSingle swap calldata
 */
export function buildExactInputSingleCalldata(params: SwapSingleParams): Hex {
    return encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'exactInputSingle',
        args: [params],
    });
}

/**
 * Build multicall calldata for SwapRouter02
 */
export function buildMulticallCalldata(calldatas: Hex[]): Hex {
    return encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'multicall',
        args: [calldatas],
    });
}

/**
 * Build wrapETH calldata
 */
export function buildWrapEthCalldata(amount: bigint): Hex {
    return encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'wrapETH',
        args: [amount],
    });
}

/**
 * Build unwrapWETH9 calldata
 */
export function buildUnwrapWethCalldata(minAmount: bigint, recipient: Address): Hex {
    return encodeFunctionData({
        abi: SwapRouterAbi,
        functionName: 'unwrapWETH9',
        args: [minAmount, recipient],
    });
}


export interface BatchedSwapParams {
    tokenIn: Token;
    tokenOut: Token;
    amountIn: bigint;
    amountOutMinimum: bigint;
    feeTier: bigint;
    recipient: Address;
}

/**
 * Execute a batched Token → Token swap (approve + swap in 1 tx)
 */
export async function executeBatchedTokenSwap(
    walletClient: WalletClient,
    params: BatchedSwapParams
): Promise<TransactionReceipt> {
    const { tokenIn, tokenOut, amountIn, amountOutMinimum, feeTier, recipient } = params;

    const calls: BatchCall[] = [];

    // 1. Approve token for SwapRouter
    calls.push({
        target: tokenIn.id as Address,
        value: 0n,
        calldata: buildApproveCalldata(SWAP_ROUTER_ADDRESS, amountIn),
    });

    // 2. Execute swap
    const swapParams: SwapSingleParams = {
        tokenIn: tokenIn.id as Address,
        tokenOut: tokenOut.id as Address,
        fee: feeTier,
        recipient,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
    };

    calls.push({
        target: SWAP_ROUTER_ADDRESS,
        value: 0n,
        calldata: buildExactInputSingleCalldata(swapParams),
    });

    //console.log('[BatchedSwap] Executing approve + swap in single tx');
    //return executeBatchedTransaction7702(walletClient, calls);

    throw new Error("Missing implementation")
}


/**
 * Execute a batched ETH → Token swap (deposit + approve + swap in 1 tx)
 */
export async function executeBatchedEthToTokenSwap(
    walletClient: WalletClient,
    params: Omit<BatchedSwapParams, 'tokenIn'> & { tokenIn?: Token }
): Promise<TransactionReceipt> {
    const { tokenOut, amountIn, amountOutMinimum, feeTier, recipient } = params;

    const calls: BatchCall[] = [];

    // 1. Deposit ETH to WETH
    calls.push({
        target: WETH_ADDRESS,
        value: amountIn,
        calldata: buildWethDepositCalldata(),
    });

    // 2. Approve WETH for SwapRouter
    calls.push({
        target: WETH_ADDRESS,
        value: 0n,
        calldata: buildApproveCalldata(SWAP_ROUTER_ADDRESS, amountIn),
    });

    // 3. Execute swap
    const swapParams: SwapSingleParams = {
        tokenIn: WETH_ADDRESS,
        tokenOut: tokenOut.id as Address,
        fee: feeTier,
        recipient,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
    };

    calls.push({
        target: SWAP_ROUTER_ADDRESS,
        value: 0n,
        calldata: buildExactInputSingleCalldata(swapParams),
    });

    //console.log('[BatchedSwap] Executing deposit + approve + swap in single tx');
    //return executeBatchedTransaction7702(walletClient, calls);

    throw new Error("Missing implementation")
}


/**
 * Execute a batched Token → ETH swap (approve + swap + unwrap in 1 tx)
 */
export async function executeBatchedTokenToEthSwap(
    walletClient: WalletClient,
    params: Omit<BatchedSwapParams, 'tokenOut'> & { tokenOut?: Token }
): Promise<TransactionReceipt> {
    const { tokenIn, amountIn, amountOutMinimum, feeTier, recipient } = params;

    const calls: BatchCall[] = [];

    // 1. Approve token for SwapRouter
    calls.push({
        target: tokenIn.id as Address,
        value: 0n,
        calldata: buildApproveCalldata(SWAP_ROUTER_ADDRESS, amountIn),
    });

    // 2. Build multicall for swap + unwrap (SwapRouter handles this internally)
    const swapParams: SwapSingleParams = {
        tokenIn: tokenIn.id as Address,
        tokenOut: WETH_ADDRESS,
        fee: feeTier,
        recipient: SWAP_ROUTER_ADDRESS, // Router receives WETH first
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
    };

    const swapCalldata = buildExactInputSingleCalldata(swapParams);
    const unwrapCalldata = buildUnwrapWethCalldata(0n, recipient);
    const multicallData = buildMulticallCalldata([swapCalldata, unwrapCalldata]);

    calls.push({
        target: SWAP_ROUTER_ADDRESS,
        value: 0n,
        calldata: multicallData,
    });

    //console.log('[BatchedSwap] Executing approve + swap + unwrap in single tx');
    //return executeBatchedTransaction7702(walletClient, calls);

    throw new Error("Missing implementation")
}


/**
 * Check if batched swaps are available for this wallet
 */
export async function isBatchedSwapAvailable(walletClient: WalletClient): Promise<boolean> {
    try {
        return await isWallet7702Supported(walletClient);
    } catch {
        return false;
    }
}


// ==================== TAX ROUTER BATCHED SWAPS ====================

/**
 * Build exactInputSingle calldata for SelectiveTaxRouter
 * Note: TaxRouter requires deadline field unlike SwapRouter02
 */
export function buildTaxRouterSwapCalldata(params: SwapSingleParams): Hex {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

    // TaxRouter has different param order with deadline
    const taxRouterParams = {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        fee: Number(params.fee),
        recipient: params.recipient,
        deadline,
        amountIn: params.amountIn,
        amountOutMinimum: params.amountOutMinimum,
        sqrtPriceLimitX96: params.sqrtPriceLimitX96 ?? 0n,
    };

    return encodeFunctionData({
        abi: SelectiveTaxRouterArtifact.abi,
        functionName: 'exactInputSingle',
        args: [taxRouterParams],
    });
}

export interface BatchedTaxSwapParams {
    tokenIn: Token;
    tokenOut: Token;
    amountIn: bigint;
    amountOutMinimum: bigint;
    feeTier: bigint;
    recipient: Address;
    isEthInput?: boolean;
    isEthOutput?: boolean;
}

/**
 * Execute a batched taxable swap (approve + swap [+ unwrap] in 1 tx)
 * Uses SelectiveTaxRouter instead of SwapRouter
 * Supports: Token→Token, ETH→Token, Token→ETH
 */
export async function executeBatchedTaxSwap(
    walletClient: WalletClient,
    params: BatchedTaxSwapParams
): Promise<TransactionReceipt> {
    const { tokenIn, tokenOut, amountIn, amountOutMinimum, feeTier, recipient, isEthInput, isEthOutput } = params;

    const calls: BatchCall[] = [];

    // 1. If ETH input, deposit to WETH first
    if (isEthInput) {
        calls.push({
            target: WETH_ADDRESS,
            value: amountIn,
            calldata: buildWethDepositCalldata(),
        });
    }

    // 2. Approve token for SelectiveTaxRouter
    const tokenInAddress = isEthInput ? WETH_ADDRESS : tokenIn.id as Address;
    const tokenOutAddress = isEthOutput ? WETH_ADDRESS : tokenOut.id as Address;

    calls.push({
        target: tokenInAddress,
        value: 0n,
        calldata: buildApproveCalldata(SELECTIVE_TAX_ROUTER_ADDRESS, amountIn),
    });

    // 3. Execute swap via TaxRouter
    // If ETH output, recipient is the user's wallet (they'll receive WETH, then unwrap)
    const swapParams: SwapSingleParams = {
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        fee: feeTier,
        recipient, // User receives WETH directly
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
    };

    calls.push({
        target: SELECTIVE_TAX_ROUTER_ADDRESS,
        value: 0n,
        calldata: buildTaxRouterSwapCalldata(swapParams),
    });

    // 4. If ETH output, unwrap WETH to ETH
    if (isEthOutput) {
        // We need to unwrap whatever WETH we received
        // Using amountOutMinimum as the amount to unwrap (safe minimum)
        calls.push({
            target: WETH_ADDRESS,
            value: 0n,
            calldata: buildWethWithdrawCalldata(amountOutMinimum),
        });
    }

    //console.log('[BatchedSwap] Executing taxable swap in single tx, calls:', calls.length);
    //return executeBatchedTransaction7702(walletClient, calls);

    throw new Error("Missing implementation")
}
