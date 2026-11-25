import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bookmark,
  BrainCircuit,
  FolderPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import { deltaColorClass, formatCurrency, formatPct } from '../lib/format.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import { MotionPage } from '../components/MotionPrimitives.tsx';
import type { ExchangeCode } from '../shared/globalMarkets.ts';

export function WatchlistPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<any[]>([]);
  const [listNames, setListNames] = useState<string[]>(['Core Watchlist']);
  const [activeList, setActiveList] = useState<string>('ALL');
  const [newListName, setNewListName] = useState('');
  const [targetListForAdd, setTargetListForAdd] = useState('Core Watchlist');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWatchlist = async (list = activeList) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/watchlist', {
        params: { listName: list === 'ALL' ? undefined : list },
      });
      setItems(res.data?.items || []);
      if (Array.isArray(res.data?.listNames) && res.data.listNames.length > 0) {
        setListNames((prev) => Array.from(new Set([...res.data.listNames, ...prev])));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load watchlist.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatchlist(activeList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeList]);

  const handleAddStock = async (symbol: string, exchange: ExchangeCode) => {
    if (!user) return;
    try {
      await api.post('/watchlist', {
        symbol,
        exchange,
        listName: targetListForAdd,
      });
      showToast(`${symbol} (${exchange}) added to "${targetListForAdd}".`, 'success');
      loadWatchlist(activeList);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Unable to add stock to watchlist.'), 'error');
    }
  };

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newListName.trim();
    if (cleaned.length < 2) return;
    if (!listNames.includes(cleaned)) {
      setListNames((prev) => [...prev, cleaned]);
    }
    setTargetListForAdd(cleaned);
    setActiveList(cleaned);
    setNewListName('');
    showToast(`Watchlist "${cleaned}" ready — add stocks below.`, 'info');
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/watchlist/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      showToast('Removed from watchlist.', 'info');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Unable to remove stock.'), 'error');
    }
  };

  if (!user) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-8 text-center space-y-3 max-w-lg mx-auto my-12">
        <Bookmark className="w-8 h-8 text-blue-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">Global Multi-Watchlist</h2>
        <p className="text-sm text-slate-400">
          Sign in to organize international stocks across multiple named watchlists with live quotes and saved AI research signals.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link to="/login" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">
            Sign In
          </Link>
          <Link to="/register" className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 text-sm font-medium">
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <MotionPage className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Bookmark className="w-6 h-6 text-blue-400" />
            Global Watchlists
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Organize worldwide equities across custom lists with exchange labels, native prices, and latest AI signals.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadWatchlist(activeList)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111827] border border-slate-800 hover:bg-slate-800 text-xs text-slate-200 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Quotes
        </button>
      </div>

      {/* Watchlist Tabs + New List Creator */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveList('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeList === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#0D1320] text-slate-400 hover:text-slate-100 border border-slate-800'
              }`}
            >
              All Lists
            </button>
            {listNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setActiveList(name);
                  setTargetListForAdd(name);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeList === name
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#0D1320] text-slate-400 hover:text-slate-100 border border-slate-800'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreateList} className="flex items-center gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list (e.g. US Tech, Japan)..."
              className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 w-52"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-200"
            >
              <FolderPlus className="w-3.5 h-3.5" /> New List
            </button>
          </form>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
            <span>Add to:</span>
            <select
              value={targetListForAdd}
              onChange={(e) => setTargetListForAdd(e.target.value)}
              className="bg-[#0D1320] border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100"
            >
              {listNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <StockSearchInput
              compact
              placeholder="Add any global stock (AAPL, NVDA, RELIANCE, 7203.T, HSBA.L)..."
              onSelect={handleAddStock}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Watchlist Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0D1320] text-xs text-slate-400">
                <th className="text-left py-3 px-4 font-medium">Equity</th>
                <th className="text-left py-3 px-3 font-medium">List · Market</th>
                <th className="text-right py-3 px-4 font-medium">Live Price</th>
                <th className="text-right py-3 px-4 font-medium">1D Change</th>
                <th className="text-center py-3 px-3 font-medium">Latest AI Stance</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <Link
                      to={`/stocks/${encodeURIComponent(item.symbol)}?exchange=${item.exchange}`}
                      className="font-mono font-semibold text-slate-100 hover:text-blue-400"
                    >
                      {item.symbol}
                    </Link>
                    <div className="text-xs text-slate-500 truncate max-w-[220px]">{item.companyName}</div>
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-400">
                    <span className="text-slate-200">{item.listName}</span>
                    <div className="text-[11px] text-slate-500">
                      {item.exchange} · {item.country} · {item.currency}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right num text-slate-100">
                    {item.price !== null ? formatCurrency(item.price, item.currency || 'USD') : 'Unavailable'}
                  </td>
                  <td className={`py-3 px-4 text-right num font-semibold ${deltaColorClass(item.changePercent ?? 0)}`}>
                    {item.changePercent !== null ? formatPct(item.changePercent) : '—'}
                  </td>
                  <td className="py-3 px-3 text-center text-xs">
                    {item.latestAiDecision ? (
                      <span className="font-semibold text-blue-300">
                        {item.latestAiDecision}{' '}
                        <span className="num text-slate-400 font-normal">({item.latestAiConfidence}%)</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Not analyzed</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        to={`/ai-analysis?symbol=${encodeURIComponent(item.symbol)}&exchange=${item.exchange}`}
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <BrainCircuit className="w-3.5 h-3.5" /> AI
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                        aria-label={`Remove ${item.symbol}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No stocks in this watchlist yet. Use the global search bar above to add equities.
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
