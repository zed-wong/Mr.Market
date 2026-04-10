/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';

describe('ExchangeOrderTrackerService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('upserts order states and returns open orders by strategy', async () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.500Z',
    });

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-2',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'filled',
      createdAt: '2026-02-11T00:00:01.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    const openOrders = service.getOpenOrders('u1-c1-pureMarketMaking');

    expect(openOrders).toHaveLength(1);
    expect(openOrders[0].exchangeOrderId).toBe('ex-1');
  });

  it('splits live orders from active slot orders', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'pending-create',
      slotKey: 'layer-1-buy',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'open-order',
      slotKey: 'layer-1-sell',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'o1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'pending-cancel',
      slotKey: 'layer-2-buy',
      side: 'buy',
      price: '99',
      qty: '1',
      status: 'pending_cancel',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(
      service.getLiveOrders('strategy-1').map((order) => order.exchangeOrderId),
    ).toEqual(['open-order']);
    expect(
      service
        .getActiveSlotOrders('strategy-1')
        .map((order) => order.exchangeOrderId),
    ).toEqual(['pending-create', 'open-order', 'pending-cancel']);
  });

  it('reconciles order status on tick via adapter poller', async () => {
    const adapter = {
      fetchOrder: jest.fn().mockResolvedValue({ id: 'ex-1', status: 'closed' }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined as any,
      adapter as any,
    );

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'pending_create',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.onTick('2026-02-11T00:00:01.000Z');

    const tracked = service.getByExchangeOrderId('binance', 'ex-1');

    expect(tracked?.status).toBe('filled');
  });

  it('routes recovered REST fill deltas through the executor exactly once', async () => {
    const onFill = jest.fn();
    const adapter = {
      fetchOrder: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'ex-1',
          status: 'partially_filled',
          filled: '0.5',
        })
        .mockResolvedValueOnce({
          id: 'ex-1',
          status: 'partially_filled',
          filled: '0.5',
        }),
    };
    const executorRegistry = {
      getExecutor: jest.fn().mockReturnValue({
        onFill,
      }),
    };
    const service = new ExchangeOrderTrackerService(
      undefined as any,
      adapter as any,
      executorRegistry as any,
    );

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      clientOrderId: 'mm-1',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.onTick('2026-02-11T00:00:01.000Z');
    await service.onTick('2026-02-11T00:00:02.000Z');

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-1',
        clientOrderId: 'mm-1',
        qty: '0.5',
        cumulativeQty: '0.5',
      }),
    );
  });

  it('rejects illegal transitions and keeps cumulative fills monotonic', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0.4',
      status: 'partially_filled',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'u1-c1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      cumulativeFilledQty: '0.1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    const tracked = service.getByExchangeOrderId('binance', 'ex-1');

    expect(tracked?.status).toBe('partially_filled');
    expect(tracked?.cumulativeFilledQty).toBe('0.4');
  });

  it('keeps same exchange order id from different exchanges isolated', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'client-1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'client-2',
      strategyKey: 'strategy-1',
      exchange: 'mexc',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(service.getByExchangeOrderId('binance', 'same-id')?.exchange).toBe(
      'binance',
    );
    expect(service.getByExchangeOrderId('mexc', 'same-id')?.exchange).toBe(
      'mexc',
    );
  });

  it('keeps same exchange order id from different accounts isolated', () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      orderId: 'client-1',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      accountLabel: 'default',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });
    service.upsertOrder({
      orderId: 'client-2',
      strategyKey: 'strategy-1',
      exchange: 'binance',
      accountLabel: 'account2',
      pair: 'BTC/USDT',
      exchangeOrderId: 'same-id',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'open',
      createdAt: '2026-02-11T00:00:00.000Z',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(
      service.getByExchangeOrderId('binance', 'same-id', 'default')?.side,
    ).toBe('buy');
    expect(
      service.getByExchangeOrderId('binance', 'same-id', 'account2')?.side,
    ).toBe('sell');
  });
});
