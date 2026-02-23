"use client"

import React, { Dispatch, SetStateAction } from 'react'

import { TokenLogo } from './TokenLogo';
import { ChevronDownIconXl } from './icons/ChevronDownIconXl';

import type { Token } from "@/types";


export const TokenSelectorButton: React.FC<{ selectToken: Token, loading: boolean, setIsModalOpen: Dispatch<SetStateAction<boolean>> }> = ({ selectToken, loading, setIsModalOpen }) => {
    return (
        <>
            <div className="flex items-center justify-center space-x-2 border rounded-3xl hover:bg-background-light">
                <button
                    onClick={() => setIsModalOpen(true)}
                    disabled={loading}
                    className={`flex gap-3 m-0 px-2 py-2 items-center font-bold rounded-lg text-sm transition-colors ${loading
                            ? 'text-foreground-light cursor-not-allowed'
                            : 'text-foreground cursor-pointer'
                        }`}
                >
                    {selectToken && (
                        <TokenLogo token={selectToken} />
                    )}

                    <div className={`flex items-center justify-center mr-1 ${selectToken ? "" : "ml-6"}`}>
                        <span className="py-1">{selectToken ? selectToken.symbol : 'Select'}</span>

                        <span className="ms-3 text-xl text-foreground-light-xl py-1">
                            <ChevronDownIconXl />
                        </span>
                    </div>
                </button>
            </div>
        </>
    );
}


export const TokenSelectorButtonLarge: React.FC<{ selectToken: Token | null, loading: boolean, setIsModalOpen: Dispatch<SetStateAction<boolean>> }> = ({ selectToken, loading, setIsModalOpen }) => {
    return (
        <>
            <div className="w-full flex items-center space-x-2 border rounded hover:bg-background-light">
                {selectToken ? <TokenLogo token={selectToken} /> : <div className="w-8 h-8" />}

                <button
                    onClick={() => setIsModalOpen(true)}
                    disabled={loading}
                    className={`w-full flex px-2 py-2 font-bold rounded-lg text-sm transition-colors ${loading
                            ? 'text-foreground-light cursor-not-allowed'
                            : 'text-foreground cursor-pointer'
                        }`}
                >
                    <span>{selectToken ? selectToken.symbol : 'Select Token'}</span>

                    <span className="ms-auto text-xl text-foreground-light-xl -m-2">⌄</span>
                </button>
            </div>
        </>
    );
}


