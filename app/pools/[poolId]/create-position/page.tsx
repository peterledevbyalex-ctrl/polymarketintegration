import React, { cache } from 'react'
import type { Metadata, ResolvingMetadata } from 'next';

import * as goldsky from '@/server/lib/goldsky';
import { isValidAddress } from '@/server/lib/utils';
import * as apiRoute from '@/app/api/[...path]/api';

import { PoolCreatePositionComponent } from './_components/PoolCreatePositionComponent';

import type { SubgraphPool, Token } from '@/types';


type PoolCreatePositionPageProps = {
    params: Promise<{ poolId: `0x${string}`, pool: SubgraphPool | null }>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
}


const getPool = cache(async (poolAddress: string): Promise<SubgraphPool | null> => {
    //console.log('CALL getPool')
    const graphqlClient = goldsky.getGoldskyClient();
    const pool = await goldsky.getPoolById(graphqlClient, poolAddress);
    return pool;
});


export async function generateMetadata({ params, searchParams }: PoolCreatePositionPageProps, parent: ResolvingMetadata): Promise<Metadata> {
    const { poolId: poolAddress } = await params
    const pool = await getPool(poolAddress);

    return {
        title: `Prism DEX - Pool ${pool ? `${pool.token0.symbol}/${pool.token1.symbol}` : poolAddress} - Create new Position`,
        description: 'Welcome to Prism DEX',
    }
}


const PoolCreatePositionPage: React.FC<PoolCreatePositionPageProps> = async ({ params }) => {
    //console.log('params:', await params)
    const { poolId: poolAddress } = await params;

    if (!poolAddress || !isValidAddress(poolAddress)) return <>Pool not found</>;

    const pool = await getPool(poolAddress);

    const tokens: Token[] = await apiRoute.getTokensListCached();

    return (
        <>
            <PoolCreatePositionComponent pool={pool} tokens={tokens} />
        </>
    );
}


export default PoolCreatePositionPage
