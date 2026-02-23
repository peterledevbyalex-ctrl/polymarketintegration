import { Request, Response, NextFunction } from 'express';
import { validate } from '../../middleware/validation';
import { errorHandler, AppError } from '../../middleware/errorHandler';
import { checkAmountLimit } from '../../middleware/userRateLimit';
import { z } from 'zod';

jest.mock('../../config', () => ({
  config: {
    rateLimit: { windowMs: 60000 },
  },
}));

describe('Middleware', () => {
  describe('validation middleware', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().positive(),
    });

    it('should pass validation for valid data', () => {
      const req = { body: { name: 'Test', age: 25 } } as Request;
      const res = {} as Response;
      const next = jest.fn();

      validate(testSchema)(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.body).toEqual({ name: 'Test', age: 25 });
    });

    it('should throw AppError for invalid data', () => {
      const req = { body: { name: '', age: -5 } } as Request;
      const res = {} as Response;
      const next = jest.fn();

      expect(() => validate(testSchema)(req, res, next)).toThrow(AppError);
    });

    it('should throw AppError for missing fields', () => {
      const req = { body: {} } as Request;
      const res = {} as Response;
      const next = jest.fn();

      expect(() => validate(testSchema)(req, res, next)).toThrow(AppError);
    });
  });

  describe('errorHandler middleware', () => {
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    it('should handle AppError', () => {
      const error = new AppError(400, 'Bad request', 'BAD_REQUEST');
      const req = {} as Request;

      errorHandler(error, req, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Bad request',
        }),
      }));
    });

    it('should handle generic errors as 500', () => {
      const error = new Error('Something went wrong');
      const req = {} as Request;

      errorHandler(error, req, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
        }),
      }));
    });

    it('should handle errors without exposing stack traces', () => {
      const error = new Error('Internal error');
      const req = {} as Request;

      errorHandler(error, req, mockRes as Response, mockNext);

      // Stack traces should not be exposed to clients
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    });
  });

  describe('AppError class', () => {
    it('should create AppError with correct properties', () => {
      const error = new AppError(404, 'Not found', 'NOT_FOUND');

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error).toBeInstanceOf(Error);
    });

    it('should work without code', () => {
      const error = new AppError(500, 'Internal error');

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Internal error');
      expect(error.code).toBeUndefined();
    });
  });

  describe('checkAmountLimit middleware', () => {
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
    });

    it('should pass for valid amount', () => {
      const req = { body: { inputAmountWei: '1000000000000000000' } } as Request;

      checkAmountLimit(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass when no amount provided', () => {
      const req = { body: {} } as Request;

      checkAmountLimit(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject amount exceeding maximum', () => {
      const req = { body: { inputAmountWei: '999999999999999999999999' } } as Request;

      checkAmountLimit(req, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'AMOUNT_TOO_LARGE',
        }),
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
