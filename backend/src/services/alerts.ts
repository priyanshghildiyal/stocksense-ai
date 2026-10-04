import { prisma } from '../lib/prisma.js';
import { getSecuritiesPayload } from './market.js';
import { logger } from '../lib/logger.js';

export async function evaluateAlerts(userId?: string) {
  const started = await prisma.jobRun.create({
    data: { name: 'alert_eval', status: 'running', detail: userId ? `user:${userId}` : 'all' },
  });
  try {
    const payload = await getSecuritiesPayload(false);
    const byTicker = new Map(payload.securities.map((s) => [s.ticker, s]));
    const alerts = await prisma.alert.findMany({
      where: {
        status: 'ACTIVE',
        ...(userId ? { userId } : {}),
      },
    });
    let triggered = 0;
    for (const alert of alerts) {
      const quote = byTicker.get(alert.ticker);
      if (!quote) continue;
      let hit = false;
      switch (alert.type) {
        case 'PRICE_ABOVE':
          hit = quote.price >= alert.threshold;
          break;
        case 'PRICE_BELOW':
          hit = quote.price <= alert.threshold;
          break;
        case 'CHANGE_PERCENT_ABOVE':
          hit = quote.changePercent >= alert.threshold;
          break;
        case 'CHANGE_PERCENT_BELOW':
          hit = quote.changePercent <= alert.threshold;
          break;
      }
      if (hit) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: {
            status: 'TRIGGERED',
            triggeredAt: new Date(),
            message: alert.message || `${alert.ticker} triggered ${alert.type} at ${quote.price}`,
          },
        });
        triggered += 1;
      }
    }
    await prisma.jobRun.update({
      where: { id: started.id },
      data: { status: 'success', detail: `triggered=${triggered}`, finishedAt: new Date() },
    });
    return { evaluated: alerts.length, triggered, source: payload.source, updatedAt: payload.updatedAt };
  } catch (error) {
    await prisma.jobRun.update({
      where: { id: started.id },
      data: {
        status: 'failed',
        detail: error instanceof Error ? error.message : 'error',
        finishedAt: new Date(),
      },
    });
    logger.warn({ err: error }, 'Alert evaluation failed');
    throw error;
  }
}
