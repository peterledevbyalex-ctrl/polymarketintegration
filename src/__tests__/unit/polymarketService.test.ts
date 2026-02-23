import { PolymarketService } from '../../services/polymarketService';
import { mockAxiosResponse } from '../mocks/axios';
import { createSupabaseMock } from '../mocks/supabase';
import { TradeIntent, Outcome } from '../../types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

jest.mock('../../config');
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../../utils/metrics', () => ({
  trackApiCall: jest.fn(),
  trackError: jest.fn(),
}));
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
jest.mock('../../services/polymarketRelayerClient', () => {
  return {
    PolymarketRelayerClient: jest.fn().mockImplementation(() => ({
      deployWallet: jest.fn().mockResolvedValue({
        address: '0xSafeWallet',
        deployed: true,
      }),
      execute: jest.fn().mockResolvedValue({
        transactionID: 'tx-123',
        transactionHash: '0xTxHash',
        state: 'CONFIRMED',
      }),
      getTransactionStatus: jest.fn().mockResolvedValue({
        state: 'CONFIRMED',
        transactionHash: '0xTxHash',
      }),
    })),
  };
});

// Mock signature derivation
jest.mock('../../utils/signatureKeyDerivation', () => ({
  derivePolygonPrivateKey: jest.fn().mockReturnValue('0x' + 'a'.repeat(64)),
}));

// Mock @polymarket/clob-client
jest.mock('@polymarket/clob-client', () => ({
  __esModule: true,
  ClobClient: jest.fn().mockImplementation(() => ({
    deriveApiKey: jest.fn().mockResolvedValue({ key: 'test-key', secret: 'test-secret', passphrase: 'test-pass' }),
    createApiKey: jest.fn().mockResolvedValue({ key: 'test-key', secret: 'test-secret', passphrase: 'test-pass' }),
    createAndPostOrder: jest.fn().mockResolvedValue({ orderID: 'order-123', status: 'OPEN' }),
    getMarket: jest.fn().mockResolvedValue({ tokens: [{ token_id: 'token-yes', outcome: 'Yes' }] }),
    getOrderbook: jest.fn().mockResolvedValue({ bids: [{ price: '0.5', size: '100' }], asks: [{ price: '0.6', size: '100' }] }),
  })),
}));

// Mock @polymarket/order-utils
jest.mock('@polymarket/order-utils', () => ({
  __esModule: true,
  SignatureType: { POLY_GNOSIS_SAFE: 2 },
}));

const TEST_SIGNATURE = '0x' + 'b'.repeat(130);

describe('PolymarketService', () => {
  let polymarketService: PolymarketService;

  beforeEach(() => {
    jest.clearAllMocks();
    const mock = supabaseMockInstance();
    Object.keys(mock.mockData).forEach(key => delete mock.mockData[key]);
    mock.mockData['polymarket_wallets'] = [];
    polymarketService = new PolymarketService();
    
    // Mock internal axios calls for market data
    (mockedAxios.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/markets/')) {
        return Promise.resolve(mockAxiosResponse({
          question: 'Test Market?',
          active: true,
          closed: false,
          tokens: [
            { token_id: 'token-yes-123', outcome: 'Yes', price: '0.5' },
            { token_id: 'token-no-123', outcome: 'No', price: '0.5' },
          ]
        }));
      }
      if (url.includes('/book')) {
        return Promise.resolve(mockAxiosResponse({
          asks: [{ price: '0.50', size: '1000' }],
          bids: [{ price: '0.48', size: '1000' }],
        }));
      }
      if (url.includes('/order/')) {
        return Promise.resolve(mockAxiosResponse({
          status: 'FILLED',
          filled_size: '1000000',
          filled_shares: '2500000',
          avg_fill_price: '0.4',
        }));
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  describe('placeOrder', () => {
    const mockIntent: Partial<TradeIntent> = {
      intent_id: 'test-intent-id',
      user_id: 'user-123',
      market_id: 'market-123',
      outcome: 'YES' as Outcome,
      dest_amount_expected: '1000000',
      max_slippage_bps: 50,
      wallet_signature: TEST_SIGNATURE,
    };

    it('should place order successfully with signature-derived key', async () => {
      const mock = supabaseMockInstance();
      mock.mockData['polymarket_wallets'] = [{
        user_id: 'user-123',
        polygon_wallet_address: '0xSafeWallet',
      }];

      const result = await polymarketService.placeOrder(mockIntent as TradeIntent);

      expect(result.orderId).toBe('order-123');
      expect(result.status).toBe('open');
    });

    it('should throw when wallet not found', async () => {
      const mock = supabaseMockInstance();
      mock.mockData['polymarket_wallets'] = [];

      await expect(
        polymarketService.placeOrder(mockIntent as TradeIntent)
      ).rejects.toThrow('Polymarket wallet not found');
    });

    it('should throw when wallet signature missing', async () => {
      const mock = supabaseMockInstance();
      mock.mockData['polymarket_wallets'] = [{
        user_id: 'user-123',
        polygon_wallet_address: '0xSafeWallet',
      }];

      const intentWithoutSig = { ...mockIntent, wallet_signature: undefined };

      await expect(
        polymarketService.placeOrder(intentWithoutSig as TradeIntent)
      ).rejects.toThrow('No wallet signature');
    });

    it('should handle market not found', async () => {
      const mock = supabaseMockInstance();
      mock.mockData['polymarket_wallets'] = [{
        user_id: 'user-123',
        polygon_wallet_address: '0xSafeWallet',
      }];

      (mockedAxios.get as jest.Mock).mockRejectedValue(
        Object.assign(new Error('Not found'), { response: { status: 404 } })
      );

      await expect(
        polymarketService.placeOrder(mockIntent as TradeIntent)
      ).rejects.toThrow();
    });
  });

  describe('getOrderStatus', () => {
    it('should get order status successfully', async () => {
      const mockResponse = {
        status: 'FILLED',
        filled_size: '1000000',
        filled_shares: '2500000',
        avg_fill_price: '0.4',
      };

      (mockedAxios.get as jest.Mock).mockResolvedValue(mockAxiosResponse(mockResponse));

      const status = await polymarketService.getOrderStatus('order-123');

      expect(status.status).toBe('filled');
      expect(status.filledUSDC).toBe('1000000');
      expect(status.shares).toBe('2500000');
      expect(status.avgPrice).toBe('0.4');
    });

    it('should handle partial fill', async () => {
      const mockResponse = {
        status: 'PARTIAL',
        filled_size: '500000',
        filled_shares: '1250000',
        avg_fill_price: '0.4',
      };

      (mockedAxios.get as jest.Mock).mockResolvedValue(mockAxiosResponse(mockResponse));

      const status = await polymarketService.getOrderStatus('order-123');

      expect(status.status).toBe('partial');
    });
  });

  describe('checkExistingOrder', () => {
    it('should return null when no existing order', async () => {
      const result = await polymarketService.checkExistingOrder('intent-123');
      expect(result).toBeNull();
    });
  });
});
