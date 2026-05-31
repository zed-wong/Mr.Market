import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authState, clearAuth, isAuthed, persistAuth } from '$lib/stores/auth';
import { checkSession, getNonce, login } from './auth';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 401 ? 'Unauthorized' : 'OK',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
});

describe('web3 auth API helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('PUBLIC_MRM_BACKEND_URL', 'http://backend.test');
    vi.stubGlobal('localStorage', new MemoryStorage());
    clearAuth();
  });

  it('requests a backend nonce for the active wallet scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        nonce: 'nonce-1',
        domain: 'Mr.Market',
        statement: 'Sign in to Mr.Market web3 market-making orders',
        uri: 'https://mr.market/web3',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getNonce('0xabc', '1')).resolves.toMatchObject({ nonce: 'nonce-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5001/auth/web3/nonce',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ address: '0xabc', chainId: '1' }),
      })
    );
  });

  it('persists the JWT returned by web3 login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          jwt: 'jwt-token',
          userId: 'user-id',
          address: '0xabc',
          chainId: '1',
          expiresIn: 60,
        })
      )
    );

    await login('siwe-message', '0xsigned');

    expect(get(isAuthed)).toBe(true);
    expect(get(authState)).toMatchObject({
      token: 'jwt-token',
      address: '0xabc',
      chainId: '1',
    });
    expect(localStorage.getItem('web3-access-token')).toBe('jwt-token');
  });

  it('hydrates auth state when a stored JWT validates on reload', async () => {
    persistAuth('jwt-token', '0xabc', '1', 60);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          authenticated: true,
          userId: 'user-id',
          address: '0xabc',
          chainId: '1',
        })
      )
    );

    await expect(checkSession()).resolves.toMatchObject({ authenticated: true });
    expect(get(isAuthed)).toBe(true);
    expect(get(authState).userId).toBe('user-id');
  });
});
