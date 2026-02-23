import { supabase } from '../db/supabase';
import { WithdrawRequest, WithdrawResponse, ReferralActionType } from '../types';
import { UserService } from './userService';
import { WalletService } from './walletService';
import { RelayService } from './relayService';
import { ReferralService } from './referralService';
import { PolymarketRelayerClient } from './polymarketRelayerClient';
import { config } from '../config';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { validateAndChecksumAddress } from '../utils/validation';
import axios from 'axios';

const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Relay may not support all routes - check if MegaETH destination is available
const RELAY_SUPPORTED_DEST_CHAINS = [1, 137, 42161, 10, 8453]; // ETH, Polygon, Arb, OP, Base

export class WithdrawalService {
  private userService: UserService;
  private walletService: WalletService;
  private relayService: RelayService;
  private referralService: ReferralService;

  constructor() {
    this.userService = new UserService();
    this.walletService = new WalletService();
    this.relayService = new RelayService();
    this.referralService = new ReferralService();
  }

  /**
   * Withdraw USDC from Polymarket Safe wallet back to MegaETH
   */
  async initiateWithdrawal(request: WithdrawRequest): Promise<WithdrawResponse> {
    const megaethAddress = validateAndChecksumAddress(request.megaethAddress);
    const amountUsdc = parseFloat(request.amountUsdc);
    
    if (isNaN(amountUsdc) || amountUsdc <= 0) {
      throw new Error('Invalid withdrawal amount');
    }

    // Get user and wallet
    const user = await this.userService.getOrCreateUser(megaethAddress);
    const walletData = await this.walletService.getOrCreateWallet(
      user.id,
      megaethAddress,
      request.walletSignature
    );

    const safeAddress = walletData.polygon_wallet_address;
    const privateKey = walletData.privateKey;

    logger.info('Initiating withdrawal', {
      megaethAddress,
      safeAddress,
      amountUsdc,
    });

    // Check Safe balance first
    const balance = await this.getSafeUsdcBalance(safeAddress);
    const amountRaw = BigInt(Math.floor(amountUsdc * 1_000_000));
    
    if (balance < amountRaw) {
      throw new Error(`Insufficient USDC balance. Available: ${Number(balance) / 1_000_000} USDC`);
    }

    // Create relayer client with user's derived key
    const relayerClient = new PolymarketRelayerClient(privateKey);
    let result: { transactionID: string; transactionHash: string; state: string } | null = null;
    let quoteId = '';
    let destAmountExpected = request.amountUsdc;
    let withdrawalType: 'bridge' | 'direct' = 'direct';

    // Check if Relay supports MegaETH as destination
    const destChain = config.chains.megaeth;
    const useRelay = RELAY_SUPPORTED_DEST_CHAINS.includes(destChain);

    if (useRelay) {
      // Try Relay bridge
      try {
        const quote = await this.relayService.getQuote({
          originChainId: config.chains.polygon,
          destChainId: destChain,
          originCurrency: USDC_E_ADDRESS,
          destCurrency: request.destCurrency || 'native',
          sender: safeAddress,
          recipient: megaethAddress,
          amount: amountRaw.toString(),
        });

        quoteId = quote.quoteId;
        destAmountExpected = quote.destAmountExpected;
        withdrawalType = 'bridge';

        logger.info('Got Relay quote for withdrawal', { quoteId, destAmountExpected });

        // Execute bridge: approve + deposit
        const transactions = [
          { to: USDC_E_ADDRESS, data: this.encodeApprove(quote.originTx.to, amountRaw), value: '0' },
          { to: quote.originTx.to, data: quote.originTx.data, value: quote.originTx.value || '0' },
        ];

        result = await relayerClient.execute(transactions, `Bridge ${amountUsdc} USDC to MegaETH`);
      } catch (error: any) {
        logger.warn('Relay bridge not available, falling back to direct transfer', {
          error: error.message,
        });
        withdrawalType = 'direct';
      }
    }

    // Fallback: Direct USDC transfer to user's Polygon address
    if (withdrawalType === 'direct') {
      logger.info('Using direct USDC transfer (user must bridge manually)', {
        recipient: megaethAddress,
        amountUsdc,
      });

      // Transfer USDC directly to user's address on Polygon
      // User will need to bridge from Polygon → MegaETH themselves
      result = await relayerClient.withdrawUSDC(megaethAddress, amountUsdc);
    }

    if (!result) {
      throw new Error('Failed to execute withdrawal transaction');
    }

    // Store withdrawal record
    const withdrawalId = uuidv4();
    await supabase.from('withdrawals').insert({
      withdrawal_id: withdrawalId,
      user_id: user.id,
      safe_address: safeAddress,
      dest_address: megaethAddress,
      amount_usdc: request.amountUsdc,
      relay_quote_id: quoteId || null,
      origin_tx_hash: result.transactionHash,
      status: withdrawalType === 'bridge' ? 'executing' : 'completed',
      withdrawal_type: withdrawalType,
    });

    logger.info('Withdrawal initiated', {
      withdrawalId,
      withdrawalType,
      originTxHash: result.transactionHash,
    });

    // Track referral action for withdrawal (fire and forget)
    this.referralService.trackAction(
      user.id,
      ReferralActionType.WITHDRAWAL,
      { amount_usdc: amountUsdc, withdrawal_id: withdrawalId }
    ).catch(() => {});

    return {
      withdrawalId,
      safeAddress,
      destAddress: megaethAddress,
      amountUsdc: request.amountUsdc,
      relay: {
        quoteId,
        destAmountExpected,
        originTxHash: result.transactionHash,
      },
      status: withdrawalType === 'bridge' ? 'executing' : 'completed',
      // Note: If 'completed' via direct transfer, funds are on Polygon (user must bridge to MegaETH)
    } as any;
  }

  /**
   * Get USDC.e balance of a Safe wallet
   */
  async getSafeUsdcBalance(safeAddress: string): Promise<bigint> {
    try {
      // ERC20 balanceOf call
      const data = '0x70a08231' + safeAddress.slice(2).padStart(64, '0');
      
      const response = await axios.post(
        process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
        {
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC_E_ADDRESS, data }, 'latest'],
          id: 1,
        }
      );

      const balanceHex = response.data.result;
      return BigInt(balanceHex || '0');
    } catch (error) {
      logger.error('Failed to get Safe USDC balance', { safeAddress, error });
      return BigInt(0);
    }
  }

  /**
   * Encode ERC20 approve call
   */
  private encodeApprove(spender: string, amount: bigint): string {
    return (
      '0x095ea7b3' + // approve(address,uint256)
      spender.slice(2).padStart(64, '0') +
      amount.toString(16).padStart(64, '0')
    );
  }

  /**
   * Get withdrawal status
   */
  async getWithdrawalStatus(withdrawalId: string): Promise<WithdrawResponse | null> {
    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('withdrawal_id', withdrawalId)
      .single();

    if (error || !data) {
      return null;
    }

    // Check Relay status if still executing
    if (data.status === 'executing' && data.relay_quote_id) {
      try {
        const relayStatus = await this.relayService.getExecutionStatus(data.relay_quote_id);
        
        if (relayStatus.status === 'success') {
          await supabase
            .from('withdrawals')
            .update({ status: 'completed', dest_tx_hash: relayStatus.destTxHash })
            .eq('withdrawal_id', withdrawalId);
          data.status = 'completed';
        } else if (relayStatus.status === 'failed') {
          await supabase
            .from('withdrawals')
            .update({ status: 'failed' })
            .eq('withdrawal_id', withdrawalId);
          data.status = 'failed';
        }
      } catch {
        // Keep current status
      }
    }

    return {
      withdrawalId: data.withdrawal_id,
      safeAddress: data.safe_address,
      destAddress: data.dest_address,
      amountUsdc: data.amount_usdc,
      relay: {
        quoteId: data.relay_quote_id,
        destAmountExpected: data.dest_amount_expected || '0',
        originTxHash: data.origin_tx_hash,
      },
      status: data.status,
    };
  }
}
