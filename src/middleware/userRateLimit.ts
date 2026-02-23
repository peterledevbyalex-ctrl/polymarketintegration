import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Per-user rate limiter (per spec 10.3)
export const userRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: 10, // Per-user limit (lower than global)
  keyGenerator: (req: Request): string => {
    // Use megaethAddress from body or user ID from auth
    const address = req.body?.megaethAddress || req.headers['x-user-address'] || req.ip;
    return `user:${address}`;
  },
  message: 'Too many requests from this user, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Amount limit check middleware
export const checkAmountLimit = (req: Request, res: Response, next: NextFunction) => {
  const amount = req.body?.inputAmountWei;
  if (!amount) {
    return next();
  }

  const maxAmount = process.env.MAX_TRADE_AMOUNT_WEI || '100000000000000000000';
  if (BigInt(amount) > BigInt(maxAmount)) {
    return res.status(400).json({
      error: {
        code: 'AMOUNT_TOO_LARGE',
        message: `Amount exceeds maximum limit: ${maxAmount} wei`,
      },
    });
  }

  next();
};
