import { Router } from 'express';
import { z } from 'zod';
import { yahooProvider } from '../providers/yahoo.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { runResearchAsk, analyzeDocumentText, industryBrief } from '../services/research.js';
import { runForecast, computeRisk } from '../services/forecast.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { isOpenAiConfigured } from '../lib/config.js';
import { checkDatabase } from '../lib/prisma.js';
import { cache } from '../lib/cache.js';
import { env } from '../lib/config.js';

export const newsRouter = Router();
export const researchRouter = Router();
export const forecastRouter = Router();
export const riskRouter = Router();
export const calcRouter = Router();
export const reportsRouter = Router();
export const industryRouter = Router();
export const healthRouter = Router();
export const workspaceRouter = Router();

newsRouter.get('/', validateQuery(z.object({
  q: z.string().optional(),
  ticker: z.string().optional(),
})), async (req, res, next) => {
  try {
    const q = (req as any).validatedQuery as { q?: string; ticker?: string };
    const items = await yahooProvider.getNews(q.q, q.ticker ? [q.ticker.toUpperCase()] : []);
    res.json({ source: 'Yahoo Finance', updatedAt: new Date().toISOString(), items });
  } catch (error) {
    next(error);
  }
});

researchRouter.post('/ask', optionalAuth, validateBody(z.object({
  question: z.string().trim().min(3).max(2000),
  ticker: z.string().trim().toUpperCase().optional(),
})), async (req, res, next) => {
  try {
    const { question, ticker } = req.body as { question: string; ticker?: string };
    const result = await runResearchAsk(question, ticker);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

researchRouter.get('/status', (_req, res) => {
  res.json({
    configured: isOpenAiConfigured(),
    model: isOpenAiConfigured() ? env.OPENAI_MODEL : null,
    message: isOpenAiConfigured()
      ? 'OpenAI research with tool calling is available.'
      : 'Set OPENAI_API_KEY to enable AI research.',
  });
});

researchRouter.post('/documents', requireAuth, validateBody(z.object({
  title: z.string().trim().min(1).max(200),
  contentText: z.string().trim().min(20).max(100000),
})), async (req, res, next) => {
  try {
    const { title, contentText } = req.body as { title: string; contentText: string };
    const analysis = await analyzeDocumentText(title, contentText);
    const doc = await prisma.researchDocument.create({
      data: {
        userId: req.user!.id,
        title,
        contentText,
        analysisJson: JSON.stringify(analysis),
      },
    });
    res.status(201).json({ id: doc.id, title: doc.title, analysis, createdAt: doc.createdAt });
  } catch (error) {
    next(error);
  }
});

forecastRouter.get('/:ticker', async (req, res, next) => {
  try {
    const horizonDays = Number(req.query.horizonDays || 21);
    if (![5, 10, 21, 63].includes(horizonDays)) {
      throw new AppError(400, 'horizonDays must be one of 5,10,21,63', 'VALIDATION_ERROR');
    }
    const result = await runForecast(req.params.ticker, horizonDays);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

riskRouter.get('/:ticker', async (req, res, next) => {
  try {
    const result = await computeRisk(req.params.ticker);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

riskRouter.get('/', async (_req, res, next) => {
  try {
    const securities = await prisma.security.findMany({
      where: { active: true, assetType: 'Equity' },
      take: 20,
    });
    const rows = [];
    for (const s of securities) {
      try {
        rows.push(await computeRisk(s.ticker));
      } catch {
        // skip unavailable
      }
    }
    res.json({
      source: 'Yahoo Finance',
      updatedAt: new Date().toISOString(),
      items: rows.sort((a, b) => Number(b.anomaly) - Number(a.anomaly) || b.annualizedVol - a.annualizedVol),
    });
  } catch (error) {
    next(error);
  }
});

const calcSchema = z.object({
  name: z.string().min(1).max(80),
  formula: z.string().min(1).max(400),
  result: z.string().min(1).max(200),
  inputs: z.string().max(1000).optional(),
});

calcRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const calculations = await prisma.savedCalculation.findMany({
      where: { userId: req.user!.id },
      orderBy: { savedAt: 'desc' },
      take: 50,
    });
    res.json({ calculations });
  } catch (error) {
    next(error);
  }
});

calcRouter.post('/', requireAuth, validateBody(calcSchema), async (req, res, next) => {
  try {
    const calculation = await prisma.savedCalculation.create({
      data: { userId: req.user!.id, ...req.body },
    });
    res.status(201).json({ calculation });
  } catch (error) {
    next(error);
  }
});

calcRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await prisma.savedCalculation.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

reportsRouter.post('/', requireAuth, validateBody(z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{1,20}$/),
  title: z.string().trim().min(1).max(200).optional(),
})), async (req, res, next) => {
  try {
    const { ticker } = req.body as { ticker: string; title?: string };
    const [fundamentals, news, risk, forecast] = await Promise.all([
      yahooProvider.getFundamentals(await (await import('../services/market.js')).resolveYahooSymbol(ticker)).catch(() => null),
      yahooProvider.getNews(undefined, [ticker]).catch(() => []),
      computeRisk(ticker).catch(() => null),
      runForecast(ticker, 21).catch(() => null),
    ]);
    const sections = {
      overview: { ticker, generatedAt: new Date().toISOString() },
      fundamentals,
      news: news.slice(0, 10),
      risk,
      forecast,
      limitations: 'Sections are populated only from connected Yahoo Finance / model outputs. Missing sections mean data was unavailable — nothing was invented.',
    };
    const report = await prisma.researchReport.create({
      data: {
        userId: req.user!.id,
        ticker,
        title: req.body.title || `${ticker} research report`,
        sections,
      },
    });
    res.status(201).json({ report });
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const reports = await prisma.researchReport.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

industryRouter.get('/:sector', async (req, res, next) => {
  try {
    const brief = await industryBrief(req.params.sector);
    res.json(brief);
  } catch (error) {
    next(error);
  }
});

healthRouter.get('/', async (_req, res) => {
  const db = await checkDatabase();
  res.status(db ? 200 : 503).json({
    status: db ? 'ok' : 'degraded',
    database: db,
    openai: isOpenAiConfigured(),
    marketProvider: 'Yahoo Finance',
    time: new Date().toISOString(),
  });
});

healthRouter.get('/admin', requireAuth, async (req, res, next) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      // Allow any authenticated user to see limited health in development
      if (env.NODE_ENV === 'production') {
        throw new AppError(403, 'Admin role required', 'FORBIDDEN');
      }
    }
    const jobs = await prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 });
    const securityCount = await prisma.security.count();
    const userCount = await prisma.user.count();
    res.json({
      database: await checkDatabase(),
      openai: isOpenAiConfigured(),
      cache: cache.stats(),
      securityCount,
      userCount,
      jobs,
      env: { nodeEnv: env.NODE_ENV, port: env.PORT },
    });
  } catch (error) {
    next(error);
  }
});

workspaceRouter.use(requireAuth);

workspaceRouter.get('/notes', async (req, res, next) => {
  try {
    const notes = await prisma.researchNote.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ notes });
  } catch (error) {
    next(error);
  }
});

workspaceRouter.post('/notes', validateBody(z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  ticker: z.string().trim().toUpperCase().optional(),
})), async (req, res, next) => {
  try {
    const note = await prisma.researchNote.create({ data: { userId: req.user!.id, ...req.body } });
    res.status(201).json({ note });
  } catch (error) {
    next(error);
  }
});

workspaceRouter.post('/snapshots', async (req, res, next) => {
  try {
    const { getSecuritiesPayload } = await import('../services/market.js');
    const payload = await getSecuritiesPayload(false);
    const snapshot = await prisma.visitSnapshot.create({
      data: {
        userId: req.user!.id,
        payload: {
          at: new Date().toISOString(),
          securities: payload.securities.map((s) => ({
            ticker: s.ticker,
            price: s.price,
            changePercent: s.changePercent,
            asOf: s.asOf,
          })),
        },
      },
    });
    res.status(201).json({ snapshot: { id: snapshot.id, createdAt: snapshot.createdAt } });
  } catch (error) {
    next(error);
  }
});

workspaceRouter.get('/what-changed', async (req, res, next) => {
  try {
    const previous = await prisma.visitSnapshot.findFirst({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!previous) {
      return res.json({
        available: false,
        message: 'No previous visit snapshot. Create one from Research Workspace.',
      });
    }
    const { getSecuritiesPayload } = await import('../services/market.js');
    const current = await getSecuritiesPayload(false);
    const prevMap = new Map(
      ((previous.payload as any).securities || []).map((s: any) => [s.ticker, s]),
    );
    const changes = current.securities
      .map((s) => {
        const p = prevMap.get(s.ticker);
        if (!p) return null;
        return {
          ticker: s.ticker,
          previousPrice: p.price,
          currentPrice: s.price,
          priceChange: s.price - p.price,
          previousAsOf: p.asOf,
          currentAsOf: s.asOf,
          source: s.source,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => Math.abs(b.priceChange) - Math.abs(a.priceChange));
    res.json({
      available: true,
      previousAt: previous.createdAt.toISOString(),
      currentAt: current.updatedAt,
      source: current.source,
      changes,
    });
  } catch (error) {
    next(error);
  }
});
