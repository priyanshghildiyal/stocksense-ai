import { Router } from 'express';
import { z } from 'zod';
import { AlertType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { evaluateAlerts } from '../services/alerts.js';

const router = Router();

const createSchema = z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{1,20}$/),
  type: z.nativeEnum(AlertType),
  threshold: z.number().finite(),
  message: z.string().max(280).optional(),
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ alerts });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(createSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createSchema>;
    const security = await prisma.security.findUnique({ where: { ticker: body.ticker } });
    if (!security) throw new AppError(404, 'Ticker not in universe', 'NOT_FOUND');
    const alert = await prisma.alert.create({
      data: {
        userId: req.user!.id,
        securityId: security.id,
        ticker: body.ticker,
        type: body.type,
        threshold: body.threshold,
        message: body.message,
      },
    });
    res.status(201).json({ alert });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', validateBody(z.object({
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  threshold: z.number().finite().optional(),
  message: z.string().max(280).optional(),
})), async (req, res, next) => {
  try {
    const existing = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw new AppError(404, 'Alert not found', 'NOT_FOUND');
    const alert = await prisma.alert.update({ where: { id: existing.id }, data: req.body });
    res.json({ alert });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw new AppError(404, 'Alert not found', 'NOT_FOUND');
    await prisma.alert.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/evaluate', async (req, res, next) => {
  try {
    const result = await evaluateAlerts(req.user!.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
