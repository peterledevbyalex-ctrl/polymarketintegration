"use client"

import { MouseEvent, useEffect, useState, useMemo } from 'react'
import toast from 'react-hot-toast';
import { isAddress } from 'viem';
import { usePublicClient } from 'wagmi';
import { erc20Abi } from 'viem';

import { formatAddress, formatNumber, formatUsd } from '@/lib/ui_utils'
import { useApp } from '@/providers/AppProvider';
import { useEthPrice } from '@/hooks/useEthPrice';
import { useLifiTokens } from '@/hooks/useLifiTokens';
import * as apiLifi from '@/lib/api_lifi';
import { ETH_ADDRESS, USDC_ADDRESS, WETH_ADDRESS } from '@/config.app';

import type { Token } from '@/types'

import { TokenLogo } from './TokenLogo'
import { CopyIcon } from './icons/CopyIcon';


interface TokenSelectModalProps {
    isOpen: boolean
    closeModal: () => void
    selectToken: (token: Token) => void
    selectedToken?: Token
    tokens: Token[]
    userTokens: Token[]
    loading: boolean
    showLifiTokens?: boolean
}


export const TokenSelectModal = ({ isOpen, closeModal, selectToken, selectedToken, tokens, userTokens, loading, showLifiTokens = true }: TokenSelectModalProps) => {
    const { isDesktop, lastEthPrice } = useApp();

    const safeTokens = useMemo(() => {
        return (tokens as Array<Token | null | undefined>).filter((t): t is Token => Boolean(t && t.id && t.symbol && t.name));
    }, [tokens]);

    const safeUserTokens = useMemo(() => {
        return (userTokens as Array<Token | null | undefined>).filter((t): t is Token => Boolean(t && t.id));
    }, [userTokens]);

    const [searchQuery, setSearchQuery] = useState('')
    const [showMoreTokens, setShowMoreTokens] = useState(false)

    // Custom token import
    const [customToken, setCustomToken] = useState<Token | null>(null)
    const [isLoadingCustom, setIsLoadingCustom] = useState(false)
    const publicClient = usePublicClient()

    // LI.FI tokens for aggregator
    const { isLoading: lifiLoading, filteredTokens: filteredLifiTokens, setSearchQuery: setLifiSearchQuery } = useLifiTokens(undefined, showMoreTokens && showLifiTokens);

    const userTokensBalances = useMemo((): Record<string, string> => {
        return Object.fromEntries(
            safeUserTokens
                .map(t => [t.id.toLowerCase(), t.userBalance])
                .filter((tuple): tuple is [string, string] => Boolean(tuple[1]))
        );
    }, [safeUserTokens]);

    // Filter local tokens
    const filteredTokens = useMemo(() => {
        const query = searchQuery.toLowerCase();

        const filtered = (safeTokens ?? []).filter(token =>
            token.id.toLowerCase().includes(query) ||
            token.symbol.toLowerCase().includes(query) ||
            token.name.toLowerCase().includes(query)
        );

        return filtered.map(t => {
            const balance = userTokensBalances[t.id.toLowerCase()];
            return balance ? { ...t, userBalance: balance } : t;
        });
    }, [safeTokens, searchQuery, userTokensBalances]);

    const tokenById = useMemo(() => {
        return new Map((safeTokens ?? []).map(t => [t.id.toLowerCase(), t] as const));
    }, [safeTokens]);

    const commonBases = useMemo(() => {
        const ids = [ETH_ADDRESS, WETH_ADDRESS, USDC_ADDRESS].map(id => id.toLowerCase());
        const list = ids
            .map((id) => tokenById.get(id))
            .filter((t): t is Token => Boolean(t))
            .map(t => {
                const balance = userTokensBalances[t.id.toLowerCase()];
                return balance ? { ...t, userBalance: balance } : t;
            });

        const unique: Token[] = [];
        const seen = new Set<string>();
        for (const t of list) {
            const id = t.id.toLowerCase();
            if (seen.has(id)) continue;
            seen.add(id);
            unique.push(t);
        }

        return unique;
    }, [tokenById, userTokensBalances]);

    const topTraded = useMemo(() => {
        const excluded = new Set(commonBases.map(t => t.id.toLowerCase()));
        const ranked = (safeTokens ?? [])
            .filter(t => !excluded.has(t.id.toLowerCase()))
            .map((token, index) => {
                const volumeUsd24h = token.volumeUSD24h ? Number(token.volumeUSD24h) : 0;
                const volumeUsd = token.volumeUSD ? Number(token.volumeUSD) : 0;
                const txCount = token.txCount ? Number(token.txCount) : 0;
                return {
                    token,
                    index,
                    volumeUsd24h: isFinite(volumeUsd24h) ? volumeUsd24h : 0,
                    volumeUsd: isFinite(volumeUsd) ? volumeUsd : 0,
                    txCount: isFinite(txCount) ? txCount : 0,
                };
            })
            .sort((a, b) => (b.volumeUsd24h - a.volumeUsd24h) || (b.volumeUsd - a.volumeUsd) || (b.txCount - a.txCount) || (a.index - b.index));

        const withActivity = ranked.filter(x => x.volumeUsd24h > 0 || x.volumeUsd > 0 || x.txCount > 0);
        const candidates = [...withActivity, ...ranked];

        const unique: Token[] = [];
        const seen = new Set<string>();
        for (const item of candidates) {
            const t = item.token;
            const key = t.symbol.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const balance = userTokensBalances[t.id.toLowerCase()];
            unique.push(balance ? { ...t, userBalance: balance } : t);

            if (unique.length >= 8) break;
        }

        return unique;
    }, [commonBases, safeTokens, userTokensBalances]);

    const sortedTokens = useMemo(() => {
        const ethUsd = lastEthPrice ? Number(lastEthPrice) : null;

        const getTokenUsdPrice = (token: Token): number => {
            const isEthLike = token.symbol === 'ETH' || token.symbol === 'WETH';
            if (isEthLike && ethUsd !== null && isFinite(ethUsd) && ethUsd > 0) {
                return ethUsd;
            }

            const derivedEth = token.derivedETH !== undefined && token.derivedETH !== null && String(token.derivedETH).trim() !== ''
                ? Number(token.derivedETH)
                : null;
            if (derivedEth !== null && ethUsd !== null && isFinite(derivedEth) && derivedEth > 0 && isFinite(ethUsd) && ethUsd > 0) {
                return derivedEth * ethUsd;
            }

            const rawDerivedUsd = token.derivedUSD !== undefined && token.derivedUSD !== null && String(token.derivedUSD).trim() !== ''
                ? Number(token.derivedUSD)
                : null;
            if (rawDerivedUsd !== null && isFinite(rawDerivedUsd) && rawDerivedUsd > 0) {
                return rawDerivedUsd;
            }

            return 0;
        };

        const getHoldingsUsd = (token: Token): number => {
            const balance = token.userBalance ? Number(token.userBalance) : 0;
            if (!isFinite(balance) || balance <= 0) return 0;
            return balance * getTokenUsdPrice(token);
        };

        return filteredTokens
            .map((token, index) => ({ token, index, holdingsUsd: getHoldingsUsd(token) }))
            .sort((a, b) => (b.holdingsUsd - a.holdingsUsd) || (a.index - b.index))
            .map(({ token }) => token);
    }, [filteredTokens, lastEthPrice]);

    // Filter LI.FI tokens (exclude ones already in local tokens)
    const localTokenIds = useMemo(() => new Set(safeTokens.map(t => t.id.toLowerCase())), [safeTokens]);
    const additionalLifiTokens = useMemo(() => {
        if (!showMoreTokens) return [];
        return filteredLifiTokens.filter(t => !localTokenIds.has(t.id.toLowerCase()));
    }, [filteredLifiTokens, localTokenIds, showMoreTokens]);

    // Update LI.FI search when search query changes
    useEffect(() => {
        if (!showMoreTokens) return;
        setLifiSearchQuery(searchQuery);
    }, [searchQuery, setLifiSearchQuery, showMoreTokens]);

    // Fetch custom token when user pastes an address
    useEffect(() => {
        const fetchCustomToken = async () => {
            const query = searchQuery.trim();

            // Check if it's a valid address
            if (!isAddress(query)) {
                setCustomToken(null);
                return;
            }

            // Check if already in local tokens
            if (safeTokens.some(t => t.id.toLowerCase() === query.toLowerCase())) {
                setCustomToken(null);
                return;
            }

            if (!publicClient) {
                return;
            }

            setIsLoadingCustom(true);

            try {
                const tokenAddress = query as `0x${string}`;
                const contractParams = { address: tokenAddress, abi: erc20Abi } as const;

                const [name, symbol, decimals] = await Promise.all([
                    (publicClient as any).readContract({ ...contractParams, functionName: 'name' }),
                    (publicClient as any).readContract({ ...contractParams, functionName: 'symbol' }),
                    (publicClient as any).readContract({ ...contractParams, functionName: 'decimals' }),
                ]);

                setCustomToken({
                    id: query.toLowerCase() as `0x${string}`,
                    name: name as string,
                    symbol: symbol as string,
                    decimals: Number(decimals),
                    userBalance: undefined,
                    logoUri: undefined,
                    derivedETH: undefined,
                    derivedUSD: undefined,
                });

            } catch (err) {
                //console.error('[TokenSelectModal] Failed to fetch custom token:', err);
                setCustomToken(null);

            } finally {
                setIsLoadingCustom(false);
            }
        };

        const debounce = setTimeout(fetchCustomToken, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, tokens, publicClient]);

    // Check if LI.FI is supported on current chain
    // Note: Even if not supported, we show the option but it will show "not supported" message
    const lifiSupported = true; // Always show for now, will show empty state if chain not supported


    const copyToClipboard = (text: string) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                toast.success('Token address copied');

            } else {
                toast.error('Unable to write to the clipboard');
            }

        } catch (err: any) {
            //console.warn(`copyToClipboard ERROR. ${err.message}`)
            toast.error('Unable to write to the clipboard');
        }
    }


    const clicModal = (event: MouseEvent) => {
        // @ts-ignore
        if (event.target.classList.contains('modal-container')) {
            closeModal()
        }
    }


    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50 modal-container" onClick={(e) => clicModal(e)}>

            <div className="bg-background-light-sm border border-background-light rounded-2xl w-full max-w-md sm:max-w-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between m-4 mb-4">
                    <h2 className="text-xl font-semibold">Select Token</h2>

                    <button
                        onClick={closeModal}
                        className="text-2xl p-2 rounded-lg hover:bg-background-light transition-colors duration-200 cursor-pointer"
                    >
                        ×
                    </button>
                </div>

                {/* Search */}
                <div className="mx-4 mb-4">
                    <input
                        type="text"
                        placeholder="🔍︎ Search tokens"
                        autoFocus={isDesktop}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={loading}
                        className="w-full bg-background-light px-4 py-3 rounded-xl focus:ring-1 outline-none text-foreground font-semibold placeholder-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>

                {!loading && searchQuery.trim() === '' && (commonBases.length > 0 || topTraded.length > 0) && (
                    <div className="mx-4 mb-4 space-y-4">
                        {commonBases.length > 0 && (
                            <div>
                                <div className="text-xs text-foreground-light font-medium mb-2">Common bases</div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-6 gap-y-3">
                                    {commonBases.map(token => (
                                        <TokenChip
                                            key={token.id}
                                            token={token}
                                            onSelect={() => { selectToken(token); closeModal(); }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {topTraded.length > 0 && (
                            <div>
                                <div className="text-xs text-foreground-light font-medium mb-2">Top traded</div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-6 gap-y-3">
                                    {topTraded.map(token => (
                                        <TokenChip
                                            key={token.id}
                                            token={token}
                                            onSelect={() => { selectToken(token); closeModal(); }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Token List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="text-lg">Loading tokens...</div>
                        </div>
                    ) : (
                        <>
                            {/* Local Pool Tokens */}
                            {sortedTokens.length > 0 && (
                                <>
                                    <div className="px-4 py-2 text-xs text-foreground-light font-medium bg-background-light/50">
                                        Pool Tokens
                                    </div>
                                    {sortedTokens.map((token) => (
                                        <TokenRow
                                            key={token.id}
                                            token={token}
                                            lastEthPrice={lastEthPrice}
                                            isSelected={selectedToken?.id === token.id}
                                            onSelect={() => { selectToken(token); closeModal(); }}
                                            onCopy={copyToClipboard}
                                        />
                                    ))}
                                </>
                            )}

                            {/* More Tokens Toggle */}
                            {showLifiTokens && lifiSupported && (
                                <button
                                    onClick={() => setShowMoreTokens(!showMoreTokens)}
                                    className="w-full px-4 py-3 flex items-center justify-between text-sm text-foreground-light hover:bg-background-light transition-colors border-t border-background-light"
                                >
                                    <span className="flex items-center gap-2">
                                        <span>🔄</span>
                                        <span>More tokens via LI.FI</span>
                                        {lifiLoading && <span className="animate-pulse">...</span>}
                                    </span>
                                    <span className={`transition-transform ${showMoreTokens ? 'rotate-180' : ''}`}>
                                        ▼
                                    </span>
                                </button>
                            )}

                            {/* LI.FI Aggregator Tokens */}
                            {showMoreTokens && (
                                <>
                                    {!apiLifi.isCurrentChainSupportedByLifi() ? (
                                        <div className="px-4 py-6 text-center text-foreground-light">
                                            <div className="text-sm mb-1">LI.FI aggregator not yet available on this chain</div>
                                            <div className="text-xs">Coming soon for MegaETH!</div>
                                        </div>
                                    ) : additionalLifiTokens.length > 0 ? (
                                        <>
                                            <div className="px-4 py-2 text-xs text-foreground-light font-medium bg-background-light/50">
                                                Aggregator Tokens ({additionalLifiTokens.length})
                                            </div>
                                            {additionalLifiTokens.slice(0, 50).map((token) => (
                                                <TokenRow
                                                    key={token.id}
                                                    token={token}
                                                    lastEthPrice={lastEthPrice}
                                                    isSelected={selectedToken?.id === token.id}
                                                    onSelect={() => { selectToken(token); closeModal(); }}
                                                    onCopy={copyToClipboard}
                                                    isLifiToken
                                                />
                                            ))}
                                            {additionalLifiTokens.length > 50 && (
                                                <div className="px-4 py-2 text-xs text-foreground-light text-center">
                                                    Showing 50 of {additionalLifiTokens.length} tokens. Use search to find more.
                                                </div>
                                            )}
                                        </>
                                    ) : lifiLoading ? (
                                        <div className="px-4 py-6 text-center text-foreground-light">
                                            <div className="text-sm animate-pulse">Loading tokens...</div>
                                        </div>
                                    ) : (
                                        <div className="px-4 py-6 text-center text-foreground-light">
                                            <div className="text-sm">No additional tokens found</div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Custom Token Import */}
                            {customToken && (
                                <>
                                    <div className="px-4 py-2 text-xs text-foreground-light font-medium bg-background-light/50">
                                        Import Token
                                    </div>
                                    <TokenRow
                                        token={customToken}
                                        lastEthPrice={lastEthPrice}
                                        isSelected={false}
                                        onSelect={() => { selectToken(customToken); closeModal(); }}
                                        onCopy={copyToClipboard}
                                        isCustomToken
                                    />
                                </>
                            )}

                            {/* Loading Custom Token */}
                            {isLoadingCustom && (
                                <div className="px-4 py-4 text-center text-foreground-light">
                                    <div className="text-sm animate-pulse">Loading token info...</div>
                                </div>
                            )}

                            {/* Empty State */}
                            {sortedTokens.length === 0 && additionalLifiTokens.length === 0 && !customToken && !isLoadingCustom && (
                                <div className="p-8 text-center text-gray-400">
                                    {searchQuery ? (
                                        isAddress(searchQuery.trim())
                                            ? 'Token not found at this address'
                                            : 'No tokens found. Paste a token address to import.'
                                    ) : 'No tokens available'}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}


// Token Row Component
const TokenRow: React.FC<{
    token: Token;
    lastEthPrice: string;
    isSelected: boolean;
    onSelect: () => void;
    onCopy: (text: string) => void;
    isLifiToken?: boolean;
    isCustomToken?: boolean;
}> = ({ token, lastEthPrice, isSelected, onSelect, onCopy, isLifiToken, isCustomToken }) => {
    const balance = token.userBalance ? Number(token.userBalance) : null;
    const isEthLike = token.symbol === 'ETH' || token.symbol === 'WETH';

    const rawDerivedUsd = token.derivedUSD !== undefined && token.derivedUSD !== null && String(token.derivedUSD).trim() !== ''
        ? Number(token.derivedUSD)
        : null;

    const derivedEth = token.derivedETH !== undefined && token.derivedETH !== null && String(token.derivedETH).trim() !== ''
        ? Number(token.derivedETH)
        : null;

    const fallbackEthUsd = isEthLike && lastEthPrice ? Number(lastEthPrice) : null;

    const ethUsd = lastEthPrice ? Number(lastEthPrice) : null;
    const usdFromDerivedEth = (derivedEth !== null && ethUsd !== null && isFinite(derivedEth) && derivedEth > 0 && isFinite(ethUsd) && ethUsd > 0)
        ? derivedEth * ethUsd
        : null;

    const derivedUsd = (usdFromDerivedEth !== null)
        ? usdFromDerivedEth
        : (rawDerivedUsd !== null && isFinite(rawDerivedUsd) && rawDerivedUsd > 0)
            ? rawDerivedUsd
            : (fallbackEthUsd !== null && isFinite(fallbackEthUsd) && fallbackEthUsd > 0 ? fallbackEthUsd : null);
    const balanceUsd = balance !== null && derivedUsd !== null ? balance * derivedUsd : null;

    return (
        <button
            onClick={onSelect}
            className={`w-full p-4 flex items-center space-x-2 transition-all ${isSelected
                    ? 'border-r-2'
                    : 'hover:border-r-2 hover:bg-background-light-xl cursor-pointer'
                }`}
        >
            <TokenLogo token={token} />

            <div className="text-left">
                <div className="flex gap-2 items-center">
                    <div className="text-foreground">{token.symbol}</div>
                    <div className="text-foreground-light-xl text-sm">{token.name}</div>
                    {isLifiToken && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                            LI.FI
                        </span>
                    )}
                    {isCustomToken && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                            Import
                        </span>
                    )}
                </div>
                <div className="flex text-xs text-foreground-light-xl">
                    <span>{formatAddress(token.id)}</span>
                    <div
                        className="inline ms-2 text-foreground-light-xl hover:text-foreground-light-sm cursor-pointer"
                        onClick={(event) => { event.stopPropagation(); onCopy(token.id) }}
                    >
                        <CopyIcon />
                    </div>
                </div>
            </div>

            <div className="ms-auto text-sm text-foreground-light">
                {token.userBalance && (
                    <div className="text-right">
                        <div className="text-foreground">{formatNumber(token.userBalance)} {token.symbol}</div>
                        {balanceUsd !== null && (
                            <div className="text-sm">${formatUsd(balanceUsd)}</div>
                        )}
                    </div>
                )}
            </div>
        </button>
    );
};


const TokenChip: React.FC<{ token: Token; onSelect: () => void }> = ({ token, onSelect }) => {
    return (
        <button
            onClick={onSelect}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-background-light/60 transition-colors cursor-pointer w-full min-w-0"
            title={token.name}
        >
            <TokenLogo token={token} size="lg" />
            <div className="min-w-0 text-left leading-tight">
                <div className="text-sm text-foreground font-semibold truncate">{token.symbol}</div>
                <div className="text-xs text-foreground-light truncate">{token.name}</div>
            </div>
        </button>
    );
};

