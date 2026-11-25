import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Briefcase,
  Globe2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import { deltaColorClass, formatCurrency, formatPct, formatTimestampUTC } from '../lib/format.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { usePreferences } from '../context/PreferencesContext.tsx';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import { AnimatedNumber, MotionCard, MotionPage } from '../components/MotionPrimitives.tsx';
import {
  GLOBAL_EXCHANGES,
  SUPPORTED_CURRENCIES,
  type ExchangeCode,
} from '../shared/globalMarkets.ts';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#f43f5e', '#84cc16'];

export function PortfolioPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { displayCurrency, setDisplayCurrency } = usePreferences();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allocView, setAllocView] = useState<'sector' | 'country' | 'currency'>('country');

  // Add holding form state
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<ExchangeCode>('NASDAQ');
  const [quantity, setQuantity] = useState('10');
  const [avgBuyPrice, setAvgBuyPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPortfolio = async (base = displayCurrency) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/portfolio', { params: { baseCurrency: base } });
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load portfolio.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolio(displayCurrency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, displayCurrency]);

  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || Number(quantity) <= 0 || Number(avgBuyPrice) <= 0) {
      showToast('Enter a valid ticker, quantity, and buy price.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/portfolio', {
        symbol: symbol.trim().toUpperCase(),
        exchange,
        quantity: Number(quantity),
        avgBuyPrice: Number(avgBuyPrice),
        purchaseDate,
        notes: notes.trim() || undefined,
      });
      setSymbol('');
      setAvgBuyPrice('');
      setNotes('');
      showToast('International holding added to PostgreSQL portfolio.', 'success');
      loadPortfolio(displayCurrency);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Failed to add holding.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/portfolio/${id}`);
      showToast('Holding removed from portfolio.', 'info');
      loadPortfolio(displayCurrency);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Unable to remove holding.'), 'error');
    }
  };

  if (!user) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-8 text-center space-y-3 max-w-lg mx-auto my-12">
        <Briefcase className="w-8 h-8 text-blue-400 mx-auto" />
        <h2 className="text-xl font-bold text-slate-100">Global Multi-Currency Portfolio</h2>
        <p className="text-sm text-slate-400">
          Sign in to track international holdings across 16 exchanges with live FX conversion, country/currency allocation, and PostgreSQL persistence.
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

  const baseCur = data?.baseCurrency || displayCurrency;
  const summary = data?.summary;
  const allocData =
    allocView === 'country'
      ? (data?.allocationByCountry || []).map((a: any) => ({ name: a.country, value: a.value, weightPct: a.weightPct }))
      : allocView === 'currency'
        ? (data?.allocationByCurrency || []).map((a: any) => ({ name: a.currency, value: a.value, weightPct: a.weightPct }))
        : (data?.allocationBySector || []).map((a: any) => ({ name: a.sector, value: a.value, weightPct: a.weightPct }));

  return (
    <MotionPage className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <Briefcase className="w-6 h-6 text-blue-400" />
            Global Multi-Currency Portfolio
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Hold equities across US, India, Europe, and Asia-Pacific with transparent live FX valuation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#111827] border border-slate-800 rounded-lg px-3 py-1.5">
            <Globe2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Valuation Currency:</span>
            <select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value)}
              className="bg-transparent text-slate-100 font-mono font-semibold focus:outline-none"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-[#111827]">
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => loadPortfolio(displayCurrency)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111827] border border-slate-800 hover:bg-slate-800 text-xs text-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {data?.fxSnapshot && (
        <div className="bg-[#0D1320] border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            FX Conversion: <strong className="text-slate-200">{data.fxSnapshot.source}</strong> · Base{' '}
            <span className="font-mono text-blue-400">{data.fxSnapshot.base}</span> ({data.fxSnapshot.freshness})
          </span>
          <span className="num text-slate-500">
            Updated {formatTimestampUTC(data.fxSnapshot.fetchedAt)}
          </span>
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Portfolio KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MotionCard className="bg-[#111827] border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Current Portfolio Value ({baseCur})</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              <AnimatedNumber value={summary.currentValue} formatter={(n) => formatCurrency(n, baseCur)} />
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {summary.holdingsCount} holdings · {summary.countriesCount} countries · {summary.currenciesCount} currencies
            </div>
          </MotionCard>

          <MotionCard delay={0.04} className="bg-[#111827] border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Total Invested ({baseCur})</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">
              <AnimatedNumber value={summary.totalInvestment} formatter={(n) => formatCurrency(n, baseCur)} />
            </div>
            <div className="text-xs text-slate-500 mt-1">Converted at spot mid-rates</div>
          </MotionCard>

          <MotionCard delay={0.08} className="bg-[#111827] border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Unrealized P&amp;L ({baseCur})</div>
            <div className={`text-2xl font-bold mt-1 ${deltaColorClass(summary.totalPnl)}`}>
              <AnimatedNumber value={summary.totalPnl} formatter={(n) => formatCurrency(n, baseCur)} />
            </div>
            <div className={`num text-xs font-medium mt-1 ${deltaColorClass(summary.totalReturnPct)}`}>
              {formatPct(summary.totalReturnPct)} total return
            </div>
          </MotionCard>

          <MotionCard delay={0.12} className="bg-[#111827] border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">Today&apos;s Session P&amp;L ({baseCur})</div>
            <div className={`text-2xl font-bold mt-1 ${deltaColorClass(summary.totalDayPnl)}`}>
              <AnimatedNumber value={summary.totalDayPnl} formatter={(n) => formatCurrency(n, baseCur)} />
            </div>
            <div className="text-xs text-slate-500 mt-1">Aggregated across open/closed markets</div>
          </MotionCard>
        </div>
      )}

      {/* Add International Holding Form */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-400" /> Add Global Equity Holding
          </h3>
          <span className="text-xs text-slate-500">
            Buy price is entered in the listing&apos;s native currency ({GLOBAL_EXCHANGES[exchange]?.currency})
          </span>
        </div>

        <StockSearchInput
          compact
          placeholder="Search any global equity to pre-fill ticker & exchange (AAPL, RELIANCE, 7203.T, SAP)..."
          onSelect={(sym, ex) => {
            setSymbol(sym);
            setExchange(ex);
          }}
        />

        <form onSubmit={handleAddHolding} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Ticker (e.g. AAPL, TCS)"
            required
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500"
          />
          <select
            value={exchange}
            onChange={(e) => setExchange(e.target.value as ExchangeCode)}
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
          >
            {(Object.keys(GLOBAL_EXCHANGES) as ExchangeCode[]).map((ex) => (
              <option key={ex} value={ex}>
                {ex} ({GLOBAL_EXCHANGES[ex].currency})
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            min="0.0001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantity"
            required
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs num text-slate-100"
          />
          <input
            type="number"
            step="any"
            min="0.01"
            value={avgBuyPrice}
            onChange={(e) => setAvgBuyPrice(e.target.value)}
            placeholder={`Buy Price (${GLOBAL_EXCHANGES[exchange]?.currency})`}
            required
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs num text-slate-100"
          />
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
            className="bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-xs num text-slate-200"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {submitting ? 'Saving...' : 'Add Holding'}
          </button>
        </form>
      </div>

      {/* Charts: Valuation History + Country/Currency/Sector Allocation */}
      {data && data.holdings?.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">
              30-Day Portfolio Value ({baseCur})
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.performanceHistory || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} minTickGap={20} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} width={64} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0D1320', borderColor: '#334155', borderRadius: 8, fontSize: 12 }}
                    formatter={(val: any) => [formatCurrency(Number(val), baseCur), 'Portfolio Value']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.14} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-100">Allocation Breakdown</h3>
              <div className="flex items-center bg-[#0D1320] border border-slate-800 rounded-md p-0.5 text-[11px]">
                {(['country', 'currency', 'sector'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAllocView(v)}
                    className={`px-2 py-1 rounded capitalize ${
                      allocView === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {allocData.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0D1320', borderColor: '#334155', borderRadius: 8, fontSize: 12 }}
                    formatter={(val: any) => [formatCurrency(Number(val), baseCur)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1.5 mt-2">
              {allocData.slice(0, 5).map((a: any, i: number) => (
                <div key={a.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-300 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {a.name}
                  </span>
                  <span className="num text-slate-200 font-medium">{a.weightPct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Holdings Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Holdings Register</h3>
          <span className="text-xs text-slate-500">Native currency + converted {baseCur} valuation</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0D1320] text-xs text-slate-400">
                <th className="text-left py-3 px-4 font-medium">Equity</th>
                <th className="text-right py-3 px-3 font-medium">Qty</th>
                <th className="text-right py-3 px-4 font-medium">Avg Cost</th>
                <th className="text-right py-3 px-4 font-medium">Live Price</th>
                <th className="text-right py-3 px-4 font-medium">Value ({baseCur})</th>
                <th className="text-right py-3 px-4 font-medium">P&amp;L ({baseCur})</th>
                <th className="text-right py-3 px-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {(data?.holdings || []).map((h: any) => (
                <tr key={h.id} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <Link
                      to={`/stocks/${encodeURIComponent(h.symbol)}?exchange=${h.exchange}`}
                      className="font-mono font-semibold text-slate-100 hover:text-blue-400"
                    >
                      {h.symbol}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {h.exchange} · {h.country} · {h.currency}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right num text-slate-200">{h.quantity}</td>
                  <td className="py-3 px-4 text-right num text-slate-300">
                    {formatCurrency(h.avgBuyPrice, h.currency)}
                  </td>
                  <td className="py-3 px-4 text-right num text-slate-100">
                    {h.livePrice !== null ? formatCurrency(h.livePrice, h.currency) : 'Unavailable'}
                  </td>
                  <td className="py-3 px-4 text-right num text-slate-100 font-medium">
                    {h.currentValueBase !== null
                      ? formatCurrency(h.currentValueBase, baseCur)
                      : formatCurrency(h.currentValue, h.currency)}
                  </td>
                  <td className={`py-3 px-4 text-right num font-semibold ${deltaColorClass(h.pnlPct)}`}>
                    {h.pnlBase !== null
                      ? formatCurrency(h.pnlBase, baseCur)
                      : formatCurrency(h.pnl, h.currency)}{' '}
                    <span className="text-xs font-normal">({formatPct(h.pnlPct)})</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(h.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                      aria-label={`Delete ${h.symbol}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!data?.holdings || data.holdings.length === 0) && !loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No holdings yet. Add your first global equity above (e.g. AAPL on NASDAQ or RELIANCE on NSE).
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
