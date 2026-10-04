import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { getSecuritiesPayload } from '../services/market.js';

const router = Router();
const tickerSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{1,20}$/);

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    let watchlist = await prisma.watchlist.findFirst({
      where: { userId: req.user!.id, name: 'Default' },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    if (!watchlist) {
      watchlist = await prisma.watchlist.create({
        data: { userId: req.user!.id, name: 'Default' },
        include: { items: true },
      });
    }
    const payload = await getSecuritiesPayload(false).catch(() => null);
    const byTicker = new Map((payload?.securities || []).map((s) => [s.ticker, s]));
    res.json({
      id: watchlist.id,
      name: watchlist.name,
      tickers: watchlist.items.map((i) => i.ticker),
      items: watchlist.items.map((i) => ({
        ticker: i.ticker,
        quote: byTicker.get(i.ticker) || null,
        addedAt: i.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/items', validateBody(z.object({ ticker: tickerSchema })), async (req, res, next) => {
  try {
    const { ticker } = req.body as { ticker: string };
    const security = await prisma.security.findUnique({ where: { ticker } });
    if (!security) throw new AppError(404, 'Ticker not in universe', 'NOT_FOUND');
    let watchlist = await prisma.watchlist.findFirst({ where: { userId: req.user!.id, name: 'Default' } });
    if (!watchlist) {
      watchlist = await prisma.watchlist.create({ data: { userId: req.user!.id, name: 'Default' } });
    }
    await prisma.watchlistItem.upsert({
      where: { watchlistId_ticker: { watchlistId: watchlist.id, ticker } },
      create: { watchlistId: watchlist.id, ticker },
      update: {},
    });
    res.status(201).json({ ok: true, ticker });
  } catch (error) {
    next(error);
  }
});

router.delete('/items/:ticker', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const watchlist = await prisma.watchlist.findFirst({ where: { userId: req.user!.id, name: 'Default' } });
    if (watchlist) {
      await prisma.watchlistItem.deleteMany({ where: { watchlistId: watchlist.id, ticker } });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
