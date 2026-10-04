import { describe, expect, it } from 'vitest';
import { formatQuoteTimestamp } from './services/marketData.js';

describe('formatQuoteTimestamp', () => {
  it('formats a valid ISO timestamp', () => {
    const text = formatQuoteTimestamp('2025-01-15T10:30:00.000Z');
    expect(typeof text).toBe('string');
    expect(text).not.toBe('Timestamp unavailable');
  });

  it('rejects invalid timestamps', () => {
    expect(formatQuoteTimestamp('not-a-date')).toBe('Timestamp unavailable');
  });
});
