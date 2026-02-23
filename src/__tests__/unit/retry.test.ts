import { retry } from '../../utils/retry';

describe('retry utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await retry(fn, { maxAttempts: 3 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const result = await retry(fn, { maxAttempts: 3, initialDelay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max attempts exceeded', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retry(fn, { maxAttempts: 3, initialDelay: 10 })
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const start = Date.now();
    await retry(fn, { maxAttempts: 3, initialDelay: 50 });
    const duration = Date.now() - start;

    // Should have waited at least 50ms + 100ms = 150ms
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  it('should respect maxDelay', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const start = Date.now();
    await retry(fn, { maxAttempts: 3, initialDelay: 100, maxDelay: 100 });
    const duration = Date.now() - start;

    // Should not exceed maxDelay
    expect(duration).toBeLessThan(500);
  });

  it('should only retry retryable errors when specified', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout error'))
      .mockResolvedValueOnce('success');

    const result = await retry(fn, {
      maxAttempts: 3,
      initialDelay: 10,
      retryableErrors: ['timeout'],
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry non-retryable errors', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('auth error'));

    await expect(
      retry(fn, {
        maxAttempts: 3,
        initialDelay: 10,
        retryableErrors: ['timeout'],
      })
    ).rejects.toThrow('auth error');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
