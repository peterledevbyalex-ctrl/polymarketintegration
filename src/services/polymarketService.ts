import axios from 'axios';
import { config } from '../config';
import logger from '../utils/logger';
import { TradeIntent } from '../types';
import { supabase } from '../db/supabase';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import { retry } from '../utils/retry';
import { trackApiCall, trackError } from '../utils/metrics';
import { PolymarketRelayerClient } from './polymarketRelayerClient';
import { createPublicClient, http, encodeFunctionData, maxUint256, formatUnits } from 'viem';
import { polygon } from 'viem/chains';
import { ClobClient } from '@polymarket/clob-client';
import { SignatureType } from '@polymarket/order-utils';
import { createProfiler } from '../utils/profiler';
import { decryptSignature } from '../utils/encryption';
import { derivePolygonPrivateKey } from '../utils/signatureKeyDerivation';
// Use ethers v5 from clob-client's dependencies for compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Wallet } = require('@polymarket/clob-client/node_modules/ethers') as typeof import('ethers');

export interface PositionSummary {
  wallet: string;
  market: string;
  outcome: string;
  shares: number;
  avgPrice: number;
  totalCost: number;
  remainingUsdcBalance: number;
  potentialPayout: number;
  potentialProfit: number;
}

export interface OrderResult {
  orderId: string;
  txHash: string;
  status: 'open' | 'partial' | 'filled' | 'failed';
  position?: PositionSummary | null;
}

export interface FillInfo {
  status: 'open' | 'partial' | 'filled' | 'failed';
  filledUSDC: string;
  shares: string;
  avgPrice: string;
}

export interface UserPosition {
  orderId: string;
  market: {
    id: string;
    question: string;
    slug?: string;
    conditionId?: string;
  };
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  size: number;           // Number of shares
  price: number;          // Avg price paid per share
  currentPrice: number;   // Current market price
  totalCost: number;      // Total spent (size × price)
  currentValue: number;   // Current value (size × currentPrice)
  unrealizedPnl: number;  // Profit/loss (currentValue - totalCost)
  unrealizedPnlPercent: number; // P&L as percentage
  status: string;
  createdAt: string;
  potentialPayout: number;
  potentialProfit: number;
}

export interface UserPositionsResponse {
  wallet: string;
  usdcBalance: number;
  openOrders: UserPosition[];
  totalInvested: number;
  totalCurrentValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercent: number;
  totalPotentialPayout: number;
}

// Cache for approval status - avoids redundant on-chain checks
const approvalCache = new Map<string, { approved: boolean; timestamp: number }>();
const APPROVAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - approvals are max uint256

// Cache for CLOB credentials per wallet - avoids slow deriveApiKey calls
const clobCredsCache = new Map<string, { creds: { key: string; secret: string; passphrase: string }; timestamp: number }>();
const CLOB_CREDS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour - credentials don't change often

export class PolymarketService {
  private placeOrderBreaker: ReturnType<typeof createCircuitBreaker>;
  private getOrderStatusBreaker: ReturnType<typeof createCircuitBreaker>;
  private relayerClient: PolymarketRelayerClient;

  // Polymarket contract addresses (Polygon) - from @polymarket/clob-client/config.js
  private readonly USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  private readonly CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'; // CTF Exchange (regular markets)
  private readonly NEG_RISK_EXCHANGE_ADDRESS = '0xC5d563A36AE78145C45a50134d48A1215220f80a'; // Neg Risk Exchange
  private readonly NEG_RISK_ADAPTER_ADDRESS = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296'; // Neg Risk Adapter

  constructor() {
    this.relayerClient = new PolymarketRelayerClient();
    this.placeOrderBreaker = createCircuitBreaker(this._placeOrder.bind(this), {
      timeout: 30000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });

    this.getOrderStatusBreaker = createCircuitBreaker(this._getOrderStatus.bind(this), {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });
    
    this._initClobClient();
  }
  
  private async _initClobClient(): Promise<void> {
    try {
      const host = config.polymarket.clobApiUrl;
      const chainId = 137; // Polygon
      
      logger.info('Initializing CLOB clients...');

      const privateKey = process.env.POLYMARKET_SERVICE_PRIVATE_KEY;
      
      if (!privateKey) {
        logger.warn('POLYMARKET_SERVICE_PRIVATE_KEY not set - order placement disabled');
        return;
      }
      
      const wallet = new Wallet(privateKey);
      logger.info('Service wallet for CLOB', { address: wallet.address });
      
      // CLOB API credentials must be derived FROM the signing wallet
      // Builder credentials won't work if they're for a different wallet
      const tempClient = new ClobClient(host, chainId, wallet as any);
      
      let creds: any = null;
      
      // First try to derive existing API key (wallet already registered)
      try {
        logger.info('Deriving CLOB API key for service wallet...');
        creds = await tempClient.deriveApiKey();
        logger.info('CLOB API key derived', { 
          creds: JSON.stringify(creds),
          hasKey: !!creds?.key,
          hasApiKey: !!creds?.apiKey,
        });
      } catch (deriveErr: any) {
        // If derive fails, try create
        logger.info('Derive failed, trying to create new key...', { 
          error: deriveErr.message 
        });
        
        try {
          creds = await tempClient.createApiKey();
          logger.info('CLOB API key created', { 
            creds: JSON.stringify(creds),
            hasKey: !!creds?.key,
            hasApiKey: !!creds?.apiKey,
          });
        } catch (createErr: any) {
          logger.error('Failed to obtain CLOB credentials for service wallet', { 
            deriveError: deriveErr.message,
            createError: createErr.message,
            walletAddress: wallet.address,
          });
          logger.warn('To fix: Go to polymarket.com, connect this wallet, and enable trading');
          return;
        }
      }
      
      // Normalize - SDK might return apiKey instead of key
      if (creds && !creds.key && creds.apiKey) {
        creds.key = creds.apiKey;
      }
      
      if (!creds?.key) {
        logger.error('No valid credentials obtained');
        return;
      }
      
      // Create CLOB client with the wallet's own credentials
      // @ts-expect-error - ignore type error i think it's a bug in the sdk
      this.clobClientWithSigner = new ClobClient(
        host,
        chainId,
        wallet as any,
        creds,
        SignatureType.POLY_GNOSIS_SAFE, // Safe wallet signature
      );
      
      logger.info('CLOB client initialized with wallet-specific credentials', {
        signatureType: 'POLY_GNOSIS_SAFE',
        walletAddress: wallet.address,
      });
    } catch (error) {
      logger.error('Failed to initialize CLOB client', error);
    }
  }

  /**
   * Get CLOB credentials for a wallet - cached for performance
   */
  private async _getCachedClobCredentials(wallet: any): Promise<{ key: string; secret: string; passphrase: string }> {
    const walletAddress = wallet.address.toLowerCase();
    const cached = clobCredsCache.get(walletAddress);
    
    // Return cached if fresh
    if (cached && Date.now() - cached.timestamp < CLOB_CREDS_CACHE_TTL_MS) {
      logger.debug('Using cached CLOB credentials', { wallet: walletAddress });
      return cached.creds;
    }
    
    // Fetch fresh credentials
    const host = config.polymarket.clobApiUrl;
    const tempClient = new ClobClient(host, 137, wallet as any);
    let credentials: any = null;
    
    try {
      credentials = await tempClient.deriveApiKey();
    } catch (deriveErr: any) {
      logger.debug('Derive failed, creating new credentials');
    }
    
    if (!credentials?.key && !credentials?.apiKey && !credentials?.secret) {
      credentials = await tempClient.createApiKey();
    }
    
    // Normalize key field
    if (credentials && !credentials.key && credentials.apiKey) {
      credentials.key = credentials.apiKey;
    }
    
    if (!credentials?.key || !credentials?.secret) {
      throw new Error('Failed to obtain valid CLOB API credentials');
    }
    
    // Cache the credentials
    clobCredsCache.set(walletAddress, {
      creds: { key: credentials.key, secret: credentials.secret, passphrase: credentials.passphrase },
      timestamp: Date.now(),
    });
    
    logger.debug('Cached fresh CLOB credentials', { wallet: walletAddress });
    return { key: credentials.key, secret: credentials.secret, passphrase: credentials.passphrase };
  }

  async placeOrder(intent: TradeIntent): Promise<OrderResult> {
    const startTime = Date.now();
    try {
      const result = await retry(
        () => this.placeOrderBreaker.fire(intent),
        {
          maxAttempts: 3,
          initialDelay: 1000,
          retryableErrors: ['timeout', 'network'],
        }
      );

      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('polymarket', 'placeOrder', 'success', latency);
      return result as OrderResult;
    } catch (error) {
      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('polymarket', 'placeOrder', 'error', latency);
      trackError('polymarket_order_error', 'polymarket');
      throw error;
    }
  }

  private async _placeOrder(intent: TradeIntent): Promise<OrderResult> {
    const profiler = createProfiler('placeOrder', intent.intent_id);
    
    try {
      // Get wallet address, stored signature, and derivation info
      const userWallet = await profiler.timeStep('db_get_wallet', async () => {
        const { data } = await supabase
          .from('polymarket_wallets')
          .select('polygon_wallet_address, wallet_signature, derivation_version, signature_encrypted')
          .eq('user_id', intent.user_id)
          .single();
        return data;
      });

      if (!userWallet) {
        throw new Error('Polymarket wallet not found for user');
      }
      
      const proxyWalletAddress = userWallet.polygon_wallet_address;
      const derivationVersion = (userWallet.derivation_version || 1) as 1 | 2;
      
      logger.info('Starting order placement', {
        market: intent.market_id,
        outcome: intent.outcome,
        wallet: proxyWalletAddress,
        derivationVersion,
      });
      
      // Get signature: use intent signature, or decrypt stored signature if needed
      let signature = intent.wallet_signature;
      if (!signature && userWallet.wallet_signature) {
        if (userWallet.signature_encrypted) {
          signature = decryptSignature(userWallet.wallet_signature);
        } else {
          signature = userWallet.wallet_signature;
        }
      }
      if (!signature) {
        throw new Error('No wallet signature available - user must sign once');
      }
      
      // Derive key from signature using correct version
      const { userPrivateKey, userWalletSigner } = await profiler.timeStep('derive_private_key', async () => {
        const pk = derivePolygonPrivateKey(
          signature!, 
          derivationVersion === 2 ? intent.user_id : undefined, 
          derivationVersion
        );
        return { userPrivateKey: pk, userWalletSigner: new Wallet(pk) };
      });
      
      const host = config.polymarket.clobApiUrl;
      
      logger.info('Signer address for CLOB', { signerAddress: userWalletSigner.address });
      
      // Get or create CLOB API credentials (with caching)
      const creds = await profiler.timeStep('clob_get_credentials', async () => {
        return this._getCachedClobCredentials(userWalletSigner);
      });
      
      if (!creds?.key || !creds?.secret) {
        throw new Error('Failed to obtain valid CLOB API credentials');
      }
      
      logger.info('CLOB credentials ready', { hasKey: !!creds.key, hasSecret: !!creds.secret });
      
      const orderClient = new ClobClient(
        host,
        137,
        userWalletSigner as any,
        creds,
        SignatureType.POLY_GNOSIS_SAFE,
        proxyWalletAddress,
      );

      // Resolve market token
      const tokenId = await profiler.timeStep('resolve_token_id', async () => {
        return this._getTokenIdForMarket(intent.market_id, intent.outcome);
      });
      logger.debug('Token resolved', { tokenId });

      // Ensure approvals (USDC for BUY, CTF for SELL)
      const isSellOrder = intent.action === 'SELL';
      logger.info('Processing order', { 
        action: intent.action,
        isSellOrder, 
        marketId: intent.market_id,
        outcome: intent.outcome,
      });
      
      await profiler.timeStep('ensure_approvals', async () => {
        return this._ensureApprovals(proxyWalletAddress, userPrivateKey, intent.market_id, isSellOrder);
      });

      // For SELL orders, verify user actually owns shares
      if (isSellOrder) {
        const sharesBalance = await profiler.timeStep('check_share_balance', async () => {
          const polygonClient = createPublicClient({ chain: polygon, transport: http('https://polygon-rpc.com') });
          
          const balance = await polygonClient.readContract({
            address: this.CTF_CONTRACT_ADDRESS as `0x${string}`,
            abi: [{
              name: 'balanceOf',
              type: 'function',
              inputs: [
                { name: 'account', type: 'address' },
                { name: 'id', type: 'uint256' }
              ],
              outputs: [{ type: 'uint256' }],
              stateMutability: 'view'
            }],
            functionName: 'balanceOf',
            args: [proxyWalletAddress as `0x${string}`, BigInt(tokenId)]
          });
          return Number(balance) / 1e6; // CTF tokens have 6 decimals
        });
        
        const sharesToSell = parseFloat(intent.input_amount);
        logger.info('SELL order balance check', { 
          sharesOwned: sharesBalance, 
          sharesToSell,
          tokenId: tokenId.substring(0, 20) + '...',
          market: intent.market_id,
        });
        
        // Add small tolerance for floating point comparison (0.01 shares ~ 1 cent)
        const TOLERANCE = 0.01;
        if (sharesBalance + TOLERANCE < sharesToSell) {
          throw new Error(`Insufficient shares: you own ${sharesBalance.toFixed(2)} but trying to sell ${sharesToSell.toFixed(2)}`);
        }
        
        // Also check what CLOB SDK reports for this specific token
        try {
          const clobBalance = await orderClient.getBalanceAllowance({
            asset_type: 'CONDITIONAL' as any,
            token_id: tokenId,
          });
          logger.info('CLOB SDK balance check for SELL', {
            tokenId: tokenId.substring(0, 20) + '...',
            fullResponse: JSON.stringify(clobBalance),
            clobBalance: clobBalance.balance,
            clobAllowance: clobBalance.allowance,
            onChainBalance: sharesBalance,
          });
          
          // Check if allowance is insufficient
          if (clobBalance.allowance && parseFloat(clobBalance.allowance) < sharesBalance * 1e6) {
            logger.warn('CLOB reports insufficient allowance!', {
              reported: clobBalance.allowance,
              needed: sharesBalance * 1e6,
            });
          }
          
          // Force CLOB to re-sync with on-chain state
          logger.info('Calling updateBalanceAllowance to sync CLOB state...');
          await orderClient.updateBalanceAllowance({
            asset_type: 'CONDITIONAL' as any,
            token_id: tokenId,
          });
          logger.info('CLOB state synced');
        } catch (e: any) {
          logger.warn('Could not get/update CLOB balance', { error: e.message });
        }
      }

      // Determine order type and price
      const isLimitOrder = intent.order_type === 'LIMIT';
      let orderPrice: string;
      
      if (isLimitOrder && intent.limit_price) {
        // Use the specified limit price
        orderPrice = intent.limit_price;
        logger.info('Using LIMIT order', { limitPrice: orderPrice });
      } else {
        // Get best market price for market orders
        // For BUY: get best ask (lowest sell offer)
        // For SELL: get best bid (highest buy offer)
        const priceAction = (intent as any).action === 'SELL' ? 'SELL' : 'BUY';
        orderPrice = await profiler.timeStep('get_market_price', async () => {
          return this._getBestPrice(tokenId, priceAction);
        });
        logger.info('Using MARKET order', { marketPrice: orderPrice, action: priceAction });
      }

      // Determine order side and size based on action
      const isSell = (intent as any).action === 'SELL';
      const side = isSell ? 'SELL' : 'BUY';
      
      let size: number;
      let amountUsdc: number;
      if (isSell) {
        // SELL: size is the number of shares to sell (stored in input_amount)
        size = parseFloat(intent.input_amount);
        amountUsdc = 0; // Not applicable for sell
      } else {
        // BUY: calculate size from USDC amount and price
        amountUsdc = parseFloat(intent.dest_amount_expected) / 1e6;
        const price = parseFloat(orderPrice);
        size = amountUsdc / price;
      }
      
      logger.info('Submitting order', { 
        action: isSell ? 'SELL' : 'BUY',
        orderType: isLimitOrder ? 'LIMIT' : 'MARKET',
        size: size.toFixed(2), 
        price: orderPrice, 
        side,
        outcome: intent.outcome,
      });
      
      // Submit order to CLOB
      const response = await profiler.timeStep('clob_create_post_order', async () => {
        return orderClient.createAndPostOrder({
          tokenID: tokenId,
          price: parseFloat(orderPrice),
          size: parseFloat(size.toFixed(2)),
          side: side as any,
        });
      });

      // Check for API error response
      if (response.error || response.errorMsg) {
        const errorMsg = response.error || response.errorMsg;
        logger.error('Order submission failed', { error: errorMsg });
        profiler.finish();
        if (errorMsg.includes('balance') || errorMsg.includes('allowance')) {
          throw new Error(`Insufficient balance or allowance: ${errorMsg}`);
        }
        throw new Error(`CLOB API error: ${errorMsg}`);
      }
      
      logger.info('Order placed', { orderId: response.orderID, status: response.status });

      // Fetch position summary (non-critical)
      const position = await profiler.timeStep('fetch_position', async () => {
        try {
          const balanceInfo = await orderClient.getBalanceAllowance({ asset_type: 'COLLATERAL' as any });
          const remainingUsdc = parseFloat(balanceInfo.balance) / 1e6;
          
          return {
            wallet: proxyWalletAddress,
            market: intent.market_id,
            outcome: intent.outcome,
            shares: parseFloat(size.toFixed(2)),
            avgPrice: parseFloat(orderPrice),
            totalCost: amountUsdc,
            remainingUsdcBalance: remainingUsdc,
            potentialPayout: parseFloat(size.toFixed(2)),
            potentialProfit: parseFloat(size.toFixed(2)) - amountUsdc,
          };
        } catch (e) {
          logger.warn('Could not fetch position details');
          return null;
        }
      });

      // Output timing profile
      profiler.finish();

      return {
        orderId: response.orderID || 'unknown',
        txHash: '',
        status: this._mapOrderStatus(response.status || 'live'),
        position,
      };
    } catch (error: any) {
      profiler.finish();
      logger.error('Error placing Polymarket order via CLOB SDK', {
        error: error.message,
        stack: error.stack?.substring(0, 500),
      });
      
      // Check for specific error types - order matters!
      if (error.message?.includes('wallet not found')) {
        throw error; // Re-throw wallet errors as-is
      }
      
      if (error.message?.includes('balance') || error.message?.includes('allowance')) {
        throw new Error(`Insufficient balance or allowance to place order`);
      }
      
      if (error.message?.includes('closed') || (error.message?.includes('market') && error.message?.includes('not found'))) {
        throw new Error(`Market not found or closed`);
      }
      
      throw new Error(`Failed to place order: ${error.message}`);
    }
  }

  // Cache market info to avoid redundant API calls
  private marketCache = new Map<string, { data: any; timestamp: number }>();
  private MARKET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the correct token_id for a market outcome (YES/NO)
   * Also caches market info for neg_risk detection
   */
  private async _getTokenIdForMarket(marketId: string, outcome: string): Promise<string> {
    try {
      logger.info('Looking up market on CLOB', { marketId });
      
      const market = await this._getMarketInfo(marketId);
      
      // Log full market info to debug mismatches
      logger.info('Market data fetched', { 
        marketId, 
        question: market.question,
        active: market.active,
        closed: market.closed,
        negRisk: market.neg_risk || false,
        endDate: market.end_date_iso,
        // Show token prices to verify correct market
        tokens: market.tokens?.map((t: any) => ({
          outcome: t.outcome,
          price: t.price,
          token_id: t.token_id?.substring(0, 20) + '...',
        })),
      });

      // Check if market is tradeable (active AND not closed)
      if (market.closed === true) {
        const winner = market.tokens?.find((t: any) => t.winner)?.outcome || 'unknown';
        throw new Error(`Market already resolved - winner: ${winner}. Pick an active market.`);
      }
      
      if (market.active === false) {
        throw new Error(`Market is not active for trading`);
      }

      // Tokens array: [0] = first outcome, [1] = second outcome
      // For binary markets: typically YES/NO
      const tokenIndex = outcome === 'YES' ? 0 : 1;
      const token = market.tokens?.[tokenIndex];
      
      if (!token?.token_id) {
        throw new Error(`Token not found for outcome ${outcome} in market ${marketId}`);
      }

      logger.info('Token resolved for order', {
        marketId,
        outcome,
        tokenId: token.token_id,
        tokenOutcome: token.outcome,
        isNegRisk: market.neg_risk || false,
      });

      return token.token_id;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Market ${marketId} not found on Polymarket`);
      }
      throw error;
    }
  }

  /**
   * Get market info with caching
   */
  private async _getMarketInfo(marketId: string): Promise<any> {
    const cached = this.marketCache.get(marketId);
    if (cached && (Date.now() - cached.timestamp) < this.MARKET_CACHE_TTL_MS) {
      return cached.data;
    }

    const response = await axios.get(`${config.polymarket.clobApiUrl}/markets/${marketId}`);
    const market = response.data;
    
    this.marketCache.set(marketId, { data: market, timestamp: Date.now() });
    return market;
  }

  /**
   * Check if a market uses negative risk (multi-outcome) contracts
   */
  private async _isNegRiskMarket(marketId: string): Promise<boolean> {
    try {
      const market = await this._getMarketInfo(marketId);
      return market.neg_risk === true;
    } catch {
      return false; // Default to regular market if check fails
    }
  }

  /**
   * Get best available price for a token
   * Price must be > 0 and < 1 on Polymarket
   */
  private async _getBestPrice(tokenId: string, side: string): Promise<string> {
    try {
      const response = await axios.get(`${config.polymarket.clobApiUrl}/book?token_id=${tokenId}`);
      const book = response.data;
      
      // For BUY, we want the lowest ask (what sellers are offering)
      // For SELL, we want the highest bid (what buyers are offering)
      if (side === 'BUY') {
        const bestAsk = book.asks?.[0];
        if (bestAsk) {
          const askPrice = parseFloat(bestAsk.price);
          // Add small buffer for fill, but cap at 0.99 (must be < 1)
          const price = Math.min(askPrice + 0.01, 0.99);
          return price.toFixed(2);
        }
        return '0.50'; // Default mid price if no asks
      } else {
        const bestBid = book.bids?.[0];
        if (bestBid) {
          const bidPrice = parseFloat(bestBid.price);
          // Subtract small buffer for fill, but floor at 0.01 (must be > 0)
          const price = Math.max(bidPrice - 0.01, 0.01);
          return price.toFixed(2);
        }
        return '0.50'; // Default mid price if no bids
      }
    } catch (error) {
      logger.warn('Failed to get orderbook, using default price', { tokenId });
      return '0.50';
    }
  }

  private _mapOrderStatus(status: string): 'open' | 'partial' | 'filled' | 'failed' {
    const upperStatus = status.toUpperCase();
    if (upperStatus === 'FILLED' || upperStatus === 'MATCHED') return 'filled';
    if (upperStatus === 'PARTIAL' || upperStatus === 'PARTIALLY_FILLED') return 'partial';
    if (upperStatus === 'FAILED' || upperStatus === 'CANCELLED' || upperStatus === 'EXPIRED') return 'failed';
    return 'open';
  }

  async getOrderStatus(orderId: string): Promise<FillInfo> {
    const startTime = Date.now();
    try {
      const result = await retry(
        () => this.getOrderStatusBreaker.fire(orderId),
        {
          maxAttempts: 3,
          initialDelay: 500,
          retryableErrors: ['timeout', 'network'],
        }
      );

      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('polymarket', 'getOrderStatus', 'success', latency);
      return result as FillInfo;
    } catch (error) {
      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('polymarket', 'getOrderStatus', 'error', latency);
      trackError('polymarket_status_error', 'polymarket');
      throw error;
    }
  }

  private async _getOrderStatus(orderId: string): Promise<FillInfo> {
    try {
      // Try the data-api endpoint first (public, no auth required)
      const response = await axios.get(
        `https://data-api.polymarket.com/order/${orderId}`,
        { timeout: 5000 }
      );

      const order = response.data;
      return {
        status: this._mapOrderStatus(order.status || order.outcome || 'OPEN'),
        filledUSDC: order.size_matched || order.filled_size || '0',
        shares: order.size_matched || order.filled_shares || '0',
        avgPrice: order.price || order.avg_fill_price || '0',
      };
    } catch (error: any) {
      // If data-api fails, try gamma-api
      try {
        const gammaResponse = await axios.get(
          `https://gamma-api.polymarket.com/orders?id=${orderId}`,
          { timeout: 5000 }
        );
        
        if (gammaResponse.data && gammaResponse.data.length > 0) {
          const order = gammaResponse.data[0];
          return {
            status: this._mapOrderStatus(order.status || order.outcome || 'OPEN'),
            filledUSDC: order.size_matched || '0',
            shares: order.size_matched || '0',
            avgPrice: order.price || '0',
          };
        }
      } catch (gammaError) {
        logger.debug('Gamma API fallback also failed', { orderId });
      }

      // If order was just placed and APIs haven't indexed it yet, assume pending
      logger.warn('Could not fetch order status, assuming pending', { orderId });
      return {
        status: 'open',
        filledUSDC: '0',
        shares: '0',
        avgPrice: '0',
      };
    }
  }

  async checkExistingOrder(_intentId: string): Promise<OrderResult | null> {
    try {
      // CLOB API: Query orders by user (we'll filter by nonce or use a different approach)
      // Alternative: Store orderId in database when creating, then query by that
      // For now, we'll try to get orders and filter by a stored reference
      // Note: CLOB API may not support direct idempotency key lookup
      // Best practice: Store orderId in trade_intents table when order is created
      
      // This is a placeholder - in production, you'd query your database
      // for the orderId associated with this intentId, then check status
      if (logger && typeof logger.warn === 'function') {
        logger.warn('checkExistingOrder: Idempotency check via CLOB API not directly supported. Use database lookup instead.');
      }
      
      // Return null to indicate no existing order found
      // The intent service should handle idempotency via database
      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      if (logger && typeof logger.error === 'function') {
        logger.error('Error checking existing order', error);
      }
      throw new Error('Failed to check existing order');
    }
  }

  // Conditional Tokens Framework contract - needed for neg risk markets
  private readonly CTF_CONTRACT_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

  /**
   * Ensure appropriate approvals for trading:
   * - BUY orders: USDC.e approved for exchange contracts
   * - SELL orders: CTF (conditional tokens) approved for exchange contracts
   * Neg risk markets need additional approvals (neg risk adapter).
   * Uses in-memory cache to avoid redundant on-chain checks.
   */
  private async _ensureApprovals(walletAddress: string, userPrivateKey?: string, marketId?: string, isSell: boolean = false): Promise<void> {
    logger.info('_ensureApprovals called', { walletAddress, marketId, isSell });
    
    // Check cache first - use different cache key for SELL (needs CTF approvals)
    const cacheKey = `${walletAddress.toLowerCase()}-${isSell ? 'sell' : 'buy'}`;
    const cached = approvalCache.get(cacheKey);
    if (cached && cached.approved && (Date.now() - cached.timestamp) < APPROVAL_CACHE_TTL_MS) {
      logger.info('Approval cache hit - skipping on-chain check', { walletAddress, isSell, cacheKey });
      return;
    }
    
    logger.info('Approval cache miss - checking on-chain', { cacheKey, isSell });

    try {
      const publicClient = createPublicClient({ chain: polygon, transport: http('https://polygon-rpc.com') });
      
      // Check balance first
      const balance = await publicClient.readContract({
        address: this.USDC_E_ADDRESS as `0x${string}`,
        abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`]
      });
      
      // Check allowances for BOTH exchanges in parallel
      const [regularAllowance, negRiskAllowance, adapterAllowance] = await Promise.all([
        publicClient.readContract({
          address: this.USDC_E_ADDRESS as `0x${string}`,
          abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
          functionName: 'allowance',
          args: [walletAddress as `0x${string}`, this.CTF_EXCHANGE_ADDRESS as `0x${string}`]
        }),
        publicClient.readContract({
          address: this.USDC_E_ADDRESS as `0x${string}`,
          abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
          functionName: 'allowance',
          args: [walletAddress as `0x${string}`, this.NEG_RISK_EXCHANGE_ADDRESS as `0x${string}`]
        }),
        publicClient.readContract({
          address: this.USDC_E_ADDRESS as `0x${string}`,
          abi: [{ name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
          functionName: 'allowance',
          args: [walletAddress as `0x${string}`, this.NEG_RISK_ADAPTER_ADDRESS as `0x${string}`]
        })
      ]);
      
      logger.info('Wallet balances and allowances', {
        walletAddress,
        balance: formatUnits(balance, 6) + ' USDC',
        regularExchangeAllowance: formatUnits(regularAllowance, 6) + ' USDC',
        negRiskExchangeAllowance: formatUnits(negRiskAllowance, 6) + ' USDC',
        negRiskAdapterAllowance: formatUnits(adapterAllowance, 6) + ' USDC',
      });
      
      const minAllowance = BigInt(1_000_000_000_000_000); // 1 billion USDC threshold
      const approvalsNeeded: Array<{ to: string; data: string; value: string }> = [];
      
      // Check all allowances (all fetched in parallel above)
      if (regularAllowance < minAllowance) {
        logger.info('Need to approve regular CTF Exchange');
        approvalsNeeded.push({
          to: this.USDC_E_ADDRESS,
          data: encodeFunctionData({
            abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
            functionName: 'approve',
            args: [this.CTF_EXCHANGE_ADDRESS, maxUint256]
          }),
          value: '0'
        });
      }
      
      if (negRiskAllowance < minAllowance) {
        logger.info('Need to approve Neg Risk Exchange');
        approvalsNeeded.push({
          to: this.USDC_E_ADDRESS,
          data: encodeFunctionData({
            abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
            functionName: 'approve',
            args: [this.NEG_RISK_EXCHANGE_ADDRESS, maxUint256]
          }),
          value: '0'
        });
      }
      
      if (adapterAllowance < minAllowance) {
        logger.info('Need to approve Neg Risk Adapter');
        approvalsNeeded.push({
          to: this.USDC_E_ADDRESS,
          data: encodeFunctionData({
            abi: [{ name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
            functionName: 'approve',
            args: [this.NEG_RISK_ADAPTER_ADDRESS, maxUint256]
          }),
          value: '0'
        });
      }

      // Check if neg risk market
      const isNegRisk = marketId ? await this._isNegRiskMarket(marketId) : false;
      
      // For SELL orders, we need CTF (conditional token) approvals to sell shares
      // For neg risk markets (regardless of BUY/SELL), we also need CTF approvals
      if (isSell || isNegRisk) {
        logger.info('Checking CTF approvals', { marketId, isSell, isNegRisk });
        
        // Check CTF approval for regular CTF Exchange (needed for SELL on regular markets)
        const ctfRegularExchangeAllowance = await publicClient.readContract({
          address: this.CTF_CONTRACT_ADDRESS as `0x${string}`,
          abi: [{ name: 'isApprovedForAll', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
          functionName: 'isApprovedForAll',
          args: [walletAddress as `0x${string}`, this.CTF_EXCHANGE_ADDRESS as `0x${string}`]
        });
        
        // Check CTF approval for neg risk adapter and exchange
        const ctfAdapterAllowance = await publicClient.readContract({
          address: this.CTF_CONTRACT_ADDRESS as `0x${string}`,
          abi: [{ name: 'isApprovedForAll', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
          functionName: 'isApprovedForAll',
          args: [walletAddress as `0x${string}`, this.NEG_RISK_ADAPTER_ADDRESS as `0x${string}`]
        });

        const ctfNegRiskExchangeAllowance = await publicClient.readContract({
          address: this.CTF_CONTRACT_ADDRESS as `0x${string}`,
          abi: [{ name: 'isApprovedForAll', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
          functionName: 'isApprovedForAll',
          args: [walletAddress as `0x${string}`, this.NEG_RISK_EXCHANGE_ADDRESS as `0x${string}`]
        });

        logger.info('CTF approvals status', {
          ctfRegularExchangeApproved: ctfRegularExchangeAllowance,
          ctfAdapterApproved: ctfAdapterAllowance,
          ctfNegRiskExchangeApproved: ctfNegRiskExchangeAllowance,
        });

        // For SELL on regular markets, need CTF approved for regular exchange
        if (!ctfRegularExchangeAllowance) {
          logger.info('Need to approve CTF for Regular CTF Exchange');
          approvalsNeeded.push({
            to: this.CTF_CONTRACT_ADDRESS,
            data: encodeFunctionData({
              abi: [{ name: 'setApprovalForAll', type: 'function', inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] }],
              functionName: 'setApprovalForAll',
              args: [this.CTF_EXCHANGE_ADDRESS, true]
            }),
            value: '0'
          });
        }

        // For neg risk markets, need adapter and neg risk exchange approvals
        if (!ctfAdapterAllowance) {
          logger.info('Need to approve CTF for Neg Risk Adapter');
          approvalsNeeded.push({
            to: this.CTF_CONTRACT_ADDRESS,
            data: encodeFunctionData({
              abi: [{ name: 'setApprovalForAll', type: 'function', inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] }],
              functionName: 'setApprovalForAll',
              args: [this.NEG_RISK_ADAPTER_ADDRESS, true]
            }),
            value: '0'
          });
        }

        if (!ctfNegRiskExchangeAllowance) {
          logger.info('Need to approve CTF for Neg Risk Exchange');
          approvalsNeeded.push({
            to: this.CTF_CONTRACT_ADDRESS,
            data: encodeFunctionData({
              abi: [{ name: 'setApprovalForAll', type: 'function', inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] }],
              functionName: 'setApprovalForAll',
              args: [this.NEG_RISK_EXCHANGE_ADDRESS, true]
            }),
            value: '0'
          });
        }
      }
      
      if (approvalsNeeded.length === 0) {
        // All approvals set - cache this for 24h
        approvalCache.set(cacheKey, { approved: true, timestamp: Date.now() });
        logger.info('All USDC approvals already set - cached', { walletAddress });
        return;
      }
      
      logger.info(`Submitting ${approvalsNeeded.length} approval(s) via relayer...`);
      
      // Use user-specific relayer client if we have the user's key
      const relayerToUse = userPrivateKey 
        ? new PolymarketRelayerClient(userPrivateKey)
        : this.relayerClient;
      
      // Execute all approvals in one transaction batch
      const response = await relayerToUse.execute(
        approvalsNeeded,
        'Approve USDC for CTF Exchanges'
      );

      // Cache successful approval
      approvalCache.set(cacheKey, { approved: true, timestamp: Date.now() });
      
      logger.info(`USDC approval transaction confirmed - cached`, {
        transactionID: response.transactionID,
        transactionHash: response.transactionHash,
        state: response.state,
      });
    } catch (error) {
      logger.error('Error ensuring USDC approval via relayer', error);
      // Don't throw - continue with order and let CLOB API return specific error
      logger.warn('Continuing with order placement - approval may already exist');
    }
  }

  /**
   * Get all active positions for a user
   * Uses stored wallet signature if not provided (sign once, query always)
   */
  async getUserPositions(userId: string, walletSignature?: string): Promise<UserPositionsResponse> {
    try {
      logger.info('Fetching user positions', { userId });

      // Get user's Polymarket wallet (including stored signature and derivation version)
      const { data: userWallet, error: walletError } = await supabase
        .from('polymarket_wallets')
        .select('polygon_wallet_address, wallet_signature, derivation_version, signature_encrypted')
        .eq('user_id', userId)
        .single();

      if (walletError || !userWallet) {
        logger.warn('No Polymarket wallet found for user', { userId });
        return {
          wallet: '',
          usdcBalance: 0,
          openOrders: [],
          totalInvested: 0,
          totalCurrentValue: 0,
          totalUnrealizedPnl: 0,
          totalUnrealizedPnlPercent: 0,
          totalPotentialPayout: 0,
        };
      }

      const walletAddress = userWallet.polygon_wallet_address;
      const derivationVersion = (userWallet.derivation_version || 1) as 1 | 2;
      
      // Get signature: decrypt if encrypted, or use raw
      let signature = walletSignature;
      if (!signature && userWallet.wallet_signature) {
        if (userWallet.signature_encrypted) {
          signature = decryptSignature(userWallet.wallet_signature);
        } else {
          signature = userWallet.wallet_signature;
        }
      }
      
      if (!signature) {
        throw new Error('No wallet signature available - user must sign once to enable queries');
      }
      
      // Derive key using correct version (V1 doesn't need userId, V2 does)
      const userPrivateKey = derivePolygonPrivateKey(
        signature, 
        derivationVersion === 2 ? userId : undefined, 
        derivationVersion
      );

      const userWalletSigner = new Wallet(userPrivateKey);
      const host = config.polymarket.clobApiUrl;
      
      // Use cached credentials for performance
      let creds: any = null;
      try {
        creds = await this._getCachedClobCredentials(userWalletSigner);
      } catch (e) {
        logger.warn('Could not get CLOB credentials for positions', { error: (e as any).message });
      }

      const client = new ClobClient(
        host,
        137,
        userWalletSigner as any,
        creds,
        SignatureType.POLY_GNOSIS_SAFE,
        walletAddress,
      );

      // Fetch balance
      const balanceInfo = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' as any });
      const usdcBalance = parseFloat(balanceInfo.balance) / 1e6;

      const positions: UserPosition[] = [];
      let totalInvested = 0;
      let totalPotentialPayout = 0;

      // 1. Fetch OPEN orders (pending/unfilled)
      const openOrders = await client.getOpenOrders();
      
      for (const rawOrder of (openOrders || [])) {
        try {
          const order = rawOrder as any;
          let marketInfo = { question: 'Unknown Market', slug: '', conditionId: '' };
          let currentPrice = 0;
          
          try {
            const marketId = order.asset_id || order.tokenID || order.token_id;
            if (marketId) {
              const market = await client.getMarket(marketId);
              if (market && !market.error) {
                marketInfo = { 
                  question: market.question || 'Unknown Market', 
                  slug: market.market_slug || '',
                  conditionId: market.condition_id || marketId,
                };
                // Get current price from market data
                const tokens = market.tokens || [];
                const outcomeToken = tokens.find((t: any) => 
                  (order.side === 'BUY' && t.outcome === 'Yes') || 
                  (order.side === 'SELL' && t.outcome === 'No')
                );
                currentPrice = parseFloat(outcomeToken?.price || '0');
              }
            }
          } catch (e) { /* ignore */ }

          const size = parseFloat(order.original_size || order.size || '0');
          const price = parseFloat(order.price || '0');
          const cost = size * price;
          const currentValue = size * currentPrice;
          const unrealizedPnl = currentValue - cost;
          const unrealizedPnlPercent = cost > 0 ? (unrealizedPnl / cost) * 100 : 0;
          
          totalInvested += cost;
          totalPotentialPayout += size;

          positions.push({
            orderId: String(order.id || order.order_id || ''),
            market: { id: String(order.asset_id || ''), question: marketInfo.question, slug: marketInfo.slug, conditionId: marketInfo.conditionId },
            outcome: order.side === 'BUY' ? 'YES' : 'NO',
            side: order.side as 'BUY' | 'SELL',
            size,
            price,
            currentPrice,
            totalCost: cost,
            currentValue,
            unrealizedPnl,
            unrealizedPnlPercent,
            status: 'OPEN',
            createdAt: String(order.created_at || new Date().toISOString()),
            potentialPayout: size,
            potentialProfit: size - cost,
          });
        } catch (e) {
          logger.warn('Error processing open order', e);
        }
      }

      // 2. Fetch FILLED trades (executed positions)
      try {
        const trades = await client.getTrades();
        
        logger.info('Fetched trades from CLOB', { count: (trades || []).length });
        
        // Group trades by market to aggregate positions
        const tradesByMarket = new Map<string, { shares: number; cost: number; market: any; outcome: string; latestTrade: any; currentPrice: number }>();
        
        for (const rawTrade of (trades || [])) {
          const trade = rawTrade as any;
          
          // Extract trade info - works for both MAKER and TAKER sides
          const marketId = trade.market || trade.asset_id || trade.token_id;
          const size = parseFloat(trade.size || trade.matched_amount || '0');
          const price = parseFloat(trade.price || '0');
          const outcome = trade.outcome || (trade.side === 'BUY' ? 'Yes' : 'No');
          
          if (!marketId || size <= 0) continue;
          
          const cost = size * price;
          
          const existing = tradesByMarket.get(marketId);
          if (existing) {
            existing.shares += size;
            existing.cost += cost;
            existing.latestTrade = trade;
          } else {
            let marketInfo = { question: 'Unknown Market', slug: '', conditionId: '' };
            let currentPrice = 0;
            try {
              const market = await client.getMarket(marketId);
              if (market && !market.error) {
                marketInfo = { 
                  question: market.question || 'Unknown Market', 
                  slug: market.market_slug || '',
                  conditionId: market.condition_id || marketId,
                };
                // Get current price
                const tokens = market.tokens || [];
                const outcomeToken = tokens.find((t: any) => 
                  t.outcome?.toLowerCase() === outcome?.toLowerCase()
                );
                currentPrice = parseFloat(outcomeToken?.price || '0');
              }
            } catch (e) { /* ignore */ }
            
            tradesByMarket.set(marketId, {
              shares: size,
              cost,
              market: { id: marketId, ...marketInfo },
              outcome,
              latestTrade: trade,
              currentPrice,
            });
          }
        }
        
        // Add aggregated positions
        for (const [, pos] of tradesByMarket) {
          totalInvested += pos.cost;
          totalPotentialPayout += pos.shares;
          
          const avgPrice = pos.cost / pos.shares;
          const currentValue = pos.shares * pos.currentPrice;
          const unrealizedPnl = currentValue - pos.cost;
          const unrealizedPnlPercent = pos.cost > 0 ? (unrealizedPnl / pos.cost) * 100 : 0;
          
          positions.push({
            orderId: pos.latestTrade.id || '',
            market: pos.market,
            outcome: pos.outcome.toUpperCase() as 'YES' | 'NO',
            side: 'BUY',
            size: pos.shares,
            price: avgPrice,
            currentPrice: pos.currentPrice,
            totalCost: pos.cost,
            currentValue,
            unrealizedPnl,
            unrealizedPnlPercent,
            status: 'FILLED',
            createdAt: new Date(parseInt(pos.latestTrade.match_time || '0') * 1000).toISOString(),
            potentialPayout: pos.shares,
            potentialProfit: pos.shares - pos.cost,
          });
        }
      } catch (e) {
        logger.warn('Error fetching trades', e);
      }

      // Also get recent intents from our database for reference
      const { data: recentIntents } = await supabase
        .from('trade_intents')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['ORDER_PLACED', 'FILLED', 'PARTIALLY_FILLED'])
        .order('created_at', { ascending: false })
        .limit(20);

      // Calculate totals
      const totalCurrentValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
      const totalUnrealizedPnl = totalCurrentValue - totalInvested;
      const totalUnrealizedPnlPercent = totalInvested > 0 ? (totalUnrealizedPnl / totalInvested) * 100 : 0;

      logger.info('User positions fetched', {
        userId,
        wallet: walletAddress,
        usdcBalance,
        openOrdersCount: positions.length,
        totalInvested,
        totalCurrentValue,
        totalUnrealizedPnl,
        recentIntentsCount: recentIntents?.length || 0,
      });

      return {
        wallet: walletAddress,
        usdcBalance,
        openOrders: positions,
        totalInvested,
        totalCurrentValue,
        totalUnrealizedPnl,
        totalUnrealizedPnlPercent,
        totalPotentialPayout,
      };

    } catch (error: any) {
      logger.error('Error fetching user positions', { userId, error: error.message });
      throw new Error(`Failed to fetch positions: ${error.message}`);
    }
  }

  /**
   * Cancel an open order
   */
  async cancelOrder(
    orderId: string, 
    walletSignature: string, 
    megaethAddress: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('Cancelling order', { orderId, megaethAddress });

      // Get user's wallet
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('megaeth_address', megaethAddress.toLowerCase())
        .single();

      if (!user) {
        throw new Error('User not found');
      }

      const { data: wallet } = await supabase
        .from('polymarket_wallets')
        .select('polygon_wallet_address, derivation_version')
        .eq('user_id', user.id)
        .single();

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Derive key from signature using correct version
      const derivationVersion = (wallet.derivation_version || 1) as 1 | 2;
      const userPrivateKey = derivePolygonPrivateKey(
        walletSignature,
        derivationVersion === 2 ? user.id : undefined,
        derivationVersion
      );
      const userWalletSigner = new Wallet(userPrivateKey);
      const host = config.polymarket.clobApiUrl;
      
      // Use cached credentials
      const creds = await this._getCachedClobCredentials(userWalletSigner);

      const orderClient = new ClobClient(
        host,
        137,
        userWalletSigner as any,
        creds,
        SignatureType.POLY_GNOSIS_SAFE,
        wallet.polygon_wallet_address,
      );

      // Cancel the order
      const response = await orderClient.cancelOrder({ orderID: orderId });
      
      logger.info('Order cancellation response', { orderId, response });

      if (response.canceled?.includes(orderId) || response.success) {
        return { success: true, message: 'Order cancelled successfully' };
      } else if (response.not_canceled?.includes(orderId)) {
        return { success: false, message: 'Order could not be cancelled (may already be filled)' };
      }

      return { success: true, message: 'Cancellation submitted' };
    } catch (error: any) {
      logger.error('Error cancelling order', { orderId, error: error.message });
      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }

  /**
   * Get open orders for a user by their MegaETH address
   */
  async getOpenOrders(megaethAddress: string): Promise<any[]> {
    try {
      logger.info('Fetching open orders', { megaethAddress });

      // Get user
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('megaeth_address', megaethAddress.toLowerCase())
        .single();

      if (!user) {
        return [];
      }

      // Get wallet with signature and derivation info
      const { data: wallet } = await supabase
        .from('polymarket_wallets')
        .select('polygon_wallet_address, wallet_signature, derivation_version, signature_encrypted')
        .eq('user_id', user.id)
        .single();

      if (!wallet || !wallet.wallet_signature) {
        return [];
      }

      // Get signature: decrypt if needed
      const derivationVersion = (wallet.derivation_version || 1) as 1 | 2;
      let signature = wallet.wallet_signature;
      if (wallet.signature_encrypted) {
        signature = decryptSignature(wallet.wallet_signature);
      }

      // Derive key from stored signature using correct version
      const userPrivateKey = derivePolygonPrivateKey(
        signature,
        derivationVersion === 2 ? user.id : undefined,
        derivationVersion
      );
      const userWalletSigner = new Wallet(userPrivateKey);
      const host = config.polymarket.clobApiUrl;
      
      // Use cached credentials
      let creds: any = null;
      try {
        creds = await this._getCachedClobCredentials(userWalletSigner);
      } catch {
        return [];
      }

      const orderClient = new ClobClient(
        host,
        137,
        userWalletSigner as any,
        creds,
        SignatureType.POLY_GNOSIS_SAFE,
        wallet.polygon_wallet_address,
      );

      // Fetch open orders
      const openOrders = await orderClient.getOpenOrders();
      
      // Transform to a cleaner format
      const orders = (openOrders || []).map((order: any) => ({
        orderId: order.id || order.order_id,
        tokenId: order.asset_id || order.token_id,
        side: order.side,
        size: order.original_size || order.size,
        sizeRemaining: order.size_matched ? 
          (parseFloat(order.original_size || order.size) - parseFloat(order.size_matched)).toString() : 
          order.size,
        price: order.price,
        status: order.status || 'OPEN',
        createdAt: order.created_at,
        orderType: parseFloat(order.price) === parseFloat(order.original_price || order.price) ? 'LIMIT' : 'MARKET',
      }));

      logger.info('Open orders fetched', { count: orders.length });
      return orders;
    } catch (error: any) {
      logger.error('Error fetching open orders', { error: error.message });
      throw new Error(`Failed to fetch open orders: ${error.message}`);
    }
  }
}

