import { Request, Response, NextFunction } from 'express';
import { verifyWalletSignature } from '../utils/signatureKeyDerivation';
import { generateWalletJWT } from '../utils/jwt';
import { AppError } from './errorHandler';
import { supabase } from '../db/supabase';
import logger from '../utils/logger';

/**
 * Middleware to authenticate requests using wallet signatures.
 * 
 * Strategy:
 * 1. If walletSignature provided, verify it
 * 2. If no signature but user has stored signature in DB, use that
 * 3. If neither, require signature
 * 
 * After authentication, generates a JWT token for RLS enforcement.
 * This allows users to authenticate once, then use stored signatures
 * for subsequent requests without signing every action.
 */
export const authenticateWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get user address from body or params
    const userAddress = 
      req.body?.user_address || 
      req.body?.megaethAddress || 
      req.params?.userAddress ||
      req.params?.user_address;

    if (!userAddress) {
      throw new AppError(400, 'user_address is required', 'MISSING_ADDRESS');
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      throw new AppError(400, 'Invalid Ethereum address format', 'INVALID_ADDRESS');
    }

    const normalizedAddress = userAddress.toLowerCase();

    // Get signature from body or headers
    const providedSignature = 
      req.body?.walletSignature || 
      req.headers['x-wallet-signature'] as string;

    let isValid = false;

    // Strategy 1: If signature provided, verify it directly
    if (providedSignature) {
      isValid = await verifyWalletSignature(providedSignature, normalizedAddress);
      
      if (!isValid) {
        logger.warn('Invalid wallet signature', { 
          userAddress: normalizedAddress,
          ip: req.ip,
        });
        throw new AppError(401, 'Invalid wallet signature', 'INVALID_SIGNATURE');
      }
    } else {
      // Strategy 2: Check for stored signature in database
      try {
        // Get user
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('megaeth_address', normalizedAddress)
          .single();

        if (!user) {
          throw new AppError(401, 'User not found. Signature required for first-time authentication.', 'USER_NOT_FOUND');
        }

        // Get stored wallet signature
        const { data: wallet } = await supabase
          .from('polymarket_wallets')
          .select('wallet_signature, derivation_version, signature_encrypted')
          .eq('user_id', user.id)
          .single();

        if (!wallet || !wallet.wallet_signature) {
          throw new AppError(401, 'No stored signature found. Please provide walletSignature.', 'NO_STORED_SIGNATURE');
        }

        // Decrypt if needed
        let storedSignature = wallet.wallet_signature;
        if (wallet.signature_encrypted) {
          const { decryptSignature } = await import('../utils/encryption');
          storedSignature = decryptSignature(wallet.wallet_signature);
        }

        // Verify stored signature is valid for this address
        const derivationVersion = (wallet.derivation_version || 2) as 1 | 2;
        isValid = await verifyWalletSignature(storedSignature, normalizedAddress, derivationVersion);

        if (!isValid) {
          logger.warn('Stored signature invalid', { 
            userAddress: normalizedAddress,
            ip: req.ip,
          });
          throw new AppError(401, 'Stored signature is invalid. Please provide a new walletSignature.', 'INVALID_STORED_SIGNATURE');
        }
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        logger.error('Error checking stored signature', { error, userAddress: normalizedAddress });
        throw new AppError(401, 'Authentication failed. Please provide walletSignature.', 'AUTH_ERROR');
      }
    }

    // Generate JWT token for RLS enforcement
    // This token will be used by Supabase RLS policies
    const jwtToken = generateWalletJWT(normalizedAddress, '24h'); // 24 hour expiry

    // Attach authenticated address and JWT to request
    (req as any).authenticatedAddress = normalizedAddress;
    (req as any).jwtToken = jwtToken;
    
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logger.error('Authentication error', { error });
      next(new AppError(500, 'Authentication failed', 'AUTH_ERROR'));
    }
  }
};

/**
 * Optional authentication - doesn't fail if signature is missing
 * Useful for endpoints that work with or without auth
 */
export const optionalAuthenticateWallet = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userAddress = 
      req.body?.user_address || 
      req.body?.megaethAddress || 
      req.params?.userAddress ||
      req.params?.user_address;

    const providedSignature = 
      req.body?.walletSignature || 
      req.headers['x-wallet-signature'] as string;

    // If both are provided, try to authenticate
    if (userAddress && providedSignature) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
        throw new AppError(400, 'Invalid Ethereum address format', 'INVALID_ADDRESS');
      }

      const isValid = await verifyWalletSignature(providedSignature, userAddress.toLowerCase());
      if (isValid) {
        const normalizedAddress = userAddress.toLowerCase();
        (req as any).authenticatedAddress = normalizedAddress;
        (req as any).jwtToken = generateWalletJWT(normalizedAddress, '24h');
      }
    } else if (userAddress) {
      // Try to use stored signature
      try {
        const normalizedAddress = userAddress.toLowerCase();
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('megaeth_address', normalizedAddress)
          .single();

        if (user) {
          const { data: wallet } = await supabase
            .from('polymarket_wallets')
            .select('wallet_signature, derivation_version, signature_encrypted')
            .eq('user_id', user.id)
            .single();

          if (wallet?.wallet_signature) {
            let storedSignature = wallet.wallet_signature;
            if (wallet.signature_encrypted) {
              const { decryptSignature } = await import('../utils/encryption');
              storedSignature = decryptSignature(wallet.wallet_signature);
            }

            const derivationVersion = (wallet.derivation_version || 2) as 1 | 2;
            const isValid = await verifyWalletSignature(storedSignature, normalizedAddress, derivationVersion);
            
            if (isValid) {
              (req as any).authenticatedAddress = normalizedAddress;
              (req as any).jwtToken = generateWalletJWT(normalizedAddress, '24h');
            }
          }
        }
      } catch (error) {
        // Silently fail for optional auth
        logger.debug('Optional auth failed', { error });
      }
    }

    next();
  } catch (error) {
    // For optional auth, only fail on invalid address format
    if (error instanceof AppError && error.code === 'INVALID_ADDRESS') {
      next(error);
    } else {
      logger.debug('Optional authentication failed, continuing without auth', { error });
      next();
    }
  }
};
