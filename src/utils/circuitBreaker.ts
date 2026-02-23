import CircuitBreaker from 'opossum';
import logger from './logger';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  monitoring?: boolean;
}

/**
 * Create a circuit breaker for external API calls
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: CircuitBreakerOptions = {}
): CircuitBreaker {
  const {
    timeout = 10000,
    errorThresholdPercentage = 50,
    resetTimeout = 30000,
    monitoring = true,
  } = options;

  const breaker = new CircuitBreaker(fn, {
    timeout,
    errorThresholdPercentage,
    resetTimeout,
    name: fn.name || 'CircuitBreaker',
  });

  if (monitoring) {
    breaker.on('open', () => {
      logger.warn(`Circuit breaker OPEN for ${breaker.name}`);
    });

    breaker.on('halfOpen', () => {
      logger.info(`Circuit breaker HALF_OPEN for ${breaker.name}`);
    });

    breaker.on('close', () => {
      logger.info(`Circuit breaker CLOSED for ${breaker.name}`);
    });

    breaker.on('failure', (error: Error) => {
      logger.error(`Circuit breaker failure for ${breaker.name}`, error);
    });
  }

  return breaker;
}
