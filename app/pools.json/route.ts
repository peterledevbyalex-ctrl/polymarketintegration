import { NextResponse } from 'next/server';
import { gql } from 'graphql-request';

import * as goldsky from '@/server/lib/goldsky';

export const revalidate = 300;

type SubgraphTokenLite = {
    id: string;
    symbol: string;
    name: string;
    decimals: string;
};

type SubgraphPoolLite = {
    id: string;
    feeTier: string;
    token0: SubgraphTokenLite;
    token1: SubgraphTokenLite;
    totalValueLockedUSD: string;
    volumeUSD24h: string;
    feesUSD24h: string;
    apr24h: string;
    lastSwapTimestamp?: string | null;
};

type PoolsJson = {
    name: string;
    timestamp: string;
    pools: SubgraphPoolLite[];
};

async function fetchAllPools(): Promise<SubgraphPoolLite[]> {
    const graphqlClient = goldsky.getGoldskyClient();

    const pageSize = 1000;
    const pools: SubgraphPoolLite[] = [];

    for (let skip = 0; skip < 10_000; skip += pageSize) {
        const query = gql`
            query PoolsPage($first: Int!, $skip: Int!) {
                pools(first: $first, skip: $skip, orderBy: id, orderDirection: asc) {
                    id
                    feeTier
                    totalValueLockedUSD
                    volumeUSD24h
                    feesUSD24h
                    apr24h
                    lastSwapTimestamp
                    token0 { id symbol name decimals }
                    token1 { id symbol name decimals }
                }
            }
        `;

        const data = await graphqlClient.request<{ pools: SubgraphPoolLite[] }>(query, {
            first: pageSize,
            skip,
        });

        const page = data.pools ?? [];
        pools.push(...page);

        if (page.length < pageSize) break;
    }

    return pools;
}

export async function GET(): Promise<NextResponse> {
    const pools = await fetchAllPools();

    const body: PoolsJson = {
        name: 'Prism DEX Pools',
        timestamp: new Date().toISOString(),
        pools,
    };

    return NextResponse.json(body, {
        headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=300',
        },
    });
}
