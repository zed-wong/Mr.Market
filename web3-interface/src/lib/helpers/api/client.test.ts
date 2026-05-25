import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './client';
import { authState, clearAuth, isAuthed, persistAuth, showSessionExpired } from '$lib/stores/auth';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const unauthorizedResponse = () => ({
  ok: false,
  status: 401,
  statusText: 'Unauthorized',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ message: 'expired' }),
});

describe('apiFetch session expiry handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('PUBLIC_MRM_BACKEND_URL', 'http://backend.test');
    vi.stubGlobal('localStorage', new MemoryStorage());
    showSessionExpired.set(false);
    clearAuth();
  });

  it('clears central in-memory auth state and token storage on 401 responses', async () => {
    persistAuth('jwt-token', '0xabc', '1', 60);
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/protected')).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(get(isAuthed)).toBe(false);
    expect(get(authState)).toEqual({ token: null, address: null, chainId: null, userId: null });
    expect(localStorage.getItem('web3-access-token')).toBeNull();
    expect(get(showSessionExpired)).toBe(true);
  });

  it('still clears stale auth when the session-expired dialog is suppressed', async () => {
    persistAuth('jwt-token', '0xabc', '1', 60);
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/protected', { suppressSessionExpired: true })).rejects.toBeInstanceOf(ApiError);

    expect(get(isAuthed)).toBe(false);
    expect(get(authState).token).toBeNull();
    expect(get(showSessionExpired)).toBe(false);
  });
});
