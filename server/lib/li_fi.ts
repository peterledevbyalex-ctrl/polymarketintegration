
import { CURRENT_CHAIN } from "@/config.app";
import { Hex } from "viem";


const liFiApiKey = process.env.LIFI_API_KEY;
if (!liFiApiKey) {
    throw new Error('Missing env var: LIFI_API_KEY');
}


type LiFiChain = {
    key: string
    chainType: string
    name: string
    coin: string
    id: number
    mainnet: boolean
    logoURI: string
    tokenlistUrl: string
    multicallAddress: string
    relayerSupported: boolean
    metamask: {
        chainId: string
        blockExplorerUrls: Array<string>
        chainName: string
        nativeCurrency: {
            name: string
            symbol: string
            decimals: number
        }
        rpcUrls: Array<string>
    }
    nativeToken: {
        address: string
        chainId: number
        symbol: string
        decimals: number
        name: string
        coinKey: string
        logoURI: string
        priceUSD: string
    }
    diamondAddress: string
    permit2: string
    permit2Proxy: string
}


type LiFiToken = {
    chainId: number,
    address: string,
    symbol: string,
    name: string,
    decimals: number,
    priceUSD: string,
    logoURI: string,
}


export async function getChains(): Promise<LiFiChain[]> {
    const options = { method: 'GET', headers: { 'x-lifi-api-key': liFiApiKey } };

    const response = await fetch(`https://li.quest/v1/chains`, options)
    const result = await response.json() as { chains: LiFiChain[] };
    const chains: LiFiChain[] = result.chains;

    return chains;
}

export async function getKnownTokens(): Promise<LiFiToken[]> {
    const chainId = CURRENT_CHAIN.id;
    const options = { method: 'GET', headers: { 'x-lifi-api-key': liFiApiKey } };

    const response = await fetch(`https://li.quest/v1/tokens?chains=${chainId}`, options)
    const result = await response.json() as { tokens: Record<`${number}`, LiFiToken[]> };
    const tokens: LiFiToken[] = result.tokens[chainId];

    return tokens;
}


export async function getToken(tokenAddress: string | Hex): Promise<LiFiToken | null> {
    const chainId = CURRENT_CHAIN.id;
    const options = { method: 'GET', headers: { 'x-lifi-api-key': liFiApiKey } };

    const response = await fetch(`https://li.quest/v1/token?chain=${chainId}&token=${tokenAddress}`, options)
    const token: LiFiToken | null = await response.json() ?? null;

    return token;
}

