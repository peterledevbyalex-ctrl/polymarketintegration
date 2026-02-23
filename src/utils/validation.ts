import { getAddress, isAddress } from 'viem';

/**
 * Validates and checksums an Ethereum address
 * @param address - The address to validate
 * @returns The checksummed address
 * @throws Error if the address is invalid
 */
export function validateAndChecksumAddress(address: string): string {
  if (!isAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return getAddress(address);
}

/**
 * Checks if a string is a valid Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Validates a transaction hash format
 */
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validates a signature format (EIP-191)
 */
export function isValidSignature(signature: string): boolean {
  // EIP-191 signatures are 65 bytes (130 hex chars + 0x prefix)
  return /^0x[a-fA-F0-9]{130}$/.test(signature);
}

/**
 * Sanitizes a string input to prevent injection
 */
export function sanitizeString(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  // Remove null bytes and trim
  return input.replace(/\0/g, '').trim().slice(0, maxLength);
}

/**
 * Validates UUID format
 */
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Redacts sensitive data for logging
 */
export function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['privateKey', 'private_key', 'signature', 'password', 'secret', 'token', 'apiKey', 'api_key'];
  const redacted = { ...obj };
  
  for (const key of Object.keys(redacted)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key] = redactSensitive(redacted[key] as Record<string, unknown>);
    }
  }
  
  return redacted;
}
