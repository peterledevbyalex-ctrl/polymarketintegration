
import React from 'react'

import * as apiRoute from '@/app/api/[...path]/api';

import { SwapPageContent } from './_components/SwapPageContent';

import { Token } from '@/types';


type SwapPageProps = {
    params: Promise<{}>,
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
}


export const metadata /* Metadata */ = {
    title: 'Prism DEX - Swap Tokens',
    description: 'Swaps at light-speed. Swap any token instantly on MegaETH. Get the best rates with our smart routing algorithm. Fast, secure, and decentralized token exchange with minimal slippage. Cross-chain swaps powered by LI.FI.',
    keywords: 'token swap, crypto exchange, DEX, MegaETH swap, trade tokens, decentralized trading, cross-chain, bridge',
}


const SwapPage: React.FC<SwapPageProps> = async ({ searchParams }) => {
    const tokens: Token[] = await apiRoute.getTokensListCached();

    const searchParamsAwaited = await searchParams;
    const inputCurrency = searchParamsAwaited.inputCurrency?.toString() ?? '';
    const outputCurrency = searchParamsAwaited.outputCurrency?.toString() ?? '';

    return (
        <SwapPageContent
            tokens={tokens}
            inputCurrency={inputCurrency}
            outputCurrency={outputCurrency}
        />
    )
}


export default SwapPage
