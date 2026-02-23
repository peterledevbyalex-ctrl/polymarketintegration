import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './config';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Prism Backend PM API',
      version: '1.0.0',
      description: 'MegaETH to Polymarket Relay Backend API',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.server.port}`,
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
              },
            },
          },
        },
        IntentState: {
          type: 'string',
          enum: [
            'CREATED',
            'WALLET_READY',
            'RELAY_QUOTED',
            'ORIGIN_TX_SUBMITTED',
            'RELAY_EXECUTING',
            'DEST_FUNDED',
            'ORDER_SUBMITTING',
            'ORDER_PLACED',
            'FILLED',
            'PARTIAL_FILL',
            'NEEDS_RETRY',
            'FAILED',
            'CANCELLED',
          ],
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

