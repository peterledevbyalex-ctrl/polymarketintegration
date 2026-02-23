import { IntentState, StateUIConfig } from '@/types/polymarket.types';
import { STATE_UI_CONFIG, TERMINAL_STATES } from './constants';

export const getStateUI = (state: IntentState): StateUIConfig => {
  return STATE_UI_CONFIG[state];
};

export const isTerminalState = (state: IntentState): boolean => {
  return TERMINAL_STATES.includes(state);
};

export const canRetry = (state: IntentState): boolean => {
  return state === 'NEEDS_RETRY';
};

export const isSuccess = (state: IntentState): boolean => {
  return state === 'FILLED' || state === 'PARTIAL_FILL';
};

export const isError = (state: IntentState): boolean => {
  return state === 'FAILED';
};

export const formatShares = (shares: string): string => {
  const num = parseFloat(shares);
  if (isNaN(num)) return '0';
  return num.toFixed(4);
};

export const formatPrice = (price: string): string => {
  const num = parseFloat(price);
  if (isNaN(num)) return '0';
  return `$${num.toFixed(4)}`;
};

export const formatUSDC = (usdc: string): string => {
  const num = parseFloat(usdc);
  if (isNaN(num)) return '$0';
  return `$${num.toFixed(2)}`;
};

export const getProgressPercentage = (state: IntentState): number => {
  return STATE_UI_CONFIG[state].progress;
};

export const getStateLabel = (state: IntentState): string => {
  return STATE_UI_CONFIG[state].label;
};
