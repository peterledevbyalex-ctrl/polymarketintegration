describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set required env vars
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-12345678901234567890';
    process.env.RELAY_API_URL = 'https://api.relay.link';
    process.env.RELAY_API_KEY = 'test-relay-key';
    process.env.RELAY_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.POLYMARKET_RELAYER_URL = 'https://relayer.polymarket.com';
    process.env.POLYMARKET_BUILDER_API_KEY = 'test-builder-key';
    process.env.POLYMARKET_BUILDER_SECRET = 'test-builder-secret';
    process.env.POLYMARKET_BUILDER_PASSPHRASE = 'test-passphrase';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load config with default values', () => {
    const { config } = require('../../config');
    
    expect(config.server.port).toBeDefined();
    expect(config.supabase.url).toBe('https://test.supabase.co');
    expect(config.relay.apiUrl).toBe('https://api.relay.link');
  });

  it('should use custom port from env', () => {
    process.env.PORT = '4000';
    jest.resetModules();
    
    const { config } = require('../../config');
    
    expect(config.server.port).toBe(4000);
  });

  it('should load polymarket config', () => {
    const { config } = require('../../config');
    
    expect(config.polymarket.relayerUrl).toBe('https://relayer.polymarket.com');
    expect(config.polymarket.builderApiKey).toBe('test-builder-key');
  });

  it('should load chain IDs', () => {
    const { config } = require('../../config');
    
    expect(config.chains.megaeth).toBeDefined();
    expect(config.chains.polygon).toBe(137);
  });

  it('should load feature flags', () => {
    process.env.ENABLE_BACKGROUND_JOBS = 'true';
    process.env.ENABLE_METRICS = 'true';
    process.env.ENABLE_WEBSOCKET = 'true';
    jest.resetModules();
    
    const { config } = require('../../config');
    
    expect(config.features).toBeDefined();
  });

  it('should load rate limit config', () => {
    process.env.RATE_LIMIT_WINDOW_MS = '30000';
    process.env.RATE_LIMIT_MAX_REQUESTS = '50';
    jest.resetModules();
    
    const { config } = require('../../config');
    
    expect(config.rateLimit).toBeDefined();
  });
});
