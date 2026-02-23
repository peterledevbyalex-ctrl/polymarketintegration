"use client"

import React, { useState } from 'react';
import Image from 'next/image';

import type { SupportedChain } from '@/config/supported_chains';


interface ChainSelectorProps {
    selectedChain: SupportedChain;
    chains: SupportedChain[];
    onSelect: (chain: SupportedChain) => void;
    label?: string;
    disabled?: boolean;
}


export const ChainSelector: React.FC<ChainSelectorProps> = ({
    selectedChain,
    chains,
    onSelect,
    label,
    disabled = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const handleSelect = (chain: SupportedChain) => {
        onSelect(chain);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            {label && (
                <span className="text-xs text-foreground-light mb-1 block">{label}</span>
            )}

            {/* Selected Chain Button */}
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg
                    bg-background-light-sm hover:bg-background-light
                    border border-transparent hover:border-foreground-light/20
                    transition-all duration-200
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
            >
                <ChainLogo chain={selectedChain} size={20} />
                <span className="font-medium text-sm">{selectedChain.shortName}</span>
                <ChevronIcon isOpen={isOpen} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown Menu */}
                    <div className="absolute top-full left-0 mt-2 z-50 min-w-[200px] max-h-[300px] overflow-y-auto rounded-xl bg-background border border-foreground-light/20 shadow-xl">
                        <div className="p-2 space-y-1">
                            <div className="text-xs text-foreground-light px-2 py-1 mb-1">
                                Select Chain
                            </div>

                            {chains.map((chain) => (
                                <button
                                    key={chain.id}
                                    onClick={() => handleSelect(chain)}
                                    className={`
                                        w-full flex items-center gap-3 px-3 py-2 rounded-lg
                                        hover:bg-background-light transition-colors
                                        ${chain.id === selectedChain.id ? 'bg-background-light' : 'cursor-pointer'}
                                    `}
                                >
                                    <ChainLogo chain={chain} size={24} />
                                    <div className="flex flex-col items-start">
                                        <span className="font-medium text-sm">{chain.name}</span>
                                        {chain.isTestnet && (
                                            <span className="text-xs text-foreground-light">Testnet</span>
                                        )}
                                    </div>
                                    {chain.id === selectedChain.id && (
                                        <CheckIcon className="ml-auto" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};


// Chain Logo Component
const ChainLogo: React.FC<{ chain: SupportedChain; size: number }> = ({ chain, size }) => {
    const [hasError, setHasError] = useState(false);

    if (hasError || !chain.logoUri) {
        return (
            <div
                className="rounded-full bg-foreground-light/20 flex items-center justify-center text-xs font-bold"
                style={{ width: size, height: size }}
            >
                {chain.shortName.slice(0, 2)}
            </div>
        );
    }

    return (
        <Image
            src={chain.logoUri}
            alt={chain.name}
            width={size}
            height={size}
            className="rounded-full"
            onError={() => setHasError(true)}
        />
    );
};


// Chevron Icon
const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
    <svg
        className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);


// Check Icon
const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        className={`w-4 h-4 text-green-500 ${className}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);


export default ChainSelector;
