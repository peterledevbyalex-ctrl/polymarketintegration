import { CreateIntentRequest } from '../types';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface RiskLimits {
  minAmountWei: string;
  maxAmountWei: string;
  maxSlippageBps: number;
  allowedRegions?: string[];
  requiresKyc?: boolean;
}

export class RiskPolicyService {
  private readonly limits: RiskLimits;

  constructor() {
    // These should come from config or database
    this.limits = {
      minAmountWei: process.env.MIN_TRADE_AMOUNT_WEI || '100000', // 0.000001 ETH
      maxAmountWei: process.env.MAX_TRADE_AMOUNT_WEI || '100000000000000000000', // 100 ETH
      maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || '500', 10), // 5%
      allowedRegions: process.env.ALLOWED_REGIONS?.split(',') || undefined,
      requiresKyc: process.env.REQUIRES_KYC === 'true',
    };
  }

  validateTradeRequest(request: CreateIntentRequest, userAddress: string): void {
    // Validate amount limits
    if (!request.inputAmountWei) {
      throw new AppError(400, 'inputAmountWei is required', 'MISSING_AMOUNT');
    }
    const amount = BigInt(request.inputAmountWei);
    const minAmount = BigInt(this.limits.minAmountWei);
    const maxAmount = BigInt(this.limits.maxAmountWei);

    if (amount < minAmount) {
      throw new AppError(400, `Amount too small. Minimum: ${this.limits.minAmountWei} wei`, 'AMOUNT_TOO_SMALL');
    }

    if (amount > maxAmount) {
      throw new AppError(400, `Amount too large. Maximum: ${this.limits.maxAmountWei} wei`, 'AMOUNT_TOO_LARGE');
    }

    // Validate slippage
    const slippageBps = request.maxSlippageBps || 50;
    if (slippageBps > this.limits.maxSlippageBps) {
      throw new AppError(
        400,
        `Slippage too high. Maximum: ${this.limits.maxSlippageBps} bps`,
        'SLIPPAGE_TOO_HIGH'
      );
    }

    // Validate market (basic check - should be enhanced with actual market validation)
    if (!request.marketId || request.marketId.length < 1) {
      throw new AppError(400, 'Invalid market ID', 'INVALID_MARKET');
    }

    // Validate outcome
    if (request.outcome !== 'YES' && request.outcome !== 'NO') {
      throw new AppError(400, 'Outcome must be YES or NO', 'INVALID_OUTCOME');
    }


    logger.info('Trade request validated', {
      userAddress,
      amount: request.inputAmountWei,
      marketId: request.marketId,
    });
  }

  getLimits(): RiskLimits {
    return { ...this.limits };
  }
}
