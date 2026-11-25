import React, { useEffect, useRef, useState } from 'react';
import { Clock, Flame, Globe2, Loader2, Search, TrendingUp } from 'lucide-react';
import {
  GLOBAL_EXCHANGES,
  GLOBAL_STOCK_CATALOG,
  searchGlobalCatalog,
  type ExchangeCode,
} from '../shared/globalMarkets.ts';
import { api } from '../lib/api.ts';
import { usePreferences } from '../context/PreferencesContext.tsx';

interface SearchResultItem {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: ExchangeCode;
  country: string;
  currency: string;
  sector: string;
  isin?: string;
  bseCode?: string;
  source?: string;
}

interface StockSearchInputProps {
  value?: string;
  defaultExchange?: ExchangeCode | 'ALL';
  placeholder?: string;
  onSelect: (symbol: string, exchange: ExchangeCode) => void;
  className?: string;
  compact?: boolean;
  showFilters?: boolean;
}

const EXCHANGE_OPTIONS: Array<ExchangeCode | 'ALL'> = [
  'ALL',
  'NASDAQ',
  'NYSE',
  'NSE',
  'BSE',
  'LSE',
  'TSE',
  'HKEX',
  'XETRA',
  'EPA',
  'TSX',
  'ASX',
  'KRX',
  'SGX',
  'SSE',
  'SZSE',
  'AMEX',
];

const COUNTRY_OPTIONS = [
  'ALL',
  'United States',
  'India',
  'United Kingdom',
  'Japan',
  'Germany',
  'France',
  'China',
  'Hong Kong',
  'Canada',
  'Australia',
  'South Korea',
  'Singapore',
];

export function StockSearchInput({
  value = '',
  defaultExchange = 'ALL',
  placeholder = 'Search global stocks by ticker, company, ISIN, or exchange (AAPL, NVDA, RELIANCE, 7203.T)...',
  onSelect,
  className = '',
  compact = false,
  showFilters = false,
}: StockSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeCode | 'ALL'>(defaultExchange);
  const [countryFilter, setCountryFilter] = useState<string>('ALL');
  const [remoteResults, setRemoteResults] = useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { recentSearches, addRecentSearch } = usePreferences();

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced live global autocomplete when query >= 2 chars
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setRemoteResults(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .get('/stocks/global-search', {
          params: {
            q,
            exchange: exchangeFilter === 'ALL' ? undefined : exchangeFilter,
            country: countryFilter === 'ALL' ? undefined : countryFilter,
          },
        })
        .then((res) => {
          if (!cancelled && Array.isArray(res.data?.results)) {
            setRemoteResults(res.data.results);
          }
        })
        .catch(() => {
          if (!cancelled) setRemoteResults(null);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, exchangeFilter, countryFilter, open]);

  const localMatches: SearchResultItem[] = searchGlobalCatalog({
    q: query,
    exchange: exchangeFilter === 'ALL' ? undefined : exchangeFilter,
    country: countryFilter === 'ALL' ? undefined : countryFilter,
  })
    .slice(0, 12)
    .map((c) => ({
      symbol: c.symbol,
      yahooSymbol: c.yahooSymbol,
      name: c.name,
      exchange: c.exchange,
      country: c.country,
      currency: c.currency,
      sector: c.sector,
      isin: c.isin,
      bseCode: c.bseCode,
      source: 'catalog',
    }));

  const matches = remoteResults && remoteResults.length > 0 ? remoteResults.slice(0, 12) : localMatches;
  const trending = GLOBAL_STOCK_CATALOG.filter((s) => s.trending).slice(0, 6);

  const pickItem = (item: {
    symbol: string;
    exchange: ExchangeCode;
    name: string;
    country: string;
    currency: string;
  }) => {
    setQuery(item.symbol);
    setOpen(false);
    addRecentSearch({
      symbol: item.symbol,
      exchange: item.exchange,
      companyName: item.name,
      country: item.country,
      currency: item.currency,
    });
    onSelect(item.symbol, item.exchange);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = query.trim().toUpperCase();
    if (!cleaned) return;
    setOpen(false);

    // If exact match exists in current list, use its exchange to disambiguate cleanly
    const exact = matches.find(
      (m) => m.symbol === cleaned || m.yahooSymbol === cleaned || m.isin === cleaned || m.bseCode === cleaned
    );
    if (exact) {
      pickItem(exact);
      return;
    }

    let resolvedEx: ExchangeCode =
      exchangeFilter !== 'ALL'
        ? exchangeFilter
        : /^\d{6}$/.test(cleaned) || cleaned.endsWith('.BO')
          ? 'BSE'
          : cleaned.endsWith('.NS')
            ? 'NSE'
            : cleaned.endsWith('.L')
              ? 'LSE'
              : cleaned.endsWith('.T')
                ? 'TSE'
                : cleaned.endsWith('.HK')
                  ? 'HKEX'
                  : cleaned.endsWith('.DE')
                    ? 'XETRA'
                    : cleaned.endsWith('.PA')
                      ? 'EPA'
                      : cleaned.endsWith('.TO')
                        ? 'TSX'
                        : cleaned.endsWith('.AX')
                          ? 'ASX'
                          : cleaned.endsWith('.KS')
                            ? 'KRX'
                            : cleaned.endsWith('.SI')
                              ? 'SGX'
                              : 'NASDAQ';

    const exInfo = GLOBAL_EXCHANGES[resolvedEx];
    pickItem({
      symbol: cleaned.replace(/\.(NS|BO|L|T|HK|SS|SZ|TO|DE|F|PA|AX|KS|KQ|SI)$/i, ''),
      exchange: resolvedEx,
      name: cleaned,
      country: exInfo.country,
      currency: exInfo.currency,
    });
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder={placeholder}
            aria-label="Search worldwide stocks by company name, ticker, ISIN, or exchange"
            className={`w-full bg-[#111827] border border-slate-800 rounded-lg pl-9 pr-8 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors ${
              compact ? 'py-2 text-xs' : 'py-2.5 text-sm'
            }`}
          />
          {searching && (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
          )}
        </div>

        {!compact && (
          <select
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value as ExchangeCode | 'ALL')}
            aria-label="Filter by exchange"
            className="bg-[#111827] border border-slate-800 rounded-lg px-2.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 shrink-0"
          >
            {EXCHANGE_OPTIONS.map((ex) => (
              <option key={ex} value={ex}>
                {ex === 'ALL' ? 'All Exchanges' : `${ex} (${GLOBAL_EXCHANGES[ex].currency})`}
              </option>
            ))}
          </select>
        )}

        {showFilters && !compact && (
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            aria-label="Filter by country"
            className="bg-[#111827] border border-slate-800 rounded-lg px-2.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 shrink-0"
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All Countries' : c}
              </option>
            ))}
          </select>
        )}

        <button
          type="submit"
          className={`bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
          }`}
        >
          {compact ? 'Go' : 'Analyze'}
        </button>
      </form>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 bg-[#111827] border border-slate-700/90 rounded-xl shadow-2xl z-50 overflow-hidden min-w-[300px]">
          {query.trim().length === 0 && recentSearches.length > 0 && (
            <div className="px-3.5 py-2.5 border-b border-slate-800 bg-[#0D1320]">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-2">
                <Clock className="w-3 h-3" /> Recent Searches
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.slice(0, 6).map((r) => (
                  <button
                    key={`${r.symbol}:${r.exchange}`}
                    type="button"
                    onClick={() =>
                      pickItem({
                        symbol: r.symbol,
                        exchange: r.exchange as ExchangeCode,
                        name: r.companyName,
                        country: r.country,
                        currency: r.currency,
                      })
                    }
                    className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
                  >
                    <span className="font-mono font-medium">{r.symbol}</span>{' '}
                    <span className="text-slate-400">{r.exchange}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim().length === 0 && (
            <div className="px-3.5 py-2 border-b border-slate-800 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Flame className="w-3 h-3 text-amber-400" /> Trending Global Equities
              <div className="flex flex-wrap gap-1.5 ml-2">
                {trending.map((t) => (
                  <button
                    key={`${t.symbol}:${t.exchange}`}
                    type="button"
                    onClick={() => pickItem(t)}
                    className="px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-[11px] text-blue-300 font-mono transition-colors"
                  >
                    {t.symbol}
                  </button>
                ))}
              </div>
            </div>
          )}

          {matches.length > 0 ? (
            <ul className="divide-y divide-slate-800/70 max-h-80 overflow-y-auto">
              {matches.map((item) => (
                <li key={`${item.symbol}:${item.exchange}:${item.yahooSymbol}`}>
                  <button
                    type="button"
                    onClick={() => pickItem(item)}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-slate-800/70 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate flex items-center gap-1.5">
                        <span className="font-mono">{item.symbol}</span>
                        <span className="text-slate-400 font-normal truncate">· {item.name}</span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Globe2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {item.country} · {item.sector}
                          {item.bseCode ? ` · BSE ${item.bseCode}` : ''}
                          {item.isin ? ` · ${item.isin}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-medium text-blue-400">{item.exchange}</div>
                      <div className="text-[11px] font-mono text-slate-400">{item.currency}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3.5 py-3 text-xs text-slate-400 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              Press Enter to look up{' '}
              <span className="font-mono text-slate-200">{query.toUpperCase()}</span> directly on{' '}
              {exchangeFilter === 'ALL' ? 'global exchanges' : exchangeFilter}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
