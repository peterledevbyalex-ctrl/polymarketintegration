import { RelayClient } from '@polymarket/builder-relayer-client';
import { BuilderConfig, BuilderApiKeyCreds } from '@polymarket/builder-signing-sdk';
import { createWalletClient, http, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Polymarket Relayer Client wrapper
 * Based on: https://docs.polymarket.com/developers/builders/relayer-client
 * 
 * Can be initialized with:
 * - No args: Uses POLYMARKET_SERVICE_PRIVATE_KEY (shared service wallet)
 * - Custom private key: Creates client for that specific wallet
 */
export class PolymarketRelayerClient {
  private client: RelayClient | null = null;
  private initialized = false;
  private customPrivateKey?: string;

  private initialize() {
    if (this.initialized) return;

    const privateKey = this.customPrivateKey || process.env.POLYMARKET_SERVICE_PRIVATE_KEY;
    if (!privateKey) {
      logger.warn('No private key provided - relayer client disabled');
      return;
    }

    try {
      // Create account from private key (required by SDK)
      const account = privateKeyToAccount(privateKey as Hex);
      
      const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'),
      });

      // Builder credentials for authentication
      const builderCreds: BuilderApiKeyCreds = {
        key: config.polymarket.builderApiKey,
        secret: config.polymarket.builderSecret,
        passphrase: config.polymarket.builderPassphrase,
      };

      const builderConfig = new BuilderConfig({
        localBuilderCreds: builderCreds,
      });

      this.client = new RelayClient(
        config.polymarket.relayerUrl,
        137, // Polygon
        walletClient,
        builderConfig
      );

      this.initialized = true;
      logger.info('Polymarket relayer client initialized', {
        isCustomKey: !!this.customPrivateKey,
        signerAddress: account.address,
      });
    } catch (error) {
      logger.error('Failed to initialize relayer client', error);
    }
  }

  /**
   * @param customPrivateKey - Optional: Use a custom private key instead of service key
   */
  constructor(customPrivateKey?: string) {
    this.customPrivateKey = customPrivateKey;
    this.initialize();
  }

  /**
   * Deploy a wallet (Safe or Proxy) via the relayer
   * Based on: https://docs.polymarket.com/developers/builders/relayer-client#deploy-a-wallet
   */
  async deployWallet(
    walletType: 'SAFE' | 'PROXY',
    _userAddress: string
  ): Promise<{ address: string; deployed: boolean }> {
    this.initialize();
    
    if (!this.client) {
      throw new Error('Relayer client not initialized - check POLYMARKET_SERVICE_PRIVATE_KEY');
    }

    try {
      // Deploy Safe wallet via relayer (SDK always deploys Safe for the signer)
      const response = await this.client.deploy();
      
      // Wait for confirmation
      const result = await response?.wait?.();
      
      const address = result?.proxyAddress || '';
      const state = result?.state || 'UNKNOWN';
      
      logger.info('Wallet deployed', { 
        walletType, 
        address,
        state,
      });

      // Accept STATE_MINED or STATE_CONFIRMED as deployed
      const deployedStates = ['STATE_MINED', 'STATE_CONFIRMED', 'STATE_EXECUTED'];
      
      return {
        address,
        deployed: deployedStates.includes(state),
      };
    } catch (error: any) {
      // Handle "already deployed" - this is actually success!
      if (error?.message?.includes('already deployed')) {
        logger.info('Wallet already deployed', { walletType });
        // Return success - wallet exists
        return {
          address: '', // Address should be fetched from DB
          deployed: true,
        };
      }
      logger.error('Error deploying wallet', error);
      throw new Error(`Failed to deploy ${walletType} wallet`);
    }
  }

  /**
   * Execute transactions via the relayer (gasless)
   */
  async execute(
    transactions: Array<{ to: string; data: string; value: string }>,
    description?: string
  ): Promise<{ transactionID: string; transactionHash: string; state: string }> {
    if (!this.client) {
      throw new Error('Relayer client not initialized');
    }
    
    try {
      const response = await this.client.execute(transactions, description || 'Execute transaction');
      
      // Wait for confirmation - this returns the final state!
      const waitResult = await response?.wait?.();
      
      const transactionID = waitResult?.transactionID || (response as any)?.transactionID || '';
      const transactionHash = waitResult?.transactionHash || (response as any)?.transactionHash || '';
      const state = waitResult?.state || 'UNKNOWN';
      
      logger.info('Transaction confirmed', { transactionID, state });

      return { transactionID, transactionHash, state };
    } catch (error) {
      logger.error('Error executing transaction', error);
      throw new Error('Failed to execute transaction');
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionID: string): Promise<{
    state: string;
    transactionHash?: string;
  }> {
    try {
      // The SDK should have a method to get transaction status
      // This is a placeholder - check SDK docs for actual method
      const response = await (this.client as any).getTransaction?.(transactionID);
      
      // Response might be array or single object
      const tx = Array.isArray(response) ? response[0] : response;
      
      return {
        state: tx?.state || 'UNKNOWN',
        transactionHash: tx?.transactionHash,
      };
    } catch (error) {
      logger.error('Error getting transaction status', error);
      throw new Error('Failed to get transaction status');
    }
  }

  /**
   * Withdraw USDC from the Safe wallet to another address
   * @param toAddress - Address to send USDC to
   * @param amountUsdc - Amount in USDC (e.g., 19.53)
   */
  async withdrawUSDC(
    toAddress: string,
    amountUsdc: number
  ): Promise<{ transactionID: string; transactionHash: string; state: string }> {
    if (!this.client) {
      throw new Error('Relayer client not initialized');
    }

    // USDC.e on Polygon (6 decimals)
    const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    const amount = BigInt(Math.floor(amountUsdc * 1_000_000)); // 6 decimals

    // ERC20 transfer function signature: transfer(address,uint256)
    const transferData = 
      '0xa9059cbb' + // transfer selector
      toAddress.slice(2).padStart(64, '0') + // to address (padded)
      amount.toString(16).padStart(64, '0'); // amount (padded)

    logger.info('Withdrawing USDC from Safe', {
      toAddress,
      amountUsdc,
      amountRaw: amount.toString(),
    });

    return this.execute(
      [{ to: USDC_ADDRESS, data: transferData, value: '0' }],
      `Withdraw ${amountUsdc} USDC to ${toAddress}`
    );
  }
}
