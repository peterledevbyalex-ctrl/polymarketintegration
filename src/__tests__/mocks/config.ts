/**
 * Config mock for testing
 */
export const mockConfig = {
  server: {
    port: 3000,
    nodeEnv: 'test',
  },
  supabase: {
    url: 'test-url',
    serviceRoleKey: 'test-key',
  },
  relay: {
    apiUrl: 'https://api.relay.link',
    apiKey: 'test-key',
    webhookSecret: 'test-secret',
  },
  polymarket: {
    relayerUrl: 'https://relayer-v2.polymarket.com',
    clobApiUrl: 'https://clob.polymarket.com',
    builderApiKey: 'test-key',
    builderSecret: 'test-secret',
    builderPassphrase: 'test-passphrase',
  },
  chains: {
    megaeth: 4326,
    polygon: 137,
  },
  tokens: {
    polygonUsdcE: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  },
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
  },
  logging: {
    level: 'error',
  },
  redis: {
    host: 'localhost',
    port: 6379,
    url: 'redis://localhost:6379',
  },
  features: {
    backgroundJobs: false,
    metrics: false,
    websocket: false,
  },
};
