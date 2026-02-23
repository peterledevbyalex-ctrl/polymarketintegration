declare module 'opossum' {
  export interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    enabled?: boolean;
    name?: string;
  }

  class CircuitBreaker<T = any, R = any> {
    name?: string;
    constructor(action: (...args: T[]) => Promise<R>, options?: CircuitBreakerOptions);
    fire(...args: T[]): Promise<R>;
    open(): void;
    close(): void;
    halfOpen(): void;
    isOpen(): boolean;
    enabled: boolean;
    on(event: 'open' | 'halfOpen' | 'close' | 'failure', handler: (...args: any[]) => void): void;
  }

  export { CircuitBreaker };
  export default CircuitBreaker;
}
