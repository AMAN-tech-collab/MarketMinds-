import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookmarkPlus,
  BrainCircuit,
  GitCompareArrows,
  RefreshCw,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import {
  deltaColorClass,
  formatCompactGlobal,
  formatCurrency,
  formatPct,
  formatTimestampUTC,
} from '../lib/format.ts';
import { ResearchChart } from '../components/ResearchChart.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { usePreferences } from '../context/PreferencesContext.tsx';
import { MotionPage } from '../components/MotionPrimitives.tsx';

export function StockDetailPage() {
  const { symbol = 'AAPL' } = useParams();
  const [searchParams] = useSearchParams();
  const exchangeParam = searchParams.get('exchange') || '';
  const timeframe = '1Y' as const;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const { showToast } = useToast();
  const { displayCurrency, convertAmount } = usePreferences();
  const navigate = useNavigate();

  const loadStock = async (tf: string = timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/stocks/${encodeURIComponent(symbol)}`, {
        params: { exchange: exchangeParam || undefined, timeframe: tf },
      });
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, `Unable to load quote for ${symbol}.`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStock(timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, exchangeParam]);

  const handleWatchlist = async () => {
    if (!user) {
      showToast('Sign in to save stocks to your watchlist.', 'info');
      navigate('/login');
      return;
    }
    if (!data?.quote) return;
    try {
      await api.post('/watchlist', {
        symbol: data.quote.symbol,
        exchange: data.quote.exchange,
        listName: 'Core Watchlist',
      });
      showToast(`${data.quote.symbol} (${data.quote.exchange}) added to Watchlist.`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Unable to add to watchlist.'), 'error');
    }
  };

  const quote = data?.quote;
  const tech = data?.technicalSummary;
  const fund = data?.fundamentals;
  const cur = quote?.currency || 'USD';
  const convertedPrice =
    quote && cur !== displayCurrency ? convertAmount(quote.price, cur, displayCurrency) : null;

  return (
    <MotionPage className="space-y-6">
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center justify-between gap-4 text-sm text-rose-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadStock(timeframe)}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {loading && !quote && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-8 animate-pulse space-y-4">
          <div className="h-6 bg-slate-800 rounded w-1/3" />
          <div className="h-80 bg-slate-800/70 rounded-lg" />
        </div>
      )}

      {quote && (
        <>
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="text-xs text-slate-400">
                {quote.exchange} · {quote.country} · {quote.sector} · {quote.currency}
                {data?.marketStatus ? ` · ${data.marketStatus.label} (${data.marketStatus.localTime})` : ''}
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-2xl font-bold text-slate-100">{quote.name}</h2>
                <span className="font-mono text-sm text-blue-400">{quote.symbol}</span>
                {quote.isin && <span className="font-mono text-xs text-slate-500">ISIN {quote.isin}</span>}
              </div>
              <div className="flex flex-wrap items-baseline gap-3 pt-1">
                <span className="num text-3xl font-bold text-slate-100">
                  {formatCurrency(quote.price, cur)}
                </span>
                <span className={`num text-sm font-semibold ${deltaColorClass(quote.changePercent)}`}>
                  {quote.change >= 0 ? '+' : ''}
                  {formatCurrency(quote.change, cur)} ({formatPct(quote.changePercent)})
                </span>
                {convertedPrice !== null && (
                  <span className="num text-xs text-slate-400">
                    ≈ {formatCurrency(convertedPrice, displayCurrency)} ({displayCurrency} spot)
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                {quote.dataSource} · {quote.freshness} · Updated {formatTimestampUTC(quote.fetchedAt)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Link
                to={`/ai-analysis?symbol=${encodeURIComponent(quote.symbol)}&exchange=${quote.exchange}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                <BrainCircuit className="w-4 h-4" /> Run AI Analysis
              </Link>
              <button
                type="button"
                onClick={handleWatchlist}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
              >
                <BookmarkPlus className="w-4 h-4" /> Watchlist
              </button>
              <Link
                to="/compare"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
              >
                <GitCompareArrows className="w-4 h-4" /> Compare
              </Link>
              <button
                type="button"
                onClick={() => loadStock(timeframe)}
                className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300"
                aria-label="Refresh stock quote"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Interactive Multi-Currency Research Chart */}
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <ResearchChart
              data={data.history || []}
              symbol={quote.symbol}
              exchange={quote.exchange}
              currency={cur}
              supportLevels={tech?.supportLevels || []}
              resistanceLevels={tech?.resistanceLevels || []}
            />
          </div>

          {/* Technicals & Fundamentals Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {tech && (
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Technical Indicators</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { k: 'Primary Trend', v: tech.trend },
                    { k: 'RSI (14)', v: `${tech.rsi14 ?? 'N/A'} (${tech.rsiState})` },
                    { k: 'MACD Bias', v: tech.macd.bias },
                    { k: 'ADX (14)', v: tech.adx14 !== null ? `${tech.adx14} (${tech.trendStrength})` : 'N/A' },
                    { k: 'Rolling VWAP', v: tech.vwap ? formatCurrency(tech.vwap, cur) : 'N/A' },
                    { k: '10D Momentum', v: tech.momentum10dPct !== null ? formatPct(tech.momentum10dPct) : 'N/A' },
                    { k: 'ATR (14)', v: tech.atr14 ? formatCurrency(tech.atr14, cur) : 'N/A' },
                    { k: 'Ann. Volatility', v: `${tech.annualizedVolatilityPct}%` },
                    { k: 'Max Drawdown', v: `-${tech.maxDrawdownPct}%` },
                  ].map((item) => (
                    <div key={item.k} className="bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800/80 rounded-lg p-3">
                      <div className="text-slate-500">{item.k}</div>
                      <div className="num text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">{item.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fund && (
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-100">Company Fundamentals</h3>
                  <span className="text-[11px] text-slate-500">{fund.currency}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { k: 'Market Cap', v: formatCompactGlobal(fund.marketCap, cur) },
                    { k: 'Trailing P/E', v: fund.trailingPE ?? 'N/A' },
                    { k: 'EPS (TTM)', v: fund.eps !== null ? formatCurrency(fund.eps, cur) : 'N/A' },
                    { k: 'Revenue', v: formatCompactGlobal(fund.revenue, fund.currency) },
                    { k: 'Profit Margin', v: fund.profitMarginPct !== null ? `${fund.profitMarginPct}%` : 'N/A' },
                    { k: 'ROE', v: fund.roePct !== null ? `${fund.roePct}%` : 'N/A' },
                    { k: 'Debt / Equity', v: fund.debtToEquity ?? 'N/A' },
                    { k: 'Free Cash Flow', v: formatCompactGlobal(fund.freeCashFlow, fund.currency) },
                    { k: 'Dividend Yield', v: fund.dividendYieldPct !== null ? `${fund.dividendYieldPct}%` : 'N/A' },
                  ].map((item) => (
                    <div key={item.k} className="bg-[#0D1320] border border-slate-800/80 rounded-lg p-3">
                      <div className="text-slate-500">{item.k}</div>
                      <div className="num text-sm font-semibold text-slate-100 mt-1">{item.v}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">{fund.note}</p>
              </div>
            )}
          </div>
        </>
      )}
    </MotionPage>
  );
}
