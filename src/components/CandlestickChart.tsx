import React, { useMemo, useState } from 'react';
import { formatCurrency } from '../lib/format.ts';

export interface CandleBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number | null;
  sma50?: number | null;
  ema20?: number | null;
  vwap?: number | null;
  bbUpper?: number | null;
  bbLower?: number | null;
}

interface CandlestickChartProps {
  data: CandleBar[];
  currency?: string;
  showSma20?: boolean;
  showSma50?: boolean;
  showEma20?: boolean;
  showVwap?: boolean;
  showBollinger?: boolean;
  height?: number;
}

export function CandlestickChart({
  data,
  currency = 'INR',
  showSma20 = true,
  showSma50 = false,
  showEma20 = false,
  showVwap = false,
  showBollinger = false,
  height = 340,
}: CandlestickChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [barWindow, setBarWindow] = useState<number>(90);

  const visible = useMemo(() => data.slice(-barWindow), [data, barWindow]);

  const metrics = useMemo(() => {
    if (visible.length === 0) return null;
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const b of visible) {
      if (b.low < minVal) minVal = b.low;
      if (b.high > maxVal) maxVal = b.high;
      if (showBollinger && b.bbLower && b.bbLower < minVal) minVal = b.bbLower;
      if (showBollinger && b.bbUpper && b.bbUpper > maxVal) maxVal = b.bbUpper;
    }
    const pad = (maxVal - minVal) * 0.08 || 1;
    return {
      min: minVal - pad,
      max: maxVal + pad,
    };
  }, [visible, showBollinger]);

  if (!metrics || visible.length === 0) {
    return (
      <div className="h-[340px] flex items-center justify-center text-sm text-slate-400">
        No OHLC price bars available for candlestick rendering.
      </div>
    );
  }

  const width = 920;
  const padLeft = 12;
  const padRight = 72;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const yScale = (price: number) =>
    padTop + ((metrics.max - price) / (metrics.max - metrics.min)) * plotH;

  const step = plotW / Math.max(visible.length, 1);
  const candleW = Math.max(2, Math.min(11, step * 0.65));

  const buildPath = (getter: (b: CandleBar) => number | null | undefined) => {
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

  const gridLines = 5;
  const yTicks = Array.from({ length: gridLines }, (_, i) => {
    const ratio = i / (gridLines - 1);
    const price = metrics.max - ratio * (metrics.max - metrics.min);
    return { price, y: yScale(price) };
  });

  const activeBar = hoverIdx !== null ? visible[hoverIdx] : visible[visible.length - 1];
  const fmt = (v: number) => formatCurrency(v, currency);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        {activeBar && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 num">
            <span className="text-slate-200 font-medium">{activeBar.date}</span>
            <span>O: <span className="text-slate-200">{fmt(activeBar.open)}</span></span>
            <span>H: <span className="text-emerald-400">{fmt(activeBar.high)}</span></span>
            <span>L: <span className="text-rose-400">{fmt(activeBar.low)}</span></span>
            <span>C: <span className="text-slate-100">{fmt(activeBar.close)}</span></span>
            {showSma20 && activeBar.sma20 && (
              <span>SMA20: <span className="text-blue-400">{fmt(activeBar.sma20)}</span></span>
            )}
            {showSma50 && activeBar.sma50 && (
              <span>SMA50: <span className="text-amber-400">{fmt(activeBar.sma50)}</span></span>
            )}
            {showEma20 && activeBar.ema20 && (
              <span>EMA20: <span className="text-violet-400">{fmt(activeBar.ema20)}</span></span>
            )}
            {showVwap && activeBar.vwap && (
              <span>VWAP: <span className="text-cyan-400">{fmt(activeBar.vwap)}</span></span>
            )}
          </div>
        )}

        {data.length > 35 && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Zoom ({visible.length} bars)</span>
            <input
              type="range"
              min={25}
              max={Math.min(180, data.length)}
              value={Math.min(barWindow, data.length)}
              onChange={(e) => setBarWindow(Number(e.target.value))}
              aria-label="Zoom candlestick bar count"
              className="w-24 accent-blue-500"
            />
          </div>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          role="img"
          aria-label="Interactive OHLC Candlestick Chart"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={t.y}
                y2={t.y}
                stroke="#1e293b"
                strokeDasharray="3 3"
              />
              <text
                x={width - padRight + 6}
                y={t.y + 4}
                fill="#64748b"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {t.price >= 100 ? t.price.toFixed(0) : t.price.toFixed(2)}
              </text>
            </g>
          ))}

          {showBollinger && (
            <>
              <path d={buildPath((b) => b.bbUpper)} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="4 3" />
              <path d={buildPath((b) => b.bbLower)} fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="4 3" />
            </>
          )}

          {showSma20 && (
            <path d={buildPath((b) => b.sma20)} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          )}
          {showSma50 && (
            <path d={buildPath((b) => b.sma50)} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
          )}
          {showEma20 && (
            <path d={buildPath((b) => b.ema20)} fill="none" stroke="#a78bfa" strokeWidth="1.5" />
          )}
          {showVwap && (
            <path d={buildPath((b) => b.vwap)} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="5 2" />
          )}

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
            const isHovered = hoverIdx === i;

            return (
              <g
                key={`${bar.date}-${i}`}
                onMouseEnter={() => setHoverIdx(i)}
                className="cursor-crosshair"
              >
                {isHovered && (
                  <line
                    x1={cx}
                    x2={cx}
                    y1={padTop}
                    y2={height - padBottom}
                    stroke="#475569"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                )}
                <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.2" />
                <rect
                  x={cx - candleW / 2}
                  y={bodyTop}
                  width={candleW}
                  height={bodyH}
                  fill={color}
                  rx="1"
                />
                <rect
                  x={cx - step / 2}
                  y={padTop}
                  width={step}
                  height={plotH}
                  fill="transparent"
                />
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
                fill="#64748b"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {visible[idx].date.slice(0, 10)}
              </text>
            ))}
        </svg>
      </div>
    </div>
  );
}
