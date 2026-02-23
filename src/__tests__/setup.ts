// Test setup file
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Set required env vars for tests to prevent config validation errors
// Must be set BEFORE any imports that use config
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://test.supabase.co';
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-123456789012345678901234567890123456789012345678901234567890';
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
if (!process.env.RELAY_API_URL) process.env.RELAY_API_URL = 'https://api.relay.link';
if (!process.env.RELAY_API_KEY) process.env.RELAY_API_KEY = 'test-key';
if (!process.env.RELAY_WEBHOOK_SECRET) process.env.RELAY_WEBHOOK_SECRET = 'test-secret';
if (!process.env.POLYMARKET_RELAYER_URL) process.env.POLYMARKET_RELAYER_URL = 'https://relayer-v2.polymarket.com';
if (!process.env.POLYMARKET_BUILDER_API_KEY) process.env.POLYMARKET_BUILDER_API_KEY = 'test-key';
if (!process.env.POLYMARKET_BUILDER_SECRET) process.env.POLYMARKET_BUILDER_SECRET = 'test-secret';
if (!process.env.POLYMARKET_BUILDER_PASSPHRASE) process.env.POLYMARKET_BUILDER_PASSPHRASE = 'test-passphrase';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'error'; // Suppress logs in tests

// Note: Supabase mocking is done per-test file as needed

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock Winston logger globally to suppress console output during tests
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock opossum circuit breaker globally
jest.mock('opossum', () => {
  const mockCircuitBreaker = jest.fn().mockImplementation((fn: Function) => {
    return {
      fire: jest.fn((...args: any[]) => fn(...args)),
      open: jest.fn(),
      close: jest.fn(),
      halfOpen: jest.fn(),
      isOpen: jest.fn().mockReturnValue(false),
      enabled: true,
      name: 'MockCircuitBreaker',
      on: jest.fn(),
    };
  });
  return {
    __esModule: true,
    default: mockCircuitBreaker,
  };
});

// Mock @polymarket packages globally
jest.mock('@polymarket/clob-client', () => ({
  __esModule: true,
  ClobClient: jest.fn().mockImplementation(() => ({
    getOrder: jest.fn(),
    createOrder: jest.fn(),
    postOrder: jest.fn(),
    deriveApiKey: jest.fn().mockResolvedValue({ key: 'test-key', secret: 'test-secret', passphrase: 'test-pass' }),
    createApiKey: jest.fn().mockResolvedValue({ key: 'test-key', secret: 'test-secret', passphrase: 'test-pass' }),
    createAndPostOrder: jest.fn().mockResolvedValue({ orderID: 'order-123', status: 'OPEN' }),
    getPositions: jest.fn().mockResolvedValue([]),
    getOpenOrders: jest.fn().mockResolvedValue([]),
    getTradeHistory: jest.fn().mockResolvedValue([]),
    getMarket: jest.fn().mockResolvedValue({ tokens: [{ token_id: 'token-yes', outcome: 'Yes' }] }),
    getOrderbook: jest.fn().mockResolvedValue({ bids: [{ price: '0.5', size: '100' }], asks: [{ price: '0.6', size: '100' }] }),
  })),
  Chain: { POLYGON: 137 },
  Side: { BUY: 'BUY', SELL: 'SELL' },
  OrderType: { GTC: 'GTC', FOK: 'FOK', GTD: 'GTD' },
}));

jest.mock('@polymarket/builder-relayer-client', () => ({
  __esModule: true,
  BuilderRelayerClient: jest.fn().mockImplementation(() => ({
    createAndDeployProxyWallet: jest.fn().mockResolvedValue({ address: '0xMockSafeAddress' }),
    execute: jest.fn().mockResolvedValue({ hash: '0xMockTxHash' }),
  })),
}));

jest.mock('@polymarket/builder-signing-sdk', () => ({
  __esModule: true,
  buildClobEip712Signature: jest.fn().mockResolvedValue('0xMockSignature'),
  signPolyOrder: jest.fn().mockResolvedValue('0xMockOrderSignature'),
}));

jest.mock('@polymarket/order-utils', () => ({
  __esModule: true,
  SignatureType: { POLY_GNOSIS_SAFE: 2 },
}));