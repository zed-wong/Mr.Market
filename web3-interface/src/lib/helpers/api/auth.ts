import { ApiError, apiFetch, clearAccessToken, setAccessToken } from './client';
import { clearAuth, persistAuth } from '$lib/stores/auth';
import type { NonceResponse, LoginRequest, LoginResponse, SessionResponse } from '$lib/types/auth';

export const getNonce = async (address: string, chainId: string): Promise<NonceResponse> => {
  return apiFetch<NonceResponse>('/auth/web3/nonce', {
    method: 'POST',
    json: { address, chainId },
  });
};

export const login = async (message: string, signature: string): Promise<LoginResponse> => {
  const result = await apiFetch<LoginResponse>('/auth/web3/login', {
    method: 'POST',
    json: { message, signature } satisfies LoginRequest,
  });
  setAccessToken(result.jwt);
  persistAuth(result.jwt, result.address, result.chainId);
  return result;
};

export const checkSession = async (): Promise<SessionResponse | null> => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('web3-access-token') : null;
  if (!token) return null;
  try {
    const res = await apiFetch<SessionResponse>('/auth/web3/session', {
      suppressSessionExpired: true,
    });
    return res ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    throw err;
  }
};

export const logout = async (): Promise<void> => {
  try {
    await apiFetch('/auth/web3/logout', { method: 'POST' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return;
    }
    throw err;
  } finally {
    clearAccessToken();
    clearAuth();
  }
};