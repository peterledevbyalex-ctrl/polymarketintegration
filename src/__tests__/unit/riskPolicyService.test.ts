import { RiskPolicyService } from '../../services/riskPolicyService';
import { Outcome } from '../../types';

describe('RiskPolicyService', () => {
  let riskService: RiskPolicyService;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.MIN_TRADE_AMOUNT_WEI = '1000000000000000'; // 0.001 ETH
    process.env.MAX_TRADE_AMOUNT_WEI = '100000000000000000000'; // 100 ETH
    process.env.MAX_SLIPPAGE_BPS = '500';
    riskService = new RiskPolicyService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateTradeRequest', () => {
    const validRequest = {
      megaethAddress: '0x1234567890123456789012345678901234567890',
      marketId: '0xmarket123',
      outcome: Outcome.YES,
      inputCurrency: 'native',
      inputAmountWei: '10000000000000000', // 0.01 ETH
      maxSlippageBps: 50,
      walletSignature: '0x' + 'b'.repeat(130),
    };

    it('should pass for valid request', () => {
      expect(() => 
        riskService.validateTradeRequest(validRequest, '0xuser')
      ).not.toThrow();
    });

    it('should reject amount below minimum', () => {
      const request = { ...validRequest, inputAmountWei: '100' };
      expect(() => 
        riskService.validateTradeRequest(request, '0xuser')
      ).toThrow('Amount too small');
    });

    it('should reject amount above maximum', () => {
      const request = { ...validRequest, inputAmountWei: '999999999999999999999999' };
      expect(() => 
        riskService.validateTradeRequest(request, '0xuser')
      ).toThrow('Amount too large');
    });

    it('should reject slippage above maximum', () => {
      const request = { ...validRequest, maxSlippageBps: 1000 };
      expect(() => 
        riskService.validateTradeRequest(request, '0xuser')
      ).toThrow('Slippage too high');
    });

    it('should reject empty market ID', () => {
      const request = { ...validRequest, marketId: '' };
      expect(() => 
        riskService.validateTradeRequest(request, '0xuser')
      ).toThrow('Invalid market');
    });

    it('should reject invalid outcome', () => {
      const request = { ...validRequest, outcome: 'MAYBE' as any };
      expect(() => 
        riskService.validateTradeRequest(request, '0xuser')
      ).toThrow('Outcome must be YES or NO');
    });
  });

  describe('getLimits', () => {
    it('should return current limits', () => {
      const limits = riskService.getLimits();
      
      expect(limits.minAmountWei).toBeDefined();
      expect(limits.maxAmountWei).toBeDefined();
      expect(limits.maxSlippageBps).toBeDefined();
    });

    it('should return a copy of limits', () => {
      const limits1 = riskService.getLimits();
      const limits2 = riskService.getLimits();
      
      expect(limits1).not.toBe(limits2);
      expect(limits1).toEqual(limits2);
    });
  });
});
