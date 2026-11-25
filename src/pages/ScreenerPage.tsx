import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookmarkPlus,
  Filter,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import { deltaColorClass, formatCurrency, formatPct } from '../lib/format.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { MotionPage } from '../components/MotionPrimitives.tsx';

interface ScreenerFilters {
  region: string;
  country: string;
  exchange: string;
  sector: string;
  trend: string;
  decision: string;
  minRsi: string;
  maxRsi: string;
  minChange: string;
  maxRisk: string;
  searchText: string;
}

const DEFAULT_FILTERS: ScreenerFilters = {
  region: 'ALL',
  country: 'ALL',
  exchange: 'ALL',
  sector: 'ALL',
  trend: 'ALL',
  decision: 'ALL',
  minRsi: '',
  maxRsi: '',
  minChange: '',
  maxRisk: '',
  searchText: '',
};

export function ScreenerPage() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<'changePercent' | 'rsi14' | 'riskScore' | 'volume'>('changePercent');
  const [savedPresets, setSavedPresets] = useState<any[]>([]);
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const loadScreener = async (regionVal = filters.region, exchangeVal = filters.exchange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/stocks/global-screener', {
        params: { region: regionVal, exchange: exchangeVal, limit: 36 },
      });
      setStocks(res.data?.stocks || []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load global screener quotes.'));
    } finally {
      setLoading(false);
    }
  };

  const loadSavedPresets = () => {
    if (!user) return;
    api
      .get('/screener/filters')
      .then((res) => setSavedPresets(res.data?.items || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadScreener();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSavedPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const countries = useMemo(
    () => ['ALL', ...Array.from(new Set(stocks.map((s) => s.country).filter(Boolean))).sort()],
    [stocks]
  );
  const exchanges = useMemo(
    () => ['ALL', ...Array.from(new Set(stocks.map((s) => s.exchange).filter(Boolean))).sort()],
    [stocks]
  );
  const sectors = useMemo(
    () => ['ALL', ...Array.from(new Set(stocks.map((s) => s.sector).filter(Boolean))).sort()],
    [stocks]
  );

  const filtered = useMemo(() => {
    return stocks
      .filter((s) => {
        if (filters.region !== 'ALL' && s.region !== filters.region) return false;
        if (filters.country !== 'ALL' && s.country !== filters.country) return false;
        if (filters.exchange !== 'ALL' && s.exchange !== filters.exchange) return false;
        if (filters.sector !== 'ALL' && s.sector !== filters.sector) return false;
        if (filters.trend !== 'ALL' && s.trend !== filters.trend) return false;
        if (filters.decision !== 'ALL' && s.aiDecision !== filters.decision) return false;
        if (filters.minRsi && (s.rsi14 === null || s.rsi14 < Number(filters.minRsi))) return false;
        if (filters.maxRsi && (s.rsi14 === null || s.rsi14 > Number(filters.maxRsi))) return false;
        if (filters.minChange && s.changePercent < Number(filters.minChange)) return false;
        if (filters.maxRisk && s.riskScore > Number(filters.maxRisk)) return false;
        if (filters.searchText.trim()) {
          const q = filters.searchText.trim().toLowerCase();
          if (
            !s.symbol.toLowerCase().includes(q) &&
            !s.name.toLowerCase().includes(q) &&
            !s.country.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'rsi14') return (b.rsi14 ?? 0) - (a.rsi14 ?? 0);
        if (sortBy === 'riskScore') return a.riskScore - b.riskScore;
        if (sortBy === 'volume') return (b.volume ?? 0) - (a.volume ?? 0);
        return b.changePercent - a.changePercent;
      });
  }, [stocks, filters, sortBy]);

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Sign in to save custom screener presets.', 'info');
      return;
    }
    if (presetName.trim().length < 2) return;
    setSavingPreset(true);
    try {
      await api.post('/screener/filters', { name: presetName.trim(), filters });
      setPresetName('');
      showToast('Screener filter preset saved to PostgreSQL.', 'success');
      loadSavedPresets();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to save filter preset.'), 'error');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleDeletePreset = async (id: number) => {
    try {
      await api.delete(`/screener/filters/${id}`);
      setSavedPresets((prev) => prev.filter((p) => p.id !== id));
      showToast('Filter preset deleted.', 'info');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to delete preset.'), 'error');
    }
  };

  const quickWatchlist = async (s: any) => {
    if (!user) {
      showToast('Sign in to add stocks to your watchlist.', 'info');
      return;
    }
    try {
      await api.post('/watchlist', {
        symbol: s.symbol,
        exchange: s.exchange,
        listName: 'Core Watchlist',
      });
      showToast(`${s.symbol} (${s.exchange}) added to watchlist.`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to add to watchlist.'), 'error');
    }
  };

  return (
    <MotionPage className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Filter className="w-6 h-6 text-blue-400" />
            Global Stock Screener
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Filter worldwide equities by region, country, exchange, sector, RSI(14), trend, quantitative stance, and risk score.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadScreener(filters.region, filters.exchange)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#111827] border border-slate-800 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Reload Global Universe
        </button>
      </div>

      {/* Filter Controls */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filters.searchText}
              onChange={(e) => setFilters({ ...filters, searchText: e.target.value })}
              placeholder="Filter ticker, company, country..."
              className="w-full bg-[#0D1320] border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={filters.region}
            onChange={(e) => {
              const nextReg = e.target.value;
              setFilters({ ...filters, region: nextReg, country: 'ALL', exchange: 'ALL' });
              loadScreener(nextReg, 'ALL');
            }}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            <option value="ALL">All Regions</option>
            <option value="North America">North America</option>
            <option value="India">India</option>
            <option value="Europe">Europe</option>
            <option value="Asia-Pacific">Asia-Pacific</option>
          </select>

          <select
            value={filters.country}
            onChange={(e) => setFilters({ ...filters, country: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            {countries.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All Countries' : c}
              </option>
            ))}
          </select>

          <select
            value={filters.exchange}
            onChange={(e) => setFilters({ ...filters, exchange: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            {exchanges.map((ex) => (
              <option key={ex} value={ex}>
                {ex === 'ALL' ? 'All Exchanges' : ex}
              </option>
            ))}
          </select>

          <select
            value={filters.sector}
            onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            {sectors.map((sec) => (
              <option key={sec} value={sec}>
                {sec === 'ALL' ? 'All Sectors' : sec}
              </option>
            ))}
          </select>

          <select
            value={filters.trend}
            onChange={(e) => setFilters({ ...filters, trend: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            <option value="ALL">All Trends</option>
            <option value="Uptrend">Uptrend</option>
            <option value="Sideways">Sideways</option>
            <option value="Downtrend">Downtrend</option>
          </select>

          <select
            value={filters.decision}
            onChange={(e) => setFilters({ ...filters, decision: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            <option value="ALL">All Signals</option>
            <option value="BUY">BUY</option>
            <option value="HOLD">HOLD</option>
            <option value="WAIT">WAIT</option>
            <option value="SELL">SELL</option>
          </select>

          <input
            type="number"
            placeholder="Min RSI (e.g. 30)"
            value={filters.minRsi}
            onChange={(e) => setFilters({ ...filters, minRsi: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
          />

          <input
            type="number"
            placeholder="Max RSI (e.g. 70)"
            value={filters.maxRsi}
            onChange={(e) => setFilters({ ...filters, maxRsi: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
          />

          <input
            type="number"
            placeholder="Max Risk Score (1-100)"
            value={filters.maxRisk}
            onChange={(e) => setFilters({ ...filters, maxRisk: e.target.value })}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
          />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            <option value="changePercent">Sort: Daily % Change</option>
            <option value="rsi14">Sort: RSI(14)</option>
            <option value="riskScore">Sort: Lowest Risk Score</option>
            <option value="volume">Sort: Highest Volume</option>
          </select>
        </div>

        {/* Save / Load Custom Screener Presets */}
        <div className="pt-3 border-t border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                loadScreener('ALL', 'ALL');
              }}
              className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
            >
              Reset Filters
            </button>
            {savedPresets.map((p) => (
              <div
                key={p.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0D1320] border border-slate-700 text-xs"
              >
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(p.filtersJson);
                      setFilters({ ...DEFAULT_FILTERS, ...parsed });
                    } catch {
                      // ignore malformed
                    }
                  }}
                  className="text-blue-300 hover:text-blue-200"
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePreset(p.id)}
                  className="text-slate-500 hover:text-rose-400"
                  aria-label={`Delete preset ${p.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleSavePreset} className="flex items-center gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Save filter preset name..."
              className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 w-48"
            />
            <button
              type="submit"
              disabled={savingPreset || presetName.trim().length < 2}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Filter
            </button>
          </form>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing <strong className="text-slate-100">{filtered.length}</strong> of {stocks.length} global equities
          </span>
          <span>Real 3M technicals · Click any row for full chart</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0D1320] text-xs text-slate-400">
                <th className="text-left py-3 px-4 font-medium">Equity</th>
                <th className="text-left py-3 px-3 font-medium">Exchange · Country</th>
                <th className="text-right py-3 px-4 font-medium">Price</th>
                <th className="text-right py-3 px-4 font-medium">1D %</th>
                <th className="text-right py-3 px-3 font-medium">RSI(14)</th>
                <th className="text-left py-3 px-3 font-medium">Trend</th>
                <th className="text-center py-3 px-3 font-medium">Signal</th>
                <th className="text-right py-3 px-3 font-medium">Risk</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={9} className="py-3.5 px-4">
                        <div className="h-4 bg-slate-800 rounded w-full" />
                      </td>
                    </tr>
                  ))
                : filtered.map((s) => (
                    <tr
                      key={`${s.symbol}:${s.exchange}`}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => navigate(`/stocks/${encodeURIComponent(s.symbol)}?exchange=${s.exchange}`)}
                          className="text-left group"
                        >
                          <div className="font-mono font-semibold text-slate-100 group-hover:text-blue-400">
                            {s.symbol}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[200px]">{s.name}</div>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-400">
                        <span className="font-mono text-slate-200">{s.exchange}</span> · {s.country}
                        <div className="text-[11px] text-slate-500">{s.sector}</div>
                      </td>
                      <td className="py-3 px-4 text-right num text-slate-100">
                        {formatCurrency(s.price, s.currency)}
                      </td>
                      <td className={`py-3 px-4 text-right num font-semibold ${deltaColorClass(s.changePercent)}`}>
                        {formatPct(s.changePercent)}
                      </td>
                      <td className="py-3 px-3 text-right num text-xs text-slate-300">
                        {s.rsi14 ?? '—'}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <span
                          className={
                            s.trend === 'Uptrend'
                              ? 'text-emerald-400'
                              : s.trend === 'Downtrend'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                          }
                        >
                          {s.trend}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-semibold">
                        <span
                          className={
                            s.aiDecision === 'BUY'
                              ? 'text-emerald-400'
                              : s.aiDecision === 'SELL'
                                ? 'text-rose-400'
                                : s.aiDecision === 'WAIT'
                                  ? 'text-amber-400'
                                  : 'text-blue-400'
                          }
                        >
                          {s.aiDecision || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right num text-xs text-slate-300">
                        {s.riskScore}/100
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            to={`/ai-analysis?symbol=${encodeURIComponent(s.symbol)}&exchange=${s.exchange}`}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                          >
                            AI Brief
                          </Link>
                          <button
                            type="button"
                            onClick={() => quickWatchlist(s)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-800"
                            title="Add to Watchlist"
                            aria-label={`Add ${s.symbol} to watchlist`}
                          >
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-slate-500">
                    No stocks match the current filter combination.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MotionPage>
  );
}
