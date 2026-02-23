import { keccak256, toBytes, recoverMessageAddress, Hex } from 'viem';
import logger from './logger';

/**
 * Derivation versions:
 * - v1: keccak256(signature) - DEPRECATED, phishing vulnerable
 * - v2: keccak256(signature + serverSecret + domain + userId) - SECURE
 */
export type DerivationVersion = 1 | 2;

/**
 * Message that users sign on MegaETH to derive their Polygon wallet key.
 * V1 - Legacy (for existing wallets only)
 */
export const WALLET_DERIVATION_MESSAGE_V1 = 
  'Authorize Prism to manage your Polygon trading wallet.\n\n' +
  'This signature derives your wallet keys. Only sign this on trusted sites.\n\n' +
  'Chain: MegaETH → Polygon\nVersion: 1';

/**
 * V2 Message - Domain-bound and more explicit warnings
 */
export const WALLET_DERIVATION_MESSAGE_V2 = 
  'Authorize Prism to manage your Polygon trading wallet.\n\n' +
  'Domain: prism.megaeth.io (ONLY sign on this exact domain!)\n\n' +
  'WARNING: This signature controls your funds. Never sign on other sites.\n\n' +
  'Chain: MegaETH → Polygon\nVersion: 2';

// Default to V2 for new wallets
export const WALLET_DERIVATION_MESSAGE = WALLET_DERIVATION_MESSAGE_V2;

/**
 * Get the server-side secret for key derivation.
 * This secret is REQUIRED for V2 derivation and makes phished signatures useless.
 */
function getServerSecret(): string {
  const secret = process.env.WALLET_DERIVATION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('WALLET_DERIVATION_SECRET must be at least 32 characters');
  }
  return secret;
}

/**
 * Derive a Polygon private key from a user's MegaETH signature.
 * 
 * V1 (DEPRECATED): Simple hash of signature - vulnerable to phishing
 * V2 (SECURE): Includes server secret + userId - phished signatures are useless
 * 
 * @param signature - EIP-191 personal_sign signature
 * @param userId - User's ID (required for V2)
 * @param version - Derivation version (default: 2)
 * @returns Polygon private key (0x prefixed hex string)
 */
export function derivePolygonPrivateKey(
  signature: string, 
  userId?: string,
  version: DerivationVersion = 2
): string {
  if (version === 1) {
    // Legacy derivation - ONLY for existing V1 wallets
    logger.warn('Using legacy V1 key derivation - consider migrating user');
    const privateKey = keccak256(toBytes(signature as Hex));
    return privateKey;
  }
  
  // V2: Secure derivation with server secret
  if (!userId) {
    throw new Error('userId is required for V2 key derivation');
  }
  
  const serverSecret = getServerSecret();
  
  // Combine: signature + serverSecret + userId
  // Even if signature is phished, attacker can't derive key without serverSecret
  const combined = `${signature}:${serverSecret}:${userId}:prism.megaeth.io`;
  const privateKey = keccak256(toBytes(combined));
  
  return privateKey;
}

/**
 * Verify that a signature was created by the claimed address.
 * 
 * @param signature - The signature to verify
 * @param expectedAddress - The address that should have signed
 * @param version - Which message version to verify against
 * @returns true if signature is valid and from expectedAddress
 */
export async function verifyWalletSignature(
  signature: string,
  expectedAddress: string,
  version: DerivationVersion = 2
): Promise<boolean> {
  try {
    const message = version === 1 ? WALLET_DERIVATION_MESSAGE_V1 : WALLET_DERIVATION_MESSAGE_V2;
    
    const recoveredAddress = await recoverMessageAddress({
      message,
      signature: signature as Hex,
    });
    
    const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    
    if (!isValid) {
      logger.warn('Wallet signature verification failed', {
        expected: expectedAddress,
        recovered: recoveredAddress,
        version,
      });
    }
    
    return isValid;
  } catch (error) {
    logger.error('Error verifying wallet signature', error);
    return false;
  }
}

/**
 * Derive the Polygon address from a signature (for wallet lookup/creation).
 * 
 * @param signature - EIP-191 personal_sign signature
 * @param userId - User's ID (required for V2)
 * @param version - Derivation version
 * @returns Polygon address derived from the signature
 */
export function getPolygonAddressFromSignature(
  signature: string,
  userId?: string,
  version: DerivationVersion = 2
): string {
  const { privateKeyToAccount } = require('viem/accounts');
  const privateKey = derivePolygonPrivateKey(signature, userId, version);
  const account = privateKeyToAccount(privateKey as Hex);
  return account.address;
}

/**
 * Get the appropriate derivation message for a version
 */
export function getDerivationMessage(version: DerivationVersion = 2): string {
  return version === 1 ? WALLET_DERIVATION_MESSAGE_V1 : WALLET_DERIVATION_MESSAGE_V2;
}
