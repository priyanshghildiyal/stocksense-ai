import cron from 'node-cron';
import { env } from './lib/config.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { refreshQuotesJob } from './services/market.js';
import { evaluateAlerts } from './services/alerts.js';

const app = createApp();

function startJobs() {
  if (!cron.validate(env.QUOTE_REFRESH_CRON)) {
    logger.warn('Invalid QUOTE_REFRESH_CRON; skipping quote job');
  } else {
    cron.schedule(env.QUOTE_REFRESH_CRON, () => {
      refreshQuotesJob().catch((err) => logger.warn({ err }, 'Quote refresh job failed'));
    });
  }
  if (!cron.validate(env.ALERT_EVAL_CRON)) {
    logger.warn('Invalid ALERT_EVAL_CRON; skipping alert job');
  } else {
    cron.schedule(env.ALERT_EVAL_CRON, () => {
      evaluateAlerts().catch((err) => logger.warn({ err }, 'Alert eval job failed'));
    });
  }
}

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'StockSense API listening');
  startJobs();
  // Warm cache shortly after boot
  setTimeout(() => {
    refreshQuotesJob().catch((err) => logger.warn({ err }, 'Initial quote warm failed'));
  }, 2000);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
