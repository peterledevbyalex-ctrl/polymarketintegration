// Enhanced error handling for Polymarket API

export interface PolymarketErrorDetails {
  code: string;
  message: string;
  status?: number;
  timestamp: string;
  context?: Record<string, any>;
}

export class PolymarketAPIError extends Error {
  public readonly code: string;
  public readonly status?: number;
  public readonly timestamp: string;
  public readonly context?: Record<string, any>;

  constructor(
    code: string,
    message: string,
    status?: number,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'PolymarketAPIError';
    this.code = code;
    this.status = status;
    this.timestamp = new Date().toISOString();
    this.context = context;
  }

  toJSON(): PolymarketErrorDetails {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

// Specific error types
export class NetworkError extends PolymarketAPIError {
  constructor(message: string, context?: Record<string, any>) {
    super('NETWORK_ERROR', message, undefined, context);
  }
}

export class TimeoutError extends PolymarketAPIError {
  constructor(timeoutMs: number, url: string) {
    super(
      'TIMEOUT_ERROR',
      `Request timed out after ${timeoutMs}ms`,
      408,
      { timeoutMs, url }
    );
  }
}

export class RateLimitError extends PolymarketAPIError {
  constructor(retryAfter?: number) {
    super(
      'RATE_LIMIT_ERROR',
      'Rate limit exceeded',
      429,
      { retryAfter }
    );
  }
}

export class ValidationError extends PolymarketAPIError {
  constructor(field: string, reason: string) {
    super(
      'VALIDATION_ERROR',
      `Invalid ${field}: ${reason}`,
      400,
      { field, reason }
    );
  }
}

export class AuthenticationError extends PolymarketAPIError {
  constructor(message?: string) {
    super(
      'AUTHENTICATION_ERROR',
      message || 'Authentication failed',
      401
    );
  }
}

export class MarketNotFoundError extends PolymarketAPIError {
  constructor(marketId: string) {
    super(
      'MARKET_NOT_FOUND',
      `Market not found: ${marketId}`,
      404,
      { marketId }
    );
  }
}

export class TradingError extends PolymarketAPIError {
  constructor(message: string, context?: Record<string, any>) {
    super('TRADING_ERROR', message, 400, context);
  }
}

// Error mapping from API responses
export const mapAPIError = (response: Response, data: any): PolymarketAPIError => {
  const status = response.status;
  const apiError = data?.error;
  
  if (status === 429) {
    const retryAfter = response.headers.get('retry-after');
    return new RateLimitError(retryAfter ? parseInt(retryAfter) : undefined);
  }
  
  if (status === 401) {
    return new AuthenticationError(apiError?.message);
  }
  
  if (status === 404) {
    if (apiError?.code === 'MARKET_NOT_FOUND') {
      return new MarketNotFoundError(apiError.context?.marketId || 'unknown');
    }
  }
  
  if (status === 400 && apiError?.code === 'VALIDATION_ERROR') {
    return new ValidationError(
      apiError.context?.field || 'unknown',
      apiError.message
    );
  }
  
  if (status >= 500) {
    return new PolymarketAPIError(
      'SERVER_ERROR',
      'Polymarket API server error',
      status,
      { originalError: apiError }
    );
  }
  
  // Generic error
  return new PolymarketAPIError(
    apiError?.code || 'UNKNOWN_ERROR',
    apiError?.message || 'An unknown error occurred',
    status,
    { originalError: apiError }
  );
};

// Enhanced response handler with better error mapping
export const handleResponse = async <T>(
  response: Response,
  url?: string
): Promise<T> => {
  if (!response.ok) {
    let errorData: any = {};
    
    try {
      errorData = await response.json();
    } catch {
      // If we can't parse JSON, create a generic error
      throw new PolymarketAPIError(
        'RESPONSE_PARSE_ERROR',
        `Failed to parse error response from ${url}`,
        response.status
      );
    }
    
    throw mapAPIError(response, errorData);
  }
  
  try {
    return await response.json();
  } catch (error) {
    throw new PolymarketAPIError(
      'RESPONSE_PARSE_ERROR',
      `Failed to parse response JSON from ${url}`,
      response.status,
      { originalError: error }
    );
  }
};

// Retry utility with exponential backoff
export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    retryIf?: (error: Error) => boolean;
  } = {}
): Promise<T> => {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryIf = (error: Error) => 
      error instanceof NetworkError || 
      error instanceof TimeoutError ||
      (error instanceof PolymarketAPIError && error.status && error.status >= 500)
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on final attempt or non-retryable errors
      if (attempt === maxAttempts || !retryIf(lastError)) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelay * Math.pow(backoffFactor, attempt - 1),
        maxDelay
      );
      
      // Add jitter to prevent thundering herd
      const jitteredDelay = delay * (0.5 + Math.random() * 0.5);
      
      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }
  
  throw lastError!;
};

// User-friendly error messages
export const getErrorMessage = (error: Error): string => {
  if (error instanceof PolymarketAPIError) {
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Network connection failed. Please check your internet connection.';
      case 'TIMEOUT_ERROR':
        return 'Request timed out. Please try again.';
      case 'RATE_LIMIT_ERROR':
        return 'Too many requests. Please wait a moment and try again.';
      case 'AUTHENTICATION_ERROR':
        return 'Authentication failed. Please reconnect your wallet.';
      case 'MARKET_NOT_FOUND':
        return 'Market not found. It may have been removed or resolved.';
      case 'VALIDATION_ERROR':
        return `Invalid input: ${error.message}`;
      case 'TRADING_ERROR':
        return `Trading error: ${error.message}`;
      case 'SERVER_ERROR':
        return 'Polymarket servers are temporarily unavailable. Please try again later.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
  
  return error.message || 'An unexpected error occurred.';
};

// Error boundary helper for React components
export const isRetryableError = (error: Error): boolean => {
  return error instanceof NetworkError ||
         error instanceof TimeoutError ||
         (error instanceof PolymarketAPIError && 
          error.status !== undefined && 
          error.status >= 500);
};