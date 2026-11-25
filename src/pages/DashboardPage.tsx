import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Globe2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import {
  deltaColorClass,
  formatCurrency,
  formatNumber,
  formatPct,
  formatTimestampUTC,
} from '../lib/format.ts';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import {
  AnimatedNumber,
  GlobalMarketHeatmap,
  MotionCard,
  MotionPage,
} from '../components/MotionPrimitives.tsx';
import type { ExchangeCode, GlobalRegion } from '../shared/globalMarkets.ts';

type RegionTab = 'ALL' | GlobalRegion;

const REGION_TABS: RegionTab[] = ['ALL', 'North America', 'India', 'Europe', 'Asia-Pacific'];

export function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regionTab, setRegionTab] = useState<RegionTab>('ALL');
  const [moverTab, setMoverTab] = useState<'gainers' | 'losers' | 'active'>('gainers');
  const navigate = useNavigate();

  const loadGlobalOverview = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get('/markets/global');
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load global market overview.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadGlobalOverview();
  }, []);

  const filteredIndices = useMemo(() => {
    if (!data?.indices) return [];
    if (regionTab === 'ALL') return data.indices;
    return data.indices.filter((i: any) => i.region === regionTab);
  }, [data, regionTab]);

  const filteredHeatmap = useMemo(() => {
    if (!data?.heatmap) return [];
    if (regionTab === 'ALL') return data.heatmap;
    return data.heatmap.filter((i: any) => i.region === regionTab);
  }, [data, regionTab]);

  const moverList = useMemo(() => {
    if (!data) return [];
    const base =
      moverTab === 'gainers'
        ? data.topGainers
        : moverTab === 'losers'
          ? data.topLosers
          : data.mostActive;
    if (!Array.isArray(base)) return [];
    if (regionTab === 'ALL') return base;
    const regional = (data.heatmap || []).filter((q: any) => q.region === regionTab);
    if (moverTab === 'gainers') return [...regional].sort((a: any, b: any) => b.changePercent - a.changePercent).slice(0, 8);
    if (moverTab === 'losers') return [...regional].sort((a: any, b: any) => a.changePercent - b.changePercent).slice(0, 8);
    return [...regional].sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0)).slice(0, 8);
  }, [data, moverTab, regionTab]);

  const handleSelectStock = (symbol: string, exchange: ExchangeCode | string) => {
    navigate(`/stocks/${encodeURIComponent(symbol)}?exchange=${exchange}`);
  };

  return (
    <MotionPage className="space-y-6">
      {/* Header & Global Search */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Globe2 className="w-3.5 h-3.5 text-blue-400" />
            <span>16 Worldwide Exchanges · US · India · Europe · Asia-Pacific</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-100">Global Market Intelligence</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {data?.lastUpdated && (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{data.freshness || 'Exchange Feed'} · Updated {formatTimestampUTC(data.lastUpdated)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => loadGlobalOverview(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111827] border border-slate-800 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Markets
          </button>
        </div>
      </div>

      {/* Prominent Global Stock Search Bar */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
        <StockSearchInput
          showFilters
          placeholder="Search worldwide equities by ticker, company, exchange, or ISIN (AAPL, NVDA, RELIANCE, TCS, 7203.T, HSBA.L)..."
          onSelect={handleSelectStock}
        />
      </div>

      {/* Regional Market Open / Closed Sessions */}
      {data?.regionalSessions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {data.regionalSessions.map((reg: any) => {
            const isOpen = reg.session.status === 'OPEN';
            const isPre = reg.session.status === 'PRE_OPEN';
            return (
              <button
                key={reg.region}
                type="button"
                onClick={() => setRegionTab(regionTab === reg.region ? 'ALL' : reg.region)}
                className={`text-left bg-[#111827] border rounded-xl p-3.5 transition-colors ${
                  regionTab === reg.region
                    ? 'border-blue-500/70 bg-blue-500/5'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-100">{reg.region}</span>
                  <span
                    className={`text-[11px] font-medium ${
                      isOpen
                        ? 'text-emerald-400'
                        : isPre
                          ? 'text-amber-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {reg.session.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2 text-xs">
                  <span className="text-slate-500 num">
                    {reg.representativeExchange} · {reg.session.localTime}
                  </span>
                  <span className={`num font-semibold ${deltaColorClass(reg.avgChangePct)}`}>
                    {formatPct(reg.avgChangePct)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Region Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center bg-[#111827] border border-slate-800 rounded-lg p-1 gap-1">
          {REGION_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setRegionTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                regionTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab === 'ALL' ? 'All Global Markets' : tab}
            </button>
          ))}
        </div>

        {data?.breadth && (
          <div className="text-xs text-slate-400 num">
            Global Sample Breadth: <span className="text-emerald-400">{data.breadth.advancing} Adv</span> ·{' '}
            <span className="text-rose-400">{data.breadth.declining} Dec</span> ·{' '}
            <span className="text-slate-500">{data.breadth.sampleSize} tracked</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadGlobalOverview(true)}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs text-rose-200 font-medium shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#111827] border border-slate-800 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-3.5 bg-slate-800 rounded w-1/2" />
              <div className="h-6 bg-slate-800 rounded w-2/3" />
              <div className="h-10 bg-slate-800/70 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Global Benchmark Indices Grid */}
      {!loading && filteredIndices.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">
              Benchmark Indices ({filteredIndices.length})
            </h3>
            <span className="text-xs text-slate-500">1-month daily close sparklines</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredIndices.map((idx: any, i: number) => {
              const isPos = idx.changePercent >= 0;
              return (
                <MotionCard
                  key={idx.key}
                  delay={Math.min(0.24, i * 0.02)}
                  className="bg-[#111827] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-400 truncate">
                        {idx.country} · {idx.exchange}
                      </div>
                      <div className="text-sm font-semibold text-slate-100 truncate mt-0.5">
                        {idx.name}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-medium shrink-0 ${
                        idx.marketStatus?.status === 'OPEN' ? 'text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {idx.marketStatus?.status === 'OPEN' ? 'Open' : 'Closed'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 mt-3">
                    <AnimatedNumber
                      value={idx.price}
                      formatter={(n) => formatNumber(n)}
                      className="text-xl font-bold text-slate-100"
                    />
                    <span className={`num text-xs font-semibold ${deltaColorClass(idx.changePercent)}`}>
                      {formatPct(idx.changePercent)}
                    </span>
                  </div>

                  {idx.trend && idx.trend.length > 2 && (
                    <div className="h-12 w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={idx.trend}>
                          <Line
                            type="monotone"
                            dataKey="close"
                            stroke={isPos ? '#10b981' : '#ef4444'}
                            strokeWidth={1.6}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </MotionCard>
              );
            })}
          </div>
        </section>
      )}

      {/* Regional Performance Chart + Global Movers Table */}
      {!loading && data && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <MotionCard className="xl:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Index Daily Performance (%)</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Latest session percentage change across major world benchmarks
                </p>
              </div>
            </div>
            <div className="flex-1 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(filteredIndices || []).slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 10, right: 18, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={118}
                    tick={{ fill: '#cbd5e1', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0D1320',
                      borderColor: '#334155',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(val: any) => [`${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(2)}%`, 'Daily Move']}
                  />
                  <Bar dataKey="changePercent" radius={[0, 4, 4, 0]}>
                    {(filteredIndices || []).slice(0, 10).map((entry: any) => (
                      <Cell
                        key={entry.key}
                        fill={entry.changePercent >= 0 ? '#10b981' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </MotionCard>

          <MotionCard delay={0.05} className="xl:col-span-7 bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center bg-[#0D1320] border border-slate-800 rounded-lg p-0.5">
                {[
                  { id: 'gainers', label: 'Top Gainers', icon: TrendingUp },
                  { id: 'losers', label: 'Top Losers', icon: TrendingDown },
                  { id: 'active', label: 'Most Active', icon: Globe2 },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMoverTab(t.id as any)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      moverTab === t.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Link
                to="/screener"
                className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
              >
                Open Global Screener <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400 bg-[#0D1320]">
                    <th className="text-left py-2.5 px-4 font-medium">Stock</th>
                    <th className="text-left py-2.5 px-3 font-medium">Market</th>
                    <th className="text-right py-2.5 px-4 font-medium">Price</th>
                    <th className="text-right py-2.5 px-4 font-medium">Change</th>
                    <th className="text-right py-2.5 px-4 font-medium">Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {moverList.map((s: any) => (
                    <tr
                      key={`${s.symbol}:${s.exchange}`}
                      onClick={() => handleSelectStock(s.symbol, s.exchange)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-mono font-semibold text-slate-100">{s.symbol}</div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{s.name}</div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-400">
                        <span className="font-mono text-slate-200">{s.exchange}</span> · {s.country}
                      </td>
                      <td className="py-2.5 px-4 text-right num text-slate-100">
                        {formatCurrency(s.price, s.currency)}
                      </td>
                      <td className={`py-2.5 px-4 text-right num font-semibold ${deltaColorClass(s.changePercent)}`}>
                        {formatPct(s.changePercent)}
                      </td>
                      <td className="py-2.5 px-4 text-right num text-xs text-slate-400">
                        {s.volume ? Number(s.volume).toLocaleString('en-US') : '—'}
                      </td>
                    </tr>
                  ))}
                  {moverList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-500">
                        No equities matching this mover filter in the current sample.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </MotionCard>
        </div>
      )}

      {/* Global Market Heatmap */}
      {!loading && filteredHeatmap.length > 0 && (
        <MotionCard delay={0.08} className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Global Equity Market Heatmap</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any tile to open full technical charts, fundamentals, and AI research
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <Link to="/compare" className="text-blue-400 hover:text-blue-300">
                Compare Global Stocks →
              </Link>
            </div>
          </div>
          <GlobalMarketHeatmap items={filteredHeatmap} onSelect={handleSelectStock} />
        </MotionCard>
      )}
    </MotionPage>
  );
}
