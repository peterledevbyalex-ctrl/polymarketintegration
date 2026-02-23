
import { formatUnits, WalletClient, erc20Abi, TransactionReceipt, createPublicClient, http, PublicClient } from "viem";

import * as apiBlockchain from '@/lib/api_blockchain';
import { CURRENT_CHAIN, ETH_ADDRESS, RPC_URL } from "@/config.app";

import { Token } from "@/types";
import { isTokenETH } from "./tokens_utils";


const publicClient = createPublicClient({
    chain: CURRENT_CHAIN,
    transport: http(RPC_URL),
})



/* ############## */
/* READ FUNCTIONS */
/* ############## */


export async function getTokenBalance(tokenAddress: `0x${string}` | null | undefined, userAddress: `0x${string}`): Promise<bigint> {
    if (!tokenAddress || isTokenETH(tokenAddress)) {
        // ETH
        const balanceRaw = await publicClient.getBalance({ address: userAddress });

        return balanceRaw;

    } else {
        // Vérifier le solde du token d'entrée
        const balanceRaw = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [userAddress],
        } as any) as bigint;

        return balanceRaw;
    }
}


export async function getTokenBalance_MultiChain(publicClient: PublicClient, tokenAddress: `0x${string}` | null | undefined, userAddress: `0x${string}`): Promise<bigint> {
    if (!tokenAddress || isTokenETH(tokenAddress)) {
        // ETH
        const balanceRaw = await publicClient.getBalance({ address: userAddress });

        return balanceRaw;

    } else {
        // Vérifier le solde du token d'entrée
        const balanceRaw = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [userAddress],
        } as any) as bigint;

        return balanceRaw;
    }
}


export async function getTokenInfos(tokenAddress: `0x${string}`) {
    const [symbol, name, decimals] = await Promise.all([
        publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'symbol',
            authorizationList: undefined,
        }),
        publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'name',
            authorizationList: undefined,
        }),
        publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'decimals',
            authorizationList: undefined,
        }),
    ]);

    const token: Token = {
        id: tokenAddress,
        symbol,
        name,
        decimals,
    };

    return token;
}



export async function getTokenAllowance(tokenAddress: `0x${string}`, allower: `0x${string}`, allowed: `0x${string}`): Promise<bigint> {

    const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [allower, allowed],
        authorizationList: undefined,
    });

    return allowance;
}


export async function getUserTokenBalance(token: Token | null | undefined, userAddress: `0x${string}`): Promise<string> {
    const tokenAddress = token ? token.id : null;
    const tokenDecimals = token ? token.decimals : 18;

    const balanceRaw = await getTokenBalance(tokenAddress ?? null, userAddress);
    const balance = formatUnits(balanceRaw, tokenDecimals);
    return balance;
}





/* ############### */
/* WRITE FUNCTIONS */
/* ############### */


export async function approveToken(walletClient: WalletClient, tokenAddress: `0x${string}`, allowed: `0x${string}`, amountAllowed: bigint): Promise<TransactionReceipt> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const approveHash = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [allowed, amountAllowed],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });


    const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
    return receipt;
}



export async function transferEth(walletClient: WalletClient, recipientAddress: `0x${string}`, amount: bigint): Promise<TransactionReceipt> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    // Transfer ETH
    const transferHash = await walletClient.sendTransaction({
        account: userAddress,
        to: recipientAddress,
        value: amount,
        chain: CURRENT_CHAIN,
        kzg: undefined,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
    return receipt;
}


export async function transferToken(walletClient: WalletClient, tokenAddress: `0x${string}`, recipientAddress: `0x${string}`, amount: bigint): Promise<TransactionReceipt> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    if (tokenAddress === ETH_ADDRESS) {
        return transferEth(walletClient, recipientAddress, amount);
    }

    // Transfer ERC20 token
    const transferHash = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress, amount],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transferHash });
    return receipt;
}
