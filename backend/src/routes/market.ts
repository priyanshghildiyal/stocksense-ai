import { Router } from 'express';
import { z } from 'zod';
import { getSecuritiesPayload, resolveYahooSymbol } from '../services/market.js';
import { yahooProvider } from '../providers/yahoo.js';
import { validateQuery } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { computeTechnicals } from '../services/technicals.js';

const router = Router();

router.get('/securities', async (_req, res, next) => {
  try {
    const payload = await getSecuritiesPayload(false);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/indices', async (_req, res, next) => {
  try {
    const indices = await prisma.security.findMany({ where: { assetType: 'Index', active: true } });
    const quotes = await yahooProvider.getQuotes(indices.map((i) => i.yahooSymbol));
    res.json({
      source: 'Yahoo Finance',
      updatedAt: new Date().toISOString(),
      indices: quotes.map((q) => ({
        ticker: q.ticker,
        name: q.name,
        exchange: q.exchange,
        price: q.price,
        changePercent: q.changePercent,
        currency: q.currency,
        asOf: q.asOf,
        source: q.source,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/history/:ticker', validateQuery(z.object({
  range: z.string().optional().default('1y'),
})), async (req, res, next) => {
  try {
    const range = ((req as any).validatedQuery?.range || '1y') as string;
    const allowed = new Set(['1d', '5d', '1w', '1m', '3m', '6m', '1y', '5y']);
    if (!allowed.has(range)) throw new AppError(400, 'Invalid range', 'VALIDATION_ERROR');
    const symbol = await resolveYahooSymbol(req.params.ticker);
    const history = await yahooProvider.getHistory(symbol, range);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.get('/fundamentals/:ticker', async (req, res, next) => {
  try {
    const symbol = await resolveYahooSymbol(req.params.ticker);
    const data = await yahooProvider.getFundamentals(symbol);
    if (!data) throw new AppError(404, 'Fundamentals unavailable for this symbol', 'NOT_FOUND');
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/financials/:ticker', async (req, res, next) => {
  try {
    const symbol = await resolveYahooSymbol(req.params.ticker);
    const data = await yahooProvider.getFinancials(symbol);
    if (!data) throw new AppError(404, 'Financial statements unavailable for this symbol', 'NOT_FOUND');
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/technicals/:ticker', validateQuery(z.object({
  range: z.string().optional().default('1y'),
})), async (req, res, next) => {
  try {
    const range = ((req as any).validatedQuery?.range || '1y') as string;
    const symbol = await resolveYahooSymbol(req.params.ticker);
    const history = await yahooProvider.getHistory(symbol, range);
    const technicals = computeTechnicals(history.bars);
    res.json({
      ticker: req.params.ticker.toUpperCase(),
      source: history.source,
      asOf: history.bars.at(-1)?.date ?? null,
      range,
      ...technicals,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ownership/:ticker', async (req, res, next) => {
  try {
    const symbol = await resolveYahooSymbol(req.params.ticker);
    const data = await yahooProvider.getOwnership(symbol);
    if (!data) throw new AppError(404, 'Ownership data unavailable', 'NOT_FOUND');
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/screener', validateQuery(z.object({
  sector: z.string().optional(),
  assetType: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minChange: z.coerce.number().optional(),
  maxChange: z.coerce.number().optional(),
})), async (req, res, next) => {
  try {
    const q = (req as any).validatedQuery as {
      sector?: string;
      assetType?: string;
      minPrice?: number;
      maxPrice?: number;
      minChange?: number;
      maxChange?: number;
    };
    const payload = await getSecuritiesPayload(false);
    let rows = payload.securities;
    if (q.sector && q.sector !== 'All sectors') rows = rows.filter((r) => r.sector === q.sector);
    if (q.assetType && q.assetType !== 'All assets') rows = rows.filter((r) => r.assetType === q.assetType);
    if (q.minPrice != null) rows = rows.filter((r) => r.price >= q.minPrice!);
    if (q.maxPrice != null) rows = rows.filter((r) => r.price <= q.maxPrice!);
    if (q.minChange != null) rows = rows.filter((r) => r.changePercent >= q.minChange!);
    if (q.maxChange != null) rows = rows.filter((r) => r.changePercent <= q.maxChange!);
    res.json({
      source: payload.source,
      updatedAt: payload.updatedAt,
      count: rows.length,
      securities: rows,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
