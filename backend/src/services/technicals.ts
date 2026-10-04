import type { HistoryBar } from '../providers/types.js';

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function computeTechnicals(bars: HistoryBar[]) {
  const closes = bars.map((b) => b.close).filter(Number.isFinite);
  const volumes = bars.map((b) => b.volume).filter(Number.isFinite);
  const last = closes.at(-1) ?? null;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const vol20 = stdev(returns.slice(-20));
  const high52 = closes.length ? Math.max(...closes.slice(-252)) : null;
  const low52 = closes.length ? Math.min(...closes.slice(-252)) : null;

  return {
    lastClose: last,
    sma20,
    sma50,
    sma200,
    rsi14,
    realizedVol20d: vol20 == null ? null : vol20 * Math.sqrt(252),
    high52w: high52,
    low52w: low52,
    avgVolume20: sma(volumes, 20),
    methodology:
      'Indicators are computed from Yahoo Finance historical OHLCV bars only. They describe past price behavior and are not predictive signals.',
  };
}
