import React, { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Cpu, Loader2, ShieldAlert } from 'lucide-react';
import { apiClient, extractApiError } from '../lib/api.ts';
import {
  deltaColorClass,
  formatCurrency,
  formatPct,
  formatTimestampUTC,
} from '../lib/format.ts';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import { MotionPage } from '../components/MotionPrimitives.tsx';
import type { ExchangeCode } from '../shared/globalMarkets.ts';

export function PredictionsPage() {
  const [symbol, setSymbol] = useState('NVDA');
  const [exchange, setExchange] = useState<ExchangeCode>('NASDAQ');
  const [horizonDays, setHorizonDays] = useState(7);

  const [runData, setRunData] = useState<any>(null);
  const [selectedModelName, setSelectedModelName] = useState<string>('');
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/predictions/history');
      setHistoryRows(data.items || []);
    } catch {
      // ignore initial history load error
    }
  }, []);

  const runMlForecast = useCallback(
    async (sym: string, ex: ExchangeCode, horizon: number) => {
      setRunning(true);
      setError(null);
      setSymbol(sym);
      setExchange(ex);
      try {
        const { data } = await apiClient.post('/predictions/run', {
          symbol: sym,
          exchange: ex,
          horizonDays: horizon,
        });
        setRunData(data);
        setSelectedModelName(data.pipeline?.bestModel || data.pipeline?.models?.[0]?.modelName || '');
        await loadHistory();
      } catch (err) {
        setError(extractApiError(err, 'Unable to train ML models for this symbol.'));
      } finally {
        setRunning(false);
      }
    },
    [loadHistory]
  );

  useEffect(() => {
    void loadHistory();
    void runMlForecast('NVDA', 'NASDAQ', 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pipeline = runData?.pipeline;
  const cur = runData?.quote?.currency || pipeline?.currency || 'USD';
  const activeModel =
    pipeline?.models?.find((m: any) => m.modelName === selectedModelName) || pipeline?.models?.[0];

  return (
    <MotionPage className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">Global ML Forecasting Lab &amp; History</h2>
          <p className="text-xs text-slate-400 mt-1">
            Chronological 80/20 train-test evaluation across Ridge Linear Regression, Random Forest, and Gradient Boosted Trees with VWAP &amp; momentum features.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          <div className="w-full sm:w-96">
            <StockSearchInput
              value={symbol}
              onSelect={(sym, ex) => void runMlForecast(sym, ex, horizonDays)}
            />
          </div>
          <select
            value={horizonDays}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHorizonDays(h);
              void runMlForecast(symbol, exchange, h);
            }}
            aria-label="Forecast horizon days"
            className="bg-[#111827] border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200"
          >
            <option value={1}>Horizon: 1 Day</option>
            <option value={7}>Horizon: 7 Days</option>
            <option value={14}>Horizon: 14 Days</option>
            <option value={30}>Horizon: 30 Days</option>
            <option value={90}>Horizon: 90 Days</option>
            <option value={180}>Horizon: 180 Days</option>
          </select>
        </div>
      </div>

      {running && (
        <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-sm text-slate-300">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <div>
            Engineering features, training models, and computing out-of-sample metrics for {symbol} ({exchange})...
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!running && pipeline && activeModel && (
        <>
          <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  {pipeline.symbol} ({pipeline.exchange} · {cur}) · Out-of-Sample Model Evaluation
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Engine: {pipeline.engineSource} · Train: {pipeline.trainSamples} sessions
                  {pipeline.trainPeriod?.start ? ` (${pipeline.trainPeriod.start}–${pipeline.trainPeriod.end})` : ''} · Test:{' '}
                  {pipeline.testSamples} sessions
                  {pipeline.testPeriod?.start ? ` (${pipeline.testPeriod.start}–${pipeline.testPeriod.end})` : ''} · Current:{' '}
                  {formatCurrency(pipeline.currentPrice, cur)}
                </p>
              </div>
              <div className="text-xs text-blue-400 font-medium inline-flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Lowest RMSE: {pipeline.bestModel}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 text-xs text-slate-400 text-left">
                    <th className="py-3 px-5 font-medium">Model (Click to inspect)</th>
                    <th className="py-3 px-4 font-medium text-right">MAE</th>
                    <th className="py-3 px-4 font-medium text-right">RMSE</th>
                    <th className="py-3 px-4 font-medium text-right">MAPE</th>
                    <th className="py-3 px-4 font-medium text-right">R²</th>
                    <th className="py-3 px-4 font-medium text-right">Dir. Accuracy</th>
                    <th className="py-3 px-4 font-medium text-right">{pipeline.horizonDays}D Forecast</th>
                    <th className="py-3 px-5 font-medium text-right">Backtest vs B&amp;H</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pipeline.models.map((m: any) => {
                    const isSelected = m.modelName === activeModel.modelName;
                    return (
                      <tr
                        key={m.modelName}
                        onClick={() => setSelectedModelName(m.modelName)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-500/10' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-5">
                          <div className="font-medium text-slate-100">{m.modelName}</div>
                          <div className="text-xs text-slate-500 num">{m.modelVersion}</div>
                        </td>
                        <td className="py-3 px-4 text-right num text-slate-200">{formatCurrency(m.mae, cur)}</td>
                        <td className="py-3 px-4 text-right num text-slate-200">{formatCurrency(m.rmse, cur)}</td>
                        <td className="py-3 px-4 text-right num text-slate-200">{m.mape}%</td>
                        <td className="py-3 px-4 text-right num text-slate-300">{m.r2}</td>
                        <td className="py-3 px-4 text-right num text-slate-200">{m.directionalAccuracy}%</td>
                        <td className={`py-3 px-4 text-right num font-medium ${deltaColorClass(m.expectedReturnPct)}`}>
                          {formatCurrency(m.predictedHorizonPrice, cur)} ({formatPct(m.expectedReturnPct)})
                        </td>
                        <td className="py-3 px-5 text-right num text-xs text-slate-300">
                          {formatPct(m.backtest.strategyReturnPct)} vs {formatPct(m.backtest.buyAndHoldReturnPct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-[#111827] border border-slate-800/80 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-100 mb-1">
                Held-Out Test Set: Actual vs Predicted ({activeModel.modelName})
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Walk-forward out-of-sample predictions · Win rate {activeModel.backtest.winRatePct}% over{' '}
                {activeModel.backtest.tradesCount} signaled sessions
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activeModel.testPoints} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} minTickGap={24} tickLine={false} axisLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} width={64} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(val: any) => formatCurrency(Number(val), cur)}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line type="monotone" dataKey="actual" name="Actual Close" stroke="#e2e8f0" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="predicted" name="Model Predicted" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#111827] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 mb-1">
                  {pipeline.horizonDays}-Day Forecast Path (Uncertainty Band)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Confidence corridor scaled by out-of-sample test RMSE ({cur})
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pipeline.forecastTrajectory} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} width={60} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(val: any) => formatCurrency(Number(val), cur)}
                      />
                      <Line type="monotone" dataKey="upperBand" name="Upper Band" stroke="#64748b" strokeDasharray="3 3" dot={false} />
                      <Line type="monotone" dataKey="predictedPrice" name="Projected" stroke="#10b981" strokeWidth={2} dot />
                      <Line type="monotone" dataKey="lowerBand" name="Lower Band" stroke="#64748b" strokeDasharray="3 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
                <div className="text-amber-400 font-semibold inline-flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Methodology &amp; Limitations
                </div>
                <p>{pipeline.methodologyNote}</p>
                {pipeline.limitations?.slice(0, 2).map((l: string, i: number) => (
                  <p key={i}>· {l}</p>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800/80">
          <h3 className="text-base font-semibold text-slate-100">Saved Prediction History</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Recorded out-of-sample global model runs stored in PostgreSQL
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 text-xs text-slate-400 text-left">
                <th className="py-3 px-5 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Stock</th>
                <th className="py-3 px-4 font-medium">Winning Model</th>
                <th className="py-3 px-4 font-medium text-right">Base Price</th>
                <th className="py-3 px-4 font-medium text-right">Predicted</th>
                <th className="py-3 px-4 font-medium text-right">RMSE / MAPE</th>
                <th className="py-3 px-5 font-medium text-right">Dir. Acc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {historyRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                    No prediction runs recorded yet.
                  </td>
                </tr>
              ) : (
                historyRows.map((row) => {
                  const rowCur = row.currency || 'INR';
                  return (
                    <tr key={row.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-5 text-xs text-slate-400 num">
                        {formatTimestampUTC(row.createdAt)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-100">
                        {row.symbol}{' '}
                        <span className="text-xs text-slate-500 font-normal">
                          {row.exchange} · {row.horizonDays}D
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-300">
                        {row.modelName} <span className="text-slate-500">({row.modelVersion})</span>
                      </td>
                      <td className="py-3 px-4 text-right num text-slate-300">
                        {formatCurrency(row.currentPrice, rowCur)}
                      </td>
                      <td className={`py-3 px-4 text-right num font-medium ${deltaColorClass(row.expectedReturnPct)}`}>
                        {formatCurrency(row.predictedPrice, rowCur)} ({formatPct(row.expectedReturnPct)})
                      </td>
                      <td className="py-3 px-4 text-right num text-xs text-slate-300">
                        {formatCurrency(row.rmse, rowCur)} / {row.mape}%
                      </td>
                      <td className="py-3 px-5 text-right num text-xs text-slate-200">
                        {row.directionalAccuracy}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MotionPage>
  );
}
