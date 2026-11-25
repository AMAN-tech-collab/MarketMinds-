import { env } from '../config/env.ts';
import {
  ALL_NEWS_PROVIDERS,
  bbcBusinessRssProvider,
  cnbcRssProvider,
  economicTimesIndiaProvider,
  googleNewsRssProvider,
  yahooFinanceNewsProvider,
} from './news/providers.ts';
import {
  executeWithRetry,
  NewsProviderError,
  ProviderCircuitBreakerRegistry,
} from './news/resilience.ts';
import type {
  FetchLike,
  NewsArticle,
  NewsFeedResponse,
  NewsProvider,
  NewsProviderAttempt,
  NewsProviderHealth,
  NewsQueryContext,
  NewsSentiment,
} from './news/types.ts';

export type {
  NewsArticle,
  NewsFeedResponse,
  NewsProviderAttempt,
  NewsProviderHealth,
  NewsSentiment,
} from './news/types.ts';

export const NEWS_CATEGORIES = [
  'Global',
  'US Markets',
  'India',
  'Europe',
  'Asia-Pacific',
  'Economy',
  'Central Banks',
  'Earnings',
  'Mergers & Acquisitions',
  'Technology',
  'Healthcare',
  'Market',
  'Banking',
  'IT',
  'Energy',
  'Auto',
  'Pharma',
] as const;

export const NEWS_COUNTRIES = [
  'All',
  'Global',
  'US',
  'India',
  'UK',
  'Europe',
  'Asia-Pacific',
] as const;

const CATEGORY_QUERY_MAP: Record<string, { query: string; defaultCountry: string }> = {
  Global: { query: 'global stock market S&P 500 Nasdaq Nifty FTSE Nikkei', defaultCountry: 'Global' },
  'US Markets': { query: 'Wall Street S&P 500 Nasdaq Dow Jones NYSE stocks', defaultCountry: 'US' },
  India: { query: 'NSE BSE NIFTY 50 SENSEX Indian stock market', defaultCountry: 'India' },
  Europe: { query: 'European stock market FTSE 100 DAX CAC 40 STOXX', defaultCountry: 'Europe' },
  'Asia-Pacific': { query: 'Nikkei 225 Hang Seng KOSPI ASX 200 Asian stocks', defaultCountry: 'Asia-Pacific' },
  Economy: { query: 'global economy inflation GDP jobs bond yields macro', defaultCountry: 'Global' },
  'Central Banks': { query: 'Federal Reserve ECB Bank of Japan RBI interest rates monetary policy', defaultCountry: 'Global' },
  Earnings: { query: 'quarterly earnings report revenue guidance stock results', defaultCountry: 'Global' },
  'Mergers & Acquisitions': { query: 'merger acquisition buyout takeover deal corporate M&A', defaultCountry: 'Global' },
  Technology: { query: 'semiconductor AI cloud software technology stocks', defaultCountry: 'US' },
  Healthcare: { query: 'biotech pharmaceutical healthcare stocks earnings FDA', defaultCountry: 'Global' },
  Market: { query: 'NSE BSE NIFTY SENSEX Indian stock market', defaultCountry: 'India' },
  Banking: { query: 'Bank Nifty HDFC ICICI SBI Indian banking stocks NSE', defaultCountry: 'India' },
  IT: { query: 'Nifty IT TCS Infosys Wipro HCL Tech Indian IT stocks', defaultCountry: 'India' },
  Energy: { query: 'Reliance Industries ONGC NTPC crude oil energy stocks', defaultCountry: 'India' },
  Auto: { query: 'Tata Motors Maruti Suzuki Mahindra EV auto stocks', defaultCountry: 'India' },
  Pharma: { query: 'Sun Pharma Cipla Dr Reddys Indian pharma stocks', defaultCountry: 'India' },
};

interface CachedFeedEntry {
  data: NewsFeedResponse;
  cachedAtMs: number;
  freshUntilMs: number;
  staleUntilMs: number;
}

const breakerRegistry = new ProviderCircuitBreakerRegistry({
  failureThreshold: 2,
  transientCooldownMs: 60_000,
  authCooldownMs: 300_000,
});

const feedCache = new Map<string, CachedFeedEntry>();
const inflightRequests = new Map<string, Promise<NewsFeedResponse>>();

const CACHED_FALLBACK_NOTICE =
  'Live news is temporarily unavailable. Showing cached articles where available.';

function normalizeCategory(raw?: string): string {
  if (!raw) return 'Global';
  const trimmed = raw.trim();
  const exact = NEWS_CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  return exact || 'Global';
}

function normalizeCountry(raw?: string, categoryDefault = 'All'): string {
  if (!raw || raw.trim().toLowerCase() === 'all') {
    return categoryDefault === 'Global' ? 'All' : categoryDefault;
  }
  const trimmed = raw.trim();
  const exact = NEWS_COUNTRIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  return exact || 'All';
}

function normalizeSentiment(raw?: string): NewsSentiment | undefined {
  if (!raw) return undefined;
  const low = raw.trim().toLowerCase();
  if (low === 'positive') return 'Positive';
  if (low === 'negative') return 'Negative';
  if (low === 'neutral') return 'Neutral';
  return undefined;
}

function selectProvidersForContext(
  ctx: NewsQueryContext,
  overrideProviders?: NewsProvider[]
): NewsProvider[] {
  if (overrideProviders && overrideProviders.length > 0) {
    return overrideProviders.filter((p) => p.isConfigured() && p.supports(ctx));
  }

  const commercial = ALL_NEWS_PROVIDERS.filter(
    (p) => p.tier === 'commercial' && p.isConfigured() && p.supports(ctx)
  );

  // Order built-in providers smartly by region/query so fastest, most relevant feed runs first
  const isIndiaFocus =
    ctx.country === 'India' ||
    ['India', 'Market', 'Banking', 'IT', 'Energy', 'Auto', 'Pharma'].includes(ctx.category);
  const isEuropeFocus = ctx.country === 'UK' || ctx.country === 'Europe' || ctx.category === 'Europe';

  let orderedBuiltIn: NewsProvider[];
  if (ctx.ticker || ctx.rawQuery) {
    orderedBuiltIn = [yahooFinanceNewsProvider, googleNewsRssProvider];
  } else if (isIndiaFocus) {
    orderedBuiltIn = [
      economicTimesIndiaProvider,
      yahooFinanceNewsProvider,
      cnbcRssProvider,
      googleNewsRssProvider,
    ];
  } else if (isEuropeFocus) {
    orderedBuiltIn = [
      bbcBusinessRssProvider,
      cnbcRssProvider,
      yahooFinanceNewsProvider,
      googleNewsRssProvider,
    ];
  } else {
    orderedBuiltIn = [
      cnbcRssProvider,
      yahooFinanceNewsProvider,
      bbcBusinessRssProvider,
      economicTimesIndiaProvider,
      googleNewsRssProvider,
    ];
  }

  return [...commercial, ...orderedBuiltIn.filter((p) => p.isConfigured() && p.supports(ctx))];
}

function deduplicateAndSortArticles(articles: NewsArticle[]): NewsArticle[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const deduped: NewsArticle[] = [];

  for (const art of articles) {
    const normUrl = art.link.toLowerCase().replace(/\/+$/, '');
    const normTitle = art.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 75);
    if (seenUrl.has(normUrl) || (normTitle.length > 15 && seenTitle.has(normTitle))) {
      continue;
    }
    seenUrl.add(normUrl);
    if (normTitle.length > 15) seenTitle.add(normTitle);
    deduped.push(art);
  }

  deduped.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return deduped;
}

function applyClientFilters(articles: NewsArticle[], ctx: NewsQueryContext): NewsArticle[] {
  let result = articles;
  if (ctx.sentiment) {
    result = result.filter((a) => a.sentiment === ctx.sentiment);
  }
  if (ctx.country && ctx.country !== 'All' && ctx.country !== 'Global') {
    const countryMatches = result.filter(
      (a) => a.country.toLowerCase() === ctx.country.toLowerCase()
    );
    // Keep filtered matches when present; if provider already scoped by region, preserve articles
    if (countryMatches.length > 0) {
      result = countryMatches;
    }
  }
  if (ctx.ticker) {
    const tUpper = ctx.ticker.toUpperCase();
    const tickerMatches = result.filter(
      (a) =>
        a.relatedTickers.some((rt) => rt.toUpperCase().includes(tUpper)) ||
        a.title.toUpperCase().includes(tUpper) ||
        (a.summary || '').toUpperCase().includes(tUpper)
    );
    if (tickerMatches.length > 0) {
      result = tickerMatches;
    }
  }
  return result.slice(0, ctx.limit ?? 30);
}

function summarizeSentiment(articles: NewsArticle[]) {
  const positive = articles.filter((a) => a.sentiment === 'Positive').length;
  const negative = articles.filter((a) => a.sentiment === 'Negative').length;
  const neutral = articles.filter((a) => a.sentiment === 'Neutral').length;
  const overallSentiment: NewsSentiment =
    positive > negative + 1 ? 'Positive' : negative > positive + 1 ? 'Negative' : 'Neutral';
  return {
    total: articles.length,
    positive,
    negative,
    neutral,
    overallSentiment,
  };
}

function buildCachedFallbackResponse(
  entry: CachedFeedEntry,
  ctx: NewsQueryContext,
  attempts: NewsProviderAttempt[],
  errorSummary: string
): NewsFeedResponse {
  const filteredArticles = applyClientFilters(entry.data.articles, ctx);
  const ageSeconds = Math.max(1, Math.round((Date.now() - entry.cachedAtMs) / 1000));
  const newestPublishedAt = filteredArticles[0]?.publishedAt || entry.data.published_at || null;
  const nowIso = new Date().toISOString();

  return {
    ...entry.data,
    status: filteredArticles.length > 0 ? 'cached' : 'unavailable',
    articles: filteredArticles,
    summary: summarizeSentiment(filteredArticles),
    providersTried: attempts,
    fetchedAt: entry.data.fetchedAt,
    fetched_at: entry.data.fetchedAt,
    published_at: newestPublishedAt,
    cached: true,
    stale: Date.now() >= entry.freshUntilMs,
    cacheAgeSeconds: ageSeconds,
    partial: false,
    notice: CACHED_FALLBACK_NOTICE,
    error: errorSummary,
    errorMessage: `${CACHED_FALLBACK_NOTICE} (${errorSummary})`,
    // Preserve original fetch time while exposing fallback context
    dataSource: `${entry.data.provider} (Cached · ${nowIso.slice(11, 16)} UTC check)`,
  };
}

export interface FetchNewsOptions {
  query?: string;
  category?: string;
  country?: string;
  ticker?: string;
  sentiment?: string;
  refresh?: boolean;
  limit?: number;
  // Optional overrides for deterministic testing (never exposed via HTTP)
  _fetchFn?: FetchLike;
  _providers?: NewsProvider[];
  _timeoutMs?: number;
  _maxRetries?: number;
  _cacheTtlMs?: number;
  _staleTtlMs?: number;
}

export async function fetchFinancialNews(options: FetchNewsOptions = {}): Promise<NewsFeedResponse> {
  const category = normalizeCategory(options.category);
  const catMeta = CATEGORY_QUERY_MAP[category] || CATEGORY_QUERY_MAP.Global;
  const rawQuery = (options.query || '').trim().slice(0, 80);
  const ticker = (options.ticker || '').trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 16);
  const country = normalizeCountry(options.country, rawQuery || ticker ? 'All' : catMeta.defaultCountry);
  const sentiment = normalizeSentiment(options.sentiment);
  const refresh = Boolean(options.refresh);
  const limit = Math.min(40, Math.max(5, options.limit ?? 28));

  const query = ticker
    ? `${ticker} stock news`
    : rawQuery
      ? `${rawQuery} stock market financial news`
      : catMeta.query;

  const ctx: NewsQueryContext = {
    query,
    rawQuery,
    category,
    country,
    ticker,
    sentiment,
    refresh,
    limit,
  };

  // Cache key intentionally omits sentiment filter so switching sentiment is instantaneous & cache-friendly
  const cacheKey = `${category}|${country}|${ticker}|${rawQuery.toLowerCase()}`;
  const now = Date.now();
  const cacheTtlMs = options._cacheTtlMs ?? env.newsCacheTtlMs;
  const staleTtlMs = options._staleTtlMs ?? env.newsStaleTtlMs;
  const timeoutMs = options._timeoutMs ?? env.newsRequestTimeoutMs;
  const maxRetries = options._maxRetries ?? 1;
  const fetchFn: FetchLike = options._fetchFn ?? globalThis.fetch.bind(globalThis);

  const cachedEntry = feedCache.get(cacheKey);
  if (!refresh && cachedEntry && now < cachedEntry.freshUntilMs) {
    const filtered = applyClientFilters(cachedEntry.data.articles, ctx);
    const ageSeconds = Math.max(0, Math.round((now - cachedEntry.cachedAtMs) / 1000));
    return {
      ...cachedEntry.data,
      articles: filtered,
      summary: summarizeSentiment(filtered),
      published_at: filtered[0]?.publishedAt || cachedEntry.data.published_at,
      cached: true,
      stale: false,
      cacheAgeSeconds: ageSeconds,
    };
  }

  // Request deduplication for concurrent live fetches (skip dedupe when custom test fetchFn injected)
  const dedupeKey = `${cacheKey}|${refresh ? 'refresh' : 'std'}`;
  if (!options._fetchFn && !options._providers) {
    const inflight = inflightRequests.get(dedupeKey);
    if (inflight) {
      const shared = await inflight;
      const filtered = applyClientFilters(shared.articles, ctx);
      return {
        ...shared,
        articles: filtered,
        summary: summarizeSentiment(filtered),
      };
    }
  }

  const runPipeline = async (): Promise<NewsFeedResponse> => {
    const providers = selectProvidersForContext(ctx, options._providers);
    const attempts: NewsProviderAttempt[] = [];
    const collectedArticles: NewsArticle[] = [];
    const succeededProviders: string[] = [];
    let anyProviderFailed = false;
    let emptyResponseCount = 0;

    // Try providers sequentially in priority order; stop once we have rich coverage (or aggregate secondary for Global)
    const desiredCount = category === 'Global' && !rawQuery && !ticker ? 18 : 10;

    for (const provider of providers) {
      if (collectedArticles.length >= desiredCount && succeededProviders.length >= 1) {
        break;
      }

      if (!breakerRegistry.canExecute(provider)) {
        anyProviderFailed = true;
        attempts.push({
          providerId: provider.id,
          providerName: provider.name,
          tier: provider.tier,
          ok: false,
          latencyMs: 0,
          articleCount: 0,
          errorCode: 'CIRCUIT_OPEN',
          errorMessage: `${provider.name} circuit breaker is open after repeated failures.`,
          circuitOpen: true,
        });
        continue;
      }

      const t0 = Date.now();
      try {
        const articles = await executeWithRetry(
          () => provider.fetchArticles(ctx, fetchFn, timeoutMs),
          { maxRetries, baseDelayMs: 220, maxDelayMs: 900 }
        );
        const latencyMs = Date.now() - t0;
        breakerRegistry.recordSuccess(provider, latencyMs);
        succeededProviders.push(provider.name);
        collectedArticles.push(...articles);
        attempts.push({
          providerId: provider.id,
          providerName: provider.name,
          tier: provider.tier,
          ok: true,
          statusCode: 200,
          latencyMs,
          articleCount: articles.length,
        });
      } catch (err: any) {
        const latencyMs = Date.now() - t0;
        const normalizedErr =
          err instanceof NewsProviderError
            ? err
            : new NewsProviderError(
                err?.message || `${provider.name} failed unexpectedly.`,
                'NETWORK_ERROR',
                { retryable: true }
              );

        if (normalizedErr.code === 'EMPTY_RESPONSE') {
          emptyResponseCount += 1;
        } else {
          anyProviderFailed = true;
        }
        breakerRegistry.recordFailure(provider, normalizedErr, latencyMs);
        attempts.push({
          providerId: provider.id,
          providerName: provider.name,
          tier: provider.tier,
          ok: false,
          statusCode: normalizedErr.statusCode,
          latencyMs,
          articleCount: 0,
          errorCode: normalizedErr.code,
          errorMessage: normalizedErr.message,
        });
      }
    }

    const dedupedAll = deduplicateAndSortArticles(collectedArticles);
    const nowIso = new Date().toISOString();

    if (dedupedAll.length > 0) {
      const providerLabel = succeededProviders.join(' + ');
      const partial = anyProviderFailed && succeededProviders.length > 0;
      const baseResponse: NewsFeedResponse = {
        status: partial ? 'partial' : 'ok',
        query: ticker || rawQuery || category,
        category,
        country,
        ticker: ticker || null,
        articles: dedupedAll,
        summary: summarizeSentiment(dedupedAll),
        provider: providerLabel,
        dataSource: providerLabel,
        providersTried: attempts,
        fetchedAt: nowIso,
        fetched_at: nowIso,
        published_at: dedupedAll[0]?.publishedAt || null,
        cached: false,
        stale: false,
        cacheAgeSeconds: 0,
        partial,
        notice: partial
          ? 'One upstream news feed was temporarily degraded; showing verified live headlines from backup provider.'
          : undefined,
      };

      feedCache.set(cacheKey, {
        data: baseResponse,
        cachedAtMs: Date.now(),
        freshUntilMs: Date.now() + cacheTtlMs,
        staleUntilMs: Date.now() + staleTtlMs,
      });

      const filtered = applyClientFilters(dedupedAll, ctx);
      return {
        ...baseResponse,
        articles: filtered,
        summary: summarizeSentiment(filtered),
        published_at: filtered[0]?.publishedAt || baseResponse.published_at,
      };
    }

    // All attempted providers returned empty (not an error)
    if (!anyProviderFailed && emptyResponseCount > 0) {
      return {
        status: 'empty',
        query: ticker || rawQuery || category,
        category,
        country,
        ticker: ticker || null,
        articles: [],
        summary: summarizeSentiment([]),
        provider: providers.map((p) => p.name).join(', ') || 'None',
        dataSource: providers.map((p) => p.name).join(', ') || 'None',
        providersTried: attempts,
        fetchedAt: nowIso,
        fetched_at: nowIso,
        published_at: null,
        cached: false,
        stale: false,
        cacheAgeSeconds: null,
        partial: false,
      };
    }

    // All providers failed -> check stale cache for exact key first, then broader category fallback if no query/ticker
    const errorSummary =
      attempts
        .filter((a) => !a.ok && a.errorMessage)
        .map((a) => `${a.providerName}: ${a.errorCode || 'ERROR'}`)
        .slice(0, 3)
        .join(' | ') || 'All news providers unavailable.';

    const exactStale = feedCache.get(cacheKey);
    if (exactStale && Date.now() < exactStale.staleUntilMs && exactStale.data.articles.length > 0) {
      return buildCachedFallbackResponse(exactStale, ctx, attempts, errorSummary);
    }

    if (!rawQuery && !ticker) {
      const globalKey = `Global|All||`;
      const globalStale = feedCache.get(globalKey);
      if (globalStale && Date.now() < globalStale.staleUntilMs && globalStale.data.articles.length > 0) {
        return buildCachedFallbackResponse(globalStale, ctx, attempts, errorSummary);
      }
    }

    return {
      status: 'unavailable',
      query: ticker || rawQuery || category,
      category,
      country,
      ticker: ticker || null,
      articles: [],
      summary: summarizeSentiment([]),
      provider: attempts.map((a) => a.providerName).join(', ') || 'Unavailable',
      dataSource: attempts.map((a) => a.providerName).join(', ') || 'Unavailable',
      providersTried: attempts,
      fetchedAt: nowIso,
      fetched_at: nowIso,
      published_at: null,
      cached: false,
      stale: false,
      cacheAgeSeconds: null,
      partial: false,
      notice: CACHED_FALLBACK_NOTICE,
      error: errorSummary,
      errorMessage:
        'Live financial news providers are temporarily unavailable and no cached articles are stored yet. Please retry shortly.',
    };
  };

  if (!options._fetchFn && !options._providers) {
    const promise = runPipeline().finally(() => {
      inflightRequests.delete(dedupeKey);
    });
    inflightRequests.set(dedupeKey, promise);
    return promise;
  }

  return runPipeline();
}

export function getNewsProvidersHealth(): {
  status: 'operational' | 'degraded' | 'unavailable';
  cacheEntries: number;
  inflightRequests: number;
  cacheTtlMs: number;
  staleTtlMs: number;
  timeoutMs: number;
  providers: NewsProviderHealth[];
  checkedAt: string;
} {
  const providers = breakerRegistry.getSnapshot(ALL_NEWS_PROVIDERS);
  const configuredProviders = providers.filter((p) => p.configured);
  const openCount = configuredProviders.filter((p) => p.circuitState === 'OPEN').length;
  const status =
    openCount === 0
      ? 'operational'
      : openCount < configuredProviders.length
        ? 'degraded'
        : 'unavailable';

  return {
    status,
    cacheEntries: feedCache.size,
    inflightRequests: inflightRequests.size,
    cacheTtlMs: env.newsCacheTtlMs,
    staleTtlMs: env.newsStaleTtlMs,
    timeoutMs: env.newsRequestTimeoutMs,
    providers,
    checkedAt: new Date().toISOString(),
  };
}

export function resetNewsServiceState(): void {
  breakerRegistry.reset();
  feedCache.clear();
  inflightRequests.clear();
}
