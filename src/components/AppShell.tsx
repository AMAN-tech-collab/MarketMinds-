import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bookmark,
  BrainCircuit,
  Briefcase,
  CandlestickChart as CandleIcon,
  GitCompareArrows,
  Globe2,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Newspaper,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { usePreferences } from '../context/PreferencesContext.tsx';
import { SUPPORTED_CURRENCIES, type ExchangeCode } from '../shared/globalMarkets.ts';
import { StockSearchInput } from './StockSearchInput.tsx';
import { MarketTickerBar } from './MarketTickerBar.tsx';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Global Markets',
    items: [
      { to: '/dashboard', label: 'Global Dashboard', icon: LayoutDashboard },
      { to: '/screener', label: 'Global Screener', icon: Search },
      { to: '/compare', label: 'Compare Stocks', icon: GitCompareArrows },
      { to: '/news', label: 'Global News', icon: Newspaper },
    ],
  },
  {
    title: 'AI Intelligence',
    items: [
      { to: '/ai-analysis', label: 'AI Research Terminal', icon: BrainCircuit },
      { to: '/technical', label: 'Technical Studio', icon: CandleIcon },
      { to: '/predictions', label: 'ML Predictions', icon: History },
      { to: '/risk', label: 'Risk Analytics', icon: ShieldAlert },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
      { to: '/watchlist', label: 'Watchlist', icon: Bookmark },
      { to: '/profile', label: 'Profile', icon: User },
      { to: '/admin', label: 'Admin Monitor', icon: ShieldCheck },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Global Market Dashboard',
  '/screener': 'Global Stock Screener',
  '/compare': 'Global Stock Comparison',
  '/ai-analysis': 'AI Equity Research Terminal',
  '/technical': 'Technical Analysis Studio',
  '/predictions': 'ML Forecast & History',
  '/portfolio': 'Multi-Currency Portfolio',
  '/watchlist': 'Global Watchlist',
  '/news': 'Global Financial News & Sentiment',
  '/risk': 'Global Risk Analytics Suite',
  '/profile': 'Account Profile',
  '/admin': 'Admin Monitoring Console',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const {
    displayCurrency,
    setDisplayCurrency,
    reducedMotion,
    toggleReducedMotion,
    theme,
    toggleTheme,
  } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();

  const currentTitle = location.pathname.startsWith('/stocks/')
    ? `Equity Detail · ${decodeURIComponent(location.pathname.split('/')[2] || '')}`
    : ROUTE_TITLES[location.pathname] || 'MarketMinds Terminal';

  const handleGlobalSearch = (symbol: string, exchange: ExchangeCode) => {
    navigate(`/stocks/${encodeURIComponent(symbol)}?exchange=${exchange}`);
    setMobileOpen(false);
  };

  const renderNav = () => (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 shrink-0">
        <Link
          to="/"
          className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <span className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white">
            <Activity className="w-4 h-4" />
          </span>
          <span>
            Market<span className="text-blue-600 dark:text-blue-400">Minds</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-3 mb-2 text-[11px] font-medium text-slate-500 tracking-wide">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-blue-600/12 text-blue-600 dark:bg-blue-600/15 dark:text-blue-400'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Theme, Motion Accessibility & Currency Controls */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5 text-slate-500" /> Base Currency
          </span>
          <select
            value={displayCurrency}
            onChange={(e) => setDisplayCurrency(e.target.value)}
            aria-label="Global display currency"
            className="bg-slate-100 dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 py-1 transition-colors"
          aria-label="Toggle light or dark theme"
        >
          <span className="flex items-center gap-1.5">
            {theme === 'dark' ? (
              <Moon className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            )}
            Appearance
          </span>
          <span className="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            {theme === 'dark' ? 'DARK' : 'LIGHT'}
          </span>
        </button>

        <button
          type="button"
          onClick={toggleReducedMotion}
          className="w-full flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 py-1 transition-colors"
          aria-pressed={reducedMotion}
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-slate-500" /> Reduced Motion
          </span>
          <span
            className={`font-mono text-[11px] ${
              reducedMotion ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-500'
            }`}
          >
            {reducedMotion ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 shrink-0">
        {user ? (
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <Link to="/profile" className="min-w-0 flex-1 hover:opacity-90">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {user.name}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {user.role === 'admin' ? 'Admin' : 'Investor'} · {user.email}
              </div>
            </Link>
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors shrink-0"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="flex-1 text-center py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="flex-1 text-center py-2 px-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
            >
              Register
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex transition-colors">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block print:hidden w-64 bg-white dark:bg-[#0D1320] border-r border-slate-200 dark:border-slate-800/80 fixed inset-y-0 left-0 z-30">
        {renderNav()}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-[#0D1320] border-r border-slate-200 dark:border-slate-800 h-full z-10">
            {renderNav()}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 print:pl-0 flex flex-col min-w-0">
        <header className="print:hidden h-16 sticky top-0 z-20 bg-white/95 dark:bg-[#090D16]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800/80 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">MarketMinds</span>
              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden md:block w-72 xl:w-96">
              <StockSearchInput
                compact
                placeholder="Search AAPL, NVDA, RELIANCE, 7203.T..."
                onSelect={handleGlobalSearch}
              />
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link
              to="/ai-analysis"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Run AI Research
            </Link>
          </div>
        </header>

        <MarketTickerBar />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>

        <footer className="print:hidden border-t border-slate-200 dark:border-slate-800/60 px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span>MarketMinds — Global AI Stock Intelligence · Think Smarter. Analyze Deeper. Invest Informed.</span>
          <span>Educational &amp; quantitative research only — not personalized financial or investment advice.</span>
        </footer>
      </div>
    </div>
  );
}
