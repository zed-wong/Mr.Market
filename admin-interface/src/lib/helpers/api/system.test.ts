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

describe('system API helpers', () => {
  it('requests health with backend group and service filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          overallStatus: 'healthy',
          summary: { total: 1, healthy: 1, warning: 0, critical: 0, unknown: 0 },
          groups: [],
          services: [],
          filters: { group: 'core', service: 'core.api', availableGroups: [], availableServices: [] },
          limits: { maxServices: 100, sourceTimeoutMs: 750, maxConnectorAccounts: 25, maxRuntimeRows: 10, maxTrackedOrderSample: 500 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setAccessToken } = await import('./client');
    const { fetchAdminSystemHealth } = await import('./system');

    setAccessToken('admin-token');
    await fetchAdminSystemHealth({ group: 'core', service: 'core.api' });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/admin/system/health');
    expect(url.searchParams.get('group')).toBe('core');
    expect(url.searchParams.get('service')).toBe('core.api');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
  });

  it('requests audit filters plus read-only export and integrity controls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          entries: [],
          filters: { actor: 'admin', action: 'login', resource: 'auth', status: 'success', from: null, to: null },
          pagination: { page: 2, limit: 25, returned: 0, total: 0, hasMore: false },
          limits: { defaultLimit: 50, maxLimit: 200, maxFilterLength: 120, maxJsonBytes: 8192, maxStringLength: 1000, maxExportBytes: 131072 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchAdminSystemAudit } = await import('./system');

    await fetchAdminSystemAudit({
      actor: ' admin ',
      action: ' login ',
      resource: ' auth ',
      status: 'success',
      limit: 25,
      page: 2,
      exportAudit: true,
      integrity: true,
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/admin/system/audit');
    expect(url.searchParams.get('actor')).toBe('admin');
    expect(url.searchParams.get('action')).toBe('login');
    expect(url.searchParams.get('resource')).toBe('auth');
    expect(url.searchParams.get('status')).toBe('success');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('export')).toBe('true');
    expect(url.searchParams.get('integrity')).toBe('true');
  });

  it('uses whitelisted config read, update, and reset endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ generatedAt: '2026-05-23T00:00:00.000Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const {
      fetchAdminSystemConfig,
      updateAdminSystemConfig,
      resetAdminSystemConfig,
    } = await import('./system');

    await fetchAdminSystemConfig();
    await updateAdminSystemConfig('fees.spot_fee', '0.003');
    await resetAdminSystemConfig('fees.spot_fee');

    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/admin/system/config');
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ key: 'fees.spot_fee', value: '0.003' }));
    expect(new URL(fetchMock.mock.calls[2][0] as string).pathname).toBe('/admin/system/config/reset');
    expect(fetchMock.mock.calls[2][1].method).toBe('POST');
  });
});
