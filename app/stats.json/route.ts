import { NextResponse } from 'next/server';

import * as goldsky from '@/server/lib/goldsky';

export const revalidate = 60;

type StatsJson = {
    name: string;
    timestamp: string;
    ethPriceUSD: string;
    totalValueLockedUSD: string;
    totalValueLockedETH: string;
    volumeUSD24h: string;
    feesUSD24h: string;
    apr24h: string;
    poolCount: string;
    txCount: string;
};

export async function GET(): Promise<NextResponse> {
    const graphqlClient = goldsky.getGoldskyClient();

    const [bundle, factory] = await Promise.all([
        goldsky.getBundle(graphqlClient),
        goldsky.getFactory(graphqlClient),
    ]);

    const body: StatsJson = {
        name: 'Prism DEX Stats',
        timestamp: new Date().toISOString(),
        ethPriceUSD: bundle?.ethPriceUSD ?? '0',
        totalValueLockedUSD: factory.totalValueLockedUSD,
        totalValueLockedETH: factory.totalValueLockedETH,
        volumeUSD24h: factory.volumeUSD24h,
        feesUSD24h: factory.feesUSD24h,
        apr24h: factory.apr24h,
        poolCount: factory.poolCount,
        txCount: factory.txCount,
    };

    return NextResponse.json(body, {
        headers: {
            'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
        },
    });
}
