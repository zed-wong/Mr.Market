import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  depositMarketMakingOrder,
  getMarketMakingOrderDetail,
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

describe('web3 market-making API helper URLs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('PUBLIC_MRM_BACKEND_URL', 'http://backend.test');
  });

  it('encodes order ids used in detail and mutation URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        namespace: '/api/v1/web3/market-making',
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
      `/api/v1/web3/market-making/orders/${encoded}`,
      `/api/v1/web3/market-making/orders/${encoded}/deposit`,
      `/api/v1/web3/market-making/orders/${encoded}/withdraw`,
      `/api/v1/web3/market-making/orders/${encoded}/start`,
      `/api/v1/web3/market-making/orders/${encoded}/pause`,
      `/api/v1/web3/market-making/orders/${encoded}/resume`,
    ]);
  });
});
