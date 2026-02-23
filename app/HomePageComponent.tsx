"use client"

import React, { useEffect, useState } from 'react'

import { MegaLogo } from '@/components/icons/MegaLogo';

import type { SubgraphFactory } from '@/types';
import { formatNumber } from '@/lib/ui_utils';


type HomePageComponentProps = {
    factory: SubgraphFactory
}


export const HomePageComponent: React.FC<HomePageComponentProps> = ({ factory }) => {

    return (
        <div className="relative z-10 w-full">
            {/* Hero Section */}
            <div className="pt-20 pb-16 text-center">
                <div className="mb-6">
                    <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6">
                        Prism DEX
                    </h1>

                    <p className="text-xl md:text-2xl text-foreground-light max-w-3xl mx-auto mb-8">
                        Trade, provide liquidity, and earn on the fastest decentralized exchange
                    </p>

                    <div className="flex items-center justify-center gap-2 text-foreground-light">
                        <span className="text-sm">Powered by</span>
                        <MegaLogo />
                    </div>
                </div>
            </div>

            {/* Stats Section */}
            <div className="max-w-5xl mx-auto mb-16 px-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6 text-center">
                        <div className="text-3xl font-bold text-foreground mb-2">${formatNumber(factory.totalValueLockedUSD)}</div>
                        <div className="text-sm text-foreground-light">Total Value Locked</div>
                    </div>
                    <div className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6 text-center">
                        <div className="text-3xl font-bold text-foreground mb-2">${formatNumber(factory.volumeUSD24h)}</div>
                        <div className="text-sm text-foreground-light">24h Volume</div>
                    </div>
                    <div className="bg-background-light/50 backdrop-blur-sm rounded-lg border border-background-light p-6 text-center">
                        <div className="text-3xl font-bold text-foreground mb-2">{formatNumber(factory.poolCount)}</div>
                        <div className="text-sm text-foreground-light">Active Pools</div>
                    </div>
                </div>
            </div>

            {/* Features Grid */}
            <div className="max-w-6xl mx-auto px-4 mb-20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Swap Card */}
                    <a 
                        href="/swap"
                        className="group bg-background-light/30 backdrop-blur-sm rounded-xl border border-background-light p-8 transition-all hover:bg-background-light/60 hover:border-foreground-light/30 hover:scale-105"
                    >
                        <h3 className="text-2xl font-bold mb-3 text-foreground">Swap</h3>
                        <p className="text-foreground-light mb-6 leading-relaxed">
                            Instantly trade tokens with minimal slippage and best execution prices
                        </p>
                        <div className="inline-flex items-center text-foreground font-medium group-hover:gap-2 transition-all">
                            Trade Now 
                            <span className="ml-2 group-hover:ml-0 transition-all">→</span>
                        </div>
                    </a>

                    {/* Pools Card */}
                    <a
                        href="/pools"
                        className="group bg-background-light/30 backdrop-blur-sm rounded-xl border border-background-light p-8 transition-all hover:bg-background-light/60 hover:border-foreground-light/30 hover:scale-105"
                    >
                        <h3 className="text-2xl font-bold mb-3 text-foreground">Pools</h3>
                        <p className="text-foreground-light mb-6 leading-relaxed">
                            Provide liquidity and earn trading fees from every swap
                        </p>
                        <div className="inline-flex items-center text-foreground font-medium group-hover:gap-2 transition-all">
                            Earn Fees
                            <span className="ml-2 group-hover:ml-0 transition-all">→</span>
                        </div>
                    </a>

                    {/* Portfolio Card */}
                    <a
                        href="/portfolio"
                        className="group bg-background-light/30 backdrop-blur-sm rounded-xl border border-background-light p-8 transition-all hover:bg-background-light/60 hover:border-foreground-light/30 hover:scale-105"
                    >
                        <h3 className="text-2xl font-bold mb-3 text-foreground">Portfolio</h3>
                        <p className="text-foreground-light mb-6 leading-relaxed">
                            Track your assets, positions, and earnings in one place
                        </p>
                        <div className="inline-flex items-center text-foreground font-medium group-hover:gap-2 transition-all">
                            View Dashboard
                            <span className="ml-2 group-hover:ml-0 transition-all">→</span>
                        </div>
                    </a>
                </div>
            </div>

            {/* Features Highlight */}
            <div className="max-w-5xl mx-auto px-4 mb-20">
                <div className="bg-background-light/20 backdrop-blur-sm rounded-xl border border-background-light p-8 md:p-12">
                    <h2 className="text-3xl font-bold text-center mb-12 text-foreground">Why Prism DEX?</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="flex gap-4">
                            <div>
                                <h4 className="font-semibold text-foreground mb-2">Lightning Fast</h4>
                                <p className="text-sm text-foreground-light">Built on MegaETH for instant transaction finality</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div>
                                <h4 className="font-semibold text-foreground mb-2">Low Fees</h4>
                                <p className="text-sm text-foreground-light">Competitive fees with maximum returns for LPs</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div>
                                <h4 className="font-semibold text-foreground mb-2">Secure</h4>
                                <p className="text-sm text-foreground-light">Audited Uniswap V3 contracts you can trust</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div>
                                <h4 className="font-semibold text-foreground mb-2">Concentrated Liquidity</h4>
                                <p className="text-sm text-foreground-light">Maximize capital efficiency with custom ranges</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    )
}