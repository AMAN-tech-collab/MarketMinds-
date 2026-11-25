import { INDIAN_STOCK_CATALOG } from './indianStocks.ts';

export type GlobalRegion = 'North America' | 'Europe' | 'Asia-Pacific' | 'India';

export type ExchangeCode =
  | 'NASDAQ'
  | 'NYSE'
  | 'AMEX'
  | 'NSE'
  | 'BSE'
  | 'LSE'
  | 'TSE'
  | 'HKEX'
  | 'SSE'
  | 'SZSE'
  | 'TSX'
  | 'XETRA'
  | 'EPA'
  | 'ASX'
  | 'KRX'
  | 'SGX';

export interface ExchangeInfo {
  code: ExchangeCode;
  name: string;
  country: string;
  countryCode: string;
  region: GlobalRegion;
  currency: string;
  currencySymbol: string;
  yahooSuffix: string;
  timeZone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  hoursLabel: string;
}

export const GLOBAL_EXCHANGES: Record<ExchangeCode, ExchangeInfo> = {
  NASDAQ: {
    code: 'NASDAQ',
    name: 'NASDAQ Stock Market',
    country: 'United States',
    countryCode: 'US',
    region: 'North America',
    currency: 'USD',
    currencySymbol: '$',
    yahooSuffix: '',
    timeZone: 'America/New_York',
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
    hoursLabel: '09:30 – 16:00 ET',
  },
  NYSE: {
    code: 'NYSE',
    name: 'New York Stock Exchange',
    country: 'United States',
    countryCode: 'US',
    region: 'North America',
    currency: 'USD',
    currencySymbol: '$',
    yahooSuffix: '',
    timeZone: 'America/New_York',
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
    hoursLabel: '09:30 – 16:00 ET',
  },
  AMEX: {
    code: 'AMEX',
    name: 'NYSE American (AMEX)',
    country: 'United States',
    countryCode: 'US',
    region: 'North America',
    currency: 'USD',
    currencySymbol: '$',
    yahooSuffix: '',
    timeZone: 'America/New_York',
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
    hoursLabel: '09:30 – 16:00 ET',
  },
  NSE: {
    code: 'NSE',
    name: 'National Stock Exchange of India',
    country: 'India',
    countryCode: 'IN',
    region: 'India',
    currency: 'INR',
    currencySymbol: '₹',
    yahooSuffix: '.NS',
    timeZone: 'Asia/Kolkata',
    openHour: 9,
    openMinute: 15,
    closeHour: 15,
    closeMinute: 30,
    hoursLabel: '09:15 – 15:30 IST',
  },
  BSE: {
    code: 'BSE',
    name: 'Bombay Stock Exchange',
    country: 'India',
    countryCode: 'IN',
    region: 'India',
    currency: 'INR',
    currencySymbol: '₹',
    yahooSuffix: '.BO',
    timeZone: 'Asia/Kolkata',
    openHour: 9,
    openMinute: 15,
    closeHour: 15,
    closeMinute: 30,
    hoursLabel: '09:15 – 15:30 IST',
  },
  LSE: {
    code: 'LSE',
    name: 'London Stock Exchange',
    country: 'United Kingdom',
    countryCode: 'GB',
    region: 'Europe',
    currency: 'GBP',
    currencySymbol: '£',
    yahooSuffix: '.L',
    timeZone: 'Europe/London',
    openHour: 8,
    openMinute: 0,
    closeHour: 16,
    closeMinute: 30,
    hoursLabel: '08:00 – 16:30 GMT/BST',
  },
  TSE: {
    code: 'TSE',
    name: 'Tokyo Stock Exchange',
    country: 'Japan',
    countryCode: 'JP',
    region: 'Asia-Pacific',
    currency: 'JPY',
    currencySymbol: '¥',
    yahooSuffix: '.T',
    timeZone: 'Asia/Tokyo',
    openHour: 9,
    openMinute: 0,
    closeHour: 15,
    closeMinute: 30,
    hoursLabel: '09:00 – 15:30 JST',
  },
  HKEX: {
    code: 'HKEX',
    name: 'Hong Kong Exchanges',
    country: 'Hong Kong',
    countryCode: 'HK',
    region: 'Asia-Pacific',
    currency: 'HKD',
    currencySymbol: 'HK$',
    yahooSuffix: '.HK',
    timeZone: 'Asia/Hong_Kong',
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
    hoursLabel: '09:30 – 16:00 HKT',
  },
  SSE: {
    code: 'SSE',
    name: 'Shanghai Stock Exchange',
    country: 'China',
    countryCode: 'CN',
    region: 'Asia-Pacific',
    currency: 'CNY',
    currencySymbol: '¥',
    yahooSuffix: '.SS',
    timeZone: 'Asia/Shanghai',
    openHour: 9,
    openMinute: 30,
    closeHour: 15,
    closeMinute: 0,
    hoursLabel: '09:30 – 15:00 CST',
  },
  SZSE: {
    code: 'SZSE',
    name: 'Shenzhen Stock Exchange',
    country: 'China',
    countryCode: 'CN',
    region: 'Asia-Pacific',
    currency: 'CNY',
    currencySymbol: '¥',
    yahooSuffix: '.SZ',
    timeZone: 'Asia/Shanghai',
    openHour: 9,
    openMinute: 30,
    closeHour: 15,
    closeMinute: 0,
    hoursLabel: '09:30 – 15:00 CST',
  },
  TSX: {
    code: 'TSX',
    name: 'Toronto Stock Exchange',
    country: 'Canada',
    countryCode: 'CA',
    region: 'North America',
    currency: 'CAD',
    currencySymbol: 'C$',
    yahooSuffix: '.TO',
    timeZone: 'America/Toronto',
    openHour: 9,
    openMinute: 30,
    closeHour: 16,
    closeMinute: 0,
    hoursLabel: '09:30 – 16:00 ET',
  },
  XETRA: {
    code: 'XETRA',
    name: 'Deutsche Börse XETRA / Frankfurt',
    country: 'Germany',
    countryCode: 'DE',
    region: 'Europe',
    currency: 'EUR',
    currencySymbol: '€',
    yahooSuffix: '.DE',
    timeZone: 'Europe/Berlin',
    openHour: 9,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 30,
    hoursLabel: '09:00 – 17:30 CET',
  },
  EPA: {
    code: 'EPA',
    name: 'Euronext Paris',
    country: 'France',
    countryCode: 'FR',
    region: 'Europe',
    currency: 'EUR',
    currencySymbol: '€',
    yahooSuffix: '.PA',
    timeZone: 'Europe/Paris',
    openHour: 9,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 30,
    hoursLabel: '09:00 – 17:30 CET',
  },
  ASX: {
    code: 'ASX',
    name: 'Australian Securities Exchange',
    country: 'Australia',
    countryCode: 'AU',
    region: 'Asia-Pacific',
    currency: 'AUD',
    currencySymbol: 'A$',
    yahooSuffix: '.AX',
    timeZone: 'Australia/Sydney',
    openHour: 10,
    openMinute: 0,
    closeHour: 16,
    closeMinute: 0,
    hoursLabel: '10:00 – 16:00 AEST',
  },
  KRX: {
    code: 'KRX',
    name: 'Korea Exchange',
    country: 'South Korea',
    countryCode: 'KR',
    region: 'Asia-Pacific',
    currency: 'KRW',
    currencySymbol: '₩',
    yahooSuffix: '.KS',
    timeZone: 'Asia/Seoul',
    openHour: 9,
    openMinute: 0,
    closeHour: 15,
    closeMinute: 30,
    hoursLabel: '09:00 – 15:30 KST',
  },
  SGX: {
    code: 'SGX',
    name: 'Singapore Exchange',
    country: 'Singapore',
    countryCode: 'SG',
    region: 'Asia-Pacific',
    currency: 'SGD',
    currencySymbol: 'S$',
    yahooSuffix: '.SI',
    timeZone: 'Asia/Singapore',
    openHour: 9,
    openMinute: 0,
    closeHour: 17,
    closeMinute: 0,
    hoursLabel: '09:00 – 17:00 SGT',
  },
};

export const EXCHANGE_LIST: ExchangeInfo[] = Object.values(GLOBAL_EXCHANGES);

export const SUPPORTED_CURRENCIES = [
  'USD',
  'INR',
  'EUR',
  'GBP',
  'JPY',
  'HKD',
  'CNY',
  'CAD',
  'AUD',
  'KRW',
  'SGD',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface GlobalIndexSpec {
  key: string;
  name: string;
  yahooSymbol: string;
  exchange: ExchangeCode;
  country: string;
  region: GlobalRegion;
  currency: string;
}

export const GLOBAL_INDICES: GlobalIndexSpec[] = [
  // North America
  { key: 'SP500', name: 'S&P 500', yahooSymbol: '^GSPC', exchange: 'NYSE', country: 'United States', region: 'North America', currency: 'USD' },
  { key: 'NASDAQ', name: 'NASDAQ Composite', yahooSymbol: '^IXIC', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD' },
  { key: 'DOW', name: 'Dow Jones', yahooSymbol: '^DJI', exchange: 'NYSE', country: 'United States', region: 'North America', currency: 'USD' },
  // Europe
  { key: 'FTSE100', name: 'FTSE 100', yahooSymbol: '^FTSE', exchange: 'LSE', country: 'United Kingdom', region: 'Europe', currency: 'GBP' },
  { key: 'DAX', name: 'DAX', yahooSymbol: '^GDAXI', exchange: 'XETRA', country: 'Germany', region: 'Europe', currency: 'EUR' },
  { key: 'CAC40', name: 'CAC 40', yahooSymbol: '^FCHI', exchange: 'EPA', country: 'France', region: 'Europe', currency: 'EUR' },
  // Asia-Pacific
  { key: 'NIKKEI225', name: 'Nikkei 225', yahooSymbol: '^N225', exchange: 'TSE', country: 'Japan', region: 'Asia-Pacific', currency: 'JPY' },
  { key: 'HANGSENG', name: 'Hang Seng', yahooSymbol: '^HSI', exchange: 'HKEX', country: 'Hong Kong', region: 'Asia-Pacific', currency: 'HKD' },
  { key: 'ASX200', name: 'ASX 200', yahooSymbol: '^AXJO', exchange: 'ASX', country: 'Australia', region: 'Asia-Pacific', currency: 'AUD' },
  { key: 'KOSPI', name: 'KOSPI', yahooSymbol: '^KS11', exchange: 'KRX', country: 'South Korea', region: 'Asia-Pacific', currency: 'KRW' },
  // India
  { key: 'NIFTY50', name: 'NIFTY 50', yahooSymbol: '^NSEI', exchange: 'NSE', country: 'India', region: 'India', currency: 'INR' },
  { key: 'SENSEX', name: 'SENSEX', yahooSymbol: '^BSESN', exchange: 'BSE', country: 'India', region: 'India', currency: 'INR' },
  { key: 'BANKNIFTY', name: 'BANK NIFTY', yahooSymbol: '^NSEBANK', exchange: 'NSE', country: 'India', region: 'India', currency: 'INR' },
  { key: 'NIFTYIT', name: 'NIFTY IT', yahooSymbol: '^CNXIT', exchange: 'NSE', country: 'India', region: 'India', currency: 'INR' },
];

export interface GlobalStockEntry {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: ExchangeCode;
  country: string;
  region: GlobalRegion;
  currency: string;
  sector: string;
  isin?: string;
  bseCode?: string;
  trending?: boolean;
  popular?: boolean;
}

const INTERNATIONAL_EQUITIES: GlobalStockEntry[] = [
  // United States — NASDAQ / NYSE / AMEX
  { symbol: 'AAPL', yahooSymbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Technology', isin: 'US0378331005', trending: true, popular: true },
  { symbol: 'MSFT', yahooSymbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Technology', isin: 'US5949181045', trending: true, popular: true },
  { symbol: 'NVDA', yahooSymbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Semiconductors', isin: 'US67066G1040', trending: true, popular: true },
  { symbol: 'TSLA', yahooSymbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Automobile', isin: 'US88160R1014', trending: true, popular: true },
  { symbol: 'AMZN', yahooSymbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Consumer Retail', isin: 'US0231351067', trending: true, popular: true },
  { symbol: 'GOOGL', yahooSymbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Technology', isin: 'US02079K3059', popular: true },
  { symbol: 'META', yahooSymbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Technology', isin: 'US30303M1027', popular: true },
  { symbol: 'AMD', yahooSymbol: 'AMD', name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ', country: 'United States', region: 'North America', currency: 'USD', sector: 'Semiconductors', isin: 'US0079031078', trending: true },
  { symbol: 'JPM', yahooSymbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', country: 'United States', region: 'North America', currency: 'USD', sector: 'Banking', isin: 'US46625H1005', popular: true },
  { symbol: 'V', yahooSymbol: 'V', name: 'Visa Inc.', exchange: 'NYSE', country: 'United States', region: 'North America', currency: 'USD', sector: 'Financial Services', isin: 'US92826C8394' },
  { symbol: 'JNJ', yahooSymbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', country: 'United States', region: 'North America', currency: 'USD', sector: 'Healthcare', isin: 'US4781601046' },
  { symbol: 'XOM', yahooSymbol: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE', country: 'United States', region: 'North America', currency: 'USD', sector: 'Energy', isin: 'US30231G1022' },
  { symbol: 'GSAT', yahooSymbol: 'GSAT', name: 'Globalstar Inc.', exchange: 'AMEX', country: 'United States', region: 'North America', currency: 'USD', sector: 'Telecom', isin: 'US3789734080' },

  // United Kingdom — LSE
  { symbol: 'HSBA', yahooSymbol: 'HSBA.L', name: 'HSBC Holdings plc', exchange: 'LSE', country: 'United Kingdom', region: 'Europe', currency: 'GBP', sector: 'Banking', isin: 'GB0005405286', trending: true, popular: true },
  { symbol: 'SHEL', yahooSymbol: 'SHEL.L', name: 'Shell plc', exchange: 'LSE', country: 'United Kingdom', region: 'Europe', currency: 'GBP', sector: 'Energy', isin: 'GB00BP6MXD84', popular: true },
  { symbol: 'AZN', yahooSymbol: 'AZN.L', name: 'AstraZeneca plc', exchange: 'LSE', country: 'United Kingdom', region: 'Europe', currency: 'GBP', sector: 'Healthcare', isin: 'GB0009895292' },
  { symbol: 'ULVR', yahooSymbol: 'ULVR.L', name: 'Unilever plc', exchange: 'LSE', country: 'United Kingdom', region: 'Europe', currency: 'GBP', sector: 'FMCG', isin: 'GB00B10RZP78' },

  // Germany — XETRA / Frankfurt
  { symbol: 'SAP', yahooSymbol: 'SAP.DE', name: 'SAP SE', exchange: 'XETRA', country: 'Germany', region: 'Europe', currency: 'EUR', sector: 'Technology', isin: 'DE0007164600', popular: true },
  { symbol: 'SIE', yahooSymbol: 'SIE.DE', name: 'Siemens AG', exchange: 'XETRA', country: 'Germany', region: 'Europe', currency: 'EUR', sector: 'Industrials', isin: 'DE0007236101' },
  { symbol: 'ALV', yahooSymbol: 'ALV.DE', name: 'Allianz SE', exchange: 'XETRA', country: 'Germany', region: 'Europe', currency: 'EUR', sector: 'Financial Services', isin: 'DE0008404005' },

  // France — Euronext Paris
  { symbol: 'MC', yahooSymbol: 'MC.PA', name: 'LVMH Moët Hennessy Louis Vuitton', exchange: 'EPA', country: 'France', region: 'Europe', currency: 'EUR', sector: 'Consumer Luxury', isin: 'FR0000121014', popular: true },
  { symbol: 'OR', yahooSymbol: 'OR.PA', name: "L'Oréal S.A.", exchange: 'EPA', country: 'France', region: 'Europe', currency: 'EUR', sector: 'Consumer Goods', isin: 'FR0000120321' },
  { symbol: 'TTE', yahooSymbol: 'TTE.PA', name: 'TotalEnergies SE', exchange: 'EPA', country: 'France', region: 'Europe', currency: 'EUR', sector: 'Energy', isin: 'FR0000120271' },

  // Japan — TSE
  { symbol: '7203', yahooSymbol: '7203.T', name: 'Toyota Motor Corporation', exchange: 'TSE', country: 'Japan', region: 'Asia-Pacific', currency: 'JPY', sector: 'Automobile', isin: 'JP3633400001', trending: true, popular: true },
  { symbol: '6758', yahooSymbol: '6758.T', name: 'Sony Group Corporation', exchange: 'TSE', country: 'Japan', region: 'Asia-Pacific', currency: 'JPY', sector: 'Technology', isin: 'JP3435000009', popular: true },
  { symbol: '9984', yahooSymbol: '9984.T', name: 'SoftBank Group Corp.', exchange: 'TSE', country: 'Japan', region: 'Asia-Pacific', currency: 'JPY', sector: 'Telecom & Tech', isin: 'JP3436100006' },

  // South Korea — KRX
  { symbol: '005930', yahooSymbol: '005930.KS', name: 'Samsung Electronics Co. Ltd.', exchange: 'KRX', country: 'South Korea', region: 'Asia-Pacific', currency: 'KRW', sector: 'Semiconductors', isin: 'KR7005930003', trending: true, popular: true },
  { symbol: '000660', yahooSymbol: '000660.KS', name: 'SK Hynix Inc.', exchange: 'KRX', country: 'South Korea', region: 'Asia-Pacific', currency: 'KRW', sector: 'Semiconductors', isin: 'KR7000660001' },

  // Hong Kong — HKEX
  { symbol: '0700', yahooSymbol: '0700.HK', name: 'Tencent Holdings Limited', exchange: 'HKEX', country: 'Hong Kong', region: 'Asia-Pacific', currency: 'HKD', sector: 'Technology', isin: 'KYG875721634', popular: true },
  { symbol: '9988', yahooSymbol: '9988.HK', name: 'Alibaba Group Holding Ltd.', exchange: 'HKEX', country: 'Hong Kong', region: 'Asia-Pacific', currency: 'HKD', sector: 'Consumer Retail', isin: 'KYG017191142' },
  { symbol: '1299', yahooSymbol: '1299.HK', name: 'AIA Group Limited', exchange: 'HKEX', country: 'Hong Kong', region: 'Asia-Pacific', currency: 'HKD', sector: 'Financial Services', isin: 'HK0000069689' },

  // China — SSE & SZSE
  { symbol: '600519', yahooSymbol: '600519.SS', name: 'Kweichow Moutai Co. Ltd.', exchange: 'SSE', country: 'China', region: 'Asia-Pacific', currency: 'CNY', sector: 'Consumer Goods', isin: 'CNE0000018R8' },
  { symbol: '601318', yahooSymbol: '601318.SS', name: 'Ping An Insurance Group', exchange: 'SSE', country: 'China', region: 'Asia-Pacific', currency: 'CNY', sector: 'Financial Services', isin: 'CNE000001R84' },
  { symbol: '000858', yahooSymbol: '000858.SZ', name: 'Wuliangye Yibin Co. Ltd.', exchange: 'SZSE', country: 'China', region: 'Asia-Pacific', currency: 'CNY', sector: 'Consumer Goods', isin: 'CNE000000VQ8' },

  // Canada — TSX
  { symbol: 'RY', yahooSymbol: 'RY.TO', name: 'Royal Bank of Canada', exchange: 'TSX', country: 'Canada', region: 'North America', currency: 'CAD', sector: 'Banking', isin: 'CA7800871021', popular: true },
  { symbol: 'SHOP', yahooSymbol: 'SHOP.TO', name: 'Shopify Inc.', exchange: 'TSX', country: 'Canada', region: 'North America', currency: 'CAD', sector: 'Technology', isin: 'CA82509L1076' },
  { symbol: 'TD', yahooSymbol: 'TD.TO', name: 'Toronto-Dominion Bank', exchange: 'TSX', country: 'Canada', region: 'North America', currency: 'CAD', sector: 'Banking', isin: 'CA8911605092' },

  // Australia — ASX
  { symbol: 'BHP', yahooSymbol: 'BHP.AX', name: 'BHP Group Limited', exchange: 'ASX', country: 'Australia', region: 'Asia-Pacific', currency: 'AUD', sector: 'Metals & Mining', isin: 'AU000000BHP4', popular: true },
  { symbol: 'CBA', yahooSymbol: 'CBA.AX', name: 'Commonwealth Bank of Australia', exchange: 'ASX', country: 'Australia', region: 'Asia-Pacific', currency: 'AUD', sector: 'Banking', isin: 'AU000000CBA7' },

  // Singapore — SGX
  { symbol: 'D05', yahooSymbol: 'D05.SI', name: 'DBS Group Holdings Ltd', exchange: 'SGX', country: 'Singapore', region: 'Asia-Pacific', currency: 'SGD', sector: 'Banking', isin: 'SG1L01001701', popular: true },
  { symbol: 'O39', yahooSymbol: 'O39.SI', name: 'Oversea-Chinese Banking Corp', exchange: 'SGX', country: 'Singapore', region: 'Asia-Pacific', currency: 'SGD', sector: 'Banking', isin: 'SG1S04926220' },
];

const INDIAN_GLOBAL_ENTRIES: GlobalStockEntry[] = INDIAN_STOCK_CATALOG.map((s, idx) => ({
  symbol: s.symbol,
  yahooSymbol: `${s.symbol}.NS`,
  name: s.name,
  exchange: 'NSE',
  country: 'India',
  region: 'India',
  currency: 'INR',
  sector: s.sector,
  bseCode: s.bseCode,
  trending: idx < 5,
  popular: idx < 8,
}));

export const GLOBAL_STOCK_CATALOG: GlobalStockEntry[] = [
  ...INTERNATIONAL_EQUITIES,
  ...INDIAN_GLOBAL_ENTRIES,
];

export const GLOBAL_COUNTRIES: string[] = Array.from(
  new Set(EXCHANGE_LIST.map((e) => e.country))
).sort();

export function isExchangeCode(val: string): val is ExchangeCode {
  return val.toUpperCase() in GLOBAL_EXCHANGES;
}

export function normalizeExchangeCode(raw?: string | null): ExchangeCode {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'NSI' || upper === 'NSE') return 'NSE';
  if (upper === 'BOM' || upper === 'BSE') return 'BSE';
  if (upper === 'NMS' || upper === 'NGM' || upper === 'NCM' || upper === 'NASDAQ') return 'NASDAQ';
  if (upper === 'NYQ' || upper === 'NYSE') return 'NYSE';
  if (upper === 'ASE' || upper === 'AMEX') return 'AMEX';
  if (upper === 'LON' || upper === 'LSE') return 'LSE';
  if (upper === 'JPX' || upper === 'TYO' || upper === 'TSE') return 'TSE';
  if (upper === 'HKG' || upper === 'HKEX') return 'HKEX';
  if (upper === 'SHH' || upper === 'SSE') return 'SSE';
  if (upper === 'SHZ' || upper === 'SZSE') return 'SZSE';
  if (upper === 'TOR' || upper === 'TSX') return 'TSX';
  if (upper === 'GER' || upper === 'FRA' || upper === 'XETRA' || upper === 'FRANKFURT') return 'XETRA';
  if (upper === 'PAR' || upper === 'EPA' || upper === 'EURONEXT') return 'EPA';
  if (upper === 'ASX') return 'ASX';
  if (upper === 'KSC' || upper === 'KOE' || upper === 'KRX') return 'KRX';
  if (upper === 'SES' || upper === 'SGX') return 'SGX';
  return 'NSE';
}

export function inferExchangeFromYahooSymbol(yahooSymbol: string, fallback: ExchangeCode = 'NASDAQ'): ExchangeCode {
  const upper = yahooSymbol.trim().toUpperCase();
  if (upper.endsWith('.NS')) return 'NSE';
  if (upper.endsWith('.BO')) return 'BSE';
  if (upper.endsWith('.L')) return 'LSE';
  if (upper.endsWith('.T')) return 'TSE';
  if (upper.endsWith('.HK')) return 'HKEX';
  if (upper.endsWith('.SS')) return 'SSE';
  if (upper.endsWith('.SZ')) return 'SZSE';
  if (upper.endsWith('.TO')) return 'TSX';
  if (upper.endsWith('.DE') || upper.endsWith('.F')) return 'XETRA';
  if (upper.endsWith('.PA')) return 'EPA';
  if (upper.endsWith('.AX')) return 'ASX';
  if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return 'KRX';
  if (upper.endsWith('.SI')) return 'SGX';
  return fallback;
}

export function findGlobalCatalogStock(query: string, exchange?: string): GlobalStockEntry | undefined {
  const q = query.trim().toUpperCase();
  const stripped = q.replace(/\.(NS|BO|L|T|HK|SS|SZ|TO|DE|PA|AX|KS|SI)$/i, '');
  const normEx = exchange ? normalizeExchangeCode(exchange) : undefined;

  if (normEx) {
    const exactEx = GLOBAL_STOCK_CATALOG.find(
      (s) =>
        (s.symbol === stripped || s.yahooSymbol.toUpperCase() === q || s.bseCode === stripped || s.isin === q) &&
        (s.exchange === normEx || (normEx === 'BSE' && s.exchange === 'NSE' && Boolean(s.bseCode)))
    );
    if (exactEx) return exactEx;
  }

  return GLOBAL_STOCK_CATALOG.find(
    (s) =>
      s.yahooSymbol.toUpperCase() === q ||
      s.symbol === stripped ||
      s.bseCode === stripped ||
      s.isin === q
  );
}

export function searchGlobalCatalog(options: {
  q?: string;
  exchange?: string;
  country?: string;
  currency?: string;
}): GlobalStockEntry[] {
  const q = (options.q || '').trim().toUpperCase();
  const ex = options.exchange && options.exchange !== 'ALL' ? normalizeExchangeCode(options.exchange) : null;
  const country = options.country && options.country !== 'ALL' ? options.country.trim().toLowerCase() : null;
  const currency = options.currency && options.currency !== 'ALL' ? options.currency.trim().toUpperCase() : null;

  return GLOBAL_STOCK_CATALOG.filter((item) => {
    if (ex) {
      if (ex === 'BSE') {
        if (item.exchange !== 'BSE' && !(item.exchange === 'NSE' && item.bseCode)) return false;
      } else if (item.exchange !== ex) {
        return false;
      }
    }
    if (country && item.country.toLowerCase() !== country) return false;
    if (currency && item.currency.toUpperCase() !== currency) return false;
    if (!q) return true;
    return (
      item.symbol.toUpperCase().includes(q) ||
      item.yahooSymbol.toUpperCase().includes(q) ||
      item.name.toUpperCase().includes(q) ||
      item.exchange.toUpperCase().includes(q) ||
      item.country.toUpperCase().includes(q) ||
      item.sector.toUpperCase().includes(q) ||
      (item.isin && item.isin.toUpperCase().includes(q)) ||
      (item.bseCode && item.bseCode.includes(q))
    );
  });
}

export function getExchangeMarketStatus(exchangeCode: ExchangeCode): {
  exchange: ExchangeCode;
  status: 'OPEN' | 'PRE_OPEN' | 'CLOSED';
  label: string;
  localTime: string;
  timeZone: string;
  hoursLabel: string;
} {
  const info = GLOBAL_EXCHANGES[exchangeCode] || GLOBAL_EXCHANGES.NSE;
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: info.timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const weekday = get('weekday');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const mins = hour * 60 + minute;
  const openMins = info.openHour * 60 + info.openMinute;
  const closeMins = info.closeHour * 60 + info.closeMinute;
  const localTime = `${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`;

  if (weekday === 'Sat' || weekday === 'Sun') {
    return {
      exchange: info.code,
      status: 'CLOSED',
      label: 'Closed (Weekend)',
      localTime,
      timeZone: info.timeZone,
      hoursLabel: info.hoursLabel,
    };
  }
  if (mins >= openMins - 15 && mins < openMins) {
    return {
      exchange: info.code,
      status: 'PRE_OPEN',
      label: 'Pre-Open',
      localTime,
      timeZone: info.timeZone,
      hoursLabel: info.hoursLabel,
    };
  }
  if (mins >= openMins && mins <= closeMins) {
    return {
      exchange: info.code,
      status: 'OPEN',
      label: 'Open',
      localTime,
      timeZone: info.timeZone,
      hoursLabel: info.hoursLabel,
    };
  }
  return {
    exchange: info.code,
    status: 'CLOSED',
    label: 'Closed',
    localTime,
    timeZone: info.timeZone,
    hoursLabel: info.hoursLabel,
  };
}
