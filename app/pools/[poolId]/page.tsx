import React, { cache } from 'react';

import type { Metadata, ResolvingMetadata } from 'next';

import * as goldsky from '@/server/lib/goldsky';
import * as apiRoute from '@/app/api/[...path]/api';

import { formatNumber, isValidAddress } from '@/lib/ui_utils';

import { PoolViewComponent } from './_components/PoolViewComponent';

import type { SubgraphPool, Token } from '@/types';


type PoolViewPageProps = {
    params: Promise<{ poolId: `0x${string}`, pool: SubgraphPool | null }>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
}


const getPool = cache(async (poolAddress: string): Promise<SubgraphPool | null> => {
    //console.log('CALL getPool')
    const graphqlClient = goldsky.getGoldskyClient();
    const pool = await goldsky.getPoolById(graphqlClient, poolAddress);
    return pool;
});


export async function generateMetadata({ params, searchParams }: PoolViewPageProps, parent: ResolvingMetadata): Promise<Metadata> {
    const { poolId: poolAddress } = await params
    const pool = await getPool(poolAddress);

    const token0 = pool.token0.symbol;
    const token1 = pool.token1.symbol;
    const tvl = pool.totalValueLockedUSD;
    const apr = "-";

    return {
        title: `Prism DEX - Pool ${pool ? `${pool.token0.symbol}/${pool.token1.symbol}` : poolAddress}`,
        description: `Provide liquidity to the ${token0}/${token1} pool on MegaETH. Current TVL: $${formatNumber(tvl)}, APR: ${apr}. Earn trading fees by depositing your tokens into this liquidity pool.`,
        keywords: `${token0} ${token1} pool, ${token0}/${token1} liquidity, DeFi pool, liquidity mining, yield farming`,
        openGraph: {
            title: `${token0}/${token1} Liquidity Pool`,
            description: `TVL: $${tvl} | APR: ${apr}`,
        },
    }
}



const PoolViewPage: React.FC<PoolViewPageProps> = async ({ params }) => {
    //console.log('params:', await params)
    const { poolId: poolAddress } = await params;

    if (!poolAddress || !isValidAddress(poolAddress)) return <>Pool not found</>;

    const pool = await getPool(poolAddress);

    const tokens: Token[] = await apiRoute.getTokensListCached();

    if (!pool) return <>Pool not found</>;

    return (
        <>
            <PoolViewComponent pool={pool} tokens={tokens} />
        </>
    );
}



export default PoolViewPage
