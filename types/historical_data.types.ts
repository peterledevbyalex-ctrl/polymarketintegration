

export type DexDayDatas = {
    date: number;
    volumeUSD: string;
    volumeETH: string;
    tvlUSD: string;
    feesUSD: string;
    txCount: string;
    swapCount: string;
    apr: string;
    apr24h: string;
}


export type DexHourDatas = {
    periodStartUnix: string;
    volumeUSD: string;
    volumeETH: string;
    tvlUSD: string;
    feesUSD: string;
    txCount: string;
    swapCount: string;
    apr: string;
    apr24h: string;
}


export type PoolDayData = {
    timestamp: number;
    date?: number;
    sqrtPrice: string
    token0Price: string;
    token1Price: string;
    tvlUSD: string;
    volumeUSD: string;
    volumeToken0: string;
    volumeToken1: string;
    feesUSD: string;
    liquidity: string;
    txCount: string;
    swapCount: string;
    apr: string;
    apr24h: string;
    open: string;
    high: string;
    low: string;
    close: string;
}



export type PoolHourData = {
    timestamp: number;
    periodStartUnix?: string;
    sqrtPrice: string
    token0Price: string;
    token1Price: string;
    tvlUSD: string;
    volumeUSD: string;
    volumeToken0: string;
    volumeToken1: string;
    feesUSD: string;
    liquidity: string;
    txCount: string;
    swapCount: string;
    apr: string;
    apr24h: string;
    open: string;
    high: string;
    low: string;
    close: string;
}



export type TokenDayData = {
    date: string;
    sqrtPrice: string
    token0Price: string;
    token1Price: string;
    tvlUSD: string;
    volumeUSD: string;
    volumeToken0: string;
    volumeToken1: string;
    feesUSD: string;
    liquidity: string;
    open: string;
    high: string;
    low: string;
    close: string;
    txCount: string;
    swapCount: string;
}



export type TokenHourData = {
    periodStartUnix: string;
    sqrtPrice: string
    token0Price: string;
    token1Price: string;
    tvlUSD: string;
    volumeUSD: string;
    volumeToken0: string;
    volumeToken1: string;
    feesUSD: string;
    liquidity: string;
    open: string;
    high: string;
    low: string;
    close: string;
    txCount: string;
    swapCount: string;
}

