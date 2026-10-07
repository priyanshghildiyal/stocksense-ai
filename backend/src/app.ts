import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './lib/config.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import marketRoutes from './routes/market.js';
import watchlistRoutes from './routes/watchlist.js';
import portfolioRoutes from './routes/portfolio.js';
import alertsRoutes from './routes/alerts.js';
import {
  newsRouter,
  researchRouter,
  forecastRouter,
  riskRouter,
  calcRouter,
  reportsRouter,
  industryRouter,
  healthRouter,
  workspaceRouter,
} from './routes/misc.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((pinoHttp as any)({ logger }));
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'AUTH_RATE_LIMITED', message: 'Too many authentication attempts. Please try again later.' } },
  });

  app.use(rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.get('/', (_req, res) => {
    res.json({
      name: 'StockSense API',
      version: '1.0.0',
      docs: 'See README.md',
    });
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/watchlist', watchlistRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/news', newsRouter);
  app.use('/api/research', researchRouter);
  app.use('/api/forecast', forecastRouter);
  app.use('/api/risk', riskRouter);
  app.use('/api/calculations', calcRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/industry', industryRouter);
  app.use('/api/workspace', workspaceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
