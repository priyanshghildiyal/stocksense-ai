import { prisma } from '../lib/prisma.js';
import { yahooProvider } from '../providers/yahoo.js';
import { logger } from '../lib/logger.js';
import { cache } from '../lib/cache.js';
import { AppError } from '../lib/errors.js';
import type { NormalizedSecurityQuote } from '../providers/types.js';

const FRONTEND_SOURCE_MAX = 120;

export function toFrontendSecurity(q: NormalizedSecurityQuote) {
  return {
    ticker: q.ticker,
    name: q.name.slice(0, 120),
    exchange: q.exchange.slice(0, 80),
    sector: q.sector.slice(0, 80),
    assetType: q.assetType === 'Index' || q.assetType === 'ETF' || q.assetType === 'Other' ? 'Equity' : q.assetType,
    price: q.price,
    changePercent: q.changePercent,
    currency: q.currency,
    asOf: q.asOf,
    source: q.source.slice(0, FRONTEND_SOURCE_MAX),
  };
}

export async function resolveYahooSymbol(tickerOrSymbol: string): Promise<string> {
  const key = tickerOrSymbol.trim().toUpperCase();
  const security = await prisma.security.findFirst({
    where: {
      OR: [{ ticker: key }, { yahooSymbol: key }, { yahooSymbol: `${key}.NS` }, { yahooSymbol: `${key}.BO` }],
      active: true,
    },
  });
  if (security) return security.yahooSymbol;
  return key;
}

export async function getSecuritiesPayload(includeIndices = false) {
  const cached = await cache.get<{ source: string; updatedAt: string; securities: ReturnType<typeof toFrontendSecurity>[] }>('payload:securities');
  if (cached) return cached;

  const securities = await prisma.security.findMany({
    where: {
      active: true,
      ...(includeIndices ? {} : { assetType: { not: 'Index' } }),
    },
    orderBy: { ticker: 'asc' },
  });

  if (!securities.length) {
    throw new AppError(503, 'No securities configured. Run database seed.', 'NO_UNIVERSE');
  }

  const quotes = await yahooProvider.getQuotes(securities.map((s) => s.yahooSymbol));
  const byYahoo = new Map(quotes.map((q) => [q.yahooSymbol, q]));

  const now = new Date();
  const merged: ReturnType<typeof toFrontendSecurity>[] = [];

  for (const security of securities) {
    const quote = byYahoo.get(security.yahooSymbol);
    if (!quote) continue;

    // Prefer curated metadata for sector/name/exchange when present
    const frontend = toFrontendSecurity({
      ...quote,
      ticker: security.ticker,
      name: security.name || quote.name,
      exchange: security.exchange || quote.exchange,
      sector: security.sector || quote.sector,
      assetType: (security.assetType as any) || quote.assetType,
      currency: quote.currency || security.currency,
    });
    merged.push(frontend);

    await prisma.quoteSnapshot.create({
      data: {
        securityId: security.id,
        price: quote.price,
        changePercent: quote.changePercent,
        currency: quote.currency,
        asOf: new Date(quote.asOf),
        source: quote.source,
      },
    }).catch(() => undefined);
  }

  if (!merged.length) {
    throw new AppError(503, 'Market data provider returned no usable quotes.', 'PROVIDER_EMPTY');
  }

  const payload = {
    source: 'Yahoo Finance',
    updatedAt: now.toISOString(),
    securities: merged.slice(0, 1000),
  };
  await cache.set('payload:securities', payload, 25);
  return payload;
}

export async function refreshQuotesJob() {
  const started = await prisma.jobRun.create({
    data: { name: 'quote_refresh', status: 'running' },
  });
  try {
    await cache.del('payload:securities');
    const payload = await getSecuritiesPayload(false);
    await prisma.jobRun.update({
      where: { id: started.id },
      data: {
        status: 'success',
        detail: `Refreshed ${payload.securities.length} securities`,
        finishedAt: new Date(),
      },
    });
    logger.info({ count: payload.securities.length }, 'Quote refresh completed');
    return payload;
  } catch (error) {
    await prisma.jobRun.update({
      where: { id: started.id },
      data: {
        status: 'failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
