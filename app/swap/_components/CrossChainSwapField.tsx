
import { formatUnits } from "viem";

import ChainSelector from "@/components/ChainSelector";
import { SupportedChain } from "@/config/supported_chains";
import { formatNumber, formatTokenAmount } from "@/lib/ui_utils";
import { LifiQuoteResult } from "@/lib/api_lifi";

import { CrossChainSwapTokenSelector } from "./CrossChainSwapTokenSelector";
import { CrossChainToken } from "@/hooks/useCrossChainSwap";
import { WalletIcon } from "@/components/icons/WalletIcon";



type CrossChainSwapFieldProps = {
    fieldType: 'tokenIn' | 'tokenOut'
    isLoading: boolean,
    supportedChains: SupportedChain[],
    chain: SupportedChain,
    token: CrossChainToken,
    tokens: CrossChainToken[],
    quote: LifiQuoteResult,
    amount?: string,
    tokenBalance?: string
    setChain: (chain: SupportedChain) => void,
    setToken: React.Dispatch<React.SetStateAction<CrossChainToken>>,
    setAmount?: (value: React.SetStateAction<string>) => void,
}


export const CrossChainSwapField: React.FC<CrossChainSwapFieldProps> = ({ fieldType, isLoading, supportedChains, chain, token, tokens, quote, amount, tokenBalance, setChain, setToken, setAmount }) => {
    const isRedText = (fieldType === 'tokenIn' && Number(amount) > Number(tokenBalance)) || Number(amount) < 0;


    return (
        <div className="rounded-xl bg-background p-4 mt-1">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-foreground-light">{fieldType === 'tokenIn' ? 'Pay' : 'Receive'}</span>
                <ChainSelector
                    selectedChain={chain}
                    chains={supportedChains}
                    onSelect={setChain}
                />
            </div>

            <div className="flex items-center justify-between">

                {fieldType === 'tokenIn' && (
                    <input
                        type="number"
                        inputMode="numeric"
                        value={amount ?? "0"}
                        min={0}
                        placeholder="0"
                        onChange={(e) => { if (setAmount) setAmount(e.target.value) }}
                        onWheel={(e) => { (e.target as HTMLInputElement).blur(); /*e.preventDefault()*/}}
                        className={`flex-1 bg-transparent text-3xl font-medium outline-none min-w-0 ${isRedText ? "text-red-400" : "text-foreground-light"}`}
                    />
                )}

                {fieldType === 'tokenOut' && (
                    <div className="flex-1 text-3xl font-medium min-w-0">
                        {isLoading ? (
                            <span className="text-foreground-light animate-pulse">...</span>
                        ) : quote ? (
                            formatNumber(formatUnits(BigInt(quote.toAmount), token?.decimals || 18), 5)
                        ) : (
                            <span className="text-foreground-light">0</span>
                        )}
                    </div>
                )}

                <CrossChainSwapTokenSelector
                    token={token}
                    tokens={tokens}
                    onSelect={setToken}
                />
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center text-sm text-foreground-light">
                {/* Swap Amount USD */}
                <div className="mx-4">
                    {fieldType === 'tokenIn' && (
                        <>${Number(token?.priceUSD) ? (Number(token.priceUSD) * Number(amount)).toFixed(2) : "0"}</>
                    )}

                    {fieldType === 'tokenOut' && (
                        <>${quote ? quote.route.toAmountUSD : "0"}</>
                    )}
                </div>

                <div className="text-foreground-light">
                    {/* Token Balance */}
                    <WalletIcon />

                    <span className={`ms-2 ${setAmount ? "cursor-pointer" : ""}`} onClick={() => {if (setAmount) setAmount(tokenBalance)}} title={tokenBalance ? (tokenBalance + ' ' + (token?.symbol ?? '')) : '0'}>
                        {tokenBalance ? formatTokenAmount(tokenBalance) : '0'} {token?.symbol ?? ''}
                    </span>
                </div>
            </div>
        </div>
    );
}

