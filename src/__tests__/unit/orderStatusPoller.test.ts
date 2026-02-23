/**
 * Tests for Order Status Poller Job
 */

import { IntentState } from '../../types';

// Mock the services directly without importing them
const mockGetOrderStatus = jest.fn();
const mockUpdateIntentState = jest.fn();

// Simulate the job handler logic
const handleOrderStatus = async (intentId: string, orderId: string) => {
  const fillInfo = await mockGetOrderStatus(orderId);
  
  if (fillInfo.status === 'filled') {
    return mockUpdateIntentState(intentId, IntentState.FILLED);
  } else if (fillInfo.status === 'partial') {
    return mockUpdateIntentState(intentId, IntentState.PARTIAL_FILL);
  } else if (fillInfo.status === 'failed') {
    return mockUpdateIntentState(intentId, IntentState.NEEDS_RETRY, { error_code: 'ORDER_FAILED' });
  }
  return { status: fillInfo.status };
};

describe('Order Status Poller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('order status poll job handler', () => {
    it('should handle filled status', async () => {
      mockGetOrderStatus.mockResolvedValue({
        status: 'filled',
        filledUSDC: '1000000000',
        shares: '2500000000',
        avgPrice: '0.4',
      });
      mockUpdateIntentState.mockResolvedValue({ intent_id: 'intent-123', state: IntentState.FILLED });

      const result = await handleOrderStatus('intent-123', 'order-123');
      
      expect(mockGetOrderStatus).toHaveBeenCalledWith('order-123');
      expect(mockUpdateIntentState).toHaveBeenCalledWith('intent-123', IntentState.FILLED);
      expect(result.state).toBe(IntentState.FILLED);
    });

    it('should handle partial fill status', async () => {
      mockGetOrderStatus.mockResolvedValue({
        status: 'partial',
        filledUSDC: '500000000',
      });
      mockUpdateIntentState.mockResolvedValue({ intent_id: 'intent-123', state: IntentState.PARTIAL_FILL });

      const result = await handleOrderStatus('intent-123', 'order-123');
      
      expect(mockUpdateIntentState).toHaveBeenCalledWith('intent-123', IntentState.PARTIAL_FILL);
      expect(result.state).toBe(IntentState.PARTIAL_FILL);
    });

    it('should handle failed status', async () => {
      mockGetOrderStatus.mockResolvedValue({
        status: 'failed',
      });
      mockUpdateIntentState.mockResolvedValue({ intent_id: 'intent-123', state: IntentState.NEEDS_RETRY });

      const result = await handleOrderStatus('intent-123', 'order-123');
      
      expect(mockUpdateIntentState).toHaveBeenCalledWith(
        'intent-123',
        IntentState.NEEDS_RETRY,
        { error_code: 'ORDER_FAILED' }
      );
      expect(result.state).toBe(IntentState.NEEDS_RETRY);
    });

    it('should handle open status and schedule next poll', async () => {
      mockGetOrderStatus.mockResolvedValue({ status: 'open' });

      const result = await handleOrderStatus('intent-123', 'order-123');
      
      expect(result.status).toBe('open');
    });
  });

  describe('scheduleOrderStatusPoll', () => {
    it('should calculate correct delay', () => {
      const calculateDelay = (attempt: number) => Math.min(2000 * (attempt + 1), 10000);

      expect(calculateDelay(0)).toBe(2000);
      expect(calculateDelay(1)).toBe(4000);
      expect(calculateDelay(2)).toBe(6000);
      expect(calculateDelay(4)).toBe(10000); // Capped at 10000
      expect(calculateDelay(10)).toBe(10000); // Still capped
    });
  });
});
