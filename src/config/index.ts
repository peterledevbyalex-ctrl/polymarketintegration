import dotenv from 'dotenv';

// Load env vars first
dotenv.config();

// Create a simple logger for config validation (avoid circular dependency with logger.ts)
const createSimpleLogger = () => ({
  info: (msg: string) => {
    if (process.env.NODE_ENV !== 'test') console.log(`[INFO] ${msg}`);
  },
  warn: (msg: string) => {
    if (process.env.NODE_ENV !== 'test') console.warn(`[WARN] ${msg}`);
  },
  error: (msg: string) => {
    if (process.env.NODE_ENV !== 'test') console.error(`[ERROR] ${msg}`);
  },
  debug: (_msg: string) => {},
});

const logger = createSimpleLogger();

// Validate required environment variables
function validateConfig(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RELAY_API_URL',
    'POLYMARKET_RELAYER_URL',
    'POLYMARKET_BUILDER_API_KEY',
    'POLYMARKET_BUILDER_SECRET',
    'POLYMARKET_BUILDER_PASSPHRASE',
  ];

  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const error = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error(error);
    throw new Error(error);
  }

  // Validate secret formats
  const warnings: string[] = [];
  
  if (process.env.USER_KEY_ENCRYPTION_KEY && process.env.USER_KEY_ENCRYPTION_KEY.length < 32) {
    warnings.push('USER_KEY_ENCRYPTION_KEY should be at least 32 characters');
  }
  
  if (process.env.POLYMARKET_SERVICE_PRIVATE_KEY && !process.env.POLYMARKET_SERVICE_PRIVATE_KEY.startsWith('0x')) {
    warnings.push('POLYMARKET_SERVICE_PRIVATE_KEY should start with 0x');
  }

  // Validate Redis if background jobs are enabled
  if (process.env.ENABLE_BACKGROUND_JOBS !== 'false') {
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) {
      warnings.push('Redis not configured - background jobs will not work');
    }
  }

  // Production-specific checks
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.CORS_ORIGINS) {
      warnings.push('CORS_ORIGINS not set - using default whitelist');
    }
    if (process.env.LOG_LEVEL === 'debug') {
      warnings.push('LOG_LEVEL is debug in production - may expose sensitive data');
    }
  }

  warnings.forEach(w => logger.warn(w));
  logger.info('Configuration validated successfully');
}

// Run validation (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  relay: {
    // Relay API - referrer/apiKey help with latency
    // Docs: https://docs.relay.link/references/api/quickstart
    apiUrl: process.env.RELAY_API_URL || 'https://api.relay.link',
    apiKey: process.env.RELAY_API_KEY || '', // Optional - request from Relay team for priority
    referrer: process.env.RELAY_REFERRER || '', // Optional - identifies your app (e.g., 'prism.app')
    webhookSecret: process.env.RELAY_WEBHOOK_SECRET || '',
  },
  polymarket: {
    relayerUrl: process.env.POLYMARKET_RELAYER_URL || '',
    clobApiUrl: process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com',
    builderApiKey: process.env.POLYMARKET_BUILDER_API_KEY || '',
    builderSecret: process.env.POLYMARKET_BUILDER_SECRET || '',
    builderPassphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE || '',
  },
  chains: {
    megaeth: parseInt(process.env.MEGAETH_CHAIN_ID || '4326', 10),
    polygon: parseInt(process.env.POLYGON_CHAIN_ID || '137', 10),
  },
  tokens: {
    polygonUsdcE: process.env.POLYGON_USDC_E_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    url: process.env.REDIS_URL,
  },
  features: {
    backgroundJobs: process.env.ENABLE_BACKGROUND_JOBS !== 'false',
    metrics: process.env.ENABLE_METRICS !== 'false',
    websocket: process.env.ENABLE_WEBSOCKET === 'true',
  },
};

