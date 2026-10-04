const marketEnv = import.meta.env || {};
const API_URL = marketEnv.VITE_MARKET_API_URL || '/api/market/securities';
const MAX_SECURITIES = 1000;
const MAX_DATA_AGE_MS = 5 * 60 * 1000;

// Keep one stable array reference so existing page components see refreshed data.
export const marketSecurities = [];
export const researchPrompts = Object.freeze([]);

function validText(value, maxLength = 120) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return null;

  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] ||
      hour > 23 || minute > 59 || second > 59 ||
      (match[8] && (Number(match[8]) > 23 || Number(match[9]) > 59))) return null;

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

async function readLimitedBody(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maxBytes) {
      throw new Error('Market-data response exceeds the 2 MB limit.');
    }
    return body;
  }

  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        reader.cancel().catch(() => {});
        throw new Error('Market-data response exceeds the 2 MB limit.');
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function normalizeSecurity(item, responseSource) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const ticker = typeof item.ticker === 'string' ? item.ticker.trim().toUpperCase() : '';
  const price = typeof item.price === 'number' ? item.price : Number.NaN;
  const changePercent = typeof item.changePercent === 'number' ? item.changePercent : Number.NaN;
  const currency = typeof item.currency === 'string' ? item.currency.trim().toUpperCase() : '';
  const asOf = parseTimestamp(item.asOf);
  const source = validText(item.source, 120) ? item.source.trim() : responseSource;

  if (!/^[A-Z0-9._-]{1,20}$/.test(ticker) ||
      !validText(item.name) || !validText(item.exchange, 80) ||
      !validText(item.sector, 80) || !Number.isFinite(price) || price < 0 || price > 1e15 ||
      !Number.isFinite(changePercent) || Math.abs(changePercent) > 100000 || !/^[A-Z]{3}$/.test(currency) ||
      asOf === null || asOf > Date.now() + 5 * 60 * 1000 || !validText(source)) return null;

  const assetType = validText(item.assetType, 40) ? item.assetType.trim() : 'Equity';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  let priceDisplay;
  try {
    priceDisplay = new Intl.NumberFormat(locale, {
      style: 'currency', currency, maximumFractionDigits: price < 1 ? 4 : 2
    }).format(price);
  } catch {
    return null;
  }
  const sign = changePercent > 0 ? '+' : '';

  return Object.freeze({
    ticker,
    name: item.name.trim(),
    exchange: item.exchange.trim(),
    sector: item.sector.trim(),
    assetType,
    price,
    currency,
    priceDisplay,
    changePercent,
    change: `${sign}${changePercent.toFixed(2)}%`,
    positive: changePercent >= 0,
    source,
    asOf: new Date(asOf).toISOString(),
  });
}

export async function fetchMarketSecurities({ signal } = {}) {
  const response = await fetch(API_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`Market-data service returned HTTP ${response.status}.`);

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) {
    throw new Error('Market-data response exceeds the 2 MB limit.');
  }
  const body = await readLimitedBody(response, 2 * 1024 * 1024);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('Market-data service returned invalid JSON.');
  }
  const updatedTime = parseTimestamp(payload?.updatedAt);
  if (!payload || !Array.isArray(payload.securities) || payload.securities.length > MAX_SECURITIES ||
      updatedTime === null || updatedTime > Date.now() + 5 * 60 * 1000 ||
      !validText(payload.source, 120)) {
    throw new Error('Market-data response did not match the documented schema.');
  }

  const securities = payload.securities.map(item => normalizeSecurity(item, payload.source));
  if (securities.some(item => item === null)) {
    throw new Error('Market-data response contains an invalid security record.');
  }
  if (new Set(securities.map(item => item.ticker)).size !== securities.length) {
    throw new Error('Market-data response contains duplicate tickers.');
  }

  marketSecurities.splice(0, marketSecurities.length, ...securities);
  const stale = Date.now() - updatedTime > MAX_DATA_AGE_MS || securities.some(item => Date.now() - Date.parse(item.asOf) > MAX_DATA_AGE_MS);
  return {
    status: stale ? 'stale' : 'online',
    source: payload.source.trim(),
    updatedAt: new Date(updatedTime).toISOString(),
    count: securities.length,
  };
}

export function formatQuoteTimestamp(value) {
  const time = parseTimestamp(value);
  if (time === null) return 'Timestamp unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(time);
}
