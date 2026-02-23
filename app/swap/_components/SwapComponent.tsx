"use client"

import React, { useEffect, useState } from 'react'
import { useConnectModal } from '@rainbow-me/rainbowkit';
import toast from 'react-hot-toast';
import { Address, parseUnits } from 'viem';

import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';
import * as apiBlockchainPools from '@/lib/api_blockchain_pools';
import * as apiBlockchainSwapsTax from '@/lib/api_blockchain_swaps_tax';
import * as apiBlockchainSwapsTaxPermit2 from '@/lib/api_blockchain_swaps_tax_permit2';
import * as apiBlockchainSwapsSmartWallet from '@/lib/api_blockchain_swaps_smartwallet';

import { CURRENT_CHAIN, ETH_ADDRESS, USDC_ADDRESS, USDC_WETH_POOL_ADDRESS, USE_MULTICALL_SWAP, USE_UNIVERSAL_ROUTER, USE_SMART_WALLET, WETH_ADDRESS, PERMIT2_ADDRESS, SWAP_ROUTER_ADDRESS } from '@/config.app';
import { formatNumber, formatTokenAmount } from '@/lib/ui_utils';
import { calculateSlippageAuto, clampSlippagePercent, DEFAULT_SWAP_SLIPPAGE_AUTO_FALLBACK } from '@/lib/uniswap_utils';
import { excludeTokens, isSameAddress, isTokenETH, isTokenUSDC, isTokenWETH } from '@/lib/tokens_utils';
import { useTokens } from '@/hooks/useTokens';
import { useUserTokens } from '@/hooks/useUserTokens';
import { useQuotation } from '@/hooks/useQuotation';
import { useSwap, SmartWalletContext } from '@/hooks/useSwap';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import { useApp } from '@/providers/AppProvider';

import { SwapField } from './SwapField';
import { Button } from '@/components/ui/button';
import { SwapSettingsModal } from './SwapSettingsModal'
import { TokenSelectModal } from '@/components/TokenSelectModal'
import { MegaLogo } from '@/components/icons/MegaLogo';
import { SwitchIcon } from '@/components/icons/SwitchIcon';
import { SettingsIcon } from '@/components/icons/SettingsIcon';
import { TransactionsInfoModal } from '@/components/TransactionsInfoModal';

import type { Token, TransactionResult } from '@/types';


type SwapComponentProps = {
    tokens?: Token[],
    inputCurrency?: string
    outputCurrency?: string
    hideHeader?: boolean
    isSettingsModalOpen: boolean
    setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>
}

type TaxInfo = {
    isTaxable: boolean;
    taxRate: number;
    vault: string;
}


const defaultSlippage = null; //0.5;


export const SwapComponent: React.FC<SwapComponentProps> = ({ tokens: preLoadedTokens, inputCurrency, outputCurrency, hideHeader = false, isSettingsModalOpen, setIsSettingsModalOpen }) => {
    // Wallet
    const { isConnected, userAddress, walletClient } = useApp()
    const { openConnectModal } = useConnectModal()

    // ETH Price
    const { lastEthPrice } = useApp();

    // Tokens & balances
    const { tokens, tokensLoading, tokensError } = useTokens(preLoadedTokens);
    const { userTokens, userTokensInitialized, userTokensLoading, userTokensError, fetchUserTokens, updateUserTokenBalance } = useUserTokens(userAddress);

    const [tokenIn, setTokenIn] = useState<Token | null>(getInitialTokenIn(tokens, inputCurrency));
    const [tokenOut, setTokenOut] = useState<Token | null>(getInitialTokenOut(tokens, outputCurrency, tokenIn))

    const [tokenInBalance, setTokenInBalance] = useState<string | null>(null);
    const [tokenOutBalance, setTokenOutBalance] = useState<string | null>(null);

    // Amounts
    const [amountIn, setAmountIn] = useState("0");
    const [amountOut, setAmountOut] = useState("");

    // Slippage
    const [slippage, setSlippage] = useState<number | null>(defaultSlippage)
    const [isSlippageAuto, setIsSlippageAuto] = useState(defaultSlippage === null)

    // Routers
    const [useMulticallSwap, setUseMulticallSwap] = useState(USE_MULTICALL_SWAP)
    const [useUniversalRouter, setUseUniversalRouter] = useState(USE_UNIVERSAL_ROUTER)

    // Smart Wallet for atomic swaps
    const [useSmartWalletFeature, setUseSmartWalletFeature] = useState(USE_SMART_WALLET)
    const {
        smartWalletAddress,
        isSmartWalletReady,
        isInitializing: isSmartWalletInitializing,
        initializeSmartWallet,
        batchTransactions
    } = useSmartWallet();

    // Build smart wallet context for useSwap
    const smartWalletBatchTransactions = (calls: any[], onUserOpSubmitted?: () => void) => {
        return batchTransactions(calls, undefined, onUserOpSubmitted);
    };

    const smartWalletContext: SmartWalletContext | undefined = isSmartWalletReady && smartWalletAddress ? {
        smartWalletAddress,
        batchTransactions: smartWalletBatchTransactions,
        isReady: true,
    } : undefined;

    // Swap
    const swapHook = useSwap(walletClient, tokenIn, tokenOut, useMulticallSwap, useUniversalRouter, useSmartWalletFeature, smartWalletContext)
    const { swapsCount, isSwapping, swapInfo, swapError, approvalPrefetch, routeDecision } = swapHook;
    const { executeSwap, setSwapInfo, setSwapError } = swapHook;

    // Quotation
    const quotationHook = useQuotation(tokenIn, tokenOut, amountIn, amountOut, slippage, tokenInBalance, setAmountIn, setAmountOut, setSwapInfo);
    const { quotation, quotationInfos, minimumReceived, slippageAuto, quotationLoading, quotationError } = quotationHook
    const { setQuotation, setQuotationType, setMinimumReceived } = quotationHook

    // Modals state
    const [isFromModalOpen, setIsFromModalOpen] = useState(false)
    const [isToModalOpen, setIsToModalOpen] = useState(false)
    //const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

    // TransactionsInfo state
    const [isTransactionsInfoModalOpen, setIsTransactionsInfoModalOpen] = useState(false);
    const [transactionsInfoSteps, setTransactionsInfoSteps] = useState<string[]>([]);
    const [transactionsInfoCurrentStep, setTransactionsInfoCurrentStep] = useState<number | null>(1)

    // Tax info state (for both tokenIn and tokenOut)
    const [taxInfoFrom, setTaxInfoFrom] = useState<(TaxInfo & { taxAmount: string }) | null>(null);
    const [taxInfoTo, setTaxInfoTo] = useState<TaxInfo | null>(null);
    const [taxInfoLoading, setTaxInfoLoading] = useState(false);

    // Check if this is a multi-hop swap with a taxable token (not supported)
    const isMultiHop = quotation?.path && quotation.path.length > 1;
    const isTaxableSwap = taxInfoFrom?.isTaxable || taxInfoTo?.isTaxable;
    const isMultiHopTaxable = isMultiHop && isTaxableSwap;

    const swapDisabledReason = (() => {
        if (!isConnected) return 'Connect wallet';
        if (tokensLoading) return 'Loading tokens...';
        if (!tokenIn || !tokenOut) return 'Select tokens';
        if (quotationLoading) return 'Fetching quote...';
        if (isMultiHopTaxable) return 'Multi-hop swaps not available for taxable tokens';
        if (!Number(amountIn) || Number(amountIn) <= 0) return 'Enter an amount';
        if (!tokenInBalance || !isFinite(Number(tokenInBalance))) return 'Fetching balance...';
        if (Number(amountIn) > Number(tokenInBalance)) return `Insufficient ${tokenIn.symbol} balance`;
        if (!quotation || !Number(amountOut) || Number(amountOut) <= 0) return 'Insufficient liquidity for this trade';
        if (quotation.priceImpact >= 99.9) return 'Insufficient liquidity (price impact too high)';
        return null;
    })();

    const swapAllowed = swapDisabledReason === null && !isSwapping;


    let swapText = 'Swap';
    if (tokensLoading) swapText = "Loading...";
    else if (quotationLoading) swapText = "Loading...";
    else if (isMultiHopTaxable) swapText = "Multi-hop not available";


    const handleSwitchTokens = () => {
        setQuotation(null)
        setTokenIn(tokenOut)
        setTokenOut(tokenIn)
        setTokenOutBalance(tokenInBalance)
        setTokenInBalance(tokenOutBalance)
        setAmountOut('');
        setQuotationType('ExactInput');
        setAmountIn(amountOut);
    }


    const onSlippageChange = (slippage: number | null) => {
        if (slippage === null) {
            setIsSlippageAuto(true);

        } else {
            setIsSlippageAuto(false);
        }

        setSlippage(slippage)
    };


    const handleSwap = async () => {
        if (!quotation ||!tokenIn ||!tokenOut ||!userAddress) return;

        const isEthInput = isTokenETH(tokenIn.id);
        const isEthOutput = isTokenETH(tokenOut.id);
        const isWethInput = isTokenWETH(tokenIn.id);
        const isWethOutput = isTokenWETH(tokenOut.id);
        const isEthDeposit = isEthInput && isWethOutput;
        const isEthWithdraw = isWethInput && isEthOutput;

        // Track if smart wallet is ready (local var since React state is async)
        let smartWalletReady = isSmartWalletReady;
        let currentSmartWalletAddress = smartWalletAddress;
        let currentKernelClient: any = null;

        // Initialize smart wallet if not ready (for sponsored atomic swaps)
        // Only if useSmartWalletFeature is enabled
        if (useSmartWalletFeature && !smartWalletReady && !isSmartWalletInitializing && isConnected && !isEthInput) {
            try {
                setSwapInfo('Setting up gasless swaps...');
                toast.loading('Enabling gasless swaps...', { id: 'smart-wallet-init' });

                const initResult = await initializeSmartWallet();

                toast.success('Gasless swaps enabled!', { id: 'smart-wallet-init' });
                setSwapInfo('');

                // Use the returned values directly (don't wait for React state)
                smartWalletReady = true;
                currentSmartWalletAddress = initResult.smartWalletAddress;
                currentKernelClient = initResult.kernelClient;

            } catch (err: any) {
                //console.warn('[Swap] Smart wallet init failed, continuing with fallback:', err);
                toast.dismiss('smart-wallet-init');
                // Continue without smart wallet - will use Permit2 or sequential
            }
        }

        // Build Transactions Steps
        const steps = await buildSwapSteps(smartWalletReady, currentSmartWalletAddress, isEthInput, isEthOutput, isEthDeposit, isEthWithdraw);

        setTransactionsInfoSteps(steps);
        setTransactionsInfoCurrentStep(1);
        setIsTransactionsInfoModalOpen(true);

        // Calculate auto slippage based on price impact
        // Base slippage starts at 0.1% and increases with price impact
        let autoSlippage = slippage ?? defaultSlippage ?? DEFAULT_SWAP_SLIPPAGE_AUTO_FALLBACK;

        if (isSlippageAuto) {
            // Calculate "autoSlippage" from "sqrtPriceX96" & "sqrtPriceX96After"
            autoSlippage = calculateSlippageAuto(tokenIn, tokenOut, quotation)
        }

        autoSlippage = Math.round(autoSlippage * 100) / 100; // Round to 2 decimal places

        const rawSwapSlippage = isSlippageAuto ? autoSlippage : (slippage ?? DEFAULT_SWAP_SLIPPAGE_AUTO_FALLBACK);
        const maxSlippage = isSlippageAuto ? 5 : 50;
        const swapSlippage = clampSlippagePercent(rawSwapSlippage, 0.05, maxSlippage);

        // Build fresh smart wallet context (in case it was just initialized)
        // If we just initialized, use the kernel client directly; otherwise use the hook's batchTransactions
        const freshBatchTransactions = currentKernelClient
            ? (calls: any[], onUserOpSubmitted?: () => void) => batchTransactions(calls, currentKernelClient, onUserOpSubmitted)
            : (calls: any[], onUserOpSubmitted?: () => void) => batchTransactions(calls, undefined, onUserOpSubmitted);

        const freshSmartWalletContext: SmartWalletContext | undefined =
            (smartWalletReady && currentSmartWalletAddress) ? {
                smartWalletAddress: currentSmartWalletAddress,
                batchTransactions: freshBatchTransactions,
                isReady: true,
            } : undefined;

        // Execute the swap
        const result: TransactionResult = await executeSwap(quotation, swapSlippage, setTransactionsInfoCurrentStep, freshSmartWalletContext);

        // Close transaction modal and display notification
        setIsTransactionsInfoModalOpen(false);

        if (result?.success) {
            setAmountIn('0')
            setAmountOut('')
            setQuotation(null);
            setMinimumReceived('')

            const transactionHash = result.transactionHash;
            const explorerBaseUrl = CURRENT_CHAIN.blockExplorers?.default?.url;
            const explorerTxUrl = transactionHash && explorerBaseUrl
                ? `${explorerBaseUrl.replace(/\/$/, '')}/tx/${transactionHash}`
                : null;

            if (transactionHash && explorerTxUrl) {
                const shortHash = `${transactionHash.slice(0, 10)}…${transactionHash.slice(-8)}`;

                toast.custom(
                    (t) => (
                        <div
                            className={`${
                                t.visible ? 'animate-enter' : 'animate-leave'
                            } bg-background border border-white/10 rounded-lg px-4 py-3 shadow-xl flex items-center gap-3`}
                        >
                            <div className="font-medium">Swap successful!</div>
                            <a
                                href={explorerTxUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline"
                            >
                                {shortHash}
                            </a>
                        </div>
                    ),
                    { duration: 5000 }
                );

            } else {
                toast.success("Swap successful!", { removeDelay: 5000 });
            }

        } else {
            toast.error("Swap Failed!", { removeDelay: 5000 });
        }
    }


    const buildSwapSteps = async (smartWalletReady: boolean, currentSmartWalletAddress: Address, isEthInput: boolean, isEthOutput: boolean, isEthDeposit: boolean, isEthWithdraw: boolean) => {
        const steps: string[] = [];

        /*
           Steps Cases
            │
            ├─ ETH Withdraw
            │   ├─ "Confirm in wallet"
            │   └─ RETURN
            │
            ├─ ETH Deposit
            │   ├─ "Confirm in wallet"
            │   └─ RETURN
            │
            └─ Swap
                │
                ├─ Smart Wallet
                │   ├─ "Approve SmartWallet" (optional)
                │   ├─ "Swap (gas free)"
                │   └─ RETURN
                │
                └─ Classic Wallet
                    │
                    ├─ Tax Router
                    │   ├─ "Approve Permit2 spending" (optional)
                    │   ├─ "Enable Permit2 for ${token}" (optional)
                    │   ├─ "Confirm in wallet"
                    │   └─ RETURN
                    │
                    ├─ UniversalRouter
                    │   ├─ "Approve ${token} spending" (optional)
                    │   ├─ "Approve Permit2 spending" (optional)
                    │   ├─ "Confirm in wallet"
                    │   └─ RETURN
                    │
                    ├─ Multicall (SwapRouter02)
                    │   ├─ "Approve ${token} spending" (optional)
                    │   ├─ "Confirm in wallet"
                    │   └─ RETURN
                    │
                    └─ Direct (SwapRouter02)
                        ├─ "Deposit ETH" (optional)
                        ├─ "Approve ${token} spending" (optional)
                        ├─ "Confirm in wallet"
                        ├─ "Withdraw ETH" (optional)
                        └─ RETURN

        */

        const isSmartWalletAtomicSwap =
            useSmartWalletFeature &&
            smartWalletReady &&
            !!currentSmartWalletAddress &&
            !isTaxableSwap &&
            !isEthInput &&
            !isEthDeposit &&
            !isEthWithdraw;

        if (isEthWithdraw) {
            // Withdraw : WETH -> ETH
            steps.push(`Confirm in wallet`);

        } else if (isEthDeposit) {
            // Deposit : ETH -> WETH
            steps.push(`Confirm in wallet`);

        } else {
            // Tokens Swap or ETH -> Token or Token -> ETH

            const tokenInAddress = isEthInput ? WETH_ADDRESS : tokenIn.id;

            const cachedApproval = (() => {
                if (!approvalPrefetch) return null;
                if (!isSameAddress(approvalPrefetch.userAddress, userAddress)) return null;
                if (!isSameAddress(approvalPrefetch.tokenAddress, tokenInAddress)) return null;
                if (Date.now() - approvalPrefetch.ts > 30_000) return null;
                return approvalPrefetch;
            })();


            // Check if smart wallet is ready for atomic swap (gas sponsored!)
            if (isSmartWalletAtomicSwap) {

                {
                    const allowance = cachedApproval?.allowanceToSmartWallet;
                    //console.log('[handleSwap] smart wallet allowance:', allowance)
                    const amountInBN = parseUnits(amountIn, tokenIn.decimals);

                    const hasApproval = (allowance !== null && allowance !== undefined)
                        ? allowance >= amountInBN
                        : await apiBlockchainSwapsSmartWallet.checkSmartWalletApproval(tokenIn.id, userAddress, currentSmartWalletAddress, amountInBN);

                    if (!hasApproval) {
                        steps.push(`Approve SmartWallet`);
                    }
                }

                steps.push(`Swap (gas free)`);

            } else {
                // Fallback to traditional flow

                const isTaxRouterSwap = isTaxableSwap && !isMultiHop;

                if (isTaxRouterSwap && !isEthInput && apiBlockchainSwapsTaxPermit2.isPermit2WrapperEnabled()) {
                    // Taxable Swap

                    const [hasPermit2Approval, hasWrapperAllowance] = await Promise.all([
                        cachedApproval ? Promise.resolve(cachedApproval.allowanceToPermit2 > 0n) : apiBlockchainSwapsTaxPermit2.hasPermit2Approval(tokenInAddress, userAddress),
                        cachedApproval && cachedApproval.taxWrapperAllowance !== null ? Promise.resolve(cachedApproval.taxWrapperAllowance) : apiBlockchainSwapsTaxPermit2.hasPermit2AllowanceForWrapper(tokenInAddress, userAddress),
                    ]);

                    if (!hasPermit2Approval) {
                        steps.push(`Approve Permit2 spending`);
                    }

                    if (!hasWrapperAllowance) {
                        steps.push(`Enable Permit2 for ${tokenIn.symbol}`);
                    }

                    steps.push(`Confirm in wallet`);

                } else {

                    // Deposit
                    if (isEthInput && !useUniversalRouter && !useMulticallSwap) {
                        steps.push(`Deposit ETH`);
                    }

                    // Approve TokenIn
                    let tokenInSymbol = tokenIn.symbol;

                    if (isEthInput && (useUniversalRouter || useMulticallSwap)) {
                        // no need to approve WETH with UniversalRouter or MulticallSwap

                    } else {
                        if (!useUniversalRouter && !useMulticallSwap) {
                            // if isEthInput there is a "Deposit" before swap the WETH
                            tokenInSymbol = isEthInput ? 'WETH' : tokenIn.symbol;
                        }

                        const tokenAllowance = useUniversalRouter
                            ? (cachedApproval) ? cachedApproval.allowanceToPermit2 : await apiBlockchainTokens.getTokenAllowance(tokenInAddress, userAddress, PERMIT2_ADDRESS)
                            : (cachedApproval) ? cachedApproval.allowanceToSwapRouter : await apiBlockchainTokens.getTokenAllowance(tokenInAddress, userAddress, SWAP_ROUTER_ADDRESS);

                        if (tokenAllowance < parseUnits(amountIn, tokenIn.decimals)) {
                            steps.push(`Approve ${tokenInSymbol} spending`);
                        }
                    }

                    // Approve Permit2 (UniversalRouter only, excluding ETH as input)
                    if (!isEthInput && useUniversalRouter) {
                        const hasPermit2Approval = cachedApproval
                            ? Promise.resolve(cachedApproval.allowanceToPermit2 > 0n)
                            : apiBlockchainSwapsTaxPermit2.hasPermit2Approval(tokenInAddress, userAddress);

                        if (!hasPermit2Approval) {
                            steps.push(`Approve Permit2 spending`);
                        }
                    }

                    // Swap
                    steps.push(`Confirm in wallet`);

                    // Withdraw
                    if (isEthOutput && !useUniversalRouter && !useMulticallSwap) {
                        steps.push(`Withdraw ETH`);
                    }

                }
            }
        }

        return steps;
    }


    // Select default Tokens
    useEffect(() => {
        if (tokens.length > 0) {
            if (!tokenIn) {
                let inputToken = getInitialTokenIn(tokens, inputCurrency);

                if (inputToken) {
                    setTokenIn(inputToken)
                }
            }

            if (!tokenOut && outputCurrency) {
                let outputToken = getInitialTokenOut(tokens, outputCurrency, tokenIn)

                if (outputToken) {
                    setTokenOut(outputToken)
                }
            }
        }
    }, [tokens]);


    // Re-Fetch user tokens after swaps
    useEffect(() => {
        if (userAddress && userTokensInitialized && swapsCount > 0) {
            fetchUserTokens()
        }
    }, [userAddress, userTokensInitialized, swapsCount]);


    // Fetch "tokenIn" user balance when tokenIn changes
    useEffect(() => {
        setTokenInBalance(null)

        if (tokenIn && userAddress) {
            apiBlockchainTokens.getUserTokenBalance(tokenIn, userAddress)
                .then((balance) => {
                    setTokenInBalance(balance)
                    updateUserTokenBalance(tokenIn.id, balance);
                });
        }

    }, [userAddress, tokenIn, swapsCount]);


    // Check tax status when tokenIn changes
    useEffect(() => {
        const checkTaxStatus = async () => {
            if (!tokenIn || !userAddress) {
                setTaxInfoFrom(null);
                return;
            }

            // Skip ETH (use WETH for tax check)
            const tokenAddress = isTokenETH(tokenIn.id)
                ? WETH_ADDRESS
                : tokenIn.id;

            setTaxInfoLoading(true);

            try {
                // Check if tax router is enabled
                if (!apiBlockchainSwapsTax.isTaxRouterEnabled()) {
                    //console.log('[Tax] Tax router not enabled');
                    setTaxInfoFrom(null);
                    return;
                }

                // Get tax config for token
                const taxConfig = await apiBlockchainSwapsTax.getTokenTaxConfig(tokenAddress);
                //console.log('[Tax] TokenIn tax config:', tokenIn.symbol, taxConfig);

                if (taxConfig.isTaxable) {
                    // Check if user is exempt
                    const isExempt = await apiBlockchainSwapsTax.isTaxExempt(userAddress);
                    //console.log('[Tax] User exempt:', isExempt);

                    if (!isExempt) {
                        const taxRate = Number(taxConfig.taxRate) / 100; // Convert basis points to %
                        setTaxInfoFrom({
                            isTaxable: true,
                            taxRate,
                            taxAmount: '0', // Will be calculated when amountIn changes
                            vault: taxConfig.vault,
                        });
                        //console.log(`[Tax] TokenIn ${tokenIn.symbol} is TAXABLE at ${taxRate}%`);

                    } else {
                        setTaxInfoFrom({ isTaxable: false, taxRate: 0, taxAmount: '0', vault: '' });
                        //console.log(`[Tax] User is EXEMPT from tax`);
                    }

                } else {
                    setTaxInfoFrom({ isTaxable: false, taxRate: 0, taxAmount: '0', vault: '' });
                    //console.log(`[Tax] TokenIn ${tokenIn.symbol} is NOT taxable`);
                }

            } catch (error) {
                //console.error('[Tax] Error checking TokenIn tax status:', error);
                setTaxInfoFrom(null);

            } finally {
                setTaxInfoLoading(false);
            }
        };

        const timer = setTimeout(checkTaxStatus, 100);

        return () => clearTimeout(timer);
    }, [tokenIn, userAddress]);


    // Fetch "tokenOut" user balance when tokenOut changes
    useEffect(() => {
        setTokenOutBalance(null)

        if (tokenOut && userAddress) {
            apiBlockchainTokens.getUserTokenBalance(tokenOut, userAddress)
                .then((balance) => {
                    setTokenOutBalance(balance)
                    updateUserTokenBalance(tokenOut.id, balance);
                });
        }

    }, [userAddress, tokenOut, swapsCount]);


    // Check tax status when tokenOut changes
    // Note: SelectiveTaxRouter only taxes INPUT token, so output tax is informational only
    // (shows user that selling this token later will incur tax)
    useEffect(() => {
        const checkTaxStatus = async () => {
            if (!tokenOut || !userAddress) {
                setTaxInfoTo(null);
                return;
            }

            // Skip ETH (use WETH for tax check)
            const tokenAddress = isTokenETH(tokenOut.id)
                ? WETH_ADDRESS
                : tokenOut.id;

            try {
                // Check if tax router is enabled
                if (!apiBlockchainSwapsTax.isTaxRouterEnabled()) {
                    setTaxInfoTo(null);
                    return;
                }

                // TODO: Use routeDecision to avoid multiple RPC calls

                // Get tax config for token
                const taxConfig = await apiBlockchainSwapsTax.getTokenTaxConfig(tokenAddress);
                //console.log('[Tax] TokenOut tax config:', tokenOut.symbol, taxConfig);

                if (taxConfig.isTaxable) {
                    // Check if user is exempt
                    const isExempt = await apiBlockchainSwapsTax.isTaxExempt(userAddress);

                    if (!isExempt) {
                        const taxRate = Number(taxConfig.taxRate) / 100;
                        setTaxInfoTo({
                            isTaxable: true,
                            taxRate,
                            vault: taxConfig.vault,
                        });
                        //console.log(`[Tax] TokenOut ${tokenOut.symbol} is TAXABLE at ${taxRate}% (on future sells)`);

                    } else {
                        setTaxInfoTo({ isTaxable: false, taxRate: 0, vault: '' });
                    }

                } else {
                    setTaxInfoTo({ isTaxable: false, taxRate: 0, vault: '' });
                    //console.log(`[Tax] TokenOut ${tokenOut.symbol} is NOT taxable`);
                }

            } catch (error) {
                //console.error('[Tax] Error checking TokenOut tax status:', error);
                setTaxInfoTo(null);
            }
        };

        const timer = setTimeout(checkTaxStatus, 100);

        return () => clearTimeout(timer);
    }, [tokenOut, userAddress]);


    // Update slippage when slippageAuto changes (if isSlippageAuto is activated)
    useEffect(() => {
        if (isSlippageAuto && slippageAuto) {
            setSlippage(slippageAuto);
        }
    }, [isSlippageAuto, slippageAuto])


    // Calculate tax amount when amountIn or taxInfoFrom changes
    useEffect(() => {
        if (taxInfoFrom?.isTaxable && Number(amountIn) > 0) {
            const taxAmount = (Number(amountIn) * taxInfoFrom.taxRate / 100).toFixed(6);
            setTaxInfoFrom(prev => prev ? { ...prev, taxAmount } : null);
        }
    }, [amountIn, taxInfoFrom?.isTaxable, taxInfoFrom?.taxRate]);


    // Reset the swapError message when starting a new quotation
    useEffect(() => {
        if (quotation && swapError) {
            setSwapError("")
        }
    }, [quotation])


    return (
        <div className={hideHeader ? "" : "flex-1 flex items-center justify-center"}>
            <div className={hideHeader ? "" : "z-10 mb-20"}>

                {/* Hero - hidden when used in tabbed view */}
                {!hideHeader && (
                    <div className='text-center'>
                        <h1 className="text-2xl font-bold text-foreground font-sans my-4">
                            Swaps at light-speed.
                        </h1>

                        <div className="text-md text-foreground font-body mb-12">
                            <div className="flex items-center justify-center gap-2">
                                Powered by
                                <MegaLogo />
                            </div>
                        </div>
                    </div>
                )}

                {/* Swap Header & Tabs - hidden when used in tabbed view */}
                {!hideHeader && (
                    <div className="flex justify-between items-center mb-2">

                        {/* Tabs (Swap | Limit) */}
                        <div className='flex gap-2'>
                            <button
                                className="bg-background-light font-semibold px-4 py-1 rounded-md text-foreground"
                            >
                                Swap
                            </button>

                            <button
                                className="bg-background-light-sm font-semibold px-4 py-1 rounded-md text-foreground-light-sm cursor-not-allowed"
                            >
                                Limit
                            </button>
                        </div>

                        <div className="flex space-x-2">
                            {/*  Settings button */}
                            <button
                                onClick={() => setIsSettingsModalOpen(true)}
                                className="p-2 rounded-lg hover:bg-background-light transition-colors duration-200 cursor-pointer text-foreground-light hover:text-foreground-light-xl"
                            >
                                <SettingsIcon />
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Card of the Swap */}
                <div className="relative rounded-2xl bg-background-light p-1 mb-4">

                    {/* Input - From */}
                    <SwapField
                        fieldType='tokenIn'
                        className="mb-2"
                        amount={amountIn}
                        loading={tokensLoading}
                        setAmount={(amount) => { setQuotationType('ExactInput'); setAmountIn(amount); }}
                        setIsModalOpen={setIsFromModalOpen}
                        token={tokenIn}
                        tokenBalance={tokenInBalance}
                        lastEthPrice={lastEthPrice}
                        isTaxable={taxInfoFrom?.isTaxable}
                        taxRate={taxInfoFrom?.taxRate}
                        taxVault={taxInfoFrom?.vault}
                    />

                    {/* Flip Button */}
                    <div className="absolute w-full flex justify-center" style={{ marginTop: '-3px', transform: 'translateY(-50%)' }}>
                        <button
                            onClick={handleSwitchTokens}
                            disabled={!tokenOut || tokensLoading}
                            className={`p-2 rounded-xl transition-all ${tokensLoading || !tokenOut
                                ? 'bg-background-light cursor-not-allowed'
                                : 'bg-background-light cursor-pointer hover:bg-background-light-xl'
                                }`}
                        >
                            <SwitchIcon />
                        </button>
                    </div>

                    {/* Input - To */}
                    <SwapField
                        fieldType='tokenOut'
                        amount={amountOut}
                        loading={tokensLoading}
                        setAmount={(amount) => { setQuotationType('ExactOutput'); setAmountOut(amount); }}
                        setIsModalOpen={setIsToModalOpen}
                        token={tokenOut}
                        tokenBalance={tokenOutBalance}
                        lastEthPrice={lastEthPrice}
                        isTaxable={taxInfoTo?.isTaxable}
                        taxRate={taxInfoTo?.taxRate}
                        taxVault={taxInfoTo?.vault}
                    />
                </div>

                <>
                    {quotationInfos && (
                        <div className="border rounded-lg bg-background-light p-1 mb-4 text-center">
                            {quotationInfos}
                        </div>
                    )}

                    {quotationError && (
                        <div className="border rounded-lg bg-background-light p-1 mb-4 text-center text-red-500">
                            {quotationError.slice(0, 200)}
                        </div>
                    )}

                    {swapInfo && (
                        <div className="border rounded-lg bg-background-light p-1 mb-4 text-center">
                            {swapInfo}
                        </div>
                    )}

                    {swapError && (
                        <div className="border rounded-lg bg-background-light p-1 mb-4 text-center text-red-500">
                            {swapError.slice(0, 200)}
                        </div>
                    )}

                    {isMultiHopTaxable && (
                        <div className="border border-yellow-500/30 rounded-lg bg-yellow-500/10 p-3 mb-4 text-center text-yellow-400 text-sm">
                            <p className="font-medium">Multi-hop swaps not yet available for taxable tokens</p>
                            <p className="text-yellow-400/70 mt-1">
                                No direct pool exists for {tokenIn?.symbol}/{tokenOut?.symbol}.
                                {taxInfoFrom?.isTaxable && (
                                    <> Try swapping {tokenIn?.symbol} → ETH first.</>
                                )}
                                {taxInfoTo?.isTaxable && !taxInfoFrom?.isTaxable && (
                                    <> Try swapping to ETH first, then ETH → {tokenOut?.symbol}.</>
                                )}
                            </p>
                        </div>
                    )}
                </>

                {/* Connect wallet */}
                {!isConnected && (
                    <Button
                        variant='secondary'
                        className="w-full py-6 cursor-pointer"
                        onClick={() => openConnectModal()}
                    >
                        Connect Wallet
                    </Button>
                )}

                {/* Swap Button */}
                {isConnected && (
                    <>
                        <Button
                            variant='default'
                            className="w-full py-6 cursor-pointer"
                            disabled={!swapAllowed}
                            onClick={() => handleSwap()}
                            title={swapAllowed ? undefined : (swapDisabledReason ?? undefined)}
                        >
                            {swapAllowed ? swapText : (swapDisabledReason ?? swapText)}
                        </Button>
                    </>
                )}


                {/* Price & slippage */}
                {quotation && (
                    <div className="mt-8 mb-6 p-3 bg-background/50">
                        <div className="flex justify-between text-sm">
                            <span className="text-foreground-light">Price</span>
                            <span className="font-medium">
                                1 {tokenOut ? tokenOut.symbol : '???'} = {quotation?.pricePerToken ? formatNumber(quotation.pricePerToken) : '0.0'} {tokenIn ? tokenIn.symbol : '???'}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-foreground-light">Slippage</span>
                            <span className="font-medium">
                                {isSlippageAuto && (
                                    <>
                                        Auto ({slippage}%)
                                    </>
                                )}

                                {!isSlippageAuto && (
                                    <>
                                        {slippage}%
                                    </>
                                )}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-foreground-light">
                                Minimum received
                                {taxInfoTo?.isTaxable && <span className="text-amber-500"> (after {taxInfoTo.taxRate}% tax)</span>}
                            </span>
                            <span className="font-medium">
                                {formatTokenAmount(
                                    taxInfoTo?.isTaxable
                                        ? Number(minimumReceived) * (1 - taxInfoTo.taxRate / 100)
                                        : minimumReceived
                                )} {tokenOut.symbol}
                            </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-foreground-light">Price impact</span>
                            <span className="font-medium">{Math.min(100, quotation.priceImpact).toFixed(3)}%</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                            <span className="text-foreground-light">Network Fee</span>
                            <span className="font-medium">~{quotation ? formatNumber(Number(quotation.gasEstimate) * 1e-9) : '0'}</span>
                        </div>

                        {/* Tax breakdown - tax is always taken from INPUT token when either token is taxable */}
                        {(taxInfoFrom?.isTaxable || taxInfoTo?.isTaxable) && Number(amountIn) > 0 && (() => {
                            // Determine which token triggers the tax (input takes priority)
                            const taxRate = taxInfoFrom?.isTaxable ? taxInfoFrom.taxRate : taxInfoTo?.taxRate || 0;
                            const taxableToken = taxInfoFrom?.isTaxable ? tokenIn?.symbol : tokenOut?.symbol;
                            const taxAmount = (Number(amountIn) * taxRate / 100).toFixed(6);
                            return (
                                <div className="flex justify-between text-sm mt-1 text-amber-500">
                                    <span>Tax on {taxableToken} ({taxRate}%)</span>
                                    <span className="font-medium">-{formatNumber(taxAmount)} {tokenIn?.symbol}</span>
                                </div>
                            );
                        })()}
                    </div>
                )}


                {/* Loading state for tokens */}
                {tokensLoading && (
                    <div className="bg-background-light backdrop-blur-sm rounded-2xl border  p-6 mt-6">
                        <div className="text-center">Loading tokens...</div>
                    </div>
                )}

                {/* Error state for tokens */}
                {tokensError && (
                    <div className="bg-background-light backdrop-blur-sm rounded-2xl border p-6 mt-6">
                        <div className="text-center">
                            <div className="mb-2">Error loading tokens</div>
                            <div className="text-foreground-light text-sm">{tokensError.slice(0, 200)}</div>
                        </div>
                    </div>
                )}


                {/* Token Select Modals */}
                <TokenSelectModal
                    isOpen={isFromModalOpen}
                    closeModal={() => setIsFromModalOpen(false)}
                    selectToken={setTokenIn}
                    selectedToken={tokenIn || undefined}
                    tokens={tokenOut ? excludeTokens(tokens, [tokenOut.id]) : tokens}
                    userTokens={userTokens}
                    loading={tokensLoading}
                />

                <TokenSelectModal
                    isOpen={isToModalOpen}
                    closeModal={() => setIsToModalOpen(false)}
                    selectToken={setTokenOut}
                    selectedToken={tokenOut || undefined}
                    tokens={tokenIn ? excludeTokens(tokens, [tokenIn.id]) : tokens}
                    userTokens={userTokens}
                    loading={tokensLoading}
                />

                {/* Settings Modals */}
                <SwapSettingsModal
                    isOpen={isSettingsModalOpen}
                    slippage={slippage}
                    useMulticallSwap={useMulticallSwap}
                    useUniversalRouter={useUniversalRouter}
                    useSmartWalletFeature={useSmartWalletFeature}
                    setUseMulticallSwap={setUseMulticallSwap}
                    setUseUniversalRouter={setUseUniversalRouter}
                    setUseSmartWalletFeature={setUseSmartWalletFeature}
                    closeModal={() => setIsSettingsModalOpen(false)}
                    onSlippageChange={onSlippageChange}
                />

                {/* Transactions Info Modals */}
                <TransactionsInfoModal
                    isOpen={isTransactionsInfoModalOpen}
                    modalTitle="Swap Tokens"
                    steps={transactionsInfoSteps}
                    currentStep={transactionsInfoCurrentStep}
                    closeModal={() => { setIsTransactionsInfoModalOpen(false); }}
                    setCurrentStep={setTransactionsInfoCurrentStep}
                />

            </div>
        </div>
    );
}



function getInitialTokenIn(tokens: Token[], inputCurrency: string | null | undefined) {
    if (tokens.length > 0) {
        let inputToken = null;

        if (!inputCurrency || inputCurrency.toUpperCase() === 'ETH') {
            // Default tokenIn = ETH
            inputToken = tokens.find((token: Token) => isTokenETH(token.id))

        } else if (inputCurrency) {
            // Specified tokenIn ("inputCurrency" querystring)

            if (inputCurrency.length === 42 && inputCurrency.startsWith('0x')) {
                inputToken = tokens.find((token: Token) => isSameAddress(token.id, inputCurrency as Address))

            } else {
                inputToken = tokens.find((token: Token) => token.symbol.toLowerCase() === inputCurrency.toLowerCase())
            }
        }

        if (inputToken) {
            return inputToken
        }
    }

    return null;
}


function getInitialTokenOut(tokens: Token[], outputCurrency: string | null | undefined, tokenIn: Token) {
    if (tokens.length > 0) {
        let outputToken = null;

        if (!outputCurrency || outputCurrency.toUpperCase() === 'USDC') {
            // Default tokenOut = USDC
            outputToken = tokens.find((token: Token) => isTokenUSDC(token.id))

        } else if (outputCurrency.toUpperCase() === 'ETH') {
            // Specified tokenOut "ETH"
            if (isTokenETH(tokenIn.id)) {
                // ETH is already the tokenIn => fallback to USDC output
                outputToken = tokens.find((token: Token) => isTokenUSDC(token.id))

            } else {
                outputToken = tokens.find((token: Token) => isTokenETH(token.id))
            }

        } else if (outputCurrency) {
            // Specified tokenOut ("outputCurrency" querystring)

            if (outputCurrency.length === 42 && outputCurrency.startsWith('0x')) {
                outputToken = tokens.find((token: Token) => isSameAddress(token.id, outputCurrency as Address))

            } else {
                outputToken = tokens.find((token: Token) => token.symbol.toLowerCase() === outputCurrency.toLowerCase())
            }
        }

        if (outputToken) {
            return outputToken;
        }
    }

    return null;
}

