import { WalletService } from '../../services/walletService';
import { createSupabaseMock } from '../mocks/supabase';
import { WalletType } from '../../types';

declare global {
  // eslint-disable-next-line no-var
  var __walletServiceSupabaseMock__: ReturnType<typeof createSupabaseMock> | undefined;
}

jest.mock('../../db/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSupabaseMock } = require('../mocks/supabase');
  const mock = createSupabaseMock();
  global.__walletServiceSupabaseMock__ = mock;
  return { supabase: { from: mock.from } };
});

jest.mock('../../services/polymarketRelayerClient', () => ({
  PolymarketRelayerClient: jest.fn().mockImplementation(() => ({
    deployWallet: jest.fn().mockResolvedValue({
      address: '0xNewSafeWallet',
      deployed: true,
    }),
  })),
}));

// Mock signature verification and derivation
jest.mock('../../utils/signatureKeyDerivation', () => ({
  derivePolygonPrivateKey: jest.fn().mockReturnValue('0x' + 'a'.repeat(64)),
  verifyWalletSignature: jest.fn().mockResolvedValue(true),
  getPolygonAddressFromSignature: jest.fn().mockReturnValue('0xDerivedAddress'),
  WALLET_DERIVATION_MESSAGE: 'Test derivation message',
}));

const getMock = () => global.__walletServiceSupabaseMock__!;

// Valid test signature
const TEST_SIGNATURE = '0x' + 'b'.repeat(130);
const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';

describe('WalletService', () => {
  let walletService: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(getMock().mockData).forEach(key => delete getMock().mockData[key]);
    walletService = new WalletService();
  });

  describe('getOrCreateWallet', () => {
    it('should return existing wallet with derived privateKey', async () => {
      getMock().mockData['polymarket_wallets'] = [{
        id: 'wallet-123',
        user_id: 'user-123',
        polygon_wallet_address: '0xExistingSafe',
        wallet_type: 'safe',
        deployment_status: 'deployed',
      }];

      const result = await walletService.getOrCreateWallet('user-123', TEST_ADDRESS, TEST_SIGNATURE);

      expect(result.polygon_wallet_address).toBe('0xExistingSafe');
      expect(result.privateKey).toBeDefined();
    });

    it('should create new Safe wallet if not found', async () => {
      getMock().mockData['polymarket_wallets'] = [];

      const result = await walletService.getOrCreateWallet('user-456', TEST_ADDRESS, TEST_SIGNATURE);

      expect(result.polygon_wallet_address).toBe('0xNewSafeWallet');
      expect(result.wallet_type).toBe(WalletType.SAFE);
      expect(result.privateKey).toBeDefined();
    });

    it('should reject invalid signature', async () => {
      const { verifyWalletSignature } = require('../../utils/signatureKeyDerivation');
      verifyWalletSignature.mockResolvedValueOnce(false);

      await expect(
        walletService.getOrCreateWallet('user-123', TEST_ADDRESS, TEST_SIGNATURE)
      ).rejects.toThrow('Invalid wallet signature');
    });
  });

  describe('deriveUserPrivateKey', () => {
    it('should derive private key from signature', () => {
      const privateKey = walletService.deriveUserPrivateKey(TEST_SIGNATURE);
      expect(privateKey).toBe('0x' + 'a'.repeat(64));
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', async () => {
      const isValid = await walletService.verifySignature(TEST_SIGNATURE, TEST_ADDRESS);
      expect(isValid).toBe(true);
    });
  });

  describe('getDerivationMessage', () => {
    it('should return derivation message', () => {
      const message = WalletService.getDerivationMessage();
      expect(message).toBe('Test derivation message');
    });
  });
});
