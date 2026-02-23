import request from 'supertest';
import express from 'express';
import intentsRouter from '../../routes/intents';
import { IntentService } from '../../services/intentService';
import { PolymarketService } from '../../services/polymarketService';
import { createSupabaseMock } from '../mocks/supabase';

declare global {
  // eslint-disable-next-line no-var
  var __supabaseMockInstance__: ReturnType<typeof createSupabaseMock> | undefined;
}

jest.mock('../../db/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSupabaseMock } = require('../mocks/supabase');
  const mock = createSupabaseMock();
  global.__supabaseMockInstance__ = mock;
  return {
    supabase: {
      from: mock.from,
    },
  };
});

const supabaseMockInstance = () => {
  if (!global.__supabaseMockInstance__) {
    global.__supabaseMockInstance__ = createSupabaseMock();
  }
  return global.__supabaseMockInstance__;
};

jest.mock('opossum', () => {
  const mockCircuitBreaker = jest.fn().mockImplementation((fn, options) => {
    return {
      fire: jest.fn((...args) => fn(...args)),
      open: jest.fn(),
      close: jest.fn(),
      halfOpen: jest.fn(),
      isOpen: jest.fn().mockReturnValue(false),
      enabled: true,
      name: options?.name || 'CircuitBreaker',
      on: jest.fn(),
    };
  });
  return {
    __esModule: true,
    default: mockCircuitBreaker,
  };
});

jest.mock('../../services/intentService');
jest.mock('../../services/polymarketService');
jest.mock('../../middleware/userRateLimit', () => ({
  userRateLimiter: (_req: any, _res: any, next: any) => next(),
  checkAmountLimit: (_req: any, _res: any, next: any) => next(),
}));

// Mock signature verification
jest.mock('../../utils/signatureKeyDerivation', () => ({
  verifyWalletSignature: jest.fn().mockResolvedValue(true),
  derivePolygonPrivateKey: jest.fn().mockReturnValue('0x' + 'a'.repeat(64)),
  WALLET_DERIVATION_MESSAGE: 'Test message',
}));

import { errorHandler } from '../../middleware/errorHandler';

const TEST_SIGNATURE = '0x' + 'b'.repeat(130);
const TEST_TX_HASH = '0x' + 'a'.repeat(64);

describe('Intents API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/intents', intentsRouter);
    app.use(errorHandler);
    jest.clearAllMocks();
    
    const mock = supabaseMockInstance();
    Object.keys(mock.mockData).forEach(key => delete mock.mockData[key]);
    mock.mockData['polymarket_wallets'] = [{
      user_id: 'user-123',
      polygon_wallet_address: '0xSafeWallet123',
    }];
    mock.mockData['users'] = [{
      id: 'user-123',
      megaeth_address: '0x1234567890123456789012345678901234567890',
    }];
  });

  describe('GET /api/intents/wallet-message', () => {
    it('should return wallet derivation message', async () => {
      const response = await request(app)
        .get('/api/intents/wallet-message')
        .expect(200);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /api/intents', () => {
    it('should create intent with wallet signature', async () => {
      const mockIntent = {
        intent_id: 'test-intent-id',
        state: 'RELAY_QUOTED',
        user_id: 'user-123',
        market_id: 'market-123',
        outcome: 'YES',
        dest_amount_expected: '1000000',
        dest_amount_min: '950000',
        relay_quote_id: 'quote-123',
        relay_origin_tx_data: {
          chainId: 4326,
          to: '0xRelayContract',
          data: '0x1234',
          value: '0x0',
        },
      };

      (IntentService.prototype.createIntent as jest.Mock).mockResolvedValue(mockIntent);

      const response = await request(app)
        .post('/api/intents')
        .send({
          megaethAddress: '0x1234567890123456789012345678901234567890',
          marketId: 'market-123',
          outcome: 'YES',
          inputCurrency: 'native',
          inputAmountWei: '1000000000000000000',
          maxSlippageBps: 50,
          walletSignature: TEST_SIGNATURE,
        })
        .expect(200);

      expect(response.body.intentId).toBe('test-intent-id');
      expect(response.body.state).toBe('RELAY_QUOTED');
    });

    it('should accept request without signature (uses stored)', async () => {
      // Signature is now optional - will use stored signature if available
      // The IntentService handles the logic of checking for stored signature
      const mockIntent = {
        intent_id: 'test-intent-id',
        state: 'RELAY_QUOTED',
        user_id: 'user-123',
        market_id: 'market-123',
        outcome: 'YES',
        dest_amount_expected: '1000000',
        dest_amount_min: '950000',
        relay_quote_id: 'quote-123',
        relay_origin_tx_data: {
          chainId: 4326,
          to: '0xRelayContract',
          data: '0x1234',
          value: '0x0',
        },
      };

      (IntentService.prototype.createIntent as jest.Mock).mockResolvedValue(mockIntent);

      const response = await request(app)
        .post('/api/intents')
        .send({
          megaethAddress: '0x1234567890123456789012345678901234567890',
          marketId: 'market-123',
          outcome: 'YES',
          inputCurrency: 'native',
          inputAmountWei: '1000000000000000000',
          // No walletSignature - IntentService will use stored one or throw if none
        })
        .expect(200);

      expect(response.body.intentId).toBe('test-intent-id');
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/intents')
        .send({
          marketId: 'market-123',
          walletSignature: TEST_SIGNATURE,
        })
        .expect(400);
    });
  });

  describe('GET /api/intents/:intentId', () => {
    it('should get intent status', async () => {
      const mockIntent = {
        intent_id: 'test-intent-id',
        state: 'ORDER_PLACED',
        relay_status: 'executed',
        relay_origin_tx_hash: '0xorigin123',
        polygon_funding_tx_hash: '0xfunding123',
        polymarket_order_id: 'order-123',
      };

      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue(mockIntent);
      (PolymarketService.prototype.getOrderStatus as jest.Mock).mockResolvedValue({
        status: 'filled',
        filledUSDC: '1000000',
        shares: '2500000',
        avgPrice: '0.4',
      });

      const response = await request(app)
        .get('/api/intents/test-intent-id')
        .expect(200);

      expect(response.body.intentId).toBe('test-intent-id');
      expect(response.body.state).toBe('ORDER_PLACED');
    });

    it('should return 404 for non-existent intent', async () => {
      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue(null);

      await request(app)
        .get('/api/intents/non-existent')
        .expect(404);
    });
  });

  describe('POST /api/intents/:intentId/origin-tx', () => {
    it('should update origin tx with wallet signature', async () => {
      const mockIntent = {
        intent_id: 'test-intent-id',
        state: 'ORIGIN_TX_SUBMITTED',
        user_id: 'user-123',
        relay_quote_id: 'quote-123',
      };

      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue({
        intent_id: 'test-intent-id',
        user_id: 'user-123',
      });
      (IntentService.prototype.updateOriginTxHash as jest.Mock).mockResolvedValue(mockIntent);

      const response = await request(app)
        .post('/api/intents/test-intent-id/origin-tx')
        .send({ 
          txHash: TEST_TX_HASH,
          walletSignature: TEST_SIGNATURE,
        })
        .expect(200);

      expect(response.body.intentId).toBe('test-intent-id');
      expect(response.body.state).toBe('ORIGIN_TX_SUBMITTED');
    });

    it('should work without signature (uses stored signature)', async () => {
      const mockIntent = {
        intent_id: 'test-intent-id',
        state: 'ORIGIN_TX_SUBMITTED',
        user_id: 'user-123',
        relay_quote_id: 'quote-123',
      };

      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue({
        intent_id: 'test-intent-id',
        user_id: 'user-123',
      });
      (IntentService.prototype.updateOriginTxHash as jest.Mock).mockResolvedValue(mockIntent);

      const response = await request(app)
        .post('/api/intents/test-intent-id/origin-tx')
        .send({ txHash: TEST_TX_HASH })
        .expect(200);

      expect(response.body.intentId).toBe('test-intent-id');
    });
  });

  describe('POST /api/intents/:intentId/retry', () => {
    it('should retry order placement', async () => {
      const mockIntent = {
        intent_id: 'test-intent-id',
        state: 'DEST_FUNDED',
        user_id: 'user-123',
        market_id: 'market-123',
        outcome: 'YES',
        dest_amount_expected: '1000000',
      };

      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue(mockIntent);
      (IntentService.prototype.updateIntentState as jest.Mock).mockResolvedValue({
        ...mockIntent,
        state: 'ORDER_SUBMITTING',
      });

      const response = await request(app)
        .post('/api/intents/test-intent-id/retry')
        .expect(200);

      expect(response.body.intentId).toBe('test-intent-id');
    });

    it('should reject retry for invalid state', async () => {
      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue({
        intent_id: 'test-intent-id',
        state: 'CREATED',
      });

      await request(app)
        .post('/api/intents/test-intent-id/retry')
        .expect(400);
    });

    it('should allow retry from NEEDS_RETRY state', async () => {
      const mockIntent = {
        intent_id: 'test-intent-id',
        state: 'NEEDS_RETRY',
        user_id: 'user-123',
      };

      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue(mockIntent);
      (IntentService.prototype.updateIntentState as jest.Mock).mockResolvedValue({
        ...mockIntent,
        state: 'ORDER_SUBMITTING',
      });

      await request(app)
        .post('/api/intents/test-intent-id/retry')
        .expect(200);
    });
  });
});
