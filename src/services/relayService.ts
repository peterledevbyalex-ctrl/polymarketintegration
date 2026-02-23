import axios from 'axios';
import { config } from '../config';
import logger from '../utils/logger';
import { RelayQuote } from '../types';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import { retry } from '../utils/retry';
import { trackApiCall, trackError } from '../utils/metrics';
import { createProfiler } from '../utils/profiler';

export class RelayService {
  private getQuoteBreaker: ReturnType<typeof createCircuitBreaker>;
  private getExecutionStatusBreaker: ReturnType<typeof createCircuitBreaker>;

  constructor() {
    // Create circuit breakers for external API calls
    // Reduced timeouts for snappier UX - fail fast
    this.getQuoteBreaker = createCircuitBreaker(this._getQuote.bind(this), {
      timeout: 15000, // 15s - fail fast, don't hang
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });

    this.getExecutionStatusBreaker = createCircuitBreaker(this._getExecutionStatus.bind(this), {
      timeout: 5000, // 5s for status checks - very fast
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });
  }

  async getQuote(params: {
    originChainId: number;
    destChainId: number;
    originCurrency: string;
    destCurrency: string;
    sender: string;      // User's wallet on origin chain (MegaETH)
    recipient: string;   // Destination wallet (Polymarket on Polygon)
    amount?: string;
    destAmount?: string;
  }): Promise<RelayQuote> {
    const startTime = Date.now();
    try {
      const result = await retry(
        () => this.getQuoteBreaker.fire(params),
        {
          maxAttempts: 3,
          initialDelay: 1000,
          retryableErrors: ['timeout', 'network', 'econnreset'],
        }
      );

      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('relay', 'getQuote', 'success', latency);
      return result as RelayQuote;
    } catch (error) {
      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('relay', 'getQuote', 'error', latency);
      trackError('relay_quote_error', 'relay');
      throw error;
    }
  }

  private async _getQuote(params: {
    originChainId: number;
    destChainId: number;
    originCurrency: string;
    destCurrency: string;
    sender: string;      // User's wallet on origin chain (MegaETH)
    recipient: string;   // Destination wallet (Polymarket on Polygon)
    amount?: string;
    destAmount?: string;
  }): Promise<RelayQuote> {
    const profiler = createProfiler('relay_getQuote');
    
    try {
      // Relay API v2 quote endpoint
      const requestUrl = `${config.relay.apiUrl}/quote/v2`;
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const normalizeAddress = (currency: string) => 
        currency === 'native' ? ZERO_ADDRESS : currency;

      const requestBody = {
        user: params.sender,
        recipient: params.recipient,
        originChainId: params.originChainId,
        destinationChainId: params.destChainId,
        originCurrency: normalizeAddress(params.originCurrency),
        destinationCurrency: normalizeAddress(params.destCurrency),
        amount: params.amount,
        tradeType: 'EXACT_INPUT',
      };

      logger.info('Relay quote request', {
        from: `${params.originChainId}:${params.originCurrency}`,
        to: `${params.destChainId}:${params.destCurrency}`,
        amount: params.amount,
        sender: params.sender,
        recipient: params.recipient,
      });

      profiler.startStep('api_call');
      const response = await axios.post(requestUrl, requestBody, {
        headers: { 
          'Content-Type': 'application/json',
          ...(config.relay.referrer && { 'X-Referrer': config.relay.referrer }),
          ...(config.relay.apiKey && { 'X-Api-Key': config.relay.apiKey }),
        },
        timeout: 60000,
      });
      profiler.endStep();

      profiler.startStep('parse_response');
      const steps = response.data.steps || [];
      const txStep = steps.find((s: any) => s.kind === 'transaction');
      const txItem = txStep?.items?.[0];

      if (!txItem) {
        throw new Error('No transaction step found in quote response');
      }

      const requestId = txStep.requestId || response.data.requestId;
      const destAmount = response.data.details?.currencyOut?.amount || '0';
      profiler.endStep();

      logger.info('Relay quote received', {
        quoteId: requestId,
        destAmount,
        stepsCount: steps.length,
        originTxTo: txItem.data?.to,
      });

      profiler.finish();

      return {
        quoteId: requestId,
        originTx: {
          chainId: txItem.data?.chainId || params.originChainId,
          to: txItem.data?.to,
          data: txItem.data?.data,
          value: txItem.data?.value || '0x0',
        },
        destAmountExpected: destAmount,
        destAmountMin: response.data.details?.currencyOut?.minimumAmount || destAmount,
      };
    } catch (error: any) {
      profiler.finish();
      logger.error('Relay quote failed', {
        error: error.message,
        response: error.response?.data,
        originChain: params.originChainId,
        destChain: params.destChainId,
      });
      throw new Error(`Failed to get Relay quote: ${error.response?.data?.message || error.message}`);
    }
  }

  async getExecutionStatus(quoteId: string): Promise<{
    status: string;
    originTxHash?: string;
    destTxHash?: string;
  }> {
    const startTime = Date.now();
    try {
      const result = await retry(
        () => this.getExecutionStatusBreaker.fire(quoteId),
        {
          maxAttempts: 3,
          initialDelay: 500,
          retryableErrors: ['timeout', 'network'],
        }
      );

      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('relay', 'getExecutionStatus', 'success', latency);
      return result as { status: string; originTxHash?: string; destTxHash?: string };
    } catch (error) {
      const latency = (Date.now() - startTime) / 1000;
      trackApiCall('relay', 'getExecutionStatus', 'error', latency);
      trackError('relay_status_error', 'relay');
      throw error;
    }
  }

  private async _getExecutionStatus(requestId: string): Promise<{
    status: string;
    originTxHash?: string;
    destTxHash?: string;
  }> {
    try {
      const startTime = Date.now();
      
      const response = await axios.get(
        `${config.relay.apiUrl}/intents/status/v3`,
        {
          params: { requestId },
          headers: { 
            'Content-Type': 'application/json',
            ...(config.relay.referrer && { 'X-Referrer': config.relay.referrer }),
            ...(config.relay.apiKey && { 'X-Api-Key': config.relay.apiKey }),
          },
          timeout: 5000,
        }
      );

      const apiLatencyMs = Date.now() - startTime;

      // Status lifecycle: waiting -> pending -> submitted -> success (or failure/refund)
      const relayStatus = response.data.status || 'pending';
      let status = 'pending';
      
      if (relayStatus === 'success') {
        status = 'executed';
      } else if (relayStatus === 'failure' || relayStatus === 'refund') {
        status = 'failed';
      } else if (relayStatus === 'submitted') {
        status = 'executing';
      } else if (relayStatus === 'waiting' || relayStatus === 'pending') {
        status = 'pending';
      }

      const destTxHash = response.data.outTxHashes?.[0] 
        || response.data.destinationTxHash 
        || response.data.txHashes?.destination?.[0]
        || response.data.fills?.[0]?.txHash
        || (status === 'executed' ? 'unknown' : undefined);

      const originTxHash = response.data.inTxHashes?.[0] || response.data.originTxHash;

      // Log every status check for full visibility
      logger.info('Relay status polled', {
        requestId,
        relayStatus,
        mappedStatus: status,
        originTxHash: originTxHash?.slice(0, 18) + '...',
        destTxHash: destTxHash?.slice(0, 18) + '...',
        apiLatencyMs,
      });

      return { status, originTxHash, destTxHash };
    } catch (error: any) {
      logger.error('Relay status check failed', {
        requestId,
        error: error.message,
        responseData: error.response?.data,
      });
      throw new Error(`Failed to get execution status: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Poll execution status with exponential backoff (fallback if webhooks fail)
   * Per spec 5.3: polling every 0.5-2s with backoff
   */
  async pollExecutionStatus(
    quoteId: string,
    onStatusUpdate: (status: { status: string; originTxHash?: string; destTxHash?: string }) => void,
    maxAttempts: number = 60
  ): Promise<void> {
    let attempts = 0;
    let delay = 500; // Start with 500ms

    while (attempts < maxAttempts) {
      try {
        const status = await this.getExecutionStatus(quoteId);
        onStatusUpdate(status);

        if (status.status === 'executed' || status.status === 'failed') {
          return; // Terminal state reached
        }

        // Exponential backoff: 500ms, 1s, 2s, 2s, 2s...
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 2000); // Cap at 2s
        attempts++;
      } catch (error) {
        logger.error('Error polling execution status', error);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempts++;
      }
    }

    logger.warn(`Polling timeout for quote ${quoteId} after ${maxAttempts} attempts`);
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      // Webhook signature verification for Relay
      // NOTE: Signature method needs verification with actual Relay.link webhook documentation
      // Common patterns: HMAC-SHA256, HMAC-SHA512, or custom signing
      const crypto = require('crypto');
      
      // Standard HMAC-SHA256 verification (most common)
      const expectedSignature = crypto
        .createHmac('sha256', config.relay.webhookSecret)
        .update(payload)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      if (logger && typeof logger.error === 'function') {
        logger.error('Error verifying webhook signature', error);
      }
      return false;
    }
  }
}

