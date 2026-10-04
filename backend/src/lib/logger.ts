import pino from 'pino';
import { env } from './config.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' ? { target: 'pino/file', options: { destination: 1 } } : undefined,
});
