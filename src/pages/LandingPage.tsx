import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Briefcase,
  GitCompareArrows,
  Globe2,
  Newspaper,
  ShieldAlert,
} from 'lucide-react';
import { apiClient } from '../lib/api.ts';
import { deltaColorClass, formatNumber, formatPct } from '../lib/format.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { MotionCard } from '../components/MotionPrimitives.tsx';

interface IndexQuote {
  key: string;
  name: string;
  exchange: string;
  country: string;
  price: number;
  change: number;
  changePercent: number;
}

export function LandingPage() {
  const { user } = useAuth();
  const [indices, setIndices] = useState<IndexQuote[]>([]);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [prismImgFailed, setPrismImgFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/markets/global')
      .then(({ data }) => {
        if (!active) return;
        const featured = (data.indices || []).filter((i: any) =>
          ['SP500', 'NASDAQ', 'NIFTY50', 'FTSE100', 'NIKKEI225', 'DAX', 'SENSEX', 'HSI'].includes(i.key)
        );
        setIndices(featured.slice(0, 8));
      })
      .catch(() => {
        // Silently omit live strip on landing if upstream unavailable
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="border-b border-slate-800/80 bg-[#090D16]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <span className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white">
              <Activity className="w-4 h-4" />
            </span>
            <span>
              Market<span className="text-blue-400">Minds</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
            <Link to="/dashboard" className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0">
              Global Markets
            </Link>
            <Link to="/ai-analysis" className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0">
              AI Research
            </Link>
            <Link to="/compare" className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0">
              Compare
            </Link>
            <Link to="/predictions" className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0">
              ML Models
            </Link>
            <Link to="/portfolio" className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0">
              Portfolio
            </Link>
          </nav>

          <div className="shrink-0">
            <Link
              to={user ? '/dashboard' : '/login'}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Open Terminal' : 'Sign In'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <section className="max-w-[1280px] mx-auto px-6 pt-14 pb-16 terminal-grid-bg">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-xs font-medium text-blue-400 tracking-wide mb-4 inline-flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5" />
              MarketMinds · 16 Worldwide Exchanges · Think Smarter. Analyze Deeper. Invest Informed.
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-50 leading-[1.12] mb-5">
              Global AI stock intelligence and multi-market quantitative research.
            </h1>
            <p className="text-base text-slate-400 leading-relaxed max-w-xl mb-8">
              Analyze equities across NASDAQ, NYSE, NSE, BSE, LSE, Tokyo, Frankfurt, and Hong Kong with real exchange data,
              out-of-sample ML forecasting, Gemini research synthesis, currency-normalized comparison, and multi-currency portfolio risk analytics.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors whitespace-nowrap"
              >
                Launch Global Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/ai-analysis"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-700 hover:border-slate-600 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap"
              >
                Run Global AI Analysis
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] rounded-xl overflow-hidden border border-slate-800 bg-[#111827] relative">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_mumbai_finance_1795329143432.jpg"
                  alt="Global financial skyline at twilight"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-900 to-[#090D16]">
                  <BarChart3 className="w-10 h-10 text-blue-400 mb-3" />
                  <p className="text-sm text-slate-300">MarketMinds — Global AI Stock Intelligence</p>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#090D16]/85 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between text-xs text-slate-300">
                <span>New York · Mumbai · London · Tokyo · Frankfurt</span>
                <span className="num text-slate-400">16 Global Feeds</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width Live Global Index Strip Below Hero */}
        {indices.length > 0 && (
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {indices.map((idx, i) => (
              <MotionCard key={idx.key} delay={i * 0.03}>
                <Link
                  to="/dashboard"
                  className="block p-4 rounded-xl bg-[#111827] border border-slate-800/80 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span className="font-medium text-slate-200">{idx.name}</span>
                    <span>{idx.exchange}</span>
                  </div>
                  <div className="text-xl font-semibold text-slate-50 num">{formatNumber(idx.price)}</div>
                  <div className={`text-xs mt-1 num ${deltaColorClass(idx.change)}`}>
                    {idx.change >= 0 ? '+' : ''}
                    {formatNumber(idx.change)} ({formatPct(idx.changePercent)})
                  </div>
                </Link>
              </MotionCard>
            ))}
          </div>
        )}
      </section>

      {/* Capabilities Grid */}
      <section className="border-t border-slate-800/70 py-16">
        <div className="max-w-[1280px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center mb-12">
            <div className="lg:col-span-7">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-50 mb-3">
                Transparent, verifiable equity research across worldwide markets
              </h2>
              <p className="text-slate-400 text-sm sm:text-base max-w-2xl leading-relaxed">
                Every brief separates verified exchange facts from probabilistic model estimates (MAE, RMSE,
                MAPE, directional accuracy) — with transparent FX conversion and zero fabricated quotes.
              </p>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#111827] aspect-[4/3] max-h-56 w-full">
                {!prismImgFailed ? (
                  <img
                    src="/src/assets/images/quant_precision_prism_1795329143632.jpg"
                    alt="Precision smoked glass blocks representing quantitative modeling"
                    referrerPolicy="no-referrer"
                    onError={() => setPrismImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                    Quantitative Modeling Engine
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: BrainCircuit,
                title: 'Global AI Equity Analysis',
                desc: 'BUY, SELL, HOLD, and WAIT research briefs with Risk Gauge, Confidence bar, Short/Medium/Long outlooks, and Verified Facts vs Model Estimates.',
                to: '/ai-analysis',
              },
              {
                icon: GitCompareArrows,
                title: 'Cross-Market Stock Comparison',
                desc: 'Compare up to 5 international equities side-by-side (e.g. AAPL vs MSFT, TCS vs INFY, TSLA vs Toyota) on normalized percentage return curves.',
                to: '/compare',
              },
              {
                icon: BarChart3,
                title: 'Out-of-Sample ML Pipeline',
                desc: 'Chronological 80/20 train/test evaluation across Ridge Linear Regression, Random Forest, and Gradient Boosted Trees with VWAP & momentum features.',
                to: '/predictions',
              },
              {
                icon: Briefcase,
                title: 'Multi-Currency Portfolio Tracker',
                desc: 'Hold stocks across 16 global exchanges with live spot FX conversion, country/currency/sector allocations, and PostgreSQL persistence.',
                to: '/portfolio',
              },
              {
                icon: ShieldAlert,
                title: 'Global Risk & Correlation Suite',
                desc: 'ATR stop-loss sizing, portfolio Beta vs S&P 500, Sharpe Ratio, currency/country concentration, and pairwise correlation matrix.',
                to: '/risk',
              },
              {
                icon: Newspaper,
                title: 'Worldwide Financial News',
                desc: 'Live syndicated press coverage across US, India, Europe, Asia-Pacific, central banks, and earnings with sentiment scoring.',
                to: '/news',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.title}
                  to={item.to}
                  className="p-6 rounded-xl bg-[#111827] border border-slate-800/80 hover:border-slate-700 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <Icon className="w-5 h-5 text-blue-400 mb-4" />
                    <h3 className="text-base font-semibold text-slate-100 mb-2">{item.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                  </div>
                  <div className="mt-5 text-xs font-medium text-blue-400 inline-flex items-center gap-1">
                    Open module <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/70 py-8 px-6">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <span>MarketMinds — Global AI Stock Intelligence · Think Smarter. Analyze Deeper. Invest Informed.</span>
          <span>For educational and research purposes only. Not personalized investment advice.</span>
        </div>
      </footer>
    </div>
  );
}
