import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.stubEnv('PUBLIC_MRM_BACKEND_URL', 'https://admin-api.test');
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('admin auth helper', () => {
  it('does not show the expired-session flow for an invalid password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const { login } = await import('./auth');
    const { getAccessToken } = await import('./client');
    const { showSessionExpired } = await import('$lib/stores/auth');

    await expect(login('wrong-password')).resolves.toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(get(showSessionExpired)).toBe(false);
  });
});
