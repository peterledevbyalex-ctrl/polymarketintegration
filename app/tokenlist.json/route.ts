import { NextResponse } from 'next/server';
import { gql } from 'graphql-request';

import { CURRENT_CHAIN } from '@/config.app';
import * as goldsky from '@/server/lib/goldsky';
import { knownTokens } from '@/server/lib/tokens_logos';

type SubgraphTokenLite = {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
};

type TokenListToken = {
    chainId: number;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
};

type TokenList = {
    name: string;
    timestamp: string;
    version: { major: number; minor: number; patch: number };
    tokens: TokenListToken[];
};

export const revalidate = 300;

type FasterzTokenA = {
    wrapperAddress: string;
    logoUrl: string;
};

type FasterzTokenB = {
    id: string;
    image_url: string;
};

type FasterzResponse = {
    success: boolean;
    tokens?: Array<FasterzTokenA | FasterzTokenB>;
};

async function fetchFasterzLogoMap(): Promise<Map<string, string>> {
    try {
        const response = await fetch('https://www.fasterz.fun/api/tokens', {
            headers: { Accept: 'application/json' },
            next: { revalidate: 300 },
        });

        if (!response.ok) return new Map();
        const data = (await response.json()) as FasterzResponse;
        if (!data?.success || !Array.isArray(data.tokens)) return new Map();

        const map = new Map<string, string>();
        for (const token of data.tokens) {
            const address = (
                'wrapperAddress' in token ? token.wrapperAddress : token.id
            )?.toLowerCase();
            const logo = (
                'logoUrl' in token ? token.logoUrl : token.image_url
            );

            if (!address || !logo) continue;
            map.set(address, logo);
        }

        return map;
    } catch {
        return new Map();
    }
}

async function fetchAllSubgraphTokens(): Promise<SubgraphTokenLite[]> {
    const graphqlClient = goldsky.getGoldskyClient();

    const pageSize = 1000;
    const tokens: SubgraphTokenLite[] = [];

    for (let skip = 0; skip < 10_000; skip += pageSize) {
        const query = gql`
            query TokensPage($first: Int!, $skip: Int!) {
                tokens(first: $first, skip: $skip, orderBy: id, orderDirection: asc) {
                    id
                    symbol
                    name
                    decimals
                }
            }
        `;

        const data = await graphqlClient.request<{ tokens: SubgraphTokenLite[] }>(query, {
            first: pageSize,
            skip,
        });

        const page = data.tokens ?? [];
        tokens.push(...page);

        if (page.length < pageSize) break;
    }

    return tokens;
}

export async function GET(): Promise<NextResponse> {
    const subgraphTokens = await fetchAllSubgraphTokens();
    const fasterzLogoMap = await fetchFasterzLogoMap();

    const chainId = CURRENT_CHAIN.id;

    const tokens: TokenListToken[] = subgraphTokens
        .map((t) => {
            const address = t.id.toLowerCase();
            const decimals = Number(t.decimals);

            if (!address.startsWith('0x') || address.length !== 42) return null;
            if (!Number.isFinite(decimals)) return null;

            const hasLogo = Boolean(knownTokens[address]?.logoUri ?? fasterzLogoMap.get(address));
            const logoURI = hasLogo ? `/api/tokens/logo?tokenAddress=${address}` : undefined;

            return {
                chainId,
                address,
                symbol: t.symbol,
                name: t.name,
                decimals,
                ...(logoURI ? { logoURI } : {}),
            } satisfies TokenListToken;
        })
        .filter((t): t is TokenListToken => Boolean(t));

    const tokenList: TokenList = {
        name: 'Prism DEX Token List',
        timestamp: new Date().toISOString(),
        version: { major: 1, minor: 0, patch: 0 },
        tokens,
    };

    return NextResponse.json(tokenList, {
        headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=300',
        },
    });
}
