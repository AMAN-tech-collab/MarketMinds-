import type { FetchLike, NewsErrorCode, NewsProviderHealth } from './types.ts';

export class NewsProviderError extends Error {
  readonly code: NewsErrorCode;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: NewsErrorCode,
    options?: { statusCode?: number; retryable?: boolean }
  ) {
    super(message);
    this.name = 'NewsProviderError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
  }
}

export function classifyHttpStatus(status: number, providerName: string): NewsProviderError {
  if (status === 503) {
    return new NewsProviderError(
      `${providerName} temporarily unavailable (HTTP 503).`,
      'PROVIDER_503',
      { statusCode: 503, retryable: true }
    );
  }
  if (status === 502 || status === 504) {
    return new NewsProviderError(
      `${providerName} upstream gateway error (HTTP ${status}).`,
      'PROVIDER_502',
      { statusCode: status, retryable: true }
    );
  }
  if (status === 429) {
    return new NewsProviderError(
      `${providerName} rate limit exceeded (HTTP 429).`,
      'RATE_LIMITED',
      { statusCode: 429, retryable: true }
    );
  }
  if (status === 401) {
    return new NewsProviderError(
      `${providerName} rejected API credentials (HTTP 401).`,
      'INVALID_API_KEY',
      { statusCode: 401, retryable: false }
    );
  }
  if (status === 403) {
    return new NewsProviderError(
      `${providerName} access forbidden or quota restricted (HTTP 403).`,
      'FORBIDDEN',
      { statusCode: 403, retryable: false }
    );
  }
  return new NewsProviderError(
    `${providerName} returned HTTP ${status}.`,
    'HTTP_ERROR',
    { statusCode: status, retryable: status >= 500 }
  );
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: FetchLike,
  providerName: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err?.name === 'AbortError' || /abort|timed?\s*out/i.test(String(err?.message || ''))) {
      throw new NewsProviderError(
        `${providerName} timed out after ${timeoutMs}ms.`,
        'TIMEOUT',
        { retryable: true }
      );
    }
    throw new NewsProviderError(
      `${providerName} network error: ${err?.message || 'connection failed'}.`,
      'NETWORK_ERROR',
      { retryable: true }
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 1200;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const isRetryable = err instanceof NewsProviderError ? err.retryable : false;
      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 80);
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt) + jitter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

interface BreakerInternalState {
  id: string;
  name: string;
  tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
  requiresApiKey: boolean;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  openUntilMs: number | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: NewsErrorCode | null;
  lastErrorMessage: string | null;
  totalLatencyMs: number;
  latencySamples: number;
  totalRequests: number;
  totalFailures: number;
}

export class ProviderCircuitBreakerRegistry {
  private readonly states = new Map<string, BreakerInternalState>();
  private readonly failureThreshold: number;
  private readonly transientCooldownMs: number;
  private readonly authCooldownMs: number;

  constructor(options?: {
    failureThreshold?: number;
    transientCooldownMs?: number;
    authCooldownMs?: number;
  }) {
    this.failureThreshold = options?.failureThreshold ?? 2;
    this.transientCooldownMs = options?.transientCooldownMs ?? 60_000;
    this.authCooldownMs = options?.authCooldownMs ?? 300_000;
  }

  private ensure(meta: {
    id: string;
    name: string;
    tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
    requiresApiKey: boolean;
  }): BreakerInternalState {
    let entry = this.states.get(meta.id);
    if (!entry) {
      entry = {
        id: meta.id,
        name: meta.name,
        tier: meta.tier,
        requiresApiKey: meta.requiresApiKey,
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
      this.states.set(meta.id, entry);
    }
    return entry;
  }

  canExecute(meta: {
    id: string;
    name: string;
    tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
    requiresApiKey: boolean;
  }): boolean {
    const entry = this.ensure(meta);
    if (entry.state === 'OPEN') {
      if (entry.openUntilMs !== null && Date.now() >= entry.openUntilMs) {
        entry.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(
    meta: {
      id: string;
      name: string;
      tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
      requiresApiKey: boolean;
    },
    latencyMs: number
  ): void {
    const entry = this.ensure(meta);
    entry.state = 'CLOSED';
    entry.consecutiveFailures = 0;
    entry.openUntilMs = null;
    entry.lastSuccessAt = new Date().toISOString();
    entry.totalRequests += 1;
    entry.totalLatencyMs += latencyMs;
    entry.latencySamples += 1;
  }

  recordFailure(
    meta: {
      id: string;
      name: string;
      tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
      requiresApiKey: boolean;
    },
    error: NewsProviderError,
    latencyMs: number
  ): void {
    const entry = this.ensure(meta);
    entry.totalRequests += 1;
    entry.totalFailures += 1;
    entry.totalLatencyMs += latencyMs;
    entry.latencySamples += 1;
    entry.lastErrorAt = new Date().toISOString();
    entry.lastErrorCode = error.code;
    entry.lastErrorMessage = error.message;

    // Empty responses don't necessarily mean the provider is broken
    if (error.code === 'EMPTY_RESPONSE') {
      return;
    }

    entry.consecutiveFailures += 1;

    // Open immediately on invalid API key / forbidden so we stop hitting rejected credentials
    if (error.code === 'INVALID_API_KEY' || error.code === 'FORBIDDEN') {
      entry.state = 'OPEN';
      entry.openUntilMs = Date.now() + this.authCooldownMs;
      return;
    }

    if (entry.consecutiveFailures >= this.failureThreshold || entry.state === 'HALF_OPEN') {
      entry.state = 'OPEN';
      entry.openUntilMs = Date.now() + this.transientCooldownMs;
    }
  }

  getSnapshot(
    providers: Array<{
      id: string;
      name: string;
      tier: 'commercial' | 'primary' | 'secondary' | 'fallback';
      requiresApiKey: boolean;
      isConfigured: () => boolean;
    }>
  ): NewsProviderHealth[] {
    return providers.map((p) => {
      const entry = this.ensure(p);
      // Reflect live half-open transitions in health snapshot
      let currentState = entry.state;
      if (currentState === 'OPEN' && entry.openUntilMs !== null && Date.now() >= entry.openUntilMs) {
        currentState = 'HALF_OPEN';
      }
      return {
        id: p.id,
        name: p.name,
        tier: p.tier,
        configured: p.isConfigured(),
        requiresApiKey: p.requiresApiKey,
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
  }

  reset(): void {
    this.states.clear();
  }
}
