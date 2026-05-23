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

describe('dashboard API helper', () => {
  it('requests the authenticated dashboard summary with the selected backend range', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          range: {
            key: '7d',
            startedAt: '2026-05-16T00:00:00.000Z',
            endedAt: '2026-05-23T00:00:00.000Z',
          },
          kpis: {
            activeStrategies: 2,
            totalStrategies: 3,
            pendingIntents: 1,
            openOrders: 4,
            trackedOrders: 5,
            totalCapital: '123.45',
            reconciliationViolations: 0,
            runtimeHealth: 'healthy',
          },
          strategies: { total: 3, definitions: 2, counts: {}, recent: [], updatedSince: '2026-05-16T00:00:00.000Z', truncated: false },
          intents: { total: 1, counts: {}, recent: [], truncated: false },
          orderFlow: {
            total: 5,
            counts: {},
            recent: [],
            truncated: false,
            updatedSince: '2026-05-16T00:00:00.000Z',
            volume: { tradeCount: 0, notionalVolume: '0', scannedRows: 0, truncated: false },
          },
          capital: { total: '123.45', byAsset: [], scannedRows: 0, totalRows: 0, truncated: false },
          exchanges: { total: 0, byValidationStatus: {}, accounts: [], scannedRows: 0, truncated: false },
          health: { status: 'healthy', timestamp: '2026-05-23T00:00:00.000Z', queue: null, metrics: null, issues: [] },
          reconciliation: { totalViolations: 0, reports: [] },
          runtime: { stats: [], recent: [], truncated: false },
          limits: { recentItems: 10, capitalScanRows: 500, apiKeyScanRows: 25 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setAccessToken } = await import('./client');
    const { fetchDashboardSummary } = await import('./dashboard');

    setAccessToken('admin-token');
    const summary = await fetchDashboardSummary('7d');

    expect(summary.range.key).toBe('7d');
    expect(summary.kpis.totalCapital).toBe('123.45');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/admin\/dashboard\/summary\?range=7d$/,
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
  });

  it('advertises only ranges supported by the backend dashboard API', async () => {
    const { DASHBOARD_RANGES } = await import('./dashboard');

    expect(DASHBOARD_RANGES).toEqual(['24h', '7d', '30d']);
    expect(DASHBOARD_RANGES).not.toContain('1h');
  });
});
