import { SUPPORTED_CURRENCIES } from '../../shared/globalMarkets.ts';

export interface FxRatesSnapshot {
  base: string;
  rates: Record<string, number>;
  source: string;
  freshness: 'live' | 'cached' | 'unavailable';
  fetchedAt: string;
  note: string;
}

const fxCache = new Map<string, { data: FxRatesSnapshot; expiresAt: number }>();

async function fetchOpenErRates(base: string): Promise<Record<string, number> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.result !== 'success' || !json?.rates || typeof json.rates !== 'object') {
      return null;
    }
    const filtered: Record<string, number> = { [base]: 1 };
    for (const cur of SUPPORTED_CURRENCIES) {
      const val = Number(json.rates[cur]);
      if (Number.isFinite(val) && val > 0) {
        filtered[cur] = Number(val.toFixed(6));
      }
    }
    return filtered;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function fetchYahooPairRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const symbol = `${from}${to}=X`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const price = Number(json?.chart?.result?.[0]?.meta?.regularMarketPrice);
    return Number.isFinite(price) && price > 0 ? Number(price.toFixed(6)) : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function getFxRates(rawBase = 'USD'): Promise<FxRatesSnapshot> {
  const base = rawBase.trim().toUpperCase();
  const safeBase = (SUPPORTED_CURRENCIES as readonly string[]).includes(base) ? base : 'USD';

  const cached = fxCache.get(safeBase);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.data, freshness: 'cached' };
  }

  // Primary FX provider: ExchangeRate-API Open Access (ECB / market mid-rates)
  const openEr = await fetchOpenErRates(safeBase);
  if (openEr && Object.keys(openEr).length >= 5) {
    const snapshot: FxRatesSnapshot = {
      base: safeBase,
      rates: openEr,
      source: 'ExchangeRate-API (Open FX Mid-Market Feed)',
      freshness: 'live',
      fetchedAt: new Date().toISOString(),
      note: 'Indicative mid-market spot exchange rates; broker FX spreads are not included.',
    };
    fxCache.set(safeBase, { data: snapshot, expiresAt: Date.now() + 10 * 60 * 1000 });
    return snapshot;
  }

  // Fallback FX provider: Yahoo Finance FX pairs
  const pairEntries = await Promise.all(
    SUPPORTED_CURRENCIES.map(async (cur) => {
      const rate = await fetchYahooPairRate(safeBase, cur);
      return [cur, rate] as const;
    })
  );
  const yahooRates: Record<string, number> = { [safeBase]: 1 };
  for (const [cur, rate] of pairEntries) {
    if (rate !== null) yahooRates[cur] = rate;
  }

  if (Object.keys(yahooRates).length >= 2) {
    const snapshot: FxRatesSnapshot = {
      base: safeBase,
      rates: yahooRates,
      source: 'Yahoo Finance FX Spot Pairs',
      freshness: 'live',
      fetchedAt: new Date().toISOString(),
      note: 'Indicative FX pair mid-rates from Yahoo Finance; broker conversion spreads excluded.',
    };
    fxCache.set(safeBase, { data: snapshot, expiresAt: Date.now() + 10 * 60 * 1000 });
    return snapshot;
  }

  return {
    base: safeBase,
    rates: { [safeBase]: 1 },
    source: 'FX Provider Unavailable',
    freshness: 'unavailable',
    fetchedAt: new Date().toISOString(),
    note: 'Live FX rates could not be retrieved. Multi-currency values remain in native currencies without fabricated conversion.',
  };
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxSnapshot: FxRatesSnapshot
): { converted: number | null; rate: number | null } {
  const from = (fromCurrency || 'USD').toUpperCase();
  const to = (toCurrency || 'USD').toUpperCase();
  if (from === to) return { converted: Number(amount.toFixed(2)), rate: 1 };

  const base = fxSnapshot.base.toUpperCase();
  const rFrom = from === base ? 1 : fxSnapshot.rates[from];
  const rTo = to === base ? 1 : fxSnapshot.rates[to];
  if (!rFrom || !rTo || rFrom <= 0 || rTo <= 0) {
    return { converted: null, rate: null };
  }
  const crossRate = rTo / rFrom;
  return {
    converted: Number((amount * crossRate).toFixed(2)),
    rate: Number(crossRate.toFixed(6)),
  };
}
