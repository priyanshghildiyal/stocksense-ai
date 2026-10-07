import YahooFinance from 'yahoo-finance2';
import type {
  FundamentalsSnapshot,
  HistoryBar,
  MarketDataProvider,
  NewsItem,
  NormalizedSecurityQuote,
} from './types.js';
import { logger } from '../lib/logger.js';
import { cache } from '../lib/cache.js';

const SOURCE = 'Yahoo Finance';
const yahooFinance = YahooFinance;
yahooFinance.suppressNotices(['yahooSurvey']);

function iso(value: Date | number | string | undefined | null): string | undefined {
  if (value == null) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function inferAssetType(symbol: string, quoteType?: string): NormalizedSecurityQuote['assetType'] {
  const qt = (quoteType || '').toUpperCase();
  if (qt.includes('CRYPTO') || symbol.endsWith('-USD') && /BTC|ETH|SOL/.test(symbol)) return 'Crypto';
  if (qt.includes('FUTURE') || symbol.endsWith('=F')) return 'Commodity';
  if (qt.includes('ETF')) return 'ETF';
  if (qt.includes('INDEX') || symbol.startsWith('^')) return 'Index';
  if (qt.includes('BOND') || qt.includes('MUTUALFUND')) return 'Bond';
  return 'Equity';
}

function displayTicker(yahooSymbol: string): string {
  return yahooSymbol.replace(/\.NS$/i, '').replace(/\.BO$/i, '').replace(/^\^/, '').replace(/=F$/i, '').toUpperCase();
}

function mapQuote(raw: any): NormalizedSecurityQuote | null {
  const yahooSymbol = String(raw.symbol || '').trim();
  if (!yahooSymbol) return null;
  const price = Number(raw.regularMarketPrice ?? raw.postMarketPrice ?? raw.preMarketPrice);
  const changePercent = Number(raw.regularMarketChangePercent ?? 0);
  const currency = String(raw.currency || '').toUpperCase();
  const asOf =
    iso(raw.regularMarketTime) ||
    iso(raw.postMarketTime) ||
    iso(raw.preMarketTime) ||
    new Date().toISOString();
  if (!Number.isFinite(price) || price < 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  const exchange = String(raw.fullExchangeName || raw.exchange || 'UNKNOWN').slice(0, 80);
  const name = String(raw.shortName || raw.longName || yahooSymbol).slice(0, 120);
  const sector = String(raw.sector || raw.quoteType || 'Unknown').slice(0, 80);
  return {
    ticker: displayTicker(yahooSymbol).slice(0, 20),
    yahooSymbol,
    name,
    exchange,
    sector,
    industry: raw.industry ? String(raw.industry) : undefined,
    assetType: inferAssetType(yahooSymbol, raw.quoteType),
    price,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
    currency,
    asOf,
    source: SOURCE,
    country: raw.region ? String(raw.region) : undefined,
  };
}

export class YahooFinanceProvider implements MarketDataProvider {
  readonly name = SOURCE;

  async getQuotes(symbols: string[]): Promise<NormalizedSecurityQuote[]> {
    if (!symbols.length) return [];
    const cacheKey = `quotes:${symbols.slice().sort().join(',')}`;
    const cached = await cache.get<NormalizedSecurityQuote[]>(cacheKey);
    if (cached) return cached;

    const results: NormalizedSecurityQuote[] = [];
    // Batch in chunks to avoid oversized requests
    for (let i = 0; i < symbols.length; i += 25) {
      const chunk = symbols.slice(i, i + 25);
      try {
        const response = await yahooFinance.quote(chunk, {}, { validateResult: false });
        const rows = Array.isArray(response) ? response : [response];
        for (const row of rows) {
          const mapped = mapQuote(row);
          if (mapped) results.push(mapped);
        }
      } catch (error) {
        logger.warn({ err: error, chunk }, 'Yahoo quote batch failed');
        for (const symbol of chunk) {
          try {
            const row = await yahooFinance.quote(symbol, {}, { validateResult: false });
            const mapped = mapQuote(row);
            if (mapped) results.push(mapped);
          } catch (inner) {
            logger.warn({ err: inner, symbol }, 'Yahoo quote failed for symbol');
          }
        }
      }
    }

    // Deduplicate by ticker preferring first occurrence
    const seen = new Set<string>();
    const deduped = results.filter((item) => {
      if (seen.has(item.ticker)) return false;
      seen.add(item.ticker);
      return true;
    });
    await cache.set(cacheKey, deduped, 30);
    return deduped;
  }

  async getHistory(symbol: string, range = '1y'): Promise<{ symbol: string; source: string; bars: HistoryBar[] }> {
    const cacheKey = `history:${symbol}:${range}`;
    const cached = await cache.get<{ symbol: string; source: string; bars: HistoryBar[] }>(cacheKey);
    if (cached) return cached;

    const period1 = rangeToStart(range);
    const result = await yahooFinance.chart(symbol, {
      period1,
      interval: range === '1d' || range === '5d' ? '15m' : '1d',
      return: 'array',
    }, { validateResult: false });

    const bars: HistoryBar[] = (result || [])
      .map((bar: any) => {
        const date = iso(bar.date);
        const open = Number(bar.open);
        const high = Number(bar.high);
        const low = Number(bar.low);
        const close = Number(bar.close);
        const volume = Number(bar.volume ?? 0);
        if (!date || ![open, high, low, close].every(Number.isFinite)) return null;
        return { date, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
      })
      .filter(Boolean) as HistoryBar[];

    const payload = { symbol, source: SOURCE, bars };
    await cache.set(cacheKey, payload, 120);
    return payload;
  }

  async getFundamentals(symbol: string): Promise<FundamentalsSnapshot | null> {
    const cacheKey = `fundamentals:${symbol}`;
    const cached = await cache.get<FundamentalsSnapshot>(cacheKey);
    if (cached) return cached;
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'summaryProfile'],
      }, { validateResult: false });
      const price = summary.price as any;
      const stats = summary.defaultKeyStatistics as any;
      const detail = summary.summaryDetail as any;
      const fin = summary.financialData as any;
      const profile = summary.summaryProfile as any;
      const snapshot: FundamentalsSnapshot = {
        ticker: displayTicker(symbol),
        asOf: new Date().toISOString(),
        source: SOURCE,
        marketCap: num(price?.marketCap ?? detail?.marketCap),
        peRatio: num(detail?.trailingPE ?? stats?.trailingPE),
        pbRatio: num(detail?.priceToBook ?? stats?.priceToBook),
        epsTrailing: num(stats?.trailingEps),
        dividendYield: num(detail?.dividendYield),
        profitMargins: num(fin?.profitMargins),
        revenueGrowth: num(fin?.revenueGrowth),
        earningsGrowth: num(fin?.earningsGrowth),
        returnOnEquity: num(fin?.returnOnEquity),
        debtToEquity: num(fin?.debtToEquity),
        sector: profile?.sector ?? null,
        industry: profile?.industry ?? null,
        longBusinessSummary: profile?.longBusinessSummary ?? null,
      };
      await cache.set(cacheKey, snapshot, 300);
      return snapshot;
    } catch (error) {
      logger.warn({ err: error, symbol }, 'Yahoo fundamentals failed');
      return null;
    }
  }

  async getFinancials(symbol: string): Promise<Record<string, unknown> | null> {
    const cacheKey = `financials:${symbol}`;
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory', 'earnings'],
      }, { validateResult: false });
      const payload = {
        source: SOURCE,
        asOf: new Date().toISOString(),
        incomeStatementHistory: summary.incomeStatementHistory ?? null,
        balanceSheetHistory: summary.balanceSheetHistory ?? null,
        cashflowStatementHistory: summary.cashflowStatementHistory ?? null,
        earnings: summary.earnings ?? null,
      };
      await cache.set(cacheKey, payload, 600);
      return payload;
    } catch (error) {
      logger.warn({ err: error, symbol }, 'Yahoo financials failed');
      return null;
    }
  }

  async getNews(query?: string, tickers: string[] = []): Promise<NewsItem[]> {
    const cacheKey = `news:${query || ''}:${tickers.join(',')}`;
    const cached = await cache.get<NewsItem[]>(cacheKey);
    if (cached) return cached;
    const items: NewsItem[] = [];
    try {
      if (tickers.length) {
        for (const ticker of tickers.slice(0, 5)) {
          const search = await yahooFinance.search(ticker, { newsCount: 8 }, { validateResult: false });
          for (const n of search.news || []) {
            items.push(mapNews(n, [displayTicker(ticker)]));
          }
        }
      } else {
        const search = await yahooFinance.search(query || 'stock market', { newsCount: 20 }, { validateResult: false });
        for (const n of search.news || []) {
          items.push(mapNews(n, []));
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'Yahoo news search failed');
    }
    const dedup = new Map<string, NewsItem>();
    for (const item of items) {
      if (!dedup.has(item.id)) dedup.set(item.id, item);
    }
    const list = [...dedup.values()].slice(0, 40);
    await cache.set(cacheKey, list, 120);
    return list;
  }

  async getOwnership(symbol: string): Promise<Record<string, unknown> | null> {
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ['institutionOwnership', 'majorHoldersBreakdown', 'insiderHolders'],
      }, { validateResult: false });
      return {
        source: SOURCE,
        asOf: new Date().toISOString(),
        institutionOwnership: summary.institutionOwnership ?? null,
        majorHoldersBreakdown: summary.majorHoldersBreakdown ?? null,
        insiderHolders: summary.insiderHolders ?? null,
      };
    } catch (error) {
      logger.warn({ err: error, symbol }, 'Yahoo ownership failed');
      return null;
    }
  }
}

function mapNews(n: any, tickers: string[]): NewsItem {
  return {
    id: String(n.uuid || n.link || n.title),
    title: String(n.title || 'Untitled'),
    summary: n.summary ? String(n.summary) : undefined,
    publisher: n.publisher ? String(n.publisher) : undefined,
    link: n.link ? String(n.link) : undefined,
    publishedAt: iso(n.providerPublishTime ? n.providerPublishTime * 1000 : n.pubDate),
    tickers,
    source: SOURCE,
  };
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function rangeToStart(range: string): Date {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const map: Record<string, number> = {
    '1d': day,
    '5d': 5 * day,
    '1w': 7 * day,
    '1m': 31 * day,
    '3m': 93 * day,
    '6m': 186 * day,
    '1y': 365 * day,
    '5y': 5 * 365 * day,
  };
  return new Date(now - (map[range] || map['1y']));
}

export const yahooProvider = new YahooFinanceProvider();
