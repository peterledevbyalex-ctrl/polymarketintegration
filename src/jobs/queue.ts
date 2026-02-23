import { Queue, QueueEvents } from 'bullmq';
import logger from '../utils/logger';
import Redis from 'ioredis';

// Parse Redis URL or use individual settings
function getRedisConnection(): Redis | object {
  if (process.env.REDIS_URL) {
    // For URLs like rediss://... (TLS) or redis://...
    const redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    });
    
    redis.on('connect', () => {
      logger.info('Redis connected');
    });
    
    redis.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });
    
    return redis;
  }
  
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

const connection = getRedisConnection();

// Test Redis connection on startup
export async function testRedisConnection(): Promise<boolean> {
  try {
    if (connection instanceof Redis) {
      const testKey = 'prism:connection-test';
      await connection.set(testKey, Date.now().toString());
      const result = await connection.get(testKey);
      await connection.del(testKey);
      logger.info('Redis connection verified', { testValue: result });
      return true;
    } else if (process.env.REDIS_HOST) {
      // For non-URL connections, create temporary client to test
      const testClient = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
      });
      await testClient.ping();
      logger.info('Redis PING successful');
      testClient.disconnect();
      return true;
    }
    logger.warn('Redis not configured');
    return false;
  } catch (error: any) {
    logger.error('Redis connection test failed', { error: error.message });
    return false;
  }
}

// Job queues
export const relayPollQueue = new Queue('relay-poll', { connection: connection as any });
export const orderStatusQueue = new Queue('order-status', { connection: connection as any });

// Queue events for monitoring
export const relayPollEvents = new QueueEvents('relay-poll', { connection: connection as any });
export const orderStatusEvents = new QueueEvents('order-status', { connection: connection as any });

// Setup event listeners
relayPollEvents.on('completed', ({ jobId }) => {
  logger.info(`Relay poll job ${jobId} completed`);
});

relayPollEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Relay poll job ${jobId} failed`, { reason: failedReason });
});

orderStatusEvents.on('completed', ({ jobId }) => {
  logger.info(`Order status job ${jobId} completed`);
});

orderStatusEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Order status job ${jobId} failed`, { reason: failedReason });
});

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await relayPollQueue.close();
  await orderStatusQueue.close();
  await relayPollEvents.close();
  await orderStatusEvents.close();
}
