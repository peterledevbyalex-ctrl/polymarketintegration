import { IntentState, StateUIConfig } from '@/types/polymarket.types';

export const POLYMARKET_API_URL = process.env.NEXT_PUBLIC_POLYMARKET_API_URL || 'http://localhost:3000';

export const STATE_UI_CONFIG: Record<IntentState, StateUIConfig> = {
  CREATED: { 
    label: 'Initializing trade...', 
    description: 'Setting up your trade intent',
    progress: 0 
  },
  WALLET_DEPLOYING: {
    label: 'Deploying wallet...', 
    description: 'Your Polymarket wallet is being deployed',
    progress: 5 
  },
  WALLET_READY: { 
    label: 'Wallet ready', 
    description: 'Your Polymarket wallet is prepared',
    progress: 10 
  },
  RELAY_QUOTED: { 
    label: 'Ready to sign', 
    description: 'Please sign the transaction in your wallet',
    progress: 20 
  },
  ORIGIN_TX_SUBMITTED: { 
    label: 'Transaction submitted', 
    description: 'Waiting for MegaETH transaction confirmation',
    progress: 30 
  },
  RELAY_EXECUTING: { 
    label: 'Bridging funds...', 
    description: 'Cross-chain transfer in progress via Relay',
    progress: 50 
  },
  DEST_FUNDED: { 
    label: 'Funds received on Polygon', 
    description: 'USDC received in your Polymarket wallet',
    progress: 70 
  },
  ORDER_SUBMITTING: { 
    label: 'Placing order on Polymarket...', 
    description: 'Submitting your prediction market order',
    progress: 80 
  },
  ORDER_PLACED: { 
    label: 'Order placed', 
    description: 'Waiting for order to be filled',
    progress: 90 
  },
  FILLED: { 
    label: 'Trade complete!', 
    description: 'Your position has been successfully opened',
    progress: 100, 
    success: true 
  },
  PARTIAL_FILL: { 
    label: 'Partially filled', 
    description: 'Order partially executed, remaining amount pending',
    progress: 95 
  },
  NEEDS_RETRY: { 
    label: 'Action required', 
    description: 'Transaction needs to be retried',
    progress: 70, 
    canRetry: true 
  },
  FAILED: { 
    label: 'Trade failed', 
    description: 'An error occurred during the trade',
    progress: 0, 
    error: true 
  },
  CANCELLED: { 
    label: 'Trade cancelled', 
    description: 'Trade was cancelled by user or system',
    progress: 0 
  },
};

export const TERMINAL_STATES: IntentState[] = [
  'FILLED',
  'PARTIAL_FILL',
  'FAILED',
  'CANCELLED',
];

export const ERROR_CODES = {
  VALIDATION_ERROR: 'Invalid request data',
  NOT_FOUND: 'Intent not found',
  INVALID_STATE: 'Cannot perform action in current state',
  RATE_LIMITED: 'Too many requests',
  RELAY_FAILED: 'Cross-chain transfer failed',
  ORDER_FAILED: 'Order placement failed',
  SLIPPAGE_EXCEEDED: 'Price moved too much',
} as const;

export const CHAIN_IDS = {
  MEGAETH: 4326,
  POLYGON: 137,
} as const;

export const DEFAULT_SLIPPAGE_BPS = 50;
export const POLL_INTERVAL_MS = 1000; // Faster polling for snappier updates
