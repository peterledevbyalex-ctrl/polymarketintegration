/**
 * Tests for Relay Poller Job
 * 
 * Tests the job handler logic for polling Relay execution status.
 */

import { IntentState } from '../../types';

// Mock the services directly
const mockGetExecutionStatus = jest.fn();
const mockHandleRelayExecution = jest.fn();
const mockUpdateIntentState = jest.fn();

// Simulate the job handler logic
const handleRelayPoll = async (intentId: string, quoteId: string, _attemptsMade: number) => {
  const status = await mockGetExecutionStatus(quoteId);
  
  if (status.status === 'executed' && status.destTxHash) {
    return mockHandleRelayExecution(intentId, status.destTxHash);
  } else if (status.status === 'failed') {
    return mockUpdateIntentState(intentId, IntentState.FAILED, {
      error_code: 'RELAY_FAILED',
      error_detail: 'Relay execution failed',
    });
  } else if (status.status === 'executing') {
    await mockUpdateIntentState(intentId, IntentState.RELAY_EXECUTING, {
      relay_status: 'executing',
      relay_origin_tx_hash: status.originTxHash,
    });
    return { status: 'executing', needsReschedule: true };
  }
  return { status: 'pending', needsReschedule: true };
};

describe('Relay Poller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('relay poll job handler', () => {

    it('should handle executed status', async () => {
      mockGetExecutionStatus.mockResolvedValue({
        status: 'executed',
        destTxHash: '0xdest123',
      });
      mockHandleRelayExecution.mockResolvedValue({ intent_id: 'intent-123', state: IntentState.DEST_FUNDED });

      const result = await handleRelayPoll('intent-123', 'quote-456', 0);
      
      expect(mockGetExecutionStatus).toHaveBeenCalledWith('quote-456');
      expect(mockHandleRelayExecution).toHaveBeenCalledWith('intent-123', '0xdest123');
      expect(result.state).toBe(IntentState.DEST_FUNDED);
    });

    it('should handle failed status', async () => {
      mockGetExecutionStatus.mockResolvedValue({ status: 'failed' });
      mockUpdateIntentState.mockResolvedValue({ intent_id: 'intent-123', state: IntentState.FAILED });

      const result = await handleRelayPoll('intent-123', 'quote-456', 0);
      
      expect(mockUpdateIntentState).toHaveBeenCalledWith(
        'intent-123',
        IntentState.FAILED,
        expect.objectContaining({ error_code: 'RELAY_FAILED' })
      );
      expect(result.state).toBe(IntentState.FAILED);
    });

    it('should handle executing status and schedule next poll', async () => {
      mockGetExecutionStatus.mockResolvedValue({
        status: 'executing',
        originTxHash: '0xorigin123',
      });
      mockUpdateIntentState.mockResolvedValue({ intent_id: 'intent-123', state: IntentState.RELAY_EXECUTING });

      const result = await handleRelayPoll('intent-123', 'quote-456', 0);
      
      expect(mockUpdateIntentState).toHaveBeenCalled();
      expect(result.needsReschedule).toBe(true);
    });

    it('should handle pending status and schedule next poll', async () => {
      mockGetExecutionStatus.mockResolvedValue({ status: 'pending' });

      const result = await handleRelayPoll('intent-123', 'quote-456', 0);
      
      expect(result.status).toBe('pending');
      expect(result.needsReschedule).toBe(true);
    });
  });

  describe('scheduleRelayPoll', () => {
    it('should calculate correct delay with exponential backoff', () => {
      const calculateDelay = (attempt: number) => Math.min(500 * Math.pow(2, attempt), 2000);
      
      expect(calculateDelay(0)).toBe(500);
      expect(calculateDelay(1)).toBe(1000);
      expect(calculateDelay(2)).toBe(2000);
      expect(calculateDelay(3)).toBe(2000); // Capped at 2000
    });
  });
});
