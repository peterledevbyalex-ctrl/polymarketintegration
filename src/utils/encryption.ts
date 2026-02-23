import crypto from 'crypto';
import logger from './logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment
 * Must be 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.SIGNATURE_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('SIGNATURE_ENCRYPTION_KEY not configured');
  }
  
  if (key.length !== 64) {
    throw new Error('SIGNATURE_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a signature for storage
 * Returns: iv (32 hex) + authTag (32 hex) + ciphertext (hex)
 */
export function encryptSignature(signature: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(signature, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Concatenate: iv + authTag + ciphertext
    return iv.toString('hex') + authTag.toString('hex') + encrypted;
  } catch (error) {
    logger.error('Failed to encrypt signature', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a stored signature
 */
export function decryptSignature(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    
    // Extract components
    const iv = Buffer.from(encryptedData.slice(0, IV_LENGTH * 2), 'hex');
    const authTag = Buffer.from(encryptedData.slice(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2), 'hex');
    const ciphertext = encryptedData.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Failed to decrypt signature', error);
    throw new Error('Decryption failed - signature may be corrupted');
  }
}

/**
 * Generate a new encryption key (for setup)
 * Run: npx ts-node -e "import('./src/utils/encryption').then(m => console.log(m.generateEncryptionKey()))"
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
