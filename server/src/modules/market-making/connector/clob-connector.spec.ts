/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClobConnector } from './clob-connector';

describe('ClobConnector', () => {
  const adapter = {
    placeLimitOrder: jest.fn(),
    cancelOrder: jest.fn(),
    fetchOrder: jest.fn(),
  };

  const baseIntent = {
    type: 'CREATE_LIMIT_ORDER' as const,
    intentId: 'intent-1',
    runtimeInstanceKey: 'runtime-1',
    strategyKey: 'strategy-1',
    userId: 'user-1',
    clientId: 'order-1',
    exchange: 'hyperliquid',
    connectorId: 'hyperliquid',
    accountLabel: 'default',
    pair: 'BTC/USDC',
    side: 'buy' as const,
    price: '100',
    qty: '1',
    createdAt: '2026-06-21T00:00:00.000Z',
    status: 'NEW' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adapter.placeLimitOrder.mockResolvedValue({ id: 'ex-1', status: 'open' });
    adapter.cancelOrder.mockResolvedValue({
      id: 'ex-1',
      status: 'canceled',
    });
    adapter.fetchOrder.mockResolvedValue({ id: 'ex-1', status: 'open' });
  });

  it('submits CLOB limit orders through the exchange adapter with connector metadata client id', async () => {
    const connector = new ClobConnector(adapter as any);

    const result = await connector.submitAction({
      ...baseIntent,
      metadata: { submittedClientOrderId: 'client-1' },
    });

    expect(adapter.placeLimitOrder).toHaveBeenCalledWith(
      'hyperliquid',
      'BTC/USDC',
      'buy',
      '1',
      '100',
      'client-1',
      { postOnly: false, timeInForce: undefined },
      'default',
    );
    expect(result).toEqual({
      status: 'submitted',
      exchangeOrderId: 'ex-1',
      details: { id: 'ex-1', status: 'open' },
    });
  });

  it('returns explicit not_supported for non-CLOB submit types', async () => {
    const connector = new ClobConnector(adapter as any);

    const result = await connector.submitAction({
      ...baseIntent,
      type: 'EXECUTE_AMM_SWAP',
      metadata: { submittedClientOrderId: 'client-1' },
    });

    expect(adapter.placeLimitOrder).not.toHaveBeenCalled();
    expect(result.status).toBe('not_supported');
  });

  it('cancels CLOB orders through the exchange adapter', async () => {
    const connector = new ClobConnector(adapter as any);

    const result = await connector.cancelAction({
      ...baseIntent,
      type: 'CANCEL_ORDER',
      mixinOrderId: 'ex-1',
    });

    expect(adapter.cancelOrder).toHaveBeenCalledWith(
      'hyperliquid',
      'BTC/USDC',
      'ex-1',
      'default',
    );
    expect(result.exchangeOrderId).toBe('ex-1');
  });
});
