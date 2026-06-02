import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFundingRequest,
  depositMarketMakingOrder,
  getBalances,
  getDepositInstructions,
  getFundingRequest,
  getMarketMakingOrderDetail,
  getWithdrawStatus,
  listMarketMakingOptions,
  listMarketMakingOrders,
  listMarketMakingStrategies,
  pauseMarketMakingOrder,
  resumeMarketMakingOrder,
  startMarketMakingOrder,
  submitWithdraw,
  verifyFundingRequest,
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

  it('uses real web3 funding endpoint contracts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        namespace: '/web3/funding-test',
        available: [],
        supportedTokens: [],
        withdrawalId: 'withdrawal-1',
        status: 'blocked',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getBalances();
    await getDepositInstructions('11155111');
    await createFundingRequest({
      chainId: 11155111,
      routerAddress: '0x1111111111111111111111111111111111111111',
      tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      amount: '1',
      orderDraft: {
        marketMakingPairId: 'pair-1',
        strategyDefinitionId: 'strategy-1',
      },
    });
    await getFundingRequest(`0x${'b'.repeat(64)}`);
    await verifyFundingRequest(`0x${'b'.repeat(64)}`, {
      txHash: `0x${'c'.repeat(64)}`,
    });
    await submitWithdraw({
      orderId: 'order-1',
      chainId: 11155111,
      routerAddress: '0x1111111111111111111111111111111111111111',
      tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      amount: '1',
      recipientAddress: '0x2222222222222222222222222222222222222222',
      idempotencyKey: 'withdraw-1',
    });
    await getWithdrawStatus('withdrawal-1');

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      path: new URL(String(url)).pathname,
      search: new URL(String(url)).search,
      method: String((init as RequestInit | undefined)?.method ?? 'GET'),
      body: (init as RequestInit | undefined)?.body,
    }));

    expect(calls.map((call) => `${call.method} ${call.path}${call.search}`)).toEqual([
      'GET /web3/balances',
      'GET /web3/funding-requests/instructions?chainId=11155111',
      'POST /web3/funding-requests',
      `GET /web3/funding-requests/0x${'b'.repeat(64)}`,
      `POST /web3/funding-requests/0x${'b'.repeat(64)}/verify`,
      'POST /web3/withdrawal-requests',
      'GET /web3/withdrawal-requests/withdrawal-1',
    ]);
    expect(String(calls[2].body)).toContain('orderDraft');
    expect(String(calls[4].body)).toContain('txHash');
    expect(String(calls[5].body)).toContain('idempotencyKey');
  });
});
