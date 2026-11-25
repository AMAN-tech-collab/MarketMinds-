import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { formatCurrency, formatNumber, formatPct } from '../lib/format.ts';

interface TickerQuote {
  id: string;
  label: string;
  symbol: string;
  exchange: string;
  price: number;
  changePercent: number;
  currency?: string;
  isIndex: boolean;
}

export function MarketTickerBar() {
  const [items, setItems] = useState<TickerQuote[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const load = () => {
      api
        .get('/markets/global')
        .then((res) => {
          if (!active || !res.data) return;
          const idxItems: TickerQuote[] = (res.data.indices || []).slice(0, 10).map((i: any) => ({
            id: `idx-${i.key}`,
            label: i.name,
            symbol: i.yahooSymbol,
            exchange: i.exchange,
            price: i.price,
            changePercent: i.changePercent,
            isIndex: true,
          }));
          const stockItems: TickerQuote[] = (res.data.heatmap || []).slice(0, 10).map((s: any) => ({
            id: `eq-${s.symbol}-${s.exchange}`,
            label: `${s.symbol} · ${s.exchange}`,
            symbol: s.symbol,
            exchange: s.exchange,
            price: s.price,
            changePercent: s.changePercent,
            currency: s.currency,
            isIndex: false,
          }));
          setItems([...idxItems, ...stockItems]);
        })
        .catch(() => {
          // Non-blocking: ticker bar hides gracefully if upstream unavailable
        });
    };
    load();
    const timer = setInterval(load, 90_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <div
      className="print:hidden bg-slate-100 dark:bg-[#0B111E] border-b border-slate-200 dark:border-slate-800/80 overflow-hidden select-none"
      aria-label="Global market ticker tape"
    >
      <div className="ticker-track py-1.5">
        {doubled.map((item, idx) => {
          const isUp = item.changePercent > 0;
          const isDown = item.changePercent < 0;
          return (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              onClick={() => {
                if (item.isIndex) {
                  navigate('/dashboard');
                } else {
                  navigate(`/stocks/${encodeURIComponent(item.symbol)}?exchange=${item.exchange}`);
                }
              }}
              className="inline-flex items-center gap-2 px-4 border-r border-slate-200 dark:border-slate-800/70 text-xs hover:bg-slate-200/60 dark:hover:bg-slate-800/40 transition-colors whitespace-nowrap shrink-0"
            >
              <span className="font-medium text-slate-600 dark:text-slate-300">{item.label}</span>
              <span className="num text-slate-900 dark:text-slate-100">
                {item.isIndex ? formatNumber(item.price) : formatCurrency(item.price, item.currency || 'USD')}
              </span>
              <span
                className={`num font-medium ${
                  isUp
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isDown
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {formatPct(item.changePercent)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
