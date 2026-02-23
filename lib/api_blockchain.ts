
import { createPublicClient, createWalletClient, custom, http, WalletClient, PublicClient } from "viem";

import { CURRENT_CHAIN, RPC_URL } from "@/config.app";
import { SupportedChain } from "@/config/supported_chains";



export function getPublicClient(): PublicClient {
    const publicClient = createPublicClient({
        transport: http(RPC_URL),
        chain: CURRENT_CHAIN,
    }) as unknown as PublicClient

    return publicClient;
}


export function getPublicClient_MultiChain(chain: SupportedChain, rpcUrl?: string): PublicClient {
    const publicClient = createPublicClient({
        transport: http(rpcUrl ?? chain.rpcUrl),
        chain: {
            id: chain.id,
            name: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: { default: { http: [chain.rpcUrl] } },
        },
    }) as unknown as PublicClient

    return publicClient;
}


export function getWalletClient(): WalletClient {
    const walletClient = createWalletClient({
        chain: CURRENT_CHAIN,
        transport: custom(window.ethereum!),
    });

    return walletClient;
}


export async function getWalletAddress(walletClient: WalletClient) {
    const userAddresses = await walletClient.getAddresses();
    const userAddress = userAddresses[0]
    if (!userAddress) throw new Error('missing userAddress');
    return userAddress;
}


