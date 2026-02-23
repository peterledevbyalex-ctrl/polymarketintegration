import { IntentService } from '../../services/intentService';
import { createSupabaseMock } from '../mocks/supabase';
import { IntentState, Outcome } from '../../types';

declare global {
  // eslint-disable-next-line no-var
  var __intentServiceSupabaseMock__: ReturnType<typeof createSupabaseMock> | undefined;
}

jest.mock('../../db/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSupabaseMock } = require('../mocks/supabase');
  const mock = createSupabaseMock();
  global.__intentServiceSupabaseMock__ = mock;
  return { supabase: { from: mock.from } };
});

jest.mock('../../services/userService', () => ({
  UserService: jest.fn().mockImplementation(() => ({
    getOrCreateUser: jest.fn().mockResolvedValue({
      id: 'user-123',
      megaeth_address: '0x1234567890123456789012345678901234567890',
    }),
  })),
}));

jest.mock('../../services/walletService', () => ({
  WalletService: jest.fn().mockImplementation(() => ({
    getOrCreateWallet: jest.fn().mockResolvedValue({
      id: 'wallet-123',
      user_id: 'user-123',
      polygon_wallet_address: '0xSafeWallet123',
      privateKey: '0x' + 'a'.repeat(64),
    }),
    verifySignature: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../../services/relayService', () => ({
  RelayService: jest.fn().mockImplementation(() => ({
    getQuote: jest.fn().mockResolvedValue({
      quoteId: 'quote-123',
      originTx: { chainId: 4326, to: '0xRelay', data: '0x123', value: '0x0' },
      destAmountExpected: '1000000',
      destAmountMin: '950000',
    }),
  })),
}));

jest.mock('../../services/riskPolicyService', () => ({
  RiskPolicyService: jest.fn().mockImplementation(() => ({
    validateTradeRequest: jest.fn(),
  })),
}));

jest.mock('../../utils/metrics', () => ({
  trackIntentCreated: jest.fn(),
  trackStateTransition: jest.fn(),
  trackIntentDuration: jest.fn(),
}));

const getMock = () => global.__intentServiceSupabaseMock__!;

const TEST_SIGNATURE = '0x' + 'b'.repeat(130);

describe('IntentService', () => {
  let intentService: IntentService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(getMock().mockData).forEach(key => delete getMock().mockData[key]);
    intentService = new IntentService();
  });

  describe('createIntent', () => {
    it('should create a new intent with wallet signature', async () => {
      getMock().mockData['trade_intents'] = [];

      const request = {
        megaethAddress: '0x1234567890123456789012345678901234567890',
        marketId: 'market-123',
        outcome: Outcome.YES,
        inputCurrency: 'native',
        inputAmountWei: '1000000000000000000',
        maxSlippageBps: 50,
        walletSignature: TEST_SIGNATURE,
      };

      const intent = await intentService.createIntent(request);

      expect(intent.state).toBe(IntentState.RELAY_QUOTED);
      expect(intent.market_id).toBe('market-123');
    });
  });

  describe('getIntent', () => {
    it('should return intent if found', async () => {
      getMock().mockData['trade_intents'] = [{
        intent_id: 'intent-123',
        user_id: 'user-123',
        state: IntentState.CREATED,
        market_id: 'market-123',
      }];

      const intent = await intentService.getIntent('intent-123');

      expect(intent?.intent_id).toBe('intent-123');
    });

    it('should return null if not found', async () => {
      getMock().mockData['trade_intents'] = [];

      const intent = await intentService.getIntent('non-existent');

      expect(intent).toBeNull();
    });
  });

  describe('updateIntentState', () => {
    it('should update intent state', async () => {
      getMock().mockData['trade_intents'] = [{
        intent_id: 'intent-123',
        user_id: 'user-123',
        state: IntentState.RELAY_QUOTED,
        market_id: 'market-123',
        created_at: new Date().toISOString(),
      }];

      const updated = await intentService.updateIntentState(
        'intent-123',
        IntentState.ORIGIN_TX_SUBMITTED
      );

      expect(updated.state).toBe(IntentState.ORIGIN_TX_SUBMITTED);
    });

    it('should reject invalid state transition', async () => {
      getMock().mockData['trade_intents'] = [{
        intent_id: 'intent-123',
        user_id: 'user-123',
        state: IntentState.FILLED,
        market_id: 'market-123',
        created_at: new Date().toISOString(),
      }];

      await expect(
        intentService.updateIntentState('intent-123', IntentState.CREATED)
      ).rejects.toThrow();
    });
  });

  describe('updateOriginTxHash', () => {
    it('should update origin tx hash with wallet signature', async () => {
      getMock().mockData['trade_intents'] = [{
        intent_id: 'intent-123',
        user_id: 'user-123',
        state: IntentState.RELAY_QUOTED,
        market_id: 'market-123',
        created_at: new Date().toISOString(),
      }];

      const updated = await intentService.updateOriginTxHash(
        'intent-123', 
        '0x' + 'a'.repeat(64),
        TEST_SIGNATURE
      );

      expect(updated.relay_origin_tx_hash).toBe('0x' + 'a'.repeat(64));
      expect(updated.state).toBe(IntentState.ORIGIN_TX_SUBMITTED);
      expect(updated.wallet_signature).toBe(TEST_SIGNATURE);
    });
  });

  describe('handleRelayExecution', () => {
    it('should handle relay execution', async () => {
      getMock().mockData['trade_intents'] = [{
        intent_id: 'intent-123',
        user_id: 'user-123',
        state: IntentState.RELAY_EXECUTING,
        market_id: 'market-123',
        created_at: new Date().toISOString(),
      }];

      const updated = await intentService.handleRelayExecution('intent-123', '0xdest123');

      expect(updated.polygon_funding_tx_hash).toBe('0xdest123');
      expect(updated.state).toBe(IntentState.DEST_FUNDED);
    });
  });

  describe('edge cases', () => {
    it('should throw when updating non-existent intent', async () => {
      getMock().mockData['trade_intents'] = [];

      await expect(
        intentService.updateIntentState('non-existent', IntentState.FILLED)
      ).rejects.toThrow();
    });

    it('should handle intent with error state', async () => {
      getMock().mockData['trade_intents'] = [{
        intent_id: 'intent-failed',
        user_id: 'user-123',
        state: IntentState.DEST_FUNDED,
        created_at: new Date().toISOString(),
      }];

      const updated = await intentService.updateIntentState(
        'intent-failed',
        IntentState.NEEDS_RETRY,
        { error_code: 'ORDER_FAILED', error_detail: 'Slippage exceeded' }
      );

      expect(updated.state).toBe(IntentState.NEEDS_RETRY);
      expect(updated.error_code).toBe('ORDER_FAILED');
    });
  });
});
