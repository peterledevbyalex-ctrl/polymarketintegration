import { supabase } from '../db/supabase';
import { PolymarketWallet, WalletType, DeploymentStatus, ReferralActionType } from '../types';
import logger from '../utils/logger';
import { PolymarketRelayerClient } from './polymarketRelayerClient';
import { ReferralService } from './referralService';
import { 
  derivePolygonPrivateKey, 
  verifyWalletSignature, 
  getPolygonAddressFromSignature,
  getDerivationMessage,
  DerivationVersion,
} from '../utils/signatureKeyDerivation';
import { encryptSignature, decryptSignature } from '../utils/encryption';
import { ethers } from 'ethers';

// Gnosis Safe ABI (minimal for owner management)
const SAFE_ABI = [
  'function addOwnerWithThreshold(address owner, uint256 _threshold)',
  'function getOwners() view returns (address[])',
  'function isOwner(address owner) view returns (bool)',
  'function nonce() view returns (uint256)',
  'function getThreshold() view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)',
];

const POLYGON_RPC = 'https://polygon-rpc.com';

/**
 * WalletService - Secure Signature-Derived Keys
 * 
 * Security model (V2):
 * - User signs WALLET_DERIVATION_MESSAGE_V2 on MegaETH
 * - Polygon private key = keccak256(signature + SERVER_SECRET + userId)
 * - Server secret makes phished signatures USELESS
 * - Signatures encrypted at rest
 * - Key is NEVER stored - derived on-demand each request
 * 
 * V1 (legacy) wallets use simple derivation - should be migrated
 */
export class WalletService {
  /**
   * Get the derivation message for frontend to display
   * @param version - Which version (default: 2 for new wallets)
   */
  static getDerivationMessage(version: DerivationVersion = 2): string {
    return getDerivationMessage(version);
  }

  /**
   * Derive Polygon private key from user's MegaETH signature.
   * Key is transient - used for this request only, never stored.
   * 
   * @param walletSignature - The user's signature
   * @param userId - User ID (required for V2 secure derivation)
   * @param version - Derivation version (1=legacy, 2=secure)
   */
  deriveUserPrivateKey(
    walletSignature: string, 
    userId?: string, 
    version: DerivationVersion = 2
  ): string {
    return derivePolygonPrivateKey(walletSignature, userId, version);
  }

  /**
   * Verify the wallet signature is from the claimed MegaETH address.
   * @param version - Which message version to verify against
   */
  async verifySignature(
    walletSignature: string, 
    megaethAddress: string,
    version: DerivationVersion = 2
  ): Promise<boolean> {
    return verifyWalletSignature(walletSignature, megaethAddress, version);
  }

  /**
   * Get or create a Polymarket wallet for a user.
   * 
   * NEW WALLETS: Use V2 secure derivation (server secret)
   * EXISTING WALLETS: Use their stored derivation version
   * 
   * @param userId - User ID in our system
   * @param megaethAddress - User's MegaETH address
   * @param walletSignature - User's signature (only required for new wallets)
   */
  async getOrCreateWallet(
    userId: string, 
    megaethAddress: string,
    walletSignature?: string
  ): Promise<PolymarketWallet & { privateKey: string }> {
    // Check if wallet exists in DB first
    const { data: existing, error: findError } = await supabase
      .from('polymarket_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Determine derivation version (default to V1 for legacy wallets)
      const version: DerivationVersion = (existing.derivation_version || 1) as DerivationVersion;
      
      // Get signature: decrypt if encrypted, or use raw
      let signature = walletSignature;
      if (!signature && existing.wallet_signature) {
        signature = existing.signature_encrypted 
          ? decryptSignature(existing.wallet_signature)
          : existing.wallet_signature;
      }
      
      if (!signature) {
        throw new Error('No wallet signature stored - please sign the wallet message');
      }
      
      // Derive key using appropriate version
      const privateKey = this.deriveUserPrivateKey(signature, userId, version);
      
      logger.info('Using existing wallet', { 
        safeAddress: existing.polygon_wallet_address,
        hasStoredSignature: !!existing.wallet_signature,
        derivationVersion: version,
        encrypted: existing.signature_encrypted,
      });
      
      // Update stored signature if a new one was provided (encrypt it!)
      if (walletSignature && walletSignature !== signature) {
        const encryptedSig = encryptSignature(walletSignature);
        await supabase
          .from('polymarket_wallets')
          .update({ 
            wallet_signature: encryptedSig,
            signature_encrypted: true,
          })
          .eq('user_id', userId);
      }
      
      return { ...existing as PolymarketWallet, privateKey };
    }

    if (findError && findError.code !== 'PGRST116') {
      logger.error('Error finding wallet', findError);
      throw new Error('Failed to query wallet');
    }

    // ========== NEW WALLET - USE V2 SECURE DERIVATION ==========
    
    if (!walletSignature) {
      throw new Error('Wallet signature required for first-time setup. Please sign the wallet message.');
    }

    // Verify signature is from the claimed address (using V2 message)
    const isValid = await this.verifySignature(walletSignature, megaethAddress, 2);
    if (!isValid) {
      throw new Error('Invalid wallet signature - must be signed by megaethAddress');
    }

    // Derive the Polygon private key with V2 SECURE derivation
    const privateKey = this.deriveUserPrivateKey(walletSignature, userId, 2);
    const polygonAddress = getPolygonAddressFromSignature(walletSignature, userId, 2);
    
    logger.info('Creating new wallet with V2 secure derivation', { 
      megaethAddress, 
      polygonAddress,
      derivationVersion: 2,
    });

    // Create new wallet via Polymarket Relayer
    const wallet = await this.createWalletViaRelayer(userId, privateKey);

    // Encrypt signature before storing
    const encryptedSignature = encryptSignature(walletSignature);

    // Store in database with V2 security
    const { data: newWallet, error: createError } = await supabase
      .from('polymarket_wallets')
      .insert({
        user_id: userId,
        wallet_type: wallet.wallet_type,
        polygon_wallet_address: wallet.polygon_wallet_address,
        wallet_signature: encryptedSignature, // ENCRYPTED!
        signature_encrypted: true,
        derivation_version: 2, // V2 secure derivation
        deployment_status: wallet.deployment_status,
      })
      .select()
      .single();

    if (createError || !newWallet) {
      logger.error('Error storing wallet', createError);
      throw new Error('Failed to store wallet');
    }

    logger.info(`Created secure V2 wallet for user ${userId}`, {
      safeAddress: newWallet.polygon_wallet_address,
      signerAddress: polygonAddress,
      derivationVersion: 2,
    });

    // Track referral action for wallet creation (fire and forget)
    const referralService = new ReferralService();
    referralService.trackAction(
      userId,
      ReferralActionType.WALLET_CREATED,
      { wallet_address: newWallet.polygon_wallet_address }
    ).catch(() => {});
    
    return { ...newWallet as PolymarketWallet, privateKey };
  }

  private async createWalletViaRelayer(
    userId: string,
    privateKey: string
  ): Promise<{
    wallet_type: WalletType;
    polygon_wallet_address: string;
    deployment_status: DeploymentStatus;
  }> {
    try {
      logger.info('Deploying Safe wallet via relayer', { userId });
      
      // Create RelayClient with derived private key
      const userRelayerClient = new PolymarketRelayerClient(privateKey);
      
      // Deploy Safe wallet via Polymarket Relayer
      const result = await userRelayerClient.deployWallet('SAFE', '');

      logger.info('Deployed Safe for user', { 
        userId, 
        safeAddress: result.address 
      });

      return {
        wallet_type: WalletType.SAFE,
        polygon_wallet_address: result.address,
        deployment_status: result.deployed
          ? DeploymentStatus.DEPLOYED
          : DeploymentStatus.UNKNOWN,
      };
    } catch (error) {
      logger.error('Error creating wallet via relayer', error);
      throw new Error('Failed to create wallet via relayer');
    }
  }

  /**
   * Ensure wallet is deployed on Polygon.
   */
  async ensureWalletDeployed(
    wallet: PolymarketWallet,
    privateKey: string
  ): Promise<void> {
    if (wallet.deployment_status === DeploymentStatus.DEPLOYED) {
      return;
    }

    try {
      const userRelayerClient = new PolymarketRelayerClient(privateKey);
      const result = await userRelayerClient.deployWallet('SAFE', '');

      if (result.deployed) {
        await supabase
          .from('polymarket_wallets')
          .update({ deployment_status: DeploymentStatus.DEPLOYED })
          .eq('id', wallet.id);
        logger.info('Wallet deployment status updated', { walletId: wallet.id });
      }
    } catch (error: any) {
      if (error?.message?.includes('already deployed')) {
        await supabase
          .from('polymarket_wallets')
          .update({ deployment_status: DeploymentStatus.DEPLOYED })
          .eq('id', wallet.id);
        logger.info('Wallet was already deployed', { walletId: wallet.id });
        return;
      }
      logger.error('Error deploying wallet', error);
      throw new Error('Failed to deploy wallet');
    }
  }

  /**
   * Get user's private key from signature (for use in other services).
   * This is a convenience method that verifies + derives in one call.
   * 
   * @param walletSignature - User's signature
   * @param megaethAddress - User's MegaETH address  
   * @param userId - User ID (required for V2)
   * @param version - Derivation version
   */
  async getPrivateKeyFromSignature(
    walletSignature: string,
    megaethAddress: string,
    userId?: string,
    version: DerivationVersion = 2
  ): Promise<string> {
    const isValid = await this.verifySignature(walletSignature, megaethAddress, version);
    if (!isValid) {
      throw new Error('Invalid wallet signature');
    }
    return this.deriveUserPrivateKey(walletSignature, userId, version);
  }

  /**
   * Add user's EOA as a second owner to their Safe wallet.
   * This allows them to import the Safe into Safe{Wallet} and use it on Polymarket.
   * 
   * @param safeAddress - The Safe wallet address
   * @param newOwner - The EOA address to add as owner (user's MegaETH address)
   * @param currentOwnerPrivateKey - Private key of current owner (derived from signature)
   * @returns Transaction hash
   */
  async addEOAOwner(
    safeAddress: string,
    newOwner: string,
    currentOwnerPrivateKey: string
  ): Promise<{ txHash: string; newOwner: string }> {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const signer = new ethers.Wallet(currentOwnerPrivateKey, provider);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);

    // Check if already an owner
    const isAlreadyOwner = await safe.isOwner(newOwner);
    if (isAlreadyOwner) {
      logger.info('Address is already a Safe owner', { safeAddress, newOwner });
      return { txHash: '0x0', newOwner }; // Already done
    }

    logger.info('Adding EOA as Safe owner', { safeAddress, newOwner });

    // 1. Encode the addOwnerWithThreshold call
    const addOwnerData = safe.interface.encodeFunctionData(
      'addOwnerWithThreshold',
      [newOwner, 1] // Add owner, keep threshold at 1
    );

    // 2. Get current nonce
    const nonce = await safe.nonce();

    // 3. Get transaction hash for signing
    const safeTxHash = await safe.getTransactionHash(
      safeAddress,      // to: the Safe itself
      0,                // value: 0
      addOwnerData,     // data: encoded addOwner call
      0,                // operation: Call (not DelegateCall)
      0,                // safeTxGas: 0 (estimate)
      0,                // baseGas: 0
      0,                // gasPrice: 0
      ethers.ZeroAddress, // gasToken: ETH
      ethers.ZeroAddress, // refundReceiver: none
      nonce
    );

    // 4. Sign the transaction hash
    // For Safe, we need to sign the raw hash (not as a message)
    const signerAddress = await signer.getAddress();
    const signature = await signer.signMessage(ethers.getBytes(safeTxHash));
    
    // Convert to Safe signature format (v += 4 for eth_sign)
    const sig = ethers.Signature.from(signature);
    const v = sig.v + 4; // Safe expects v+4 for eth_sign signatures
    const formattedSignature = ethers.concat([
      sig.r,
      sig.s,
      ethers.toBeHex(v, 1)
    ]);

    logger.info('Executing Safe transaction to add owner', { 
      safeAddress, 
      newOwner,
      signer: signerAddress,
    });

    // 5. Execute the transaction
    const tx = await safe.execTransaction(
      safeAddress,        // to
      0,                  // value
      addOwnerData,       // data
      0,                  // operation
      0,                  // safeTxGas
      0,                  // baseGas
      0,                  // gasPrice
      ethers.ZeroAddress, // gasToken
      ethers.ZeroAddress, // refundReceiver
      formattedSignature, // signatures
      { gasLimit: 200000 }
    );

    logger.info('Safe addOwner transaction submitted', { txHash: tx.hash });

    // Wait for confirmation
    const receipt = await tx.wait();
    
    logger.info('EOA successfully added as Safe owner', { 
      safeAddress, 
      newOwner,
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Update DB to mark that EOA has been added
    await supabase
      .from('polymarket_wallets')
      .update({ eoa_owner_added: true })
      .eq('polygon_wallet_address', safeAddress);

    return { txHash: receipt.hash, newOwner };
  }

}

