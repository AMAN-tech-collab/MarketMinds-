import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Database,
  Filter,
  Globe2,
  Newspaper,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import { formatTimestampUTC } from '../lib/format.ts';
import { MotionPage } from '../components/MotionPrimitives.tsx';
import { usePreferences } from '../context/PreferencesContext.tsx';

interface NewsArticleItem {
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
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  sentimentScore: number;
  provider: string;
}

interface ProviderAttemptItem {
  providerId: string;
  providerName: string;
  tier: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  articleCount: number;
  errorCode?: string;
  errorMessage?: string;
  circuitOpen?: boolean;
}

interface NewsFeedPayload {
  status: 'ok' | 'partial' | 'cached' | 'empty' | 'unavailable';
  query: string;
  category: string;
  country: string;
  ticker: string | null;
  articles: NewsArticleItem[];
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    overallSentiment: 'Positive' | 'Negative' | 'Neutral';
  };
  provider: string;
  dataSource: string;
  providersTried?: ProviderAttemptItem[];
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

interface ProviderHealthEntry {
  id: string;
  name: string;
  tier: string;
  configured: boolean;
  requiresApiKey: boolean;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  avgLatencyMs: number | null;
  lastErrorCode: string | null;
}

interface NewsHealthPayload {
  status: 'operational' | 'degraded' | 'unavailable';
  cacheEntries: number;
  providers: ProviderHealthEntry[];
  checkedAt: string;
}

const PRIMARY_CATEGORIES = [
  'Global',
  'US Markets',
  'India',
  'Europe',
  'Asia-Pacific',
  'Economy',
  'Central Banks',
  'Earnings',
  'Mergers & Acquisitions',
] as const;

const SECTOR_CATEGORIES = [
  'Technology',
  'Banking',
  'IT',
  'Energy',
  'Auto',
  'Pharma',
  'Healthcare',
] as const;

const COUNTRY_OPTIONS = [
  { value: 'All', label: 'All Regions' },
  { value: 'US', label: 'United States' },
  { value: 'India', label: 'India (NSE / BSE)' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'Europe', label: 'Europe' },
  { value: 'Asia-Pacific', label: 'Asia-Pacific' },
  { value: 'Global', label: 'Global Macro' },
] as const;

const SENTIMENT_OPTIONS = ['All', 'Positive', 'Neutral', 'Negative'] as const;

const POPULAR_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK'] as const;

function formatCacheAge(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function NewsPage() {
  const { reducedMotion } = usePreferences();

  const [category, setCategory] = useState<string>('Global');
  const [country, setCountry] = useState<string>('All');
  const [sentiment, setSentiment] = useState<string>('All');
  const [queryInput, setQueryInput] = useState<string>('');
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [tickerInput, setTickerInput] = useState<string>('');
  const [activeTicker, setActiveTicker] = useState<string>('');

  const [feed, setFeed] = useState<NewsFeedPayload | null>(null);
  const [health, setHealth] = useState<NewsHealthPayload | null>(null);
  const [showHealthPanel, setShowHealthPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const res = await api.get<NewsHealthPayload>('/news/health');
      setHealth(res.data);
    } catch {
      // Non-blocking health probe
    }
  }, []);

  const loadNews = useCallback(
    async (opts?: { forceRefresh?: boolean }) => {
      const isRefresh = Boolean(opts?.forceRefresh);
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await api.get<NewsFeedPayload>('/news', {
          params: {
            category,
            country: country !== 'All' ? country : undefined,
            q: activeQuery || undefined,
            ticker: activeTicker || undefined,
            sentiment: sentiment !== 'All' ? sentiment : undefined,
            refresh: isRefresh ? 'true' : undefined,
          },
        });
        setFeed(res.data);
        void loadHealth();
      } catch (err) {
        setError(
          getApiErrorMessage(
            err,
            'Live news is temporarily unavailable. Showing cached articles where available.'
          )
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [category, country, activeQuery, activeTicker, sentiment, loadHealth]
  );

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(queryInput.trim());
    setActiveTicker(tickerInput.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, ''));
  };

  const handleResetFilters = () => {
    setCategory('Global');
    setCountry('All');
    setSentiment('All');
    setQueryInput('');
    setActiveQuery('');
    setTickerInput('');
    setActiveTicker('');
  };

  const hasActiveFilters =
    category !== 'Global' ||
    country !== 'All' ||
    sentiment !== 'All' ||
    Boolean(activeQuery) ||
    Boolean(activeTicker);

  const providerStatusTone = useMemo(() => {
    if (error || feed?.status === 'unavailable') {
      return {
        dot: 'bg-rose-500',
        text: 'text-rose-400',
        label: 'News Providers Unavailable',
      };
    }
    if (feed?.status === 'cached' && feed?.stale) {
      return {
        dot: 'bg-amber-400',
        text: 'text-amber-400',
        label: 'Cached Fallback Active',
      };
    }
    if (feed?.partial || health?.status === 'degraded') {
      return {
        dot: 'bg-amber-400',
        text: 'text-amber-300',
        label: 'Backup Provider Active',
      };
    }
    return {
      dot: 'bg-emerald-400',
      text: 'text-emerald-400',
      label: feed?.cached ? 'Live Feed (Cached)' : 'Live Multi-Provider Feed',
    };
  }, [error, feed, health]);

  const cardSurface =
    'bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/90 rounded-xl';
  const subSurface =
    'bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 rounded-lg';

  return (
    <MotionPage className="space-y-6">
      {/* Top Header + Provider Status + Refresh */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5 tracking-tight">
            <Newspaper className="w-6 h-6 text-blue-500 dark:text-blue-400 shrink-0" />
            Global Financial News &amp; Sentiment
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Multi-provider market intelligence covering Global, US, NSE/BSE India, Europe, Asia-Pacific, Central Banks, Earnings, and M&amp;A.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHealthPanel((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${providerStatusTone.dot}`} />
            <span>{providerStatusTone.label}</span>
            <Activity className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => loadNews({ forceRefresh: true })}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Live'}
          </button>
        </div>
      </div>

      {/* Expandable Multi-Provider Health Diagnostics */}
      {showHealthPanel && health && (
        <div className={`${cardSurface} p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <ShieldCheck className="w-4 h-4 text-blue-500" />
              News Provider Resilience &amp; Circuit Breaker Status
            </div>
            <div className="text-[11px] text-slate-500 num">
              {health.cacheEntries} cached queries · Checked {formatTimestampUTC(health.checkedAt)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {health.providers.map((p) => (
              <div
                key={p.id}
                className={`${subSurface} px-3 py-2.5 flex items-center justify-between gap-2 text-xs`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <span className="capitalize">{p.tier}</span>
                    {p.avgLatencyMs !== null && (
                      <>
                        <span>·</span>
                        <span className="num">{p.avgLatencyMs}ms</span>
                      </>
                    )}
                    {p.lastErrorCode && (
                      <>
                        <span>·</span>
                        <span className="text-rose-400 font-mono">{p.lastErrorCode}</span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${
                    !p.configured
                      ? 'border-slate-300 dark:border-slate-700 text-slate-500'
                      : p.circuitState === 'CLOSED'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'
                        : p.circuitState === 'HALF_OPEN'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-500 dark:text-amber-400'
                          : 'border-rose-500/30 bg-rose-500/10 text-rose-500 dark:text-rose-400'
                  }`}
                >
                  {!p.configured ? 'KEY OPTIONAL' : p.circuitState}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search, Ticker, Country, Sentiment & Category Filter Toolbar */}
      <div className={`${cardSurface} p-5 space-y-4`}>
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search headlines, companies, central banks, M&A..."
              className="w-full bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="md:col-span-3 relative">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              placeholder="Ticker (AAPL, RELIANCE)"
              className="w-full bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
            >
              Filter News
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="Reset all filters"
                className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>

        {/* Country + Sentiment + Popular Tickers Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-200 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs">
              <Globe2 className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label="Filter by country or region"
                className="bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {COUNTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 rounded-md p-0.5 text-xs">
              {SENTIMENT_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSentiment(s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    sentiment === s
                      ? s === 'Positive'
                        ? 'bg-emerald-600 text-white'
                        : s === 'Negative'
                          ? 'bg-rose-600 text-white'
                          : 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500 mr-0.5">Quick Tickers:</span>
            {POPULAR_TICKERS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => {
                  setTickerInput(sym);
                  setActiveTicker(sym);
                  setQueryInput('');
                  setActiveQuery('');
                }}
                className={`px-2 py-1 rounded font-mono border transition-colors ${
                  activeTicker === sym
                    ? 'bg-blue-600/15 border-blue-500 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'bg-slate-50 dark:bg-[#0D1320] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Categories + Sectors */}
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRIMARY_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setActiveQuery('');
                  setQueryInput('');
                  setActiveTicker('');
                  setTickerInput('');
                  setCategory(c);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  !activeQuery && !activeTicker && category === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-[#0D1320] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 mr-1">Sectors:</span>
            {SECTOR_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setActiveQuery('');
                  setQueryInput('');
                  setActiveTicker('');
                  setTickerInput('');
                  setCategory(c);
                }}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  !activeQuery && !activeTicker && category === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-[#0D1320] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cached / Partial Fallback Notice Banner */}
      {feed?.notice && feed.status !== 'unavailable' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2.5">
            <Database className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{feed.notice}</span>
              {feed.cached && feed.cacheAgeSeconds !== null && (
                <span className="ml-1.5 text-amber-700/80 dark:text-amber-300/80">
                  (Stored {formatCacheAge(feed.cacheAgeSeconds)} — original publication dates preserved.)
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadNews({ forceRefresh: true })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-medium shrink-0 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry Live
          </button>
        </div>
      )}

      {/* Hard Unavailable / Network Error Banner (Never crashes dashboard) */}
      {(error || feed?.status === 'unavailable') && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                Live news is temporarily unavailable. Showing cached articles where available.
              </div>
              <p className="text-xs text-rose-600/90 dark:text-rose-300/80">
                {error || feed?.errorMessage || 'Upstream news providers did not respond in time.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadNews({ forceRefresh: true })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shrink-0 self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry Now
          </button>
        </div>
      )}

      {/* Sentiment Summary KPI Strip */}
      {feed?.summary && feed.articles.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`${cardSurface} p-4`}>
            <div className="text-xs text-slate-500 dark:text-slate-400">Headline Mood</div>
            <div
              className={`text-lg font-bold mt-1 flex items-center gap-1.5 ${
                feed.summary.overallSentiment === 'Positive'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : feed.summary.overallSentiment === 'Negative'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {feed.summary.overallSentiment === 'Positive' && <TrendingUp className="w-4 h-4" />}
              {feed.summary.overallSentiment === 'Negative' && <TrendingDown className="w-4 h-4" />}
              {feed.summary.overallSentiment}
            </div>
          </div>
          <div className={`${cardSurface} p-4`}>
            <div className="text-xs text-slate-500 dark:text-slate-400">Positive Articles</div>
            <div className="num text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {feed.summary.positive}
            </div>
          </div>
          <div className={`${cardSurface} p-4`}>
            <div className="text-xs text-slate-500 dark:text-slate-400">Neutral Articles</div>
            <div className="num text-lg font-bold text-slate-800 dark:text-slate-200 mt-1">
              {feed.summary.neutral}
            </div>
          </div>
          <div className={`${cardSurface} p-4`}>
            <div className="text-xs text-slate-500 dark:text-slate-400">Negative Articles</div>
            <div className="num text-lg font-bold text-rose-600 dark:text-rose-400 mt-1">
              {feed.summary.negative}
            </div>
          </div>
        </div>
      )}

      {/* Feed Attribution Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Source: {feed?.provider || 'Multi-Provider Financial News'}
          </span>
          {feed?.cached && (
            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[10px]">
              {feed.stale ? 'CACHED FALLBACK' : 'CACHED'}
              {feed.cacheAgeSeconds !== null ? ` · ${formatCacheAge(feed.cacheAgeSeconds)}` : ''}
            </span>
          )}
          {feed?.partial && (
            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-300 font-mono text-[10px]">
              FALLBACK PROVIDER
            </span>
          )}
        </div>
        {feed?.fetched_at && (
          <span className="num flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Fetched {formatTimestampUTC(feed.fetched_at)}
          </span>
        )}
      </div>

      {/* Loading Skeleton Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className={`${cardSurface} p-5 animate-pulse space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-28" />
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-16" />
              </div>
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-11/12" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-200/80 dark:bg-slate-800/70 rounded w-full" />
              <div className="flex items-center justify-between pt-2">
                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-32" />
                <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-14" />
              </div>
            </div>
          ))}
        </div>
      ) : feed && feed.articles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {feed.articles.map((art, index) => (
            <motion.article
              key={art.id}
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reducedMotion ? 0 : Math.min(index * 0.025, 0.25) }}
              className={`${cardSurface} p-5 flex flex-col justify-between gap-4 hover:border-blue-500/40 transition-colors group`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {art.source}
                    </span>
                    <span>·</span>
                    <span className="truncate">{art.country}</span>
                    {feed.cached && feed.stale && (
                      <>
                        <span>·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Cached</span>
                      </>
                    )}
                  </div>
                  <span
                    className={`font-semibold shrink-0 ${
                      art.sentiment === 'Positive'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : art.sentiment === 'Negative'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {art.sentiment}
                  </span>
                </div>

                <a
                  href={art.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[15px] font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 leading-snug transition-colors"
                >
                  {art.title}
                </a>

                {art.summary && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                    {art.summary}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {art.relatedTickers.length > 0 ? (
                    art.relatedTickers.slice(0, 4).map((sym) => (
                      <Link
                        key={sym}
                        to={`/ai-analysis?symbol=${encodeURIComponent(sym)}`}
                        title={`Open MarketMinds AI Research for ${sym}`}
                        className="px-2 py-0.5 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-mono text-[11px] font-medium transition-colors"
                      >
                        {sym}
                      </Link>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-500">{art.category}</span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
                  <span className="num" title="Original publication timestamp">
                    {formatTimestampUTC(art.publishedAt)}
                  </span>
                  <a
                    href={art.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Read <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      ) : (
        /* Empty / Unavailable Fallback State */
        <div className={`${cardSurface} p-10 text-center space-y-3`}>
          <Newspaper className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            {feed?.status === 'unavailable' || error
              ? 'Financial news feeds are temporarily unavailable'
              : 'No articles matched your current filters'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {feed?.status === 'unavailable' || error
              ? 'All configured upstream news providers failed to respond and no cached headlines are stored for this query yet.'
              : 'Try broadening your search keywords, clearing the ticker/sentiment filter, or switching to another market region.'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => loadNews({ forceRefresh: true })}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}
    </MotionPage>
  );
}
