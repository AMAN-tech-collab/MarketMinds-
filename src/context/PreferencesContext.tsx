import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from './AuthContext.tsx';
import type { ExchangeCode } from '../shared/globalMarkets.ts';

export interface RecentSearchEntry {
  symbol: string;
  exchange: ExchangeCode | string;
  companyName: string;
  country: string;
  currency: string;
}

export interface FxRatesState {
  base: string;
  rates: Record<string, number>;
  source: string;
  freshness: 'live' | 'cached' | 'unavailable';
  fetchedAt: string;
}

export type ThemeMode = 'dark' | 'light';

interface PreferencesContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  displayCurrency: string;
  setDisplayCurrency: (cur: string) => void;
  reducedMotion: boolean;
  toggleReducedMotion: () => void;
  fxRates: FxRatesState | null;
  convertAmount: (amount: number, fromCurrency: string, toCurrency?: string) => number | null;
  recentSearches: RecentSearchEntry[];
  addRecentSearch: (entry: RecentSearchEntry) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const STORAGE_THEME_KEY = 'marketminds_theme_mode';
const STORAGE_CURRENCY_KEY = 'marketminds_display_currency';
const STORAGE_MOTION_KEY = 'marketminds_reduced_motion';
const STORAGE_RECENT_KEY = 'marketminds_recent_searches';

function readStorageWithFallback(primaryKey: string, legacyKey: string): string | null {
  try {
    return localStorage.getItem(primaryKey) ?? localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

function readInitialTheme(): ThemeMode {
  const saved = readStorageWithFallback(STORAGE_THEME_KEY, 'dalalpulse_theme_mode');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

function readInitialReducedMotion(): boolean {
  try {
    const saved = readStorageWithFallback(STORAGE_MOTION_KEY, 'dalalpulse_reduced_motion');
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function readInitialCurrency(): string {
  return readStorageWithFallback(STORAGE_CURRENCY_KEY, 'dalalpulse_display_currency') || 'USD';
}

function readInitialRecent(): RecentSearchEntry[] {
  try {
    const raw = readStorageWithFallback(STORAGE_RECENT_KEY, 'dalalpulse_recent_searches');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);
  const [displayCurrency, setDisplayCurrencyState] = useState<string>(readInitialCurrency);
  const [reducedMotion, setReducedMotion] = useState<boolean>(readInitialReducedMotion);
  const [fxRates, setFxRates] = useState<FxRatesState | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearchEntry[]>(readInitialRecent);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', reducedMotion ? 'true' : 'false');
    try {
      localStorage.setItem(STORAGE_MOTION_KEY, String(reducedMotion));
    } catch {
      // ignore storage restrictions
    }
  }, [reducedMotion]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setDisplayCurrency = useCallback((cur: string) => {
    const clean = cur.trim().toUpperCase();
    setDisplayCurrencyState(clean);
    try {
      localStorage.setItem(STORAGE_CURRENCY_KEY, clean);
    } catch {
      // ignore
    }
  }, []);

  const toggleReducedMotion = useCallback(() => {
    setReducedMotion((prev) => !prev);
  }, []);

  useEffect(() => {
    let active = true;
    api
      .get('/fx/rates', { params: { base: displayCurrency } })
      .then((res) => {
        if (active && res.data) {
          setFxRates(res.data);
        }
      })
      .catch(() => {
        // Leave previous or null without fabricating FX
      });
    return () => {
      active = false;
    };
  }, [displayCurrency]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api
      .get('/stocks/search-history')
      .then((res) => {
        if (active && Array.isArray(res.data?.items) && res.data.items.length > 0) {
          const mapped: RecentSearchEntry[] = res.data.items.map((r: any) => ({
            symbol: r.symbol,
            exchange: r.exchange,
            companyName: r.companyName,
            country: r.country,
            currency: r.currency,
          }));
          setRecentSearches(mapped.slice(0, 10));
        }
      })
      .catch(() => {
        // Keep local recent searches
      });
    return () => {
      active = false;
    };
  }, [user]);

  const addRecentSearch = useCallback(
    (entry: RecentSearchEntry) => {
      setRecentSearches((prev) => {
        const filtered = prev.filter(
          (i) => !(i.symbol === entry.symbol && i.exchange === entry.exchange)
        );
        const next = [entry, ...filtered].slice(0, 10);
        try {
          localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      if (user) {
        api.post('/stocks/search-history', entry).catch(() => {
          // Non-blocking background persistence
        });
      }
    },
    [user]
  );

  const convertAmount = useCallback(
    (amount: number, fromCurrency: string, toCurrency?: string): number | null => {
      const from = (fromCurrency || 'USD').toUpperCase();
      const to = (toCurrency || displayCurrency).toUpperCase();
      if (from === to) return amount;
      if (!fxRates || fxRates.freshness === 'unavailable') return null;
      const base = fxRates.base.toUpperCase();
      const rFrom = from === base ? 1 : fxRates.rates[from];
      const rTo = to === base ? 1 : fxRates.rates[to];
      if (!rFrom || !rTo || rFrom <= 0 || rTo <= 0) return null;
      return amount * (rTo / rFrom);
    },
    [fxRates, displayCurrency]
  );

  return (
    <PreferencesContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        displayCurrency,
        setDisplayCurrency,
        reducedMotion,
        toggleReducedMotion,
        fxRates,
        convertAmount,
        recentSearches,
        addRecentSearch,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
