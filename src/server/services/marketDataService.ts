import {
  findCatalogStock,
  INDIAN_STOCK_CATALOG,
  MARKET_INDICES,
} from '../../shared/indianStocks.ts';
import {
  findGlobalCatalogStock,
  getExchangeMarketStatus,
  GLOBAL_EXCHANGES,
  GLOBAL_INDICES,
  GLOBAL_STOCK_CATALOG,
  inferExchangeFromYahooSymbol,
  isExchangeCode,
  normalizeExchangeCode,
  searchGlobalCatalog,
  type ExchangeCode,
  type GlobalRegion,
} from '../../shared/globalMarkets.ts';
import { env } from '../config/env.ts';
import { getFxRates } from './fxService.ts';
import { calcBeta, computeTechnicalAnalysis, extractDailyReturns } from './technicalIndicators.ts';

export interface OhlcvBar {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FinancialPeriodPoint {
  period: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  eps: number | null;
  profitMarginPct: number | null;
  revenueGrowthPct: number | null;
}

export interface StockFundamentals {
  // Company overview
  industry: string | null;
  businessSummary: string | null;
  website: string | null;
  fullTimeEmployees: number | null;
  sharesOutstanding: number | null;
  averageVolume: number | null;
  nextEarningsDate: string | null;
  // Valuation
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  eps: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  pegRatio: number | null;
  dividendYieldPct: number | null;
  // Income statement
  revenue: number | null;
  revenueGrowthPct: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  profitMarginPct: number | null;
  // Balance sheet
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalDebt: number | null;
  shareholdersEquity: number | null;
  cashAndEquivalents: number | null;
  debtToEquity: number | null;
  // Cash flow
  operatingCashFlow: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  freeCashFlow: number | null;
  // Profitability & returns
  roePct: number | null;
  roaPct: number | null;
  roicPct: number | null;
  earningsGrowthPct: number | null;
  beta: number | null;
  // Historical financial statements
  annualFinancials: FinancialPeriodPoint[];
  quarterlyFinancials: FinancialPeriodPoint[];
  currency: string;
  availableFieldsCount: number;
  dataSource: string;
  note: string;
}

export interface StockQuote {
  symbol: string;
  yahooSymbol: string;
  exchange: ExchangeCode;
  bseCode?: string;
  isin?: string;
  name: string;
  sector: string;
  country: string;
  region: GlobalRegion;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  eps: number | null;
  dividendYieldPct: number | null;
  dataSource: string;
  freshness: 'Delayed Exchange Feed' | 'End-of-Day' | 'Cached' | 'Unavailable';
  isLive: boolean;
  fetchedAt: string;
}

export type TimeframeKey = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'MAX';

export class MarketDataError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 503, code = 'MARKET_DATA_UNAVAILABLE') {
    super(message);
    this.name = 'MarketDataError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface MarketDataProviderAdapter {
  id: string;
  name: string;
  supportedExchanges: ExchangeCode[];
  fetchChart: (
    rawSymbol: string,
    timeframe: TimeframeKey,
    exchange?: string
  ) => Promise<{ quote: StockQuote; history: OhlcvBar[] }>;
}

const ALLOWED_YAHOO_HOSTS = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
]);

const SYMBOL_PATTERN = /^[A-Z0-9^.&=-]{1,28}$/;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  cachedAt: string;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();
let upstreamSuccessCount = 0;
let upstreamErrorCount = 0;
let lastSuccessfulFetchAt: string | null = null;

function dedupeInflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, p);
  return p;
}

function getCached<T>(key: string): { data: T; cachedAt: string } | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return { data: entry.data as T, cachedAt: entry.cachedAt };
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  if (responseCache.size > 600) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    cachedAt: new Date().toISOString(),
  });
}

export function getActiveProviderInfo() {
  return {
    activeProvider: 'Yahoo Finance Global Exchange Adapter',
    configuredMode: env.marketDataProvider,
    optionalProviders: {
      alphaVantageConfigured: Boolean(env.alphaVantageApiKey),
      finnhubConfigured: Boolean(env.finnhubApiKey),
    },
    cacheEntries: responseCache.size,
    inflightCount: inflightRequests.size,
    crumbSessionActive: Boolean(yahooCrumbCache && Date.now() < yahooCrumbCache.expiresAt),
    upstreamStats: {
      successCount: upstreamSuccessCount,
      errorCount: upstreamErrorCount,
      lastSuccessfulFetchAt,
    },
    freshnessNote:
      'Exchange quotes are sourced from Yahoo Finance public exchange endpoints (typically 15-minute delayed or end-of-day depending on exchange licensing).',
  };
}

export function getIndianMarketStatus(): {
  status: 'OPEN' | 'PRE_OPEN' | 'CLOSED';
  label: string;
  istTime: string;
  nextSessionNote: string;
} {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = istFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const weekday = getPart('weekday');
  const hour = Number(getPart('hour'));
  const minute = Number(getPart('minute'));
  const totalMinutes = hour * 60 + minute;
  const istTime = `${getPart('day')} ${getPart('month')} ${getPart('year')}, ${getPart('hour')}:${getPart('minute')} IST`;

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  if (isWeekend) {
    return {
      status: 'CLOSED',
      label: 'Market Closed (Weekend)',
      istTime,
      nextSessionNote: 'NSE & BSE regular session opens Monday 09:15 IST',
    };
  }
  if (totalMinutes >= 540 && totalMinutes < 555) {
    return {
      status: 'PRE_OPEN',
      label: 'Pre-Open Session',
      istTime,
      nextSessionNote: 'Continuous trading starts at 09:15 IST',
    };
  }
  if (totalMinutes >= 555 && totalMinutes <= 930) {
    return {
      status: 'OPEN',
      label: 'Market Open',
      istTime,
      nextSessionNote: 'NSE & BSE regular session closes at 15:30 IST',
    };
  }
  return {
    status: 'CLOSED',
    label: 'Market Closed',
    istTime,
    nextSessionNote: 'NSE & BSE regular hours: 09:15 – 15:30 IST (Mon–Fri)',
  };
}

export interface ResolvedGlobalSymbol {
  cleanSymbol: string;
  yahooSymbol: string;
  exchange: ExchangeCode;
  name: string;
  sector: string;
  country: string;
  region: GlobalRegion;
  currency: string;
  bseCode?: string;
  isin?: string;
}

const KNOWN_SUFFIX_RE = /\.(NS|BO|L|T|HK|SS|SZ|TO|DE|F|PA|AX|KS|KQ|SI)$/i;

export function resolveGlobalSymbol(
  rawSymbol: string,
  requestedExchange?: string
): ResolvedGlobalSymbol {
  const trimmed = rawSymbol.trim().toUpperCase();
  if (!trimmed || !SYMBOL_PATTERN.test(trimmed)) {
    throw new MarketDataError(
      `Invalid stock symbol "${rawSymbol}". Enter a valid ticker (e.g. AAPL, NVDA, RELIANCE, TCS, 7203.T, HSBA.L).`,
      400,
      'INVALID_SYMBOL'
    );
  }

  // Pass index symbols (^GSPC, ^NSEI, ^FTSE, etc.) straight through
  if (trimmed.startsWith('^')) {
    const gIdx = GLOBAL_INDICES.find((i) => i.yahooSymbol === trimmed);
    if (gIdx) {
      const exInfo = GLOBAL_EXCHANGES[gIdx.exchange];
      return {
        cleanSymbol: gIdx.key,
        yahooSymbol: trimmed,
        exchange: gIdx.exchange,
        name: gIdx.name,
        sector: 'Benchmark Index',
        country: gIdx.country,
        region: gIdx.region,
        currency: gIdx.currency || exInfo.currency,
      };
    }
    const iIdx = MARKET_INDICES.find((i) => i.yahooSymbol === trimmed);
    const ex: ExchangeCode = iIdx?.exchange || 'NSE';
    return {
      cleanSymbol: iIdx?.key || trimmed,
      yahooSymbol: trimmed,
      exchange: ex,
      name: iIdx?.name || trimmed,
      sector: 'Benchmark Index',
      country: GLOBAL_EXCHANGES[ex].country,
      region: GLOBAL_EXCHANGES[ex].region,
      currency: GLOBAL_EXCHANGES[ex].currency,
    };
  }

  const hasExplicitSuffix = KNOWN_SUFFIX_RE.test(trimmed);
  const explicitExProvided = Boolean(requestedExchange && requestedExchange.trim());
  const normalizedReqEx: ExchangeCode | undefined = explicitExProvided
    ? normalizeExchangeCode(requestedExchange)
    : undefined;

  // Check global catalog first (matches exact exchange if specified, or ticker/ISIN/BSE code)
  const globalMatch = findGlobalCatalogStock(trimmed, normalizedReqEx);
  const indianMatch = findCatalogStock(trimmed);

  // If user passed an explicit suffix (e.g. 7203.T, HSBA.L, RELIANCE.NS), trust the suffix exchange
  if (hasExplicitSuffix) {
    const suffixEx = inferExchangeFromYahooSymbol(trimmed);
    const stripped = trimmed.replace(KNOWN_SUFFIX_RE, '');
    const exInfo = GLOBAL_EXCHANGES[suffixEx];
    const match = findGlobalCatalogStock(trimmed, suffixEx) || globalMatch;
    return {
      cleanSymbol: match?.symbol || stripped,
      yahooSymbol: trimmed,
      exchange: suffixEx,
      name: match?.name || stripped,
      sector: match?.sector || `${exInfo.country} Equities`,
      country: match?.country || exInfo.country,
      region: match?.region || exInfo.region,
      currency: match?.currency || exInfo.currency,
      bseCode: match?.bseCode,
      isin: match?.isin,
    };
  }

  // Handle 6-digit Indian BSE scrip codes
  if (/^\d{6}$/.test(trimmed) && (!normalizedReqEx || normalizedReqEx === 'BSE' || normalizedReqEx === 'NSE')) {
    const exInfo = GLOBAL_EXCHANGES.BSE;
    return {
      cleanSymbol: indianMatch?.symbol || trimmed,
      yahooSymbol: `${trimmed}.BO`,
      exchange: 'BSE',
      name: indianMatch?.name || trimmed,
      sector: indianMatch?.sector || 'Indian Equities',
      country: exInfo.country,
      region: exInfo.region,
      currency: exInfo.currency,
      bseCode: trimmed,
    };
  }

  if (globalMatch) {
    // Allow NSE -> BSE override when user selects BSE on an Indian catalog stock
    if (normalizedReqEx === 'BSE' && globalMatch.bseCode) {
      return {
        cleanSymbol: globalMatch.symbol,
        yahooSymbol: `${globalMatch.bseCode}.BO`,
        exchange: 'BSE',
        name: globalMatch.name,
        sector: globalMatch.sector,
        country: 'India',
        region: 'India',
        currency: 'INR',
        bseCode: globalMatch.bseCode,
        isin: globalMatch.isin,
      };
    }
    const targetEx =
      normalizedReqEx && normalizedReqEx === globalMatch.exchange
        ? normalizedReqEx
        : globalMatch.exchange;
    return {
      cleanSymbol: globalMatch.symbol,
      yahooSymbol: globalMatch.yahooSymbol,
      exchange: targetEx,
      name: globalMatch.name,
      sector: globalMatch.sector,
      country: globalMatch.country,
      region: globalMatch.region,
      currency: globalMatch.currency,
      bseCode: globalMatch.bseCode,
      isin: globalMatch.isin,
    };
  }

  // Fallback for any arbitrary international or Indian symbol not in static catalog
  const targetEx: ExchangeCode = normalizedReqEx || 'NSE';
  const exInfo = GLOBAL_EXCHANGES[targetEx] || GLOBAL_EXCHANGES.NSE;
  const yahooSymbol = exInfo.yahooSuffix ? `${trimmed}${exInfo.yahooSuffix}` : trimmed;

  return {
    cleanSymbol: trimmed,
    yahooSymbol,
    exchange: targetEx,
    name: trimmed,
    sector: `${exInfo.country} Equities`,
    country: exInfo.country,
    region: exInfo.region,
    currency: exInfo.currency,
  };
}

// Backwards-compatible export for any legacy callers
export function resolveYahooSymbol(rawSymbol: string, exchange: string = 'NSE') {
  return resolveGlobalSymbol(rawSymbol, exchange);
}

async function fetchYahooJson(
  pathname: string,
  queryParams: Record<string, string>,
  timeoutMs = 7000
): Promise<any> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let lastError: Error | null = null;
  let rateLimited = false;
  let timedOut = false;

  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    if (!ALLOWED_YAHOO_HOSTS.has(host)) continue;
    const url = new URL(`https://${host}${pathname}`);
    for (const [k, v] of Object.entries(queryParams)) {
      url.searchParams.set(k, v);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);

      if (response.status === 404) {
        throw new MarketDataError(
          'Stock symbol not found on exchange provider.',
          404,
          'SYMBOL_NOT_FOUND'
        );
      }
      if (response.status === 429) {
        rateLimited = true;
        lastError = new Error('Upstream provider rate limit (HTTP 429)');
        if (i < hosts.length - 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        lastError = new Error(`Upstream authentication rejected (HTTP ${response.status})`);
        continue;
      }
      if (!response.ok) {
        lastError = new Error(`Upstream HTTP ${response.status}`);
        if (i < hosts.length - 1) {
          await new Promise((r) => setTimeout(r, 250));
        }
        continue;
      }
      const data = await response.json();
      upstreamSuccessCount++;
      lastSuccessfulFetchAt = new Date().toISOString();
      return data;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err instanceof MarketDataError) throw err;
      if (err?.name === 'AbortError') {
        timedOut = true;
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      } else {
        lastError = err;
      }
    }
  }

  upstreamErrorCount++;
  if (rateLimited) {
    throw new MarketDataError(
      'Market data provider rate limit reached (HTTP 429). Please wait a few seconds and retry.',
      429,
      'RATE_LIMITED'
    );
  }
  if (timedOut) {
    throw new MarketDataError(
      'Market data feed timed out while contacting the exchange provider. Please retry.',
      504,
      'UPSTREAM_TIMEOUT'
    );
  }
  throw new MarketDataError(
    `Live market data provider is currently unavailable (${lastError?.message || 'network error'}).`,
    503,
    'PROVIDER_UNAVAILABLE'
  );
}

const TIMEFRAME_CONFIG: Record<TimeframeKey, { range: string; interval: string }> = {
  '1D': { range: '1d', interval: '5m' },
  '1W': { range: '5d', interval: '30m' },
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '2Y': { range: '2y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
  MAX: { range: 'max', interval: '1mo' },
};

export async function fetchStockChart(
  rawSymbol: string,
  timeframe: TimeframeKey = '6M',
  exchange?: string
): Promise<{ quote: StockQuote; history: OhlcvBar[] }> {
  const resolved = resolveGlobalSymbol(rawSymbol, exchange);
  const tf = TIMEFRAME_CONFIG[timeframe] || TIMEFRAME_CONFIG['6M'];
  const cacheKey = `chart:${resolved.yahooSymbol}:${timeframe}`;
  const cached = getCached<{ quote: StockQuote; history: OhlcvBar[] }>(cacheKey);
  if (cached) {
    return {
      ...cached.data,
      quote: { ...cached.data.quote, freshness: 'Cached' },
    };
  }

  return dedupeInflight(cacheKey, async () => {
    const json = await fetchYahooJson(
      `/v8/finance/chart/${encodeURIComponent(resolved.yahooSymbol)}`,
      {
        range: tf.range,
        interval: tf.interval,
        includePrePost: 'false',
      },
      7500
    );

  const result = json?.chart?.result?.[0];
  if (!result || !result.meta) {
    const errDesc = json?.chart?.error?.description || 'No data returned for symbol';
    throw new MarketDataError(
      `Symbol "${resolved.cleanSymbol}" (${resolved.exchange}) could not be retrieved: ${errDesc}`,
      404,
      'SYMBOL_NOT_FOUND'
    );
  }

  const meta = result.meta;
  const exInfo = GLOBAL_EXCHANGES[resolved.exchange] || GLOBAL_EXCHANGES.NSE;
  const timestamps: number[] = result.timestamp || [];
  const quoteData = result.indicators?.quote?.[0] || {};
  const opens: Array<number | null> = quoteData.open || [];
  const highs: Array<number | null> = quoteData.high || [];
  const lows: Array<number | null> = quoteData.low || [];
  const closes: Array<number | null> = quoteData.close || [];
  const volumes: Array<number | null> = quoteData.volume || [];

  const history: OhlcvBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close === null || close === undefined || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    const open = opens[i] ?? close;
    const high = highs[i] ?? Math.max(open, close);
    const low = lows[i] ?? Math.min(open, close);
    const volume = volumes[i] ?? 0;
    const dt = new Date(timestamps[i] * 1000);
    const dateLabel =
      timeframe === '1D' || timeframe === '1W'
        ? dt.toLocaleString('en-GB', {
            timeZone: exInfo.timeZone,
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : dt.toISOString().slice(0, 10);

    history.push({
      date: dateLabel,
      timestamp: timestamps[i] * 1000,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.max(0, Math.round(volume)),
    });
  }

  const latestBar = history[history.length - 1];
  const prevBar = history.length >= 2 ? history[history.length - 2] : undefined;
  const price = Number((meta.regularMarketPrice ?? latestBar?.close ?? 0).toFixed(2));
  const previousClose = Number(
    (
      meta.regularMarketPreviousClose ??
      (timeframe === '1D'
        ? meta.chartPreviousClose ?? meta.previousClose
        : prevBar?.close ?? meta.chartPreviousClose) ??
      price
    ).toFixed(2)
  );
  const change = Number((price - previousClose).toFixed(2));
  const changePercent =
    previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0;

  // Handle LSE GBp (pence) vs GBP cleanly by exposing upstream currency accurately
  const currency = String(meta.currency || resolved.currency || exInfo.currency);

  const quote: StockQuote = {
    symbol: resolved.cleanSymbol,
    yahooSymbol: resolved.yahooSymbol,
    exchange: resolved.exchange,
    bseCode: resolved.bseCode,
    isin: resolved.isin,
    name: meta.longName || meta.shortName || resolved.name,
    sector: resolved.sector,
    country: resolved.country,
    region: resolved.region,
    currency,
    price,
    previousClose,
    change,
    changePercent,
    open: Number((meta.regularMarketOpen ?? latestBar?.open ?? price).toFixed(2)),
    dayHigh: Number((meta.regularMarketDayHigh ?? latestBar?.high ?? price).toFixed(2)),
    dayLow: Number((meta.regularMarketDayLow ?? latestBar?.low ?? price).toFixed(2)),
    volume: Math.round(meta.regularMarketVolume ?? latestBar?.volume ?? 0),
    fiftyTwoWeekHigh:
      typeof meta.fiftyTwoWeekHigh === 'number' ? Number(meta.fiftyTwoWeekHigh.toFixed(2)) : null,
    fiftyTwoWeekLow:
      typeof meta.fiftyTwoWeekLow === 'number' ? Number(meta.fiftyTwoWeekLow.toFixed(2)) : null,
    marketCap: typeof meta.marketCap === 'number' ? meta.marketCap : null,
    trailingPE: null,
    eps: null,
    dividendYieldPct: null,
    dataSource: `Yahoo Finance (${resolved.exchange})`,
    freshness: 'Delayed Exchange Feed',
    isLive: true,
    fetchedAt: new Date().toISOString(),
  };

  const payload = { quote, history };
  const ttl = timeframe === '1D' ? 30_000 : 120_000;
  setCached(cacheKey, payload, ttl);
  return payload;
  });
}

export async function fetchStockQuote(
  rawSymbol: string,
  exchange?: string
): Promise<StockQuote> {
  const { quote } = await fetchStockChart(rawSymbol, '1W', exchange);
  return quote;
}

function rawNum(obj: any): number | null {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'number' && Number.isFinite(obj)) return obj;
  if (typeof obj === 'object' && typeof obj.raw === 'number' && Number.isFinite(obj.raw)) {
    return obj.raw;
  }
  return null;
}

interface YahooCrumbSession {
  cookie: string;
  crumb: string;
  expiresAt: number;
}

let yahooCrumbCache: YahooCrumbSession | null = null;
let yahooCrumbInflight: Promise<YahooCrumbSession | null> | null = null;

async function getYahooCrumbSession(): Promise<YahooCrumbSession | null> {
  if (yahooCrumbCache && Date.now() < yahooCrumbCache.expiresAt) {
    return yahooCrumbCache;
  }
  if (yahooCrumbInflight) return yahooCrumbInflight;

  yahooCrumbInflight = (async () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    try {
      const c1 = new AbortController();
      const t1 = setTimeout(() => c1.abort(), 5000);
      const fcResp = await fetch('https://fc.yahoo.com', {
        signal: c1.signal,
        redirect: 'manual',
        headers: { 'User-Agent': ua },
      }).finally(() => clearTimeout(t1));

      const setCookies: string[] =
        typeof (fcResp.headers as any).getSetCookie === 'function'
          ? (fcResp.headers as any).getSetCookie()
          : fcResp.headers.get('set-cookie')
            ? [fcResp.headers.get('set-cookie') as string]
            : [];

      const cookieHeader = setCookies
        .map((c) => c.split(';')[0]?.trim())
        .filter(Boolean)
        .join('; ');

      if (!cookieHeader) return null;

      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 5000);
      const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        signal: c2.signal,
        headers: { 'User-Agent': ua, Cookie: cookieHeader },
      }).finally(() => clearTimeout(t2));

      if (!crumbResp.ok) return null;
      const crumb = (await crumbResp.text()).trim();
      if (!crumb || crumb.length > 64 || crumb.includes('<')) return null;

      yahooCrumbCache = {
        cookie: cookieHeader,
        crumb,
        expiresAt: Date.now() + 25 * 60_000,
      };
      return yahooCrumbCache;
    } catch {
      return null;
    } finally {
      yahooCrumbInflight = null;
    }
  })();

  return yahooCrumbInflight;
}

async function fetchYahooQuoteSummaryWithCrumb(
  yahooSymbol: string,
  modules: string
): Promise<any | null> {
  const session = await getYahooCrumbSession();
  const ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const url = new URL(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}`
  );
  url.searchParams.set('modules', modules);
  if (session?.crumb) {
    url.searchParams.set('crumb', session.crumb);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
  try {
    const resp = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        Accept: 'application/json',
        ...(session?.cookie ? { Cookie: session.cookie } : {}),
      },
    });
    clearTimeout(timer);
    if (resp.status === 401 || resp.status === 403) {
      yahooCrumbCache = null;
      return null;
    }
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function parseStatementSeries(
  rawStatements: any[],
  sharesOutstanding: number | null,
  isQuarterly: boolean
): FinancialPeriodPoint[] {
  if (!Array.isArray(rawStatements) || rawStatements.length === 0) return [];
  const chronological = [...rawStatements]
    .filter((s) => s && (s.endDate?.fmt || s.endDate?.raw))
    .sort((a, b) => (a.endDate?.raw || 0) - (b.endDate?.raw || 0));

  return chronological.map((st, idx) => {
    const rawDate = String(st.endDate?.fmt || '');
    const period = isQuarterly
      ? rawDate.slice(0, 7)
      : rawDate.slice(0, 4) || `FY${idx + 1}`;
    const revenue = rawNum(st.totalRevenue);
    const grossProfit = rawNum(st.grossProfit);
    const operatingIncome = rawNum(st.operatingIncome) ?? rawNum(st.ebit);
    const netIncome = rawNum(st.netIncome) ?? rawNum(st.netIncomeApplicableToCommonShares);
    const eps =
      netIncome !== null && sharesOutstanding && sharesOutstanding > 0
        ? Number((netIncome / sharesOutstanding).toFixed(2))
        : null;
    const profitMarginPct =
      revenue && revenue > 0 && netIncome !== null
        ? Number(((netIncome / revenue) * 100).toFixed(2))
        : null;

    let revenueGrowthPct: number | null = null;
    if (idx > 0) {
      const prevRev = rawNum(chronological[idx - 1]?.totalRevenue);
      if (prevRev && prevRev > 0 && revenue !== null) {
        revenueGrowthPct = Number((((revenue - prevRev) / prevRev) * 100).toFixed(2));
      }
    }

    return {
      period,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      eps,
      profitMarginPct,
      revenueGrowthPct,
    };
  });
}

export async function fetchStockFundamentals(
  quote: StockQuote
): Promise<StockFundamentals> {
  const cacheKey = `fundamentals:v2:${quote.yahooSymbol}`;
  const cached = getCached<StockFundamentals>(cacheKey);
  if (cached) return cached.data;

  const empty: StockFundamentals = {
    industry: null,
    businessSummary: null,
    website: null,
    fullTimeEmployees: null,
    sharesOutstanding: null,
    averageVolume: null,
    nextEarningsDate: null,
    marketCap: quote.marketCap,
    trailingPE: quote.trailingPE,
    forwardPE: null,
    eps: quote.eps,
    priceToBook: null,
    priceToSales: null,
    evToEbitda: null,
    pegRatio: null,
    dividendYieldPct: quote.dividendYieldPct,
    revenue: null,
    revenueGrowthPct: null,
    grossProfit: null,
    operatingIncome: null,
    netIncome: null,
    grossMarginPct: null,
    operatingMarginPct: null,
    profitMarginPct: null,
    totalAssets: null,
    totalLiabilities: null,
    totalDebt: null,
    shareholdersEquity: null,
    cashAndEquivalents: null,
    debtToEquity: null,
    operatingCashFlow: null,
    investingCashFlow: null,
    financingCashFlow: null,
    freeCashFlow: null,
    roePct: null,
    roaPct: null,
    roicPct: null,
    earningsGrowthPct: null,
    beta: null,
    annualFinancials: [],
    quarterlyFinancials: [],
    currency: quote.currency,
    availableFieldsCount: quote.marketCap ? 1 : 0,
    dataSource: quote.dataSource,
    note: 'Extended financial statements were not returned by the public exchange feed for this listing; verify against official company filings.',
  };

  try {
    const fullModules =
      'assetProfile,summaryDetail,defaultKeyStatistics,financialData,incomeStatementHistory,incomeStatementHistoryQuarterly,balanceSheetHistory,cashflowStatementHistory,calendarEvents';
    const json = await fetchYahooQuoteSummaryWithCrumb(quote.yahooSymbol, fullModules);
    const res = json?.quoteSummary?.result?.[0];
    if (!res) {
      setCached(cacheKey, empty, 180_000);
      return empty;
    }

    const ap = res.assetProfile || {};
    const sd = res.summaryDetail || {};
    const ks = res.defaultKeyStatistics || {};
    const fd = res.financialData || {};
    const ce = res.calendarEvents || {};

    const annualIncRaw = res.incomeStatementHistory?.incomeStatementHistory || [];
    const quarterlyIncRaw = res.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const bsList = res.balanceSheetHistory?.balanceSheetStatements || [];
    const cfList = res.cashflowStatementHistory?.cashflowStatements || [];

    const latestInc = annualIncRaw[0] || {};
    const latestBs = bsList[0] || {};
    const latestCf = cfList[0] || {};

    const sharesOutstanding = rawNum(ks.sharesOutstanding);
    const averageVolume = rawNum(sd.averageVolume) ?? rawNum(sd.averageDailyVolume10Day);
    const marketCap = rawNum(sd.marketCap) ?? quote.marketCap;
    const trailingPE = rawNum(sd.trailingPE);
    const forwardPE = rawNum(sd.forwardPE) ?? rawNum(ks.forwardPE);
    const eps = rawNum(ks.trailingEps);
    const priceToBook = rawNum(ks.priceToBook);
    const priceToSales = rawNum(sd.priceToSalesTrailing12Months);
    const evToEbitda = rawNum(ks.enterpriseToEbitda);
    const pegRatio = rawNum(ks.pegRatio);
    const divYieldRaw = rawNum(sd.dividendYield);
    const dividendYieldPct = divYieldRaw !== null ? Number((divYieldRaw * 100).toFixed(2)) : null;

    const revenue = rawNum(fd.totalRevenue) ?? rawNum(latestInc.totalRevenue);
    const grossProfit = rawNum(fd.grossProfits) ?? rawNum(latestInc.grossProfit);
    const operatingIncome = rawNum(latestInc.operatingIncome) ?? rawNum(latestInc.ebit);
    const netIncome = rawNum(ks.netIncomeToCommon) ?? rawNum(latestInc.netIncome);

    const gmRaw = rawNum(fd.grossMargins);
    const grossMarginPct =
      gmRaw !== null
        ? Number((gmRaw * 100).toFixed(2))
        : revenue && grossProfit !== null
          ? Number(((grossProfit / revenue) * 100).toFixed(2))
          : null;

    const omRaw = rawNum(fd.operatingMargins);
    const operatingMarginPct =
      omRaw !== null
        ? Number((omRaw * 100).toFixed(2))
        : revenue && operatingIncome !== null
          ? Number(((operatingIncome / revenue) * 100).toFixed(2))
          : null;

    const pmRaw = rawNum(fd.profitMargins);
    const profitMarginPct =
      pmRaw !== null
        ? Number((pmRaw * 100).toFixed(2))
        : revenue && netIncome !== null
          ? Number(((netIncome / revenue) * 100).toFixed(2))
          : null;

    const totalAssets = rawNum(latestBs.totalAssets);
    const totalLiabilities = rawNum(latestBs.totalLiab);
    const totalDebt = rawNum(fd.totalDebt) ?? rawNum(latestBs.longTermDebt);
    const shareholdersEquity = rawNum(latestBs.totalStockholderEquity);
    const cashAndEquivalents = rawNum(fd.totalCash) ?? rawNum(latestBs.cash);
    const debtToEquity = rawNum(fd.debtToEquity);

    const operatingCashFlow =
      rawNum(fd.operatingCashflow) ?? rawNum(latestCf.totalCashFromOperatingActivities);
    const investingCashFlow = rawNum(latestCf.totalCashflowsFromInvestingActivities);
    const financingCashFlow = rawNum(latestCf.totalCashFromFinancingActivities);
    const freeCashFlow = rawNum(fd.freeCashflow);

    const roeRaw = rawNum(fd.returnOnEquity);
    const roePct = roeRaw !== null ? Number((roeRaw * 100).toFixed(2)) : null;
    const roaRaw = rawNum(fd.returnOnAssets);
    const roaPct = roaRaw !== null ? Number((roaRaw * 100).toFixed(2)) : null;

    // Real ROIC approximation when Operating Income, Debt, Equity, and Cash are all present
    let roicPct: number | null = null;
    if (
      operatingIncome !== null &&
      totalDebt !== null &&
      shareholdersEquity !== null &&
      cashAndEquivalents !== null
    ) {
      const investedCapital = totalDebt + shareholdersEquity - cashAndEquivalents;
      if (investedCapital > 0) {
        const nopat = operatingIncome * 0.79; // Standard 21% effective corporate tax approximation
        roicPct = Number(((nopat / investedCapital) * 100).toFixed(2));
      }
    }

    const egRaw = rawNum(fd.earningsGrowth);
    const earningsGrowthPct = egRaw !== null ? Number((egRaw * 100).toFixed(2)) : null;
    const rgRaw = rawNum(fd.revenueGrowth);
    const revenueGrowthPct = rgRaw !== null ? Number((rgRaw * 100).toFixed(2)) : null;
    const beta = rawNum(ks.beta) ?? rawNum(sd.beta);

    const nextEarningsRaw = ce?.earnings?.earningsDate?.[0]?.fmt || null;

    const annualFinancials = parseStatementSeries(annualIncRaw, sharesOutstanding, false);
    const quarterlyFinancials = parseStatementSeries(quarterlyIncRaw, sharesOutstanding, true);

    const trackedFields = [
      ap.industry || null,
      marketCap,
      trailingPE,
      forwardPE,
      eps,
      priceToBook,
      priceToSales,
      evToEbitda,
      pegRatio,
      dividendYieldPct,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      grossMarginPct,
      operatingMarginPct,
      profitMarginPct,
      totalAssets,
      totalLiabilities,
      totalDebt,
      shareholdersEquity,
      cashAndEquivalents,
      debtToEquity,
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      freeCashFlow,
      roePct,
      roaPct,
      roicPct,
      earningsGrowthPct,
      revenueGrowthPct,
      beta,
    ];
    const availableFieldsCount = trackedFields.filter((v) => v !== null).length;

    const result: StockFundamentals = {
      industry: typeof ap.industry === 'string' ? ap.industry : null,
      businessSummary:
        typeof ap.longBusinessSummary === 'string'
          ? ap.longBusinessSummary.slice(0, 950)
          : null,
      website: typeof ap.website === 'string' ? ap.website : null,
      fullTimeEmployees:
        typeof ap.fullTimeEmployees === 'number' ? ap.fullTimeEmployees : null,
      sharesOutstanding,
      averageVolume,
      nextEarningsDate: nextEarningsRaw,
      marketCap,
      trailingPE: trailingPE !== null ? Number(trailingPE.toFixed(2)) : null,
      forwardPE: forwardPE !== null ? Number(forwardPE.toFixed(2)) : null,
      eps: eps !== null ? Number(eps.toFixed(2)) : null,
      priceToBook: priceToBook !== null ? Number(priceToBook.toFixed(2)) : null,
      priceToSales: priceToSales !== null ? Number(priceToSales.toFixed(2)) : null,
      evToEbitda: evToEbitda !== null ? Number(evToEbitda.toFixed(2)) : null,
      pegRatio: pegRatio !== null ? Number(pegRatio.toFixed(2)) : null,
      dividendYieldPct,
      revenue,
      revenueGrowthPct,
      grossProfit,
      operatingIncome,
      netIncome,
      grossMarginPct,
      operatingMarginPct,
      profitMarginPct,
      totalAssets,
      totalLiabilities,
      totalDebt,
      shareholdersEquity,
      cashAndEquivalents,
      debtToEquity: debtToEquity !== null ? Number(debtToEquity.toFixed(2)) : null,
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      freeCashFlow,
      roePct,
      roaPct,
      roicPct,
      earningsGrowthPct,
      beta: beta !== null ? Number(beta.toFixed(2)) : null,
      annualFinancials,
      quarterlyFinancials,
      currency: String(fd.financialCurrency || quote.currency),
      availableFieldsCount,
      dataSource: `Yahoo Finance QuoteSummary (${quote.exchange})`,
      note:
        availableFieldsCount > 0
          ? `${availableFieldsCount} verified financial statement & valuation fields retrieved from Yahoo Finance. Any field marked Not Available was omitted by the feed.`
          : empty.note,
    };

    setCached(cacheKey, result, 600_000);
    return result;
  } catch {
    setCached(cacheKey, empty, 180_000);
    return empty;
  }
}

export interface GlobalSearchResultItem {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: ExchangeCode;
  exchangeLabel: string;
  country: string;
  region: GlobalRegion;
  currency: string;
  sector: string;
  isin?: string;
  bseCode?: string;
  source: 'catalog' | 'live-exchange-search';
  trending?: boolean;
  popular?: boolean;
}

export async function searchGlobalEquities(options: {
  q?: string;
  exchange?: string;
  country?: string;
  currency?: string;
}): Promise<{
  results: GlobalSearchResultItem[];
  trending: GlobalSearchResultItem[];
  popular: GlobalSearchResultItem[];
  source: string;
}> {
  const q = (options.q || '').trim();
  const catalogMatches = searchGlobalCatalog(options).slice(0, 24);

  const mapCatalog = (c: (typeof GLOBAL_STOCK_CATALOG)[number]): GlobalSearchResultItem => ({
    symbol: c.symbol,
    yahooSymbol: c.yahooSymbol,
    name: c.name,
    exchange: c.exchange,
    exchangeLabel: GLOBAL_EXCHANGES[c.exchange]?.name || c.exchange,
    country: c.country,
    region: c.region,
    currency: c.currency,
    sector: c.sector,
    isin: c.isin,
    bseCode: c.bseCode,
    source: 'catalog',
    trending: c.trending,
    popular: c.popular,
  });

  const trending = GLOBAL_STOCK_CATALOG.filter((s) => s.trending).slice(0, 10).map(mapCatalog);
  const popular = GLOBAL_STOCK_CATALOG.filter((s) => s.popular).slice(0, 12).map(mapCatalog);

  const results: GlobalSearchResultItem[] = catalogMatches.map(mapCatalog);
  const seen = new Set(results.map((r) => `${r.symbol}:${r.exchange}`));

  // Live Yahoo Finance autocomplete for arbitrary international tickers/companies/ISINs
  if (q.length >= 2) {
    const cacheKey = `gsearch:${q.toUpperCase()}`;
    let liveQuotes: any[] = [];
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      liveQuotes = cached.data;
    } else {
      try {
        const json = await fetchYahooJson('/v1/finance/search', {
          q,
          quotesCount: '12',
          newsCount: '0',
          enableFuzzyQuery: 'false',
        });
        liveQuotes = Array.isArray(json?.quotes) ? json.quotes : [];
        setCached(cacheKey, liveQuotes, 120_000);
      } catch {
        liveQuotes = [];
      }
    }

    const reqEx = options.exchange && options.exchange !== 'ALL' ? normalizeExchangeCode(options.exchange) : null;
    const reqCountry = options.country && options.country !== 'ALL' ? options.country.toLowerCase() : null;
    const reqCurrency = options.currency && options.currency !== 'ALL' ? options.currency.toUpperCase() : null;

    for (const lq of liveQuotes) {
      if (lq.quoteType && !['EQUITY', 'ETF', 'INDEX'].includes(String(lq.quoteType).toUpperCase())) {
        continue;
      }
      const rawYahoo = String(lq.symbol || '').toUpperCase();
      if (!rawYahoo || rawYahoo.startsWith('^')) continue;

      const inferredEx = KNOWN_SUFFIX_RE.test(rawYahoo)
        ? inferExchangeFromYahooSymbol(rawYahoo)
        : normalizeExchangeCode(lq.exchange || lq.exchDisp || 'NASDAQ');
      if (!isExchangeCode(inferredEx)) continue;

      const exInfo = GLOBAL_EXCHANGES[inferredEx];
      if (reqEx && inferredEx !== reqEx) continue;
      if (reqCountry && exInfo.country.toLowerCase() !== reqCountry) continue;
      if (reqCurrency && exInfo.currency.toUpperCase() !== reqCurrency) continue;

      const cleanSym = rawYahoo.replace(KNOWN_SUFFIX_RE, '');
      const key = `${cleanSym}:${inferredEx}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        symbol: cleanSym,
        yahooSymbol: rawYahoo,
        name: String(lq.longname || lq.shortname || cleanSym),
        exchange: inferredEx,
        exchangeLabel: exInfo.name,
        country: exInfo.country,
        region: exInfo.region,
        currency: exInfo.currency,
        sector: String(lq.sectorDisp || lq.sector || `${exInfo.country} Equities`),
        source: 'live-exchange-search',
      });
    }
  }

  return {
    results: results.slice(0, 28),
    trending,
    popular,
    source: q.length >= 2 ? 'Global Curated Directory + Yahoo Finance Live Autocomplete' : 'Global Curated Directory',
  };
}

export async function fetchGlobalMarketOverview() {
  const cacheKey = 'market:global-overview';
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return { ...cached.data, freshness: 'Cached' };
  }

  // Fetch all 14 global indices (North America, Europe, Asia-Pacific, India)
  const indexResults = await Promise.allSettled(
    GLOBAL_INDICES.map(async (idx) => {
      const { quote, history } = await fetchStockChart(idx.yahooSymbol, '1M', idx.exchange);
      const marketStatus = getExchangeMarketStatus(idx.exchange);
      return {
        key: idx.key,
        name: idx.name,
        exchange: idx.exchange,
        country: idx.country,
        region: idx.region,
        currency: idx.currency,
        yahooSymbol: idx.yahooSymbol,
        price: quote.price,
        previousClose: quote.previousClose,
        change: quote.change,
        changePercent: quote.changePercent,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        marketStatus,
        fetchedAt: quote.fetchedAt,
        trend: history.slice(-20).map((b) => ({ date: b.date, close: b.close })),
      };
    })
  );

  const indices = indexResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Representative flagship global equities for movers & heatmap (balanced across US, India, Europe, APAC)
  const globalMoversUniverse = [
    ...GLOBAL_STOCK_CATALOG.filter((s) => s.region === 'North America').slice(0, 8),
    ...GLOBAL_STOCK_CATALOG.filter((s) => s.region === 'India').slice(0, 8),
    ...GLOBAL_STOCK_CATALOG.filter((s) => s.region === 'Europe').slice(0, 5),
    ...GLOBAL_STOCK_CATALOG.filter((s) => s.region === 'Asia-Pacific').slice(0, 5),
  ];

  const stockResults = await Promise.allSettled(
    globalMoversUniverse.map((s) => fetchStockQuote(s.yahooSymbol, s.exchange))
  );

  const quotes = stockResults
    .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (indices.length === 0 && quotes.length === 0) {
    throw new MarketDataError(
      'Unable to retrieve global market indices or equity quotes from upstream provider.',
      503,
      'GLOBAL_MARKET_UNAVAILABLE'
    );
  }

  const regionalSessions = (['North America', 'Europe', 'Asia-Pacific', 'India'] as GlobalRegion[]).map(
    (region) => {
      const repExchange: ExchangeCode =
        region === 'North America'
          ? 'NASDAQ'
          : region === 'Europe'
            ? 'LSE'
            : region === 'Asia-Pacific'
              ? 'TSE'
              : 'NSE';
      const session = getExchangeMarketStatus(repExchange);
      const regionIndices = indices.filter((i) => i.region === region);
      const avgChangePct =
        regionIndices.length > 0
          ? Number(
              (
                regionIndices.reduce((s, i) => s + i.changePercent, 0) / regionIndices.length
              ).toFixed(2)
            )
          : 0;
      return {
        region,
        representativeExchange: repExchange,
        session,
        indexCount: regionIndices.length,
        avgChangePct,
      };
    }
  );

  const sortedByChange = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
  const topGainers = sortedByChange.filter((q) => q.changePercent >= 0).slice(0, 8);
  const topLosers = [...quotes]
    .sort((a, b) => a.changePercent - b.changePercent)
    .filter((q) => q.changePercent < 0)
    .slice(0, 8);
  const mostActive = [...quotes].sort((a, b) => b.volume - a.volume).slice(0, 8);

  const heatmap = quotes.map((q) => ({
    symbol: q.symbol,
    yahooSymbol: q.yahooSymbol,
    name: q.name,
    exchange: q.exchange,
    country: q.country,
    region: q.region,
    sector: q.sector,
    currency: q.currency,
    price: q.price,
    changePercent: q.changePercent,
    volume: q.volume,
  }));

  const advancing = quotes.filter((q) => q.change > 0).length;
  const declining = quotes.filter((q) => q.change < 0).length;
  const unchanged = quotes.length - advancing - declining;

  const overview = {
    indianMarketStatus: getIndianMarketStatus(),
    regionalSessions,
    indices,
    topGainers,
    topLosers,
    mostActive,
    heatmap,
    breadth: {
      advancing,
      declining,
      unchanged,
      sampleSize: quotes.length,
    },
    provider: getActiveProviderInfo(),
    freshness: 'Delayed Exchange Feed' as const,
    dataSource: 'Yahoo Finance Global Exchange Feed (16 Markets)',
    isLive: true,
    lastUpdated: new Date().toISOString(),
  };

  setCached(cacheKey, overview, 45_000);
  return overview;
}

export async function fetchMarketOverview() {
  const cacheKey = 'market:overview';
  const cached = getCached<any>(cacheKey);
  if (cached) return cached.data;

  const marketStatus = getIndianMarketStatus();

  const indexResults = await Promise.allSettled(
    MARKET_INDICES.map(async (idx) => {
      const { quote, history } = await fetchStockChart(idx.yahooSymbol, '1M', idx.exchange);
      return {
        key: idx.key,
        name: idx.name,
        exchange: idx.exchange,
        yahooSymbol: idx.yahooSymbol,
        price: quote.price,
        previousClose: quote.previousClose,
        change: quote.change,
        changePercent: quote.changePercent,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        fetchedAt: quote.fetchedAt,
        trend: history.slice(-20).map((b) => ({ date: b.date, close: b.close })),
      };
    })
  );

  const indices = indexResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  const universeSymbols = INDIAN_STOCK_CATALOG.slice(0, 20);
  const stockResults = await Promise.allSettled(
    universeSymbols.map((s) => fetchStockQuote(s.symbol, 'NSE'))
  );

  const quotes = stockResults
    .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled')
    .map((r) => r.value);

  if (indices.length === 0 && quotes.length === 0) {
    throw new MarketDataError(
      'Unable to retrieve live NSE/BSE market indices or quotes from upstream provider.',
      503,
      'MARKET_OVERVIEW_UNAVAILABLE'
    );
  }

  const sortedByChange = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
  const topGainers = sortedByChange.filter((q) => q.changePercent >= 0).slice(0, 6);
  const topLosers = [...quotes]
    .sort((a, b) => a.changePercent - b.changePercent)
    .filter((q) => q.changePercent < 0)
    .slice(0, 6);
  const mostActive = [...quotes].sort((a, b) => b.volume - a.volume).slice(0, 6);

  const advancing = quotes.filter((q) => q.change > 0).length;
  const declining = quotes.filter((q) => q.change < 0).length;
  const unchanged = quotes.length - advancing - declining;

  const overview = {
    marketStatus,
    indices,
    topGainers,
    topLosers,
    mostActive,
    breadth: {
      advancing,
      declining,
      unchanged,
      sampleSize: quotes.length,
    },
    dataSource: 'Yahoo Finance (NSE/BSE Live Feed)',
    isLive: true,
    lastUpdated: new Date().toISOString(),
  };

  setCached(cacheKey, overview, 45_000);
  return overview;
}

export async function fetchScreenerStocks(limit = 24): Promise<{
  stocks: StockQuote[];
  failedCount: number;
  dataSource: string;
  lastUpdated: string;
}> {
  const cacheKey = `screener:${limit}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached.data;

  const subset = INDIAN_STOCK_CATALOG.slice(0, Math.min(limit, INDIAN_STOCK_CATALOG.length));
  const results = await Promise.allSettled(
    subset.map((entry) => fetchStockQuote(entry.symbol, 'NSE'))
  );

  const stocks: StockQuote[] = [];
  let failedCount = 0;
  for (const res of results) {
    if (res.status === 'fulfilled') {
      stocks.push(res.value);
    } else {
      failedCount++;
    }
  }

  if (stocks.length === 0) {
    throw new MarketDataError(
      'Unable to fetch NSE/BSE screener quotes from market data provider.',
      503,
      'SCREENER_UNAVAILABLE'
    );
  }

  const payload = {
    stocks,
    failedCount,
    dataSource: 'Yahoo Finance (NSE/BSE)',
    lastUpdated: new Date().toISOString(),
  };
  setCached(cacheKey, payload, 60_000);
  return payload;
}

export interface GlobalScreenerRow extends StockQuote {
  rsi14: number | null;
  trend: 'Uptrend' | 'Downtrend' | 'Sideways';
  annualizedVolatilityPct: number;
  riskScore: number;
  aiDecision: 'BUY' | 'SELL' | 'HOLD' | 'WAIT' | null;
  aiConfidence: number | null;
}

export async function fetchGlobalScreener(options?: {
  region?: string;
  country?: string;
  exchange?: string;
  limit?: number;
}): Promise<{
  stocks: GlobalScreenerRow[];
  failedCount: number;
  dataSource: string;
  lastUpdated: string;
}> {
  const regionFilter = options?.region && options.region !== 'ALL' ? options.region : 'ALL';
  const countryFilter = options?.country && options.country !== 'ALL' ? options.country : 'ALL';
  const exchangeFilter = options?.exchange && options.exchange !== 'ALL' ? normalizeExchangeCode(options.exchange) : 'ALL';
  const limit = Math.min(48, Math.max(12, options?.limit || 36));

  const cacheKey = `global-screener:${regionFilter}:${countryFilter}:${exchangeFilter}:${limit}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached.data;

  let pool = GLOBAL_STOCK_CATALOG.filter((s) => {
    if (regionFilter !== 'ALL' && s.region !== regionFilter) return false;
    if (countryFilter !== 'ALL' && s.country.toLowerCase() !== countryFilter.toLowerCase()) return false;
    if (exchangeFilter !== 'ALL' && s.exchange !== exchangeFilter) return false;
    return true;
  });

  // If unfiltered, pick a balanced global slice across all 4 regions
  if (regionFilter === 'ALL' && countryFilter === 'ALL' && exchangeFilter === 'ALL') {
    const na = pool.filter((s) => s.region === 'North America').slice(0, 12);
    const ind = pool.filter((s) => s.region === 'India').slice(0, 10);
    const eu = pool.filter((s) => s.region === 'Europe').slice(0, 7);
    const apac = pool.filter((s) => s.region === 'Asia-Pacific').slice(0, 7);
    pool = [...na, ...ind, ...eu, ...apac].slice(0, limit);
  } else {
    pool = pool.slice(0, limit);
  }

  const results = await Promise.allSettled(
    pool.map(async (entry) => {
      const { quote, history } = await fetchStockChart(entry.yahooSymbol, '3M', entry.exchange);
      const tech = computeTechnicalAnalysis(history);
      const vol = tech.summary.annualizedVolatilityPct;
      const dd = tech.summary.maxDrawdownPct;
      const riskScore = Math.max(10, Math.min(98, Math.round(vol * 1.45 + dd * 0.9)));

      // Heuristic quantitative signal when no saved AI analysis exists
      let qScore = 0;
      if (tech.summary.trend === 'Uptrend') qScore += 2;
      else if (tech.summary.trend === 'Downtrend') qScore -= 2;
      if (tech.summary.rsi14 !== null) {
        if (tech.summary.rsi14 < 34) qScore += 1;
        else if (tech.summary.rsi14 > 72) qScore -= 1;
      }
      if (tech.summary.macd.bias === 'Bullish Crossover') qScore += 1;
      else if (tech.summary.macd.bias === 'Bearish Crossover') qScore -= 1;

      const aiDecision: 'BUY' | 'SELL' | 'HOLD' | 'WAIT' =
        qScore >= 3 ? 'BUY' : qScore <= -3 ? 'SELL' : riskScore >= 70 && Math.abs(qScore) <= 1 ? 'WAIT' : 'HOLD';

      return {
        ...quote,
        rsi14: tech.summary.rsi14,
        trend: tech.summary.trend,
        annualizedVolatilityPct: vol,
        riskScore,
        aiDecision,
        aiConfidence: Math.max(45, Math.min(76, 52 + Math.abs(qScore) * 6 - (riskScore > 65 ? 6 : 0))),
      } as GlobalScreenerRow;
    })
  );

  const stocks: GlobalScreenerRow[] = [];
  let failedCount = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') stocks.push(r.value);
    else failedCount++;
  }

  if (stocks.length === 0) {
    throw new MarketDataError(
      'Unable to fetch global screener quotes from market data provider.',
      503,
      'GLOBAL_SCREENER_UNAVAILABLE'
    );
  }

  const payload = {
    stocks,
    failedCount,
    dataSource: 'Yahoo Finance Global Screener (Real 3M Technicals)',
    lastUpdated: new Date().toISOString(),
  };
  setCached(cacheKey, payload, 90_000);
  return payload;
}

export async function compareGlobalStocks(
  items: Array<{ symbol: string; exchange?: string }>,
  timeframe: TimeframeKey = '6M'
) {
  const cleanItems = items.slice(0, 5);
  const settled = await Promise.allSettled(
    cleanItems.map(async (item) => {
      const { quote, history } = await fetchStockChart(item.symbol, timeframe, item.exchange);
      const tech = computeTechnicalAnalysis(history);
      const fundamentals = await fetchStockFundamentals(quote);
      const firstClose = history[0]?.close || quote.price;
      const lastClose = history[history.length - 1]?.close || quote.price;
      const periodReturnPct =
        firstClose > 0 ? Number((((lastClose - firstClose) / firstClose) * 100).toFixed(2)) : 0;

      const normalizedPoints = history.map((b) => ({
        date: b.date,
        pctReturn:
          firstClose > 0 ? Number((((b.close - firstClose) / firstClose) * 100).toFixed(2)) : 0,
        close: b.close,
      }));

      const riskScore = Math.max(
        10,
        Math.min(
          98,
          Math.round(tech.summary.annualizedVolatilityPct * 1.45 + tech.summary.maxDrawdownPct * 0.9)
        )
      );

      return {
        key: `${quote.symbol}:${quote.exchange}`,
        quote,
        fundamentals,
        technicalSummary: tech.summary,
        periodReturnPct,
        riskScore,
        normalizedPoints,
      };
    })
  );

  const compared = settled
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failed = settled
    .map((r, idx) => (r.status === 'rejected' ? { ...cleanItems[idx], reason: r.reason?.message || 'Failed' } : null))
    .filter(Boolean);

  if (compared.length === 0) {
    throw new MarketDataError('None of the requested stocks could be loaded for comparison.', 503, 'COMPARE_UNAVAILABLE');
  }

  // Merge normalized percentage curves onto a shared date timeline (forward-filling exchange holidays)
  const dateSet = new Set<string>();
  compared.forEach((c) => c.normalizedPoints.forEach((p: any) => dateSet.add(p.date)));
  const sortedDates = Array.from(dateSet).sort();

  const lastKnown: Record<string, number | null> = {};
  compared.forEach((c) => {
    lastKnown[c.key] = null;
  });

  const maps = compared.map((c) => ({
    key: c.key,
    byDate: new Map<string, number>(c.normalizedPoints.map((p: any) => [p.date, p.pctReturn])),
  }));

  const normalizedTimeline = sortedDates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const m of maps) {
      const val = m.byDate.get(date);
      if (val !== undefined) lastKnown[m.key] = val;
      row[m.key] = lastKnown[m.key];
    }
    return row;
  });

  return {
    timeframe,
    stocks: compared.map(({ normalizedPoints: _omit, ...rest }) => rest),
    normalizedTimeline,
    failed,
    currencyNotice:
      'Chart lines show normalized percentage returns from period start (0%) so equities listed in different currencies (e.g. USD, INR, JPY, EUR) are compared fairly without raw price distortion.',
    lastUpdated: new Date().toISOString(),
  };
}

function selectHomeBenchmark(exchange: ExchangeCode): {
  name: string;
  yahooSymbol: string;
  exchange: ExchangeCode;
} {
  switch (exchange) {
    case 'NSE':
    case 'BSE':
      return { name: 'NIFTY 50', yahooSymbol: '^NSEI', exchange: 'NSE' };
    case 'LSE':
      return { name: 'FTSE 100', yahooSymbol: '^FTSE', exchange: 'LSE' };
    case 'TSE':
      return { name: 'Nikkei 225', yahooSymbol: '^N225', exchange: 'TSE' };
    case 'HKEX':
    case 'SSE':
    case 'SZSE':
      return { name: 'Hang Seng Index', yahooSymbol: '^HSI', exchange: 'HKEX' };
    case 'XETRA':
      return { name: 'DAX 40', yahooSymbol: '^GDAXI', exchange: 'XETRA' };
    case 'EPA':
      return { name: 'CAC 40', yahooSymbol: '^FCHI', exchange: 'EPA' };
    case 'ASX':
      return { name: 'S&P/ASX 200', yahooSymbol: '^AXJO', exchange: 'ASX' };
    case 'KRX':
      return { name: 'KOSPI', yahooSymbol: '^KS11', exchange: 'KRX' };
    default:
      return { name: 'S&P 500', yahooSymbol: '^GSPC', exchange: 'NYSE' };
  }
}

export async function fetchSectorAndPeersContext(
  quote: StockQuote,
  stockHistory: OhlcvBar[],
  stockFundamentals?: StockFundamentals | null
) {
  const benchmarkMeta = selectHomeBenchmark(quote.exchange);
  const stockReturns = extractDailyReturns(stockHistory);

  // Pick up to 4 real peer competitors in the same sector (preferring same region first)
  const sameSector = GLOBAL_STOCK_CATALOG.filter(
    (s) =>
      s.symbol !== quote.symbol &&
      s.sector.toLowerCase() === quote.sector.toLowerCase()
  );
  const regionalPeers = sameSector.filter((s) => s.region === quote.region);
  const crossRegionalPeers = sameSector.filter((s) => s.region !== quote.region);
  const fallbackRegional = GLOBAL_STOCK_CATALOG.filter(
    (s) => s.symbol !== quote.symbol && s.region === quote.region
  );

  const peerCandidates = [...regionalPeers, ...crossRegionalPeers, ...fallbackRegional].slice(0, 4);

  const withSoftTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  const [benchRes, sp500Res, fxSnap, peersSettled] = await Promise.all([
    withSoftTimeout(
      fetchStockChart(benchmarkMeta.yahooSymbol, '6M', benchmarkMeta.exchange).catch(() => null),
      4500,
      null
    ),
    benchmarkMeta.yahooSymbol === '^GSPC'
      ? Promise.resolve(null)
      : withSoftTimeout(fetchStockChart('^GSPC', '1M', 'NYSE').catch(() => null), 4000, null),
    withSoftTimeout(getFxRates(quote.currency).catch(() => null), 3500, null),
    Promise.allSettled(
      peerCandidates.map((p) =>
        withSoftTimeout(
          (async () => {
            const { quote: pq, history: ph } = await fetchStockChart(p.yahooSymbol, '6M', p.exchange);
            const tech = computeTechnicalAnalysis(ph);
            const fund = await withSoftTimeout(fetchStockFundamentals(pq), 3500, null);
            const firstClose = ph[0]?.close || pq.price;
            const lastClose = ph[ph.length - 1]?.close || pq.price;
            const return6mPct =
              firstClose > 0 ? Number((((lastClose - firstClose) / firstClose) * 100).toFixed(2)) : null;

            return {
              symbol: pq.symbol,
              exchange: pq.exchange,
              name: pq.name,
              country: pq.country,
              sector: pq.sector,
              currency: pq.currency,
              price: pq.price,
              changePercent: pq.changePercent,
              return6mPct,
              marketCap: fund?.marketCap ?? pq.marketCap,
              revenue: fund?.revenue ?? null,
              eps: fund?.eps ?? pq.eps,
              trailingPE: fund?.trailingPE ?? pq.trailingPE,
              priceToBook: fund?.priceToBook ?? null,
              profitMarginPct: fund?.profitMarginPct ?? null,
              roePct: fund?.roePct ?? null,
              revenueGrowthPct: fund?.revenueGrowthPct ?? null,
              rsi14: tech.summary.rsi14,
              trend: tech.summary.trend,
              annualizedVolatilityPct: tech.summary.annualizedVolatilityPct,
            };
          })(),
          5000,
          null
        )
      )
    ),
  ]);

  const benchReturns = benchRes ? extractDailyReturns(benchRes.history) : [];
  const calculatedBeta =
    benchReturns.length >= 15 ? calcBeta(stockReturns, benchReturns) : null;

  const benchFirst = benchRes?.history[0]?.close ?? null;
  const benchLast = benchRes?.history[benchRes.history.length - 1]?.close ?? null;
  const bench6mPct =
    benchFirst && benchLast && benchFirst > 0
      ? Number((((benchLast - benchFirst) / benchFirst) * 100).toFixed(2))
      : null;

  const peers = peersSettled
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);

  const sectorAvgDayPct =
    peers.length > 0
      ? Number(
          (
            (peers.reduce((s, p) => s + p.changePercent, quote.changePercent) /
              (peers.length + 1))
          ).toFixed(2)
        )
      : quote.changePercent;

  const sectorAvg6mPct = (() => {
    const valid = peers.map((p) => p.return6mPct).filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
  })();

  // Honest peer-relative valuation computation from real live multiples only
  const peerPEs = peers
    .map((p) => p.trailingPE)
    .filter((v): v is number => typeof v === 'number' && v > 0 && v < 250);
  const peerPBs = peers
    .map((p) => p.priceToBook)
    .filter((v): v is number => typeof v === 'number' && v > 0 && v < 120);
  const peerROEs = peers
    .map((p) => p.roePct)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const avg = (arr: number[]) =>
    arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;
  const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return Number((s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]).toFixed(2));
  };

  const peerAvgPE = avg(peerPEs);
  const peerMedianPE = median(peerPEs);
  const peerAvgPB = avg(peerPBs);
  const peerAvgROE = avg(peerROEs);
  const stockPE = stockFundamentals?.trailingPE ?? quote.trailingPE;

  let relativeValuation: {
    peerAvgPE: number | null;
    peerMedianPE: number | null;
    peerAvgPB: number | null;
    peerAvgROE: number | null;
    pePremiumDiscountPct: number | null;
    assessment: 'Undervalued vs Peers' | 'Fairly Valued vs Peers' | 'Overvalued vs Peers' | 'Insufficient Peer Data';
    explanation: string;
  } = {
    peerAvgPE,
    peerMedianPE,
    peerAvgPB,
    peerAvgROE,
    pePremiumDiscountPct: null,
    assessment: 'Insufficient Peer Data',
    explanation:
      'Insufficient verified peer trailing P/E multiples returned by the exchange feed to compute a reliable peer-relative valuation.',
  };

  if (stockPE && stockPE > 0 && peerMedianPE && peerMedianPE > 0) {
    const diffPct = Number((((stockPE - peerMedianPE) / peerMedianPE) * 100).toFixed(1));
    const assessment =
      diffPct <= -15
        ? 'Undervalued vs Peers'
        : diffPct >= 15
          ? 'Overvalued vs Peers'
          : 'Fairly Valued vs Peers';
    relativeValuation = {
      peerAvgPE,
      peerMedianPE,
      peerAvgPB,
      peerAvgROE,
      pePremiumDiscountPct: diffPct,
      assessment,
      explanation: `${quote.symbol} trades at ${stockPE.toFixed(1)}x trailing P/E compared to the live ${quote.sector} peer median of ${peerMedianPE.toFixed(1)}x (${diffPct >= 0 ? '+' : ''}${diffPct}% ${diffPct >= 0 ? 'premium' : 'discount'}). Relative multiples should always be weighed alongside growth, margins, and balance-sheet leverage.`,
    };
  }

  const usdRate = fxSnap?.rates?.USD ?? (quote.currency === 'USD' ? 1 : null);
  const inrRate = fxSnap?.rates?.INR ?? (quote.currency === 'INR' ? 1 : null);
  const eurRate = fxSnap?.rates?.EUR ?? (quote.currency === 'EUR' ? 1 : null);

  return {
    benchmark: benchRes
      ? {
          name: benchmarkMeta.name,
          symbol: benchmarkMeta.yahooSymbol,
          exchange: benchmarkMeta.exchange,
          price: benchRes.quote.price,
          changePercent: benchRes.quote.changePercent,
          return6mPct: bench6mPct,
        }
      : null,
    globalReference: sp500Res
      ? {
          name: 'S&P 500',
          price: sp500Res.quote.price,
          changePercent: sp500Res.quote.changePercent,
        }
      : benchRes && benchmarkMeta.yahooSymbol === '^GSPC'
        ? {
            name: 'S&P 500',
            price: benchRes.quote.price,
            changePercent: benchRes.quote.changePercent,
          }
        : null,
    calculatedBeta,
    relativeValuation,
    sectorPerformance: {
      sector: quote.sector,
      peerSampleSize: peers.length,
      avgDayChangePct: sectorAvgDayPct,
      avg6mReturnPct: sectorAvg6mPct,
      relativeTrend:
        sectorAvg6mPct === null
          ? 'Insufficient peer history'
          : sectorAvg6mPct > 8
            ? 'Sector Outperforming'
            : sectorAvg6mPct < -5
              ? 'Sector Under Pressure'
              : 'Sector Consolidating',
    },
    currencyExposure: {
      reportingCurrency: quote.currency,
      exchangeCountry: quote.country,
      fxToUsd: usdRate ? Number(usdRate.toFixed(4)) : null,
      fxToInr: inrRate ? Number(inrRate.toFixed(4)) : null,
      fxToEur: eurRate ? Number(eurRate.toFixed(4)) : null,
      fxSource: fxSnap?.source || 'Unavailable',
      fxUpdatedAt: fxSnap?.fetchedAt || null,
    },
    peers,
  };
}

export const yahooGlobalAdapter: MarketDataProviderAdapter = {
  id: 'yahoo-global',
  name: 'Yahoo Finance Global Exchange Adapter',
  supportedExchanges: Object.keys(GLOBAL_EXCHANGES) as ExchangeCode[],
  fetchChart: fetchStockChart,
};
