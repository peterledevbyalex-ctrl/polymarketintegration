
import { GteToken } from "@/types";


export async function searchTokens(q = ""): Promise<GteToken[]> {
    const url = `https://api-testnet.gte.xyz/v1/tokens/search?q=${q}`

    const response = await fetch(url)
    const result = await response.json() as GteToken[];

    return result;
}


