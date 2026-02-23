
import { decodeFunctionResult, encodeFunctionData, formatUnits, createPublicClient, http, Hex } from "viem";

import { encodeUniswapPath, encodeUniswapPath_Alternative, encodeUniswapReversePath } from "./uniswap_utils";
import { CURRENT_CHAIN, RPC_URL, ETH_ADDRESS, QUOTER_V2_ADDRESS } from "@/config.app";

import { Token, QuoteExactInputRawResult, QuoteExactInputResult, QuoteExactInputSingleRawResult, QuoteExactInputSingleResult, QuoteExactOutputRawResult, QuoteExactOutputResult, QuoteExactOutputSingle, QuoteExactOutputSingleRawResult, QuoteExactOutputSingleResult, QuotePathParams, QuoteExactOutputArgs, QuoteExactInputSingleArgs, QuoteExactInputArgs, QuoteExactOutputSingleArgs } from "@/types";

import quoterV2 from '@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json' with { type: 'json' }
import { isSameAddress, isTokenETH } from "./tokens_utils";

const quoterV2Abi = quoterV2.abi;


const publicClient = createPublicClient({
    chain: CURRENT_CHAIN,
    transport: http(RPC_URL),
})

const QUOTER_CALL_GAS = 30_000_000n;
const QUOTER_CALL_GAS_FALLBACK = 50_000_000n;




/* ############## */
/* READ FUNCTIONS */
/* ############## */


// quoteExactInput - Single

export async function quoteExactInputSingle(tokenIn: Token, tokenOut: Token, amountIn: bigint, feeTier: string): Promise<QuoteExactInputSingleResult> {
    if (isTokenETH(tokenIn.id)) throw new Error("Cannot swap ETH. Need WETH");
    if (isTokenETH(tokenOut.id)) throw new Error("Cannot swap ETH. Need WETH");

    const args: QuoteExactInputSingleArgs = [
        {
            tokenIn: tokenIn.id,
            tokenOut: tokenOut.id,
            amountIn,
            fee: BigInt(feeTier),
            sqrtPriceLimitX96: 0n,
        }
    ]

    try {
        const data = encodeFunctionData({
            abi: quoterV2Abi,
            functionName: 'quoteExactInputSingle',
            args,
        });

        const call = async (gas: bigint): Promise<QuoteExactInputSingleRawResult> => {
            const res = await publicClient.call({
                to: QUOTER_V2_ADDRESS,
                data,
                gas,
            });

            return decodeFunctionResult({
                abi: quoterV2Abi,
                functionName: 'quoteExactInputSingle',
                data: res.data,
            }) as QuoteExactInputSingleRawResult;
        };

        const result: QuoteExactInputSingleRawResult = await call(QUOTER_CALL_GAS).catch(async () => call(QUOTER_CALL_GAS_FALLBACK));

        //console.log(`[quoteExactInputSingle] Quotation ExactInputSingle AmountOut [fee ${feeTier}]: ${result[0].toString()} = ${formatUnits(result[0], tokenOut.decimals)}`);

        return {
            amountOut: result[0],
            sqrtPriceX96After: result[1],
            initializedTicksCrossed: result[2],
            gasEstimate: result[3],
        }

    } catch (error) {
        //console.error("[quoteExactInputSingle] Error in quoteExactInputSingle:", error);
        throw error;
    }
}


// quoteExactInput - Multiple

export async function quoteExactInput(path: QuotePathParams, amountIn: bigint): Promise<QuoteExactInputResult> {
    // Verify that the path has at least one segment
    if (!path || path.length === 0) {
        throw new Error("Path cannot be empty");
    }

    // Verify that the tokens are properly chained.
    for (let i = 0; i < path.length - 1; i++) {
        if (!isSameAddress(path[i].tokenOut, path[i + 1].tokenIn)) {
            throw new Error(`Path mismatch: ${path[i].tokenOut} != ${path[i + 1].tokenIn}`);
        }
    }

    const encodedPath = encodeUniswapPath(path);
    //console.log('[quoteExactInput] encodedPath:', encodedPath)

    const args: QuoteExactInputArgs = [
        encodedPath as Hex,
        amountIn,
    ]

    try {
        const data = encodeFunctionData({
            abi: quoterV2Abi,
            functionName: 'quoteExactInput',
            args,
        });

        const call = async (gas: bigint): Promise<QuoteExactInputRawResult> => {
            const res = await publicClient.call({
                to: QUOTER_V2_ADDRESS,
                data,
                gas,
            });

            return decodeFunctionResult({
                abi: quoterV2Abi,
                functionName: 'quoteExactInput',
                data: res.data,
            }) as QuoteExactInputRawResult;
        };

        const result: QuoteExactInputRawResult = await call(QUOTER_CALL_GAS).catch(async () => call(QUOTER_CALL_GAS_FALLBACK));

        //console.log(`[quoteExactInput] Quotation ExactInput AmountOut: ${result[0].toString()}`);

        return {
            amountOut: result[0],
            sqrtPriceX96AfterList: result[1],
            initializedTicksCrossedList: result[2],
            gasEstimate: result[3]
        };

    } catch (error) {
        //console.error("[quoteExactInput] Error in quoteExactInput:", error);
        throw error;
    }
}



// quoteExactOutput - Single

export async function quoteExactOutputSingle(tokenIn: Token, tokenOut: Token, amountOut: bigint, feeTier: string): Promise<QuoteExactOutputSingleResult> {
    if (isTokenETH(tokenIn.id)) throw new Error("Cannot swap ETH. Need WETH");
    if (isTokenETH(tokenOut.id)) throw new Error("Cannot swap ETH. Need WETH");

    const args: QuoteExactOutputSingleArgs = [
        {
            tokenIn: tokenIn.id,
            tokenOut: tokenOut.id,
            amount: amountOut,
            fee: BigInt(feeTier),
            sqrtPriceLimitX96: 0n,
        }
    ];

    try {
        const data = encodeFunctionData({
            abi: quoterV2Abi,
            functionName: 'quoteExactOutputSingle',
            args,
        });

        const call = async (gas: bigint): Promise<QuoteExactOutputSingleRawResult> => {
            const res = await publicClient.call({
                to: QUOTER_V2_ADDRESS,
                data,
                gas,
            });

            return decodeFunctionResult({
                abi: quoterV2Abi,
                functionName: 'quoteExactOutputSingle',
                data: res.data,
            }) as QuoteExactOutputSingleRawResult;
        };

        const result: QuoteExactOutputSingleRawResult = await call(QUOTER_CALL_GAS).catch(async () => call(QUOTER_CALL_GAS_FALLBACK));

        //console.log(`[quoteExactOutputSingle] Quotation ExactOutputSingle AmountOut [fee ${feeTier}]: ${result[0].toString()} = ${formatUnits(result[0], tokenOut.decimals)}`);

        return {
            amountIn: result[0],
            sqrtPriceX96After: result[1],
            initializedTicksCrossed: result[2],
            gasEstimate: result[3],
        }

    } catch (error) {
        //console.error("[quoteExactOutputSingle] Error in quoteExactOutputSingle:", error);
        throw error;
    }
}


// quoteExactOutput - Multiple

export async function quoteExactOutput(path: QuotePathParams, amountOut: bigint): Promise<QuoteExactOutputResult> {
    // Vérifier que le path a au moins un segment
    if (!path || path.length === 0) {
        throw new Error("Path cannot be empty");
    }

    // Verify that the tokens are properly chained.
    for (let i = 0; i < path.length - 1; i++) {
        if (!isSameAddress(path[i].tokenOut, path[i + 1].tokenIn)) {
            throw new Error(`Path mismatch: ${path[i].tokenOut} != ${path[i + 1].tokenIn}`);
        }
    }

    const encodedPath = encodeUniswapReversePath(path);
    //console.log('[quoteExactOutput] encodedPath:', encodedPath)

    const args: QuoteExactOutputArgs = [
        encodedPath as Hex,
        amountOut,
    ]


//    try {
//        const result = await publicClient.readContract({
//            address: QUOTER_V2_ADDRESS,
//            abi: quoterV2Abi,
//            functionName: 'quoteExactOutput',
//            args,
//            authorizationList: undefined,
//        }) as QuoteExactOutputRawResult;
//
//        console.log(`[quoteExactOutput] Quotation ExactOutput AmountIn: ${result[0].toString()}`);
//
//        return {
//            amountIn: result[0],
//            sqrtPriceX96AfterList: result[1],
//            initializedTicksCrossedList: result[2],
//            gasEstimate: result[3]
//        };
//
//    } catch (error) {
//        console.error("[quoteExactOutput] Error in quoteExactOutput:", error);
//        throw error;
//    }


    try {
        const data = encodeFunctionData({
            abi: quoterV2Abi,
            functionName: 'quoteExactOutput',
            args,
        });

        const call = async (gas: bigint): Promise<QuoteExactOutputRawResult> => {
            const res = await publicClient.call({
                to: QUOTER_V2_ADDRESS,
                data,
                gas,
            });

            return decodeFunctionResult({
                abi: quoterV2Abi,
                functionName: 'quoteExactOutput',
                data: res.data,
            }) as QuoteExactOutputRawResult;
        };

        const result: QuoteExactOutputRawResult = await call(QUOTER_CALL_GAS).catch(async () => call(QUOTER_CALL_GAS_FALLBACK));

        // ERROR => volatile data access out of gas: VolatileDataAccess(TIMESTAMP), limit: 20000000, actual: 20000003

        //console.log(`[quoteExactOutput] Quotation ExactOutput AmountOut: ${result[0].toString()}`);

        return {
            amountIn: result[0],
            sqrtPriceX96AfterList: result[1],
            initializedTicksCrossedList: result[2],
            gasEstimate: result[3],
        };

    } catch (error) {
        //console.error("[quoteExactOutput] Error in quoteExactOutput:", error);
        throw error;
    }

}

