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

describe('trading API helpers', () => {
  it('requests authenticated admin orders with backend filters and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          items: [],
          pagination: {
            page: 2,
            limit: 50,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrevious: true,
          },
          filters: { status: 'open', side: 'buy', query: 'btc' },
          limits: {
            defaultLimit: 25,
            maxLimit: 100,
            maxPage: 1000,
            maxQueryLength: 100,
            executionScanLimit: 500,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setAccessToken } = await import('./client');
    const { fetchAdminOrders } = await import('./trading');

    setAccessToken('admin-token');
    const result = await fetchAdminOrders({
      status: 'open',
      side: 'buy',
      query: ' btc ',
      limit: 50,
      page: 2,
    });

    expect(result.filters).toEqual({ status: 'open', side: 'buy', query: 'btc' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/admin/orders');
    expect(url.searchParams.get('status')).toBe('open');
    expect(url.searchParams.get('side')).toBe('buy');
    expect(url.searchParams.get('query')).toBe('btc');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('page')).toBe('2');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
  });

  it('omits all-valued order filters so backend defaults are authoritative', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          items: [],
          pagination: {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false,
          },
          filters: { status: null, side: null, query: null },
          limits: {
            defaultLimit: 25,
            maxLimit: 100,
            maxPage: 1000,
            maxQueryLength: 100,
            executionScanLimit: 500,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchAdminOrders } = await import('./trading');

    await fetchAdminOrders({ status: 'all', side: 'all', query: '   ' });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.has('side')).toBe(false);
    expect(url.searchParams.has('query')).toBe(false);
  });

  it('requests authenticated admin user orders with backend filters and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          items: [],
          pagination: {
            page: 2,
            limit: 50,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrevious: true,
          },
          filters: { type: 'market_making', state: 'active', query: 'btc' },
          limits: {
            defaultLimit: 25,
            maxLimit: 100,
            maxPage: 1000,
            maxQueryLength: 100,
            maxScanRows: 1000,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setAccessToken } = await import('./client');
    const { fetchAdminUserOrders } = await import('./trading');

    setAccessToken('admin-token');
    const result = await fetchAdminUserOrders({
      type: 'market_making',
      state: ' active ',
      query: ' btc ',
      limit: 50,
      page: 2,
    });

    expect(result.filters).toEqual({ type: 'market_making', state: 'active', query: 'btc' });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/admin/user-orders');
    expect(url.searchParams.get('type')).toBe('market_making');
    expect(url.searchParams.get('state')).toBe('active');
    expect(url.searchParams.get('query')).toBe('btc');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('page')).toBe('2');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
  });

  it('requests the authenticated internal ledger summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          entries: { total: 0, lastEntryAt: null, byType: [] },
          balances: {
            total: 0,
            scannedRows: 0,
            truncated: false,
            invariantViolations: 0,
            negativeBalances: 0,
            healthy: true,
            byAsset: [],
          },
          limits: { metadataScanLimit: 500 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setAccessToken } = await import('./client');
    const { fetchLedgerSummary } = await import('./trading');

    setAccessToken('admin-token');
    const result = await fetchLedgerSummary();

    expect(result.balances.healthy).toBe(true);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/admin/ledger/summary');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
  });

  it('requests authenticated ledger entries with backend filters and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          items: [],
          pagination: {
            page: 2,
            limit: 50,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrevious: true,
          },
          filters: { type: 'fill_settle', asset: 'btc', query: 'order' },
          types: [],
          limits: {
            defaultLimit: 25,
            maxLimit: 100,
            maxPage: 1000,
            maxQueryLength: 100,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchLedgerEntries } = await import('./trading');

    const result = await fetchLedgerEntries({
      type: 'fill_settle',
      asset: 'btc',
      query: ' order ',
      limit: 50,
      page: 2,
    });

    expect(result.filters).toEqual({ type: 'fill_settle', asset: 'btc', query: 'order' });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/admin/ledger/entries');
    expect(url.searchParams.get('type')).toBe('fill_settle');
    expect(url.searchParams.get('asset')).toBe('btc');
    expect(url.searchParams.get('query')).toBe('order');
    expect(url.searchParams.get('limit')).toBe('50');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('omits all-valued ledger entry filters so backend defaults are authoritative', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          items: [],
          pagination: {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false,
          },
          filters: { type: null, asset: null, query: null },
          types: [],
          limits: {
            defaultLimit: 25,
            maxLimit: 100,
            maxPage: 1000,
            maxQueryLength: 100,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { fetchLedgerEntries } = await import('./trading');

    await fetchLedgerEntries({ type: 'all', asset: 'all', query: '   ' });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has('type')).toBe(false);
    expect(url.searchParams.has('asset')).toBe(false);
    expect(url.searchParams.has('query')).toBe(false);
  });

  it('requests authenticated ledger balances with backend filters and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          generatedAt: '2026-05-23T00:00:00.000Z',
          items: [],
          summary: { scannedRows: 0, totalRows: 0, truncated: false, byAsset: [] },
          pagination: {
            page: 3,
            limit: 10,
            total: 0,
            totalPages: 1,
            hasNext: false,
            hasPrevious: true,
          },
          filters: { exchange: 'binance', asset: 'btc', query: 'order' },
          limits: {
            defaultLimit: 25,
            maxLimit: 100,
            maxPage: 1000,
            maxQueryLength: 100,
            metadataScanLimit: 500,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { setAccessToken } = await import('./client');
    const { fetchLedgerBalances } = await import('./trading');

    setAccessToken('admin-token');
    const result = await fetchLedgerBalances({
      exchange: 'binance',
      asset: 'btc',
      query: ' order ',
      limit: 10,
      page: 3,
    });

    expect(result.filters).toEqual({ exchange: 'binance', asset: 'btc', query: 'order' });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/admin/ledger/balances');
    expect(url.searchParams.get('exchange')).toBe('binance');
    expect(url.searchParams.get('asset')).toBe('btc');
    expect(url.searchParams.get('query')).toBe('order');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('page')).toBe('3');
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer admin-token');
  });
});
