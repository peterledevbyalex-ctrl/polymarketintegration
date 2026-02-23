
import React from 'react'

import * as apiRoute from '@/app/api/[...path]/api';

import { PoolsComponent } from './_components/PoolsComponent';

import type { DexDayDatas, SubgraphPool, Token } from '@/types';


type PoolsPageProps = {
    params: Promise<{}>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
}


export const metadata /* Metadata */ = {
    title: 'Prism DEX - Liquidity Pools',
    description: 'Provide liquidity and earn fees on MegaETH. Explore active pools, track your positions, and maximize your DeFi yields with our liquidity mining programs.',
    keywords: 'liquidity pools, yield farming, LP tokens, provide liquidity, DeFi earnings, MegaETH pools',

}


const PoolsPage: React.FC<PoolsPageProps> = async ({ searchParams }) => {
    const pools: SubgraphPool[] = await apiRoute.getPoolsListCached();

    const tokens: Token[] = await apiRoute.getTokensListCached();

    const factory = await apiRoute.getFactoryCached();

    const factoryDayDatas: DexDayDatas[] = await apiRoute.getFactoryDayDatasCached(30);

    const searchParamsAwaited = await searchParams;
    const queryFilter = searchParamsAwaited.q?.toString() ?? '';

    return (
        <>
            <PoolsComponent pools={pools} tokens={tokens} queryFilter={queryFilter} factory={factory} factoryDayDatas={factoryDayDatas} />
        </>
    )
}

export default PoolsPage
