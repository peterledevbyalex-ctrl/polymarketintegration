/**
 * Smart Wallet Hook using Kernel + Pimlico
 * 
 * Provides atomic batched transactions with SPONSORED gas.
 * The smart wallet is derived from the user's EOA signer.
 * All UserOps are gas-sponsored - users never pay gas.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { Address, erc20Abi, createPublicClient, http, TransactionReceipt, WalletClient, Hex } from 'viem';
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient, KernelAccountClient } from '@zerodev/sdk';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { signerToEcdsaValidator, getKernelAddressFromECDSA } from '@zerodev/ecdsa-validator';
import { toAccount } from 'viem/accounts';

import * as appConfig from '@/config.app';


const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

// Use regular RPC for publicClient (chain state reads)
const publicClient = createPublicClient({
    chain: appConfig.CURRENT_CHAIN,
    transport: http(appConfig.RPC_URL),
});


export interface SmartWalletCall {
    to: Address;
    value?: bigint;
    data: Hex;
}

export interface InitializeResult {
    kernelClient: KernelAccountClient;
    smartWalletAddress: Address;
}

export interface UseSmartWalletReturn {
    smartWalletAddress: Address | null;
    isInitialized: boolean;
    isInitializing: boolean;
    error: string | null;
    initializeSmartWallet: () => Promise<InitializeResult>;
    batchTransactions: (calls: SmartWalletCall[], clientOverride?: KernelAccountClient, onUserOpSubmitted?: () => void) => Promise<TransactionReceipt>;
    checkAllowance: (tokenAddress: Address, spender: Address) => Promise<bigint>;
    isSmartWalletReady: boolean;
}


/**
 * Convert wagmi WalletClient to a viem LocalAccount for ZeroDev
 */
function walletClientToLocalAccount(walletClient: WalletClient, eoaAddress: Address) {
    return toAccount({
        address: eoaAddress,
        async signMessage({ message }) {
            return walletClient.signMessage({
                message,
                account: eoaAddress,
            });
        },
        async signTypedData(typedData) {
            return walletClient.signTypedData({
                ...typedData,
                account: eoaAddress,
            } as any);
        },
        async signTransaction(transaction) {
            return walletClient.signTransaction({
                ...transaction,
                account: eoaAddress,
            } as any);
        },
    });
}


export function useSmartWallet(): UseSmartWalletReturn {
    const { address: eoaAddress, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();

    const [smartWalletAddress, setSmartWalletAddress] = useState<Address | null>(null);
    const [kernelClient, setKernelClient] = useState<KernelAccountClient | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getSmartWalletAddress = useCallback(async (eoaAddr: Address): Promise<Address> => {
        const address = await getKernelAddressFromECDSA({
            eoaAddress: eoaAddr,
            index: 3n, // Match wallet page index
            entryPoint,
            kernelVersion,
            publicClient: publicClient as any,
        });
        return address;
    }, []);

    const initializeSmartWallet = useCallback(async (): Promise<InitializeResult> => {
        if (!walletClient || !eoaAddress) {
            throw new Error('Wallet not connected');
        }

        if (!appConfig.AA_BUNDLER_URL || !appConfig.AA_PAYMASTER_URL) {
            throw new Error('AA endpoints not configured');
        }

        setIsInitializing(true);
        setError(null);

        try {
            //console.log('[SmartWallet] Initializing for EOA:', eoaAddress);

            const signer = walletClientToLocalAccount(walletClient, eoaAddress);

            const ecdsaValidator = await signerToEcdsaValidator(publicClient as any, {
                signer: signer as any,
                entryPoint,
                kernelVersion,
            });

            const account = await createKernelAccount(publicClient as any, {
                plugins: { sudo: ecdsaValidator },
                entryPoint,
                kernelVersion,
                index: 3n, // Match wallet page index // note: why 3 and not 0 or 1 ? dev wallets stalled ?
            });

            //console.log('[SmartWallet] Smart wallet address:', account.address);

            const bundlerUrl = appConfig.AA_BUNDLER_URL;
            const paymasterUrl = appConfig.AA_PAYMASTER_URL;

            //console.log('[SmartWallet] Using AA provider:', appConfig.AA_PROVIDER);
            //console.log('[SmartWallet] Bundler URL:', bundlerUrl);

            // Create paymaster client (ZeroDev SDK works with both ZeroDev and Pimlico)
            const paymasterClient = createZeroDevPaymasterClient({
                chain: appConfig.CURRENT_CHAIN,
                transport: http(paymasterUrl),
            });

            const client = createKernelAccountClient({
                account,
                chain: appConfig.CURRENT_CHAIN,
                bundlerTransport: http(bundlerUrl),
                client: publicClient as any,
                paymaster: {
                    getPaymasterData(userOperation) {
                        return paymasterClient.sponsorUserOperation({ userOperation })
                    },
                },
            });

            setKernelClient(client as any);
            setSmartWalletAddress(account.address);
            setIsInitialized(true);
            //console.log('[SmartWallet] Initialized successfully (gas sponsored)');

            return {
                kernelClient: client as any,
                smartWalletAddress: account.address,
            };

        } catch (err: any) {
            //console.error('[SmartWallet] Initialization failed:', err);
            setError(err.message || 'Failed to initialize smart wallet');
            throw err;

        } finally {
            setIsInitializing(false);
        }
    }, [walletClient, eoaAddress]);

    const batchTransactions = useCallback(async (calls: SmartWalletCall[], clientOverride?: KernelAccountClient, onUserOpSubmitted?: () => void): Promise<TransactionReceipt> => {
        const client = clientOverride || kernelClient;
        if (!client || !client.account) {
            throw new Error('Smart wallet not initialized');
        }

        //console.log('[SmartWallet] Executing batched calls (sponsored):', calls.length);

        try {
            const formattedCalls = calls.map(call => ({
                to: call.to,
                value: call.value || 0n,
                data: call.data,
            }));

            //console.log('[SmartWallet] Encoding calls and sending UserOp...');

            // Use sendUserOperation with encodeCalls (official ZeroDev pattern)
            const sendStart = Date.now();
            const userOpHash = await client.sendUserOperation({
                callData: await client.account.encodeCalls(formattedCalls),
            } as any);
            //console.log('[SmartWallet] sendUserOperation ms:', Date.now() - sendStart);

            if (onUserOpSubmitted) {
                onUserOpSubmitted();
            }

            //console.log('[SmartWallet] UserOp submitted:', userOpHash);
            //console.log('[SmartWallet] Waiting for UserOp receipt...');

            // Wait for UserOp receipt
            const receipt = await client.waitForUserOperationReceipt({
                hash: userOpHash,
            });

            //console.log('[SmartWallet] UserOp confirmed:', receipt.userOpHash);
            //console.log('[SmartWallet] TxHash:', receipt.receipt.transactionHash);

            return receipt.receipt as TransactionReceipt;

        } catch (err: any) {
            //console.error('[SmartWallet] Batch failed:', err);
            if (err.message?.includes('AA21')) {
                throw new Error('UserOp validation failed. Please try again.');
            }
            if (err.message?.includes('STF')) {
                throw new Error('Transaction simulation failed.');
            }
            throw err;
        }
    }, [kernelClient]);

    const checkAllowance = useCallback(async (tokenAddress: Address, spender: Address): Promise<bigint> => {
        if (!smartWalletAddress) return 0n;
        return publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [smartWalletAddress, spender],
        } as any) as Promise<bigint>;
    }, [smartWalletAddress]);


    // Auto-predict smart wallet address when connected
    useEffect(() => {
        if (isConnected && eoaAddress && !smartWalletAddress) {
            getSmartWalletAddress(eoaAddress).then(addr => {
                setSmartWalletAddress(addr);
                //console.log('[SmartWallet] Predicted address:', addr);
            })
            //.catch(console.error)
            .catch(() => {})
        }
    }, [isConnected, eoaAddress, smartWalletAddress, getSmartWalletAddress]);

    // Reset SmartWallet on wallet disconnect
    useEffect(() => {
        if (!isConnected) {
            setSmartWalletAddress(null);
            setKernelClient(null);
            setIsInitialized(false);
            setIsInitializing(false);
            setError(null);
        }
    }, [isConnected]);


    return {
        smartWalletAddress,
        isInitialized,
        isInitializing,
        error,
        initializeSmartWallet,
        batchTransactions,
        checkAllowance,
        isSmartWalletReady: isInitialized && !!kernelClient,
    };
}
