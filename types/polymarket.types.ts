export type IntentState =
  | 'CREATED'
  | 'WALLET_DEPLOYING'
  | 'WALLET_READY'
  | 'RELAY_QUOTED'
  | 'ORIGIN_TX_SUBMITTED'
  | 'RELAY_EXECUTING'
  | 'DEST_FUNDED'
  | 'ORDER_SUBMITTING'
  | 'ORDER_PLACED'
  | 'FILLED'
  | 'PARTIAL_FILL'
  | 'NEEDS_RETRY'
  | 'FAILED'
  | 'CANCELLED';

export type Outcome = 'YES' | 'NO';

export interface CreateIntentRequest {
  megaethAddress: string;
  marketId: string;
  outcome: Outcome;
  action?: 'BUY' | 'SELL';
  inputCurrency?: string;
  inputAmountWei?: string;
  amountShares?: number;
  maxSlippageBps?: number;
  orderType?: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  clientRequestId?: string;
  walletSignature?: string;
}

export interface OriginTx {
  chainId: number;
  to: string;
  data: string;
  value: string;
}

export interface CreateIntentResponse {
  intentId: string;
  state: IntentState;
  action?: 'BUY' | 'SELL';
  polymarketWalletAddress?: string;
  relay?: {
    quoteId: string;
    originTx: OriginTx;
  };
  estimates?: {
    destToken: string;
    destAmountExpected: string;
    destAmountMin: string;
  };
  order?: {
    orderId: string;
    status: string;
    outcome: Outcome;
    shares: number;
  };
  message?: string;
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
  } | null;
}

export interface IntentUpdate {
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
  } | null;
}

export interface StateTransition {
  intentId: string;
  fromState: IntentState;
  toState: IntentState;
}

export interface IntentError {
  intentId: string;
  error: {
    code: string;
    detail: string;
  };
}

export interface StateUIConfig {
  label: string;
  description?: string;
  progress: number;
  success?: boolean;
  canRetry?: boolean;
  error?: boolean;
}

export interface MarketToken {
  token_id: string;
  outcome: string;
  price: string;
  winner?: boolean;
}

export interface Market {
  id: string;
  market_id?: string;
  conditionId?: string;
  condition_id?: string;
  question: string;
  groupItemTitle?: string;
  description?: string;
  slug?: string;
  endDateIso?: string;
  endDate?: string;
  gameStartTime?: string;
  questionID?: string;
  clobTokenIds?: string;
  outcomePrices?: string | string[];
  outcomes?: string | string[];
  tokens?: Array<{ outcome: string; price?: string; token_id?: string }>;
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  accepting_orders?: boolean;
  tradeable?: boolean;
  image?: string;
  icon?: string;
  lastTradePrice?: number;
  oneHourPriceChange?: number;
  oneDayPriceChange?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
  eventSlug?: string;
  seriesSlug?: string;
  eventTitle?: string;
  eventId?: number | string;
  eventStartTime?: string;
  startTime?: string;
  resolutionSource?: string;
  recurrence?: string;
  isLive?: boolean;
  category?: string;
  subcategory?: string;
  tags?: string[];
}

export interface Tag {
  id?: number;
  slug: string;
  label: string;
}

export interface TagsResponse {
  tags: Tag[];
}

export interface EventsResponse {
  events?: unknown[];
  markets?: Market[];
  pagination?: {
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
}

export interface OrderbookEntry {
  price: string;
  size: string;
}

export interface OrderbookResponse {
  marketId: string;
  outcome: string;
  tokenId: string;
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
}

export interface FeaturedMarketsResponse {
  trending: Market[];
  byCategory?: Record<string, Market[]>;
  markets: Market[];
}

export interface MarketsResponse {
  markets: Market[];
  pagination?: {
    hasMore: boolean;
    totalResults: number;
  };
}

export interface PricePoint {
  t: number;
  p: number;
}

export interface PriceHistoryResponse {
  history: PricePoint[];
}

export interface Position {
  orderId: string;
  market: {
    id: string;
    question: string;
    conditionId?: string;
    slug?: string;
  };
  outcome: 'YES' | 'NO';
  side?: 'BUY' | 'SELL';
  size: number;           // Number of shares
  price: number;          // Avg price paid per share
  currentPrice: number;   // Current market price
  totalCost: number;      // Total spent
  currentValue: number;   // Current value (size × currentPrice)
  unrealizedPnl: number;  // Profit/loss
  unrealizedPnlPercent: number; // P&L as percentage
  potentialPayout: number;
  potentialProfit: number;
  status?: string;
  createdAt?: string;
}

export interface UserPositionsResponse {
  wallet: string;
  eoa?: string;
  usdcBalance: number;
  openOrders: Position[];
  totalInvested: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercent: number;
  totalPotentialPayout: number;
}

export interface TradeHistory {
  intentId: string;
  marketId: string;
  conditionId?: string;
  outcome: 'YES' | 'NO';
  action: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  inputAmount: string;
  inputCurrency: string;
  destAmountExpected: string;
  limitPrice?: string;
  state: IntentState;
  polymarketOrderId?: string;
  originTxHash?: string;
  polygonTxHash?: string;
  errorCode?: string;
  errorDetail?: string;
  source?: 'INTENT' | 'POLYMARKET';
  createdAt: string;
  updatedAt: string;
}

export interface TradeHistoryResponse {
  trades: TradeHistory[];
  total: number;
  limit: number;
  offset: number;
}

export interface PolymarketOpenInterestResponse {
  market?: string;
  openInterest?: number | string;
  interest?: number | string;
  value?: number | string;
}

export interface PolymarketLiveVolumeResponse {
  eventId?: number | string;
  volume?: number | string;
  liveVolume?: number | string;
}

export interface PolymarketActivityItem {
  proxyWallet?: string;
  timestamp?: number;
  conditionId?: string;
  type?: string;
  size?: number;
  usdcSize?: number;
  transactionHash?: string;
  price?: number;
  side?: 'BUY' | 'SELL';
  outcome?: string;
  title?: string;
  slug?: string;
  icon?: string;
}

export interface PolymarketHolder {
  proxyWallet?: string;
  amount?: number;
  pseudonym?: string;
  name?: string;
  profileImage?: string;
  outcomeIndex?: number;
}

export interface PolymarketHoldersItem {
  token: string;
  holders: PolymarketHolder[];
}

export interface OpenOrder {
  orderId: string;
  tokenId?: string;
  side?: 'BUY' | 'SELL';
  size?: string;
  sizeRemaining?: string;
  price?: string;
  status?: string;
  createdAt?: string;
  orderType?: 'LIMIT' | 'MARKET';
}
