"use client"

import React, { useState, useEffect } from 'react';
import { useSwitchChain, useChainId } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import toast from 'react-hot-toast';
import { Address, formatUnits } from 'viem';

import * as apiLifi from '@/lib/api_lifi';
import { useCrossChainSwap, type CrossChainToken } from '@/hooks/useCrossChainSwap';
import { CURRENT_CHAIN_CONFIG, type SupportedChain, getChainById } from '@/config/supported_chains';
import { formatNumber, isValidAddress } from '@/lib/ui_utils';
import { getTokenBalance_MultiChain } from '@/lib/api_blockchain_tokens';
import { getPublicClient_MultiChain } from '@/lib/api_blockchain';
import { useChainGuard } from '@/providers/WalletProvider';
import { useApp } from '@/providers/AppProvider';

import { Button } from '@/components/ui/button';
import { SwitchIcon } from '@/components/icons/SwitchIcon';
import { CrossChainSwapField } from './CrossChainSwapField';


// Common tokens across chains (simplified - in production, fetch from LI.FI API)
const COMMON_TOKENS: Record<number, CrossChainToken[]> = {
    // Ethereum
    1: [
        { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, chainId: 1 },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: 1 },
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether', decimals: 6, chainId: 1 },
    ],
    // Arbitrum
    42161: [
        { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, chainId: 42161 },
        { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: 42161 },
        { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', name: 'Tether', decimals: 6, chainId: 42161 },
    ],
    // Optimism
    10: [
        { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, chainId: 10 },
        { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: 10 },
        { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', name: 'Tether', decimals: 6, chainId: 10 },
    ],
    // Base
    8453: [
        { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, chainId: 8453 },
        { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: 8453 },
    ],
    // Polygon
    137: [
        { address: '0x0000000000000000000000000000000000000000', symbol: 'MATIC', name: 'MATIC', decimals: 18, chainId: 137 },
        { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: 137 },
        { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', name: 'Tether', decimals: 6, chainId: 137 },
    ],
    // BSC
    56: [
        { address: '0x0000000000000000000000000000000000000000', symbol: 'BNB', name: 'BNB', decimals: 18, chainId: 56 },
        { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18, chainId: 56 },
        { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether', decimals: 18, chainId: 56 },
    ],
    // MegaETH Testnet
    6343: [
        { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ether', decimals: 18, chainId: 6343 },
        { address: '0x56c00c15453dcbe86faba6147cf02e2c64c74959', symbol: 'USDC', name: 'USD Coin', decimals: 6, chainId: 6343 },
    ],
};


interface CrossChainSwapComponentProps {
    onSettingsClick?: () => void;
}


export const CrossChainSwapComponent: React.FC<CrossChainSwapComponentProps> = ({ onSettingsClick }) => {
    const { isConnected, userAddress, walletClient } = useApp();

    const { openConnectModal } = useConnectModal();
    const { switchChain } = useSwitchChain();
    const currentChainId = useChainId();
    const { setDisabled: setChainGuardDisabled } = useChainGuard();

    const {
        sourceChain,
        destinationChain,
        receiverAddress,
        quote,
        isLoading,
        isSwapping,
        error,
        swapInfo,
        executionSteps,
        currentStep,
        setSourceChain,
        setDestinationChain,
        setReceiverAddress,
        getQuote,
        executeSwap,
        clearQuote,
        swapChains,
    } = useCrossChainSwap(walletClient, userAddress);

    // Token state
    const [tokenIn, setTokenIn] = useState<CrossChainToken | null>(null);
    const [tokenOut, setTokenOut] = useState<CrossChainToken | null>(null);
    const [amountIn, setAmountIn] = useState('');

    const [receiverInput, setReceiverInput] = useState('');
    const [receiverInputError, setReceiverInputError] = useState<string | null>(null);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    const [tokenInBalance, setTokenInBalance] = useState<string | null>(null);
    const [tokenOutBalance, setTokenOutBalance] = useState<string | null>(null);

    // Available tokens for selected chains
    const [sourceTokens, setSourceTokens] = useState<CrossChainToken[]>([]);
    const [destTokens, setDestTokens] = useState<CrossChainToken[]>([]);

    const [supportedChains, setSupportedChains] = useState<SupportedChain[]>([]);


    const getTokenBalance = async (chain: SupportedChain, tokenAddress: Address) => {
        if (!chain.rpcUrl) return 0n; // No RPC for this chain
        const publicClient = getPublicClient_MultiChain(chain);
        const balance = await getTokenBalance_MultiChain(publicClient, tokenAddress, userAddress);
        return balance;
    }

    const handleSwap = async () => {
        if (!quote) return;

        const originalChainId = currentChainId;
        const needsChainSwitch = currentChainId !== sourceChain.id;

        console.log('[CrossChainSwap] Current chain:', currentChainId);
        console.log('[CrossChainSwap] Source chain (Pay):', sourceChain.id, sourceChain.name);
        console.log('[CrossChainSwap] Destination chain (Receive):', destinationChain.id, destinationChain.name);
        console.log('[CrossChainSwap] Needs switch?', needsChainSwitch);

        try {
            // Disable ChainGuard to prevent auto-switching back
            setChainGuardDisabled(true);
            console.log('[CrossChainSwap] ChainGuard disabled');

            // Switch to source chain if needed
            if (needsChainSwitch && switchChain) {
                console.log('[CrossChainSwap] Attempting to switch to chain:', sourceChain.id, sourceChain.name);
                toast.loading(`Switching to ${sourceChain.name}...`, { id: 'chain-switch' });
                
                try {
                    await switchChain({ chainId: sourceChain.id });
                    console.log('[CrossChainSwap] Switch completed');
                } catch (switchError) {
                    console.error('[CrossChainSwap] Switch failed:', switchError);
                    toast.dismiss('chain-switch');
                    setChainGuardDisabled(false);
                    throw new Error(`Failed to switch to ${sourceChain.name}: ${switchError instanceof Error ? switchError.message : 'Unknown error'}`);
                }
                
                toast.dismiss('chain-switch');
                // Wait a bit for the switch to complete
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            // Execute swap (this will submit the tx but not wait for completion)
            const result = await executeSwap();

            if (result?.success) {
                setAmountIn('');
                
                // Calculate estimated arrival time
                const estimatedMinutes = quote ? Math.ceil(quote.executionDuration / 60) : 5;
                
                // Show success with estimated time
                toast.success(
                    `Cross-chain swap submitted! Estimated arrival: ~${estimatedMinutes} min`,
                    { duration: 8000 }
                );
                
                console.log('[CrossChainSwap] Swap submitted successfully, will complete in background');
            } else {
                toast.error(result?.error || 'Swap failed');
            }

            // Switch back to original chain immediately (don't wait)
            if (needsChainSwitch && switchChain && originalChainId !== sourceChain.id) {
                // Small delay to ensure tx is submitted
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                try {
                    await switchChain({ chainId: originalChainId });
                    console.log('[CrossChainSwap] Switched back to original chain');
                } catch (err) {
                    console.log('Could not switch back to original chain:', err);
                } finally {
                    // Re-enable ChainGuard after switching back
                    setChainGuardDisabled(false);
                    console.log('[CrossChainSwap] ChainGuard re-enabled');
                }
            } else {
                // Re-enable ChainGuard if we didn't switch
                setChainGuardDisabled(false);
                console.log('[CrossChainSwap] ChainGuard re-enabled (no switch needed)');
            }
        } catch (err) {
            toast.dismiss('chain-switch');
            toast.error(err instanceof Error ? err.message : 'Failed to switch chain');
            // Re-enable ChainGuard on error
            setChainGuardDisabled(false);
            console.log('[CrossChainSwap] ChainGuard re-enabled (error)');
        }
    };

    const handleSwapChains = () => {
        const tempChain = sourceChain;
        const tempToken = tokenIn;
        setSourceChain(destinationChain);
        setDestinationChain(tempChain);
        setTokenIn(tokenOut);
        setTokenOut(tempToken);
        setTokenInBalance(tokenOutBalance);
        setTokenOutBalance(tokenInBalance);
        setAmountIn('');
        clearQuote();
    };


    const isSameChain = sourceChain.id === destinationChain.id;
    const swapAllowed = isConnected && quote && Number(amountIn) > 0 && Number(tokenInBalance) > Number(amountIn) && !isSwapping && !isLoading && !isSameChain;

    useEffect(() => {
        if (!userAddress) return;
        if (receiverInput) return;
        setReceiverInput(userAddress);
        setReceiverAddress(userAddress);
    }, [receiverInput, setReceiverAddress, userAddress]);


    const loadChains = async () => {
        const lifiChains: SupportedChain[] = await apiLifi.getLifiChains()
        const chains = [CURRENT_CHAIN_CONFIG, ...lifiChains];
        setSupportedChains(chains)
    }

    const fetchChainTokens = async (chainId: number): Promise<CrossChainToken[]> => {
        if (!chainId) return [];
        //console.log("[fetchChainTokens] getLifiTokens for chainId", chainId)

        const commonTokens = COMMON_TOKENS[chainId] || [];

        if (chainId === 6343) return commonTokens; // MegaEth not supported by lifi

        const commonTokensAddresses = commonTokens.map(t => t.address.toLocaleLowerCase());

        const lifiTokens: apiLifi.LifiTokenInfo[] = await apiLifi.getLifiTokens(chainId);

        const lifiTokensFormatted: CrossChainToken[] = lifiTokens.map(t => ({
            address: t.address,
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            logoUri: t.logoURI,
            chainId: t.chainId,
            priceUSD: t.priceUSD,
        }));

        if (! (chainId in COMMON_TOKENS)) {
            return lifiTokensFormatted.slice(0, 10);
        }

        return lifiTokensFormatted.length > 0
            ? lifiTokensFormatted.filter(t => commonTokensAddresses.includes(t.address.toLowerCase()))
            : commonTokens;
    }

    const loadSourceChainTokens = async () => {
        const sourceTokens = sourceChain ? await fetchChainTokens(sourceChain.id) : []
        setSourceTokens(sourceTokens);

        if (sourceTokens.length > 0) {
            setTokenIn(sourceTokens[0]);

        } else {
            setTokenIn(null)
        }
    }

    const loadDestinationChainTokens = async () => {
        const destTokens = destinationChain ? await fetchChainTokens(destinationChain.id) : [];
        setDestTokens(destTokens);

        if (destTokens.length > 0) {
            setTokenOut(destTokens[0]);

        } else {
            setTokenOut(null);
        }
    }

    // Load Lifi chains at startup
    useEffect(() => {
        loadChains();
    }, []);

    // Set default tokens when source chain change
    useEffect(() => {
        //console.log('useEffect sourceChain changed')
        loadSourceChainTokens();
    }, [sourceChain.id]);

    // Set default tokens when destination chain change
    useEffect(() => {
        //console.log('useEffect destinationChain changed')
        loadDestinationChainTokens();
    }, [destinationChain.id]);


    // Retrieve tokenIn balance when tokenIn changes
    useEffect(() => {
        if (sourceChain.id && tokenIn) {
            const chain = getChainById(tokenIn.chainId)
            let canceled = false;

            getTokenBalance(chain, tokenIn.address)
                .then(result => {
                    if (canceled) return;
                    //console.log('getTokenBalance IN result:', result, tokenIn, sourceChain.id)
                    const balance = formatUnits(result, tokenIn.decimals);
                    setTokenInBalance(balance)
                })

            return () => {
                canceled = true;
            }
        }
    }, [sourceChain.id, tokenIn]);

    // Retrieve tokenOut balance when tokenOut changes
    useEffect(() => {
        if (destinationChain.id && tokenOut) {
            const chain = getChainById(tokenOut.chainId)
            let canceled = false;

            getTokenBalance(chain, tokenOut.address)
                .then(result => {
                    if (canceled) return;
                    //console.log('getTokenBalance OUT result:', result, tokenOut, destinationChain.id)
                    const balance = formatUnits(result, tokenOut.decimals);
                    setTokenOutBalance(balance)
                })

            return () => {
                canceled = true;
            }
        }
    }, [destinationChain.id, tokenOut]);

    // Fetch quote when inputs change
    useEffect(() => {
        if (tokenIn && tokenOut && Number(amountIn) > 0 && userAddress && sourceChain.id !== destinationChain.id) {
            const timer = setTimeout(() => {
                getQuote(tokenIn, tokenOut, amountIn, receiverAddress ?? undefined);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [tokenIn, tokenOut, amountIn, userAddress, sourceChain.id, destinationChain.id, receiverAddress, getQuote]);


    return (
        <div className="w-full">
            {/* Main Swap Card */}
            <div className="relative rounded-2xl bg-background-light p-1 mb-4">

                {/* Pay Section */}
                <CrossChainSwapField
                    fieldType={'tokenIn'}
                    isLoading={isLoading}
                    supportedChains={supportedChains.filter(c => c.id !== destinationChain.id)}
                    chain={sourceChain}
                    token={tokenIn}
                    tokens={sourceTokens}
                    quote={quote}
                    amount={amountIn}
                    tokenBalance={tokenInBalance}
                    setChain={setSourceChain}
                    setToken={setTokenIn}
                    setAmount={setAmountIn}
                />

                {/* Switch Button */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <button
                        onClick={handleSwapChains}
                        className="p-2 rounded-xl bg-background-light border-4 border-background hover:bg-background-light-sm transition-colors"
                    >
                        <SwitchIcon />
                    </button>
                </div>

                {/* Receive Section with Settings Icon */}
                <div className="relative">
                    <CrossChainSwapField
                        fieldType={'tokenOut'}
                        isLoading={isLoading}
                        supportedChains={supportedChains.filter(c => c.id !== sourceChain.id)}
                        chain={destinationChain}
                        token={tokenOut}
                        tokens={destTokens}
                        quote={quote}
                        tokenBalance={tokenOutBalance}
                        setChain={setDestinationChain}
                        setToken={setTokenOut}
                    />
                    <button
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-background/50 transition-colors"
                        title="Advanced settings"
                    >
                        <svg className="w-4 h-4 text-foreground-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Advanced Settings - Custom Receiver */}
            {showAdvancedSettings && (
                <div className="rounded-xl bg-background-light p-4 mb-4 border border-yellow-500/20">
                    <div className="flex items-start gap-2 mb-3">
                        <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <div className="text-xs text-yellow-500">
                            <div className="font-semibold mb-1">Custom Receiver Address (Advanced)</div>
                            <div className="text-yellow-500/80">
                                Not all routes support custom receivers. Double-check the address is correct for the destination chain or you may lose funds permanently.
                            </div>
                        </div>
                    </div>
                    <div className="text-sm text-foreground-light mb-2">Destination receiver address</div>
                    <input
                        value={receiverInput}
                        onChange={(e) => {
                            const next = e.target.value.trim();
                            setReceiverInput(next);

                            if (!next) {
                                setReceiverInputError(null);
                                setReceiverAddress(userAddress ?? null);
                                return;
                            }

                            if (!isValidAddress(next as `0x${string}`)) {
                                setReceiverInputError('Invalid EVM address');
                                return;
                            }

                            setReceiverInputError(null);
                            setReceiverAddress(next as Address);
                        }}
                        placeholder={userAddress ?? '0x…'}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-white/10 text-sm font-mono"
                    />
                    {receiverInputError && (
                        <div className="text-xs text-red-400 mt-2">{receiverInputError}</div>
                    )}
                    {receiverAddress && receiverAddress !== userAddress && (
                        <div className="text-xs text-foreground-light mt-2">
                            Tokens will be sent to: <span className="font-mono">{receiverAddress.slice(0, 6)}...{receiverAddress.slice(-4)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Route Info */}
            {quote && (
                <div className="rounded-xl bg-background-light p-3 mb-4 text-sm">
                    <div className="flex justify-between mb-2">
                        <span className="text-foreground-light">Route</span>
                        <span className="font-medium">
                            {quote.steps.map(s => s.tool).join(' → ')}
                        </span>
                    </div>
                    <div className="flex justify-between mb-2">
                        <span className="text-foreground-light">Est. time</span>
                        <span className="font-medium">
                            ~{Math.ceil(quote.executionDuration / 60)} min
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-foreground-light">Min. received</span>
                        <span className="font-medium">
                            {formatNumber(formatUnits(BigInt(quote.toAmountMin), tokenOut?.decimals || 18))} {tokenOut?.symbol}
                        </span>
                    </div>
                </div>
            )}

            {/* Execution Progress */}
            {isSwapping && executionSteps.length > 0 && (
                <div className="rounded-xl bg-background-light p-3 mb-4">
                    <div className="text-sm font-medium mb-2">Transaction Progress</div>
                    {executionSteps.map((step, idx) => (
                        <div
                            key={idx}
                            className={`flex items-center gap-2 text-sm py-1 ${
                                idx < currentStep ? 'text-green-500' :
                                idx === currentStep ? 'text-foreground' :
                                'text-foreground-light'
                            }`}
                        >
                            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-xs">
                                {idx < currentStep ? '✓' : idx + 1}
                            </span>
                            <span>{step.type}: {step.tool}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Same Chain Warning */}
            {isSameChain && (
                <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 mb-4 text-center text-sm text-yellow-500">
                    Select different chains for cross-chain swap
                </div>
            )}

            {/* Error Messages */}
            {error && !isSameChain && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 mb-4 text-center text-sm text-red-500">
                    {error}
                </div>
            )}

            {/* Action Button */}
            {!isConnected ? (
                <Button
                    variant="secondary"
                    className="w-full py-6 text-lg"
                    onClick={() => openConnectModal?.()}
                >
                    Connect Wallet
                </Button>
            ) : isSameChain ? (
                <Button
                    variant="default"
                    className="w-full py-6 text-lg"
                    disabled
                >
                    Select Different Chains
                </Button>
            ) : (
                <Button
                    variant="default"
                    className="w-full py-6 text-lg"
                    disabled={!swapAllowed}
                    onClick={handleSwap}
                >
                    {isSwapping ? 'Swapping...' : isLoading ? 'Finding Route...' : 'Swap'}
                </Button>
            )}

            {/* Footer */}
            <p className="text-xs text-foreground-light text-center mt-4">
                Cross-chain swaps powered by LI.FI
            </p>
        </div>
    );
};


export default CrossChainSwapComponent;
