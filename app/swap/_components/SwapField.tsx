"use client"

import { Dispatch, SetStateAction, useState } from 'react'
import { Address } from 'viem';

import { formatAddress, formatTokenAmount, formatUsd } from '@/lib/ui_utils';

import { TokenSelectorButton } from '@/components/TokenSelectorButton';
import { WalletIcon } from '@/components/icons/WalletIcon';

import type { Token } from '@/types';


interface SwapFieldProps {
    fieldType: 'tokenIn' | 'tokenOut'
    className?: string
    token: Token
    tokenBalance: string
    loading: boolean
    amount: string;
    lastEthPrice: string;
    isTaxable?: boolean
    taxRate?: number
    taxVault?: string
    setAmount: Dispatch<SetStateAction<string>>
    setIsModalOpen: Dispatch<SetStateAction<boolean>>
}


export const SwapField: React.FC<SwapFieldProps> = ({ fieldType, className, amount, loading, token, tokenBalance, lastEthPrice, setAmount, setIsModalOpen, isTaxable, taxRate, taxVault }) => {
    const isRedText = (fieldType === 'tokenIn' && Number(amount) > Number(tokenBalance)) || Number(amount) < 0;

    const ethUsd = lastEthPrice ? Number(lastEthPrice) : 0;
    const derivedEth = token.derivedETH ? Number(token.derivedETH) : 0;
    const rawDerivedUsd = token.derivedUSD ? Number(token.derivedUSD) : 0;

    const tokenUsd = (() => {
        if (ethUsd > 0 && (token.symbol === 'ETH' || token.symbol === 'WETH')) return ethUsd;
        if (ethUsd > 0 && isFinite(derivedEth) && derivedEth > 0) return derivedEth * ethUsd;
        if (isFinite(rawDerivedUsd) && rawDerivedUsd > 0) return rawDerivedUsd;
        return 0;
    })();


    return (
        <div className={`bg-background rounded-2xl p-4 ${className}`}>

            {/* Header */}
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground/50">
                        {fieldType === 'tokenIn' ? "Pay" : "Receive"}
                    </span>
                    {isTaxable && (
                        <div className="relative group">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-medium cursor-help">
                                {taxRate}% Tax
                            </span>
                            {/* Tooltip */}
                            <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-64 p-2 rounded-lg bg-background-light border border-foreground-light/20 shadow-xl text-xs">
                                <div className="text-foreground mb-1">Token Tax</div>
                                <div className="text-foreground-light">
                                    This {taxRate}% tax is set by the token creator and is collected on every swap.
                                </div>
                                {taxVault && (
                                    <div className="text-foreground-light mt-1">
                                        Vault: <span className="text-foreground font-mono">{formatAddress(taxVault as Address)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Middle Content */}
            <div className="flex items-center justify-between my-2">
                <input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    min={0}
                    placeholder="0"
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setAmount(e.target.value.replaceAll(',', '.'))}
                    onWheel={(e) => { (e.target as HTMLInputElement).blur(); /*e.preventDefault()*/}}
                    className={`bg-transparent rounded-md focus:ring-1 mx-1 px-4 py-2 ring-background-light-xl text-2xl font-semibold w-full outline-none hover:bg-background-light focus:bg-background-light-sm placeholder-gray-400 ${isRedText ? "text-red-400" : "text-foreground-light"}`}
                />

                <TokenSelectorButton
                    loading={loading}
                    selectToken={token}
                    setIsModalOpen={setIsModalOpen}
                    />
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center text-sm text-foreground-light">
                {/* Swap Amount USD */}
                <div className="mx-4">${token ? formatUsd(Number(amount) * tokenUsd) : '0'}</div>

                <div className="text-foreground-light">
                    {/* Token Balance */}
                    <WalletIcon />

                    <span className="ms-2 cursor-pointer" onClick={() => setAmount(tokenBalance)} title={tokenBalance ? (tokenBalance + ' ' + (token?.symbol ?? '')) : '0'}>
                        {tokenBalance ? formatTokenAmount(tokenBalance) : '0'} {token?.symbol ?? ''}
                    </span>
                </div>
            </div>
        </div>
    );
}
