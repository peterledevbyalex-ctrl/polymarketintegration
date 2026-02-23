
import { Address } from "viem";


export interface Token {
    id: Address
    symbol: string
    name: string
    decimals: number
    userBalance?: string
    logoUri?: string
    derivedETH?: string | undefined
    derivedUSD?: string | undefined
    volumeUSD?: string
    volumeUSD24h?: string
    txCount?: string
}


export interface SubgraphToken {
    id: Address;                   // Adresse du token
    symbol: string;
    name: string;
    decimals: string;
    volume: string;
    volumeUSD: string;
    txCount: string;
    swapCount: string;
    poolCount: string;
    derivedETH: string;
    totalSupply: string;
    totalValueLocked: string;
    totalValueLockedUSD: string;
}


export interface GteToken {
    address: string
    decimals: number
    logoUri: string
    marketCapUsd: number
    marketType: string
    name: string
    priceUsd: number
    symbol: string
    totalSupply: number
    volume1HrUsd: number
    volume24HrUsd: number
}

