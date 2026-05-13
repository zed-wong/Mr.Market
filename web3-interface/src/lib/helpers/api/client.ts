import { getMrmBackendUrl } from '../constants';
import { showSessionExpired } from '$lib/stores/auth';

const WEB3_ACCESS_TOKEN_KEY = 'web3-access-token';

export const getAccessToken = (): string | null =>
  typeof localStorage === 'undefined' ? null : localStorage.getItem(WEB3_ACCESS_TOKEN_KEY);

export const setAccessToken = (token: string) => {
  localStorage.setItem(WEB3_ACCESS_TOKEN_KEY, token);
};

export const clearAccessToken = () => {
  localStorage.removeItem(WEB3_ACCESS_TOKEN_KEY);
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message || `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  suppressSessionExpired?: boolean;
}

const buildUrl = (path: string, query?: RequestOptions['query']) => {
  const base = getMrmBackendUrl();
  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${base}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

export const apiFetch = async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { json, query, suppressSessionExpired = false, headers, method = 'GET', ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (json !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  finalHeaders.set('Accept', 'application/json');

  const token = getAccessToken();
  if (token) {
    finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  const upperMethod = method.toUpperCase();
  const response = await fetch(buildUrl(path, query), {
    ...rest,
    method: upperMethod,
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : (rest as RequestInit).body,
  });

  if (response.status === 401) {
    clearAccessToken();
    if (!suppressSessionExpired) {
      showSessionExpired.set(true);
    }
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      // ignore
    }
    throw new ApiError(response.status, parsed, 'Session expired');
  }

  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      // ignore
    }
    const message =
      (parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message?: unknown }).message ?? '')
        : '') || `Request failed: ${response.status} ${response.statusText}`;
    throw new ApiError(response.status, parsed, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
};