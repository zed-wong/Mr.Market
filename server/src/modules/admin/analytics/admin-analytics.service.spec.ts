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
      {
        trackingKey: 'track-2',
        orderId: 'order-1',
        strategyKey: '**********',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-2',
        clientOrderId: 'client-2',
        side: 'sell',
        price: '101',
        qty: '0.01000000',
        cumulativeFilledQty: '0',
        status: 'canceled',
        createdAt: ts(6),
        updatedAt: ts(7),
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
    const performanceService = {
      getOrderPerformance: jest.fn(async () => ({
        series: [
          {
            t: ts(2),
            realized: '0',
            fees: '0',
            net: '0',
          },
          {
            t: ts(3),
            realized: '10',
            fees: '1',
            net: '9',
          },
        ],
        summary: {
          realizedPnlQuote: '10',
          feesQuote: '1',
          netPnlQuote: '9',
          tradedQuoteVolume: '210',
          effectiveSpreadBps: '476.19047619047619048',
          fillCount: 2,
          otherFees: [],
          inventoryBaseQty: '0.5',
          inventoryCostQuote: '50',
          inventoryAverageCostQuote: '100',
        },
      })),
    };

    return {
      service: new AdminAnalyticsService(
        ledger.repository as any,
        balances.repository as any,
        trackedOrders.repository as any,
        intents.repository as any,
        executions.repository as any,
        orderBookTracker as any,
        performanceService as any,
      ),
      repositories: { ledger, balances, trackedOrders, intents, executions },
      orderBookTracker,
      performanceService,
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
      trackedOrders: 2,
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

  it('exposes required per-order PNL, inventory, spread, drawdown, and timeline metrics using live mid', async () => {
    const { service, performanceService } = buildService();

    const result = await service.getFoundation({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(performanceService.getOrderPerformance).toHaveBeenCalledWith(
      'order-1',
    );
    expect(result.analytics.perOrder).toMatchObject({
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      markPrice: {
        status: 'available',
        value: '100.15',
        currency: 'USDT',
        source: 'order_book_mid',
        unavailableReason: null,
      },
      pnl: {
        realized: {
          status: 'available',
          value: '10',
          currency: 'USDT',
          unavailableReason: null,
        },
        unrealized: {
          status: 'available',
          value: '0.075',
          currency: 'USDT',
          unavailableReason: null,
        },
        net: {
          status: 'available',
          value: '9.075',
          currency: 'USDT',
          unavailableReason: null,
        },
      },
      fees: {
        total: {
          status: 'available',
          value: '1',
          currency: 'USDT',
          unavailableReason: null,
        },
      },
      inventoryExposure: {
        quantity: {
          status: 'available',
          value: '0.5',
          currency: 'BTC',
          unavailableReason: null,
        },
        notional: {
          status: 'available',
          value: '50.075',
          currency: 'USDT',
          unavailableReason: null,
        },
      },
      spreadCapture: {
        quote: {
          status: 'available',
          value: '10',
          currency: 'USDT',
          unavailableReason: null,
        },
        effectiveSpreadBps: '476.19047619047619048',
      },
      drawdown: {
        status: 'available',
        maxDrawdownQuote: '0',
      },
    });
    expect(result.analytics.perOrder.timeline.events.map((event) => event.type))
      .toEqual(expect.arrayContaining(['quote', 'fill', 'cancel']));
  });

  it('returns mark-dependent per-order metrics as unavailable when live mid is missing', async () => {
    const { service, orderBookTracker } = buildService();

    orderBookTracker.getOrderBook.mockReturnValueOnce(undefined);
    orderBookTracker.getLastUpdateAt.mockReturnValueOnce(undefined);
    orderBookTracker.isStale.mockReturnValueOnce(true);

    const result = await service.getFoundation({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.analytics.perOrder.pnl.realized).toMatchObject({
      status: 'available',
      value: '10',
    });
    expect(result.analytics.perOrder.fees.total).toMatchObject({
      status: 'available',
      value: '1',
    });
    expect(result.analytics.perOrder.pnl.unrealized).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-unavailable',
    });
    expect(result.analytics.perOrder.pnl.net).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-unavailable',
    });
    expect(result.analytics.perOrder.inventoryExposure.notional).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-unavailable',
    });
    expect(JSON.stringify(result.analytics.perOrder.pnl.unrealized)).not.toContain(
      '"0"',
    );
    expect(result.analytics.perOrder.timeline.events.length).toBeGreaterThan(0);
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
