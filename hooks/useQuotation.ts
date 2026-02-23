
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { ContractFunctionExecutionError, formatUnits, parseUnits } from "viem";

import * as apiBackend from '@/lib/api_backend';
import * as apiBlockchainQuotes from '@/lib/api_blockchain_quotes';

import { ETH_ADDRESS, WETH_ADDRESS } from "@/config.app";
import { formatValue } from "@/lib/ui_utils";
import { calculateSlippageAuto, clampSlippagePercent, DEFAULT_SWAP_SLIPPAGE_AUTO_FALLBACK } from '@/lib/uniswap_utils';

import { QuotePathParams, Token, TokenSwapQuotationPool, TokenSwapQuotationResult, QuoteExactInputSingle, QuoteExactInputSingleResult, TokenSwapQuotationPath, QuoteExactOutputSingleResult, QuoteExactOutputSingle, QuoteExactInput, QuoteExactInputResult, QuotePath, QuoteExactOutput, QuoteExactOutputResult } from "@/types";
import { isTokenETH } from "@/lib/tokens_utils";


export interface QuotationHook {
    quotationType: "ExactInput" | "ExactOutput",
    //quotationPools: TokenSwapQuotationPool[],
    quotationPaths: TokenSwapQuotationPath[],
    quotationInitialized: boolean,
    quotationLoading: boolean,
    quotationError: string,
    quotation: TokenSwapQuotationResult,
    quotationInfos: string,
    minimumReceived: string | null,
    slippageAuto: number | null,
    setQuotationType: Dispatch<SetStateAction<"ExactInput" | "ExactOutput">>,
    setQuotationPaths: Dispatch<SetStateAction<TokenSwapQuotationPath[]>>,
    setQuotationLoading: Dispatch<SetStateAction<boolean>>,
    setQuotationError: Dispatch<SetStateAction<string>>,
    fetchQuotationPools: () => void,
    setQuotation: Dispatch<SetStateAction<TokenSwapQuotationResult>>,
    setQuotationInfos: Dispatch<SetStateAction<string>>,
    setMinimumReceived: Dispatch<SetStateAction<string>>,
}


export function useQuotation(tokenIn: Token, tokenOut: Token, amountIn: string, amountOut: string, slippage: number | null, tokenInBalance: string, setAmountIn: Dispatch<SetStateAction<string>>, setAmountOut: Dispatch<SetStateAction<string>>, setSwapInfo: Dispatch<SetStateAction<string>>): QuotationHook {
    const [quotation, setQuotation] = useState<TokenSwapQuotationResult | null>(null);
    const [quotationInitialized, setQuotationInitialized] = useState(false)
    const [quotationLoading, setQuotationLoading] = useState(false)
    const [quotationError, setQuotationError] = useState<string>("")
    const [quotationInfos, setQuotationInfos] = useState<string>("")

    const isEthDeposit = (tokenIn?.id === ETH_ADDRESS && tokenOut?.id === WETH_ADDRESS);
    const isEthWithdraw = (tokenIn?.id === WETH_ADDRESS && tokenOut?.id === ETH_ADDRESS);
    const isEthDepositOrWithdraw = isEthDeposit || isEthWithdraw;


    // QUOTATION POOLS
    const [quotationPaths, setQuotationPaths] = useState<TokenSwapQuotationPath[]>([]);


    // QUOTATION PRICE
    const [quotationType, setQuotationType] = useState<'ExactInput' | 'ExactOutput' | null>(null);


    const [minimumReceived, setMinimumReceived] = useState<string>("")
    const [slippageAuto, setSlippageAuto] = useState<number | null>(null)


    const fetchQuotationPools = async () => {
        if (isEthDepositOrWithdraw) return;

        try {
            setQuotationPaths([]);
            setQuotationError("");
            setQuotationLoading(true);

            if (!tokenIn || !tokenOut) {
                return;
            }

            setSwapInfo("");

            const quotationPools: TokenSwapQuotationPool[] = await apiBackend.getSwapPoolsSingle(tokenIn.id, tokenOut.id)

            if (quotationPools.length === 0) {
                // No direct pool found => Try multi-hop
                const multiHopPaths: TokenSwapQuotationPath[] = await apiBackend.getSwapPoolsMultiple(tokenIn.id, tokenOut.id)
                //console.log('[fetchQuotationPools] multihop quotationPaths:', multiHopPaths)
                setQuotationPaths(multiHopPaths)

                if (multiHopPaths.length === 0) {
                    setQuotationError("No pool found");
                }

            } else {
                // Direct pool found - convert to path format
                const directPaths: TokenSwapQuotationPath[] = quotationPools.map(p => [p])
                //console.log('[fetchQuotationPools] direct quotationPaths:', directPaths)
                setQuotationPaths(directPaths)
            }


            setQuotationInitialized(true);

        } catch (err: any) {
            setQuotationError(err.message);
            //console.log(`[fetchQuotationPools] useTokens.fetchTokens ERROR. ${err.message}`)

        } finally {
            setQuotationLoading(false);
        }
    }


    const fetchQuotationPriceExactInput = async () => {
        // Fetch amountOut when amountIn changed (ExactInputSingle / ExactInput)
        if (!tokenIn || !tokenOut || !(Number(amountIn) > 0)) return;

        if (quotationPaths.length === 0 && !isEthDepositOrWithdraw) return

        if (quotationType !== 'ExactInput') {
            //setQuotationType(null);
            return;
        }

        setQuotation(null)
        setQuotationError("")
        setMinimumReceived(null)
        setAmountOut("")
        setSwapInfo("");
        setSlippageAuto(null);


        if (isEthDepositOrWithdraw) {
            // ETH deposit or withdraw

            const ethWethQuotation: TokenSwapQuotationResult = {
                type: 'ExactInput',
                amountIn,
                amountInRaw: parseUnits(amountIn, 18).toString(),
                amountOut: amountIn,
                amountOutRaw: parseUnits(amountIn, 18).toString(),
                gasEstimate: '',
                pricePerToken: '1',
                priceImpact: 0,
                tokenIn: tokenIn.id,
                tokenOut: tokenOut.id,
                path: [
                    {
                        pool: '0x',
                        feeTier: '',
                        sqrtPriceX96: "1000",
                        sqrtPriceX96After: "1000",
                        tokenIn: tokenIn.id,
                        tokenOut: tokenOut.id,
                    },
                ],
            }

            setQuotation(ethWethQuotation);

        } else {
            // Tokens swap

            if (quotationPaths.length > 0) {
                // Fetch swap prices

                setQuotationInfos("Search best price...")
                setQuotationLoading(true);

                try {
                    let bestQuote: TokenSwapQuotationResult | null = null;
                    const isSingle = quotationPaths[0].length === 1;

                    if (isSingle) {
                        const quotationPools = quotationPaths.map(p => p[0]);
                        bestQuote = await fetchPriceExactInputSingle(tokenIn, tokenOut, quotationPools, amountIn);

                    } else {
                        bestQuote = await fetchPriceExactInputMultiple(tokenIn, tokenOut, quotationPaths, amountIn);
                    }

                    //console.log('[fetchQuotationPriceExactInput] exactInput bestQuote:', bestQuote)

                    if (bestQuote) {
                        setQuotation(bestQuote)

                    } else {
                        setQuotationError("No price available")
                    }

                } catch (err: any) {
                    setQuotationError(err.message);

                } finally {
                    setQuotationInfos("")
                    setQuotationLoading(false);
                }
            }
        }
    }


    const fetchQuotationPriceExactOutput = async () => {
        // Fetch amountIn when amountOut changed (ExactOutputSingle / ExactOutput)
        if (!tokenIn || !tokenOut || !(Number(amountOut) > 0)) return;

        if (quotationPaths.length === 0 && !isEthDepositOrWithdraw) return

        if (quotationType !== 'ExactOutput') {
            //setQuotationType(null);
            return;
        }

        setQuotation(null)
        setQuotationError("")
        setMinimumReceived(null)
        setAmountIn("")
        setSwapInfo("");
        setSlippageAuto(null);


        if (isEthDepositOrWithdraw) {
            // ETH deposit or withdraw

            const ethWethQuotation: TokenSwapQuotationResult = {
                type: 'ExactOutput',
                amountIn: amountOut,
                amountInRaw: parseUnits(amountOut, 18).toString(),
                amountOut,
                amountOutRaw: parseUnits(amountOut, 18).toString(),
                gasEstimate: '',
                pricePerToken: '1',
                priceImpact: 0,
                tokenIn: tokenIn.id,
                tokenOut: tokenOut.id,
                path: [
                    {
                        pool: '0x',
                        feeTier: '',
                        sqrtPriceX96: "1000",
                        sqrtPriceX96After: "1000",
                        tokenIn: tokenIn.id,
                        tokenOut: tokenOut.id,
                    },
                ],
            }

            setQuotation(ethWethQuotation);

        } else {
            // Tokens swap

            if (quotationPaths.length > 0) {
                // Fetch swap prices

                setQuotationInfos("Search best price...")
                setQuotationLoading(true);

                try {
                    let bestQuote: TokenSwapQuotationResult | null = null;
                    const isSingle = quotationPaths[0].length === 1;

                    if (isSingle) {
                        const quotationPools = quotationPaths.map(p => p[0]);
                        bestQuote = await fetchPriceExactOutputSingle(tokenIn, tokenOut, quotationPools, amountOut);

                    } else {
                        bestQuote = await fetchPriceExactOutputMultiple(tokenIn, tokenOut, quotationPaths, amountOut);
                    }

                    //console.log('[fetchQuotationPriceExactOutput] exactOutput bestQuote:', bestQuote)

                    if (bestQuote) {
                        setQuotation(bestQuote)

                    } else {
                        setQuotationError("No price available")
                    }

                } catch (err: any) {
                    setQuotationError(err.message);

                } finally {
                    setQuotationInfos("")
                    setQuotationLoading(false);
                }
            }
        }

    }


    // Fetch quotation pools when tokens changed
    useEffect(() => {
        fetchQuotationPools()
    }, [tokenIn, tokenOut]);


    // Fetch amountOut when quotationPools or amountIn changed (ExactInputSingle)
    useEffect(() => {
        const timer = setTimeout(fetchQuotationPriceExactInput, isEthDepositOrWithdraw ? 0 : 500);

        return () => {
            if (timer) clearTimeout(timer);
        }
    }, [tokenIn, tokenOut, quotationPaths, amountIn]);


    // Fetch amountIn when quotationPools or amountOut changed (ExactOutputSingle)
    useEffect(() => {
        const timer = setTimeout(fetchQuotationPriceExactOutput, isEthDepositOrWithdraw ? 0 : 500);

        return () => {
            if (timer) clearTimeout(timer);
        }
    }, [tokenIn, tokenOut, quotationPaths, amountOut]);


    // Refresh "amountOut OR amountIn" & "Minimum Received" when price or slippage changed
    useEffect(() => {

        if (quotation) {
            const slippageAuto = calculateSlippageAuto(tokenIn, tokenOut, quotation);
            setSlippageAuto(slippageAuto);

            const maxSlippage = slippage === null ? 5 : 50;
            const swapSlippage = clampSlippagePercent(slippage ?? slippageAuto ?? DEFAULT_SWAP_SLIPPAGE_AUTO_FALLBACK, 0.05, maxSlippage);

            if (quotation.type === 'ExactInput') {
                setAmountOut(formatValue(quotation.amountOut));

                const amountOutMin = (100 - swapSlippage) * Number(quotation.amountOut) / 100;
                setMinimumReceived(formatValue(amountOutMin))

            } else if (quotation.type === 'ExactOutput') {
                setAmountIn(formatValue(quotation.amountIn));

                const amountOutMin = (100 - swapSlippage) * Number(quotation.amountOut) / 100;
                setMinimumReceived(formatValue(amountOutMin))
            }

        } else {
            setMinimumReceived("");
        }

    }, [quotation, slippage]);


    // Insufficient funds Warning when amount/quotation/balance change
    useEffect(() => {
        if (!quotation) return;
        if (!Number(amountIn)) return;
        if (Number(amountIn) < 0) return;

        if (Number(amountIn) > Number(tokenInBalance)) {
            setQuotationError("Insufficient funds")
        }
    }, [quotation, amountIn, tokenInBalance]);



    // RETURN

    const quotationHook: QuotationHook = {
        quotationType,
        //quotationPools,
        quotationPaths,
        quotationInitialized,
        quotationLoading,
        quotationError,
        quotation,
        quotationInfos,
        minimumReceived,
        slippageAuto,
        setQuotationType,
        setQuotationPaths,
        setQuotationLoading,
        setQuotationError,
        fetchQuotationPools,
        setQuotation,
        setQuotationInfos,
        setMinimumReceived,
    }

    return quotationHook
}


export async function fetchPriceExactInputSingle(tokenIn: Token, tokenOut: Token, quotationPools: TokenSwapQuotationPool[], amountIn: string): Promise<TokenSwapQuotationResult | null> {
    if (quotationPools.length === 0) return null;

    const bestQuote: QuoteExactInputSingle = await getSwapPriceExactInputSingle(tokenIn, tokenOut, quotationPools, amountIn)

    if (bestQuote) {
        const amountInBN = parseUnits(amountIn, tokenIn.decimals);
        const amountOut = formatUnits(bestQuote.amountOut, tokenOut.decimals);

        // Calculate the unit price
        const pricePerToken = (Number(amountIn) / Number(amountOut)).toString();
        const sqrtPriceX96 = BigInt(bestQuote.sqrtPriceX96);

        // Calculate the impact on the price
        const priceImpact = calculateSwapPriceImpact(tokenIn, tokenOut, sqrtPriceX96, BigInt(bestQuote.sqrtPriceX96After));

        const quotation: TokenSwapQuotationResult = {
            type: 'ExactInput',
            tokenIn: tokenIn.id,
            tokenOut: tokenOut.id,
            amountIn: amountIn,
            amountInRaw: amountInBN.toString(),
            amountOut: amountOut,
            amountOutRaw: bestQuote.amountOut.toString(),
            pricePerToken,
            priceImpact,
            gasEstimate: bestQuote.gasEstimate.toString(),
            path: [
                {
                    pool: bestQuote.pool,
                    feeTier: bestQuote.feeTier,
                    sqrtPriceX96: sqrtPriceX96.toString(),
                    sqrtPriceX96After: bestQuote.sqrtPriceX96After,
                    tokenIn: tokenIn.id,
                    tokenOut: tokenOut.id,
                },
            ],
        };

        return quotation

    } else {
        return null;
    }
}



export async function fetchPriceExactInputMultiple(tokenIn: Token, tokenOut: Token, quotationPaths: TokenSwapQuotationPath[], amountIn: string): Promise<TokenSwapQuotationResult | null> {
    if (quotationPaths.length === 0) return null;

    const bestQuote: QuoteExactInput = await getSwapPriceExactInputMultiple(tokenIn, tokenOut, quotationPaths, amountIn)

    if (bestQuote) {
        const amountInBN = parseUnits(amountIn, tokenIn.decimals);
        const amountOut = formatUnits(bestQuote.amountOut, tokenOut.decimals);

        // Calculate the unit price
        const pricePerToken = (Number(amountIn) / Number(amountOut)).toString();

        // Calculate the impact on the price (multi-hop)
        const priceImpact = calculateMultiHopPriceImpact(bestQuote.path);

        const quotation: TokenSwapQuotationResult = {
            type: 'ExactInput',
            tokenIn: tokenIn.id,
            tokenOut: tokenOut.id,
            amountIn,
            amountInRaw: amountInBN.toString(),
            amountOut,
            amountOutRaw: bestQuote.amountOut.toString(),
            pricePerToken,
            priceImpact,
            gasEstimate: bestQuote.gasEstimate.toString(),
            path: bestQuote.path,
        };

        return quotation

    } else {
        return null;
    }

}


export async function fetchPriceExactOutputMultiple(tokenIn: Token, tokenOut: Token, quotationPaths: TokenSwapQuotationPath[], amountOut: string): Promise<TokenSwapQuotationResult | null> {
    if (quotationPaths.length === 0) return null;

    const bestQuote: QuoteExactOutput = await getSwapPriceExactOutputMultiple(tokenIn, tokenOut, quotationPaths, amountOut)

    if (bestQuote) {
        const amountOutBN = parseUnits(amountOut, tokenOut.decimals);
        const amountIn = formatUnits(bestQuote.amountIn, tokenIn.decimals);

        // Calculate the unit price
        const pricePerToken = (Number(amountIn) / Number(amountOut)).toString();

        // Calculate the impact on the price (multi-hop)
        const priceImpact = calculateMultiHopPriceImpact(bestQuote.path);

        const quotation: TokenSwapQuotationResult = {
            type: 'ExactOutput',
            tokenIn: tokenIn.id,
            tokenOut: tokenOut.id,
            amountIn,
            amountInRaw: bestQuote.amountIn.toString(),
            amountOut,
            amountOutRaw: amountOutBN.toString(),
            pricePerToken,
            priceImpact,
            gasEstimate: bestQuote.gasEstimate.toString(),
            path: bestQuote.path,
        };

        return quotation

    } else {
        return null;
    }
}


export async function fetchPriceExactOutputSingle(tokenIn: Token, tokenOut: Token, quotationPools: TokenSwapQuotationPool[], amountOut: string): Promise<TokenSwapQuotationResult | null> {
    if (quotationPools.length === 0) return null;

    const bestQuote: QuoteExactOutputSingle = await getSwapPriceExactOutputSingle(tokenIn, tokenOut, quotationPools, amountOut)

    if (bestQuote) {
        const amountIn = formatUnits(bestQuote.amountIn, tokenIn.decimals);
        const amountOutBN = parseUnits(amountOut, tokenOut.decimals);

        // Calculate the unit price
        const pricePerToken = (Number(amountIn) / Number(amountOut)).toString();
        const sqrtPriceX96 = BigInt(bestQuote.sqrtPriceX96);

        // Calculate the impact on the price
        const priceImpact = calculateSwapPriceImpact(tokenIn, tokenOut, sqrtPriceX96, BigInt(bestQuote.sqrtPriceX96After));

        const quotation: TokenSwapQuotationResult = {
            type: 'ExactOutput',
            tokenIn: tokenIn.id,
            tokenOut: tokenOut.id,
            amountIn: amountIn,
            amountInRaw: bestQuote.amountIn.toString(),
            amountOut: amountOut,
            amountOutRaw: amountOutBN.toString(),
            pricePerToken,
            priceImpact,
            gasEstimate: bestQuote.gasEstimate.toString(),
            path: [
                {
                    pool: bestQuote.pool,
                    feeTier: bestQuote.feeTier,
                    sqrtPriceX96: bestQuote.sqrtPriceX96,
                    sqrtPriceX96After: bestQuote.sqrtPriceX96After,
                    tokenIn: tokenIn.id,
                    tokenOut: tokenOut.id,
                },
            ],
        };

        return quotation

    } else {
        return null;
    }

}



export async function getSwapPriceExactInputMultiple(tokenIn: Token, tokenOut: Token, quotationPaths: TokenSwapQuotationPath[], userAmountIn: string): Promise<QuoteExactInput | null> {

    if (isTokenETH(tokenIn.id)) {
        tokenIn = { ...tokenIn, id: WETH_ADDRESS };
    }

    if (isTokenETH(tokenOut.id)) {
        tokenOut = { ...tokenOut, id: WETH_ADDRESS };
    }

    const quotes: QuoteExactInput[] = [];
    const amountInBN = parseUnits(userAmountIn, tokenIn.decimals);

    for (const quotationPath of quotationPaths) {
        try {
            const pathInput: QuotePathParams = quotationPath.map(pool => ({
                tokenIn: pool.tokenIn,
                tokenOut: pool.tokenOut,
                fee: pool.feeTier,
            }));

            const result: QuoteExactInputResult = await apiBlockchainQuotes.quoteExactInput(pathInput, amountInBN);

            const pathOutput: QuotePath = quotationPath.map((pool, idx) => ({
                feeTier: pool.feeTier,
                pool: pool.poolAddress,
                sqrtPriceX96: pool.sqrtPrice,
                sqrtPriceX96After: result.sqrtPriceX96AfterList[idx].toString(),
                tokenIn: pool.tokenIn,
                tokenOut: pool.tokenOut,
            }));

            quotes.push({
                amountOut: result.amountOut,
                gasEstimate: result.gasEstimate,
                path: pathOutput,
            });


        } catch (err: any) {
            if (err instanceof ContractFunctionExecutionError) {
                //console.warn(`[quoteExactInputSingle] Error on pool ${quotationPath[0].poolAddress} (fee ${Number(quotationPath[0].feeTier) / 1000}%) : ${err.shortMessage}`, err.metaMessages)

            } else {
                //console.warn(`[quoteExactInputSingle] Error on pool ${quotationPath[0].poolAddress} (fee ${Number(quotationPath[0].feeTier) / 1000}%) : ${err.message}`)
            }
        }
    }


    // If no quote was successful
    if (quotes.length === 0) {
        //throw new Error('No liquidity pool found for this token pair');
        return null;
    }

    // Find the best quote (the one that gives the most tokens out)
    const bestQuote: QuoteExactInput = quotes.reduce((best, current) =>
        current.amountOut > best.amountOut ? current : best
    );
    //console.log('[getSwapPriceExactInputMultiple] bestQuote amountOut:', bestQuote)


    return bestQuote;
}


export async function getSwapPriceExactInputSingle(tokenIn: Token, tokenOut: Token, quotationPools: TokenSwapQuotationPool[], userAmountIn: string): Promise<QuoteExactInputSingle | null> {

    if (isTokenETH(tokenIn.id)) {
        tokenIn = { ...tokenIn, id: WETH_ADDRESS };
    }

    if (isTokenETH(tokenOut.id)) {
        tokenOut = { ...tokenOut, id: WETH_ADDRESS };
    }

    // Table to store the results of each fee tier
    const quotes: QuoteExactInputSingle[] = [];
    const amountInBN = parseUnits(userAmountIn, tokenIn.decimals);

    for (const pool of quotationPools) {
        try {
            const result: QuoteExactInputSingleResult = await apiBlockchainQuotes.quoteExactInputSingle(tokenIn, tokenOut, amountInBN, pool.feeTier);

            quotes.push({
                amountOut: result.amountOut,
                gasEstimate: result.gasEstimate,
                sqrtPriceX96After: result.sqrtPriceX96After.toString(),
                feeTier: pool.feeTier,
                pool: pool.poolAddress,
                sqrtPriceX96: pool.sqrtPrice,
                tokenIn: tokenIn.id,
                tokenOut: tokenOut.id,
            });

        } catch (err: any) {
            if (err instanceof ContractFunctionExecutionError) {
                //console.warn(`[getSwapPriceExactInputSingle] Error on pool ${pool.poolAddress} (fee ${Number(pool.feeTier) / 1000}%) : ${err.shortMessage}`, err.metaMessages)

            } else {
                //console.warn(`[getSwapPriceExactInputSingle] Error on pool ${pool.poolAddress} (fee ${Number(pool.feeTier) / 1000}%) : ${err.message}`)
            }
        }
    }


    // If no quote was successful
    if (quotes.length === 0) {
        //throw new Error('No liquidity pool found for this token pair');
        return null;
    }

    // Find the best quote (the one that gives the most tokens out)
    const bestQuote: QuoteExactInputSingle = quotes.reduce((best, current) =>
        current.amountOut > best.amountOut ? current : best
    );
    //console.log('[getSwapPriceExactInputSingle] bestQuote amountOut:', bestQuote)


    return bestQuote;
}



export async function getSwapPriceExactOutputMultiple(tokenIn: Token, tokenOut: Token, quotationPaths: TokenSwapQuotationPath[], userAmountOut: string): Promise<QuoteExactOutput | null> {

    if (isTokenETH(tokenIn.id)) {
        tokenIn = { ...tokenIn, id: WETH_ADDRESS };
    }

    if (isTokenETH(tokenOut.id)) {
        tokenOut = { ...tokenOut, id: WETH_ADDRESS };
    }

    const quotes: QuoteExactOutput[] = [];
    const amountOutBN = parseUnits(userAmountOut, tokenOut.decimals);

    for (const quotationPath of quotationPaths) {
        try {
            // Convert the path to the expected format
            const pathInput: QuotePathParams = quotationPath.map(pool => ({
                tokenIn: pool.tokenIn,
                tokenOut: pool.tokenOut,
                fee: pool.feeTier,
            }));

            // Call quoteExactOutput
            const result: QuoteExactOutputResult = await apiBlockchainQuotes.quoteExactOutput(pathInput, amountOutBN);

            // Construct the exit path with the squared prices after the swap
            // QuoterV2 expects the encoded path in reverse order for exact output.
            // As a result, sqrtPriceX96AfterList is returned in reverse hop order too.
            const lastIndex = result.sqrtPriceX96AfterList.length - 1;
            const pathOutput: QuotePath = quotationPath.map((pool, idx) => ({
                feeTier: pool.feeTier,
                pool: pool.poolAddress,
                sqrtPriceX96: pool.sqrtPrice,
                sqrtPriceX96After: result.sqrtPriceX96AfterList[lastIndex - idx].toString(),
                tokenIn: pool.tokenIn,
                tokenOut: pool.tokenOut,
            }));

            quotes.push({
                amountIn: result.amountIn,
                gasEstimate: result.gasEstimate,
                path: pathOutput,
            });

        } catch (err: any) {
            if (err instanceof ContractFunctionExecutionError) {
                //console.warn(`[getSwapPriceExactOutputMultiple] Error on path starting with pool ${quotationPath[0]?.poolAddress} : ${err.shortMessage}`, err.metaMessages)
            } else {
                //console.warn(`[getSwapPriceExactOutputMultiple] Error on path starting with pool ${quotationPath[0]?.poolAddress} : ${err.message}`)
            }
        }
    }

    // If no quote was successful
    if (quotes.length === 0) {
        //console.log('[getSwapPriceExactOutputMultiple] no exactOutput quotes')
        return null;
    }

    // Find the best quote (the one that requires the fewest tokens in)
    const bestQuote: QuoteExactOutput = quotes.reduce((best, current) =>
        current.amountIn < best.amountIn ? current : best
    );

    //console.log('[getSwapPriceExactOutputMultiple] bestQuote amountIn (ExactOutput):', bestQuote.amountIn.toString());

    return bestQuote;
}


export async function getSwapPriceExactOutputSingle(tokenIn: Token, tokenOut: Token, quotationPools: TokenSwapQuotationPool[], userAmountOut: string): Promise<QuoteExactOutputSingle | null> {

    if (isTokenETH(tokenIn.id)) {
        tokenIn = { ...tokenIn, id: WETH_ADDRESS };
    }

    if (isTokenETH(tokenOut.id)) {
        tokenOut = { ...tokenOut, id: WETH_ADDRESS };
    }

    // Table to store the results of each fee tier
    const quotes: QuoteExactOutputSingle[] = [];

    const amountOutBN = parseUnits(userAmountOut, tokenOut.decimals);

    for (const pool of quotationPools) {
        try {
            const result: QuoteExactOutputSingleResult = await apiBlockchainQuotes.quoteExactOutputSingle(tokenIn, tokenOut, amountOutBN, pool.feeTier);

            quotes.push({
                amountIn: result.amountIn,
                gasEstimate: result.gasEstimate,
                sqrtPriceX96After: result.sqrtPriceX96After.toString(),
                feeTier: pool.feeTier,
                pool: pool.poolAddress,
                sqrtPriceX96: pool.sqrtPrice,
                tokenIn: tokenIn.id,
                tokenOut: tokenOut.id,
            });

        } catch (err: any) {
            if (err instanceof ContractFunctionExecutionError) {
                //console.warn(`[getSwapPriceExactOutputSingle] Error on pool ${pool.poolAddress} (fee ${Number(pool.feeTier) / 1000}%) : ${err.shortMessage}`, err.metaMessages)

            } else {
                //console.warn(`[getSwapPriceExactOutputSingle] Error on pool ${pool.poolAddress} (fee ${Number(pool.feeTier) / 1000}%) : ${err.message}`)
            }
        }
    }


    // If no quote was successful
    if (quotes.length === 0) {
        //throw new Error('No liquidity pool found for this token pair');
        return null;
    }

    // Find the best quote (the one that gives the most tokens out)
    const bestQuote: QuoteExactOutputSingle = quotes.reduce((best, current) =>
        current.amountIn < best.amountIn ? current : best
    );
    //console.log('[getSwapPriceExactOutputSingle] bestQuote amountIn:', bestQuote)


    return bestQuote;
}



export function calculateSwapPriceImpact(tokenIn: Token, tokenOut: Token, sqrtPriceX96: bigint, sqrtPriceX96After: bigint): number {
    // Calculate the impact on the price
    let priceImpact = 0;

    try {
        if (sqrtPriceX96 > 0n) {
            // Convert sqrtPriceX96 to real price => Price = (sqrtPriceX96 / 2^96)^2
            const currentPrice = ((Number(sqrtPriceX96) / 2 ** 96) ** 2) * 10 ** (tokenOut.decimals - tokenIn.decimals);
            const newPrice = ((Number(sqrtPriceX96After) / 2 ** 96) ** 2) * 10 ** (tokenOut.decimals - tokenIn.decimals);

            priceImpact = Math.abs(100 * (newPrice - currentPrice) / currentPrice);
        }

    } catch (error) {
        //console.warn('[calculateSwapPriceImpact] Could not calculate price impact:', error);
        priceImpact = 0;
    }

    return priceImpact;
}


function calculateSwapPriceImpactFromSqrtPrices(sqrtPriceX96: bigint, sqrtPriceX96After: bigint): number {
    try {
        if (sqrtPriceX96 <= 0n) return 0;
        const currentPrice = (Number(sqrtPriceX96) / 2 ** 96) ** 2;
        const newPrice = (Number(sqrtPriceX96After) / 2 ** 96) ** 2;
        if (!isFinite(currentPrice) || currentPrice === 0) return 0;
        if (!isFinite(newPrice)) return 0;
        return Math.abs(100 * (newPrice - currentPrice) / currentPrice);

    } catch {
        return 0;
    }
}


function calculateMultiHopPriceImpact(path: QuotePath): number {
    try {
        if (!path || path.length === 0) return 0;

        // Aggregate per-hop impact. Decimal scaling cancels out in the ratio, so we can use raw sqrt prices.
        let total = 0;
        for (const hop of path) {
            const before = BigInt(hop.sqrtPriceX96);
            const after = BigInt(hop.sqrtPriceX96After);
            total += calculateSwapPriceImpactFromSqrtPrices(before, after);
        }

        return Math.min(100, total);

    } catch {
        return 0;
    }
}

