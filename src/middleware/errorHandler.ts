import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { config } from '../config';
import { sanitizeError, redactSensitiveData } from './security';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Sanitize error for logging (remove sensitive data)
  const sanitizedError = sanitizeError(err);
  const redactedError = redactSensitiveData(sanitizedError);

  if (err instanceof AppError) {
    // Operational errors (expected errors)
    logger.warn(`AppError: ${err.message}`, {
      code: err.code,
      path: req.path,
      method: req.method,
      ...(config.server.nodeEnv === 'development' && { error: redactedError }),
    });

    res.status(err.statusCode).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
      },
    });
    return;
  }

  // Programming errors (unexpected errors)
  logger.error('Unhandled error', {
    error: redactedError,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    // Only log stack in development
    ...(config.server.nodeEnv === 'development' && { stack: err.stack }),
  });

  // In production, don't expose internal error details
  const errorMessage = config.server.nodeEnv === 'production'
    ? 'An unexpected error occurred'
    : err.message;

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: errorMessage,
    },
  });
};

