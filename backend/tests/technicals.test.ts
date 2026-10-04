import { describe, expect, it } from 'vitest';
import { computeTechnicals } from '../src/services/technicals.js';

describe('computeTechnicals', () => {
  it('returns nulls for short series and values for longer series', () => {
    const short = computeTechnicals([
      { date: '2024-01-01T00:00:00.000Z', open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { date: '2024-01-02T00:00:00.000Z', open: 1, high: 1, low: 1, close: 1.1, volume: 1 },
    ]);
    expect(short.sma20).toBeNull();

    const bars = Array.from({ length: 60 }, (_, i) => ({
      date: new Date(Date.UTC(2024, 0, i + 1)).toISOString(),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1000 + i,
    }));
    const tech = computeTechnicals(bars);
    expect(tech.lastClose).toBe(159);
    expect(tech.sma20).not.toBeNull();
    expect(tech.rsi14).not.toBeNull();
  });
});
