import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { FillRoutingService } from '../execution/fill-routing.service';
import { ExecutorRegistry } from '../strategy/execution/executor-registry';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';
import { PrivateStreamTrackerService } from './private-stream-tracker.service';

describe('PrivateStreamTrackerService', () => {
  it('skips non-fill events and still tracks the latest account event', async () => {
    const fillRoutingService = {
      resolveOrderForFill: jest.fn(),
    } as unknown as FillRoutingService;
    const service = new PrivateStreamTrackerService(
      undefined,
      fillRoutingService,
      undefined,
      undefined,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'read-only',
      eventType: 'balance_update',
      payload: { asset: 'USDT', free: '100' },
      receivedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.onTick('2026-02-11T00:00:01.000Z');

    expect(fillRoutingService.resolveOrderForFill).not.toHaveBeenCalled();
    expect(service.getLatestEvent('binance', 'read-only')?.eventType).toBe(
      'balance_update',
    );
    expect(service.getOrphanedFills()).toEqual([]);
  });

  it('skips fill-like events that have no routing identifiers', async () => {
    const fillRoutingService = {
      resolveOrderForFill: jest.fn(),
    } as unknown as FillRoutingService;
    const service = new PrivateStreamTrackerService(
      undefined,
      fillRoutingService,
      undefined,
      undefined,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'fill',
      payload: {
        status: 'filled',
        symbol: 'BTC/USDT',
      },
      receivedAt: '2026-03-11T00:00:00.000Z',
    });

    await service.onTick('2026-03-11T00:00:01.000Z');

    expect(fillRoutingService.resolveOrderForFill).not.toHaveBeenCalled();
    expect(service.getOrphanedFills()).toEqual([]);
  });

  it('routes parseable fill events via clientOrderId', async () => {
    const onFill = jest.fn();
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          seq: 0,
          source: 'clientOrderId',
        }),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        findExecutorByOrderId: jest.fn().mockReturnValue({
          getSession: jest.fn().mockReturnValue({ accountLabel: 'default' }),
          onFill,
        }),
      } as unknown as ExecutorRegistry,
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
    expect(service.getOrphanedFills()).toEqual([]);
  });

  it('routes via exchangeOrderId tracker fallback when fill resolution returns null', async () => {
    const onFill = jest.fn();
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue(null),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue({
          orderId: 'legacy-order',
          strategyKey: 'strategy-1',
          exchange: 'binance',
          pair: 'BTC/USDT',
          exchangeOrderId: 'ex-123',
          clientOrderId: 'legacy-client-oid',
          side: 'buy',
          price: '100',
          qty: '1',
          status: 'open',
          updatedAt: '2026-03-11T00:00:00.000Z',
        }),
        upsertOrder: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        getExecutor: jest.fn().mockReturnValue({
          getSession: jest.fn().mockReturnValue({ accountLabel: 'default' }),
          onFill,
        }),
      } as unknown as ExecutorRegistry,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'execution',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'filled',
      },
      receivedAt: '2026-03-11T00:00:02.000Z',
    });

    await service.onTick('2026-03-11T00:00:03.000Z');

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-123',
        clientOrderId: 'legacy-client-oid',
      }),
    );
    expect(service.getOrphanedFills()).toEqual([]);
  });

  it('records orphaned fills when routing cannot resolve an order', async () => {
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue(null),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        getExecutor: jest.fn().mockReturnValue(undefined),
        findExecutorByOrderId: jest.fn().mockReturnValue(undefined),
      } as unknown as ExecutorRegistry,
    );
    const logger = Reflect.get(service, 'logger') as CustomLogger;
    const warnSpy = jest
      .spyOn(logger, 'warn')
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
        accountLabel: 'default',
        pair: 'BTC/USDT',
        clientOrderId: 'legacy-client-oid',
        exchangeOrderId: 'ex-missing',
        reason: 'unresolved_order',
      }),
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('records orphaned fills when the executor cannot be found', async () => {
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          seq: 0,
          source: 'clientOrderId',
        }),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        findExecutorByOrderId: jest.fn().mockReturnValue(undefined),
      } as unknown as ExecutorRegistry,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      eventType: 'fill',
      payload: {
        clientOrderId: 'order-1:0',
        status: 'filled',
      },
      receivedAt: '2026-03-11T00:00:06.000Z',
    });

    await service.onTick('2026-03-11T00:00:07.000Z');

    expect(service.getOrphanedFills()).toEqual([
      expect.objectContaining({
        orderId: 'order-1',
        reason: 'missing_executor',
      }),
    ]);
  });

  it('caps orphaned fills at 100 entries and evicts the oldest', async () => {
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue(null),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        getExecutor: jest.fn().mockReturnValue(undefined),
      } as unknown as ExecutorRegistry,
    );

    for (let index = 0; index < 101; index += 1) {
      service.queueAccountEvent({
        exchange: 'binance',
        accountLabel: 'default',
        eventType: 'fill',
        payload: {
          clientOrderId: `legacy-${index}`,
          exchangeOrderId: `ex-${index}`,
          symbol: 'BTC/USDT',
          status: 'filled',
        },
        receivedAt: `2026-03-11T00:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }

    await service.onTick('2026-03-11T00:02:00.000Z');

    const orphaned = service.getOrphanedFills();

    expect(orphaned).toHaveLength(100);
    expect(orphaned[0]?.clientOrderId).toBe('legacy-1');
    expect(orphaned.some((fill) => fill.clientOrderId === 'legacy-0')).toBe(
      false,
    );
  });

  it('rejects fills that cross account boundaries', async () => {
    const onFill = jest.fn();
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue({
          orderId: 'order-1',
          seq: 0,
          source: 'clientOrderId',
        }),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        findExecutorByOrderId: jest.fn().mockReturnValue({
          getSession: jest.fn().mockReturnValue({ accountLabel: 'account-B' }),
          onFill,
        }),
      } as unknown as ExecutorRegistry,
    );
    const logger = Reflect.get(service, 'logger') as CustomLogger;
    const warnSpy = jest
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'account-A',
      eventType: 'fill',
      payload: {
        clientOrderId: 'order-1:0',
        exchangeOrderId: 'ex-1',
        symbol: 'BTC/USDT',
        status: 'filled',
      },
      receivedAt: '2026-03-11T00:00:08.000Z',
    });

    await service.onTick('2026-03-11T00:00:09.000Z');

    expect(onFill).not.toHaveBeenCalled();
    expect(service.getOrphanedFills()).toEqual([
      expect.objectContaining({
        accountLabel: 'account-A',
        orderId: 'order-1',
        reason: 'account_boundary_violation',
      }),
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('updates tracked order status when fill events change exchange order state', async () => {
    const upsertOrder = jest.fn();
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue({
          orderId: 'legacy-order',
          source: 'exchangeOrderMapping',
        }),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue({
          orderId: 'legacy-order',
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
      } as unknown as ExchangeOrderTrackerService,
      {
        getExecutor: jest.fn().mockReturnValue({
          getSession: jest.fn().mockReturnValue({ accountLabel: 'default' }),
          onFill: jest.fn().mockResolvedValue(undefined),
        }),
        findExecutorByOrderId: jest.fn().mockReturnValue(undefined),
      } as unknown as ExecutorRegistry,
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
      receivedAt: '2026-03-11T00:00:10.000Z',
    });

    await service.onTick('2026-03-11T00:00:11.000Z');

    expect(upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-1',
        status: 'filled',
        updatedAt: '2026-03-11T00:00:10.000Z',
      }),
    );
  });

  it('processes queued fill events in FIFO order and keeps the latest event by account', async () => {
    const processed: string[] = [];
    const service = new PrivateStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockImplementation(async (input) => ({
          orderId: String(input.clientOrderId).split(':')[0],
          seq: 0,
          source: 'clientOrderId',
        })),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        findExecutorByOrderId: jest
          .fn()
          .mockImplementation((orderId: string) => ({
            getSession: jest.fn().mockReturnValue({ accountLabel: 'default' }),
            onFill: jest.fn(async () => {
              processed.push(orderId);
            }),
          })),
      } as unknown as ExecutorRegistry,
    );

    for (let index = 0; index < 5; index += 1) {
      service.queueAccountEvent({
        exchange: 'binance',
        accountLabel: 'default',
        eventType: 'fill',
        payload: {
          clientOrderId: `order-${index}:0`,
          exchangeOrderId: `ex-${index}`,
          symbol: 'BTC/USDT',
          status: 'filled',
        },
        receivedAt: `2026-03-11T00:00:${String(index).padStart(2, '0')}.000Z`,
      });
    }

    await service.onTick('2026-03-11T00:00:20.000Z');

    expect(processed).toEqual([
      'order-0',
      'order-1',
      'order-2',
      'order-3',
      'order-4',
    ]);
    expect(service.getLatestEvent('binance', 'default')?.payload).toEqual(
      expect.objectContaining({
        clientOrderId: 'order-4:0',
      }),
    );
  });
});
