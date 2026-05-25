import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  depositMarketMakingOrder,
  getMarketMakingOrderDetail,
  listMarketMakingOptions,
  listMarketMakingOrders,
  listMarketMakingStrategies,
  pauseMarketMakingOrder,
  resumeMarketMakingOrder,
  startMarketMakingOrder,
  withdrawMarketMakingOrder,
} from './web3';

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
});

const legacyWeb3MarketMakingNamespace = () => ['/api/v1/web3', 'market-making'].join('/');

describe('web3 market-making API helper URLs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('PUBLIC_MRM_BACKEND_URL', 'http://backend.test');
  });

  it('encodes order ids used in detail and mutation URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        namespace: '/web3/market-making',
        order: {},
        mutation: { type: 'deposit', applied: true },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const orderId = 'order/with spaces?#';
    await getMarketMakingOrderDetail(orderId);
    await depositMarketMakingOrder(orderId, { assetId: 'USDC', amount: '1', idempotencyKey: 'deposit-1' });
    await withdrawMarketMakingOrder(orderId, { assetId: 'USDC', amount: '1', idempotencyKey: 'withdraw-1' });
    await startMarketMakingOrder(orderId);
    await pauseMarketMakingOrder(orderId);
    await resumeMarketMakingOrder(orderId);

    const encoded = 'order%2Fwith%20spaces%3F%23';
    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual([
      `/web3/market-making/orders/${encoded}`,
      `/web3/market-making/orders/${encoded}/deposit`,
      `/web3/market-making/orders/${encoded}/withdraw`,
      `/web3/market-making/orders/${encoded}/start`,
      `/web3/market-making/orders/${encoded}/pause`,
      `/web3/market-making/orders/${encoded}/resume`,
    ]);
  });

  it('uses the canonical web3 market-making namespace for list and create options', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        namespace: '/web3/market-making',
        orders: [],
        strategies: [],
        options: [],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await listMarketMakingOrders();
    await listMarketMakingStrategies();
    await listMarketMakingOptions();

    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual([
      '/web3/market-making/orders',
      '/web3/market-making/strategies',
      '/web3/market-making/options',
    ]);
    expect(paths.join('\n')).not.toContain(legacyWeb3MarketMakingNamespace());
  });
});
