
import { Address, Chain, createPublicClient, encodeFunctionData, Hex, http, keccak256, parseEther, PublicClient, SignAuthorizationReturnType, TransactionReceipt, WalletClient, zeroAddress } from "viem"
import { PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";

import * as appConfig from '@/config.app'
import { getPublicClient } from "./api_blockchain";


async function getSmartWallet7702Delegation(address: Address): Promise<Address | null> {
    const publicClient = getPublicClient();

    const code = await publicClient.getCode({ address });
    //console.log('EOA bytecode:', code);

    if (code) {
        if (code.startsWith("0xef0100")) {
            // Extract the delegated address (remove 0xef0100 prefix)
            const delegatedAddress = "0x" + code.slice(8) as Address; // Remove 0xef0100 (8 chars)
            return delegatedAddress;

        } else {
            //console.log(`Address has code but not EIP-7702 delegation: ${code}`);
            return null;
        }
    }

    return null;
}


async function getSmartWallet7702Authorization(walletClient: WalletClient, nonce: number) {
    const authorization = await walletClient.signAuthorization({
        account: walletClient.account,
        contractAddress: appConfig.SMART_ACCOUNT_CONTRACT_ADDRESS,
        nonce: nonce,
        //executor: 'self',
    });

    return authorization;
}


async function getSmartWallet7702Revocation(walletClient: WalletClient, nonce: number) {
    const authorization = await walletClient.signAuthorization({
        account: walletClient.account,
        contractAddress: zeroAddress,
        //chainId: CURRENT_CHAIN.id,
        nonce: nonce,
    });

    return authorization;
}


async function sendAuthorizedTransaction7702(walletClient: WalletClient, authorization: SignAuthorizationReturnType, data?: Hex): Promise<Hex> {
    const txHash = await walletClient.sendTransaction({
        to: walletClient.account.address,
        //value,
        data,
        chain: appConfig.CURRENT_CHAIN,
        account: walletClient.account,
        kzg: undefined,
        authorizationList: [authorization],
        //gas: 200_000n,
    });

    return txHash;
}


async function sendTransaction7702(walletClient: WalletClient, data?: Hex): Promise<TransactionReceipt> {
    const delegatedAddress = await getSmartWallet7702Delegation(walletClient.account.address);

    if (delegatedAddress?.toLowerCase() === appConfig.SMART_ACCOUNT_CONTRACT_ADDRESS.toLowerCase()) {
        //console.log('Already delegatated to this contract');

    } else if (delegatedAddress) {
        //console.log(`Already delegatated to ${delegatedAddress}`);

    } else {
        //console.log(`Not yet delegated`);
    }

    const publicClient = getPublicClient();

    const nonce = await publicClient.getTransactionCount({ address: walletClient.account.address });

    const authorization = await getSmartWallet7702Authorization(walletClient, nonce + 1);
    //console.log('Authorization signed:', authorization);

    //console.log('sendTransaction7702...')
    const txHash = await sendAuthorizedTransaction7702(walletClient, authorization, data);

    //console.log('txHash:', txHash)

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
    return receipt
}


/**
 * Check if user has already delegated to our SmartWalletExecutor
 */
async function isAlreadyDelegated(userAddress: Address): Promise<boolean> {
    const delegatedAddress = await getSmartWallet7702Delegation(userAddress);
    return delegatedAddress?.toLowerCase() === appConfig.SMART_ACCOUNT_CONTRACT_ADDRESS.toLowerCase();
}



// ==================== 7702 SUPPORT DETECTION ====================

/**
 * Check if the wallet supports EIP-7702 by attempting to call signAuthorization
 * Returns true if supported, false otherwise
 */
export async function isWallet7702Supported(walletClient: WalletClient): Promise<boolean> {
    try {
        //console.log('[7702] Checking wallet support...');
        //console.log('[7702] walletClient.account:', walletClient?.account);
        //console.log('[7702] account type:', walletClient?.account?.type);

        // Check if signAuthorization method exists on the wallet
        if (typeof walletClient.signAuthorization !== 'function') {
            //console.log('[7702] Wallet does not have signAuthorization method');
            return false;
        }

        // JSON-RPC accounts (from wagmi/MetaMask/Rabby) don't support signAuthorization
        // Only local accounts (private key) support it directly
        const accountType = walletClient?.account?.type;
        if (accountType === 'json-rpc') {
            //console.log('[7702] JSON-RPC account detected - signAuthorization not supported');
            //console.log('[7702] Note: MetaMask/Rabby support 7702 but through their own UI, not via signAuthorization');
            return false;
        }

        // Check if the chain supports 7702 (needs to be post-Pectra)
        // For now, we assume MegaETH testnet supports it
        // In production, you'd check the chain's capabilities

        //console.log('[7702] Wallet appears to support EIP-7702');
        return true;

    } catch (error) {
        //console.log('[7702] Error checking 7702 support:', error);
        return false;
    }
}


/**
 * Batch call structure for building swap transactions
 */
export interface BatchCall {
    target: Address;
    value: bigint;
    calldata: Hex;
}

/**
 * Execute a batched transaction via 7702
 * Combines multiple calls (approve + swap) into a single signature
 */
export async function executeBatchedTransaction7702(
    walletClient: WalletClient,
    calls: BatchCall[]
): Promise<TransactionReceipt> {
    const targets = calls.map(c => c.target);
    const values = calls.map(c => c.value);
    const calldatas = calls.map(c => c.calldata);

    //console.log(`[7702] Executing batched transaction with ${calls.length} calls`);

    //return sendTransaction7702_Batch(walletClient, targets, values, calldatas);


    /*
    const data = encodeFunctionData({
        abi: contractArtifact.abi,
        functionName: 'batch',
        args: [
            targets,    // targets
            values,     // values
            calldatas,  // calldatas
        ],
    })


    const authorization = await getSmartWallet7702Authorization(walletClient, nonce + 1);

    const hash = await walletClient.sendTransaction({
        // ...
        authorizationList: [authorization],
    });

    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash });
    */

    throw new Error("Missing implementation")
}

