import { StateMachine } from '../../services/stateMachine';
import { IntentState } from '../../types';

describe('StateMachine', () => {
  describe('canTransition', () => {
    it('should allow valid transitions', () => {
      expect(StateMachine.canTransition(IntentState.CREATED, IntentState.WALLET_READY)).toBe(true);
      expect(StateMachine.canTransition(IntentState.WALLET_READY, IntentState.RELAY_QUOTED)).toBe(true);
      expect(StateMachine.canTransition(IntentState.RELAY_QUOTED, IntentState.ORIGIN_TX_SUBMITTED)).toBe(true);
      expect(StateMachine.canTransition(IntentState.ORIGIN_TX_SUBMITTED, IntentState.RELAY_EXECUTING)).toBe(true);
      expect(StateMachine.canTransition(IntentState.RELAY_EXECUTING, IntentState.DEST_FUNDED)).toBe(true);
      expect(StateMachine.canTransition(IntentState.DEST_FUNDED, IntentState.ORDER_SUBMITTING)).toBe(true);
      expect(StateMachine.canTransition(IntentState.ORDER_SUBMITTING, IntentState.ORDER_PLACED)).toBe(true);
      expect(StateMachine.canTransition(IntentState.ORDER_PLACED, IntentState.FILLED)).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(StateMachine.canTransition(IntentState.CREATED, IntentState.FILLED)).toBe(false);
      expect(StateMachine.canTransition(IntentState.WALLET_READY, IntentState.FILLED)).toBe(false);
      expect(StateMachine.canTransition(IntentState.FILLED, IntentState.ORDER_PLACED)).toBe(false);
      expect(StateMachine.canTransition(IntentState.FAILED, IntentState.ORDER_PLACED)).toBe(false);
    });

    it('should allow transitions to terminal states', () => {
      expect(StateMachine.canTransition(IntentState.ORDER_PLACED, IntentState.FILLED)).toBe(true);
      expect(StateMachine.canTransition(IntentState.ORDER_PLACED, IntentState.PARTIAL_FILL)).toBe(true);
      expect(StateMachine.canTransition(IntentState.CREATED, IntentState.FAILED)).toBe(true);
      expect(StateMachine.canTransition(IntentState.CREATED, IntentState.CANCELLED)).toBe(true);
    });

    it('should allow retry transitions', () => {
      expect(StateMachine.canTransition(IntentState.NEEDS_RETRY, IntentState.ORDER_SUBMITTING)).toBe(true);
      expect(StateMachine.canTransition(IntentState.NEEDS_RETRY, IntentState.FAILED)).toBe(true);
    });
  });

  describe('transition', () => {
    it('should transition to valid state', () => {
      const newState = StateMachine.transition(
        IntentState.CREATED,
        IntentState.WALLET_READY,
        'test-intent-id'
      );
      expect(newState).toBe(IntentState.WALLET_READY);
    });

    it('should throw error for invalid transition', () => {
      expect(() => {
        StateMachine.transition(
          IntentState.CREATED,
          IntentState.FILLED,
          'test-intent-id'
        );
      }).toThrow();
    });
  });

  describe('isTerminal', () => {
    it('should identify terminal states', () => {
      expect(StateMachine.isTerminal(IntentState.FILLED)).toBe(true);
      expect(StateMachine.isTerminal(IntentState.PARTIAL_FILL)).toBe(true);
      expect(StateMachine.isTerminal(IntentState.FAILED)).toBe(true);
      expect(StateMachine.isTerminal(IntentState.CANCELLED)).toBe(true);
    });

    it('should identify non-terminal states', () => {
      expect(StateMachine.isTerminal(IntentState.CREATED)).toBe(false);
      expect(StateMachine.isTerminal(IntentState.ORDER_PLACED)).toBe(false);
      expect(StateMachine.isTerminal(IntentState.NEEDS_RETRY)).toBe(false);
    });
  });

  describe('canRetry', () => {
    it('should allow retry from NEEDS_RETRY', () => {
      expect(StateMachine.canRetry(IntentState.NEEDS_RETRY)).toBe(true);
    });

    it('should allow retry from DEST_FUNDED', () => {
      expect(StateMachine.canRetry(IntentState.DEST_FUNDED)).toBe(true);
    });

    it('should not allow retry from other states', () => {
      expect(StateMachine.canRetry(IntentState.CREATED)).toBe(false);
      expect(StateMachine.canRetry(IntentState.FILLED)).toBe(false);
      expect(StateMachine.canRetry(IntentState.FAILED)).toBe(false);
    });
  });
});
