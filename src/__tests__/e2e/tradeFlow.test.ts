/**
 * E2E Test for Complete Trade Flow
 * 
 * Tests the full trade flow from intent creation to order fill.
 * Uses mocks for external APIs but tests the complete state machine flow.
 */

import { IntentService } from '../../services/intentService';
import { PolymarketService } from '../../services/polymarketService';
import { IntentState, Outcome } from '../../types';
import { createSupabaseMock } from '../mocks/supabase';
import { mockAxiosResponse } from '../mocks/axios';
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

jest.mock('../../utils/metrics', () => ({
  trackApiCall: jest.fn(),
  trackError: jest.fn(),
  trackStateTransition: jest.fn(),
  trackIntentDuration: jest.fn(),
  trackIntentCreated: jest.fn(),
  getMetrics: jest.fn(),
  register: { metrics: jest.fn() },
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

// Mock signature utilities
jest.mock('../../utils/signatureKeyDerivation', () => ({
  derivePolygonPrivateKey: jest.fn().mockReturnValue('0x' + 'a'.repeat(64)),
  verifyWalletSignature: jest.fn().mockResolvedValue(true),
  getPolygonAddressFromSignature: jest.fn().mockReturnValue('0xDerivedAddress'),
  WALLET_DERIVATION_MESSAGE: 'Test derivation message',
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

describe('E2E Trade Flow', () => {
  let intentService: IntentService;
  let polymarketService: PolymarketService;

  beforeEach(() => {
    jest.clearAllMocks();
    const mock = supabaseMockInstance();
    Object.keys(mock.mockData).forEach(key => delete mock.mockData[key]);
    intentService = new IntentService();
    polymarketService = new PolymarketService();
    
    // Mock axios calls for Polymarket market data
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
      return Promise.reject(new Error('Unknown URL: ' + url));
    });
  });

  it('should complete full trade flow from creation to fill', async () => {
    // Step 1: Create Intent with wallet signature
    const createRequest = {
      megaethAddress: '0x1234567890123456789012345678901234567890',
      marketId: 'market-123',
      outcome: 'YES' as Outcome,
      inputCurrency: 'native',
      inputAmountWei: '1000000000000000000',
      maxSlippageBps: 50,
      walletSignature: TEST_SIGNATURE,
    };

    const normalizedAddress = createRequest.megaethAddress.toLowerCase();
    supabaseMockInstance().mockData['users'] = [{ 
      id: 'user-123', 
      megaeth_address: normalizedAddress 
    }];
    supabaseMockInstance().mockData['polymarket_wallets'] = [{
      user_id: 'user-123',
      polygon_wallet_address: '0xSafeWallet',
      wallet_type: 'safe',
      deployment_status: 'deployed',
    }];

    // Mock Relay quote (v2 format with steps array)
    (mockedAxios.post as jest.Mock).mockResolvedValueOnce(mockAxiosResponse({
      requestId: 'quote-123',
      steps: [{
        kind: 'transaction',
        requestId: 'quote-123',
        items: [{
          data: {
            chainId: 4326,
            to: '0xRelayContract',
            data: '0x1234',
            value: '0x0',
          }
        }]
      }],
      details: {
        currencyOut: {
          amount: '1000000',
          minimumAmount: '950000',
        }
      }
    }));

    supabaseMockInstance().mockData['trade_intents'] = [{
      intent_id: 'intent-123',
      user_id: 'user-123',
      state: IntentState.RELAY_QUOTED,
      market_id: createRequest.marketId,
      outcome: createRequest.outcome,
      dest_amount_expected: '1000000',
      dest_amount_min: '950000',
      relay_quote_id: 'quote-123',
      wallet_signature: TEST_SIGNATURE,
    }];

    const intent = await intentService.createIntent(createRequest);
    expect(intent.state).toBe(IntentState.RELAY_QUOTED);

    // Step 2: Submit Origin TX with wallet signature
    const updatedIntent1 = await intentService.updateOriginTxHash(
      'intent-123', 
      '0x' + 'c'.repeat(64),
      TEST_SIGNATURE
    );
    expect(updatedIntent1.state).toBe(IntentState.ORIGIN_TX_SUBMITTED);

    // Step 3: Transition to RELAY_EXECUTING
    await intentService.updateIntentState('intent-123', IntentState.RELAY_EXECUTING);
    
    // Step 4: Relay Execution completes
    const updatedIntent2 = await intentService.handleRelayExecution('intent-123', '0xdest123');
    expect(updatedIntent2.state).toBe(IntentState.DEST_FUNDED);

    // Get full intent for order placement
    const intentForOrder = await intentService.getIntent('intent-123');
    if (!intentForOrder) {
      throw new Error('Intent not found');
    }

    // Step 5: Place Order (mocked via ClobClient)
    const orderResult = await polymarketService.placeOrder(intentForOrder);
    expect(orderResult.orderId).toBe('order-123'); // From ClobClient mock
    expect(orderResult.status).toBe('open');

    // Transition to ORDER_SUBMITTING then ORDER_PLACED
    await intentService.updateIntentState('intent-123', IntentState.ORDER_SUBMITTING);
    
    const updatedIntent3 = await intentService.updateIntentState('intent-123', IntentState.ORDER_PLACED, {
      polymarket_order_id: orderResult.orderId,
    });
    expect(updatedIntent3.state).toBe(IntentState.ORDER_PLACED);

    // Step 6: Order Fill - axios.get mock in beforeEach handles /order/ URL
    const fillInfo = await polymarketService.getOrderStatus('order-123');
    expect(fillInfo.status).toBe('filled');

    const finalIntent = await intentService.updateIntentState('intent-123', IntentState.FILLED);
    expect(finalIntent.state).toBe(IntentState.FILLED);
  });

  it('should handle state transitions for retry flow', async () => {
    // Test the intent state machine for retry scenarios
    const mockIntent = {
      intent_id: 'intent-retry',
      user_id: 'user-123',
      state: IntentState.DEST_FUNDED,
      market_id: 'market-123',
      outcome: 'YES' as Outcome,
      dest_amount_expected: '1000000',
      max_slippage_bps: 50,
      wallet_signature: TEST_SIGNATURE,
    };
    supabaseMockInstance().mockData['trade_intents'] = [mockIntent];
    supabaseMockInstance().mockData['polymarket_wallets'] = [{
      user_id: 'user-123',
      polygon_wallet_address: '0xSafeWallet',
    }];

    // Transition to ORDER_SUBMITTING
    const submittingIntent = await intentService.updateIntentState('intent-retry', IntentState.ORDER_SUBMITTING);
    expect(submittingIntent.state).toBe(IntentState.ORDER_SUBMITTING);

    // Simulate failure - transition to NEEDS_RETRY
    const needsRetryIntent = await intentService.updateIntentState('intent-retry', IntentState.NEEDS_RETRY);
    expect(needsRetryIntent.state).toBe(IntentState.NEEDS_RETRY);

    // Retry - back to ORDER_SUBMITTING
    const retryingIntent = await intentService.updateIntentState('intent-retry', IntentState.ORDER_SUBMITTING);
    expect(retryingIntent.state).toBe(IntentState.ORDER_SUBMITTING);

    // Success
    const placedIntent = await intentService.updateIntentState('intent-retry', IntentState.ORDER_PLACED, {
      polymarket_order_id: 'order-retry-123',
    });
    expect(placedIntent.state).toBe(IntentState.ORDER_PLACED);
  });
});
