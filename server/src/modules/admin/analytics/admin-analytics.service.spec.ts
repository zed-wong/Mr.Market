import { BadRequestException } from '@nestjs/common';

import { AdminAnalyticsService } from './admin-analytics.service';

const ts = (minute: number) =>
  `2026-06-04T00:${String(minute).padStart(2, '0')}:00.000Z`;

function createQueryBuilder(rows: Array<Record<string, any>>) {
  const builder = {
    clauses: [] as Array<{ sql: string; params?: Record<string, unknown> }>,
    orderBys: [] as Array<{ field: string; direction: 'ASC' | 'DESC' }>,
    takeValue: undefined as number | undefined,
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
      builder.clauses.push({ sql, params });

      return builder;
    }),
    orderBy: jest.fn((field: string, direction: 'ASC' | 'DESC') => {
      builder.orderBys.push({ field, direction });

      return builder;
    }),
    take: jest.fn((value: number) => {
      builder.takeValue = value;

      return builder;
    }),
    getMany: jest.fn(async () => rows),
  };

  return builder;
}

function createRepository(rows: Array<Record<string, any>>) {
  const builders: ReturnType<typeof createQueryBuilder>[] = [];
  const repository = {
    createQueryBuilder: jest.fn(() => {
      const builder = createQueryBuilder(rows);

      builders.push(builder);

      return builder;
    }),
    save: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
  };

  return { repository, builders };
}

describe('AdminAnalyticsService', () => {
  function buildService() {
    const ledger = createRepository([
      {
        entryId: 'entry-1',
        orderId: 'order-1',
        assetId: 'USDT',
        amount: '0.1',
        type: 'fill_settle',
        refType: 'trade',
        refId: 'trade-1',
        createdAt: ts(2),
      },
      {
        entryId: 'entry-2',
        orderId: 'order-1',
        assetId: 'USDT',
        amount: '0.2',
        type: 'fee_debit',
        refType: 'fee',
        refId: 'fee-1',
        createdAt: ts(3),
      },
    ]);
    const balances = createRepository([
      {
        orderId: 'order-1',
        assetId: 'USDT',
        available: '1.111111111111111111',
        locked: '2.222222222222222222',
        total: '3.333333333333333333',
        realizedDelta: '0.300000000000000000',
        feePaid: '0.00000001',
        updatedAt: ts(4),
      },
    ]);
    const trackedOrders = createRepository([
      {
        trackingKey: 'track-1',
        orderId: 'order-1',
        strategyKey: 'strategy-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-1',
        clientOrderId: 'client-1',
        side: 'buy',
        price: '100.00000001',
        qty: '0.01000000',
        cumulativeFilledQty: '0.00500000',
        status: 'partially_filled',
        createdAt: ts(1),
        updatedAt: ts(5),
      },
    ]);
    const intents = createRepository([
      {
        intentId: 'intent-1',
        strategyKey: 'strategy-1',
        type: 'place',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100.00000001',
        qty: '0.01000000',
        status: 'DONE',
        createdAt: ts(2),
        updatedAt: ts(3),
      },
    ]);
    const executions = createRepository([
      {
        id: 'execution-1',
        orderId: 'order-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        amount: '0.01000000',
        price: '100.00000001',
        strategyType: 'pureMarketMaking',
        status: 'completed',
        executedAt: ts(2),
      },
    ]);
    const orderBookTracker = {
      getOrderBook: jest.fn(() => ({
        bids: [[100.1, 1]],
        asks: [[100.2, 1]],
        sequence: 7,
      })),
      getLastUpdateAt: jest.fn(() => Date.parse(ts(6))),
      isStale: jest.fn(() => false),
      queueSnapshot: jest.fn(),
      stop: jest.fn(),
    };

    return {
      service: new AdminAnalyticsService(
        ledger.repository as any,
        balances.repository as any,
        trackedOrders.repository as any,
        intents.repository as any,
        executions.repository as any,
        orderBookTracker as any,
      ),
      repositories: { ledger, balances, trackedOrders, intents, executions },
      orderBookTracker,
    };
  }

  it('returns read-only projection data with deterministic decimal strings', async () => {
    const { service, repositories, orderBookTracker } = buildService();

    const result = await service.getFoundation({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.scope).toEqual({
      type: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
    });
    expect(result.summary.counts).toEqual({
      ledgerEntries: 2,
      orderBalances: 1,
      trackedOrders: 1,
      strategyOrderIntents: 1,
      strategyExecutions: 1,
      orderBookMids: 1,
    });
    expect(result.summary.ledgerAmountByAsset).toEqual([
      { asset: 'USDT', amount: '0.3' },
    ]);
    expect(result.summary.balanceTotalsByAsset).toEqual([
      {
        asset: 'USDT',
        available: '1.111111111111111111',
        locked: '2.222222222222222222',
        total: '3.333333333333333333',
        realizedDelta: '0.3',
        feePaid: '0.00000001',
      },
    ]);
    expect(result.sources.orderBookMids[0]).toMatchObject({
      exchange: 'binance',
      pair: 'BTC/USDT',
      midPrice: '100.15',
      bestBid: '100.1',
      bestAsk: '100.2',
      sequence: 7,
      stale: false,
      unavailableReason: null,
    });
    expect(JSON.stringify(result)).not.toContain('0.30000000000000004');
    expect(JSON.stringify(result)).not.toContain('user-');

    for (const source of Object.values(repositories)) {
      expect(source.repository.save).not.toHaveBeenCalled();
      expect(source.repository.update).not.toHaveBeenCalled();
      expect(source.repository.insert).not.toHaveBeenCalled();
      expect(source.repository.delete).not.toHaveBeenCalled();
      expect(source.repository.remove).not.toHaveBeenCalled();
    }
    expect(orderBookTracker.getOrderBook).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
    );
    expect(orderBookTracker.queueSnapshot).not.toHaveBeenCalled();
    expect(orderBookTracker.stop).not.toHaveBeenCalled();
  });

  it('honors scope, range, and filters across projection queries', async () => {
    const { service, repositories } = buildService();

    const result = await service.getFoundation({
      scope: 'pair',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(1),
      endAt: ts(9),
      limit: '10',
    });

    const trackedQuery = repositories.trackedOrders.builders[0];
    const ledgerQuery = repositories.ledger.builders[0];
    const balanceQuery = repositories.balances.builders[0];
    const intentQuery = repositories.intents.builders[0];
    const executionQuery = repositories.executions.builders[0];

    expect(trackedQuery.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: { startedAt: ts(1), endedAt: ts(9) },
        }),
        expect.objectContaining({ params: { exchange: 'binance' } }),
        expect.objectContaining({ params: { pair: 'BTC/USDT' } }),
      ]),
    );
    expect(ledgerQuery.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { orderIds: ['order-1'] } }),
      ]),
    );
    expect(balanceQuery.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { orderIds: ['order-1'] } }),
      ]),
    );
    expect(intentQuery.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { exchange: 'binance' } }),
        expect.objectContaining({ params: { pair: 'BTC/USDT' } }),
      ]),
    );
    expect(executionQuery.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { exchange: 'binance' } }),
        expect.objectContaining({ params: { pair: 'BTC/USDT' } }),
      ]),
    );
    expect(trackedQuery.takeValue).toBe(10);
    expect(result.filters).toEqual({
      orderId: null,
      exchange: 'binance',
      pair: 'BTC/USDT',
    });
  });

  it('rejects invalid ranges and unsupported scoped filters deterministically', async () => {
    const { service } = buildService();

    await expect(
      service.getFoundation({ startAt: ts(10), endAt: ts(1) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getFoundation({ scope: 'order' }),
    ).rejects.toThrow('orderId is required');
    await expect(
      service.getFoundation({ scope: 'pair', exchange: 'binance' }),
    ).rejects.toThrow('pair is required');
    await expect(
      service.getFoundation({ exchange: '../../secret' }),
    ).rejects.toThrow('exchange must be a simple bounded identifier');
  });

  it('represents missing order-book mids explicitly without zero fallback', async () => {
    const { service, orderBookTracker } = buildService();

    orderBookTracker.getOrderBook.mockReturnValueOnce(undefined);
    orderBookTracker.getLastUpdateAt.mockReturnValueOnce(undefined);
    orderBookTracker.isStale.mockReturnValueOnce(true);

    const result = await service.getFoundation({
      scope: 'pair',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.sources.orderBookMids[0]).toMatchObject({
      exchange: 'binance',
      pair: 'BTC/USDT',
      midPrice: null,
      bestBid: null,
      bestAsk: null,
      stale: true,
      unavailableReason: 'order-book-mid-unavailable',
    });
  });
});
