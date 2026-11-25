const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  HKD: 'HK$',
  CAD: 'C$',
  AUD: 'A$',
  SGD: 'S$',
  KRW: '₩',
  CHF: 'CHF ',
  GBX: 'GBp ',
  GBP_PENCE: 'GBp ',
};

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeCurrencyCode(currency?: string | null): { code: string; isPence: boolean } {
  const raw = typeof currency === 'string' ? currency.trim() : '';
  if (!raw) return { code: 'USD', isPence: false };
  // London Stock Exchange often quotes in pence ("GBp" or "GBX")
  if (raw === 'GBp' || raw.toUpperCase() === 'GBX') {
    return { code: 'GBp', isPence: true };
  }
  const upper = raw.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) {
    return { code: upper, isPence: false };
  }
  return { code: 'USD', isPence: false };
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency: string | null | undefined = 'INR',
  digits?: number
): string {
  const num = toFiniteNumber(value);
  if (num === null) return '—';

  const { code, isPence } = normalizeCurrencyCode(currency || 'INR');
  const defaultDigits = code === 'JPY' || code === 'KRW' ? 0 : 2;
  const fractionDigits =
    typeof digits === 'number' && Number.isInteger(digits) && digits >= 0 && digits <= 8
      ? digits
      : defaultDigits;

  if (isPence) {
    return `${new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(num)} GBp`;
  }

  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(num);
  } catch {
    const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `;
    return `${symbol}${num.toFixed(fractionDigits)}`;
  }
}

export function formatPrice(
  value: number | string | null | undefined,
  currency: string | null | undefined = 'USD',
  digits?: number
): string {
  return formatCurrency(value, currency, digits);
}

export function formatINR(value: number | string | null | undefined, digits = 2): string {
  return formatCurrency(value, 'INR', digits);
}

export function formatNumber(value: number | string | null | undefined, digits = 2): string {
  const num = toFiniteNumber(value);
  if (num === null) return '—';
  const safeDigits =
    typeof digits === 'number' && Number.isInteger(digits) && digits >= 0 && digits <= 8
      ? digits
      : 2;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: safeDigits,
    maximumFractionDigits: safeDigits,
  }).format(num);
}

export function formatCompactIndian(value: number | string | null | undefined): string {
  const num = toFiniteNumber(value);
  if (num === null) return '—';
  const abs = Math.abs(num);
  if (abs >= 1e7) return `${(num / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(num / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(1)} K`;
  return String(Math.round(num));
}

export function formatCompactGlobal(
  value: number | string | null | undefined,
  currency?: string | null
): string {
  const num = toFiniteNumber(value);
  if (num === null) return '—';

  const cleanCur = typeof currency === 'string' && currency.trim() ? currency.trim() : '';
  const upperCur = cleanCur.toUpperCase();
  const prefix =
    cleanCur === 'GBp' || upperCur === 'GBX'
      ? 'GBp '
      : upperCur
        ? (CURRENCY_SYMBOLS[upperCur] ?? `${upperCur} `)
        : '';

  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1e12) return `${sign}${prefix}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${prefix}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${prefix}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${prefix}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${prefix}${Math.round(abs)}`;
}

export function formatCompactNumber(value: number | string | null | undefined): string {
  return formatCompactGlobal(value);
}

export function formatVolume(value: number | string | null | undefined): string {
  const num = toFiniteNumber(value);
  if (num === null || num < 0) return '—';
  return formatCompactGlobal(num);
}

export function formatPct(
  value: number | string | null | undefined,
  showPlus = true,
  digits = 2
): string {
  const num = toFiniteNumber(value);
  if (num === null) return '—';
  const safeDigits =
    typeof digits === 'number' && Number.isInteger(digits) && digits >= 0 && digits <= 6
      ? digits
      : 2;
  const sign = showPlus && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(safeDigits)}%`;
}

export function formatPercentage(
  value: number | string | null | undefined,
  showPlus = true,
  digits = 2
): string {
  return formatPct(value, showPlus, digits);
}

export function formatDate(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleDateString(
      'en-US',
      options ?? {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }
    );
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatTimestampIST(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' IST'
  );
}

export function formatTimestampUTC(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleString('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' UTC'
  );
}

export function deltaColorClass(val: number | string | null | undefined): string {
  const num = toFiniteNumber(val);
  if (num === null) return 'text-slate-500 dark:text-slate-400';
  if (num > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (num < 0) return 'text-rose-600 dark:text-rose-400';
  return 'text-slate-600 dark:text-slate-300';
}
