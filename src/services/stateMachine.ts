import { IntentState } from '../types';
import logger from '../utils/logger';

export class StateMachine {
  private static readonly VALID_TRANSITIONS: Record<IntentState, IntentState[]> = {
    [IntentState.CREATED]: [IntentState.WALLET_DEPLOYING, IntentState.WALLET_READY, IntentState.RELAY_QUOTED, IntentState.FAILED, IntentState.CANCELLED],
    [IntentState.WALLET_DEPLOYING]: [IntentState.WALLET_READY, IntentState.RELAY_QUOTED, IntentState.FAILED],
    [IntentState.WALLET_READY]: [IntentState.RELAY_QUOTED, IntentState.FAILED, IntentState.CANCELLED],
    [IntentState.RELAY_QUOTED]: [IntentState.ORIGIN_TX_SUBMITTED, IntentState.FAILED, IntentState.CANCELLED],
    // Allow direct transition to DEST_FUNDED (Relay can skip RELAY_EXECUTING)
    [IntentState.ORIGIN_TX_SUBMITTED]: [IntentState.RELAY_EXECUTING, IntentState.DEST_FUNDED, IntentState.FAILED],
    [IntentState.RELAY_EXECUTING]: [IntentState.DEST_FUNDED, IntentState.FAILED],
    [IntentState.DEST_FUNDED]: [IntentState.ORDER_SUBMITTING, IntentState.NEEDS_RETRY],
    [IntentState.ORDER_SUBMITTING]: [IntentState.ORDER_PLACED, IntentState.FILLED, IntentState.NEEDS_RETRY],
    [IntentState.ORDER_PLACED]: [IntentState.FILLED, IntentState.PARTIAL_FILL, IntentState.NEEDS_RETRY],
    [IntentState.FILLED]: [],
    [IntentState.PARTIAL_FILL]: [],
    [IntentState.NEEDS_RETRY]: [IntentState.ORDER_SUBMITTING, IntentState.FAILED],
    [IntentState.FAILED]: [],
    [IntentState.CANCELLED]: [],
  };

  static canTransition(from: IntentState, to: IntentState): boolean {
    const allowed = this.VALID_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  static transition(
    currentState: IntentState,
    newState: IntentState,
    intentId: string
  ): IntentState {
    if (!this.canTransition(currentState, newState)) {
      logger.warn(`Invalid state transition for intent ${intentId}: ${currentState} -> ${newState}`);
      throw new Error(`Invalid state transition: ${currentState} -> ${newState}`);
    }

    logger.info(`State transition for intent ${intentId}: ${currentState} -> ${newState}`);
    return newState;
  }

  static isTerminal(state: IntentState): boolean {
    return [
      IntentState.FILLED,
      IntentState.PARTIAL_FILL,
      IntentState.FAILED,
      IntentState.CANCELLED,
    ].includes(state);
  }

  static canRetry(state: IntentState): boolean {
    return state === IntentState.NEEDS_RETRY || state === IntentState.DEST_FUNDED;
  }
}

