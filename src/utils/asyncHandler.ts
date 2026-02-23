import { Request, Response, NextFunction } from 'express';

/**
 * Wraps async route handlers to automatically catch errors and pass them to error handler
 * This prevents unhandled promise rejections and ensures errors are properly caught
 */
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
