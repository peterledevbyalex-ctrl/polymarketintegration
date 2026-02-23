import jwt from 'jsonwebtoken';
import logger from './logger';

/**
 * JWT secret for signing tokens
 * Should be the same as Supabase JWT secret for RLS to work
 */
function getJWTSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET or JWT_SECRET must be configured for RLS');
  }
  return secret;
}

/**
 * Generate a JWT token for a wallet address
 * This token is used with Supabase RLS policies
 * 
 * @param walletAddress - Ethereum wallet address (0x...)
 * @param expiresIn - Token expiration (default: 1 hour)
 * @returns JWT token string
 */
export function generateWalletJWT(
  walletAddress: string,
  expiresIn: string = '1h'
): string {
  try {
    const secret = getJWTSecret();
    
    // Calculate expiration time
    const now = Math.floor(Date.now() / 1000);
    let exp: number;
    
    if (expiresIn === '1h') {
      exp = now + 3600; // 1 hour
    } else if (expiresIn === '24h') {
      exp = now + 86400; // 24 hours
    } else {
      // Parse other formats like '2h', '30m', etc.
      const match = expiresIn.match(/^(\d+)([hms])$/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600 };
        exp = now + (value * (multipliers[unit] || 3600));
      } else {
        exp = now + 3600; // Default to 1 hour
      }
    }
    
    // Create JWT with wallet address in claims
    // Supabase RLS can access these via auth.jwt() ->> 'wallet_address'
    const token = jwt.sign(
      {
        wallet_address: walletAddress.toLowerCase(),
        address: walletAddress.toLowerCase(), // Alternative claim name
        aud: 'authenticated', // Supabase expects this
        role: 'authenticated', // Supabase role
        exp, // Explicit expiration
        iat: now, // Issued at
      },
      secret,
      {
        algorithm: 'HS256',
      }
    );

    return token;
  } catch (error) {
    // Don't log walletAddress in error - it's already in the context
    logger.error('Failed to generate JWT token', { error: error instanceof Error ? error.message : 'Unknown error' });
    throw new Error('Failed to generate authentication token');
  }
}

/**
 * Verify a JWT token and extract wallet address
 * 
 * @param token - JWT token string
 * @returns Wallet address if valid, null otherwise
 */
export function verifyWalletJWT(token: string): string | null {
  try {
    const secret = getJWTSecret();
    const decoded = jwt.verify(token, secret) as any;
    
    return decoded.wallet_address || decoded.address || null;
  } catch (error) {
    logger.warn('Invalid JWT token', { error });
    return null;
  }
}
