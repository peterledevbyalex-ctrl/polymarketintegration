import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'http';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { requestIdMiddleware } from './middleware/requestId';
import { enforceHTTPS } from './middleware/security';
import { swaggerSpec } from './swagger';
import intentsRouter from './routes/intents';
import webhooksRouter from './routes/webhooks';
import marketsRouter from './routes/markets';
import cryptoRouter from './routes/crypto';
import eventsRouter from './routes/events';
import positionsRouter from './routes/positions';
import withdrawalsRouter from './routes/withdrawals';
import referralsRouter from './routes/referrals';
import wcmRouter from './routes/wcm';
import commentsRouter from './routes/comments';
import favoritesRouter from './routes/favorites';
import cryptoPricesRouter from './routes/cryptoPrices';
import logger from './utils/logger';
import { getMetrics, register } from './utils/metrics';
import { websocketService } from './services/websocketService';
import { cryptoPriceStreamService } from './services/cryptoPriceStreamService';

const app = express();
const httpServer = createServer(app);

// Security middleware - Helmet with strict configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Swagger UI
      scriptSrc: ["'self'"], // Swagger UI scripts
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
}));

// Enforce HTTPS in production (must be before other middleware)
if (config.server.nodeEnv === 'production') {
  app.use(enforceHTTPS);
}

// CORS - whitelist origins in production
const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (config.server.nodeEnv === 'production') {
      const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()) || ['https://prism.megaeth.io'];
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS: Blocked request from unauthorized origin', { origin });
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // Development: allow all origins
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-API-Version'],
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Trust first proxy (load balancer, etc.) so X-Forwarded-For is used for rate limiting
app.set('trust proxy', 1);

// Request ID for tracing
app.use(requestIdMiddleware);

// API versioning header
app.use((_req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0');
  next();
});

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// Basic health check (for load balancers)
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.nodeEnv,
  });
});

// Detailed health check (for monitoring)
app.get('/health/detailed', async (_req, res) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
  
  // Check Supabase
  const dbStart = Date.now();
  try {
    const { supabase } = await import('./db/supabase');
    const { error } = await supabase.from('users').select('id').limit(1);
    checks.database = {
      status: error ? 'degraded' : 'healthy',
      latency: Date.now() - dbStart,
      ...(error && { error: error.message }),
    };
  } catch (e: any) {
    checks.database = { status: 'unhealthy', latency: Date.now() - dbStart, error: e.message };
  }

  // Check Redis (if enabled)
  if (config.features.backgroundJobs) {
    const redisStart = Date.now();
    try {
      const { testRedisConnection } = await import('./jobs/queue');
      await testRedisConnection();
      checks.redis = { status: 'healthy', latency: Date.now() - redisStart };
    } catch (e: any) {
      checks.redis = { status: 'unhealthy', latency: Date.now() - redisStart, error: e.message };
    }
  }

  // Overall status
  const unhealthy = Object.values(checks).some(c => c.status === 'unhealthy');
  const degraded = Object.values(checks).some(c => c.status === 'degraded');
  
  res.status(unhealthy ? 503 : 200).json({
    status: unhealthy ? 'unhealthy' : degraded ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  });
});

// Metrics endpoint (Prometheus)
if (config.features.metrics) {
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      const metrics = await getMetrics();
      res.end(metrics);
    } catch (error) {
      logger.error('Error generating metrics', error);
      res.status(500).end();
    }
  });
}

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API routes
app.use('/api/markets', marketsRouter);
app.use('/api/crypto', cryptoRouter);
app.use('/api/events', eventsRouter);
app.use('/api/intents', intentsRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/withdraw', withdrawalsRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/wcm', wcmRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/crypto-prices', cryptoPricesRouter);
app.use('/webhooks', webhooksRouter);

// Error handler (must be last)
app.use(errorHandler);

const PORT = config.server.port;

// Initialize WebSocket server if enabled
if (config.features.websocket) {
  websocketService.initialize(httpServer);
  logger.info('WebSocket server enabled');
}

// Setup graceful shutdown
import { setupGracefulShutdown } from './utils/gracefulShutdown';

httpServer.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Swagger docs available at http://localhost:${PORT}/api-docs`);
  if (config.features.metrics) {
    logger.info(`Metrics available at http://localhost:${PORT}/metrics`);
  }
  if (config.features.websocket) {
    logger.info(`WebSocket server available at ws://localhost:${PORT}`);
  }

  cryptoPriceStreamService.start();
  
  // Test Redis connection if background jobs enabled
  if (config.features.backgroundJobs) {
    try {
      const { testRedisConnection } = await import('./jobs/queue');
      await testRedisConnection();
    } catch (error) {
      logger.warn('Background jobs disabled - Redis not available');
    }
  }
});

setupGracefulShutdown(httpServer);

export default app;

