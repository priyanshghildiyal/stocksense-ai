export type NormalizedSecurityQuote = {
  ticker: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry?: string;
  assetType: 'Equity' | 'Commodity' | 'Crypto' | 'Bond' | 'Index' | 'ETF' | 'Other';
  price: number;
  changePercent: number;
  currency: string;
  asOf: string;
  source: string;
  country?: string;
};

export type HistoryBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type NewsItem = {
  id: string;
  title: string;
  summary?: string;
  publisher?: string;
  link?: string;
  publishedAt?: string;
  tickers: string[];
  source: string;
};

export type FundamentalsSnapshot = {
  ticker: string;
  asOf: string;
  source: string;
  marketCap?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
  epsTrailing?: number | null;
  dividendYield?: number | null;
  profitMargins?: number | null;
  revenueGrowth?: number | null;
  earningsGrowth?: number | null;
  returnOnEquity?: number | null;
  debtToEquity?: number | null;
  sector?: string | null;
  industry?: string | null;
  longBusinessSummary?: string | null;
  raw?: Record<string, unknown>;
};

export interface MarketDataProvider {
  readonly name: string;
  getQuotes(symbols: string[]): Promise<NormalizedSecurityQuote[]>;
  getHistory(symbol: string, range: string): Promise<{ symbol: string; source: string; bars: HistoryBar[] }>;
  getFundamentals(symbol: string): Promise<FundamentalsSnapshot | null>;
  getFinancials(symbol: string): Promise<Record<string, unknown> | null>;
  getNews(query?: string, tickers?: string[]): Promise<NewsItem[]>;
  getOwnership(symbol: string): Promise<Record<string, unknown> | null>;
}
