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
    const marketMakingOrders = createRepository([
      {
        orderId: 'order-1',
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        source: 'admin_direct',
        state: 'active',
        createdAt: ts(0),
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
        metadata: {
          decisionId: 'decision-1',
          quotes: [
            {
              side: 'buy',
              price: '100.00000001',
              quantity: '0.01000000',
            },
          ],
          risk: {
            inventorySkew: '0.12',
          },
        },
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
        marketMakingOrders.repository as any,
        trackedOrders.repository as any,
        intents.repository as any,
        executions.repository as any,
        orderBookTracker as any,
        performanceService as any,
      ),
      repositories: {
        ledger,
        balances,
        marketMakingOrders,
        trackedOrders,
        intents,
        executions,
      },
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
      marketMakingOrders: 1,
      directMarketMakingOrders: 1,
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
    expect(
      result.analytics.perOrder.timeline.events.map((event) => event.type),
    ).toEqual(expect.arrayContaining(['quote', 'fill', 'cancel']));
  });

  it('merges timeline events with deterministic ordering, stable source refs, and range-scoped queries', async () => {
    const { service, repositories } = buildService();

    const result = await service.getFoundation({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.analytics.perOrder.timeline.events).toEqual([
      expect.objectContaining({
        id: 'execution:execution-1',
        type: 'decision',
        at: ts(2),
        source: 'strategy_execution_history',
        sourceId: 'execution-1',
        metadata: {
          decisionId: 'decision-1',
          quotes: [
            {
              side: 'buy',
              price: '100.00000001',
              quantity: '0.01000000',
            },
          ],
          risk: {
            inventorySkew: '0.12',
          },
        },
        sourceRef: {
          type: 'strategy_execution_history',
          id: 'execution-1',
        },
      }),
      expect.objectContaining({
        id: 'intent:intent-1',
        type: 'quote',
        at: ts(2),
        source: 'strategy_order_intent',
        sourceId: 'intent-1',
        sourceRef: {
          type: 'strategy_order_intent',
          id: 'intent-1',
        },
      }),
      expect.objectContaining({
        id: 'ledger:entry-1',
        type: 'fill',
        at: ts(2),
        source: 'ledger_entry',
        sourceId: 'entry-1',
        sourceRef: {
          type: 'ledger_entry',
          id: 'entry-1',
        },
      }),
      expect.objectContaining({
        id: 'tracked:track-1:fill',
        type: 'fill',
        at: ts(5),
        source: 'tracked_order',
        sourceId: 'track-1',
        sourceRef: {
          type: 'tracked_order',
          id: 'track-1',
        },
      }),
      expect.objectContaining({
        id: 'tracked:track-2:cancel',
        type: 'cancel',
        at: ts(7),
        source: 'tracked_order',
        sourceId: 'track-2',
        sourceRef: {
          type: 'tracked_order',
          id: 'track-2',
        },
      }),
    ]);
    expect(
      result.analytics.perOrder.timeline.events.map((event) => event.id),
    ).toEqual([
      'execution:execution-1',
      'intent:intent-1',
      'ledger:entry-1',
      'tracked:track-1:fill',
      'tracked:track-2:cancel',
    ]);
    expect(repositories.trackedOrders.builders[0].clauses).toContainEqual(
      expect.objectContaining({
        sql: 'trackedOrder.updatedAt BETWEEN :startedAt AND :endedAt',
        params: { startedAt: ts(0), endedAt: ts(10) },
      }),
    );
    expect(repositories.intents.builders[0].clauses).toContainEqual(
      expect.objectContaining({
        sql: 'intent.createdAt BETWEEN :startedAt AND :endedAt',
        params: { startedAt: ts(0), endedAt: ts(10) },
      }),
    );
    expect(repositories.executions.builders[0].clauses).toContainEqual(
      expect.objectContaining({
        sql: 'execution.executedAt BETWEEN :startedAt AND :endedAt',
        params: { startedAt: ts(0), endedAt: ts(10) },
      }),
    );
    expect(result.sources.strategyExecutions[0]).toMatchObject({
      id: 'execution-1',
      metadata: {
        decisionId: 'decision-1',
        risk: {
          inventorySkew: '0.12',
        },
      },
    });
  });

  it('treats stale order-book snapshots as unavailable for mark-dependent analytics', async () => {
    const { service, orderBookTracker } = buildService();

    orderBookTracker.isStale.mockReturnValueOnce(true);

    const result = await service.getFoundation({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.sources.orderBookMids[0]).toMatchObject({
      exchange: 'binance',
      pair: 'BTC/USDT',
      midPrice: null,
      bestBid: '100.1',
      bestAsk: '100.2',
      stale: true,
      unavailableReason: 'order-book-mid-stale',
    });
    expect(result.analytics.perOrder.markPrice).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-stale',
      stale: true,
    });
    expect(result.analytics.perOrder.pnl.unrealized).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-stale',
    });
    expect(result.analytics.perOrder.pnl.net).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-stale',
    });
    expect(result.analytics.perOrder.inventoryExposure.notional).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-stale',
    });
    expect(result.analytics.perOrder.pnl.realized).toMatchObject({
      status: 'available',
      value: '10',
    });
    expect(result.analytics.perOrder.fees.total).toMatchObject({
      status: 'available',
      value: '1',
    });
  });

  it('returns a Direct Market Making dashboard DTO with cost and revenue fields for a complete order', async () => {
    const { service } = buildService();

    const result = await service.getDirectMarketMakingDashboard({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.dashboard).toMatchObject({
      scope: {
        type: 'order',
        orderId: 'order-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
      },
      costRevenue: {
        spreadCapture: {
          status: 'available',
          value: '10',
          currency: 'USDT',
        },
        feeCost: {
          status: 'available',
          value: '1',
          currency: 'USDT',
        },
        inventorySkew: {
          status: 'available',
          quantity: {
            status: 'available',
            value: '0.5',
            currency: 'BTC',
          },
          notional: {
            status: 'available',
            value: '50.075',
            currency: 'USDT',
          },
        },
        realizedPnl: {
          status: 'available',
          value: '10',
          currency: 'USDT',
        },
        unrealizedPnl: {
          status: 'available',
          value: '0.075',
          currency: 'USDT',
        },
        netPnl: {
          status: 'available',
          value: '9.075',
          currency: 'USDT',
        },
        fillRate: {
          status: 'available',
          value: '0.5',
          filledQuotes: 1,
          totalQuotes: 2,
          denominator: {
            source: 'tracked_orders',
            filledSource: 'tracked_orders',
            eligibleTrackedOrders: 2,
            eligibleStrategyOrderIntents: 1,
          },
        },
        quoteUptime: {
          status: 'available',
          value: '0.5',
        },
      },
    });
    expect(result.dashboard.sources).toEqual(
      expect.arrayContaining([
        'performance_service_order_performance',
        'tracked_orders',
        'strategy_order_intents',
        'order_book_tracker_mid',
      ]),
    );
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
    expect(
      JSON.stringify(result.analytics.perOrder.pnl.unrealized),
    ).not.toContain('"0"');
    expect(result.analytics.perOrder.timeline.events.length).toBeGreaterThan(0);
  });

  it('returns unavailable Direct Market Making dashboard states when mark price is missing', async () => {
    const { service, orderBookTracker } = buildService();

    orderBookTracker.getOrderBook.mockReturnValueOnce(undefined);
    orderBookTracker.getLastUpdateAt.mockReturnValueOnce(undefined);
    orderBookTracker.isStale.mockReturnValueOnce(true);

    const result = await service.getDirectMarketMakingDashboard({
      scope: 'order',
      orderId: 'order-1',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.dashboard.costRevenue.realizedPnl).toMatchObject({
      status: 'available',
      value: '10',
    });
    expect(result.dashboard.costRevenue.feeCost).toMatchObject({
      status: 'available',
      value: '1',
    });
    expect(result.dashboard.costRevenue.unrealizedPnl).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-unavailable',
    });
    expect(result.dashboard.costRevenue.netPnl).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: 'order-book-mid-unavailable',
    });
    expect(result.dashboard.costRevenue.inventorySkew).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'order-book-mid-unavailable',
      notional: {
        status: 'unavailable',
        value: null,
        unavailableReason: 'order-book-mid-unavailable',
      },
    });
    expect(result.dashboard.costRevenue.fillRate).toMatchObject({
      status: 'available',
      value: '0.5',
    });
    expect(result.dashboard.costRevenue.quoteUptime).toMatchObject({
      status: 'available',
      value: '0.5',
    });
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
    await expect(service.getFoundation({ scope: 'order' })).rejects.toThrow(
      'orderId is required',
    );
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

  it('aggregates per-pair analytics from only matching exchange and pair orders', async () => {
    const trackedOrders = createRepository([
      {
        trackingKey: 'track-btc-1',
        orderId: 'order-1',
        strategyKey: 'strategy-1',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-1',
        clientOrderId: 'client-1',
        side: 'buy',
        price: '100',
        qty: '1',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(1),
        updatedAt: ts(3),
      },
      {
        trackingKey: 'track-btc-2',
        orderId: 'order-2',
        strategyKey: 'strategy-2',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-2',
        clientOrderId: 'client-2',
        side: 'sell',
        price: '110',
        qty: '2',
        cumulativeFilledQty: '2',
        status: 'filled',
        createdAt: ts(4),
        updatedAt: ts(7),
      },
      {
        trackingKey: 'track-eth-control',
        orderId: 'order-control',
        strategyKey: 'strategy-control',
        exchange: 'kraken',
        pair: 'ETH/USDT',
        exchangeOrderId: 'exchange-control',
        clientOrderId: 'client-control',
        side: 'buy',
        price: '200',
        qty: '1',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(2),
        updatedAt: ts(8),
      },
    ]);
    const intents = createRepository([
      {
        intentId: 'intent-btc-1',
        strategyKey: 'strategy-1',
        type: 'place',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
        status: 'DONE',
        createdAt: ts(1),
        updatedAt: ts(1),
      },
      {
        intentId: 'intent-btc-2',
        strategyKey: 'strategy-2',
        type: 'place',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'sell',
        price: '110',
        qty: '2',
        status: 'DONE',
        createdAt: ts(4),
        updatedAt: ts(4),
      },
      {
        intentId: 'intent-control',
        strategyKey: 'strategy-control',
        type: 'place',
        exchange: 'kraken',
        pair: 'ETH/USDT',
        side: 'buy',
        price: '200',
        qty: '1',
        status: 'DONE',
        createdAt: ts(2),
        updatedAt: ts(2),
      },
    ]);
    const performanceService = {
      getOrderPerformance: jest.fn(async (orderId: string) => {
        const performances = {
          'order-1': {
            series: [
              { t: ts(1), realized: '5', fees: '1', net: '4' },
              { t: ts(2), realized: '10', fees: '1', net: '9' },
            ],
            summary: {
              realizedPnlQuote: '10',
              feesQuote: '1',
              netPnlQuote: '9',
              tradedQuoteVolume: '100',
              effectiveSpreadBps: '1000',
              fillCount: 2,
              otherFees: [],
              inventoryBaseQty: '1',
              inventoryCostQuote: '100',
              inventoryAverageCostQuote: '100',
            },
          },
          'order-2': {
            series: [
              { t: ts(1), realized: '1.5', fees: '0.5', net: '1' },
              { t: ts(3), realized: '-2', fees: '0.5', net: '-2.5' },
            ],
            summary: {
              realizedPnlQuote: '-2',
              feesQuote: '0.5',
              netPnlQuote: '-2.5',
              tradedQuoteVolume: '50',
              effectiveSpreadBps: '-400',
              fillCount: 1,
              otherFees: [],
              inventoryBaseQty: '2',
              inventoryCostQuote: '180',
              inventoryAverageCostQuote: '90',
            },
          },
          'order-control': {
            series: [{ t: ts(2), realized: '999', fees: '0', net: '999' }],
            summary: {
              realizedPnlQuote: '999',
              feesQuote: '0',
              netPnlQuote: '999',
              tradedQuoteVolume: '999',
              effectiveSpreadBps: '999',
              fillCount: 1,
              otherFees: [],
              inventoryBaseQty: '0',
              inventoryCostQuote: '0',
              inventoryAverageCostQuote: null,
            },
          },
        };

        return performances[orderId];
      }),
    };
    const orderBookTracker = {
      getOrderBook: jest.fn((exchange: string, pair: string) =>
        exchange === 'binance' && pair === 'BTC/USDT'
          ? { bids: [[109, 1]], asks: [[111, 1]], sequence: 10 }
          : { bids: [[200, 1]], asks: [[202, 1]], sequence: 11 },
      ),
      getLastUpdateAt: jest.fn(() => Date.parse(ts(8))),
      isStale: jest.fn(() => false),
      queueSnapshot: jest.fn(),
      stop: jest.fn(),
    };
    const service = new AdminAnalyticsService(
      createRepository([]).repository as any,
      createRepository([]).repository as any,
      createRepository([
        {
          orderId: 'order-1',
          exchangeName: 'binance',
          pair: 'BTC/USDT',
          source: 'admin_direct',
          state: 'active',
          createdAt: ts(0),
        },
        {
          orderId: 'order-2',
          exchangeName: 'binance',
          pair: 'BTC/USDT',
          source: 'admin_direct',
          state: 'active',
          createdAt: ts(0),
        },
      ]).repository as any,
      trackedOrders.repository as any,
      intents.repository as any,
      createRepository([]).repository as any,
      orderBookTracker as any,
      performanceService as any,
    );

    const result = await service.getFoundation({
      scope: 'pair',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(performanceService.getOrderPerformance).toHaveBeenCalledTimes(2);
    expect(performanceService.getOrderPerformance).toHaveBeenCalledWith(
      'order-1',
    );
    expect(performanceService.getOrderPerformance).toHaveBeenCalledWith(
      'order-2',
    );
    expect(performanceService.getOrderPerformance).not.toHaveBeenCalledWith(
      'order-control',
    );
    expect(result.analytics.aggregate).toMatchObject({
      scope: {
        type: 'pair',
        exchange: 'binance',
        pair: 'BTC/USDT',
      },
      eligibleOrderIds: ['order-1', 'order-2'],
      pnl: {
        realized: { status: 'available', value: '8', currency: 'USDT' },
        unrealized: { status: 'available', value: '50', currency: 'USDT' },
        realizedNet: { status: 'available', value: '6.5', currency: 'USDT' },
        net: { status: 'available', value: '56.5', currency: 'USDT' },
      },
      fees: {
        total: { status: 'available', value: '1.5', currency: 'USDT' },
      },
      inventoryExposure: {
        notional: { status: 'available', value: '330', currency: 'USDT' },
        quantityByAsset: [{ asset: 'BTC', quantity: '3' }],
      },
      spreadCapture: {
        quote: { status: 'available', value: '8', currency: 'USDT' },
        tradedQuoteVolume: {
          status: 'available',
          value: '150',
          currency: 'USDT',
        },
        fillCount: 3,
        effectiveSpreadBps: '533.3333333333333333',
      },
      fillRate: {
        status: 'available',
        value: '1',
        filledQuotes: 2,
        totalQuotes: 2,
      },
      quoteUptime: {
        status: 'available',
        value: '0.5',
      },
      drawdown: {
        status: 'available',
        maxDrawdownQuote: '3.5',
        peakAt: ts(2),
        troughAt: ts(3),
      },
    });
    expect(result.analytics.aggregate.pnlSeries).toEqual([
      { t: ts(1), realized: '6.5', fees: '1.5', net: '5' },
      { t: ts(2), realized: '11.5', fees: '1.5', net: '10' },
      { t: ts(3), realized: '8', fees: '1.5', net: '6.5' },
    ]);
  });

  it('aggregates admin-wide analytics across eligible admin-visible orders only', async () => {
    const trackedOrders = createRepository([
      {
        trackingKey: 'track-btc',
        orderId: 'order-btc',
        strategyKey: 'strategy-btc',
        exchange: 'binance',
        pair: 'BTC/USDT',
        exchangeOrderId: 'exchange-btc',
        clientOrderId: 'client-btc',
        side: 'buy',
        price: '100',
        qty: '1',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(1),
        updatedAt: ts(3),
      },
      {
        trackingKey: 'track-eth',
        orderId: 'order-eth',
        strategyKey: 'strategy-eth',
        exchange: 'kraken',
        pair: 'ETH/USDT',
        exchangeOrderId: 'exchange-eth',
        clientOrderId: 'client-eth',
        side: 'buy',
        price: '50',
        qty: '1',
        cumulativeFilledQty: '0',
        status: 'open',
        createdAt: ts(5),
        updatedAt: ts(9),
      },
    ]);
    const performanceService = {
      getOrderPerformance: jest.fn(async (orderId: string) => {
        const performances = {
          'order-btc': {
            series: [{ t: ts(2), realized: '5', fees: '1', net: '4' }],
            summary: {
              realizedPnlQuote: '5',
              feesQuote: '1',
              netPnlQuote: '4',
              tradedQuoteVolume: '100',
              effectiveSpreadBps: '500',
              fillCount: 1,
              otherFees: [],
              inventoryBaseQty: '1',
              inventoryCostQuote: '100',
              inventoryAverageCostQuote: '100',
            },
          },
          'order-eth': {
            series: [{ t: ts(6), realized: '3', fees: '0.25', net: '2.75' }],
            summary: {
              realizedPnlQuote: '3',
              feesQuote: '0.25',
              netPnlQuote: '2.75',
              tradedQuoteVolume: '50',
              effectiveSpreadBps: '600',
              fillCount: 1,
              otherFees: [],
              inventoryBaseQty: '0',
              inventoryCostQuote: '0',
              inventoryAverageCostQuote: null,
            },
          },
          'ledger-only-control': {
            series: [{ t: ts(7), realized: '1000', fees: '0', net: '1000' }],
            summary: {
              realizedPnlQuote: '1000',
              feesQuote: '0',
              netPnlQuote: '1000',
              tradedQuoteVolume: '1000',
              effectiveSpreadBps: '10000',
              fillCount: 1,
              otherFees: [],
              inventoryBaseQty: '0',
              inventoryCostQuote: '0',
              inventoryAverageCostQuote: null,
            },
          },
        };

        return performances[orderId];
      }),
    };
    const orderBookTracker = {
      getOrderBook: jest.fn((exchange: string, pair: string) =>
        exchange === 'binance' && pair === 'BTC/USDT'
          ? { bids: [[109, 1]], asks: [[111, 1]], sequence: 10 }
          : { bids: [[49, 1]], asks: [[51, 1]], sequence: 11 },
      ),
      getLastUpdateAt: jest.fn(() => Date.parse(ts(9))),
      isStale: jest.fn(() => false),
      queueSnapshot: jest.fn(),
      stop: jest.fn(),
    };
    const service = new AdminAnalyticsService(
      createRepository([
        {
          entryId: 'ledger-only',
          orderId: 'ledger-only-control',
          assetId: 'USDT',
          amount: '1000',
          type: 'fill_settle',
          createdAt: ts(7),
        },
      ]).repository as any,
      createRepository([]).repository as any,
      createRepository([
        {
          orderId: 'order-btc',
          exchangeName: 'binance',
          pair: 'BTC/USDT',
          source: 'admin_direct',
          state: 'active',
          createdAt: ts(0),
        },
        {
          orderId: 'order-eth',
          exchangeName: 'kraken',
          pair: 'ETH/USDT',
          source: 'payment_flow',
          state: 'active',
          createdAt: ts(0),
        },
      ]).repository as any,
      trackedOrders.repository as any,
      createRepository([]).repository as any,
      createRepository([]).repository as any,
      orderBookTracker as any,
      performanceService as any,
    );

    const result = await service.getFoundation({
      scope: 'admin',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.analytics.aggregate.eligibleOrderIds).toEqual([
      'order-btc',
      'order-eth',
    ]);
    expect(performanceService.getOrderPerformance).toHaveBeenCalledTimes(2);
    expect(performanceService.getOrderPerformance).not.toHaveBeenCalledWith(
      'ledger-only-control',
    );
    expect(result.analytics.aggregate.pnl).toMatchObject({
      realized: { status: 'available', value: '8', currency: 'USDT' },
      unrealized: { status: 'available', value: '10', currency: 'USDT' },
      realizedNet: { status: 'available', value: '6.75', currency: 'USDT' },
      net: { status: 'available', value: '16.75', currency: 'USDT' },
    });
    expect(result.analytics.aggregate.directMarketMakingTotals).toMatchObject({
      realizedPnl: { status: 'available', value: '5', currency: 'USDT' },
      unrealizedPnl: { status: 'available', value: '10', currency: 'USDT' },
      netPnl: { status: 'available', value: '14', currency: 'USDT' },
      feeCost: { status: 'available', value: '1', currency: 'USDT' },
      spreadCapture: { status: 'available', value: '5', currency: 'USDT' },
      fillRate: { status: 'available', value: '1' },
      quoteUptime: { status: 'available', value: '0.2' },
    });
  });

  it('scopes pair ledger, balances, and aggregate eligibility from MarketMakingOrder rows when tracked orders are absent', async () => {
    const ledger = createRepository([
      {
        entryId: 'entry-valid',
        orderId: 'order-valid',
        assetId: 'USDT',
        amount: '12.5',
        type: 'fill_settle',
        createdAt: ts(4),
      },
    ]);
    const balances = createRepository([
      {
        orderId: 'order-valid',
        assetId: 'BTC',
        available: '0.25',
        locked: '0',
        total: '0.25',
        initialDeposit: '0',
        realizedDelta: '0',
        feePaid: '0',
        updatedAt: ts(5),
      },
    ]);
    const marketMakingOrders = createRepository([
      {
        orderId: 'order-valid',
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        source: 'admin_direct',
        state: 'active',
        createdAt: ts(0),
      },
    ]);
    const performanceService = {
      getOrderPerformance: jest.fn(async () => ({
        series: [{ t: ts(5), realized: '12.5', fees: '0.5', net: '12' }],
        summary: {
          realizedPnlQuote: '12.5',
          feesQuote: '0.5',
          netPnlQuote: '12',
          tradedQuoteVolume: '250',
          effectiveSpreadBps: '500',
          fillCount: 1,
          otherFees: [],
          inventoryBaseQty: '0.25',
          inventoryCostQuote: '25',
          inventoryAverageCostQuote: '100',
        },
      })),
    };
    const orderBookTracker = {
      getOrderBook: jest.fn(() => ({
        bids: [[109, 1]],
        asks: [[111, 1]],
        sequence: 12,
      })),
      getLastUpdateAt: jest.fn(() => Date.parse(ts(8))),
      isStale: jest.fn(() => false),
      queueSnapshot: jest.fn(),
      stop: jest.fn(),
    };
    const service = new AdminAnalyticsService(
      ledger.repository as any,
      balances.repository as any,
      marketMakingOrders.repository as any,
      createRepository([]).repository as any,
      createRepository([]).repository as any,
      createRepository([]).repository as any,
      orderBookTracker as any,
      performanceService as any,
    );

    const result = await service.getFoundation({
      scope: 'pair',
      exchange: 'binance',
      pair: 'BTC/USDT',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.sources.trackedOrders).toEqual([]);
    expect(result.sources.ledgerEntries).toEqual([
      expect.objectContaining({ orderId: 'order-valid', amount: '12.5' }),
    ]);
    expect(result.sources.orderBalances).toEqual([
      expect.objectContaining({ orderId: 'order-valid', total: '0.25' }),
    ]);
    expect(result.analytics.aggregate.eligibleOrderIds).toEqual([
      'order-valid',
    ]);
    expect(performanceService.getOrderPerformance).toHaveBeenCalledWith(
      'order-valid',
    );
    expect(ledger.builders[0].clauses).toContainEqual(
      expect.objectContaining({ params: { orderIds: ['order-valid'] } }),
    );
    expect(balances.builders[0].clauses).toContainEqual(
      expect.objectContaining({ params: { orderIds: ['order-valid'] } }),
    );
    expect(orderBookTracker.getOrderBook).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
    );
  });

  it('restricts aggregate Direct MM dashboard totals to non-deleted admin_direct orders', async () => {
    const marketMakingOrders = createRepository([
      {
        orderId: 'direct-active',
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        source: 'admin_direct',
        state: 'active',
        createdAt: ts(0),
      },
      {
        orderId: 'direct-deleted',
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        source: 'admin_direct',
        state: 'deleted',
        createdAt: ts(0),
      },
      {
        orderId: 'payment-active',
        exchangeName: 'binance',
        pair: 'BTC/USDT',
        source: 'payment_flow',
        state: 'active',
        createdAt: ts(0),
      },
    ]);
    const trackedOrders = createRepository([
      {
        trackingKey: 'track-direct',
        orderId: 'direct-active',
        strategyKey: 'strategy-direct',
        exchange: 'binance',
        pair: 'BTC/USDT',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(1),
        updatedAt: ts(2),
      },
      {
        trackingKey: 'track-deleted',
        orderId: 'direct-deleted',
        strategyKey: 'strategy-deleted',
        exchange: 'binance',
        pair: 'BTC/USDT',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(1),
        updatedAt: ts(2),
      },
      {
        trackingKey: 'track-payment',
        orderId: 'payment-active',
        strategyKey: 'strategy-payment',
        exchange: 'binance',
        pair: 'BTC/USDT',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(1),
        updatedAt: ts(2),
      },
    ]);
    const intents = createRepository([
      {
        intentId: 'intent-direct',
        strategyKey: 'strategy-direct',
        type: 'CREATE_LIMIT_ORDER',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
        status: 'DONE',
        metadata: { orderId: 'direct-active' },
        createdAt: ts(1),
        updatedAt: ts(2),
      },
      {
        intentId: 'intent-payment',
        strategyKey: 'strategy-payment',
        type: 'CREATE_LIMIT_ORDER',
        exchange: 'binance',
        pair: 'BTC/USDT',
        side: 'buy',
        price: '100',
        qty: '1',
        status: 'DONE',
        metadata: { orderId: 'payment-active' },
        createdAt: ts(1),
        updatedAt: ts(2),
      },
    ]);
    const performanceService = {
      getOrderPerformance: jest.fn(async (orderId: string) => {
        const summaries = {
          'direct-active': {
            realizedPnlQuote: '10',
            feesQuote: '1',
            netPnlQuote: '9',
            tradedQuoteVolume: '100',
            inventoryBaseQty: '0',
            inventoryCostQuote: '0',
            inventoryAverageCostQuote: null,
          },
          'payment-active': {
            realizedPnlQuote: '100',
            feesQuote: '10',
            netPnlQuote: '90',
            tradedQuoteVolume: '1000',
            inventoryBaseQty: '0',
            inventoryCostQuote: '0',
            inventoryAverageCostQuote: null,
          },
        };

        if (!(orderId in summaries)) {
          throw new Error(`Unexpected performance lookup for ${orderId}`);
        }

        return {
          series: [
            {
              t: ts(2),
              realized: summaries[orderId].realizedPnlQuote,
              fees: summaries[orderId].feesQuote,
              net: summaries[orderId].netPnlQuote,
            },
          ],
          summary: {
            ...summaries[orderId],
            effectiveSpreadBps: '1000',
            fillCount: 1,
            otherFees: [],
          },
        };
      }),
    };
    const orderBookTracker = {
      getOrderBook: jest.fn(() => ({
        bids: [[100, 1]],
        asks: [[102, 1]],
        sequence: 9,
      })),
      getLastUpdateAt: jest.fn(() => Date.parse(ts(8))),
      isStale: jest.fn(() => false),
      queueSnapshot: jest.fn(),
      stop: jest.fn(),
    };
    const service = new AdminAnalyticsService(
      createRepository([]).repository as any,
      createRepository([]).repository as any,
      marketMakingOrders.repository as any,
      trackedOrders.repository as any,
      intents.repository as any,
      createRepository([]).repository as any,
      orderBookTracker as any,
      performanceService as any,
    );

    const result = await service.getDirectMarketMakingDashboard({
      scope: 'admin',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.dashboard.orderIds).toEqual(['direct-active']);
    expect(result.dashboard.costRevenue).toMatchObject({
      realizedPnl: { status: 'available', value: '10', currency: 'USDT' },
      feeCost: { status: 'available', value: '1', currency: 'USDT' },
      spreadCapture: { status: 'available', value: '10', currency: 'USDT' },
      fillRate: {
        status: 'available',
        value: '1',
        filledQuotes: 1,
        totalQuotes: 1,
        denominator: {
          source: 'tracked_orders',
          filledSource: 'tracked_orders',
          eligibleTrackedOrders: 1,
          eligibleStrategyOrderIntents: 1,
        },
      },
    });
    expect(performanceService.getOrderPerformance).not.toHaveBeenCalledWith(
      'direct-deleted',
    );
  });

  it('marks admin-wide monetary totals unavailable across incompatible quote currencies and exposes per-currency breakdowns', async () => {
    const trackedOrders = createRepository([
      {
        trackingKey: 'track-usdt',
        orderId: 'order-usdt',
        strategyKey: 'strategy-usdt',
        exchange: 'binance',
        pair: 'BTC/USDT',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(1),
        updatedAt: ts(2),
      },
      {
        trackingKey: 'track-usd',
        orderId: 'order-usd',
        strategyKey: 'strategy-usd',
        exchange: 'kraken',
        pair: 'ETH/USD',
        cumulativeFilledQty: '1',
        status: 'filled',
        createdAt: ts(1),
        updatedAt: ts(2),
      },
    ]);
    const performanceService = {
      getOrderPerformance: jest.fn(async (orderId: string) => {
        const performances = {
          'order-usdt': {
            series: [{ t: ts(2), realized: '5', fees: '1', net: '4' }],
            summary: {
              realizedPnlQuote: '5',
              feesQuote: '1',
              netPnlQuote: '4',
              tradedQuoteVolume: '100',
              effectiveSpreadBps: '500',
              fillCount: 1,
              otherFees: [],
              inventoryBaseQty: '1',
              inventoryCostQuote: '100',
              inventoryAverageCostQuote: '100',
            },
          },
          'order-usd': {
            series: [{ t: ts(3), realized: '3', fees: '0.5', net: '2.5' }],
            summary: {
              realizedPnlQuote: '3',
              feesQuote: '0.5',
              netPnlQuote: '2.5',
              tradedQuoteVolume: '50',
              effectiveSpreadBps: '600',
              fillCount: 1,
              otherFees: [],
              inventoryBaseQty: '1',
              inventoryCostQuote: '50',
              inventoryAverageCostQuote: '50',
            },
          },
        };

        return performances[orderId];
      }),
    };
    const orderBookTracker = {
      getOrderBook: jest.fn((exchange: string, pair: string) =>
        exchange === 'binance' && pair === 'BTC/USDT'
          ? { bids: [[109, 1]], asks: [[111, 1]], sequence: 10 }
          : { bids: [[59, 1]], asks: [[61, 1]], sequence: 11 },
      ),
      getLastUpdateAt: jest.fn(() => Date.parse(ts(8))),
      isStale: jest.fn(() => false),
      queueSnapshot: jest.fn(),
      stop: jest.fn(),
    };
    const service = new AdminAnalyticsService(
      createRepository([]).repository as any,
      createRepository([]).repository as any,
      createRepository([
        {
          orderId: 'order-usdt',
          exchangeName: 'binance',
          pair: 'BTC/USDT',
          source: 'admin_direct',
          state: 'active',
          createdAt: ts(0),
        },
        {
          orderId: 'order-usd',
          exchangeName: 'kraken',
          pair: 'ETH/USD',
          source: 'admin_direct',
          state: 'active',
          createdAt: ts(0),
        },
      ]).repository as any,
      trackedOrders.repository as any,
      createRepository([]).repository as any,
      createRepository([]).repository as any,
      orderBookTracker as any,
      performanceService as any,
    );

    const result = await service.getFoundation({
      scope: 'admin',
      startAt: ts(0),
      endAt: ts(10),
    });

    expect(result.analytics.aggregate.pnl).toMatchObject({
      realized: {
        status: 'unavailable',
        value: null,
        currency: null,
        unavailableReason: 'cross-currency-aggregate-unavailable',
      },
      unrealized: {
        status: 'unavailable',
        value: null,
        currency: null,
        unavailableReason: 'cross-currency-aggregate-unavailable',
      },
      net: {
        status: 'unavailable',
        value: null,
        currency: null,
        unavailableReason: 'cross-currency-aggregate-unavailable',
      },
    });
    expect(result.analytics.aggregate.pnlSeries).toEqual([]);
    expect(result.analytics.aggregate.quoteCurrencyBreakdown).toEqual([
      expect.objectContaining({
        quoteCurrency: 'USD',
        orderIds: ['order-usd'],
        realizedPnl: {
          status: 'available',
          value: '3',
          currency: 'USD',
          unavailableReason: null,
        },
        unrealizedPnl: {
          status: 'available',
          value: '10',
          currency: 'USD',
          unavailableReason: null,
        },
        netPnl: {
          status: 'available',
          value: '12.5',
          currency: 'USD',
          unavailableReason: null,
        },
        feeCost: {
          status: 'available',
          value: '0.5',
          currency: 'USD',
          unavailableReason: null,
        },
      }),
      expect.objectContaining({
        quoteCurrency: 'USDT',
        orderIds: ['order-usdt'],
        realizedPnl: {
          status: 'available',
          value: '5',
          currency: 'USDT',
          unavailableReason: null,
        },
        unrealizedPnl: {
          status: 'available',
          value: '10',
          currency: 'USDT',
          unavailableReason: null,
        },
        netPnl: {
          status: 'available',
          value: '14',
          currency: 'USDT',
          unavailableReason: null,
        },
        feeCost: {
          status: 'available',
          value: '1',
          currency: 'USDT',
          unavailableReason: null,
        },
      }),
    ]);
    expect(result.analytics.aggregate.directMarketMakingTotals).toMatchObject({
      realizedPnl: {
        status: 'unavailable',
        value: null,
        unavailableReason: 'cross-currency-aggregate-unavailable',
      },
      feeCost: {
        status: 'unavailable',
        value: null,
        unavailableReason: 'cross-currency-aggregate-unavailable',
      },
    });
    expect(
      result.analytics.aggregate.directMarketMakingTotals
        .quoteCurrencyBreakdown,
    ).toHaveLength(2);
  });
});
