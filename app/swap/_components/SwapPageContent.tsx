"use client"

import React, { useState, lazy, Suspense } from 'react';

import { SwapComponent } from './SwapComponent';
import { BackgroundMask } from '@/components/BackgroundMask';

const CrossChainSwapComponent = lazy(() => import('./CrossChainSwapComponent').then(m => ({ default: m.CrossChainSwapComponent })));
import { MegaLogo } from '@/components/icons/MegaLogo';
import { SettingsIcon } from '@/components/icons/SettingsIcon';
import { SwapSettingsModal } from './SwapSettingsModal';

import type { Token } from '@/types';


type SwapTab = 'swap' | 'cross-chain' | 'limit';

interface SwapPageContentProps {
    tokens: Token[];
    inputCurrency?: string;
    outputCurrency?: string;
}


export const SwapPageContent: React.FC<SwapPageContentProps> = ({
    tokens,
    inputCurrency,
    outputCurrency,
}) => {
    const [activeTab, setActiveTab] = useState<SwapTab>('swap');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    return (
        <>
            <div className="fixed inset-0 gradient-bg" />
            <BackgroundMask />

            <div className="flex-1 flex items-center justify-center">
                <div className="z-10 mb-20 w-full max-w-md px-4">

                    {/* Hero */}
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-foreground font-sans my-4">
                            {activeTab === 'cross-chain' ? 'Bridge & Swap' : 'Swaps at light-speed.'}
                        </h1>

                        <div className="text-md text-foreground font-body mb-12">
                            <div className="flex items-center justify-center gap-2">
                                {activeTab === 'cross-chain' ? (
                                    <>Powered by LI.FI</>
                                ) : (
                                    <>
                                        Powered by
                                        <MegaLogo />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tabs Header */}
                    <div className="flex justify-between items-center mb-2">
                        {/* Tabs */}
                        <div className="flex gap-2">
                            <TabButton
                                active={activeTab === 'swap'}
                                onClick={() => setActiveTab('swap')}
                            >
                                Swap
                            </TabButton>

                            <TabButton
                                active={activeTab === 'cross-chain'}
                                onClick={() => setActiveTab('cross-chain')}
                            >
                                Cross-Chain
                            </TabButton>

                            <TabButton
                                active={activeTab === 'limit'}
                                onClick={() => {}}
                                disabled
                            >
                                Limit
                            </TabButton>
                        </div>

                        {/* Settings */}
                        {activeTab === 'swap' && (
                            <button
                                onClick={() => setIsSettingsModalOpen(true)}
                                className="p-2 rounded-lg hover:bg-background-light transition-colors duration-200 cursor-pointer text-foreground-light hover:text-foreground-light-xl"
                            >
                                <SettingsIcon />
                            </button>
                        )}
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'swap' && (
                        <SwapComponent
                            tokens={tokens}
                            inputCurrency={inputCurrency}
                            outputCurrency={outputCurrency}
                            hideHeader={true}
                            isSettingsModalOpen={isSettingsModalOpen}
                            setIsSettingsModalOpen={setIsSettingsModalOpen}
                        />
                    )}

                    {activeTab === 'cross-chain' && (
                        <Suspense fallback={
                            <div className="rounded-2xl bg-background-light p-8 text-center text-foreground-light">
                                Loading...
                            </div>
                        }>
                            <CrossChainSwapComponent />
                        </Suspense>
                    )}

                    {activeTab === 'limit' && (
                        <div className="rounded-2xl bg-background-light p-8 text-center text-foreground-light">
                            Limit orders coming soon...
                        </div>
                    )}

                </div>
            </div>
        </>
    );
};


// Tab Button Component
const TabButton: React.FC<{
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}> = ({ active, onClick, disabled, children }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`
            font-semibold px-4 py-1 rounded-md transition-colors
            ${active
                ? 'bg-background-light text-foreground'
                : 'bg-background-light-sm text-foreground-light-sm'
            }
            ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-background-light'}
        `}
    >
        {children}
    </button>
);



export default SwapPageContent;
