import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { getSecuritiesPayload } from '../services/market.js';

const router = Router();

const holdingSchema = z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{1,20}$/),
  quantity: z.number().positive().max(1e12),
  purchasePrice: z.number().positive().max(1e12),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const holdings = await prisma.portfolioHolding.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'asc' },
    });
    const payload = await getSecuritiesPayload(false).catch(() => null);
    const byTicker = new Map((payload?.securities || []).map((s) => [s.ticker, s]));
    const priced = holdings.map((h) => {
      const quote = byTicker.get(h.ticker);
      const currentPrice = quote?.price ?? null;
      const invested = h.quantity * h.purchasePrice;
      const currentValue = currentPrice == null ? null : h.quantity * currentPrice;
      return {
        id: h.id,
        ticker: h.ticker,
        quantity: h.quantity,
        purchasePrice: h.purchasePrice,
        purchaseDate: h.purchaseDate.toISOString().slice(0, 10),
        currency: h.currency,
        quote: quote || null,
        invested,
        currentValue,
        pnl: currentValue == null ? null : currentValue - invested,
      };
    });
    const investedTotal = priced.reduce((s, h) => s + h.invested, 0);
    const currentTotal = priced.reduce((s, h) => s + (h.currentValue ?? 0), 0);
    res.json({
      source: payload?.source ?? null,
      updatedAt: payload?.updatedAt ?? null,
      holdings: priced,
      summary: {
        investedTotal,
        currentTotal,
        pnlTotal: currentTotal - investedTotal,
        count: priced.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(holdingSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof holdingSchema>;
    const security = await prisma.security.findUnique({ where: { ticker: body.ticker } });
    if (!security) throw new AppError(404, 'Ticker not in universe', 'NOT_FOUND');
    const purchaseDate = new Date(`${body.purchaseDate}T00:00:00.000Z`);
    if (purchaseDate > new Date()) throw new AppError(400, 'Purchase date cannot be in the future', 'VALIDATION_ERROR');
    const count = await prisma.portfolioHolding.count({ where: { userId: req.user!.id } });
    if (count >= 500) throw new AppError(400, 'Portfolio limited to 500 holdings', 'LIMIT');
    const holding = await prisma.portfolioHolding.create({
      data: {
        userId: req.user!.id,
        securityId: security.id,
        ticker: body.ticker,
        quantity: body.quantity,
        purchasePrice: body.purchasePrice,
        purchaseDate,
        currency: security.currency,
      },
    });
    res.status(201).json({ holding });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.portfolioHolding.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw new AppError(404, 'Holding not found', 'NOT_FOUND');
    await prisma.portfolioHolding.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
