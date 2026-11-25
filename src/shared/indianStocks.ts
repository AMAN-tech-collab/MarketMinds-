export interface StockCatalogEntry {
  symbol: string;
  bseCode: string;
  name: string;
  sector: string;
  exchange: 'NSE' | 'BSE';
}

export const INDIAN_STOCK_CATALOG: StockCatalogEntry[] = [
  { symbol: 'RELIANCE', bseCode: '500325', name: 'Reliance Industries Ltd.', sector: 'Energy', exchange: 'NSE' },
  { symbol: 'TCS', bseCode: '532540', name: 'Tata Consultancy Services Ltd.', sector: 'IT', exchange: 'NSE' },
  { symbol: 'HDFCBANK', bseCode: '500180', name: 'HDFC Bank Ltd.', sector: 'Banking', exchange: 'NSE' },
  { symbol: 'ICICIBANK', bseCode: '532174', name: 'ICICI Bank Ltd.', sector: 'Banking', exchange: 'NSE' },
  { symbol: 'INFY', bseCode: '500209', name: 'Infosys Ltd.', sector: 'IT', exchange: 'NSE' },
  { symbol: 'BHARTIARTL', bseCode: '532454', name: 'Bharti Airtel Ltd.', sector: 'Telecom', exchange: 'NSE' },
  { symbol: 'SBIN', bseCode: '500112', name: 'State Bank of India', sector: 'Banking', exchange: 'NSE' },
  { symbol: 'ITC', bseCode: '500875', name: 'ITC Ltd.', sector: 'FMCG', exchange: 'NSE' },
  { symbol: 'LT', bseCode: '500510', name: 'Larsen & Toubro Ltd.', sector: 'Infrastructure', exchange: 'NSE' },
  { symbol: 'HINDUNILVR', bseCode: '500696', name: 'Hindustan Unilever Ltd.', sector: 'FMCG', exchange: 'NSE' },
  { symbol: 'KOTAKBANK', bseCode: '500247', name: 'Kotak Mahindra Bank Ltd.', sector: 'Banking', exchange: 'NSE' },
  { symbol: 'AXISBANK', bseCode: '532215', name: 'Axis Bank Ltd.', sector: 'Banking', exchange: 'NSE' },
  { symbol: 'BAJFINANCE', bseCode: '500034', name: 'Bajaj Finance Ltd.', sector: 'Financials', exchange: 'NSE' },
  { symbol: 'MARUTI', bseCode: '532500', name: 'Maruti Suzuki India Ltd.', sector: 'Auto', exchange: 'NSE' },
  { symbol: 'SUNPHARMA', bseCode: '524715', name: 'Sun Pharmaceutical Industries', sector: 'Pharma', exchange: 'NSE' },
  { symbol: 'TATAMOTORS', bseCode: '500570', name: 'Tata Motors Ltd.', sector: 'Auto', exchange: 'NSE' },
  { symbol: 'TATASTEEL', bseCode: '500470', name: 'Tata Steel Ltd.', sector: 'Metals', exchange: 'NSE' },
  { symbol: 'TITAN', bseCode: '500114', name: 'Titan Company Ltd.', sector: 'Consumer', exchange: 'NSE' },
  { symbol: 'ASIANPAINT', bseCode: '500820', name: 'Asian Paints Ltd.', sector: 'Consumer', exchange: 'NSE' },
  { symbol: 'WIPRO', bseCode: '507685', name: 'Wipro Ltd.', sector: 'IT', exchange: 'NSE' },
  { symbol: 'HCLTECH', bseCode: '532281', name: 'HCL Technologies Ltd.', sector: 'IT', exchange: 'NSE' },
  { symbol: 'TECHM', bseCode: '532755', name: 'Tech Mahindra Ltd.', sector: 'IT', exchange: 'NSE' },
  { symbol: 'NTPC', bseCode: '532555', name: 'NTPC Ltd.', sector: 'Energy', exchange: 'NSE' },
  { symbol: 'POWERGRID', bseCode: '532898', name: 'Power Grid Corp. of India', sector: 'Energy', exchange: 'NSE' },
  { symbol: 'ONGC', bseCode: '500312', name: 'Oil & Natural Gas Corp.', sector: 'Energy', exchange: 'NSE' },
  { symbol: 'COALINDIA', bseCode: '533278', name: 'Coal India Ltd.', sector: 'Metals', exchange: 'NSE' },
  { symbol: 'ADANIENT', bseCode: '512599', name: 'Adani Enterprises Ltd.', sector: 'Infrastructure', exchange: 'NSE' },
  { symbol: 'ADANIPORTS', bseCode: '532921', name: 'Adani Ports & SEZ Ltd.', sector: 'Infrastructure', exchange: 'NSE' },
  { symbol: 'M&M', bseCode: '500520', name: 'Mahindra & Mahindra Ltd.', sector: 'Auto', exchange: 'NSE' },
  { symbol: 'ULTRACEMCO', bseCode: '532538', name: 'UltraTech Cement Ltd.', sector: 'Materials', exchange: 'NSE' },
  { symbol: 'JSWSTEEL', bseCode: '500228', name: 'JSW Steel Ltd.', sector: 'Metals', exchange: 'NSE' },
  { symbol: 'DRREDDY', bseCode: '500124', name: 'Dr. Reddys Laboratories Ltd.', sector: 'Pharma', exchange: 'NSE' },
  { symbol: 'CIPLA', bseCode: '500087', name: 'Cipla Ltd.', sector: 'Pharma', exchange: 'NSE' },
  { symbol: 'BAJAJFINSV', bseCode: '532978', name: 'Bajaj Finserv Ltd.', sector: 'Financials', exchange: 'NSE' },
  { symbol: 'BEL', bseCode: '500049', name: 'Bharat Electronics Ltd.', sector: 'Defence', exchange: 'NSE' },
  { symbol: 'HAL', bseCode: '541154', name: 'Hindustan Aeronautics Ltd.', sector: 'Defence', exchange: 'NSE' },
  { symbol: 'TRENT', bseCode: '500251', name: 'Trent Ltd.', sector: 'Consumer', exchange: 'NSE' },
  { symbol: 'DLF', bseCode: '532868', name: 'DLF Ltd.', sector: 'Real Estate', exchange: 'NSE' },
  { symbol: 'IRCTC', bseCode: '542830', name: 'Indian Railway Catering & Tourism', sector: 'Consumer', exchange: 'NSE' },
  { symbol: 'INDUSINDBK', bseCode: '532187', name: 'IndusInd Bank Ltd.', sector: 'Banking', exchange: 'NSE' },
];

export const MARKET_INDICES = [
  { key: 'NIFTY50', yahooSymbol: '^NSEI', name: 'NIFTY 50', exchange: 'NSE' },
  { key: 'SENSEX', yahooSymbol: '^BSESN', name: 'BSE SENSEX', exchange: 'BSE' },
  { key: 'BANKNIFTY', yahooSymbol: '^NSEBANK', name: 'BANK NIFTY', exchange: 'NSE' },
  { key: 'NIFTYIT', yahooSymbol: '^CNXIT', name: 'NIFTY IT', exchange: 'NSE' },
] as const;

export function findCatalogStock(query: string): StockCatalogEntry | undefined {
  const normalized = query.trim().toUpperCase().replace(/\.(NS|BO)$/i, '');
  return INDIAN_STOCK_CATALOG.find(
    (s) =>
      s.symbol === normalized ||
      s.bseCode === normalized ||
      s.name.toUpperCase() === normalized
  );
}

export function searchCatalogStocks(query: string): StockCatalogEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return INDIAN_STOCK_CATALOG;
  return INDIAN_STOCK_CATALOG.filter(
    (s) =>
      s.symbol.includes(q) ||
      s.bseCode.includes(q) ||
      s.name.toUpperCase().includes(q) ||
      s.sector.toUpperCase().includes(q)
  );
}
