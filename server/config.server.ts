
import { Address } from 'viem';

import { CURRENT_CONFIG } from '@/../config/dex_config'

import { Token } from "../types"


export const ETH_ADDRESS = CURRENT_CONFIG.systemTokensIds.ETH;

const goldskyEndpoint = process.env.GOLDSKY_ENDPOINT;
if (!goldskyEndpoint) {
    throw new Error('Missing env var: GOLDSKY_ENDPOINT');
}

export const GOLDSKY_ENDPOINT = goldskyEndpoint;

export const EXPLORER_URL = CURRENT_CONFIG.explorerUrl;
export const BLOCKSCOUT_ENDPOINT = CURRENT_CONFIG.blockscoutApiEndpoint;


export const ETH_COIN: Token = {
    id: ETH_ADDRESS.toLowerCase() as Address,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    derivedETH: "1",
    logoUri: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png"
};


export const COMMON_TOKENS: Token[] = CURRENT_CONFIG.popularTokens;


