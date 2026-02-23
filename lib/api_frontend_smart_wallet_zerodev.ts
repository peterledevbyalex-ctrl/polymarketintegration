
import { Address, Call, Client, createPublicClient, http, parseEther, TransactionReceipt, WalletClient, zeroAddress } from "viem"
import { createKernelAccount, createZeroDevPaymasterClient, createKernelAccountClient, KernelAccountClient, getUserOperationGasPrice } from "@zerodev/sdk"
import { getEntryPoint, KERNEL_V3_1, KERNEL_V3_3 } from "@zerodev/sdk/constants"
import { getKernelAddressFromECDSA, signerToEcdsaValidator } from "@zerodev/ecdsa-validator"

import * as appConfig from '@/config.app'

import { Signer } from "@zerodev/sdk/types"


const entryPoint = getEntryPoint("0.7")
const kernelVersion = KERNEL_V3_1

const ZERODEV_BUNDLER_URL = appConfig.AA_BUNDLER_URL
const ZERODEV_PAYMASTER_URL = appConfig.AA_PAYMASTER_URL


const publicClient = createPublicClient({
    transport: http(appConfig.RPC_URL),
    chain: appConfig.CURRENT_CHAIN,
})


export const createSmartWalletZeroDev = async (signer: Signer, index=0n): Promise<KernelAccountClient> => {
    const ecdsaValidator = await signerToEcdsaValidator(publicClient as Client, {
        signer,
        entryPoint,
        kernelVersion,
    })

    const account = await createKernelAccount(publicClient as Client, {
        plugins: {
            sudo: ecdsaValidator,
        },
        entryPoint,
        kernelVersion,
        //eip7702Account: signer,
        index,
    })

    const zerodevPaymaster = createZeroDevPaymasterClient({
        chain: appConfig.CURRENT_CHAIN,
        transport: http(ZERODEV_PAYMASTER_URL),
    })

    const kernelClient = createKernelAccountClient({
        account,
        chain: appConfig.CURRENT_CHAIN,
        bundlerTransport: http(ZERODEV_BUNDLER_URL),
        client: publicClient as Client,
        paymaster: {
            getPaymasterData(userOperation) {
                return zerodevPaymaster.sponsorUserOperation({ userOperation })
            },
        },
        //userOperation: {
        //    estimateFeesPerGas: async ({ bundlerClient }) => {
        //        return getUserOperationGasPrice(bundlerClient)
        //    }
        //},
    })

    return kernelClient as any
}


export async function getSmartAccountAddress(eoaAddress: Address, index=0n) {
    const smartAccountAddress = await getKernelAddressFromECDSA({ eoaAddress, index, entryPoint, kernelVersion, publicClient: publicClient as Client });
    return smartAccountAddress;
}


// ==================== BATCHED TRANSACTIONS ====================

export interface ZeroDevCall {
    to: Address;
    value: bigint;
    data: `0x${string}`;
}

/**
 * Execute batched calls via ZeroDev smart account
 * Combines multiple calls into a single UserOperation
 */
export async function executeBatchedCallsZeroDev(
    kernelClient: KernelAccountClient,
    calls: ZeroDevCall[]
): Promise<TransactionReceipt> {
    //console.log('[ZeroDev] Executing batched calls:', calls.length);

    const userOpHash = await kernelClient.sendUserOperation({
        callData: await kernelClient.account.encodeCalls(calls as any),
    } as any);

    //console.log('[ZeroDev] UserOp hash:', userOpHash);

    const userOpReceipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 60_000, // 60 seconds
    });

    //console.log('[ZeroDev] UserOp completed:', userOpReceipt.receipt.transactionHash);

    return userOpReceipt.receipt as TransactionReceipt;
}

/**
 * Check if ZeroDev is available and configured
 */
export function isZeroDevConfigured(): boolean {
    return !!appConfig.AA_BUNDLER_URL && appConfig.AA_BUNDLER_URL.length > 0 && !!appConfig.AA_PAYMASTER_URL && appConfig.AA_PAYMASTER_URL.length > 0;
}


export const testSendTransactionZeroDev = async (kernelClient: KernelAccountClient): Promise<TransactionReceipt> => {
    const accountAddress = kernelClient.account.address
    //console.log("Smart account:", accountAddress)


    const onChainNonce = await publicClient.getTransactionCount({ address: kernelClient.account.address });
    //console.log("On-chain nonce:", onChainNonce)


    // real type is Call[] but throw an error => Type error: Type instantiation is excessively deep and possibly infinite.
    const calls: any[] = [
        {
            to: zeroAddress,
            value: BigInt(0),
            data: "0x",
        },
        {
            to: zeroAddress,
            value: BigInt(0),
            data: "0x",
        },
    ];


    if (true) {
        const txHash = await kernelClient.sendTransaction({
            to: '0x1337452ec787611f40588885c01f4f0d3ffab101',
            //value: parseEther('0.001'),
            data: "0x",
            kzg: undefined,
            account: kernelClient.account,
            chain: appConfig.CURRENT_CHAIN,
            //nonce: onChainNonce,
        })

        // ERROR: No bundler RPC found for chainId: 6343

        //console.log('txHash:', txHash)

        const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        //console.log("UserOp completed!")

        return receipt;

    } else {

        const userOpHash = await kernelClient.sendUserOperation({
            callData: await kernelClient.account.encodeCalls(calls),
            //nonce: onChainNonce,
        } as any)

        // ERROR: No bundler RPC found for chainId: 6343

        //console.log("UserOp hash:", userOpHash)
        //console.log("Waiting for UserOp to complete...")


        const userOpReceipt = await kernelClient.waitForUserOperationReceipt({
            hash: userOpHash,
            timeout: 10_000,
        })

        //console.log('userOpReceipt:', userOpReceipt)

        //console.log('txHash:', userOpReceipt.receipt.transactionHash)

        //console.log("UserOp completed!")
        //console.log("View on explorer: https://megaeth-testnet-v2.blockscout.com/op/" + userOpHash)

        return userOpReceipt.receipt as TransactionReceipt;
    }

}


