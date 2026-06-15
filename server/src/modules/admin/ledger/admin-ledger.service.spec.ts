import { BadRequestException } from '@nestjs/common';

import { AdminLedgerService } from './admin-ledger.service';

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

const defaultBalanceRow = {
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
};

function buildService(
  rows: Array<Record<string, any>> = [defaultBalanceRow],
  total = rows.length,
) {
  const balanceQueryBuilder = createQueryBuilder(rows, total);
  const summaryQueryBuilder = createQueryBuilder(rows, total);
  const ledgerEntries = {
    count: jest.fn(async () => 0),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    createQueryBuilder: jest.fn(() => createQueryBuilder([], 0)),
  };
  const balances = {
    count: jest.fn(async () => rows.length),
    find: jest.fn(async () => rows),
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(balanceQueryBuilder)
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
    service: new AdminLedgerService(
      ledgerEntries as any,
      balances as any,
      marketPairs as any,
      trackedOrders as any,
      strategies as any,
      marketMakingOrders as any,
    ),
    ledgerEntries,
    balances,
    marketPairs,
    trackedOrders,
    strategies,
    marketMakingOrders,
    balanceQueryBuilder,
    summaryQueryBuilder,
  };
}

describe('AdminLedgerService.listBalances', () => {
  it('returns bounded order-scoped balances with invariant flags', async () => {
    const { service, balanceQueryBuilder, trackedOrders } = buildService(
      undefined,
      36,
    );

    const result = await service.listBalances({});

    expect(balanceQueryBuilder.take).toHaveBeenCalledWith(25);
    expect(balanceQueryBuilder.skip).toHaveBeenCalledWith(0);
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
      balanced: true,
      dataSources: ['ledger_order_balance'],
    });
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
    const { service, balanceQueryBuilder } = buildService();

    await service.listBalances({
      asset: 'BTC',
      exchange: 'binance',
      query: 'order_%',
      limit: '50',
      page: '2',
    });

    expect(balanceQueryBuilder.take).toHaveBeenCalledWith(50);
    expect(balanceQueryBuilder.skip).toHaveBeenCalledWith(50);
    expect(balanceQueryBuilder.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { asset: 'btc' } }),
        expect.objectContaining({ params: { orderIds: ['order-1'] } }),
        expect.objectContaining({ params: { query: '%order\\_\\%%' } }),
      ]),
    );
  });

  it('clamps excessive limits to the maximum bound', async () => {
    const { service, balanceQueryBuilder } = buildService();

    const result = await service.listBalances({ limit: '10000' });

    expect(balanceQueryBuilder.take).toHaveBeenCalledWith(100);
    expect(result.pagination.limit).toBe(100);
    expect(result.limits.maxLimit).toBe(100);
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
        orderId: 'created-order',
        userId: 'user-1',
        assetId: 'USDT',
        available: '100',
        locked: '0',
        total: '100',
        updatedAt: ts(3),
      },
    ];
    const { service, marketMakingOrders, trackedOrders } = buildService(
      rows,
      rows.length,
    );

    marketMakingOrders.find.mockResolvedValueOnce([
      { orderId: 'active-order', state: 'running' },
      { orderId: 'created-order', state: 'created' },
    ]);
    trackedOrders.find.mockImplementation(async () => []);

    const result = await service.listBalances({});

    expect(result.summary).toMatchObject({
      scannedRows: 1,
      totalRows: rows.length,
      byAsset: [
        {
          asset: 'USDT',
          available: '7',
          locked: '3',
          total: '10',
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
      const { service, balanceQueryBuilder } = buildService();

      await expect(service.listBalances(query)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(balanceQueryBuilder.getManyAndCount).not.toHaveBeenCalled();
    },
  );

  it('returns an empty bounded page when an exchange has no tracked orders', async () => {
    const { service, balanceQueryBuilder, trackedOrders } = buildService();

    trackedOrders.createQueryBuilder.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    } as any);

    const result = await service.listBalances({ exchange: 'kraken' });

    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(balanceQueryBuilder.getManyAndCount).not.toHaveBeenCalled();
  });
});

describe('AdminLedgerService.listEntries', () => {
  it('returns bounded immutable journal entries without leaking userId', async () => {
    const { service, ledgerEntries } = buildService();
    const entryQueryBuilder = createQueryBuilder(
      [
        {
          entryId: 'entry-1',
          type: 'reserve_lock',
          orderId: 'order-1',
          userOrderId: 'user-order-1',
          accountLabel: 'maker',
          userId: 'user-1',
          assetId: 'btc',
          amount: '0.5',
          refType: 'market_making_reservation',
          refId: 'ref-1',
          reversalOf: null,
          createdAt: ts(2),
        },
      ],
      7,
    );
    ledgerEntries.createQueryBuilder.mockReturnValue(entryQueryBuilder);

    const result = await service.listEntries({ type: 'reserve_lock' });

    expect(entryQueryBuilder.take).toHaveBeenCalledWith(25);
    expect(entryQueryBuilder.clauses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: { type: 'reserve_lock' } }),
      ]),
    );
    expect(result.items[0]).toEqual({
      entryId: 'entry-1',
      type: 'reserve_lock',
      orderId: 'order-1',
      userOrderId: 'user-order-1',
      accountLabel: 'maker',
      asset: 'btc',
      assetId: 'btc',
      amount: '0.5',
      refType: 'market_making_reservation',
      refId: 'ref-1',
      reversalOf: null,
      createdAt: '2026-05-23T00:02:00.000Z',
    });
    expect(result.pagination).toMatchObject({ total: 7, totalPages: 1 });
    expect(JSON.stringify(result)).not.toContain('user-1"');
  });

  it('rejects unknown ledger entry types', async () => {
    const { service } = buildService();

    await expect(
      service.listEntries({ type: 'not_a_type' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminLedgerService.getSummary', () => {
  it('reports entry counts by type and balance health', async () => {
    const { service, ledgerEntries, balances } = buildService();

    ledgerEntries.count.mockResolvedValueOnce(12);
    ledgerEntries.findOne.mockResolvedValueOnce({ createdAt: ts(9) } as any);
    ledgerEntries.createQueryBuilder.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => [
        { type: 'deposit_credit', count: '3' },
        { type: 'reserve_lock', count: 4 },
      ]),
    } as any);
    balances.count.mockResolvedValueOnce(2);
    balances.find.mockResolvedValueOnce([
      {
        orderId: 'order-1',
        assetId: 'btc',
        available: '0.25',
        locked: '0.75',
        total: '1',
        updatedAt: ts(4),
      },
      {
        orderId: 'order-2',
        assetId: 'btc',
        available: '1',
        locked: '1',
        total: '3',
        updatedAt: ts(5),
      },
    ]);

    const result = await service.getSummary();

    expect(result.entries.total).toBe(12);
    expect(result.entries.lastEntryAt).toBe('2026-05-23T00:09:00.000Z');
    expect(result.entries.byType).toEqual(
      expect.arrayContaining([
        { type: 'deposit_credit', count: 3 },
        { type: 'reserve_lock', count: 4 },
        { type: 'fill_settle', count: 0 },
      ]),
    );
    expect(result.balances).toMatchObject({
      total: 2,
      scannedRows: 2,
      invariantViolations: 1,
      negativeBalances: 0,
      healthy: false,
    });
    expect(result.balances.byAsset).toEqual([
      {
        asset: 'btc',
        available: '1.25',
        locked: '1.75',
        total: '4',
      },
    ]);
  });
});
