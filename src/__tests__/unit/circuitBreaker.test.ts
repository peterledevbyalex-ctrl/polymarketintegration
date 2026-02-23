import { createCircuitBreaker } from '../../utils/circuitBreaker';

// Mock opossum
jest.mock('opossum', () => {
  const EventEmitter = require('events');
  
  class MockCircuitBreaker extends EventEmitter {
    private fn: Function;
    private _isOpen: boolean = false;
    
    constructor(fn: Function, _options?: any) {
      super();
      this.fn = fn;
    }
    
    async fire(...args: any[]) {
      if (this._isOpen) {
        throw new Error('Circuit is open');
      }
      return this.fn(...args);
    }
    
    isOpen() {
      return this._isOpen;
    }
    
    open() {
      this._isOpen = true;
      this.emit('open');
    }
    
    close() {
      this._isOpen = false;
      this.emit('close');
    }
  }
  
  return {
    __esModule: true,
    default: MockCircuitBreaker,
    CircuitBreaker: MockCircuitBreaker,
  };
});

describe('CircuitBreaker', () => {
  it('should execute function when circuit is closed', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const breaker = createCircuitBreaker(fn);

    const result = await breaker.fire('arg1');

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledWith('arg1');
  });

  it('should reject when circuit is open', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const breaker = createCircuitBreaker(fn);

    breaker.open();

    await expect(breaker.fire()).rejects.toThrow('Circuit is open');
  });

  it('should allow calls after circuit closes', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const breaker = createCircuitBreaker(fn);

    breaker.open();
    breaker.close();

    const result = await breaker.fire();
    expect(result).toBe('result');
  });

  it('should emit events on state change', () => {
    const fn = jest.fn();
    const breaker = createCircuitBreaker(fn);
    const openHandler = jest.fn();
    const closeHandler = jest.fn();

    breaker.on('open', openHandler);
    breaker.on('close', closeHandler);

    breaker.open();
    expect(openHandler).toHaveBeenCalled();

    breaker.close();
    expect(closeHandler).toHaveBeenCalled();
  });

  it('should pass through function errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('function error'));
    const breaker = createCircuitBreaker(fn);

    await expect(breaker.fire()).rejects.toThrow('function error');
  });
});
