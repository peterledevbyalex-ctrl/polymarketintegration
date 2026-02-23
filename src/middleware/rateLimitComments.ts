import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Rate limiter for comments endpoints
 * Stricter limits for write operations
 */
export const commentsRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: 'Too many comment requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in test environment
    return config.server.nodeEnv === 'test';
  },
});

/**
 * Rate limiter for favorites endpoints
 */
export const favoritesRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP (read-heavy)
  message: 'Too many favorite requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return config.server.nodeEnv === 'test';
  },
});
