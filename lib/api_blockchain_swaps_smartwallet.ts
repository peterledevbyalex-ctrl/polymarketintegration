/**
 * Smart Wallet Atomic Swaps
 * 
 * Provides zero-risk atomic swaps using ZeroDev smart wallet.
 * All operations (transferFrom + approve + swap) happen in a single UserOp.
 * If any step fails, the entire operation reverts - tokens stay in EOA.
 */

import { Address, encodeFunctionData, encodePacked, erc20Abi, Hex, maxUint256, createPublicClient, http } from 'viem';
import { SELECTIVE_TAX_ROUTER_ADDRESS, SWAP_ROUTER_ADDRESS, WETH_ADDRESS, ETH_ADDRESS, CURRENT_CHAIN, RPC_URL } from '@/config.app';

// Define locally to avoid circular import
export interface SmartWalletCall {
    to: Address;
    value?: bigint;
    data: Hex;
}

import SelectiveTaxRouterArtifact from '@/../SelectiveTaxRouterAudited/SelectiveTaxRouter.json';

// SwapRouter02 ABI for exactInputSingle and exactInput (multi-hop)
const SWAP_ROUTER_ABI = [
    {
        name: 'exactInputSingle',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' }
                ]
            }
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }]
    },
    {
        name: 'exactInput',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'path', type: 'bytes' },
                    { name: 'recipient', type: 'address' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' }
                ]
            }
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }]
    }
] as const;

// WETH ABI for deposit/withdraw
const WETH_ABI = [
    {
        name: 'deposit',
        type: 'function',
        stateMutability: 'payable',
        inputs: [],
        outputs: []
    },
    {
        name: 'withdraw',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'wad', type: 'uint256' }],
        outputs: []
    }
] as const;

// SwapRouter02 has unwrapWETH9 which unwraps and sends ETH to recipient
const SWAP_ROUTER_UNWRAP_ABI = [
    {
        name: 'unwrapWETH9',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
            { name: 'amountMinimum', type: 'uint256' },
            { name: 'recipient', type: 'address' }
        ],
        outputs: []
    }
] as const;

export interface AtomicSwapParams {
    eoaAddress: Address;
    smartWalletAddress: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    fee: number;
    useTaxRouter?: boolean;
}

/**
 * Build atomic swap calls for Token → Token
 * 
 * Flow (all in 1 UserOp):
 * 1. transferFrom: Pull tokens from EOA to smart wallet
 * 2. approve: Smart wallet approves router
 * 3. swap: Execute swap, output goes to EOA
 * 
 * If any step fails, ALL revert - tokens stay in EOA
 */
export function buildAtomicTokenSwapCalls(params: AtomicSwapParams): SmartWalletCall[] {
    const {
        eoaAddress,
        smartWalletAddress,
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMinimum,
        fee,
        useTaxRouter = false,
    } = params;

    const routerAddress = useTaxRouter ? SELECTIVE_TAX_ROUTER_ADDRESS : SWAP_ROUTER_ADDRESS;
    const calls: SmartWalletCall[] = [];

    // 1. Pull tokens from EOA to smart wallet
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transferFrom',
            args: [eoaAddress, smartWalletAddress, amountIn],
        }),
    });

    // 2. Approve router to spend tokens
    // Some tokens require resetting allowance to 0 before changing it (USDT-style)
    if (useTaxRouter) {
        calls.push({
            to: tokenIn,
            data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [routerAddress, 0n],
            }),
        });
    }
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, useTaxRouter ? maxUint256 : amountIn],
        }),
    });

    // 3. Execute swap
    if (useTaxRouter) {
        // TaxRouter has deadline field
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SelectiveTaxRouterArtifact.abi as any,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn,
                    tokenOut,
                    fee,
                    recipient: eoaAddress, // Output goes directly to EOA
                    deadline,
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });
    } else {
        // SwapRouter02
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn,
                    tokenOut,
                    fee,
                    recipient: eoaAddress,
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });
    }

    return calls;
}

/**
 * Build atomic swap calls for Token → ETH
 * 
 * Flow (all in 1 UserOp):
 * 1. transferFrom: Pull tokens from EOA to smart wallet
 * 2. approve: Smart wallet approves router
 * 3. swap: Token → WETH (output to ROUTER for unwrap)
 * 4. unwrapWETH9: Router unwraps and sends ETH to EOA
 */
export function buildAtomicTokenToEthSwapCalls(params: AtomicSwapParams): SmartWalletCall[] {
    const {
        eoaAddress,
        smartWalletAddress,
        tokenIn,
        amountIn,
        amountOutMinimum,
        fee,
        useTaxRouter = false,
    } = params;

    const routerAddress = useTaxRouter ? SELECTIVE_TAX_ROUTER_ADDRESS : SWAP_ROUTER_ADDRESS;
    const calls: SmartWalletCall[] = [];

    // 1. Pull tokens from EOA to smart wallet
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transferFrom',
            args: [eoaAddress, smartWalletAddress, amountIn],
        }),
    });

    // 2. Approve router to spend tokens
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, maxUint256],
        }),
    });

    // 3. Execute swap
    if (useTaxRouter) {
        // Tax router does NOT support SwapRouter's special recipient (address(2)) + unwrap flow.
        // So we receive WETH in the smart wallet, then unwrap + transfer ETH ourselves.
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SelectiveTaxRouterArtifact.abi as any,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn,
                    tokenOut: WETH_ADDRESS,
                    fee,
                    recipient: smartWalletAddress, // Smart wallet receives WETH
                    deadline,
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });

        // 4. Unwrap WETH to ETH (in smart wallet)
        calls.push({
            to: WETH_ADDRESS,
            data: encodeFunctionData({
                abi: WETH_ABI,
                functionName: 'withdraw',
                args: [amountOutMinimum],
            }),
        });

        // 5. Transfer ETH to EOA
        calls.push({
            to: eoaAddress,
            value: amountOutMinimum,
            data: '0x',
        });

    } else {
        // SwapRouter02 supports address(2) recipient + unwrapWETH9.
        const ROUTER_RECIPIENT = '0x0000000000000000000000000000000000000002' as Address;
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn,
                    tokenOut: WETH_ADDRESS,
                    fee,
                    recipient: ROUTER_RECIPIENT, // Router holds WETH for unwrap
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });

        // 4. Unwrap WETH and send ETH to EOA
        calls.push({
            to: SWAP_ROUTER_ADDRESS,
            data: encodeFunctionData({
                abi: SWAP_ROUTER_UNWRAP_ABI,
                functionName: 'unwrapWETH9',
                args: [amountOutMinimum, eoaAddress],
            }),
        });
    }

    return calls;
}

/**
 * Build atomic swap calls for Token → WETH (simpler than Token → ETH)
 * WETH goes directly to EOA - no unwrap needed
 */
export function buildAtomicTokenToWethSwapCalls(params: AtomicSwapParams): SmartWalletCall[] {
    const {
        eoaAddress,
        smartWalletAddress,
        tokenIn,
        amountIn,
        amountOutMinimum,
        fee,
        useTaxRouter = false,
    } = params;

    const routerAddress = useTaxRouter ? SELECTIVE_TAX_ROUTER_ADDRESS : SWAP_ROUTER_ADDRESS;
    const calls: SmartWalletCall[] = [];

    // 1. Pull tokens from EOA to smart wallet
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transferFrom',
            args: [eoaAddress, smartWalletAddress, amountIn],
        }),
    });

    // 2. Approve router to spend tokens
    // Some tokens require resetting allowance to 0 before changing it (USDT-style)
    if (useTaxRouter) {
        calls.push({
            to: tokenIn,
            data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [routerAddress, 0n],
            }),
        });
    }
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, useTaxRouter ? maxUint256 : amountIn],
        }),
    });

    // 3. Execute swap - WETH goes directly to EOA
    if (useTaxRouter) {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SelectiveTaxRouterArtifact.abi as any,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn,
                    tokenOut: WETH_ADDRESS,
                    fee,
                    recipient: eoaAddress, // WETH directly to EOA
                    deadline,
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });
    } else {
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn,
                    tokenOut: WETH_ADDRESS,
                    fee,
                    recipient: eoaAddress, // WETH directly to EOA
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });
    }

    return calls;
}

/**
 * Build approval call for smart wallet to pull tokens from EOA
 * This is a ONE-TIME approval per token
 */
export function buildSmartWalletApprovalCall(
    tokenAddress: Address,
    smartWalletAddress: Address
): { to: Address; data: Hex } {
    return {
        to: tokenAddress,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [smartWalletAddress, maxUint256],
        }),
    };
}

/**
 * Check if EOA has approved smart wallet to spend tokens
 */
export async function checkSmartWalletApproval(
    tokenAddress: Address,
    eoaAddress: Address,
    smartWalletAddress: Address,
    requiredAmount?: bigint,
): Promise<boolean> {
    const publicClient = createPublicClient({
        chain: CURRENT_CHAIN,
        transport: http(RPC_URL),
    });

    const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [eoaAddress, smartWalletAddress],
    } as any);

    const allowanceBn = allowance as bigint;
    if (requiredAmount !== undefined) {
        return allowanceBn >= requiredAmount;
    }

    return allowanceBn > 0n;
}

// ==================== MULTI-HOP SWAPS ====================

export interface PathSegment {
    tokenIn: Address;
    tokenOut: Address;
    fee: number;
}

export interface AtomicMultiHopSwapParams {
    eoaAddress: Address;
    smartWalletAddress: Address;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    path: PathSegment[];
    useTaxRouter?: boolean;
}

/**
 * Encode multi-hop path for exactInput
 * Format: tokenIn, fee, tokenMid, fee, tokenOut (packed bytes)
 */
function encodeMultiHopPath(segments: PathSegment[]): Hex {
    const pathTypes: string[] = [];
    const pathValues: (Address | bigint)[] = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        if (i === 0) {
            pathTypes.push('address');
            pathValues.push(segment.tokenIn);
        }

        pathTypes.push('uint24');
        pathValues.push(BigInt(segment.fee));

        pathTypes.push('address');
        pathValues.push(segment.tokenOut);
    }

    return encodePacked(pathTypes as any, pathValues as any);
}

/**
 * Build atomic multi-hop swap calls for Token → Token (via intermediate tokens)
 * 
 * Flow (all in 1 UserOp):
 * 1. transferFrom: Pull tokens from EOA to smart wallet
 * 2. approve: Smart wallet approves router
 * 3. exactInput: Execute multi-hop swap, output goes to EOA
 */
export function buildAtomicMultiHopSwapCalls(params: AtomicMultiHopSwapParams): SmartWalletCall[] {
    const {
        eoaAddress,
        smartWalletAddress,
        tokenIn,
        amountIn,
        amountOutMinimum,
        path,
        useTaxRouter = false,
    } = params;

    const routerAddress = useTaxRouter ? SELECTIVE_TAX_ROUTER_ADDRESS : SWAP_ROUTER_ADDRESS;
    const calls: SmartWalletCall[] = [];

    // 1. Pull tokens from EOA to smart wallet
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transferFrom',
            args: [eoaAddress, smartWalletAddress, amountIn],
        }),
    });

    // 2. Approve router to spend tokens
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, amountIn],
        }),
    });

    // 3. Execute multi-hop swap
    const encodedPath = encodeMultiHopPath(path);

    //console.log('[SmartWallet] Multi-hop path:', encodedPath);
    //console.log('[SmartWallet] Path segments:', path.length);

    calls.push({
        to: routerAddress,
        data: encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: 'exactInput',
            args: [{
                path: encodedPath,
                recipient: eoaAddress, // Output goes directly to EOA
                amountIn,
                amountOutMinimum,
            }],
        }),
    });

    return calls;
}

/**
 * Build atomic multi-hop swap calls for Token → ETH (via intermediate tokens)
 */
export function buildAtomicMultiHopToEthSwapCalls(params: AtomicMultiHopSwapParams): SmartWalletCall[] {
    const {
        eoaAddress,
        smartWalletAddress,
        tokenIn,
        amountIn,
        amountOutMinimum,
        path,
        useTaxRouter = false,
    } = params;

    const routerAddress = useTaxRouter ? SELECTIVE_TAX_ROUTER_ADDRESS : SWAP_ROUTER_ADDRESS;
    const calls: SmartWalletCall[] = [];

    // 1. Pull tokens from EOA to smart wallet
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transferFrom',
            args: [eoaAddress, smartWalletAddress, amountIn],
        }),
    });

    // 2. Approve router to spend tokens
    calls.push({
        to: tokenIn,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, amountIn],
        }),
    });

    // 3. Execute multi-hop swap - WETH goes to ROUTER for unwrap
    const ROUTER_RECIPIENT = '0x0000000000000000000000000000000000000002' as Address;
    const encodedPath = encodeMultiHopPath(path);

    calls.push({
        to: routerAddress,
        data: encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: 'exactInput',
            args: [{
                path: encodedPath,
                recipient: ROUTER_RECIPIENT, // Router holds WETH for unwrap
                amountIn,
                amountOutMinimum,
            }],
        }),
    });

    // 4. Unwrap WETH and send ETH to EOA
    calls.push({
        to: routerAddress,
        data: encodeFunctionData({
            abi: SWAP_ROUTER_UNWRAP_ABI,
            functionName: 'unwrapWETH9',
            args: [amountOutMinimum, eoaAddress],
        }),
    });

    return calls;
}

/**
 * Build atomic ETH → Token swap calls
 * Flow: EOA sends ETH → SW wraps to WETH → SW swaps WETH → Token → Token sent to EOA
 */
export function buildAtomicEthToTokenSwapCalls(params: {
    eoaAddress: Address;
    smartWalletAddress: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    fee: number;
    useTaxRouter?: boolean;
}): SmartWalletCall[] {
    const {
        eoaAddress,
        smartWalletAddress,
        tokenOut,
        amountIn,
        amountOutMinimum,
        fee,
        useTaxRouter = false,
    } = params;

    const routerAddress = useTaxRouter ? SELECTIVE_TAX_ROUTER_ADDRESS : SWAP_ROUTER_ADDRESS;
    const calls: SmartWalletCall[] = [];

    // 1. Wrap ETH to WETH (smart wallet sends ETH value with this call)
    calls.push({
        to: WETH_ADDRESS,
        value: amountIn,
        data: encodeFunctionData({
            abi: WETH_ABI,
            functionName: 'deposit',
            args: [],
        }),
    });

    // 2. Approve router to spend WETH
    calls.push({
        to: WETH_ADDRESS,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, useTaxRouter ? maxUint256 : amountIn],
        }),
    });

    // 3. Execute swap (WETH → Token, output to EOA)
    if (useTaxRouter) {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SelectiveTaxRouterArtifact.abi as any,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn: WETH_ADDRESS,
                    tokenOut,
                    fee,
                    recipient: eoaAddress, // Output directly to EOA
                    deadline,
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });
    } else {
        calls.push({
            to: routerAddress,
            data: encodeFunctionData({
                abi: SWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn: WETH_ADDRESS,
                    tokenOut,
                    fee,
                    recipient: eoaAddress,
                    amountIn,
                    amountOutMinimum,
                    sqrtPriceLimitX96: 0n,
                }],
            }),
        });
    }

    return calls;
}

/**
 * Build atomic ETH → Token multi-hop swap calls
 * Flow: EOA sends ETH → SW wraps to WETH → SW swaps via path → Token sent to EOA
 */
export function buildAtomicEthToTokenMultiHopSwapCalls(params: {
    eoaAddress: Address;
    smartWalletAddress: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMinimum: bigint;
    path: PathSegment[];
    useTaxRouter?: boolean;
}): SmartWalletCall[] {
    const {
        eoaAddress,
        smartWalletAddress,
        amountIn,
        amountOutMinimum,
        path,
        useTaxRouter = false,
    } = params;

    const routerAddress = useTaxRouter ? SELECTIVE_TAX_ROUTER_ADDRESS : SWAP_ROUTER_ADDRESS;
    const calls: SmartWalletCall[] = [];

    // 1. Wrap ETH to WETH
    calls.push({
        to: WETH_ADDRESS,
        value: amountIn,
        data: encodeFunctionData({
            abi: WETH_ABI,
            functionName: 'deposit',
            args: [],
        }),
    });

    // 2. Approve router to spend WETH
    calls.push({
        to: WETH_ADDRESS,
        data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [routerAddress, amountIn],
        }),
    });

    // 3. Execute multi-hop swap
    const encodedPath = encodeMultiHopPath(path);

    calls.push({
        to: routerAddress,
        data: encodeFunctionData({
            abi: SWAP_ROUTER_ABI,
            functionName: 'exactInput',
            args: [{
                path: encodedPath,
                recipient: eoaAddress, // Output directly to EOA
                amountIn,
                amountOutMinimum,
            }],
        }),
    });

    return calls;
}
