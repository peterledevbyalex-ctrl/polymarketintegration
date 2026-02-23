
import { WalletClient, TransactionReceipt, createPublicClient, http, formatUnits, parseUnits, Address } from "viem";

import * as apiBlockchain from '@/lib/api_blockchain';
//import * as apiBlockchainTokens from "./api_blockchain_tokens";

import { CURRENT_CHAIN, RPC_URL, POOL_FACTORY_CONTRACT_ADDRESS, POSITION_MANAGER_ADDRESS } from "@/config.app";

import { LiquidityMintParams, LiquidityDecreaseParams, CollectParams, LiquidityIncreaseParams, SubgraphPosition } from "@/types";
import { PositionRawResult, PositionResult, TicksRawResult, TicksResult } from "@/types/pools.types";

//import { abi as factoryV3Abi } from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json' with { type: 'json' }
//import { abi as poolV3Abi } from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json' with { type: 'json' }
//import { abi as positionV3Abi } from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json' with { type: 'json' }

import factoryV3 from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json' with { type: 'json' }
import poolV3 from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json' with { type: 'json' }
import positionV3 from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json' with { type: 'json' }

const factoryV3Abi = factoryV3.abi;
const poolV3Abi = poolV3.abi;
const positionV3Abi = positionV3.abi;


const publicClient = createPublicClient({
    chain: CURRENT_CHAIN,
    transport: http(RPC_URL),
})


function pow10(decimals: number): bigint {
    if (decimals <= 0) return 1n;
    return 10n ** BigInt(decimals);
}


function getPriceFromSqrtPriceX96(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
    // price = (sqrtPriceX96^2 / 2^192) * 10^(decimals0 - decimals1)
    // Use fixed-point scaling to preserve precision.
    const q192 = 1n << 192n;
    const scale = 10n ** 18n;

    const sqrt = BigInt(sqrtPriceX96);
    const ratioX192 = sqrt * sqrt;

    const baseNumerator = ratioX192 * pow10(decimals0);
    const baseDenominator = q192 * pow10(decimals1);

    if (baseDenominator === 0n) return 0;

    const priceScaled = (baseNumerator * scale) / baseDenominator;
    return Number(priceScaled) / 1e18;
}



/* ############## */
/* READ FUNCTIONS */
/* ############## */


export async function getPoolAddress(tokenIn: `0x${string}`, tokenOut: `0x${string}`, fee: string): Promise<`0x${string}` | null> {
    const poolAddress = await publicClient.readContract({
        address: POOL_FACTORY_CONTRACT_ADDRESS,
        abi: factoryV3Abi,
        functionName: 'getPool',
        args: [tokenIn, tokenOut, fee],
        authorizationList: undefined,
    }) as `0x${string}`;

    if (poolAddress === '0x0000000000000000000000000000000000000000') {
        return null;
    }

    return poolAddress;
}



export async function getPoolSlot0(poolAddress: `0x${string}`): Promise<[sqrtPriceX96: any, tick: any, observationIndex: any, observationCardinality: any, observationCardinalityNext: any, feeProtocol: any, unlocked: any]> {
    const slot0 = await publicClient.readContract({
        address: poolAddress,
        abi: poolV3Abi,
        functionName: 'slot0',
        authorizationList: undefined,
    }) as any;

    return slot0;
}


export async function getPoolToken0(poolAddress: `0x${string}`): Promise<`0x${string}`> {
    const token0 = await publicClient.readContract({
        address: poolAddress,
        abi: poolV3Abi,
        functionName: 'token0',
        authorizationList: undefined,
    }) as any;

    return token0;
}


export async function getPoolToken1(poolAddress: `0x${string}`): Promise<`0x${string}`> {
    const token1 = await publicClient.readContract({
        address: poolAddress,
        abi: poolV3Abi,
        functionName: 'token1',
        authorizationList: undefined,
    }) as any;

    return token1;
}


export async function getPoolTickSpacing(poolAddress: `0x${string}`): Promise<bigint> {
    const tickSpacing = await publicClient.readContract({
        address: poolAddress,
        abi: poolV3Abi,
        functionName: 'tickSpacing',
        authorizationList: undefined,
    }) as any;

    return tickSpacing;
}



export async function getPoolLiquidityAddAmount0(poolAddress: `0x${string}`, amount1Desired: string, decimals0: number, decimals1: number, sqrtPrice = 0n) {
    // Appeler slot0() sur le contrat de la pool pour avoir sqrtPriceX96

    if (!sqrtPrice) {
        const slot0 = await getPoolSlot0(poolAddress);
        sqrtPrice = slot0[0];
    }

    const price = getPriceFromSqrtPriceX96(sqrtPrice, decimals0, decimals1);
    const amount0Desired = Number(amount1Desired) / price; // division

    return amount0Desired;
}


export async function getPoolLiquidityAddAmount1(poolAddress: `0x${string}`, amount0Desired: string, decimals0: number, decimals1: number, sqrtPrice = 0n) {
    // Appeler slot0() sur le contrat de la pool pour avoir sqrtPriceX96

    if (!sqrtPrice) {
        const slot0 = await getPoolSlot0(poolAddress);
        sqrtPrice = slot0[0];
    }

    const price = getPriceFromSqrtPriceX96(sqrtPrice, decimals0, decimals1);
    const amount1Desired = Number(amount0Desired) * price; // multiplication

    return amount1Desired.toString();
}


export async function getPoolLiquidityAddAmount0_OnPosition(position: SubgraphPosition, amount1: string) {
    const currentAmount0 = Number(position.depositedToken0) - Number(position.withdrawnToken0) - Number(position.collectedFeesToken0)
    const currentAmount1 = Number(position.depositedToken1) - Number(position.withdrawnToken1) - Number(position.collectedFeesToken1)
    const ratio = Number(currentAmount1) / Number(currentAmount0);

    // Quand user entre amount1
    const amount0 = Number(amount1) / ratio;
    return amount0;
}


export async function getPoolLiquidityAddAmount1_OnPosition(position: SubgraphPosition, amount0: string) {
    const currentAmount0 = Number(position.depositedToken0) - Number(position.withdrawnToken0) - Number(position.collectedFeesToken0)
    const currentAmount1 = Number(position.depositedToken1) - Number(position.withdrawnToken1) - Number(position.collectedFeesToken1)
    const ratio = Number(currentAmount1) / Number(currentAmount0);

    // Quand user entre amount0
    const amount1 = Number(amount0) * ratio;
    return amount1;
}


export async function getPoolLiquidityAddAmount0_Beta(
    poolAddress: `0x${string}`,
    amount1Desired: string,
    tickLower: number,
    tickUpper: number,
    decimals0: number,
    decimals1: number
) {
    const slot0 = await getPoolSlot0(poolAddress);
    const sqrtPriceX96 = slot0[0];

    // Convertir les ticks en sqrtPrice
    const sqrtPriceLowerX96 = BigInt(Math.floor(Math.sqrt(1.0001 ** tickLower) * 2 ** 96));
    const sqrtPriceUpperX96 = BigInt(Math.floor(Math.sqrt(1.0001 ** tickUpper) * 2 ** 96));

    // Convertir amount1Desired en bigint
    const amount1DesiredBigInt = parseUnits(amount1Desired, decimals1);

    // Calculer la liquidité à partir de amount1
    let liquidity: bigint;

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        // Prix en dessous de la range -> 100% token0, pas besoin de token1
        return "0";

    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        // Prix au-dessus de la range -> 100% token1
        //liquidity = (amount1DesiredBigInt * BigInt(2 ** 96)) / (sqrtPriceUpperX96 - sqrtPriceLowerX96);

        // L = amount1 / (sqrtPriceUpper - sqrtPriceLower)
        liquidity = (amount1DesiredBigInt << 96n) / (sqrtPriceUpperX96 - sqrtPriceLowerX96);

    } else {
        // Prix dans la range -> mix des deux tokens
        //liquidity = (amount1DesiredBigInt * BigInt(2 ** 96)) / (sqrtPriceX96 - sqrtPriceLowerX96);

        // L = amount1 / (sqrtPrice - sqrtPriceLower)
        liquidity = (amount1DesiredBigInt << 96n) / (sqrtPriceX96 - sqrtPriceLowerX96);
    }

    // Calculer amount0 à partir de la liquidité
    let amount0: bigint;

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        // Prix en dessous de la range -> 100% token0
        //amount0 = (liquidity * (sqrtPriceUpperX96 - sqrtPriceLowerX96)) / (sqrtPriceUpperX96 * sqrtPriceLowerX96 / BigInt(2 ** 96));

        // amount0 = L * (sqrtPriceUpper - sqrtPriceLower) / (sqrtPriceUpper * sqrtPriceLower)
        amount0 = (liquidity * (sqrtPriceUpperX96 - sqrtPriceLowerX96)) / sqrtPriceLowerX96;
        amount0 = (amount0 << 96n) / sqrtPriceUpperX96;

    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        // Prix au-dessus de la range -> pas besoin de token0
        amount0 = 0n;

    } else {
        // Prix dans la range
        //amount0 = (liquidity * (sqrtPriceX96 - sqrtPriceLowerX96)) / (sqrtPriceX96 * sqrtPriceLowerX96 / BigInt(2 ** 96));

        // amount0 = L * (sqrtPrice - sqrtPriceLower) / (sqrtPrice * sqrtPriceLower)
        amount0 = (liquidity * (sqrtPriceX96 - sqrtPriceLowerX96)) / sqrtPriceLowerX96;
        amount0 = (amount0 << 96n) / sqrtPriceX96;
    }

    return formatUnits(amount0, decimals0);
}


export async function getPoolLiquidityAddAmount1_Beta(
    poolAddress: `0x${string}`,
    amount0Desired: string,
    tickLower: number,
    tickUpper: number,
    decimals0: number,
    decimals1: number
) {
    const slot0 = await getPoolSlot0(poolAddress);
    const sqrtPriceX96 = slot0[0];

    // Convertir les ticks en sqrtPrice
    const sqrtPriceLowerX96 = BigInt(Math.floor(Math.sqrt(1.0001 ** tickLower) * 2 ** 96));
    const sqrtPriceUpperX96 = BigInt(Math.floor(Math.sqrt(1.0001 ** tickUpper) * 2 ** 96));

    // Convertir amount0Desired en bigint
    const amount0DesiredBigInt = parseUnits(amount0Desired, decimals0);

    // Calculer la liquidité à partir de amount0
    let liquidity: bigint;

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        // Prix en dessous de la range -> 100% token0

        //// L = amount0 * (sqrtPriceUpper * sqrtPriceLower) / (sqrtPriceUpper - sqrtPriceLower)
        //const numerator = (amount0DesiredBigInt * sqrtPriceUpperX96 * sqrtPriceLowerX96);
        //const denominator = (sqrtPriceUpperX96 - sqrtPriceLowerX96) << 96n;
        //liquidity = numerator / denominator;

        // L = Δx * (sqrt(Pu) * sqrt(Pl)) / (sqrt(Pu) - sqrt(Pl))
        liquidity = mulDiv(
            amount0DesiredBigInt,
            mulDiv(sqrtPriceUpperX96, sqrtPriceLowerX96, 1n << 96n),
            sqrtPriceUpperX96 - sqrtPriceLowerX96
        );

    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        // Prix au-dessus de la range -> pas besoin de token0
        return "0";

    } else {
        // Prix dans la range

        //// L = amount0 * (sqrtPrice * sqrtPriceLower) / (sqrtPrice - sqrtPriceLower)
        //const numerator = (amount0DesiredBigInt * sqrtPriceX96 * sqrtPriceLowerX96);
        //const denominator = (sqrtPriceX96 - sqrtPriceLowerX96) << 96n;
        //liquidity = numerator / denominator;

        // L = Δx * (sqrt(P) * sqrt(Pl)) / (sqrt(P) - sqrt(Pl))
        liquidity = mulDiv(
            amount0DesiredBigInt,
            mulDiv(sqrtPriceX96, sqrtPriceLowerX96, 1n << 96n),
            sqrtPriceX96 - sqrtPriceLowerX96
        );
    }


    // Calculer amount1 à partir de la liquidité
    let amount1: bigint;

    if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        // Prix en dessous de la range -> pas besoin de token1
        amount1 = 0n;

    } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        // Prix au-dessus de la range -> 100% token1

        //// amount1 = L * (sqrtPriceUpper - sqrtPriceLower)
        //amount1 = (liquidity * (sqrtPriceUpperX96 - sqrtPriceLowerX96)) >> 96n;

        // Δy = L * (sqrt(Pu) - sqrt(Pl))
        amount1 = mulDiv(liquidity, sqrtPriceUpperX96 - sqrtPriceLowerX96, 1n << 96n);

    } else {
        // Prix dans la range

        //// amount1 = L * (sqrtPrice - sqrtPriceLower)
        //amount1 = (liquidity * (sqrtPriceX96 - sqrtPriceLowerX96)) >> 96n;

        // Δy = L * (sqrt(P) - sqrt(Pl))
        amount1 = mulDiv(liquidity, sqrtPriceX96 - sqrtPriceLowerX96, 1n << 96n);
    }

    return formatUnits(amount1, decimals1);
}



export async function fetchPosition(tokenId: number | string | bigint): Promise<PositionResult> {
    // Récupérer les détails de la position
    const position = await publicClient.readContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionV3Abi,
        functionName: 'positions',
        args: [BigInt(tokenId)],
        authorizationList: undefined,
    }) as PositionRawResult;

    // position retourne un tuple: [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowth0, feeGrowth1, tokensOwed0, tokensOwed1]
    const [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowth0, feeGrowth1, tokensOwed0, tokensOwed1] = position;

    const result: PositionResult = {
        tokenId: BigInt(tokenId),
        nonce,
        operator,
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        liquidity,
        feeGrowth0,
        feeGrowth1,
        tokensOwed0,
        tokensOwed1,
    };

    return result;
}



export async function getPoolTicks(poolAddress: Address, tick: number): Promise<TicksResult> {
    const result = await publicClient.readContract({
        address: poolAddress,
        abi: poolV3Abi,
        functionName: 'ticks',
        args: [tick],
        authorizationList: undefined,
    }) as TicksRawResult;

    const ticks: TicksResult = {
        liquidityGross: result[0],
        liquidityNet: result[1],
        feeGrowthOutside0X128: result[2],
        feeGrowthOutside1X128: result[3],
        tickCumulativeOutside: result[4],
        secondsPerLiquidityOutsideX128: result[5],
        secondsOutside: result[6],
        initialized: result[7],
    };

    return ticks;
};



/* ############### */
/* WRITE FUNCTIONS */
/* ############### */




export async function createPool(walletClient: WalletClient, token0: `0x${string}`, token1: `0x${string}`, fee: string): Promise<TransactionReceipt> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);
    //console.log('userAddress:', userAddress)
    //console.log('CURRENT_CHAIN:', CURRENT_CHAIN)

    const params = {
        address: POOL_FACTORY_CONTRACT_ADDRESS.toLowerCase() as `0x${string}`,
        abi: factoryV3Abi,
        functionName: 'createPool',
        args: [token0.toLowerCase() as `0x${string}`, token1.toLowerCase() as `0x${string}`, fee],
        account: userAddress,
        chain: CURRENT_CHAIN,
    };

    //console.log('params:', params)

    //const { request } = await publicClient.simulateContract(params); // Error: The contract function "createPool" reverted.
    const request = params;

    const hash = await walletClient.writeContract(request);
    //console.log('Transaction hash:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('Pool created successfully');

    return receipt;
}


export async function initializePool(walletClient: WalletClient, poolAddress: `0x${string}`, sqrtPriceX96: bigint): Promise<TransactionReceipt> {
    //console.log('Initialize Pool');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const params = {
        address: poolAddress,
        abi: poolV3Abi,
        functionName: 'initialize',
        args: [sqrtPriceX96],
        account: userAddress,
        chain: CURRENT_CHAIN,
    }

    const { request } = await publicClient.simulateContract(params);

    //console.log('Simulation successful:', request);

    const hash = await walletClient.writeContract(request);
    //console.log('🔗 Initialization transaction hash:', hash);

    // Attendre la confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('✅ Pool initialized successfully!');
    //console.log('📄 Receipt:', receipt);

    return receipt
}




export type SimulatedMintResult = {
    amount0: bigint;
    amount1: bigint;
}

export async function simulateMintPoolLiquidity(walletClient: WalletClient, mintParams: LiquidityMintParams): Promise<SimulatedMintResult> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const simulation = await publicClient.simulateContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: positionV3Abi,
        functionName: 'mint',
        args: [mintParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const result = simulation.result as unknown as [tokenId: bigint, liquidity: bigint, amount0: bigint, amount1: bigint];
    return {
        amount0: result[2],
        amount1: result[3],
    };
}


export async function mintPoolLiquidity(walletClient: WalletClient, mintParams: LiquidityMintParams): Promise<TransactionReceipt> {
    //console.log('Mint parameters:', mintParams);

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const { request } = await publicClient.simulateContract({
        address: POSITION_MANAGER_ADDRESS as `0x${string}`,
        abi: positionV3Abi,
        functionName: 'mint',
        args: [mintParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const hash = await walletClient.writeContract(request);
    //console.log('🔗 Liquidity transaction hash:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('📄 Receipt:', receipt);

    if (receipt.status === 'success') {
        //console.log('✅ Liquidity added successfully!');
        //console.log('🎉 Position created successfully!');

    } else {
        //console.log('❌ Reverted!');
    }

    return receipt;
}


export type SimulatedIncreaseResult = {
    amount0: bigint;
    amount1: bigint;
}

export async function simulateIncreasePoolLiquidity(walletClient: WalletClient, increaseParams: LiquidityIncreaseParams): Promise<SimulatedIncreaseResult> {
    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const simulation = await publicClient.simulateContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionV3Abi,
        functionName: 'increaseLiquidity',
        args: [increaseParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const result = simulation.result as unknown as [liquidity: bigint, amount0: bigint, amount1: bigint];
    return {
        amount0: result[1],
        amount1: result[2],
    };
}


export async function increasePoolLiquidity(walletClient: WalletClient, increaseParams: LiquidityIncreaseParams): Promise<TransactionReceipt> {
    //console.log('Increase liquidity parameters:', increaseParams);

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const { request } = await publicClient.simulateContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionV3Abi,
        functionName: 'increaseLiquidity',
        args: [increaseParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const increaseHash = await walletClient.writeContract(request);
    //console.log('🔗 Increase liquidity transaction hash:', increaseHash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: increaseHash });
    //console.log('✅ Liquidity increased successfully!');

    return receipt;
}


export async function decreasePoolLiquidity(walletClient: WalletClient, decreaseParams: LiquidityDecreaseParams): Promise<TransactionReceipt> {
    //console.log('Decrease liquidity parameters:', decreaseParams);

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const { request } = await publicClient.simulateContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionV3Abi,
        functionName: 'decreaseLiquidity',
        args: [decreaseParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const decreaseHash = await walletClient.writeContract(request);
    //console.log('🔗 Decrease liquidity transaction hash:', decreaseHash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: decreaseHash });
    //console.log('✅ Liquidity decreased successfully!');

    return receipt;
}


export async function burnPosition(walletClient: WalletClient, tokenId: string): Promise<TransactionReceipt> {
    //console.log('🔥 Burning NFT position...');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    const { request: burnRequest } = await publicClient.simulateContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionV3Abi,
        functionName: 'burn',
        args: [BigInt(tokenId)],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const hash = await walletClient.writeContract(burnRequest);
    //console.log('🔗 Burn transaction hash:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('✅ NFT position burned successfully!');

    return receipt;
}


export async function collectPositionFees(walletClient: WalletClient, tokenId: string, collectParams: CollectParams): Promise<TransactionReceipt> {
    //console.log('💰 Collecting fees from position...');

    const userAddress = await apiBlockchain.getWalletAddress(walletClient);

    //console.log('Collecting fees for position:', tokenId);

    const { request } = await publicClient.simulateContract({
        address: POSITION_MANAGER_ADDRESS,
        abi: positionV3Abi,
        functionName: 'collect',
        args: [collectParams],
        account: userAddress,
        chain: CURRENT_CHAIN,
    });

    const hash = await walletClient.writeContract(request);
    //console.log('🔗 Collect fees transaction hash:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    //console.log('✅ Fees collected successfully!');

    return receipt;
}



function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
    return (a * b) / denominator;
}
