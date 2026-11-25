import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { apiClient, extractApiError } from '../lib/api.ts';
import {
  deltaColorClass,
  formatCompactGlobal,
  formatCurrency,
  formatPct,
} from '../lib/format.ts';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import { CandlestickChart } from '../components/CandlestickChart.tsx';
import { MotionPage } from '../components/MotionPrimitives.tsx';
import type { ExchangeCode } from '../shared/globalMarkets.ts';

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'] as const;

export function TechnicalAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [symbol, setSymbol] = useState((searchParams.get('symbol') || 'AAPL').toUpperCase());
  const [exchange, setExchange] = useState<ExchangeCode>(
    ((searchParams.get('exchange') || 'NASDAQ').toUpperCase() as ExchangeCode)
  );
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('6M');
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');

  const [showSma20, setShowSma20] = useState(true);
  const [showSma50, setShowSma50] = useState(true);
  const [showEma20, setShowEma20] = useState(false);
  const [showVwap, setShowVwap] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTechnical = useCallback(async (sym: string, ex: ExchangeCode, tf: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(
        `/stocks/${encodeURIComponent(sym)}?timeframe=${tf}&exchange=${ex}`
      );
      setData(res.data);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load technical chart series.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTechnical(symbol, exchange, timeframe);
  }, [symbol, exchange, timeframe, fetchTechnical]);

  const handleSelect = (sym: string, ex: ExchangeCode) => {
    setSymbol(sym);
    setExchange(ex);
    setSearchParams({ symbol: sym, exchange: ex });
  };

  const series = data?.history || [];
  const quote = data?.quote;
  const summary = data?.technicalSummary;
  const cur = quote?.currency || 'USD';

  return (
    <MotionPage className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">Global Technical Analysis Studio</h2>
          {quote ? (
            <p className="text-xs text-slate-400 mt-1 num">
              <span className="font-semibold text-slate-100">{quote.symbol}</span> ({quote.exchange} · {quote.country}) ·{' '}
              {formatCurrency(quote.price, cur)}{' '}
              <span className={deltaColorClass(quote.changePercent)}>
                ({formatPct(quote.changePercent)})
              </span>{' '}
              · Trend: {summary?.trend} · RSI(14): {summary?.rsi14 ?? '—'} · VWAP: {summary?.vwap ? formatCurrency(summary.vwap, cur) : '—'}
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1">
              Multi-panel interactive OHLC candlestick, SMA/EMA/VWAP/Bollinger overlays, Volume, RSI(14), and MACD(12,26,9)
            </p>
          )}
        </div>
        <div className="w-full lg:w-[480px]">
          <StockSearchInput value={symbol} onSelect={handleSelect} />
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#090D16] border border-slate-800 rounded-lg">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                timeframe === tf ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#090D16] border border-slate-800 rounded-lg">
            {(['candlestick', 'line'] as const).map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => setChartType(ct)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                  chartType === ct ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ct}
              </button>
            ))}
          </div>

          {[
            ['SMA 20', showSma20, setShowSma20],
            ['SMA 50', showSma50, setShowSma50],
            ['EMA 20', showEma20, setShowEma20],
            ['VWAP', showVwap, setShowVwap],
            ['Bollinger', showBollinger, setShowBollinger],
          ].map(([label, active, setter]: any) => (
            <button
              key={label}
              type="button"
              onClick={() => setter(!active)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                  : 'border-slate-800 bg-[#090D16] text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-12 flex items-center justify-center gap-3 text-sm text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          Loading {timeframe} historical bars for {symbol} ({exchange})...
        </div>
      ) : series.length > 0 ? (
        <div className="space-y-5">
          <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">
              Price Action ({chartType === 'candlestick' ? 'OHLC Candlesticks' : 'Closing Line'} · {cur})
            </h3>
            {chartType === 'candlestick' ? (
              <CandlestickChart
                data={series}
                currency={cur}
                showSma20={showSma20}
                showSma50={showSma50}
                showEma20={showEma20}
                showVwap={showVwap}
                showBollinger={showBollinger}
              />
            ) : (
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} minTickGap={30} tickLine={false} axisLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 11 }} width={64} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(val: any) => formatCurrency(Number(val), cur)}
                    />
                    <Line type="monotone" dataKey="close" name="Close" stroke="#e2e8f0" strokeWidth={2} dot={false} />
                    {showSma20 && <Line type="monotone" dataKey="sma20" name="SMA 20" stroke="#3b82f6" strokeWidth={1.5} dot={false} />}
                    {showSma50 && <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
                    {showEma20 && <Line type="monotone" dataKey="ema20" name="EMA 20" stroke="#a78bfa" strokeWidth={1.5} dot={false} />}
                    {showVwap && <Line type="monotone" dataKey="vwap" name="VWAP (20)" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="5 2" dot={false} />}
                    {showBollinger && <Line type="monotone" dataKey="bbUpper" name="BB Upper" stroke="#64748b" strokeDasharray="4 3" dot={false} />}
                    {showBollinger && <Line type="monotone" dataKey="bbLower" name="BB Lower" stroke="#64748b" strokeDasharray="4 3" dot={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Volume</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series.slice(-90)} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} minTickGap={30} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={60} tickLine={false} axisLine={false} tickFormatter={(v) => formatCompactGlobal(Number(v))} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="volume" name="Volume">
                    {series.slice(-90).map((b: any, i: number) => (
                      <Cell key={i} fill={b.close >= b.open ? '#10b98180' : '#ef444480'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-100">RSI (14)</h3>
                <span className="text-xs text-slate-400 num">
                  Current: {summary?.rsi14 ?? '—'} · {summary?.rsiState}
                </span>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.slice(-90)} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} minTickGap={30} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fill: '#64748b', fontSize: 10 }} width={36} tickLine={false} axisLine={false} />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                    <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                    <Line type="monotone" dataKey="rsi14" name="RSI(14)" stroke="#38bdf8" strokeWidth={1.8} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-100">MACD (12, 26, 9)</h3>
                <span className="text-xs text-slate-400">{summary?.macd.bias}</span>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series.slice(-90)} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} minTickGap={30} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={44} tickLine={false} axisLine={false} />
                    <ReferenceLine y={0} stroke="#475569" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="macdHistogram" name="Histogram">
                      {series.slice(-90).map((b: any, i: number) => (
                        <Cell key={i} fill={(b.macdHistogram ?? 0) >= 0 ? '#10b98170' : '#ef444470'} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="macd" name="MACD" stroke="#3b82f6" strokeWidth={1.6} dot={false} />
                    <Line type="monotone" dataKey="macdSignal" name="Signal" stroke="#f59e0b" strokeWidth={1.4} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </MotionPage>
  );
}
