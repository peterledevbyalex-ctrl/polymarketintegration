import Redis from 'ioredis';
import logger from './logger';

// Get Redis client for caching
function getRedisClient(): Redis | null {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 200, 2000);
      },
    });
  }
  
  if (process.env.REDIS_HOST) {
    return new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });
  }
  
  return null;
}

const redisClient = getRedisClient();

// In-memory fallback cache if Redis is unavailable
const memoryCache = new Map<string, { data: any; expires: number }>();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up expired memory cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (value.expires < now) {
      memoryCache.delete(key);
    }
  }
}, 60000); // Clean every minute

export class Cache {
  /**
   * Get cached value
   */
  static async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    if (redisClient) {
      try {
        const value = await redisClient.get(key);
        if (value) {
          return JSON.parse(value) as T;
        }
      } catch (error) {
        logger.warn('Redis get error, falling back to memory cache', { key, error: (error as Error).message });
      }
    }
    
    // Fallback to memory cache
    const cached = memoryCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
    
    if (cached) {
      memoryCache.delete(key);
    }
    
    return null;
  }

  /**
   * Set cached value with TTL (in seconds)
   */
  static async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    const serialized = JSON.stringify(value);
    
    // Try Redis first
    if (redisClient) {
      try {
        await redisClient.setex(key, ttlSeconds, serialized);
        return;
      } catch (error) {
        logger.warn('Redis set error, falling back to memory cache', { key, error: (error as Error).message });
      }
    }
    
    // Fallback to memory cache
    memoryCache.set(key, {
      data: value,
      expires: Date.now() + (ttlSeconds * 1000),
    });
  }

  /**
   * Delete cached value
   */
  static async del(key: string): Promise<void> {
    if (redisClient) {
      try {
        await redisClient.del(key);
      } catch (error) {
        logger.warn('Redis del error', { key, error: (error as Error).message });
      }
    }
    
    memoryCache.delete(key);
  }

  /**
   * Check if cache is available
   */
  static isAvailable(): boolean {
    return redisClient !== null;
  }
}

// Initialize Redis connection
if (redisClient) {
  redisClient.on('connect', () => {
    logger.info('Redis cache connected');
  });
  
  redisClient.on('error', (err) => {
    logger.warn('Redis cache error (using memory fallback)', { error: err.message });
  });
  
  // Connect lazily
  redisClient.connect().catch(() => {
    // Silent fail - will use memory cache
  });
}
