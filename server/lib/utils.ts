
import { Token } from "../../types";


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


export function isValidAddress(address: `0x${string}`): boolean {
    // Vérifier la longueur totale (0x + 40 caractères hexa)
    if (address.length !== 42) {
        return false;
    }

    // Vérifier le préfixe "0x"
    if (!address.startsWith('0x')) {
        return false;
    }

    // Vérifier que les 40 caractères restants sont bien hexadécimaux
    const hexPart = address.slice(2);
    return /^[0-9a-fA-F]{40}$/.test(hexPart);
}


