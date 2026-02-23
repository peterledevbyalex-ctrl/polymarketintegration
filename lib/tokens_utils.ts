
import { ETH_ADDRESS, USDC_ADDRESS, WETH_ADDRESS } from "@/config.app";
import { Token } from "@/types";
import { Address } from "viem";


export function excludeTokens(tokens: Token[], excludedIds: `0x${string}`[]): Token[] {
    excludedIds = excludedIds.map(id => id.toLowerCase() as `0x${string}`);

    tokens = tokens.filter(t => !excludedIds.includes(t.id.toLowerCase() as `0x${string}`));
    return tokens;
}


export function dedupTokens(tokens: Token[]): Token[] {
    const seen = new Set<string>;

    const tokensFiltered = tokens.filter(token => {
        if (seen.has(token.id.toLowerCase())) {
            return false;
        }

        seen.add(token.id.toLowerCase());
        return true;
    })

    return tokensFiltered
}


export function isSameAddress(address1: Address, address2: Address) {
    return address1.toLowerCase() === address2.toLowerCase();
}

export function isTokenETH(tokenAddress: Address) {
    return tokenAddress.toLowerCase() === ETH_ADDRESS.toLowerCase();
}

export function isTokenWETH(tokenAddress: Address) {
    return tokenAddress.toLowerCase() === WETH_ADDRESS.toLowerCase();
}

export function isTokenUSDC(tokenAddress: Address) {
    return tokenAddress.toLowerCase() === USDC_ADDRESS.toLowerCase();
}

