export type UniverseSymbol = {
  yahooSymbol: string;
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  assetType: 'Equity' | 'Commodity' | 'Crypto' | 'Bond' | 'Index' | 'ETF' | 'Other';
  currency: string;
  country: string;
};

/** Curated US + India universe. Quotes are fetched live from Yahoo Finance — nothing is fabricated here. */
export const UNIVERSE: UniverseSymbol[] = [
  // US equities
  { yahooSymbol: 'AAPL', ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', sector: 'Technology', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'MSFT', ticker: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', sector: 'Technology', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'GOOGL', ticker: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', sector: 'Technology', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'AMZN', ticker: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', sector: 'Consumer', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'NVDA', ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', sector: 'Technology', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'META', ticker: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', sector: 'Technology', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'JPM', ticker: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', sector: 'Financials', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'JNJ', ticker: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', sector: 'Healthcare', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'XOM', ticker: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE', sector: 'Energy', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'TSLA', ticker: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', sector: 'Automotive', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'V', ticker: 'V', name: 'Visa Inc.', exchange: 'NYSE', sector: 'Financials', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'UNH', ticker: 'UNH', name: 'UnitedHealth Group', exchange: 'NYSE', sector: 'Healthcare', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'HD', ticker: 'HD', name: 'The Home Depot Inc.', exchange: 'NYSE', sector: 'Consumer', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'PG', ticker: 'PG', name: 'Procter & Gamble Co.', exchange: 'NYSE', sector: 'Consumer', assetType: 'Equity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'BAC', ticker: 'BAC', name: 'Bank of America Corp.', exchange: 'NYSE', sector: 'Financials', assetType: 'Equity', currency: 'USD', country: 'US' },
  // India equities (NSE)
  { yahooSymbol: 'RELIANCE.NS', ticker: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', sector: 'Energy', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'TCS.NS', ticker: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', sector: 'Technology', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'INFY.NS', ticker: 'INFY', name: 'Infosys Limited', exchange: 'NSE', sector: 'Technology', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'HDFCBANK.NS', ticker: 'HDFCBANK', name: 'HDFC Bank Limited', exchange: 'NSE', sector: 'Financials', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'ICICIBANK.NS', ticker: 'ICICIBANK', name: 'ICICI Bank Limited', exchange: 'NSE', sector: 'Financials', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'SBIN.NS', ticker: 'SBIN', name: 'State Bank of India', exchange: 'NSE', sector: 'Financials', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'BHARTIARTL.NS', ticker: 'BHARTIARTL', name: 'Bharti Airtel Limited', exchange: 'NSE', sector: 'Telecom', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'ITC.NS', ticker: 'ITC', name: 'ITC Limited', exchange: 'NSE', sector: 'Consumer', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'LT.NS', ticker: 'LT', name: 'Larsen & Toubro Limited', exchange: 'NSE', sector: 'Industrials', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'AXISBANK.NS', ticker: 'AXISBANK', name: 'Axis Bank Limited', exchange: 'NSE', sector: 'Financials', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'MARUTI.NS', ticker: 'MARUTI', name: 'Maruti Suzuki India Ltd', exchange: 'NSE', sector: 'Automotive', assetType: 'Equity', currency: 'INR', country: 'IN' },
  { yahooSymbol: 'SUNPHARMA.NS', ticker: 'SUNPHARMA', name: 'Sun Pharmaceutical Industries', exchange: 'NSE', sector: 'Healthcare', assetType: 'Equity', currency: 'INR', country: 'IN' },
  // Cross-asset
  { yahooSymbol: 'GC=F', ticker: 'GC', name: 'Gold Futures', exchange: 'COMEX', sector: 'Commodities', assetType: 'Commodity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'CL=F', ticker: 'CL', name: 'Crude Oil Futures', exchange: 'NYMEX', sector: 'Energy', assetType: 'Commodity', currency: 'USD', country: 'US' },
  { yahooSymbol: 'BTC-USD', ticker: 'BTC', name: 'Bitcoin USD', exchange: 'CCC', sector: 'Crypto', assetType: 'Crypto', currency: 'USD', country: 'GLOBAL' },
  { yahooSymbol: 'ETH-USD', ticker: 'ETH', name: 'Ethereum USD', exchange: 'CCC', sector: 'Crypto', assetType: 'Crypto', currency: 'USD', country: 'GLOBAL' },
  // Indices (for Market Brain / Markets — only shown if Yahoo returns data)
  { yahooSymbol: '^GSPC', ticker: 'SPX', name: 'S&P 500', exchange: 'INDEX', sector: 'Index', assetType: 'Index', currency: 'USD', country: 'US' },
  { yahooSymbol: '^NSEI', ticker: 'NIFTY', name: 'NIFTY 50', exchange: 'NSE', sector: 'Index', assetType: 'Index', currency: 'INR', country: 'IN' },
  { yahooSymbol: '^BSESN', ticker: 'SENSEX', name: 'S&P BSE SENSEX', exchange: 'BSE', sector: 'Index', assetType: 'Index', currency: 'INR', country: 'IN' },
  { yahooSymbol: '^VIX', ticker: 'VIX', name: 'CBOE Volatility Index', exchange: 'CBOE', sector: 'Index', assetType: 'Index', currency: 'USD', country: 'US' },
];
