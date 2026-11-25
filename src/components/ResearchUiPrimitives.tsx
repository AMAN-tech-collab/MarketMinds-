import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Info,
  Loader2,
  XCircle,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext.tsx';
import type { PipelineStep } from './MotionPrimitives.tsx';

export function MetricTooltip({
  label,
  explanation,
}: {
  label: string;
  explanation: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center gap-1 group"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`Explain ${label}`}
        className="text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D1320] px-3 py-2 text-[11px] leading-relaxed text-slate-700 dark:text-slate-200 shadow-lg pointer-events-none font-normal text-left"
        >
          {explanation}
        </span>
      )}
    </span>
  );
}

export function ExpandableCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { reducedMotion } = usePreferences();

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#111827] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          {subtitle && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="px-5 pb-5 pt-2 border-t border-slate-200 dark:border-slate-800"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const MONOGRAM_STYLES = [
  'bg-blue-600/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  'bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  'bg-amber-600/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  'bg-cyan-600/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
];

export function CompanyMonogram({
  symbol,
  name,
  size = 'md',
}: {
  symbol: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const clean = (symbol || 'EQ').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const letters = clean.slice(0, 3) || (name || 'EQ').slice(0, 2).toUpperCase();
  const hash = clean.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const style = MONOGRAM_STYLES[hash % MONOGRAM_STYLES.length];
  const dims =
    size === 'lg'
      ? 'w-12 h-12 text-sm rounded-xl'
      : size === 'sm'
        ? 'w-7 h-7 text-[10px] rounded-md'
        : 'w-10 h-10 text-xs rounded-lg';

  return (
    <div
      className={`${dims} ${style} border font-mono font-bold flex items-center justify-center shrink-0 select-none`}
      aria-hidden="true"
    >
      {letters}
    </div>
  );
}

export function ResearchScanLoader({
  symbol,
  exchange,
  steps,
  loading,
}: {
  symbol: string;
  exchange: string;
  steps: PipelineStep[];
  loading: boolean;
}) {
  const completedCount = steps.filter((s) => s.status === 'done').length;
  const pct = Math.round((completedCount / Math.max(1, steps.length)) * 100);
  const activeStep = steps.find((s) => s.status === 'active');

  return (
    <div className="relative overflow-hidden bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      {loading && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-slate-200 dark:bg-slate-800"
        >
          <div className="research-scan-bar h-full w-1/2 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {loading
              ? `Researching ${symbol} (${exchange}) — ${activeStep?.label || 'Processing'}`
              : `Research Pipeline · ${symbol} (${exchange})`}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {loading
              ? activeStep?.detail || 'Streaming verified market data, quantitative calculations & AI synthesis'
              : 'Live backend execution stages (real server events)'}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-28 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="num text-xs font-semibold text-slate-700 dark:text-slate-300">
            {pct}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
        {steps.map((step, idx) => {
          const box =
            step.status === 'done'
              ? 'border-emerald-500/35 bg-emerald-500/5'
              : step.status === 'active'
                ? 'border-blue-500/60 bg-blue-500/10'
                : step.status === 'error'
                  ? 'border-rose-500/45 bg-rose-500/10'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1320]';

          return (
            <div key={step.id} className={`rounded-lg border p-2.5 transition-colors ${box}`}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-mono text-slate-500">0{idx + 1}</span>
                {step.status === 'done' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                )}
                {step.status === 'active' && (
                  <Loader2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 animate-spin shrink-0" />
                )}
                {step.status === 'error' && (
                  <XCircle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
                )}
                {step.status === 'pending' && (
                  <Circle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 shrink-0" />
                )}
              </div>
              <div className="text-xs font-medium text-slate-900 dark:text-slate-200 leading-tight">
                {step.label}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">
                {step.detail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
