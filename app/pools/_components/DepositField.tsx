"use client"

import { Dispatch, SetStateAction } from 'react'

import { formatNumber } from '@/lib/ui_utils';

import { TokenLogo } from '@/components/TokenLogo';
import { WalletIcon } from '@/components/icons/WalletIcon';

import type { Token } from '@/types';


interface DepositFieldProps {
    fieldType: 'token0' | 'token1'
    className?: string
    token: Token
    tokenBalance: string
    amount: string;
    setAmount: Dispatch<SetStateAction<string>>
}


export const DepositField: React.FC<DepositFieldProps> = ({ fieldType, className, amount, token, tokenBalance, setAmount }) => {
    const isRedText = (Number(amount) > Number(tokenBalance)) || Number(amount) < 0;

    if (!token) return null;

    return (
        <div className={`bg-background-light hover:bg-background-light-xl rounded-2xl px-4 py-3 ${className}`}>

            {/* Middle Content */}
            <div className="flex items-center justify-between gap-2 mb-2">
                <input
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    min={0}
                    placeholder="0.00"
                    onFocus={(e) => e.target.select()}
                    onWheel={(e) => { (e.target as HTMLInputElement).blur(); /*e.preventDefault()*/}}
                    onChange={(e) => setAmount(e.target.value.replaceAll(',', '.'))}
                    className={`bg-transparent rounded-md focus:ring-1 px-2 py-1 ring-background-light-xl text-2xl font-semibold w-full outline-none placeholder-gray-400 ${isRedText ? "text-red-400" : "text-foreground-light"}`}
                />

                <div className="flex items-center space-x-2 border rounded-3xl hover:bg-background-light">
                    <button
                        className={`flex gap-3 m-1 px-2 py-1 font-bold rounded-lg text-sm transition-colors`}
                    >
                        <TokenLogo token={token} />

                        <div className={`mr-1 py-2`}>
                            {token.symbol}
                        </div>
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center text-sm text-foreground-light">
                {/* Swap Amount USD */}
                <div className="mx-2">${formatNumber(Number(amount) * Number(token.derivedUSD))}</div>

                {tokenBalance && (
                    <div className="text-foreground-light mx-2">
                        {/* Token Balance */}
                        <WalletIcon />

                        <span className="ms-2 cursor-pointer" onClick={() => setAmount(tokenBalance)}>
                            {tokenBalance ? formatNumber(tokenBalance) : '0'} {token.symbol}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
