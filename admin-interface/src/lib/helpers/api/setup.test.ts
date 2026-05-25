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

describe('setup API helper', () => {
  it('stores the setup password token after pre-auth password setup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'setup-token', expires_in: 604800 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setSetupPassword } = await import('./setup');
    const { getAccessToken } = await import('./client');

    await expect(setSetupPassword('long-password')).resolves.toEqual({
      access_token: 'setup-token',
      expires_in: 604800,
    });
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/setup/password');
    expect(getAccessToken()).toBe('setup-token');
  });
});
