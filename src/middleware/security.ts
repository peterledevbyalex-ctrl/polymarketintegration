import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Enforce HTTPS in production
 */
export const enforceHTTPS = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (config.server.nodeEnv === 'production') {
    // Check if request is secure (HTTPS)
    const isSecure = 
      req.secure || // Direct HTTPS
      req.headers['x-forwarded-proto'] === 'https' || // Behind proxy (Railway, etc.)
      req.headers['x-forwarded-ssl'] === 'on'; // Alternative proxy header

    if (!isSecure) {
      logger.warn('HTTPS enforcement: Non-HTTPS request blocked', {
        path: req.path,
        ip: req.ip,
        protocol: req.protocol,
      });
      res.status(403).json({
        error: {
          code: 'HTTPS_REQUIRED',
          message: 'HTTPS is required for this API',
        },
      });
      return;
    }
  }
  next();
};

/**
 * Sanitize error objects to remove sensitive information
 */
export function sanitizeError(error: any): any {
  if (!error) return error;

  const sanitized: any = {};

  // Only include safe error properties
  if (error.message) {
    sanitized.message = sanitizeErrorMessage(error.message);
  }
  if (error.code) {
    sanitized.code = error.code;
  }
  if (error.statusCode) {
    sanitized.statusCode = error.statusCode;
  }

  // In development, include more details
  if (config.server.nodeEnv === 'development') {
    if (error.stack) {
      sanitized.stack = error.stack;
    }
    if (error.name) {
      sanitized.name = error.name;
    }
  }

  return sanitized;
}

/**
 * Sanitize error messages to remove sensitive information
 */
function sanitizeErrorMessage(message: string): string {
  if (!message) return message;

  // Remove potential secrets/keys
  let sanitized = message
    .replace(/password[=:]\s*['"]?[^'"]+['"]?/gi, 'password=***')
    .replace(/secret[=:]\s*['"]?[^'"]+['"]?/gi, 'secret=***')
    .replace(/key[=:]\s*['"]?[^'"]+['"]?/gi, 'key=***')
    .replace(/token[=:]\s*['"]?[^'"]+['"]?/gi, 'token=***')
    .replace(/api[_-]?key[=:]\s*['"]?[^'"]+['"]?/gi, 'api_key=***')
    .replace(/authorization[=:]\s*['"]?[^'"]+['"]?/gi, 'authorization=***')
    .replace(/0x[a-fA-F0-9]{64}/g, '0x***') // Private keys
    .replace(/0x[a-fA-F0-9]{40}/g, '0x***'); // Addresses (if needed)

  // Remove database connection strings
  sanitized = sanitized.replace(
    /(postgres|postgresql|mysql|mongodb):\/\/[^@]+@[^\s'"]+/g,
    '***://***@***'
  );

  // Remove file paths that might expose structure
  if (config.server.nodeEnv === 'production') {
    sanitized = sanitized.replace(/\/[^\s'"]*\.(ts|js|json|env)/g, '/***');
  }

  return sanitized;
}

/**
 * Redact sensitive data from objects before logging
 */
export function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'authorization',
    'privateKey',
    'private_key',
    'walletSignature',
    'signature',
    'encryptedSignature',
    'serviceRoleKey',
    'jwtSecret',
  ];

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in redacted) {
    const lowerKey = key.toLowerCase();
    
    // Check if key contains sensitive terms
    if (sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()))) {
      redacted[key] = '***REDACTED***';
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveData(redacted[key]);
    } else if (typeof redacted[key] === 'string') {
      // Check if value looks like a secret
      const value = redacted[key] as string;
      if (
        value.length > 20 && // Long strings might be secrets
        (value.startsWith('0x') || value.includes('Bearer ') || value.match(/^[A-Za-z0-9+/=]{40,}$/))
      ) {
        redacted[key] = '***REDACTED***';
      }
    }
  }

  return redacted;
}
