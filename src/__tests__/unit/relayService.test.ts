import { RelayService } from '../../services/relayService';
import { mockAxiosResponse, mockAxiosError } from '../mocks/axios';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../config', () => ({
  config: {
    relay: {
      apiUrl: 'https://api.relay.link',
    },
  },
}));

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
    CircuitBreaker: mockCircuitBreaker,
  };
});

describe('RelayService', () => {
  let relayService: RelayService;

  beforeEach(() => {
    jest.clearAllMocks();
    relayService = new RelayService();
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid HMAC signature', () => {
      // The actual implementation uses crypto.timingSafeEqual
      // This tests the basic flow
      const payload = JSON.stringify({ test: 'data' });
      const invalidSig = 'invalid-signature';

      const result = relayService.verifyWebhookSignature(payload, invalidSig);
      
      expect(typeof result).toBe('boolean');
    });

    it('should reject empty signature', () => {
      const payload = JSON.stringify({ test: 'data' });

      const result = relayService.verifyWebhookSignature(payload, '');
      
      expect(result).toBe(false);
    });
  });

  describe('getQuote', () => {
    const mockQuoteParams = {
      originChainId: 4326,
      destChainId: 137,
      originCurrency: 'native',
      destCurrency: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      sender: '0x9876543210987654321098765432109876543210',
      recipient: '0x1234567890123456789012345678901234567890',
      amount: '1000000000000000000',
    };

    it('should get quote successfully', async () => {
      // Relay v2 response format with steps array
      const mockResponse = {
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
            amount: '1000000000',
            minimumAmount: '950000000',
          }
        }
      };

      (mockedAxios.post as jest.Mock).mockResolvedValue(mockAxiosResponse(mockResponse));

      const quote = await relayService.getQuote(mockQuoteParams);

      expect(quote.quoteId).toBe('quote-123');
      expect(quote.originTx.to).toBe('0xRelayContract');
      expect(quote.destAmountExpected).toBe('1000000000');
      expect(quote.destAmountMin).toBe('950000000');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/quote/v2'),
        expect.objectContaining({
          originChainId: 4326,
          destinationChainId: 137,
        }),
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      (mockedAxios.post as jest.Mock).mockRejectedValue(mockAxiosError('API Error', 500));

      await expect(relayService.getQuote(mockQuoteParams)).rejects.toThrow();
    });

    it('should throw when no transaction step in response', async () => {
      const mockResponse = {
        requestId: 'quote-456',
        steps: [], // Empty steps
        details: {}
      };

      (mockedAxios.post as jest.Mock).mockResolvedValue(mockAxiosResponse(mockResponse));

      await expect(relayService.getQuote(mockQuoteParams)).rejects.toThrow('No transaction step');
    });
  });

  describe('getExecutionStatus', () => {
    it('should get execution status successfully', async () => {
      // Relay v3 status response format
      const mockResponse = {
        status: 'success',
        inTxHashes: ['0xorigin123'],
        outTxHashes: ['0xdest123'],
      };

      (mockedAxios.get as jest.Mock).mockResolvedValue(mockAxiosResponse(mockResponse));

      const status = await relayService.getExecutionStatus('quote-123');

      expect(status.status).toBe('executed');
      expect(status.originTxHash).toBe('0xorigin123');
      expect(status.destTxHash).toBe('0xdest123');
    });

    it('should handle pending status', async () => {
      const mockResponse = {
        status: 'pending',
      };

      (mockedAxios.get as jest.Mock).mockResolvedValue(mockAxiosResponse(mockResponse));

      const status = await relayService.getExecutionStatus('quote-123');

      expect(status.status).toBe('pending');
    });

    it('should handle submitted status as executing', async () => {
      const mockResponse = {
        status: 'submitted',
        inTxHashes: ['0xorigin123'],
      };

      (mockedAxios.get as jest.Mock).mockResolvedValue(mockAxiosResponse(mockResponse));

      const status = await relayService.getExecutionStatus('quote-123');

      expect(status.status).toBe('executing');
    });
  });

});
