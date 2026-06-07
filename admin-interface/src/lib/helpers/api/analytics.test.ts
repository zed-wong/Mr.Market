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

describe('admin analytics API helper', () => {
  it('requests analytics foundation with normalized scope, pair, range, and bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ generatedAt: '2026-06-04T00:00:00.000Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setAccessToken } = await import('./client');
    const { fetchAdminAnalyticsFoundation } = await import('./analytics');

    setAccessToken('admin-token');
    await fetchAdminAnalyticsFoundation({
      scope: 'pair',
      exchange: 'Binance',
      pair: 'btc/usdt',
      range: '7d',
      limit: 50,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/admin/analytics/foundation');
    expect(url.searchParams.get('scope')).toBe('pair');
    expect(url.searchParams.get('exchange')).toBe('binance');
    expect(url.searchParams.get('pair')).toBe('BTC/USDT');
    expect(url.searchParams.get('range')).toBe('7d');
    expect(url.searchParams.get('limit')).toBe('50');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
  });

  it('omits empty filters and calls the Direct MM dashboard endpoint with unchanged order scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ dashboard: { orderIds: ['order-1'] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchDirectMarketMakingDashboard } = await import('./analytics');

    await fetchDirectMarketMakingDashboard({
      scope: 'order',
      orderId: ' order-1 ',
      exchange: '',
      pair: 'all',
      range: '24h',
    });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/admin/analytics/direct-market-making/dashboard');
    expect(url.searchParams.get('scope')).toBe('order');
    expect(url.searchParams.get('orderId')).toBe('order-1');
    expect(url.searchParams.get('range')).toBe('24h');
    expect(url.searchParams.has('exchange')).toBe(false);
    expect(url.searchParams.has('pair')).toBe(false);
  });

  it('advertises the backend analytics ranges and scopes used by the route controls', async () => {
    const { ANALYTICS_RANGES, ANALYTICS_SCOPES } = await import('./analytics');

    expect(ANALYTICS_RANGES).toEqual(['24h', '7d', '30d']);
    expect(ANALYTICS_SCOPES).toEqual(['admin', 'pair', 'order']);
  });
});
