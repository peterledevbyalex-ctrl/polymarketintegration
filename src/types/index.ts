export enum IntentState {
  CREATED = 'CREATED',
  WALLET_DEPLOYING = 'WALLET_DEPLOYING',  // New: deploying Polygon wallet
  WALLET_READY = 'WALLET_READY',
  RELAY_QUOTED = 'RELAY_QUOTED',
  ORIGIN_TX_SUBMITTED = 'ORIGIN_TX_SUBMITTED',
  RELAY_EXECUTING = 'RELAY_EXECUTING',
  DEST_FUNDED = 'DEST_FUNDED',
  ORDER_SUBMITTING = 'ORDER_SUBMITTING',
  ORDER_PLACED = 'ORDER_PLACED',
  FILLED = 'FILLED',
  PARTIAL_FILL = 'PARTIAL_FILL',
  NEEDS_RETRY = 'NEEDS_RETRY',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum Outcome {
  YES = 'YES',
  NO = 'NO',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum WalletType {
  SAFE = 'safe',
  PROXY = 'proxy',
}

export enum DeploymentStatus {
  UNKNOWN = 'unknown',
  DEPLOYED = 'deployed',
  FAILED = 'failed',
}

export interface User {
  id: string;
  megaeth_address: string;
  created_at: string;
  updated_at: string;
}

export interface PolymarketWallet {
  id: string;
  user_id: string;
  wallet_type: WalletType;
  polygon_wallet_address: string;
  deployment_status: DeploymentStatus;
  created_at: string;
  updated_at: string;
}

export interface TradeIntent {
  intent_id: string;
  user_id: string;
  market_id: string;
  condition_id?: string;
  outcome: Outcome;
  /** Action: BUY (default) or SELL */
  action?: 'BUY' | 'SELL';
  input_chain: string;
  input_currency: string;
  input_amount: string;
  dest_chain: string;
  dest_currency: string;
  dest_amount_expected: string;
  dest_amount_min: string;
  max_slippage_bps: number;
  relay_quote_id?: string;
  relay_request_id?: string;
  relay_origin_tx_hash?: string;
  relay_origin_tx_data?: {
    chainId: number;
    to: string;
    data: string;
    value: string;
  };
  relay_status?: string;
  polygon_funding_tx_hash?: string;
  polymarket_order_id?: string;
  polymarket_tx_hash?: string;
  state: IntentState;
  error_code?: string;
  error_detail?: string;
  client_request_id?: string;
  /** User's MegaETH signature for wallet key derivation */
  wallet_signature?: string;
  /** Order type: MARKET (default) or LIMIT */
  order_type?: string;
  /** Limit price (0-1) for LIMIT orders */
  limit_price?: string;
  created_at: string;
  updated_at: string;
}

export interface IntentEvent {
  id: string;
  intent_id: string;
  ts: string;
  type: string;
  payload_json?: Record<string, unknown>;
  created_at: string;
}

export interface RelayQuote {
  quoteId: string;
  originTx: {
    chainId: number;
    to: string;
    data: string;
    value: string;
  };
  destAmountExpected: string;
  destAmountMin: string;
}

export interface CreateIntentRequest {
  megaethAddress: string;
  marketId: string;
  outcome: Outcome;
  /** Action: BUY (default) or SELL */
  action?: 'BUY' | 'SELL';
  inputCurrency?: string;
  /** For BUY orders: amount in wei */
  inputAmountWei?: string;
  /** For SELL orders: number of shares to sell */
  amountShares?: number;
  maxSlippageBps?: number;
  clientRequestId?: string;
  /** User's signed wallet derivation message. Only required for first trade (wallet creation). */
  walletSignature?: string;
  /** Order type: MARKET (instant fill) or LIMIT (sits in orderbook). Default: MARKET */
  orderType?: 'MARKET' | 'LIMIT';
  /** Limit price (0.01 - 0.99) for LIMIT orders. Required if orderType is LIMIT. */
  limitPrice?: string;
}

export interface CreateIntentResponse {
  intentId: string;
  state: IntentState;
  polymarketWalletAddress: string;
  relay: {
    quoteId: string;
    originTx: {
      chainId: number;
      to: string;
      data: string;
      value: string;
    };
  };
  estimates: {
    destToken: string;
    destAmountExpected: string;
    destAmountMin: string;
  };
}

export interface IntentStatusResponse {
  intentId: string;
  state: IntentState;
  relayStatus?: string;
  originTxHash?: string;
  polygonFundingTxHash?: string;
  polymarketOrderId?: string;
  fill?: {
    status: 'open' | 'partial' | 'filled' | 'failed';
    filledUSDC: string;
    shares: string;
    avgPrice: string;
  };
  error?: {
    code: string;
    detail: string;
  };
}

export interface RelayWebhookPayload {
  quoteId?: string;
  requestId?: string;
  status: string;
  originTxHash?: string;
  destTxHash?: string;
  error?: string;
}

export interface WithdrawRequest {
  megaethAddress: string;
  walletSignature: string;
  amountUsdc: string; // Amount in USDC (e.g., "19.53")
  destCurrency?: string; // Default: native ETH on MegaETH
}

export interface WithdrawResponse {
  withdrawalId: string;
  safeAddress: string;
  destAddress: string;
  amountUsdc: string;
  relay: {
    quoteId: string;
    destAmountExpected: string;
    originTxHash?: string;
  };
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface CancelOrderRequest {
  megaethAddress: string;
  walletSignature: string;
  orderId: string;
}

export interface CancelOrderResponse {
  orderId: string;
  status: 'cancelled' | 'failed';
  message?: string;
}

// Referral System Types
export enum ReferralActionType {
  SIGNUP = 'signup',
  WALLET_CREATED = 'wallet_created',
  FIRST_DEPOSIT = 'first_deposit',
  FIRST_TRADE = 'first_trade',
  TRADE = 'trade',
  WITHDRAWAL = 'withdrawal',
}

export interface ReferralAction {
  id: string;
  user_id: string;
  referrer_id: string;
  action_type: ReferralActionType;
  action_data?: Record<string, unknown>;
  intent_id?: string;
  created_at: string;
}

export interface ReferralStats {
  referrer_id: string;
  referrer_address: string;
  referral_code: string;
  total_referrals: number;
  active_referrals: number;
  total_trades: number;
  total_volume_usdc: number;
  last_activity?: string;
}

export interface ReferredUser {
  megaeth_address: string;
  referred_at: string;
  connected: boolean;
  has_wallet: boolean;
  has_traded: boolean;
  /** Count of tracked actions (trades, swap, vault, Polymarket, etc.) */
  activity_count: number;
  /** 0–100 score from activity (no per-user volume shown to referrer) */
  activity_score: number;
}

export interface ApplyReferralRequest {
  megaethAddress: string;
  referralCode: string;
}

export interface ReferralLinkResponse {
  referralCode: string;
  referralLink: string;
  stats: ReferralStats;
}

export interface ReferralLeaderboardEntry {
  rank: number;
  referrer_address: string;
  referral_code: string;
  total_referrals: number;
  active_referrals: number;
  total_volume_usdc: number;
}