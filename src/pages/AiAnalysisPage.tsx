import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  BookmarkCheck,
  BookmarkPlus,
  Building2,
  Cpu,
  ExternalLink,
  FileDown,
  FileSearch,
  Globe2,
  Loader2,
  Newspaper,
  Printer,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  apiClient,
  extractApiError,
  getApiAuthToken,
  getApiBaseUrl,
} from '../lib/api.ts';
import {
  deltaColorClass,
  formatCompactGlobal,
  formatCompactNumber,
  formatCurrency,
  formatPct,
  formatTimestampUTC,
} from '../lib/format.ts';
import { StockSearchInput } from '../components/StockSearchInput.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { usePreferences } from '../context/PreferencesContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  AnimatedNumber,
  MotionPage,
  type PipelineStep,
} from '../components/MotionPrimitives.tsx';
import {
  CompanyMonogram,
  ExpandableCard,
  MetricTooltip,
  ResearchScanLoader,
} from '../components/ResearchUiPrimitives.tsx';
import { ResearchChart } from '../components/ResearchChart.tsx';
import {
  AiSynthesisSection,
  AiSynthesisStatusBanner,
} from '../components/AiSynthesisSection.tsx';
import { ReverseResearchPanel } from '../components/ReverseResearchPanel.tsx';
import type { ExchangeCode } from '../shared/globalMarkets.ts';

const QUICK_GLOBAL_STOCKS: Array<{ symbol: string; exchange: ExchangeCode; label: string }> = [
  { symbol: 'AAPL', exchange: 'NASDAQ', label: 'AAPL · NASDAQ' },
  { symbol: 'NVDA', exchange: 'NASDAQ', label: 'NVDA · NASDAQ' },
  { symbol: 'MSFT', exchange: 'NASDAQ', label: 'MSFT · NASDAQ' },
  { symbol: 'RELIANCE', exchange: 'NSE', label: 'RELIANCE · NSE' },
  { symbol: 'TCS', exchange: 'NSE', label: 'TCS · NSE' },
  { symbol: '7203', exchange: 'TSE', label: 'Toyota · TSE' },
  { symbol: 'HSBA', exchange: 'LSE', label: 'HSBC · LSE' },
  { symbol: 'SAP', exchange: 'XETRA', label: 'SAP · XETRA' },
];

const SECTION_LINKS = [
  { id: 'overview', label: 'Overview' },
  { id: 'chart', label: 'Interactive Chart' },
  { id: 'technicals', label: 'Technicals' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'growth', label: 'Financials' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'ml', label: 'ML Forecast' },
  { id: 'risk', label: 'Risk' },
  { id: 'peers', label: 'Peers & News' },
  { id: 'report', label: 'AI Report' },
];

function createInitialSteps(): PipelineStep[] {
  return [
    { id: 'connect', label: 'Exchange Connect', detail: 'Resolving global ticker routing', status: 'pending' },
    { id: 'history', label: 'OHLCV History', detail: 'Fetching 2Y daily market bars', status: 'pending' },
    { id: 'technicals', label: 'Technicals', detail: 'MAs, RSI, MACD, ADX, Fib, Pivots', status: 'pending' },
    { id: 'fundamentals', label: 'Fundamentals', detail: 'Statements, margins & ratios', status: 'pending' },
    { id: 'ml', label: 'ML Validation', detail: 'Ridge, RF & GBT walk-forward', status: 'pending' },
    { id: 'risk', label: 'Risk & Peers', detail: 'Beta, peers & news sentiment', status: 'pending' },
    { id: 'report', label: 'AI Synthesis', detail: 'Dual AI brief (Gemini + OpenAI fallback)', status: 'pending' },
  ];
}

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

function RiskGaugeSvg({ score, level }: { score: number; level: string }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 50));
  const angle = -90 + (clamped / 100) * 180;
  const color =
    clamped >= 70 ? '#ef4444' : clamped >= 40 ? '#f59e0b' : '#10b981';

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 140 84" className="w-36 h-22" role="img" aria-label={`Risk gauge ${clamped} out of 100 (${level})`}>
        <path
          d="M 16 70 A 54 54 0 0 1 124 70"
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 16 70 A 54 54 0 0 1 52 19"
          fill="none"
          stroke="#10b981"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.35"
        />
        <path
          d="M 52 19 A 54 54 0 0 1 88 19"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="10"
          opacity="0.35"
        />
        <path
          d="M 88 19 A 54 54 0 0 1 124 70"
          fill="none"
          stroke="#ef4444"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.35"
        />
        <g transform={`translate(70, 70) rotate(${angle})`}>
          <line x1="0" y1="0" x2="0" y2="-42" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="4.5" fill={color} />
        </g>
        <text x="70" y="64" textAnchor="middle" fill={color} fontSize="14" fontWeight="700" fontFamily="JetBrains Mono, monospace">
          {clamped}/100
        </text>
      </svg>
      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 -mt-1">
        Risk Profile: {level}
      </div>
    </div>
  );
}

export function AiAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSymbol = searchParams.get('symbol') || 'AAPL';
  const initialExchange = (searchParams.get('exchange') || 'NASDAQ').toUpperCase() as ExchangeCode;

  const { user } = useAuth();
  const { displayCurrency, convertAmount, theme } = usePreferences();
  const { showToast } = useToast();
  const isDark = theme === 'dark';

  const [symbol, setSymbol] = useState(initialSymbol);
  const [exchange, setExchange] = useState<ExchangeCode>(initialExchange);
  const [result, setResult] = useState<any>(null);
  const [partialResult, setPartialResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>(createInitialSteps());
  const [finView, setFinView] = useState<'annual' | 'quarterly'>('annual');
  const [activeMlModel, setActiveMlModel] = useState<string>('');
  const [activeMode, setActiveMode] = useState<'analyze' | 'reverse'>('analyze');

  // Independent AI Synthesis Retry state (prevents duplicate clicks, updates in-place)
  const [retryingAi, setRetryingAi] = useState(false);
  const retryAiLockRef = useRef(false);

  // Independent Evidence-First Reverse Research state
  const [reverseData, setReverseData] = useState<any>(null);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reverseLookback, setReverseLookback] = useState<number>(90);
  const reverseLockRef = useRef(false);
  const reverseAbortRef = useRef<AbortController | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await apiClient.get('/analysis/history');
      setHistory(data.items || []);
    } catch {
      // non-blocking
    }
  }, [user]);

  const updateStage = useCallback(
    (stageId: string, status: 'active' | 'done' | 'error', detail?: string) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stageId ? { ...s, status, detail: detail || s.detail } : s
        )
      );
    },
    []
  );

  const runAnalysis = useCallback(
    async (targetSymbol: string, targetExchange: ExchangeCode) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setActiveMode('analyze');
      setLoading(true);
      setError(null);
      setErrorCode(null);
      setPartialResult(null);
      setSavedNotice(null);
      setSymbol(targetSymbol);
      setExchange(targetExchange);
      setSteps(createInitialSteps());
      setSearchParams({ symbol: targetSymbol, exchange: targetExchange }, { replace: true });

      const finishSuccess = (payload: any) => {
        setResult(payload);
        setSavedNotice(payload?.savedRecordId ?? null);
        setActiveMlModel(
          payload?.mlPipeline?.bestModel ||
            payload?.mlPipeline?.models?.[0]?.modelName ||
            ''
        );
        const aiUnavailable = payload?.aiSynthesis?.status === 'unavailable' || !payload?.aiReport;
        setSteps((prev) =>
          prev.map((s) => {
            if (s.id === 'report' && aiUnavailable) {
              return {
                ...s,
                status: 'done',
                detail: 'Quantitative metrics ready · AI synthesis temporarily unavailable',
              };
            }
            return s.status === 'pending' || s.status === 'active' ? { ...s, status: 'done' } : s;
          })
        );
        void loadHistory();
      };

      // Primary path: Real Server-Sent Events (/api/analysis/stream) so byte-0 streams immediately with zero blind timeout!
      try {
        const token = getApiAuthToken();
        const streamUrl = `${getApiBaseUrl()}/analysis/stream?symbol=${encodeURIComponent(
          targetSymbol
        )}&exchange=${encodeURIComponent(targetExchange)}`;

        const response = await fetch(streamUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok || !response.body) {
          throw new Error(`STREAM_FALLBACK_${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let completed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const lines = block.split('\n');
            let eventType = 'message';
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith('event:')) eventType = line.slice(6).trim();
              else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            }
            if (dataLines.length === 0) continue;
            const rawJson = dataLines.join('\n');
            let parsed: any;
            try {
              parsed = JSON.parse(rawJson);
            } catch {
              continue;
            }

            if (eventType === 'stage') {
              updateStage(parsed.stageId, parsed.status, parsed.detail);
            } else if (eventType === 'complete') {
              completed = true;
              finishSuccess(parsed);
            } else if (eventType === 'error_payload') {
              completed = true;
              setError(parsed.error || 'Unable to complete stock analysis.');
              setErrorCode(parsed.code || 'ANALYSIS_FAILED');
              if (parsed.partialData) {
                setPartialResult(parsed.partialData);
                setActiveMlModel(parsed.partialData?.mlPipeline?.bestModel || '');
              }
            }
          }
        }

        if (!completed && !controller.signal.aborted) {
          throw new Error('STREAM_INCOMPLETE');
        }
      } catch (streamErr: any) {
        if (controller.signal.aborted) return;

        // Clean fallback to POST /api/analysis/analyze (65s timeout) if SSE stream was interrupted by proxy
        try {
          updateStage('connect', 'active', 'Re-establishing research connection via REST API');
          const { data } = await apiClient.post(
            '/analysis/analyze',
            { symbol: targetSymbol, exchange: targetExchange },
            { timeout: 65000, signal: controller.signal }
          );
          finishSuccess(data);
        } catch (err: any) {
          if (controller.signal.aborted) return;
          const respData = err?.response?.data;
          setError(extractApiError(err, 'Unable to complete AI research analysis.'));
          setErrorCode(respData?.code || (err?.code === 'ECONNABORTED' ? 'TIMEOUT' : 'REQUEST_ERROR'));
          if (respData?.partialData) {
            setPartialResult(respData.partialData);
            setActiveMlModel(respData.partialData?.mlPipeline?.bestModel || '');
          }
          setSteps((prev) =>
            prev.map((s) =>
              s.status === 'active'
                ? { ...s, status: 'error', detail: 'Feed interrupted — click Retry' }
                : s
            )
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [loadHistory, setSearchParams, updateStage]
  );

  const runReverseResearch = useCallback(
    async (
      targetSymbol: string,
      targetExchange: ExchangeCode,
      days: number = reverseLookback,
      bypassCache = false
    ) => {
      if (reverseLockRef.current) return;
      reverseLockRef.current = true;

      if (reverseAbortRef.current) {
        reverseAbortRef.current.abort();
      }
      const controller = new AbortController();
      reverseAbortRef.current = controller;

      setActiveMode('reverse');
      setSymbol(targetSymbol);
      setExchange(targetExchange);
      setReverseLoading(true);
      setReverseError(null);
      setSearchParams({ symbol: targetSymbol, exchange: targetExchange }, { replace: true });

      try {
        const { data } = await apiClient.post(
          '/analysis/reverse-research',
          {
            symbol: targetSymbol,
            exchange: targetExchange,
            lookbackDays: days,
            bypassCache,
          },
          { timeout: 70000, signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setReverseData(data);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setReverseError(
            extractApiError(err, 'Unable to complete Reverse Research investigation right now.')
          );
        }
      } finally {
        reverseLockRef.current = false;
        if (!controller.signal.aborted) {
          setReverseLoading(false);
        }
      }
    },
    [reverseLookback, setSearchParams]
  );

  useEffect(() => {
    void loadHistory();
    void runAnalysis(initialSymbol, initialExchange);
    return () => {
      abortRef.current?.abort();
      reverseAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeData = result || partialResult;
  const quote = activeData?.quote;
  const tech = activeData?.technicalSummary;
  const fund = activeData?.fundamentals;
  const ml = activeData?.mlPipeline;
  const mlSummary = activeData?.mlSummary;
  const sectorCtx = activeData?.sectorContext;
  const newsData = activeData?.companyNews;
  const ai = activeData?.aiReport;
  const cur = quote?.currency || 'USD';

  const handleRetryAiSynthesis = useCallback(async () => {
    if (retryAiLockRef.current || !quote || !tech) return;
    retryAiLockRef.current = true;
    setRetryingAi(true);

    try {
      const { data } = await apiClient.post(
        '/analysis/synthesize',
        {
          symbol: quote.symbol,
          exchange: quote.exchange,
          bypassCache: true,
          context: {
            quote,
            technicalSummary: tech,
            fundamentals: fund,
            mlPipeline: ml,
            sentimentSummary: newsData?.sentimentSummary,
          },
        },
        { timeout: 65000 }
      );

      if ((data?.status === 'success' || data?.status === 'cached') && data?.narrative) {
        const mergedBase = result || partialResult || {};
        const updatedPayload = {
          ...mergedBase,
          aiReport: data.narrative,
          aiSynthesis: {
            status: data.status,
            provider: data.provider || data.narrative?.provider || null,
            providerLabel: data.narrative?.providerLabel || data.provider || null,
            model: data.model || data.narrative?.model || null,
            generated_at: data.generated_at || data.narrative?.generatedAt || new Date().toISOString(),
            cached: Boolean(data.cached || data.narrative?.cached),
            stale: Boolean(data.stale || data.narrative?.stale),
            requestId: data.requestId || data.narrative?.requestId || null,
            providersTried: data.providersTried || data.narrative?.providersTried || [],
            error: null,
            errorCode: null,
          },
        };
        setResult(updatedPayload);
        setPartialResult(null);
        if (errorCode === 'AI_SERVICE_UNAVAILABLE') {
          setError(null);
          setErrorCode(null);
        }
        showToast(
          `AI research regenerated via ${data.narrative.providerLabel || data.provider || 'AI Engine'}.`,
          'success'
        );
      } else {
        const errMessage =
          data?.error ||
          'AI synthesis is temporarily unavailable. Your quantitative analysis is still available.';
        setResult((prev: any) =>
          prev
            ? {
                ...prev,
                aiSynthesis: {
                  status: 'unavailable',
                  provider: null,
                  model: null,
                  generated_at: null,
                  cached: false,
                  stale: false,
                  requestId: data?.requestId || null,
                  providersTried: data?.providersTried || [],
                  error: errMessage,
                  errorCode: data?.errorCode || 'AI_SERVICE_UNAVAILABLE',
                },
              }
            : prev
        );
        showToast(errMessage, 'error');
      }
    } catch (err: any) {
      const resp = err?.response?.data;
      const errMessage =
        resp?.error ||
        extractApiError(
          err,
          'AI synthesis is temporarily unavailable. Your quantitative analysis is still available.'
        );
      setResult((prev: any) =>
        prev
          ? {
              ...prev,
              aiSynthesis: {
                status: 'unavailable',
                provider: null,
                model: null,
                generated_at: null,
                cached: false,
                stale: false,
                requestId: resp?.requestId || null,
                providersTried: resp?.providersTried || [],
                error: errMessage,
                errorCode: resp?.errorCode || 'AI_SERVICE_UNAVAILABLE',
              },
            }
          : prev
      );
      showToast(errMessage, 'error');
    } finally {
      retryAiLockRef.current = false;
      setRetryingAi(false);
    }
  }, [errorCode, fund, ml, newsData?.sentimentSummary, partialResult, quote, result, showToast, tech]);

  const convertedPrice =
    quote && cur !== displayCurrency ? convertAmount(quote.price, cur, displayCurrency) : null;

  const selectedMlObj =
    ml?.models?.find((m: any) => m.modelName === activeMlModel) || ml?.models?.[0];

  const handleSaveAnalysis = async () => {
    if (!user) {
      showToast('Sign in to save research reports to your account.', 'info');
      return;
    }
    if (!quote || !ai) return;
    setSaving(true);
    try {
      const { data } = await apiClient.post('/analysis/save', {
        symbol: quote.symbol,
        exchange: quote.exchange,
        country: quote.country,
        currency: quote.currency,
        companyName: quote.name,
        currentPrice: quote.price,
        decision: ai.decision,
        confidenceScore: ai.confidenceScore,
        riskLevel: ai.riskLevel,
        summary: ai.headline,
        indicators: {
          rsi14: tech?.rsi14,
          trend: tech?.trend,
          macdBias: tech?.macd?.bias,
          adx14: tech?.adx14,
          volatilityPct: tech?.annualizedVolatilityPct,
          riskScore: ai.riskScore,
        },
        dataSource: quote.dataSource,
        modelStatus: ai.modelStatus,
      });
      setSavedNotice(data?.saved?.id ?? Date.now());
      showToast(`Saved ${quote.symbol} (${quote.exchange}) institutional report.`, 'success');
      void loadHistory();
    } catch (err) {
      showToast(extractApiError(err, 'Could not save report.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintOrPdf = () => {
    window.print();
  };

  const financialSeries =
    finView === 'annual' ? fund?.annualFinancials || [] : fund?.quarterlyFinancials || [];

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTick = isDark ? '#64748b' : '#475569';
  const tooltipBg = isDark ? '#0D1320' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#cbd5e1';

  const panelClass =
    'bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800/80 rounded-xl';
  const subPanelClass =
    'bg-slate-50 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800/80 rounded-lg';

  return (
    <MotionPage className="space-y-6">
      {/* Top Research Terminal Controls */}
      <div className="print:hidden flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            AI Equity Research Terminal
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Live exchange OHLCV · Institutional technicals &amp; financial statements · Multi-horizon out-of-sample ML · Peer valuation · Gemini synthesis
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full xl:w-auto">
          <div className="w-full sm:w-80 xl:w-88">
            <StockSearchInput
              value={symbol}
              placeholder="Search global stock (AAPL, NVDA, RELIANCE, 7203.T...)"
              onSelect={(sym, ex) => {
                setSymbol(sym);
                setExchange(ex);
                if (activeMode === 'reverse') {
                  void runReverseResearch(sym, ex, reverseLookback, false);
                } else {
                  void runAnalysis(sym, ex);
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runAnalysis(symbol, exchange)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-60 transition-colors shrink-0 whitespace-nowrap"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <BarChart2 className="w-3.5 h-3.5" />
              )}
              {loading ? 'Analyzing Stock...' : 'Analyze Stock'}
            </button>
            <button
              type="button"
              disabled={reverseLoading}
              onClick={() => void runReverseResearch(symbol, exchange, reverseLookback, false)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium disabled:opacity-60 transition-colors shrink-0 whitespace-nowrap"
            >
              {reverseLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSearch className="w-3.5 h-3.5" />
              )}
              {reverseLoading ? 'Investigating Market Evidence...' : 'Reverse Research'}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Global Ticker Selector */}
      <div className="print:hidden flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Quick Global Tickers:</span>
        {QUICK_GLOBAL_STOCKS.map((s) => {
          const isSelected = symbol === s.symbol && exchange === s.exchange;
          return (
            <button
              key={`${s.symbol}-${s.exchange}`}
              type="button"
              onClick={() => {
                if (activeMode === 'reverse') {
                  void runReverseResearch(s.symbol, s.exchange, reverseLookback, false);
                } else {
                  void runAnalysis(s.symbol, s.exchange);
                }
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors border ${
                isSelected
                  ? 'bg-blue-600/15 border-blue-500/50 text-blue-600 dark:text-blue-300 font-semibold'
                  : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-700'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Research Mode Tabs (Analyze Stock vs Reverse Research — Independent Results) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveMode('analyze')}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeMode === 'analyze'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Analyze Stock
            {quote && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  activeMode === 'analyze'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {quote.symbol}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode('reverse');
              if (
                !reverseData ||
                reverseData?.investigation?.symbol !== symbol ||
                reverseData?.investigation?.exchange !== exchange
              ) {
                void runReverseResearch(symbol, exchange, reverseLookback, false);
              }
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeMode === 'reverse'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <FileSearch className="w-3.5 h-3.5" />
            Reverse Research
            {reverseData?.investigation?.symbol && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  activeMode === 'reverse'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {reverseData.investigation.symbol}
              </span>
            )}
          </button>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          {activeMode === 'analyze'
            ? 'Forward quantitative & Dual AI equity analysis (OHLCV, technicals, fundamentals, ML, synthesis)'
            : 'Evidence-first forensic investigation starting from observed OHLCV price & volume anomalies'}
        </div>
      </div>

      {/* REVERSE RESEARCH MODE WORKSPACE */}
      {activeMode === 'reverse' && (
        <ReverseResearchPanel
          data={reverseData}
          loading={reverseLoading}
          error={reverseError}
          lookbackDays={reverseLookback}
          onChangeLookback={(days) => {
            setReverseLookback(days);
            void runReverseResearch(symbol, exchange, days, false);
          }}
          onRetry={() => void runReverseResearch(symbol, exchange, reverseLookback, true)}
        />
      )}

      {/* Live 7-Stage Streaming Research Progress Tracker (Analyze Mode) */}
      {activeMode === 'analyze' && (loading || steps.some((s) => s.status === 'error')) && (
        <ResearchScanLoader
          symbol={symbol}
          exchange={exchange}
          steps={steps}
          loading={loading}
        />
      )}

      {/* Clear Error Banner with Instant Retry (Fatal Market/Feed Errors) */}
      {activeMode === 'analyze' && error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/35 text-rose-800 dark:text-rose-200 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-rose-700 dark:text-rose-300">
                Research Feed Notice{errorCode ? ` · ${errorCode}` : ''}
              </div>
              <p className="text-xs mt-0.5">{error}</p>
              {partialResult && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Core live OHLCV market data, technical indicators, and ML metrics loaded below. Click Retry AI Synthesis to regenerate the AI narrative.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              partialResult ? void handleRetryAiSynthesis() : void runAnalysis(symbol, exchange)
            }
            disabled={loading || retryingAi}
            className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1.5 shrink-0 self-start sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || retryingAi ? 'animate-spin' : ''}`} />
            {partialResult ? (retryingAi ? 'Regenerating AI Analysis...' : 'Retry AI Synthesis') : 'Retry Analysis'}
          </button>
        </div>
      )}

      {/* Dual AI Synthesis Status Banner (Analyze Mode) */}
      {activeMode === 'analyze' && activeData && !loading && (
        <div className="print:hidden">
          <AiSynthesisStatusBanner
            aiSynthesis={activeData?.aiSynthesis}
            ai={ai}
            retryingAi={retryingAi}
            onRetryAi={() => void handleRetryAiSynthesis()}
          />
        </div>
      )}

      {/* Sticky Section Navigation & Export/Save Action Bar */}
      {activeMode === 'analyze' && activeData && quote && (
        <div className="print:hidden sticky top-16 z-10 -mx-2 px-2 py-2 bg-slate-50/95 dark:bg-[#090D16]/95 backdrop-blur border-y border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Research report sections" className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {SECTION_LINKS.map((sec) => (
              <a
                key={sec.id}
                href={`#section-${sec.id}`}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 whitespace-nowrap transition-colors"
              >
                {sec.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handlePrintOrPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button
              type="button"
              onClick={handlePrintOrPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            {ai && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveAnalysis}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium disabled:opacity-60 transition-colors"
              >
                {savedNotice ? (
                  <>
                    <BookmarkCheck className="w-3.5 h-3.5" /> Saved
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Analysis'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* MAIN RESEARCH TERMINAL CONTENT (Analyze Mode) */}
      {activeMode === 'analyze' && activeData && quote && tech && (
        <div className="space-y-6">
          {/* PRINT / PDF LETTERHEAD */}
          <div className="hidden print:flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
            <div>
              <div className="text-lg font-bold tracking-tight text-slate-900">
                MarketMinds <span className="font-normal text-slate-600">— Global AI Stock Intelligence</span>
              </div>
              <div className="text-xs text-slate-600">
                Think Smarter. Analyze Deeper. Invest Informed. · Equity Research Dossier
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              <div className="font-semibold text-slate-900">
                {quote.symbol} ({quote.exchange})
              </div>
              <div>Generated {formatTimestampUTC(new Date().toISOString())}</div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION 1: COMPANY OVERVIEW, LIVE QUOTE, AI VERDICT & RISK GAUGE */}
          {/* ================================================================= */}
          <section id="section-overview" className={`${panelClass} p-6 scroll-mt-32`}>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left 7 Cols: Identity, Price & Overview Metrics */}
              <div className="xl:col-span-7 space-y-4">
                <div className="flex items-start gap-3.5">
                  <CompanyMonogram symbol={quote.symbol} name={quote.name} size="lg" />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {quote.exchange} · {quote.country} · {quote.sector}
                      {fund?.industry ? ` · ${fund.industry}` : ''} · {quote.currency}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2.5 mt-0.5">
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50 leading-tight">
                        {quote.name}
                      </h3>
                      <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                        {quote.symbol}
                      </span>
                      {quote.isin && (
                        <span className="font-mono text-xs text-slate-500">ISIN {quote.isin}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="num text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-50">
                    <AnimatedNumber
                      value={quote.price}
                      formatter={(v) => formatCurrency(v, cur)}
                    />
                  </span>
                  <span className={`num text-sm font-semibold inline-flex items-center gap-1 ${deltaColorClass(quote.changePercent)}`}>
                    {quote.changePercent >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {quote.change >= 0 ? '+' : ''}
                    {formatCurrency(quote.change, cur)} ({formatPct(quote.changePercent)})
                  </span>
                  {convertedPrice !== null && (
                    <span className="num text-xs text-slate-500 dark:text-slate-400">
                      ≈ {formatCurrency(convertedPrice, displayCurrency)} ({displayCurrency} spot)
                    </span>
                  )}
                </div>

                {/* Key Quote Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                  <div className={`${subPanelClass} p-3`}>
                    <div className="text-slate-500">Market Cap</div>
                    <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {fund?.marketCap ? formatCompactGlobal(fund.marketCap, cur) : 'Not Available'}
                    </div>
                  </div>
                  <div className={`${subPanelClass} p-3`}>
                    <div className="text-slate-500">52W Range</div>
                    <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {quote.fiftyTwoWeekLow && quote.fiftyTwoWeekHigh
                        ? `${formatCurrency(quote.fiftyTwoWeekLow, cur, 0)} – ${formatCurrency(quote.fiftyTwoWeekHigh, cur, 0)}`
                        : 'Not Available'}
                    </div>
                  </div>
                  <div className={`${subPanelClass} p-3`}>
                    <div className="text-slate-500">Volume / Avg</div>
                    <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {formatCompactNumber(quote.volume)} / {formatCompactNumber(fund?.averageVolume ?? tech.volumeAnalysis.avgVolume20)}
                    </div>
                  </div>
                  <div className={`${subPanelClass} p-3`}>
                    <div className="text-slate-500">Shares Out.</div>
                    <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {fund?.sharesOutstanding ? formatCompactNumber(fund.sharesOutstanding) : 'Not Available'}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>Source: {quote.dataSource}</span>
                  <span>·</span>
                  <span>{quote.freshness}</span>
                  {activeData.marketStatus && (
                    <>
                      <span>·</span>
                      <span>
                        {activeData.marketStatus.label} ({activeData.marketStatus.localTime})
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span>Updated {formatTimestampUTC(quote.fetchedAt)}</span>
                </div>
              </div>

              {/* Right 5 Cols: AI Verdict Card + Visual Risk Gauge */}
              <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`${subPanelClass} p-4 flex flex-col justify-between`}>
                  <div>
                    <div className="text-xs text-slate-500 flex items-center justify-between">
                      <span>AI Research Stance</span>
                      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    {ai ? (
                      <>
                        <div className="mt-2.5 flex items-baseline gap-2.5">
                          <span
                            className={`px-3 py-1 rounded-md border text-lg font-bold tracking-tight ${decisionAccent(
                              ai.decision
                            )}`}
                          >
                            {ai.decision}
                          </span>
                          <span className="num text-xs text-slate-600 dark:text-slate-300">
                            Confidence {ai.confidenceScore}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 mt-2.5 leading-relaxed">
                          {ai.headline}
                        </p>
                      </>
                    ) : (
                      <div className="mt-3 space-y-2.5">
                        <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          AI synthesis is temporarily unavailable. Quantitative indicators &amp; ML forecasts remain active below.
                        </div>
                        <button
                          type="button"
                          disabled={retryingAi}
                          onClick={() => void handleRetryAiSynthesis()}
                          className="print:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-[11px] font-medium transition-colors"
                        >
                          {retryingAi ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" /> Regenerating AI Analysis...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3 h-3" /> Retry AI Synthesis
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                    {ai
                      ? `${ai.providerLabel || ai.modelStatus || 'Dual AI'} · Educational research`
                      : 'Quantitative indicators active · Retry AI anytime'}
                  </div>
                </div>

                <div className={`${subPanelClass} p-4 flex flex-col items-center justify-between`}>
                  <RiskGaugeSvg
                    score={
                      ai?.riskScore ??
                      Math.min(
                        95,
                        Math.round(tech.annualizedVolatilityPct * 1.4 + tech.maxDrawdownPct * 0.8)
                      )
                    }
                    level={
                      ai?.riskLevel ??
                      (tech.annualizedVolatilityPct > 35
                        ? 'High'
                        : tech.annualizedVolatilityPct > 22
                          ? 'Moderate'
                          : 'Low')
                    }
                  />
                  <div className="w-full pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2 text-center text-[11px]">
                    <div>
                      <div className="text-slate-500">Ann. Vol</div>
                      <div className="num font-semibold text-slate-900 dark:text-slate-100">
                        {tech.annualizedVolatilityPct}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Max DD</div>
                      <div className="num font-semibold text-rose-600 dark:text-rose-400">
                        -{tech.maxDrawdownPct}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {fund?.businessSummary && (
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" /> Company Profile
                  {fund.fullTimeEmployees && (
                    <span className="font-normal text-slate-500">
                      · {formatCompactNumber(fund.fullTimeEmployees)} employees
                    </span>
                  )}
                  {fund.nextEarningsDate && (
                    <span className="font-normal text-slate-500">
                      · Next Earnings: {fund.nextEarningsDate}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {fund.businessSummary}
                </p>
              </div>
            )}
          </section>

          {/* ================================================================= */}
          {/* SECTION 2: HISTORICAL CLOSING TREND & INTERACTIVE RESEARCH CHART  */}
          {/* ================================================================= */}
          <section id="section-chart" className={`${panelClass} p-5 scroll-mt-32`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Historical Closing Trend (SMA 20 / SMA 50) &amp; Interactive Technical Chart
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Toggle Trend Area, Close Line, Candlesticks, or OHLC bars · Switch 1D–MAX · Drag to pan or expand Fullscreen
                </p>
              </div>
              <div className="text-xs text-slate-500 num">
                Trend: <strong className="text-slate-900 dark:text-slate-200">{tech.trend}</strong> ·{' '}
                {activeData.history?.length || 0} sessions loaded
              </div>
            </div>

            <ResearchChart
              data={activeData.history || []}
              symbol={quote.symbol}
              exchange={quote.exchange}
              currency={cur}
              supportLevels={tech.supportLevels}
              resistanceLevels={tech.resistanceLevels}
            />
          </section>

          {/* ================================================================= */}
          {/* SECTION 3: COMPULSORY COMPUTED TECHNICAL BREAKDOWN + ADVANCED     */}
          {/* ================================================================= */}
          <section id="section-technicals" className="space-y-5 scroll-mt-32">
            {/* Compulsory Screenshot Core Breakdown (ALWAYS VISIBLE, NEVER HIDDEN) */}
            <div className={`${panelClass} p-5`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Computed Technical Breakdown &amp; 7D ML Projection
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Every core indicator calculated directly from cleaned daily OHLCV bars ({quote.exchange} · Updated {formatTimestampUTC(quote.fetchedAt)})
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  Structure: <strong className="text-slate-800 dark:text-slate-200">{tech.priceAction.structureLabel}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {[
                  {
                    label: 'Trend Direction',
                    value: tech.trend,
                    sub: `ADX ${tech.adx14 ?? 'N/A'} (${tech.trendStrength})`,
                    signal: tech.trend === 'Uptrend' ? 'Bullish' : tech.trend === 'Downtrend' ? 'Bearish' : 'Neutral',
                    tip: 'Determined from closing price alignment relative to SMA 20 and SMA 50.',
                  },
                  {
                    label: 'SMA 20 / SMA 50',
                    value: `${tech.sma20 ? formatCurrency(tech.sma20, cur) : 'N/A'} / ${tech.sma50 ? formatCurrency(tech.sma50, cur) : 'N/A'}`,
                    sub: `Price vs SMA20: ${formatPct(tech.priceAction.distanceToSma20Pct)}`,
                    signal:
                      tech.sma20 && tech.sma50
                        ? tech.sma20 > tech.sma50
                          ? 'Bullish'
                          : 'Bearish'
                        : 'Neutral',
                    tip: 'Short (20-day) and medium (50-day) simple moving averages tracking trend structure.',
                  },
                  {
                    label: 'SMA 100 / SMA 200',
                    value: `${tech.sma100 ? formatCurrency(tech.sma100, cur) : 'N/A'} / ${tech.sma200 ? formatCurrency(tech.sma200, cur) : 'N/A'}`,
                    sub: `Price vs SMA200: ${formatPct(tech.priceAction.distanceToSma200Pct)}`,
                    signal:
                      tech.sma200
                        ? quote.price > tech.sma200
                          ? 'Bullish'
                          : 'Bearish'
                        : 'Neutral',
                    tip: 'Institutional long-term moving averages; trading above SMA 200 signals secular uptrend.',
                  },
                  {
                    label: 'EMA 12 / 26 / 50',
                    value: `${tech.ema12 ? formatCurrency(tech.ema12, cur) : 'N/A'} / ${tech.ema26 ? formatCurrency(tech.ema26, cur) : 'N/A'}`,
                    sub: `EMA 50: ${tech.ema50 ? formatCurrency(tech.ema50, cur) : 'Not Available'}`,
                    signal:
                      tech.ema12 && tech.ema26
                        ? tech.ema12 > tech.ema26
                          ? 'Bullish'
                          : 'Bearish'
                        : 'Neutral',
                    tip: 'Exponential moving averages weight recent sessions more heavily to capture early momentum shifts.',
                  },
                  {
                    label: 'RSI (14)',
                    value: tech.rsi14 !== null ? `${tech.rsi14}` : 'Not Available',
                    sub: `State: ${tech.rsiState} (70 OB / 30 OS)`,
                    signal:
                      tech.rsiState === 'Oversold'
                        ? 'Bullish'
                        : tech.rsiState === 'Overbought'
                          ? 'Bearish'
                          : 'Neutral',
                    tip: '14-period Relative Strength Index measuring momentum velocity from 0 to 100.',
                  },
                  {
                    label: 'MACD (12, 26, 9)',
                    value:
                      tech.macd.line !== null
                        ? `${tech.macd.line} / Sig ${tech.macd.signal ?? '—'}`
                        : 'Not Available',
                    sub: `${tech.macd.bias} · Hist ${tech.macd.histogram ?? '—'}`,
                    signal:
                      tech.macd.bias === 'Bullish Crossover'
                        ? 'Bullish'
                        : tech.macd.bias === 'Bearish Crossover'
                          ? 'Bearish'
                          : 'Neutral',
                    tip: 'Difference between 12-day and 26-day EMAs compared against a 9-day signal line.',
                  },
                  {
                    label: 'Bollinger Bands (20, 2)',
                    value:
                      tech.bollinger.lower && tech.bollinger.upper
                        ? `${formatCurrency(tech.bollinger.lower, cur, 0)} – ${formatCurrency(tech.bollinger.upper, cur, 0)}`
                        : 'Not Available',
                    sub: `Mid ${tech.bollinger.middle ? formatCurrency(tech.bollinger.middle, cur) : '—'} · %B: ${tech.bollinger.percentB ?? '—'}%`,
                    signal:
                      tech.bollinger.percentB !== null
                        ? tech.bollinger.percentB > 85
                          ? 'Bearish'
                          : tech.bollinger.percentB < 15
                            ? 'Bullish'
                            : 'Neutral'
                        : 'Neutral',
                    tip: '2-standard-deviation volatility envelope around the 20-day SMA.',
                  },
                  {
                    label: 'Volume vs 20D Avg',
                    value: `${tech.volumeAnalysis.volumeRatio}x`,
                    sub: `${formatCompactNumber(tech.volumeAnalysis.latestVolume)} vs ${formatCompactNumber(tech.volumeAnalysis.avgVolume20)} (${tech.volumeAnalysis.state})`,
                    signal: tech.volumeAnalysis.state === 'High Activity' ? 'Bullish' : 'Neutral',
                    tip: 'Latest daily share turnover divided by the trailing 20-session average volume.',
                  },
                  {
                    label: 'Support Levels',
                    value:
                      tech.supportLevels.length > 0
                        ? tech.supportLevels.map((s: number) => formatCurrency(s, cur, 0)).join(' · ')
                        : 'Near Swing Low',
                    sub: `Nearest Support: ${formatPct(tech.priceAction.distanceToNearestSupportPct)}`,
                    signal: 'Bullish',
                    tip: 'Derived from 60-day pivot lows and classic floor support levels below spot price.',
                  },
                  {
                    label: 'Resistance Levels',
                    value:
                      tech.resistanceLevels.length > 0
                        ? tech.resistanceLevels.map((r: number) => formatCurrency(r, cur, 0)).join(' · ')
                        : 'Near Swing High',
                    sub: `Nearest Resistance: ${formatPct(tech.priceAction.distanceToNearestResistancePct)}`,
                    signal: 'Bearish',
                    tip: 'Overhead supply zones derived from 60-day swing highs and classic floor resistance.',
                  },
                  {
                    label: 'Volatility & Max Drawdown',
                    value: `${tech.annualizedVolatilityPct}% / -${tech.maxDrawdownPct}%`,
                    sub: `Sharpe ${tech.sharpeRatio ?? 'N/A'} · Sortino ${tech.sortinoRatio ?? 'N/A'}`,
                    signal: tech.annualizedVolatilityPct > 35 ? 'Bearish' : 'Neutral',
                    tip: 'Annualized standard deviation of daily returns (×√252) and peak-to-trough drawdown.',
                  },
                  {
                    label: 'ML 7D Projection',
                    value: mlSummary?.bestMetrics
                      ? `${formatCurrency(mlSummary.bestMetrics.predictedHorizonPrice, cur)} (${formatPct(mlSummary.bestMetrics.expectedReturnPct)})`
                      : 'Not Available',
                    sub: mlSummary?.bestMetrics
                      ? `${mlSummary.bestModel} · Test MAPE ${mlSummary.bestMetrics.mape}%`
                      : 'Insufficient sessions',
                    signal:
                      mlSummary?.bestMetrics?.expectedReturnPct > 0.5
                        ? 'Bullish'
                        : mlSummary?.bestMetrics?.expectedReturnPct < -0.5
                          ? 'Bearish'
                          : 'Neutral',
                    tip: 'Chronological 80/20 out-of-sample ML projection (Gradient Boosted Trees / RF / Ridge).',
                  },
                ].map((item) => {
                  const sigColor =
                    item.signal === 'Bullish'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : item.signal === 'Bearish'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400';
                  return (
                    <div key={item.label} className={`${subPanelClass} p-3.5 flex flex-col justify-between`}>
                      <div className="flex items-center justify-between gap-2 text-slate-500">
                        <MetricTooltip label={item.label} explanation={item.tip} />
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${sigColor}`}>
                          {item.signal}
                        </span>
                      </div>
                      <div className="num text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1.5 break-words">
                        {item.value}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 leading-snug">{item.sub}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Extended Institutional Technical Indicators */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Oscillators, Volume Flow & Breakouts */}
              <div className={`lg:col-span-7 ${panelClass} p-5 space-y-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Advanced Oscillators, Flow &amp; Breakout Matrix
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    {
                      k: 'ATR (14)',
                      v: tech.atr14 ? formatCurrency(tech.atr14, cur) : 'Not Available',
                      s: tech.atr14 && quote.price > 0 ? `${((tech.atr14 / quote.price) * 100).toFixed(2)}% of price` : 'Daily true range',
                      tip: '14-day Average True Range measuring typical daily price volatility.',
                    },
                    {
                      k: 'ADX (14)',
                      v: tech.adx14 !== null ? `${tech.adx14}` : 'Not Available',
                      s: `${tech.trendStrength} (+DI ${tech.plusDI14 ?? '—'} / -DI ${tech.minusDI14 ?? '—'})`,
                      tip: 'Average Directional Index: >25 indicates an established trend; <20 signals ranging price action.',
                    },
                    {
                      k: 'Rolling VWAP (20D)',
                      v: tech.vwap ? formatCurrency(tech.vwap, cur) : 'Not Available',
                      s: tech.vwap ? (quote.price >= tech.vwap ? 'Trading above VWAP' : 'Trading below VWAP') : 'Volume weighted',
                      tip: '20-session Volume-Weighted Average Price representing institutional fair-value cost basis.',
                    },
                    {
                      k: 'Stochastic RSI',
                      v: tech.stochRsi?.k !== null ? `%K ${tech.stochRsi.k} / %D ${tech.stochRsi.d}` : 'Not Available',
                      s: `State: ${tech.stochRsi?.state || 'Neutral'}`,
                      tip: 'Oscillator measuring RSI position relative to its own 14-session high-low range.',
                    },
                    {
                      k: 'CCI (20)',
                      v: tech.cci20 !== null ? `${tech.cci20}` : 'Not Available',
                      s: `State: ${tech.cciState} (±100 bands)`,
                      tip: 'Commodity Channel Index comparing typical price against its 20-day moving average.',
                    },
                    {
                      k: '10D Momentum',
                      v: tech.momentum10dPct !== null ? formatPct(tech.momentum10dPct) : 'Not Available',
                      s: `5D: ${formatPct(tech.priceAction.recent5dReturnPct)} · 20D: ${formatPct(tech.priceAction.recent20dReturnPct)}`,
                      tip: 'Percentage rate-of-change over the past 10 trading sessions.',
                    },
                    {
                      k: 'On-Balance Volume',
                      v: formatCompactNumber(tech.obv),
                      s: `20D Flow: ${tech.obvTrend}`,
                      tip: 'Cumulative volume flow confirming whether buying or selling volume leads price.',
                    },
                    {
                      k: '20D Breakout Level',
                      v: tech.breakoutLevels ? formatCurrency(tech.breakoutLevels.bullishBreakout, cur) : 'Not Available',
                      s: `20D High: ${tech.breakoutLevels ? formatCurrency(tech.breakoutLevels.rangeHigh20, cur) : '—'}`,
                      tip: 'Upper 20-day Donchian channel breakout trigger (+0.5% confirmation buffer).',
                    },
                    {
                      k: '20D Breakdown Level',
                      v: tech.breakoutLevels ? formatCurrency(tech.breakoutLevels.bearishBreakdown, cur) : 'Not Available',
                      s: tech.breakoutLevels?.status || 'Inside 20D Range',
                      tip: 'Lower 20-day Donchian channel breakdown trigger (-0.5% confirmation buffer).',
                    },
                  ].map((item) => (
                    <div key={item.k} className={`${subPanelClass} p-3`}>
                      <div className="text-slate-500">
                        <MetricTooltip label={item.k} explanation={item.tip} />
                      </div>
                      <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-1">
                        {item.v}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.s}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fibonacci Retracements & Classic Floor Pivots */}
              <div className={`lg:col-span-5 ${panelClass} p-5 space-y-4`}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Fibonacci Retracements &amp; Classic Pivot Points
                </h4>

                {tech.fibonacci ? (
                  <div className={`${subPanelClass} p-3.5 space-y-2`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {tech.fibonacci.direction} ({tech.fibonacci.lookbackBars}D)
                      </span>
                      <span className="num text-[11px] text-slate-500">
                        {formatCurrency(tech.fibonacci.swingLow, cur)} – {formatCurrency(tech.fibonacci.swingHigh, cur)}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 text-center text-[11px]">
                      {tech.fibonacci.levels.map((lvl: any) => (
                        <div key={lvl.ratio} className="rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 py-1.5 px-1">
                          <div className="text-slate-500 font-mono text-[10px]">{lvl.ratio}</div>
                          <div className="num font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                            {formatCurrency(lvl.price, cur, 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Fibonacci swing levels unavailable.</div>
                )}

                {tech.pivotPoints ? (
                  <div className={`${subPanelClass} p-3.5 space-y-2`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        Classic Floor Pivots
                      </span>
                      <span className="num text-[11px] text-slate-500">
                        Basis {tech.pivotPoints.basisDate} · P = {formatCurrency(tech.pivotPoints.pivot, cur)}
                      </span>
                    </div>
                    <div className="grid grid-cols-6 gap-1.5 text-center text-[11px]">
                      {[
                        { k: 'S3', v: tech.pivotPoints.s3, c: 'text-emerald-600 dark:text-emerald-400' },
                        { k: 'S2', v: tech.pivotPoints.s2, c: 'text-emerald-600 dark:text-emerald-400' },
                        { k: 'S1', v: tech.pivotPoints.s1, c: 'text-emerald-600 dark:text-emerald-400' },
                        { k: 'R1', v: tech.pivotPoints.r1, c: 'text-rose-600 dark:text-rose-400' },
                        { k: 'R2', v: tech.pivotPoints.r2, c: 'text-rose-600 dark:text-rose-400' },
                        { k: 'R3', v: tech.pivotPoints.r3, c: 'text-rose-600 dark:text-rose-400' },
                      ].map((p) => (
                        <div key={p.k} className="rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 py-1.5 px-1">
                          <div className={`font-mono font-semibold text-[10px] ${p.c}`}>{p.k}</div>
                          <div className="num text-slate-900 dark:text-slate-100 mt-0.5">
                            {formatCurrency(p.v, cur, 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {/* ================================================================= */}
          {/* SECTION 4: FUNDAMENTAL ANALYSIS & FINANCIAL STATEMENTS            */}
          {/* ================================================================= */}
          {fund && (
            <section id="section-fundamentals" className={`${panelClass} p-5 space-y-5 scroll-mt-32`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Fundamental Analysis &amp; Financial Statements
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fund.dataSource} · Reporting Currency: {fund.currency} · {fund.availableFieldsCount} verified metrics retrieved
                  </p>
                </div>
                {fund.website && (
                  <a
                    href={fund.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Company Investor Site <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
                {/* Valuation Multiples */}
                <div className={`${subPanelClass} p-4 space-y-2.5`}>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">
                    Valuation Ratios
                  </div>
                  {[
                    { k: 'Market Cap', v: fund.marketCap ? formatCompactGlobal(fund.marketCap, cur) : 'Not Available' },
                    { k: 'Trailing P/E', v: fund.trailingPE !== null ? `${fund.trailingPE}x` : 'Not Available' },
                    { k: 'Forward P/E', v: fund.forwardPE !== null ? `${fund.forwardPE}x` : 'Not Available' },
                    { k: 'EPS (TTM)', v: fund.eps !== null ? formatCurrency(fund.eps, cur) : 'Not Available' },
                    { k: 'Price / Book (P/B)', v: fund.priceToBook !== null ? `${fund.priceToBook}x` : 'Not Available' },
                    { k: 'Price / Sales (P/S)', v: fund.priceToSales !== null ? `${fund.priceToSales}x` : 'Not Available' },
                    { k: 'EV / EBITDA', v: fund.evToEbitda !== null ? `${fund.evToEbitda}x` : 'Not Available' },
                    { k: 'PEG Ratio', v: fund.pegRatio !== null ? `${fund.pegRatio}` : 'Not Available' },
                    { k: 'Dividend Yield', v: fund.dividendYieldPct !== null ? `${fund.dividendYieldPct}%` : 'Not Available' },
                  ].map((r) => (
                    <div key={r.k} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{r.k}</span>
                      <span className="num font-medium text-slate-900 dark:text-slate-100">{r.v}</span>
                    </div>
                  ))}
                </div>

                {/* Income Statement */}
                <div className={`${subPanelClass} p-4 space-y-2.5`}>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">
                    Income Statement
                  </div>
                  {[
                    { k: 'Total Revenue', v: fund.revenue !== null ? formatCompactGlobal(fund.revenue, fund.currency) : 'Not Available' },
                    { k: 'Revenue Growth', v: fund.revenueGrowthPct !== null ? formatPct(fund.revenueGrowthPct) : 'Not Available' },
                    { k: 'Gross Profit', v: fund.grossProfit !== null ? formatCompactGlobal(fund.grossProfit, fund.currency) : 'Not Available' },
                    { k: 'Operating Income', v: fund.operatingIncome !== null ? formatCompactGlobal(fund.operatingIncome, fund.currency) : 'Not Available' },
                    { k: 'Net Income', v: fund.netIncome !== null ? formatCompactGlobal(fund.netIncome, fund.currency) : 'Not Available' },
                    { k: 'Gross Margin', v: fund.grossMarginPct !== null ? `${fund.grossMarginPct}%` : 'Not Available' },
                    { k: 'Operating Margin', v: fund.operatingMarginPct !== null ? `${fund.operatingMarginPct}%` : 'Not Available' },
                    { k: 'Net Profit Margin', v: fund.profitMarginPct !== null ? `${fund.profitMarginPct}%` : 'Not Available' },
                    { k: 'Earnings Growth', v: fund.earningsGrowthPct !== null ? formatPct(fund.earningsGrowthPct) : 'Not Available' },
                  ].map((r) => (
                    <div key={r.k} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{r.k}</span>
                      <span className="num font-medium text-slate-900 dark:text-slate-100">{r.v}</span>
                    </div>
                  ))}
                </div>

                {/* Balance Sheet */}
                <div className={`${subPanelClass} p-4 space-y-2.5`}>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">
                    Balance Sheet
                  </div>
                  {[
                    { k: 'Total Assets', v: fund.totalAssets !== null ? formatCompactGlobal(fund.totalAssets, fund.currency) : 'Not Available' },
                    { k: 'Total Liabilities', v: fund.totalLiabilities !== null ? formatCompactGlobal(fund.totalLiabilities, fund.currency) : 'Not Available' },
                    { k: 'Total Debt', v: fund.totalDebt !== null ? formatCompactGlobal(fund.totalDebt, fund.currency) : 'Not Available' },
                    { k: 'Shareholders Equity', v: fund.shareholdersEquity !== null ? formatCompactGlobal(fund.shareholdersEquity, fund.currency) : 'Not Available' },
                    { k: 'Cash & Equivalents', v: fund.cashAndEquivalents !== null ? formatCompactGlobal(fund.cashAndEquivalents, fund.currency) : 'Not Available' },
                    { k: 'Debt / Equity', v: fund.debtToEquity !== null ? `${fund.debtToEquity}%` : 'Not Available' },
                  ].map((r) => (
                    <div key={r.k} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{r.k}</span>
                      <span className="num font-medium text-slate-900 dark:text-slate-100">{r.v}</span>
                    </div>
                  ))}
                </div>

                {/* Cash Flow & Capital Returns */}
                <div className={`${subPanelClass} p-4 space-y-2.5`}>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">
                    Cash Flow &amp; Returns
                  </div>
                  {[
                    { k: 'Operating Cash Flow', v: fund.operatingCashFlow !== null ? formatCompactGlobal(fund.operatingCashFlow, fund.currency) : 'Not Available' },
                    { k: 'Investing Cash Flow', v: fund.investingCashFlow !== null ? formatCompactGlobal(fund.investingCashFlow, fund.currency) : 'Not Available' },
                    { k: 'Financing Cash Flow', v: fund.financingCashFlow !== null ? formatCompactGlobal(fund.financingCashFlow, fund.currency) : 'Not Available' },
                    { k: 'Free Cash Flow', v: fund.freeCashFlow !== null ? formatCompactGlobal(fund.freeCashFlow, fund.currency) : 'Not Available' },
                    { k: 'Return on Equity (ROE)', v: fund.roePct !== null ? `${fund.roePct}%` : 'Not Available' },
                    { k: 'Return on Assets (ROA)', v: fund.roaPct !== null ? `${fund.roaPct}%` : 'Not Available' },
                    { k: 'Est. ROIC', v: fund.roicPct !== null ? `${fund.roicPct}%` : 'Not Available' },
                    { k: 'Beta', v: fund.beta !== null ? `${fund.beta}` : 'Not Available' },
                  ].map((r) => (
                    <div key={r.k} className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">{r.k}</span>
                      <span className="num font-medium text-slate-900 dark:text-slate-100">{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-500">{fund.note}</p>
            </section>
          )}

          {/* ================================================================= */}
          {/* SECTION 5: FINANCIAL GROWTH & PROFITABILITY CHARTS                */}
          {/* ================================================================= */}
          {fund && (
            <section id="section-growth" className={`${panelClass} p-5 space-y-4 scroll-mt-32`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-blue-500" />
                    Financial Growth &amp; Profitability Trends
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Historical Revenue, Net Income &amp; Net Margin ({fund.currency})
                  </p>
                </div>

                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
                  {(['annual', 'quarterly'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setFinView(view)}
                      className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                        finView === view
                          ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>

              {financialSeries.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className={`${subPanelClass} p-4`}>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-3">
                      Revenue vs Net Income ({finView === 'annual' ? 'Annual FY' : 'Quarterly'})
                    </div>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={financialSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                          <XAxis dataKey="period" tick={{ fill: axisTick, fontSize: 11 }} />
                          <YAxis
                            tick={{ fill: axisTick, fontSize: 10 }}
                            width={68}
                            tickFormatter={(v) => formatCompactGlobal(v, fund.currency)}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, fontSize: 12 }}
                            formatter={(v: any, name: any) => [formatCompactGlobal(Number(v), fund.currency), String(name)]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="netIncome" name="Net Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className={`${subPanelClass} p-4`}>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-3">
                      Profit Margin (%) &amp; Period Revenue Growth (%)
                    </div>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={financialSeries} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                          <XAxis dataKey="period" tick={{ fill: axisTick, fontSize: 11 }} />
                          <YAxis tick={{ fill: axisTick, fontSize: 10 }} width={48} tickFormatter={(v) => `${v}%`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, fontSize: 12 }}
                            formatter={(v: any, name: any) => [formatPct(Number(v), false), String(name)]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="profitMarginPct" name="Net Profit Margin %" stroke="#8b5cf6" strokeWidth={2} dot />
                          <Line type="monotone" dataKey="revenueGrowthPct" name="Revenue Growth %" stroke="#f59e0b" strokeWidth={2} dot />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`${subPanelClass} p-6 text-center text-xs text-slate-500`}>
                  Historical {finView} income statement periods were not returned by the public exchange feed for {quote.symbol} ({quote.exchange}). No synthetic statement data is generated.
                </div>
              )}
            </section>
          )}

          {/* ================================================================= */}
          {/* SECTION 6: RELATIVE VALUATION ANALYSIS                            */}
          {/* ================================================================= */}
          {sectorCtx?.relativeValuation && (
            <section id="section-valuation" className={`${panelClass} p-5 space-y-4 scroll-mt-32`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-blue-500" />
                    Peer-Relative Valuation Analysis
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live comparison of {quote.symbol} multiples against verified {quote.sector} peers
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-md border text-xs font-semibold ${
                    sectorCtx.relativeValuation.assessment === 'Undervalued vs Peers'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : sectorCtx.relativeValuation.assessment === 'Overvalued vs Peers'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {sectorCtx.relativeValuation.assessment}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className={`${subPanelClass} p-3.5`}>
                  <div className="text-slate-500">{quote.symbol} Trailing P/E</div>
                  <div className="num text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {fund?.trailingPE ? `${fund.trailingPE}x` : 'Not Available'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Peer Median: {sectorCtx.relativeValuation.peerMedianPE ? `${sectorCtx.relativeValuation.peerMedianPE}x` : 'N/A'}
                  </div>
                </div>
                <div className={`${subPanelClass} p-3.5`}>
                  <div className="text-slate-500">P/E Spread vs Peers</div>
                  <div className={`num text-base font-bold mt-1 ${deltaColorClass(
                    sectorCtx.relativeValuation.pePremiumDiscountPct !== null
                      ? -sectorCtx.relativeValuation.pePremiumDiscountPct
                      : null
                  )}`}>
                    {sectorCtx.relativeValuation.pePremiumDiscountPct !== null
                      ? formatPct(sectorCtx.relativeValuation.pePremiumDiscountPct)
                      : 'Not Available'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Peer Avg P/E: {sectorCtx.relativeValuation.peerAvgPE ? `${sectorCtx.relativeValuation.peerAvgPE}x` : 'N/A'}
                  </div>
                </div>
                <div className={`${subPanelClass} p-3.5`}>
                  <div className="text-slate-500">Price / Book vs Peers</div>
                  <div className="num text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {fund?.priceToBook ? `${fund.priceToBook}x` : 'Not Available'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Peer Avg P/B: {sectorCtx.relativeValuation.peerAvgPB ? `${sectorCtx.relativeValuation.peerAvgPB}x` : 'N/A'}
                  </div>
                </div>
                <div className={`${subPanelClass} p-3.5`}>
                  <div className="text-slate-500">ROE vs Peers</div>
                  <div className="num text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {fund?.roePct !== null && fund?.roePct !== undefined ? `${fund.roePct}%` : 'Not Available'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Peer Avg ROE: {sectorCtx.relativeValuation.peerAvgROE !== null ? `${sectorCtx.relativeValuation.peerAvgROE}%` : 'N/A'}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {sectorCtx.relativeValuation.explanation}
              </p>
            </section>
          )}

          {/* ================================================================= */}
          {/* SECTION 7: MULTI-HORIZON ML FORECASTING & WALK-FORWARD BACKTEST   */}
          {/* ================================================================= */}
          {ml && (
            <section id="section-ml" className={`${panelClass} p-5 space-y-5 scroll-mt-32`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    Multi-Horizon ML Forecasting &amp; Out-of-Sample Validation
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Best Model: <strong className="text-slate-800 dark:text-slate-200">{ml.bestModel}</strong> ({ml.bestModelVersion}) ·
                    Train: {ml.trainSamples} sessions ({ml.trainPeriod?.start} to {ml.trainPeriod?.end}) ·
                    Test: {ml.testSamples} sessions ({ml.testPeriod?.start} to {ml.testPeriod?.end})
                  </p>
                </div>
                <Link
                  to="/predictions"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                >
                  Open Full ML Lab <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* 1D, 7D, 30D, 90D, 180D Multi-Horizon Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                {(ml.multiHorizonForecasts || []).map((hz: any) => (
                  <div key={hz.horizonDays} className={`${subPanelClass} p-3.5 flex flex-col justify-between`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{hz.label}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {hz.status === 'available' ? `±${hz.uncertaintyPct}%` : 'Gated'}
                      </span>
                    </div>
                    {hz.status === 'available' ? (
                      <>
                        <div className="mt-2">
                          <div className="num text-base font-bold text-slate-900 dark:text-slate-100">
                            {formatCurrency(hz.predictedPrice, cur)}
                          </div>
                          <div className={`num text-xs font-semibold ${deltaColorClass(hz.expectedReturnPct)}`}>
                            {formatPct(hz.expectedReturnPct)} vs spot
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 space-y-0.5">
                          <div className="num">
                            Band: {formatCurrency(hz.lowerBound, cur, 0)} – {formatCurrency(hz.upperBound, cur, 0)}
                          </div>
                          <div>Test MAPE: {hz.testMape}% · Dir: {hz.directionalAccuracy}%</div>
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 text-[11px] text-slate-500">{hz.note}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Model Comparison Table + Actual vs Predicted Chart */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-6 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                        <th className="py-2 pr-3 font-medium">Model (Click to inspect)</th>
                        <th className="py-2 px-2 text-right font-medium">MAE</th>
                        <th className="py-2 px-2 text-right font-medium">RMSE</th>
                        <th className="py-2 px-2 text-right font-medium">MAPE</th>
                        <th className="py-2 px-2 text-right font-medium">Dir.Acc</th>
                        <th className="py-2 pl-2 text-right font-medium">Backtest vs B&amp;H</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {(ml.models || []).map((m: any) => {
                        const isSel = selectedMlObj?.modelName === m.modelName;
                        return (
                          <tr
                            key={m.modelName}
                            onClick={() => setActiveMlModel(m.modelName)}
                            className={`cursor-pointer transition-colors ${
                              isSel
                                ? 'bg-blue-500/10'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2.5 pr-3">
                              <div className="font-medium text-slate-900 dark:text-slate-100">{m.modelName}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{m.modelVersion} · R² {m.r2}</div>
                            </td>
                            <td className="py-2.5 px-2 text-right num text-slate-700 dark:text-slate-300">
                              {formatCurrency(m.mae, cur)}
                            </td>
                            <td className="py-2.5 px-2 text-right num text-slate-700 dark:text-slate-300">
                              {formatCurrency(m.rmse, cur)}
                            </td>
                            <td className="py-2.5 px-2 text-right num text-slate-700 dark:text-slate-300">
                              {m.mape}%
                            </td>
                            <td className="py-2.5 px-2 text-right num text-slate-700 dark:text-slate-300">
                              {m.directionalAccuracy}%
                            </td>
                            <td className="py-2.5 pl-2 text-right num text-slate-600 dark:text-slate-300">
                              {formatPct(m.backtest?.strategyReturnPct)} vs {formatPct(m.backtest?.buyAndHoldReturnPct)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {selectedMlObj && (
                    <div className="mt-3 text-[11px] text-slate-500">
                      Walk-Forward Backtest ({selectedMlObj.modelName}): Win Rate{' '}
                      <strong className="text-slate-800 dark:text-slate-200">{selectedMlObj.backtest?.winRatePct}%</strong>{' '}
                      across {selectedMlObj.backtest?.tradesCount} signaled sessions.
                    </div>
                  )}
                </div>

                {selectedMlObj?.testPoints?.length > 0 && (
                  <div className={`xl:col-span-6 ${subPanelClass} p-4`}>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-2">
                      Held-Out Test Set: Actual vs Predicted ({selectedMlObj.modelName})
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedMlObj.testPoints} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                          <XAxis dataKey="date" tick={{ fill: axisTick, fontSize: 10 }} minTickGap={24} />
                          <YAxis domain={['auto', 'auto']} tick={{ fill: axisTick, fontSize: 10 }} width={60} />
                          <Tooltip
                            contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, fontSize: 11 }}
                            formatter={(val: any) => formatCurrency(Number(val), cur)}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="actual" name="Actual Close" stroke={isDark ? '#e2e8f0' : '#0f172a'} strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="predicted" name="Model Predicted" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 2" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed pt-2 border-t border-slate-200 dark:border-slate-800">
                {ml.methodologyNote}
              </div>
            </section>
          )}

          {/* ================================================================= */}
          {/* SECTION 8: ADVANCED RISK ANALYSIS & ATR RISK/REWARD               */}
          {/* ================================================================= */}
          <section id="section-risk" className={`${panelClass} p-5 space-y-4 scroll-mt-32`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  Quantitative Risk Analytics &amp; Volatility Exposure
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Downside distribution, empirical 95% VaR, liquidity profile, FX exposure &amp; ATR-scaled stop/target framing
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              {[
                { k: 'Ann. Volatility', v: `${tech.annualizedVolatilityPct}%`, tip: 'Annualized standard deviation of daily returns.' },
                { k: 'Max Drawdown', v: `-${tech.maxDrawdownPct}%`, tip: 'Largest observed peak-to-trough percentage decline in the window.' },
                { k: 'Beta (vs Home Index)', v: fund?.beta ?? sectorCtx?.calculatedBeta ?? 'Not Available', tip: 'Sensitivity of daily returns relative to the home exchange benchmark.' },
                { k: 'Sharpe / Sortino', v: `${tech.sharpeRatio ?? 'N/A'} / ${tech.sortinoRatio ?? 'N/A'}`, tip: 'Risk-adjusted return per unit of total volatility (Sharpe) and downside volatility (Sortino).' },
                { k: '95% Daily VaR', v: tech.var95DailyPct !== null ? `-${tech.var95DailyPct}%` : 'Not Available', tip: 'Empirical 5th-percentile worst daily loss observed in historical returns.' },
                { k: 'Liquidity Risk', v: tech.liquidityRisk, tip: 'Assessed from 20-day average volume and traded value.' },
              ].map((m) => (
                <div key={m.k} className={`${subPanelClass} p-3`}>
                  <div className="text-slate-500">
                    <MetricTooltip label={m.k} explanation={m.tip} />
                  </div>
                  <div className="num text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    {m.v}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {tech.atrRiskLevels && (
                <div className={`${subPanelClass} p-4 space-y-2`}>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    ATR-Scaled Risk / Reward Framing (ATR14 = {formatCurrency(tech.atrRiskLevels.atr14, cur)})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div>
                      <div className="text-slate-500">1.5x ATR Stop</div>
                      <div className="num font-semibold text-rose-600 dark:text-rose-400">
                        {formatCurrency(tech.atrRiskLevels.stopLoss15x, cur)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">2.0x ATR Stop</div>
                      <div className="num font-semibold text-rose-600 dark:text-rose-400">
                        {formatCurrency(tech.atrRiskLevels.stopLoss2x, cur)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">2.0x ATR Target</div>
                      <div className="num font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(tech.atrRiskLevels.target2x, cur)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">3.0x ATR Target</div>
                      <div className="num font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(tech.atrRiskLevels.target3x, cur)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {sectorCtx?.currencyExposure && (
                <div className={`${subPanelClass} p-4 space-y-2`}>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-blue-500" />
                    Market, Sector &amp; Currency Risk ({sectorCtx.currencyExposure.reportingCurrency})
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 num">
                    <div>
                      <div className="text-slate-500 font-sans">1 {cur} → USD</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {sectorCtx.currencyExposure.fxToUsd ?? 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-sans">1 {cur} → INR</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {sectorCtx.currencyExposure.fxToInr ?? 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-sans">1 {cur} → EUR</div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {sectorCtx.currencyExposure.fxToEur ?? 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Downside Dev: {tech.downsideDeviationPct !== null ? `${tech.downsideDeviationPct}%` : 'N/A'} · FX Source: {sectorCtx.currencyExposure.fxSource}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ================================================================= */}
          {/* SECTION 9: COMPETITOR PEER MATRIX, BENCHMARKS & LIVE NEWS         */}
          {/* ================================================================= */}
          <section id="section-peers" className="grid grid-cols-1 xl:grid-cols-12 gap-5 scroll-mt-32">
            {/* Competitor Comparison + Benchmark Context */}
            <div className={`xl:col-span-7 ${panelClass} p-5 space-y-4`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Sector Peers &amp; Benchmark Comparison
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sectorCtx?.sectorPerformance?.sector || quote.sector} · {sectorCtx?.sectorPerformance?.relativeTrend || 'Live peer metrics'}
                  </p>
                </div>
                {sectorCtx?.benchmark && (
                  <div className="text-xs text-right">
                    <div className="text-slate-500">{sectorCtx.benchmark.name}</div>
                    <div className={`num font-semibold ${deltaColorClass(sectorCtx.benchmark.changePercent)}`}>
                      {formatPct(sectorCtx.benchmark.changePercent)} (1D) · {formatPct(sectorCtx.benchmark.return6mPct)} (6M)
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-left">
                      <th className="py-2 pr-3 font-medium">Company</th>
                      <th className="py-2 px-2 text-right font-medium">Price</th>
                      <th className="py-2 px-2 text-right font-medium">1D %</th>
                      <th className="py-2 px-2 text-right font-medium">P/E</th>
                      <th className="py-2 px-2 text-right font-medium">ROE</th>
                      <th className="py-2 px-2 text-right font-medium">RSI</th>
                      <th className="py-2 pl-2 text-right font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                    {/* Target Stock Highlight Row */}
                    <tr className="bg-blue-500/8 font-medium">
                      <td className="py-2.5 pr-3">
                        <div className="text-slate-900 dark:text-slate-100">{quote.symbol} (Target)</div>
                        <div className="text-[10px] text-slate-500">{quote.exchange} · {quote.country}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right num text-slate-900 dark:text-slate-100">
                        {formatCurrency(quote.price, cur)}
                      </td>
                      <td className={`py-2.5 px-2 text-right num ${deltaColorClass(quote.changePercent)}`}>
                        {formatPct(quote.changePercent)}
                      </td>
                      <td className="py-2.5 px-2 text-right num text-slate-700 dark:text-slate-300">
                        {fund?.trailingPE ? `${fund.trailingPE}x` : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right num text-slate-700 dark:text-slate-300">
                        {fund?.roePct !== null && fund?.roePct !== undefined ? `${fund.roePct}%` : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-right num text-slate-700 dark:text-slate-300">
                        {tech.rsi14 ?? '—'}
                      </td>
                      <td className="py-2.5 pl-2 text-right text-slate-800 dark:text-slate-200">
                        {tech.trend}
                      </td>
                    </tr>

                    {(sectorCtx?.peers || []).map((peer: any) => (
                      <tr
                        key={`${peer.symbol}-${peer.exchange}`}
                        onClick={() => void runAnalysis(peer.symbol, peer.exchange)}
                        className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-blue-600 dark:text-blue-400">{peer.symbol}</div>
                          <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                            {peer.name} · {peer.exchange}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right num text-slate-800 dark:text-slate-200">
                          {formatCurrency(peer.price, peer.currency)}
                        </td>
                        <td className={`py-2.5 px-2 text-right num ${deltaColorClass(peer.changePercent)}`}>
                          {formatPct(peer.changePercent)}
                        </td>
                        <td className="py-2.5 px-2 text-right num text-slate-600 dark:text-slate-300">
                          {peer.trailingPE ? `${peer.trailingPE}x` : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right num text-slate-600 dark:text-slate-300">
                          {peer.roePct !== null && peer.roePct !== undefined ? `${peer.roePct}%` : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right num text-slate-600 dark:text-slate-300">
                          {peer.rsi14 ?? '—'}
                        </td>
                        <td className="py-2.5 pl-2 text-right text-slate-600 dark:text-slate-300">
                          {peer.trend}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500">
                Click any peer row above to load its full institutional AI research brief.
              </p>
            </div>

            {/* Live Company News & Sentiment */}
            <div className={`xl:col-span-5 ${panelClass} p-5 space-y-4`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-blue-500" />
                    Live News &amp; Sentiment
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {newsData?.dataSource || 'Google News RSS'}
                  </p>
                </div>
                {newsData?.sentimentSummary && (
                  <div className="flex items-center gap-2 text-[11px] num">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{newsData.sentimentSummary.positive} Pos
                    </span>
                    <span className="text-slate-500">· {newsData.sentimentSummary.neutral} Neu</span>
                    <span className="text-rose-600 dark:text-rose-400">
                      · {newsData.sentimentSummary.negative} Neg
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {newsData?.articles?.length > 0 ? (
                  newsData.articles.slice(0, 8).map((art: any, idx: number) => (
                    <a
                      key={idx}
                      href={art.link}
                      target="_blank"
                      rel="noreferrer"
                      className={`block ${subPanelClass} p-3 hover:border-blue-500/40 transition-colors`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                          {art.title}
                        </div>
                        <span
                          className={`text-[10px] font-semibold shrink-0 ${
                            art.sentiment === 'Positive'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : art.sentiment === 'Negative'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {art.sentiment}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                        <span>{art.source}</span>
                        <span>{art.publishedAt ? formatTimestampUTC(art.publishedAt) : ''}</span>
                      </div>
                    </a>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 py-6 text-center">
                    No recent company news headlines returned by the RSS feed right now.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ================================================================= */}
          {/* SECTION 10: COMPLETE INSTITUTIONAL AI RESEARCH REPORT & RETRY UI  */}
          {/* ================================================================= */}
          <AiSynthesisSection
            quote={quote}
            ai={ai}
            aiSynthesis={activeData?.aiSynthesis}
            ml={ml}
            retryingAi={retryingAi}
            onRetryAi={() => void handleRetryAiSynthesis()}
          />
        </div>
      )}

      {/* Saved User Analysis History */}
      {user && history.length > 0 && (
        <section className={`print:hidden ${panelClass} overflow-hidden`}>
          <div className="p-5 border-b border-slate-200 dark:border-slate-800/80">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Saved Research History
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Recent equity research runs stored in PostgreSQL for {user.email}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/80 text-slate-500 text-left">
                  <th className="py-3 px-5 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Stock</th>
                  <th className="py-3 px-4 font-medium text-right">Price</th>
                  <th className="py-3 px-4 font-medium">Verdict</th>
                  <th className="py-3 px-4 font-medium">Risk</th>
                  <th className="py-3 px-5 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {history.slice(0, 10).map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => void runAnalysis(row.symbol, row.exchange)}
                    className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-5 num text-slate-500">
                      {formatTimestampUTC(row.createdAt)}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-blue-600 dark:text-blue-400">
                      {row.symbol}{' '}
                      <span className="text-slate-500 font-normal">{row.exchange}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right num text-slate-800 dark:text-slate-200">
                      {formatCurrency(row.currentPrice, row.currency || 'USD')}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {row.decision} ({row.confidenceScore}%)
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{row.riskLevel}</td>
                    <td className="py-2.5 px-5 text-slate-600 dark:text-slate-400 max-w-md truncate">
                      {row.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </MotionPage>
  );
}
