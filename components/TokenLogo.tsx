"use client"

import React from 'react'

import { useLaunchpadLogos } from '@/providers/LaunchpadTokensProvider';
import type { Token } from "@/types";


type TokenLogoSize = 'sm' | 'md' | 'lg';

const TOKEN_LOGO_SIZE_CLASS: Record<TokenLogoSize, string> = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-9 h-9',
};


export const TokenLogo: React.FC<{ token: Token | null | undefined; size?: TokenLogoSize }> = ({ token, size = 'md' }) => {
    const { getTokenLogo } = useLaunchpadLogos();

    if (!token) return null;

    const launchpadLogo = getTokenLogo(token.id);
    const logoUrl = token.logoUri || launchpadLogo;

    return (
        <>
            {token && !logoUrl && (
                <div className={`${TOKEN_LOGO_SIZE_CLASS[size]} shrink-0 overflow-hidden bg-primary border rounded-full flex items-center justify-center text-sm font-semibold`}>
                    {token.symbol.slice(0, 1)}
                </div>
            )}

            {token && logoUrl && (
                <div className={`${TOKEN_LOGO_SIZE_CLASS[size]} shrink-0 overflow-hidden border rounded-full flex items-center justify-center text-sm font-semibold`}>
                    <img
                        src={logoUrl}
                        alt={token.symbol}
                        className="block w-full h-full rounded-full object-cover"
                        loading="lazy"
                        decoding="async"
                    />
                </div>
            )}
        </>
    );
}

