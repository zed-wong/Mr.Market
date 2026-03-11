import { PrivateStreamTrackerService } from './private-stream-tracker.service';

describe('PrivateStreamTrackerService', () => {
  it('tracks latest account events by exchange and account label', async () => {
    const service = new PrivateStreamTrackerService();

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'read-only',
      eventType: 'balance_update',
      payload: { asset: 'USDT', free: '100' },
      receivedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.onTick('2026-02-11T00:00:01.000Z');

    const latest = service.getLatestEvent('binance', 'read-only');

    expect(latest?.eventType).toBe('balance_update');
  });

  it('routes parseable fill events to executor by order id fallback', async () => {
    const onFill = jest.fn();
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          seq: 0,
          source: 'clientOrderId',
        }),
      } as any,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as any,
      {
        getExecutor: jest.fn().mockReturnValue(undefined),
        findExecutorByOrderId: jest.fn().mockReturnValue({
          onFill,
        }),
      } as any,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'trade',
      payload: {
        clientOrderId: 'order-1:0',
        status: 'filled',
      },
      receivedAt: '2026-03-11T00:00:00.000Z',
    });

    await service.onTick('2026-03-11T00:00:01.000Z');

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        clientOrderId: 'order-1:0',
      }),
    );
  });

  it('falls back to exchange order tracker pair and updates tracked order status', async () => {
    const upsertOrder = jest.fn();
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue({
          orderId: 'legacy-order',
          source: 'exchangeOrderMapping',
        }),
      } as any,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue({
          strategyKey: 'strategy-1',
          exchange: 'binance',
          pair: 'BTC/USDT',
          exchangeOrderId: 'ex-1',
          clientOrderId: 'legacy-client-oid',
          side: 'buy',
          price: '100',
          qty: '1',
          status: 'open',
          updatedAt: '2026-03-11T00:00:00.000Z',
        }),
        upsertOrder,
      } as any,
      {
        getExecutor: jest.fn().mockReturnValue({
          onFill: jest.fn().mockResolvedValue(undefined),
        }),
        findExecutorByOrderId: jest.fn(),
      } as any,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'execution',
      payload: {
        exchangeOrderId: 'ex-1',
        clientOrderId: 'legacy-client-oid',
        status: 'closed',
      },
      receivedAt: '2026-03-11T00:00:02.000Z',
    });

    await service.onTick('2026-03-11T00:00:03.000Z');

    expect(upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-1',
        status: 'filled',
        updatedAt: '2026-03-11T00:00:02.000Z',
      }),
    );
  });

  it('records orphaned fills for manual review when routing fails', async () => {
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue(null),
      } as any,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as any,
      {
        getExecutor: jest.fn().mockReturnValue(undefined),
        findExecutorByOrderId: jest.fn().mockReturnValue(undefined),
      } as any,
    );
    const warnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'fill',
      payload: {
        clientOrderId: 'legacy-client-oid',
        exchangeOrderId: 'ex-missing',
        symbol: 'BTC/USDT',
        status: 'filled',
      },
      receivedAt: '2026-03-11T00:00:04.000Z',
    });

    await service.onTick('2026-03-11T00:00:05.000Z');

    expect(service.getOrphanedFills()).toEqual([
      expect.objectContaining({
        exchange: 'binance',
        pair: 'BTC/USDT',
        clientOrderId: 'legacy-client-oid',
        exchangeOrderId: 'ex-missing',
        reason: 'unresolved_order',
      }),
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
