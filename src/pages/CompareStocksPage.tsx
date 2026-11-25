import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, GitCompareArrows, Plus, RefreshCw, X } from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import { formatCompactGlobal, formatCurrency, formatPct, deltaColorClass } from '../lib/format.ts';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import { MotionCard, MotionPage } from '../components/MotionPrimitives.tsx';
import type { ExchangeCode } from '../shared/globalMarkets.ts';

interface SelectedStock {
  symbol: string;
  exchange: ExchangeCode;
}

const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#f43f5e'];

const PRESETS: Array<{ label: string; items: SelectedStock[] }> = [
  {
    label: 'AAPL vs MSFT',
    items: [
      { symbol: 'AAPL', exchange: 'NASDAQ' },
      { symbol: 'MSFT', exchange: 'NASDAQ' },
    ],
  },
  {
    label: 'NVDA vs AMD',
    items: [
      { symbol: 'NVDA', exchange: 'NASDAQ' },
      { symbol: 'AMD', exchange: 'NASDAQ' },
    ],
  },
  {
    label: 'TCS vs INFY',
    items: [
      { symbol: 'TCS', exchange: 'NSE' },
      { symbol: 'INFY', exchange: 'NSE' },
    ],
  },
  {
    label: 'TSLA vs Toyota (7203)',
    items: [
      { symbol: 'TSLA', exchange: 'NASDAQ' },
      { symbol: '7203', exchange: 'TSE' },
    ],
  },
  {
    label: 'Global Mega-Caps (4 Markets)',
    items: [
      { symbol: 'AAPL', exchange: 'NASDAQ' },
      { symbol: 'RELIANCE', exchange: 'NSE' },
      { symbol: 'SAP', exchange: 'XETRA' },
      { symbol: '7203', exchange: 'TSE' },
    ],
  },
];

const TIMEFRAMES = ['1M', '3M', '6M', '1Y', '5Y'] as const;

export function CompareStocksPage() {
  const [selected, setSelected] = useState<SelectedStock[]>(PRESETS[0].items);
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('6M');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runComparison = async (items: SelectedStock[], tf: (typeof TIMEFRAMES)[number]) => {
    if (items.length < 2) {
      setError('Select at least 2 stocks to compare.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/stocks/compare', {
        stocks: items,
        timeframe: tf,
      });
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to run multi-stock comparison.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runComparison(selected, timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addStock = (symbol: string, exchange: ExchangeCode) => {
    const clean = symbol.trim().toUpperCase();
    if (!clean) return;
    if (selected.some((s) => s.symbol === clean && s.exchange === exchange)) return;
    if (selected.length >= 5) return;
    const next = [...selected, { symbol: clean, exchange }];
    setSelected(next);
    runComparison(next, timeframe);
  };

  const removeStock = (symbol: string, exchange: ExchangeCode) => {
    if (selected.length <= 2) return;
    const next = selected.filter((s) => !(s.symbol === symbol && s.exchange === exchange));
    setSelected(next);
    runComparison(next, timeframe);
  };

  return (
    <MotionPage className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <GitCompareArrows className="w-6 h-6 text-blue-400" />
            Global Stock Comparison
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Compare up to 5 equities across international exchanges with currency-normalized percentage return trajectories.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#111827] border border-slate-800 rounded-lg p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  setTimeframe(tf);
                  runComparison(selected, tf);
                }}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  timeframe === tf
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => runComparison(selected, timeframe)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-800 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stock Picker & Quick Presets */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {selected.map((item, idx) => (
              <div
                key={`${item.symbol}:${item.exchange}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D1320] border border-slate-700 text-xs"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
                />
                <span className="font-mono font-semibold text-slate-100">{item.symbol}</span>
                <span className="text-slate-400 font-mono">{item.exchange}</span>
                {selected.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeStock(item.symbol, item.exchange)}
                    className="text-slate-500 hover:text-rose-400 ml-1"
                    aria-label={`Remove ${item.symbol}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {selected.length < 5 && (
              <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add up to {5 - selected.length} more
              </span>
            )}
          </div>
        </div>

        {selected.length < 5 && (
          <StockSearchInput
            placeholder="Add another global stock to compare (e.g. NVDA, TCS, SAP, 7203.T, HSBA.L)..."
            onSelect={addStock}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500">Quick Comparisons:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setSelected(p.items);
                runComparison(p.items, timeframe);
              }}
              className="px-2.5 py-1 rounded-md border border-slate-800 hover:border-blue-500/50 bg-[#0D1320] text-xs text-slate-300 hover:text-blue-300 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-8 animate-pulse space-y-4">
          <div className="h-5 bg-slate-800 rounded w-1/3" />
          <div className="h-72 bg-slate-800/70 rounded-lg" />
        </div>
      )}

      {data && (
        <>
          {/* Normalized Performance Chart */}
          <MotionCard className="bg-[#111827] border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Normalized Percentage Return ({data.timeframe})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{data.currencyNotice}</p>
              </div>
              <span className="text-xs text-slate-500 num shrink-0">
                Base = 0.00% at period start
              </span>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.normalizedTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    minTickGap={30}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v}%`}
                    width={54}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0D1320',
                      borderColor: '#334155',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(val: any) =>
                      typeof val === 'number' ? [`${val >= 0 ? '+' : ''}${val.toFixed(2)}%`] : ['N/A']
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {data.stocks.map((s: any, idx: number) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={`${s.quote.symbol} (${s.quote.exchange} · ${s.quote.currency})`}
                      stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </MotionCard>

          {/* Side-by-Side Valuation, Fundamentals, Technicals & Risk Matrix */}
          <MotionCard delay={0.05} className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">
                Multi-Market Quantitative &amp; Fundamental Matrix
              </h3>
              <span className="text-xs text-slate-500">
                Native prices displayed in each listing&apos;s own currency
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0D1320] text-xs text-slate-400">
                    <th className="text-left py-3 px-4 font-medium">Metric</th>
                    {data.stocks.map((s: any, idx: number) => (
                      <th key={s.key} className="text-right py-3 px-4 font-medium min-w-[160px]">
                        <Link
                          to={`/stocks/${encodeURIComponent(s.quote.symbol)}?exchange=${s.quote.exchange}`}
                          className="inline-flex items-center gap-1.5 text-slate-100 hover:text-blue-400"
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
                          />
                          <span className="font-mono">{s.quote.symbol}</span>
                          <span className="text-slate-500 font-normal">({s.quote.exchange})</span>
                        </Link>
                        <div className="text-[11px] text-slate-500 font-normal truncate max-w-[180px] ml-auto">
                          {s.quote.country} · {s.quote.currency}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Last Price (Native Currency)</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-slate-100 font-medium">
                        {formatCurrency(s.quote.price, s.quote.currency)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">1D Change</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className={`py-3 px-4 text-right num font-medium ${deltaColorClass(s.quote.changePercent)}`}>
                        {formatPct(s.quote.changePercent)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">{data.timeframe} Period Return</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className={`py-3 px-4 text-right num font-semibold ${deltaColorClass(s.periodReturnPct)}`}>
                        {formatPct(s.periodReturnPct)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Market Cap</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-slate-200">
                        {formatCompactGlobal(s.fundamentals?.marketCap ?? s.quote.marketCap, s.quote.currency)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Trailing P/E · Forward P/E</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-slate-200">
                        {s.fundamentals?.trailingPE ?? 'N/A'} · {s.fundamentals?.forwardPE ?? 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">ROE · Profit Margin</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-slate-200">
                        {s.fundamentals?.roePct !== null && s.fundamentals?.roePct !== undefined
                          ? `${s.fundamentals.roePct}%`
                          : 'N/A'}{' '}
                        ·{' '}
                        {s.fundamentals?.profitMarginPct !== null && s.fundamentals?.profitMarginPct !== undefined
                          ? `${s.fundamentals.profitMarginPct}%`
                          : 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Dividend Yield</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-slate-200">
                        {s.fundamentals?.dividendYieldPct !== null && s.fundamentals?.dividendYieldPct !== undefined
                          ? `${s.fundamentals.dividendYieldPct}%`
                          : 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Primary Trend · RSI(14)</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right text-slate-200">
                        <span
                          className={
                            s.technicalSummary.trend === 'Uptrend'
                              ? 'text-emerald-400'
                              : s.technicalSummary.trend === 'Downtrend'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                          }
                        >
                          {s.technicalSummary.trend}
                        </span>{' '}
                        <span className="num text-slate-400">· {s.technicalSummary.rsi14 ?? 'N/A'}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Annualized Volatility</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-slate-200">
                        {s.technicalSummary.annualizedVolatilityPct}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Max Drawdown ({data.timeframe})</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-rose-400">
                        -{s.technicalSummary.maxDrawdownPct}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Est. Sharpe Ratio</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num text-slate-200">
                        {s.technicalSummary.sharpeRatio ?? 'N/A'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-3 px-4 text-slate-400">Composite Risk Score</td>
                    {data.stocks.map((s: any) => (
                      <td key={s.key} className="py-3 px-4 text-right num font-semibold">
                        <span
                          className={
                            s.riskScore >= 68
                              ? 'text-rose-400'
                              : s.riskScore >= 42
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                          }
                        >
                          {s.riskScore} / 100
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </MotionCard>
        </>
      )}
    </MotionPage>
  );
}
