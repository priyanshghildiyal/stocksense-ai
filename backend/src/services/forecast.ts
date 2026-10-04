import { prisma } from '../lib/prisma.js';
import { yahooProvider } from '../providers/yahoo.js';
import { resolveYahooSymbol } from './market.js';
import { AppError } from '../lib/errors.js';

const MODEL_VERSION = 'empirical-bootstrap-v1';

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  if (next === undefined) return sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

/**
 * Leakage-safe probabilistic forecast:
 * - Uses only historical closes up to asOf
 * - Walk-forward: last 20% of history held out for calibration metrics
 * - Bootstrap future paths from historical daily returns (no look-ahead)
 */
export async function runForecast(ticker: string, horizonDays = 21) {
  const symbol = await resolveYahooSymbol(ticker);
  const history = await yahooProvider.getHistory(symbol, '5y');
  const closes = history.bars.map((b) => b.close).filter(Number.isFinite);
  if (closes.length < 120) {
    throw new AppError(422, 'Insufficient history for validated forecasting', 'INSUFFICIENT_HISTORY');
  }

  const split = Math.floor(closes.length * 0.8);
  const train = closes.slice(0, split);
  const test = closes.slice(split);
  const trainReturns = train.slice(1).map((c, i) => (c - train[i]) / train[i]).filter(Number.isFinite);
  if (trainReturns.length < 60) {
    throw new AppError(422, 'Insufficient return sample for forecasting', 'INSUFFICIENT_HISTORY');
  }

  // Walk-forward one-step MAE on holdout using expanding mean return (no leakage)
  let absErr = 0;
  let count = 0;
  const expanding = [...train];
  for (const actual of test) {
    const rets = expanding.slice(1).map((c, i) => (c - expanding[i]) / expanding[i]);
    const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
    const pred = expanding.at(-1)! * (1 + meanRet);
    absErr += Math.abs(pred - actual) / actual;
    expanding.push(actual);
    count += 1;
  }
  const mape = count ? absErr / count : null;

  const last = closes.at(-1)!;
  const asOf = history.bars.at(-1)!.date;
  const paths = 1000;
  const terminals: number[] = [];
  for (let p = 0; p < paths; p++) {
    let price = last;
    for (let d = 0; d < horizonDays; d++) {
      const r = trainReturns[Math.floor(Math.random() * trainReturns.length)];
      price *= 1 + r;
    }
    terminals.push(price);
  }
  terminals.sort((a, b) => a - b);

  const scenarios = {
    bear: { label: 'Bear (10th percentile)', price: quantile(terminals, 0.1), changePercent: ((quantile(terminals, 0.1) - last) / last) * 100 },
    base: { label: 'Base (median)', price: quantile(terminals, 0.5), changePercent: ((quantile(terminals, 0.5) - last) / last) * 100 },
    bull: { label: 'Bull (90th percentile)', price: quantile(terminals, 0.9), changePercent: ((quantile(terminals, 0.9) - last) / last) * 100 },
  };

  const methodology =
    `${MODEL_VERSION}: bootstrap of historical daily returns from Yahoo Finance closes. ` +
    `Training window ends before holdout. Holdout is the final 20% of bars used only for MAPE calibration. ` +
    `Scenarios are empirical distribution percentiles over ${paths} simulated paths of ${horizonDays} trading days. ` +
    `Not a guarantee of future prices.`;

  const metrics = {
    mapeHoldout: mape,
    trainBars: train.length,
    holdoutBars: test.length,
    returnSample: trainReturns.length,
    lastClose: last,
    horizonDays,
  };

  const security = await prisma.security.findFirst({
    where: { OR: [{ ticker: ticker.toUpperCase() }, { yahooSymbol: symbol }] },
  });

  const run = await prisma.forecastRun.create({
    data: {
      securityId: security?.id || (await ensureOrphanSecurity(ticker, symbol)),
      ticker: ticker.toUpperCase(),
      modelVersion: MODEL_VERSION,
      horizonDays,
      asOf: new Date(asOf),
      trainingStart: new Date(history.bars[0].date),
      trainingEnd: new Date(history.bars[split - 1].date),
      metrics,
      scenarios,
      methodology,
    },
  });

  return {
    id: run.id,
    ticker: run.ticker,
    modelVersion: MODEL_VERSION,
    source: history.source,
    asOf,
    horizonDays,
    metrics,
    scenarios,
    methodology,
  };
}

async function ensureOrphanSecurity(ticker: string, yahooSymbol: string) {
  const created = await prisma.security.upsert({
    where: { ticker: ticker.toUpperCase() },
    create: {
      ticker: ticker.toUpperCase(),
      yahooSymbol,
      name: ticker.toUpperCase(),
      exchange: 'UNKNOWN',
      sector: 'Unknown',
      assetType: 'Equity',
      currency: 'USD',
      active: true,
    },
    update: {},
  });
  return created.id;
}

export async function computeRisk(ticker: string) {
  const symbol = await resolveYahooSymbol(ticker);
  const history = await yahooProvider.getHistory(symbol, '1y');
  const closes = history.bars.map((b) => b.close);
  if (closes.length < 30) throw new AppError(422, 'Insufficient history for risk metrics', 'INSUFFICIENT_HISTORY');
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  let peak = closes[0];
  let maxDd = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    maxDd = Math.min(maxDd, (c - peak) / peak);
  }
  const lastRet = returns.at(-1) || 0;
  const std = Math.sqrt(variance);
  const z = std > 0 ? (lastRet - mean) / std : 0;
  return {
    ticker: ticker.toUpperCase(),
    source: history.source,
    asOf: history.bars.at(-1)?.date,
    annualizedVol: vol,
    maxDrawdown: maxDd,
    lastReturnZScore: z,
    anomaly: Math.abs(z) >= 2.5,
    methodology: 'Risk metrics from Yahoo Finance daily closes: annualized realized volatility, max drawdown, and latest return z-score. Anomaly flag if |z| >= 2.5.',
  };
}
