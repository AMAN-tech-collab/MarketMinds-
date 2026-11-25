import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext.tsx';
import { formatCurrency, formatPct } from '../lib/format.ts';

export function MotionPage({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { reducedMotion } = usePreferences();
  if (reducedMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionCard({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { reducedMotion } = usePreferences();
  if (reducedMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedNumber({
  value,
  formatter,
  className = '',
}: {
  value: number;
  formatter?: (n: number) => string;
  className?: string;
}) {
  const { reducedMotion } = usePreferences();
  const safeValue = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(safeValue);
  const prevRef = useRef(safeValue);

  useEffect(() => {
    if (reducedMotion || !Number.isFinite(value)) {
      prevRef.current = safeValue;
      setDisplay(safeValue);
      return;
    }
    const start = Number.isFinite(prevRef.current) ? prevRef.current : safeValue;
    const diff = safeValue - start;
    if (Math.abs(diff) < 0.0001) {
      setDisplay(safeValue);
      return;
    }
    const duration = 380;
    const startTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + diff * eased);
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        prevRef.current = safeValue;
        setDisplay(safeValue);
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value, safeValue, reducedMotion]);

  const formatted = (() => {
    if (!Number.isFinite(value)) return '—';
    if (typeof formatter === 'function') {
      try {
        return formatter(display);
      } catch {
        return Number.isFinite(display) ? display.toFixed(2) : '—';
      }
    }
    return Number.isFinite(display)
      ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(display)
      : '—';
  })();

  return <span className={`num ${className}`}>{formatted}</span>;
}

export function RiskGauge({
  score,
  level,
}: {
  score: number;
  level: 'LOW' | 'MODERATE' | 'HIGH';
}) {
  const { reducedMotion } = usePreferences();
  const clamped = Math.max(1, Math.min(100, Math.round(score)));
  const radius = 56;
  const circumference = Math.PI * radius; // semi-circle arc
  const strokeOffset = circumference * (1 - clamped / 100);

  const strokeColor =
    level === 'LOW' ? '#10b981' : level === 'HIGH' ? '#ef4444' : '#f59e0b';
  const textColor =
    level === 'LOW' ? 'text-emerald-400' : level === 'HIGH' ? 'text-rose-400' : 'text-amber-400';

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 140 84" className="w-36 h-22 overflow-visible" aria-label={`Risk score ${clamped} out of 100`}>
        <path
          d="M 14 72 A 56 56 0 0 1 126 72"
          fill="none"
          stroke="#1e293b"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <motion.path
          d="M 14 72 A 56 56 0 0 1 126 72"
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reducedMotion ? strokeOffset : circumference }}
          animate={{ strokeDashoffset: strokeOffset }}
          transition={{ duration: reducedMotion ? 0 : 0.75, ease: [0.22, 1, 0.36, 1] }}
        />
        <text
          x="70"
          y="60"
          textAnchor="middle"
          fill="#f8fafc"
          fontSize="22"
          fontWeight="700"
          fontFamily="JetBrains Mono, monospace"
        >
          {clamped}
        </text>
        <text
          x="70"
          y="76"
          textAnchor="middle"
          fill="#64748b"
          fontSize="9"
          fontFamily="DM Sans, sans-serif"
        >
          RISK INDEX / 100
        </text>
      </svg>
      <div className={`text-xs font-semibold tracking-wide mt-0.5 ${textColor}`}>
        {level} RISK PROFILE
      </div>
    </div>
  );
}

export function ConfidenceBar({
  score,
  decision,
}: {
  score: number;
  decision: string;
}) {
  const { reducedMotion } = usePreferences();
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const barColor =
    decision === 'BUY'
      ? 'bg-emerald-500'
      : decision === 'SELL'
        ? 'bg-rose-500'
        : decision === 'WAIT'
          ? 'bg-amber-500'
          : 'bg-blue-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Calibrated AI Confidence</span>
        <span className="num font-semibold text-slate-100">{clamped}%</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: reducedMotion ? `${clamped}%` : '0%' }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

export interface PipelineStep {
  id: string;
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export function AnalysisPipelineTracker({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">AI Analysis Execution Pipeline</h3>
        <span className="text-xs text-slate-500">Live request stages</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
        {steps.map((step, idx) => {
          const border =
            step.status === 'done'
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : step.status === 'active'
                ? 'border-blue-500/50 bg-blue-500/10'
                : step.status === 'error'
                  ? 'border-rose-500/40 bg-rose-500/10'
                  : 'border-slate-800 bg-[#0D1320]';

          return (
            <div key={step.id} className={`rounded-lg border p-2.5 transition-colors ${border}`}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-mono text-slate-500">0{idx + 1}</span>
                {step.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                {step.status === 'active' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />}
                {step.status === 'error' && <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                {step.status === 'pending' && <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
              </div>
              <div className="text-xs font-medium text-slate-200 leading-tight">{step.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{step.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface HeatmapItem {
  symbol: string;
  name: string;
  exchange: string;
  country: string;
  region: string;
  sector: string;
  currency: string;
  price: number;
  changePercent: number;
}

export function GlobalMarketHeatmap({
  items,
  onSelect,
}: {
  items: HeatmapItem[];
  onSelect: (symbol: string, exchange: string) => void;
}) {
  const getTileColor = (pct: number) => {
    if (pct >= 3) return 'bg-emerald-500/30 border-emerald-500/50 hover:bg-emerald-500/40';
    if (pct >= 1) return 'bg-emerald-500/18 border-emerald-500/35 hover:bg-emerald-500/25';
    if (pct > 0) return 'bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/18';
    if (pct <= -3) return 'bg-rose-500/30 border-rose-500/50 hover:bg-rose-500/40';
    if (pct <= -1) return 'bg-rose-500/18 border-rose-500/35 hover:bg-rose-500/25';
    if (pct < 0) return 'bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/18';
    return 'bg-slate-800/60 border-slate-700 hover:bg-slate-800';
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {items.map((item) => (
        <button
          key={`${item.symbol}:${item.exchange}`}
          type="button"
          onClick={() => onSelect(item.symbol, item.exchange)}
          className={`text-left rounded-lg border p-2.5 transition-all ${getTileColor(item.changePercent)}`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-slate-100 truncate">{item.symbol}</span>
            <span className="text-[10px] font-mono text-slate-400 shrink-0">{item.exchange}</span>
          </div>
          <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.name}</div>
          <div className="flex items-baseline justify-between gap-1 mt-2">
            <span className="num text-xs text-slate-200">{formatCurrency(item.price, item.currency)}</span>
            <span
              className={`num text-xs font-semibold ${
                item.changePercent > 0
                  ? 'text-emerald-300'
                  : item.changePercent < 0
                    ? 'text-rose-300'
                    : 'text-slate-300'
              }`}
            >
              {formatPct(item.changePercent)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
