import { supabase } from '../db/supabase';
import {
  TradeIntent,
  IntentState,
  CreateIntentRequest,
  ReferralActionType,
} from '../types';
import { UserService } from './userService';
import { WalletService } from './walletService';
import { RelayService } from './relayService';
import { RiskPolicyService } from './riskPolicyService';
import { ReferralService } from './referralService';
import { StateMachine } from './stateMachine';
import { config } from '../config';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { trackIntentCreated, trackStateTransition, trackIntentDuration } from '../utils/metrics';
import { websocketService } from './websocketService';
import { validateAndChecksumAddress } from '../utils/validation';
import { createProfiler } from '../utils/profiler';
import { startRelayTiming, markQuoteReceived, markOriginTxSubmitted } from '../utils/relayTiming';

export class IntentService {
  private userService: UserService;
  private walletService: WalletService;
  private relayService: RelayService;
  private riskPolicyService: RiskPolicyService;
  private referralService: ReferralService;

  constructor() {
    this.userService = new UserService();
    this.walletService = new WalletService();
    this.relayService = new RelayService();
    this.riskPolicyService = new RiskPolicyService();
    this.referralService = new ReferralService();
  }

  async createIntent(request: CreateIntentRequest): Promise<TradeIntent> {
    const profiler = createProfiler('createIntent');
    const isSell = request.action === 'SELL';

    // Checksum the address for consistency (fast, sync-ish)
    const megaethAddress = validateAndChecksumAddress(request.megaethAddress);
    
    // Validate trade request (risk/policy checks) - skip for SELL (no amount in wei)
    if (!isSell) {
      this.riskPolicyService.validateTradeRequest(request, megaethAddress);
    }

    // PARALLEL: Get user + check duplicate at the same time
    const [user, existingIntent] = await profiler.timeStep('parallel_user_and_duplicate', async () => {
      return Promise.all([
        this.userService.getOrCreateUser(megaethAddress),
        request.clientRequestId 
          ? this.getIntentByClientRequestId(request.clientRequestId) 
          : Promise.resolve(null),
      ]);
    });

    // Return early if duplicate
    if (existingIntent) {
      logger.info(`Duplicate client request ID: ${request.clientRequestId}`);
      profiler.finish();
      return existingIntent;
    }

    // Create wallet with signature-derived key
    const walletWithKey = await profiler.timeStep('get_or_create_wallet', async () => {
      return this.walletService.getOrCreateWallet(
        user.id, 
        megaethAddress, 
        request.walletSignature
      );
    });
    const wallet = walletWithKey;

    // Create intent ID early so we can track timing
    const intentId = uuidv4();
    profiler.setIntentId(intentId);

    // SELL orders: skip Relay, go straight to order placement
    if (isSell) {
      logger.info('Creating SELL intent - no bridging required', { intentId, outcome: request.outcome });
      
      const { data: intent, error } = await profiler.timeStep('db_insert_intent', async () => {
        return supabase
          .from('trade_intents')
          .insert({
            intent_id: intentId,
            user_id: user.id,
            market_id: request.marketId,
            outcome: request.outcome,
            action: 'SELL',
            input_chain: 'polygon', // SELL is from Polygon Safe
            input_currency: 'SHARES',
            input_amount: String(request.amountShares), // Store shares to sell
            dest_chain: 'polygon',
            dest_currency: 'USDC.e',
            dest_amount_expected: '0', // Will be filled by market
            dest_amount_min: '0',
            max_slippage_bps: request.maxSlippageBps || 50,
            state: IntentState.ORDER_SUBMITTING, // Ready to place order
            client_request_id: request.clientRequestId,
            order_type: request.orderType || 'MARKET',
            limit_price: request.limitPrice || null,
          })
          .select()
          .single();
      });

      if (error || !intent) {
        logger.error('Error creating sell intent', error);
        profiler.finish();
        throw new Error('Failed to create sell intent');
      }

      trackIntentCreated(request.outcome);
      
      // Track referral action (fire and forget)
      this.trackReferralAction(user.id, intent.intent_id, '0').catch(() => {});
      
      profiler.finish();
      return intent as TradeIntent;
    }
    
    // BUY orders: get Relay quote
    startRelayTiming(intentId);

    const quote = await profiler.timeStep('relay_get_quote', async () => {
      return this.relayService.getQuote({
        originChainId: config.chains.megaeth,
        destChainId: config.chains.polygon,
        originCurrency: request.inputCurrency === 'native' ? 'native' : (request.inputCurrency || 'native'),
        destCurrency: config.tokens.polygonUsdcE,
        sender: megaethAddress,
        recipient: wallet.polygon_wallet_address,
        amount: request.inputAmountWei,
      });
    });

    markQuoteReceived(intentId);

    const { data: intent, error } = await profiler.timeStep('db_insert_intent', async () => {
      return supabase
        .from('trade_intents')
        .insert({
          intent_id: intentId,
          user_id: user.id,
          market_id: request.marketId,
          outcome: request.outcome,
          action: 'BUY',
          input_chain: 'megaeth',
          input_currency: request.inputCurrency,
          input_amount: request.inputAmountWei,
          dest_chain: 'polygon',
          dest_currency: 'USDC.e',
          dest_amount_expected: quote.destAmountExpected,
          dest_amount_min: quote.destAmountMin,
          max_slippage_bps: request.maxSlippageBps || 50,
          relay_quote_id: quote.quoteId,
          relay_origin_tx_data: {
            chainId: quote.originTx.chainId,
            to: quote.originTx.to,
            data: quote.originTx.data,
            value: quote.originTx.value,
          },
          state: IntentState.RELAY_QUOTED,
          client_request_id: request.clientRequestId,
          order_type: request.orderType || 'MARKET',
          limit_price: request.limitPrice || null,
        })
        .select()
        .single();
    });

    if (error || !intent) {
      logger.error('Error creating intent', error);
      profiler.finish();
      throw new Error('Failed to create intent');
    }

    await profiler.timeStep('log_event', async () => {
      return this.logEvent(intentId, 'RELAY_QUOTED', {
        quoteId: quote.quoteId,
        destAmountExpected: quote.destAmountExpected,
      });
    });

    trackIntentCreated(request.outcome);
    trackStateTransition(IntentState.CREATED, IntentState.RELAY_QUOTED);

    // Track referral action (fire and forget)
    this.trackReferralAction(user.id, intent.intent_id, quote.destAmountExpected).catch(() => {});

    profiler.finish();
    return intent as TradeIntent;
  }

  /**
   * Track referral action for trades
   */
  private async trackReferralAction(userId: string, intentId: string, volumeUsdc: string): Promise<void> {
    // Check if this is user's first trade
    const { count } = await supabase
      .from('trade_intents')
      .select('intent_id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const isFirstTrade = (count || 0) <= 1;
    const actionType = isFirstTrade ? ReferralActionType.FIRST_TRADE : ReferralActionType.TRADE;

    // Convert USDC amount from wei to decimal
    const volumeDecimal = parseFloat(volumeUsdc) / 1_000_000;

    await this.referralService.trackAction(
      userId,
      actionType,
      { volume_usdc: volumeDecimal, intent_id: intentId },
      intentId
    );
  }

  async getIntent(intentId: string): Promise<TradeIntent | null> {
    const { data, error } = await supabase
      .from('trade_intents')
      .select('*')
      .eq('intent_id', intentId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Error getting intent', error);
      throw new Error('Failed to get intent');
    }

    return data as TradeIntent | null;
  }

  async getIntentByClientRequestId(clientRequestId: string): Promise<TradeIntent | null> {
    const { data, error } = await supabase
      .from('trade_intents')
      .select('*')
      .eq('client_request_id', clientRequestId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return null;
    }

    return data as TradeIntent | null;
  }

  async updateIntentState(
    intentId: string,
    newState: IntentState,
    updates?: Partial<TradeIntent>
  ): Promise<TradeIntent> {
    const intent = await this.getIntent(intentId);
    if (!intent) {
      throw new Error('Intent not found');
    }

    const finalState = StateMachine.transition(intent.state, newState, intentId);

    // Track state transition
    trackStateTransition(intent.state, finalState);

    // Track duration for terminal states
    if (StateMachine.isTerminal(finalState)) {
      const duration = (Date.now() - new Date(intent.created_at).getTime()) / 1000;
      trackIntentDuration(finalState, duration);
    }

    const updateData: any = {
      state: finalState,
      ...updates,
    };

    const { data, error } = await supabase
      .from('trade_intents')
      .update(updateData)
      .eq('intent_id', intentId)
      .select()
      .single();

    if (error || !data) {
      logger.error('Error updating intent', error);
      throw new Error('Failed to update intent');
    }

    await this.logEvent(intentId, finalState, updates || {});

    // Emit WebSocket update if enabled
    if (config.features.websocket) {
      websocketService.emitIntentUpdate(data as TradeIntent);
      websocketService.emitStateTransition(intentId, intent.state, finalState, updates);
    }

    return data as TradeIntent;
  }

  async updateOriginTxHash(intentId: string, txHash: string, walletSignature?: string): Promise<TradeIntent> {
    // Mark origin tx submitted for Relay timing
    markOriginTxSubmitted(intentId);
    
    const updates: Partial<TradeIntent> = { 
      relay_origin_tx_hash: txHash,
    };
    
    // Store wallet signature for later key derivation
    if (walletSignature) {
      updates.wallet_signature = walletSignature;
    }
    
    return this.updateIntentState(
      intentId,
      IntentState.ORIGIN_TX_SUBMITTED,
      updates
    );
  }

  async handleRelayExecution(intentId: string, destTxHash: string): Promise<TradeIntent> {
    return this.updateIntentState(
      intentId,
      IntentState.DEST_FUNDED,
      {
        polygon_funding_tx_hash: destTxHash,
        relay_status: 'executed',
      }
    );
  }

  async logEvent(
    intentId: string,
    type: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    await supabase.from('intent_events').insert({
      intent_id: intentId,
      type,
      payload_json: payload || {},
    });
  }
}

