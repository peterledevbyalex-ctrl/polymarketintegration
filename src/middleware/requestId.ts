import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Middleware that adds a unique request ID to each request.
 * Uses X-Request-ID header if provided, otherwise generates a new UUID.
 * Adds the request ID to response headers for client-side correlation.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
}
