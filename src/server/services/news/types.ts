export type NewsSentiment = 'Positive' | 'Negative' | 'Neutral';

export type NewsErrorCode =
  | 'PROVIDER_503'
  | 'PROVIDER_502'
  | 'RATE_LIMITED'
  | 'INVALID_API_KEY'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'EMPTY_RESPONSE'
  | 'NETWORK_ERROR'
  | 'CIRCUIT_OPEN'
  | 'HTTP_ERROR';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  link: string;
  source: string;
  publishedAt: string;
  published_at: string;
  category: string;
  country: string;
  relatedTickers: string[];
  sentiment: NewsSentiment;
  sentimentScore: number;
  provider: string;
}

export interface NewsQueryContext {
  query: string;
  rawQuery: string;
  category: string;
  country: string;
  ticker: string;
  sentiment?: 'Positive' | 'Negative' | 'Neutral';
  refresh?: boolean;
  limit?: number;
}

export interface NewsProviderAttempt {
  providerId: string;
  providerName: string;
  tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  articleCount: number;
  errorCode?: NewsErrorCode;
  errorMessage?: string;
  circuitOpen?: boolean;
}

export interface NewsProviderHealth {
  id: string;
  name: string;
  tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
  configured: boolean;
  requiresApiKey: boolean;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  openUntil: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: NewsErrorCode | null;
  lastErrorMessage: string | null;
  avgLatencyMs: number | null;
  totalRequests: number;
  totalFailures: number;
}

export interface NewsFeedResponse {
  status: 'ok' | 'partial' | 'cached' | 'empty' | 'unavailable';
  query: string;
  category: string;
  country: string;
  ticker: string | null;
  articles: NewsArticle[];
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    overallSentiment: NewsSentiment;
  };
  provider: string;
  dataSource: string;
  providersTried: NewsProviderAttempt[];
  fetchedAt: string;
  fetched_at: string;
  published_at: string | null;
  cached: boolean;
  stale: boolean;
  cacheAgeSeconds: number | null;
  partial: boolean;
  notice?: string;
  error?: string;
  errorMessage?: string;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface NewsProvider {
  readonly id: string;
  readonly name: string;
  readonly tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
  readonly requiresApiKey: boolean;
  isConfigured: () => boolean;
  supports: (ctx: NewsQueryContext) => boolean;
  fetchArticles: (
    ctx: NewsQueryContext,
    fetchFn: FetchLike,
    timeoutMs: number
  ) => Promise<NewsArticle[]>;
}
