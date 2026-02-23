
import { formatUnits } from "viem";

import { BLOCKSCOUT_ENDPOINT } from "../config.server";

import type { Token } from "../../types";


export async function getUserTokens(userAddress: string): Promise<Token[]> {
    // https://megaeth-testnet-v2.blockscout.com/api/v2/addresses/0xCCF8BA457dCad7eE6A0361c96846a0f79744b113/tokens?type=ERC-20

    //const url = `https://megaeth-testnet.blockscout.com/api/v2/addresses/${userAddress}/tokens?type=ERC-20`; // Testnet v1
    //const url = `https://megaeth-testnet-v2.blockscout.com/api/v2/addresses/${userAddress}/tokens?type=ERC-20`; // Testnet v2
    const url = `${BLOCKSCOUT_ENDPOINT}/v2/addresses/${userAddress}/tokens?type=ERC-20`; // Testnet v2

    const response = await fetch(url)
    const result = await response.json() as { items: { token: { address_hash: `0x${string}`, decimals: string, name: string, symbol: string }, value: string }[] };

    const tokens: Token[] = result.items.map(i => ({
        id: i.token.address_hash,
        name: i.token.name,
        symbol: i.token.symbol,
        decimals: Number(i.token.decimals),
        userBalance: formatUnits(BigInt(i.value), Number(i.token.decimals)),
    }));

    return tokens;
}

