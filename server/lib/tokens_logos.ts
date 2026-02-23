
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Address } from 'viem';

import * as gte from './gte';
import * as goldsky from './goldsky';

import { COMMON_TOKENS, ETH_ADDRESS, ETH_COIN } from '../config.server';

import type { Token, GteToken } from '../../types';

import brontoTokens from '../../assets/bronto_tokens_list.json' // https://bronto-server-x05n.onrender.com/api/tokens



export let knownTokens: Record<string, Token> = {};

const cacheFile = path.join(os.tmpdir(), 'prism_tokens_logos.json');


async function init() {

    // 1) load knownTokens from file
    //knownTokens = loadFromFile();

    knownTokens[ETH_ADDRESS.toLowerCase()] = ETH_COIN;


    // 2a) Load COMMON_TOKENS
    if (true) {
        for (const token of COMMON_TOKENS) {
            const tokenId = token.id.toLowerCase() as Address;

            if (knownTokens[tokenId] && knownTokens[tokenId]?.logoUri) {
                continue;
            }

            const knownToken = {
                id: tokenId,
                name: token.name,
                symbol: token.symbol,
                decimals: token.decimals,
                logoUri: token.logoUri,
            };

            knownTokens[tokenId] = knownToken;
        }
    }


    // 2) Load Bronto tokens
    if (false) {
        for (const token of brontoTokens.tokens) {
            const tokenId = token.address.toLowerCase() as Address;

            if (knownTokens[tokenId] && knownTokens[tokenId]?.logoUri) {
                continue;
            }

            const knownToken = {
                id: tokenId,
                name: token.name,
                symbol: token.symbol,
                decimals: token.decimals,
                logoUri: token.logo,
            };

            knownTokens[tokenId] = knownToken;
        }
    }


    // 3) Fetch GTE popular tokens (one only batch call)
    if (false) {
        const searchedTokens: GteToken[] = await gte.searchTokens('').catch(() => []);

        for (const token of searchedTokens) {
            const tokenId = token.address.toLowerCase() as Address;

            if (knownTokens[tokenId] && knownTokens[tokenId]?.logoUri) {
                continue;
            }

            const knownToken = {
                id: tokenId,
                name: token.name,
                symbol: token.symbol,
                decimals: token.decimals,
                logoUri: token.logoUri,
            };

            knownTokens[tokenId] = knownToken;
        }
    }


    // 4) Fetch DEX top tokens (one search request for each token)
    if (false) {
        const graphqlClient = goldsky.getGoldskyClient();

        const topTokens = await goldsky.getTopTokens(graphqlClient, 100);

        for (const token of topTokens) {
            const tokenId = token.id.toLowerCase() as Address;

            if (knownTokens[tokenId] && knownTokens[tokenId]?.logoUri) {
                continue;
            }

            const searchedTokens: GteToken[] = await gte.searchTokens(tokenId).catch(() => []);
            //console.log('searchedTokens:', searchedTokens)

            if (searchedTokens.length > 0 && searchedTokens[0]?.address.toLowerCase() === tokenId) {
                const searchedToken = searchedTokens[0];

                knownTokens[tokenId] = {
                    id: tokenId,
                    name: searchedToken?.name ?? '',
                    symbol: searchedToken?.symbol ?? '',
                    decimals: searchedToken?.decimals ?? 18,
                    logoUri: searchedToken?.logoUri ?? '',
                }
            }
        }
    }


    saveToFile(knownTokens);


    //console.log('knownTokens:', knownTokens)
}


function loadFromFile() {
    if (! fs.existsSync(cacheFile)) {
        return {};
    }

    const content = fs.readFileSync(cacheFile).toString();
    const cached = JSON.parse(content);
    return cached;
}

function saveToFile(cached: any) {
    const content = JSON.stringify(cached);
    fs.writeFileSync(cacheFile, content);
}


init();
