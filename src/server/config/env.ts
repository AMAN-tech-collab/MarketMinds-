import crypto from 'crypto';

const ephemeralJwtSecret = crypto.randomBytes(32).toString('hex');

function parseCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === flag && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

function resolvePort(): number {
  const raw = parseCliArg('--port') ?? process.env.PORT ?? '3000';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 3000;
  }
  return parsed;
}

function resolveHost(): string {
  return (parseCliArg('--host') ?? process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0';
}

export const env = {
  port: resolvePort(),
  host: resolveHost(),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || '',
  appUrl: process.env.APP_URL || '',
  analysisServiceUrl: (process.env.ANALYSIS_SERVICE_URL || '').trim().replace(/\/+$/, ''),
  aiPrimaryProvider: (
    process.env.AI_PRIMARY_PROVIDER || 'gemini'
  ).trim().toLowerCase() as 'gemini' | 'openai',
  aiFallbackProvider: (
    process.env.AI_FALLBACK_PROVIDER || 'openai'
  ).trim().toLowerCase() as 'gemini' | 'openai' | 'none',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-4-hydrogen').trim() || 'gemini-4-hydrogen',
  geminiFallbackModel:
    (process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite').trim() || 'gemini-3.1-flash-lite',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
  aiRequestTimeoutMs: Math.min(
    60_000,
    Math.max(5_000, Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '30000', 10) || 30_000)
  ),
  marketDataProvider: (process.env.MARKET_DATA_PROVIDER || 'yahoo-global').trim().toLowerCase(),
  alphaVantageApiKey: process.env.ALPHAVANTAGE_API_KEY || '',
  finnhubApiKey: process.env.FINNHUB_API_KEY || '',
  marketauxApiKey: process.env.MARKETAUX_API_KEY || '',
  gnewsApiKey: process.env.GNEWS_API_KEY || '',
  newsCacheTtlMs: Math.max(
    30_000,
    Number.parseInt(process.env.NEWS_CACHE_TTL_MS || '180000', 10) || 180_000
  ),
  newsStaleTtlMs: Math.max(
    300_000,
    Number.parseInt(process.env.NEWS_STALE_TTL_MS || '86400000', 10) || 86_400_000
  ),
  newsRequestTimeoutMs: Math.min(
    15_000,
    Math.max(2_000, Number.parseInt(process.env.NEWS_REQUEST_TIMEOUT_MS || '7000', 10) || 7_000)
  ),
  jwtSecret: process.env.JWT_SECRET || ephemeralJwtSecret,
  jwtSecretIsEphemeral: !process.env.JWT_SECRET,
  adminSetupPasscode: process.env.ADMIN_SETUP_PASSCODE || '',
  ownerAdminEmail: 'amankumarroy548@gmail.com',
  sqlConfigured: Boolean(
    process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME
  ),
};

export function getEnvDiagnostics() {
  return {
    port: env.port,
    host: env.host,
    nodeEnv: env.nodeEnv,
    aiPrimaryProvider: env.aiPrimaryProvider,
    aiFallbackProvider: env.aiFallbackProvider,
    geminiConfigured: Boolean(env.geminiApiKey),
    geminiModel: env.geminiModel,
    geminiFallbackModel: env.geminiFallbackModel,
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiModel: env.openaiModel,
    aiRequestTimeoutMs: env.aiRequestTimeoutMs,
    externalAnalysisServiceConfigured: Boolean(env.analysisServiceUrl),
    databaseConfigured: env.sqlConfigured,
    jwtSecretConfigured: !env.jwtSecretIsEphemeral,
    corsOriginConfigured: Boolean(env.clientOrigin),
    marketDataProvider: env.marketDataProvider,
    optionalProvidersConfigured: {
      alphaVantage: Boolean(env.alphaVantageApiKey),
      finnhub: Boolean(env.finnhubApiKey),
      marketaux: Boolean(env.marketauxApiKey),
      gnews: Boolean(env.gnewsApiKey),
    },
    warnings: [
      !env.geminiApiKey && !env.openaiApiKey
        ? 'Neither GEMINI_API_KEY nor OPENAI_API_KEY is set; AI synthesis will report unavailable.'
        : null,
      !env.analysisServiceUrl
        ? 'ANALYSIS_SERVICE_URL is not set; using built-in quantitative ML engine.'
        : null,
      env.jwtSecretIsEphemeral && env.nodeEnv === 'production'
        ? 'JWT_SECRET is not explicitly configured in production; using ephemeral runtime secret.'
        : null,
    ].filter(Boolean) as string[],
  };
}
