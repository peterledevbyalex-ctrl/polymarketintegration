
import { useState } from "react";

import { CrossChainToken } from "@/hooks/useCrossChainSwap";
import { TokenLogo } from "@/components/TokenLogo";


type CrossChainSwapTokenSelectorProps = {
    token: CrossChainToken | null;
    tokens: CrossChainToken[];
    onSelect: (token: CrossChainToken) => void;
}


export const CrossChainSwapTokenSelector: React.FC<CrossChainSwapTokenSelectorProps> = ({ token, tokens, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background hover:bg-background-light-sm transition-colors"
            >
                {token && (
                    <TokenLogo token={{...token, id: token.address}} size="sm" />
                )}

                <span className="font-medium">{token?.symbol || 'Select'}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 min-w-[150px] rounded-xl bg-background border border-foreground-light/20 shadow-xl p-2 space-y-1">
                        <div className="text-xs text-foreground-light px-2 py-1 mb-1">
                            Select Token
                        </div>

                        {tokens.map((t) => (
                            <button
                                key={t.address}
                                onClick={() => { onSelect(t); setIsOpen(false); }}
                                className={`w-full text-left px-3 py-2 rounded-lg hover:bg-background-light flex gap-2 items-centerce ${
                                    t.address === token?.address ? 'bg-background-light' : 'cursor-pointer'
                                }`}
                            >
                                <TokenLogo token={{...t, id: t.address}} size="sm" />
                                {t.symbol}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

