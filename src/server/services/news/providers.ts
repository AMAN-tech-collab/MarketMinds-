import { env } from '../../config/env.ts';
import { classifyHttpStatus, fetchWithTimeout, NewsProviderError } from './resilience.ts';
import type { FetchLike, NewsArticle, NewsProvider, NewsQueryContext, NewsSentiment } from './types.ts';

const POSITIVE_WORDS = [
  'surge', 'surges', 'rally', 'rallies', 'gain', 'gains', 'jump', 'jumps', 'record high',
  'profit rises', 'profit jumps', 'beats', 'beat', 'upgrade', 'upgraded', 'outperform', 'growth',
  'bullish', 'expansion', 'order win', 'dividend', 'buyback', 'strong', 'rebound', 'soars',
  'boost', 'positive', 'record', 'approval', 'breakout', 'higher', 'tops estimates', 'optimism',
  'acquisition', 'partnership', 'raises outlook', 'raises guidance', 'surpasses',
];

const NEGATIVE_WORDS = [
  'fall', 'falls', 'drop', 'drops', 'plunge', 'plunges', 'slump', 'slumps', 'loss', 'losses',
  'downgrade', 'downgraded', 'decline', 'declines', 'weak', 'bearish', 'selloff', 'sell-off',
  'crash', 'penalty', 'probe', 'investigation', 'lawsuit', 'warning', 'misses', 'missed', 'cut', 'cuts',
  'lower', 'tumbles', 'slides', 'pressure', 'risk', 'deficit', 'fraud', 'default', 'recession', 'tariff',
  'layoffs', 'recall', 'bankruptcy', 'fine', 'sanctions', 'slips',
];

const TICKER_BLACKLIST = new Set([
  'THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'WILL', 'HAVE', 'ARE', 'WAS', 'NOT', 'BUT',
  'NEW', 'NOW', 'ALL', 'OUT', 'TOP', 'BIG', 'HIGH', 'LOW', 'CEO', 'CFO', 'IPO', 'ETF', 'GDP', 'CPI',
  'FED', 'ECB', 'RBI', 'BOJ', 'IMF', 'SEC', 'SEBI', 'USD', 'INR', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD',
  'NSE', 'BSE', 'NYSE', 'LSE', 'ASX', 'TSX', 'KRX', 'SGX', 'USA', 'UK', 'EU', 'AI', 'IT', 'EV', 'Q1',
  'Q2', 'Q3', 'Q4', 'FY', 'YOY', 'QOQ', 'EPS', 'PE', 'PB', 'ROE', 'API', 'RSS', 'NEWS', 'LIVE',
  'BUY', 'SELL', 'HOLD', 'WAIT', 'STOCK', 'SHARES', 'MARKET', 'GLOBAL', 'INDIA', 'US', 'CNBC', 'BBC',
]);

const KNOWN_COMPANY_TICKERS: Array<[RegExp, string]> = [
  [/\bapple\b|\baapl\b/i, 'AAPL'],
  [/\bmicrosoft\b|\bmsft\b/i, 'MSFT'],
  [/\bnvidia\b|\bnvda\b/i, 'NVDA'],
  [/\bamazon\b|\bamzn\b/i, 'AMZN'],
  [/\balphabet\b|\bgoogle\b|\bgoogl?\b/i, 'GOOGL'],
  [/\bmeta platforms\b|\bfacebook\b/i, 'META'],
  [/\btesla\b|\btsla\b/i, 'TSLA'],
  [/\bnetflix\b|\bnflx\b/i, 'NFLX'],
  [/\bjpmorgan\b|\bjp morgan\b|\bjpm\b/i, 'JPM'],
  [/\breliance\b/i, 'RELIANCE'],
  [/\btcs\b|tata consultancy/i, 'TCS'],
  [/\binfosys\b|\binfy\b/i, 'INFY'],
  [/\bhdfc bank\b|\bhdfcbank\b/i, 'HDFCBANK'],
  [/\bicici bank\b|\bicicibank\b/i, 'ICICIBANK'],
  [/\bsbi\b|state bank of india/i, 'SBIN'],
  [/\bairtel\b|bharti airtel/i, 'BHARTIARTL'],
  [/\btata motors\b/i, 'TATAMOTORS'],
  [/\btoyota\b/i, '7203'],
  [/\bsony\b/i, '6758'],
  [/\bsamsung\b/i, '005930'],
  [/\bhsbc\b/i, 'HSBA'],
  [/\bshell\b/i, 'SHEL'],
  [/\basml\b/i, 'ASML'],
  [/\bsap\b/i, 'SAP'],
  [/\balibaba\b|\bbaba\b/i, 'BABA'],
  [/\btencent\b/i, '0700'],
  [/\bsun pharma\b/i, 'SUNPHARMA'],
  [/\bwipro\b/i, 'WIPRO'],
  [/\bitc\b/i, 'ITC'],
  [/\badani\b/i, 'ADANIENT'],
];

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; MarketMinds/2.0; +https://marketminds.app)',
  Accept: 'application/json, application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
};

export function classifySentiment(
  title: string,
  summary?: string | null
): { sentiment: NewsSentiment; score: number } {
  const combined = `${title} ${summary || ''}`.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) {
    if (combined.includes(w)) score += 1;
  }
  for (const w of NEGATIVE_WORDS) {
    if (combined.includes(w)) score -= 1;
  }
  if (score > 0) {
    return { sentiment: 'Positive', score: Math.min(1, Number((score * 0.3).toFixed(2))) };
  }
  if (score < 0) {
    return { sentiment: 'Negative', score: Math.max(-1, Number((score * 0.3).toFixed(2))) };
  }
  return { sentiment: 'Neutral', score: 0 };
}

export function decodeXmlEntities(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeIsoDate(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') {
    return new Date().toISOString();
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Unix seconds vs milliseconds
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof raw === 'string') {
    // Handle Alpha Vantage YYYYMMDDTHHMMSS format
    const avMatch = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (avMatch) {
      const iso = `${avMatch[1]}-${avMatch[2]}-${avMatch[3]}T${avMatch[4]}:${avMatch[5]}:${avMatch[6]}Z`;
      if (!Number.isNaN(Date.parse(iso))) return iso;
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function cleanSummary(raw: string | null | undefined, title: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = decodeXmlEntities(raw).trim();
  if (!cleaned || cleaned.length < 18) return null;
  // Avoid repeating the headline verbatim as a summary
  if (cleaned.toLowerCase() === title.toLowerCase()) return null;
  if (cleaned.toLowerCase().startsWith(title.toLowerCase()) && cleaned.length < title.length + 25) {
    return null;
  }
  return cleaned.length > 260 ? `${cleaned.slice(0, 257).trimEnd()}...` : cleaned;
}

export function extractRelatedTickers(
  title: string,
  summary: string | null,
  explicitTickers: string[] = [],
  requestedTicker?: string
): string[] {
  const found = new Set<string>();
  const addClean = (t: string) => {
    const clean = t.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
    if (!clean || clean.length < 1 || clean.length > 14) return;
    const base = clean.split('.')[0];
    if (TICKER_BLACKLIST.has(base)) return;
    found.add(clean);
  };

  if (requestedTicker) addClean(requestedTicker);
  for (const t of explicitTickers) {
    if (typeof t === 'string') addClean(t);
  }

  const text = `${title} ${summary || ''}`;
  // Match explicit exchange/cashtag patterns like (NASDAQ: AAPL), (NSE: TCS), $NVDA
  const explicitRegex = /(?:\$([A-Z]{1,6})\b|\((?:NASDAQ|NYSE|NSE|BSE|LSE|TSE|HKEX):\s*([A-Z0-9.-]{1,12})\))/g;
  let m: RegExpExecArray | null;
  while ((m = explicitRegex.exec(text)) !== null) {
    addClean(m[1] || m[2] || '');
  }

  for (const [pattern, ticker] of KNOWN_COMPANY_TICKERS) {
    if (pattern.test(text)) {
      found.add(ticker);
    }
  }

  return Array.from(found).slice(0, 5);
}

function inferCountry(title: string, summary: string | null, defaultCountry: string): string {
  if (defaultCountry && defaultCountry !== 'All' && defaultCountry !== 'Global') {
    return defaultCountry;
  }
  const text = `${title} ${summary || ''}`.toLowerCase();
  if (/\b(nse|bse|nifty|sensex|sebi|rbi|mumbai|india|indian|rupee|dalal)\b/.test(text)) return 'India';
  if (/\b(wall street|nasdaq|nyse|s&p 500|dow jones|federal reserve|sec|u\.s\.|us stocks|treasury)\b/.test(text)) return 'US';
  if (/\b(ftse|london|bank of england|uk |britain|british)\b/.test(text)) return 'UK';
  if (/\b(ecb|eurozone|dax|cac 40|frankfurt|paris|europe|european)\b/.test(text)) return 'Europe';
  if (/\b(nikkei|tokyo|bank of japan|hang seng|hong kong|shanghai|china|kospi|asx|australia|singapore)\b/.test(text)) return 'Asia-Pacific';
  return 'Global';
}

function makeArticleId(providerId: string, link: string, idx: number): string {
  const hash = Buffer.from(link).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  return `${providerId}-${idx}-${hash}`;
}

function buildArticle(params: {
  providerId: string;
  providerName: string;
  idx: number;
  title: string;
  summary?: string | null;
  link: string;
  source: string;
  publishedAt: string | number | null | undefined;
  category: string;
  defaultCountry: string;
  explicitTickers?: string[];
  requestedTicker?: string;
  explicitSentiment?: { sentiment: NewsSentiment; score: number };
}): NewsArticle | null {
  const title = decodeXmlEntities(params.title || '');
  const link = sanitizeUrl(params.link);
  if (!title || title.length < 8 || !link) return null;

  const summary = cleanSummary(params.summary, title);
  const publishedIso = normalizeIsoDate(params.publishedAt);
  const sentiment = params.explicitSentiment ?? classifySentiment(title, summary);
  const relatedTickers = extractRelatedTickers(
    title,
    summary,
    params.explicitTickers,
    params.requestedTicker
  );
  const country = inferCountry(title, summary, params.defaultCountry);

  return {
    id: makeArticleId(params.providerId, link, params.idx),
    title,
    summary,
    link,
    source: decodeXmlEntities(params.source || params.providerName) || params.providerName,
    publishedAt: publishedIso,
    published_at: publishedIso,
    category: params.category,
    country,
    relatedTickers,
    sentiment: sentiment.sentiment,
    sentimentScore: sentiment.score,
    provider: params.providerName,
  };
}

function parseRssXml(
  xml: string,
  options: {
    providerId: string;
    providerName: string;
    defaultSource: string;
    category: string;
    defaultCountry: string;
    requestedTicker?: string;
    maxItems?: number;
  }
): NewsArticle[] {
  if (!xml || !/<(rss|feed|rdf:RDF|item|entry)\b/i.test(xml)) {
    throw new NewsProviderError(
      `${options.providerName} returned malformed XML/RSS payload.`,
      'MALFORMED_RESPONSE',
      { retryable: false }
    );
  }

  const articles: NewsArticle[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  let idx = 0;
  const maxItems = options.maxItems ?? 25;

  while ((match = itemRegex.exec(xml)) !== null && articles.length < maxItems) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const pubDateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';
    const link = linkMatch ? decodeXmlEntities(linkMatch[1]) : '';
    if (!rawTitle || !link) continue;

    let title = rawTitle;
    let source = sourceMatch ? decodeXmlEntities(sourceMatch[1]) : options.defaultSource;
    const dashSplit = rawTitle.lastIndexOf(' - ');
    if (dashSplit > 15 && !sourceMatch && options.providerId === 'google-news-rss') {
      title = rawTitle.slice(0, dashSplit).trim();
      source = rawTitle.slice(dashSplit + 3).trim();
    } else if (dashSplit > 15 && rawTitle.endsWith(` - ${source}`)) {
      title = rawTitle.slice(0, dashSplit).trim();
    }

    const art = buildArticle({
      providerId: options.providerId,
      providerName: options.providerName,
      idx: idx++,
      title,
      summary: descMatch ? descMatch[1] : null,
      link,
      source,
      publishedAt: pubDateMatch ? decodeXmlEntities(pubDateMatch[1]) : undefined,
      category: options.category,
      defaultCountry: options.defaultCountry,
      requestedTicker: options.requestedTicker,
    });
    if (art) articles.push(art);
  }

  return articles;
}

// ============================================================================
// 1. COMMERCIAL API PROVIDERS (Auto-enabled when API key env var is set)
// ============================================================================

export const finnhubNewsProvider: NewsProvider = {
  id: 'finnhub',
  name: 'Finnhub Financial News API',
  tier: 'commercial',
  requiresApiKey: true,
  isConfigured: () => Boolean(env.finnhubApiKey),
  supports: () => true,
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const key = env.finnhubApiKey;
    if (!key) {
      throw new NewsProviderError('Finnhub API key not configured.', 'INVALID_API_KEY');
    }

    let url: URL;
    if (ctx.ticker) {
      const to = new Date();
      const from = new Date(Date.now() - 14 * 86_400_000);
      url = new URL('https://finnhub.io/api/v1/company-news');
      url.searchParams.set('symbol', ctx.ticker.toUpperCase());
      url.searchParams.set('from', from.toISOString().slice(0, 10));
      url.searchParams.set('to', to.toISOString().slice(0, 10));
      url.searchParams.set('token', key);
    } else {
      const finnhubCategory =
        ctx.category === 'Mergers & Acquisitions' ? 'merger' : 'general';
      url = new URL('https://finnhub.io/api/v1/news');
      url.searchParams.set('category', finnhubCategory);
      url.searchParams.set('token', key);
    }

    const resp = await fetchWithTimeout(url.toString(), { headers: REQUEST_HEADERS }, timeoutMs, fetchFn, this.name);
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);

    let data: any;
    try {
      data = await resp.json();
    } catch {
      throw new NewsProviderError(`${this.name} returned malformed JSON.`, 'MALFORMED_RESPONSE');
    }
    if (data?.error) {
      const msg = String(data.error);
      if (/api key|invalid|token|unauthorized/i.test(msg)) {
        throw new NewsProviderError(`${this.name}: ${msg}`, 'INVALID_API_KEY', { statusCode: 401 });
      }
      throw new NewsProviderError(`${this.name}: ${msg}`, 'HTTP_ERROR');
    }
    if (!Array.isArray(data)) {
      throw new NewsProviderError(`${this.name} returned unexpected payload format.`, 'MALFORMED_RESPONSE');
    }

    const articles: NewsArticle[] = [];
    for (let i = 0; i < Math.min(data.length, 30); i += 1) {
      const item = data[i];
      const art = buildArticle({
        providerId: this.id,
        providerName: this.name,
        idx: i,
        title: item?.headline || '',
        summary: item?.summary || null,
        link: item?.url || '',
        source: item?.source || 'Finnhub',
        publishedAt: item?.datetime,
        category: ctx.category,
        defaultCountry: ctx.country,
        explicitTickers: typeof item?.related === 'string' ? item.related.split(',') : [],
        requestedTicker: ctx.ticker,
      });
      if (art) articles.push(art);
    }
    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned no matching articles.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

export const alphaVantageNewsProvider: NewsProvider = {
  id: 'alphavantage',
  name: 'Alpha Vantage News & Sentiment API',
  tier: 'commercial',
  requiresApiKey: true,
  isConfigured: () => Boolean(env.alphaVantageApiKey),
  supports: () => true,
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const key = env.alphaVantageApiKey;
    if (!key) {
      throw new NewsProviderError('Alpha Vantage API key not configured.', 'INVALID_API_KEY');
    }
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'NEWS_SENTIMENT');
    url.searchParams.set('limit', '25');
    url.searchParams.set('apikey', key);
    if (ctx.ticker) {
      url.searchParams.set('tickers', ctx.ticker.toUpperCase());
    } else {
      const topicMap: Record<string, string> = {
        Earnings: 'earnings',
        'Mergers & Acquisitions': 'mergers_and_acquisitions',
        Economy: 'economy_macro',
        'Central Banks': 'economy_monetary',
        Technology: 'technology',
        Banking: 'finance',
        Energy: 'energy_transportation',
      };
      url.searchParams.set('topics', topicMap[ctx.category] || 'financial_markets');
    }

    const resp = await fetchWithTimeout(url.toString(), { headers: REQUEST_HEADERS }, timeoutMs, fetchFn, this.name);
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);

    let data: any;
    try {
      data = await resp.json();
    } catch {
      throw new NewsProviderError(`${this.name} returned malformed JSON.`, 'MALFORMED_RESPONSE');
    }
    if (data?.Information || data?.Note) {
      throw new NewsProviderError(
        `${this.name} rate limit or plan quota reached.`,
        'RATE_LIMITED',
        { statusCode: 429, retryable: false }
      );
    }
    if (data?.['Error Message']) {
      throw new NewsProviderError(`${this.name}: ${data['Error Message']}`, 'INVALID_API_KEY', {
        statusCode: 401,
      });
    }
    if (!Array.isArray(data?.feed)) {
      throw new NewsProviderError(`${this.name} returned malformed feed payload.`, 'MALFORMED_RESPONSE');
    }

    const articles: NewsArticle[] = [];
    for (let i = 0; i < Math.min(data.feed.length, 25); i += 1) {
      const item = data.feed[i];
      const rawScore = Number(item?.overall_sentiment_score);
      const explicitSentiment = Number.isFinite(rawScore)
        ? {
            sentiment: (rawScore >= 0.15 ? 'Positive' : rawScore <= -0.15 ? 'Negative' : 'Neutral') as NewsSentiment,
            score: Number(Math.max(-1, Math.min(1, rawScore)).toFixed(2)),
          }
        : undefined;
      const tickers = Array.isArray(item?.ticker_sentiment)
        ? item.ticker_sentiment.map((t: any) => String(t?.ticker || '')).filter(Boolean)
        : [];
      const art = buildArticle({
        providerId: this.id,
        providerName: this.name,
        idx: i,
        title: item?.title || '',
        summary: item?.summary || null,
        link: item?.url || '',
        source: item?.source || 'Alpha Vantage',
        publishedAt: item?.time_published,
        category: ctx.category,
        defaultCountry: ctx.country,
        explicitTickers: tickers,
        requestedTicker: ctx.ticker,
        explicitSentiment,
      });
      if (art) articles.push(art);
    }
    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned no matching articles.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

export const marketauxNewsProvider: NewsProvider = {
  id: 'marketaux',
  name: 'Marketaux Global Financial News API',
  tier: 'commercial',
  requiresApiKey: true,
  isConfigured: () => Boolean(env.marketauxApiKey),
  supports: () => true,
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const key = env.marketauxApiKey;
    if (!key) {
      throw new NewsProviderError('Marketaux API key not configured.', 'INVALID_API_KEY');
    }
    const url = new URL('https://api.marketaux.com/v1/news/all');
    url.searchParams.set('api_token', key);
    url.searchParams.set('language', 'en');
    url.searchParams.set('limit', '20');
    if (ctx.ticker) url.searchParams.set('symbols', ctx.ticker.toUpperCase());
    if (ctx.rawQuery) url.searchParams.set('search', ctx.rawQuery);
    const countryIsoMap: Record<string, string> = {
      US: 'us',
      India: 'in',
      UK: 'gb',
      Europe: 'de,fr,gb',
      'Asia-Pacific': 'jp,hk,au,sg',
    };
    if (countryIsoMap[ctx.country]) {
      url.searchParams.set('countries', countryIsoMap[ctx.country]);
    }

    const resp = await fetchWithTimeout(url.toString(), { headers: REQUEST_HEADERS }, timeoutMs, fetchFn, this.name);
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);

    let data: any;
    try {
      data = await resp.json();
    } catch {
      throw new NewsProviderError(`${this.name} returned malformed JSON.`, 'MALFORMED_RESPONSE');
    }
    if (!Array.isArray(data?.data)) {
      throw new NewsProviderError(`${this.name} returned unexpected payload.`, 'MALFORMED_RESPONSE');
    }
    const articles: NewsArticle[] = [];
    for (let i = 0; i < data.data.length; i += 1) {
      const item = data.data[i];
      const tickers = Array.isArray(item?.entities)
        ? item.entities.map((e: any) => String(e?.symbol || '')).filter(Boolean)
        : [];
      const art = buildArticle({
        providerId: this.id,
        providerName: this.name,
        idx: i,
        title: item?.title || '',
        summary: item?.description || item?.snippet || null,
        link: item?.url || '',
        source: item?.source || 'Marketaux',
        publishedAt: item?.published_at,
        category: ctx.category,
        defaultCountry: ctx.country,
        explicitTickers: tickers,
        requestedTicker: ctx.ticker,
      });
      if (art) articles.push(art);
    }
    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned no matching articles.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

export const gnewsProvider: NewsProvider = {
  id: 'gnews',
  name: 'GNews Financial API',
  tier: 'commercial',
  requiresApiKey: true,
  isConfigured: () => Boolean(env.gnewsApiKey),
  supports: () => true,
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const key = env.gnewsApiKey;
    if (!key) {
      throw new NewsProviderError('GNews API key not configured.', 'INVALID_API_KEY');
    }
    const url = new URL('https://gnews.io/api/v4/search');
    url.searchParams.set('q', ctx.query);
    url.searchParams.set('lang', 'en');
    url.searchParams.set('max', '15');
    url.searchParams.set('apikey', key);

    const resp = await fetchWithTimeout(url.toString(), { headers: REQUEST_HEADERS }, timeoutMs, fetchFn, this.name);
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);

    let data: any;
    try {
      data = await resp.json();
    } catch {
      throw new NewsProviderError(`${this.name} returned malformed JSON.`, 'MALFORMED_RESPONSE');
    }
    if (!Array.isArray(data?.articles)) {
      throw new NewsProviderError(`${this.name} returned unexpected payload.`, 'MALFORMED_RESPONSE');
    }
    const articles: NewsArticle[] = [];
    for (let i = 0; i < data.articles.length; i += 1) {
      const item = data.articles[i];
      const art = buildArticle({
        providerId: this.id,
        providerName: this.name,
        idx: i,
        title: item?.title || '',
        summary: item?.description || null,
        link: item?.url || '',
        source: item?.source?.name || 'GNews',
        publishedAt: item?.publishedAt,
        category: ctx.category,
        defaultCountry: ctx.country,
        requestedTicker: ctx.ticker,
      });
      if (art) articles.push(art);
    }
    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned no matching articles.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

// ============================================================================
// 2. ZERO-KEY LEGITIMATE PRIMARY & SECONDARY FINANCIAL NEWS PROVIDERS
// ============================================================================

const YAHOO_CATEGORY_QUERIES: Record<string, string> = {
  Global: 'global stock market equities',
  'US Markets': 'S&P 500 Nasdaq Wall Street stocks',
  India: 'India Nifty Sensex NSE BSE stocks',
  Europe: 'FTSE DAX Europe stock market',
  'Asia-Pacific': 'Nikkei Hang Seng Asia stock market',
  Earnings: 'quarterly earnings results revenue guidance',
  'Central Banks': 'Federal Reserve ECB RBI interest rates',
  Economy: 'inflation GDP economy bond yields',
  'Mergers & Acquisitions': 'merger acquisition buyout deal stocks',
  Technology: 'semiconductor AI technology stocks NVDA MSFT AAPL',
  Healthcare: 'pharma biotech healthcare stocks',
  Market: 'Nifty Sensex NSE Indian equities',
  Banking: 'HDFC ICICI SBI Bank Nifty banking stocks',
  IT: 'TCS Infosys Wipro Indian IT stocks',
  Energy: 'Reliance Industries crude oil energy stocks',
  Auto: 'Tata Motors Maruti Tesla auto stocks',
  Pharma: 'Sun Pharma Cipla Dr Reddys pharma stocks',
};

export const yahooFinanceNewsProvider: NewsProvider = {
  id: 'yahoo-finance-news',
  name: 'Yahoo Finance Global News API',
  tier: 'primary',
  requiresApiKey: false,
  isConfigured: () => true,
  supports: () => true,
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const searchQ =
      ctx.ticker ||
      ctx.rawQuery ||
      YAHOO_CATEGORY_QUERIES[ctx.category] ||
      ctx.query;

    const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
    url.searchParams.set('q', searchQ);
    url.searchParams.set('quotesCount', '0');
    url.searchParams.set('newsCount', '25');
    url.searchParams.set('enableFuzzyQuery', 'false');

    const resp = await fetchWithTimeout(
      url.toString(),
      { headers: REQUEST_HEADERS },
      timeoutMs,
      fetchFn,
      this.name
    );
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);

    let data: any;
    try {
      data = await resp.json();
    } catch {
      throw new NewsProviderError(`${this.name} returned malformed JSON.`, 'MALFORMED_RESPONSE');
    }

    const rawNews = Array.isArray(data?.news) ? data.news : [];
    const articles: NewsArticle[] = [];
    for (let i = 0; i < rawNews.length; i += 1) {
      const item = rawNews[i];
      const art = buildArticle({
        providerId: this.id,
        providerName: this.name,
        idx: i,
        title: item?.title || '',
        summary: item?.summary || null,
        link: item?.link || '',
        source: item?.publisher || 'Yahoo Finance',
        publishedAt: item?.providerPublishTime,
        category: ctx.ticker ? `${ctx.ticker.toUpperCase()} News` : ctx.category,
        defaultCountry: ctx.country,
        explicitTickers: Array.isArray(item?.relatedTickers) ? item.relatedTickers : [],
        requestedTicker: ctx.ticker,
      });
      if (art) articles.push(art);
    }

    // If ticker requested and JSON search yielded few items, supplement via Yahoo Headline RSS
    if (ctx.ticker && articles.length < 5) {
      try {
        const rssUrl = new URL('https://feeds.finance.yahoo.com/rss/2.0/headline');
        rssUrl.searchParams.set('s', ctx.ticker.toUpperCase());
        rssUrl.searchParams.set('region', ctx.country === 'India' ? 'IN' : 'US');
        rssUrl.searchParams.set('lang', 'en-US');
        const rssResp = await fetchWithTimeout(
          rssUrl.toString(),
          { headers: REQUEST_HEADERS },
          Math.min(timeoutMs, 5000),
          fetchFn,
          'Yahoo Finance Headline RSS'
        );
        if (rssResp.ok) {
          const xml = await rssResp.text();
          const rssItems = parseRssXml(xml, {
            providerId: 'yahoo-rss',
            providerName: this.name,
            defaultSource: 'Yahoo Finance',
            category: `${ctx.ticker.toUpperCase()} News`,
            defaultCountry: ctx.country,
            requestedTicker: ctx.ticker,
            maxItems: 15,
          });
          articles.push(...rssItems);
        }
      } catch {
        // Supplemental RSS is best-effort when JSON already worked
      }
    }

    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned no matching headlines.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

const CNBC_FEEDS: Record<string, { url: string; label: string; country: string }> = {
  Global: {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
    label: 'CNBC Finance & Markets RSS',
    country: 'Global',
  },
  'US Markets': {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069',
    label: 'CNBC Investing & US Markets RSS',
    country: 'US',
  },
  Earnings: {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135',
    label: 'CNBC Earnings RSS',
    country: 'US',
  },
  Economy: {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
    label: 'CNBC Economy RSS',
    country: 'Global',
  },
  'Central Banks': {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
    label: 'CNBC Macro & Central Banks RSS',
    country: 'Global',
  },
  Technology: {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910',
    label: 'CNBC Technology RSS',
    country: 'US',
  },
  Healthcare: {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000108',
    label: 'CNBC Healthcare RSS',
    country: 'US',
  },
  'Mergers & Acquisitions': {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
    label: 'CNBC Deal & Finance RSS',
    country: 'Global',
  },
  Europe: {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19794221',
    label: 'CNBC Europe Markets RSS',
    country: 'Europe',
  },
  'Asia-Pacific': {
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19832390',
    label: 'CNBC Asia Markets RSS',
    country: 'Asia-Pacific',
  },
};

export const cnbcRssProvider: NewsProvider = {
  id: 'cnbc-rss',
  name: 'CNBC Global Markets RSS',
  tier: 'secondary',
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (ctx) => !ctx.ticker && !ctx.rawQuery,
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const feed = CNBC_FEEDS[ctx.category] || CNBC_FEEDS.Global;
    const resp = await fetchWithTimeout(
      feed.url,
      { headers: REQUEST_HEADERS },
      timeoutMs,
      fetchFn,
      this.name
    );
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);
    const xml = await resp.text();
    const articles = parseRssXml(xml, {
      providerId: this.id,
      providerName: feed.label,
      defaultSource: 'CNBC',
      category: ctx.category,
      defaultCountry: ctx.country !== 'All' ? ctx.country : feed.country,
      maxItems: 22,
    });
    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned empty RSS feed.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

export const economicTimesIndiaProvider: NewsProvider = {
  id: 'economic-times-rss',
  name: 'Economic Times Markets RSS (India NSE/BSE)',
  tier: 'primary',
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (ctx) =>
    !ctx.rawQuery &&
    !ctx.ticker &&
    (ctx.country === 'India' ||
      ['India', 'Market', 'Banking', 'IT', 'Energy', 'Auto', 'Pharma', 'Global'].includes(ctx.category)),
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const feedUrl =
      ctx.category === 'Global'
        ? 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms'
        : 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms';

    const resp = await fetchWithTimeout(
      feedUrl,
      { headers: REQUEST_HEADERS },
      timeoutMs,
      fetchFn,
      this.name
    );
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);
    const xml = await resp.text();
    let articles = parseRssXml(xml, {
      providerId: this.id,
      providerName: this.name,
      defaultSource: 'The Economic Times',
      category: ctx.category,
      defaultCountry: 'India',
      maxItems: 25,
    });

    // Optional sector narrowing for Indian sector tabs without returning empty if broad feed has general NSE news
    const sectorKeywords: Record<string, RegExp> = {
      Banking: /\b(bank|hdfc|icici|sbi|axis|kotak|rbi|nbfc|credit|loan|lender)\b/i,
      IT: /\b(tcs|infosys|wipro|hcl|tech mahindra|it sector|software|ai|outsourcing)\b/i,
      Energy: /\b(reliance|ongc|ntpc|oil|gas|power|energy|renewable|solar|coal|refinery)\b/i,
      Auto: /\b(tata motors|maruti|mahindra|bajaj|hero|auto|ev|vehicle|car)\b/i,
      Pharma: /\b(pharma|sun pharma|cipla|dr reddy|lupin|healthcare|drug|fda|hospital)\b/i,
    };
    const kw = sectorKeywords[ctx.category];
    if (kw) {
      const filtered = articles.filter((a) => kw.test(`${a.title} ${a.summary || ''}`));
      if (filtered.length >= 3) {
        articles = filtered;
      }
    }

    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned empty RSS feed.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

export const bbcBusinessRssProvider: NewsProvider = {
  id: 'bbc-business-rss',
  name: 'BBC Business & Global Economy RSS',
  tier: 'secondary',
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (ctx) =>
    !ctx.ticker &&
    !ctx.rawQuery &&
    (ctx.country === 'UK' ||
      ctx.country === 'Europe' ||
      ['Global', 'Europe', 'Economy', 'Central Banks'].includes(ctx.category)),
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const resp = await fetchWithTimeout(
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      { headers: REQUEST_HEADERS },
      timeoutMs,
      fetchFn,
      this.name
    );
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);
    const xml = await resp.text();
    const articles = parseRssXml(xml, {
      providerId: this.id,
      providerName: this.name,
      defaultSource: 'BBC Business',
      category: ctx.category,
      defaultCountry: ctx.country === 'UK' || ctx.country === 'Europe' ? ctx.country : 'Europe',
      maxItems: 20,
    });
    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned empty RSS feed.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

export const googleNewsRssProvider: NewsProvider = {
  id: 'google-news-rss',
  name: 'Google News Financial RSS',
  tier: 'fallback',
  requiresApiKey: false,
  isConfigured: () => true,
  supports: () => true,
  async fetchArticles(ctx, fetchFn, timeoutMs) {
    const regionMap: Record<string, { hl: string; gl: string; ceid: string }> = {
      India: { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
      UK: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
      Europe: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
      US: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
    };
    const region = regionMap[ctx.country] || { hl: 'en-US', gl: 'US', ceid: 'US:en' };

    const rssUrl = new URL('https://news.google.com/rss/search');
    rssUrl.searchParams.set('q', ctx.query);
    rssUrl.searchParams.set('hl', region.hl);
    rssUrl.searchParams.set('gl', region.gl);
    rssUrl.searchParams.set('ceid', region.ceid);

    const resp = await fetchWithTimeout(
      rssUrl.toString(),
      { headers: REQUEST_HEADERS },
      timeoutMs,
      fetchFn,
      this.name
    );
    if (!resp.ok) throw classifyHttpStatus(resp.status, this.name);
    const xml = await resp.text();
    const articles = parseRssXml(xml, {
      providerId: this.id,
      providerName: this.name,
      defaultSource: 'Financial Press',
      category: ctx.rawQuery || ctx.ticker ? 'Company Search' : ctx.category,
      defaultCountry: ctx.country,
      requestedTicker: ctx.ticker,
      maxItems: 25,
    });
    if (articles.length === 0) {
      throw new NewsProviderError(`${this.name} returned no matching headlines.`, 'EMPTY_RESPONSE');
    }
    return articles;
  },
};

export const ALL_NEWS_PROVIDERS: NewsProvider[] = [
  finnhubNewsProvider,
  alphaVantageNewsProvider,
  marketauxNewsProvider,
  gnewsProvider,
  yahooFinanceNewsProvider,
  economicTimesIndiaProvider,
  cnbcRssProvider,
  bbcBusinessRssProvider,
  googleNewsRssProvider,
];
