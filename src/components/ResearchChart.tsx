import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  Bar,
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
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { formatCompactNumber, formatCurrency } from '../lib/format.ts';
import { usePreferences } from '../context/PreferencesContext.tsx';

export interface ResearchChartPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number | null;
  sma50?: number | null;
  sma100?: number | null;
  sma200?: number | null;
  ema12?: number | null;
  ema26?: number | null;
  ema50?: number | null;
  vwap?: number | null;
  rsi14?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  macdHistogram?: number | null;
  bbUpper?: number | null;
  bbMiddle?: number | null;
  bbLower?: number | null;
}

type ChartMode = 'area' | 'line' | 'candlestick' | 'ohlc';
type RangeWindow = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX';

const LOCAL_RANGE_BARS: Partial<Record<RangeWindow, number>> = {
  '1M': 22,
  '3M': 65,
  '6M': 130,
  '1Y': 252,
};

interface ResearchChartProps {
  data: ResearchChartPoint[];
  symbol: string;
  exchange?: string;
  currency: string;
  supportLevels?: number[];
  resistanceLevels?: number[];
}

export function ResearchChart({
  data,
  symbol,
  exchange,
  currency,
  supportLevels = [],
  resistanceLevels = [],
}: ResearchChartProps) {
  const { theme } = usePreferences();
  const isDark = theme === 'dark';

  const [mode, setMode] = useState<ChartMode>('area');
  const [range, setRange] = useState<RangeWindow>('6M');
  const [remoteSeries, setRemoteSeries] = useState<Record<string, ResearchChartPoint[]>>({});
  const [loadingRange, setLoadingRange] = useState(false);
  const [zoomBars, setZoomBars] = useState<number>(130);
  const [panOffset, setPanOffset] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Compulsory default overlays: Close + SMA 20 + SMA 50 always active initially
  const [overlays, setOverlays] = useState({
    sma20: true,
    sma50: true,
    sma100: false,
    sma200: false,
    ema12: false,
    ema26: false,
    ema50: false,
    vwap: false,
    bollinger: false,
    levels: false,
  });

  const [subPanels, setSubPanels] = useState({
    volume: true,
    rsi: true,
    macd: false,
  });

  const [hoverCandleIdx, setHoverCandleIdx] = useState<number | null>(null);
  const dragStateRef = useRef<{ active: boolean; startX: number; startPan: number }>({
    active: false,
    startX: 0,
    startPan: 0,
  });

  // Reset cached remote ranges when symbol changes
  useEffect(() => {
    setRemoteSeries({});
    setRange('6M');
    setPanOffset(0);
  }, [symbol, exchange]);

  // Fetch remote timeframe data on demand for 1D, 1W, 5Y, MAX
  useEffect(() => {
    const needsRemote = range === '1D' || range === '1W' || range === '5Y' || range === 'MAX';
    const key = `${symbol}:${exchange || ''}:${range}`;
    if (!needsRemote) {
      const target = Math.min(data.length, LOCAL_RANGE_BARS[range] || 130);
      setZoomBars(Math.max(15, target));
      setPanOffset(0);
      return;
    }

    if (remoteSeries[key]) {
      setZoomBars(Math.max(15, remoteSeries[key].length));
      setPanOffset(0);
      return;
    }

    let cancelled = false;
    setLoadingRange(true);
    api
      .get(`/stocks/${encodeURIComponent(symbol)}`, {
        params: { exchange, timeframe: range },
      })
      .then((res) => {
        if (cancelled) return;
        const pts: ResearchChartPoint[] = Array.isArray(res.data?.history) ? res.data.history : [];
        if (pts.length > 0) {
          setRemoteSeries((prev) => ({ ...prev, [key]: pts }));
          setZoomBars(Math.max(15, pts.length));
          setPanOffset(0);
        }
      })
      .catch(() => {
        // Keep existing local series gracefully if remote range fails
      })
      .finally(() => {
        if (!cancelled) setLoadingRange(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range, symbol, exchange, data.length]);

  // Escape closes fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const activeData = useMemo(() => {
    const key = `${symbol}:${exchange || ''}:${range}`;
    if ((range === '1D' || range === '1W' || range === '5Y' || range === 'MAX') && remoteSeries[key]) {
      return remoteSeries[key];
    }
    return data;
  }, [data, remoteSeries, symbol, exchange, range]);

  const maxBars = Math.max(15, activeData.length);
  const effectiveWindow = Math.min(maxBars, Math.max(15, zoomBars));
  const maxPan = Math.max(0, activeData.length - effectiveWindow);
  const clampedPan = Math.min(maxPan, Math.max(0, panOffset));

  const visible = useMemo(() => {
    if (activeData.length === 0) return [];
    const endIdx = activeData.length - clampedPan;
    const startIdx = Math.max(0, endIdx - effectiveWindow);
    return activeData.slice(startIdx, endIdx);
  }, [activeData, effectiveWindow, clampedPan]);

  const periodStats = useMemo(() => {
    if (visible.length < 2) return null;
    const first = visible[0].close;
    const last = visible[visible.length - 1].close;
    const high = Math.max(...visible.map((b) => b.high));
    const low = Math.min(...visible.map((b) => b.low));
    const retPct = first > 0 ? ((last - first) / first) * 100 : 0;
    return { first, last, high, low, retPct };
  }, [visible]);

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTick = isDark ? '#64748b' : '#475569';
  const tooltipBg = isDark ? '#0D1320' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#cbd5e1';

  const toggleOverlay = (key: keyof typeof overlays) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSub = (key: keyof typeof subPanels) => {
    setSubPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleZoomIn = () => setZoomBars((z) => Math.max(15, Math.round(z * 0.72)));
  const handleZoomOut = () => setZoomBars((z) => Math.min(maxBars, Math.round(z * 1.35)));
  const handlePanLeft = () =>
    setPanOffset((p) => Math.min(maxPan, p + Math.max(5, Math.round(effectiveWindow * 0.25))));
  const handlePanRight = () =>
    setPanOffset((p) => Math.max(0, p - Math.max(5, Math.round(effectiveWindow * 0.25))));
  const handleReset = () => {
    setRange('6M');
    setZoomBars(Math.min(Math.max(15, data.length), 130));
    setPanOffset(0);
  };

  // Drag-to-pan handlers
  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (maxPan <= 0) return;
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startPan: clampedPan,
    };
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const barsDelta = Math.round((dx / 600) * effectiveWindow);
    const nextPan = Math.min(maxPan, Math.max(0, dragStateRef.current.startPan + barsDelta));
    setPanOffset(nextPan);
  };

  const handlePointerUp = () => {
    dragStateRef.current.active = false;
  };

  // Interactive SVG Candlestick & OHLC Bar Renderer with crosshair, zoom, pan & all overlays
  const renderPriceActionSvg = (style: 'candlestick' | 'ohlc') => {
    const height = isFullscreen ? 440 : 340;
    const width = 960;
    const padLeft = 12;
    const padRight = 76;
    const padTop = 18;
    const padBottom = 28;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const b of visible) {
      if (b.low < minVal) minVal = b.low;
      if (b.high > maxVal) maxVal = b.high;
      if (overlays.bollinger && b.bbLower && b.bbLower < minVal) minVal = b.bbLower;
      if (overlays.bollinger && b.bbUpper && b.bbUpper > maxVal) maxVal = b.bbUpper;
      if (overlays.sma200 && b.sma200) {
        if (b.sma200 < minVal) minVal = b.sma200;
        if (b.sma200 > maxVal) maxVal = b.sma200;
      }
    }
    const pad = (maxVal - minVal) * 0.08 || 1;
    const min = minVal - pad;
    const max = maxVal + pad;

    const yScale = (price: number) => padTop + ((max - price) / (max - min)) * plotH;
    const step = plotW / Math.max(visible.length, 1);
    const candleW = Math.max(2, Math.min(12, step * 0.65));
    const tickW = Math.max(2.5, Math.min(7, step * 0.42));

    const buildPath = (getter: (b: ResearchChartPoint) => number | null | undefined) => {
      let d = '';
      visible.forEach((bar, i) => {
        const val = getter(bar);
        if (val === null || val === undefined || !Number.isFinite(val)) return;
        const x = padLeft + i * step + step / 2;
        const y = yScale(val);
        d += d === '' ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      return d;
    };

    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const price = max - (i / 4) * (max - min);
      return { price, y: yScale(price) };
    });

    const activeBar =
      hoverCandleIdx !== null ? visible[hoverCandleIdx] : visible[visible.length - 1];

    return (
      <div className="space-y-2">
        {activeBar && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 num px-1">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBar.date}
            </span>
            <span>
              O: <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(activeBar.open, currency)}</strong>
            </span>
            <span>
              H: <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(activeBar.high, currency)}</strong>
            </span>
            <span>
              L: <strong className="text-rose-600 dark:text-rose-400">{formatCurrency(activeBar.low, currency)}</strong>
            </span>
            <span>
              C: <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(activeBar.close, currency)}</strong>
            </span>
            <span>Vol: {formatCompactNumber(activeBar.volume)}</span>
            {overlays.sma20 && activeBar.sma20 && (
              <span className="text-blue-500">SMA20: {formatCurrency(activeBar.sma20, currency)}</span>
            )}
            {overlays.sma50 && activeBar.sma50 && (
              <span className="text-amber-500">SMA50: {formatCurrency(activeBar.sma50, currency)}</span>
            )}
            {overlays.sma100 && activeBar.sma100 && (
              <span className="text-pink-500">SMA100: {formatCurrency(activeBar.sma100, currency)}</span>
            )}
            {overlays.sma200 && activeBar.sma200 && (
              <span className="text-purple-500">SMA200: {formatCurrency(activeBar.sma200, currency)}</span>
            )}
          </div>
        )}
        <div
          className={`w-full overflow-x-auto ${maxPan > 0 ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={() => {
            handlePointerUp();
            setHoverCandleIdx(null);
          }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label={`${symbol} interactive ${style} chart`}
          >
            {yTicks.map((t, i) => (
              <g key={i}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={t.y}
                  y2={t.y}
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                />
                <text
                  x={width - padRight + 6}
                  y={t.y + 4}
                  fill={axisTick}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {t.price >= 100 ? t.price.toFixed(0) : t.price.toFixed(2)}
                </text>
              </g>
            ))}

            {overlays.levels &&
              supportLevels.slice(0, 2).map((lvl, idx) => {
                if (lvl < min || lvl > max) return null;
                const y = yScale(lvl);
                return (
                  <g key={`sup-svg-${idx}`}>
                    <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#10b981" strokeDasharray="4 4" strokeWidth="1" />
                    <text x={padLeft + 4} y={y - 3} fill="#10b981" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                      S{idx + 1} {lvl}
                    </text>
                  </g>
                );
              })}

            {overlays.levels &&
              resistanceLevels.slice(0, 2).map((lvl, idx) => {
                if (lvl < min || lvl > max) return null;
                const y = yScale(lvl);
                return (
                  <g key={`res-svg-${idx}`}>
                    <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#ef4444" strokeDasharray="4 4" strokeWidth="1" />
                    <text x={padLeft + 4} y={y - 3} fill="#ef4444" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                      R{idx + 1} {lvl}
                    </text>
                  </g>
                );
              })}

            {overlays.bollinger && (
              <>
                <path d={buildPath((b) => b.bbUpper)} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="4 3" />
                <path d={buildPath((b) => b.bbLower)} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="4 3" />
              </>
            )}
            {overlays.sma20 && <path d={buildPath((b) => b.sma20)} fill="none" stroke="#3b82f6" strokeWidth="1.6" />}
            {overlays.sma50 && <path d={buildPath((b) => b.sma50)} fill="none" stroke="#f59e0b" strokeWidth="1.6" />}
            {overlays.sma100 && <path d={buildPath((b) => b.sma100)} fill="none" stroke="#ec4899" strokeWidth="1.5" />}
            {overlays.sma200 && <path d={buildPath((b) => b.sma200)} fill="none" stroke="#a855f7" strokeWidth="1.6" />}
            {overlays.ema12 && <path d={buildPath((b) => b.ema12)} fill="none" stroke="#10b981" strokeWidth="1.3" strokeDasharray="3 2" />}
            {overlays.ema26 && <path d={buildPath((b) => b.ema26)} fill="none" stroke="#f43f5e" strokeWidth="1.3" strokeDasharray="3 2" />}
            {overlays.ema50 && <path d={buildPath((b) => b.ema50)} fill="none" stroke="#14b8a6" strokeWidth="1.3" strokeDasharray="3 2" />}
            {overlays.vwap && <path d={buildPath((b) => b.vwap)} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="5 2" />}

            {visible.map((bar, i) => {
              const cx = padLeft + i * step + step / 2;
              const yHigh = yScale(bar.high);
              const yLow = yScale(bar.low);
              const yOpen = yScale(bar.open);
              const yClose = yScale(bar.close);
              const isUp = bar.close >= bar.open;
              const color = isUp ? '#10b981' : '#ef4444';
              const bodyTop = Math.min(yOpen, yClose);
              const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
              const isHovered = hoverCandleIdx === i;

              return (
                <g
                  key={`${bar.date}-${i}`}
                  onMouseEnter={() => setHoverCandleIdx(i)}
                  className="cursor-crosshair"
                >
                  {isHovered && (
                    <>
                      <line x1={cx} x2={cx} y1={padTop} y2={height - padBottom} stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
                      <line x1={padLeft} x2={width - padRight} y1={yClose} y2={yClose} stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
                    </>
                  )}
                  <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth={style === 'ohlc' ? '1.6' : '1.2'} />
                  {style === 'candlestick' ? (
                    <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} rx="1" />
                  ) : (
                    <>
                      <line x1={cx - tickW} x2={cx} y1={yOpen} y2={yOpen} stroke={color} strokeWidth="1.6" />
                      <line x1={cx} x2={cx + tickW} y1={yClose} y2={yClose} stroke={color} strokeWidth="1.6" />
                    </>
                  )}
                  <rect x={cx - step / 2} y={padTop} width={step} height={plotH} fill="transparent" />
                </g>
              );
            })}

            {[0, Math.floor(visible.length / 3), Math.floor((visible.length * 2) / 3), visible.length - 1]
              .filter((idx, i, arr) => idx >= 0 && idx < visible.length && arr.indexOf(idx) === i)
              .map((idx) => (
                <text
                  key={idx}
                  x={padLeft + idx * step + step / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fill={axisTick}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {visible[idx].date.slice(0, 12)}
                </text>
              ))}
          </svg>
        </div>
      </div>
    );
  };

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-slate-500">
        Historical OHLCV data is not available for charting.
      </div>
    );
  }

  const chartBody = (
    <div className="space-y-4">
      {/* Top Toolbar: Chart Type, Date Range, Zoom, Pan & Fullscreen */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Mode Segmented Control */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            {(
              [
                { id: 'area', label: 'Area' },
                { id: 'line', label: 'Line' },
                { id: 'candlestick', label: 'Candles' },
                { id: 'ohlc', label: 'OHLC' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === opt.id
                    ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Timeframe Selector (1D, 1W, 1M, 3M, 6M, 1Y, 5Y, MAX) */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#0D1320] border border-slate-200 dark:border-slate-800">
            {(['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'] as RangeWindow[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                  range === r
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {loadingRange && (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading {range}...
            </span>
          )}
        </div>

        {/* Zoom, Pan & Fullscreen Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePanLeft}
            disabled={clampedPan >= maxPan}
            title="Pan earlier"
            aria-label="Pan earlier"
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handlePanRight}
            disabled={clampedPan <= 0}
            title="Pan recent"
            aria-label="Pan recent"
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={effectiveWindow <= 15}
            title="Zoom in"
            aria-label="Zoom in"
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={effectiveWindow >= maxBars}
            title="Zoom out"
            aria-label="Zoom out"
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="Reset zoom and pan"
            aria-label="Reset zoom and pan"
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen chart'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen chart'}
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Period Performance Readout + Interactive Legend Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {periodStats && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 dark:text-slate-400">
            <span>
              Window:{' '}
              <strong className="num text-slate-900 dark:text-slate-200">
                {visible[0]?.date} – {visible[visible.length - 1]?.date}
              </strong>{' '}
              ({visible.length} bars)
            </span>
            <span>
              Return:{' '}
              <strong
                className={`num ${
                  periodStats.retPct >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {periodStats.retPct >= 0 ? '+' : ''}
                {periodStats.retPct.toFixed(2)}%
              </strong>
            </span>
            <span>
              Range:{' '}
              <strong className="num text-slate-800 dark:text-slate-200">
                {formatCurrency(periodStats.low, currency)} – {formatCurrency(periodStats.high, currency)}
              </strong>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: 'sma20', label: 'SMA 20', color: '#3b82f6' },
              { key: 'sma50', label: 'SMA 50', color: '#f59e0b' },
              { key: 'sma100', label: 'SMA 100', color: '#ec4899' },
              { key: 'sma200', label: 'SMA 200', color: '#a855f7' },
              { key: 'ema12', label: 'EMA 12', color: '#10b981' },
              { key: 'ema26', label: 'EMA 26', color: '#f43f5e' },
              { key: 'ema50', label: 'EMA 50', color: '#14b8a6' },
              { key: 'vwap', label: 'VWAP', color: '#06b6d4' },
              { key: 'bollinger', label: 'Bollinger', color: '#64748b' },
              { key: 'levels', label: 'S/R Lines', color: '#22c55e' },
            ] as const
          ).map((item) => {
            const active = overlays[item.key];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleOverlay(item.key)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                <span
                  className="w-2.5 h-0.5 rounded-full"
                  style={{ backgroundColor: active ? item.color : '#64748b' }}
                />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Chart Viewport */}
      {mode === 'candlestick' || mode === 'ohlc' ? (
        renderPriceActionSvg(mode)
      ) : (
        <div
          className={`${isFullscreen ? 'h-[430px]' : 'h-[340px]'} w-full ${
            maxPan > 0 ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visible} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="researchCloseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="date" tick={{ fill: axisTick, fontSize: 11 }} minTickGap={28} />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: axisTick, fontSize: 11 }}
                width={66}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  borderColor: tooltipBorder,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(val: any, name: any) => [
                  formatCurrency(Number(val), currency),
                  String(name),
                ]}
              />

              {overlays.bollinger && (
                <>
                  <Line type="monotone" dataKey="bbUpper" name="BB Upper" stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bbLower" name="BB Lower" stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                </>
              )}

              {overlays.levels &&
                supportLevels.slice(0, 2).map((lvl, idx) => (
                  <ReferenceLine
                    key={`sup-${idx}`}
                    y={lvl}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{ value: `S${idx + 1} ${lvl}`, fill: '#10b981', fontSize: 10, position: 'insideBottomLeft' }}
                  />
                ))}
              {overlays.levels &&
                resistanceLevels.slice(0, 2).map((lvl, idx) => (
                  <ReferenceLine
                    key={`res-${idx}`}
                    y={lvl}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: `R${idx + 1} ${lvl}`, fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }}
                  />
                ))}

              {mode === 'area' ? (
                <Area
                  type="monotone"
                  dataKey="close"
                  name="Closing Price"
                  stroke="#3b82f6"
                  fill="url(#researchCloseGrad)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  type="monotone"
                  dataKey="close"
                  name="Closing Price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}

              {overlays.sma20 && (
                <Line type="monotone" dataKey="sma20" name="SMA 20" stroke="#38bdf8" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              )}
              {overlays.sma50 && (
                <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#f59e0b" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              )}
              {overlays.sma100 && (
                <Line type="monotone" dataKey="sma100" name="SMA 100" stroke="#ec4899" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
              {overlays.sma200 && (
                <Line type="monotone" dataKey="sma200" name="SMA 200" stroke="#a855f7" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              )}
              {overlays.ema12 && (
                <Line type="monotone" dataKey="ema12" name="EMA 12" stroke="#10b981" strokeWidth={1.3} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
              )}
              {overlays.ema26 && (
                <Line type="monotone" dataKey="ema26" name="EMA 26" stroke="#f43f5e" strokeWidth={1.3} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
              )}
              {overlays.ema50 && (
                <Line type="monotone" dataKey="ema50" name="EMA 50" stroke="#14b8a6" strokeWidth={1.3} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
              )}
              {overlays.vwap && (
                <Line type="monotone" dataKey="vwap" name="VWAP (20)" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="5 2" dot={false} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sub-Panel Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Sub-Charts:</span>
          {(
            [
              { id: 'volume', label: 'Volume' },
              { id: 'rsi', label: 'RSI (14)' },
              { id: 'macd', label: 'MACD (12,26,9)' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleSub(p.id)}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                subPanels[p.id]
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>Visible bars: {visible.length} (drag chart to pan)</span>
          <input
            type="range"
            min={15}
            max={maxBars}
            value={effectiveWindow}
            onChange={(e) => setZoomBars(Number(e.target.value))}
            aria-label="Adjust chart zoom window"
            className="w-24 accent-blue-600"
          />
        </div>
      </div>

      {/* Volume Histogram Sub-Chart */}
      {subPanels.volume && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-500">Trading Volume</div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visible} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: axisTick, fontSize: 10 }} width={66} tickFormatter={(v) => formatCompactNumber(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [formatCompactNumber(Number(v)), 'Volume']}
                />
                <Bar dataKey="volume" isAnimationActive={false}>
                  {visible.map((entry, idx) => (
                    <Cell
                      key={`vol-${idx}`}
                      fill={entry.close >= entry.open ? 'rgba(16, 185, 129, 0.55)' : 'rgba(239, 68, 68, 0.55)'}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* RSI (14) Sub-Chart */}
      {subPanels.rsi && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-500">RSI (14) · Overbought 70 / Oversold 30</div>
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visible} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fill: axisTick, fontSize: 10 }} width={66} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, fontSize: 11 }}
                />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="rsi14" name="RSI (14)" stroke="#8b5cf6" strokeWidth={1.6} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* MACD (12, 26, 9) Sub-Chart */}
      {subPanels.macd && (
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-slate-500">MACD (12, 26, 9)</div>
          <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visible} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: axisTick, fontSize: 10 }} minTickGap={30} />
                <YAxis tick={{ fill: axisTick, fontSize: 10 }} width={66} />
                <Tooltip
                  contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: 8, fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke={gridStroke} />
                <Bar dataKey="macdHistogram" name="Histogram" isAnimationActive={false}>
                  {visible.map((entry, idx) => (
                    <Cell
                      key={`mh-${idx}`}
                      fill={(entry.macdHistogram ?? 0) >= 0 ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)'}
                    />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="macd" name="MACD" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="macdSignal" name="Signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-[#090D16] p-5 overflow-y-auto">
        <div className="max-w-[1440px] mx-auto bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {symbol} {exchange ? `(${exchange})` : ''} · Fullscreen Interactive Chart
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Close (Esc)
            </button>
          </div>
          {chartBody}
        </div>
      </div>
    );
  }

  return chartBody;
}
