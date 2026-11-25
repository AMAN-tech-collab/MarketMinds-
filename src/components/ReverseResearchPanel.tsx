import React from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileSearch,
  HelpCircle,
  Loader2,
  Newspaper,
  RotateCcw,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { deltaColorClass, formatCompactNumber, formatCurrency, formatPct, formatTimestampUTC } from '../lib/format.ts';
import { usePreferences } from '../context/PreferencesContext.tsx';

export interface ReverseResearchPanelProps {
  data: any;
  loading: boolean;
  error: string | null;
  lookbackDays: number;
  onChangeLookback: (days: number) => void;
  onRetry: () => void;
}

export function ReverseResearchPanel({
  data,
  loading,
  error,
  lookbackDays,
  onChangeLookback,
  onRetry,
}: ReverseResearchPanelProps) {
  const { reducedMotion } = usePreferences();

  const panelClass =
    'bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-xl';
  const subPanelClass =
    'bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800/80 rounded-lg';

  const inv = data?.investigation;
  const cur = inv?.currency || data?.quote?.currency || 'USD';

  return (
    <div className="space-y-6">
      {/* Reverse Research Header & Lookback Window Controls */}
      <div className={`${panelClass} p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2">
            <FileSearch className="w-5 h-5 text-violet-500 dark:text-violet-400" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Evidence-First Reverse Research Investigation
              {inv ? ` · ${inv.symbol} (${inv.exchange})` : ''}
            </h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Starts from observed OHLCV price &amp; volume anomalies and works backward through dated news, fundamentals, and contradictory evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 text-xs">
            {[
              { days: 30, label: '30D Window' },
              { days: 90, label: '90D Window' },
              { days: 180, label: '180D Window' },
            ].map((w) => (
              <button
                key={w.days}
                type="button"
                disabled={loading}
                onClick={() => onChangeLookback(w.days)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  lookbackDays === w.days
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Investigating Market Evidence...
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" /> Re-run Investigation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className={`${panelClass} p-6 space-y-4 animate-pulse`}>
          <div className="flex items-center gap-2 text-xs text-violet-500 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            Scanning OHLCV candles for abnormal price/volume events, fetching dated news citations, and cross-checking fundamentals...
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-200 dark:bg-slate-800 rounded-lg" />
            ))}
          </div>
          <div className="h-44 bg-slate-200/80 dark:bg-slate-800/70 rounded-lg" />
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5 text-rose-700 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Reverse Research Request Failed</div>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium shrink-0 self-start sm:self-auto"
          >
            Retry Investigation
          </button>
        </div>
      )}

      {/* Loaded Forensic Investigation Report */}
      {!loading && inv && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* AI Synthesis Status Bar for Reverse Research */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
              inv.aiStatus === 'success'
                ? 'bg-emerald-500/8 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                : inv.aiStatus === 'cached'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {inv.aiStatus === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {inv.aiStatus === 'cached' && <Database className="w-4 h-4 shrink-0" />}
              {inv.aiStatus === 'unavailable' && <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span className="font-semibold">
                {inv.aiStatus === 'success'
                  ? 'Forensic AI Evidence Synthesis Complete'
                  : inv.aiStatus === 'cached'
                    ? 'Showing previously generated Reverse Research.'
                    : 'AI synthesis temporarily unavailable — verified market anomalies & news citations loaded below.'}
              </span>
              {inv.aiProvider && (
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <Cpu className="w-3.5 h-3.5" /> {inv.aiProvider} · {inv.aiModel}
                </span>
              )}
            </div>
            <span className="num text-[11px] text-slate-500 inline-flex items-center gap-1 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {formatTimestampUTC(inv.generatedAt)}
            </span>
          </div>

          {/* 1. Research Question & Observed Market Movement KPIs */}
          <section className={`${panelClass} p-6 space-y-4`}>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                Research Question ({inv.periodStart} → {inv.periodEnd})
              </div>
              <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 mt-1">
                {inv.researchQuestion}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                {inv.observedMarketMovement.summary}
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className={`${subPanelClass} p-3.5`}>
                <div className="text-slate-500">Window Return</div>
                <div className={`num text-lg font-bold mt-0.5 ${deltaColorClass(inv.observedMarketMovement.periodReturnPct)}`}>
                  {formatPct(inv.observedMarketMovement.periodReturnPct)}
                </div>
              </div>
              <div className={`${subPanelClass} p-3.5`}>
                <div className="text-slate-500">Window Range</div>
                <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {formatCurrency(inv.observedMarketMovement.periodLow, cur, 0)} – {formatCurrency(inv.observedMarketMovement.periodHigh, cur, 0)}
                </div>
              </div>
              <div className={`${subPanelClass} p-3.5`}>
                <div className="text-slate-500">Period Max DD</div>
                <div className="num text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                  -{inv.observedMarketMovement.maxDrawdownPct}%
                </div>
              </div>
              <div className={`${subPanelClass} p-3.5`}>
                <div className="text-slate-500">Anomalies Flagged</div>
                <div className="num text-lg font-bold text-violet-600 dark:text-violet-400 mt-0.5">
                  {inv.observedMarketMovement.anomaliesDetected}
                </div>
              </div>
              <div className={`${subPanelClass} p-3.5`}>
                <div className="text-slate-500">Avg Daily Vol</div>
                <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {formatCompactNumber(inv.observedMarketMovement.avgDailyVolume)} ({inv.observedMarketMovement.latestVolumeRatio}x)
                </div>
              </div>
            </div>
          </section>

          {/* 2. Possible Reasons Behind the Movement (Hypotheses with Caveats) */}
          {Array.isArray(inv.possibleReasonsBehindMovement) &&
            inv.possibleReasonsBehindMovement.length > 0 && (
              <section className={`${panelClass} p-6 space-y-4`}>
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Possible Reasons Behind the Movement
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Plausible evidence-backed hypotheses — explicitly separated from verified facts with caveats
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {inv.possibleReasonsBehindMovement.map((h: any, idx: number) => (
                    <div key={idx} className={`${subPanelClass} p-4 space-y-2`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                          {h.hypothesis}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] shrink-0 ${
                            h.confidence === 'High'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : h.confidence === 'Moderate'
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {h.confidence} Evidence
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        <span className="font-semibold">Evidence: </span>
                        {h.supportingEvidence}
                      </p>
                      <p className="text-slate-500 leading-relaxed">
                        <span className="font-semibold">Caveat: </span>
                        {h.caveats}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* 3. Chronological Event Timeline (OHLCV Anomalies + Dated News) */}
          <section className={`${panelClass} p-6 space-y-4`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-violet-500" />
                  Timeline of Observed Market Events &amp; Dated News
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological log combining statistically unusual OHLCV sessions with published external press coverage
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {inv.timelineOfEvents?.length || 0} entries
              </span>
            </div>

            {inv.timelineOfEvents && inv.timelineOfEvents.length > 0 ? (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {inv.timelineOfEvents.map((ev: any, idx: number) => (
                  <div
                    key={idx}
                    className={`${subPanelClass} p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 text-xs`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {ev.date}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            ev.evidenceType === 'Verified Market Fact'
                              ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                              : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                          }`}
                        >
                          {ev.eventType}
                        </span>
                        <span className="text-[11px] text-slate-500">{ev.source}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {ev.observation}
                      </p>
                    </div>
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline shrink-0 font-medium"
                      >
                        Source <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 text-center">
                No unusual OHLCV outliers or dated company press items were detected within this lookback window.
              </div>
            )}
          </section>

          {/* 4. Bullish vs Bearish vs Contradictory Evidence */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <div className={`${panelClass} p-5 space-y-2.5 border-t-2 border-t-emerald-500`}>
              <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Bullish Evidence
              </div>
              {inv.bullishEvidence?.length > 0 ? (
                <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                  {inv.bullishEvidence.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">Not available without AI synthesis.</p>
              )}
            </div>

            <div className={`${panelClass} p-5 space-y-2.5 border-t-2 border-t-rose-500`}>
              <div className="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4" /> Bearish Evidence
              </div>
              {inv.bearishEvidence?.length > 0 ? (
                <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                  {inv.bearishEvidence.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">Not available without AI synthesis.</p>
              )}
            </div>

            <div className={`${panelClass} p-5 space-y-2.5 border-t-2 border-t-amber-500`}>
              <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Scale className="w-4 h-4" /> Contradictory Evidence
              </div>
              {inv.contradictoryEvidence?.length > 0 ? (
                <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                  {inv.contradictoryEvidence.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No conflicting signals isolated in this window.</p>
              )}
            </div>
          </div>

          {/* 5. Fundamental Evidence, Technical Evidence & Missing Information */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <div className={`${panelClass} p-5 space-y-2`}>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Fundamental Evidence</div>
              <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc pl-4">
                {(inv.fundamentalEvidence || []).map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            <div className={`${panelClass} p-5 space-y-2`}>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Technical &amp; Volume Evidence</div>
              <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc pl-4">
                {(inv.technicalEvidence || []).map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            <div className={`${panelClass} p-5 space-y-2`}>
              <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-amber-500" /> Missing Information &amp; Unknowns
              </div>
              <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 list-disc pl-4">
                {(inv.missingInformation || []).map((item: string, i: number) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 6. Final Research Findings & Verified Sources */}
          <section className={`${panelClass} p-6 space-y-4`}>
            <div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Final Research Findings
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                {inv.finalResearchFindings}
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Newspaper className="w-4 h-4 text-blue-500" />
                Verified Sources &amp; Publication Dates ({inv.sources?.length || 0})
              </div>
              {inv.sources && inv.sources.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                  {inv.sources.map((src: any, idx: number) => (
                    <a
                      key={idx}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${subPanelClass} p-3 hover:border-blue-500/40 transition-colors flex items-start justify-between gap-2`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                          {src.title}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {src.publisher} · {formatTimestampUTC(src.publishedAt)}
                        </div>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No verified external news articles were returned for {inv.symbol} during this investigation. MarketMinds never fabricates citations.
                </p>
              )}
            </div>
          </section>
        </motion.div>
      )}
    </div>
  );
}
