import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';

describe('ExchangeOrderTrackerService', () => {
  it('upserts order states and returns open orders by strategy', async () => {
    const service = new ExchangeOrderTrackerService();

    service.upsertOrder({
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    service.upsertOrder({
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-2',
      side: 'sell',
      price: '101',
      qty: '1',
      status: 'filled',
      updatedAt: '2026-02-11T00:00:01.000Z',
    });

    const openOrders = service.getOpenOrders('u1-c1-pureMarketMaking');

    expect(openOrders).toHaveLength(1);
    expect(openOrders[0].exchangeOrderId).toBe('ex-1');
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
      strategyKey: 'u1-c1-pureMarketMaking',
      exchange: 'binance',
      pair: 'BTC/USDT',
      exchangeOrderId: 'ex-1',
      side: 'buy',
      price: '100',
      qty: '1',
      status: 'open',
      updatedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.onTick('2026-02-11T00:00:01.000Z');

    const tracked = service.getByExchangeOrderId('ex-1');

    expect(tracked?.status).toBe('filled');
  });
});
