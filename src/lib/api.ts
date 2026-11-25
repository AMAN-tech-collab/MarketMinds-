import axios from 'axios';

const baseURL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

let inMemoryAuthToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  inMemoryAuthToken = token;
}

export function getApiAuthToken(): string | null {
  return inMemoryAuthToken;
}

export function getApiBaseUrl(): string {
  return baseURL ? `${baseURL}/api` : '/api';
}

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  if (inMemoryAuthToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${inMemoryAuthToken}`;
  }
  return config;
});

// Bounded single retry for transient network failures on idempotent GET requests
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config as any;
    const isIdempotentGet = config?.method?.toLowerCase() === 'get';
    const isTransient =
      !error?.response ||
      error.code === 'ECONNABORTED' ||
      error.response.status === 502 ||
      error.response.status === 503 ||
      error.response.status === 504;

    if (config && isIdempotentGet && isTransient && !config._retriedOnce) {
      config._retriedOnce = true;
      await new Promise((resolve) => setTimeout(resolve, 650));
      return apiClient(config);
    }
    return Promise.reject(error);
  }
);

export function extractApiError(err: unknown, fallback = 'Request failed. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as any;
    if (data?.error) {
      const raw = String(data.error);
      if (raw.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error?.message) return String(parsed.error.message);
        } catch {
          // ignore
        }
      }
      return raw;
    }
    if (status === 429) {
      return 'Rate limit reached on the market data provider. Please wait a few seconds and retry.';
    }
    if (status === 404) {
      return 'Stock symbol not found on the selected exchange. Check the ticker or exchange code.';
    }
    if (status === 401 || status === 403) {
      return 'Authentication required or session expired. Please sign in and retry.';
    }
    if (status === 504 || err.code === 'ECONNABORTED') {
      return 'Upstream market data feed timed out before responding. Click Retry to re-fetch.';
    }
    if (!err.response) {
      return 'Network error: unable to reach the backend API server.';
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export const api = apiClient;
export const getApiErrorMessage = extractApiError;
