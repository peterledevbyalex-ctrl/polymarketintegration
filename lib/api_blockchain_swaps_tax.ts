/**
 * API for SelectiveTaxRouter contract interactions
 * Handles swaps for taxable tokens through our custom router
 */

import { createPublicClient, http, WalletClient, TransactionReceipt, Address, parseUnits } from "viem";

import * as apiBlockchain from '@/lib/api_blockchain';
import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';
import { CURRENT_CHAIN, RPC_URL, SELECTIVE_TAX_ROUTER_ADDRESS, WETH_ADDRESS } from "@/config.app";

import SelectiveTaxRouterArtifact from '@/../SelectiveTaxRouterAudited/SelectiveTaxRouter.json';

import type { SwapSingleParams } from "@/types";

const SelectiveTaxRouterAbi = SelectiveTaxRouterArtifact.abi;

const publicClient = createPublicClient({
    chain: CURRENT_CHAIN,
    transport: http(RPC_URL),
});


// ==================== READ FUNCTIONS ====================

export interface TokenTaxConfig {
    isTaxable: boolean;
    vault: Address;
    taxRate: bigint;
}

/**
 * Check if a token is configured as taxable in the SelectiveTaxRouter
 */
export async function getTokenTaxConfig(tokenAddress: Address): Promise<TokenTaxConfig> {
    const result = await publicClient.readContract({
        address: SELECTIVE_TAX_ROUTER_ADDRESS,
        abi: SelectiveTaxRouterAbi,
        functionName: 'getTokenTaxConfig',
        args: [tokenAddress],
        authorizationList: undefined,
    }) as [boolean, Address, bigint];

    return {
        isTaxable: result[0],
        vault: result[1],
        taxRate: result[2],
    };
}


/**
 * Check if a specific swap would be taxed (V2: checks both tokenIn and tokenOut)
 */
export async function willBeTaxed(tokenIn: Address, tokenOut: Address, userAddress: Address): Promise<boolean> {
    const result = await publicClient.readContract({
        address: SELECTIVE_TAX_ROUTER_ADDRESS,
        abi: SelectiveTaxRouterAbi,
        functionName: 'willBeTaxed',
        args: [tokenIn, tokenOut, userAddress],
        authorizationList: undefined,
    }) as boolean;

    return result;
}


/**
 * Calculate tax for a given swap amount (V2: checks both tokenIn and tokenOut)
 */
export async function calculateTax(
    tokenIn: Address,
    tokenOut: Address,
    userAddress: Address,
    amountIn: bigint
): Promise<{ taxAmount: bigint; swapAmount: bigint; vault: Address }> {
    const result = await publicClient.readContract({
        address: SELECTIVE_TAX_ROUTER_ADDRESS,
        abi: SelectiveTaxRouterAbi,
        functionName: 'calculateTax',
        args: [tokenIn, tokenOut, userAddress, amountIn],
        authorizationList: undefined,
    }) as [bigint, bigint, Address];

    return {
        taxAmount: result[0],
        swapAmount: result[1],
        vault: result[2],
    };
}


/**
 * Check if an address is tax exempt
 */
export async function isTaxExempt(account: Address): Promise<boolean> {
    const result = await publicClient.readContract({
        address: SELECTIVE_TAX_ROUTER_ADDRESS,
        abi: SelectiveTaxRouterAbi,
        functionName: 'isTaxExempt',
        args: [account],
        authorizationList: undefined,
    }) as boolean;

    return result;
}


// ==================== WRITE FUNCTIONS ====================

/**
 * Execute exactInputSingle swap through SelectiveTaxRouter
 * Tax is automatically deducted for taxable tokens
 */
export async function swapExactInputSingle(
    walletClient: WalletClient,
    swapParams: SwapSingleParams
): Promise<TransactionReceipt> {
    //console.log('Executing SelectiveTaxRouter exactInputSingle');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

    const params = {
        tokenIn: swapParams.tokenIn,
        tokenOut: swapParams.tokenOut,
        fee: Number(swapParams.fee),
        recipient: swapParams.recipient,
        deadline,
        amountIn: swapParams.amountIn,
        amountOutMinimum: swapParams.amountOutMinimum,
        sqrtPriceLimitX96: swapParams.sqrtPriceLimitX96 ?? 0n,
    };

    const hash = await walletClient.writeContract({
        address: SELECTIVE_TAX_ROUTER_ADDRESS,
        abi: SelectiveTaxRouterAbi,
        functionName: 'exactInputSingle',
        args: [params],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt;
}


/**
 * Execute exactOutputSingle swap through SelectiveTaxRouter
 * Tax is automatically added on top for taxable tokens
 */
export async function swapExactOutputSingle(
    walletClient: WalletClient,
    params: {
        tokenIn: Address;
        tokenOut: Address;
        fee: bigint;
        recipient: Address;
        amountOut: bigint;
        amountInMaximum: bigint;
        sqrtPriceLimitX96?: bigint;
    }
): Promise<TransactionReceipt> {
    //console.log('Executing SelectiveTaxRouter exactOutputSingle');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 minutes

    const swapParams = {
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        fee: Number(params.fee),
        recipient: params.recipient,
        deadline,
        amountOut: params.amountOut,
        amountInMaximum: params.amountInMaximum,
        sqrtPriceLimitX96: params.sqrtPriceLimitX96 ?? 0n,
    };

    const hash = await walletClient.writeContract({
        address: SELECTIVE_TAX_ROUTER_ADDRESS,
        abi: SelectiveTaxRouterAbi,
        functionName: 'exactOutputSingle',
        args: [swapParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt;
}


/**
 * Approve token spending for SelectiveTaxRouter
 */
export async function approveTokenForTaxRouter(
    walletClient: WalletClient,
    tokenAddress: Address,
    amount?: bigint
): Promise<TransactionReceipt | null> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    const approvalAmount = amount ?? 2n ** 256n - 1n;

    const allowance = await apiBlockchainTokens.getTokenAllowance(
        tokenAddress,
        userAddress,
        SELECTIVE_TAX_ROUTER_ADDRESS
    );

    if (allowance < approvalAmount) {
        //console.log('Approving token for SelectiveTaxRouter...');
        const receipt = await apiBlockchainTokens.approveToken(
            walletClient,
            tokenAddress,
            SELECTIVE_TAX_ROUTER_ADDRESS,
            approvalAmount
        );
        //console.log('Token approved for SelectiveTaxRouter');
        return receipt;
    }

    return null;
}


/**
 * Check if SelectiveTaxRouter is enabled (address is set and not zero)
 */
export function isTaxRouterEnabled(): boolean {
    return (
        SELECTIVE_TAX_ROUTER_ADDRESS !== '0x0000000000000000000000000000000000000000' &&
        SELECTIVE_TAX_ROUTER_ADDRESS !== undefined
    );
}
