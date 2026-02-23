import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { Address, formatEther, Hex, parseUnits, TransactionReceipt, WalletClient } from 'viem';

import * as apiBlockchain from '@/lib/api_blockchain';
import * as apiBlockchainTokens from '@/lib/api_blockchain_tokens';
import * as apiBlockchainSwaps from '@/lib/api_blockchain_swaps';
import * as apiBlockchainSwapsUniversal from '@/lib/api_blockchain_swaps_universal';
import * as apiBlockchainSwapsTax from '@/lib/api_blockchain_swaps_tax';
import * as apiBlockchainSwapsBatched from '@/lib/api_blockchain_swaps_batched';
import * as apiBlockchainSwapsTaxPermit2 from '@/lib/api_blockchain_swaps_tax_permit2';
import * as apiBlockchainSwapsSmartWallet from '@/lib/api_blockchain_swaps_smartwallet';
import * as swapRouterService from '@/lib/swap_router_service';

import { ETH_ADDRESS, PERMIT2_ADDRESS, SWAP_ROUTER_ADDRESS, UNIVERSAL_ROUTER_ADDRESS, USE_BATCHED_SWAPS, WETH_ADDRESS } from '@/config.app';
import { getErrorMessage } from '@/lib/ui_utils';
import { applySlippageToAmount, clampSlippagePercent } from '@/lib/uniswap_utils';
import { isSameAddress, isTokenETH, isTokenWETH } from "@/lib/tokens_utils";

import { SwapSingleParams, Token, TransactionResult, TokenSwapQuotationResult, QuotePath, SwapMultipleParams, SwapRouteDecision } from "@/types";


export interface SwapHook {
    swapType: "ExactInputSingle" | "ExactOutputSingle",
    swapInfo: string,
    swapError: string,
    swapsCount: number,
    isSwapping: boolean,
    routeDecision: SwapRouteDecision | null,
    approvalPrefetch: SwapApprovalPrefetch | null,
    setSwapInfo: Dispatch<SetStateAction<string>>,
    setSwapError: Dispatch<SetStateAction<string>>,
    setIsSwapping: Dispatch<SetStateAction<boolean>>,
    executeSwap: (quotation: TokenSwapQuotationResult, slippage: number, setTransactionsInfoCurrentStep?: React.Dispatch<React.SetStateAction<number>>, freshSmartWalletContext?: SmartWalletContext) => Promise<TransactionResult | null>,
    setSwapsCount: Dispatch<SetStateAction<number>>,
    checkRouteDecision: () => Promise<SwapRouteDecision | null>,
}

export type SwapApprovalPrefetch = {
    ts: number;
    userAddress: Address;
    tokenAddress: Address;
    allowanceToSwapRouter: bigint;
    allowanceToPermit2: bigint;
    permit2AllowanceToUniversalRouter: { amount: bigint; expiration: bigint; nonce: bigint } | null;
    taxWrapperAllowance: boolean | null;
    allowanceToSmartWallet: bigint | null;
}

export type SwapTokensDependencies = {
    setSwapInfo?: Dispatch<SetStateAction<string>>,
    setTransactionsInfoCurrentStep?: Dispatch<SetStateAction<number>>,
}

// Smart wallet context for atomic swaps
export interface SmartWalletContext {
    smartWalletAddress: Address;
    batchTransactions: (calls: { to: Address; value?: bigint; data: Hex }[], onUserOpSubmitted?: () => void) => Promise<TransactionReceipt>;
    isReady: boolean;
}



export function useSwap(walletClient: WalletClient, tokenIn: Token, tokenOut: Token, useMulticallSwap?: boolean, useUniversalRouter?: boolean, useSmartWalletFeature?: boolean, smartWalletContext?: SmartWalletContext, isTaxableSwapHint?: boolean): SwapHook {
    const [swapInfo, setSwapInfo] = useState<string>("")
    const [swapError, setSwapError] = useState<string>("")
    const [isSwapping, setIsSwapping] = useState(false)
    const [swapsCount, setSwapsCount] = useState(0);
    const [routeDecision, setRouteDecision] = useState<SwapRouteDecision | null>(null);
    const [routeDecisionTs, setRouteDecisionTs] = useState<number>(0);
    const [approvalPrefetch, setApprovalPrefetch] = useState<SwapApprovalPrefetch | null>(null);


    // Set route decision when tokens change
    useEffect(() => {
        let isActive = true;

        const prefetch = async () => {
            if (!walletClient || !tokenIn || !tokenOut) return;

            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0] as Address | undefined;
            if (!userAddress) return;

            const decision = await swapRouterService.getSwapRouteDecision(tokenIn, tokenOut, userAddress);
            if (!isActive) return;

            setRouteDecision(decision);
            setRouteDecisionTs(Date.now());
        };

        const timer = setTimeout(() => {
            prefetch().catch(() => {});
        }, 100);

        return () => {
            isActive = false;
            clearTimeout(timer)
        };
    }, [walletClient, tokenIn?.id, tokenOut?.id]);


    // set ApprovalPrefetch (tokenIn,SwapRouterV2,UniversalRouter,Permit2) when tokenIn changes
    useEffect(() => {
        let isActive = true;

        const prefetch = async () => {
            if (!walletClient || !tokenIn) {
                if (isActive) setApprovalPrefetch(null);
                return;
            }

            const tokenAddress = tokenIn.id as Address;
            if (isTokenETH(tokenAddress)) {
                if (isActive) setApprovalPrefetch(null);
                return;
            }

            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0] as Address | undefined;
            if (!userAddress) {
                if (isActive) setApprovalPrefetch(null);
                return;
            }

            const smartWalletAddress = smartWalletContext?.isReady ? (smartWalletContext.smartWalletAddress as Address) : null;

            const [allowanceToSwapRouter, allowanceToPermit2, permit2AllowanceToUniversalRouter, taxWrapperAllowance, allowanceToSmartWallet] = await Promise.all([
                apiBlockchainTokens.getTokenAllowance(tokenAddress, userAddress, SWAP_ROUTER_ADDRESS),
                apiBlockchainTokens.getTokenAllowance(tokenAddress, userAddress, PERMIT2_ADDRESS),
                useUniversalRouter
                    ? apiBlockchainSwapsUniversal.getPermit2Allowance(userAddress, tokenAddress, UNIVERSAL_ROUTER_ADDRESS)
                    : Promise.resolve(null),
                apiBlockchainSwapsTaxPermit2.isPermit2WrapperEnabled()
                    ? apiBlockchainSwapsTaxPermit2.hasPermit2AllowanceForWrapper(tokenAddress, userAddress).catch(() => null)
                    : Promise.resolve(null),
                smartWalletAddress ? apiBlockchainTokens.getTokenAllowance(tokenAddress, userAddress, smartWalletAddress).catch(() => null) : Promise.resolve(null),
            ]);

            if (!isActive) return;

            setApprovalPrefetch({
                ts: Date.now(),
                userAddress,
                tokenAddress,
                allowanceToSwapRouter,
                allowanceToPermit2,
                permit2AllowanceToUniversalRouter,
                taxWrapperAllowance,
                allowanceToSmartWallet,
            });
        };

        prefetch().catch(() => {
            if (isActive) setApprovalPrefetch(null);
        });

        return () => {
            isActive = false;
        };
    }, [walletClient, tokenIn?.id, useUniversalRouter, smartWalletContext?.isReady, smartWalletContext?.smartWalletAddress]);


    /**
     * Check which router should be used for this swap
     */
    const checkRouteDecision = async (): Promise<SwapRouteDecision | null> => {
        if (!walletClient || !tokenIn || !tokenOut) return null;

        try {
            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0];
            if (!userAddress) return null;

            const decision = await swapRouterService.getSwapRouteDecision(
                tokenIn,
                tokenOut,
                userAddress
            );

            setRouteDecision(decision);
            setRouteDecisionTs(Date.now());
            return decision;

        } catch (err) {
            //console.error('[useSwap] Error checking route decision:', err);
            return null;
        }
    };



    const executeSwap = async (quotation: TokenSwapQuotationResult, slippage: number, setTransactionsInfoCurrentStep?: React.Dispatch<React.SetStateAction<number>>, freshSmartWalletContext?: SmartWalletContext): Promise<TransactionResult | null> => {
        if (!tokenIn || !tokenOut) return null;
        if (!quotation) return null;
        if (!(Number(quotation.amountIn) > 0)) return null;
        if (!(Number(quotation.amountOut) > 0)) return null;

        /*
          executeSwap Cases
               │
               ├─ SmartWallet (atomic, non-tax, non-ETH-in, non-(ETH<->WETH))
               │   └─ executeSwapSmartWallet(...)
               │
               ├─ Tax Router (routeDecision.router === "tax_router")
               │   └─ executeSwapViaTaxRouter(...)
               │
               ├─ ETH Deposit (ETH → WETH)
               │   └─ apiBlockchainSwaps.depositETHtoWETH(...)
               │
               ├─ ETH Withdraw (WETH → ETH)
               │   └─ apiBlockchainSwaps.withdrawWETHtoETH(...)
               │
               ├─ ETH → Token
               │   └─ executeSwapETHForTokens(...)
               │
               ├─ Token → ETH
               │   └─ executeSwapTokensForETH(...)
               │
               └─ Token → Token
                   └─ executeSwapTokensForTokens(...)

        */


        // Use fresh context if provided, otherwise fall back to hook context
        const activeSmartWalletContext = freshSmartWalletContext || smartWalletContext;

        try {
            setIsSwapping(true)
            setSwapInfo("Swap...")
            setSwapError("")

            const currentRouteDecision = ((): SwapRouteDecision | null => {
                if (typeof isTaxableSwapHint === 'boolean') {
                    return isTaxableSwapHint
                        ? { router: 'tax_router', reason: 'taxable', isTaxable: true, hasPool: true, isCrossChain: false }
                        : { router: 'universal_router', reason: 'non-taxable', isTaxable: false, hasPool: true, isCrossChain: false };

                    // Note: what if useUniversalRouter is false ? (and isTaxableSwapHint too)
                }

                if (routeDecision && Date.now() - routeDecisionTs <= 30_000) {
                    return routeDecision;
                }

                return null;
            })() ?? await checkRouteDecision();
            //console.log('[Swap] Route decision:', currentRouteDecision);

            let result: TransactionResult = { success: false };

            // Get user address for smart wallet check
            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0];
            if (!userAddress) throw new Error("Missing wallet");

            const isEthInput = isTokenETH(tokenIn.id);
            const isEthOutput = isTokenETH(tokenOut.id);
            const isWethInput = isTokenWETH(tokenIn.id);
            const isWethOutput = isTokenWETH(tokenOut.id);
            const isEthDeposit = isEthInput && isWethOutput;
            const isEthWithdraw = isWethInput && isEthOutput;


            //console.log('[Swap] Smart wallet check:', {
            //    useSmartWalletFeature,
            //    isReady: activeSmartWalletContext?.isReady,
            //    isEthInput,
            //    isEthOutput,
            //    isEthDeposit,
            //    isEthWithdraw,
            //    hasUserAddress: !!userAddress,
            //});

            // Try Smart Wallet atomic swap FIRST for token swaps (best UX - 1 signature, gas sponsored)
            // Note: ETH input swaps skip smart wallet since ETH needs to be in SW first
            // useSmartWalletFeature flag allows disabling AA when bundler is broken
            if (useSmartWalletFeature && activeSmartWalletContext?.isReady && currentRouteDecision?.router !== 'tax_router' && !isEthInput && !isEthDeposit && !isEthWithdraw && userAddress) {
                try {
                    const result = await executeSwapSmartWallet(walletClient, activeSmartWalletContext, tokenIn, tokenOut, quotation, isEthOutput, slippage, { setSwapInfo, setTransactionsInfoCurrentStep });

                    if (result.success) {
                        //console.log('[SmartWallet] Atomic swap successful:', result.transactionHash);
                        setSwapsCount(val => val + 1);
                        return result;
                    }

                } catch (smartWalletError) {
                    //console.warn('[SmartWallet] Atomic swap failed, falling back to regular flow:', smartWalletError);
                    setSwapInfo('');
                    // Fall through to regular swap methods

                    if (smartWalletError.shortMessage === "User rejected the request.") {
                        throw smartWalletError;
                    }
                }
            }


            // Use Tax Router for taxable tokens
            if (currentRouteDecision?.router === 'tax_router') {
                // Using TaxRouter
                //console.log('Using Tax Router for taxable token...')
                setSwapInfo('Swap via Tax Router...')

                result = await executeSwapViaTaxRouter(
                    walletClient,
                    tokenIn,
                    tokenOut,
                    quotation,
                    slippage,
                    { setSwapInfo, setTransactionsInfoCurrentStep }
                );

            } else if (isEthDeposit) {
                // ETH deposit
                //console.log('Deposit...')
                setSwapInfo('Deposit...')

                const receipt = await apiBlockchainSwaps.depositETHtoWETH(walletClient, quotation.amountIn);

                result = {
                    success: receipt.status === 'success',
                    transactionHash: receipt.transactionHash,
                }

            } else if (isEthWithdraw) {
                // ETH withdraw
                //console.log('Withdraw...')
                setSwapInfo('Withdraw...')

                const receipt = await apiBlockchainSwaps.withdrawWETHtoETH(walletClient, quotation.amountIn);

                result = {
                    success: receipt.status === 'success',
                    transactionHash: receipt.transactionHash,
                }

            } else if (isEthInput) {
                // Swap ETH for Tokens
                //console.log('Swap ETH for Tokens...')
                setSwapInfo('Swap ETH for Tokens...')

                if (!quotation.path[0]?.feeTier) {
                    throw new Error(`Missing feeTier`);
                }

                result = await executeSwapETHForTokens(walletClient, tokenOut, quotation.amountIn, quotation.amountOut, quotation.path, slippage, { setSwapInfo, setTransactionsInfoCurrentStep })

            } else if (isEthOutput) {
                // Swap Tokens for ETH
                //console.log('Swap Tokens for ETH...')
                setSwapInfo('Swap Tokens for ETH...')

                if (!quotation.path[0]?.feeTier) {
                    throw new Error(`Missing feeTier`);
                }

                result = await executeSwapTokensForETH(walletClient, tokenIn, quotation.amountIn, quotation.amountOut, quotation.path, slippage, { setSwapInfo, setTransactionsInfoCurrentStep })

            } else {
                // Tokens swap
                //console.log('Swap Tokens for Tokens...')
                setSwapInfo('Swap Tokens for Tokens...')

                if (!quotation.path[0]?.feeTier) {
                    throw new Error(`Missing feeTier`);
                }

                result = await executeSwapTokensForTokens(walletClient, tokenIn, tokenOut, quotation.amountIn, quotation.amountOut, quotation.path, slippage, { setSwapInfo, setTransactionsInfoCurrentStep })
            }


            if (result.success) {
                //console.log('Swap successful:', result.transactionHash)
                //setSwapInfo("Swap successful")

                setSwapsCount(val => val + 1)

            } else {
                //console.error('Swap failed:', result.error)
                setSwapError(result.error)
            }

            setSwapInfo("")

            return result;

        } catch (err: any) {
            //console.error('Swap error:', err?.message || err)
            setSwapError(getErrorMessage(err))
            setSwapInfo("")
            return null;

        } finally {
            setIsSwapping(false)
        }
    }



    // Tokens swap
    const executeSwapETHForTokens = async (walletClient: WalletClient, tokenOut: Token, userAmountIn: string, userAmountOut: string, quotationPath: QuotePath, slippage = 5, deps?: SwapTokensDependencies): Promise<TransactionResult> => {

        /*
            executeSwapETHForTokens Cases
               │
               ├─ (batched, 1 signature)
               │   ├─ apiBlockchainSwapsBatched.executeBatchedEthToTokenSwap(...)
               │   └─ RETURN
               │
               └─ (sequential)
                   │
                   ├─ (no UniversalRouter AND no Multicall)
                   │   ├─ apiBlockchainSwaps.depositETHtoWETH(...)
                   │   └─ approveTokenIfNeeded(WETH, spender = SWAP_ROUTER)
                   │
                   └─ swap
                       │
                       ├─ single-hop
                       │   ├─ UniversalRouter → apiBlockchainSwapsUniversal.swapTokensFromETH_UniversalRouter(...)
                       │   ├─ Multicall       → apiBlockchainSwaps.swapTokensFromETH_Multicall(...)
                       │   └─ SwapRouter02    → apiBlockchainSwaps.swapTokensToTokens(...)
                       │       └─ RETURN
                       │
                       └─ multi-hop
                           ├─ UniversalRouter → apiBlockchainSwapsUniversal.swapTokensFromETH_UniversalRouter_Multiple(...)
                           ├─ Multicall       → apiBlockchainSwaps.swapTokensFromETH_Multicall_Multiple(...)
                           └─ SwapRouter02    → apiBlockchainSwaps.swapTokensToTokens_Multiple(...)
                               └─ RETURN

        */

        try {
            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0]
            if (!userAddress) throw new Error('missing userAddress');

            if (!tokenOut) {
                return {
                    success: false,
                    error: 'Token addresses cannot be empty',
                };
            }

            if (isTokenETH(tokenOut.id)) {
                return {
                    success: false,
                    error: 'Token addresses must be different',
                };
            }

            if (Number(userAmountIn) <= 0) {
                return {
                    success: false,
                    error: 'Amount must be greater than 0',
                };
            }

            if (!userAddress) {
                return {
                    success: false,
                    error: 'User address is required',
                };
            }

            const amountIn = parseUnits(userAmountIn, 18);


            const cachedApproval = (() => {
                if (!approvalPrefetch) return null;
                if (!isSameAddress(approvalPrefetch.userAddress, userAddress)) return null;
                if (!isSameAddress(approvalPrefetch.tokenAddress, tokenIn.id)) return null;
                if (Date.now() - approvalPrefetch.ts > 30_000) return null;
                return approvalPrefetch;
            })();


            // Check ETH balance
            const balance = await apiBlockchainTokens.getTokenBalance(ETH_ADDRESS, userAddress);

            if (balance < amountIn) {
                return {
                    success: false,
                    error: 'Insufficient ETH balance',
                };
            }

            // Calculate output amounts
            const amountOut = parseUnits(userAmountOut, tokenOut.decimals)
            const slippageSafe = clampSlippagePercent(slippage, 0.05, 50);
            const amountOutMinimum = applySlippageToAmount(amountOut, slippageSafe);


            // Try batched swap first (single signature for deposit + approve + swap)
            if (USE_BATCHED_SWAPS && quotationPath.length === 1 && !useUniversalRouter && !useMulticallSwap) {
                try {
                    const isBatchedAvailable = await apiBlockchainSwapsBatched.isBatchedSwapAvailable(walletClient);

                    if (isBatchedAvailable) {
                        //console.log('[Swap] Attempting batched ETH→Token swap (1 signature)...');

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('Deposit & Swap (1 signature)...');
                        }

                        const batchedReceipt = await apiBlockchainSwapsBatched.executeBatchedEthToTokenSwap(walletClient, {
                            tokenOut,
                            amountIn,
                            amountOutMinimum,
                            feeTier: BigInt(quotationPath[0].feeTier),
                            recipient: userAddress,
                        });

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('');
                        }

                        if (deps?.setTransactionsInfoCurrentStep) {
                            deps.setTransactionsInfoCurrentStep(n => n + 1);
                        }

                        return {
                            success: batchedReceipt.status === 'success',
                            transactionHash: batchedReceipt.transactionHash,
                        };
                    }

                } catch (batchError) {
                    //console.warn('[Swap] Batched ETH→Token swap failed, falling back to sequential:', batchError);
                    // Fall through to sequential swap
                }
            }


            // Sequential swap flow (fallback)
            if (!useUniversalRouter && !useMulticallSwap) {
                // If no multicall or UniversalRouter => deposit ETH to WETH

                if (deps?.setSwapInfo) {
                    deps.setSwapInfo("Deposit ETH...")
                }

                await apiBlockchainSwaps.depositETHtoWETH(walletClient, userAmountIn);

                if (deps?.setSwapInfo) {
                    deps.setSwapInfo("")
                }

                if (deps?.setTransactionsInfoCurrentStep) {
                    deps.setTransactionsInfoCurrentStep(n => n + 1);
                }


                // Approve WETH to SWAP_ROUTER_ADDRESS
                const spenderAddress = useUniversalRouter ? PERMIT2_ADDRESS : SWAP_ROUTER_ADDRESS;
                const approvalAmount = useUniversalRouter ? (2n ** 256n - 1n) : amountIn;

                const cachedAllowance = cachedApproval
                    ? (isSameAddress(spenderAddress, SWAP_ROUTER_ADDRESS)
                        ? cachedApproval.allowanceToSwapRouter
                        : cachedApproval.allowanceToPermit2)
                    : undefined;

                if (!cachedAllowance || cachedAllowance < approvalAmount) {
                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo(`Approve token WETH...`)
                    }

                    const approveReceipt: TransactionReceipt | null = await approveTokenIfNeeded(walletClient, WETH_ADDRESS, spenderAddress, approvalAmount);

                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo("")
                    }

                    if (deps?.setTransactionsInfoCurrentStep) {
                        deps.setTransactionsInfoCurrentStep(n => n + 1);
                    }
                }
            }


            // Swap tokens
            if (deps?.setSwapInfo) {
                deps.setSwapInfo("Swap tokens...")
            }

            let swapReceipt: TransactionReceipt | null = null;

            if (quotationPath.length === 1) {
                // Single Hop
                const swapSingleParams: SwapSingleParams = {
                    tokenIn: WETH_ADDRESS,
                    tokenOut: tokenOut.id,
                    recipient: userAddress,
                    amountIn: amountIn,
                    amountOutMinimum,
                    fee: BigInt(quotationPath[0].feeTier),
                    sqrtPriceLimitX96: 0n,
                };

                //console.log('swapSingleParams:', swapSingleParams)


                if (useUniversalRouter) {
                    swapReceipt = await apiBlockchainSwapsUniversal.swapTokensFromETH_UniversalRouter(walletClient, swapSingleParams); // execute (WRAP_ETH + V3_SWAP_EXACT_IN)

                } else if (useMulticallSwap) {
                    swapReceipt = await apiBlockchainSwaps.swapTokensFromETH_Multicall(walletClient, swapSingleParams); // multicall (wrapETH + exactInputSingle)

                } else {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToTokens(walletClient, swapSingleParams); // exactInputSingle
                }

            } else {
                // Multi Hop
                const swapMultipleParams: SwapMultipleParams = {
                    tokenIn: WETH_ADDRESS,
                    tokenOut: tokenOut.id,
                    recipient: userAddress,
                    amountIn: amountIn,
                    amountOutMinimum,
                    path: quotationPath,
                };

                //console.log('swapMultipleParams:', swapMultipleParams)


                if (useUniversalRouter) {
                    swapReceipt = await apiBlockchainSwapsUniversal.swapTokensFromETH_UniversalRouter_Multiple(walletClient, swapMultipleParams); // execute (WRAP_ETH + V3_SWAP_EXACT_IN)

                } else if (useMulticallSwap) {
                    swapReceipt = await apiBlockchainSwaps.swapTokensFromETH_Multicall_Multiple(walletClient, swapMultipleParams); // multicall (wrapETH + exactInput)

                } else {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToTokens_Multiple(walletClient, swapMultipleParams); // exactInput
                }
            }


            if (deps?.setSwapInfo) {
                deps.setSwapInfo("")
            }

            if (deps?.setTransactionsInfoCurrentStep) {
                deps.setTransactionsInfoCurrentStep(n => n + 1);
            }

            return {
                success: swapReceipt?.status === 'success',
                transactionHash: swapReceipt?.transactionHash,
            };




        } catch (err: any) {
            //console.error('Error in executeSwapETHForTokens:', getErrorMessage(err));

            if (deps?.setSwapInfo) {
                deps.setSwapInfo("")
            }

            return {
                success: false,
                error: getErrorMessage(err),
            };
        }
    }


    const executeSwapTokensForETH = async (walletClient: WalletClient, tokenIn: Token, userAmountIn: string, userAmountOut: string, quotationPath: QuotePath, slippage = 5, deps?: SwapTokensDependencies): Promise<TransactionResult> => {

        /*
            executeSwapTokensForETH Cases
               │
               ├─ (batched, 1 signature)
               │   ├─ apiBlockchainSwapsBatched.executeBatchedTokenToEthSwap(...)
               │   └─ RETURN
               │
               └─ (sequential)
                   │
                   ├─ approve tokenIn
                   │   └─ approveTokenIfNeeded(..., spender = (useUniversalRouter ? PERMIT2 : SWAP_ROUTER))
                   │
                   ├─ approve Permit2 → UniversalRouter (only if useUniversalRouter)
                   │   └─ approvePermit2IfNeeded(...)
                   │
                   ├─ swap
                   │   │
                   │   ├─ single-hop
                   │   │   ├─ UniversalRouter → apiBlockchainSwapsUniversal.swapTokensToETH_UniversalRouter(...)
                   │   │   ├─ Multicall      → apiBlockchainSwaps.swapTokensToETH_Multicall(...)
                   │   │   └─ SwapRouter02   → apiBlockchainSwaps.swapTokensToTokens(...)
                   │   │
                   │   └─ multi-hop
                   │       ├─ UniversalRouter → apiBlockchainSwapsUniversal.swapTokensToETH_UniversalRouter_Multiple(...)
                   │       ├─ Multicall      → apiBlockchainSwaps.swapTokensToETH_Multicall_Multiple(...)
                   │       └─ SwapRouter02   → apiBlockchainSwaps.swapTokensToTokens_Multiple(...)
                   │
                   └─ (no Multicall AND no UniversalRouter)
                       ├─ apiBlockchainSwaps.withdrawWETHtoETH(...)
                       └─ RETURN

        */

        try {
            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0]
            if (!userAddress) throw new Error('missing userAddress');

            const cachedApproval = (() => {
                if (!approvalPrefetch) return null;
                if (!isSameAddress(approvalPrefetch.userAddress, userAddress)) return null;
                if (!isSameAddress(approvalPrefetch.tokenAddress, tokenIn.id)) return null;
                if (Date.now() - approvalPrefetch.ts > 30_000) return null;
                return approvalPrefetch;
            })();

            if (!tokenIn) {
                return {
                    success: false,
                    error: 'Token addresses cannot be empty',
                };
            }

            if (isTokenETH(tokenIn.id)) {
                return {
                    success: false,
                    error: 'Token addresses must be different',
                };
            }

            if (Number(userAmountIn) <= 0) {
                return {
                    success: false,
                    error: 'Amount must be greater than 0',
                };
            }

            if (!userAddress) {
                return {
                    success: false,
                    error: 'User address is required',
                };
            }

            const amountIn = parseUnits(userAmountIn, tokenIn.decimals);


            // Vérifier le solde du token d'entrée
            const balance = await apiBlockchainTokens.getTokenBalance(tokenIn.id, userAddress);

            if (balance < amountIn) {
                return {
                    success: false,
                    error: 'Insufficient token balance'
                };
            }

            // Calculate output amounts
            const amountOut = parseUnits(userAmountOut, 18)
            const slippageSafe = clampSlippagePercent(slippage, 0.05, 50);
            const amountOutMinimum = applySlippageToAmount(amountOut, slippageSafe);
            const amountOutMinimumETH = formatEther(amountOutMinimum);


            // Try batched swap first (single signature for approve + swap + unwrap)
            if (USE_BATCHED_SWAPS && quotationPath.length === 1 && !useUniversalRouter) {
                try {
                    const isBatchedAvailable = await apiBlockchainSwapsBatched.isBatchedSwapAvailable(walletClient);

                    if (isBatchedAvailable) {
                        //console.log('[Swap] Attempting batched Token→ETH swap (1 signature)...');

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('Approve & Swap (1 signature)...');
                        }

                        const batchedReceipt = await apiBlockchainSwapsBatched.executeBatchedTokenToEthSwap(walletClient, {
                            tokenIn,
                            amountIn,
                            amountOutMinimum,
                            feeTier: BigInt(quotationPath[0].feeTier),
                            recipient: userAddress,
                        });

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('');
                        }

                        if (deps?.setTransactionsInfoCurrentStep) {
                            deps.setTransactionsInfoCurrentStep(n => n + 1);
                        }

                        return {
                            success: batchedReceipt.status === 'success',
                            transactionHash: batchedReceipt.transactionHash,
                        };
                    }

                } catch (batchError) {
                    //console.warn('[Swap] Batched Token→ETH swap failed, falling back to sequential:', batchError);
                    // Fall through to sequential swap
                }
            }


            // Sequential swap flow (fallback)
            if (true) {
                // Approve Token to (SWAP_ROUTER_ADDRESS or PERMIT2_ADDRESS)
                const spenderAddress = useUniversalRouter ? PERMIT2_ADDRESS : SWAP_ROUTER_ADDRESS;
                const approvalAmount = useUniversalRouter ? (2n ** 256n - 1n) : amountIn;

                const cachedAllowance = cachedApproval
                    ? (isSameAddress(spenderAddress, SWAP_ROUTER_ADDRESS)
                        ? cachedApproval.allowanceToSwapRouter
                        : cachedApproval.allowanceToPermit2)
                    : undefined;

                if (!cachedAllowance || cachedAllowance < approvalAmount) {
                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo(`Approve token ${tokenIn.symbol}...`)
                    }

                    const approveReceipt: TransactionReceipt | null = await approveTokenIfNeeded(walletClient, tokenIn.id, spenderAddress, approvalAmount, cachedAllowance);

                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo("")
                    }

                    if (deps?.setTransactionsInfoCurrentStep) {
                        deps.setTransactionsInfoCurrentStep(n => n + 1);
                    }
                }
            }


            // Approve Permit2 to Universal Router
            if (useUniversalRouter) {
                const cachedPermit2Allowance = cachedApproval
                    ? cachedApproval.permit2AllowanceToUniversalRouter
                    : undefined;

                const nowSec = BigInt(Math.floor(Date.now() / 1000));
                const approvalAmount = 2n ** 160n - 1n;

                if (!cachedPermit2Allowance || cachedPermit2Allowance.amount < approvalAmount || cachedPermit2Allowance.expiration < nowSec) {
                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo(`Approve Permit2...`)
                    }

                    await approvePermit2IfNeeded(walletClient, tokenIn.id, 2n ** 160n - 1n, cachedApproval?.permit2AllowanceToUniversalRouter ?? undefined);

                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo("")
                    }

                    if (deps?.setTransactionsInfoCurrentStep) {
                        deps.setTransactionsInfoCurrentStep(n => n + 1);
                    }
                }
            }


            // Swap tokens
            if (deps?.setSwapInfo) {
                deps.setSwapInfo("Swap tokens...")
            }

            let swapReceipt: TransactionReceipt | null = null;


            if (quotationPath.length === 1) {
                // Single Hop
                const swapSingleParams: SwapSingleParams = {
                    tokenIn: tokenIn.id,
                    tokenOut: WETH_ADDRESS,
                    fee: BigInt(quotationPath[0].feeTier),
                    recipient: userAddress,
                    amountIn: amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }

                //console.log('swapSingleParams:', swapSingleParams)


                if (useUniversalRouter) {
                    swapReceipt = await apiBlockchainSwapsUniversal.swapTokensToETH_UniversalRouter(walletClient, swapSingleParams); // execute (PERMIT2_TRANSFER_FROM + V3_SWAP_EXACT_IN + UNWRAP_WETH)

                } else if (useMulticallSwap) {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToETH_Multicall(walletClient, swapSingleParams); // multicall (exactInputSingle + unwrapWETH9)

                } else {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToTokens(walletClient, swapSingleParams); // exactInputSingle
                }

            } else {
                // Multi Hop
                const swapMultipleParams: SwapMultipleParams = {
                    tokenIn: tokenIn.id,
                    tokenOut: WETH_ADDRESS,
                    recipient: userAddress,
                    amountIn: amountIn,
                    amountOutMinimum,
                    path: quotationPath,
                }

                //console.log('swapMultipleParams:', swapMultipleParams)


                if (useUniversalRouter) {
                    swapReceipt = await apiBlockchainSwapsUniversal.swapTokensToETH_UniversalRouter_Multiple(walletClient, swapMultipleParams); // execute (PERMIT2_TRANSFER_FROM + V3_SWAP_EXACT_IN + UNWRAP_WETH)

                } else if (useMulticallSwap) {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToETH_Multicall_Multiple(walletClient, swapMultipleParams); // multicall (exactInput + unwrapWETH9)

                } else {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToTokens_Multiple(walletClient, swapMultipleParams); // exactInput
                }
            }


            if (deps?.setSwapInfo) {
                deps.setSwapInfo("")
            }

            if (deps?.setTransactionsInfoCurrentStep) {
                deps.setTransactionsInfoCurrentStep(n => n + 1);
            }


            if (!useMulticallSwap && !useUniversalRouter) {
                // Unwrap WETH to ETH

                if (deps?.setSwapInfo) {
                    deps.setSwapInfo("Withdraw ETH...")
                }

                const withdrawReceipt = await apiBlockchainSwaps.withdrawWETHtoETH(walletClient, amountOutMinimumETH);

                if (deps?.setSwapInfo) {
                    deps.setSwapInfo("")
                }

                if (deps?.setTransactionsInfoCurrentStep) {
                    deps.setTransactionsInfoCurrentStep(n => n + 1);
                }
            }

            return {
                success: swapReceipt.status === 'success',
                transactionHash: swapReceipt.transactionHash,
            };

        } catch (err: any) {
            //console.error('Error in executeSwapTokensForETH:', getErrorMessage(err));

            if (deps?.setSwapInfo) {
                deps.setSwapInfo("")
            }

            return {
                success: false,
                error: getErrorMessage(err),
            };
        }

    }

    const executeSwapTokensForTokens = async (walletClient: WalletClient, tokenIn: Token, tokenOut: Token, userAmountIn: string, userAmountOut: string, quotationPath: QuotePath, slippage = 5, deps?: SwapTokensDependencies): Promise<TransactionResult> => {

        /*
            executeSwapTokensForTokens Cases
               │
               ├─ (batched, 1 signature)
               │   ├─ apiBlockchainSwapsBatched.executeBatchedTokenSwap(...)
               │   └─ RETURN
               │
               └─ (sequential)
                   ├─ approve tokenIn
                   │   └─ approveTokenIfNeeded(..., spender = (useUniversalRouter ? PERMIT2 : SWAP_ROUTER))
                   ├─ approve Permit2 → UniversalRouter (only if useUniversalRouter)
                   │   └─ approvePermit2IfNeeded(...)
                   └─ swap
                       │
                       ├─ single-hop
                       │   ├─ UniversalRouter  → apiBlockchainSwapsUniversal.swapTokensToTokens_UniversalRouter(...)
                       │   ├─ SwapRouter02     → apiBlockchainSwaps.swapTokensToTokens(...)
                       │   └─ RETURN
                       └─ multi-hop
                           ├─ UniversalRouter  → apiBlockchainSwapsUniversal.swapTokensToTokens_UniversalRouter_Multiple(...)
                           └─ SwapRouter02     → apiBlockchainSwaps.swapTokensToTokens_Multiple(...)
                               └─ RETURN

        */

        try {
            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0]
            if (!userAddress) throw new Error('missing userAddress');

            const cachedApproval = (() => {
                if (!approvalPrefetch) return null;
                if (!isSameAddress(approvalPrefetch.userAddress, userAddress)) return null;
                if (!isSameAddress(approvalPrefetch.tokenAddress, tokenIn.id)) return null;
                if (Date.now() - approvalPrefetch.ts > 30_000) return null;
                return approvalPrefetch;
            })();

            if (!tokenIn || !tokenOut) {
                return {
                    success: false,
                    error: 'Token addresses cannot be empty',
                };
            }


            if (isSameAddress(tokenIn.id, tokenOut.id)) {
                return {
                    success: false,
                    error: 'Token addresses must be different',
                };
            }

            if (Number(userAmountIn) <= 0) {
                return {
                    success: false,
                    error: 'Amount must be greater than 0',
                };
            }

            if (!userAddress) {
                return {
                    success: false,
                    error: 'User address is required',
                };
            }

            const amountIn = parseUnits(userAmountIn, tokenIn.decimals);


            // Check the input token balance
            const balance = await apiBlockchainTokens.getTokenBalance(tokenIn.id, userAddress);

            if (balance < amountIn) {
                return {
                    success: false,
                    error: 'Insufficient token balance'
                };
            }

            // Calculate output amounts
            const amountOut = parseUnits(userAmountOut, tokenOut.decimals)
            const slippageSafe = clampSlippagePercent(slippage, 0.05, 50);
            const amountOutMinimum = applySlippageToAmount(amountOut, slippageSafe);


            // Try batched swap first (single signature for approve + swap)
            if (USE_BATCHED_SWAPS && quotationPath.length === 1 && !useUniversalRouter) {
                try {
                    const isBatchedAvailable = await apiBlockchainSwapsBatched.isBatchedSwapAvailable(walletClient);

                    if (isBatchedAvailable) {
                        //console.log('[Swap] Attempting batched swap (1 signature)...');

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('Approve & Swap (1 signature)...');
                        }

                        const batchedReceipt = await apiBlockchainSwapsBatched.executeBatchedTokenSwap(walletClient, {
                            tokenIn,
                            tokenOut,
                            amountIn,
                            amountOutMinimum,
                            feeTier: BigInt(quotationPath[0].feeTier),
                            recipient: userAddress,
                        });

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('');
                        }

                        if (deps?.setTransactionsInfoCurrentStep) {
                            deps.setTransactionsInfoCurrentStep(n => n + 1);
                        }

                        return {
                            success: batchedReceipt.status === 'success',
                            transactionHash: batchedReceipt.transactionHash,
                        };
                    }

                } catch (batchError) {
                    //console.warn('[Swap] Batched swap failed, falling back to sequential:', batchError);
                    // Fall through to sequential swap
                }
            }


            // Sequential swap flow (fallback or multi-hop)
            if (true) {
                // Approve Token to (SWAP_ROUTER_ADDRESS or PERMIT2_ADDRESS)
                const spenderAddress = useUniversalRouter ? PERMIT2_ADDRESS : SWAP_ROUTER_ADDRESS;
                const approvalAmount = useUniversalRouter ? (2n ** 256n - 1n) : amountIn;

                const cachedAllowance = cachedApproval
                    ? (isSameAddress(spenderAddress, SWAP_ROUTER_ADDRESS)
                        ? cachedApproval.allowanceToSwapRouter
                        : cachedApproval.allowanceToPermit2)
                    : undefined;

                if (!cachedAllowance || cachedAllowance < approvalAmount) {
                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo(`Approve token ${tokenIn.symbol}...`)
                    }

                    const approveReceipt: TransactionReceipt | null = await approveTokenIfNeeded(walletClient, tokenIn.id, spenderAddress, approvalAmount, cachedAllowance);

                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo("")
                    }

                    if (deps?.setTransactionsInfoCurrentStep) {
                        deps.setTransactionsInfoCurrentStep(n => n + 1);
                    }
                }
            }


            // Approve Permit2 to Universal Router
            if (useUniversalRouter) {
                const cachedPermit2Allowance = cachedApproval
                    ? cachedApproval.permit2AllowanceToUniversalRouter
                    : undefined;

                const nowSec = BigInt(Math.floor(Date.now() / 1000));
                const approvalAmount = 2n ** 160n - 1n;

                if (!cachedPermit2Allowance || cachedPermit2Allowance.amount < approvalAmount || cachedPermit2Allowance.expiration < nowSec) {
                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo(`Approve Permit2...`)
                    }

                    await approvePermit2IfNeeded(walletClient, tokenIn.id, approvalAmount, cachedApproval?.permit2AllowanceToUniversalRouter ?? undefined);

                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo("")
                    }

                    if (deps?.setTransactionsInfoCurrentStep) {
                        deps.setTransactionsInfoCurrentStep(n => n + 1);
                    }
                }

            }


            // Swap tokens
            if (deps?.setSwapInfo) {
                deps.setSwapInfo("Swap tokens...")
            }

            let swapReceipt: TransactionReceipt | null = null;


            if (quotationPath.length === 1) {
                // Single Hop

                const swapSingleParams: SwapSingleParams = {
                    tokenIn: tokenIn.id,
                    tokenOut: tokenOut.id,
                    fee: BigInt(quotationPath[0].feeTier),
                    recipient: userAddress,
                    amountIn: amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                };

                //console.log('swapSingleParams:', swapSingleParams)


                if (useUniversalRouter) {
                    swapReceipt = await apiBlockchainSwapsUniversal.swapTokensToTokens_UniversalRouter(walletClient, swapSingleParams); // execute (PERMIT2_TRANSFER_FROM + V3_SWAP_EXACT_IN)

                } else {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToTokens(walletClient, swapSingleParams); // exactInputSingle
                }

            } else {
                // Multi Hop
                const swapMultipleParams: SwapMultipleParams = {
                    tokenIn: tokenIn.id,
                    tokenOut: tokenOut.id,
                    recipient: userAddress,
                    amountIn: amountIn,
                    amountOutMinimum,
                    path: quotationPath,
                }

                //console.log('swapMultipleParams:', swapMultipleParams)


                if (useUniversalRouter) {
                    swapReceipt = await apiBlockchainSwapsUniversal.swapTokensToTokens_UniversalRouter_Multiple(walletClient, swapMultipleParams); // execute (PERMIT2_TRANSFER_FROM + V3_SWAP_EXACT_IN)

                } else {
                    swapReceipt = await apiBlockchainSwaps.swapTokensToTokens_Multiple(walletClient, swapMultipleParams); // exactInput
                }
            }

            if (deps?.setSwapInfo) {
                deps.setSwapInfo("")
            }

            if (deps?.setTransactionsInfoCurrentStep) {
                deps.setTransactionsInfoCurrentStep(n => n + 1);
            }

            return {
                success: swapReceipt.status === 'success',
                transactionHash: swapReceipt.transactionHash,
            };

        } catch (err: any) {
            //console.error('Error in executeSwapTokensForTokens:', getErrorMessage(err));

            if (deps?.setSwapInfo) {
                deps.setSwapInfo("")
            }

            return {
                success: false,
                error: getErrorMessage(err),
            };
        }

    }


    const executeSwapSmartWallet = async (walletClient: WalletClient, activeSmartWalletContext: SmartWalletContext, tokenIn: Token, tokenOut: Token, quotation: TokenSwapQuotationResult, isEthOutput: boolean, slippage=5, deps?: SwapTokensDependencies): Promise<TransactionResult> => {
        const userAddresses = await walletClient.getAddresses();
        const userAddress = userAddresses[0]
        if (!userAddress) throw new Error('missing userAddress');

        const cachedApproval = (() => {
            if (!approvalPrefetch) return null;
            if (!isSameAddress(approvalPrefetch.userAddress, userAddress)) return null;
            if (!isSameAddress(approvalPrefetch.tokenAddress, tokenIn.id)) return null;
            if (Date.now() - approvalPrefetch.ts > 30_000) return null;
            return approvalPrefetch;
        })();

        const isMultiHop = quotation.path && quotation.path.length > 1;
        //console.log('[SmartWallet] Attempting atomic swap...', { isMultiHop, pathLength: quotation.path?.length });

        setSwapInfo(`Executing ${isMultiHop ? 'multi-hop ' : ''}atomic swap...`);

        const amountIn = parseUnits(quotation.amountIn, tokenIn.decimals);

        const slippageBps = BigInt(Math.max(0, 10_000 - Math.round(slippage * 100)));

        const amountOutQuoted = quotation.amountOutRaw
            ? BigInt(quotation.amountOutRaw)
            : parseUnits(quotation.amountOut, tokenOut.decimals);

        const amountOutMinimum = (amountOutQuoted * slippageBps) / 10_000n;

        //console.log('[SmartWallet] amountOutQuoted:', amountOutQuoted.toString());
        //console.log('[SmartWallet] amountOutMinimum:', amountOutMinimum.toString());

        {
            const allowance = cachedApproval?.allowanceToSmartWallet;

            //console.log('[executeSwap] smart wallet allowance:', allowance)

            const hasApproval = allowance !== null && allowance !== undefined
                ? allowance >= amountIn
                : await apiBlockchainSwapsSmartWallet.checkSmartWalletApproval(
                    tokenIn.id,
                    userAddress,
                    activeSmartWalletContext.smartWalletAddress,
                    amountIn
                );

            //console.log('[SmartWallet] EOA->SmartWallet allowance sufficient:', hasApproval);

            if (!hasApproval) {
                //throw new Error(`Approve ${tokenIn.symbol} for Smart Wallet (one-time)`);

                await apiBlockchainTokens.approveToken(
                    walletClient,
                    tokenIn.id,
                    activeSmartWalletContext.smartWalletAddress,
                    BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
                );

                if (deps?.setSwapInfo) {
                    deps.setSwapInfo('');
                }

                if (deps?.setTransactionsInfoCurrentStep) {
                    deps.setTransactionsInfoCurrentStep(n => n + 1);
                }
            }
        }

        const tokenInAddress = tokenIn.id;
        const tokenOutAddress = isEthOutput ? WETH_ADDRESS : tokenOut.id;

        let atomicCalls;

        const useTaxRouter = false;

        if (isMultiHop) {
            const pathSegments = quotation.path.map((p: any) => ({
                tokenIn: p.tokenIn as Address,
                tokenOut: p.tokenOut as Address,
                fee: Number(p.feeTier),
            }));

            if (isEthOutput) {
                // Token → ETH (multi-hop)
                atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicMultiHopToEthSwapCalls({
                    eoaAddress: userAddress,
                    smartWalletAddress: activeSmartWalletContext.smartWalletAddress,
                    tokenIn: tokenInAddress,
                    tokenOut: WETH_ADDRESS,
                    amountIn,
                    amountOutMinimum,
                    path: pathSegments,
                    useTaxRouter,
                });

            } else {
                // Token → Token (multi-hop)
                atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicMultiHopSwapCalls({
                    eoaAddress: userAddress,
                    smartWalletAddress: activeSmartWalletContext.smartWalletAddress,
                    tokenIn: tokenInAddress,
                    tokenOut: tokenOutAddress,
                    amountIn,
                    amountOutMinimum,
                    path: pathSegments,
                    useTaxRouter,
                });
            }

        } else {
            // Single-hop swaps
            if (isEthOutput) {
                // Token → ETH (unwraps to ETH and sends to EOA)
                atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicTokenToEthSwapCalls({
                    eoaAddress: userAddress,
                    smartWalletAddress: activeSmartWalletContext.smartWalletAddress,
                    tokenIn: tokenInAddress,
                    tokenOut: WETH_ADDRESS,
                    amountIn,
                    amountOutMinimum,
                    fee: Number(quotation.path[0]?.feeTier || '3000'),
                    useTaxRouter,
                });

            } else {
                // Token → Token
                atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicTokenSwapCalls({
                    eoaAddress: userAddress,
                    smartWalletAddress: activeSmartWalletContext.smartWalletAddress,
                    tokenIn: tokenInAddress,
                    tokenOut: tokenOutAddress,
                    amountIn,
                    amountOutMinimum,
                    fee: Number(quotation.path[0]?.feeTier || '3000'),
                    useTaxRouter,
                });
            }
        }

        const receipt = await activeSmartWalletContext.batchTransactions(atomicCalls, undefined);

        if (deps?.setSwapInfo) {
            deps.setSwapInfo('');
        }

        if (deps?.setTransactionsInfoCurrentStep) {
            deps.setTransactionsInfoCurrentStep(n => n + 1);
        }

        const result: TransactionResult = {
            success: receipt.status === 'success',
            transactionHash: receipt.transactionHash,
        };

        return result;
    }


    /**
     * Execute swap via SelectiveTaxRouter for taxable tokens
     */
    const executeSwapViaTaxRouter = async (
        walletClient: WalletClient,
        tokenIn: Token,
        tokenOut: Token,
        quotation: TokenSwapQuotationResult,
        slippage: number,
        deps?: SwapTokensDependencies
    ): Promise<TransactionResult> => {
        try {
            const userAddresses = await walletClient.getAddresses();
            const userAddress = userAddresses[0];
            if (!userAddress) throw new Error('Missing user address');

            const amountIn = parseUnits(quotation.amountIn, tokenIn.decimals);
            const amountOut = parseUnits(quotation.amountOut, tokenOut.decimals);

            // Get actual token addresses (convert ETH to WETH)
            const tokenInAddress = isTokenETH(tokenIn.id)
                ? WETH_ADDRESS
                : tokenIn.id;

            const tokenOutAddress = isTokenETH(tokenOut.id)
                ? WETH_ADDRESS
                : tokenOut.id;

            const cachedApproval = (() => {
                if (!approvalPrefetch) return null;
                if (!isSameAddress(approvalPrefetch.userAddress, userAddress)) return null;
                if (!isSameAddress(approvalPrefetch.tokenAddress, tokenInAddress)) return null;
                if (Date.now() - approvalPrefetch.ts > 30_000) return null;
                return approvalPrefetch;
            })();

            // Check if output token is taxable and adjust amountOutMinimum accordingly
            let taxAdjustment = 100n; // 100% = no tax
            try {
                const taxConfig = await apiBlockchainSwapsTax.getTokenTaxConfig(tokenOutAddress);
                if (taxConfig.isTaxable) {
                    // Tax rate is in basis points (e.g., 1000 = 10%)
                    const taxRateBps = BigInt(taxConfig.taxRate);
                    taxAdjustment = 10000n - taxRateBps; // e.g., 10000 - 1000 = 9000 (90%)
                    //console.log(`[TaxRouter] Output token has ${Number(taxRateBps) / 100}% tax, adjusting amountOutMinimum`);
                }

            } catch (err) {
                //console.warn('[TaxRouter] Could not check output token tax config:', err);
            }

            // Calculate amountOutMinimum with slippage AND tax adjustment
            const amountOutAfterTax = (amountOut * taxAdjustment) / 10000n;
            const slippageSafe = clampSlippagePercent(slippage, 0.05, 50);
            const amountOutMinimum = applySlippageToAmount(amountOutAfterTax, slippageSafe);
            //console.log(`[TaxRouter] amountOut: ${amountOut}, afterTax: ${amountOutAfterTax}, minimum: ${amountOutMinimum}`);

            const isEthInput = isTokenETH(tokenIn.id);
            const isEthOutput = isTokenETH(tokenOut.id);

            //console.log('[TaxRouter] Batched swap check:', {
            //    USE_BATCHED_SWAPS,
            //    isEthInput,
            //    isEthOutput,
            //    tokenIn: tokenIn.symbol,
            //    tokenOut: tokenOut.symbol,
            //    willTryBatched: USE_BATCHED_SWAPS,
            //});

            // Try Smart Wallet atomic swap first (ZERO RISK - all in 1 UserOp)
            // Only if useSmartWalletFeature is enabled
            if (useSmartWalletFeature && smartWalletContext?.isReady && !isEthInput) {
                try {
                    const isMultiHop = quotation.path && quotation.path.length > 1;
                    //console.log('[TaxRouter] Smart wallet available, attempting atomic swap...', { isMultiHop, pathLength: quotation.path?.length });

                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo(`Executing ${isMultiHop ? 'multi-hop ' : ''}atomic swap via Smart Wallet...`);
                    }

                    let atomicCalls;

                    if (isMultiHop) {
                        // Multi-hop swap
                        const pathSegments = quotation.path.map((p: any) => ({
                            tokenIn: p.tokenIn as Address,
                            tokenOut: p.tokenOut as Address,
                            fee: Number(p.feeTier),
                        }));

                        if (isEthOutput) {
                            atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicMultiHopToEthSwapCalls({
                                eoaAddress: userAddress,
                                smartWalletAddress: smartWalletContext.smartWalletAddress,
                                tokenIn: tokenInAddress,
                                tokenOut: WETH_ADDRESS,
                                amountIn,
                                amountOutMinimum,
                                path: pathSegments,
                                useTaxRouter: false, // Multi-hop uses SwapRouter
                            });

                        } else {
                            atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicMultiHopSwapCalls({
                                eoaAddress: userAddress,
                                smartWalletAddress: smartWalletContext.smartWalletAddress,
                                tokenIn: tokenInAddress,
                                tokenOut: tokenOutAddress,
                                amountIn,
                                amountOutMinimum,
                                path: pathSegments,
                                useTaxRouter: false, // Multi-hop uses SwapRouter
                            });
                        }

                    } else {
                        // Single-hop swap
                        if (isEthOutput) {
                            atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicTokenToEthSwapCalls({
                                eoaAddress: userAddress,
                                smartWalletAddress: smartWalletContext.smartWalletAddress,
                                tokenIn: tokenInAddress,
                                tokenOut: WETH_ADDRESS,
                                amountIn,
                                amountOutMinimum,
                                fee: Number(quotation.path[0]?.feeTier || '3000'),
                                useTaxRouter: true,
                            });

                        } else {
                            atomicCalls = apiBlockchainSwapsSmartWallet.buildAtomicTokenSwapCalls({
                                eoaAddress: userAddress,
                                smartWalletAddress: smartWalletContext.smartWalletAddress,
                                tokenIn: tokenInAddress,
                                tokenOut: tokenOutAddress,
                                amountIn,
                                amountOutMinimum,
                                fee: Number(quotation.path[0]?.feeTier || '3000'),
                                useTaxRouter: true,
                            });
                        }
                    }

                    // Execute all calls atomically
                    const receipt = await smartWalletContext.batchTransactions(atomicCalls);

                    if (deps?.setSwapInfo) {
                        deps.setSwapInfo('');
                    }

                    if (deps?.setTransactionsInfoCurrentStep) {
                        deps.setTransactionsInfoCurrentStep(n => n + 1);
                    }

                    // question: Shouldn't we only return if it's successful?

                    return {
                        success: receipt.status === 'success',
                        transactionHash: receipt.transactionHash,
                    };

                } catch (smartWalletError) {
                    //console.warn('[TaxRouter] Smart wallet atomic swap failed, falling back:', smartWalletError);
                    // Fall through to other methods
                }
            }

            // Try 7702 batched swap (for future embedded wallets)
            if (USE_BATCHED_SWAPS) {
                try {
                    //console.log('[TaxRouter] Checking wallet 7702 support...');
                    const isBatchedAvailable = await apiBlockchainSwapsBatched.isBatchedSwapAvailable(walletClient);
                    //console.log('[TaxRouter] Wallet 7702 support:', isBatchedAvailable);

                    if (isBatchedAvailable) {
                        //console.log('[TaxRouter] Attempting batched taxable swap (1 signature)...');

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('Approve & Swap via Tax Router (1 signature)...');
                        }

                        // Note: executeBatchedTaxSwap is not implemented
                        const batchedReceipt = await apiBlockchainSwapsBatched.executeBatchedTaxSwap(walletClient, {
                            tokenIn,
                            tokenOut: { ...tokenOut, id: tokenOutAddress } as Token,
                            amountIn,
                            amountOutMinimum,
                            feeTier: BigInt(quotation.path[0]?.feeTier || '3000'),
                            recipient: userAddress,
                            isEthInput,
                            isEthOutput,
                        });

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('');
                        }

                        if (deps?.setTransactionsInfoCurrentStep) {
                            deps.setTransactionsInfoCurrentStep(n => n + 1);
                        }

                        // question: Shouldn't we only return if it's successful?

                        return {
                            success: batchedReceipt.status === 'success',
                            transactionHash: batchedReceipt.transactionHash,
                        };
                    }

                } catch (batchError) {
                    //console.warn('[TaxRouter] Batched swap failed, falling back to Permit2 or sequential:', batchError);
                    // Fall through to Permit2 or sequential swap
                }
            }

            // Try Permit2 wrapper (single signature after initial Permit2 approval)
            // Note: Permit2 wrapper only supports single-hop swaps for now
            const isMultiHop = quotation.path && quotation.path.length > 1;
            if (apiBlockchainSwapsTaxPermit2.isPermit2WrapperEnabled() && !isEthInput && !isMultiHop) {
                try {
                    //console.log('[TaxRouter] Checking Permit2 approval...');
                    let hasPermit2Approval = cachedApproval
                        ? cachedApproval.allowanceToPermit2 > 0n
                        : await apiBlockchainSwapsTaxPermit2.hasPermit2Approval(
                            tokenInAddress,
                            userAddress
                        );
                    //console.log('[TaxRouter] Has Permit2 approval:', hasPermit2Approval);

                    let hasWrapperAllowance = cachedApproval && cachedApproval.taxWrapperAllowance !== null
                        ? cachedApproval.taxWrapperAllowance
                        : await apiBlockchainSwapsTaxPermit2.hasPermit2AllowanceForWrapper(
                            tokenInAddress,
                            userAddress
                        );
                    //console.log('[TaxRouter] Has Permit2 allowance for wrapper:', hasWrapperAllowance);

                    // If no Permit2 approval, prompt user to approve (one-time per token)
                    if (!hasPermit2Approval) {
                        //console.log('[TaxRouter] Requesting Permit2 approval (one-time)...');
                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo(`Approve ${tokenIn.symbol} for Permit2 (one-time)...`);
                        }

                        await apiBlockchainSwapsTaxPermit2.approvePermit2(
                            walletClient,
                            tokenInAddress
                        );

                        if (deps?.setTransactionsInfoCurrentStep) {
                            deps.setTransactionsInfoCurrentStep(n => n + 1);
                        }

                        hasPermit2Approval = true;
                    }

                    // One-time Permit2 "permit" to authorize the wrapper to pull this token via Permit2 allowance.
                    // This removes the need to sign Permit2 messages on every swap.
                    if (hasPermit2Approval && !hasWrapperAllowance) {
                        //console.log('[TaxRouter] Enabling Permit2 allowance for wrapper (one-time)...');
                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo(`Enable Permit2 for ${tokenIn.symbol} (one-time)...`);
                        }

                        await apiBlockchainSwapsTaxPermit2.enablePermit2AllowanceForWrapper(
                            walletClient,
                            tokenInAddress
                        );

                        if (deps?.setTransactionsInfoCurrentStep) {
                            deps.setTransactionsInfoCurrentStep(n => n + 1);
                        }

                        hasWrapperAllowance = true;
                    }

                    if (hasPermit2Approval && hasWrapperAllowance) {
                        //console.log('[TaxRouter] Attempting Permit2 allowance swap...');

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('Swap via Tax Router...');
                        }

                        const permit2Receipt = await apiBlockchainSwapsTaxPermit2.swapWithPermit2Allowance(walletClient, {
                            tokenIn: tokenInAddress,
                            tokenOut: tokenOutAddress,
                            fee: Number(quotation.path[0]?.feeTier || '3000'),
                            recipient: userAddress,
                            amountIn,
                            amountOutMinimum,
                        });

                        if (deps?.setSwapInfo) {
                            deps.setSwapInfo('');
                        }

                        // Note: If output is ETH, the wrapper's exactInputSingleToEthPermit2 handles unwrap internally

                        if (deps?.setTransactionsInfoCurrentStep) {
                            deps.setTransactionsInfoCurrentStep(n => n + 1);
                        }

                        // question: Shouldn't we only return if it's successful?

                        return {
                            success: permit2Receipt.status === 'success',
                            transactionHash: permit2Receipt.transactionHash,
                        };
                    }
                } catch (permit2Error) {
                    //console.warn('[TaxRouter] Permit2 swap failed, falling back to sequential:', permit2Error);
                    // Fall through to sequential swap
                }
            }

            // Sequential swap flow (fallback)
            // Step 1: If swapping from ETH, deposit to WETH first
            if (isEthInput) {
                if (deps?.setSwapInfo) {
                    deps.setSwapInfo('Deposit ETH to WETH...');
                }
                await apiBlockchainSwaps.depositETHtoWETH(walletClient, quotation.amountIn);

                if (deps?.setTransactionsInfoCurrentStep) {
                    deps.setTransactionsInfoCurrentStep(n => n + 1);
                }
            }

            // Step 2 & 3: Approve and Execute swap
            let receipt: TransactionReceipt;

            if (isMultiHop) {
                // Multi-hop: Use regular SwapRouter (TaxRouter only supports single-hop)
                // Approve SwapRouter
                if (deps?.setSwapInfo) {
                    deps.setSwapInfo(`Approve ${tokenIn.symbol} for SwapRouter...`);
                }

                await approveTokenIfNeeded(walletClient, tokenInAddress, SWAP_ROUTER_ADDRESS, amountIn);

                if (deps?.setTransactionsInfoCurrentStep) {
                    deps.setTransactionsInfoCurrentStep(n => n + 1);
                }

                // Execute multi-hop swap
                if (deps?.setSwapInfo) {
                    deps.setSwapInfo('Swap via SwapRouter (multi-hop)...');
                }

                const swapMultipleParams: SwapMultipleParams = {
                    tokenIn: tokenInAddress,
                    tokenOut: tokenOutAddress,
                    recipient: userAddress,
                    amountIn,
                    amountOutMinimum,
                    path: quotation.path,
                };

                receipt = await apiBlockchainSwaps.swapTokensToTokens_Multiple(walletClient, swapMultipleParams);

            } else {
                // Single-hop: Use TaxRouter
                // Approve TaxRouter
                if (deps?.setSwapInfo) {
                    deps.setSwapInfo(`Approve ${tokenIn.symbol} for Tax Router...`);
                }

                await apiBlockchainSwapsTax.approveTokenForTaxRouter(walletClient, tokenInAddress, amountIn);

                if (deps?.setTransactionsInfoCurrentStep) {
                    deps.setTransactionsInfoCurrentStep(n => n + 1);
                }

                // Execute single-hop swap
                if (deps?.setSwapInfo) {
                    deps.setSwapInfo('Swap via Tax Router...');
                }

                const swapParams: SwapSingleParams = {
                    tokenIn: tokenInAddress,
                    tokenOut: tokenOutAddress,
                    fee: BigInt(quotation.path[0]?.feeTier || '3000'),
                    recipient: userAddress,
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                };

                receipt = await apiBlockchainSwapsTax.swapExactInputSingle(walletClient, swapParams);
            }

            if (deps?.setSwapInfo) {
                deps.setSwapInfo('');
            }

            if (deps?.setTransactionsInfoCurrentStep) {
                deps.setTransactionsInfoCurrentStep(n => n + 1);
            }

            // Step 4: If swapping to ETH, withdraw WETH
            if (isTokenETH(tokenOut.id)) {
                if (deps?.setSwapInfo) {
                    deps.setSwapInfo('Withdraw WETH to ETH...');
                }
                // Note: The output amount might be less due to slippage
                // We should check the actual received amount from the receipt
                await apiBlockchainSwaps.withdrawWETHtoETH(walletClient, quotation.amountOut);

                if (deps?.setTransactionsInfoCurrentStep) {
                    deps.setTransactionsInfoCurrentStep(n => n + 1);
                }
            }

            return {
                success: receipt.status === 'success',
                transactionHash: receipt.transactionHash,
            };

        } catch (err: unknown) {
            //console.error('Error in executeSwapViaTaxRouter:', err);

            if (deps?.setSwapInfo) {
                deps.setSwapInfo('');
            }

            return {
                success: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    };


    const swapHook: SwapHook = {
        swapType: 'ExactInputSingle',
        swapInfo,
        swapError,
        swapsCount,
        isSwapping,
        routeDecision,
        approvalPrefetch,
        setSwapInfo,
        setSwapError,
        executeSwap,
        setIsSwapping,
        setSwapsCount,
        checkRouteDecision,
    };


    return swapHook;
}



// Approve token if allowance is not sufficient
async function approveTokenIfNeeded(walletClient: WalletClient, tokenAddress: Address, spenderAddress: Address, approvalAmount?: bigint, cachedAllowance?: bigint): Promise<TransactionReceipt | null> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    approvalAmount = approvalAmount ?? 2n ** 256n - 1n;

    const allowance = cachedAllowance ?? await apiBlockchainTokens.getTokenAllowance(tokenAddress, userAddress, spenderAddress);

    //console.log('Token Current allowance:', allowance.toString());
    //console.log('Token Amount needed    :', approvalAmount.toString());

    if (allowance < approvalAmount) {
        //console.log('Approving Token...');
        const approveReceipt = await apiBlockchainTokens.approveToken(walletClient, tokenAddress, spenderAddress, approvalAmount);
        //console.log('Token Approved');

        return approveReceipt;
    }

    return null;
}


// Approving Permit2 (to let Universal Router spend tokens)
export async function approvePermit2IfNeeded(walletClient: WalletClient, tokenAddress: Address, approvalAmount?: bigint, cachedPermit2Allowance?: { amount: bigint; expiration: bigint; nonce: bigint } | null) {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    approvalAmount = approvalAmount ?? (2n ** 160n - 1n);

    const permit2Allowance = cachedPermit2Allowance ?? await apiBlockchainSwapsUniversal.getPermit2Allowance(userAddress, tokenAddress, UNIVERSAL_ROUTER_ADDRESS);

    //console.log('Permit2 Current allowance:', permit2Allowance.amount.toString());
    //console.log('Permit2 Amount needed    :', approvalAmount.toString());

    const nowSec = BigInt(Math.floor(Date.now() / 1000));

    if (permit2Allowance.amount < approvalAmount || permit2Allowance.expiration < nowSec) {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30); // 30 jours

        //console.log('Approving Permit2 (to let Universal Router spend tokens...) ...');

        await apiBlockchainSwapsUniversal.approvePermit2Allowance(
            walletClient,
            tokenAddress,
            UNIVERSAL_ROUTER_ADDRESS,
            2n ** 160n - 1n, // max uint160
            deadline
        );

        //console.log('Permit2 Approved');
    }
}


