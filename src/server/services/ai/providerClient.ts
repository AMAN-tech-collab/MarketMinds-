import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { env } from '../../config/env.ts';

export type AiProviderId = 'gemini' | 'openai';

export type AiErrorCode =
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_API_KEY'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'MALFORMED_RESPONSE'
  | 'EMPTY_RESPONSE'
  | 'CIRCUIT_OPEN'
  | 'NOT_CONFIGURED'
  | 'NETWORK_ERROR';

export class AiProviderError extends Error {
  readonly provider: AiProviderId;
  readonly model: string;
  readonly code: AiErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    opts: {
      provider: AiProviderId;
      model: string;
      code: AiErrorCode;
      statusCode?: number;
      retryable?: boolean;
      retryAfterMs?: number;
    }
  ) {
    super(message);
    this.name = 'AiProviderError';
    this.provider = opts.provider;
    this.model = opts.model;
    this.code = opts.code;
    this.statusCode = opts.statusCode ?? 503;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export interface AiProviderAttempt {
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  errorCode?: AiErrorCode;
  errorMessage?: string;
  circuitOpen?: boolean;
}

export interface AiCandidate {
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  thinkingLevel?: ThinkingLevel;
}

export interface AiExecutionResult<T> {
  data: T;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  generatedAt: string;
  cached: boolean;
  stale: boolean;
  requestId: string;
  latencyMs: number;
  providersTried: AiProviderAttempt[];
}

export interface AiModelHealthSnapshot {
  key: string;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  configured: boolean;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  openUntil: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: AiErrorCode | null;
  lastErrorMessage: string | null;
  avgLatencyMs: number | null;
  totalRequests: number;
  totalFailures: number;
}

interface BreakerEntry {
  key: string;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  openUntilMs: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: AiErrorCode | null;
  lastErrorMessage: string | null;
  totalLatencyMs: number;
  latencySamples: number;
  totalRequests: number;
  totalFailures: number;
}

interface CachedNarrativeEntry {
  data: unknown;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  generatedAt: string;
  cachedAtMs: number;
  freshUntilMs: number;
  staleUntilMs: number;
}

const breakerMap = new Map<string, BreakerEntry>();
const narrativeCache = new Map<string, CachedNarrativeEntry>();
const inflightAiTasks = new Map<string, Promise<AiExecutionResult<any>>>();

const FRESH_CACHE_TTL_MS = 10 * 60_000; // 10 minutes fresh
const STALE_CACHE_TTL_MS = 6 * 60 * 60_000; // 6 hours stale fallback
const TRANSIENT_COOLDOWN_MS = 60_000;
const RATE_LIMIT_COOLDOWN_MS = 90_000;
const AUTH_COOLDOWN_MS = 300_000;

function breakerKey(provider: AiProviderId, model: string): string {
  return `${provider}:${model}`;
}

function ensureBreaker(candidate: AiCandidate): BreakerEntry {
  const key = breakerKey(candidate.provider, candidate.model);
  let entry = breakerMap.get(key);
  if (!entry) {
    entry = {
      key,
      provider: candidate.provider,
      providerLabel: candidate.providerLabel,
      model: candidate.model,
      state: 'CLOSED',
      consecutiveFailures: 0,
      openUntilMs: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      totalLatencyMs: 0,
      latencySamples: 0,
      totalRequests: 0,
      totalFailures: 0,
    };
    breakerMap.set(key, entry);
  }
  return entry;
}

function canExecuteCandidate(candidate: AiCandidate): boolean {
  const entry = ensureBreaker(candidate);
  if (entry.state === 'OPEN') {
    if (entry.openUntilMs !== null && Date.now() >= entry.openUntilMs) {
      entry.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }
  return true;
}

function recordCandidateSuccess(candidate: AiCandidate, latencyMs: number): void {
  const entry = ensureBreaker(candidate);
  entry.state = 'CLOSED';
  entry.consecutiveFailures = 0;
  entry.openUntilMs = null;
  entry.lastSuccessAt = new Date().toISOString();
  entry.totalRequests += 1;
  entry.totalLatencyMs += latencyMs;
  entry.latencySamples += 1;
}

function recordCandidateFailure(
  candidate: AiCandidate,
  err: AiProviderError,
  latencyMs: number
): void {
  const entry = ensureBreaker(candidate);
  entry.totalRequests += 1;
  entry.totalFailures += 1;
  entry.totalLatencyMs += latencyMs;
  entry.latencySamples += 1;
  entry.lastErrorAt = new Date().toISOString();
  entry.lastErrorCode = err.code;
  entry.lastErrorMessage = err.message;
  entry.consecutiveFailures += 1;

  if (err.code === 'INVALID_API_KEY' || err.code === 'FORBIDDEN') {
    entry.state = 'OPEN';
    entry.openUntilMs = Date.now() + AUTH_COOLDOWN_MS;
    return;
  }
  if (err.code === 'RATE_LIMITED') {
    entry.state = 'OPEN';
    entry.openUntilMs = Date.now() + (err.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS);
    return;
  }
  if (entry.consecutiveFailures >= 2 || entry.state === 'HALF_OPEN') {
    entry.state = 'OPEN';
    entry.openUntilMs = Date.now() + (err.retryAfterMs ?? TRANSIENT_COOLDOWN_MS);
  }
}

function parseRetryAfterMs(rawHeader: string | null | undefined): number | undefined {
  if (!rawHeader) return undefined;
  const secs = Number(rawHeader);
  if (Number.isFinite(secs) && secs > 0) {
    return Math.min(300_000, Math.max(5_000, Math.round(secs * 1000)));
  }
  const ts = Date.parse(rawHeader);
  if (!Number.isNaN(ts)) {
    const diff = ts - Date.now();
    if (diff > 0) return Math.min(300_000, Math.max(5_000, diff));
  }
  return undefined;
}

export function classifyProviderError(
  err: any,
  provider: AiProviderId,
  model: string
): AiProviderError {
  if (err instanceof AiProviderError) return err;

  const raw = String(err?.message || err || 'Unknown AI provider error');
  let parsedMsg = raw;
  let status = Number(err?.status || err?.statusCode || err?.code || 0);

  try {
    if (raw.trim().startsWith('{')) {
      const obj = JSON.parse(raw);
      if (obj?.error?.message) parsedMsg = String(obj.error.message);
      if (obj?.error?.code && Number.isFinite(Number(obj.error.code))) {
        status = Number(obj.error.code);
      }
    }
  } catch {
    // keep raw message
  }

  const upper = parsedMsg.toUpperCase();
  const providerName = provider === 'gemini' ? 'Google Gemini' : 'OpenAI';

  if (
    err?.name === 'AbortError' ||
    upper.includes('TIMED OUT') ||
    upper.includes('TIMEOUT') ||
    upper.includes('ABORTED')
  ) {
    return new AiProviderError(`${providerName} (${model}) request timed out.`, {
      provider,
      model,
      code: 'TIMEOUT',
      statusCode: 504,
      retryable: true,
    });
  }

  if (
    status === 401 ||
    upper.includes('API_KEY_INVALID') ||
    upper.includes('INVALID_API_KEY') ||
    upper.includes('INCORRECT API KEY')
  ) {
    return new AiProviderError(
      `${providerName} API key is invalid or unauthorized. Verify server environment configuration.`,
      {
        provider,
        model,
        code: 'INVALID_API_KEY',
        statusCode: 401,
        retryable: false,
      }
    );
  }

  if (status === 403 || upper.includes('PERMISSION_DENIED')) {
    return new AiProviderError(
      `${providerName} (${model}) rejected permissions or access quota.`,
      {
        provider,
        model,
        code: 'FORBIDDEN',
        statusCode: 403,
        retryable: false,
      }
    );
  }

  if (
    status === 429 ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('RATE_LIMIT') ||
    upper.includes('QUOTA')
  ) {
    return new AiProviderError(
      `${providerName} (${model}) rate limit or quota reached.`,
      {
        provider,
        model,
        code: 'RATE_LIMITED',
        statusCode: 429,
        retryable: false, // Do NOT hammer a rate-limited model; fail over immediately!
      }
    );
  }

  if (
    status === 503 ||
    status === 502 ||
    status === 500 ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('HIGH DEMAND') ||
    upper.includes('OVERLOADED')
  ) {
    return new AiProviderError(
      `${providerName} (${model}) is temporarily experiencing high demand (HTTP ${status || 503}).`,
      {
        provider,
        model,
        code: 'SERVICE_UNAVAILABLE',
        statusCode: status || 503,
        retryable: true,
      }
    );
  }

  if (status === 400 || status === 404 || upper.includes('NOT_FOUND')) {
    return new AiProviderError(
      `${providerName} (${model}) rejected the request or model identifier (HTTP ${status || 400}).`,
      {
        provider,
        model,
        code: 'INVALID_REQUEST',
        statusCode: status || 400,
        retryable: false,
      }
    );
  }

  return new AiProviderError(`${providerName} (${model}) failed: ${parsedMsg.slice(0, 180)}`, {
    provider,
    model,
    code: 'NETWORK_ERROR',
    statusCode: status || 503,
    retryable: status === 0 || status >= 500,
  });
}

function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  provider: AiProviderId,
  model: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AiProviderError(`${provider === 'gemini' ? 'Google Gemini' : 'OpenAI'} (${model}) timed out after ${timeoutMs}ms.`, {
          provider,
          model,
          code: 'TIMEOUT',
          statusCode: 504,
          retryable: true,
        })
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type ProviderExecutor = (params: {
  candidate: AiCandidate;
  systemInstruction: string;
  prompt: string;
  geminiResponseSchema?: any;
  timeoutMs: number;
}) => Promise<string>;

async function callGeminiProvider(params: {
  candidate: AiCandidate;
  systemInstruction: string;
  prompt: string;
  geminiResponseSchema?: any;
  timeoutMs: number;
}): Promise<string> {
  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    throw new AiProviderError('GEMINI_API_KEY is not configured on the server.', {
      provider: 'gemini',
      model: params.candidate.model,
      code: 'NOT_CONFIGURED',
      statusCode: 503,
      retryable: false,
    });
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const config: Record<string, any> = {
    systemInstruction: params.systemInstruction,
    responseMimeType: 'application/json',
  };
  if (params.geminiResponseSchema) {
    config.responseSchema = params.geminiResponseSchema;
  }
  if (params.candidate.thinkingLevel) {
    config.thinkingConfig = { thinkingLevel: params.candidate.thinkingLevel };
  }

  const response = await withTimeout(
    ai.models.generateContent({
      model: params.candidate.model,
      contents: params.prompt,
      config,
    }),
    params.timeoutMs,
    'gemini',
    params.candidate.model
  );

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new AiProviderError(`Google Gemini (${params.candidate.model}) returned an empty response.`, {
      provider: 'gemini',
      model: params.candidate.model,
      code: 'EMPTY_RESPONSE',
      statusCode: 502,
      retryable: true,
    });
  }
  return text;
}

async function callOpenAiProvider(params: {
  candidate: AiCandidate;
  systemInstruction: string;
  prompt: string;
  timeoutMs: number;
}): Promise<string> {
  const apiKey = env.openaiApiKey;
  if (!apiKey) {
    throw new AiProviderError('OPENAI_API_KEY is not configured on the server.', {
      provider: 'openai',
      model: params.candidate.model,
      code: 'NOT_CONFIGURED',
      statusCode: 503,
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.candidate.model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `${params.systemInstruction}\nAlways respond with a single valid JSON object matching every requested field.`,
          },
          {
            role: 'user',
            content: params.prompt,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const retryAfterMs = parseRetryAfterMs(resp.headers.get('retry-after'));
      let bodyText = '';
      try {
        bodyText = await resp.text();
      } catch {
        // ignore
      }
      const classified = classifyProviderError(
        { status: resp.status, message: bodyText || `HTTP ${resp.status}` },
        'openai',
        params.candidate.model
      );
      if (retryAfterMs) {
        throw new AiProviderError(classified.message, {
          provider: 'openai',
          model: params.candidate.model,
          code: classified.code,
          statusCode: classified.statusCode,
          retryable: classified.retryable,
          retryAfterMs,
        });
      }
      throw classified;
    }

    const payload: any = await resp.json();
    const text = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!text) {
      throw new AiProviderError(`OpenAI (${params.candidate.model}) returned an empty completion.`, {
        provider: 'openai',
        model: params.candidate.model,
        code: 'EMPTY_RESPONSE',
        statusCode: 502,
        retryable: true,
      });
    }
    return text;
  } catch (err: any) {
    throw classifyProviderError(err, 'openai', params.candidate.model);
  } finally {
    clearTimeout(timer);
  }
}

export function buildConfiguredAiCandidates(options?: {
  primaryProvider?: 'gemini' | 'openai';
  fallbackProvider?: 'gemini' | 'openai' | 'none';
  geminiConfigured?: boolean;
  openaiConfigured?: boolean;
}): AiCandidate[] {
  const primary = options?.primaryProvider ?? env.aiPrimaryProvider;
  const fallback = options?.fallbackProvider ?? env.aiFallbackProvider;
  const hasGemini = options?.geminiConfigured ?? Boolean(env.geminiApiKey);
  const hasOpenAi = options?.openaiConfigured ?? Boolean(env.openaiApiKey);

  const geminiList: AiCandidate[] = hasGemini
    ? [
        {
          provider: 'gemini',
          providerLabel: 'Google Gemini',
          model: env.geminiModel,
          thinkingLevel: ThinkingLevel.LOW,
        },
        ...(env.geminiFallbackModel && env.geminiFallbackModel !== env.geminiModel
          ? [
              {
                provider: 'gemini' as const,
                providerLabel: 'Google Gemini',
                model: env.geminiFallbackModel,
                thinkingLevel: ThinkingLevel.MINIMAL,
              },
            ]
          : []),
      ]
    : [];

  const openaiList: AiCandidate[] = hasOpenAi
    ? [
        {
          provider: 'openai',
          providerLabel: 'OpenAI',
          model: env.openaiModel,
        },
      ]
    : [];

  const ordered: AiCandidate[] = [];
  const pushUnique = (list: AiCandidate[]) => {
    for (const c of list) {
      if (!ordered.some((o) => o.provider === c.provider && o.model === c.model)) {
        ordered.push(c);
      }
    }
  };

  if (primary === 'openai') {
    pushUnique(openaiList);
    if (fallback === 'gemini') pushUnique(geminiList);
  } else {
    pushUnique(geminiList);
    if (fallback === 'openai') pushUnique(openaiList);
  }

  return ordered;
}

export interface ExecuteStructuredAiOptions<T> {
  cacheKey: string;
  systemInstruction: string;
  prompt: string;
  geminiResponseSchema?: any;
  parseAndNormalize: (rawParsed: any, meta: { provider: AiProviderId; providerLabel: string; model: string; generatedAt: string; requestId: string }) => T;
  bypassCache?: boolean;
  allowStaleFallback?: boolean;
  timeoutMs?: number;
  maxRetriesPerCandidate?: number;
  // Optional overrides for deterministic unit testing (never exposed via HTTP)
  _candidates?: AiCandidate[];
  _executor?: ProviderExecutor;
  _freshTtlMs?: number;
  _staleTtlMs?: number;
}

export class AllAiProvidersFailedError extends Error {
  readonly code = 'AI_SERVICE_UNAVAILABLE';
  readonly statusCode: number;
  readonly requestId: string;
  readonly providersTried: AiProviderAttempt[];

  constructor(
    message: string,
    opts: { statusCode: number; requestId: string; providersTried: AiProviderAttempt[] }
  ) {
    super(message);
    this.name = 'AllAiProvidersFailedError';
    this.statusCode = opts.statusCode;
    this.requestId = opts.requestId;
    this.providersTried = opts.providersTried;
  }
}

export async function executeStructuredAiTask<T>(
  options: ExecuteStructuredAiOptions<T>
): Promise<AiExecutionResult<T>> {
  const requestId = `ai-${crypto.randomBytes(4).toString('hex')}`;
  const now = Date.now();
  const freshTtlMs = options._freshTtlMs ?? FRESH_CACHE_TTL_MS;
  const staleTtlMs = options._staleTtlMs ?? STALE_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? env.aiRequestTimeoutMs;
  const maxRetries = options.maxRetriesPerCandidate ?? 1;
  const allowStale = options.allowStaleFallback ?? true;

  const existingCache = narrativeCache.get(options.cacheKey);
  if (!options.bypassCache && existingCache && now < existingCache.freshUntilMs) {
    return {
      data: existingCache.data as T,
      provider: existingCache.provider,
      providerLabel: existingCache.providerLabel,
      model: existingCache.model,
      generatedAt: existingCache.generatedAt,
      cached: true,
      stale: false,
      requestId,
      latencyMs: 0,
      providersTried: [],
    };
  }

  // Deduplicate concurrent identical live AI requests (skip when custom test executor injected)
  const dedupeKey = `${options.cacheKey}|${options.bypassCache ? 'fresh' : 'std'}`;
  if (!options._executor && !options._candidates) {
    const inflight = inflightAiTasks.get(dedupeKey);
    if (inflight) {
      return inflight as Promise<AiExecutionResult<T>>;
    }
  }

  const run = async (): Promise<AiExecutionResult<T>> => {
    const candidates = options._candidates ?? buildConfiguredAiCandidates();
    const attempts: AiProviderAttempt[] = [];
    const totalStart = Date.now();

    if (candidates.length === 0) {
      if (allowStale && existingCache && Date.now() < existingCache.staleUntilMs) {
        return {
          data: existingCache.data as T,
          provider: existingCache.provider,
          providerLabel: existingCache.providerLabel,
          model: existingCache.model,
          generatedAt: existingCache.generatedAt,
          cached: true,
          stale: true,
          requestId,
          latencyMs: Date.now() - totalStart,
          providersTried: attempts,
        };
      }
      throw new AllAiProvidersFailedError(
        'No AI provider API key is configured on the server. Set GEMINI_API_KEY or OPENAI_API_KEY in server environment variables.',
        { statusCode: 503, requestId, providersTried: attempts }
      );
    }

    for (const candidate of candidates) {
      if (!canExecuteCandidate(candidate)) {
        attempts.push({
          provider: candidate.provider,
          providerLabel: candidate.providerLabel,
          model: candidate.model,
          ok: false,
          latencyMs: 0,
          errorCode: 'CIRCUIT_OPEN',
          errorMessage: `${candidate.providerLabel} (${candidate.model}) circuit breaker is open; skipping to next provider.`,
          circuitOpen: true,
        });
        continue;
      }

      let lastErr: AiProviderError | null = null;
      const candidateStart = Date.now();

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const rawText = options._executor
            ? await options._executor({
                candidate,
                systemInstruction: options.systemInstruction,
                prompt: options.prompt,
                geminiResponseSchema: options.geminiResponseSchema,
                timeoutMs,
              })
            : candidate.provider === 'gemini'
              ? await callGeminiProvider({
                  candidate,
                  systemInstruction: options.systemInstruction,
                  prompt: options.prompt,
                  geminiResponseSchema: options.geminiResponseSchema,
                  timeoutMs,
                })
              : await callOpenAiProvider({
                  candidate,
                  systemInstruction: options.systemInstruction,
                  prompt: options.prompt,
                  timeoutMs,
                });

          let parsedJson: any;
          try {
            parsedJson = JSON.parse(stripJsonCodeFences(rawText));
          } catch {
            throw new AiProviderError(
              `${candidate.providerLabel} (${candidate.model}) returned malformed JSON.`,
              {
                provider: candidate.provider,
                model: candidate.model,
                code: 'MALFORMED_RESPONSE',
                statusCode: 502,
                retryable: false,
              }
            );
          }

          const generatedAt = new Date().toISOString();
          const normalized = options.parseAndNormalize(parsedJson, {
            provider: candidate.provider,
            providerLabel: candidate.providerLabel,
            model: candidate.model,
            generatedAt,
            requestId,
          });

          const latencyMs = Date.now() - candidateStart;
          recordCandidateSuccess(candidate, latencyMs);
          attempts.push({
            provider: candidate.provider,
            providerLabel: candidate.providerLabel,
            model: candidate.model,
            ok: true,
            statusCode: 200,
            latencyMs,
          });

          narrativeCache.set(options.cacheKey, {
            data: normalized,
            provider: candidate.provider,
            providerLabel: candidate.providerLabel,
            model: candidate.model,
            generatedAt,
            cachedAtMs: Date.now(),
            freshUntilMs: Date.now() + freshTtlMs,
            staleUntilMs: Date.now() + staleTtlMs,
          });

          return {
            data: normalized,
            provider: candidate.provider,
            providerLabel: candidate.providerLabel,
            model: candidate.model,
            generatedAt,
            cached: false,
            stale: false,
            requestId,
            latencyMs,
            providersTried: attempts,
          };
        } catch (err: any) {
          lastErr = classifyProviderError(err, candidate.provider, candidate.model);
          console.warn(
            `[MarketMinds AI][${requestId}] provider=${candidate.provider} model=${candidate.model} attempt=${attempt + 1} status=${lastErr.statusCode} code=${lastErr.code}`
          );
          if (!lastErr.retryable || attempt >= maxRetries) {
            break;
          }
          const jitter = Math.floor(Math.random() * 140);
          const backoff = Math.min(1800, 450 * Math.pow(2, attempt) + jitter);
          await sleep(backoff);
        }
      }

      if (lastErr) {
        const latencyMs = Date.now() - candidateStart;
        recordCandidateFailure(candidate, lastErr, latencyMs);
        attempts.push({
          provider: candidate.provider,
          providerLabel: candidate.providerLabel,
          model: candidate.model,
          ok: false,
          statusCode: lastErr.statusCode,
          latencyMs,
          errorCode: lastErr.code,
          errorMessage: lastErr.message,
        });
      }
    }

    // All live providers failed -> return stale cached AI narrative if available & allowed
    if (allowStale && existingCache && Date.now() < existingCache.staleUntilMs) {
      return {
        data: existingCache.data as T,
        provider: existingCache.provider,
        providerLabel: existingCache.providerLabel,
        model: existingCache.model,
        generatedAt: existingCache.generatedAt,
        cached: true,
        stale: true,
        requestId,
        latencyMs: Date.now() - totalStart,
        providersTried: attempts,
      };
    }

    const rateLimitedAll =
      attempts.length > 0 && attempts.every((a) => a.errorCode === 'RATE_LIMITED');
    const summaryMsg =
      attempts
        .filter((a) => !a.ok)
        .map((a) => `${a.providerLabel} (${a.model}): ${a.errorCode}`)
        .join(' · ') || 'All configured AI providers failed.';

    throw new AllAiProvidersFailedError(
      rateLimitedAll
        ? `Configured AI providers reached temporary rate limits (${summaryMsg}). Quantitative indicators remain available; please retry shortly.`
        : `AI synthesis providers are temporarily unavailable (${summaryMsg}). Quantitative indicators remain available below.`,
      {
        statusCode: rateLimitedAll ? 429 : 503,
        requestId,
        providersTried: attempts,
      }
    );
  };

  if (!options._executor && !options._candidates) {
    const task = run().finally(() => {
      inflightAiTasks.delete(dedupeKey);
    });
    inflightAiTasks.set(dedupeKey, task);
    return task;
  }

  return run();
}

export function getAiProvidersHealth(): {
  status: 'operational' | 'degraded' | 'unavailable';
  primaryProvider: AiProviderId;
  fallbackProvider: AiProviderId | 'none';
  timeoutMs: number;
  cachedReports: number;
  inflightRequests: number;
  models: AiModelHealthSnapshot[];
  checkedAt: string;
} {
  const allDefined: Array<AiCandidate & { configured: boolean }> = [
    {
      provider: 'gemini',
      providerLabel: 'Google Gemini',
      model: env.geminiModel,
      configured: Boolean(env.geminiApiKey),
    },
    ...(env.geminiFallbackModel && env.geminiFallbackModel !== env.geminiModel
      ? [
          {
            provider: 'gemini' as const,
            providerLabel: 'Google Gemini',
            model: env.geminiFallbackModel,
            configured: Boolean(env.geminiApiKey),
          },
        ]
      : []),
    {
      provider: 'openai',
      providerLabel: 'OpenAI',
      model: env.openaiModel,
      configured: Boolean(env.openaiApiKey),
    },
  ];

  const models: AiModelHealthSnapshot[] = allDefined.map((c) => {
    const entry = ensureBreaker(c);
    let currentState = entry.state;
    if (currentState === 'OPEN' && entry.openUntilMs !== null && Date.now() >= entry.openUntilMs) {
      currentState = 'HALF_OPEN';
    }
    return {
      key: entry.key,
      provider: c.provider,
      providerLabel: c.providerLabel,
      model: c.model,
      configured: c.configured,
      circuitState: currentState,
      consecutiveFailures: entry.consecutiveFailures,
      openUntil: entry.openUntilMs ? new Date(entry.openUntilMs).toISOString() : null,
      lastSuccessAt: entry.lastSuccessAt,
      lastErrorAt: entry.lastErrorAt,
      lastErrorCode: entry.lastErrorCode,
      lastErrorMessage: entry.lastErrorMessage,
      avgLatencyMs:
        entry.latencySamples > 0 ? Math.round(entry.totalLatencyMs / entry.latencySamples) : null,
      totalRequests: entry.totalRequests,
      totalFailures: entry.totalFailures,
    };
  });

  const configuredModels = models.filter((m) => m.configured);
  const openCount = configuredModels.filter((m) => m.circuitState === 'OPEN').length;
  const status =
    configuredModels.length === 0
      ? 'unavailable'
      : openCount === 0
        ? 'operational'
        : openCount < configuredModels.length
          ? 'degraded'
          : 'unavailable';

  return {
    status,
    primaryProvider: env.aiPrimaryProvider,
    fallbackProvider: env.aiFallbackProvider,
    timeoutMs: env.aiRequestTimeoutMs,
    cachedReports: narrativeCache.size,
    inflightRequests: inflightAiTasks.size,
    models,
    checkedAt: new Date().toISOString(),
  };
}

export function resetAiProviderState(): void {
  breakerMap.clear();
  narrativeCache.clear();
  inflightAiTasks.clear();
}
