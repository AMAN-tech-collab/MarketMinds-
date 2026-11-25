import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  addPortfolioHolding,
  addWatchlistItem,
  checkDatabaseHealth,
  countAdmins,
  createLocalUser,
  deletePortfolioHolding,
  deleteUserScreenerFilter,
  deleteWatchlistItem,
  findUserByEmail,
  getAdminStats,
  getLatestAnalysisBySymbolMap,
  getUserAnalysisHistory,
  getUserPortfolio,
  getUserPredictionHistory,
  getUserScreenerFilters,
  getUserSearchHistory,
  getUserWatchlist,
  promoteUserToAdmin,
  recordUserSearch,
  saveAnalysisRecord,
  savePredictionRecord,
  saveUserScreenerFilter,
  updatePortfolioHolding,
  updateUserPassword,
  updateUserProfile,
  verifyPassword,
} from '../../db/repository.ts';
import { searchCatalogStocks } from '../../shared/indianStocks.ts';
import {
  getExchangeMarketStatus,
  GLOBAL_EXCHANGES,
  normalizeExchangeCode,
  SUPPORTED_CURRENCIES,
  type ExchangeCode,
} from '../../shared/globalMarkets.ts';
import { env, getEnvDiagnostics } from '../config/env.ts';
import {
  optionalAuth,
  requireAdmin,
  requireAuth,
  sanitizeUser,
  signLocalJwt,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  compareGlobalStocks,
  fetchGlobalMarketOverview,
  fetchGlobalScreener,
  fetchMarketOverview,
  fetchScreenerStocks,
  fetchSectorAndPeersContext,
  fetchStockChart,
  fetchStockFundamentals,
  fetchStockQuote,
  getActiveProviderInfo,
  getIndianMarketStatus,
  MarketDataError,
  resolveGlobalSymbol,
  searchGlobalEquities,
  type TimeframeKey,
} from '../services/marketDataService.ts';
import {
  computeTechnicalAnalysis,
  extractDailyReturns,
} from '../services/technicalIndicators.ts';
import { runMlPredictionPipeline } from '../services/mlPipelineService.ts';
import {
  generateAiStockAnalysis,
  type AiStockAnalysisReport,
  type AiSynthesisEnvelope,
} from '../services/geminiAnalysisService.ts';
import {
  AllAiProvidersFailedError,
  getAiProvidersHealth,
} from '../services/ai/providerClient.ts';
import { runReverseResearchInvestigation } from '../services/reverseResearchService.ts';
import {
  fetchFinancialNews,
  getNewsProvidersHealth,
} from '../services/newsService.ts';
import {
  analyzePortfolioDiversification,
  calculateTradeRisk,
} from '../services/riskService.ts';
import { convertCurrencyAmount, getFxRates } from '../services/fxService.ts';

export const apiRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API rate limit exceeded. Please wait briefly before retrying.' },
});

apiRouter.use(generalLimiter);

const VALID_TIMEFRAMES = new Set<TimeframeKey>([
  '1D',
  '1W',
  '1M',
  '3M',
  '6M',
  '1Y',
  '2Y',
  '5Y',
  'MAX',
]);

const EXCHANGE_CODES = Object.keys(GLOBAL_EXCHANGES) as [ExchangeCode, ...ExchangeCode[]];
const exchangeSchema = z.string().trim().max(24).optional();

function parseGlobalExchange(raw: unknown, fallback?: ExchangeCode): ExchangeCode | undefined {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  return normalizeExchangeCode(s);
}

// ============================================================================
// 1. HEALTH & ANALYSIS-HEALTH
// ============================================================================
apiRouter.get('/health', async (_req, res) => {
  const dbHealth = await checkDatabaseHealth();
  const marketStatus = getIndianMarketStatus();
  const diagnostics = getEnvDiagnostics();
  res.json({
    status: dbHealth.status === 'connected' ? 'healthy' : 'degraded',
    service: 'marketminds-global-api',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database: dbHealth,
    marketStatus,
    provider: getActiveProviderInfo(),
    environment: diagnostics,
  });
});

apiRouter.get('/providers/health', async (_req, res) => {
  const start = Date.now();
  let yahooChartReachable = false;
  let sampleLatencyMs: number | null = null;
  let errorDetail: string | null = null;

  try {
    await fetchStockChart('AAPL', '1W', 'NASDAQ');
    yahooChartReachable = true;
    sampleLatencyMs = Date.now() - start;
  } catch (err: any) {
    errorDetail = err?.message || 'Market data feed unavailable';
  }

  const fx = await getFxRates('USD').catch(() => null);
  res.json({
    status: yahooChartReachable ? 'operational' : 'degraded',
    timestamp: new Date().toISOString(),
    provider: getActiveProviderInfo(),
    probes: {
      yahooChartFeed: {
        reachable: yahooChartReachable,
        latencyMs: sampleLatencyMs,
        error: errorDetail,
      },
      fxFeed: {
        reachable: Boolean(fx && fx.rates && Object.keys(fx.rates).length > 0),
        source: fx?.source || 'Unavailable',
        fetchedAt: fx?.fetchedAt || null,
      },
      geminiAi: {
        configured: Boolean(env.geminiApiKey),
      },
      aiProviders: getAiProvidersHealth(),
      newsFeed: getNewsProvidersHealth(),
    },
  });
});

apiRouter.get('/ai/health', (_req, res) => {
  res.json(getAiProvidersHealth());
});

apiRouter.get('/analysis-health', async (_req, res) => {
  let externalPythonStatus: {
    configured: boolean;
    reachable: boolean;
    url: string | null;
    latencyMs: number | null;
    error: string | null;
  } = {
    configured: Boolean(env.analysisServiceUrl),
    reachable: false,
    url: env.analysisServiceUrl ? 'configured (hidden)' : null,
    latencyMs: null,
    error: null,
  };

  if (env.analysisServiceUrl) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const r = await fetch(`${env.analysisServiceUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      externalPythonStatus.reachable = r.ok;
      externalPythonStatus.latencyMs = Date.now() - start;
      if (!r.ok) externalPythonStatus.error = `HTTP ${r.status}`;
    } catch (err: any) {
      clearTimeout(timer);
      externalPythonStatus.error = err?.message || 'Connection refused or timed out';
    }
  }

  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    engines: {
      quantitativeMl: {
        status: 'active',
        mode: externalPythonStatus.reachable ? 'python-fastapi' : 'builtin-quant-ml',
        models: ['Linear Regression (Ridge L2)', 'Random Forest Regressor', 'Gradient Boosted Trees'],
        version: 'v2.0-global',
      },
      geminiAi: {
        status: env.geminiApiKey ? 'configured' : 'missing_api_key',
        model: 'gemini-4-hydrogen',
      },
      externalPythonService: externalPythonStatus,
    },
  });
});

// ============================================================================
// 2. AUTHENTICATION & PROFILE (/api/auth)
// ============================================================================
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

apiRouter.post('/auth/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const user = await createLocalUser(parsed.email, parsed.name, parsed.password);
    const token = signLocalJwt(user);
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error: any) {
    if (error?.message === 'EMAIL_EXISTS') {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    next(error);
  }
});

apiRouter.post('/auth/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const user = await findUserByEmail(parsed.email);
    if (!user || !user.passwordHash || !verifyPassword(parsed.password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = signLocalJwt(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
  const user = req.user!;
  const [holdings, watchlist, analyses, predictions] = await Promise.all([
    getUserPortfolio(user.id),
    getUserWatchlist(user.id),
    getUserAnalysisHistory(user.id, 10),
    getUserPredictionHistory(user.id, 10),
  ]);
  res.json({
    user: sanitizeUser(user),
    stats: {
      holdingsCount: holdings.length,
      watchlistCount: watchlist.length,
      analysesCount: analyses.length,
      predictionsCount: predictions.length,
    },
    recentAnalyses: analyses,
    recentPredictions: predictions,
  });
});

apiRouter.put('/auth/profile', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    });
    const parsed = schema.parse(req.body);
    const updated = await updateUserProfile(req.user!.id, parsed.name);
    res.json({ user: sanitizeUser(updated) });
  } catch (error) {
    next(error);
  }
});

apiRouter.put('/auth/change-password', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
    });
    const parsed = schema.parse(req.body);
    const user = req.user!;
    if (user.authProvider === 'google' && !user.passwordHash) {
      return res.status(400).json({
        error: 'Google Sign-In accounts manage passwords through Google Account security settings.',
      });
    }
    if (!user.passwordHash || !verifyPassword(parsed.currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    await updateUserPassword(user.id, parsed.newPassword);
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/auth/admin-claim-status', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const admins = await countAdmins();
    res.json({
      isAdmin: req.user!.role === 'admin',
      canBootstrapClaim: admins === 0 || Boolean(env.adminSetupPasscode),
      requiresPasscode: Boolean(env.adminSetupPasscode),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/claim-admin', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    if (user.role === 'admin') {
      return res.json({ user: sanitizeUser(user) });
    }

    if (env.adminSetupPasscode) {
      const passcode = String(req.body?.passcode || '');
      if (passcode !== env.adminSetupPasscode) {
        return res.status(403).json({ error: 'Invalid administrator setup passcode.' });
      }
      const updated = await promoteUserToAdmin(user.id);
      return res.json({ user: sanitizeUser(updated) });
    }

    const existingAdmins = await countAdmins();
    if (existingAdmins > 0) {
      return res.status(403).json({
        error: 'An administrator account is already active. Ask an existing admin or configure ADMIN_SETUP_PASSCODE.',
      });
    }

    const updated = await promoteUserToAdmin(user.id);
    res.json({ user: sanitizeUser(updated) });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 3. GLOBAL & INDIAN MARKET OVERVIEW + FX RATES (/api/market, /api/markets, /api/fx)
// ============================================================================
apiRouter.get('/market/overview', async (_req, res, next) => {
  try {
    const overview = await fetchMarketOverview();
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/market/status', (_req, res) => {
  res.json(getIndianMarketStatus());
});

apiRouter.get('/markets/exchanges', (_req, res) => {
  const exchanges = EXCHANGE_CODES.map((code) => ({
    ...GLOBAL_EXCHANGES[code],
    marketStatus: getExchangeMarketStatus(code),
  }));
  res.json({
    exchanges,
    currencies: SUPPORTED_CURRENCIES,
    provider: getActiveProviderInfo(),
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/markets/global', async (_req, res, next) => {
  try {
    const overview = await fetchGlobalMarketOverview();
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/fx/rates', async (req, res, next) => {
  try {
    const base = typeof req.query.base === 'string' ? req.query.base : 'USD';
    const snapshot = await getFxRates(base);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 4. GLOBAL STOCK SEARCH, HISTORY, SCREENER, COMPARE & DETAIL (/api/stocks)
// ============================================================================
apiRouter.get('/stocks/search', (req, res) => {
  const q = String(req.query.q || '');
  const matches = searchCatalogStocks(q).slice(0, 20);
  res.json({
    query: q,
    results: matches,
    note: 'You can also enter any valid NSE ticker (e.g. ZOMATO, HAL) or 6-digit BSE code.',
  });
});

apiRouter.get('/stocks/global-search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const exchange = typeof req.query.exchange === 'string' ? req.query.exchange : undefined;
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined;
    const data = await searchGlobalEquities({ q, exchange, country, currency });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/stocks/search-history', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const items = await getUserSearchHistory(req.user!.id, 12);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/stocks/search-history', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1).max(24),
      exchange: z.string().trim().min(1).max(20),
      companyName: z.string().trim().min(1).max(160),
      country: z.string().trim().max(64).optional().default('United States'),
      currency: z.string().trim().max(12).optional().default('USD'),
    });
    const parsed = schema.parse(req.body);
    const saved = await recordUserSearch({
      userId: req.user!.id,
      symbol: parsed.symbol.toUpperCase(),
      exchange: normalizeExchangeCode(parsed.exchange),
      companyName: parsed.companyName,
      country: parsed.country,
      currency: parsed.currency.toUpperCase(),
    });
    res.status(201).json({ item: saved });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/stocks/screener', async (req, res, next) => {
  try {
    const limit = Math.min(40, Math.max(8, Number(req.query.limit) || 24));
    const data = await fetchScreenerStocks(limit);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/stocks/global-screener', async (req, res, next) => {
  try {
    const region = typeof req.query.region === 'string' ? req.query.region : 'ALL';
    const country = typeof req.query.country === 'string' ? req.query.country : 'ALL';
    const exchange = typeof req.query.exchange === 'string' ? req.query.exchange : 'ALL';
    const limit = Math.min(48, Math.max(12, Number(req.query.limit) || 36));
    const [data, latestAiMap] = await Promise.all([
      fetchGlobalScreener({ region, country, exchange, limit }),
      getLatestAnalysisBySymbolMap(120),
    ]);

    // Enrich with real saved Gemini AI decisions where available
    const enriched = data.stocks.map((s) => {
      const saved = latestAiMap.get(`${s.symbol}:${s.exchange}`);
      if (saved) {
        return {
          ...s,
          aiDecision: saved.decision,
          aiConfidence: saved.confidenceScore,
          aiDecisionSource: 'saved-gemini-analysis' as const,
        };
      }
      return {
        ...s,
        aiDecisionSource: 'quantitative-technical' as const,
      };
    });

    res.json({
      ...data,
      stocks: enriched,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/screener/filters', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const items = await getUserScreenerFilters(req.user!.id);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/screener/filters', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(2, 'Preset name must be at least 2 characters').max(80),
      filters: z.record(z.string(), z.unknown()),
    });
    const parsed = schema.parse(req.body);
    const saved = await saveUserScreenerFilter(
      req.user!.id,
      parsed.name,
      JSON.stringify(parsed.filters)
    );
    res.status(201).json({ item: saved });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/screener/filters/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid filter ID.' });
    }
    const deleted = await deleteUserScreenerFilter(req.user!.id, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Saved filter not found.' });
    }
    res.json({ deletedId: id });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/stocks/compare', async (req, res, next) => {
  try {
    const schema = z.object({
      stocks: z
        .array(
          z.object({
            symbol: z.string().trim().min(1).max(24),
            exchange: exchangeSchema,
          })
        )
        .min(2, 'Select at least 2 stocks to compare.')
        .max(5, 'You can compare up to 5 stocks at once.'),
      timeframe: z.enum(['1M', '3M', '6M', '1Y', '5Y']).optional().default('6M'),
    });
    const parsed = schema.parse(req.body);
    const result = await compareGlobalStocks(parsed.stocks, parsed.timeframe);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/stocks/:symbol', async (req, res, next) => {
  try {
    const symbol = req.params.symbol;
    const exchange = parseGlobalExchange(req.query.exchange);
    const tfRaw = String(req.query.timeframe || '6M').toUpperCase() as TimeframeKey;
    const timeframe: TimeframeKey = VALID_TIMEFRAMES.has(tfRaw) ? tfRaw : '6M';

    const { quote, history } = await fetchStockChart(symbol, timeframe, exchange);
    const technical = computeTechnicalAnalysis(history);
    const fundamentals = await fetchStockFundamentals(quote);

    const enrichedQuote = {
      ...quote,
      marketCap: fundamentals.marketCap ?? quote.marketCap,
      trailingPE: fundamentals.trailingPE ?? quote.trailingPE,
      eps: fundamentals.eps ?? quote.eps,
      dividendYieldPct: fundamentals.dividendYieldPct ?? quote.dividendYieldPct,
    };

    res.json({
      quote: enrichedQuote,
      fundamentals,
      marketStatus: getExchangeMarketStatus(quote.exchange),
      timeframe,
      history: technical.series,
      technicalSummary: technical.summary,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 5. AI STOCK ANALYSIS & REAL-TIME RESEARCH STREAM (/api/analysis)
// ============================================================================
async function executeResearchPipeline(
  symbol: string,
  exchange: string | undefined,
  user: AuthRequest['user'] | undefined,
  onStage?: (stageId: string, status: 'active' | 'done' | 'error', detail?: string) => void
) {
  const emit = (id: string, status: 'active' | 'done' | 'error', detail?: string) => {
    if (onStage) onStage(id, status, detail);
  };

  const withCap = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  // Stage 1: Connecting to market data
  emit('connect', 'active', `Resolving ${symbol.toUpperCase()} exchange routing`);
  const parsedEx = parseGlobalExchange(exchange);
  emit('connect', 'done', `Connected to ${parsedEx || 'Global'} exchange adapter`);

  // Stage 2: Fetching historical prices (2Y daily for SMA200 + 180D ML validation, fallback to 1Y)
  emit('history', 'active', 'Fetching daily OHLCV history');
  let chartData: Awaited<ReturnType<typeof fetchStockChart>>;
  try {
    chartData = await fetchStockChart(symbol, '2Y', parsedEx);
  } catch (primaryErr: any) {
    // Only fallback to 1Y if not a definitive 404/400 symbol error
    if (primaryErr instanceof MarketDataError && (primaryErr.statusCode === 404 || primaryErr.statusCode === 400)) {
      emit('history', 'error', primaryErr.message);
      throw primaryErr;
    }
    chartData = await fetchStockChart(symbol, '1Y', parsedEx);
  }
  const { quote, history } = chartData;
  if (history.length < 25) {
    emit('history', 'error', `Only ${history.length} sessions returned`);
    throw new MarketDataError(
      `Insufficient historical sessions (${history.length}) returned for ${quote.symbol} (${quote.exchange}) to compute indicators.`,
      422,
      'INSUFFICIENT_HISTORY'
    );
  }
  emit('history', 'done', `${history.length} daily OHLCV bars loaded (${quote.currency})`);

  // Stage 3: Calculating technical indicators
  emit('technicals', 'active', 'Computing MAs, RSI, MACD, ADX, Bollinger, Fib, Pivots & Breakouts');
  const technical = computeTechnicalAnalysis(history);
  emit(
    'technicals',
    'done',
    `${technical.summary.trend} · RSI ${technical.summary.rsi14 ?? 'N/A'} · ADX ${technical.summary.adx14 ?? 'N/A'}`
  );

  // Stages 4, 5 & 6 run in parallel with strict per-feed timeout caps so no slow optional feed can cause a global timeout!
  emit('fundamentals', 'active', 'Retrieving financial statements & valuation ratios');
  emit('ml', 'active', 'Training Ridge, Random Forest & GBT out-of-sample models');
  emit('risk', 'active', 'Computing Beta, peer valuation matrix & live news sentiment');

  const fallbackFundamentals = {
    industry: null,
    businessSummary: null,
    website: null,
    fullTimeEmployees: null,
    sharesOutstanding: null,
    averageVolume: null,
    nextEarningsDate: null,
    marketCap: quote.marketCap,
    trailingPE: quote.trailingPE,
    forwardPE: null,
    eps: quote.eps,
    priceToBook: null,
    priceToSales: null,
    evToEbitda: null,
    pegRatio: null,
    dividendYieldPct: quote.dividendYieldPct,
    revenue: null,
    revenueGrowthPct: null,
    grossProfit: null,
    operatingIncome: null,
    netIncome: null,
    grossMarginPct: null,
    operatingMarginPct: null,
    profitMarginPct: null,
    totalAssets: null,
    totalLiabilities: null,
    totalDebt: null,
    shareholdersEquity: null,
    cashAndEquivalents: null,
    debtToEquity: null,
    operatingCashFlow: null,
    investingCashFlow: null,
    financingCashFlow: null,
    freeCashFlow: null,
    roePct: null,
    roaPct: null,
    roicPct: null,
    earningsGrowthPct: null,
    beta: null,
    annualFinancials: [],
    quarterlyFinancials: [],
    currency: quote.currency,
    availableFieldsCount: quote.marketCap ? 1 : 0,
    dataSource: quote.dataSource,
    note: 'Extended financial statement feed timed out or was omitted by upstream; core OHLCV & technical analysis remain live.',
  };

  const fundamentalsPromise = withCap(
    fetchStockFundamentals(quote).catch(() => fallbackFundamentals),
    6500,
    fallbackFundamentals
  ).then((f) => {
    emit(
      'fundamentals',
      'done',
      f.availableFieldsCount > 0
        ? `${f.availableFieldsCount} verified fundamental fields`
        : 'Limited statement coverage (labeled Not Available)'
    );
    return f;
  });

  const mlPromise = runMlPredictionPipeline(
    quote.symbol,
    quote.exchange,
    history,
    7,
    quote.currency
  )
    .catch((mlErr) => {
      console.warn('ML sub-pipeline skipped during analysis:', mlErr);
      return null;
    })
    .then((ml) => {
      emit(
        'ml',
        'done',
        ml ? `${ml.bestModel} validated (${ml.testSamples} test sessions)` : 'ML model unavailable'
      );
      return ml;
    });

  const newsPromise = withCap(
    fetchFinancialNews({
      query: `${quote.name} ${quote.symbol}`,
      ticker: quote.symbol,
      country: quote.country,
    }).catch(() => null),
    5500,
    null
  );

  // Wait for fundamentals first before peer relative valuation so stockPE is available, while ML & news run concurrently
  const fundamentals = await fundamentalsPromise;
  const [mlOutput, sectorContext, companyNews] = await Promise.all([
    mlPromise,
    withCap(
      fetchSectorAndPeersContext(quote, history, fundamentals).catch(() => null),
      6500,
      null
    ),
    newsPromise,
  ]);

  const effectiveBeta = fundamentals.beta ?? sectorContext?.calculatedBeta ?? null;
  emit(
    'risk',
    'done',
    `Vol ${technical.summary.annualizedVolatilityPct}% · Beta ${effectiveBeta ?? 'N/A'} · ${sectorContext?.peers?.length ?? 0} peers`
  );

  const enrichedQuote = {
    ...quote,
    marketCap: fundamentals.marketCap ?? quote.marketCap,
    trailingPE: fundamentals.trailingPE ?? quote.trailingPE,
    eps: fundamentals.eps ?? quote.eps,
    dividendYieldPct: fundamentals.dividendYieldPct ?? quote.dividendYieldPct,
  };

  const enrichedFundamentals = {
    ...fundamentals,
    beta: effectiveBeta,
  };

  const newsArticles = companyNews?.articles?.slice(0, 12) || [];
  const sentimentCounts = {
    positive: newsArticles.filter((a: any) => a.sentiment === 'Positive').length,
    negative: newsArticles.filter((a: any) => a.sentiment === 'Negative').length,
    neutral: newsArticles.filter((a: any) => a.sentiment === 'Neutral').length,
    headlineSample: newsArticles.slice(0, 4).map((a: any) => a.title),
  };

  const dataReliability = {
    marketData: 'live' as const,
    fundamentals: enrichedFundamentals.availableFieldsCount > 1 ? ('live' as const) : ('partial' as const),
    mlPipeline: mlOutput ? ('live' as const) : ('unavailable' as const),
    peersAndBenchmark: sectorContext ? ('live' as const) : ('partial' as const),
    companyNews: newsArticles.length > 0 ? ('live' as const) : ('partial' as const),
    generatedAt: new Date().toISOString(),
  };

  // Stage 7: Preparing the AI research report via Dual AI provider (Gemini -> OpenAI)
  emit('report', 'active', 'Synthesizing institutional AI brief (Gemini + OpenAI fallback)');
  let aiReport: AiStockAnalysisReport | null = null;
  let aiSynthesis: AiSynthesisEnvelope;

  try {
    aiReport = await generateAiStockAnalysis(
      enrichedQuote,
      technical.summary,
      mlOutput,
      enrichedFundamentals,
      newsArticles.length > 0 ? sentimentCounts : null
    );
    aiSynthesis = {
      status: aiReport.cached ? 'cached' : 'success',
      narrative: aiReport,
      provider: aiReport.providerLabel,
      model: aiReport.model,
      generated_at: aiReport.generatedAt,
      cached: aiReport.cached,
      stale: aiReport.stale,
      requestId: aiReport.requestId,
      providersTried: aiReport.providersTried,
    };
  } catch (aiErr: any) {
    const errMsg =
      aiErr?.message ||
      'AI synthesis is temporarily unavailable. Your quantitative analysis is still available.';
    emit('report', 'error', 'AI synthesis temporarily unavailable — quantitative metrics ready');
    aiSynthesis = {
      status: 'unavailable',
      narrative: null,
      provider: null,
      model: null,
      generated_at: null,
      cached: false,
      stale: false,
      requestId: aiErr instanceof AllAiProvidersFailedError ? aiErr.requestId : undefined,
      providersTried:
        aiErr instanceof AllAiProvidersFailedError ? aiErr.providersTried : undefined,
      error: errMsg,
      errorCode: 'AI_SERVICE_UNAVAILABLE',
    };
  }

  let savedRecordId: number | null = null;
  if (user && aiReport) {
    try {
      const saved = await saveAnalysisRecord({
        userId: user.id,
        symbol: enrichedQuote.symbol,
        exchange: enrichedQuote.exchange,
        country: enrichedQuote.country,
        currency: enrichedQuote.currency,
        companyName: enrichedQuote.name,
        currentPrice: enrichedQuote.price,
        decision: aiReport.decision,
        confidenceScore: aiReport.confidenceScore,
        riskLevel: aiReport.riskLevel,
        summary: aiReport.headline,
        indicatorsJson: JSON.stringify({
          rsi14: technical.summary.rsi14,
          trend: technical.summary.trend,
          macdBias: technical.summary.macd.bias,
          vwap: technical.summary.vwap,
          adx14: technical.summary.adx14,
          volatilityPct: technical.summary.annualizedVolatilityPct,
          riskScore: aiReport.riskScore,
        }),
        dataSource: enrichedQuote.dataSource,
        modelStatus: aiReport.modelStatus,
      });
      savedRecordId = saved.id;
    } catch (dbErr) {
      console.warn('Could not persist analysis record:', dbErr);
    }
  }

  if (aiReport) {
    emit(
      'report',
      'done',
      `Research verdict ready: ${aiReport.decision} (${aiReport.providerLabel} · ${aiReport.model})`
    );
  }

  return {
    researchType: 'analyze' as const,
    savedRecordId,
    quote: enrichedQuote,
    fundamentals: enrichedFundamentals,
    marketStatus: getExchangeMarketStatus(enrichedQuote.exchange),
    history: technical.series,
    technicalSummary: technical.summary,
    mlPipeline: mlOutput,
    mlSummary: mlOutput
      ? {
          bestModel: mlOutput.bestModel,
          engineSource: mlOutput.engineSource,
          horizonDays: mlOutput.horizonDays,
          bestMetrics:
            mlOutput.models.find((m) => m.modelName === mlOutput.bestModel) ||
            mlOutput.models[0],
        }
      : null,
    sectorContext,
    companyNews: {
      articles: newsArticles,
      sentimentSummary: sentimentCounts,
      dataSource: companyNews?.dataSource || 'Multi-Provider Financial News',
    },
    dataReliability: {
      ...dataReliability,
      aiSynthesis: aiSynthesis.status,
    },
    aiReport,
    aiSynthesis,
  };
}

apiRouter.get('/analysis/history', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const rows = await getUserAnalysisHistory(req.user!.id, 30);
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/analysis/stream', optionalAuth, async (req: AuthRequest, res) => {
  const symbol = String(req.query.symbol || '').trim();
  const exchange = typeof req.query.exchange === 'string' ? req.query.exchange : undefined;

  if (!symbol || symbol.length > 28) {
    return res.status(400).json({ error: 'Valid stock symbol is required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  const sendEvent = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const payload = await executeResearchPipeline(
      symbol,
      exchange,
      req.user,
      (stageId, status, detail) => {
        sendEvent('stage', { stageId, status, detail, timestamp: new Date().toISOString() });
      }
    );
    sendEvent('complete', payload);
  } catch (err: any) {
    sendEvent('error_payload', {
      error: err?.message || 'Unable to complete research analysis.',
      code: err?.code || 'ANALYSIS_FAILED',
      partialData: err?.partialData || null,
    });
  } finally {
    if (!closed) res.end();
  }
});

apiRouter.post('/analysis/run', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1, 'Stock symbol is required').max(28),
      exchange: exchangeSchema,
    });
    const { symbol, exchange } = schema.parse(req.body);
    const payload = await executeResearchPipeline(symbol, exchange, req.user);
    res.json(payload);
  } catch (error: any) {
    if (error?.partialData) {
      return res.status(error.statusCode || 503).json({
        error: error.message,
        code: error.code || 'AI_SERVICE_UNAVAILABLE',
        partialData: error.partialData,
      });
    }
    next(error);
  }
});

// Explicit Analyze Stock endpoint (workflow A)
apiRouter.post('/analysis/analyze', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1, 'Stock symbol is required').max(28),
      exchange: exchangeSchema,
    });
    const { symbol, exchange } = schema.parse(req.body);
    const payload = await executeResearchPipeline(symbol, exchange, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

// Fast, dedicated AI Narrative Regeneration endpoint for the Retry AI Synthesis button
apiRouter.post('/analysis/synthesize', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1, 'Stock symbol is required').max(28),
      exchange: exchangeSchema,
      bypassCache: z.boolean().optional().default(true),
      context: z
        .object({
          quote: z.any().optional(),
          technicalSummary: z.any().optional(),
          fundamentals: z.any().optional(),
          mlPipeline: z.any().optional(),
          sentimentSummary: z.any().optional(),
        })
        .optional(),
    });

    const parsed = schema.parse(req.body);
    const ex = parseGlobalExchange(parsed.exchange, undefined);

    let quote = parsed.context?.quote;
    let technicalSummary = parsed.context?.technicalSummary;
    let fundamentals = parsed.context?.fundamentals ?? null;
    let mlPipeline = parsed.context?.mlPipeline ?? null;
    let sentimentSummary = parsed.context?.sentimentSummary ?? null;

    // If caller didn't pass fresh quantitative context, fetch it cleanly on the backend
    if (!quote || !technicalSummary || !quote.symbol || typeof quote.price !== 'number') {
      const { quote: freshQuote, history } = await fetchStockChart(parsed.symbol, '2Y', ex);
      const tech = computeTechnicalAnalysis(history);
      quote = freshQuote;
      technicalSummary = tech.summary;
      const [fundRes, mlRes, newsRes] = await Promise.all([
        fetchStockFundamentals(freshQuote).catch(() => null),
        runMlPredictionPipeline(
          freshQuote.symbol,
          freshQuote.exchange,
          history,
          7,
          freshQuote.currency
        ).catch(() => null),
        fetchFinancialNews({
          query: `${freshQuote.name} ${freshQuote.symbol}`,
          ticker: freshQuote.symbol,
          country: freshQuote.country,
        }).catch(() => null),
      ]);
      fundamentals = fundRes;
      mlPipeline = mlRes;
      const arts = newsRes?.articles?.slice(0, 10) || [];
      if (arts.length > 0) {
        sentimentSummary = {
          positive: arts.filter((a) => a.sentiment === 'Positive').length,
          negative: arts.filter((a) => a.sentiment === 'Negative').length,
          neutral: arts.filter((a) => a.sentiment === 'Neutral').length,
          headlineSample: arts.slice(0, 4).map((a) => a.title),
        };
      }
    }

    try {
      const report = await generateAiStockAnalysis(
        quote,
        technicalSummary,
        mlPipeline,
        fundamentals,
        sentimentSummary,
        { bypassCache: parsed.bypassCache }
      );
      const envelope: AiSynthesisEnvelope = {
        status: report.cached ? 'cached' : 'success',
        narrative: report,
        provider: report.providerLabel,
        model: report.model,
        generated_at: report.generatedAt,
        cached: report.cached,
        stale: report.stale,
        requestId: report.requestId,
        providersTried: report.providersTried,
      };
      return res.json(envelope);
    } catch (aiErr: any) {
      const envelope: AiSynthesisEnvelope = {
        status: 'unavailable',
        narrative: null,
        provider: null,
        model: null,
        generated_at: null,
        cached: false,
        stale: false,
        requestId: aiErr instanceof AllAiProvidersFailedError ? aiErr.requestId : undefined,
        providersTried:
          aiErr instanceof AllAiProvidersFailedError ? aiErr.providersTried : undefined,
        error:
          aiErr?.message ||
          'AI synthesis is temporarily unavailable. Your quantitative analysis is still available.',
        errorCode: 'AI_SERVICE_UNAVAILABLE',
      };
      return res.status(aiErr?.statusCode === 429 ? 429 : 503).json(envelope);
    }
  } catch (error) {
    next(error);
  }
});

// Dedicated Evidence-First Reverse Research endpoint (workflow B)
apiRouter.post('/analysis/reverse-research', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1, 'Stock symbol is required').max(28),
      exchange: exchangeSchema,
      lookbackDays: z.number().int().min(20).max(252).optional().default(90),
      bypassCache: z.boolean().optional().default(false),
    });

    const parsed = schema.parse(req.body);
    const ex = parseGlobalExchange(parsed.exchange, undefined);

    const { quote, history } = await fetchStockChart(parsed.symbol, '1Y', ex);
    const technical = computeTechnicalAnalysis(history);

    const [fundamentals, newsFeed] = await Promise.all([
      fetchStockFundamentals(quote).catch(() => null),
      fetchFinancialNews({
        query: `${quote.name} ${quote.symbol}`,
        ticker: quote.symbol,
        country: quote.country,
        limit: 18,
      }).catch(() => null),
    ]);

    const investigation = await runReverseResearchInvestigation({
      quote,
      history,
      technical: technical.summary,
      fundamentals,
      newsArticles: newsFeed?.articles || [],
      lookbackDays: parsed.lookbackDays,
      bypassCache: parsed.bypassCache,
    });

    res.json({
      quote,
      fundamentals,
      technicalSummary: technical.summary,
      newsSource: newsFeed?.provider || 'Multi-Provider Financial News',
      investigation,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/analysis/save', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1).max(28),
      exchange: z.string().trim().min(1).max(20),
      country: z.string().trim().max(64).optional().default('United States'),
      currency: z.string().trim().max(12).optional().default('USD'),
      companyName: z.string().trim().min(1).max(160),
      currentPrice: z.number(),
      decision: z.string().trim().min(1).max(24),
      confidenceScore: z.number().min(0).max(100),
      riskLevel: z.string().trim().min(1).max(24),
      summary: z.string().trim().min(1).max(500),
      indicators: z.record(z.string(), z.unknown()).optional(),
      dataSource: z.string().trim().max(120).optional().default('Yahoo Finance'),
      modelStatus: z.string().trim().max(120).optional().default('Gemini Live'),
    });
    const p = schema.parse(req.body);
    const saved = await saveAnalysisRecord({
      userId: req.user!.id,
      symbol: p.symbol.toUpperCase(),
      exchange: normalizeExchangeCode(p.exchange),
      country: p.country,
      currency: p.currency.toUpperCase(),
      companyName: p.companyName,
      currentPrice: p.currentPrice,
      decision: p.decision,
      confidenceScore: Math.round(p.confidenceScore),
      riskLevel: p.riskLevel,
      summary: p.summary,
      indicatorsJson: JSON.stringify(p.indicators || {}),
      dataSource: p.dataSource,
      modelStatus: p.modelStatus,
    });
    res.status(201).json({ saved });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 6. ML PREDICTION PIPELINE & HISTORY (/api/predictions)
// ============================================================================
apiRouter.get('/predictions/history', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const rows = await getUserPredictionHistory(req.user?.id, 30);
    res.json({
      items: rows,
      scope: req.user ? 'user' : 'recent-public',
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/predictions/run', optionalAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1).max(28),
      exchange: exchangeSchema,
      horizonDays: z.number().int().min(1).max(180).optional().default(7),
    });
    const { symbol, exchange, horizonDays } = schema.parse(req.body);

    const tf: TimeframeKey = horizonDays > 30 ? '2Y' : '1Y';
    const { quote, history } = await fetchStockChart(symbol, tf, parseGlobalExchange(exchange));
    const pipeline = await runMlPredictionPipeline(
      quote.symbol,
      quote.exchange,
      history,
      horizonDays,
      quote.currency
    );

    const winner =
      pipeline.models.find((m) => m.modelName === pipeline.bestModel) || pipeline.models[0];

    let savedId: number | null = null;
    try {
      const saved = await savePredictionRecord({
        userId: req.user?.id ?? null,
        symbol: quote.symbol,
        exchange: quote.exchange,
        currency: quote.currency,
        horizonDays,
        modelName: winner.modelName,
        modelVersion: winner.modelVersion,
        currentPrice: quote.price,
        predictedPrice: winner.predictedHorizonPrice,
        expectedReturnPct: winner.expectedReturnPct,
        mae: winner.mae,
        rmse: winner.rmse,
        mape: winner.mape,
        directionalAccuracy: winner.directionalAccuracy,
        metricsJson: JSON.stringify({
          r2: winner.r2,
          backtest: winner.backtest,
          trainSamples: pipeline.trainSamples,
          testSamples: pipeline.testSamples,
          engineSource: pipeline.engineSource,
        }),
      });
      savedId = saved.id;
    } catch (dbErr) {
      console.warn('Could not persist prediction history:', dbErr);
    }

    res.json({
      savedId,
      quote,
      pipeline,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 7. GLOBAL MULTI-CURRENCY PORTFOLIO MANAGEMENT (/api/portfolio)
// ============================================================================
const holdingSchema = z.object({
  symbol: z.string().trim().min(1).max(28),
  exchange: exchangeSchema,
  companyName: z.string().trim().max(120).optional(),
  sector: z.string().trim().max(60).optional(),
  country: z.string().trim().max(64).optional(),
  currency: z.string().trim().max(12).optional(),
  quantity: z.number().positive('Quantity must be greater than zero'),
  avgBuyPrice: z.number().positive('Purchase price must be greater than zero'),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  notes: z.string().max(240).optional(),
});

apiRouter.get('/portfolio', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const requestedBase =
      typeof req.query.baseCurrency === 'string' && req.query.baseCurrency.trim()
        ? req.query.baseCurrency.trim().toUpperCase()
        : 'INR';

    const [holdings, fxSnapshot] = await Promise.all([
      getUserPortfolio(req.user!.id),
      getFxRates(requestedBase),
    ]);

    const baseCurrency = fxSnapshot.base;

    const enriched = await Promise.all(
      holdings.map(async (h) => {
        const nativeCurrency = (h.currency || 'INR').toUpperCase();
        const investedValue = Number((h.quantity * h.avgBuyPrice).toFixed(2));
        try {
          const quote = await fetchStockQuote(h.symbol, parseGlobalExchange(h.exchange, 'NSE'));
          const effectiveCurrency = (quote.currency || nativeCurrency).toUpperCase();
          const currentValue = Number((h.quantity * quote.price).toFixed(2));
          const pnl = Number((currentValue - investedValue).toFixed(2));
          const pnlPct = investedValue > 0 ? Number(((pnl / investedValue) * 100).toFixed(2)) : 0;
          const dayPnl = Number((h.quantity * quote.change).toFixed(2));

          const invConv = convertCurrencyAmount(investedValue, effectiveCurrency, baseCurrency, fxSnapshot);
          const curConv = convertCurrencyAmount(currentValue, effectiveCurrency, baseCurrency, fxSnapshot);
          const dayConv = convertCurrencyAmount(dayPnl, effectiveCurrency, baseCurrency, fxSnapshot);

          return {
            ...h,
            country: h.country || quote.country,
            currency: effectiveCurrency,
            livePrice: quote.price,
            dayChangePct: quote.changePercent,
            investedValue,
            currentValue,
            pnl,
            pnlPct,
            dayPnl,
            fxRateToBase: curConv.rate,
            investedValueBase: invConv.converted,
            currentValueBase: curConv.converted,
            pnlBase:
              curConv.converted !== null && invConv.converted !== null
                ? Number((curConv.converted - invConv.converted).toFixed(2))
                : null,
            dayPnlBase: dayConv.converted,
            quoteStatus: 'live' as const,
            lastUpdated: quote.fetchedAt,
          };
        } catch {
          const invConv = convertCurrencyAmount(investedValue, nativeCurrency, baseCurrency, fxSnapshot);
          return {
            ...h,
            country: h.country || 'India',
            currency: nativeCurrency,
            livePrice: null,
            dayChangePct: null,
            investedValue,
            currentValue: investedValue,
            pnl: 0,
            pnlPct: 0,
            dayPnl: 0,
            fxRateToBase: invConv.rate,
            investedValueBase: invConv.converted,
            currentValueBase: invConv.converted,
            pnlBase: 0,
            dayPnlBase: 0,
            quoteStatus: 'unavailable' as const,
            lastUpdated: null,
          };
        }
      })
    );

    const allConverted = enriched.every(
      (h) => h.investedValueBase !== null && h.currentValueBase !== null
    );

    const totalInvestment = Number(
      enriched
        .reduce((sum, h) => sum + (h.investedValueBase ?? h.investedValue), 0)
        .toFixed(2)
    );
    const currentValue = Number(
      enriched
        .reduce((sum, h) => sum + (h.currentValueBase ?? h.currentValue), 0)
        .toFixed(2)
    );
    const totalPnl = Number((currentValue - totalInvestment).toFixed(2));
    const totalReturnPct =
      totalInvestment > 0 ? Number(((totalPnl / totalInvestment) * 100).toFixed(2)) : 0;
    const totalDayPnl = Number(
      enriched.reduce((sum, h) => sum + (h.dayPnlBase ?? h.dayPnl), 0).toFixed(2)
    );

    const allocationByStock = enriched.map((h) => {
      const v = h.currentValueBase ?? h.currentValue;
      return {
        symbol: `${h.symbol} (${h.exchange})`,
        value: Number(v.toFixed(2)),
        weightPct: currentValue > 0 ? Number(((v / currentValue) * 100).toFixed(2)) : 0,
      };
    });

    const sectorMap = new Map<string, number>();
    const countryMap = new Map<string, number>();
    const currencyMap = new Map<string, number>();

    for (const h of enriched) {
      const v = h.currentValueBase ?? h.currentValue;
      sectorMap.set(h.sector, (sectorMap.get(h.sector) || 0) + v);
      countryMap.set(h.country, (countryMap.get(h.country) || 0) + v);
      currencyMap.set(h.currency, (currencyMap.get(h.currency) || 0) + v);
    }

    const toBreakdown = <K extends string>(map: Map<string, number>, keyName: K) =>
      Array.from(map.entries())
        .map(([k, value]) => ({
          [keyName]: k,
          value: Number(value.toFixed(2)),
          weightPct: currentValue > 0 ? Number(((value / currentValue) * 100).toFixed(2)) : 0,
        }))
        .sort((a, b) => b.value - a.value);

    const allocationBySector = toBreakdown(sectorMap, 'sector');
    const allocationByCountry = toBreakdown(countryMap, 'country');
    const allocationByCurrency = toBreakdown(currencyMap, 'currency');

    // Build real 30-day portfolio valuation history converted to baseCurrency
    let performanceHistory: Array<{ date: string; value: number; invested: number }> = [];
    if (holdings.length > 0) {
      const seriesResults = await Promise.allSettled(
        holdings.slice(0, 12).map(async (h) => {
          const { history, quote } = await fetchStockChart(
            h.symbol,
            '1M',
            parseGlobalExchange(h.exchange, 'NSE')
          );
          const conv = convertCurrencyAmount(
            1,
            quote.currency || h.currency || 'INR',
            baseCurrency,
            fxSnapshot
          );
          return { holding: h, history, fxMult: conv.rate ?? 1 };
        })
      );
      const validSeries = seriesResults
        .filter(
          (
            r
          ): r is PromiseFulfilledResult<{
            holding: (typeof holdings)[0];
            history: any[];
            fxMult: number;
          }> => r.status === 'fulfilled'
        )
        .map((r) => r.value);

      if (validSeries.length > 0) {
        const dateSet = new Set<string>();
        validSeries.forEach((s) => s.history.forEach((b) => dateSet.add(b.date)));
        const dates = Array.from(dateSet).sort();

        performanceHistory = dates.map((d) => {
          let totalVal = 0;
          for (const s of validSeries) {
            const bar = s.history.find((b) => b.date === d) || s.history[s.history.length - 1];
            totalVal += (bar?.close ?? s.holding.avgBuyPrice) * s.holding.quantity * s.fxMult;
          }
          return {
            date: d,
            value: Number(totalVal.toFixed(2)),
            invested: totalInvestment,
          };
        });
      }
    }

    res.json({
      baseCurrency,
      fxSnapshot,
      allConverted,
      holdings: enriched,
      summary: {
        baseCurrency,
        totalInvestment,
        currentValue,
        totalPnl,
        totalReturnPct,
        totalDayPnl,
        holdingsCount: enriched.length,
        countriesCount: countryMap.size,
        currenciesCount: currencyMap.size,
      },
      allocationByStock,
      allocationBySector,
      allocationByCountry,
      allocationByCurrency,
      performanceHistory,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/portfolio', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const parsed = holdingSchema.parse(req.body);
    const resolved = resolveGlobalSymbol(parsed.symbol, parsed.exchange);
    let companyName = parsed.companyName || resolved.name;
    let sector = parsed.sector || resolved.sector;
    let country = parsed.country || resolved.country;
    let currency = (parsed.currency || resolved.currency).toUpperCase();

    try {
      const q = await fetchStockQuote(resolved.yahooSymbol, resolved.exchange);
      companyName = q.name;
      sector = q.sector;
      country = q.country;
      currency = q.currency;
    } catch {
      // Allow adding even if market data temporarily unavailable
    }

    const created = await addPortfolioHolding({
      userId: req.user!.id,
      symbol: resolved.cleanSymbol,
      exchange: resolved.exchange,
      country,
      currency,
      companyName,
      sector,
      quantity: parsed.quantity,
      avgBuyPrice: parsed.avgBuyPrice,
      purchaseDate: parsed.purchaseDate,
      notes: parsed.notes,
    });
    res.status(201).json({ holding: created });
  } catch (error) {
    next(error);
  }
});

apiRouter.put('/portfolio/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid holding ID.' });
    }
    const updateSchema = z.object({
      quantity: z.number().positive(),
      avgBuyPrice: z.number().positive(),
      purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().max(240).optional(),
    });
    const parsed = updateSchema.parse(req.body);
    const updated = await updatePortfolioHolding(req.user!.id, id, parsed);
    if (!updated) {
      return res.status(404).json({ error: 'Holding not found.' });
    }
    res.json({ holding: updated });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/portfolio/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid holding ID.' });
    }
    const deleted = await deletePortfolioHolding(req.user!.id, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Holding not found.' });
    }
    res.json({ deletedId: id });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 8. GLOBAL MULTI-WATCHLIST (/api/watchlist)
// ============================================================================
apiRouter.get('/watchlist', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const listName = typeof req.query.listName === 'string' ? req.query.listName : undefined;
    const [allItems, latestAiMap] = await Promise.all([
      getUserWatchlist(req.user!.id),
      getLatestAnalysisBySymbolMap(120),
    ]);

    const listNames = Array.from(
      new Set(['Core Watchlist', ...allItems.map((i) => i.listName || 'Core Watchlist')])
    );

    const items =
      listName && listName !== 'ALL'
        ? allItems.filter((i) => (i.listName || 'Core Watchlist') === listName)
        : allItems;

    const enriched = await Promise.all(
      items.map(async (item) => {
        const aiRec = latestAiMap.get(`${item.symbol}:${item.exchange}`) || null;
        try {
          const quote = await fetchStockQuote(
            item.symbol,
            parseGlobalExchange(item.exchange, 'NSE')
          );
          return {
            ...item,
            listName: item.listName || 'Core Watchlist',
            country: item.country || quote.country,
            currency: item.currency || quote.currency,
            price: quote.price,
            change: quote.change,
            changePercent: quote.changePercent,
            dayHigh: quote.dayHigh,
            dayLow: quote.dayLow,
            volume: quote.volume,
            latestAiDecision: aiRec?.decision ?? null,
            latestAiConfidence: aiRec?.confidenceScore ?? null,
            quoteStatus: 'live' as const,
            lastUpdated: quote.fetchedAt,
          };
        } catch {
          return {
            ...item,
            listName: item.listName || 'Core Watchlist',
            country: item.country || 'India',
            currency: item.currency || 'INR',
            price: null,
            change: null,
            changePercent: null,
            dayHigh: null,
            dayLow: null,
            volume: null,
            latestAiDecision: aiRec?.decision ?? null,
            latestAiConfidence: aiRec?.confidenceScore ?? null,
            quoteStatus: 'unavailable' as const,
            lastUpdated: null,
          };
        }
      })
    );
    res.json({ items: enriched, listNames, lastUpdated: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/watchlist', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const schema = z.object({
      symbol: z.string().trim().min(1).max(28),
      exchange: exchangeSchema,
      listName: z.string().trim().min(1).max(60).optional().default('Core Watchlist'),
      targetPrice: z.number().positive().nullable().optional(),
      notes: z.string().max(240).optional(),
    });
    const parsed = schema.parse(req.body);
    const resolved = resolveGlobalSymbol(parsed.symbol, parsed.exchange);

    let companyName = resolved.name;
    let sector = resolved.sector;
    let country = resolved.country;
    let currency = resolved.currency;
    try {
      const q = await fetchStockQuote(resolved.yahooSymbol, resolved.exchange);
      companyName = q.name;
      sector = q.sector;
      country = q.country;
      currency = q.currency;
    } catch {
      // Allow adding even if upstream quote temporarily unavailable
    }

    const created = await addWatchlistItem({
      userId: req.user!.id,
      listName: parsed.listName,
      symbol: resolved.cleanSymbol,
      exchange: resolved.exchange,
      country,
      currency,
      companyName,
      sector,
      targetPrice: parsed.targetPrice ?? null,
      notes: parsed.notes,
    });
    res.status(201).json({ item: created });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/watchlist/:id', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid watchlist item ID.' });
    }
    const deleted = await deleteWatchlistItem(req.user!.id, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Watchlist item not found.' });
    }
    res.json({ deletedId: id });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 9. GLOBAL FINANCIAL NEWS & SENTIMENT (/api/news & /api/news/health)
// ============================================================================
apiRouter.get('/news/health', (_req, res) => {
  res.json(getNewsProvidersHealth());
});

apiRouter.get('/news', async (req, res, next) => {
  try {
    const query =
      typeof req.query.q === 'string'
        ? req.query.q
        : typeof req.query.query === 'string'
          ? req.query.query
          : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : 'Global';
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const ticker = typeof req.query.ticker === 'string' ? req.query.ticker : undefined;
    const sentiment = typeof req.query.sentiment === 'string' ? req.query.sentiment : undefined;
    const refresh = req.query.refresh === 'true' || req.query.refresh === '1';
    const limitRaw = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;

    const feed = await fetchFinancialNews({
      query,
      category,
      country,
      ticker,
      sentiment,
      refresh,
      limit,
    });
    res.json(feed);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 10. GLOBAL RISK MANAGEMENT (/api/risk)
// ============================================================================
apiRouter.post('/risk/calculate', async (req, res, next) => {
  try {
    const schema = z.object({
      accountCapital: z.number().positive(),
      riskPercentPerTrade: z.number().positive().max(25),
      entryPrice: z.number().positive(),
      stopLossPrice: z.number().positive(),
      targetPrice: z.number().positive(),
      currency: z.string().trim().max(12).optional(),
      symbol: z.string().trim().max(28).optional(),
      exchange: exchangeSchema,
    });
    const parsed = schema.parse(req.body);

    let atr: number | undefined;
    let volatilityPct: number | null = null;
    let maxDrawdownPct: number | null = null;
    let sharpeRatio: number | null = null;
    let detectedCurrency = (parsed.currency || 'USD').toUpperCase();

    if (parsed.symbol) {
      try {
        const { quote, history } = await fetchStockChart(
          parsed.symbol,
          '6M',
          parseGlobalExchange(parsed.exchange)
        );
        const tech = computeTechnicalAnalysis(history);
        atr = tech.summary.atr14 ?? undefined;
        volatilityPct = tech.summary.annualizedVolatilityPct;
        maxDrawdownPct = tech.summary.maxDrawdownPct;
        sharpeRatio = tech.summary.sharpeRatio;
        if (!parsed.currency) detectedCurrency = quote.currency;
      } catch {
        // Proceed with pure trade calculation if symbol ATR unavailable
      }
    }

    const result = calculateTradeRisk({
      accountCapital: parsed.accountCapital,
      riskPercentPerTrade: parsed.riskPercentPerTrade,
      entryPrice: parsed.entryPrice,
      stopLossPrice: parsed.stopLossPrice,
      targetPrice: parsed.targetPrice,
      currency: detectedCurrency,
      atr,
    });

    res.json({
      ...result,
      symbolMetrics: parsed.symbol
        ? {
            symbol: parsed.symbol.toUpperCase(),
            currency: detectedCurrency,
            atr14: atr ?? null,
            annualizedVolatilityPct: volatilityPct,
            maxDrawdownPct,
            sharpeRatio,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/risk/portfolio', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const requestedBase =
      typeof req.query.baseCurrency === 'string' && req.query.baseCurrency.trim()
        ? req.query.baseCurrency.trim().toUpperCase()
        : 'USD';

    const [holdings, fxSnapshot, benchmarkChart] = await Promise.all([
      getUserPortfolio(req.user!.id),
      getFxRates(requestedBase),
      fetchStockChart('^GSPC', '6M', 'NYSE').catch(() => null),
    ]);

    const benchmarkReturns = benchmarkChart
      ? extractDailyReturns(benchmarkChart.history)
      : undefined;

    const enriched = await Promise.all(
      holdings.map(async (h) => {
        const nativeCur = (h.currency || 'INR').toUpperCase();
        try {
          const { quote, history } = await fetchStockChart(
            h.symbol,
            '6M',
            parseGlobalExchange(h.exchange, 'NSE')
          );
          const tech = computeTechnicalAnalysis(history);
          const rawVal = h.quantity * quote.price;
          const conv = convertCurrencyAmount(rawVal, quote.currency || nativeCur, fxSnapshot.base, fxSnapshot);
          return {
            symbol: h.symbol,
            exchange: h.exchange,
            country: h.country || quote.country,
            currency: quote.currency || nativeCur,
            sector: h.sector,
            currentValue: conv.converted ?? rawVal,
            volatilityPct: tech.summary.annualizedVolatilityPct,
            maxDrawdownPct: tech.summary.maxDrawdownPct,
            dailyReturns: extractDailyReturns(history),
          };
        } catch {
          const rawVal = h.quantity * h.avgBuyPrice;
          const conv = convertCurrencyAmount(rawVal, nativeCur, fxSnapshot.base, fxSnapshot);
          return {
            symbol: h.symbol,
            exchange: h.exchange,
            country: h.country || 'India',
            currency: nativeCur,
            sector: h.sector,
            currentValue: conv.converted ?? rawVal,
          };
        }
      })
    );

    const report = analyzePortfolioDiversification(enriched, {
      baseCurrency: fxSnapshot.base,
      benchmarkReturns,
      benchmarkName: 'S&P 500 (^GSPC)',
    });
    res.json({
      ...report,
      fxSource: fxSnapshot.source,
      fxFetchedAt: fxSnapshot.fetchedAt,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// 11. ADMIN DASHBOARD (/api/admin)
// ============================================================================
apiRouter.get('/admin/overview', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response, next) => {
  try {
    const [stats, diagnostics] = await Promise.all([
      getAdminStats(),
      Promise.resolve(getEnvDiagnostics()),
    ]);

    let pythonServiceReachable = false;
    if (env.analysisServiceUrl) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3500);
      try {
        const r = await fetch(`${env.analysisServiceUrl}/health`, { signal: controller.signal });
        pythonServiceReachable = r.ok;
      } catch {
        pythonServiceReachable = false;
      } finally {
        clearTimeout(t);
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      database: {
        status: stats.dbStatus,
        latencyMs: stats.dbLatencyMs,
      },
      services: {
        nodeApi: 'healthy',
        geminiAi: env.geminiApiKey ? 'configured' : 'missing_key',
        mlEngine: pythonServiceReachable ? 'python-fastapi' : 'builtin-quant-ml',
        externalPythonConfigured: Boolean(env.analysisServiceUrl),
        externalPythonReachable: pythonServiceReachable,
        marketDataProvider: getActiveProviderInfo().activeProvider,
        fxRatesProvider: 'ExchangeRate-API + Yahoo Finance FX Fallback',
      },
      models: [
        { name: 'Linear Regression (Ridge L2)', version: 'v2.0-global-ridge', status: 'Ready' },
        { name: 'Random Forest Regressor', version: 'v2.0-global-rf', status: 'Ready' },
        { name: 'Gradient Boosted Trees', version: 'v2.0-global-gbt', status: 'Ready' },
        {
          name: 'Gemini 4 Hydrogen Synthesis',
          version: 'gemini-4-hydrogen',
          status: env.geminiApiKey ? 'Active' : 'API Key Missing',
        },
      ],
      counts: stats.counts,
      requests: stats.requests,
      recentUsers: stats.recentUsers,
      recentErrors: stats.recentErrors,
      environment: diagnostics,
    });
  } catch (error) {
    next(error);
  }
});
