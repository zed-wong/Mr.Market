import { CustomLogger } from 'src/modules/infrastructure/logger/logger.service';

import { BalanceStateCacheService } from '../balance-state/balance-state-cache.service';
import { MarketMakingEventBus } from '../events/market-making-event-bus.service';
import { FillRoutingService } from '../execution/fill-routing.service';
import { ExecutorRegistry } from '../strategy/execution/executor-registry';
import { ExchangeOrderTrackerService } from './exchange-order-tracker.service';
import { UserStreamTrackerService } from './user-stream-tracker.service';

describe('UserStreamTrackerService', () => {
  it('applies normalized balance events into the balance cache', async () => {
    const balanceStateCacheService = new BalanceStateCacheService();
    const service = new UserStreamTrackerService(
      undefined,
      undefined,
      undefined,
      undefined,
      balanceStateCacheService,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'maker',
      kind: 'balance',
      payload: {
        asset: 'USDT',
        free: '100',
        used: '5',
        total: '105',
        source: 'ws',
      },
      receivedAt: '2026-04-14T00:00:00.000Z',
    });

    await service.onTick('2026-04-14T00:00:01.000Z');

    expect(
      balanceStateCacheService.getBalance('binance', 'maker', 'USDT'),
    ).toEqual(
      expect.objectContaining({
        free: '100',
        used: '5',
        total: '105',
        source: 'ws',
      }),
    );
  });

  it('skips non-fill events and still tracks the latest account event', async () => {
    const fillRoutingService = {
      resolveOrderForFill: jest.fn(),
    } as unknown as FillRoutingService;
    const service = new UserStreamTrackerService(
      undefined,
      fillRoutingService,
      undefined,
      undefined,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'read-only',
      kind: 'balance',
      payload: { asset: 'USDT', free: '100', source: 'ws' },
      receivedAt: '2026-02-11T00:00:00.000Z',
    });

    await service.onTick('2026-02-11T00:00:01.000Z');

    expect(fillRoutingService.resolveOrderForFill).not.toHaveBeenCalled();
    expect(service.getLatestEvent('binance', 'read-only')?.kind).toBe(
      'balance',
    );
    expect(service.getOrphanedFills()).toEqual([]);
  });

  it('skips fill-like events that have no routing identifiers', async () => {
    const fillRoutingService = {
      resolveOrderForFill: jest.fn(),
    } as unknown as FillRoutingService;
    const service = new UserStreamTrackerService(
      undefined,
      fillRoutingService,
      undefined,
      undefined,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'trade',
      payload: {
        pair: 'BTC/USDT',
        qty: '1',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:00.000Z',
    });

    await service.onTick('2026-03-11T00:00:01.000Z');

    expect(fillRoutingService.resolveOrderForFill).not.toHaveBeenCalled();
    expect(service.getOrphanedFills()).toEqual([]);
  });

  it('routes parseable fill events via clientOrderId', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
      kind: 'trade',
      payload: {
        clientOrderId: 'order-1:0',
        qty: '1',
        raw: {},
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

  it('deduplicates repeated normalized trade events for the same fill', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
      kind: 'trade',
      payload: {
        pair: 'BTC/USDT',
        exchangeOrderId: 'ex-123',
        clientOrderId: 'order-1:0',
        fillId: 'fill-1',
        side: 'buy',
        qty: '1',
        cumulativeQty: '1',
        price: '100',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:00.000Z',
    });
    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'trade',
      payload: {
        pair: 'BTC/USDT',
        exchangeOrderId: 'ex-123',
        clientOrderId: 'order-1:0',
        fillId: 'fill-1',
        side: 'buy',
        qty: '1',
        cumulativeQty: '1',
        price: '100',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:01.000Z',
    });

    await service.onTick('2026-03-11T00:00:02.000Z');

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(service.getDuplicateFillSuppressionCount()).toBe(1);
  });

  it('suppresses order-derived cumulative fills after the same trade fill was already routed', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
      kind: 'trade',
      payload: {
        pair: 'BTC/USDT',
        exchangeOrderId: 'ex-123',
        clientOrderId: 'order-1:0',
        fillId: 'fill-1',
        side: 'buy',
        qty: '1',
        cumulativeQty: '1',
        price: '100',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:00.000Z',
    });
    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'order',
      payload: {
        pair: 'BTC/USDT',
        exchangeOrderId: 'ex-123',
        clientOrderId: 'order-1:0',
        side: 'buy',
        status: 'filled',
        cumulativeQty: '1',
        price: '100',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:01.000Z',
    });

    await service.onTick('2026-03-11T00:00:02.000Z');

    expect(onFill).toHaveBeenCalledTimes(1);
    expect(service.getDuplicateFillSuppressionCount()).toBe(1);
  });

  it('reports queue depth for diagnostics', () => {
    const service = new UserStreamTrackerService();

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'balance',
      payload: { asset: 'USDT', free: '100', source: 'ws' },
      receivedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(service.getQueueDepth()).toBeGreaterThanOrEqual(1);
  });

  it('emits stream.health-changed when an account recovers and later degrades', async () => {
    const marketMakingEventBus = new MarketMakingEventBus();
    const emitStreamHealthChangedSpy = jest.spyOn(
      marketMakingEventBus,
      'emitStreamHealthChanged',
    );
    const service = new UserStreamTrackerService(
      undefined,
      undefined,
      {
        markUserStreamActivity: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      undefined,
      undefined,
      marketMakingEventBus,
    );
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(Date.parse('2026-04-18T00:00:00.000Z'));
    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'maker',
      kind: 'balance',
      payload: {
        asset: 'USDT',
        free: '100',
        source: 'ws',
      },
      receivedAt: '2026-04-18T00:00:00.000Z',
    });

    await service.onTick('2026-04-18T00:00:01.000Z');

    nowSpy.mockReturnValue(Date.parse('2026-04-18T00:00:20.000Z'));
    await service.onTick('2026-04-18T00:00:20.000Z');

    expect(emitStreamHealthChangedSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        exchange: 'binance',
        accountLabel: 'maker',
        previousHealth: undefined,
        health: 'healthy',
      }),
    );
    expect(emitStreamHealthChangedSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        exchange: 'binance',
        accountLabel: 'maker',
        previousHealth: 'healthy',
        health: 'degraded',
      }),
    );
  });

  it('routes via exchangeOrderId tracker fallback when fill resolution returns null', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'filled',
        cumulativeQty: '1',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:02.000Z',
    });

    await service.onTick('2026-03-11T00:00:03.000Z');

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'legacy-order',
        exchangeOrderId: 'ex-123',
        clientOrderId: 'legacy-client-oid',
      }),
    );
    expect(service.getOrphanedFills()).toEqual([]);
  });

  it('records orphaned fills when routing cannot resolve an order', async () => {
    const service = new UserStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue(null),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
        markUserStreamActivity: jest.fn(),
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
      kind: 'trade',
      payload: {
        clientOrderId: 'legacy-client-oid',
        exchangeOrderId: 'ex-missing',
        pair: 'BTC/USDT',
        qty: '1',
        raw: {},
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
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        findExecutorByOrderId: jest.fn().mockReturnValue(undefined),
      } as unknown as ExecutorRegistry,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'trade',
      payload: {
        clientOrderId: 'order-1:0',
        qty: '1',
        raw: {},
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
    const service = new UserStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue(null),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockReturnValue(undefined),
        upsertOrder: jest.fn(),
        markUserStreamActivity: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      {
        getExecutor: jest.fn().mockReturnValue(undefined),
      } as unknown as ExecutorRegistry,
    );

    for (let index = 0; index < 101; index += 1) {
      service.queueAccountEvent({
        exchange: 'binance',
        accountLabel: 'default',
        kind: 'trade',
        payload: {
          clientOrderId: `legacy-${index}`,
          exchangeOrderId: `ex-${index}`,
          pair: 'BTC/USDT',
          qty: '1',
          raw: {},
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
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
      kind: 'trade',
      payload: {
        clientOrderId: 'order-1:0',
        exchangeOrderId: 'ex-1',
        pair: 'BTC/USDT',
        qty: '1',
        raw: {},
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
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-1',
        clientOrderId: 'legacy-client-oid',
        status: 'closed',
        raw: {},
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
      'ws',
    );
  });

  it('processes queued fill events in FIFO order and keeps the latest event by account', async () => {
    const processed: string[] = [];
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
        kind: 'trade',
        payload: {
          clientOrderId: `order-${index}:0`,
          exchangeOrderId: `ex-${index}`,
          pair: 'BTC/USDT',
          qty: '1',
          raw: {},
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

  it('converts cumulative filled updates into incremental fill qty before routing', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
          qty: '5',
          cumulativeFilledQty: '1',
          status: 'partially_filled',
          updatedAt: '2026-03-11T00:00:00.000Z',
        }),
        upsertOrder: jest.fn(),
        markUserStreamActivity: jest.fn(),
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
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'partially_filled',
        cumulativeQty: '2',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:03.000Z',
    });

    await service.onTick('2026-03-11T00:00:04.000Z');

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'legacy-order',
        qty: '1',
        cumulativeQty: '2',
      }),
    );
  });

  it('drops duplicate cumulative filled updates that do not advance filled qty', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
          qty: '5',
          cumulativeFilledQty: '2',
          status: 'partially_filled',
          updatedAt: '2026-03-11T00:00:00.000Z',
        }),
        upsertOrder: jest.fn(),
        markUserStreamActivity: jest.fn(),
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
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'partially_filled',
        cumulativeQty: '2',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:03.000Z',
    });

    await service.onTick('2026-03-11T00:00:04.000Z');

    expect(onFill).not.toHaveBeenCalled();
  });

  it('routes only positive deltas across a cumulative fill progression', async () => {
    const onFill = jest.fn();
    let cumulativeFilledQty = '0';
    const service = new UserStreamTrackerService(
      undefined,
      {
        resolveOrderForFill: jest.fn().mockResolvedValue(null),
      } as unknown as FillRoutingService,
      {
        getByExchangeOrderId: jest.fn().mockImplementation(() => ({
          orderId: 'legacy-order',
          strategyKey: 'strategy-1',
          exchange: 'binance',
          pair: 'BTC/USDT',
          exchangeOrderId: 'ex-123',
          clientOrderId: 'legacy-client-oid',
          side: 'buy',
          price: '100',
          qty: '5',
          cumulativeFilledQty,
          status: 'partially_filled',
          updatedAt: '2026-03-11T00:00:00.000Z',
        })),
        upsertOrder: jest.fn().mockImplementation((order) => {
          cumulativeFilledQty =
            order.cumulativeFilledQty || cumulativeFilledQty;
        }),
        markUserStreamActivity: jest.fn(),
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
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'partially_filled',
        cumulativeQty: '1',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:01.000Z',
    });
    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'partially_filled',
        cumulativeQty: '2',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:02.000Z',
    });
    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'partially_filled',
        cumulativeQty: '2',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:03.000Z',
    });

    await service.onTick('2026-03-11T00:00:04.000Z');

    expect(onFill).toHaveBeenCalledTimes(2);
    expect(onFill).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        qty: '1',
        cumulativeQty: '1',
      }),
    );
    expect(onFill).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        qty: '1',
        cumulativeQty: '2',
      }),
    );
  });

  it('tracks lastRecvTime when account events are queued', () => {
    const service = new UserStreamTrackerService(
      undefined,
      undefined,
      undefined,
      undefined,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'balance',
      payload: { asset: 'USDT', free: '100', source: 'ws' },
      receivedAt: '2026-02-11T00:00:00.000Z',
    });

    const lastRecvTime = service.getLastRecvTime('binance', 'default');

    expect(typeof lastRecvTime).toBe('number');
    expect(lastRecvTime).toBeGreaterThan(0);
  });

  it('reports silent when no events received within threshold', () => {
    const service = new UserStreamTrackerService(
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(service.isSilent('binance', 'unknown', 5000)).toBe(true);

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'balance',
      payload: { asset: 'USDT', free: '100', source: 'ws' },
      receivedAt: '2026-02-11T00:00:00.000Z',
    });

    expect(service.isSilent('binance', 'default', 5000)).toBe(false);
  });

  it('processes events immediately without waiting for tick', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
        markUserStreamActivity: jest.fn(),
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
      kind: 'trade',
      payload: {
        clientOrderId: 'order-1:0',
        qty: '1',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:00.000Z',
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(onFill).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        clientOrderId: 'order-1:0',
      }),
    );
  });

  it('applies non-fill order state updates immediately without waiting for tick', async () => {
    const upsertOrder = jest.fn();
    const service = new UserStreamTrackerService(
      undefined,
      undefined,
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
        markUserStreamActivity: jest.fn(),
      } as unknown as ExchangeOrderTrackerService,
      undefined,
    );

    service.queueAccountEvent({
      exchange: 'binance',
      accountLabel: 'default',
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-1',
        clientOrderId: 'legacy-client-oid',
        status: 'cancelled',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:10.000Z',
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(upsertOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeOrderId: 'ex-1',
        status: 'cancelled',
        updatedAt: '2026-03-11T00:00:10.000Z',
      }),
      'ws',
    );
  });

  it('ignores cumulative filled updates that move backwards', async () => {
    const onFill = jest.fn();
    const service = new UserStreamTrackerService(
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
          qty: '5',
          cumulativeFilledQty: '2',
          status: 'partially_filled',
          updatedAt: '2026-03-11T00:00:00.000Z',
        }),
        upsertOrder: jest.fn(),
        markUserStreamActivity: jest.fn(),
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
      kind: 'order',
      payload: {
        exchangeOrderId: 'ex-123',
        status: 'partially_filled',
        cumulativeQty: '1.5',
        raw: {},
      },
      receivedAt: '2026-03-11T00:00:03.000Z',
    });

    await service.onTick('2026-03-11T00:00:04.000Z');

    expect(onFill).not.toHaveBeenCalled();
  });
});
