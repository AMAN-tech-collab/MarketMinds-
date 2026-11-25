import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calculator, ShieldAlert } from 'lucide-react';
import { api, getApiErrorMessage } from '../lib/api.ts';
import { formatCurrency } from '../lib/format.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { usePreferences } from '../context/PreferencesContext.tsx';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import { MotionPage } from '../components/MotionPrimitives.tsx';
import { GLOBAL_EXCHANGES, SUPPORTED_CURRENCIES, type ExchangeCode } from '../shared/globalMarkets.ts';

export function RiskCalculatorPage() {
  const { user } = useAuth();
  const { displayCurrency } = usePreferences();

  const [symbol, setSymbol] = useState('NVDA');
  const [exchange, setExchange] = useState<ExchangeCode>('NASDAQ');
  const [currency, setCurrency] = useState('USD');
  const [accountCapital, setAccountCapital] = useState('25000');
  const [riskPercent, setRiskPercent] = useState('1.5');
  const [entryPrice, setEntryPrice] = useState('140');
  const [stopLossPrice, setStopLossPrice] = useState('130');
  const [targetPrice, setTargetPrice] = useState('165');

  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const [portfolioRisk, setPortfolioRisk] = useState<any>(null);
  const [portLoading, setPortLoading] = useState(false);

  const runCalculation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCalcLoading(true);
    setCalcError(null);
    try {
      const res = await api.post('/risk/calculate', {
        accountCapital: Number(accountCapital),
        riskPercentPerTrade: Number(riskPercent),
        entryPrice: Number(entryPrice),
        stopLossPrice: Number(stopLossPrice),
        targetPrice: Number(targetPrice),
        currency,
        symbol: symbol.trim() || undefined,
        exchange,
      });
      setCalcResult(res.data);
    } catch (err) {
      setCalcError(getApiErrorMessage(err, 'Unable to compute position sizing risk.'));
    } finally {
      setCalcLoading(false);
    }
  };

  useEffect(() => {
    runCalculation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    setPortLoading(true);
    api
      .get('/risk/portfolio', { params: { baseCurrency: displayCurrency } })
      .then((res) => setPortfolioRisk(res.data))
      .catch(() => setPortfolioRisk(null))
      .finally(() => setPortLoading(false));
  }, [user, displayCurrency]);

  const activeCur = calcResult?.currency || currency;

  const corrColor = (val: number | null) => {
    if (val === null) return 'bg-slate-900 text-slate-500';
    if (val >= 0.75) return 'bg-rose-500/25 text-rose-200';
    if (val >= 0.4) return 'bg-amber-500/20 text-amber-200';
    if (val <= -0.2) return 'bg-emerald-500/20 text-emerald-200';
    return 'bg-slate-800/70 text-slate-300';
  };

  return (
    <MotionPage className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
          <ShieldAlert className="w-6 h-6 text-blue-400" />
          Global Risk Analytics &amp; Position Sizing
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Multi-currency ATR position sizing plus portfolio volatility, max drawdown, Beta vs S&amp;P 500, Sharpe ratio, FX exposure, and pairwise correlations.
        </p>
      </div>

      {/* Trade Risk Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-400" /> Trade Position Sizing &amp; ATR Stop-Loss
          </h3>

          <StockSearchInput
            compact
            value={symbol}
            placeholder="Optional: link global stock for live ATR(14)..."
            onSelect={(sym, ex) => {
              setSymbol(sym);
              setExchange(ex);
              setCurrency(GLOBAL_EXCHANGES[ex]?.currency || 'USD');
            }}
          />

          <form onSubmit={runCalculation} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-slate-400">Currency</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Account Capital ({currency})</span>
                <input
                  type="number"
                  step="any"
                  value={accountCapital}
                  onChange={(e) => setAccountCapital(e.target.value)}
                  className="w-full bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 num text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Risk Per Trade (%)</span>
                <input
                  type="number"
                  step="0.1"
                  max="25"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(e.target.value)}
                  className="w-full bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 num text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Entry Price ({currency})</span>
                <input
                  type="number"
                  step="any"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 num text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Stop-Loss ({currency})</span>
                <input
                  type="number"
                  step="any"
                  value={stopLossPrice}
                  onChange={(e) => setStopLossPrice(e.target.value)}
                  className="w-full bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 num text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Target Price ({currency})</span>
                <input
                  type="number"
                  step="any"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full bg-[#0D1320] border border-slate-800 rounded-lg px-3 py-2 num text-slate-100"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={calcLoading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
            >
              {calcLoading ? 'Calculating...' : 'Calculate Risk & Position Size'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">Sizing &amp; Volatility Output</h3>

          {calcError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {calcError}
            </div>
          )}

          {calcResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { k: 'Recommended Shares', v: calcResult.recommendedShares.toLocaleString('en-US') },
                  { k: 'Position Value', v: formatCurrency(calcResult.positionValue, activeCur) },
                  { k: 'Capital Allocated', v: `${calcResult.capitalAllocatedPct}%` },
                  { k: 'Risk / Reward Ratio', v: `${calcResult.riskRewardRatio}:1` },
                  { k: 'Potential Loss', v: formatCurrency(calcResult.potentialLoss, activeCur) },
                  { k: 'Potential Profit', v: formatCurrency(calcResult.potentialProfit, activeCur) },
                  { k: 'Breakeven Win Rate', v: `${calcResult.breakevenWinRatePct}%` },
                  {
                    k: 'ATR Suggested Stop',
                    v: calcResult.atrSuggestedStopLoss
                      ? formatCurrency(calcResult.atrSuggestedStopLoss, activeCur)
                      : 'N/A',
                  },
                  {
                    k: 'ATR Suggested Target',
                    v: calcResult.atrSuggestedTarget
                      ? formatCurrency(calcResult.atrSuggestedTarget, activeCur)
                      : 'N/A',
                  },
                ].map((m) => (
                  <div key={m.k} className="bg-[#0D1320] border border-slate-800/80 rounded-lg p-3">
                    <div className="text-slate-500">{m.k}</div>
                    <div className="num text-sm font-semibold text-slate-100 mt-1">{m.v}</div>
                  </div>
                ))}
              </div>

              {calcResult.symbolMetrics && (
                <div className="bg-[#0D1320] border border-slate-800 rounded-lg p-3.5 text-xs flex flex-wrap gap-x-6 gap-y-1 text-slate-300">
                  <span>
                    <strong className="font-mono text-blue-400">{calcResult.symbolMetrics.symbol}</strong> 6M Risk Profile:
                  </span>
                  <span className="num">ATR(14): {calcResult.symbolMetrics.atr14 ?? 'N/A'}</span>
                  <span className="num">Ann. Vol: {calcResult.symbolMetrics.annualizedVolatilityPct ?? 'N/A'}%</span>
                  <span className="num">Max DD: -{calcResult.symbolMetrics.maxDrawdownPct ?? 'N/A'}%</span>
                  <span className="num">Sharpe: {calcResult.symbolMetrics.sharpeRatio ?? 'N/A'}</span>
                </div>
              )}

              <div className="space-y-1 text-xs text-amber-300/90">
                {(calcResult.warnings || []).map((w: string, i: number) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Global Portfolio Risk Diagnostics */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Global Portfolio Risk Diagnostics ({displayCurrency})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Realized portfolio Beta vs S&amp;P 500, Sharpe Ratio, HHI diversification, currency/country concentration, and pairwise correlation matrix.
            </p>
          </div>
          {!user && (
            <Link to="/login" className="text-xs text-blue-400 hover:text-blue-300">
              Sign in to analyze your portfolio →
            </Link>
          )}
        </div>

        {portLoading && (
          <div className="h-32 bg-slate-800/40 rounded-lg animate-pulse" />
        )}

        {portfolioRisk && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              {[
                { k: 'Diversification', v: portfolioRisk.diversificationGrade },
                { k: 'HHI Score', v: `${portfolioRisk.hhiScore}` },
                { k: 'Portfolio Volatility', v: `${portfolioRisk.weightedVolatilityPct}%` },
                { k: 'Est. Max Drawdown', v: `-${portfolioRisk.estimatedMaxDrawdownPct}%` },
                { k: 'Portfolio Beta', v: portfolioRisk.portfolioBeta ?? 'N/A' },
                { k: 'Sharpe Ratio', v: portfolioRisk.portfolioSharpeRatio ?? 'N/A' },
              ].map((m) => (
                <div key={m.k} className="bg-[#0D1320] border border-slate-800 rounded-lg p-3">
                  <div className="text-slate-500">{m.k}</div>
                  <div className="num text-sm font-semibold text-slate-100 mt-1">{m.v}</div>
                </div>
              ))}
            </div>

            {/* Currency & Country Exposure */}
            {(portfolioRisk.currencyExposure?.length > 0 || portfolioRisk.countryExposure?.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-[#0D1320] border border-slate-800 rounded-lg p-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-200">Currency Exposure</div>
                  {portfolioRisk.currencyExposure.map((c: any) => (
                    <div key={c.currency} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-300">{c.currency}</span>
                      <span className="num text-slate-100">
                        {formatCurrency(c.value, portfolioRisk.baseCurrency)} ({c.weightPct}%)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="bg-[#0D1320] border border-slate-800 rounded-lg p-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-200">Country Exposure</div>
                  {portfolioRisk.countryExposure.map((c: any) => (
                    <div key={c.country} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">{c.country}</span>
                      <span className="num text-slate-100">
                        {formatCurrency(c.value, portfolioRisk.baseCurrency)} ({c.weightPct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pairwise Correlation Matrix */}
            {portfolioRisk.correlationMatrix?.length >= 2 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-200">
                  Pairwise Return Correlation Matrix (Trailing 6M Daily Returns)
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-left text-slate-500 font-mono">Ticker</th>
                        {portfolioRisk.correlationMatrix.map((col: any) => (
                          <th key={col.symbol} className="p-2 text-center text-slate-300 font-mono">
                            {col.symbol}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioRisk.correlationMatrix.map((row: any) => (
                        <tr key={row.symbol}>
                          <td className="p-2 font-mono text-slate-300 font-semibold">{row.symbol}</td>
                          {portfolioRisk.correlationMatrix.map((col: any) => {
                            const val = row.correlations[col.symbol];
                            return (
                              <td
                                key={col.symbol}
                                className={`p-2 text-center num rounded ${corrColor(val)} border border-[#090D16]`}
                              >
                                {val !== null && val !== undefined ? val.toFixed(2) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="space-y-1 text-xs text-slate-400 pt-2 border-t border-slate-800">
              <div className="font-semibold text-slate-300">Risk Warnings &amp; Model Limitations</div>
              {(portfolioRisk.warnings || []).map((w: string, i: number) => (
                <div key={`w-${i}`} className="text-amber-300/90">• {w}</div>
              ))}
              {(portfolioRisk.limitations || []).map((l: string, i: number) => (
                <div key={`l-${i}`}>• {l}</div>
              ))}
            </div>
          </>
        )}
      </div>
    </MotionPage>
  );
}
