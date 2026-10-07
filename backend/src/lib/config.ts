import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
  REDIS_URL: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  MARKET_UNIVERSE: z.string().default('US_IN'),
  QUOTE_REFRESH_CRON: z.string().default('*/5 * * * *'),
  ALERT_EVAL_CRON: z.string().default('*/2 * * * *'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export const env = parsed.success
  ? parsed.data
  : ({
      NODE_ENV: 'test',
      PORT: 4000,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://stocksense:stocksense@localhost:5432/stocksense?schema=public',
      JWT_ACCESS_SECRET: 'test-access-secret-min-32-characters!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-characters!',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      CORS_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
      REDIS_URL: '',
      OPENAI_API_KEY: '',
      OPENAI_MODEL: 'gpt-4o-mini',
      MARKET_UNIVERSE: 'US_IN',
      QUOTE_REFRESH_CRON: '*/5 * * * *',
      ALERT_EVAL_CRON: '*/2 * * * *',
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_MAX: 120,
      AUTH_RATE_LIMIT_MAX: 10,
      TRUST_PROXY: 1,
    } as z.infer<typeof envSchema>);

export const isOpenAiConfigured = () => Boolean(env.OPENAI_API_KEY?.trim());
