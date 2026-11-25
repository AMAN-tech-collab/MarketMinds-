import React from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { formatTimestampUTC } from '../lib/format.ts';
import { ExpandableCard } from './ResearchUiPrimitives.tsx';
import { usePreferences } from '../context/PreferencesContext.tsx';

function decisionAccent(decision: string) {
  switch (decision) {
    case 'BUY':
      return 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    case 'SELL':
      return 'text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-500/10';
    case 'WAIT':
      return 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-500/10';
    default:
      return 'text-blue-600 dark:text-blue-400 border-blue-500/40 bg-blue-500/10';
  }
}

export interface AiSynthesisSectionProps {
  quote: any;
  ai: any;
  aiSynthesis: any;
  ml: any;
  retryingAi: boolean;
  onRetryAi: () => void;
}

export function AiSynthesisStatusBanner({
  aiSynthesis,
  ai,
  retryingAi,
  onRetryAi,
}: {
  aiSynthesis: any;
  ai: any;
  retryingAi: boolean;
  onRetryAi: () => void;
}) {
  const status: 'loading' | 'success' | 'cached' | 'unavailable' = retryingAi
    ? 'loading'
    : aiSynthesis?.status === 'cached' || ai?.cached
      ? 'cached'
      : ai
        ? 'success'
        : 'unavailable';

  const providerLabel = ai?.providerLabel || aiSynthesis?.provider || null;
  const modelName = ai?.model || ai?.aiEngine || aiSynthesis?.model || null;
  const generatedAt = ai?.generatedAt || aiSynthesis?.generated_at || null;

  if (status === 'loading') {
    return (
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">
              Generating Market Intelligence...
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Sending verified OHLCV, technicals, fundamentals, and ML metrics to Dual AI providers (Google Gemini + OpenAI fallback).
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono text-blue-600 dark:text-blue-300 shrink-0">
          In Progress
        </span>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="p-3.5 rounded-xl bg-emerald-500/8 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <div>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
              AI Research Generated
            </span>
            <span className="text-slate-500 dark:text-slate-400 ml-2">
              {providerLabel ? `${providerLabel}` : 'AI Engine'}
              {modelName ? ` · ${modelName}` : ''}
              {generatedAt ? ` · ${formatTimestampUTC(generatedAt)}` : ''}
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={retryingAi}
          onClick={onRetryAi}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium disabled:opacity-60 transition-colors self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Regenerate
        </button>
      </div>
    );
  }

  if (status === 'cached') {
    return (
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 text-xs">
          <Database className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              Showing previously generated AI research.
            </span>
            <span className="text-slate-600 dark:text-slate-300 ml-2">
              {providerLabel ? `${providerLabel}` : 'AI Engine'}
              {modelName ? ` · ${modelName}` : ''}
              {generatedAt ? ` · Originally generated ${formatTimestampUTC(generatedAt)}` : ''}
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={retryingAi}
          onClick={onRetryAi}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-xs font-medium disabled:opacity-60 transition-colors shrink-0 self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Regenerate Fresh
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">
            AI synthesis is temporarily unavailable. Your quantitative analysis is still available.
          </div>
          {aiSynthesis?.error && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {aiSynthesis.error}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={retryingAi}
        onClick={onRetryAi}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-60 transition-colors shrink-0 self-start sm:self-auto"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Retry AI Synthesis
      </button>
    </div>
  );
}

export function AiSynthesisSection({
  quote,
  ai,
  aiSynthesis,
  ml,
  retryingAi,
  onRetryAi,
}: AiSynthesisSectionProps) {
  const { reducedMotion } = usePreferences();

  const panelClass =
    'bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-xl';
  const subPanelClass =
    'bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800/80 rounded-lg';

  const summaryText = ai?.executiveSummary || ai?.rationale || ai?.headline || '';
  const bullishList: string[] = Array.isArray(ai?.bullishFactors)
    ? ai.bullishFactors
    : Array.isArray(ai?.keyStrengths)
      ? ai.keyStrengths
      : [];
  const bearishList: string[] = Array.isArray(ai?.bearishFactors)
    ? ai.bearishFactors
    : Array.isArray(ai?.keyRisks)
      ? ai.keyRisks
      : [];
  const verifiedFacts: string[] = Array.isArray(ai?.verifiedFacts) ? ai.verifiedFacts : [];
  const modelEstimates: string[] = Array.isArray(ai?.modelEstimates)
    ? ai.modelEstimates
    : Array.isArray(ai?.aiInterpretations)
      ? ai.aiInterpretations
      : [];
  const limitations: string[] = Array.isArray(ai?.limitations)
    ? ai.limitations
    : ai?.disclaimer
      ? [ai.disclaimer]
      : [];

  return (
    <section id="section-report" className={`${panelClass} p-6 space-y-6 scroll-mt-32`}>
      {/* Header + Provider/Model Badge + Retry Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            AI Synthesis &amp; Institutional Research Brief · {quote.symbol} ({quote.exchange})
          </h3>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mt-1">
            <span className="inline-flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-blue-500" />
              {ai
                ? `${ai.providerLabel || 'AI Provider'} · ${ai.model || ai.aiEngine || 'Active'}`
                : 'Dual AI Engine (Gemini + OpenAI Fallback)'}
            </span>
            {ai?.generatedAt && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1 num">
                  <Clock className="w-3.5 h-3.5" />
                  {ai.cached ? 'Cached from ' : 'Generated '}
                  {formatTimestampUTC(ai.generatedAt)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ai && (
            <span className={`px-3 py-1 rounded-md border text-xs font-bold ${decisionAccent(ai.decision)}`}>
              Verdict: {ai.decision} ({ai.confidenceScore}% Confidence)
            </span>
          )}
          <button
            type="button"
            disabled={retryingAi}
            onClick={onRetryAi}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-medium transition-colors"
          >
            {retryingAi ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Regenerating AI Analysis...
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" /> {ai ? 'Regenerate AI' : 'Retry AI Synthesis'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <AiSynthesisStatusBanner
        aiSynthesis={aiSynthesis}
        ai={ai}
        retryingAi={retryingAi}
        onRetryAi={onRetryAi}
      />

      {/* Animated Skeleton While Regenerating */}
      {retryingAi && (
        <div className="space-y-4 animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
          <div className="h-16 bg-slate-200/80 dark:bg-slate-800/70 rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-28 bg-slate-200/80 dark:bg-slate-800/70 rounded-lg" />
            <div className="h-28 bg-slate-200/80 dark:bg-slate-800/70 rounded-lg" />
          </div>
        </div>
      )}

      {/* Full Structured AI Narrative */}
      {!retryingAi && ai && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-6"
        >
          {/* Executive Summary + Current Market Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className={`lg:col-span-7 ${subPanelClass} p-4 space-y-1.5`}>
              <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Executive Summary
              </h4>
              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                {summaryText}
              </p>
              {ai.rationale && ai.rationale !== summaryText && (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                  {ai.rationale}
                </p>
              )}
            </div>

            <div className={`lg:col-span-5 ${subPanelClass} p-4 space-y-1.5`}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Current Market Overview &amp; Conclusion
              </h4>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {ai.currentMarketOverview || ai.headline}
              </p>
              {ai.conclusion && (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Conclusion: </span>
                  {ai.conclusion}
                </p>
              )}
            </div>
          </div>

          {/* Structured Analytical Domain Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {[
              { title: 'Technical Analysis', body: ai.technicalAnalysisSummary },
              { title: 'Fundamental Analysis', body: ai.fundamentalAnalysisSummary },
              { title: 'Trend Analysis', body: ai.trendAnalysis },
              { title: 'Support & Resistance Levels', body: ai.supportResistanceNote },
              { title: 'ML Forecast Interpretation', body: ai.mlForecastInterpretation || ai.forecastLimitationsNote },
              { title: 'Risk Assessment & Sentiment', body: [ai.riskAssessment, ai.marketSentimentNote].filter(Boolean).join(' ') },
            ]
              .filter((b) => b.body)
              .map((block) => (
                <div
                  key={block.title}
                  className={`${subPanelClass} p-4 space-y-1.5 hover:border-blue-500/35 transition-colors`}
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{block.title}</div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{block.body}</p>
                </div>
              ))}
          </div>

          {/* Bullish Factors vs Bearish Factors & Key Risks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className={`${subPanelClass} p-4 space-y-2.5 border-l-2 border-l-emerald-500`}>
              <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Bullish Factors &amp; Strengths
              </div>
              {bullishList.length > 0 ? (
                <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                  {bullishList.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No bullish factors highlighted in this brief.</p>
              )}
            </div>

            <div className={`${subPanelClass} p-4 space-y-2.5 border-l-2 border-l-rose-500`}>
              <div className="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4" /> Bearish Factors &amp; Key Risks
              </div>
              {bearishList.length > 0 ? (
                <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                  {bearishList.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-500">No bearish factors highlighted in this brief.</p>
              )}
            </div>
          </div>

          {/* Verified Market Facts vs Probabilistic Model Estimates */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className={`${subPanelClass} p-4 space-y-2`}>
              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                Verified Quantitative &amp; Market Facts
              </div>
              <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                {verifiedFacts.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
            </div>

            <div className={`${subPanelClass} p-4 space-y-2`}>
              <div className="font-semibold text-blue-700 dark:text-blue-400">
                Probabilistic Model Estimates &amp; Uncertainty
              </div>
              <ul className="space-y-1.5 text-slate-700 dark:text-slate-300 list-disc pl-4">
                {modelEstimates.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
              {ai.forecastLimitationsNote && (
                <p className="text-[11px] text-slate-500 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                  {ai.forecastLimitationsNote}
                </p>
              )}
            </div>
          </div>

          {/* Multi-Horizon Outlooks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className={`${subPanelClass} p-4`}>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Short-Term Outlook (1–4 Weeks)
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{ai.shortTermOutlook}</p>
            </div>
            <div className={`${subPanelClass} p-4`}>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Medium-Term Outlook (1–6 Months)
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{ai.mediumTermOutlook}</p>
            </div>
            <div className={`${subPanelClass} p-4`}>
              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Long-Term Outlook (6–18+ Months)
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{ai.longTermOutlook}</p>
            </div>
          </div>

          {/* Expandable Limitations & Provider Trace */}
          <ExpandableCard
            title="Methodology, Uncertainty Disclosures & Provider Trace"
            subtitle="Transparency disclosures for quantitative indicators, ML forecasts, and Dual AI synthesis"
            defaultOpen={false}
          >
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
              {limitations.map((lim, i) => (
                <p key={i}>· {lim}</p>
              ))}
              {(ml?.limitations || []).map((lim: string, i: number) => (
                <p key={`ml-${i}`}>· {lim}</p>
              ))}
              {ai.fundamentalNote && <p>· Fundamentals Note: {ai.fundamentalNote}</p>}
              {ai.requestId && (
                <p className="font-mono text-[11px] text-slate-500 pt-1">
                  Request ID: {ai.requestId} · Provider: {ai.providerLabel} ({ai.model})
                </p>
              )}
            </div>
          </ExpandableCard>
        </motion.div>
      )}

      {/* Clean Unavailable Card (No fabricated AI output) */}
      {!retryingAi && !ai && (
        <div className={`${subPanelClass} p-6 text-center space-y-3`}>
          <ShieldAlert className="w-7 h-7 text-amber-500 mx-auto" />
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            AI Narrative Temporarily Unavailable
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-lg mx-auto leading-relaxed">
            MarketMinds does not fabricate AI conclusions when upstream LLM providers are rate-limited or unreachable.
            All live OHLCV charts, technical indicators, fundamentals, ML forecasts, peers, and news above remain verified and interactive.
          </p>
          <button
            type="button"
            disabled={retryingAi}
            onClick={onRetryAi}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry AI Synthesis
          </button>
        </div>
      )}
    </section>
  );
}
