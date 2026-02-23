
import { decodeFunctionData, decodeFunctionResult, erc20Abi } from 'viem'

import { bigIntReplacer } from '@/lib/ui_utils'

import poolV3Artifact from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'
import quoterV2Artifact from '@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json'
import positionV3Artifact from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'
import SelectiveTaxRouterArtifact from '@/../SelectiveTaxRouterAudited/SelectiveTaxRouter.json';
import FasterWrapped6909Abi from '@/assets/artifacts/FasterWrapped6909.json';


const knownContracts = {
    '0xa9c7275987fe8a2cff20aa173790430159af889d': {
        name: 'usdcWethPool',
        abi: poolV3Artifact.abi, // Pool Uniswap V3
    },
    '0x4200000000000000000000000000000000000006': {
        name: 'WETH',
        abi: erc20Abi,
    },
    '0x56c00c15453dcbe86faba6147cf02e2c64c74959': {
        name: 'USDC',
        abi: erc20Abi,
    },
    '0xcee153bd81db8a2d6f93fcceb4a9af26fc36ce49': {
        name: 'QuoterV2',
        abi: quoterV2Artifact.abi,
    },
    '0x1279f3cbf01ad4f0cfa93f233464581f4051033a': {
        name: 'NonfungiblePositionManager',
        abi: positionV3Artifact.abi,
    },
    '0xb740e13946f446c1be5feaf1783632a55c67f218': {
        name: 'SelectiveTaxRouter',
        abi: SelectiveTaxRouterArtifact.abi,
    },
    '0x011620b1bbff499ae31f84154f9c89ed3ed35b6e': {
        name: 'DTEST',
        abi: FasterWrapped6909Abi,
    },
}


const knownSignatures = {
    '0x70a08231': {
        name: 'ERC20', // ERC20 balanceOf
        abi: erc20Abi,
    },
    '0xf30dba93': {
        name: 'PoolV3', // PoolV3 ticks
        abi: poolV3Artifact.abi, // Pool Uniswap V3
    },
    '0x3850c7bd': {
        name: 'PoolV3', // PoolV3 slot0
        abi: poolV3Artifact.abi, // Pool Uniswap V3
    },
}



export function getDebugHeaders(requestJson: string, resultJson: string) {
    try {
        const rpcRequest = JSON.parse(requestJson)
        const rpcResult = JSON.parse(resultJson)

        const { method, params: args } = rpcRequest as { method: string; params: any[] }
        const { result } = rpcResult

        let userRequest = `${method}()`
        let userResult = ''

        const knownContractsIds = Object.keys(knownContracts)
        const knownSignaturesIds = Object.keys(knownSignatures)

        // Decoding for eth_call
        if (method === 'eth_call' && args[0] && 'to' in args[0] && 'data' in args[0]) {
            const params = args[0]
            const contractAddress = params.to.toLowerCase()
            const signature = params.data?.slice(0, 10) ?? '0x';

            userRequest = `${method}(${params.to})`

            if (knownContractsIds.includes(contractAddress)) {
                // Decode known contract
                const contractInfos = knownContracts[contractAddress]

                try {
                    // Decode the function called
                    const decoded = decodeFunctionData({
                        abi: contractInfos.abi,
                        data: params.data,
                    })

                    // Format the arguments in a readable way
                    const formattedArgs = formatArgs(decoded.args)
                    userRequest = `${contractInfos.name}.${decoded.functionName}(${formattedArgs})`

                    // Decode the result if available
                    if (result && result !== '0x') {
                        const decodedResult = decodeFunctionResult({
                            abi: contractInfos.abi,
                            functionName: decoded.functionName,
                            data: result,
                        })

                        userResult = formatResult(decodedResult)
                    }

                } catch (error) {
                    console.error('Decode error:', error)
                    userRequest = `${contractInfos.name}.<unknown>(${params.data.slice(0, 10)}...)`
                }

            } else if (knownSignaturesIds.includes(signature)) {
                // Decode known signature
                const signatureInfos = knownSignatures[signature]

                try {
                    // Decode the function called
                    const decoded = decodeFunctionData({
                        abi: signatureInfos.abi,
                        data: params.data,
                    })

                    // Format the arguments in a readable way
                    const formattedArgs = formatArgs(decoded.args)
                    userRequest = `${signatureInfos.name}.${decoded.functionName}(${formattedArgs})`

                    // Decode the result if available
                    if (result && result !== '0x') {
                        const decodedResult = decodeFunctionResult({
                            abi: signatureInfos.abi,
                            functionName: decoded.functionName,
                            data: result,
                        })

                        userResult = formatResult(decodedResult)
                    }

                } catch (error) {
                    console.error('Decode error:', error)
                    userRequest = `${signatureInfos?.name}.<unknown>(${params?.data.slice(0, 10)}...)`
                }
            }
        }

        // Decoding for eth_sendRawTransaction or other transaction calls
        if (method === 'eth_sendRawTransaction' || method === 'eth_estimateGas') {
            // TODO: decode transactions (if needed)
            userRequest = `${method}()`
        }

        return {
            'X-rpc-request': userRequest,
            'X-rpc-result': userResult,
        }

    } catch (error) {
        console.error('RPC Debug error:', error)
    }

    return {};
}


function formatArgs(args: readonly unknown[] | Record<string, unknown> | undefined): string {
    if (!args) return ''

    if (Array.isArray(args)) {
        return args.map(arg => formatValue(arg)).join(', ')
    }

    // If it is an object (named struct)
    return Object.entries(args)
        .map(([key, value]) => `${key}: ${formatValue(value)}`)
        .join(', ')
}


function formatResult(result: unknown): string {
    if (result === null || result === undefined) return 'null'

    if (Array.isArray(result)) {
        return `[${result.map(formatValue).join(', ')}]`
    }

    if (typeof result === 'object') {
        return JSON.stringify(result, bigIntReplacer)
    }

    return formatValue(result)
}


function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'null'

    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'boolean') return value.toString()

    if (typeof value === 'string') {
        // Display addresses in a readable format
        if (value.startsWith('0x') && value.length === 42) {
            return `${value.slice(0, 6)}...${value.slice(-4)}`
        }
        return value
    }

    if (typeof value === 'object') {
        return JSON.stringify(value, bigIntReplacer)
    }

    return String(value)
}


