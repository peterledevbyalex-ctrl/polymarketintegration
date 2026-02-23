
import { getIntrospectionQuery, buildClientSchema, printSchema } from 'graphql';
import { GraphQLClient, gql } from 'graphql-request';

import { GOLDSKY_ENDPOINT } from '../config.server';

import type { SubgraphPool, SubgraphPosition, PoolDayData, DexDayDatas, SubgraphSwap, SubgraphToken, PoolHourData, TokenHourData, TokenDayData, DexHourDatas, SubgraphFactory } from '../../types';


// Créer le client GraphQL
export function getGoldskyClient(): GraphQLClient {
    const graphqlClient = new GraphQLClient(GOLDSKY_ENDPOINT);
    return graphqlClient
}


export async function exploreSchema(graphqlClient: GraphQLClient) {
    const introspectionQuery = getIntrospectionQuery();
    const result = await graphqlClient.request(introspectionQuery);

    const schema = buildClientSchema(result as any);
    //console.log(printSchema(schema));

    return schema;
}



const tokenResult = `{
    id
    symbol
    name
    decimals
}`;

const tokenDetailedResult = `{
    id
    symbol
    name
    decimals
    volume
    volumeUSD
    txCount
    swapCount
    poolCount
    derivedETH
    totalSupply
    totalValueLocked
    totalValueLockedUSD
}`;

const poolResult = `{
    id
    token0 ${tokenResult}
    token1 ${tokenResult}
    feeTier
    liquidity
    sqrtPrice
    tick
    token0Price
    token1Price
    volumeUSD
    txCount
    swapCount
    apr24h
    volumeUSD24h
    feesUSD24h
    totalValueLockedUSD
    createdAtTimestamp
    lastSwapTimestamp
    volumeToken0
    volumeToken1
    totalValueLockedToken0
    totalValueLockedToken1
    feeGrowthGlobal0X128
    feeGrowthGlobal1X128
}`;

const positionResult = `{
    id
    owner
    liquidity
    tickLower
    tickUpper
    amountDepositedUSD
    depositedToken0
    depositedToken1
    withdrawnToken0
    withdrawnToken1
    collectedFeesToken0
    collectedFeesToken1
    feeGrowthInside0LastX128
    feeGrowthInside1LastX128
    pool ${poolResult}
}`;

const swapResult = `{
    id
    transaction {
        id
        timestamp
    }
    sender
    recipient
    amount0
    amount1
    amountUSD
    sqrtPriceX96
    tick
    pool ${poolResult}
}`;




// ============================================
// FONCTIONS POUR LES POOLS
// ============================================


export async function getPools(
    graphqlClient: GraphQLClient,
    first: number = 100,
    orderBy: 'totalValueLockedUSD' | 'volumeUSD' | 'txCount' = 'totalValueLockedUSD'
): Promise<SubgraphPool[]> {
    const query = gql`
      query getPools($first: Int!, $orderBy: String!) {
        pools(
          first: $first
          orderBy: $orderBy
          orderDirection: desc
        ) ${poolResult}
      }
    `;

    const data = await graphqlClient.request<{ pools: SubgraphPool[] }>(query, {
        first,
        orderBy,
    });

    return data.pools;
}



export async function getPoolsForPair(
    graphqlClient: GraphQLClient,
    tokenA: string,
    tokenB: string
): Promise<SubgraphPool[]> {
    // Normaliser les adresses en lowercase
    const tokenA_Lower = tokenA.toLowerCase();
    const tokenB_Lower = tokenB.toLowerCase();

    // Uniswap trie toujours les tokens par adresse
    const [token0, token1] = tokenA_Lower < tokenB_Lower ? [tokenA_Lower, tokenB_Lower] : [tokenB_Lower, tokenA_Lower];

    const query = gql`
      query getPoolsForPair($token0: String!, $token1: String!) {
        pools(
          where: {
            token0: $token0
            token1: $token1
          }
        ) ${poolResult}
      }
    `;

    //console.log(now() + ' goldsky.getPoolsForPair START')

    const data = await graphqlClient.request<{ pools: SubgraphPool[] }>(query, {
        token0,
        token1,
    });

    //console.log(now() + ' goldsky.getPoolsForPair END')

    return data.pools;
}


export async function getPoolById(graphqlClient: GraphQLClient, poolAddress: string): Promise<SubgraphPool | null> {
    const query = gql`
      query GetPoolById($id: ID!) {
        pool(id: $id) ${poolResult}
      }
    `;

    //console.log(now() + ' goldsky.getPoolById START')

    const data = await graphqlClient.request<{ pool: SubgraphPool | null }>(query, {
        id: poolAddress.toLowerCase(),
    });

    //console.log(now() + ' goldsky.getPoolById END')

    return data.pool;
}



// ============================================
// FONCTIONS POUR LES TOKENS
// ============================================


export async function searchToken(graphqlClient: GraphQLClient, search: string): Promise<SubgraphToken[]> {
    const query = gql`
      query searchToken($search: String!) {
        tokens(
          where: {
            or: [
              { symbol_contains_nocase: $search }
              { name_contains_nocase: $search }
              { id: $search }
            ]
          }
          first: 10
        ) ${tokenDetailedResult}
      }
    `;

    //console.log(now() + ' goldsky.searchToken START')

    const data = await graphqlClient.request<{ tokens: SubgraphToken[] }>(query, {
        search: search.toLowerCase(),
    });

    //console.log(now() + ' goldsky.searchToken END')

    return data.tokens;
}


export async function getTopTokens(graphqlClient: GraphQLClient, first: number = 50): Promise<SubgraphToken[]> {
    const query = gql`
      query getTopTokens($first: Int!) {
        tokens(
          first: $first
          orderBy: totalValueLockedUSD
          orderDirection: desc
        ) ${tokenDetailedResult}
      }
    `;

    //console.log(now() + ' goldsky.getTopTokens START')

    const data = await graphqlClient.request<{ tokens: SubgraphToken[] }>(query, {
        first,
    });

    //console.log(now() + ' goldsky.getTopTokens END')

    return data.tokens;
}



// ============================================
// FONCTIONS POUR LES POSITIONS
// ============================================


export async function getUserPositions(graphqlClient: GraphQLClient, userAddress: `0x${string}`, poolAddress?: `0x${string}`): Promise<SubgraphPosition[]> {
    let where = ["owner: $owner"];

    if (poolAddress) {
        where.push(`pool: "${poolAddress}"`);
    }

    const query = gql`
      query getUserPositions($owner: String!) {
        positions(
          where: { ${where.join(', ')} }
          orderBy: liquidity
          orderDirection: desc
        ) ${positionResult}
      }
    `;

    //console.log(now() + ' goldsky.getUserPositions START')

    const data = await graphqlClient.request<{ positions: SubgraphPosition[] }>(query, {
        owner: userAddress.toLowerCase(),
    });

    //console.log(now() + ' goldsky.getUserPositions END')

    return data.positions;
}


export async function getPositionById(graphqlClient: GraphQLClient, positionId: string): Promise<SubgraphPosition | null> {
    const query = gql`
      query getPositionById($id: ID!) {
        position(id: $id) ${positionResult}
      }
    `;

    //console.log(now() + ' goldsky.getPositionById START')

    const data = await graphqlClient.request<{ position: SubgraphPosition | null }>(query, {
        id: positionId,
    });

    //console.log(now() + ' goldsky.getPositionById END')

    return data.position;
}



// ============================================
// FONCTIONS POUR LES SWAPS / HISTORIQUE
// ============================================


export async function getPoolSwaps(graphqlClient: GraphQLClient, poolAddress: string, first = 50): Promise<SubgraphSwap[]> {
    const query = gql`
      query getPoolSwaps($pool: String!, $first: Int!) {
        swaps(
          where: { pool: $pool }
          first: $first
          orderBy: timestamp
          orderDirection: desc
        ) ${swapResult}
      }
    `;

    //console.log(now() + ' goldsky.getPoolSwaps START')

    const data = await graphqlClient.request<{ swaps: SubgraphSwap[] }>(query, {
        pool: poolAddress.toLowerCase(),
        first,
    });

    //console.log(now() + ' goldsky.getPoolSwaps END')

    return data.swaps;
}


export async function getUserSwaps(graphqlClient: GraphQLClient, userAddress: string, first = 50): Promise<SubgraphSwap[]> {
    const query = gql`
      query getUserSwaps($sender: String!, $first: Int!) {
        swaps(
          where: { sender: $sender }
          first: $first
          orderBy: timestamp
          orderDirection: desc
        ) ${swapResult}
      }
    `;

    //console.log(now() + ' goldsky.getUserSwaps START')

    const data = await graphqlClient.request<{ swaps: SubgraphSwap[] }>(query, {
        sender: userAddress.toLowerCase(),
        first,
    });

    //console.log(now() + ' goldsky.getUserSwaps END')

    return data.swaps;
}



// ============================================
// FONCTIONS POUR LES STATISTIQUES
// ============================================


export async function getFactory(graphqlClient: GraphQLClient): Promise<SubgraphFactory> {
    const query = gql`
        query getFactory {
          factories(first: 1) {
            id
            txCount
            swapCount
            poolCount
            totalValueLockedUSD
            totalValueLockedETH
            totalVolumeUSD
            totalFeesUSD
            volumeUSD24h
            feesUSD24h
            apr24h
          }
        }
    `;

    //console.log(now() + ' goldsky.getFactory START')

    const data = await graphqlClient.request<{ factories: SubgraphFactory[] }>(query);

    //console.log(now() + ' goldsky.getFactory END')

    if (!data.factories[0]) throw new Error("missing data.factories[0]");

    return data.factories[0];
}


export async function getFactoryDayDatas(graphqlClient: GraphQLClient, first: number = 30): Promise<DexDayDatas[]> {
    const query = gql`
        query getFactoryDayDatas($first: Int!) {
            dexDayDatas(
                first: $first
                orderBy: date
                orderDirection: desc
            ) {
                date
                volumeUSD
                volumeETH
                tvlUSD
                feesUSD
                txCount
                swapCount
                apr
                apr24h
            }
        }
    `;

    const data = await graphqlClient.request<{ dexDayDatas: DexDayDatas[] }>(query, { first });

    return data.dexDayDatas;
}


export async function getFactoryHourDatas(graphqlClient: GraphQLClient, first: number = 30): Promise<DexHourDatas[]> {
    const query = gql`
        query getFactoryHourDatas($first: Int!) {
            dexHourDatas(
                first: $first
                orderBy: periodStartUnix
                orderDirection: desc
            ) {
                periodStartUnix
                volumeUSD
                volumeETH
                tvlUSD
                feesUSD
                txCount
                swapCount
                apr
                apr24h
            }
        }
    `;

    const data = await graphqlClient.request<{ dexHourDatas: DexHourDatas[] }>(query, { first });

    return data.dexHourDatas;
}


export async function getPoolHourDatas(graphqlClient: GraphQLClient, poolAddress: string, startTime?: number, limit=250): Promise<PoolHourData[]> {
    const whereClause = startTime
        ? `{ pool: $pool, periodStartUnix_gte: $startTime }`
        : `{ pool: $pool }`;

    const query = gql`
        query getPoolHourDatas($pool: String!, $startTime: Int) {
            poolHourDatas(
                where: ${whereClause}
                orderBy: periodStartUnix
                orderDirection: desc
                first: ${limit}
            ) {
                periodStartUnix
                sqrtPrice
                token0Price
                token1Price
                tvlUSD
                volumeUSD
                volumeToken0
                volumeToken1
                feesUSD
                liquidity
                txCount
                swapCount
                apr
                apr24h
                open
                high
                low
                close
            }
        }
    `;

    //console.log(now() + ' goldsky.getPoolHourDatas START')

    const data = await graphqlClient.request<{ poolHourDatas: PoolHourData[] }>(query, { pool: poolAddress.toLowerCase(), startTime });

    //console.log(now() + ' goldsky.getPoolHourDatas END')

    return data.poolHourDatas;
}



export async function getPoolDayDatas(graphqlClient: GraphQLClient, poolAddress: string, startTime?: number, limit=30): Promise<PoolDayData[]> {
    const whereClause = startTime
        ? `{ pool: $pool, date_gte: $startTime }`
        : `{ pool: $pool }`;

    const query = gql`
        query getPoolDayDatas($pool: String!, $startTime: Int) {
            poolDayDatas(
                where: ${whereClause}
                orderBy: date
                orderDirection: desc
                first: ${limit}
            ) {
                date
                sqrtPrice
                token0Price
                token1Price
                tvlUSD
                volumeUSD
                volumeToken0
                volumeToken1
                feesUSD
                liquidity
                txCount
                swapCount
                apr
                apr24h
                open
                high
                low
                close
            }
        }
    `;

    //console.log(now() + ' goldsky.getPoolDayDatas START')

    const data = await graphqlClient.request<{ poolDayDatas: PoolDayData[] }>(query, { pool: poolAddress.toLowerCase(), startTime });

    //console.log(now() + ' goldsky.getPoolDayDatas END')

    return data.poolDayDatas;
}




export async function getTokenHourDatas(graphqlClient: GraphQLClient, tokenAddress: string, startTime?: number, limit=100): Promise<TokenHourData[]> {
    const whereClause = startTime
        ? `{ token: $token, periodStartUnix_gte: $startTime }`
        : `{ token: $token }`;

    const query = gql`
        query getTokenHourDatas($token: String!, $startTime: Int) {
            tokenHourDatas(
                where: ${whereClause}
                orderBy: periodStartUnix
                orderDirection: desc
                first: ${limit}
            ) {
                periodStartUnix
                volumeUSD
                feesUSD
                open
                high
                low
                close
                token { id, symbol }
                volume
                totalValueLocked
                totalValueLockedUSD
                priceUSD
                feesUSD
                txCount
                swapCount
            }
        }
    `;

    //console.log(now() + ' goldsky.getTokenHourDatas START')

    const data = await graphqlClient.request<{ tokenHourDatas: TokenHourData[] }>(query, { token: tokenAddress.toLowerCase(), startTime });

    //console.log(now() + ' goldsky.getTokenHourDatas END')

    return data.tokenHourDatas;
}



export async function getTokenDayDatas(graphqlClient: GraphQLClient, tokenAddress: string, startTime?: number, limit=30): Promise<TokenDayData[]> {
    const whereClause = startTime
        ? `{ token: $token, date_gte: $startTime }`
        : `{ token: $token }`;

    const query = gql`
        query getTokenDayDatas($token: String!, $startTime: Int) {
            tokenDayDatas(
                where: ${whereClause}
                orderBy: date
                orderDirection: desc
                first: ${limit}
            ) {
                date
                volumeUSD
                feesUSD
                open
                high
                low
                close
                token { id, symbol }
                volume
                totalValueLocked
                totalValueLockedUSD
                priceUSD
                feesUSD
                txCount
                swapCount
            }
        }
    `;

    //console.log(now() + ' goldsky.getTokenDayDatas START')

    const data = await graphqlClient.request<{ tokenDayDatas: TokenDayData[] }>(query, { token: tokenAddress.toLowerCase(), startTime });

    //console.log(now() + ' goldsky.getTokenDayDatas END')

    return data.tokenDayDatas;
}






export async function getBundle(graphqlClient: GraphQLClient, first: number = 1): Promise<{ id: string, ethPriceUSD: string } | null> {
    const query = gql`
        query getBundle($first: Int!) {
            bundles(
                first: $first
            ) {
                id
                ethPriceUSD
            }
        }
    `;

    //console.log(now() + ' goldsky.getBundle START')

    const data = await graphqlClient.request<{ bundles: { id: string, ethPriceUSD: string }[] }>(query, { first });

    //console.log(now() + ' goldsky.getBundle END')

    return data.bundles[0] ?? null;
}




function now() {
    const tzOffsetMinutes = 120;
    const date = new Date(Date.now() + tzOffsetMinutes * 60 * 1000);
    return date.toJSON().slice(0, 19).replace('T', ' ')
}


