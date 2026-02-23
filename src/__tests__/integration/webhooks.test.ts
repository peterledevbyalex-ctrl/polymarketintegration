import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

// Mock dependencies before imports
jest.mock('../../db/supabase', () => {
  const mockFrom = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      or: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          data: [{
            intent_id: 'intent-123',
            user_id: 'user-123',
            state: 'RELAY_EXECUTING',
          }],
          error: null,
        }),
      }),
    }),
  });
  return { supabase: { from: mockFrom } };
});

jest.mock('../../services/intentService');
jest.mock('../../services/polymarketService');
jest.mock('../../services/relayService');
jest.mock('../../services/websocketService', () => ({
  websocketService: {
    emitIntentUpdate: jest.fn(),
    emitError: jest.fn(),
  },
}));
jest.mock('../../config', () => ({
  config: {
    features: { websocket: true },
    relay: { webhookSecret: 'test-secret' },
  },
}));

import webhooksRouter from '../../routes/webhooks';
import { IntentService } from '../../services/intentService';
import { RelayService } from '../../services/relayService';

describe('Webhooks API', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/webhooks', webhooksRouter);
    jest.clearAllMocks();
  });

  describe('POST /webhooks/relay', () => {
    const generateSignature = (payload: object, secret: string) => {
      const body = JSON.stringify(payload);
      return crypto.createHmac('sha256', secret).update(body).digest('hex');
    };

    it('should handle executed relay status', async () => {
      const payload = {
        quoteId: 'quote-123',
        requestId: 'req-123',
        status: 'executed',
        destTxHash: '0xdest123',
      };

      (RelayService.prototype.verifyWebhookSignature as jest.Mock).mockReturnValue(true);
      (IntentService.prototype.handleRelayExecution as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        state: 'DEST_FUNDED',
      });
      (IntentService.prototype.getIntent as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        state: 'DEST_FUNDED',
      });

      const response = await request(app)
        .post('/webhooks/relay')
        .set('x-relay-signature', generateSignature(payload, 'test-secret'))
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should handle failed relay status', async () => {
      const payload = {
        quoteId: 'quote-123',
        status: 'failed',
        error: 'Bridge failed',
      };

      (RelayService.prototype.verifyWebhookSignature as jest.Mock).mockReturnValue(true);
      (IntentService.prototype.updateIntentState as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        state: 'FAILED',
      });

      const response = await request(app)
        .post('/webhooks/relay')
        .set('x-relay-signature', 'valid-sig')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const payload = { quoteId: 'quote-123', status: 'executed' };

      (RelayService.prototype.verifyWebhookSignature as jest.Mock).mockReturnValue(false);

      await request(app)
        .post('/webhooks/relay')
        .set('x-relay-signature', 'invalid-sig')
        .send(payload)
        .expect(401);
    });

    it('should handle executing status', async () => {
      const payload = {
        quoteId: 'quote-123',
        status: 'executing',
        originTxHash: '0xorigin123',
      };

      (RelayService.prototype.verifyWebhookSignature as jest.Mock).mockReturnValue(true);
      (IntentService.prototype.updateIntentState as jest.Mock).mockResolvedValue({
        intent_id: 'intent-123',
        state: 'RELAY_EXECUTING',
      });

      const response = await request(app)
        .post('/webhooks/relay')
        .set('x-relay-signature', 'valid-sig')
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });
  });
});
