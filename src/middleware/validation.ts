import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from './errorHandler';
import logger from '../utils/logger';

export const validate = (schema: z.ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Log the actual validation errors for debugging
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
        logger.warn('Validation failed', { 
          path: req.path,
          issues,
          receivedFields: Object.keys(req.body || {}),
        });
        throw new AppError(400, `Validation error: ${issues.join(', ')}`, 'VALIDATION_ERROR');
      }
      next(error);
    }
  };
};

