import { BadRequestException } from '@nestjs/common';

import { AdminPositionsService } from './admin-positions.service';

const ts = (minute: number) =>
  `2026-05-23T00:${String(minute).padStart(2, '0')}:00.000Z`;

function createQueryBuilder(
  rows: Array<Record<string, any>>,
  total = rows.length,
) {
  const builder = {
    clauses: [] as Array<{ sql: string; params?: Record<string, unknown> }>,
    orderBys: [] as Array<{ field: string; direction: 'ASC' | 'DESC' }>,
    takeValue: undefined as number | undefined,
    skipValue: undefined as number | undefined,
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>) => {
      builder.clauses.push({ sql, params });

      return builder;
    }),
    orderBy: jest.fn((field: string, direction: 'ASC' | 'DESC') => {
      builder.orderBys.push({ field, direction });

      return builder;
    }),
    addOrderBy: jest.fn((field: string, direction: 'ASC' | 'DESC') => {
      builder.orderBys.push({ field, direction });

      return builder;
    }),
    take: jest.fn((value: number) => {
      builder.takeValue = value;

      return builder;
    }),
    skip: jest.fn((value: number) => {
      builder.skipValue = value;

      return builder;
    }),
    getMany: jest.fn(async () => rows),
    getManyAndCount: jest.fn(async () => [rows, total]),
  };

  return builder;
}

describe('AdminPositionsService', () => {
  function buildService(
    rows: Array<Record<string, any>> = [
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'btc',
        available: '0.25',
        locked: '0.75',
        total: '1',
        initialDeposit: '1.5',
        realizedDelta: '-0.5',
        feePaid: '0.01',
        updatedAt: ts(4),
      },
    ],
    total = rows.length,
  ) {
    const queryBuilder = createQueryBuilder(rows, total);
    const summaryQueryBuilder = createQueryBuilder(rows, total);
    const balances = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(queryBuilder)
        .mockReturnValue(summaryQueryBuilder),
    };
    const marketPairs = {
      find: jest.fn(async () => []),
    };
    const trackedOrders = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => [
          {
            orderId: 'order-1',
            strategyKey: 'strategy-btc',
            exchange: 'binance',
            accountLabel: 'maker',
            pair: 'BTC/USDT',
            status: 'open',
            updatedAt: ts(5),
          },
        ]),
      })),
      find: jest.fn(async () => [
        {
          orderId: 'order-1',
          strategyKey: 'strategy-btc',
          exchange: 'binance',
          accountLabel: 'maker',
          pair: 'BTC/USDT',
          status: 'open',
          updatedAt: ts(5),
        },
      ]),
    };
    const strategies = {
      find: jest.fn(async () => [
        {
          strategyKey: 'strategy-btc',
          strategyType: 'pmm',
          marketMakingOrderId: 'order-1',
          status: 'running',
          updatedAt: ts(6),
        },
      ]),
    };
    const marketMakingOrders = {
      find: jest.fn(async () =>
        rows.map((row) => ({
          orderId: row.orderId,
          state: 'running',
        })),
      ),
    };

    return {
      service: new AdminPositionsService(
        balances as any,
        marketPairs as any,
        trackedOrders as any,
        strategies as any,
        marketMakingOrders as any,
      ),
      balances,
      marketPairs,
      trackedOrders,
      strategies,
      marketMakingOrders,
      queryBuilder,
      summaryQueryBuilder,
    };
  }

  it('returns bounded order-scoped balances with unavailable PnL metrics', async () => {
    const { service, queryBuilder, trackedOrders } = buildService(
      undefined,
      36,
    );

    const result = await service.listPositions({});

    expect(queryBuilder.take).toHaveBeenCalledWith(25);
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(result.summary).toMatchObject({
      scannedRows: 1,
      totalRows: 36,
      truncated: true,
      byAsset: [
        {
          asset: 'btc',
          available: '0.25',
          locked: '0.75',
          total: '1',
        },
      ],
    });
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'order-1:btc',
      orderId: 'order-1',
      asset: 'btc',
      assetId: 'btc',
      exchange: 'binance',
      accountLabel: 'maker',
      pair: 'BTC/USDT',
      strategyKey: 'strategy-btc',
      strategyType: 'pmm',
      strategyStatus: 'running',
      available: '0.25',
      locked: '0.75',
      total: '1',
      initialDeposit: '1.5',
      realizedDelta: '-0.5',
      feePaid: '0.01',
      avgCost: null,
      realizedPnl: null,
      unrealizedPnl: null,
      markPrice: null,
      portfolioPercent: null,
      pnl: {
        averageCost: null,
        realized: null,
        unrealized: null,
        markPrice: null,
        portfolioPercent: null,
      },
      dataSources: ['ledger_order_balance'],
    });
    expect(result.items[0].pnl.unavailableReason).toContain('unavailable');
    expect(result.pagination).toMatchObject({
      page: 1,
      limit: 25,
      total: 36,
      totalPages: 2,
      hasNext: true,
      hasPrevious: false,
    });
    expect(JSON.stringify(result)).not.toContain('user-1');
    expect(trackedOrders.find).toHaveBeenCalledTimes(2);
  });

  it('applies asset, exchange, query, limit, and page filters safely', async () => {
    const { service, queryBuilder } = buildService();

    await service.listPositions({
      asset: 'BTC',
      exchange: 'binance',
      query: 'order_%',
      limit: '50',
      page: '2',
    });

    expect(queryBuilder.take).toHaveBeenCalledWith(50);
    expect(queryBuilder.skip).toHaveBeenCalledWith(50);
    expect(queryBuilder.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { asset: 'btc' } }),
        expect.objectContaining({ params: { orderIds: ['order-1'] } }),
        expect.objectContaining({ params: { query: '%order\\_\\%%' } }),
      ]),
    );
  });

  it('clamps excessive limits to the maximum bound', async () => {
    const { service, queryBuilder } = buildService();

    const result = await service.listPositions({ limit: '10000' });

    expect(queryBuilder.take).toHaveBeenCalledWith(100);
    expect(result.pagination.limit).toBe(100);
    expect(result.limits.maxLimit).toBe(100);
  });

  it('builds cross-surface summary totals from the bounded full matched scan', async () => {
    const rows = [
      {
        orderId: 'order-1',
        assetId: 'btc',
        available: '1',
        locked: '2',
        total: '3',
        updatedAt: ts(4),
      },
      {
        orderId: 'order-2',
        assetId: 'btc',
        available: '4',
        locked: '5',
        total: '9',
        updatedAt: ts(5),
      },
    ];
    const { service, queryBuilder, summaryQueryBuilder } = buildService(
      rows,
      2,
    );

    const result = await service.listPositions({ limit: '1' });

    expect(queryBuilder.take).toHaveBeenCalledWith(1);
    expect(summaryQueryBuilder.take).toHaveBeenCalledWith(500);
    expect(result.items).toHaveLength(2);
    expect(result.summary.byAsset).toEqual([
      {
        asset: 'btc',
        available: '5',
        locked: '7',
        total: '12',
      },
    ]);
  });

  it('displays asset symbols and merges summary rows for mapped asset ids', async () => {
    const rows = [
      {
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        available: '5',
        locked: '0',
        total: '5',
        updatedAt: ts(1),
      },
      {
        orderId: 'order-2',
        userId: 'user-1',
        assetId: 'asset-usdt',
        available: '10',
        locked: '1',
        total: '11',
        updatedAt: ts(2),
      },
      {
        orderId: 'order-3',
        userId: 'user-1',
        assetId: 'asset-eth',
        available: '0.25',
        locked: '0',
        total: '0.25',
        updatedAt: ts(3),
      },
    ];
    const { service, marketPairs } = buildService(rows, rows.length);

    marketPairs.find.mockResolvedValueOnce([
      {
        base_asset_id: 'asset-eth',
        base_symbol: 'ETH',
        quote_asset_id: 'asset-usdt',
        quote_symbol: 'USDT',
      },
    ]);

    const result = await service.listPositions({});

    expect(
      result.items.find((item) => item.assetId === 'asset-usdt')?.asset,
    ).toBe('USDT');
    expect(
      result.items.find((item) => item.assetId === 'asset-eth')?.asset,
    ).toBe('ETH');
    expect(result.summary.byAsset).toEqual([
      {
        asset: 'USDT',
        available: '15',
        locked: '1',
        total: '16',
      },
      {
        asset: 'ETH',
        available: '0.25',
        locked: '0',
        total: '0.25',
      },
    ]);
  });

  it('summarizes only active or risk-relevant inventory balances', async () => {
    const rows = [
      {
        orderId: 'active-order',
        userId: 'user-1',
        assetId: 'USDT',
        available: '7',
        locked: '3',
        total: '10',
        updatedAt: ts(1),
      },
      {
        orderId: 'open-tracked-orphan',
        userId: 'user-1',
        assetId: 'USDT',
        available: '4',
        locked: '1',
        total: '5',
        updatedAt: ts(2),
      },
      {
        orderId: 'created-order',
        userId: 'user-1',
        assetId: 'USDT',
        available: '100',
        locked: '0',
        total: '100',
        updatedAt: ts(3),
      },
      {
        orderId: 'paused-order',
        userId: 'user-1',
        assetId: 'USDT',
        available: '12',
        locked: '1',
        total: '13',
        updatedAt: ts(4),
      },
      {
        orderId: 'terminal-tracked',
        userId: 'user-1',
        assetId: 'USDT',
        available: '30',
        locked: '20',
        total: '50',
        updatedAt: ts(5),
      },
      {
        orderId: 'unmapped-orphan',
        userId: 'user-1',
        assetId: 'USDT',
        available: '40',
        locked: '0',
        total: '40',
        updatedAt: ts(6),
      },
    ];
    const { service, marketMakingOrders, trackedOrders } = buildService(
      rows,
      rows.length,
    );

    marketMakingOrders.find.mockResolvedValueOnce([
      { orderId: 'active-order', state: 'running' },
      { orderId: 'created-order', state: 'created' },
      { orderId: 'paused-order', state: 'paused' },
    ]);
    trackedOrders.find.mockImplementation(async (options?: any) => {
      if (options?.select?.includes('status')) {
        return [
          {
            orderId: 'open-tracked-orphan',
            strategyKey: 'strategy-open',
            exchange: 'mexc',
            accountLabel: 'maker',
            pair: 'XIN/USDT',
            status: 'open',
            updatedAt: ts(7),
          },
          {
            orderId: 'terminal-tracked',
            strategyKey: 'strategy-terminal',
            exchange: 'mexc',
            accountLabel: 'maker',
            pair: 'XIN/USDT',
            status: 'filled',
            updatedAt: ts(8),
          },
        ];
      }

      return [];
    });

    const result = await service.listPositions({});

    expect(result.summary).toMatchObject({
      scannedRows: 2,
      totalRows: rows.length,
      byAsset: [
        {
          asset: 'USDT',
          available: '11',
          locked: '4',
          total: '15',
        },
      ],
    });
  });

  it.each([
    ['limit', { limit: 'zero' }],
    ['page', { page: '0' }],
    ['query', { query: 'x'.repeat(101) }],
    ['asset', { asset: 'x'.repeat(65) }],
    ['exchange', { exchange: '../binance' }],
  ])(
    'rejects invalid %s filters without querying balances',
    async (_label, query) => {
      const { service, queryBuilder } = buildService();

      await expect(service.listPositions(query)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
    },
  );

  it('returns an empty bounded page when an exchange has no tracked orders', async () => {
    const { service, queryBuilder, trackedOrders } = buildService();

    trackedOrders.createQueryBuilder.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    });

    const result = await service.listPositions({ exchange: 'kraken' });

    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(queryBuilder.getManyAndCount).not.toHaveBeenCalled();
  });
});
